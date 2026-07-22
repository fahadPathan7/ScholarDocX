from functools import lru_cache
from pathlib import Path
import os


class Settings:
    def __init__(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        workspace = os.getenv("SCHOLARDOCX_WORKSPACE")
        self.repo_root = repo_root
        self.workspace_path = Path(workspace).expanduser().resolve() if workspace else repo_root / "workspace"
        # SCHOLARDOCX-0139: PostgreSQL (Supabase) is the only database.
        # DATABASE_URL must point at a Postgres instance. database_path is
        # retained only because some legacy callers still reference it for
        # media/workspace path math; it is no longer used for the relational
        # store.
        self.database_url = os.getenv("DATABASE_URL", "").strip()
        self.database_path = self.workspace_path / "db" / "app.db"
        self.media_path = self.workspace_path / "media"
        self.glm_api_key = os.getenv("GLM_API_KEY", "")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.tavily_api_key = os.getenv("TAVILY_API_KEY", "")
        self.tavily_api_key_scholarship_hunt = os.getenv(
            "TAVILY_API_KEY_SCHOLARSHIP_HUNT",
            "",
        )
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.openrouter_base_url = os.getenv(
            "OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1/chat/completions",
        )
        self.openrouter_free_model = os.getenv(
            "OPENROUTER_FREE_MODEL",
            "openrouter/free",
        )

        self.glm_base_url = os.getenv("GLM_BASE_URL", "https://api.z.ai/api/coding/paas/v4/chat/completions")
        self.advisor_atlas_glm_model = os.getenv("ADVISOR_ATLAS_GLM_MODEL", "GLM-5.2")
        self.advisor_atlas_vision_model = os.getenv("ADVISOR_ATLAS_VISION_MODEL", "GLM-4.6V")
        self.gemini_base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
        self.groq_base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1/chat/completions")
        self.mistral_api_key = os.getenv("MISTRAL_API_KEY", "")
        self.mistral_base_url = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1/chat/completions")
        # SCHOLARDOCX-0157: Polar billing config. polar_env drives sandbox vs
        # production API base; "sandbox" anywhere in the value selects the
        # sandbox API. Kept independent of VITE_POLAR_URL (a frontend-prefixed
        # var) so backend and frontend can be configured separately.
        self.polar_access_token = os.getenv("POLAR_ACCESS_TOKEN", "")
        self.polar_webhook_secret = os.getenv("POLAR_WEBHOOK_SECRET", "")
        self.polar_env = os.getenv("POLAR_ENV") or ("sandbox" if "sandbox" in os.getenv("VITE_POLAR_URL", "").lower() else "")
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if origin.strip()
        ]
        self.cors_origin_regex = os.getenv(
            "CORS_ORIGIN_REGEX",
            r"^http://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
        )
        self.jwt_secret_key = os.getenv("JWT_SECRET") or os.getenv("JWT_SECRET_KEY")

        # SCHOLARDOCX-0169: Google OAuth (sign-in). All four are optional —
        # if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset, the Google
        # login route returns 503 and the frontend button is hidden.
        # GOOGLE_REDIRECT_URI must match a URI registered in the Google
        # Cloud Console and points at the BACKEND (the OAuth callback is a
        # server-side route), not the frontend.
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
        self.google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
        self.google_redirect_uri = os.getenv(
            "GOOGLE_REDIRECT_URI",
            "http://localhost:8000/api/auth/google/callback",
        ).strip()
        # Where to send the browser after minting the JWT (the frontend).
        # Defaults to the Vite dev server; in prod set to the deployed
        # frontend origin (e.g. https://scholardocx.onrender.com).
        self.frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").strip().rstrip("/")

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def database_target(self) -> str:
        """The Postgres connection URL (required).

        Callers pass this to get_engine/get_db/initialize_database. Raises if
        DATABASE_URL is unset so misconfiguration fails loudly at startup.
        (SCHOLARDOCX-0139)
        """
        if not self.database_url:
            raise RuntimeError(
                "DATABASE_URL is required (SCHOLARDOCX-0139). "
                "Set it to a PostgreSQL connection string, e.g. "
                "postgresql://user:pass@host:5432/dbname"
            )
        return self.database_url

    @property
    def ai_configured(self) -> bool:
        return bool(
            (
                self.glm_api_key
                or self.gemini_api_key
                or self.groq_api_key
                or self.mistral_api_key
            )
            and self.tavily_api_key
        )

    @property
    def chat_provider_configured(self) -> bool:
        return bool(
            self.glm_api_key
            or self.gemini_api_key
            or self.groq_api_key
            or self.mistral_api_key
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
