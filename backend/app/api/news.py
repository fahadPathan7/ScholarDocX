"""Scholarship Hunt bookmarks + saved-query (watchlist) CRUD.

SCHOLARDOCX-0175: the filter-based search endpoints (/news/search,
/news/query-preview) are deleted. Scholarship Hunt now has a single deep
search surface at /scholarship-deep-hunt/runs. This router retains only
the bookmark and saved-query endpoints that the Opportunity Library and
watchlist features depend on.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user, get_user_store
from app.services.store import Store


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


class SavedQueryCreate(BaseModel):
    name: str
    query_string: str
    filters_json: str


class SavedQueryUpdate(BaseModel):
    seen_article_ids_json: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


@router.get("/news/bookmarks")
async def get_bookmarks(
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    return store.list_records("bookmarked_news")


@router.post("/news/bookmarks")
async def add_bookmark(
    bookmark: BookmarkCreate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    try:
        return store.create_record("bookmarked_news", bookmark.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=e)


@router.delete("/news/bookmarks/{article_id}")
async def delete_bookmark(
    article_id: str,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    record = store.legacy_connection.execute(
        "SELECT id FROM bookmarked_news WHERE user_id = ? AND article_id = ?",
        (user["id"], article_id),
    ).fetchone()

    if not record:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    return store.delete_record("bookmarked_news", record["id"])


@router.get("/news/saved-queries")
async def get_saved_queries(
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    return store.list_records("saved_scholarship_queries")


@router.post("/news/saved-queries")
async def add_saved_query(
    saved_query: SavedQueryCreate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    try:
        return store.create_record("saved_scholarship_queries", saved_query.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=e)


@router.patch("/news/saved-queries/{query_id}")
async def update_saved_query(
    query_id: str,
    payload: SavedQueryUpdate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    """Updates a watchlist's seen-article-IDs after a re-run diff (FR-8.41);
    bumps last_used_at server-side so "run again" freshness isn't client-set."""
    try:
        return store.update_record(
            "saved_scholarship_queries",
            query_id,
            {
                "seen_article_ids_json": payload.seen_article_ids_json,
                "last_used_at": _now_iso(),
            },
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail=error)


@router.delete("/news/saved-queries/{query_id}")
async def delete_saved_query(
    query_id: str,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    return store.delete_record("saved_scholarship_queries", query_id)
