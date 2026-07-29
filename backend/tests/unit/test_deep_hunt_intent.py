"""SCHOLARDOCX-0173: Deep Hunt intent matching & field-of-study dimension.

These tests cover the deterministic, network-free parts of the intent pipeline
so they run regardless of OPENROUTER_API_KEY:

- ``_fallback_queries`` still emits ≥1 query (regression guard).
- The query planner's heuristic synonym derivation expands CSE/CS.
- The relevance filter's deterministic fallback rejects an off-topic field and
  accepts an on-topic field.
- ``_is_acceptable`` now enforces the relevance floor (rejects off-topic items
  even when well-formed) and keeps its old well-formedness behaviour.
- ``upsert_scholarship_opportunity`` persists ``fields_of_study_json``.

The live OpenRouter paths are exercised via the planner/relevance classes'
client_factory injection in integration; here we only assert the contract.
"""

from __future__ import annotations

import pytest

from app.services.deep_hunt_query_planner import (
    DeepHuntQueryPlanner,
    DeepHuntRelevanceFilter,
    _heuristic_field_synonyms,
)
from app.services.scholarship_deep_hunt import (
    RELEVANCE_FLOOR,
    _dedup_key,
    _fallback_queries,
    _is_acceptable,
)


# --- Deterministic query fallback ------------------------------------------


def test_fallback_queries_emits_at_least_one_query():
    run = {"goal": "fully funded CS PhD funding, EU", "degree_level": "PhD"}
    queries = _fallback_queries(run)
    assert len(queries) >= 1
    # The goal text must appear verbatim in every emitted query.
    assert all("fully funded CS PhD funding, EU" in q for q in queries)


def test_fallback_queries_uses_facets_when_present():
    run = {
        "goal": "data science master",
        "degree_level": "Master",
        "destinations": ["Germany"],
        "intake_term": "Fall 2027",
    }
    queries = _fallback_queries(run)
    # The facet-bearing template joins degree + destination + intake.
    assert any("Master" in q and "Germany" in q and "Fall 2027" in q for q in queries)


# --- Heuristic field-synonym derivation ------------------------------------


def test_heuristic_synonyms_expand_cse_to_computer_science():
    synonyms = _heuristic_field_synonyms("CSE")
    lowered = [s.casefold() for s in synonyms]
    assert "computer science" in lowered
    assert "computer engineering" in lowered
    # The raw input is preserved so exact pages still match.
    assert "cse" in lowered


def test_heuristic_synonyms_expand_cs_shorthand():
    synonyms = _heuristic_field_synonyms("CS")
    lowered = [s.casefold() for s in synonyms]
    assert "computer science" in lowered
    assert "software engineering" in lowered


def test_heuristic_synonyms_pass_unknown_field_through():
    synonyms = _heuristic_field_synonyms("Classics")
    assert synonyms == ["Classics"]


def test_heuristic_synonyms_empty_for_blank_input():
    assert _heuristic_field_synonyms("") == []
    assert _heuristic_field_synonyms(None) == []


# --- Relevance filter deterministic fallback -------------------------------


def _opp(name: str, fields: list[str]) -> dict:
    return {"canonical_name": name, "fields_of_study": fields}


def test_relevance_heuristic_accepts_overlapping_field():
    f = DeepHuntRelevanceFilter(settings=_no_openrouter_settings())
    scores = f._heuristic_scores(
        [_opp("CS Scholarship", ["Computer Science", "Software Engineering"])],
        field_synonyms=["computer science", "cs", "cse"],
        degree_level=None,
    )
    assert scores == [pytest.approx(0.7)]


def test_relevance_heuristic_rejects_unrelated_field():
    f = DeepHuntRelevanceFilter(settings=_no_openrouter_settings())
    scores = f._heuristic_scores(
        [_opp("Classics Fellowship", ["Classics", "Literature"])],
        field_synonyms=["computer science", "cs", "cse"],
        degree_level=None,
    )
    assert scores == [pytest.approx(0.1)]


def test_relevance_heuristic_neutral_when_field_unstated():
    f = DeepHuntRelevanceFilter(settings=_no_openrouter_settings())
    scores = f._heuristic_scores(
        [_opp("Generic Fellowship", [])],
        field_synonyms=["computer science"],
        degree_level=None,
    )
    # Unstated field -> neutral 0.5, not a hard reject.
    assert scores == [pytest.approx(0.5)]


