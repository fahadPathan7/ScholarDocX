"""Unit tests for Research Expert service (SCHOLARDOCX-0174).

Tests PDF text extraction, text chunking, role gating (Pro/Max required),
upload quota limits, paper CRUD, pgvector similarity search, AI analysis,
and Jina embedding flat-fee billing.
"""

from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.connection import connect
from app.db.models import ResearchPaperChunks, ResearchPapers
from app.services import ai_tokens
from app.services.research_paper_service import (
    EMBEDDING_DIMENSIONS,
    ResearchPaperService,
)
from tests.helpers import (
    cleanup_user_records,
    get_balance,
    ledger_rows,
    make_settings,
    make_user,
)


@pytest.fixture
def db_session(tmp_path: Path):
    settings = make_settings(tmp_path)
    from app.db.connection import get_db

    session = next(get_db(settings.database_target))
    yield settings, session
    session.close()


def test_chunk_text_basic(tmp_path: Path):
    settings, session = make_settings(tmp_path), MagicMock()
    user = {"id": "test-user-id", "roles": ["pro_user"]}
    service = ResearchPaperService(settings, session, user)

    text_sample = "Paragraph 1. " * 30 + "\n\n" + "Paragraph 2. " * 30 + "\n\n" + "Paragraph 3. " * 30
    chunks = service._chunk_text(text_sample, chunk_size=200, overlap=20)

    assert len(chunks) > 1
    assert all(isinstance(c, str) and len(c) > 0 for c in chunks)


def test_chunk_text_stamps_active_page_marker(tmp_path: Path):
    """Every chunk should resolve a page number even when it falls mid-page.

    With small chunks a chunk can land entirely between two ``--- Page N ---``
    markers; the chunker must stamp it with the active page so "View in PDF" can
    still jump/highlight.
    """
    settings, session = make_settings(tmp_path), MagicMock()
    user = {"id": "test-user-id", "roles": ["pro_user"]}
    service = ResearchPaperService(settings, session, user)

    page1 = "--- Page 1 ---\n" + "Alpha content sentence. " * 40
    page2 = "--- Page 2 ---\n" + "Bravo content sentence. " * 40
    text_sample = page1 + "\n\n" + page2

    chunks = service._chunk_text(text_sample, chunk_size=300, overlap=40)

    assert len(chunks) > 2
    # Each chunk must expose at least one resolvable page number.
    for chunk in chunks:
        pages = service._extract_page_numbers(chunk)
        assert pages, f"chunk missing page marker: {chunk[:60]!r}"
        assert pages[0] in (1, 2)


def test_require_access_role_gating(db_session):
    settings, session = db_session

    free_user = make_user(settings, roles=["free_user"])
    general_user = make_user(settings, roles=["general_user"])
    pro_user = make_user(settings, roles=["pro_user"])
    max_user = make_user(settings, roles=["max_user"])

    try:
        # Free user -> 403
        svc_free = ResearchPaperService(settings, session, free_user)
        with pytest.raises(HTTPException) as exc_info:
            svc_free.require_access()
        assert exc_info.value.status_code == 403

        # General user -> 403
        svc_gen = ResearchPaperService(settings, session, general_user)
        with pytest.raises(HTTPException) as exc_info:
            svc_gen.require_access()
        assert exc_info.value.status_code == 403

        # Pro user -> OK
        svc_pro = ResearchPaperService(settings, session, pro_user)
        svc_pro.require_access()

        # Max user -> OK
        svc_max = ResearchPaperService(settings, session, max_user)
        svc_max.require_access()
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, free_user["id"])
            cleanup_user_records(conn, general_user["id"])
            cleanup_user_records(conn, pro_user["id"])
            cleanup_user_records(conn, max_user["id"])


def test_paper_crud_operations(db_session):
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])

    try:
        service = ResearchPaperService(settings, session, user)

        # 1. Insert dummy paper directly
        paper = ResearchPapers(
            id="paper-uuid-1",
            user_id=user["id"],
            title="Attention Is All You Need",
            authors="Vaswani et al.",
            chunk_count=2,
            status="ready",
            content_text="Sample full paper text...",
        )
        session.add(paper)

        chunk1 = ResearchPaperChunks(
            id="chunk-uuid-1",
            paper_id="paper-uuid-1",
            chunk_index=0,
            chunk_text="The dominant sequence transduction models are based on complex recurrent networks.",
            token_count=15,
        )
        chunk2 = ResearchPaperChunks(
            id="chunk-uuid-2",
            paper_id="paper-uuid-1",
            chunk_index=1,
            chunk_text="We propose the Transformer, a model architecture relying entirely on attention.",
            token_count=14,
        )
        session.add(chunk1)
        session.add(chunk2)
        session.commit()

        # 2. List papers
        papers_list = service.list_papers()
        assert len(papers_list) == 1
        assert papers_list[0]["id"] == "paper-uuid-1"
        assert papers_list[0]["title"] == "Attention Is All You Need"

        # 3. Get paper details
        details = service.get_paper_details("paper-uuid-1")
        assert details["id"] == "paper-uuid-1"
        assert len(details["chunks"]) == 2
        assert details["chunks"][0]["id"] == "chunk-uuid-1"

        # 4. Delete paper
        res = service.delete_paper("paper-uuid-1")
        assert res["status"] == "deleted"

        # 5. Verify cascade deletion
        remaining = service.list_papers()
        assert len(remaining) == 0

    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


