from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
from typing import Any
from datetime import datetime, timezone

import httpx
import json
import logging
import re

from app.core.config import Settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


DEFAULT_GLM_MODELS = ["GLM-5.2", "GLM-5.1", "GLM-5", "GLM-5-Turbo", "GLM-4.7"]
DEFAULT_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
DEFAULT_GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "groq/compound",
    "llama-3.3-70b-versatile",
    "qwen/qwen3-32b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "openai/gpt-oss-20b"
]
DEFAULT_MISTRAL_MODELS = ["mistral-large-latest", "mistral-medium-3-5", "devstral-2512"]
GLM_FAST_MODEL = "GLM-4.7"
GEMINI_FAST_MODEL = "gemini-2.5-flash-lite"
GROQ_FAST_MODEL = "openai/gpt-oss-20b"
MISTRAL_FAST_MODEL = "devstral-2512"
PROVIDER_FAILURE_MODES = {"local-fallback", "provider-error"}
PROVIDER_DISPLAY_NAMES = {
    "gemini": "Google AI Studio",
    "glm": "GLM",
    "groq": "Groq",
    "mistral": "Mistral",
}
PROVIDER_ENV_VARS = {
    "gemini": "GEMINI_API_KEY",
    "glm": "GLM_API_KEY",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}

# Max enforced token limits for context components
MAX_SUMMARY_TOKENS = 200
WEB_SEARCH_MAX_CHARS_PER_RESULT = 400  # Each search result limited to 400 chars

SCHOLARDOCX_SYSTEM_PROMPT = (
    "You are Lumi, the AI assistant for ScholarDocX, a higher education application "
    "management portal. You help applicants manage universities, programs, professors, and deadlines.\n\n"
    "CRITICAL CONVERSATIONAL RULES:\n"
    "- Keep responses short and conversational.\n"
    "- Use markdown formatting where helpful.\n"
    "- Do NOT invent or hallucinate data about the user's workspace; if you don't know, ask.\n"
    "- If the user asks for factual or external information, you have access to "
    "an automatic real-time web search tool that the system runs for you when needed; acknowledge this "
    "capability if asked. The current System Time is injected at the end of this prompt; you MUST use it to "
    "answer questions about the current date or time, never claim you do not have access to the date. "
    "If the user asks outside the higher-education domain, answer briefly without forcing "
    "an academic disclaimer, then offer a ScholarDocX-relevant next step only if it is useful."
)

ROUTING_SYSTEM_PROMPT = (
    "You are a strict, objective JSON routing agent. Decide whether the user's latest request MUST use a live web "
    "search to be answered accurately. Return only valid JSON with this exact shape: "
    "{\"needs_search\": boolean, \"search_query\": \"string\"}. "
    "CRITICAL RULES:\n"
    "- Set false for greetings, pleasantries, small talk, and questions about who you are.\n"
    "- Set false for questions answerable from the supplied context or timeless general knowledge.\n"
    "- Set true ONLY when real-time facts, specific external data, or source verification is strictly required, OR if the user explicitly asks you to search the web.\n"
    "- If the user explicitly asks to search the web, formulate the best search query based on the Conversation Context."
)

MEMORY_SUMMARY_SYSTEM_PROMPT = (
    "You compress ScholarDocX assistant conversations into durable rolling memory. Return only the summary text, "
    "under 600 tokens. Preserve user goals, application targets, decisions, unresolved tasks, important names, "
    "deadlines, and constraints. Drop greetings, filler, duplicate wording, and transient provider errors. Do "
    "not invent facts."
)


