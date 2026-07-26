"""Smart READ / analytical execution for AI workspace actions.

Handles semantic column matching, date-aware analysis, row filtering,
and rich result formatting. Called by AiActionService for all READ-type
actions that need more than basic listing.
"""

from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
from datetime import date, datetime, timedelta
from typing import Any
import json
import re


# ---------------------------------------------------------------------------
# Semantic column matching
# ---------------------------------------------------------------------------

# Common aliases: user word → likely column name fragments
_COLUMN_ALIASES: dict[str, list[str]] = {
    "deadline": ["deadline", "due", "due_at", "application deadline"],
    "applied": ["applied", "application status", "centrally applied"],
    "status": ["status", "response status", "application status"],
    "email": ["email", "professor email", "recipient_email"],
    "university": ["university", "university name", "uni"],
    "professor": ["professor", "professor name", "prof"],
    "rank": ["rank", "global rank", "local rank", "university rank"],
    "date": ["date", "deadline", "scheduled", "sent date", "follow-up date"],
    "response": ["response", "response status", "response notes"],
    "notes": ["notes", "response notes"],
    "name": ["name", "university name", "professor name"],
    "department": ["department"],
    "interests": ["interests", "research interests"],
    "funding": ["funding", "funding available"],
    "program": ["program"],
    "gre": ["gre"],
    "toefl": ["toefl", "ielts", "toefl / ielts"],
    "fee": ["fee", "application fee"],
    "follow-up": ["follow-up", "follow-up sent", "follow-up date", "first follow-up", "second follow-up"],
    "sent": ["sent", "cold email sent", "email sent", "follow-up sent"],
    "body": ["body", "email body"],
    "subject": ["subject", "email subject"],
    "attachments": ["attachments", "cv", "sop", "transcript", "certificate"],
    "scholar": ["google scholar", "google scholar url", "scholar"],
    "profile": ["profile", "profile url"],
    "portal": ["portal", "application portal"],
}


