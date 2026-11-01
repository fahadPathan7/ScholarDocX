"""Shared constants for the research-paper service family (SCHOLARDOCX-0221 split).

Single source of truth: the service module and its mixins all import from
here, so a tuning change lands once.
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

# SCHOLARDOCX-0218: worst-case sizing for ONE analyze operation, used by the
# pre-flight balance check in analyze_paper() and the analysis_cost_estimate
# on the paper payloads. Values are chars/4 estimates documented from what
# analyze_paper actually sends:
ANALYSIS_MODEL_CASCADE = [
    ("glm:GLM-5.2", "GLM-5.2"),
    ("groq:groq/compound", "groq/compound"),
]
# The query embedding embeds the prompt alone; AnalyzePaperPayload caps
# prompts at 1000 chars (~250 tokens).
ANALYSIS_QUERY_EMBEDDING_MAX_TOKENS = 250
# analyze_paper's system_instruction is ~1,900 chars (~475 tokens); 600 adds
# headroom for the injected system time.
ANALYSIS_SYSTEM_TOKENS = 600
# Per-section block header + formatting around each retrieved chunk.
ANALYSIS_PER_SECTION_OVERHEAD_TOKENS = 25
ANALYSIS_PROMPT_TOKENS = 250  # payload cap: 1000 chars
# The analysis answer is uncapped by the call itself; a full structured
# markdown analysis stays well under 4,000 tokens.
ANALYSIS_MAX_OUTPUT_TOKENS = 4_000

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


