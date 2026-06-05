from pathlib import Path
import shutil
from uuid import uuid4

from app.core.categories import DEFAULT_MEDIA_CATEGORIES, normalize_media_category
from app.core.config import Settings


MEDIA_CATEGORIES = tuple(slug for slug, _label in DEFAULT_MEDIA_CATEGORIES)


def ensure_workspace(settings: Settings) -> dict:
    settings.workspace_path.mkdir(parents=True, exist_ok=True)
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    settings.media_path.mkdir(parents=True, exist_ok=True)
    for category in MEDIA_CATEGORIES:
        (settings.media_path / category).mkdir(parents=True, exist_ok=True)
    return workspace_status(settings)


def workspace_status(settings: Settings) -> dict:
    return {
        "workspace_path": str(settings.workspace_path),
        "database_path": str(settings.database_path),
        "media_path": str(settings.media_path),
        "database_exists": settings.database_path.exists(),
        "media_categories": list(MEDIA_CATEGORIES),
        "ai": {
            "glm_configured": bool(settings.glm_api_key),
            "gemini_configured": bool(settings.gemini_api_key),
            "tavily_configured": bool(settings.tavily_api_key),
            "chat_provider_configured": settings.chat_provider_configured,
            "fully_configured": settings.ai_configured,
        },
    }


def safe_media_path(settings: Settings, category: str, filename: str) -> Path:
    safe_category = normalize_media_category(category)
    cleaned_name = Path(filename).name.strip()
    if not cleaned_name:
        raise ValueError("Filename is required")
    destination_dir = (settings.media_path / safe_category).resolve()
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = (destination_dir / f"{uuid4().hex}-{cleaned_name}").resolve()
    if settings.media_path.resolve() not in destination.parents:
        raise ValueError("Resolved file path is outside the workspace")
    return destination


def save_upload(settings: Settings, category: str, filename: str, source_file) -> dict:
    destination = safe_media_path(settings, category, filename)
    with destination.open("wb") as output:
        shutil.copyfileobj(source_file, output)
    relative_path = destination.relative_to(settings.workspace_path)
    return {
        "relative_path": str(relative_path),
        "size_bytes": destination.stat().st_size,
    }