def find_column_by_semantic_match(
    query_term: str,
    columns: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Find columns that semantically match a user's query term.

    Returns a list of matching columns (may be empty or multiple).
    Priority: exact match > case-insensitive exact > word-boundary contains >
    alias match > substring match.
    """
    query_lower = query_term.lower().strip()
    if not query_lower or not columns:
        return []

    # Filter out group-type columns
    real_columns = [c for c in columns if isinstance(c, dict) and c.get("type") != "group"]

    # 1. Exact match
    for col in real_columns:
        if col.get("name", "") == query_term:
            return [col]

    # 2. Case-insensitive exact match
    for col in real_columns:
        if col.get("name", "").lower() == query_lower:
            return [col]

    # 3. Word-boundary contains (e.g., "deadline" matches "Application Deadline")
    word_re = re.compile(r"\b" + re.escape(query_lower) + r"\b", re.IGNORECASE)
    word_matches = [col for col in real_columns if word_re.search(col.get("name", ""))]
    if word_matches:
        return word_matches

    # 4. Alias expansion
    aliases = _COLUMN_ALIASES.get(query_lower, [])
    for alias in aliases:
        alias_re = re.compile(r"\b" + re.escape(alias) + r"\b", re.IGNORECASE)
        alias_matches = [col for col in real_columns if alias_re.search(col.get("name", ""))]
        if alias_matches:
            return alias_matches

    # 5. Substring match (weakest)
    substring_matches = [
        col for col in real_columns
        if query_lower in col.get("name", "").lower()
    ]
    if substring_matches:
        return substring_matches

    return []


def find_best_column(query_term: str, columns: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return the single best matching column, or None."""
    matches = find_column_by_semantic_match(query_term, columns)
    return matches[0] if matches else None


# ---------------------------------------------------------------------------
# Date parsing and analysis
# ---------------------------------------------------------------------------

def parse_date_value(value: Any) -> date | None:
    """Parse a date from various formats."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    cleaned = value.strip()
    # Try ISO format
    try:
        parsed_dt = safe_parse_datetime(cleaned)
        return parsed_dt.date() if parsed_dt else None
    except (ValueError, TypeError):
        pass
    try:
        return safe_parse_date(cleaned)
    except (ValueError, TypeError):
        pass
    # Try common formats
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%B %d, %Y", "%b %d, %Y",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def analyze_date_column(
    rows: list[dict[str, Any]],
    column_name: str,
    today: date | None = None,
) -> dict[str, Any]:
    """Analyze a date column for upcoming, overdue, and time-range queries.

    Returns:
        {
            "column_name": str,
            "total_rows": int,
            "rows_with_dates": int,
            "rows_without_dates": int,
            "overdue": [...],
            "within_3_days": [...],
            "within_7_days": [...],
            "within_10_days": [...],
            "within_30_days": [...],
            "this_week": [...],
            "this_month": [...],
            "next_month": [...],
            "future": [...],
            "all_dated_rows": [...]
        }
    Each list entry: {"row_index": int, "row": dict, "date": str, "parsed_date": date}
    """
    if today is None:
        today = date.today()

    result: dict[str, Any] = {
        "column_name": column_name,
        "total_rows": len(rows),
        "rows_with_dates": 0,
        "rows_without_dates": 0,
        "overdue": [],
        "within_3_days": [],
        "within_7_days": [],
        "within_10_days": [],
        "within_30_days": [],
        "this_week": [],
        "this_month": [],
        "next_month": [],
        "future": [],
        "all_dated_rows": [],
    }

    # Week boundaries (Mon-Sun)
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Month boundaries
    month_start = today.replace(day=1)
    if today.month == 12:
        next_month_start = today.replace(year=today.year + 1, month=1, day=1)
    else:
        next_month_start = today.replace(month=today.month + 1, day=1)
    if next_month_start.month == 12:
        next_month_end = next_month_start.replace(year=next_month_start.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        next_month_end = next_month_start.replace(month=next_month_start.month + 1, day=1) - timedelta(days=1)

    for idx, row in enumerate(rows):
        raw_value = row.get(column_name)
        parsed = parse_date_value(raw_value)
        if parsed is None:
            result["rows_without_dates"] += 1
            continue

        result["rows_with_dates"] += 1
        entry = {
            "row_index": idx,
            "row": row,
            "date": str(raw_value),
            "parsed_date": parsed.isoformat(),
        }
        result["all_dated_rows"].append(entry)

        delta_days = (parsed - today).days

        if parsed < today:
            result["overdue"].append(entry)
        else:
            if delta_days <= 3:
                result["within_3_days"].append(entry)
            if delta_days <= 7:
                result["within_7_days"].append(entry)
            if delta_days <= 10:
                result["within_10_days"].append(entry)
            if delta_days <= 30:
                result["within_30_days"].append(entry)
            result["future"].append(entry)

        if week_start <= parsed <= week_end:
            result["this_week"].append(entry)
        if month_start <= parsed < next_month_start:
            result["this_month"].append(entry)
        if next_month_start <= parsed <= next_month_end:
            result["next_month"].append(entry)

    return result


# ---------------------------------------------------------------------------
# Row filtering
# ---------------------------------------------------------------------------

def filter_rows_by_value(
    rows: list[dict[str, Any]],
    column_name: str,
    value: Any = None,
    operator: str = "equals",
    columns: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Filter rows by a column value.

    Operators:
        equals, not_equals, contains, not_contains, starts_with, ends_with,
        gt, gte, lt, lte, is_true, is_false, is_empty, is_not_empty
    """
    results = []
    target_column = column_name
    col_type = "text"
    if columns:
        matched_col = find_best_column(column_name, columns)
        if matched_col and isinstance(matched_col, dict):
            target_column = matched_col.get("name") or column_name
            col_type = matched_col.get("type", "text")
        else:
            for col in columns:
                if isinstance(col, dict) and col.get("name") == column_name:
                    col_type = col.get("type", "text")
                    break

    for idx, row in enumerate(rows):
        cell = row.get(target_column)
        if cell is None and target_column != column_name:
            cell = row.get(column_name)
        if _matches(cell, value, operator, col_type):
            results.append({"row_index": idx, "row": row})

    return results


def _matches(cell: Any, value: Any, operator: str, col_type: str) -> bool:
    """Check if a cell value matches the filter criteria."""
    # Normalize cell for comparison
    cell_str = str(cell or "").strip()
    cell_lower = cell_str.lower()
    value_str = str(value or "").strip()
    value_lower = value_str.lower()

    if operator == "is_empty":
        return not cell_str
    if operator == "is_not_empty":
        return bool(cell_str)
    if operator == "is_true":
        return cell_lower in ("true", "1", "yes", "✓", "✔")
    if operator == "is_false":
        return cell_lower in ("false", "0", "no", "") or not cell_str

    if operator == "equals":
        return cell_lower == value_lower
    if operator == "not_equals":
        return cell_lower != value_lower
    if operator == "contains":
        return value_lower in cell_lower
    if operator == "not_contains":
        return value_lower not in cell_lower
    if operator == "starts_with":
        return cell_lower.startswith(value_lower)
    if operator == "ends_with":
        return cell_lower.endswith(value_lower)

    # Numeric comparisons
    try:
        cell_num = float(cell_str) if cell_str else 0
        value_num = float(value_str) if value_str else 0
        if operator == "gt":
            return cell_num > value_num
        if operator == "gte":
            return cell_num >= value_num
        if operator == "lt":
            return cell_num < value_num
        if operator == "lte":
            return cell_num <= value_num
    except (ValueError, TypeError):
        return False

    return False


def get_unique_column_values(
    rows: list[dict[str, Any]],
    column_name: str,
) -> list[str]:
    """Get all unique non-empty values in a column."""
    values: set[str] = set()
    for row in rows:
        cell = row.get(column_name)
        if cell is not None:
            cleaned = str(cell).strip()
            if cleaned:
                values.add(cleaned)
    return sorted(values)


def count_by_column_value(
    rows: list[dict[str, Any]],
    column_name: str,
) -> dict[str, int]:
    """Count rows grouped by their value in a column."""
    counts: dict[str, int] = {}
    for row in rows:
        cell = row.get(column_name)
        key = str(cell or "").strip() or "(empty)"
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items(), key=lambda x: -x[1]))


