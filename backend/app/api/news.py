from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.api.dependencies import get_store
from app.services.store import Store
from app.services.news_service import news_service
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
        raise HTTPException(status_code=500, detail="NewsData API key is not configured.")
        
    try:
        # Check both limits first without incrementing
        check_and_increment_limit(user, "news_searches_per_month", increment=0, connection=store.connection)
        check_and_increment_limit(user, "news_searches_per_day", increment=0, connection=store.connection)
    except UsageLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e.detail))

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
