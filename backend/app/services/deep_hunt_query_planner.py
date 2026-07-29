"""Deep Hunt intent-aware query planning and relevance filtering
(SCHOLARDOCX-0173).

Deep Hunt used to lean entirely on raw Tavily search — ``_build_queries``
concatenated hard-coded suffixes to the user's free-text goal, so acronyms
like ``cse`` were never expanded to ``computer science`` and ``emjm`` was never
expanded to ``Erasmus Mundus Joint Masters``. The result was generic pages that
ignored the user's stated field, degree, and funding intent.

This module wraps the web-search ingredient in two small AI calls:

1. ``DeepHuntQueryPlanner.plan`` — rewrites the goal into 3-4 diverse search
   queries (acronym expansion + facet decomposition + official-page targeting)
   and emits the field synonyms the relevance step reuses.
2. ``DeepHuntRelevanceFilter.score`` — one batched call judges every extracted
   opportunity RELEVANT / OFF-TOPIC against the goal, returning a 0..1 score
   per item.

Both mirror the established provider shape (an unmetered
OpenRouter Free call with ``reasoning: {exclude: true}`` and a strict JSON
contract, with a deterministic fallback so the run never hard-fails on an AI
outage. Billing-free — extraction already carries the run's token cost.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import Settings, get_settings
from app.services.advisor_atlas.analysis import extract_json_object

logger = logging.getLogger(__name__)

# Bounded to keep the JSON answer small and the free-tier call cheap. The
# caller (scholarship_deep_hunt.py) truncates the returned list to
# ``SEARCH_PASSES`` anyway.
MAX_PLANNED_QUERIES = 4

# SCHOLARDOCX-0177: a fields_of_study list at or above this length reads as a
# broad/umbrella program description (funds almost every discipline) rather
# than a field-specific opportunity, even when one listed field happens to
# match the user's goal.
BROAD_FIELD_LIST_SIZE = 5

QUERY_PLANNER_SYSTEM_PROMPT = """You plan precise public-web search queries for one scholarship Deep Hunt run.
The user gave a free-text funding goal. Your job is to turn that goal into 3-4 diverse, high-signal queries that will surface official program, application, eligibility, funding, and deadline pages.

Return only JSON matching the requested schema.

Rules:
- EXPAND ACRONYMS AND SHORTHAND into their full form in at least one query each (e.g. CSE/CS -> Computer Science, CE -> Computer Engineering, EE -> Electrical Engineering, EMJM -> Erasmus Mundus Joint Master, EU -> European Union, UK -> United Kingdom, US/USA -> United States, AI -> Artificial Intelligence, ML -> Machine Learning). Keep the acronym in one query and the expansion in another so both ranking paths are covered.
- DECOMPOSE the goal into its facets: degree level, fields of study, destinations, funding type, intake term. Each query should emphasise a different combination so the passes are diverse, not three copies of the same string.
- PREFER wording that surfaces official university, government, scholarship consortium, and foundation application pages; then strong scholarship directories when official sources are scarce.
- INCLUDE high-signal scholarship intent words such as scholarship, fellowship, grant, funding, assistantship, stipend, tuition waiver, application, deadline, or admissions where they fit naturally.
- BIAS toward the current and next application cycle (future, open, upcoming) and exclude closed/expired/past opportunities.
- FIELD_SYNONYMS: list every spelling/variant of the user's field of study the queries use (e.g. for CS: ["computer science", "computer engineering", "CS", "CSE", "computing", "software engineering", "artificial intelligence"]). This list drives the deterministic relevance fallback, so be exhaustive about variants the source pages might use.
- Do not add facets the user did not express.
- Do not include commentary, markdown, or text outside the JSON object."""

RELEVANCE_SYSTEM_PROMPT = """You judge whether each scholarship opportunity is relevant to one user's funding goal.
You receive the user's goal and a list of extracted opportunities (name, fields of study, degree levels, destinations, funding). For EACH opportunity decide RELEVANT or OFF_TOPIC against the goal's field of study, degree level, funding requirement, and destination intent, and assign a relevance_score from 0.0 to 1.0.

Return only JSON matching the requested schema.

