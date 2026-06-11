from __future__ import annotations

from datetime import datetime
import json
import re
from typing import Any

import httpx

from app.services.ai import AiService


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
        value = json.loads(text[start : end + 1])
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
    if isinstance(profile.get("keywords"), list):
        profile_text += " " + " ".join(profile["keywords"])
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
    if latest_year and latest_year < datetime.now().year - 3:
        risks.append("stale_visible_activity")
    if recruitment_state == "unknown":
        risks.append("recruitment_unverified")
    lane = (
        "Open or Funded Signals"
        if recruitment_state in {"confirmed_open", "strong_signal", "possible_opportunity"}
        else "Best Supported Matches"
        if match_score >= 75 and confidence >= 65
        else "High Potential"
        if match_score >= 65
        else "Explore Further"
        if match_score >= 45
        else "Not Recommended"
    )
    coverage = {
        "identity": "Strong" if candidate.get("official_profile_url") else "Partial",
        "research": "Strong" if len(combined) > 600 else "Partial",
        "publications": "Partial" if years else "Unavailable",
        "laboratory": "Partial" if " lab " in f" {combined.lower()} " else "Unavailable",
        "opportunity": "Strong" if open_signal else "Partial" if funded else "Unavailable",
        "application": "Partial" if profile.get("degree_target") else "Unavailable",
    }
    strongest = overlap[:6]
    why_match = (
        f"Shared research terms: {', '.join(strongest)}."
        if strongest
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
            "coverage": coverage,
            "risk_flags": risks,
        },
        "publications": _publication_fallback(sources, candidate, profile),
        "dossier": {
            "decision_snapshot": {
                "why_this_professor": why_match,
                "why_this_may_not_work": "Public evidence is incomplete." if risks else "No material mismatch was detected in available sources.",
                "recommended_next_action": "Read the recommended papers and verify current recruitment directly.",
                "urgency": "high" if recruitment_state == "confirmed_open" else "normal",
            },
            "research_bridge": {
                "summary": why_match,
                "shared_terms": strongest,
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
    publications = []
    seen = set()
    for item in sources:
        title = re.sub(r"\s+", " ", item.get("title", "")).strip()
        if not title or title.lower() in seen:
            continue
        text = f"{title} {item.get('content', '')}"
        if not any(word in text.lower() for word in ("paper", "publication", "journal", "conference", "doi", "research")):
            continue
        years = YEAR_PATTERN.findall(text)
        publications.append(
            {
                "title": title,
                "authors": [candidate["display_name"]],
                "publication_year": int(years[-1]) if years else None,
                "venue": None,
                "doi": None,
                "source_url": item.get("url"),
                "relevance_reason": "Publicly indexed source related to the professor's recent research.",
                "reading_priority": max(1, 5 - len(publications)),
            }
        )
        seen.add(title.lower())
        if len(publications) == 5:
            break
    return publications


async def analyze_with_glm(
    ai_service: AiService,
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
    profile: dict[str, Any],
) -> dict[str, Any] | None:
    if not ai_service.settings.glm_api_key:
        return None
    compact_sources = [
        {
            "source_id": index + 1,
            "title": item.get("title"),
            "url": item.get("url"),
            "excerpt": (item.get("content") or item.get("text") or "")[:1800],
        }
        for index, item in enumerate(sources[:10])
    ]
    schema = {
        "candidate": {
            "title": "string|null",
            "email": "string|null",
            "lab_name": "string|null",
            "lab_url": "string|null",
            "research_summary": "string",
            "match_score": "integer 0-100",
            "evidence_confidence": "integer 0-100",
            "recruitment_state": "confirmed_open|strong_signal|possible_opportunity|no_current_evidence|unknown",
            "recruitment_summary": "string",
            "decision_lane": "Best Supported Matches|High Potential|Open or Funded Signals|Explore Further|Needs Verification|Not Recommended",
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
        "You are the structured analysis engine for ScholarDock Advisor Atlas. "
        "Use only supplied sources. Never invent names, URLs, papers, grants, dates, "
        "students, openings, or lab facts. Funding alone can only support "
        "possible_opportunity, never confirmed_open. Return one JSON object only, "
        "matching the requested schema. Every uncertain area must be marked unknown "
        "or incomplete. Keep summaries concise."
    )
    prompt = (
        f"Candidate:\n{json.dumps(candidate)}\n\n"
        f"Student profile:\n{json.dumps(profile)}\n\n"
        f"Sources:\n{json.dumps(compact_sources)}\n\n"
        f"Required schema:\n{json.dumps(schema)}"
    )
    response = await ai_service.chat(
        prompt,
        model=ai_service.settings.advisor_atlas_glm_model,
        max_tokens=3000,
        override_system_prompt=system,
    )
    if response.get("mode") in {"local-fallback", "provider-error"}:
        return None
    return extract_json_object(response.get("answer", ""))


async def analyze_visual_source(
    ai_service: AiService,
    visual: dict[str, Any],
    candidate_name: str,
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
        "max_tokens": 1800,
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
    answer = (
        response.json()
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
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
