from __future__ import annotations

import json
from typing import Any


WORKSPACE_NOTIFICATION_DEFAULTS: dict[str, bool] = {
    "project_create": True,
    "project_delete": True,
    "project_pin": False,
    "sheet_create": True,
    "sheet_delete": True,
    "sheet_pin": False,
    "record_create": False,
    "record_delete": True,
    "whiteboard_create": False,
    "whiteboard_delete": True,
    "sticky_note_create": False,
    "sticky_note_update": False,
    "sticky_note_delete": True,
    "scheduled_email": True,
}

ADMIN_NOTIFICATION_DEFAULTS: dict[str, bool] = {
    "system": True,
    "announcements": True,
    "billing": True,
    "plans": True,
}

DEFAULT_NOTIFICATION_SETTINGS: dict[str, bool] = {
    **WORKSPACE_NOTIFICATION_DEFAULTS,
    **ADMIN_NOTIFICATION_DEFAULTS,
}

MANDATORY_NOTIFICATION_KEYS = {"system"}
ADMIN_NOTIFICATION_KEYS = tuple(ADMIN_NOTIFICATION_DEFAULTS.keys())


def default_notification_settings_json() -> str:
    return json.dumps(DEFAULT_NOTIFICATION_SETTINGS)


def normalize_notification_settings(raw: Any) -> dict[str, bool]:
    normalized = {**DEFAULT_NOTIFICATION_SETTINGS}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = None
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, bool):
                normalized[key] = value
            elif isinstance(value, str):
                lowered = value.strip().lower()
                if lowered == "true":
                    normalized[key] = True
                elif lowered == "false":
                    normalized[key] = False
    for key in MANDATORY_NOTIFICATION_KEYS:
        normalized[key] = True
    return normalized


def is_notification_enabled(raw_settings: Any, preference_key: str) -> bool:
    normalized = normalize_notification_settings(raw_settings)
    if preference_key in MANDATORY_NOTIFICATION_KEYS:
        return True
    return normalized.get(preference_key, True)
