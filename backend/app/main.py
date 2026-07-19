from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.dependencies import ensure_db_initialized
from app.api.routes import router
from app.core.config import get_settings
from app.core.workspace import ensure_workspace

# Load .env from project root if it exists, or fallback to default
env_path = Path(__file__).resolve().parents[2] / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()


def create_app() -> FastAPI:
    settings = get_settings()
    # SCHOLARDOCX-0149: boot init must go through ensure_db_initialized so the
    # _db_initialized memo flag is set. Calling initialize_database directly
    # left the flag False, so the first request's get_store -> ensure_db_initialized
    # re-ran the entire DDL + seed pass (~160 round-trips) a second time.
    ensure_db_initialized(settings)

    app = FastAPI(title="ScholarDocX API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    from app.auth.dependencies import get_current_user
    from fastapi import Depends
    app.include_router(router, prefix="/api", dependencies=[Depends(get_current_user)])
    from app.api.auth import router as auth_router
    app.include_router(auth_router, prefix="/api")
    from app.api.admin import router as admin_router
    app.include_router(admin_router, prefix="/api")
    from app.api.news import router as news_router
    app.include_router(news_router, prefix="/api")
    from app.api.advisor_atlas import router as advisor_atlas_router
    app.include_router(advisor_atlas_router, prefix="/api")
    from app.api.ai_tokens import router as ai_tokens_router
    app.include_router(ai_tokens_router, prefix="/api")
    from app.api.scholarship_opportunities import router as scholarship_opportunities_router
    app.include_router(scholarship_opportunities_router, prefix="/api")
    from app.api.scholarship_deep_hunt import router as scholarship_deep_hunt_router
    app.include_router(scholarship_deep_hunt_router, prefix="/api")
    from app.api.webhooks import router as webhooks_router
    app.include_router(webhooks_router, prefix="/api")
    return app


app = create_app()
