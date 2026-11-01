"""Worst-case cost estimation for Advisor Atlas runs (SCHOLARDOCX-0218).

Kept in its own module rather than `service.py` (already past the 1150-line
file-size grace cap). Mirrors the `estimate_run_cost` pattern the Scholarship
Deep Hunt API ships: the create-run route pre-flights the user's balance
against the worst case and returns a `cost_estimate` on the run so the
frontend can show the ceiling upfront. Actual charges scale with the real
number of candidates, searches, and AI passes a run makes.

Every constant below documents the pipeline stage it bounds; when a stage
cap moves, move the number here in the same change.
"""

from __future__ import annotations

import math
from typing import Any

from app.services import ai_tokens
from app.services.advisor_atlas.openalex import METERED_CALL_COST_RATIO
from app.services.advisor_atlas.research_pipeline import (
    DEEP_DISCOVERY_LIMIT,
    VISUAL_EVIDENCE_LIMIT,
)

# service.run caps the screened candidate list here (`max_candidates = 80`).
MAX_CANDIDATES_PER_RUN = 80
# professor_query_plan issues this many Tavily searches per deep candidate.
PROFESSOR_SEARCH_PASSES = 8
# The screening path issues one detail search per candidate
# (`_process_candidate`, non-deep branch).
SCREENING_SEARCHES_PER_CANDIDATE = 1
# analyze_professor_specialists runs this many GLM passes per deep candidate.
SPECIALIST_PASSES_PER_CANDIDATE = 4
# discovery: university_map_queries + (primary + fallback) per mapped unit,
# with mapped_units capped at 10 in DiscoveryResearcher.collect.
DISCOVERY_MAP_SEARCHES = 2
DISCOVERY_UNITS_MAX = 10
DISCOVERY_SEARCHES_PER_UNIT = 2
# Professor-mode discovery issues exactly one identity search.
PROFESSOR_DISCOVERY_SEARCHES = 1
# Deep candidates get one OpenAlex author search plus one works list call
# (list calls are billed at METERED_CALL_COST_RATIO["list"], a tenth of the
# search price by default).
OPENALEX_SEARCHES_PER_DEEP_CANDIDATE = 1
OPENALEX_LISTS_PER_DEEP_CANDIDATE = 1

# Worst-case GLM call sizes, chars/4 estimates documented from the payloads
# each call site sends:
# Unit mapper (map_related_units_with_glm): university/field names + observed
# unit names in, a short JSON list out.
UNIT_MAPPER_MAX_INPUT_TOKENS = 2_000
UNIT_MAPPER_MAX_OUTPUT_TOKENS = 500
# Vision evidence (analyze_visual_source): one image plus a short instruction
# in, a small JSON verdict out.
VISION_MAX_INPUT_TOKENS = 3_000
VISION_MAX_OUTPUT_TOKENS = 1_000
# Specialist pass (analyze_professor_specialists): up to 20 sources x 3,000
# chars (~15,000 tokens) + candidate/profile JSON in, one structured JSON
# section out.
SPECIALIST_MAX_INPUT_TOKENS = 16_000
SPECIALIST_MAX_OUTPUT_TOKENS = 2_000
# Final synthesis (analyze_with_glm): up to 26 sources x 2,600 chars (~17,000
# tokens) + the schema + specialist context in, one full dossier JSON out.
SYNTHESIS_MAX_INPUT_TOKENS = 25_000
SYNTHESIS_MAX_OUTPUT_TOKENS = 4_000


def _call_usd(
    session, model: str, input_tokens: int, output_tokens: int, provider: str
) -> float:
    cost_usd, _tokens = ai_tokens.compute_cost(
        model, input_tokens, output_tokens, session, provider=provider
    )
    return cost_usd


def estimate_run_cost(session, settings, mode: str) -> dict[str, Any]:
    """Worst-case cost for one Advisor Atlas run in `mode`.

    Counts every external call the pipeline can make at its caps: discovery
    searches (Tavily), per-candidate screening searches, the deep-research
    passes (Tavily + OpenAlex + GLM specialists/synthesis + vision), and the
    discovery unit-mapper GLM call. Returns the max candidates and max
    credits (tokens) a run could cost, for the pre-flight balance check and
    the user-facing estimate shown before submit.
    """
    token_rate = ai_tokens.get_token_rate(session)
    tavily_usd = ai_tokens.get_tavily_call_cost_usd(session)
    openalex_search_usd = ai_tokens.get_openalex_call_cost_usd(session)
    openalex_list_usd = openalex_search_usd * METERED_CALL_COST_RATIO.get("list", 0.1)
    glm_model = settings.advisor_atlas_glm_model
    vision_model = settings.advisor_atlas_vision_model

    vision_usd = _call_usd(
        session, vision_model, VISION_MAX_INPUT_TOKENS, VISION_MAX_OUTPUT_TOKENS, "glm"
    )
    specialist_usd = _call_usd(
        session,
        glm_model,
        SPECIALIST_MAX_INPUT_TOKENS,
        SPECIALIST_MAX_OUTPUT_TOKENS,
        "glm",
    )
    synthesis_usd = _call_usd(
        session,
        glm_model,
        SYNTHESIS_MAX_INPUT_TOKENS,
        SYNTHESIS_MAX_OUTPUT_TOKENS,
        "glm",
    )
    unit_mapper_usd = _call_usd(
        session,
        glm_model,
        UNIT_MAPPER_MAX_INPUT_TOKENS,
        UNIT_MAPPER_MAX_OUTPUT_TOKENS,
        "glm",
    )

    screening_usd = (
        tavily_usd * SCREENING_SEARCHES_PER_CANDIDATE
        + vision_usd * VISUAL_EVIDENCE_LIMIT
        + synthesis_usd
    )
    deep_usd = (
        tavily_usd * PROFESSOR_SEARCH_PASSES
        + openalex_search_usd * OPENALEX_SEARCHES_PER_DEEP_CANDIDATE
        + openalex_list_usd * OPENALEX_LISTS_PER_DEEP_CANDIDATE
        + vision_usd * VISUAL_EVIDENCE_LIMIT
        + specialist_usd * SPECIALIST_PASSES_PER_CANDIDATE
        + synthesis_usd
    )

    if mode == "professor":
        # One named professor: one identity search, one deep dossier.
        max_candidates = 1
        total_usd = PROFESSOR_DISCOVERY_SEARCHES * tavily_usd + deep_usd
    else:
        # Department discovery: university-map + per-unit searches and one
        # unit-mapper GLM call, then every candidate screened and the top
        # DEEP_DISCOVERY_LIMIT deep-researched.
        max_candidates = MAX_CANDIDATES_PER_RUN
        discovery_usd = (
            tavily_usd
            * (DISCOVERY_MAP_SEARCHES + DISCOVERY_UNITS_MAX * DISCOVERY_SEARCHES_PER_UNIT)
            + unit_mapper_usd
        )
        total_usd = (
            discovery_usd
            + screening_usd * MAX_CANDIDATES_PER_RUN
            + deep_usd * DEEP_DISCOVERY_LIMIT
        )

    max_credits = math.ceil(total_usd * token_rate)
    return {
        "max_candidates": max_candidates,
        "max_credits": max(1, max_credits),
    }
