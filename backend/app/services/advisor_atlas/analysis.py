from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
from datetime import datetime, timezone
import json
import re
from typing import Any

import httpx

from app.services.ai import AiService
from app.services.advisor_atlas.intelligence import (
    opportunity_forecast,
    semantic_fallback,
)
from app.services.advisor_atlas.professor_research import (
    candidate_excerpt,
    discover_profile_links,
    estimate_tokens,
    extract_verified_professor_facts,
    is_scholarly_publication,
)


RECRUIT_OPEN = re.compile(
    r"\b(accepting|recruiting|seeking|looking for|open position|join (?:the|our) lab|"
    r"phd position|graduate student position|students? are encouraged to apply)\b",
    re.IGNORECASE,
)
RECRUIT_CLOSED = re.compile(
    r"\b(not accepting|not recruiting|no openings|positions? filled|on leave)\b",
    re.IGNORECASE,
)
FUNDING_SIGNAL = re.compile(
    r"\b(grant|funded|funding|award|project vacancy|research assistant|studentship)\b",
    re.IGNORECASE,
)
YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")


def tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9+-]{2,}", text.lower())
        if token not in {
            "the", "and", "for", "with", "from", "that", "this", "university",
            "research", "professor", "department", "student", "students",
        }
    }


def extract_json_object(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = safe_json_loads(text[start : end + 1], default={})
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def deterministic_analysis(
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
    profile: dict[str, Any],
) -> dict[str, Any]:
    combined = " ".join(
        f"{item.get('title', '')} {item.get('content', '')} {item.get('text', '')}"
        for item in sources
    )
    profile_text = " ".join(
        str(value)
        for value in profile.values()
        if value and not isinstance(value, (dict, list))
    )
    if isinstance(profile.get("interests"), list):
        profile_text += " " + " ".join(profile["interests"])
    source_tokens = tokenize(combined)
    profile_tokens = tokenize(profile_text)
    overlap = sorted(source_tokens & profile_tokens)
    match_score = min(95, 30 + len(overlap) * 8) if profile_tokens else 55
    official_count = sum(
        1 for item in sources if candidate.get("institution", "").lower().split()[0:1]
        and candidate.get("institution", "").lower().split()[0] in item.get("url", "").lower()
    )
    confidence = min(95, 35 + len(sources) * 7 + official_count * 5)
    closed = bool(RECRUIT_CLOSED.search(combined))
    open_signal = bool(RECRUIT_OPEN.search(combined))
    funded = bool(FUNDING_SIGNAL.search(combined))
    if closed:
        recruitment_state = "no_current_evidence"
        recruitment_summary = "A public source contains a no-opening or leave signal."
    elif open_signal:
        recruitment_state = "confirmed_open"
        recruitment_summary = "A public source contains explicit recruiting language."
    elif funded:
        recruitment_state = "possible_opportunity"
        recruitment_summary = "Funding or project activity was found, but no explicit student opening was verified."
    else:
        recruitment_state = "unknown"
        recruitment_summary = "No current recruiting statement was verified."

    years = [int(value) for value in YEAR_PATTERN.findall(combined)]
    latest_year = max(years) if years else None
    risks = []
    if len(sources) < 2:
        risks.append("limited_source_coverage")
    if latest_year and latest_year < datetime.now(timezone.utc).year - 3:
        risks.append("stale_visible_activity")
    if recruitment_state == "unknown":
        risks.append("recruitment_unverified")
    coverage = {
        "identity": "Strong" if candidate.get("official_profile_url") else "Partial",
        "research": "Strong" if len(combined) > 600 else "Partial",
        "publications": "Partial" if years else "Unavailable",
        "laboratory": "Partial" if " lab " in f" {combined.lower()} " else "Unavailable",
        "opportunity": "Strong" if open_signal else "Partial" if funded else "Unavailable",
        "application": "Partial" if profile.get("degree_target") else "Unavailable",
    }
    strongest = overlap[:6]
    semantic = semantic_fallback(profile.get("interests", []), combined)
    verified = extract_verified_professor_facts(candidate, sources)
    academic_profiles = verified.get("profiles") or discover_profile_links(
        sources, candidate["display_name"]
    )
    match_score = semantic["semantic_score"]
    forecast = opportunity_forecast(combined, recruitment_state, confidence)
    lane = (
        "Open or Funded Signals"
        if semantic["is_research_match"] and forecast["status"] in {
            "current_open", "high_likelihood", "possible",
        }
        else "Best Supported Matches"
        if match_score >= 75 and confidence >= 65
        else "High Potential"
        if match_score >= 65
        else "Explore Further"
        if match_score >= 45
        else "Not Recommended"
    )
    why_match = (
        " ".join(semantic["match_reasons"][:2])
        if semantic["match_reasons"]
        else "The public profile is relevant to the selected department, but the research bridge needs verification."
    )
    return {
        "candidate": {
            **candidate,
            "research_summary": combined[:700].strip() or "No public research summary was extracted.",
            "match_score": match_score,
            "evidence_confidence": confidence,
            "recruitment_state": recruitment_state,
            "recruitment_summary": recruitment_summary,
            "decision_lane": lane,
            "intelligence": {
                **semantic,
                "department_relation": candidate.get("department_relation", {}),
                "opportunity_outlook": forecast,
                "background": {
                    **verified.get("background", {}),
                },
                "funding": {
                    "summary": recruitment_summary if funded else "No recent funding was verified.",
                    "items": [],
                },
                "lab_members": {
                    "summary": "Public lab-member details were not reliably extracted.",
                    "members": [],
                },
                "academic_profiles": academic_profiles,
                "research_interests": {
                    **(
                        verified.get("research_interests")
                        or {
                            "summary": "Research interests were not verified.",
                            "themes": [],
                            "methods": [],
                            "applications": [],
                        }
                    ),
                },
                "contact": {
                    "email": candidate.get("email"),
                    "application_path": "Confirm current openings through an official professor or lab page.",
                },
                "collaborations": {"summary": "No collaborations were reliably extracted.", "items": []},
                "recent_activity": verified.get("recent_activity")
                or {"summary": "Recent visible activity requires verification.", "items": []},
                "source_gaps": risks,
            },
            "coverage": coverage,
            "risk_flags": risks,
        },
        "publications": verified.get("publications") or _publication_fallback(
            sources, candidate, profile
        ),
        "dossier": {
            "decision_snapshot": {
                "recommendation": lane,
                "fit_summary": why_match,
                "strongest_evidence": semantic["match_reasons"][:3],
                "key_risks": risks,
                "next_action": "Read the latest verified papers and confirm current recruitment directly.",
                "why_this_professor": why_match,
                "why_this_may_not_work": "Public evidence is incomplete." if risks else "No material mismatch was detected in available sources.",
                "recommended_next_action": "Read the recommended papers and verify current recruitment directly.",
                "urgency": "high" if recruitment_state == "confirmed_open" else "normal",
            },
            "research_bridge": {
                "summary": why_match,
                "shared_terms": semantic["matched_interests"],
                "evidence_limit": "Generated from available public source text.",
            },
            "method_bridge": {
                "matching_methods": strongest,
                "missing_methods": [],
                "preparation_note": "Compare the lab's current methods with your demonstrated experience.",
            },
            "lab_environment": {
                "summary": "Lab information is shown only when supported by public pages.",
                "known": "lab" in combined.lower(),
                "limitations": ["Mentoring quality and private lab culture cannot be inferred reliably."],
            },
            "trajectory": {
                "latest_visible_year": latest_year,
                "summary": "Recent direction is inferred from visible public projects and publications.",
                "opportunity_outlook": forecast,
            },
            "application_fit": {
                "degree_target": profile.get("degree_target"),
                "intake_term": profile.get("intake_term"),
                "readiness": "small_gaps" if match_score >= 65 else "needs_review",
                "gaps": risks,
            },
            "verification_questions": [
                "Are you accepting new graduate students for the intended intake?",
                "Which current project best aligns with the proposed research direction?",
                "What preparation or methods would strengthen this application?",
            ],
            "next_actions": [
                {"type": "read", "label": "Read the top recommended paper"},
                {"type": "verify", "label": "Verify current openings on the official lab or department page"},
                {"type": "prepare", "label": "Write a two-sentence research bridge before outreach"},
            ],
        },
    }


def _publication_fallback(
    sources: list[dict[str, Any]],
    candidate: dict[str, Any],
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    return extract_verified_professor_facts(candidate, sources).get("publications", [])


async def analyze_with_glm(
    ai_service: AiService,
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
    profile: dict[str, Any],
    specialist_context: dict[str, Any] | None = None,
    usage: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not ai_service.settings.glm_api_key:
        return None
    compact_sources = [
        {
            "source_id": index + 1,
            "title": item.get("title"),
            "url": item.get("url"),
            "purpose": item.get("source_kind"),
            "excerpt": candidate_excerpt(
                item.get("content") or item.get("text") or "",
                candidate["display_name"],
                2600,
            ),
        }
        for index, item in enumerate(sources[:26])
    ]
    schema = {
        "candidate": {
            "title": "string|null",
            "email": "string|null",
            "lab_name": "string|null",
            "lab_url": "string|null",
            "personal_url": "string|null",
            "linkedin_url": "string|null",
            "google_scholar_url": "string|null",
            "recent_funds": "string|null",
            "lab_students_summary": "string|null",
            "research_summary": "string",
            "match_score": "integer 0-100",
            "evidence_confidence": "integer 0-100",
            "recruitment_state": "confirmed_open|strong_signal|possible_opportunity|no_current_evidence|unknown",
            "recruitment_summary": "string",
            "decision_lane": "Best Supported Matches|High Potential|Open or Funded Signals|Explore Further|Needs Verification|Not Recommended",
            "intelligence": {
                "is_research_match": "boolean",
                "semantic_score": "integer 0-100",
                "matched_interests": ["string"],
                "match_reasons": ["string"],
                "matching_method": "glm_semantic",
                "matching_limitation": "string",
                "department_relation": "object copied from candidate when supplied",
                "opportunity_outlook": {
                    "status": "current_open|high_likelihood|possible|low_likelihood|unknown",
                    "likelihood": "integer 0-100",
                    "confidence": "integer 0-100",
                    "likely_semesters": ["next three academic semesters"],
                    "signals": ["string"],
                    "counter_signals": ["string"],
                    "limitation": "string",
                },
                "background": {
                    "summary": "string",
                    "positions": ["string"],
                    "education": ["string"],
                },
                "funding": {"summary": "string", "items": ["object"]},
                "lab_members": {"summary": "string", "members": ["object"]},
                "research_interests": {
                    "summary": "string",
                    "themes": ["string"],
                    "methods": ["string"],
                    "applications": ["string"],
                },
                "academic_profiles": {
                    "official_profile_url": "string|null",
                    "personal_url": "string|null",
                    "linkedin_url": "string|null",
                    "google_scholar_url": "string|null",
                    "orcid_url": "string|null",
                    "semantic_scholar_url": "string|null",
                    "researchgate_url": "string|null",
                    "other_profiles": ["object"],
                },
                "contact": "object with verified email and application path",
                "collaborations": {"summary": "string", "items": ["object"]},
                "recent_activity": {"summary": "string", "items": ["object"]},
                "source_gaps": ["string"],
            },
            "coverage": "object with Identity/Research/Publications/Laboratory/Opportunity/Application values",
            "risk_flags": ["string"],
        },
        "publications": [
            {
                "title": "string",
                "authors": ["string"],
                "publication_year": "integer|null",
                "venue": "string|null",
                "doi": "string|null",
                "source_url": "source URL",
                "relevance_reason": "string",
                "reading_priority": "integer 1-5",
            }
        ],
        "dossier": {
            "decision_snapshot": "object",
            "research_bridge": "object",
            "method_bridge": "object",
            "lab_environment": "object",
            "trajectory": "object",
            "application_fit": "object",
            "verification_questions": ["string"],
            "next_actions": [{"type": "read|verify|prepare|monitor|contact", "label": "string"}],
        },
    }
    system = (
        "You are the structured analysis engine for ScholarDocX Advisor Atlas. "
        "Use only supplied sources. Never invent names, URLs, papers, grants, dates, "
        "students, openings, or lab facts. "
        "Separate identity, profiles, research, publications, funding, lab, contact, "
        "collaboration, and recruitment evidence. A publication must be an actual "
        "scholarly work; never return a faculty page, recruitment advertisement, "
        "search page, or professor biography as a publication. Every publication "
        "must visibly name this professor as an author. "
        "Evaluate research similarity by meaning, methods, research problems, and application areas, "
        "not exact wording. Mark is_research_match true only when at least one student interest has "
        "a defensible semantic bridge. Forecast the next three academic semesters separately from "
        "current recruitment and explain signals, counter-signals, confidence, and limitations. "
        "Funding alone can only support possible_opportunity, never confirmed_open. "
        "Return one JSON object only, matching the requested schema. "
        "Every uncertain area must be marked unknown or incomplete. Keep summaries concise."
    )
    prompt = (
        f"Candidate:\n{json.dumps(candidate)}\n\n"
        f"Student profile:\n{json.dumps(profile)}\n\n"
        f"Specialist analyses:\n{json.dumps(specialist_context or {})}\n\n"
        f"Sources:\n{json.dumps(compact_sources)}\n\n"
        f"Required schema:\n{json.dumps(schema)}"
    )
    response = await ai_service.chat(
        prompt,
        model=ai_service.settings.advisor_atlas_glm_model,
        override_system_prompt=system,
        request_label="Advisor Atlas · Final Synthesis",
    )
    _record_ai_usage(usage, system, prompt, response.get("answer", ""))
    if response.get("mode") in {"local-fallback", "provider-error"}:
        return None
    return extract_json_object(response.get("answer", ""))


async def analyze_professor_specialists(
    ai_service: AiService,
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
    profile: dict[str, Any],
    usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not ai_service.settings.glm_api_key:
        return {}
    passes = [
        (
            "identity_research",
            "Advisor Atlas · Identity & Research",
            {"identity", "profiles", "research", "official_profile", "news_activity"},
            (
                "Extract verified identity/background, all professional or academic profile URLs, "
                "research themes, methods, applications, lab identity, contact/application path, "
                "collaborations, and recent activity. Return JSON only. Unknown values must be null "
                "or empty arrays."
            ),
        ),
        (
            "publications",
            "Advisor Atlas · Publications",
            {"publications", "scholar_metrics", "research", "official_profile"},
            (
                "Extract the latest 5 to 8 actual scholarly publications with visible authorship "
                "by this professor, plus any verifiable citation or scholarly-index evidence. "
                "Reject recruitment ads, faculty pages, and search pages as publications. "
                "Return JSON only and keep source URLs attached to every item."
            ),
        ),
        (
            "funding_recruitment",
            "Advisor Atlas · Funding & Recruitment",
            {"funding", "recruitment", "news_activity", "official_profile"},
            (
                "Extract structured grants/funding (funder, project, period, amount or status, "
                "source), lab members, explicit current recruitment statements, and evidence-based "
                "future opportunity signals with counter-signals. Funding alone never proves a "
                "current opening. Return JSON only and keep source URLs attached to every item."
            ),
        ),
    ]
    results: dict[str, Any] = {}
    for key, request_label, kinds, instruction in passes:
        selected = [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "purpose": item.get("source_kind"),
                "excerpt": candidate_excerpt(
                    item.get("content") or item.get("text") or "",
                    candidate["display_name"],
                    3000,
                ),
            }
            for item in sources
            if item.get("source_kind") in kinds
        ][:20]
        if not selected:
            continue
        system = (
            "You are a rigorous academic web-research specialist. Use only supplied evidence. "
            "Do not infer facts that are not visible. Preserve source URLs. " + instruction
        )
        prompt = (
            f"Professor:\n{json.dumps(candidate)}\n\n"
            f"Student context:\n{json.dumps(profile)}\n\n"
            f"Purpose-tagged sources:\n{json.dumps(selected)}"
        )
        response = await ai_service.chat(
            prompt,
            model=ai_service.settings.advisor_atlas_glm_model,
            override_system_prompt=system,
            request_label=request_label,
        )
        _record_ai_usage(usage, system, prompt, response.get("answer", ""))
        parsed = extract_json_object(response.get("answer", ""))
        if parsed:
            results[key] = parsed
    return results


def _record_ai_usage(
    usage: dict[str, Any] | None,
    system: str,
    prompt: str,
    answer: str,
) -> None:
    if usage is None:
        return
    usage["ai_calls"] = int(usage.get("ai_calls", 0)) + 1
    usage["estimated_input_tokens"] = int(usage.get("estimated_input_tokens", 0)) + estimate_tokens(
        f"{system}\n{prompt}"
    )
    usage["estimated_output_tokens"] = int(usage.get("estimated_output_tokens", 0)) + estimate_tokens(answer)


async def analyze_visual_source(
    ai_service: AiService,
    visual: dict[str, Any],
    candidate_name: str,
    usage: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not ai_service.settings.glm_api_key:
        return None
    prompt = (
        f"Inspect this public visual source only for evidence about {candidate_name}. "
        "Extract visible research topics, project or grant text, lab or student "
        "information, publication details, and explicit recruiting language. "
        "Do not infer an opening from funding or activity alone. Return JSON only: "
        '{"relevant": boolean, "extracted_text": string, "evidence_types": [string], '
        '"limitations": [string]}.'
    )
    payload = {
        "model": ai_service.settings.advisor_atlas_vision_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": visual["url"]}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "thinking": {"type": "enabled"},
        "temperature": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {ai_service.settings.glm_api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                ai_service.settings.glm_base_url,
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPError:
        return None
    data = response.json()
    answer = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    _record_ai_usage(usage, "", prompt, answer)
    # Meter the vision call against the central token balance. OpenAI-compatible
    # GLM responses carry prompt/completion token counts. Charge-after (no
    # pre-check) so an optional enrichment never aborts a run; the next required
    # call hard-stops if the balance is truly exhausted.
    usage_meta = data.get("usage") or {}
    ai_service.charge_tokens(
        model_id=ai_service.settings.advisor_atlas_vision_model,
        provider="glm",
        input_tokens=usage_meta.get("prompt_tokens", 0),
        output_tokens=usage_meta.get("completion_tokens", 0),
        source="advisor_atlas_vision",
    )
    result = extract_json_object(answer)
    if not result or not result.get("relevant"):
        return None
    extracted_text = str(result.get("extracted_text", "")).strip()
    if not extracted_text:
        return None
    return {
        "title": f"Visual evidence for {candidate_name}",
        "url": visual["url"],
        "content": extracted_text[:5000],
        "source_kind": "vision",
        "visual_metadata": {
            "content_type": visual.get("content_type"),
            "size_bytes": visual.get("size_bytes"),
            "evidence_types": result.get("evidence_types", []),
            "limitations": result.get("limitations", []),
            "model": ai_service.settings.advisor_atlas_vision_model,
        },
    }


async def map_related_units_with_glm(
    ai_service: AiService,
    university_name: str,
    requested_field: str,
    observed_units: list[str] | None = None,
    usage: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Map `field + university` to related academic units (FR-9.25a).

    This is the PRIMARY related-unit mapper. It replaced a hardcoded five-family
    taxonomy that returned zero related units for any discipline outside
    computing/EE/HCI/bioinformatics/statistics — chemistry, economics, public
    health and most of academia received only their own department, which
    collapsed the entire discovery funnel because `collect()` searches and crawls
    per mapped unit (SCHOLARDOCX-0181).

    Returns ``None`` on any failure so the caller falls back to the deterministic
    regex + taxonomy path and discovery is never worse than before.
    """
    if not ai_service.settings.glm_api_key:
        return None
    field = (requested_field or "").strip()
    if not field:
        return None

    system = (
        "You map university academic structures for a PhD-advisor discovery tool. "
        "You know that related advisors are frequently housed outside the "
        "applicant's named department — in adjacent departments, interdisciplinary "
        "institutes, and research centres. Return one JSON object only. Never "
        "invent a unit you do not believe plausibly exists at this university; "
        "prefer widely-standard unit names when unsure."
    )
    schema = {
        "units": [
            {
                "name": "string, the academic unit name without the university name",
                "relation": "direct|adjacent|interdisciplinary",
                "relevance_score": "integer 50-100",
                "reason": "one short sentence on why a relevant advisor may sit here",
            }
        ]
    }
    prompt = (
        f"University: {university_name or 'unspecified'}\n"
        f"Applicant's field: {field}\n"
        f"Units already observed on the site: {json.dumps(sorted(set(observed_units or []))[:40])}\n\n"
        "List up to 12 academic units at this university where a professor "
        f"researching {field} could plausibly be found. Include the applicant's own "
        "department, closely adjacent departments, and interdisciplinary institutes "
        "or centres. Use 'direct' only when the unit name names the field itself.\n\n"
        f"Required schema:\n{json.dumps(schema)}"
    )

    response = await ai_service.chat(
        prompt,
        model=ai_service.settings.advisor_atlas_glm_model,
        override_system_prompt=system,
        request_label="Advisor Atlas · Unit Mapping",
    )
    _record_ai_usage(usage, system, prompt, response.get("answer", ""))
    if response.get("mode") in {"local-fallback", "provider-error"}:
        return None

    parsed = extract_json_object(response.get("answer", ""))
    if not isinstance(parsed, dict):
        return None
    raw_units = parsed.get("units")
    if not isinstance(raw_units, list):
        return None

    units: list[dict[str, Any]] = []
    for entry in raw_units[:12]:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name or len(name) > 100:
            continue
        relation = str(entry.get("relation") or "adjacent").strip().lower()
        if relation not in {"direct", "adjacent", "interdisciplinary"}:
            relation = "adjacent"
        try:
            score = int(entry.get("relevance_score") or 70)
        except (TypeError, ValueError):
            score = 70
        units.append(
            {
                "name": name,
                "relation": relation,
                "relevance_score": max(50, min(100, score)),
                "reason": str(entry.get("reason") or "").strip()
                or "Identified as academically related to the requested field.",
                "source_url": None,
            }
        )
    return units or None
