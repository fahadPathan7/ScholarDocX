"""Research Expert Service (SCHOLARDOCX-0174).

Manages research paper uploads, PDF text extraction via pdfplumber,
semantic chunking, embedding generation via Jina AI jina-embeddings-v4 (2048 dims),
pgvector cosine similarity search, paper CRUD, and AI-assisted paper analysis.
"""

from __future__ import annotations

import io
import logging
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

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

EMBEDDING_MODEL = "jina-embeddings-v4"
EMBEDDING_DIMENSIONS = 1024  # Jina supports 1024 dims (under pgvector's 2000 limit)

# SCHOLARDOCX-0193: searching a paper is an *asymmetric* problem — a short
# question against a long passage — and Jina publishes a task pair for exactly
# that. Everything here previously used `text-matching`, the *symmetric* task,
# which is built for comparing two texts of similar kind (is sentence A like
# sentence B). Using it for retrieval flattens the score spread, which is what
# made every passage of a paper score within a few points of every other and
# made the relevance badge meaningless.
#
#   retrieval.passage — documents, at indexing time
#   retrieval.query   — the question, at search time
#   text-matching     — symmetric similarity (what this used to do, for both)
#
# See https://jina.ai/models/jina-embeddings-v4/ for the adapter descriptions.
EMBEDDING_TASK_PASSAGE = "retrieval.passage"
EMBEDDING_TASK_QUERY = "retrieval.query"
# What every paper indexed before this change used, for both sides.
EMBEDDING_TASK_LEGACY = "text-matching"

# A query embedded with one task CANNOT be compared against passages embedded
# with another — the adapters put them in different spaces, so the cosine
# figures would be meaningless rather than merely worse. Each paper therefore
# records the task its passages were indexed with, and the query is embedded to
# match. A legacy paper keeps working exactly as before until it is re-indexed.
QUERY_TASK_FOR_PASSAGE_TASK = {
    EMBEDDING_TASK_PASSAGE: EMBEDDING_TASK_QUERY,
    EMBEDDING_TASK_LEGACY: EMBEDDING_TASK_LEGACY,
}
# Smaller chunks => more focused sections, tighter similarity matches, and less
# unrelated/garbled math getting bundled into a single retrieved chunk.
DEFAULT_CHUNK_SIZE_CHARS = 1100
DEFAULT_CHUNK_OVERLAP_CHARS = 150
# Retrieve a few more chunks to compensate for the smaller chunk size so the
# model still sees enough surrounding context.
TOP_K_CHUNKS = 10
# Maximum saved analysis outputs a user may keep per paper.
MAX_SAVED_ANALYSES_PER_PAPER = 10

