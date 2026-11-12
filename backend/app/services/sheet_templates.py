"""Starting columns for a new sheet (SCHOLARDOCX-0259).

A sheet is blank (lettered text columns) unless the caller asks for the
application tracker or supplies its own columns. Kept out of ``store.py``,
which is a persistence layer and was already past the file-size limit.
"""

from typing import Any

SHEET_TEMPLATES = ("blank", "application")
BLANK_SHEET_COLUMN_COUNT = 5
MAX_SHEET_COLUMNS = 80
MAX_COLUMN_NAME_LENGTH = 30
SHEET_COLUMN_TYPES = {"text", "number", "bool", "file", "date", "select", "group", "url"}


def column_letter(index: int) -> str:
    """Spreadsheet letter for a zero-based index: 0 -> A, 25 -> Z, 26 -> AA."""
    letters = ""
    number = index + 1
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def blank_sheet_columns(count: int = BLANK_SHEET_COLUMN_COUNT) -> list[dict]:
    return [{"name": column_letter(index), "type": "text"} for index in range(count)]


def clean_sheet_columns(raw: Any) -> list[dict]:
    """Validate client-supplied starting columns for a new sheet.

    Raises ValueError on anything that would produce a broken grid: a
    non-list, a column without a name, an unknown type, or two data columns
    sharing a name (rows are keyed by column name, so they would overlap).
    """
    if not isinstance(raw, list) or not raw:
        raise ValueError("columns must be a non-empty list")
    if len(raw) > MAX_SHEET_COLUMNS:
        raise ValueError(f"a sheet can start with at most {MAX_SHEET_COLUMNS} columns")
    cleaned: list[dict] = []
    seen: set[tuple[bool, str]] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("each column must be an object")
        name = str(item.get("name") or "").strip()[:MAX_COLUMN_NAME_LENGTH]
        col_type = str(item.get("type") or "text")
        if not name:
            raise ValueError("column names cannot be empty")
        if col_type not in SHEET_COLUMN_TYPES:
            raise ValueError(f"unknown column type: {col_type}")
        key = (col_type == "group", name)
        if key in seen:
            raise ValueError(f"duplicate column name: {name}")
        seen.add(key)
        column: dict = {"name": name, "type": col_type}
        if isinstance(item.get("width"), (int, float)) and not isinstance(item.get("width"), bool):
            column["width"] = int(item["width"])
        for text_key in ("group", "color"):
            if isinstance(item.get(text_key), str) and item[text_key].strip():
                column[text_key] = item[text_key].strip()
        if isinstance(item.get("options"), list):
            column["options"] = [str(option) for option in item["options"] if str(option).strip()]
        if item.get("unique") is True:
            column["unique"] = True
        cleaned.append(column)
    return cleaned