def test_relevance_off_topic_score_below_floor():
    # The heuristic's 0.1 off-topic score must fall under RELEVANCE_FLOOR so
    # _is_acceptable rejects it. This is the guarantee that ties the two.
    assert 0.1 < RELEVANCE_FLOOR


def test_relevance_heuristic_scores_broad_umbrella_program_below_floor():
    # SCHOLARDOCX-0177: a field overlap buried in a 5+ field umbrella listing
    # (e.g. a generic Erasmus Mundus program covering nearly every discipline)
    # must score under RELEVANCE_FLOOR even though the goal's field
    # technically appears in the list — it is not the close, field-specific
    # match a normal overlap signals.
    f = DeepHuntRelevanceFilter(settings=_no_openrouter_settings())
    scores = f._heuristic_scores(
        [
            _opp(
                "Erasmus Mundus Joint Master's Scholarship",
                [
                    "Engineering and Technology",
                    "Environmental and Climate Sciences",
                    "Data Science and Artificial Intelligence",
                    "Public Policy and International Relations",
                    "Health and Life Sciences",
                    "Social Sciences and Humanities",
                ],
            )
        ],
        field_synonyms=["computer science", "cs", "cse"],
        degree_level=None,
    )
    assert scores == [pytest.approx(0.2)]
    assert scores[0] < RELEVANCE_FLOOR


def test_relevance_heuristic_still_rewards_specific_field_match():
    # A specific, non-umbrella match keeps its normal high score.
    f = DeepHuntRelevanceFilter(settings=_no_openrouter_settings())
    scores = f._heuristic_scores(
        [_opp("CS Scholarship", ["Computer Science", "Software Engineering"])],
        field_synonyms=["computer science", "cs", "cse"],
        degree_level=None,
    )
    assert scores[0] > RELEVANCE_FLOOR


# --- Canonical-name dedup key (SCHOLARDOCX-0177) ---------------------------


def test_dedup_key_collapses_year_and_punctuation_variants():
    variants = [
        "Erasmus Mundus Joint Master's Scholarships",
        "Erasmus Mundus Joint Masters Scholarship",
        "Erasmus Mundus Joint Master's Scholarship 2026",
    ]
    keys = {_dedup_key(name) for name in variants}
    assert len(keys) == 1


def test_dedup_key_collapses_year_range_variants():
    assert _dedup_key("Erasmus Mundus Scholarship 2026") == _dedup_key(
        "Erasmus Mundus Scholarship 2026–2027"
    )
    assert _dedup_key("Erasmus Mundus Scholarship 2026") == _dedup_key(
        "Erasmus Mundus Scholarship"
    )


def test_dedup_key_keeps_distinctly_named_programs_separate():
    # A specifically-named consortium/program is not a punctuation/year
    # variant of the generic umbrella name and must not collapse into it.
    generic = _dedup_key("Erasmus Mundus Scholarship 2026")
    specific = _dedup_key("EDISS Erasmus (EMJM) Scholarship 2026-2028 Batch")
    assert generic != specific


# --- Accept gate: relevance precondition + well-formedness -----------------


def _well_formed_extract(**overrides):
    base = {
        "canonical_name": "Example CS Scholarship",
        "deadlines": [{"date": "2027-01-15", "label": None}],
        "funding": {"coverage": "full", "notes": None},
    }
    base.update(overrides)
    return base


def test_is_acceptable_rejects_off_topic_even_when_well_formed():
    extracted = _well_formed_extract()
    # Off-topic relevance (below the floor) must reject.
    assert _is_acceptable(extracted, relevance_score=0.1) is False
    assert _is_acceptable(extracted, relevance_score=0.0) is False


def test_is_acceptable_accepts_relevant_well_formed():
    extracted = _well_formed_extract()
    assert _is_acceptable(extracted, relevance_score=0.9) is True
    assert _is_acceptable(extracted, relevance_score=1.0) is True


