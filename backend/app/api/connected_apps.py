"""Management API for connected apps (SCHOLARDOCX-0258).

Session-JWT authenticated, for the signed-in user in the web app. The MCP
endpoint itself (``/mcp``, access-key authenticated) is in services/mcp_server.py.
Creating a key and confirming a suggestion need the ``can_use_mcp`` role limit;
listing, revoking and dismissing work for any signed-in user so nobody is left
holding a live key they cannot revoke.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user, get_user_store
from app.auth.limits import UsageLimitExceeded, check_and_increment_limit
from app.auth.rate_limit import rate_limiter, user_identity
from app.core.config import Settings, get_settings
from app.services import connected_apps as apps
from app.services.ai_actions import AiActionService
from app.services.store import Store

router = APIRouter(prefix="/connected-apps", tags=["connected-apps"])


class CreateAppPayload(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    scope: Literal["read", "read_suggest"] = "read"
    expires_in_days: Literal[30, 90, 365] = apps.DEFAULT_EXPIRY_DAYS


def _require_mcp(user: dict, store: Store) -> None:
    check_and_increment_limit(user, apps.MCP_LIMIT_FEATURE, 0, store.db)


def _fail(exc: apps.ConnectedAppError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
def list_connected_apps(store: Store = Depends(get_user_store), user: dict = Depends(get_current_user)) -> dict:
    try:
        _require_mcp(user, store)
        can_create = True
    except UsageLimitExceeded:
        can_create = False
    return {
        "apps": apps.list_apps(store.db, user["id"]),
        "can_create": can_create,
        "max_apps": apps.MAX_ACTIVE_APPS,
        "expiry_choices_days": list(apps.EXPIRY_CHOICES_DAYS),
    }


@router.post("", status_code=201)
def create_connected_app(
    payload: CreateAppPayload, store: Store = Depends(get_user_store), user: dict = Depends(get_current_user)
) -> dict:
    rate_limiter.check_and_record("connected_apps_manage", user_identity(user))
    _require_mcp(user, store)
    try:
        created, raw_key = apps.create_app(store.db, user, payload.name, payload.scope, payload.expires_in_days)
    except apps.ConnectedAppError as exc:
        raise _fail(exc)
    # The key is returned exactly once; only its hash is stored.
    return {"app": created, "key": raw_key}


@router.delete("/{app_id}", status_code=204)
def revoke_connected_app(app_id: str, store: Store = Depends(get_user_store), user: dict = Depends(get_current_user)) -> None:
    if not apps.delete_app(store.db, user["id"], app_id):
        raise HTTPException(status_code=404, detail="App not found.")


@router.get("/suggestions")
def list_suggestions(
    status: Literal["pending", "confirmed", "dismissed", "failed", "expired"] | None = None,
    store: Store = Depends(get_user_store), user: dict = Depends(get_current_user),
) -> dict:
    return {"suggestions": apps.list_suggestions(store.db, user["id"], status)}


@router.post("/suggestions/{suggestion_id}/confirm")
def confirm_suggestion(
    suggestion_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    user: dict = Depends(get_current_user),
) -> dict:
    rate_limiter.check_and_record("ai_action_execute", user_identity(user))
    _require_mcp(user, store)
    try:
        return apps.confirm_suggestion(store.db, AiActionService(settings, store), user, suggestion_id)
    except apps.ConnectedAppError as exc:
        raise _fail(exc)


@router.post("/suggestions/{suggestion_id}/dismiss", status_code=204)
def dismiss_suggestion(suggestion_id: str, store: Store = Depends(get_user_store), user: dict = Depends(get_current_user)) -> None:
    try:
        apps.dismiss_suggestion(store.db, user["id"], suggestion_id)
    except apps.ConnectedAppError as exc:
        raise _fail(exc)
