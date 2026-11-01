"""SCHOLARDOCX-0218: Advisor Atlas create-run cost ceiling.

create_run pre-flights the user's balance against the run's worst case
(discovery searches + per-candidate screening + deep-research passes, at the
pipeline's caps) and returns `cost_estimate: {"max_candidates", "max_credits"}`
on the created run so the frontend can show the ceiling upfront.

Pricing getters are monkeypatched (see CODE_RULES — never write
app_settings/ai_models rows for a test) with binary-exact fakes:

    token rate 10 credits/USD, Tavily 1.0 USD/search, OpenAlex search 0.5 USD,
    OpenAlex list ratio 0.25, compute_cost -> (input + output) / 100 USD

Per call (USD): vision 40, specialist 180, synthesis 290, unit mapper 25.
    screening candidate = 1x1.0 + 3x40 + 290               = 411.0
    deep candidate      = 8x1.0 + 0.5 + 0.125 + 3x40
                          + 4x180 + 290                    = 1138.625
    professor run       = 1.0 + 1138.625                   = 1139.625
                          -> ceil(1139.625 * 10)           = 11397 credits
    department run      = 22x1.0 + 25 (discovery)
                          + 80x411 + 15x1138.625           = 50006.375
                          -> ceil(50006.375 * 10)          = 500064 credits
"""

from __future__ import annotations

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api import advisor_atlas as advisor_atlas_api
from app.api.advisor_atlas import CreateRunRequest, ResearchProfile
from app.core.config import Settings
from app.services import ai_tokens
from app.services.advisor_atlas import cost_estimate as cost_estimate_module
from app.services.advisor_atlas.cost_estimate import estimate_run_cost


def _install_exact_pricing(monkeypatch):
    monkeypatch.setattr(ai_tokens, "get_tavily_call_cost_usd", lambda session: 1.0)
    monkeypatch.setattr(ai_tokens, "get_openalex_call_cost_usd", lambda session: 0.5)
    monkeypatch.setattr(ai_tokens, "get_token_rate", lambda session: 10)
    monkeypatch.setattr(
        ai_tokens,
        "compute_cost",
        lambda model_id, input_tokens, output_tokens, session, provider=None: (
            (input_tokens + output_tokens) / 100,
            0,
        ),
    )
    monkeypatch.setattr(cost_estimate_module, "METERED_CALL_COST_RATIO", {"list": 0.25})


def professor_request() -> CreateRunRequest:
    return CreateRunRequest(
        mode="professor",
        professor_name="Ada Scholar",
        university_name="Example University",
        university_url="https://example.edu/faculty/ada",
        department="Computer Science",
        degree_target="PhD",
        intake_term="Fall 2027",
        research_profile=ResearchProfile(interests=["Accessible AI"]),
    )


def department_request() -> CreateRunRequest:
    return CreateRunRequest(
        mode="department",
        university_name="Example University",
        department="Computer Science",
        research_profile=ResearchProfile(interests=["Accessible AI"]),
    )


def test_estimate_run_cost_professor_mode(monkeypatch):
    _install_exact_pricing(monkeypatch)
    estimate = estimate_run_cost(object(), Settings(), "professor")
    assert estimate == {"max_candidates": 1, "max_credits": 11397}


def test_estimate_run_cost_department_mode(monkeypatch):
    _install_exact_pricing(monkeypatch)
    estimate = estimate_run_cost(object(), Settings(), "department")
    assert estimate == {"max_candidates": 80, "max_credits": 500064}


@pytest.mark.asyncio
async def test_create_run_response_includes_cost_estimate(monkeypatch):
    created = []
    spend_calls: list[int] = []

    class FakeRepository:
        def count_runs(self, user_id):
            return 0

        def create_run(self, user_id, payload):
            created.append(user_id)
            return {"id": 91, "status": "queued"}

    class FakeService:
        repository = FakeRepository()

        async def run(self, run_id, user_id):
            return None

    class FakeStore:
        db = object()

    _install_exact_pricing(monkeypatch)

    def fake_ensure(user, session, min_tokens=1):
        spend_calls.append(min_tokens)
        return True

    monkeypatch.setattr(ai_tokens, "ensure_can_spend", fake_ensure)
    monkeypatch.setattr(advisor_atlas_api, "_require_advisor_atlas_access", lambda *a, **k: None)
    import app.api.routes as routes_api

    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)

    result = await advisor_atlas_api.create_run(
        professor_request(),
        BackgroundTasks(),
        user={"id": 7, "roles": ["pro_user"]},
        service=FakeService(),  # type: ignore
        store=FakeStore(),  # type: ignore
        settings=Settings(),
    )

    assert result["id"] == 91
    # The pre-flight gated on the worst-case ceiling, not a min-1 check.
    assert spend_calls == [11397]
    assert result["cost_estimate"] == {"max_candidates": 1, "max_credits": 11397}


@pytest.mark.asyncio
async def test_create_run_rejects_when_ceiling_unaffordable(monkeypatch):
    created = []

    class FakeRepository:
        def count_runs(self, user_id):
            return 0

        def create_run(self, user_id, payload):
            created.append(user_id)
            return {"id": 92, "status": "queued"}

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    _install_exact_pricing(monkeypatch)

    def refuse(user, session, min_tokens=1):
        raise ai_tokens.OutOfTokens("out of credits")

    monkeypatch.setattr(ai_tokens, "ensure_can_spend", refuse)
    monkeypatch.setattr(advisor_atlas_api, "_require_advisor_atlas_access", lambda *a, **k: None)

    with pytest.raises(HTTPException) as error:
        await advisor_atlas_api.create_run(
            professor_request(),
            BackgroundTasks(),
            user={"id": 7, "roles": ["pro_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
            settings=Settings(),
        )

    assert error.value.status_code == 402
    assert error.value.detail == (
        "Not enough credits for this search. It researches up to 1 professor in one run."
    )
    assert created == []
