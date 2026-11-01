"""Research Expert Service (SCHOLARDOCX-0174).

Manages research paper uploads, PDF text extraction via pdfplumber,
semantic chunking, embedding generation via Jina AI jina-embeddings-v4 (2048 dims),
pgvector cosine similarity search, paper CRUD, and AI-assisted paper analysis.
"""

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
    EMBEDDING_TASK_LEGACY,
    QUERY_TASK_FOR_PASSAGE_TASK,
    DEFAULT_CHUNK_SIZE_CHARS,
    DEFAULT_CHUNK_OVERLAP_CHARS,
    TOP_K_CHUNKS,
    MAX_SAVED_ANALYSES_PER_PAPER,
    ANALYSIS_MODEL_CASCADE,
    ANALYSIS_QUERY_EMBEDDING_MAX_TOKENS,
    ANALYSIS_SYSTEM_TOKENS,
    ANALYSIS_PER_SECTION_OVERHEAD_TOKENS,
    ANALYSIS_PROMPT_TOKENS,
    ANALYSIS_MAX_OUTPUT_TOKENS,
    PREDEFINED_PROMPTS,
)
from app.services.research_paper_text import PaperTextMixin
from app.services.research_paper_processing import PaperProcessingMixin
from app.services.research_paper_estimates import CostEstimateMixin
from app.services.research_paper_analyses import SavedAnalysesMixin


