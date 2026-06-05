from app.core.config import Settings
from app.core.workspace import ensure_workspace, safe_media_path


def test_ensure_workspace_creates_expected_folders(tmp_path):
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"

    status = ensure_workspace(settings)

    assert settings.database_path.parent.exists()
    assert (settings.media_path / "cvs").exists()
    assert status["media_categories"]


def test_safe_media_path_keeps_file_inside_workspace(tmp_path):
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    ensure_workspace(settings)

    destination = safe_media_path(settings, "cvs", "../../secret.pdf")

    assert settings.media_path.resolve() in destination.resolve().parents
    assert destination.name.endswith("secret.pdf")


def test_safe_media_path_allows_sanitized_custom_category(tmp_path):
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    ensure_workspace(settings)

    destination = safe_media_path(settings, "My Custom Docs", "file.pdf")

    assert settings.media_path.resolve() in destination.resolve().parents
    assert destination.parent.name == "my-custom-docs"
