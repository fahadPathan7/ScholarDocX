from functools import lru_cache
from pathlib import Path
import os


class Settings:
    def __init__(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        workspace = os.getenv("SCHOLARDOCK_WORKSPACE")
        self.repo_root = repo_root
        self.workspace_path = Path(workspace).expanduser().resolve() if workspace else repo_root / "workspace"
        self.database_path = self.workspace_path / "db" / "app.db"
        self.media_path = self.workspace_path / "media"
        self.glm_api_key = os.getenv("GLM_API_KEY", "")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.tavily_api_key = os.getenv("TAVILY_API_KEY", "")
        self.glm_base_url = os.getenv("GLM_BASE_URL", "https://api.z.ai/api/coding/paas/v4/chat/completions")
        self.gemini_base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
        self.groq_base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1/chat/completions")
        self.mistral_api_key = os.getenv("MISTRAL_API_KEY", "")
        self.mistral_base_url = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1/chat/completions")
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if origin.strip()
        ]
        self.cors_origin_regex = os.getenv(
            "CORS_ORIGIN_REGEX",
            r"^http://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
        )

    @property
    def ai_configured(self) -> bool:
        return bool((self.glm_api_key or self.gemini_api_key or self.groq_api_key or self.mistral_api_key) and self.tavily_api_key)

    @property
    def chat_provider_configured(self) -> bool:
        return bool(self.glm_api_key or self.gemini_api_key or self.groq_api_key or self.mistral_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
