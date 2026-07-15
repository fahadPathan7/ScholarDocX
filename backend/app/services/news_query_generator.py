from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
import json
import re
from datetime import date
from typing import Any, Callable, Dict, Optional

import httpx

from app.core.config import Settings, get_settings
from app.services.news_service import (
    MAX_TAVILY_QUERY_LENGTH,
    NewsService,
    _scholarship_aliases,
    news_service,
)


QUERY_GENERATOR_SYSTEM_PROMPT = """You create one precise public-web search query for scholarship discovery.
Return only JSON matching the requested schema.

Rules:
- Preserve every selected filter dimension. Values within one dimension are alternatives; dimensions combine.
- A country or region is the STUDY DESTINATION, never applicant nationality.
- Prefer official university, government, scholarship, and foundation application pages, then strong scholarship directories or reputable guides when official sources are scarce.
- Search only open or upcoming opportunities with future application deadlines.
- Exclude closed, expired, archived, and past-cycle opportunities.
- Keep the query natural, concise, and useful to a web search engine.
- Include high-signal scholarship intent words such as scholarship, fellowship, grant, funding, assistantship, stipend, tuition waiver, application, deadline, or admissions when they fit the selected filters.
- Favor wording that surfaces application, eligibility, funding, and deadline pages rather than generic news, rankings, or unrelated blog chatter.
- When a named scholarship is selected, keep the exact scholarship name verbatim and prioritize that name over generic funding terms.
- When a degree level, field, season, or destination is selected, keep those constraints explicit in the query text.
- Use the current date or target cycle naturally so the query biases toward the current and next application cycles.
- Do not add filters the user did not select.
- Do not include commentary, markdown, or URLs."""


def _normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _selected_values(filters: Dict[str, Any], key: str) -> list[str]:
    return [
        str(value).strip()
        for value in filters.get(key) or []
        if str(value).strip()
    ]