# ---------------------------------------------------------------------------
# Rich result formatting
# ---------------------------------------------------------------------------

def format_rows_as_table(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]] | None = None,
    max_rows: int = 15,
    max_cols: int = 6,
    row_index_entries: list[dict[str, Any]] | None = None,
) -> str:
    """Format rows as a markdown table with smart column selection.

    If row_index_entries is provided (from filter/analyze results),
    extracts row data from them.
    """
    if row_index_entries:
        actual_rows = [e["row"] for e in row_index_entries[:max_rows]]
        total = len(row_index_entries)
    else:
        actual_rows = rows[:max_rows]
        total = len(rows)

    if not actual_rows:
        return "_No matching rows._"

    # Determine visible columns
    if columns:
        # Filter out group columns, pick first max_cols
        col_names = [
            c["name"] for c in columns
            if isinstance(c, dict) and c.get("type") != "group"
        ][:max_cols]
    else:
        # Infer from row keys
        all_keys: list[str] = []
        for row in actual_rows:
            for key in row:
                if key not in all_keys and not key.startswith("_"):
                    all_keys.append(key)
        col_names = all_keys[:max_cols]

    if not col_names:
        return "_No columns to display._"

    # Build markdown table
    header = "| # | " + " | ".join(col_names) + " |"
    separator = "|---|" + "|".join("---" for _ in col_names) + "|"
    lines = [header, separator]

    for idx, row in enumerate(actual_rows):
        row_num = row_index_entries[idx]["row_index"] + 1 if row_index_entries else idx + 1
        cells = []
        for col in col_names:
            cell_val = str(row.get(col, "") or "")
            # Truncate long values for table display
            if len(cell_val) > 40:
                cell_val = cell_val[:37] + "…"
            # Escape pipe characters
            cell_val = cell_val.replace("|", "\\|")
            cells.append(cell_val)
        lines.append(f"| {row_num} | " + " | ".join(cells) + " |")

    if total > max_rows:
        lines.append(f"\n_…and {total - max_rows} more rows._")

    return "\n".join(lines)


