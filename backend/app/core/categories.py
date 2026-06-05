import re


DEFAULT_MEDIA_CATEGORIES = (
    ("cvs", "CVs"),
    ("transcripts", "Transcripts"),
    ("certificates", "Certificates"),
    ("test-scores", "Test Scores"),
    ("proposals", "Proposals"),
    ("sop", "SOPs"),
    ("lor", "LORs"),
    ("other", "Others"),
)


def normalize_media_category(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    if not slug:
        raise ValueError("Category name is required")
    return slug[:80]


def category_display_name(value: str) -> str:
    cleaned = (value or "").strip()
    return cleaned or "Untitled category"
