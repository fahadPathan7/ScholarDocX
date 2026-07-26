"""Agentic record-domain actions (SCHOLARDOCX-0110).

Spec-driven create/update/delete/list engine plus special actions for the
user-owned record domains outside the sheet workspace: documents and
versions, email templates and drafts, outreach logs, reminders, deadlines,
universities, programs, professors, applications, and research notes.

All writes go through ``Store`` CRUD so data stays local and user-scoped.
Foreign keys are resolved by name; ids supplied by the AI are never trusted.
Admin domains intentionally have no specs here and never will.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services.store import Store
from app.services.ai_actions_read import parse_date_value


def _clean(value: Any) -> str:
    return str(value or "").strip()


# Payload key → (table, lookup column, id column stored on the record).
FK_FIELDS = {
    "university_name": ("universities", "name", "university_id"),
    "program_name": ("programs", "name", "program_id"),
    "professor_name": ("professors", "name", "professor_id"),
    "template_name": ("email_templates", "name", "template_id"),
}

DOMAIN_SPECS: dict[str, dict[str, Any]] = {
    "document": {
        "table": "documents",
        "label": "document",
        "plural": "documents",
        "name_field": "title",
        "required": ["title"],
        "fields": ["title", "document_type"],
        "defaults": {"document_type": "other"},
        "fks": [],
        # document_versions.document_id is NOT NULL, so children must go first.
        "cascade": [("document_versions", "document_id")],
        "list_columns": ["title", "document_type", "updated_at"],
    },
    "email_template": {
        "table": "email_templates",
        "label": "email template",
        "plural": "email_templates",
        "name_field": "name",
        "required": ["name", "subject_template", "body_template"],
        "fields": ["name", "subject_template", "body_template"],
        "defaults": {},
        "fks": [],
        "list_columns": ["name", "subject_template"],
    },
    "email_draft": {
        "table": "email_drafts",
        "label": "email draft",
        "plural": "email_drafts",
        "name_field": "subject",
        "required": ["subject", "body"],
        "fields": ["subject", "body", "recipient_email", "status"],
        "defaults": {"status": "Draft"},
        "fks": ["template_name", "professor_name"],
        "list_columns": ["subject", "recipient_email", "status"],
    },
    "reminder": {
        "table": "reminders",
        "label": "reminder",
        "plural": "reminders",
        "name_field": "title",
        "required": ["title", "due_at"],
        "fields": ["title", "due_at", "notes"],
        "defaults": {},
        "fks": [],
        "date_fields": ["due_at"],
        "list_columns": ["title", "due_at", "completed_at"],
    },
    "deadline": {
        "table": "deadlines",
        "label": "deadline",
        "plural": "deadlines",
        "name_field": "title",
        "required": ["title", "due_at"],
        "fields": ["title", "due_at", "deadline_type", "notes"],
        "defaults": {"deadline_type": "application"},
        "fks": [],
        "date_fields": ["due_at"],
        "list_columns": ["title", "due_at", "deadline_type", "completed_at"],
    },
    "university": {
        "table": "universities",
        "label": "university",
        "plural": "universities",
        "name_field": "name",
        "required": ["name", "country"],
        "fields": ["name", "country", "region", "website_url", "notes"],
        "defaults": {},
        "fks": [],
        # programs.university_id is NOT NULL, so children must go first.
        "cascade": [("programs", "university_id")],
        "list_columns": ["name", "country", "region"],
    },
    "program": {
        "table": "programs",
        "label": "program",
        "plural": "programs",
        "name_field": "name",
        "required": ["name", "university_name"],
        "fields": ["name", "degree_type", "department", "application_url", "funding_url", "notes"],
        "defaults": {},
        "fks": ["university_name"],
        "list_columns": ["name", "degree_type", "department"],
    },
    "professor": {
        "table": "professors",
        "label": "professor",
        "plural": "professors",
        "name_field": "name",
        "required": ["name"],
        "fields": ["name", "title", "email", "profile_url", "research_interests", "notes"],
        "defaults": {},
        "fks": ["university_name", "program_name"],
        "list_columns": ["name", "title", "email", "research_interests"],
    },
    "application": {
        "table": "applications",
        "label": "application",
        "plural": "applications",
        # Applications have no name column; they are identified by the linked
        # university's name.
        "name_field": "university_name",
        "required": ["university_name"],
        "fields": ["status", "intake_term", "priority", "application_url", "notes"],
        "defaults": {"status": "Researching"},
        "fks": ["university_name", "program_name", "professor_name"],
        "list_columns": ["status", "intake_term", "priority"],
    },
    "research_note": {
        "table": "research_notes",
        "label": "research note",
        "plural": "research_notes",
        "name_field": "title",
        "required": ["title", "content"],
        "fields": ["title", "content", "sources"],
        "defaults": {},
        "fks": ["professor_name", "university_name"],
        "list_columns": ["title", "updated_at"],
    },
}

RECORD_CREATE_ACTIONS = {f"create_{domain}": domain for domain in DOMAIN_SPECS}
RECORD_UPDATE_ACTIONS = {f"update_{domain}": domain for domain in DOMAIN_SPECS}
RECORD_DELETE_ACTIONS = {f"delete_{domain}": domain for domain in DOMAIN_SPECS}
RECORD_LIST_ACTIONS = {f"list_{spec['plural']}": domain for domain, spec in DOMAIN_SPECS.items()}
SPECIAL_WRITE_ACTIONS = {
    "add_document_version",
    "complete_reminder",
    "complete_deadline",
    "log_outreach",
    "update_outreach_log",
    "mark_notifications_read",
}
SPECIAL_READ_ACTIONS = {"list_outreach_logs", "get_due_reminders"}

RECORD_ACTIONS = (
    set(RECORD_CREATE_ACTIONS)
    | set(RECORD_UPDATE_ACTIONS)
    | set(RECORD_DELETE_ACTIONS)
    | set(RECORD_LIST_ACTIONS)
    | SPECIAL_WRITE_ACTIONS
    | SPECIAL_READ_ACTIONS
)
RECORD_READ_ONLY = set(RECORD_LIST_ACTIONS) | SPECIAL_READ_ACTIONS


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def normalize_record_action(raw_action: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize one planner-produced record action; None if not ours."""
    action_type = raw_action.get("type")

    if action_type in RECORD_CREATE_ACTIONS:
        domain = RECORD_CREATE_ACTIONS[action_type]
        spec = DOMAIN_SPECS[domain]
        # Accept the field payload nested under the domain key, under "data"
        # (our own normalized output round-tripped through confirm/execute),
        # or flat on the action.
        if isinstance(raw_action.get(domain), dict):
            payload = raw_action[domain]
        elif isinstance(raw_action.get("data"), dict):
            payload = raw_action["data"]
        else:
            payload = raw_action
        data: dict[str, Any] = {}
        for field in spec["fields"] + [spec["name_field"]] + spec["fks"]:
            value = _clean(payload.get(field))
            if value:
                data[field] = value
        missing = [
            f"{domain}_{field}" for field in spec["required"] if not _clean(data.get(field))
        ]
        if missing:
            return {"type": action_type, "missing": missing}
        return {"type": action_type, "data": data}

    if action_type in RECORD_UPDATE_ACTIONS:
        domain = RECORD_UPDATE_ACTIONS[action_type]
        spec = DOMAIN_SPECS[domain]
        name = _record_name_from(raw_action, domain, spec)
        updates = raw_action.get("updates") if isinstance(raw_action.get("updates"), dict) else {}
        missing = []
        if not name:
            missing.append(f"{domain}_{spec['name_field']}")
        if not updates:
            missing.append("updates")
        if missing:
            return {"type": action_type, "missing": missing}
        return {"type": action_type, "name": name, "updates": updates}

    if action_type in RECORD_DELETE_ACTIONS:
        domain = RECORD_DELETE_ACTIONS[action_type]
        spec = DOMAIN_SPECS[domain]
        name = _record_name_from(raw_action, domain, spec)
        if not name:
            return {"type": action_type, "missing": [f"{domain}_{spec['name_field']}"]}
        return {"type": action_type, "name": name}

    if action_type in RECORD_LIST_ACTIONS:
        return {"type": action_type}

    if action_type == "add_document_version":
        document_title = _clean(raw_action.get("document_title") or raw_action.get("title"))
        content = _clean(raw_action.get("content"))
        missing = []
        if not document_title:
            missing.append("document_title")
        if not content:
            missing.append("version_content")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "document_title": document_title, "content": content}
        if _clean(raw_action.get("version_label")):
            action["version_label"] = _clean(raw_action["version_label"])
        if _clean(raw_action.get("content_format")):
            action["content_format"] = _clean(raw_action["content_format"])
        return action

    if action_type in ("complete_reminder", "complete_deadline"):
        title = _clean(raw_action.get("title"))
        if not title:
            return {"type": action_type, "missing": ["title"]}
        return {"type": action_type, "title": title}

    if action_type == "log_outreach":
        recipient = _clean(raw_action.get("recipient_email"))
        subject = _clean(raw_action.get("subject"))
        missing = []
        if not recipient:
            missing.append("recipient_email")
        if not subject:
            missing.append("subject")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "recipient_email": recipient, "subject": subject}
        for key in ("sent_at", "notes", "professor_name"):
            if _clean(raw_action.get(key)):
                action[key] = _clean(raw_action[key])
        if raw_action.get("follow_up_days") is not None:
            try:
                action["follow_up_days"] = int(raw_action["follow_up_days"])
            except (TypeError, ValueError):
                pass
        return action

    if action_type == "update_outreach_log":
        subject = _clean(raw_action.get("subject"))
        updates = raw_action.get("updates") if isinstance(raw_action.get("updates"), dict) else {}
        missing = []
        if not subject:
            missing.append("subject")
        if not updates:
            missing.append("updates")
        if missing:
            return {"type": action_type, "missing": missing}
        return {"type": action_type, "subject": subject, "updates": updates}

    if action_type in ("list_outreach_logs", "mark_notifications_read"):
        return {"type": action_type}

    if action_type == "get_due_reminders":
        action = {"type": action_type}
        if raw_action.get("days_ahead") is not None:
            try:
                action["days_ahead"] = int(raw_action["days_ahead"])
            except (TypeError, ValueError):
                pass
        return action

    return None


