"""Structured scholarship opportunity extraction ("Analyze", Phase 1 of the
Scholarship Hunt pipeline).

One AI call turns a Hunt result card's URL/title/snippet into a structured
opportunity. Provider shape: the token-metered configured provider (via
``AiService``, same default-provider chain and billing as `/ai/chat`) runs
first; an unmetered OpenRouter Free call with a strict JSON contract is the
fallback
when the configured provider is unavailable or returns unusable output.
Fields the source text does not support must stay empty — never invented.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

import httpx

from app.core.config import Settings, get_settings
from app.services.ai import AiService
from app.services.advisor_atlas.analysis import extract_json_object

EXTRACTION_SYSTEM_PROMPT = """You extract structured scholarship/funding-opportunity facts from one web page's title, URL, and snippet/excerpt.
Return only JSON matching the requested schema.

Rules:
- Use only information present in the supplied text. Never infer, guess, or invent a deadline, amount, sponsor, or eligibility fact that is not stated.
- If a field is not supported by the supplied text, set it to null (or an empty array/object for list/object fields) rather than guessing.
- SPONSOR ACCURACY: "sponsor" is the organization that actually funds or administers the SPECIFIC opportunity described, and only when the text explicitly says so. Many pages are third-party listing, directory, or database sites that describe or aggregate scholarships funded by other organizations (for example, a national exchange agency's public scholarship database routinely lists programs it does not itself fund). Do not name the hosting or listing site as the sponsor just because its name, logo, or navigation text appears on the page — only when the text states that organization funds or administers this specific opportunity. When the true funder is unclear or unstated, leave sponsor null rather than guessing from the domain or branding.
- APPLICATION URL ACCURACY: "application_url" must be a specific application or official-information page named in the text. Do not assume the current page itself is the official application portal for a program that a different organization administers — leave it null if the text does not name one.
- For every non-null field you return, include a confidence score from 0 to 1 in "field_confidence" reflecting how directly the text supports that value.
- Deadlines must be actual stated dates or date ranges, not assumed application cycles.
- Do not include commentary, markdown, or text outside the JSON object."""

EXTRACTION_SCHEMA_HINT = {
    "name": "string or null",
    "sponsor": "string or null",
    "degree_levels": ["bachelor's|master's|phd|postdoctoral|short course, ... or []"],
    "fields_of_study": ["computer science|engineering|physics|business|..., ... or []"],
    "destination_countries": ["string, ..."],
    "eligible_nationalities": ["string, ..."],
    "funding": {"coverage": "full|partial|null", "notes": "string or null"},
    "deadlines": [{"date": "YYYY-MM-DD or free text", "label": "string or null"}],
    "requirements": ["string, ..."],
    "application_url": "string or null",
    "field_confidence": {"<field name>": "0.0-1.0"},
}

_EMPTY_RESULT: Dict[str, Any] = {
    "canonical_name": None,
    "sponsor": None,
    "degree_levels": [],
    "fields_of_study": [],
    "destination_countries": [],
    "eligible_nationalities": [],
    "funding": {},
    "deadlines": [],
    "requirements": [],
    "application_url": None,
    "field_confidence": {},
    "extraction_source": "none",
}


class ScholarshipExtractionService:
    def __init__(
        self,
        settings: Optional[Settings] = None,
        client_factory=None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client_factory = client_factory or httpx.AsyncClient

    async def extract(
        self,
        ai_service: AiService,
        *,
        source_url: str,
        source_title: str,
        source_snippet: str,
    ) -> Dict[str, Any]:
        prompt = self._build_prompt(source_url, source_title, source_snippet)

        response = await ai_service.chat(
            prompt,
            override_system_prompt=EXTRACTION_SYSTEM_PROMPT,
            request_label="Scholarship Hunt · Opportunity Extraction",
        )
        if response.get("mode") not in {"local-fallback", "provider-error"}:
            parsed = extract_json_object(response.get("answer", "") or "")
            if parsed is not None:
                return self._normalize(parsed, source="configured_provider")

        parsed = await self._openrouter_fallback(prompt)
        if parsed is not None:
            return self._normalize(parsed, source="openrouter_fallback")

        return dict(_EMPTY_RESULT)

    def _build_prompt(self, source_url: str, source_title: str, source_snippet: str) -> str:
        return (
            f"Page URL: {source_url}\n"
            f"Page title: {source_title}\n"
            f"Page snippet/excerpt:\n{source_snippet}\n\n"
            f"Required schema:\n{json.dumps(EXTRACTION_SCHEMA_HINT)}"
        )

    async def _openrouter_fallback(self, prompt: str) -> Optional[Dict[str, Any]]:
        if not self.settings.openrouter_api_key:
            return None
        payload = {
            "model": self.settings.openrouter_free_model,
            "messages": [
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_completion_tokens": 900,
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
                        "X-Title": "ScholarDocX Scholarship Hunt",
                    },
                    json=payload,
                )
                response.raise_for_status()
            response_data = response.json()
            content = response_data["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                return None
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
            return extract_json_object(content)
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None

    def _normalize(self, parsed: Dict[str, Any], *, source: str) -> Dict[str, Any]:
        def _str_list(value: Any) -> list[str]:
            if not isinstance(value, list):
                return []
            return [str(v).strip() for v in value if str(v).strip()]

        funding = parsed.get("funding")
        funding = funding if isinstance(funding, dict) else {}

        deadlines = parsed.get("deadlines")
        deadlines = [
            {"date": str(d.get("date") or "").strip(), "label": str(d.get("label") or "").strip() or None}
            for d in deadlines
            if isinstance(d, dict) and str(d.get("date") or "").strip()
        ] if isinstance(deadlines, list) else []

        confidence = parsed.get("field_confidence")
        confidence = (
            {str(k): float(v) for k, v in confidence.items() if isinstance(v, (int, float))}
            if isinstance(confidence, dict)
            else {}
        )

        name = parsed.get("name")
        application_url = parsed.get("application_url")

        return {
            "canonical_name": str(name).strip() if isinstance(name, str) and name.strip() else None,
            "sponsor": str(parsed.get("sponsor")).strip() if isinstance(parsed.get("sponsor"), str) and parsed.get("sponsor", "").strip() else None,
            "degree_levels": _str_list(parsed.get("degree_levels")),
            "fields_of_study": _str_list(parsed.get("fields_of_study")),
            "destination_countries": _str_list(parsed.get("destination_countries")),
            "eligible_nationalities": _str_list(parsed.get("eligible_nationalities")),
            "funding": funding,
            "deadlines": deadlines,
            "requirements": _str_list(parsed.get("requirements")),
            "application_url": str(application_url).strip() if isinstance(application_url, str) and application_url.strip() else None,
            "field_confidence": confidence,
            "extraction_source": source,
        }


scholarship_extraction_service = ScholarshipExtractionService()
