"""SCHOLARDOCX-0218: Research Expert analyze cost ceiling.

analyze_paper() pre-flights the user's balance against a per-paper worst case
(one Jina query embedding + the analysis call priced over the paper's top_k
largest sections), and the papers list/detail payloads expose it as
`analysis_cost_estimate: {"max_credits": <int>}`.

Pricing getters are monkeypatched (see CODE_RULES — never write
app_settings/ai_models rows for a test) with binary-exact fakes so the
expected credit counts are deterministic:

    token rate 10 credits/USD, Jina base fee 1.0 USD,
    compute_cost -> (input + output) tokens / 100 USD

For a paper whose top-10 sections total 900 stored tokens:
    analysis call = (600 + 250 + 25*10 + 900 + 4000) / 100 = 60.0 USD
    embedding     = 1.0 + 250/100 = 3.5 USD
    ceiling       = ceil((3.5 + 60.0) * 10) = 635 credits
For a paper whose top-10 sections total 1000 tokens: ceil(64.5 * 10) = 645.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.connection import get_db
from app.db.models import ResearchPaperChunks, ResearchPapers
from app.services import ai_tokens
from app.services import research_paper_service as rps_module
from app.services.research_paper_service import ResearchPaperService
from tests.helpers import cleanup_user_records, make_settings


@pytest.fixture
def db_session(tmp_path: Path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    yield settings, session
    session.close()


def _install_exact_pricing(monkeypatch):
    monkeypatch.setattr(ai_tokens, "get_token_rate", lambda session: 10)
    monkeypatch.setattr(ai_tokens, "get_jina_call_cost_usd", lambda session: 1.0)
    monkeypatch.setattr(
        ai_tokens,
        "compute_cost",
        lambda model_id, input_tokens, output_tokens, session, provider=None: (
            (input_tokens + output_tokens) / 100,
            (input_tokens + output_tokens) // 10,
        ),
    )



def _make_session_user(session: Session, roles: list) -> dict:
    """Create the test user ON THE SAME ORM SESSION as the papers.

    make_user() commits on its own connection; under pytest-xdist a
    concurrently-initializing worker could... in any case one-connection
    seeding removes the FK-visibility window entirely (SCHOLARDOCX-0222
    test-infra hardening).
    """
    import uuid as _uuid
    from app.db.models import Users

    email = f"cost-estimate-{_uuid.uuid4().hex[:8]}@test.local"
    user = Users(
        email=email,
        password_hash="x",
        display_name="Cost Estimate Test",
        roles=__import__("json").dumps(roles),
        is_active=1,
        is_blocked=0,
    )
    session.add(user)
    session.commit()
    return {"id": user.id, "email": email, "roles": roles}

def _seed_paper(
    session: Session,
    user_id: str,
    paper_id: str,
    chunk_tokens: list[int],
) -> None:
    session.add(
        ResearchPapers(
            id=paper_id,
            user_id=user_id,
            title=f"Ceiling Paper {paper_id}",
            chunk_count=len(chunk_tokens),
            status="ready",
            content_text="Sample paper text.",
        )
    )
    for index, tokens in enumerate(chunk_tokens):
        session.add(
            ResearchPaperChunks(
                id=f"{paper_id}-chunk-{index}",
                paper_id=paper_id,
                chunk_index=index,
                chunk_text="attention " * 20,
                token_count=tokens,
            )
        )
    session.commit()


def test_paper_payloads_include_analysis_cost_estimate(db_session, monkeypatch):
    """Both the papers list and the paper detail expose the per-paper ceiling,
    sized from each paper's own worst-case retrieved context."""
    settings, session = db_session
    _install_exact_pricing(monkeypatch)
    user = _make_session_user(session, roles=["pro_user"])

    try:
        _seed_paper(session, user["id"], "paper-cost-a", [400, 300, 200])
        # 12 chunks of 100 tokens: top-10 sums to 1000, not 1200 — the
        # estimate follows the retrieval cap, not the whole library.
        _seed_paper(session, user["id"], "paper-cost-b", [100] * 12)

        service = ResearchPaperService(settings, session, user)

        papers = service.list_papers()
        by_id = {p["id"]: p for p in papers}
        assert by_id["paper-cost-a"]["analysis_cost_estimate"] == {"max_credits": 635}
        assert by_id["paper-cost-b"]["analysis_cost_estimate"] == {"max_credits": 645}

        details = service.get_paper_details("paper-cost-a")
        assert details["analysis_cost_estimate"] == {"max_credits": 635}
    finally:
        from app.db.connection import connect

        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_analyze_pre_flight_rejects_when_balance_below_ceiling(
    db_session, monkeypatch
):
    """A balance below the per-paper worst case gets a plain 402 before any
    embedding or analysis work runs."""
    settings, session = db_session
    _install_exact_pricing(monkeypatch)
    user = _make_session_user(session, roles=["pro_user"])

    spend_calls: list[int] = []

    def refuse(user, session, min_tokens=1):
        spend_calls.append(min_tokens)
        raise ai_tokens.OutOfTokens("out of credits")

    monkeypatch.setattr(ai_tokens, "ensure_can_spend", refuse)

    async def fail_search(*args, **kwargs):
        raise AssertionError("retrieval must not run when the pre-flight rejects")

    try:
        _seed_paper(session, user["id"], "paper-cost-reject", [400, 300, 200])
        service = ResearchPaperService(settings, session, user)
        monkeypatch.setattr(service, "search_relevant_chunks", fail_search)

        with pytest.raises(HTTPException) as error:
            await service.analyze_paper("paper-cost-reject", "Summarize the methodology")

        assert error.value.status_code == 402
        assert error.value.detail.startswith("Not enough credits to analyze this paper.")
        # The gate used the per-paper ceiling, not the old min-1 check.
        assert spend_calls == [635]
    finally:
        from app.db.connection import connect

        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_analyze_proceeds_when_balance_covers_ceiling(db_session, monkeypatch):
    """An affordable ceiling lets the analysis run to completion (provider
    boundary mocked)."""
    settings, session = db_session
    _install_exact_pricing(monkeypatch)
    user = _make_session_user(session, roles=["pro_user"])

    spend_calls: list[int] = []

    def allow(user, session, min_tokens=1):
        spend_calls.append(min_tokens)
        return True

    monkeypatch.setattr(ai_tokens, "ensure_can_spend", allow)

    class FakeChatService:
        def __init__(self, settings, *, user=None, session=None):
            pass

        async def chat(self, message, context="", model=None, max_tokens=None,
                       override_system_prompt=None, request_label=None, **kwargs):
            return {
                "mode": "glm-GLM-5.2",
                "answer": "The paper proposes attention at [Section #1].",
                "usage": {"input_tokens": 100, "output_tokens": 10},
                "model_id": "GLM-5.2",
                "provider": "glm",
            }

    monkeypatch.setattr(rps_module, "AiService", FakeChatService)

    async def fake_search(paper_id, prompt, top_k=10, inventory_out=None):
        if inventory_out is not None:
            inventory_out.clear()
        return [
            {
                "chunk_id": "paper-cost-ok-chunk-0",
                "chunk_index": 0,
                "chunk_text": "The dominant sequence transduction models...",
                "token_count": 400,
                "similarity_score": 0.91,
                "page_numbers": [],
            }
        ]

    try:
        _seed_paper(session, user["id"], "paper-cost-ok", [400, 300, 200])
        service = ResearchPaperService(settings, session, user)
        monkeypatch.setattr(service, "search_relevant_chunks", fake_search)

        result = await service.analyze_paper("paper-cost-ok", "Summarize the methodology")

        assert result["answer"].startswith("The paper proposes attention")
        # Fake pricing: (100 input + 10 output) tokens -> 1.1 USD -> 11 credits.
        assert result["charged_credits"] == 11
        assert spend_calls == [635]
    finally:
        from app.db.connection import connect

        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])
