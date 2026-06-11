from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.api.dependencies import get_store
from app.services.store import Store
from app.services.news_feedback import (
    claim_query_preview_feedback,
    complete_search_feedback,
    create_query_preview_feedback,
)
from app.services.news_service import MAX_TAVILY_QUERY_LENGTH, news_service
from app.services.news_query_generator import scholarship_query_generator
from app.auth.limits import check_and_increment_limit, UsageLimitExceeded

router = APIRouter()

class BookmarkCreate(BaseModel):
    article_id: str
    title: str
    link: str
    source_name: Optional[str] = None
    pub_date: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    country: Optional[str] = None


class ScholarshipSearchFilters(BaseModel):
    levels: Optional[List[str]] = None
    countries: Optional[List[str]] = None
    seasons: Optional[List[str]] = None
    years: Optional[List[str]] = None
    funding_types: Optional[List[str]] = None
    fields_of_study: Optional[List[str]] = None
    popular_scholarships: Optional[List[str]] = None
    language: str = "en"
    sort_by: str = "latest"


class QueryPreviewRequest(BaseModel):
    filters: ScholarshipSearchFilters


class ConfirmedSearchRequest(BaseModel):
    filters: ScholarshipSearchFilters
    preview_feedback_id: int = Field(gt=0)
    approved_query: str = Field(min_length=3, max_length=MAX_TAVILY_QUERY_LENGTH)
    query_approved: bool


def _filter_kwargs(filters: ScholarshipSearchFilters) -> Dict[str, Any]:
    return filters.model_dump(exclude_none=True)


def _check_search_limits(user: dict, store: Store) -> None:
    try:
        check_and_increment_limit(
            user,
            "news_searches_per_month",
            increment=0,
            connection=store.connection,
        )
        check_and_increment_limit(
            user,
            "news_searches_per_day",
            increment=0,
            connection=store.connection,
        )
    except UsageLimitExceeded as error:
        raise HTTPException(status_code=429, detail=str(error.detail))


@router.post("/news/query-preview")
async def preview_news_query(
    payload: QueryPreviewRequest,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )

    _check_search_limits(user, store)
    generated = await scholarship_query_generator.generate(
        _filter_kwargs(payload.filters)
    )
    feedback_id = create_query_preview_feedback(
        store.connection,
        int(user["id"]),
        generated["query"],
        _filter_kwargs(payload.filters),
    )
    check_and_increment_limit(
        user,
        "news_searches_per_month",
        increment=1,
        connection=store.connection,
    )
    check_and_increment_limit(
        user,
        "news_searches_per_day",
        increment=1,
        connection=store.connection,
    )
    return {
        "preview_feedback_id": feedback_id,
        "initial_query": generated["query"],
        "max_length": MAX_TAVILY_QUERY_LENGTH,
        "generation_source": generated["source"],
        "generation_model": generated["model"],
        "generation_notice": generated["notice"],
    }


@router.post("/news/search")
async def search_news_confirmed(
    payload: ConfirmedSearchRequest,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    if not payload.query_approved:
        raise HTTPException(
            status_code=422,
            detail="Review and approve the query before searching.",
        )
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )
    filters = _filter_kwargs(payload.filters)
    approved_query = payload.approved_query.strip()
    if len(approved_query) < 3:
        raise HTTPException(
            status_code=422,
            detail="Approved query must contain at least 3 characters.",
        )

    try:
        initial_query = claim_query_preview_feedback(
            store.connection,
            payload.preview_feedback_id,
            int(user["id"]),
            approved_query,
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

    feedback_id = payload.preview_feedback_id

    try:
        results = await news_service.search_scholarships(
            **filters,
            approved_query=approved_query,
        )
    except Exception:
        complete_search_feedback(
            store.connection,
            feedback_id,
            "failed",
        )
        raise

    complete_search_feedback(
        store.connection,
        feedback_id,
        "success",
        int(results.get("totalResults") or 0),
    )
    return results


@router.get("/news/search")
async def search_news(
    levels: Optional[List[str]] = Query(None),
    countries: Optional[List[str]] = Query(None),
    seasons: Optional[List[str]] = Query(None),
    years: Optional[List[str]] = Query(None),
    funding_types: Optional[List[str]] = Query(None),
    fields_of_study: Optional[List[str]] = Query(None),
    popular_scholarships: Optional[List[str]] = Query(None),
    language: str = "en",
    sort_by: str = "latest",
    page: Optional[str] = None,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )
        
    _check_search_limits(user, store)

    results = await news_service.search_scholarships(
        levels=levels,
        countries=countries,
        seasons=seasons,
        years=years,
        funding_types=funding_types,
        fields_of_study=fields_of_study,
        popular_scholarships=popular_scholarships,
        language=language,
        sort_by=sort_by,
        page=page,
    )
    
    # Increment after successful API call
    check_and_increment_limit(user, "news_searches_per_month", increment=1, connection=store.connection)
    check_and_increment_limit(user, "news_searches_per_day", increment=1, connection=store.connection)
    
    return results

@router.get("/news/bookmarks")
async def get_bookmarks(
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    return store.list_records("bookmarked_news")

@router.post("/news/bookmarks")
async def add_bookmark(
    bookmark: BookmarkCreate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    try:
        return store.create_record("bookmarked_news", bookmark.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/news/bookmarks/{article_id}")
async def delete_bookmark(
    article_id: str,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    # need to find the record ID first to delete
    record = store.connection.execute(
        "SELECT id FROM bookmarked_news WHERE user_id = ? AND article_id = ?",
        (user["id"], article_id)
    ).fetchone()
    
    if not record:
        raise HTTPException(status_code=404, detail="Bookmark not found")
        
    return store.delete_record("bookmarked_news", record["id"])
