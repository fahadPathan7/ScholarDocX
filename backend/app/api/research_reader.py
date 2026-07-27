"""Research Expert API endpoints (SCHOLARDOCX-0174).

Thin controller layer mapping endpoints to ResearchPaperService.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api.dependencies import get_store
from app.auth.dependencies import get_current_user
from app.auth.rate_limit import rate_limiter, user_identity
from app.core.config import Settings, get_settings
from app.services.research_paper_service import PREDEFINED_PROMPTS, ResearchPaperService
from app.services.store import Store

router = APIRouter(prefix="/research", tags=["Research Expert"])


class AnalyzePaperPayload(BaseModel):
    prompt: str = Field(min_length=3, max_length=1000)
    top_k: Optional[int] = Field(default=10, ge=1, le=16)


class SaveAnalysisPayload(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=200000)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    model_used: Optional[str] = Field(default=None, max_length=200)
    charged_credits: Optional[int] = Field(default=0, ge=0)


@router.get("/prompts")
def get_research_prompts() -> list[dict[str, Any]]:
    """Return catalog of 13 predefined research analysis prompts."""
    return PREDEFINED_PROMPTS


@router.post("/papers/upload")
async def upload_research_paper(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload a PDF research paper, extract text, chunk, generate embeddings, and store."""
    rate_limiter.check_and_record("research_paper_upload", user_identity(current_user))

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file filename provided.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 10 MB document size enforcement
    max_bytes = 10 * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File size ({len(file_bytes) / (1024 * 1024):.2f} MB) exceeds the 10 MB limit.",
        )

    service = ResearchPaperService(settings, store.db, current_user)
    return await service.upload_and_process_paper(file.filename, file_bytes)


@router.get("/papers")
def list_research_papers(
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """List all uploaded research papers for current user with library capacity limit."""
    service = ResearchPaperService(settings, store.db, current_user)
    papers = service.list_papers()
    max_limit = service.get_library_limit()
    return {"papers": papers, "max_library_limit": max_limit, "count": len(papers)}


@router.get("/papers/{paper_id}")
def get_research_paper(
    paper_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Get research paper details and chunk summaries."""
    service = ResearchPaperService(settings, store.db, current_user)
    return service.get_paper_details(paper_id)


@router.get("/papers/{paper_id}/pdf")
def view_research_paper_pdf(
    paper_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> Response:
    """Stream a user-owned Research Expert PDF without using the Documents file route."""
    service = ResearchPaperService(settings, store.db, current_user)
    content, media_type, display_name = service.get_paper_pdf_content(paper_id)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{display_name}"'},
    )


@router.delete("/papers/{paper_id}")
def delete_research_paper(
    paper_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a research paper, chunk embeddings, and binary storage file."""
    service = ResearchPaperService(settings, store.db, current_user)
    return service.delete_paper(paper_id)


@router.post("/papers/{paper_id}/retry")
async def retry_research_paper(
    paper_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Retry text extraction, chunking, and embedding generation for a paper in error state."""
    rate_limiter.check_and_record("research_paper_retry", user_identity(current_user))
    service = ResearchPaperService(settings, store.db, current_user)
    return await service.retry_paper_processing(paper_id)


@router.post("/papers/{paper_id}/analyze")
async def analyze_research_paper(
    paper_id: str,
    payload: AnalyzePaperPayload,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Analyze a research paper using vector similarity search + LLM generation."""
    rate_limiter.check_and_record("research_paper_analyze", user_identity(current_user))
    service = ResearchPaperService(settings, store.db, current_user)
    return await service.analyze_paper(paper_id, payload.prompt, top_k=payload.top_k or 10)


@router.get("/papers/{paper_id}/analyses")
def list_saved_analyses(
    paper_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """List saved analysis outputs for a paper (max 10 per paper)."""
    service = ResearchPaperService(settings, store.db, current_user)
    return service.list_saved_analyses(paper_id)


@router.post("/papers/{paper_id}/analyses")
def save_analysis(
    paper_id: str,
    payload: SaveAnalysisPayload,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Persist an analysis output for later review (enforces the 10-per-paper cap)."""
    rate_limiter.check_and_record("research_paper_save_analysis", user_identity(current_user))
    service = ResearchPaperService(settings, store.db, current_user)
    return service.save_analysis(
        paper_id,
        payload.prompt,
        payload.answer,
        sources=payload.sources,
        model_used=payload.model_used,
        charged_credits=payload.charged_credits or 0,
    )


@router.delete("/papers/{paper_id}/analyses/{analysis_id}")
def delete_saved_analysis(
    paper_id: str,
    analysis_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a saved analysis output."""
    service = ResearchPaperService(settings, store.db, current_user)
    return service.delete_saved_analysis(paper_id, analysis_id)
