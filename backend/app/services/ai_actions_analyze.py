"""Post-execution analysis pass for agentic workspace actions.

SCHOLARDOCX-0156: read-only action plans (``get_rows``, ``filter_rows``, …)
used to be the END of the pipeline — ``execution_message()`` rendered a
truncated preview as the final chat answer, so analytical questions ("find
duplicate entries", "am I ready to apply?") were never actually answered:
no model ever saw the row data. This module adds the missing second pass:
serialize the executed read results (hard-bounded) and ask the model to
answer the user's original question from that data.

Pure helpers live here (serialization, prompt building) so they are unit
testable without a database; the async orchestration is
``AiActionService.analyze_results`` in ``ai_actions.py``.
"""
from __future__ import annotations

from typing import Any
import json


# Hard bounds for the serialized results payload embedded in the analyst
# prompt. ~12k chars ≈ ~3k tokens — enough for ~150 typical rows while
# leaving headroom for the system prompt and the answer.
MAX_RESULTS_CHARS = 12_000
MAX_CELL_CHARS = 120
MAX_ROWS_PER_RESULT = 200

# Result keys that are huge, redundant, or internal — never sent to the model.
_DROP_KEYS = {
    "page", "project", "summary", "columns_json", "rows_json",
}

ACTION_ANALYST_SYSTEM_PROMPT = (
    "You are Lumi, the data analyst inside ScholarDocX, a higher education "
    "application management portal. The workspace action system has already "
    "run the user's request; you receive the user's ORIGINAL QUESTION and the "
    "RAW ACTION RESULTS as JSON. Your job is to answer the question from "
    "those results.\n\n"
    "CRITICAL RULES:\n"
    "1. Answer ONLY from the supplied results. Never invent rows, values, "
    "counts, or dates. If a value is not in the results, it does not exist.\n"
    "2. Lead with the direct answer (e.g. 'Found 2 duplicate entries', "
    "'3 of 5 rows are not ready'), then the evidence. Use markdown: a short "
    "intro line, then bullets or a table.\n"
    "3. Reference rows by their 1-based row number (the sheet's first row is "
    "row 1). When results carry row_index values, row number = row_index + 1.\n"
    "4. Be exhaustive for the asked question: for duplicates, list EVERY "
    "duplicate value and ALL rows containing it; for missing fields, list "
    "EVERY row and EVERY missing field; for deadlines, list EVERY date in "
    "scope. Never stop at a sample when more matches exist in the results.\n"
    "5. Never answer with a raw data dump. Never say 'here is the data' "
    "without analysis. Never describe what you cannot do, and never tell the "
    "user to re-run anything.\n"
    "6. If the results are marked TRUNCATED, answer from what is visible and "
    "state plainly that the sheet has more rows than you were shown.\n"
    "7. If the results genuinely cannot answer the question, say so in one "
    "sentence and name the missing column/data that would be needed.\n"
    "8. Treat empty strings, nulls, and absent keys as EMPTY/missing values — "
    "that matters for completeness and readiness questions.\n"
    "9. Keep it concise and practical — no filler, no restating the question, "
    "no generic advice."
)


def _trim_cell(value: Any) -> Any:
    """Bound a single cell value for prompt safety."""
    if value is None:
        return ""
    if isinstance(value, str):
        cleaned = value.strip()
        if len(cleaned) > MAX_CELL_CHARS:
            return cleaned[: MAX_CELL_CHARS - 1] + "…"
        return cleaned
    if isinstance(value, (int, float, bool)):
        return value
    return str(value)[:MAX_CELL_CHARS]


def _trim_row(row: Any) -> dict[str, Any]:
    """Trim a row dict: drop internal ``_`` keys, bound cell sizes."""
    if not isinstance(row, dict):
        return {"value": _trim_cell(row)}
    return {
        str(key): _trim_cell(value)
        for key, value in row.items()
        if not str(key).startswith("_")
    }


def _trim_entries(entries: list[Any], limit: int) -> tuple[list[dict[str, Any]], int]:
    """Trim ``{row_index, row, ...}`` entries, returning (kept, dropped)."""
    kept: list[dict[str, Any]] = []
    for entry in entries[:limit]:
        if isinstance(entry, dict):
            item = {
                key: (_trim_row(value) if key == "row" else value)
                for key, value in entry.items()
                if key not in _DROP_KEYS and not str(key).startswith("_")
            }
            kept.append(item)
        else:
            kept.append({"value": _trim_cell(entry)})
    return kept, max(0, len(entries) - limit)


