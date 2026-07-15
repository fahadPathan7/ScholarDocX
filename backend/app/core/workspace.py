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
            "scholarship_hunt_tavily_configured": bool(
                settings.tavily_api_key_scholarship_hunt
            ),
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
    """Upload a file to Supabase Storage and return its relative path + size.

    SCHOLARDOCX-0139: files are stored in the Supabase "media" bucket (object
    key = relative_path, e.g. ``media/cv/<uuid>-resume.pdf``) so they persist
    across serverless/host restarts. The relative_path stored in static_files
    is unchanged in format — only the physical storage moved from local disk
    to Supabase Storage.
    """
    from app.core.storage import upload_file

    safe_category = normalize_media_category(category)
    cleaned_name = Path(filename).name.strip()
    if not cleaned_name:
        raise ValueError("Filename is required")
    # Object key is bucket-relative: the bucket is "media", so the key is just
    # <category>/<uuid>-<filename>. The relative_path stored in static_files
    # keeps the "media/" prefix so existing lookups and migrations are unaffected;
    # only the Storage object key drops it.
    object_key = f"{safe_category}/{uuid4().hex}-{cleaned_name}"
    relative_path = f"media/{object_key}"

    # Read the upload stream once so we can measure size and upload it.
    body = source_file.read()
    import io
    size_bytes = len(body)
    upload_file(object_key, io.BytesIO(body))
    return {
        "relative_path": relative_path,
        "size_bytes": size_bytes,
    }