def test_saved_analyses_crud_and_limit(db_session):
    """Save / list / delete saved analyses and enforce the 10-per-paper cap."""
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        service = ResearchPaperService(settings, session, user)
        paper = ResearchPapers(
            id="paper-saved-1",
            user_id=user["id"],
            title="Saved Analyses Test",
            chunk_count=1,
            status="ready",
        )
        session.add(paper)
        session.commit()

        # Save one with sources round-trip
        saved = service.save_analysis(
            "paper-saved-1",
            "Executive summary?",
            "The paper proposes a lightweight model.",
            sources=[{"chunk_index": 0, "chunk_id": "c1"}],
            model_used="glm",
            charged_credits=42,
        )
        assert saved["id"]
        assert saved["answer"].startswith("The paper proposes")
        assert saved["sources"] == [{"chunk_index": 0, "chunk_id": "c1"}]
        assert saved["charged_credits"] == 42

        listing = service.list_saved_analyses("paper-saved-1")
        assert listing["count"] == 1
        assert listing["max"] == 10

        # Fill to the 10 cap, then the 11th must be rejected with 400
        for i in range(9):
            service.save_analysis("paper-saved-1", f"q{i}", f"answer {i}")
        assert service.list_saved_analyses("paper-saved-1")["count"] == 10

        with pytest.raises(HTTPException) as exc:
            service.save_analysis("paper-saved-1", "overflow", "too many")
        assert exc.value.status_code == 400

        # Deleting frees a slot so a new save succeeds again
        service.delete_saved_analysis("paper-saved-1", saved["id"])
        assert service.list_saved_analyses("paper-saved-1")["count"] == 9
        service.save_analysis("paper-saved-1", "after delete", "ok")
        assert service.list_saved_analyses("paper-saved-1")["count"] == 10

        # Deleting a non-existent analysis 404s
        with pytest.raises(HTTPException) as exc2:
            service.delete_saved_analysis("paper-saved-1", "does-not-exist")
        assert exc2.value.status_code == 404
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_analyze_paper_with_mocked_ai(db_session):
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])

    try:
        service = ResearchPaperService(settings, session, user)

        # Create paper and chunk
        paper = ResearchPapers(
            id="paper-uuid-analyze",
            user_id=user["id"],
            title="Transformer Architecture Analysis",
            chunk_count=1,
            status="ready",
        )
        session.add(paper)

        chunk = ResearchPaperChunks(
            id="chunk-uuid-analyze",
            paper_id="paper-uuid-analyze",
            chunk_index=0,
            chunk_text="Transformer models achieve state-of-the-art results on translation tasks.",
            token_count=12,
        )
        session.add(chunk)
        session.commit()

        # Mock vector search and AiService.chat
        mock_chunks = [
            {
                "chunk_id": "chunk-uuid-analyze",
                "chunk_index": 0,
                "chunk_text": "Transformer models achieve state-of-the-art results on translation tasks.",
                "token_count": 12,
                "similarity_score": 0.92,
            }
        ]

        with patch.object(service, "search_relevant_chunks", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = mock_chunks

            with patch("app.services.research_paper_service.AiService") as mock_ai_cls:
                mock_ai_instance = MagicMock()
                mock_ai_instance.chat = AsyncMock(
                    return_value={
                        "mode": "gemini-2.5-flash",
                        "answer": "The paper demonstrates state-of-the-art translation performance.",
                        "usage": {"input_tokens": 120, "output_tokens": 30},
                    }
                )
                mock_ai_cls.return_value = mock_ai_instance

                res = await service.analyze_paper("paper-uuid-analyze", "What are the main results?")

                assert res["paper_id"] == "paper-uuid-analyze"
                assert "state-of-the-art" in res["answer"]
                assert len(res["sources"]) == 1
                assert res["sources"][0]["similarity_score"] == 0.92
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


# ── Jina embedding flat-fee billing (SCHOLARDOCX-0174) ────────────────────────


def _snapshot_jina_cost(settings) -> str | None:
    """Read the current jina_call_cost_usd value so a test can restore it
    exactly afterward.

    STRICT RULE (SCHOLARDOCX-0178 incident): app_settings is global, shared,
    admin-configured state, and this suite runs against a real shared
    database (see tests/conftest.py's load_dotenv) — a test that overwrites
    a row here and never restores it corrupts the real admin configuration
    indefinitely, for every user. This exact bug left jina_call_cost_usd
    stuck at a test-inserted 0.02 until caught and fixed. Always snapshot
    the value that was actually there before mutating it — never assume
    "the default" is what to restore.
    """
    with connect(settings.database_target) as db:
        row = db.execute(
            "SELECT value FROM app_settings WHERE key = 'jina_call_cost_usd'"
        ).fetchone()
        return row["value"] if row else None


def _set_jina_cost(settings, cost_usd: float) -> None:
    """Override the admin-configured Jina flat fee for a test. Callers MUST
    restore the value `_snapshot_jina_cost` returned in a finally block."""
    with connect(settings.database_target) as db:
        db.execute(
            "UPDATE app_settings SET value = ? WHERE key = 'jina_call_cost_usd'",
            (str(cost_usd),),
        )
        db.commit()


def test_charge_jina_embedding_records_flat_fee(db_session):
    """`_charge_jina_embedding` debits balance and writes a ledger row."""
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    jina_cost_before = _snapshot_jina_cost(settings)
    try:
        ai_tokens.refresh_balance(user, session)
        balance_before = get_balance(settings, user["id"])
        _set_jina_cost(settings, 0.005)  # 0.005 USD * 10000 rate = 50 tokens

        service = ResearchPaperService(settings, session, user)
        service._charge_jina_embedding(source="jina_embedding")

        rows = ledger_rows(settings, user["id"])
        jina_rows = [r for r in rows if r["source"] == "jina_embedding"]
        assert len(jina_rows) == 1
        assert jina_rows[0]["cost_usd"] == pytest.approx(0.005)
        assert jina_rows[0]["tokens_delta"] < 0  # consumed → negative
        # No token-metered jina charge remains (old model fully replaced)
        assert not any(r.get("provider") == "jina" for r in rows)

        balance_after = get_balance(settings, user["id"])
        spent = balance_before["subscription_remaining"] - balance_after["subscription_remaining"]
        assert spent == 50  # 0.005 * 10000 tokens/dollar
    finally:
        if jina_cost_before is not None:
            _set_jina_cost(settings, float(jina_cost_before))
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


def test_charge_jina_embedding_uses_admin_configured_cost(db_session):
    """A custom admin cost is respected on the charge."""
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    jina_cost_before = _snapshot_jina_cost(settings)
    try:
        ai_tokens.refresh_balance(user, session)
        _set_jina_cost(settings, 0.02)  # 0.02 USD * 10000 = 200 tokens

        service = ResearchPaperService(settings, session, user)
        service._charge_jina_embedding(source="jina_embedding_retry")

        rows = [r for r in ledger_rows(settings, user["id"]) if r["source"] == "jina_embedding_retry"]
        assert len(rows) == 1
        assert rows[0]["cost_usd"] == pytest.approx(0.02)
    finally:
        if jina_cost_before is not None:
            _set_jina_cost(settings, float(jina_cost_before))
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


class _FakeJinaResponse:
    """Stand-in for the Jina HTTP response, returning correctly-sized vectors."""

    status_code = 200
    text = ""

    def __init__(self, batch_size: int) -> None:
        self._batch_size = batch_size

    def json(self) -> dict:
        return {
            "data": [
                {"embedding": [0.01] * EMBEDDING_DIMENSIONS}
                for _ in range(self._batch_size)
            ]
        }


class _FakeJinaClient:
    """Async-context-manager double for ``httpx.AsyncClient``.

    Counts POSTs so a test can assert how many Jina API batches an operation
    made, independently of how many times the user was charged.
    """

    post_count = 0

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    async def post(self, url, json=None, headers=None):
        type(self).post_count += 1
        return _FakeJinaResponse(len(json.get("input", [])))


def _patch_jina():
    """Patch the Jina HTTP client and guarantee an API key is present.

    Deliberately does NOT patch `_generate_embeddings` or `_charge_jina_embedding`
    — those are the code under test for the single-charge invariant. Mocking them
    is how the original version of this test ended up asserting a charge on a
    path it had itself removed.
    """
    _FakeJinaClient.post_count = 0
    return patch("app.services.research_paper_service.httpx.AsyncClient", _FakeJinaClient)


@pytest.mark.asyncio
async def test_analyze_paper_charges_jina_query_embedding_exactly_once(db_session):
    """One analysis query → exactly one Jina fee, labelled as the query source.

    Regression guard for SCHOLARDOCX-0180: `_generate_single_embedding` used to
    charge on top of the charge already raised inside `_generate_embeddings`, so
    every question a user asked was billed twice. This test runs the real
    `search_relevant_chunks` → `_generate_single_embedding` → `_generate_embeddings`
    chain and mocks only the outbound Jina HTTP call and the AI chat call.
    """
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    jina_cost_before = _snapshot_jina_cost(settings)
    try:
        settings.jina_api_key = "test-key"
        ai_tokens.refresh_balance(user, session)
        _set_jina_cost(settings, 0.002)
        service = ResearchPaperService(settings, session, user)

        paper = ResearchPapers(
            id="paper-jina-analyze",
            user_id=user["id"],
            title="Embedding Billing Test",
            chunk_count=1,
            status="ready",
        )
        session.add(paper)
        session.add(
            ResearchPaperChunks(
                id="chunk-jina-analyze",
                paper_id="paper-jina-analyze",
                chunk_index=0,
                chunk_text="Relevant content for the analysis query.",
                token_count=8,
                embedding=[0.01] * EMBEDDING_DIMENSIONS,
            )
        )
        session.commit()

        with _patch_jina():
            with patch("app.services.research_paper_service.AiService") as mock_ai_cls:
                mock_ai_instance = MagicMock()
                mock_ai_instance.chat = AsyncMock(
                    return_value={
                        "mode": "glm",
                        "answer": "ok",
                        "usage": {"input_tokens": 10, "output_tokens": 5},
                    }
                )
                mock_ai_cls.return_value = mock_ai_instance

                await service.analyze_paper("paper-jina-analyze", "question?")

        rows = ledger_rows(settings, user["id"])
        query_rows = [r for r in rows if r["source"] == "jina_embedding_query"]
        assert len(query_rows) == 1, "query embedding must be charged exactly once"
        assert query_rows[0]["cost_usd"] == pytest.approx(0.002)

        # The generic upload-side label must NOT also appear: that duplicate row
        # is precisely the double-charge this test exists to prevent.
        assert not [r for r in rows if r["source"] == "jina_embedding"], (
            "analysis query raised a second, upload-labelled Jina charge"
        )
    finally:
        if jina_cost_before is not None:
            _set_jina_cost(settings, float(jina_cost_before))
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_multi_batch_embedding_charges_one_fee(db_session):
    """A paper large enough to need several Jina batches is still charged once.

    The fee is per user operation, not per HTTP call, so indexing cost must not
    scale with paper length.
    """
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    jina_cost_before = _snapshot_jina_cost(settings)
    try:
        settings.jina_api_key = "test-key"
        ai_tokens.refresh_balance(user, session)
        _set_jina_cost(settings, 0.002)
        service = ResearchPaperService(settings, session, user)

        # 40 chunks at batch_size 16 → 3 HTTP batches.
        chunks = [f"chunk text number {i}" for i in range(40)]

        with _patch_jina():
            embeddings, _ = await service._generate_embeddings(
                chunks, charge_source="jina_embedding"
            )

        assert len(embeddings) == 40
        assert _FakeJinaClient.post_count == 3, "expected 3 batches of 16"

        rows = [r for r in ledger_rows(settings, user["id"]) if r["source"] == "jina_embedding"]
        assert len(rows) == 1, "3 API batches must still cost exactly one fee"
    finally:
        if jina_cost_before is not None:
            _set_jina_cost(settings, float(jina_cost_before))
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_generate_embeddings_can_skip_charging(db_session):
    """`charge_source=None` generates vectors without billing.

    This is the escape hatch that lets a wrapper own the charge, so a single
    user-visible operation is never billed by two layers at once.
    """
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        settings.jina_api_key = "test-key"
        ai_tokens.refresh_balance(user, session)
        service = ResearchPaperService(settings, session, user)

        with _patch_jina():
            embeddings, _ = await service._generate_embeddings(
                ["only one chunk"], charge_source=None
            )

        assert len(embeddings) == 1
        jina_rows = [
            r for r in ledger_rows(settings, user["id"])
            if str(r["source"]).startswith("jina_")
        ]
        assert jina_rows == []
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_failed_jina_call_charges_nothing(db_session):
    """A failed embedding run must not debit the user.

    The charge is raised only after every batch returns successfully, so a paper
    that dies mid-indexing costs the user nothing.
    """
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        settings.jina_api_key = "test-key"
        ai_tokens.refresh_balance(user, session)
        service = ResearchPaperService(settings, session, user)

        class _FailingClient(_FakeJinaClient):
            async def post(self, url, json=None, headers=None):
                raise RuntimeError("jina is down")

        with patch("app.services.research_paper_service.httpx.AsyncClient", _FailingClient):
            with pytest.raises(HTTPException):
                await service._generate_embeddings(["a chunk"], charge_source="jina_embedding")

        jina_rows = [
            r for r in ledger_rows(settings, user["id"])
            if str(r["source"]).startswith("jina_")
        ]
        assert jina_rows == [], "a failed Jina run must not be billed"
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


@pytest.mark.asyncio
async def test_analyze_paper_blocks_when_out_of_credits(db_session):
    """Out of credits → 402 before the Jina query embedding is made."""
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        service = ResearchPaperService(settings, session, user)
        paper = ResearchPapers(
            id="paper-jina-402",
            user_id=user["id"],
            title="No Credits",
            chunk_count=1,
            status="ready",
        )
        session.add(paper)
        session.commit()

        # Drain the balance to zero
        ai_tokens.refresh_balance(user, session)
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "purchased_remaining = 0 WHERE user_id = ?",
                (user["id"],),
            )
            db.commit()

        with pytest.raises(ai_tokens.OutOfTokens) as exc:
            await service.analyze_paper("paper-jina-402", "question?")
        assert exc.value.status_code == 402

        # No Jina charge should have been recorded
        rows = [r for r in ledger_rows(settings, user["id"]) if "jina" in str(r.get("source", ""))]
        assert rows == []
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


