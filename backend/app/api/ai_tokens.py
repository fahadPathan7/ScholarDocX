"""AI token economy HTTP endpoints.

User-facing:
- GET    /ai-tokens/balance              — current balance + monthly allowance.
- GET    /ai-tokens/packs                — active packs (buy UI).
- POST   /ai-tokens/purchase-requests    — submit a pack purchase request.
- GET    /ai-tokens/purchase-requests/me — the user's own requests.

Admin-facing:
- GET   /ai-tokens/admin/packs                       — all packs (incl. inactive).
- PATCH /ai-tokens/admin/packs/{code}                — super_admin pack config.
- GET   /ai-tokens/admin/purchase-requests           — admin request queue.
- POST  /ai-tokens/admin/purchase-requests/{id}/review — approve / reject.

Pack pricing/config is super_admin only (per spec). Approving/rejecting purchase
requests is delegated to admins via the `admin_manage_token_requests`
permission (mirrors plan-request review).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_store
from app.auth.dependencies import get_current_user, require_super_admin
from app.auth.limits import UsageLimitExceeded, check_and_increment_limit
from app.services import ai_tokens
from app.services.store import Store

router = APIRouter(
    prefix="/ai-tokens",
    tags=["ai-tokens"],
    dependencies=[Depends(get_current_user)],
)


def _require_feature(feature: str, user: dict, session: Session) -> None:
    """Permission gate for admin actions (mirrors admin.require_feature, kept
    local so this router does not depend on the admin module)."""
    try:
        check_and_increment_limit(user, feature, 0, session)
    except UsageLimitExceeded as e:
        raise HTTPException(status_code=403, detail=str(e))


# ── user-facing ───────────────────────────────────────────────────────────────

@router.get("/balance")
def get_balance(
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Return the caller's token balance, monthly allowance, and spend totals.

    `subscription_remaining` / `monthly_allowance` are -1 for unlimited
    (super_admin) users. Refreshes the subscription bucket at month boundaries.
    """
    session = store.db
    balance = ai_tokens.refresh_balance(current_user, session)
    allowance = ai_tokens.get_role_monthly_allowance(current_user, session)
    unlimited = ai_tokens.is_unlimited(current_user)
    return {
        "subscription_remaining": -1 if unlimited else int(balance["subscription_remaining"]),
        "purchased_remaining": int(balance["purchased_remaining"]),
        "subscription_period": balance["subscription_period"],
        "monthly_allowance": allowance,
        "is_unlimited": unlimited,
        "total_spent_tokens": int(balance["total_spent_tokens"]),
        "total_spent_usd": float(balance["total_spent_usd"]),
        "tokens_per_dollar": ai_tokens.get_token_rate(session),
    }


@router.get("/packs")
def list_packs(store: Store = Depends(get_store)):
    """Active token packs available for purchase."""
    return ai_tokens.list_packs(store.db)


class PurchaseRequestPayload(BaseModel):
    pack_code: str


@router.post("/purchase-requests")
def submit_purchase_request(
    payload: PurchaseRequestPayload,
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Submit a Pending purchase request for the given pack code."""
    try:
        return ai_tokens.submit_purchase_request(
            current_user["id"], payload.pack_code, store.db
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/purchase-requests/me")
def list_my_purchase_requests(
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    return ai_tokens.list_my_purchase_requests(current_user["id"], store.db)


# ── admin-facing ──────────────────────────────────────────────────────────────

@router.get("/admin/packs")
def admin_list_packs(
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """All packs including inactive ones, for super_admin management."""
    require_super_admin(current_user)
    return ai_tokens.list_packs(store.db, include_inactive=True)


@router.get("/admin/models")
def admin_list_models(
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """All AI models with their per-1M-token pricing, for super_admin config."""
    require_super_admin(current_user)
    return ai_tokens.list_models(store.db)


class ModelUpdatePayload(BaseModel):
    input_price_per_1m: Optional[float] = None
    output_price_per_1m: Optional[float] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


@router.patch("/admin/models/{model_pk}")
def admin_update_model(
    model_pk: int,
    payload: ModelUpdatePayload,
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Update a model's input/output $/1M pricing, display name, or active flag.

    Super_admin only — model pricing drives real-cost metering.
    """
    require_super_admin(current_user)
    try:
        updated = ai_tokens.update_model(
            model_pk,
            session=store.db,
            input_price_per_1m=payload.input_price_per_1m,
            output_price_per_1m=payload.output_price_per_1m,
            display_name=payload.display_name,
            is_active=payload.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return updated


class PackUpdatePayload(BaseModel):
    display_name: Optional[str] = None
    token_amount: Optional[int] = None
    price_usd: Optional[float] = None
    is_active: Optional[bool] = None


@router.patch("/admin/packs/{code}")
def admin_update_pack(
    code: str,
    payload: PackUpdatePayload,
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Update a pack's price, token grant amount, name, or active flag.

    Super_admin only — pack pricing/config is restricted by spec.
    """
    require_super_admin(current_user)
    try:
        updated = ai_tokens.update_pack(
            code,
            session=store.db,
            display_name=payload.display_name,
            token_amount=payload.token_amount,
            price_usd=payload.price_usd,
            is_active=payload.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail="Pack not found")
    return updated


@router.get("/admin/purchase-requests")
def admin_list_purchase_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Admin queue of all purchase requests (optional status filter)."""
    _require_feature("admin_manage_token_requests", current_user, store.db)
    return ai_tokens.list_purchase_requests(store.db, status=status)


class PurchaseReviewPayload(BaseModel):
    action: str
    admin_notes: Optional[str] = None


@router.post("/admin/purchase-requests/{request_id}/review")
def admin_review_purchase_request(
    request_id: int,
    payload: PurchaseReviewPayload,
    current_user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    """Approve or reject a purchase request. Approve grants the pack's tokens
    to the requester's purchased bucket."""
    _require_feature("admin_manage_token_requests", current_user, store.db)
    try:
        return ai_tokens.resolve_purchase_request(
            request_id,
            current_user["id"],
            payload.action,
            session=store.db,
            admin_notes=payload.admin_notes,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