class AiService:
    def __init__(self, settings: Settings, *, user: dict = None, session=None) -> None:
        self.settings = settings
        # Optional billing context. When set, chat() meters every provider call
        # against the central AI-token balance (ensure_can_spend before, charge
        # after). research()/summarize_memory()/analysis inherit it via self.
        self._billing_user = user
        self._billing_session = session

    def set_billing(self, user: dict, session) -> None:
        """Attach (or replace) the billing context used by chat()."""
        self._billing_user = user
        self._billing_session = session

    def can_spend(self) -> bool:
        """Hard-stop guard against the billing context. No-op (True) when no
        billing context is attached (internal/system calls) or the user is
        unlimited; otherwise raises OutOfTokens (HTTP 402) at zero balance."""
        if self._billing_user is None or self._billing_session is None:
            return True
        from app.services import ai_tokens
        ai_tokens.ensure_can_spend(self._billing_user, self._billing_session)
        return True

    def charge_tokens(
        self,
        *,
        model_id,
        provider,
        input_tokens,
        output_tokens,
        source,
        ref_id=None,
    ) -> dict | None:
        """Charge an AI call to the attached billing context. No-op (None)
        when no billing context is attached. Used by chat() and by external
        calls that bypass chat() (e.g. Advisor Atlas vision).

        Returns the `ai_tokens.charge()` result dict, whose `charged` field is
        the real number of credits actually deducted (may be less than the
        call's cost if the balance ran out mid-call) — the figure callers that
        need to report "credits actually spent" (e.g. Advisor Atlas research
        metrics) should accumulate, not the raw token/cost estimate.
        """
        if self._billing_user is None or self._billing_session is None:
            return None
        from app.services import ai_tokens
        return ai_tokens.charge(
            self._billing_user,
            model_id=model_id,
            provider=provider,
            input_tokens=int(input_tokens or 0),
            output_tokens=int(output_tokens or 0),
            source=source,
            session=self._billing_session,
            ref_id=ref_id,
        )

    def record_external_search(self, *, source: str) -> None:
        """Record an external search (e.g. a Tavily call) as a NON-billing
        ledger counter row (tokens_delta=0, cost 0) so unbilled searches — such
        as Advisor Atlas research, which uses the web-search Tavily key but is
        not metered per call — still surface in usage dashboards. No-op when no
        billing context is attached."""
        if self._billing_user is None or self._billing_session is None:
            return
        from app.services import ai_tokens
        ai_tokens.charge_flat_fee(
            self._billing_user, self._billing_session, 0.0, source=source
        )

    def charge_external_call(self, *, cost_usd: float, source: str) -> dict | None:
        """Bill a flat-fee external API call against the attached billing context.

        The billing counterpart to `record_external_search`, which records a
        zero-cost counter row. Used by metered third-party calls that are not
        token-based — OpenAlex author resolution (SCHOLARDOCX-0183).

        Returns the `ai_tokens.charge_flat_fee()` result dict when a charge was
        raised (its `charged` field is the real credits deducted). Returns None
        when no billing context is attached, the cost is zero, or the charge
        failed — in every such case no internal/system call goes unbilled by
        mistake, and a billing failure never sinks an otherwise good run.
        """
        if self._billing_user is None or self._billing_session is None:
            return None
        if cost_usd <= 0:
            return None
        from app.services import ai_tokens

        try:
            return ai_tokens.charge_flat_fee(
                self._billing_user, self._billing_session, cost_usd, source=source
            )
        except Exception:
            logger.warning("External call charge failed for source=%s", source, exc_info=True)
            return None

    def external_billing_cost(self, getter) -> float:
        """Read an admin-configured flat fee using the attached billing session.

        `getter` is one of the `ai_tokens.get_*_cost_usd` accessors. Returns 0.0
        when no billing context is attached, so an unbilled context cannot
        accidentally charge a default price.
        """
        if self._billing_session is None:
            return 0.0
        try:
            return float(getter(self._billing_session))
        except Exception:
            return 0.0

    def can_spend_external(self) -> bool:
        """Pre-flight for a billable external call. True when unbilled or funded."""
        if self._billing_user is None or self._billing_session is None:
            return True
        from app.services import ai_tokens

        try:
            ai_tokens.ensure_can_spend(self._billing_user, self._billing_session, min_tokens=1)
            return True
        except Exception:
            return False

    async def chat(
        self,
        message: str,
        context: str = "",
        model: str = None,
        max_tokens: int = None,
        override_system_prompt: str = None,
        web_search_max_results: int = None,
        web_search_max_chars: int = None,
        request_label: str = None,
    ) -> dict:
        candidates = self._candidate_models(model)
        if not candidates:
            return {
                "mode": "local-fallback",
                "answer": self._missing_provider_answer(model, message, context),
                "sources": [],
                "external_call_made": False,
                "usage": {"input_tokens": 0, "output_tokens": 0},
                "model_id": None,
                "provider": None,
            }
        
        # Construct the full message with context if provided.
        # Enforce summary token limit by truncating if needed
        context = self._enforce_summary_limit(context)
        full_message = self._compose_user_message(message, context)

        if self._billing_user is not None and self._billing_session is not None:
            self.can_spend()

        tried_models = []
        for index, candidate in enumerate(candidates):
            provider = candidate["provider"]
            model_name = candidate["model"]
            tried_models.append(f"{provider}:{model_name}")

            sys_prompt = override_system_prompt if override_system_prompt else SCHOLARDOCX_SYSTEM_PROMPT

            # Inject temporal context so the AI knows the current date and local time
            current_time = datetime.now(timezone.utc).strftime("%A, %B %d, %Y %I:%M %p %Z")
            sys_prompt += f"\n\nSystem Time: {current_time}"

            system_tokens = len(sys_prompt) // 4
            user_input_tokens = len(message) // 4
            
            summary_tokens = 0
            last_turn_tokens = 0
            other_context_tokens = 0
            turns_count = 0
            
            if context:
                # Capture everything from [Conversation Summary So Far] until the end of string or the start of another tag or Web Search Results
                summary_match = re.search(r'\[Conversation Summary So Far\]\n(.*?)(?=\n\n\[|\n\nWeb Search Results:|$)', context, re.DOTALL)
                if summary_match:
                    summary_tokens = len(summary_match.group(1)) // 4
                    
                recent_history_match = re.search(r'\[Recent History\]\n(.*?)(?=\n\n\[|\n\nWeb Search Results:|$)', context, re.DOTALL)
                if recent_history_match:
                    history_text = recent_history_match.group(1)
                    last_turn_tokens = len(history_text) // 4
                    turns_count = history_text.count("User:")
                    
                # Calculate any remaining context (web search results)
                total_context_tokens = len(context) // 4
                other_context_tokens = max(0, total_context_tokens - summary_tokens - last_turn_tokens - 11) # ~11 tokens for the tag headers
                if other_context_tokens < 5:
                    other_context_tokens = 0

            # Determine prompt type for logging
            prompt_type = request_label or "Standard Chat"
            if not request_label and override_system_prompt == ROUTING_SYSTEM_PROMPT:
                prompt_type = "Web Search Decide"
            elif not request_label and override_system_prompt == MEMORY_SUMMARY_SYSTEM_PROMPT:
                prompt_type = "Background Summarization"
                user_input_tokens = len(full_message) // 4
                summary_tokens = 0
                last_turn_tokens = 0
                other_context_tokens = 0
            elif not request_label and override_system_prompt and "action planner" in override_system_prompt.lower():
                prompt_type = "Action Planner"
            elif not request_label and context and "Web Search Results:" in context:
                prompt_type = "Standard Chat + Web"

            # Calculate web search max tokens if results are present
            web_max_results = web_search_max_results if web_search_max_results is not None else "-"
            web_max_chars = web_search_max_chars if web_search_max_chars is not None else WEB_SEARCH_MAX_CHARS_PER_RESULT
            web_max_tokens = "-"
            if web_search_max_results and isinstance(web_search_max_results, int) and web_max_chars:
                web_max_tokens = (web_max_chars * web_search_max_results) // 4

            # Use the sum of components for the total to ensure it matches exactly for the user
            json_overhead = 15
            total_tokens = system_tokens + user_input_tokens + summary_tokens + last_turn_tokens + other_context_tokens + json_overhead

            print(f"\n[{prompt_type}] Request to {provider}:{model_name}")
            print(f"  - Total Input Tokens: ~{total_tokens} (Max: {max_tokens if max_tokens else '-'})")
            print(f"  - System Prompt Tokens (max: -): ~{system_tokens}")
            if summary_tokens > 0:
                print(f"  - Summary Tokens (max: {MAX_SUMMARY_TOKENS}): ~{summary_tokens}")
            if last_turn_tokens > 0:
                print(f"  - Recent History ({turns_count} turns) (max: -): ~{last_turn_tokens}")
            if other_context_tokens > 0:
                print(f"  - Web Search Context (results: {web_max_results}, max: {web_max_tokens}): ~{other_context_tokens}")
            print(f"  - User Input Tokens (max: -): ~{user_input_tokens}")
            print(f"  - (JSON Overhead: ~{json_overhead})\n")

            try:
                if provider == "gemini":
                    answer, usage = await self._chat_with_gemini(model_name, sys_prompt, full_message, max_tokens)
                elif provider == "groq":
                    answer, usage = await self._chat_with_groq(model_name, sys_prompt, full_message, max_tokens)
                elif provider == "mistral":
                    answer, usage = await self._chat_with_mistral(model_name, sys_prompt, full_message, max_tokens)
                else:
                    answer, usage = await self._chat_with_glm(model_name, sys_prompt, full_message, max_tokens)
                if self._billing_user is not None and self._billing_session is not None:
                    charge_result = self.charge_tokens(
                        model_id=model_name,
                        provider=provider,
                        input_tokens=usage.get("input_tokens", 0),
                        output_tokens=usage.get("output_tokens", 0),
                        source=(request_label or "ai_chat"),
                    )
                    if charge_result is not None:
                        usage["credits_charged"] = charge_result.get("charged", 0)
                return {
                    "mode": f"{provider}-{model_name}",
                    "answer": answer,
                    "sources": [],
                    "external_call_made": True,
                    "usage": usage,
                    "model_id": model_name,
                    "provider": provider,
                }
            except httpx.HTTPStatusError as exc:
                if index != len(candidates) - 1 and exc.response.status_code in [400, 404, 429, 503]:
                    logger.warning(
                        "Model %s:%s failed with status %s. Trying next model...",
                        provider,
                        model_name,
                        exc.response.status_code,
                    )
                    continue

                error_detail = self._provider_error_detail(exc.response)
                return {
                    "mode": "provider-error",
                    "answer": (
                        f"{provider.upper()} API error{error_detail}. "
                        f"Tried models: {', '.join(tried_models)}. Please verify your API key and model access."
                    ),
                    "sources": [],
                    "external_call_made": True,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                    "model_id": None,
                    "provider": None,
                }
            except httpx.HTTPError as exc:
                if index != len(candidates) - 1:
                    logger.warning(
                        "Model %s:%s request failed: %s. Trying next model...",
                        provider,
                        model_name,
                        exc.__class__.__name__,
                    )
                    continue
                return {
                    "mode": "provider-error",
                    "answer": f"{provider.upper()} request failed: {exc.__class__.__name__}. Check network connection.",
                    "sources": [],
                    "external_call_made": True,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                    "model_id": None,
                    "provider": None,
                }
        
        return {
            "mode": "provider-error",
            "answer": f"All AI provider models failed. Tried models: {', '.join(tried_models)}.",
            "sources": [],
            "external_call_made": True,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "model_id": None,
            "provider": None,
        }

    async def research(
        self,
        query: str,
        context: str = "",
        model: str = None,
        background_model: str = None,
        max_results: int = 2,
        max_chars: int = WEB_SEARCH_MAX_CHARS_PER_RESULT
    ) -> dict:
        if not self.settings.tavily_api_key or not self.settings.chat_provider_configured:
            return {
                "mode": "local-fallback",
                "answer": (
                    "AI research is ready structurally, but TAVILY_API_KEY plus at least one chat provider "
                    "key (for example GLM_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, or MISTRAL_API_KEY) are required. Add them to the backend environment "
                    "to enable web-assisted research."
                ),
                "sources": [],
                "external_call_made": False,
            }
        # Step 1: Agentic Routing Decision
        routing_model = background_model or self._default_fast_model()
        routing_prompt = self._build_routing_prompt(query, context)
        try:
            routing_response = await self.chat(
                routing_prompt,
                model=routing_model,
                max_tokens=160,
                override_system_prompt=ROUTING_SYSTEM_PROMPT,
            )
            decision = self._parse_routing_decision(routing_response.get("answer", ""), query)
            needs_search = decision["needs_search"]
            search_query = decision["search_query"]
        except Exception as exc:
            needs_search = True
            search_query = query
            logger.warning("Routing agent failed; defaulting to search: %s", exc.__class__.__name__)

        # Step 2: Execution based on decision
        if needs_search and search_query and max_results > 0:
            try:
                search_results = await self._tavily_search(search_query, max_results=max_results)
                search_context = self._format_search_context(search_results, max_results=max_results, max_chars=max_chars)
                combined_context = self._combine_context(context, f"Web Search Results:\n{search_context}")

                final_answer = await self.chat(query, combined_context, model, web_search_max_results=max_results, web_search_max_chars=max_chars)
                if final_answer.get("mode") not in PROVIDER_FAILURE_MODES:
                    final_answer["mode"] = "tavily+glm"
                final_answer["sources"] = [
                    {"title": item.get("title"), "url": item.get("url")} for item in search_results[:max_results]
                ]
                final_answer["search_performed"] = True
                final_answer["search_query"] = search_query
                return final_answer
            except httpx.HTTPError as exc:
                return {
                    "mode": "provider-error",
                    "answer": f"Tavily request failed: {exc.__class__.__name__}. Check the API key and network connection.",
                    "sources": [],
                    "external_call_made": True,
                    "search_performed": True,
                    "search_query": search_query,
                }
        else:
            # No search needed, just chat normally
            final_answer = await self.chat(query, context, model)
            if final_answer.get("mode") not in PROVIDER_FAILURE_MODES:
                final_answer["mode"] = "glm-direct"
            final_answer["sources"] = []
            final_answer["search_performed"] = False
            final_answer["search_query"] = ""
            return final_answer

    async def summarize_memory(self, text: str, model: str = None) -> dict:
        if not self.settings.chat_provider_configured:
            return {
                "mode": "local-fallback",
                "answer": "",
                "sources": [],
                "external_call_made": False,
            }

        summary_model = model or self._default_fast_model()
        prompt = (
            "Summarize the following ScholarDocX conversation memory input.\n\n"
            "Rules:\n"
            "- Stay under 150 tokens. Be highly concise.\n"
            "- Preserve durable user intent, decisions, constraints, deadlines, named schools/programs/professors, and open tasks.\n"
            "- Mention only facts supported by the input.\n"
            "- Do not include provider failures, rate limits, or implementation logs unless the user explicitly discussed them as a task.\n\n"
            f"Conversation memory input:\n{text}"
        )
        response = await self.chat(
            prompt,
            model=summary_model,
            max_tokens=150,
            override_system_prompt=MEMORY_SUMMARY_SYSTEM_PROMPT,
        )
        if response.get("mode") in PROVIDER_FAILURE_MODES or not response.get("answer"):
            response["answer"] = ""
            return response

        response["answer"] = self._trim_memory_summary(response["answer"])
        return response

    async def _tavily_search(self, query: str, max_results: int = 2) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.settings.tavily_api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": max_results,
                },
            )
            response.raise_for_status()
        return response.json().get("results", [])

    async def _chat_with_mistral(self, model_name: str, system_prompt: str, message: str, max_tokens: int = None) -> str:
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            "temperature": 0.7,
            "top_p": 0.9,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                self.settings.mistral_base_url,
                headers={
                    "Authorization": f"Bearer {self.settings.mistral_api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            response.raise_for_status()
            
        data = response.json()
        return data["choices"][0]["message"]["content"], self._extract_openai_usage(data)



    def _candidate_models(self, model: str = None) -> list[dict[str, str]]:
        model_choice = (model or "").strip()
        if model_choice:
            provider, model_name = self._parse_model_choice(model_choice)
            if not self._provider_configured(provider):
                return []
                
            # Enforce is_active constraint if we have a billing session
            if self._billing_session:
                from sqlalchemy import text
                from app.auth.limits import UsageLimitExceeded
                row = self._billing_session.execute(
                    text("SELECT is_active FROM ai_models WHERE (provider || ':' || model_id) = :m OR model_id = :m"),
                    {"m": model_choice}
                ).fetchone()
                if row and not row[0]:
                    raise UsageLimitExceeded("Admin has restricted this model use try another model.")
                    
            return [{"provider": provider, "model": model_name}]

        # Fallback: no model specified — pick first available default
        if self.settings.groq_api_key:
            return [{"provider": "groq", "model": GROQ_FAST_MODEL}]
        if self.settings.gemini_api_key:
            return [{"provider": "gemini", "model": GEMINI_FAST_MODEL}]
        if self.settings.mistral_api_key:
            return [{"provider": "mistral", "model": MISTRAL_FAST_MODEL}]
        if self.settings.glm_api_key:
            return [{"provider": "glm", "model": GLM_FAST_MODEL}]
        return []

    def _default_fast_model(self) -> str:
        """Return the fastest configured model identifier for background tasks."""
        if self.settings.groq_api_key:
            return f"groq:{GROQ_FAST_MODEL}"
        if self.settings.gemini_api_key:
            return f"gemini:{GEMINI_FAST_MODEL}"
        if self.settings.mistral_api_key:
            return f"mistral:{MISTRAL_FAST_MODEL}"
        if self.settings.glm_api_key:
            return f"glm:{GLM_FAST_MODEL}"
        return ""

    def _parse_model_choice(self, model: str) -> tuple[str, str]:
        if ":" in model:
            provider, model_name = model.split(":", 1)
            provider = provider.strip().lower()
            model_name = model_name.strip()
            if provider in {"glm", "gemini", "groq", "mistral"} and model_name:
                return provider, model_name

        if model.startswith("gemini-"):
            return "gemini", model
        if model.startswith("mistral") or model.startswith("devstral") or model.startswith("pixtral") or model.startswith("ministral"):
            return "mistral", model
        if model.startswith("llama") or model.startswith("qwen") or model.startswith("mixtral") or model.startswith("openai/") or model.startswith("meta-llama/") or model.startswith("groq/"):
            return "groq", model
        return "glm", model

    def _provider_configured(self, provider: str) -> bool:
        if provider == "gemini":
            return bool(self.settings.gemini_api_key)
        if provider == "groq":
            return bool(self.settings.groq_api_key)
        if provider == "mistral":
            return bool(self.settings.mistral_api_key)
        return bool(self.settings.glm_api_key)

    async def _chat_with_glm(self, model_name: str, system_prompt: str, message: str, max_tokens: int = None) -> str:
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            "temperature": 0.7,
            "top_p": 0.9,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        headers = {
            "Authorization": f"Bearer {self.settings.glm_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(self.settings.glm_base_url, json=payload, headers=headers)
            response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "No response from AI")
        return content, self._extract_openai_usage(data)

    async def _chat_with_groq(self, model_name: str, system_prompt: str, message: str, max_tokens: int = None) -> str:
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            "temperature": 0.7,
            "top_p": 0.9,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        headers = {
            "Authorization": f"Bearer {self.settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(self.settings.groq_base_url, json=payload, headers=headers)
            response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "No response from AI")
        # Strip <think>...</think> blocks from DeepSeek/Qwen reasoning models
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        return content, self._extract_openai_usage(data)

    async def _chat_with_gemini(self, model_name: str, system_prompt: str, message: str, max_tokens: int = None) -> str:
        generation_config = {"temperature": 0.7, "topP": 0.9}
        if max_tokens:
            generation_config["maxOutputTokens"] = max_tokens

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": message}],
                }
            ],
            "generationConfig": generation_config,
        }
        headers = {
            "x-goog-api-key": self.settings.gemini_api_key,
            "Content-Type": "application/json",
        }
        url = f"{self.settings.gemini_base_url.rstrip('/')}/models/{model_name}:generateContent"
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
        data = response.json()
        return self._extract_gemini_text(data), self._extract_gemini_usage(data)

    def _extract_gemini_text(self, data: dict[str, Any]) -> str:
        candidates = data.get("candidates") or [{}]
        parts = candidates[0].get("content", {}).get("parts", [])
        text_parts = [part.get("text", "") for part in parts if part.get("text")]
        return "\n".join(text_parts).strip() or "No response from AI"

    def _extract_openai_usage(self, data: dict) -> dict:
        """Pull input/output token counts from an OpenAI-compatible response.

        GLM/Groq/Mistral all return `usage.prompt_tokens`/`completion_tokens`.
        """
        usage = data.get("usage") or {}
        return {
            "input_tokens": int(usage.get("prompt_tokens", 0) or 0),
            "output_tokens": int(usage.get("completion_tokens", 0) or 0),
        }

    def _extract_gemini_usage(self, data: dict) -> dict:
        """Pull input/output token counts from a Gemini response."""
        meta = data.get("usageMetadata") or {}
        return {
            "input_tokens": int(meta.get("promptTokenCount", 0) or 0),
            "output_tokens": int(meta.get("candidatesTokenCount", 0) or 0),
        }

    def _provider_error_detail(self, response) -> str:
        try:
            error_data = response.json()
            error_info = error_data.get("error", {})
            error_msg = error_info.get("message", "") or error_data.get("message", "")
            error_code = error_info.get("code", "") or error_data.get("code", "")
            return f" - {error_msg} (code: {error_code})" if error_code else f" - {error_msg}"
        except Exception:
            return f" - HTTP {response.status_code}"

    def _build_routing_prompt(self, query: str, context: str) -> str:
        context_text = context.strip() if context.strip() else "(none)"
        return (
            "[Conversation Context]\n"
            f"{context_text}\n\n"
            "[User Request]\n"
            f"{query.strip()}\n\n"
            "Return JSON only. Set `needs_search: false` for greetings (e.g. 'hi', 'hey'), small talk, questions about your identity, "
            "or questions that can be answered using the conversation context or general knowledge.\n"
            "Set `needs_search: true` ONLY IF live facts, recent news, official university pages, specific deadlines, "
            "or external source verification is strictly required.\n\n"
            "EXAMPLES:\n"
            "Request: 'hey how are you?' -> {\"needs_search\": false, \"search_query\": \"\"}\n"
            "Request: 'what is your name?' -> {\"needs_search\": false, \"search_query\": \"\"}\n"
            "Request: 'what's up?' -> {\"needs_search\": false, \"search_query\": \"\"}\n"
            "Request: 'summarize this text' -> {\"needs_search\": false, \"search_query\": \"\"}\n"
            "Request: 'does mit require sat this year?' -> {\"needs_search\": true, \"search_query\": \"MIT SAT requirements current year\"}\n"
            "Request: 'what happened in news today' -> {\"needs_search\": true, \"search_query\": \"latest news today\"}"
        )

    def _parse_routing_decision(self, raw_answer: str, fallback_query: str) -> dict:
        fallback = {"needs_search": True, "search_query": fallback_query}
        start_idx = raw_answer.find("{")
        end_idx = raw_answer.rfind("}")
        if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
            return fallback

        try:
            decision = safe_json_loads(raw_answer[start_idx:end_idx + 1], default={})
        except (TypeError, ValueError):
            return fallback

        needs_search = decision.get("needs_search")
        if not isinstance(needs_search, bool):
            return fallback

        search_query = decision.get("search_query")
        if not isinstance(search_query, str) or not search_query.strip():
            search_query = fallback_query

        return {"needs_search": needs_search, "search_query": search_query.strip()}

    def _compose_user_message(self, message: str, context: str) -> str:
        if not context:
            return message
        return f"[Assistant Context]\n{context.strip()}\n\n[User Request]\n{message.strip()}"

    def _combine_context(self, *sections: str) -> str:
        return "\n\n".join(section.strip() for section in sections if section and section.strip())

    def _format_search_context(self, search_results: list[dict[str, Any]], max_results: int = 2, max_chars: int = WEB_SEARCH_MAX_CHARS_PER_RESULT) -> str:
        if not search_results:
            return "(No Tavily results returned.)"

        formatted_items = []
        for item in search_results[:max_results]:
            title = item.get('title') or 'Untitled'
            url = item.get('url') or 'Unknown'
            content = item.get('content') or ''

            # Restrict snippet length to max_chars
            if len(content) > max_chars:
                content = content[:max_chars] + "..."

            formatted_items.append(f"- Title: {title}\n  URL: {url}\n  Snippet: {content}")

        return "\n".join(formatted_items)

    def _trim_memory_summary(self, summary: str) -> str:
        compact = re.sub(r"\n{3,}", "\n\n", summary.strip())
        if len(compact) <= 3000:
            return compact
        return compact[:3000].rsplit(" ", 1)[0].strip()

    def _enforce_summary_limit(self, context: str) -> str:
        """Enforce MAX_SUMMARY_TOKENS limit by truncating summary if needed."""
        if not context:
            return context

        summary_pattern = r'\[Conversation Summary So Far\]\n(.*?)(?=\n\n\[|\n\nWeb Search Results:|$)'
        match = re.search(summary_pattern, context, re.DOTALL)
        if not match:
            return context

        summary_text = match.group(1)
        current_tokens = len(summary_text) // 4

        if current_tokens <= MAX_SUMMARY_TOKENS:
            return context

        # Truncate to approximately MAX_SUMMARY_TOKENS (chars = tokens * 4)
        max_chars = MAX_SUMMARY_TOKENS * 4
        truncated = summary_text[:max_chars]

        # Clean up - don't end mid-word
        if len(truncated) == max_chars and len(summary_text) > max_chars:
            truncated = truncated.rsplit(" ", 1)[0].strip() + "..."

        # Replace in context
        new_context = re.sub(
            summary_pattern,
            f'[Conversation Summary So Far]\n{truncated}',
            context,
            flags=re.DOTALL
        )
        return new_context

    def _missing_provider_answer(self, model: str, message: str, context: str) -> str:
        if model:
            provider, _model_name = self._parse_model_choice(model)
            provider_name = PROVIDER_DISPLAY_NAMES.get(provider, provider.upper())
            key_name = PROVIDER_ENV_VARS.get(provider, "API_KEY")
            return (
                f"{provider_name} is not configured, so no private text was sent outside this machine. "
                f"Add {key_name} to the backend environment or select a model with a configured provider."
                f"\n\nYour request: {message}"
            )
        return self._fallback_answer(message, context)

    def _fallback_answer(self, message: str, context: str) -> str:
        context_note = " I can see local context was supplied." if context else ""
        return (
            "External AI is not configured yet, so no private text was sent outside this machine."
            f"{context_note} Suggested next step: break the request into application fit, deadline risk, "
            "document changes, and outreach action items."
            f"\n\nYour request: {message}"
        )