def _record_name_from(raw_action: dict[str, Any], domain: str, spec: dict[str, Any]) -> str:
    return _clean(
        raw_action.get(spec["name_field"])
        or raw_action.get(f"{domain}_{spec['name_field']}")
        or raw_action.get("name")
        or raw_action.get("title")
    )


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

def execute_record_action(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    action_type = action["type"]

    if action_type in RECORD_CREATE_ACTIONS:
        return _execute_create(store, RECORD_CREATE_ACTIONS[action_type], action)
    if action_type in RECORD_UPDATE_ACTIONS:
        return _execute_update(store, RECORD_UPDATE_ACTIONS[action_type], action)
    if action_type in RECORD_DELETE_ACTIONS:
        return _execute_delete(store, RECORD_DELETE_ACTIONS[action_type], action)
    if action_type in RECORD_LIST_ACTIONS:
        return _execute_list(store, RECORD_LIST_ACTIONS[action_type], action)

    special = {
        "add_document_version": _execute_add_document_version,
        "complete_reminder": lambda s, a: _execute_complete(s, "reminders", "reminder", a),
        "complete_deadline": lambda s, a: _execute_complete(s, "deadlines", "deadline", a),
        "log_outreach": _execute_log_outreach,
        "update_outreach_log": _execute_update_outreach_log,
        "list_outreach_logs": _execute_list_outreach_logs,
        "get_due_reminders": _execute_get_due_reminders,
        "mark_notifications_read": _execute_mark_notifications_read,
    }
    handler = special.get(action_type)
    if not handler:
        raise ValueError(f"Unsupported action: {action_type}")
    return handler(store, action)


def _resolve_fks(store: Store, payload: dict[str, Any]) -> dict[str, Any]:
    resolved = dict(payload)
    for key, (table, lookup, id_column) in FK_FIELDS.items():
        name = _clean(resolved.pop(key, ""))
        if not name:
            continue
        record = _find_by_name(store, table, lookup, name)
        resolved[id_column] = record["id"]
    return resolved


def _find_by_name(store: Store, table: str, field: str, name: str) -> dict[str, Any]:
    all_records = store.list_records(table)
    matches = [
        record for record in all_records
        if _clean(record.get(field)).lower() == name.lower()
    ]
    if not matches:
        matches = [
            record for record in all_records
            if name.lower() in _clean(record.get(field)).lower()
            or _clean(record.get(field)).lower() in name.lower()
        ]
    if not matches:
        raise ValueError(f"No {table.replace('_', ' ')} record named '{name}' was found.")
    if len(matches) > 1:
        raise ValueError(
            f"Multiple {table.replace('_', ' ')} records matching '{name}'; please refine the name."
        )
    return matches[0]


def _resolve_record(store: Store, domain: str, spec: dict[str, Any], name: str) -> dict[str, Any]:
    if domain == "application":
        university = _find_by_name(store, "universities", "name", name)
        matches = [
            record for record in store.list_records("applications")
            if record.get("university_id") == university["id"]
        ]
        if not matches:
            raise ValueError(f"No application linked to university '{name}' was found.")
        if len(matches) > 1:
            raise ValueError(
                f"Multiple applications are linked to '{name}'; refine the request with more detail."
            )
        return matches[0]
    return _find_by_name(store, spec["table"], spec["name_field"], name)


def _normalize_dates(spec: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    for field in spec.get("date_fields", []):
        raw = _clean(payload.get(field))
        if not raw:
            continue
        parsed = parse_date_value(raw)
        if not parsed:
            raise ValueError(f"Could not understand the date '{raw}' for {field}.")
        payload[field] = parsed.isoformat()
    return payload


def _record_display_name(domain: str, spec: dict[str, Any], record: dict[str, Any], fallback: str = "") -> str:
    if domain == "application":
        return fallback or f"#{record.get('id')}"
    return _clean(record.get(spec["name_field"])) or fallback or f"#{record.get('id')}"


def _execute_create(store: Store, domain: str, action: dict[str, Any]) -> dict[str, Any]:
    spec = DOMAIN_SPECS[domain]
    payload = {**spec["defaults"], **action["data"]}
    display = _clean(payload.get(spec["name_field"])) or _clean(payload.get("university_name"))
    payload = _resolve_fks(store, payload)
    payload = _normalize_dates(spec, payload)
    created = store.create_record(spec["table"], payload)
    name = _record_display_name(domain, spec, created, display)
    return {
        "type": action["type"],
        "record": created,
        "line": f"- Created {spec['label']} **{name}**.",
    }


def _execute_update(store: Store, domain: str, action: dict[str, Any]) -> dict[str, Any]:
    spec = DOMAIN_SPECS[domain]
    record = _resolve_record(store, domain, spec, action["name"])
    updates = _resolve_fks(store, dict(action["updates"]))
    updates = _normalize_dates(spec, updates)
    updated = store.update_record(spec["table"], record["id"], updates)
    name = _record_display_name(domain, spec, updated, action["name"])
    return {
        "type": action["type"],
        "record": updated,
        "line": f"- Updated {spec['label']} **{name}**.",
    }


def _execute_delete(store: Store, domain: str, action: dict[str, Any]) -> dict[str, Any]:
    spec = DOMAIN_SPECS[domain]
    record = _resolve_record(store, domain, spec, action["name"])
    for child_table, fk_column in spec.get("cascade", []):
        for child in store.list_records(child_table):
            if child.get(fk_column) == record["id"]:
                store.delete_record(child_table, child["id"])
    deleted = store.delete_record(spec["table"], record["id"])
    name = _record_display_name(domain, spec, deleted, action["name"])
    return {
        "type": action["type"],
        "record": deleted,
        "line": f"- Deleted {spec['label']} **{name}**.",
    }


def _execute_list(store: Store, domain: str, action: dict[str, Any]) -> dict[str, Any]:
    spec = DOMAIN_SPECS[domain]
    records = store.list_records(spec["table"])
    title = spec["plural"].replace("_", " ").title()
    lines = [f"📋 **{title}: {len(records)}**\n"]
    if records:
        for record in records[:15]:
            name = _record_display_name(domain, spec, record)
            details = ", ".join(
                f"{column.replace('_', ' ')}: {record[column]}"
                for column in spec["list_columns"]
                if column != spec["name_field"] and _clean(record.get(column))
            )
            lines.append(f"- **{name}**" + (f" — {details}" if details else ""))
        if len(records) > 15:
            lines.append(f"_...and {len(records) - 15} more._")
    else:
        lines.append(f"_No {spec['plural'].replace('_', ' ')} found._")
    return {
        "type": action["type"],
        "records": records,
        "count": len(records),
        "message": "\n".join(lines),
    }


def _execute_add_document_version(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    document = _find_by_name(store, "documents", "title", action["document_title"])
    versions = [
        version for version in store.list_records("document_versions")
        if version.get("document_id") == document["id"]
    ]
    label = action.get("version_label") or f"v{len(versions) + 1}"
    created = store.create_record(
        "document_versions",
        {
            "document_id": document["id"],
            "version_label": label,
            "content_format": action.get("content_format", "markdown"),
            "content": action["content"],
        },
    )
    return {
        "type": action["type"],
        "record": created,
        "line": f"- Added version **{label}** to document **{document['title']}**.",
    }


def _execute_complete(store: Store, table: str, label: str, action: dict[str, Any]) -> dict[str, Any]:
    open_items = [
        record for record in store.list_records(table)
        if _clean(record.get("title")).lower() == action["title"].lower()
        and not record.get("completed_at")
    ]
    if not open_items:
        raise ValueError(f"No open {label} titled '{action['title']}' was found.")
    if len(open_items) > 1:
        raise ValueError(f"Multiple open {label}s titled '{action['title']}'; rename one first.")
    updated = store.update_record(
        table, open_items[0]["id"], {"completed_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    )
    return {
        "type": action["type"],
        "record": updated,
        "line": f"- Marked {label} **{updated['title']}** as completed.",
    }


def _execute_log_outreach(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "recipient_email": action["recipient_email"],
        "subject": action["subject"],
        "sent_at": action.get("sent_at") or date.today().isoformat(),
    }
    parsed = parse_date_value(payload["sent_at"])
    if parsed:
        payload["sent_at"] = parsed.isoformat()
    if action.get("notes"):
        payload["notes"] = action["notes"]
    payload = _resolve_fks(store, {**payload, "professor_name": action.get("professor_name", "")})
    follow_up_days = action.get("follow_up_days")
    created = store.log_outreach(payload, follow_up_days)
    line = f"- Logged outreach to **{created['recipient_email']}** ({created['subject']})."
    if follow_up_days:
        line += f" Follow-up reminder set in {follow_up_days} day(s)."
    return {"type": action["type"], "record": created, "line": line}


def _execute_update_outreach_log(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    matches = [
        record for record in store.list_records("outreach_logs")
        if _clean(record.get("subject")).lower() == action["subject"].lower()
    ]
    if not matches:
        raise ValueError(f"No outreach log with subject '{action['subject']}' was found.")
    # list_records orders id DESC, so the first match is the most recent log.
    updates = {
        key: value for key, value in action["updates"].items()
        if key in ("response_status", "notes", "recipient_email")
    }
    if not updates:
        raise ValueError("Only response_status, notes, or recipient_email can be updated on outreach logs.")
    updated = store.update_record("outreach_logs", matches[0]["id"], updates)
    return {
        "type": action["type"],
        "record": updated,
        "line": f"- Updated outreach log **{updated['subject']}**.",
    }


def _execute_list_outreach_logs(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    records = store.list_records("outreach_logs")
    lines = [f"📨 **Outreach Logs: {len(records)}**\n"]
    if records:
        for record in records[:15]:
            lines.append(
                f"- **{record.get('subject', '—')}** → {record.get('recipient_email', '—')} "
                f"(sent {record.get('sent_at', '—')}, {record.get('response_status', 'Waiting')})"
            )
        if len(records) > 15:
            lines.append(f"_...and {len(records) - 15} more._")
    else:
        lines.append("_No outreach logged yet._")
    return {
        "type": action["type"],
        "records": records,
        "count": len(records),
        "message": "\n".join(lines),
    }


def _execute_get_due_reminders(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    days_ahead = action.get("days_ahead", 7)
    today = date.today()
    horizon = today + timedelta(days=days_ahead)
    due: list[tuple[date, dict[str, Any]]] = []
    for record in store.list_records("reminders"):
        if record.get("completed_at"):
            continue
        due_at = parse_date_value(record.get("due_at"))
        if due_at and due_at <= horizon:
            due.append((due_at, record))
    due.sort(key=lambda item: item[0])
    lines = [f"⏰ **Reminders due within {days_ahead} day(s): {len(due)}**\n"]
    if due:
        for due_at, record in due[:15]:
            flag = " ⚠️ overdue" if due_at < today else ""
            lines.append(f"- **{record.get('title', '—')}** — due {due_at.isoformat()}{flag}")
    else:
        lines.append("_Nothing due. You're on track._")
    return {
        "type": action["type"],
        "records": [record for _, record in due],
        "count": len(due),
        "message": "\n".join(lines),
    }


def _execute_mark_notifications_read(store: Store, action: dict[str, Any]) -> dict[str, Any]:
    unread = [
        record for record in store.list_records("notifications") if not record.get("read_at")
    ]
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for record in unread:
        store.update_record("notifications", record["id"], {"read_at": stamp})
    return {
        "type": action["type"],
        "count": len(unread),
        "line": f"- Marked **{len(unread)}** notification(s) as read.",
    }


# ---------------------------------------------------------------------------
# Plan descriptions and workspace snapshot
# ---------------------------------------------------------------------------

def describe_record_action(action: dict[str, Any]) -> str | None:
    action_type = action.get("type")
    if action_type in RECORD_CREATE_ACTIONS:
        domain = RECORD_CREATE_ACTIONS[action_type]
        spec = DOMAIN_SPECS[domain]
        name = _clean(action.get("data", {}).get(spec["name_field"]))
        return f"Create {spec['label']}: {name}" if name else f"Create {spec['label']}"
    if action_type in RECORD_UPDATE_ACTIONS:
        spec = DOMAIN_SPECS[RECORD_UPDATE_ACTIONS[action_type]]
        return f"Update {spec['label']}: {action.get('name')}"
    if action_type in RECORD_DELETE_ACTIONS:
        spec = DOMAIN_SPECS[RECORD_DELETE_ACTIONS[action_type]]
        return f"Delete {spec['label']}: {action.get('name')}"
    if action_type in RECORD_LIST_ACTIONS:
        spec = DOMAIN_SPECS[RECORD_LIST_ACTIONS[action_type]]
        return f"List {spec['plural'].replace('_', ' ')}"
    specials = {
        "add_document_version": f"Add a new version to document: {action.get('document_title')}",
        "complete_reminder": f"Complete reminder: {action.get('title')}",
        "complete_deadline": f"Complete deadline: {action.get('title')}",
        "log_outreach": f"Log outreach to {action.get('recipient_email')}",
        "update_outreach_log": f"Update outreach log: {action.get('subject')}",
        "list_outreach_logs": "List outreach logs",
        "get_due_reminders": "Find due reminders",
        "mark_notifications_read": "Mark notifications as read",
    }
    return specials.get(action_type)


def records_snapshot(store: Store) -> dict[str, Any]:
    """Compact record-name context so the planner can match existing entities."""
    snapshot: dict[str, Any] = {}
    for domain, spec in DOMAIN_SPECS.items():
        if domain == "application":
            continue
        try:
            names = [
                _clean(record.get(spec["name_field"]))
                for record in store.list_records(spec["table"])[:20]
            ]
        except Exception:
            names = []
        names = [name for name in names if name]
        if names:
            snapshot[spec["plural"]] = names
    try:
        universities = {
            record["id"]: record.get("name", "")
            for record in store.list_records("universities")
        }
        applications = [
            {
                "university": universities.get(record.get("university_id"), ""),
                "status": record.get("status", ""),
            }
            for record in store.list_records("applications")[:20]
        ]
    except Exception:
        applications = []
    if applications:
        snapshot["applications"] = applications
    return snapshot