# Tuned for readers with domain background: prompts embrace technical terminology
# and prioritise depth. Ordered most incisive/analytical first. Kept in sync with
# the frontend PREDEFINED_RESEARCH_PROMPTS in frontend/src/lib/researchPrompts.ts.
PREDEFINED_PROMPTS = [
    {
        "id": "executive_summary",
        "title": "Executive Summary",
        "prompt": "Write a precise executive summary for a technical reader. Cover, in order: (1) the problem and why it matters, (2) the core technical approach or insight, (3) the headline quantitative results with numbers, and (4) the key takeaway and where this sits relative to prior work. Be concise and precise; assume domain familiarity and do not define basic terminology.",
        "icon": "FileText",
    },
    {
        "id": "contributions",
        "title": "Contributions & Novelty",
        "prompt": "Enumerate the paper's core technical contributions and articulate precisely what is novel relative to prior art. For each contribution, state the claim, the mechanism that makes it work, and the evidence supporting it. Separate genuine methodological or theoretical novelty from engineering and incremental empirical gains, and flag any contribution that is overstated relative to the evidence.",
        "icon": "Lightbulb",
    },
    {
        "id": "methodology",
        "title": "Methodology Analysis",
        "prompt": "Dissect the methodology in technical depth. Cover the full pipeline/architecture, the data (sources, scale, preprocessing, splits), the model or algorithm design and its components, the training/optimization setup and key hyperparameters, and the evaluation protocol and metrics. Surface the non-obvious design decisions and the assumptions they encode, and call out anything under-specified.",
        "icon": "Cpu",
    },
    {
        "id": "theoretical_foundations",
        "title": "Theoretical Foundations & Formulation",
        "prompt": "Lay out the formal foundations of the work. State the problem formulation and notation, the objective/loss functions, the key equations, and the assumptions they rely on. Explain the theoretical justification for why the method should work — guarantees, bounds, inductive biases, or complexity — and identify where the argument is heuristic rather than rigorous. Present core equations in clean inline math, never copied garbled PDF text.",
        "icon": "Sigma",
    },
    {
        "id": "key_findings",
        "title": "Key Findings & Results",
        "prompt": "Extract the key results with quantitative rigor. Report the main metrics and numbers, the deltas over baselines, and any ablations or notable regimes. Use a comparison table where it clarifies method-vs-baseline performance. State precisely what each result supports and whether the evidence actually justifies the paper's claims.",
        "icon": "CheckCircle2",
    },
    {
        "id": "benchmark_comparison",
        "title": "Benchmark & Baseline Comparison",
        "prompt": "Analyze how the method positions against prior state-of-the-art and baselines. Identify the benchmarks/datasets and metrics used, the baselines compared against, and the quantitative gains (absolute and relative). Critically assess whether the comparison is fair — matched settings, adequately tuned baselines, comparable compute/data — and whether the reported gains are statistically and practically significant rather than marginal.",
        "icon": "GitCompare",
    },
    {
        "id": "results_figures",
        "title": "Results & Figures Deep-Dive",
        "prompt": "Interpret the paper's principal figures, tables, and quantitative results at a technical level. For each key exhibit, explain what it measures, the axes/columns and direction of improvement, what the numbers imply, and the mechanism behind the observed trend. Flag surprising, counter-intuitive, or cherry-picked-looking results and what they reveal about the method's behavior.",
        "icon": "BarChart3",
    },
    {
        "id": "critical_review",
        "title": "Critical Peer Review",
        "prompt": "Evaluate the paper as a rigorous peer reviewer. Assess novelty, technical soundness, and the strength and fairness of the empirical and theoretical evidence, plus clarity. Identify unsupported claims, methodological flaws, and confounds. Conclude with the strongest reasons to accept, the most serious weaknesses, and an overall verdict on how convincing the work is.",
        "icon": "ClipboardCheck",
    },
    {
        "id": "limitations",
        "title": "Limitations & Threats to Validity",
        "prompt": "Identify the limitations, failure modes, and threats to validity — both those the authors acknowledge and those evident from the method or results. Cover assumptions, generalisability, dataset and evaluation biases, statistical rigor, edge cases, and practical or ethical risks. For each, explain the mechanism and how much it undermines the paper's conclusions.",
        "icon": "AlertTriangle",
    },
    {
        "id": "reproducibility_blueprint",
        "title": "Reproducibility & Implementation Blueprint",
        "prompt": "Produce a concrete blueprint to reproduce or re-implement this work. Extract the exact architecture/algorithm, the datasets and preprocessing, all reported hyperparameters and training details, the evaluation setup, and any released code/artifacts or compute requirements. Present it as an actionable checklist, and explicitly flag every detail that is missing or ambiguous and would block a faithful reproduction.",
        "icon": "FlaskConical",
    },
    {
        "id": "background_related_work",
        "title": "Background & Related Work",
        "prompt": "Situate the paper in its research lineage. Summarise the prior approaches and context it builds on, the specific gap or limitation in existing work it targets, and how it differentiates from the closest related methods. Identify the key references a reader should know to fully assess the contribution.",
        "icon": "Library",
    },
    {
        "id": "practical_applications",
        "title": "Practical Applications & Deployment",
        "prompt": "Assess how the method or findings translate to practice. Identify concrete application domains and system contexts that benefit, the integration requirements, and the operational constraints (data, compute, latency, cost, maintenance). Distinguish deployment-ready capabilities from those still at the research stage.",
        "icon": "Rocket",
    },
    {
        "id": "future_work",
        "title": "Future Work & Open Problems",
        "prompt": "Map the open problems and future directions. Include the directions the authors propose plus promising extensions and unresolved questions implied by the paper's limitations and results. For each, explain why it matters and outline a concrete next step or experiment.",
        "icon": "Compass",
    },
]


class ResearchPaperService:
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
            raise HTTPException(status_code=500, detail=f"Failed to process research paper: {str(exc)}") from exc

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
            raise HTTPException(status_code=500, detail=f"Failed to retry research paper: {str(exc)}") from exc

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

    def _charge_jina_embedding(self, source: str = "jina_embedding") -> dict:
        """Charge the flat fee for one Jina embedding operation.

        Price comes from the admin-configurable ``jina_call_cost_usd`` setting via
        ``ai_tokens.get_jina_call_cost_usd``. Do not re-introduce a local key
        lookup here: the previous version read a ``research_paper_jina_cost_usd``
        key that is seeded nowhere, so it always fell back to a hardcoded 0.005
        and ignored whatever the admin had configured.
        """
        cost_usd = ai_tokens.get_jina_call_cost_usd(self.db)
        return ai_tokens.charge_flat_fee(user=self.user, session=self.db, cost_usd=cost_usd, source=source)

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
            self._charge_jina_embedding(source=charge_source)
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

    def _extract_page_numbers(self, chunk_text: str) -> list[int]:
        """Extract page numbers from '--- Page N ---' markers in chunk text."""
        import re
        page_markers = re.findall(r"---\s*Page\s+(\d+)\s*---", chunk_text, re.IGNORECASE)
        return sorted(list(set(int(p) for p in page_markers))) if page_markers else []

    # ------------------------------------------------------------------ Paper Analysis
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

        # Check AI token balance
        ai_tokens.ensure_can_spend(self.user, self.db, min_tokens=1)

        # Retrieve relevant chunks via pgvector search
        inventory: dict[str, Any] = {}
        chunks: list[dict[str, Any]] = await self.search_relevant_chunks(
            paper_id, prompt, top_k=top_k, inventory_out=inventory
        )

        # Note: Query embedding generation via Jina is infrastructure cost.
        # Users are only charged for the actual AI analysis call below via AiService.chat()

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

        # Research Expert model cascade (strict order):
        #   1. GLM-5.2 — primary model for high-quality academic analysis
        #   2. Groq compound — fallback if GLM is unavailable or errors
        #   3. 503 with a user-friendly message — never expose provider names
        _RESEARCH_MODELS = [
            ("glm:GLM-5.2", "GLM-5.2"),
            ("groq:groq/compound", "groq/compound"),
        ]

        response = None
        for model_arg, _model_label in _RESEARCH_MODELS:
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

        return [
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
