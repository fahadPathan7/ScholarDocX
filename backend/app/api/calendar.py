"""Bespoke calendar endpoints that don't fit the generic per-table CRUD
system (SCHOLARDOCX-0185).

Manual reminders themselves (create/update/delete) go through the generic
`/calendar_reminders` CRUD routes registered in routes.py — this file only
covers the Today/Next-10-Days "done" checkbox for sheet-row-derived dates,
which have no single-`id` row for that generic system to target.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.api.dependencies import get_store
from app.services import calendar_service
from app.services.store import Store

router = APIRouter(prefix="/calendar", tags=["calendar"], dependencies=[Depends(get_current_user)])


class SheetItemMarkPayload(BaseModel):
    page_id: str
    row_index: int
    date_field: str
    is_done: bool


@router.post("/sheet-item-marks")
def set_sheet_item_mark(
    payload: SheetItemMarkPayload,
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Dashboard-only done/undone toggle for one sheet-row-derived calendar
    date. Never modifies the sheet row itself."""
    try:
        return calendar_service.set_sheet_item_done(
            store.db,
            current_user["id"],
            payload.page_id,
            payload.row_index,
            payload.date_field,
            payload.is_done,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