class ResearchPaperService(
    PaperTextMixin,
    PaperProcessingMixin,
    CostEstimateMixin,
    SavedAnalysesMixin,
):
    def __init__(self, settings: Settings, db: Session, user: dict) -> None:
        self.settings = settings
        self.db = db
        self.user = user

    # ------------------------------------------------------------------ Access Guards
    def require_access(self) -> None:
        """Gate feature behind `can_use_research_reader` (Pro/Max tier requirement)."""
        try:
            check_and_increment_limit(self.user, "can_use_research_reader", 0, self.db)
        except UsageLimitExceeded:
            phrase = feature_plan_phrase("can_use_research_reader", self.db)
            raise HTTPException(
                status_code=403,
                detail=f"Research Expert requires {phrase}. Please upgrade your account to access paper analysis.",
            )

    def check_upload_quota(self) -> None:
        """Check user's monthly upload quota (`research_papers_per_month`)."""
        check_and_increment_limit(self.user, "research_papers_per_month", 0, self.db)

    def get_library_limit(self) -> int:
        """Get active maximum concurrent paper library limit."""
        row = self.db.execute(
            text("SELECT value FROM app_settings WHERE key = 'max_research_papers_library'")
        ).mappings().fetchone()

        if row and row.get("value") and str(row["value"]).isdigit():
            return int(row["value"])

        from app.auth.limits import get_user_limit
        role_limit = get_user_limit(self.user, "max_research_papers_library", self.db)
        return role_limit if role_limit > 0 else 20

    def check_library_capacity(self) -> None:
        """Check if user has reached the maximum stored papers limit."""
        limit_val = self.get_library_limit()
        existing_count = (
            self.db.query(ResearchPapers)
            .filter(ResearchPapers.user_id == self.user["id"])
            .count()
        )
        if limit_val > 0 and existing_count >= limit_val:
            raise HTTPException(
                status_code=400,
                detail=f"Research Expert library limit reached ({existing_count}/{limit_val} papers). Please delete an existing paper to upload a new one.",
            )

    # ------------------------------------------------------------------ Upload & Processing
    async def _extract_paper_metadata(self, first_pages_text: str, filename: str) -> dict[str, Any]:
        """Extract title, authors, journal/conf, year, volume/pages, and doi via LLM & regex heuristics."""
        import json, re

        clean_filename_title = Path(filename).stem.replace("_", " ").replace("-", " ").title()
        metadata: dict[str, Any] = {
            "title": clean_filename_title,
            "authors": None,
            "journal_conference": None,
            "publication_year": None,
            "volume_issue_pages": None,
            "doi": None,
        }

        if not first_pages_text.strip():
            return metadata

        # Use AI service to extract structured metadata JSON from Page 1 & 2
        try:
            sample_text = first_pages_text[:3500]
            prompt = (
                "Extract academic publication metadata from the following text of a research paper's first pages.\n"
                "Return ONLY a raw JSON object with these exact keys:\n"
                "{\n"
                '  "title": "Exact Title of the Paper",\n'
                '  "authors": "Author 1, Author 2, Author 3, Author 4",\n'
                '  "journal_conference": "Journal or Conference Name (or null if not found)",\n'
                '  "publication_year": "4-digit year e.g. 2024 (or null)",\n'
                '  "volume_issue_pages": "Volume, Issue, Pages info e.g. Vol. 12, pp. 4501-4512 (or null)",\n'
                '  "doi": "DOI identifier e.g. 10.1109/ACCESS.2024.12345 (or null)"\n'
                "}\n\n"
                "CRITICAL INSTRUCTIONS for authors field:\n"
                "- Extract COMPLETE FULL NAMES including all initials, first names, middle names, and surnames\n"
                "- Example: 'M.F. Mridha' NOT 'M.F.' - always include the surname\n"
                "- Separate each author name with a comma and space: ', '\n"
                "- Do not include affiliation markers (superscript a, b, c, 1, 2, *, †, etc.) after names\n"
                "- Preserve full names exactly as they appear: 'John Smith, Jane Doe, Robert Johnson'\n"
                "- If a name has initials (like M.F.), make sure to include the full surname after it\n\n"
                f"Paper Header Text:\n{sample_text}"
            )
            ai_service = AiService(self.settings, user=self.user, session=self.db)
            res = await ai_service.chat(
                message=prompt,
                context="",
                override_system_prompt="You are an academic research metadata parser. Output strictly raw JSON, no markdown backticks.",
                request_label="extract_paper_metadata",
            )
            answer_text = res.get("answer", "").strip()
            answer_text = re.sub(r"^```json\s*", "", answer_text, flags=re.IGNORECASE)
            answer_text = re.sub(r"```$", "", answer_text).strip()

            parsed = json.loads(answer_text)
            if isinstance(parsed, dict):
                if parsed.get("title") and len(str(parsed["title"]).strip()) > 3:
                    metadata["title"] = str(parsed["title"]).strip()
                if parsed.get("authors"):
                    if isinstance(parsed["authors"], list):
                        authors_str = ", ".join(str(a).strip() for a in parsed["authors"] if a)
                    elif isinstance(parsed["authors"], str):
                        authors_str = parsed["authors"].strip()
                    else:
                        authors_str = ""
                    
                    # Clean up affiliation markers (a, b, c, 1, 2, 3, *, †, etc.)
                    # These appear after author names in academic papers as superscripts
                    # Strategy: Be very conservative - only remove obvious single-letter/number markers
                    # that are clearly separated, not part of actual names
                    
                    # Remove symbol markers: *, †, ‡, §, ¶ (these are never part of names)
                    authors_str = re.sub(r'\s*[*†‡§¶]+', '', authors_str)
                    
                    # Remove standalone single letters that appear after commas or spaces
                    # Pattern: ", a," or ", a " but NOT "Da Silva" or "M.F. Mridha"
                    # Only match single letters that are: (comma)(space)(letter)(comma/space)
                    authors_str = re.sub(r',\s+([a-z])\s*,', ', ', authors_str, flags=re.IGNORECASE)
                    authors_str = re.sub(r',\s+([a-z])\s+', ', ', authors_str, flags=re.IGNORECASE)
                    
                    # Remove trailing single letters at the very end: "Name a" -> "Name" (but not "Name Ma")
                    # Only if it's a single isolated letter
                    authors_str = re.sub(r',\s+([a-z])\s*$', '', authors_str, flags=re.IGNORECASE)
                    
                    # Remove numeric superscripts: "Name 1,2" or "Name 1" at end
                    authors_str = re.sub(r'\s*\d+(?:\s*,\s*\d+)*(?=\s*,|\s*$)', '', authors_str)
                    
                    # Clean up extra spaces and commas
                    authors_str = re.sub(r'\s+', ' ', authors_str)
                    authors_str = re.sub(r',\s*,+', ',', authors_str)
                    authors_str = authors_str.strip(', ')
                    
                    metadata["authors"] = authors_str
                if parsed.get("journal_conference"):
                    metadata["journal_conference"] = str(parsed["journal_conference"]).strip()
                if parsed.get("publication_year"):
                    metadata["publication_year"] = str(parsed["publication_year"]).strip()
                if parsed.get("volume_issue_pages"):
                    metadata["volume_issue_pages"] = str(parsed["volume_issue_pages"]).strip()
                if parsed.get("doi"):
                    metadata["doi"] = str(parsed["doi"]).strip()
        except Exception as exc:
            logger.warning("AI metadata extraction note: %s", exc)

        # Heuristic fallback for publication year if null
        if not metadata["publication_year"]:
            year_match = re.search(r"\b(19\d\d|20[0-2]\d)\b", first_pages_text[:1500])
            if year_match:
                metadata["publication_year"] = year_match.group(1)

        return metadata

    # ------------------------------------------------------------------ Text Extraction & Chunking
    async def search_relevant_chunks(
        self,
        paper_id: str,
        query: str,
        top_k: int = TOP_K_CHUNKS,
        inventory_out: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """Search top-k most relevant paper chunks using pgvector cosine distance,
        with reference-filtering and structural section boosting.

        `inventory_out`, when supplied, receives the document-wide count for an
        aggregate question ("how many figures are in this paper?"). Those
        questions are about the whole document, so no retrieved subset can
        answer them and the caller needs the scan, not just the passages.
        """
        # Embed the question with the task that matches how THIS paper's
        # passages were indexed. Papers indexed before SCHOLARDOCX-0193 hold
        # `text-matching` vectors; pairing them with a `retrieval.query` vector
        # would not error, it would just return numbers that mean nothing.
        passage_task = (
            self.db.query(ResearchPapers.embedding_task)
            .filter(ResearchPapers.id == paper_id)
            .scalar()
            or EMBEDDING_TASK_LEGACY
        )
        query_vector = await self._generate_single_embedding(
            query,
            task=QUERY_TASK_FOR_PASSAGE_TASK.get(passage_task, EMBEDDING_TASK_LEGACY),
        )

        # Retrieve candidate chunks (fetch 3x top_k to allow filtering & section boosting)
        fetch_limit = max(top_k * 3, 24)
        query_sql = text(
            "SELECT id, chunk_index, chunk_text, token_count, "
            "1 - (embedding <=> CAST(:vec AS vector)) AS similarity "
            "FROM research_paper_chunks "
            "WHERE paper_id = :pid AND embedding IS NOT NULL "
            "ORDER BY embedding <=> CAST(:vec AS vector) ASC "
            "LIMIT :limit"
        )
        candidates = self.db.execute(
            query_sql,
            {
                "pid": paper_id,
                "vec": str(query_vector),
                "limit": fetch_limit,
            },
        ).mappings().fetchall()

        if not candidates:
            return []

        wants_references = wants_reference_section(query)

        content_chunks: list[dict[str, Any]] = []
        ref_chunks: list[dict[str, Any]] = []

        for r in candidates:
            chunk_dict = {
                "chunk_id": r["id"],
                "chunk_index": r["chunk_index"],
                "chunk_text": r["chunk_text"],
                "token_count": r["token_count"],
                "similarity_score": round(float(r["similarity"]), 4) if r["similarity"] is not None else 0.0,
                "page_numbers": self._extract_page_numbers(r["chunk_text"]),
            }
            if is_reference_chunk(r["chunk_text"]):
                ref_chunks.append(chunk_dict)
            else:
                content_chunks.append(chunk_dict)

        final_chunks: list[dict[str, Any]] = []
        boosted_chunk_ids: set[str] = set()

        # SCHOLARDOCX-0192: a question about references gets the *whole*
        # bibliography, pulled by structure rather than by similarity.
        #
        # Two reasons the previous approach could not work. First, the block
        # that appended reference chunks was gated on `len(final_chunks) <
        # top_k`, and the content-fill loop above always reaches top_k when the
        # candidate pool is larger than it — which it always is — so that block
        # never ran. Second, even when it did, the similarity trim at the end
        # dropped reference chunks anyway: a bibliography entry is semantically
        # bland, so it scores far below prose against any natural-language
        # question. "How many papers were cited here?" therefore got answered
        # from three scattered body paragraphs that happened to contain [34],
        # [31] and [48], and the answer could only say "at least 48".
        #
        # A reference list is identifiable by pattern, so it does not need the
        # vector index at all.
        inventory_target = detect_inventory_target(query)
        reserved_refs: list[dict[str, Any]] = []
        if wants_references or inventory_target:
            all_rows = self.db.execute(
                text(
                    "SELECT id, chunk_index, chunk_text, token_count, "
                    "1 - (embedding <=> CAST(:vec AS vector)) AS similarity "
                    "FROM research_paper_chunks "
                    "WHERE paper_id = :pid ORDER BY chunk_index ASC"
                ),
                {"pid": paper_id, "vec": str(query_vector)},
            ).mappings().fetchall()

            # Count the numbered series across the WHOLE paper. An aggregate
            # question cannot be answered from a sample, however good the
            # sample is — every previous answer to one hedged ("at least 4 …
            # the true total cannot be determined") because the model was only
            # ever shown part of the numbering.
            if inventory_target and inventory_out is not None:
                inventory_out.update(
                    scan_inventory(
                        [(row["chunk_index"], row["chunk_text"]) for row in all_rows],
                        inventory_target,
                    )
                )

            ref_budget = reference_budget(top_k)
            # For a non-reference inventory (figures, tables …) put the passages
            # carrying the most of that numbering in front of the model, so the
            # computed count is visibly corroborated rather than asserted.
            if inventory_target and inventory_target != "reference":
                ranked_ids = (inventory_out or {}).get("evidence_ids", [])[:ref_budget]
                wanted = {index: rank for rank, index in enumerate(ranked_ids)}
                for row in all_rows:
                    if row["chunk_index"] not in wanted:
                        continue
                    reserved_refs.append(
                        {
                            "chunk_id": row["id"],
                            "chunk_index": row["chunk_index"],
                            "chunk_text": row["chunk_text"],
                            "token_count": row["token_count"],
                            "similarity_score": (
                                round(float(row["similarity"]), 4)
                                if row["similarity"] is not None
                                else 0.0
                            ),
                            "page_numbers": self._extract_page_numbers(row["chunk_text"]),
                            "retrieval": "reference_section",
                        }
                    )
                for item in reserved_refs:
                    final_chunks.append(item)
                    boosted_chunk_ids.add(item["chunk_id"])
                reserved_refs = []
                all_rows = []

            for row in all_rows:
                if not is_reference_chunk(row["chunk_text"]):
                    continue
                reserved_refs.append(
                    {
                        "chunk_id": row["id"],
                        "chunk_index": row["chunk_index"],
                        "chunk_text": row["chunk_text"],
                        "token_count": row["token_count"],
                        # The REAL measured similarity, which for a bibliography
                        # is genuinely low — that is the whole point, and it is
                        # why these have to be protected from the trim by a flag
                        # instead of by a score. Writing a flattering number here
                        # would repeat the fabricated "Relevance: 85%" badge this
                        # function was already fixed for once.
                        "similarity_score": (
                            round(float(row["similarity"]), 4)
                            if row["similarity"] is not None
                            else 0.0
                        ),
                        "page_numbers": self._extract_page_numbers(row["chunk_text"]),
                        "retrieval": "reference_section",
                    }
                )
                if len(reserved_refs) >= ref_budget:
                    break
            for item in reserved_refs:
                final_chunks.append(item)
                boosted_chunk_ids.add(item["chunk_id"])

        # Section topic keywords check — ensure target section chunks are included
        section_terms = section_terms_for(query)

        if section_terms:
            # Guarantee the named section is considered, but rank keyword hits by
            # real cosine distance and report their true similarity. Ordering by
            # chunk_index (as before) picked the earliest mention — a methodology
            # query got the intro's passing reference, not the methods section.
            # And the old fixed 0.85 meant the "Relevance: 85%" badge the UI shows
            # beside each citation was fabricated rather than measured.
            keyword_clauses = " OR ".join([f"chunk_text ILIKE :kw_{i}" for i in range(len(section_terms))])
            params: dict[str, Any] = {"pid": paper_id, "vec": str(query_vector)}
            for i, term in enumerate(section_terms):
                params[f"kw_{i}"] = f"%{term}%"

            matched_rows = self.db.execute(
                text(
                    f"SELECT id, chunk_index, chunk_text, token_count, "
                    f"1 - (embedding <=> CAST(:vec AS vector)) AS similarity "
                    f"FROM research_paper_chunks "
                    f"WHERE paper_id = :pid AND embedding IS NOT NULL AND ({keyword_clauses}) "
                    f"ORDER BY embedding <=> CAST(:vec AS vector) ASC LIMIT 4"
                ),
                params,
            ).mappings().fetchall()

            for mr in matched_rows:
                if not is_reference_chunk(mr["chunk_text"]):
                    b_dict = {
                        "chunk_id": mr["id"],
                        "chunk_index": mr["chunk_index"],
                        "chunk_text": mr["chunk_text"],
                        "token_count": mr["token_count"],
                        "similarity_score": (
                            round(float(mr["similarity"]), 4)
                            if mr["similarity"] is not None
                            else 0.0
                        ),
                        "page_numbers": self._extract_page_numbers(mr["chunk_text"]),
                    }
                    final_chunks.append(b_dict)
                    boosted_chunk_ids.add(mr["id"])

        # Fill remaining slots with top vector similarity content chunks
        for c in content_chunks:
            if c["chunk_id"] not in boosted_chunk_ids:
                final_chunks.append(c)
                if len(final_chunks) >= top_k:
                    break

        # Append reference chunk if requested or if slots remain
        if len(final_chunks) < top_k and ref_chunks:
            for rc in ref_chunks:
                if rc["chunk_id"] not in boosted_chunk_ids:
                    final_chunks.append(rc)
                    if len(final_chunks) >= top_k or not wants_references:
                        break

        return apply_retrieval_budget(final_chunks, top_k, query)

    async def analyze_paper(
        self,
        paper_id: str,
        prompt: str,
        top_k: int = TOP_K_CHUNKS,
    ) -> dict[str, Any]:
        """Perform AI analysis on a research paper using vector search + LLM chat."""
        self.require_access()

        paper = self.get_paper(paper_id)
        if paper["status"] != "ready":
            raise HTTPException(
                status_code=400,
                detail=f"Paper is currently in '{paper['status']}' state and cannot be analyzed.",
            )

        # SCHOLARDOCX-0218: pre-flight against the worst case for THIS paper —
        # the query embedding plus the analysis call priced over its top_k
        # largest sections — instead of a min-1 check. A user with ~1 credit
        # used to pass here, pay the embedding fee, then fail the analysis
        # charge: money spent, no answer.
        cost_estimate = self.estimate_analysis_cost(paper_id, top_k=top_k)
        try:
            ai_tokens.ensure_can_spend(
                self.user, self.db, min_tokens=cost_estimate["max_credits"]
            )
        except ai_tokens.OutOfTokens:
            # OutOfTokens (already HTTP 402) with plain copy, so the caller
            # sees the same exception type this path always raised.
            raise ai_tokens.OutOfTokens(
                "Not enough credits to analyze this paper. Purchase an AI "
                "Extra Credit pack or wait for your monthly allowance to "
                "reset."
            )

        # Retrieve relevant chunks via pgvector search
        inventory: dict[str, Any] = {}
        chunks: list[dict[str, Any]] = await self.search_relevant_chunks(
            paper_id, prompt, top_k=top_k, inventory_out=inventory
        )

        # Note: the query embedding above IS charged, as "jina_embedding_query"
        # (see _generate_single_embedding). This comment previously claimed it
        # was unbilled infrastructure cost, which was wrong and is exactly the
        # kind of note that talks a later reader out of billing something.

        if not chunks:
            # Vector search matched nothing (e.g. a paper indexed before
            # embeddings existed). Use the opening chunks so the user still gets
            # an answer, but report similarity 0.0: these were picked by position,
            # not relevance, and the UI shows this value as a "Relevance" badge.
            # The old 0.5 claimed the answer was half-grounded when nothing matched.
            initial_chunks = (
                self.db.query(ResearchPaperChunks)
                .filter(ResearchPaperChunks.paper_id == paper_id)
                .order_by(ResearchPaperChunks.chunk_index.asc())
                .limit(top_k)
                .all()
            )
            chunks = [
                {
                    "chunk_id": c.id,
                    "chunk_index": c.chunk_index,
                    "chunk_text": c.chunk_text,
                    "token_count": c.token_count,
                    "similarity_score": 0.0,
                    "page_numbers": self._extract_page_numbers(c.chunk_text),
                }
                for c in initial_chunks
            ]

        # Format context for AI
        context_blocks = [
            f"[Section Chunk #{c['chunk_index'] + 1} | Relevance: {c['similarity_score']:.2f}]\n{c['chunk_text']}"
            for c in chunks
        ]
        combined_context = f"Research Paper Title: {paper['title']}\n\nRelevant Paper Sections:\n" + "\n\n".join(context_blocks)

        # Aggregate questions get the answer computed for them. Without this the
        # model hedges by default — "at least 4 distinct figures … the true
        # total cannot be determined" — because from its side a retrieved
        # subset is genuinely all it can see.
        if inventory.get("target"):
            combined_context += "\n\n" + inventory_note(inventory)
        else:
            reference_sections = [
                c for c in chunks if c.get("retrieval") == "reference_section"
            ]
            if reference_sections:
                combined_context += (
                    "\n\nNOTE ON COVERAGE: the paper's reference list was retrieved in "
                    f"full ({len(reference_sections)} consecutive sections covering the "
                    "whole bibliography), not sampled. If the question asks how many "
                    "works are cited, count the numbered entries and answer directly."
                )

        system_instruction = (
            "You are Lumi, the Research Assistant for ScholarDocX. "
            "Analyze the supplied research paper sections and answer the user's question.\n\n"
            "STRICT FORMATTING RULES — follow exactly:\n"
            "1. Use ## and ### markdown headers to separate major sections.\n"
            "2. Use bullet lists (- item) for enumerations, key points, and feature lists.\n"
            "3. Use numbered lists (1. 2. 3.) for sequential steps or ranked items.\n"
            "4. Use a clean markdown table (| Col | Col |\\n|---|---|\\n| row | row |) ONLY when "
            "comparing 2+ things side-by-side — every row MUST start and end with |.\n"
            "5. NEVER mix pipe characters with bullet points in the same block.\n"
            "6. NEVER output raw pipe lines like '| Label | • bullet text' — use a proper table "
            "OR use a heading followed by a bullet list instead.\n"
            "7. Bold (**text**) key terms. Italicise (*text*) for emphasis.\n"
            "8. Cite sections inline with [Section #N] tags (use the section number shown "
            "in each block header).\n\n"
            "READABILITY RULES — the supplied sections are extracted from a PDF and may contain "
            "broken layout, jumbled columns, or scrambled maths/equations/pseudo-code:\n"
            "- NEVER copy raw equations, algorithm listings, or garbled/scrambled character "
            "sequences verbatim into your answer.\n"
            "- Instead, describe formulas and algorithms in clean plain English (e.g. 'F1-score is "
            "the harmonic mean of precision and recall') or, when precise, use simple inline maths "
            "like `F1 = 2 * (P * R) / (P + R)`.\n"
            "- If a passage is too corrupted to interpret confidently, silently skip it rather than "
            "reproducing the noise.\n"
            "- Write in clear, well-structured prose and short paragraphs. Do not dump long "
            "unbroken walls of text.\n\n"
            "CONTENT RULES:\n"
            "- Base analysis strictly on the supplied sections.\n"
            "- If sections lack enough information, state what is covered and what is missing."
        )

        ai_service = AiService(self.settings, user=self.user, session=self.db)

        # Research Expert model cascade (strict order), shared with the
        # cost estimator so the pre-flight prices the models this call runs:
        #   1. GLM-5.2 — primary model for high-quality academic analysis
        #   2. Groq compound — fallback if GLM is unavailable or errors
        #   3. 503 with a user-friendly message — never expose provider names
        response = None
        for model_arg, _model_label in ANALYSIS_MODEL_CASCADE:
            response = await ai_service.chat(
                message=prompt,
                context=combined_context,
                override_system_prompt=system_instruction,
                request_label="research_paper_analysis",
                model=model_arg,
            )
            if response.get("mode") not in ("provider-error", "local-fallback"):
                break  # successful response — stop cascade

        # Both models failed — surface a clean user-facing error
        if response is None or response.get("mode") in ("provider-error", "local-fallback"):
            raise HTTPException(
                status_code=503,
                detail="The analysis service is temporarily unavailable. Please try again in a few moments.",
            )

        usage = response.get("usage", {"input_tokens": 0, "output_tokens": 0})

        # Compute the actual credits charged for this analysis call so the
        # frontend can display an accurate number instead of raw model tokens.
        # compute_cost() uses the same pricing table and token-rate formula as
        # the billing system (charge()), so this is always consistent.
        model_id = response.get("model_id")
        _, charged_credits = ai_tokens.compute_cost(
            model_id,
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
            self.db,
            # Same provider the charge used, so the displayed figure resolves
            # through the same pricing path and cannot diverge from what was
            # actually deducted.
            provider=response.get("provider"),
        )

        # Which passages the answer actually cited, so the UI can lead with
        # those instead of listing everything that was searched.
        answer = response.get("answer", "No analysis could be generated.")
        cited_sections = cited_section_numbers(answer)
        sources = [
            {
                "chunk_id": c["chunk_id"],
                "chunk_index": c["chunk_index"],
                "similarity_score": c["similarity_score"],
                "relevance_label": c.get("relevance_label", "Match"),
                "lexical_overlap": c.get("lexical_overlap", 0.0),
                "cited_in_answer": (c["chunk_index"] + 1) in cited_sections,
                "snippet": c["chunk_text"][:200] + ("..." if len(c["chunk_text"]) > 200 else ""),
                "page_numbers": c.get("page_numbers", []),
                "full_text": c["chunk_text"],  # Include full chunk text for expandable view
            }
            for c in chunks
        ]

        return {
            "paper_id": paper_id,
            "prompt": prompt,
            "answer": answer,
            "sources": sources,
            "model_used": response.get("mode", "ai"),
            "usage": usage,
            "charged_credits": charged_credits,
        }

    # ------------------------------------------------------------------ CRUD Helper Methods
    def list_papers(self) -> list[dict[str, Any]]:
        """List all research papers uploaded by current user."""
        self.require_access()

        rows = (
            self.db.query(ResearchPapers)
            .filter(ResearchPapers.user_id == self.user["id"])
            .order_by(ResearchPapers.created_at.desc())
            .all()
        )

        papers = [
            {
                "id": r.id,
                "title": r.title,
                "authors": r.authors,
                "journal_conference": r.journal_conference,
                "publication_year": r.publication_year,
                "volume_issue_pages": r.volume_issue_pages,
                "doi": r.doi,
                "chunk_count": r.chunk_count,
                "status": r.status,
                # True while this paper is still indexed with the old symmetric
                # task. Search works, but not as well as it now can — the user
                # decides whether to spend a re-index on it (SCHOLARDOCX-0193).
                "search_upgrade_available": (
                    r.status == "ready" and r.embedding_task != EMBEDDING_TASK_PASSAGE
                ),
                "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                "updated_at": r.updated_at.isoformat() if hasattr(r.updated_at, "isoformat") else str(r.updated_at),
                "static_file_id": r.static_file_id,
            }
            for r in rows
        ]
        # SCHOLARDOCX-0218: per-paper worst-case analysis cost on the payload.
        return self.attach_analysis_cost_estimates(papers)

    def attach_analysis_cost_estimates(self, papers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Add `analysis_cost_estimate` ({max_credits}) to each paper payload
        (SCHOLARDOCX-0218). Batched: one window query for all papers plus
        shared pricing lookups, so the papers list stays N+1-free."""
        estimates = self._estimate_analysis_costs([str(p["id"]) for p in papers])
        for paper in papers:
            paper["analysis_cost_estimate"] = estimates.get(
                str(paper["id"]), {"max_credits": 1}
            )
        return papers

    def get_paper(self, paper_id: str) -> dict[str, Any]:
        """Fetch single paper by ID with ownership check."""
        self.require_access()

        paper = (
            self.db.query(ResearchPapers)
            .filter(ResearchPapers.id == paper_id, ResearchPapers.user_id == self.user["id"])
            .first()
        )
        if not paper:
            raise HTTPException(status_code=404, detail="Research paper not found.")

        return {
            "id": paper.id,
            "title": paper.title,
            "authors": paper.authors,
            "journal_conference": paper.journal_conference,
            "publication_year": paper.publication_year,
            "volume_issue_pages": paper.volume_issue_pages,
            "doi": paper.doi,
            "chunk_count": paper.chunk_count,
            "status": paper.status,
            "search_upgrade_available": (
                paper.status == "ready" and paper.embedding_task != EMBEDDING_TASK_PASSAGE
            ),
            "content_text": paper.content_text,
            "created_at": paper.created_at.isoformat() if hasattr(paper.created_at, "isoformat") else str(paper.created_at),
            "updated_at": paper.updated_at.isoformat() if hasattr(paper.updated_at, "isoformat") else str(paper.updated_at),
            "static_file_id": paper.static_file_id,
            # SCHOLARDOCX-0218: worst-case credits for one analysis of this
            # paper, so the frontend can show the ceiling before the user
            # spends anything.
            "analysis_cost_estimate": self.estimate_analysis_cost(paper_id),
        }

    def get_paper_details(self, paper_id: str) -> dict[str, Any]:
        """Get full paper details including chunk summaries."""
        paper = self.get_paper(paper_id)
        chunks = (
            self.db.query(ResearchPaperChunks)
            .filter(ResearchPaperChunks.paper_id == paper_id)
            .order_by(ResearchPaperChunks.chunk_index.asc())
            .all()
        )

        paper["chunks"] = [
            {
                "id": c.id,
                "chunk_index": c.chunk_index,
                "token_count": c.token_count,
                "snippet": c.chunk_text[:150] + ("..." if len(c.chunk_text) > 150 else ""),
            }
            for c in chunks
        ]
        return paper

    def get_paper_pdf_content(self, paper_id: str) -> tuple[bytes, str, str]:
        """Return the stored PDF bytes for a user-owned Research Expert paper."""
        self.require_access()

        paper_row = (
            self.db.query(ResearchPapers)
            .filter(ResearchPapers.id == paper_id, ResearchPapers.user_id == self.user["id"])
            .first()
        )
        if not paper_row or not paper_row.static_file_id:
            raise HTTPException(status_code=404, detail="Research paper file not found.")

        file_row = self.db.execute(
            text(
                "SELECT display_name, relative_path, mime_type "
                "FROM static_files "
                "WHERE id = :file_id AND user_id = :uid AND file_type = 'research_paper'"
            ),
            {"file_id": paper_row.static_file_id, "uid": self.user["id"]},
        ).mappings().fetchone()
        if not file_row or not file_row.get("relative_path"):
            raise HTTPException(status_code=404, detail="Research paper file not found.")

        from app.core.storage import download_bytes

        content, content_type = download_bytes(file_row["relative_path"])
        display_name = file_row.get("display_name") or f"{paper_row.title}.pdf"
        media_type = file_row.get("mime_type") or content_type or "application/pdf"
        return content, media_type, display_name

    # ------------------------------------------------------------------ Saved Analyses
    def delete_paper(self, paper_id: str) -> dict[str, str]:
        """Delete research paper, its chunks, and associated binary static_file."""
        self.require_access()

        paper = (
            self.db.query(ResearchPapers)
            .filter(ResearchPapers.id == paper_id, ResearchPapers.user_id == self.user["id"])
            .first()
        )
        if not paper:
            raise HTTPException(status_code=404, detail="Research paper not found.")

        # Clean up storage file if present
        if paper.static_file_id:
            row = self.db.execute(
                text("SELECT relative_path FROM static_files WHERE id = :sfid"),
                {"sfid": paper.static_file_id},
            ).mappings().fetchone()
            if row and row["relative_path"]:
                try:
                    delete_file(row["relative_path"])
                except Exception as exc:
                    logger.warning("Failed deleting storage file %s: %s", row["relative_path"], exc)

            self.db.execute(text("DELETE FROM static_files WHERE id = :sfid"), {"sfid": paper.static_file_id})

        self.db.delete(paper)
        self.db.commit()

        # Storage bytes only. `research_papers_per_month` is deliberately NOT
        # resynced: it counts uploads made this period, not papers currently held,
        # so recomputing it from a live COUNT(*) would let a user cycle
        # upload → delete → upload past the monthly quota. The real complaint —
        # a *failed* upload burning a slot — is fixed in
        # upload_and_process_paper(), which increments only on success.
        from app.auth.limits import resync_usage_counts
        resync_usage_counts(self.user["id"], self.db, ["total_documents_bytes"])

        return {"status": "deleted", "id": paper_id}