def format_date_analysis(analysis: dict[str, Any], query_type: str = "summary") -> str:
    """Format date analysis results as rich markdown."""
    col = analysis["column_name"]
    lines = [f"📅 **Date Analysis for \"{col}\"**\n"]

    lines.append(f"- Total rows: **{analysis['total_rows']}**")
    lines.append(f"- Rows with dates: **{analysis['rows_with_dates']}**")
    lines.append(f"- Rows without dates: **{analysis['rows_without_dates']}**")
    lines.append("")

    overdue_count = len(analysis["overdue"])
    w3 = len(analysis["within_3_days"])
    w7 = len(analysis["within_7_days"])
    w10 = len(analysis["within_10_days"])
    w30 = len(analysis["within_30_days"])
    this_week = len(analysis["this_week"])
    this_month = len(analysis["this_month"])
    next_month = len(analysis["next_month"])

    lines.append("| Time Range | Count |")
    lines.append("|---|---|")
    if overdue_count:
        lines.append(f"| 🔴 Overdue | **{overdue_count}** |")
    lines.append(f"| ⚠️ Within 3 days | **{w3}** |")
    lines.append(f"| 🟡 Within 7 days | **{w7}** |")
    lines.append(f"| 🟢 Within 10 days | **{w10}** |")
    lines.append(f"| 📆 Within 30 days | **{w30}** |")
    lines.append(f"| 📅 This week | **{this_week}** |")
    lines.append(f"| 📅 This month | **{this_month}** |")
    lines.append(f"| 📅 Next month | **{next_month}** |")

    return "\n".join(lines)


def format_value_counts(counts: dict[str, int], column_name: str) -> str:
    """Format value distribution as a markdown table."""
    lines = [f"📊 **Distribution of \"{column_name}\"**\n"]
    lines.append("| Value | Count |")
    lines.append("|---|---|")
    for value, count in counts.items():
        lines.append(f"| {value} | **{count}** |")
    total = sum(counts.values())
    lines.append(f"\n**Total: {total} rows**")
    return "\n".join(lines)


def format_filter_results(
    matched: list[dict[str, Any]],
    column_name: str,
    operator: str,
    value: Any,
    columns: list[dict[str, Any]] | None = None,
    total_rows: int = 0,
) -> str:
    """Format filtered row results."""
    op_label = {
        "equals": "=", "not_equals": "≠", "contains": "contains",
        "not_contains": "doesn't contain", "starts_with": "starts with",
        "ends_with": "ends with", "gt": ">", "gte": "≥", "lt": "<", "lte": "≤",
        "is_true": "is ✓", "is_false": "is ✗", "is_empty": "is empty",
        "is_not_empty": "is not empty",
    }.get(operator, operator)

    value_display = f" \"{value}\"" if value and operator not in ("is_true", "is_false", "is_empty", "is_not_empty") else ""

    lines = [f"🔍 **Rows where \"{column_name}\" {op_label}{value_display}**: **{len(matched)}** of {total_rows}\n"]

    if matched:
        table = format_rows_as_table([], columns=columns, row_index_entries=matched)
        lines.append(table)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Execute helpers (called from AiActionService)
# ---------------------------------------------------------------------------

def execute_search_rows(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]],
    query: str,
) -> dict[str, Any]:
    """Search all columns for rows containing the query text."""
    query_lower = query.lower()
    matched = []
    for idx, row in enumerate(rows):
        for key, value in row.items():
            if key.startswith("_"):
                continue
            if query_lower in str(value or "").lower():
                matched.append({"row_index": idx, "row": row})
                break

    message = f"🔍 Found **{len(matched)}** rows matching \"{query}\".\n\n"
    if matched:
        message += format_rows_as_table([], columns=columns, row_index_entries=matched)

    return {"type": "search_rows", "count": len(matched), "matched": matched, "message": message}


def execute_filter_rows(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]],
    column_name: str | None = None,
    column_query: str | None = None,
    value: Any = None,
    operator: str = "equals",
) -> dict[str, Any]:
    """Filter rows by column value with semantic column matching."""
    # Resolve column name
    resolved_col = column_name
    if not resolved_col and column_query:
        matched_col = find_best_column(column_query, columns)
        if matched_col:
            resolved_col = matched_col["name"]

    if not resolved_col:
        return {
            "type": "filter_rows",
            "count": 0,
            "message": f"❌ Could not find a column matching \"{column_query or column_name}\". "
                       f"Available columns: {', '.join(c['name'] for c in columns if c.get('type') != 'group')}",
        }

    matched = filter_rows_by_value(rows, resolved_col, value, operator, columns)
    message = format_filter_results(matched, resolved_col, operator, value, columns, len(rows))

    return {"type": "filter_rows", "column": resolved_col, "count": len(matched), "matched": matched, "message": message}