# ── Retrieval honesty (SCHOLARDOCX-0180) ─────────────────────────────────────


@pytest.mark.asyncio
async def test_boosted_chunks_report_real_similarity(db_session):
    """Section-boosted chunks carry measured similarity, not a placeholder.

    The UI renders `similarity_score` to the user as a "Relevance: N%" badge next
    to each citation. Boosting used to stamp a flat 0.85 on keyword hits, so that
    badge was a fabricated number. Every score leaving this method must come from
    the pgvector cosine computation.
    """
    settings, session = db_session
    user = make_user(settings, roles=["pro_user"])
    try:
        settings.jina_api_key = "test-key"
        ai_tokens.refresh_balance(user, session)
        service = ResearchPaperService(settings, session, user)

        paper = ResearchPapers(
            id="paper-boost-score",
            user_id=user["id"],
            title="Boost Scoring",
            chunk_count=3,
            status="ready",
        )
        session.add(paper)
        # Chunk 0 mentions the section keyword early (the chunk the old
        # chunk_index-ordered boost would have grabbed); chunk 2 is the real
        # limitations section.
        for idx, body in enumerate(
            [
                "In this work we briefly note a limitation of prior systems.",
                "Unrelated background material about datasets.",
                "Limitations: our approach degrades under distribution shift.",
            ]
        ):
            session.add(
                ResearchPaperChunks(
                    id=f"chunk-boost-{idx}",
                    paper_id="paper-boost-score",
                    chunk_index=idx,
                    chunk_text=body,
                    token_count=10,
                    embedding=[0.01 * (idx + 1)] * EMBEDDING_DIMENSIONS,
                )
            )
        session.commit()

        with _patch_jina():
            results = await service.search_relevant_chunks(
                "paper-boost-score", "What are the limitations?", top_k=3
            )

        assert results, "expected the boost pass to return chunks"
        for r in results:
            assert r["similarity_score"] != 0.85, (
                "found the retired hardcoded boost score being shown as relevance"
            )
            assert -1.0 <= r["similarity_score"] <= 1.0
    finally:
        with connect(settings.database_target) as conn:
            cleanup_user_records(conn, user["id"])


def test_delete_paper_does_not_refund_monthly_quota(db_session):
    """Deleting a paper must NOT hand back a monthly upload slot.

    `research_papers_per_month` counts uploads performed in the billing period,
    not papers currently held. Resyncing it from a live COUNT(*) on delete would
    let a user cycle upload → delete → upload without limit. The genuine problem
    it was tempting to fix that way — a *failed* upload burning a slot — is
    handled in `upload_and_process_paper`, which only increments on success.
    """
    from app.auth import limits as limits_module

    assert "research_papers_per_month" not in limits_module._USAGE_COUNT_QUERIES, (
        "research_papers_per_month must stay out of the resync table, otherwise "
        "delete-and-reupload silently bypasses the monthly quota"
    )

