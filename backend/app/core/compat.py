from datetime import datetime, date
import json
from typing import Any

def safe_parse_datetime(val: Any) -> datetime | None:
    """Safely parse a datetime object from either a string or a native datetime."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        # Handle formats with Z or +00:00
        return datetime.fromisoformat(str(val).replace("Z", "+00:00").split("+")[0])
    except (ValueError, TypeError, AttributeError):
        return None

def safe_parse_date(val: Any) -> date | None:
    """Safely parse a date object from either a string or a native date/datetime."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val).replace("Z", "+00:00").split("T")[0])
    except (ValueError, TypeError, AttributeError):
        return None

def safe_json_loads(val: Any, default: Any = None) -> Any:
    """Safely load JSON, returning the value directly if it's already a dict/list."""
    if not val:
        return default
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return default
    # If it's already a dict, list, int, etc. natively returned by Postgres JSONB
    return val
