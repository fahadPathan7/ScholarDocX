"""Worst-case analysis cost estimation for the Research Expert service
(SCHOLARDOCX-0218, split out in SCHOLARDOCX-0221). Mechanically extracted;
method bodies byte-identical."""

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
    TOP_K_CHUNKS,
    ANALYSIS_MODEL_CASCADE,
    ANALYSIS_QUERY_EMBEDDING_MAX_TOKENS,
    ANALYSIS_SYSTEM_TOKENS,
    ANALYSIS_PER_SECTION_OVERHEAD_TOKENS,
    ANALYSIS_PROMPT_TOKENS,
    ANALYSIS_MAX_OUTPUT_TOKENS,
)

logger = logging.getLogger(__name__)


class CostEstimateMixin:
    def _top_section_token_totals(self, paper_ids: list[str], top_k: int) -> dict[str, int]:
        """Worst-case retrieved-context size per paper: the `top_k` largest sections.

        Retrieval picks `top_k` sections, so the biggest possible context for a
        question is the paper's `top_k` largest sections by stored token_count
        (the same count the chunks table already keeps, computed at indexing
        time as chars/4). One window-function query for all papers at once so
        the papers list does not become N+1.
        """
        if not paper_ids:
            return {}
        from sqlalchemy import bindparam

        rows = self.db.execute(
            text(
                "SELECT paper_id, SUM(token_count) AS total FROM ("
                "  SELECT paper_id, token_count, ROW_NUMBER() OVER ("
                "    PARTITION BY paper_id ORDER BY token_count DESC, chunk_index ASC"
                "  ) AS rn FROM research_paper_chunks WHERE paper_id IN :ids"
                ") ranked WHERE rn <= :top_k GROUP BY paper_id"
            ).bindparams(bindparam("ids", expanding=True)),
            {"ids": list(paper_ids), "top_k": max(1, int(top_k))},
        ).mappings().fetchall()
        return {str(row["paper_id"]): int(row["total"] or 0) for row in rows}

    def _estimate_analysis_costs(
        self, paper_ids: list[str], top_k: int = TOP_K_CHUNKS
    ) -> dict[str, dict[str, Any]]:
        """Worst-case credit ceiling for one analyze run, per paper
        (SCHOLARDOCX-0218).

        Mirrors exactly what analyze_paper() bills: one Jina query-embedding
        operation (base fee + a token component over the prompt — same shape
        as `_charge_jina_embedding`) plus the analysis LLM call priced over
        the paper's worst-case retrieved context (its `top_k` largest
        sections by stored token_count). The analysis cascades over two
        models, so each paper is priced against whichever is more expensive —
        the ceiling must cover the one that actually serves the call.

        Pricing reads the same admin-configurable knobs the real charges use;
        nothing is written.
        """
        if not paper_ids:
            return {}
        section_totals = self._top_section_token_totals(paper_ids, top_k)
        token_rate = ai_tokens.get_token_rate(self.db)
        embedding_usd = ai_tokens.get_jina_call_cost_usd(self.db)
        embedding_usd += ai_tokens.compute_cost(
            EMBEDDING_MODEL,
            ANALYSIS_QUERY_EMBEDDING_MAX_TOKENS,
            0,
            self.db,
            provider="jina",
        )[0]
        fixed_input_tokens = (
            ANALYSIS_SYSTEM_TOKENS
            + ANALYSIS_PROMPT_TOKENS
            + ANALYSIS_PER_SECTION_OVERHEAD_TOKENS * max(1, int(top_k))
        )

        estimates: dict[str, dict[str, Any]] = {}
        for paper_id in paper_ids:
            section_tokens = int(section_totals.get(str(paper_id), 0))
            input_tokens = fixed_input_tokens + section_tokens
            analysis_usd = max(
                ai_tokens.compute_cost(
                    model_name,
                    input_tokens,
                    ANALYSIS_MAX_OUTPUT_TOKENS,
                    self.db,
                    provider=provider,
                )[0]
                for provider, model_name in (
                    (entry[0].split(":", 1)[0], entry[1])
                    for entry in ANALYSIS_MODEL_CASCADE
                )
            )
            max_credits = math.ceil((embedding_usd + analysis_usd) * token_rate)
            estimates[str(paper_id)] = {"max_credits": max(1, max_credits)}
        return estimates

    def estimate_analysis_cost(
        self, paper_id: str, top_k: int = TOP_K_CHUNKS
    ) -> dict[str, Any]:
        """`{"max_credits": <int>}` — worst-case credits to analyze this paper."""
        return self._estimate_analysis_costs([paper_id], top_k=top_k).get(
            str(paper_id), {"max_credits": 1}
        )

