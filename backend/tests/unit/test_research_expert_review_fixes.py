"""Research Expert review fixes (SCHOLARDOCX-0253)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.research_reader import AnalyzePaperPayload, SaveAnalysisPayload, _inline_disposition
from app.auth.limits import UsageLimitExceeded
from app.db.connection import connect
from app.db.models import ResearchPaperChunks, ResearchPapers
from app.services import ai_tokens
from app.services.research_paper_constants import (
    ANALYSIS_MODEL_CASCADE,
    PREDEFINED_PROMPTS,
    public_prompt_catalog,
    resolve_predefined_prompt,
)
from app.services.research_paper_retrieval import (
    detect_inventory_target,
    wants_reference_section,
)
from app.services.research_paper_service import ResearchPaperService
from tests.helpers import cleanup_user_records, make_settings, make_user


@pytest.fixture
def db_session(tmp_path: Path):
    settings = make_settings(tmp_path)
    from app.db.connection import get_db

    session = next(get_db(settings.database_target))
    yield settings, session
    session.close()


# ── Predefined prompts ───────────────────────────────────────────────────────


def test_predefined_prompts_resolve_by_id_and_by_exact_text():
    for item in PREDEFINED_PROMPTS:
        assert resolve_predefined_prompt("anything", item["id"]) is item
        # Older clients send only the text.
        assert resolve_predefined_prompt(item["prompt"]) is item
    assert resolve_predefined_prompt("What is the main result?") is None
    assert resolve_predefined_prompt("What is the main result?", "not-a-prompt") is None


def test_predefined_prompts_fit_the_payload_and_carry_retrieval_settings():
    ids = [item["id"] for item in PREDEFINED_PROMPTS]
    assert len(ids) == len(set(ids)) == 13
    for item in PREDEFINED_PROMPTS:
        AnalyzePaperPayload(prompt=item["prompt"], prompt_id=item["id"])  # <= 1000 chars
        assert item["retrieval_query"].strip()
        assert item["section_terms"]


def test_public_catalog_hides_retrieval_internals():
    for entry in public_prompt_catalog():
        assert set(entry) == {"id", "title", "prompt", "icon"}


def test_primary_analysis_model_is_glm_5_3():
    assert ANALYSIS_MODEL_CASCADE[0] == ("glm:GLM-5.3", "GLM-5.3")


# ── Word-boundary heuristics ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "query",
    [
        "how does the preference model work",
        "I am excited about these inference results",
    ],
)
def test_substrings_no_longer_pull_the_bibliography(query):
    assert wants_reference_section(query) is False


@pytest.mark.parametrize(
    "query",
    [
        "is training stable in total?",
        "how does the model account for figure noise",
        "explain each result in table 2",
        "what is the overall accuracy in table 1",
    ],
)
def test_passage_questions_do_not_trigger_document_counts(query):
    assert detect_inventory_target(query) is None


# ── Cascade + predefined routing ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_blocked_primary_model_falls_back_and_predefined_prompt_routes(db_session):
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        service = ResearchPaperService(settings, session, user)
        session.add(
            ResearchPapers(
                id="paper-0253", user_id=user["id"], title="T", chunk_count=1, status="ready"
            )
        )
        session.add(
            ResearchPaperChunks(
                id="chunk-0253", paper_id="paper-0253", chunk_index=0,
                chunk_text="Results improve by 3.1 points.", token_count=8,
            )
        )
        session.commit()
        chunk = {
            "chunk_id": "chunk-0253", "chunk_index": 0,
            "chunk_text": "Results improve by 3.1 points.", "token_count": 8,
            "similarity_score": 0.8,
        }
        spec = next(item for item in PREDEFINED_PROMPTS if item["id"] == "key_findings")

        with patch.object(ai_tokens, "ensure_can_spend"), patch.object(
            service, "search_relevant_chunks", new_callable=AsyncMock, return_value=[chunk]
        ) as search, patch("app.services.research_paper_service.AiService") as ai_cls:
            ai = MagicMock()
            ai.chat = AsyncMock(
                side_effect=[
                    UsageLimitExceeded("Admin has restricted this model use try another model."),
                    {
                        "mode": "groq-groq/compound",
                        "answer": "Gain of 3.1 [Section #1].",
                        "usage": {"input_tokens": 10, "output_tokens": 5},
                    },
                ]
            )
            ai_cls.return_value = ai

            result = await service.analyze_paper(
                "paper-0253", "client text that may be stale", prompt_id="key_findings"
            )

        assert [call.kwargs["model"] for call in ai.chat.await_args_list] == [
            "glm:GLM-5.3",
            "groq:groq/compound",
        ]
        assert result["answer"].startswith("Gain")
        # The canonical text ran, not the client's copy.
        assert result["prompt"] == spec["prompt"]
        assert ai.chat.await_args_list[1].kwargs["message"] == spec["prompt"]
        kwargs = search.await_args.kwargs
        assert kwargs["structural"] is False
        assert kwargs["retrieval_query"] == spec["retrieval_query"]
        assert kwargs["section_terms"] == spec["section_terms"]
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


# ── Retry keeps a working index on failure ───────────────────────────────────


@pytest.mark.asyncio
async def test_failed_reindex_of_a_ready_paper_keeps_it_ready(db_session):
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        service = ResearchPaperService(settings, session, user)
        session.add(
            ResearchPapers(
                id="paper-0253-retry", user_id=user["id"], title="T", chunk_count=1,
                status="ready", content_text="--- Page 1 ---\nSome body text. " * 20,
            )
        )
        session.add(
            ResearchPaperChunks(
                id="chunk-0253-retry", paper_id="paper-0253-retry", chunk_index=0,
                chunk_text="Some body text.", token_count=4,
            )
        )
        session.commit()

        failure = HTTPException(status_code=503, detail="Paper search is busy right now.")
        with patch.object(ai_tokens, "ensure_can_spend"), patch.object(
            service, "_generate_embeddings", new_callable=AsyncMock, side_effect=failure
        ):
            with pytest.raises(HTTPException):
                await service.retry_paper_processing("paper-0253-retry")

        session.expire_all()
        paper = session.query(ResearchPapers).filter_by(id="paper-0253-retry").one()
        assert paper.status == "ready"
        assert (
            session.query(ResearchPaperChunks).filter_by(paper_id="paper-0253-retry").count()
            == 1
        )
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


# ── User-facing errors stay free of provider and infra names ─────────────────

FORBIDDEN = ("jina", ".env", "api_key", "429", "500", "secret-body")


def _bare_service(**settings) -> ResearchPaperService:
    return ResearchPaperService(SimpleNamespace(**settings), MagicMock(), {"id": "u"})


@pytest.mark.asyncio
async def test_missing_embedding_key_message_is_plain():
    service = _bare_service(jina_api_key="", jina_base_url="https://x.invalid")
    with pytest.raises(HTTPException) as exc:
        await service._generate_embeddings(["text"], charge_source=None)
    assert not any(word in exc.value.detail.lower() for word in FORBIDDEN)


@pytest.mark.asyncio
async def test_provider_error_body_is_not_shown_to_the_user():
    service = _bare_service(jina_api_key="k", jina_base_url="https://x.invalid")

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *args, **kwargs):
            return SimpleNamespace(status_code=429, text="secret-body JINA quota")

    with patch("app.services.research_paper_processing.httpx.AsyncClient", FakeClient):
        with pytest.raises(HTTPException) as exc:
            await service._generate_embeddings(["text"], charge_source=None)
    assert exc.value.status_code == 503
    assert not any(word in exc.value.detail.lower() for word in FORBIDDEN)


# ── Text and transport details ───────────────────────────────────────────────


def test_nul_bytes_are_stripped_from_extracted_text():
    service = _bare_service()
    assert "\x00" not in service._clean_pdf_text("Attention\x00 is all\x00 you need")


@pytest.mark.parametrize("name", ['Müller "draft".pdf', "论文.pdf", "a\r\nX-Evil: 1.pdf"])
def test_pdf_header_survives_any_filename(name):
    header = _inline_disposition(name)
    header.encode("latin-1")  # would raise for a raw non-latin-1 name
    assert "\r" not in header and "\n" not in header
    assert "filename*=UTF-8''" in header


def test_saved_sources_are_capped():
    with pytest.raises(ValueError):
        SaveAnalysisPayload(prompt="p", answer="a", sources=[{}] * 33)