class ScholarshipQueryGenerator:
    def __init__(
        self,
        settings: Optional[Settings] = None,
        fallback_service: Optional[NewsService] = None,
        client_factory: Optional[Callable[..., Any]] = None,
        today_provider: Optional[Callable[[], date]] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.fallback_service = fallback_service or news_service
        self._client_factory = client_factory or httpx.AsyncClient
        self._today_provider = today_provider or date.today

    async def generate(self, filters: Dict[str, Any]) -> Dict[str, str]:
        fallback_query = self.fallback_service.build_search_query(**filters)
        if not self.settings.openrouter_api_key:
            return self._fallback(fallback_query, "OpenRouter is not configured.")

        today = self._today_provider()
        prompt = self._build_prompt(filters, fallback_query, today)
        payload = {
            "model": self.settings.openrouter_free_model,
            "messages": [
                {"role": "system", "content": QUERY_GENERATOR_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            # Some free-router models spend tokens on hidden reasoning even when
            # reasoning is disabled. Leave enough room for the tiny JSON answer.
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
            usage_meta = response_data.get("usage") or {}
            usage = {
                "input_tokens": int(usage_meta.get("prompt_tokens", 0) or 0),
                "output_tokens": int(usage_meta.get("completion_tokens", 0) or 0),
            }
            query = self._extract_query(response_data)
            query = self._seal_constraints(query, filters, today)
            if not self._is_valid_query(query, filters, today):
                return self._fallback(
                    fallback_query,
                    "AI output missed a required search constraint.",
                    usage=usage,
                )
            return {
                "query": query,
                "source": "openrouter",
                "model": str(response_data.get("model") or self.settings.openrouter_free_model),
                "notice": "",
                "usage": usage,
            }
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return self._fallback(
                fallback_query,
                "OpenRouter could not generate a valid query.",
            )

    def _build_prompt(
        self,
        filters: Dict[str, Any],
        fallback_query: str,
        today: date,
    ) -> str:
        selected = {
            key: values
            for key in (
                "levels",
                "popular_scholarships",
                "countries",
                "fields_of_study",
                "funding_types",
                "seasons",
                "years",
            )
            if (values := _selected_values(filters, key))
        }
        custom_prompt = filters.get("custom_prompt")
        
        prompt_lines = [
            f"Current date: {today.isoformat()}",
            f"Target application cycles: {today.year}-{today.year + 1} and later",
        ]
        
        if custom_prompt:
            prompt_lines.append(f"User's custom search intent: {custom_prompt}")
        elif selected:
            prompt_lines.append(f"Selected filters: {json.dumps(selected, ensure_ascii=True, sort_keys=True)}")
            
        prompt_lines.append(f"Safe baseline query: {fallback_query}\n")
        prompt_lines.append(
            "Improve the baseline into one strong public-web query for Scholarship Hunt. "
            "Keep destination names and named scholarship names verbatim. Prefer wording "
            "that finds application pages, official program pages, scholarship portals, "
            "eligibility details, and deadline pages. Include the current date or target "
            "cycle, future/open deadline intent, and the literal exclusion words closed, "
            "expired, and past. Keep it compact enough for Tavily search and return "
            "exactly {\"query\":\"your query\"}."
        )
        return "\n".join(prompt_lines)

    def _extract_query(self, response_data: Dict[str, Any]) -> str:
        content = response_data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("OpenRouter content must be text.")
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
        parsed = safe_json_loads(content, default={})
        query = re.sub(r"\s+", " ", str(parsed["query"])).strip()
        return query

    def _seal_constraints(
        self,
        query: str,
        filters: Dict[str, Any],
        today: date,
    ) -> str:
        normalized_query = _normalized(query)
        additions = []
        dimensions = (
            ("levels", "degree"),
            ("countries", "study destination"),
            ("fields_of_study", "study field"),
            ("funding_types", "funding"),
            ("seasons", "intake"),
            ("years", "year"),
        )
        for key, label in dimensions:
            values = _selected_values(filters, key)
            if values and not any(_normalized(value) in normalized_query for value in values):
                additions.append(f"{label}: {' or '.join(values)}")

        scholarships = _selected_values(filters, "popular_scholarships")
        scholarship_names = [
            aliases[0]
            for scholarship in scholarships
            if (aliases := _scholarship_aliases(scholarship))
        ]
        if scholarship_names and not any(
            _normalized(name) in normalized_query for name in scholarship_names
        ):
            additions.append(f"scholarship: {' or '.join(scholarship_names)}")

        if not (
            str(today.year) in query
            or str(today.year + 1) in query
            or today.isoformat() in query
        ):
            additions.append(f"{today.year}-{today.year + 1} cycle")
        if not any(
            term in normalized_query
            for term in ("open", "upcoming", "apply", "application", "deadline")
        ):
            additions.append("open applications with future deadlines")
        if not all(term in normalized_query for term in ("closed", "expired", "past")):
            additions.append("exclude closed, expired, and past opportunities")

        if not additions:
            return query[:MAX_TAVILY_QUERY_LENGTH].rstrip()

        suffix = "; " + "; ".join(additions)
        available = MAX_TAVILY_QUERY_LENGTH - len(suffix)
        if available < 3:
            return ""
        core = query[:available].rstrip(" ,;")
        if len(query) > available and " " in core:
            core = core.rsplit(" ", 1)[0].rstrip(" ,;")
        return f"{core}{suffix}"[:MAX_TAVILY_QUERY_LENGTH].rstrip()

    def _is_valid_query(
        self,
        query: str,
        filters: Dict[str, Any],
        today: date,
    ) -> bool:
        if not 3 <= len(query) <= MAX_TAVILY_QUERY_LENGTH:
            return False
        normalized_query = _normalized(query)
        if not (
            str(today.year) in query
            or str(today.year + 1) in query
            or today.isoformat() in query
        ):
            return False
        if not any(
            term in normalized_query
            for term in ("open", "upcoming", "apply", "application", "deadline")
        ):
            return False
        if not any(term in normalized_query for term in ("closed", "expired", "past")):
            return False

        destinations = _selected_values(filters, "countries")
        if destinations and not any(_normalized(value) in normalized_query for value in destinations):
            return False

        scholarships = _selected_values(filters, "popular_scholarships")
        for scholarship in scholarships:
            aliases = _scholarship_aliases(scholarship)
            if aliases and not any(_normalized(alias) in normalized_query for alias in aliases):
                return False
        return True

    def _fallback(self, query: str, notice: str, usage: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
        return {
            "query": query,
            "source": "fallback",
            "model": "",
            "notice": notice,
            "usage": usage or {"input_tokens": 0, "output_tokens": 0},
        }


scholarship_query_generator = ScholarshipQueryGenerator()