def execute_analyze_sheet(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]],
    focus_column: str | None = None,
    analysis_type: str = "summary",
    days_ahead: int | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Analyze a sheet: date analysis, value distribution, or general summary."""
    if today is None:
        today = date.today()

    lines = []

    # If a specific column is requested
    if focus_column:
        matched_col = find_best_column(focus_column, columns)
        if not matched_col:
            return {
                "type": "analyze_sheet",
                "message": f"❌ Could not find column \"{focus_column}\".",
            }

        col_name = matched_col["name"]
        col_type = matched_col.get("type", "text")

        if col_type == "date" or _is_date_like_column(col_name):
            analysis = analyze_date_column(rows, col_name, today)
            lines.append(format_date_analysis(analysis, analysis_type))

            # If days_ahead specified, highlight that specific range
            if days_ahead is not None:
                upcoming = [
                    e for e in analysis["all_dated_rows"]
                    if 0 <= (date.fromisoformat(e["parsed_date"]) - today).days <= days_ahead
                ]
                lines.append(f"\n📌 **Within {days_ahead} days: {len(upcoming)} rows**")
                if upcoming:
                    lines.append(format_rows_as_table([], columns=columns, row_index_entries=upcoming))
        elif col_type in ("bool",):
            true_count = len(filter_rows_by_value(rows, col_name, None, "is_true", columns))
            false_count = len(rows) - true_count
            lines.append(f"✅ **\"{col_name}\"**: **{true_count}** yes / **{false_count}** no out of {len(rows)} rows")
        elif col_type in ("select",):
            counts = count_by_column_value(rows, col_name)
            lines.append(format_value_counts(counts, col_name))
        else:
            counts = count_by_column_value(rows, col_name)
            lines.append(format_value_counts(counts, col_name))

        return {"type": "analyze_sheet", "message": "\n".join(lines)}

    # General summary: analyze all date columns and provide overview
    lines.append("📋 **Sheet Summary**\n")
    lines.append(f"- **Total rows**: {len(rows)}")

    real_cols = [c for c in columns if isinstance(c, dict) and c.get("type") != "group"]
    lines.append(f"- **Columns**: {len(real_cols)}")

    # Analyze date columns
    date_cols = [c for c in real_cols if c.get("type") == "date" or _is_date_like_column(c.get("name", ""))]
    if date_cols:
        lines.append("\n**📅 Date Columns:**")
        for dc in date_cols:
            analysis = analyze_date_column(rows, dc["name"], today)
            overdue = len(analysis["overdue"])
            within_7 = len(analysis["within_7_days"])
            this_month = len(analysis["this_month"])
            lines.append(f"- **{dc['name']}**: {analysis['rows_with_dates']} dated"
                         f" | {overdue} overdue | {within_7} within 7 days | {this_month} this month")

    # Analyze boolean columns
    bool_cols = [c for c in real_cols if c.get("type") == "bool"]
    if bool_cols:
        lines.append("\n**✅ Boolean Columns:**")
        for bc in bool_cols:
            true_count = len(filter_rows_by_value(rows, bc["name"], None, "is_true", columns))
            lines.append(f"- **{bc['name']}**: {true_count}/{len(rows)} checked")

    # Analyze select columns
    select_cols = [c for c in real_cols if c.get("type") == "select"]
    if select_cols:
        lines.append("\n**📊 Status Columns:**")
        for sc in select_cols:
            counts = count_by_column_value(rows, sc["name"])
            summary = ", ".join(f"{v}: {c}" for v, c in list(counts.items())[:5])
            lines.append(f"- **{sc['name']}**: {summary}")

    return {"type": "analyze_sheet", "message": "\n".join(lines)}


def execute_get_deadlines(
    pages: list[dict[str, Any]],
    days_ahead: int = 30,
    today: date | None = None,
) -> dict[str, Any]:
    """Get upcoming deadlines from all sheets across a project."""
    if today is None:
        today = date.today()

    all_upcoming: list[dict[str, Any]] = []

    for page in pages:
        columns = page.get("columns", [])
        rows = page.get("rows", [])
        date_cols = [
            c for c in columns
            if isinstance(c, dict) and (
                c.get("type") == "date" or _is_date_like_column(c.get("name", ""))
            )
        ]

        for dc in date_cols:
            col_name = dc["name"]
            for idx, row in enumerate(rows):
                parsed = parse_date_value(row.get(col_name))
                if parsed and 0 <= (parsed - today).days <= days_ahead:
                    all_upcoming.append({
                        "row_index": idx,
                        "row": row,
                        "date": str(row.get(col_name, "")),
                        "parsed_date": parsed.isoformat(),
                        "column_name": col_name,
                        "sheet_name": page.get("name", ""),
                    })

    all_upcoming.sort(key=lambda x: x["parsed_date"])

    lines = [f"📅 **Upcoming Deadlines (next {days_ahead} days): {len(all_upcoming)}**\n"]

    if all_upcoming:
        lines.append("| # | Sheet | Date Column | Date | Row Info |")
        lines.append("|---|---|---|---|---|")
        for i, entry in enumerate(all_upcoming[:20]):
            row = entry["row"]
            # Pick a label from the row
            label = (row.get("University name") or row.get("Professor name")
                     or row.get("Name") or row.get("Subject") or "—")
            if len(label) > 30:
                label = label[:27] + "…"
            lines.append(
                f"| {i+1} | {entry['sheet_name']} | {entry['column_name']} "
                f"| {entry['date']} | {label} |"
            )
        if len(all_upcoming) > 20:
            lines.append(f"\n_…and {len(all_upcoming) - 20} more._")
    else:
        lines.append("_No upcoming deadlines found._")

    return {
        "type": "get_deadlines",
        "count": len(all_upcoming),
        "deadlines": all_upcoming,
        "message": "\n".join(lines),
    }


def execute_get_overdue_rows(
    pages: list[dict[str, Any]],
    today: date | None = None,
) -> dict[str, Any]:
    """Get rows where any date column is past today."""
    if today is None:
        today = date.today()

    all_overdue: list[dict[str, Any]] = []

    for page in pages:
        columns = page.get("columns", [])
        rows = page.get("rows", [])
        date_cols = [
            c for c in columns
            if isinstance(c, dict) and (
                c.get("type") == "date" or _is_date_like_column(c.get("name", ""))
            )
        ]

        for dc in date_cols:
            col_name = dc["name"]
            for idx, row in enumerate(rows):
                parsed = parse_date_value(row.get(col_name))
                if parsed and parsed < today:
                    all_overdue.append({
                        "row_index": idx,
                        "row": row,
                        "date": str(row.get(col_name, "")),
                        "parsed_date": parsed.isoformat(),
                        "column_name": col_name,
                        "sheet_name": page.get("name", ""),
                    })

    all_overdue.sort(key=lambda x: x["parsed_date"])

    lines = [f"🔴 **Overdue Items: {len(all_overdue)}**\n"]

    if all_overdue:
        lines.append("| # | Sheet | Date Column | Date | Row Info |")
        lines.append("|---|---|---|---|---|")
        for i, entry in enumerate(all_overdue[:20]):
            row = entry["row"]
            label = (row.get("University name") or row.get("Professor name")
                     or row.get("Name") or row.get("Subject") or "—")
            if len(label) > 30:
                label = label[:27] + "…"
            lines.append(
                f"| {i+1} | {entry['sheet_name']} | {entry['column_name']} "
                f"| {entry['date']} | {label} |"
            )
        if len(all_overdue) > 20:
            lines.append(f"\n_…and {len(all_overdue) - 20} more._")
    else:
        lines.append("_No overdue items found. You're on track! 🎉_")

    return {
        "type": "get_overdue_rows",
        "count": len(all_overdue),
        "overdue": all_overdue,
        "message": "\n".join(lines),
    }


def execute_get_column_values(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]],
    column_name: str | None = None,
    column_query: str | None = None,
) -> dict[str, Any]:
    """Get unique values in a column."""
    resolved = column_name
    if not resolved and column_query:
        matched_col = find_best_column(column_query, columns)
        if matched_col:
            resolved = matched_col["name"]

    if not resolved:
        return {
            "type": "get_column_values",
            "message": f"❌ Could not find column \"{column_query or column_name}\".",
        }

    values = get_unique_column_values(rows, resolved)
    counts = count_by_column_value(rows, resolved)

    lines = [format_value_counts(counts, resolved)]
    lines.append(f"\n**Unique values: {len(values)}**")

    return {
        "type": "get_column_values",
        "column": resolved,
        "values": values,
        "counts": counts,
        "count": len(values),
        "message": "\n".join(lines),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_date_like_column(name: str) -> bool:
    """Check if a column name suggests it contains date values."""
    lowered = name.lower()
    return any(
        token in lowered
        for token in ("date", "deadline", "scheduled", "time", "due", "sent date", "follow-up date")
    )