def _serialize_one(result: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Serialize a single action result. Returns (payload, truncated)."""
    payload: dict[str, Any] = {"type": result.get("type", "unknown")}
    truncated = False

    for key, value in result.items():
        if key in _DROP_KEYS or key == "type":
            continue
        if key == "rows" and isinstance(value, list):
            kept_rows = [_trim_row(row) for row in value[:MAX_ROWS_PER_RESULT]]
            payload["rows"] = kept_rows
            if len(value) > len(kept_rows):
                truncated = True
                payload["rows_omitted"] = len(value) - len(kept_rows)
        elif key in ("matched", "deadlines", "overdue") and isinstance(value, list):
            kept, dropped = _trim_entries(value, MAX_ROWS_PER_RESULT)
            payload[key] = kept
            if dropped:
                truncated = True
                payload[f"{key}_omitted"] = dropped
        elif key == "message":
            # The deterministic pre-formatted summary (real analysis for the
            # smart reads; just a preview for get_rows) — compact and useful.
            payload["preview"] = _trim_cell(value) if not isinstance(value, str) else value[:2000]
        elif isinstance(value, (str, int, float, bool)) or value is None:
            payload[key] = value
        elif isinstance(value, dict):
            payload[key] = {
                str(k): _trim_cell(v) for k, v in list(value.items())[:60]
            }
        # anything else (nested blobs) is dropped

    # get_rows results carry the full column list inside the dropped `page`
    # blob; re-expose just the names so the analyst can tell "column exists
    # but empty" from "column absent". Sheet/project names give the analyst
    # lightweight context without the bulky blobs.
    page = result.get("page")
    if isinstance(page, dict):
        if page.get("name"):
            payload["sheet_name"] = page.get("name")
        columns = page.get("columns")
        if isinstance(columns, str):
            try:
                columns = json.loads(columns)
            except (ValueError, TypeError):
                columns = []
        if isinstance(columns, list):
            payload["columns"] = [
                c.get("name") for c in columns
                if isinstance(c, dict) and c.get("type") != "group"
            ][:60]
    project = result.get("project")
    if isinstance(project, dict) and project.get("name"):
        payload["project_name"] = project.get("name")

    return payload, truncated


def serialize_results_for_analysis(results: list[dict[str, Any]]) -> tuple[str, bool]:
    """Serialize executed action results for the analyst prompt.

    Returns ``(json_text, truncated)``. Enforces MAX_RESULTS_CHARS by
    dropping row entries from the tail of the largest row lists; ``truncated``
    is True whenever any data was omitted, so the analyst can say so (Rule 6).
    """
    payloads: list[dict[str, Any]] = []
    truncated = False
    for result in results:
        if not isinstance(result, dict):
            continue
        payload, was_truncated = _serialize_one(result)
        payloads.append(payload)
        truncated = truncated or was_truncated

    if not payloads:
        return "", truncated

    text = json.dumps(payloads, ensure_ascii=True, default=str)

    # Shrink the largest row lists until the payload fits the budget.
    row_lists = ["rows", "matched", "deadlines", "overdue"]
    while len(text) > MAX_RESULTS_CHARS:
        largest_key = None
        largest_len = 0
        for payload in payloads:
            for key in row_lists:
                entries = payload.get(key)
                if isinstance(entries, list) and len(entries) > largest_len:
                    largest_key, largest_len = key, len(entries)
        if largest_key is None or largest_len <= 1:
            break
        for payload in payloads:
            entries = payload.get(largest_key)
            if isinstance(entries, list) and len(entries) == largest_len:
                entries.pop()
                payload[f"{largest_key}_omitted"] = payload.get(f"{largest_key}_omitted", 0) + 1
                truncated = True
                break
        text = json.dumps(payloads, ensure_ascii=True, default=str)

    if len(text) > MAX_RESULTS_CHARS:
        text = text[:MAX_RESULTS_CHARS] + "…"
        truncated = True

    return text, truncated


def build_analyst_prompt(message: str, results_json: str, truncated: bool) -> str:
    """User-turn prompt for the analysis pass: question + bounded results."""
    truncation_note = (
        " NOTE: results are TRUNCATED — the sheet has more data than shown."
        if truncated
        else ""
    )
    return (
        "Answer the user's question using ONLY the ACTION RESULTS below.\n\n"
        f"USER QUESTION:\n{message}\n\n"
        f"ACTION RESULTS (JSON{truncation_note}):\n{results_json}\n\n"
        "Answer now, following every rule in your instructions:"
    )