def get_columns_for_degree(degree_type: str) -> list[dict]:
    uni_name = [{"name": "University name", "type": "text", "unique": True}]
    uni_details = [
        {"name": "Uni details", "type": "group", "color": "#6f42c1"},
        {"name": "Global rank", "type": "number", "group": "Uni details"},
        {"name": "Local rank", "type": "number", "group": "Uni details"},
        {"name": "Program", "type": "text", "group": "Uni details"},
        {"name": "Deadline", "type": "date", "group": "Uni details"},
        {"name": "Application portal", "type": "url", "group": "Uni details"},
        {"name": "Application fee", "type": "number", "group": "Uni details"},
        {"name": "TOEFL / IELTS", "type": "text", "group": "Uni details"},
        {"name": "SAT" if degree_type not in ["phd", "masters"] else "GRE", "type": "text", "group": "Uni details"},
    ]
    prof_details = [
        {"name": "Professor name", "type": "text", "unique": True},
        {"name": "Prof details", "type": "group", "color": "#2f6d7a"},
        {"name": "Email", "type": "text", "group": "Prof details"},
        {"name": "Department", "type": "text", "group": "Prof details"},
        {"name": "Interests", "type": "text", "group": "Prof details"},
        {"name": "Google Scholar", "type": "url", "group": "Prof details"},
        {"name": "Portfolio", "type": "url", "group": "Prof details"},
        {"name": "Uni profile", "type": "url", "group": "Prof details"},
    ]
    funding = []
    if degree_type in ["phd", "masters"]:
        funding = [
            {"name": "Funding", "type": "group", "color": "#007bff"},
            {"name": "Uni fund available", "type": "bool", "group": "Funding"},
            {"name": "Uni fund details", "type": "text", "group": "Funding"},
            {"name": "Prof fund available", "type": "bool", "group": "Funding"},
            {"name": "Prof fund details", "type": "text", "group": "Funding"},
        ]

    email_group = [
        {"name": "Email", "type": "group", "color": "#4f8a45"},
        {"name": "Subject", "type": "text", "group": "Email"},
        {"name": "Body", "type": "text", "group": "Email"},
        {"name": "Scheduled time", "type": "date", "group": "Email"},
        {"name": "Cold email sent", "type": "bool", "group": "Email"},
        {"name": "Cold email date", "type": "date", "group": "Email"},
        {"name": "First follow-up sent", "type": "bool", "group": "Email"},
        {"name": "First follow-up date", "type": "date", "group": "Email"},
        {"name": "Second follow-up sent", "type": "bool", "group": "Email"},
        {"name": "Second follow-up date", "type": "date", "group": "Email"},
        {"name": "Email thread link", "type": "url", "group": "Email"},
    ]
    scholarship = [
        {"name": "Scholarship", "type": "group", "color": "#007bff"},
        {"name": "Available", "type": "bool", "group": "Scholarship"},
        {"name": "Details", "type": "text", "group": "Scholarship"},
        {"name": "Separate app needed", "type": "bool", "group": "Scholarship"},
        {"name": "Applied", "type": "bool", "group": "Scholarship"},
    ]
    status_options = ["Researching", "Ready", "Applied", "Waitlisted", "Accepted", "Rejected", "Archived"]
    if degree_type in ["phd", "masters"]:
        status_options = ["Researching", "Ready", "Sent", "Follow-up due", "Applied", "Waitlisted", "Accepted", "Rejected", "Archived"]

    status_applied = [
        {"name": "Status", "type": "select", "options": status_options},
        {"name": "Applied", "type": "bool"},
    ]
    notes = [{"name": "Notes", "type": "text"}]
    response = [{"name": "Response", "type": "text"}]

    if degree_type in ["phd", "masters"]:
        return uni_name + uni_details + prof_details + funding + status_applied + response + notes + email_group
    else:
        return uni_name + uni_details + scholarship + status_applied + notes


def application_tracker_columns(degree_type: str) -> list[dict]:
    """The full application tracker for a degree: the tracking columns plus
    the Attachments group and its file columns."""
    # Build columns list dynamically based on degree type
    columns = get_columns_for_degree(degree_type)

    columns.append({"name": "Attachments", "type": "group", "color": "#c58940", "width": 150})
    attachments = []
    if degree_type == "phd":
        attachments = [
            {"name": "CV", "type": "file", "group": "Attachments"},
            {"name": "SOP", "type": "file", "group": "Attachments"},
            {"name": "Research Proposal", "type": "file", "group": "Attachments"},
            {"name": "BSc certificate", "type": "file", "group": "Attachments"},
            {"name": "BSc transcript", "type": "file", "group": "Attachments"},
            {"name": "MSc certificate", "type": "file", "group": "Attachments"},
            {"name": "MSc transcript", "type": "file", "group": "Attachments"},
            {"name": "LOR1", "type": "file", "group": "Attachments"},
            {"name": "LOR2", "type": "file", "group": "Attachments"},
            {"name": "LOR3", "type": "file", "group": "Attachments"},
        ]
    elif degree_type == "masters":
        attachments = [
            {"name": "CV", "type": "file", "group": "Attachments"},
            {"name": "SOP", "type": "file", "group": "Attachments"},
            {"name": "BSc certificate", "type": "file", "group": "Attachments"},
            {"name": "BSc transcript", "type": "file", "group": "Attachments"},
            {"name": "LOR1", "type": "file", "group": "Attachments"},
            {"name": "LOR2", "type": "file", "group": "Attachments"},
            {"name": "LOR3", "type": "file", "group": "Attachments"},
        ]
    else:
        attachments = [
            {"name": "CV", "type": "file", "group": "Attachments"},
            {"name": "SOP", "type": "file", "group": "Attachments"},
            {"name": "High school certificate", "type": "file", "group": "Attachments"},
            {"name": "High school transcript", "type": "file", "group": "Attachments"},
            {"name": "LOR1", "type": "file", "group": "Attachments"},
            {"name": "LOR2", "type": "file", "group": "Attachments"},
            {"name": "LOR3", "type": "file", "group": "Attachments"},
        ]
    return columns + attachments