def test_is_acceptable_still_requires_name_and_signal():
    # No canonical name -> reject regardless of relevance.
    assert _is_acceptable({"canonical_name": None}, relevance_score=1.0) is False
    # Name but no deadline/funding signal -> reject.
    no_signal = {"canonical_name": "X", "deadlines": [], "funding": {}}
    assert _is_acceptable(no_signal, relevance_score=1.0) is False


def test_is_acceptable_default_relevance_keeps_legacy_behaviour():
    # Callers that pre-date the intent filter pass no score -> default 1.0,
    # so a well-formed item still passes.
    assert _is_acceptable(_well_formed_extract()) is True


# --- Query planner deterministic fallback (no OpenRouter key) --------------


@pytest.mark.asyncio
async def test_planner_falls_back_when_openrouter_unconfigured(monkeypatch):
    planner = DeepHuntQueryPlanner(settings=_no_openrouter_settings())
    plan = await planner.plan(
        "emjm fully fund in cse background",
        # ai_service is required (SCHOLARDOCX-0204 L1). None is only valid here
        # because the unconfigured-OpenRouter path returns before any charge.
        ai_service=None,
        field_of_study="CSE",
        fallback_queries=["cse background scholarship funding official application"],
    )
    assert plan["source"] == "fallback"
    # Fallback queries pass through.
    assert plan["queries"] == ["cse background scholarship funding official application"]
    # Field synonyms are still derived heuristically so downstream relevance works.
    assert "computer science" in [s.casefold() for s in plan["field_synonyms"]]


# --- Persistence: fields_of_study_json -------------------------------------


def test_upsert_persists_fields_of_study(tmp_path):
    from sqlalchemy import text
    from sqlalchemy.orm import sessionmaker

    from app.services.store import Store
    from app.db.connection import get_engine
    from app.api.scholarship_opportunities import upsert_scholarship_opportunity
    from app.core.compat import safe_json_loads
    from tests.helpers import make_settings

    settings = make_settings(tmp_path)
    user_email = "fields-upsert@example.com"
    engine = get_engine(settings.database_target)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    # Seed the user so the scholarship_opportunities.user_id FK holds.
    session.execute(
        text(
            "INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (:email, 'x', 'Test', '[\"max_user\"]', 1, 0) "
            "ON CONFLICT (email) DO NOTHING"
        ),
        {"email": user_email},
    )
    session.commit()
    user_id = session.execute(
        text("SELECT id FROM users WHERE email = :email"), {"email": user_email}
    ).scalar()
    store = Store(session, current_user_id=str(user_id))
    try:
        extracted = {
            "canonical_name": "CS Excellence Scholarship",
            "sponsor": "ACM",
            "degree_levels": ["master's"],
            "fields_of_study": ["Computer Science", "Machine Learning"],
            "destination_countries": ["USA"],
            "eligible_nationalities": [],
            "funding": {"coverage": "full", "notes": None},
            "deadlines": [{"date": "2027-01-15", "label": None}],
            "requirements": [],
            "application_url": "https://acm.example/apply",
            "field_confidence": {},
        }
        result = upsert_scholarship_opportunity(
            store,
            source="deep_hunt",
            extracted=extracted,
            source_url="https://acm.example/cs",
            fallback_title="CS Excellence",
        )
        rows = [r for r in store.list_records("scholarship_opportunities") if r["id"] == result["id"]]
        assert rows, "upserted opportunity should be readable"
        fields = safe_json_loads(rows[0]["fields_of_study_json"], default=[])
        assert fields == ["Computer Science", "Machine Learning"]
    finally:
        # Self-clean: delete the row + user so the broad `SELECT * FROM
        # scholarship_opportunities` assertions in test_scholarship_opportunities.py
        # do not pick up this test's rows (pre-existing isolation fragility,
        # not a logic issue). The conftest per-test fixture is the safety net.
        from app.db.connection import connect
        from tests.helpers import cleanup_user_records

        session.close()
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user_id=str(user_id), email=user_email)
            db.commit()


# --- helpers ----------------------------------------------------------------


def _no_openrouter_settings():
    """A Settings object with OpenRouter disabled so the AI paths fall back
    deterministically. Avoids live network calls in unit tests."""
    from app.core.config import Settings

    s = Settings()
    s.openrouter_api_key = ""
    return s
