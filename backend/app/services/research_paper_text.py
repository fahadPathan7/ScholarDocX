"""Pure PDF/text utilities for the Research Expert service (SCHOLARDOCX-0221 split).
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
    DEFAULT_CHUNK_SIZE_CHARS,
    DEFAULT_CHUNK_OVERLAP_CHARS,
)

logger = logging.getLogger(__name__)


class PaperTextMixin:
    def _clean_pdf_text(self, raw_text: str) -> str:
        """Clean and normalize extracted PDF text, repairing broken vertical line wrap artifacts."""
        if not raw_text:
            return ""

        lines = raw_text.split("\n")
        cleaned_lines: list[str] = []
        fragment_buffer: list[str] = []

        def flush_buffer():
            nonlocal fragment_buffer
            if not fragment_buffer:
                return
            # Rejoin vertically-wrapped multi-character fragments (real words that a
            # narrow column split across lines) with spaces. We deliberately do NOT
            # collapse the spaces between them: aggressively gluing single glyphs
            # together (e.g. "p a u b t a" -> "paubta") fabricates nonsense words out
            # of maths/equation layouts and makes the output look garbled. Preserving
            # spacing keeps the text honest and readable.
            if len(fragment_buffer) >= 2:
                cleaned_lines.append(" ".join(fragment_buffer))
            else:
                cleaned_lines.extend(fragment_buffer)
            fragment_buffer = []

        for line in lines:
            stripped = line.strip()
            # Detect a short wrapped word fragment (2-3 chars). Single characters are
            # usually maths variables/glyphs and are left on their own line rather
            # than merged into fake words.
            if 2 <= len(stripped) <= 3 and not re.match(r"^(\d+\.|\*|-|•|#+|---|\(\d+\))$", stripped):
                fragment_buffer.append(stripped)
            else:
                flush_buffer()
                cleaned_lines.append(line)

        flush_buffer()
        result = "\n".join(cleaned_lines)
        result = re.sub(r"[ \t]+", " ", result)
        result = re.sub(r"\n{3,}", "\n\n", result)
        return result

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> tuple[str, Optional[str]]:
        """Extract plain text from PDF bytes using pdfplumber."""
        import pdfplumber

        extracted_pages = []
        authors = None

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            # Extract basic PDF metadata if present
            meta = pdf.metadata or {}
            if meta.get("Author"):
                authors = str(meta.get("Author")).strip()

            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    cleaned_page = self._clean_pdf_text(page_text.strip())
                    extracted_pages.append(f"--- Page {i + 1} ---\n{cleaned_page}")

        full_text = "\n\n".join(extracted_pages)
        return full_text, authors

    def _extract_clean_header_text(self, pdf_bytes: bytes, max_pages: int = 2) -> str:
        """Extract the first page(s) with superscript markers stripped.

        Affiliation markers (superscript ``a``, ``b``, ``c``, ``1`` …) are set in a
        smaller font and get glued onto surnames by plain-text extraction — e.g.
        ``Das`` + superscript ``a`` becomes ``Dasa``, which the metadata parser then
        reports as the author's name. We drop *isolated* small-font single glyphs
        (a small glyph whose neighbours are normal-sized) before rebuilding the
        text, so superscript markers disappear while genuine small-font runs (a
        small DOI, a year) are preserved. Scoped to the header only; the main
        content text used for chunking/embeddings is left untouched.

        Returns an empty string on any failure so callers can fall back to the
        plain extracted text.
        """
        import pdfplumber

        try:
            from pdfplumber.utils import extract_text as _chars_to_text
        except Exception:  # pragma: no cover - pdfplumber layout may vary
            return ""

        parts: list[str] = []
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages[:max_pages]:
                    chars = page.chars
                    fallback = (page.extract_text() or "").strip()
                    if not chars:
                        if fallback:
                            parts.append(fallback)
                        continue

                    sizes = sorted((c.get("size") or 0) for c in chars)
                    median = sizes[len(sizes) // 2] if sizes else 0
                    if median <= 0:
                        if fallback:
                            parts.append(fallback)
                        continue

                    threshold = median * 0.8
                    small = [(c.get("size") or median) < threshold for c in chars]

                    drop: set[int] = set()
                    for i, c in enumerate(chars):
                        ch = c.get("text") or ""
                        if not (len(ch) == 1 and ch.isalnum() and small[i]):
                            continue
                        prev_small = small[i - 1] if i > 0 else False
                        next_small = small[i + 1] if i < len(chars) - 1 else False
                        # Keep glyphs that are part of a small-font run (DOI, year);
                        # drop only truly isolated small glyphs (superscript markers).
                        if prev_small or next_small:
                            continue
                        drop.add(i)

                    if not drop:
                        if fallback:
                            parts.append(fallback)
                        continue

                    kept = [c for idx, c in enumerate(chars) if idx not in drop]
                    cleaned = (_chars_to_text(kept) or "").strip()
                    # Guard against over-filtering — fall back if too much was lost.
                    chosen = cleaned if cleaned and len(cleaned) >= len(fallback) * 0.6 else fallback
                    if chosen:
                        parts.append(chosen)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Header superscript cleaning failed: %s", exc)
            return ""

        return "\n\n".join(parts)

    def _chunk_text(
        self,
        text_content: str,
        chunk_size: int = DEFAULT_CHUNK_SIZE_CHARS,
        overlap: int = DEFAULT_CHUNK_OVERLAP_CHARS,
    ) -> list[str]:
        """Split document text into overlapping semantic chunks.

        Each chunk is stamped with the page it starts on (``--- Page N ---``) when
        it does not already begin inside that page's marker. With smaller chunks a
        chunk can otherwise fall entirely between two page markers, which would
        leave it with no page number and break the "View in PDF" jump/highlight.
        """
        text_content = re.sub(r"\n{3,}", "\n\n", text_content).strip()
        if not text_content:
            return []

        # Record the (offset -> page number) of every page marker so we can resolve
        # the active page for any chunk start position.
        page_markers = [
            (m.start(), int(m.group(1)))
            for m in re.finditer(r"---\s*Page\s+(\d+)\s*---", text_content)
        ]

        def active_page_at(offset: int) -> Optional[int]:
            page = None
            for pos, num in page_markers:
                if pos <= offset:
                    page = num
                else:
                    break
            return page

        def stamp(chunk: str, start_offset: int) -> str:
            # If the chunk already carries a page marker, leave it as-is.
            if re.search(r"---\s*Page\s+\d+\s*---", chunk[:40]):
                return chunk
            page = active_page_at(start_offset)
            if page is not None:
                return f"--- Page {page} ---\n{chunk}"
            return chunk

        chunks: list[str] = []
        start = 0
        text_len = len(text_content)

        while start < text_len:
            end = start + chunk_size
            if end >= text_len:
                chunk = text_content[start:].strip()
                if chunk:
                    chunks.append(stamp(chunk, start))
                break

            # Try to break at a paragraph boundary or sentence boundary
            break_pos = text_content.rfind("\n\n", start + chunk_size // 2, end)
            if break_pos == -1:
                break_pos = text_content.rfind(". ", start + chunk_size // 2, end)
                if break_pos != -1:
                    break_pos += 1  # include the period

            if break_pos == -1 or break_pos <= start:
                break_pos = end

            chunk = text_content[start:break_pos].strip()
            if chunk:
                chunks.append(stamp(chunk, start))

            start = break_pos - overlap if break_pos - overlap > start else break_pos

        return chunks

    def _extract_page_numbers(self, chunk_text: str) -> list[int]:
        """Extract page numbers from '--- Page N ---' markers in chunk text."""
        import re
        page_markers = re.findall(r"---\s*Page\s+(\d+)\s*---", chunk_text, re.IGNORECASE)
        return sorted(list(set(int(p) for p in page_markers))) if page_markers else []

    # ------------------------------------------------------------------ Paper Analysis
