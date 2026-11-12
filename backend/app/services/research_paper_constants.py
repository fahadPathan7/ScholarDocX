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
    # SCHOLARDOCX-0253: GLM-5.3 primary (was GLM-5.2). The cost ceiling prices
    # the max over this list, so a change here is reflected automatically.
    ("glm:GLM-5.3", "GLM-5.3"),
    ("groq:groq/compound", "groq/compound"),
]
# The query embedding embeds the prompt alone; AnalyzePaperPayload caps
# prompts at 1000 chars (~250 tokens).
ANALYSIS_QUERY_EMBEDDING_MAX_TOKENS = 250
# analyze_paper's system_instruction is ~3,000 chars (~750 tokens) since the
# SCHOLARDOCX-0253 evidence rules; 900 adds headroom for the injected system time.
ANALYSIS_SYSTEM_TOKENS = 900
# Per-section block header + formatting around each retrieved chunk.
ANALYSIS_PER_SECTION_OVERHEAD_TOKENS = 25
ANALYSIS_PROMPT_TOKENS = 250  # payload cap: 1000 chars
# The analysis answer is uncapped by the call itself; a full structured
# markdown analysis stays well under 4,000 tokens.
ANALYSIS_MAX_OUTPUT_TOKENS = 4_000

# Predefined analyses (SCHOLARDOCX-0253). Single source of truth for the prompt
# text and how each one retrieves; the frontend keeps titles, descriptions and
# categories, sends `prompt_id`, and must keep `prompt` text identical (older
# clients that send text only are matched by exact text).
#
# Each prompt fixes an output structure, keeps what the paper states apart from
# the model's assessment, and says what to do when a detail is not in the
# retrieved sections. The system prompt carries the shared evidence rules, so
# the prompts do not repeat them.
#
# `retrieval_query` is what gets embedded instead of the long instruction text:
# an instruction ("Produce a reproduction plan…") is a poor search query, and
# its incidental words ("table", "every", "references") used to trip the
# whole-document counting and bibliography modes. Predefined analyses run with
# those structural modes off. `section_terms` are words whose passages must be
# considered even if cosine ranking alone would miss them.
PREDEFINED_PROMPTS = [
    {
        "id": "executive_summary",
        "title": "Executive Summary",
        "prompt": (
            "Write an executive summary for a reader who knows the field. Use exactly these "
            "headings. **Problem**: what is addressed and why existing approaches fall short. "
            "**Approach**: the core idea and what makes it different, in two or three sentences. "
            "**Results**: the headline numbers, each with its dataset, metric, and the baseline it "
            "is compared against. **Takeaway**: what a researcher should conclude, including the "
            "main caveat. Keep it under 250 words."
        ),
        "icon": "FileText",
        "retrieval_query": "abstract problem statement proposed approach main contribution key results conclusion",
        "section_terms": ["abstract", "introduction", "conclusion"],
    },
    {
        "id": "contributions",
        "title": "Contributions & Novelty",
        "prompt": (
            "List the contributions the authors claim, then judge each one. For every contribution "
            "give: the claim in one line; the mechanism, meaning what in the method makes it work; "
            "the evidence, meaning which experiment or argument supports it, with numbers; and a "
            "verdict of Novel, Incremental, or Engineering, with a one-line reason. End with a short "
            "paragraph naming the most significant contribution and any claim that goes further "
            "than its evidence."
        ),
        "icon": "Lightbulb",
        "retrieval_query": "our contributions we propose novel approach differs from prior work main idea",
        "section_terms": ["contribution", "we propose", "novel"],
    },
    {
        "id": "methodology",
        "title": "Methodology Analysis",
        "prompt": (
            "Explain the methodology so a researcher could critique it. Use these headings. "
            "**Problem setup**: inputs, outputs, and task definition. **Data**: sources, size, "
            "preprocessing, and train/validation/test splits. **Method**: the architecture or "
            "procedure step by step, and how its components interact. **Training**: objective, key "
            "hyperparameters, and compute. **Evaluation**: metrics, protocol, and baselines. "
            "**Design choices**: the three to five decisions that most shape the results, and the "
            "assumptions behind each. Mark any item the sections do not cover as \"Not found in "
            "the sections\"."
        ),
        "icon": "Cpu",
        "retrieval_query": "proposed method architecture dataset preprocessing training procedure hyperparameters evaluation metrics experimental setup",
        "section_terms": ["method", "dataset", "architecture", "experimental setup", "implementation"],
    },
    {
        "id": "theoretical_foundations",
        "title": "Theoretical Foundations & Formulation",
        "prompt": (
            "Lay out the formal side of the paper. Give the problem formulation and notation; the "
            "objective or loss and the role of each term; the key formal results (theorems, bounds, "
            "convergence or complexity claims) with their assumptions; and the intuition for why "
            "the method should work. Rebuild formulas as clean inline maths from their meaning. "
            "State which claims are proven, which are argued informally, and which assumptions are "
            "strongest or least realistic. If the paper is mainly empirical, say so and describe "
            "the formal model it implicitly relies on."
        ),
        "icon": "Sigma",
        "retrieval_query": "problem formulation notation objective function loss theorem proof assumption bound convergence complexity",
        "section_terms": ["formulation", "objective", "loss", "theorem", "assumption"],
    },
    {
        "id": "key_findings",
        "title": "Key Findings & Results",
        "prompt": (
            "Report the main findings with their numbers. For each finding give the result "
            "(metric, value, and dataset or setting), what it is compared with and the size of the "
            "gain, and what it shows about the method. When three or more methods are compared, "
            "put the numbers in a markdown table. Then cover the ablations: which components "
            "matter most, and by how much. Finish with **Strength of evidence**: which conclusions "
            "are well supported, and which rest on one run, small margins, or a single dataset. "
            "Quote numbers exactly as reported."
        ),
        "icon": "CheckCircle2",
        "retrieval_query": "experimental results performance improvement over baselines accuracy metrics ablation study findings",
        "section_terms": ["results", "ablation", "experiments", "outperform"],
    },
    {
        "id": "benchmark_comparison",
        "title": "Benchmark & Baseline Comparison",
        "prompt": (
            "Assess how the method compares with prior work. List the benchmarks and metrics used "
            "and why they suit the task. Give a markdown table of each baseline against the "
            "proposed method, with absolute and relative differences. Then judge fairness: same "
            "data and preprocessing, comparable model size and compute, baselines re-tuned or "
            "copied from older papers, and whether variance or significance is reported. Conclude "
            "whether the gains are meaningful in practice, marginal, or not yet established, and "
            "name the most important comparison that is missing."
        ),
        "icon": "GitCompare",
        "retrieval_query": "comparison with state-of-the-art baselines benchmark datasets evaluation metrics outperforms prior methods",
        "section_terms": ["baseline", "state-of-the-art", "benchmark", "compared"],
    },
    {
        "id": "results_figures",
        "title": "Results & Figures Deep-Dive",
        "prompt": (
            "Walk through the paper's key result exhibits in order of importance. For each, name it "
            "as the paper does (for example Figure 3), then give what it measures (axes or columns, "
            "units, and which direction is better), the main pattern, and what that pattern says "
            "about the method. Point out results that are surprising, inconsistent with the text, "
            "or that depend on selected settings. Discuss only exhibits whose content appears in "
            "the sections, and list any others that are mentioned but not shown."
        ),
        "icon": "BarChart3",
        "retrieval_query": "figure shows table reports results plot trend performance comparison as shown in",
        "section_terms": ["fig.", "figure", "table"],
    },
    {
        "id": "critical_review",
        "title": "Critical Peer Review",
        "prompt": (
            "Write a peer review as for a top venue. Use these headings. **Summary**: three or four "
            "neutral sentences. **Strengths**. **Weaknesses**: methodological flaws, missing "
            "baselines or ablations, confounds, and unsupported claims, each with why it matters. "
            "**Questions for the authors**: specific and answerable. **Verdict**: accept, weak "
            "accept, borderline, weak reject, or reject, with your confidence and the one change "
            "that would most improve the paper. Be fair and specific: tie every point to a section, "
            "experiment, or number."
        ),
        "icon": "ClipboardCheck",
        "retrieval_query": "main claims proposed method experimental evidence results limitations assumptions conclusion",
        "section_terms": ["contribution", "results", "limitation", "conclusion"],
    },
    {
        "id": "limitations",
        "title": "Limitations & Threats to Validity",
        "prompt": (
            "Identify the limitations and threats to validity. Separate those the authors "
            "acknowledge from those you infer from the method or results. For each give the "
            "limitation, why it arises, its impact on the conclusions (High, Medium, or Low), and "
            "what would test or fix it. Cover internal validity (confounds, data leakage, tuning on "
            "test data), external validity (other datasets, domains, and scales), construct "
            "validity (whether the metrics measure the stated goal), and practical or ethical "
            "risks. Order the list by impact."
        ),
        "icon": "AlertTriangle",
        "retrieval_query": "limitations failure cases assumptions threats to validity weaknesses discussion future work",
        "section_terms": ["limitation", "discussion", "drawback", "fail"],
    },
    {
        "id": "reproducibility_blueprint",
        "title": "Reproducibility & Implementation Blueprint",
        "prompt": (
            "Produce a reproduction plan as a checklist covering: data (sources, versions, "
            "preprocessing, splits); the model or procedure (components and sizes, in order); "
            "training (objective, optimiser, learning rate and schedule, batch size, epochs, seeds, "
            "initialisation); evaluation (metrics, protocol, test settings); compute (hardware and "
            "run time); and released code or checkpoints. Mark each item Reported, Partial, or Not "
            "found, quoting the value when reported. End with the three gaps most likely to block a "
            "faithful reproduction and a sensible default for each, labelled as an assumption."
        ),
        "icon": "FlaskConical",
        "retrieval_query": "implementation details hyperparameters learning rate batch size epochs optimizer training setup hardware GPU code available dataset split",
        "section_terms": ["implementation", "hyperparameter", "learning rate", "batch size", "github"],
    },
    {
        "id": "background_related_work",
        "title": "Background & Related Work",
        "prompt": (
            "Place the paper in its research context. Summarise the main lines of prior work it "
            "builds on or argues against, grouped by approach. State the gap in that work which "
            "this paper targets, in one or two sentences. Compare it with the two to four closest "
            "prior methods: what each does, and how this paper differs in approach, assumptions, "
            "or results. Finish with the prior works a reader should know to judge the "
            "contribution, named as the paper names them."
        ),
        "icon": "Library",
        "retrieval_query": "related work prior approaches existing methods background previous studies limitations of earlier work",
        "section_terms": ["related work", "prior work", "existing methods", "background"],
    },
    {
        "id": "practical_applications",
        "title": "Practical Applications & Deployment",
        "prompt": (
            "Assess what this work means in practice. Name the concrete use cases it fits best, and "
            "why. Describe what adopting it would take: data requirements, compute and memory, "
            "latency or throughput, integration with existing systems, and maintenance. Compare its "
            "cost and benefit with the usual alternative. Classify it as ready to use, needs "
            "engineering, or research only, and state the main risk in deployment. Keep what the "
            "paper demonstrates separate from your own extrapolation."
        ),
        "icon": "Rocket",
        "retrieval_query": "applications real-world deployment use cases computational cost inference time efficiency memory scalability",
        "section_terms": ["application", "deploy", "real-world", "efficien", "inference time"],
    },
    {
        "id": "future_work",
        "title": "Future Work & Open Problems",
        "prompt": (
            "Map the open problems this paper leaves. Include the directions the authors propose "
            "and those implied by its limitations or unexplained results, and label which is "
            "which. For each, explain why it matters, give a concrete next experiment (data, setup, "
            "and the result that would count as success), and rate its difficulty as Low, Medium, "
            "or High. End with the single most promising direction for a new research project, "
            "and why."
        ),
        "icon": "Compass",
        "retrieval_query": "future work open problems limitations extensions conclusion remaining challenges",
        "section_terms": ["future work", "conclusion", "limitation", "open problem"],
    },
]

PREDEFINED_PROMPTS_BY_ID = {item["id"]: item for item in PREDEFINED_PROMPTS}
_PREDEFINED_PROMPTS_BY_TEXT = {item["prompt"]: item for item in PREDEFINED_PROMPTS}
_PUBLIC_PROMPT_FIELDS = ("id", "title", "prompt", "icon")


def resolve_predefined_prompt(
    prompt: str, prompt_id: Optional[str] = None
) -> Optional[dict[str, Any]]:
    """The predefined analysis this request runs, or None for a custom question.

    By id first (current client); by exact text second, so a client that still
    sends only the text gets the same retrieval behaviour.
    """
    if prompt_id and prompt_id in PREDEFINED_PROMPTS_BY_ID:
        return PREDEFINED_PROMPTS_BY_ID[prompt_id]
    return _PREDEFINED_PROMPTS_BY_TEXT.get((prompt or "").strip())


def public_prompt_catalog() -> list[dict[str, Any]]:
    """What GET /research/prompts serves: no retrieval internals."""
    return [{key: item[key] for key in _PUBLIC_PROMPT_FIELDS} for item in PREDEFINED_PROMPTS]
