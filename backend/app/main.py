from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.workspace import ensure_workspace
from app.db.connection import initialize_database


load_dotenv()


def create_app() -> FastAPI:
    settings = get_settings()
    ensure_workspace(settings)
    initialize_database(settings.database_path)

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
    return app


app = create_app()
