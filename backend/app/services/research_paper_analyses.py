"""Saved-analysis CRUD for the Research Expert service (SCHOLARDOCX-0221 split).
Mechanically extracted from research_paper_service.py; method bodies are
byte-identical."""

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
    MAX_SAVED_ANALYSES_PER_PAPER,
)

logger = logging.getLogger(__name__)


class SavedAnalysesMixin:
    def _serialize_saved_analysis(self, rec: ResearchPaperAnalyses) -> dict[str, Any]:
        import json

        try:
            sources = json.loads(rec.sources_json) if rec.sources_json else []
        except (ValueError, TypeError):
            sources = []
        return {
            "id": rec.id,
            "paper_id": rec.paper_id,
            "prompt": rec.prompt,
            "answer": rec.answer,
            "sources": sources,
            "model_used": rec.model_used,
            "charged_credits": rec.charged_credits,
            "created_at": rec.created_at.isoformat() if hasattr(rec.created_at, "isoformat") else str(rec.created_at),
        }

    def list_saved_analyses(self, paper_id: str) -> dict[str, Any]:
        """List saved analysis outputs for a user-owned paper."""
        self.require_access()
        self.get_paper(paper_id)  # ownership check (raises 404 otherwise)

        rows = (
            self.db.query(ResearchPaperAnalyses)
            .filter(
                ResearchPaperAnalyses.paper_id == paper_id,
                ResearchPaperAnalyses.user_id == self.user["id"],
            )
            .order_by(ResearchPaperAnalyses.created_at.desc())
            .all()
        )
        return {
            "analyses": [self._serialize_saved_analysis(r) for r in rows],
            "max": MAX_SAVED_ANALYSES_PER_PAPER,
            "count": len(rows),
        }

    def save_analysis(
        self,
        paper_id: str,
        prompt: str,
        answer: str,
        sources: Optional[list[dict[str, Any]]] = None,
        model_used: Optional[str] = None,
        charged_credits: int = 0,
    ) -> dict[str, Any]:
        """Persist an analysis output, enforcing the per-paper save cap."""
        import json
        import uuid

        self.require_access()
        self.get_paper(paper_id)  # ownership check

        existing = (
            self.db.query(ResearchPaperAnalyses)
            .filter(
                ResearchPaperAnalyses.paper_id == paper_id,
                ResearchPaperAnalyses.user_id == self.user["id"],
            )
            .count()
        )
        if existing >= MAX_SAVED_ANALYSES_PER_PAPER:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Saved analysis limit reached ({existing}/{MAX_SAVED_ANALYSES_PER_PAPER}). "
                    "Please delete a saved analysis to save a new one."
                ),
            )

        if not answer or not answer.strip():
            raise HTTPException(status_code=400, detail="Cannot save an empty analysis.")

        rec = ResearchPaperAnalyses(
            id=str(uuid.uuid4()),
            paper_id=paper_id,
            user_id=self.user["id"],
            prompt=(prompt or "").strip()[:1000],
            answer=answer,
            sources_json=json.dumps(sources or []),
            model_used=model_used,
            charged_credits=int(charged_credits or 0),
        )
        self.db.add(rec)
        self.db.commit()
        return self._serialize_saved_analysis(rec)

    def delete_saved_analysis(self, paper_id: str, analysis_id: str) -> dict[str, str]:
        """Delete a saved analysis output owned by the current user."""
        self.require_access()

        rec = (
            self.db.query(ResearchPaperAnalyses)
            .filter(
                ResearchPaperAnalyses.id == analysis_id,
                ResearchPaperAnalyses.paper_id == paper_id,
                ResearchPaperAnalyses.user_id == self.user["id"],
            )
            .first()
        )
        if not rec:
            raise HTTPException(status_code=404, detail="Saved analysis not found.")

        self.db.delete(rec)
        self.db.commit()
        return {"status": "deleted", "id": analysis_id}

