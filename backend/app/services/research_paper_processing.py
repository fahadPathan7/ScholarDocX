"""Upload/retry/embedding pipeline for the Research Expert service (SCHOLARDOCX-0221 split).
Mechanically extracted from research_paper_service.py; method bodies are
byte-identical. All billing calls moved verbatim (guard-verified)."""

from __future__ import annotations

import io
import logging
import math
import re
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.limits import check_and_increment_limit, feature_plan_phrase, UsageLimitExceeded
from app.core.config import Settings
from app.core.storage import delete_file
from app.core.workspace import save_upload
from app.db.models import ResearchPaperAnalyses, ResearchPaperChunks, ResearchPapers, StaticFiles
from app.services.ai import AiService
from app.services import ai_tokens
from app.services.research_paper_retrieval import (
    apply_retrieval_budget,
    cited_section_numbers,
    detect_inventory_target,
    inventory_note,
    is_reference_chunk,
    reference_budget,
    scan_inventory,
    section_terms_for,
    wants_reference_section,
)

from app.services.research_paper_constants import (
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_TASK_PASSAGE,
    EMBEDDING_TASK_QUERY,
    QUERY_TASK_FOR_PASSAGE_TASK,
)

logger = logging.getLogger(__name__)


class PaperProcessingMixin:
    async def upload_and_process_paper(
        self,
        filename: str,
        file_bytes: bytes,
    ) -> dict[str, Any]:
        """Upload PDF file, extract text, generate chunk embeddings, and save to DB."""
        self.require_access()
        self.check_library_capacity()
        self.check_upload_quota()

        # Check AI token credits before doing embedding work
        ai_tokens.ensure_can_spend(self.user, self.db, min_tokens=1)

        # Basic PDF verification
        if not filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are supported in Research Expert.")

        # Save binary file via Supabase Storage helper
        file_stream = io.BytesIO(file_bytes)
        try:
            upload_meta = save_upload(self.settings, "research_papers", filename, file_stream)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Check & charge user's total document storage byte quota
        try:
            check_and_increment_limit(
                self.user, "total_documents_bytes", upload_meta["size_bytes"], self.db
            )
        except UsageLimitExceeded as exc:
            # Delete stored file if storage byte quota was exceeded
            try:
                delete_file(upload_meta["relative_path"])
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Create record in static_files for trackability
        import uuid

        static_file_id = str(uuid.uuid4())
        cleaned_filename = Path(filename).name.strip()
        self.db.execute(
            text(
                "INSERT INTO static_files (id, user_id, file_type, display_name, relative_path, size_bytes, mime_type) "
                "VALUES (:id, :uid, 'research_paper', :name, :path, :size, 'application/pdf')"
            ),
            {
                "id": static_file_id,
                "uid": self.user["id"],
                "name": cleaned_filename,
                "path": upload_meta["relative_path"],
                "size": upload_meta["size_bytes"],
            },
        )
        self.db.commit()

        # Create paper record in processing status
        title = Path(cleaned_filename).stem.replace("_", " ").replace("-", " ").title()
        paper_id = str(uuid.uuid4())

        paper = ResearchPapers(
            id=paper_id,
            user_id=self.user["id"],
            title=title,
            static_file_id=static_file_id,
            content_text="",
            chunk_count=0,
            embedding_model=EMBEDDING_MODEL,
            status="processing",
        )
        self.db.add(paper)
        self.db.commit()

        # NOTE: the monthly quota slot is deliberately NOT consumed here. It is
        # incremented only after the paper reaches "ready" below, so a paper that
        # fails extraction or embedding does not permanently burn one of the
        # user's monthly uploads for a failure that wasn't their fault.

        # Extract text & generate embeddings
        try:
            text_content, authors = self._extract_text_from_pdf(file_bytes)
            if not text_content.strip():
                # Status is set by the handler below, which owns every failure path.
                raise HTTPException(
                    status_code=400,
                    detail="Could not extract readable text from PDF. The document may be scanned or empty.",
                )

            paper.content_text = text_content

            # Extract publication metadata (Title, Authors, Journal/Conf, Year, Volume/Pages, DOI).
            # Feed a superscript-cleaned header so affiliation markers (superscript
            # a/b/c/1/2) don't get glued onto author surnames (e.g. "Das" -> "Dasa").
            header_text = self._extract_clean_header_text(file_bytes)
            meta = await self._extract_paper_metadata(header_text or text_content, filename)
            if meta.get("title"):
                paper.title = meta["title"]
            if meta.get("authors"):
                paper.authors = meta["authors"]
            elif authors:
                paper.authors = authors
            if meta.get("journal_conference"):
                paper.journal_conference = meta["journal_conference"]
            if meta.get("publication_year"):
                paper.publication_year = meta["publication_year"]
            if meta.get("volume_issue_pages"):
                paper.volume_issue_pages = meta["volume_issue_pages"]
            if meta.get("doi"):
                paper.doi = meta["doi"]

            chunks = self._chunk_text(text_content)
            paper.chunk_count = len(chunks)

            # Pre-flight check token balance before calling Jina AI API
            ai_tokens.ensure_can_spend(self.user, self.db, min_tokens=1)

            # Batch generate embeddings via Jina AI jina-embeddings-v4 (1024 dims).
            # Charges exactly one "jina_embedding" flat fee for the whole indexing
            # pass, regardless of how many API batches the paper required, and
            # only if every batch succeeded.
            embeddings, input_tokens = await self._generate_embeddings(
                chunks, charge_source="jina_embedding", task=EMBEDDING_TASK_PASSAGE
            )
            # Record the task alongside the vectors it produced. Questions are
            # embedded to match this value, so it must be written in the same
            # transaction as the chunks.
            paper.embedding_task = EMBEDDING_TASK_PASSAGE

            # Store chunks with vector embeddings
            for idx, (chunk_text_str, emb_vector) in enumerate(zip(chunks, embeddings)):
                chunk_obj = ResearchPaperChunks(
                    id=str(uuid.uuid4()),
                    paper_id=paper_id,
                    chunk_index=idx,
                    chunk_text=chunk_text_str,
                    token_count=len(chunk_text_str) // 4,
                    embedding=emb_vector,
                )
                self.db.add(chunk_obj)

            paper.status = "ready"
            self.db.commit()

            # Consume the monthly quota slot only now that the paper is genuinely
            # usable. See the note above the try block.
            #
            # Never fatal: the paper is indexed and the user has already paid for
            # the embeddings. UsageLimitExceeded subclasses HTTPException, so
            # letting it escape here would hit the handler below and mark a
            # perfectly good paper as "error" — e.g. if an admin lowered the limit
            # or a concurrent upload consumed the last slot mid-run. The counter
            # is self-healing; the user's paper is not.
            try:
                check_and_increment_limit(self.user, "research_papers_per_month", 1, self.db)
            except Exception as quota_exc:
                logger.warning(
                    "Paper %s processed but monthly quota increment failed: %s",
                    paper_id,
                    quota_exc,
                )

            return self.get_paper_details(paper_id)

        except HTTPException:
            self._mark_paper_error(paper_id)
            raise
        except Exception as exc:
            logger.error("Failed processing paper %s: %s", paper_id, exc, exc_info=True)
            self._mark_paper_error(paper_id)
            raise HTTPException(
                status_code=500,
                detail="We couldn't process this paper. Please try again.",
            ) from exc

    def _mark_paper_error(self, paper_id: str) -> None:
        """Flag a paper as failed, surviving a poisoned session.

        The failure may itself have been a database error, leaving the session
        unusable — a plain ``commit()`` would then also fail and strand the row in
        "processing" forever (what the fix_stuck_papers scripts clean up). Roll
        back and re-fetch so the status write is reliable.
        """
        try:
            self.db.rollback()
            paper = (
                self.db.query(ResearchPapers)
                .filter(ResearchPapers.id == paper_id)
                .first()
            )
            if paper is not None:
                paper.status = "error"
                self.db.commit()
        except Exception as err:  # pragma: no cover - defensive
            logger.error("Could not mark paper %s as error: %s", paper_id, err)

    async def retry_paper_processing(self, paper_id: str) -> dict[str, Any]:
        """Retry text extraction, chunking, and embedding generation for a paper in error state."""
        self.require_access()

        paper = (
            self.db.query(ResearchPapers)
            .filter(
                ResearchPapers.id == paper_id,
                ResearchPapers.user_id == self.user["id"],
            )
            .first()
        )
        if not paper:
            raise HTTPException(status_code=404, detail="Research paper not found.")

        paper.status = "processing"
        self.db.commit()

        try:
            # Delete any existing chunks before re-indexing
            self.db.query(ResearchPaperChunks).filter(
                ResearchPaperChunks.paper_id == paper_id
            ).delete()
            self.db.commit()

            text_content = paper.content_text or ""
            authors = paper.authors

            # If text_content is empty, attempt to re-read file from storage/local disk
            if not text_content.strip() and paper.static_file_id:
                sf = (
                    self.db.query(StaticFiles)
                    .filter(StaticFiles.id == paper.static_file_id)
                    .first()
                )
                if sf and sf.relative_path:
                    file_bytes = self._read_stored_file_bytes(sf.relative_path)
                    if file_bytes:
                        extracted, extracted_authors = self._extract_text_from_pdf(file_bytes)
                        if extracted and extracted.strip():
                            text_content = extracted
                        if extracted_authors and not authors:
                            authors = extracted_authors

            if not text_content.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Could not extract readable text from PDF. The document may be scanned or empty.",
                )

            paper.content_text = text_content
            if authors:
                paper.authors = authors

            chunks = self._chunk_text(text_content)
            paper.chunk_count = len(chunks)

            # Pre-flight check token balance before calling Jina AI API
            ai_tokens.ensure_can_spend(self.user, self.db, min_tokens=1)

            # Generate embeddings via Jina AI jina-embeddings-v4 (1024 dims).
            # Labelled "jina_embedding_retry" so retries are distinguishable from
            # first-time indexing in the ledger and the admin dashboard's
            # jina_total breakdown (which already counts this source).
            embeddings, input_tokens = await self._generate_embeddings(
                chunks, charge_source="jina_embedding_retry", task=EMBEDDING_TASK_PASSAGE
            )
            # A retry re-indexes from scratch, so it is also the upgrade path
            # for a paper still on the legacy symmetric task.
            paper.embedding_task = EMBEDDING_TASK_PASSAGE

            import uuid
            for idx, (chunk_text_str, emb_vector) in enumerate(zip(chunks, embeddings)):
                chunk_obj = ResearchPaperChunks(
                    id=str(uuid.uuid4()),
                    paper_id=paper_id,
                    chunk_index=idx,
                    chunk_text=chunk_text_str,
                    token_count=len(chunk_text_str) // 4,
                    embedding=emb_vector if emb_vector else None,
                )
                self.db.add(chunk_obj)

            paper.status = "ready"
            self.db.commit()

            return self.get_paper_details(paper_id)

        except HTTPException:
            self._mark_paper_error(paper_id)
            raise
        except Exception as exc:
            logger.error("Failed retry processing paper %s: %s", paper_id, exc, exc_info=True)
            self._mark_paper_error(paper_id)
            raise HTTPException(
                status_code=500,
                detail="We couldn't process this paper. Please try again.",
            ) from exc

    def _read_stored_file_bytes(self, relative_path: str) -> Optional[bytes]:
        """Read stored PDF file bytes from local disk or Supabase Storage."""
        try:
            local_path = self.settings.workspace_path / relative_path
            if local_path.exists():
                return local_path.read_bytes()
        except Exception as err:
            logger.warning("Could not read file locally: %s", err)

        try:
            from app.core.storage import download_bytes, _is_configured
            if _is_configured():
                content_bytes, _ = download_bytes(relative_path)
                return content_bytes
        except Exception as err:
            logger.warning("Could not download file from Supabase storage: %s", err)
        return None

    def _charge_jina_embedding(
        self, source: str = "jina_embedding", input_tokens: int = 0
    ) -> dict:
        """Charge for one Jina embedding operation: a base fee plus token cost.

        Price comes from the admin-configurable ``jina_call_cost_usd`` setting via
        ``ai_tokens.get_jina_call_cost_usd``. Do not re-introduce a local key
        lookup here: the previous version read a ``research_paper_jina_cost_usd``
        key that is seeded nowhere, so it always fell back to a hardcoded 0.005
        and ignored whatever the admin had configured.

        SCHOLARDOCX-0204 (L8): the charge used to be that base fee alone,
        regardless of size. Jina bills per token, so a 60-page paper split into
        dozens of batches recovered the same $0.002 as a one-page abstract and
        the operator absorbed the difference. The fee now has two parts:

        - ``jina_call_cost_usd`` — the per-operation base, unchanged in meaning,
          still one per user-visible operation.
        - a token component priced from the existing ``ai_models`` row for
          ``jina-embeddings-v4`` ($0.02/1M input by default), which was seeded
          as a "pricing reference" and previously drove nothing.

        Still exactly **one** charge per operation — the SCHOLARDOCX-0180
        single-charge invariant is preserved. Both knobs stay admin-editable.
        """
        base_cost = ai_tokens.get_jina_call_cost_usd(self.db)
        token_cost, _ = ai_tokens.compute_cost(
            EMBEDDING_MODEL, int(input_tokens or 0), 0, self.db, provider="jina"
        )
        return ai_tokens.charge_flat_fee(
            user=self.user,
            session=self.db,
            cost_usd=base_cost + token_cost,
            source=source,
        )

    async def _generate_embeddings(
        self,
        text_chunks: list[str],
        *,
        charge_source: Optional[str] = "jina_embedding",
        task: str = EMBEDDING_TASK_PASSAGE,
    ) -> tuple[list[list[float]], int]:
        """Generate 1024-dim float embeddings exclusively via Jina AI API (jina-embeddings-v4).

        Per strict requirement: NO fallback. If Jina API fails or key is missing,
        raise an explicit error detailing the failure.

        Uses 1024 dimensions (configurable in Jina v4) to stay under pgvector's 2000-dim limit
        for HNSW and IVFFlat indexes.

        Billing: this is the ONLY place a Jina fee is raised, and it raises at
        most one — labelled ``charge_source``, only after every batch succeeded.
        So a 20-batch paper costs one fee and a failed run costs nothing. Pass
        ``charge_source=None`` when a caller owns the charge, so one user-visible
        operation is never billed by two layers (SCHOLARDOCX-0180).
        """
        api_key = self.settings.jina_api_key
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="JINA_API_KEY is not configured in the environment (.env). Cannot generate paper embeddings.",
            )

        url = self.settings.jina_base_url
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        batch_size = 16
        all_embeddings: list[list[float]] = []
        total_input_tokens = sum(len(c) // 4 for c in text_chunks)

        async with httpx.AsyncClient(timeout=90.0) as client:
            for i in range(0, len(text_chunks), batch_size):
                batch = text_chunks[i : i + batch_size]
                input_payload = [{"text": chunk} for chunk in batch]
                payload = {
                    "model": EMBEDDING_MODEL,
                    # Passages and questions use *different* tasks. Do not
                    # hardcode one here again: the caller knows which side of
                    # the search it is on, and getting it wrong silently
                    # degrades every result rather than raising.
                    "task": task,
                    "dimensions": EMBEDDING_DIMENSIONS,  # 1024 dims (under pgvector's 2000 limit)
                    "input": input_payload,
                }

                try:
                    resp = await client.post(url, json=payload, headers=headers)
                except Exception as exc:
                    logger.error("Jina AI connection error: %s", exc)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed connecting to Jina AI Embeddings API: {str(exc)}",
                    ) from exc

                if resp.status_code != 200:
                    logger.error("Jina AI API error %s: %s", resp.status_code, resp.text)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Jina AI Embedding API Error ({resp.status_code}): {resp.text}",
                    )

                data = resp.json()
                items = data.get("data", [])
                for item in items:
                    vec = item.get("embedding", [])
                    if len(vec) != EMBEDDING_DIMENSIONS:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Invalid embedding dimension returned by Jina AI (expected {EMBEDDING_DIMENSIONS}, got {len(vec)}).",
                        )
                    all_embeddings.append(vec)

        if len(all_embeddings) != len(text_chunks):
            raise HTTPException(
                status_code=500,
                detail=f"Jina AI returned incomplete embeddings ({len(all_embeddings)} / {len(text_chunks)}).",
            )

        if charge_source:
            # One charge for the whole operation, sized by the tokens every
            # batch consumed (SCHOLARDOCX-0204 L8).
            self._charge_jina_embedding(
                source=charge_source, input_tokens=total_input_tokens
            )
        return all_embeddings, total_input_tokens

    async def _generate_single_embedding(
        self,
        query_text: str,
        task: str = EMBEDDING_TASK_QUERY,
    ) -> list[float]:
        """Generate a single 1024-dim embedding for an analysis query string.

        `task` must match the task the target paper's passages were indexed
        with — see `QUERY_TASK_FOR_PASSAGE_TASK`. Comparing across tasks does
        not fail loudly; it just returns numbers that mean nothing.

        Charging is delegated to ``_generate_embeddings`` via ``charge_source``;
        adding a charge here too is what double-billed every question before
        SCHOLARDOCX-0180.
        """
        embeddings, _ = await self._generate_embeddings(
            [query_text], charge_source="jina_embedding_query", task=task
        )
        if not embeddings:
            raise HTTPException(status_code=500, detail="Failed to generate embedding for query.")
        return embeddings[0]

    # ------------------------------------------------------------------ Vector Similarity Search