Rules:
- The DECISIVE dimension is FIELD OF STUDY. An opportunity whose stated fields do not overlap the goal's field is OFF_TOPIC (score <= 0.25), even if the degree level, funding, or destination match. A generic page with no field signal and no degree signal (e.g. a directory landing page) is OFF_TOPIC.
- If the goal expresses a degree level and the opportunity states degree levels that do not include it, mark OFF_TOPIC unless the page explicitly says the program covers that level.
- If the goal expresses a destination and the opportunity states destinations with no overlap, that lowers the score but is not alone decisive.
- BROAD/UMBRELLA PROGRAMS: if the goal names a specific field of study and an opportunity's fields_of_study lists five or more unrelated broad disciplines (e.g. engineering, health, law, and humanities together) with no field named as a specific track, consortium, or specialization matching the goal, mark it OFF_TOPIC (score <= 0.25) even though the goal's field technically appears somewhere in the long list. A generic umbrella program description that funds almost every discipline is not the close, field-specific match the user asked for.
- RELEVANT means a reasonable applicant with this goal would consider applying to THIS specific opportunity, not merely that the goal's field is technically included somewhere in a long list of unrelated fields.
- Preserve the input order in your output array.
- Do not include commentary, markdown, or text outside the JSON object."""

_RELEVANCE_SCHEMA_HINT = {
    "verdicts": [
        {
            "index": "0-based position in the input list",
            "verdict": "RELEVANT | OFF_TOPIC",
            "relevance_score": "0.0 to 1.0",
            "reason": "one short clause",
        }
    ]
}


class DeepHuntQueryPlanner:
    """One async LLM call that turns a free-text goal into diverse, expanded
    search queries plus a field-synonym list. Falls back to the deterministic
    templates the caller supplies on any error."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client_factory=None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client_factory = client_factory or httpx.AsyncClient

    async def plan(
        self,
        goal: str,
        *,
        ai_service: Any,
        degree_level: Optional[str] = None,
        destinations: Optional[List[str]] = None,
        intake_term: Optional[str] = None,
        field_of_study: Optional[str] = None,
        fallback_queries: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Return ``{queries, field_synonyms, intent_summary, source}``.

        ``source`` is ``"openrouter"`` on success or ``"fallback"`` when the
        AI call fails or returns unusable output — in which case ``queries``
        is the deterministic ``fallback_queries`` and ``field_synonyms`` is a
        minimal heuristic derivation so downstream relevance still works.

        ``ai_service`` is **required** (SCHOLARDOCX-0204 L1). It carries the
        billing context that meters this call at the admin-configured token
        price. It used to default to ``None`` with the charge behind an
        ``if ai_service is not None`` guard — the one call site never passed it,
        so the guard was permanently false and every run made a free OpenRouter
        call. Keep it required: an optional billing context is how this class of
        leak recurs. Pass ``None`` only from a test that asserts the
        no-provider fallback path, which never reaches a charge.
        """
        fallback_queries = fallback_queries or []
        if not self.settings.openrouter_api_key:
            return self._fallback(goal, field_of_study, fallback_queries, "OpenRouter is not configured.")

        prompt = self._build_prompt(
            goal,
            degree_level=degree_level,
            destinations=destinations,
            intake_term=intake_term,
            field_of_study=field_of_study,
            fallback_queries=fallback_queries,
        )
        payload = {
            "model": self.settings.openrouter_free_model,
            "messages": [
                {"role": "system", "content": QUERY_PLANNER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_completion_tokens": 1100,
            "reasoning": {"effort": "none", "exclude": True},
            "stream": False,
            "response_format": {"type": "json_object"},
        }
        try:
            async with self._client_factory(timeout=30.0) as client:
                response = await client.post(
                    self.settings.openrouter_base_url,
                    headers={
                        "Authorization": f"Bearer {self.settings.openrouter_api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost",
                        "X-Title": "ScholarDocX Deep Hunt Planner",
                    },
                    json=payload,
                )
                response.raise_for_status()
            data = response.json()
            # Charge tokens against the user's balance using admin-configured pricing.
            if ai_service is not None:
                usage = data.get("usage") or {}
                ai_service.charge_tokens(
                    model_id=self.settings.openrouter_free_model,
                    provider="openrouter",
                    input_tokens=int(usage.get("prompt_tokens", 0) or 0),
                    output_tokens=int(usage.get("completion_tokens", 0) or 0),
                    source="Deep Hunt · Query Planning",
                )
            parsed = extract_json_object(self._content(data))
            if parsed is None:
                return self._fallback(goal, field_of_study, fallback_queries, "Planner returned non-JSON.")
            queries = self._clean_queries(parsed.get("queries"))
            synonyms = self._clean_synonyms(parsed.get("field_synonyms"), field_of_study)
            intent_summary = str(parsed.get("intent_summary") or "").strip()[:280] or None
            if not queries:
                return self._fallback(goal, field_of_study, fallback_queries, "Planner returned no queries.")
            return {
                "queries": queries[:MAX_PLANNED_QUERIES],
                "field_synonyms": synonyms,
                "intent_summary": intent_summary,
                "source": "openrouter",
            }
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            logger.info("Deep Hunt query planner fell back: %s", exc)
            return self._fallback(goal, field_of_study, fallback_queries, "OpenRouter planner call failed.")

    def _build_prompt(
        self,
        goal: str,
        *,
        degree_level: Optional[str],
        destinations: Optional[List[str]],
        intake_term: Optional[str],
        field_of_study: Optional[str],
        fallback_queries: List[str],
    ) -> str:
        lines = [f"User funding goal (free text): {goal}"]
        facets: Dict[str, Any] = {}
        if degree_level:
            facets["degree_level"] = degree_level
        if destinations:
            facets["destinations"] = destinations
        if intake_term:
            facets["intake_term"] = intake_term
        if field_of_study:
            facets["field_of_study"] = field_of_study
        if facets:
            lines.append(f"Structured facets (from the user's Hunt Profile): {json.dumps(facets, ensure_ascii=True)}")
        if fallback_queries:
            lines.append(f"Deterministic baseline queries (improve on these, do not just repeat them): {json.dumps(fallback_queries, ensure_ascii=True)}")
        lines.append("")
        lines.append(
            "Produce 3-4 diverse public-web search queries for this goal. Expand acronyms and "
            "decompose facets as the rules require. Return exactly "
            '{"queries": ["...", "..."], "field_synonyms": ["...", "..."], '
            '"intent_summary": "one sentence"}.'
        )
        return "\n".join(lines)

    def _content(self, response_data: Dict[str, Any]) -> str:
        content = response_data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("OpenRouter content must be text.")
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
        return content

    def _clean_queries(self, raw: Any) -> List[str]:
        if not isinstance(raw, list):
            return []
        seen: set[str] = set()
        out: List[str] = []
        for item in raw:
            query = re.sub(r"\s+", " ", str(item)).strip()
            key = query.casefold()
            if 3 <= len(query) <= 1200 and key not in seen:
                seen.add(key)
                out.append(query)
        return out

    def _clean_synonyms(self, raw: Any, field_of_study: Optional[str]) -> List[str]:
        synonyms: List[str] = []
        if isinstance(raw, list):
            for item in raw:
                text = re.sub(r"\s+", " ", str(item)).strip()
                if text:
                    synonyms.append(text)
        if field_of_study and field_of_study.strip() and field_of_study.strip() not in synonyms:
            synonyms.insert(0, field_of_study.strip())
        # Dedup case-insensitively while preserving order.
        seen: set[str] = set()
        unique: List[str] = []
        for s in synonyms:
            key = s.casefold()
            if key not in seen:
                seen.add(key)
                unique.append(s)
        return unique or ([field_of_study.strip()] if field_of_study and field_of_study.strip() else [])

    def _fallback(
        self,
        goal: str,
        field_of_study: Optional[str],
        fallback_queries: List[str],
        notice: str,
    ) -> Dict[str, Any]:
        # Heuristic synonym derivation so the deterministic relevance fallback
        # still has something to match on when the planner AI is unavailable.
        synonyms = _heuristic_field_synonyms(field_of_study) if field_of_study else []
        return {
            "queries": fallback_queries[:MAX_PLANNED_QUERIES],
            "field_synonyms": synonyms,
            "intent_summary": None,
            "source": "fallback",
            "notice": notice,
        }


class DeepHuntRelevanceFilter:
    """One batched LLM call that judges every extracted opportunity against the
    run's goal. Falls back to a deterministic field-keyword check using the
    planner's ``field_synonyms`` so relevance is always enforced even without
    AI."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client_factory=None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client_factory = client_factory or httpx.AsyncClient

    async def score(
        self,
        goal: str,
        opportunities: List[Dict[str, Any]],
        *,
        ai_service: Any,
        field_synonyms: Optional[List[str]] = None,
        degree_level: Optional[str] = None,
    ) -> List[float]:
        """Return one 0..1 relevance score per opportunity, in input order.

        Falls back to a deterministic synonym/keyword match if OpenRouter is
        unavailable or returns unusable output — never raises.

        ``ai_service`` is **required** for the same reason as
        ``DeepHuntQueryPlanner.plan`` (SCHOLARDOCX-0204 L2): it carries the
        billing context, and making it optional is exactly what let this call go
        unbilled on every run.
        """
        if not opportunities:
            return []
        if not self.settings.openrouter_api_key:
            return self._heuristic_scores(opportunities, field_synonyms, degree_level)
        prompt = self._build_prompt(goal, opportunities)
        payload = {
            "model": self.settings.openrouter_free_model,
            "messages": [
                {"role": "system", "content": RELEVANCE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_completion_tokens": 1200,
            "reasoning": {"effort": "none", "exclude": True},
            "stream": False,
            "response_format": {"type": "json_object"},
        }
        try:
            async with self._client_factory(timeout=30.0) as client:
                response = await client.post(
                    self.settings.openrouter_base_url,
                    headers={
                        "Authorization": f"Bearer {self.settings.openrouter_api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost",
                        "X-Title": "ScholarDocX Deep Hunt Relevance",
                    },
                    json=payload,
                )
                response.raise_for_status()
            data = response.json()
            # Charge tokens against the user's balance using admin-configured pricing.
            if ai_service is not None:
                usage = data.get("usage") or {}
                ai_service.charge_tokens(
                    model_id=self.settings.openrouter_free_model,
                    provider="openrouter",
                    input_tokens=int(usage.get("prompt_tokens", 0) or 0),
                    output_tokens=int(usage.get("completion_tokens", 0) or 0),
                    source="Deep Hunt · Relevance Filter",
                )
            parsed = extract_json_object(self._content(data))
            if parsed is None:
                return self._heuristic_scores(opportunities, field_synonyms, degree_level)
            return self._verdicts_to_scores(parsed, len(opportunities))
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            logger.info("Deep Hunt relevance filter fell back: %s", exc)
            return self._heuristic_scores(opportunities, field_synonyms, degree_level)

    def _build_prompt(self, goal: str, opportunities: List[Dict[str, Any]]) -> str:
        compact = [
            {
                "index": i,
                "name": opp.get("canonical_name"),
                "fields_of_study": opp.get("fields_of_study") or [],
                "degree_levels": opp.get("degree_levels") or [],
                "destinations": opp.get("destination_countries") or opp.get("destinations") or [],
                "funding": opp.get("funding") or {},
                "requirements": (opp.get("requirements") or [])[:3],
            }
            for i, opp in enumerate(opportunities)
        ]
        return (
            f"User funding goal: {goal}\n\n"
            f"Opportunities to judge:\n{json.dumps(compact, ensure_ascii=True)}\n\n"
            f"Return exactly {json.dumps(_RELEVANCE_SCHEMA_HINT, ensure_ascii=True)} "
            "with one entry per opportunity, in input order."
        )

    def _content(self, response_data: Dict[str, Any]) -> str:
        content = response_data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("OpenRouter content must be text.")
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
        return content

    def _verdicts_to_scores(self, parsed: Any, expected_count: int) -> List[float]:
        verdicts = parsed.get("verdicts") if isinstance(parsed, dict) else None
        if not isinstance(verdicts, list):
            return [0.5] * expected_count
        # Index the verdicts by their declared index so order drift is tolerated.
        by_index: Dict[int, float] = {}
        for entry in verdicts:
            if not isinstance(entry, dict):
                continue
            idx = entry.get("index")
            try:
                idx = int(idx)
            except (TypeError, ValueError):
                continue
            verdict = str(entry.get("verdict") or "").strip().upper()
            try:
                score = float(entry.get("relevance_score", 0.0))
            except (TypeError, ValueError):
                score = 0.0
            score = max(0.0, min(1.0, score))
            # RELEVANT floor so a low numeric typo does not silently drop a match.
            if verdict == "RELEVANT":
                score = max(score, 0.6)
            elif verdict == "OFF_TOPIC":
                score = min(score, 0.25)
            by_index[idx] = score
        return [by_index.get(i, 0.5) for i in range(expected_count)]

    def _heuristic_scores(
        self,
        opportunities: List[Dict[str, Any]],
        field_synonyms: Optional[List[str]],
        degree_level: Optional[str],
    ) -> List[float]:
        """Deterministic synonym/keyword match used when AI is unavailable.

        Mirrors the relevance prompt's field-first bias: 0.1 for a stated field
        with no overlap, 0.7 for a field overlap, 0.5 when the page states no
        field signal at all (plausible but unverified). SCHOLARDOCX-0177: an
        overlap inside a broad/umbrella listing (5+ stated fields spanning
        unrelated disciplines) scores 0.2 instead of 0.7 — the user's field is
        technically included, but a program that funds almost every discipline
        is not the close, field-specific match a synonym overlap normally
        signals.
        """
        synonyms = [s.casefold() for s in (field_synonyms or []) if s]
        scores: List[float] = []
        for opp in opportunities:
            fields = [
                str(f).casefold().strip()
                for f in (opp.get("fields_of_study") or [])
                if str(f).strip()
            ]
            if not fields:
                scores.append(0.5)
                continue
            if synonyms and _fields_overlap(synonyms, fields):
                scores.append(0.2 if len(fields) >= BROAD_FIELD_LIST_SIZE else 0.7)
            else:
                scores.append(0.1)
        return scores


def _field_tokens(text: str) -> set[str]:
    """Split a field-of-study string into lowercase alphanumeric word tokens.

    Used for matching so ``"Classics"`` -> {classics} does NOT accidentally match
    the CS group's ``"cs"`` (raw substring matching did — "cs" is in "classics").
    """
    cleaned = re.sub(r"[^a-z0-9]+", " ", (text or "").casefold()).strip()
    return {tok for tok in cleaned.split() if tok}


def _fields_overlap(synonyms: List[str], fields: List[str]) -> bool:
    """Return True iff any synonym token set shares a token with any field token
    set, OR a multi-word synonym is a full phrase in a field (or vice-versa).

    Token-set matching catches ``cs`` <-> ``computer science`` (no shared token
    unless the field literally contains the word "cs"); the phrase check catches
    ``"computer science"`` <-> ``"computer science and engineering"`` without
    leaking on short-abbreviation substrings like ``"cs" in "classics"``.
    """
    syn_phrase = {s.casefold().strip() for s in synonyms if s.strip()}
    fld_phrase = {f.casefold().strip() for f in fields if f.strip()}
    # Phrase containment (multi-word), but guard short phrases (<=2 chars) so
    # "cs"/"ai"/"me" do not substring-match "classics"/"brain"/"media".
    for s in syn_phrase:
        for f in fld_phrase:
            # Require BOTH phrases longer than 2 chars before allowing phrase
            # substring matching; otherwise short abbreviations ("cs","ai","me")
            # leak into unrelated words ("cs" is in "classics", "ai" in "brain").
            if min(len(s), len(f)) > 2 and (s in f or f in s):
                return True
    # Token-set intersection.
    syn_tokens: set[str] = set()
    for s in syn_phrase:
        syn_tokens |= _field_tokens(s)
    for f in fld_phrase:
        if syn_tokens & _field_tokens(f):
            return True
    return False


def _heuristic_field_synonyms(field_of_study: Optional[str]) -> List[str]:
    """Tiny built-in synonym map for the common STEM/business fields so the
    deterministic relevance fallback still recognises variants when the planner
    AI is down. Not exhaustive — the planner's own ``field_synonyms`` is the
    primary source."""
    if not field_of_study:
        return []
    raw = field_of_study.strip()
    key = re.sub(r"[^a-z0-9]+", " ", raw.casefold()).strip()
    groups = {
        "computer science": ["computer science", "computer engineering", "computing", "cs", "cse", "software engineering", "artificial intelligence", "ai", "machine learning", "ml", "data science"],
        "computer engineering": ["computer engineering", "ce", "computer science", "cs", "cse", "electrical engineering"],
        "electrical engineering": ["electrical engineering", "ee", "electronics", "computer engineering"],
        "mechanical engineering": ["mechanical engineering", "me", "mechatronics"],
        "civil engineering": ["civil engineering", "construction"],
        "business": ["business", "business administration", "mba", "management", "finance"],
        "economics": ["economics", "finance", "economy"],
        "biology": ["biology", "biological sciences", "biotechnology", "life sciences"],
        "physics": ["physics", "applied physics"],
        "mathematics": ["mathematics", "math", "statistics", "applied mathematics"],
        "chemistry": ["chemistry", "chemical engineering"],
    }
    synonyms: List[str] = []
    for canonical, variants in groups.items():
        if key == canonical or _fields_overlap([raw], [*variants, canonical]):
            synonyms.extend([canonical, *variants])
            break
    if not synonyms:
        synonyms = [raw]
    # Dedup case-insensitively, preserve order.
    seen: set[str] = set()
    unique: List[str] = []
    for s in synonyms:
        k = s.casefold()
        if k not in seen:
            seen.add(k)
            unique.append(s)
    return unique


deep_hunt_query_planner = DeepHuntQueryPlanner()
deep_hunt_relevance_filter = DeepHuntRelevanceFilter()
