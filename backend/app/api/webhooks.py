import json
import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from svix.webhooks import Webhook

from app.api.dependencies import get_store
from app.db.models import Users, AiTokenPacks, AppSettings, PolarProcessedEvents
from app.services.store import Store
from app.services.ai_tokens import grant_purchased

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def get_polar_webhook_secret() -> str:
    secret = os.environ.get("POLAR_WEBHOOK_SECRET")
    if not secret:
        logger.warning("POLAR_WEBHOOK_SECRET is not set. Webhooks will fail.")
        return ""
    return secret


def get_app_setting(store: Store, key: str, default: str = "") -> str:
    setting = store.db.scalar(select(AppSettings).where(AppSettings.key == key))
    return setting.value if setting else default


# ---------------------------------------------------------------------------
# Idempotency (SCHOLARDOCX-0157)
#
# Polar retries webhook deliveries that don't return 2xx. Without a guard, a
# single order.created/subscription.updated event would grant credits or mutate
# plan state N times. The svix message id (`svix-id` header) is the stable
# dedup key — it is identical across retries of the same message. We fall back
# to the Polar object id (`data.id`) when svix-id is absent (very old / test
# payloads). A unique constraint on `event_id` makes the insert the dedup point:
# a second insert raises IntegrityError, which the caller treats as "already
# processed" and returns 200.
# ---------------------------------------------------------------------------


def _resolve_event_id(headers: Dict[str, str], data: Dict[str, Any]) -> Optional[str]:
    """Pick the most stable id for this webhook delivery (svix-id >> data.id)."""
    svix_id = headers.get("svix-id") or headers.get("webhook-id")
    if svix_id:
        return svix_id
    data_id = data.get("id")
    return str(data_id) if data_id else None


def _is_processed(store: Store, event_id: Optional[str]) -> bool:
    """True if this event_id has already been recorded as processed."""
    if not event_id:
        return False
    existing = store.db.scalar(
        select(PolarProcessedEvents).where(PolarProcessedEvents.event_id == event_id)
    )
    return existing is not None


def _mark_processed(store: Store, event_id: Optional[str], event_type: Optional[str]) -> bool:
    """Record `event_id` as processed. Returns False if already seen (no-op).

    The unique constraint on event_id is the dedup point; we rely on it rather
    than a read-then-write check to avoid the race between two concurrent
    deliveries. The caller commits the surrounding transaction.
    """
    if not event_id:
        return True  # nothing to dedup on — allow processing
    try:
        store.db.add(PolarProcessedEvents(event_id=event_id, event_type=event_type))
        store.db.flush()
        return True
    except IntegrityError:
        # Already processed. Roll back the dedup insert only; the caller returns 200.
        store.db.rollback()
        return False


# ---------------------------------------------------------------------------
# User reconciliation
#
# Used by the subscription and order handlers. Two-step lookup, primary then
# fallback, matching the contract documented in api-boundaries.md:
#   1. Users.polar_customer_id == customer_id
#   2. on miss: Users.email == data.customer.email, then backfill polar_customer_id
# ---------------------------------------------------------------------------


def _find_user(store: Store, customer_id: Optional[str], data: Dict[str, Any]) -> Optional[Users]:
    user = None
    if customer_id:
        user = store.db.scalar(select(Users).where(Users.polar_customer_id == customer_id))

    if not user:
        customer = data.get("customer", {}) or {}
        email = customer.get("email")
        if email:
            user = store.db.scalar(select(Users).where(Users.email == email))
            if user and customer_id:
                user.polar_customer_id = customer_id

    return user


@router.post("/polar")
async def polar_webhook(request: Request, store: Store = Depends(get_store)):
    payload = await request.body()
    headers = dict(request.headers)

    webhook_secret = get_polar_webhook_secret()
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        wh = Webhook(webhook_secret)
        event = wh.verify(payload, headers)
    except Exception as e:
        logger.error(f"Polar webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event.get("type")
    data = event.get("data", {}) or {}

    logger.info(f"Received Polar webhook: type={event_type}")

    # Dedup: skip if this exact delivery (by svix-id) was already processed.
    event_id = _resolve_event_id(headers, data)
    if _is_processed(store, event_id):
        logger.info(f"Polar event {event_id} already processed; skipping ({event_type})")
        return {"status": "ok", "deduplicated": True}

    try:
        if event_type in ("subscription.created", "subscription.updated"):
            await handle_subscription_updated(data, store, event_id)
        elif event_type == "subscription.canceled":
            # SCHOLARDOCX-0157: canceled = scheduled cancel at period end. The
            # update handler honors cancel_at_period_end and keeps the paid plan
            # until current_period_end. Only .revoked downgrades immediately.
            await handle_subscription_updated(data, store, event_id, canceled=True)
        elif event_type == "subscription.revoked":
            await handle_subscription_revoked(data, store, event_id)
        elif event_type == "order.created":
            await handle_order_created(data, store, event_id)
        else:
            logger.warning(f"Unhandled Polar event type: {event_type} (event_id={event_id})")
    except HTTPException:
        # Re-raise intentional 5xx (e.g. unknown product, user not found) so
        # Polar retries — these are the "surface the failure" paths.
        raise
    except Exception as e:
        # Unexpected error: log correlation context and return 500 so Polar retries.
        logger.exception(
            f"Polar webhook handler error: type={event_type} event_id={event_id} "
            f"customer_id={data.get('customer_id')} product_id={data.get('product_id')}: {e}"
        )
        raise HTTPException(status_code=500, detail="Webhook handler error")

    # Mark processed only after the handler completes without raising.
    if event_id:
        _mark_processed(store, event_id, event_type)
        store.db.commit()

    return {"status": "ok"}


async def handle_subscription_updated(
    data: Dict[str, Any], store: Store, event_id: Optional[str], canceled: bool = False
) -> None:
    customer_id = data.get("customer_id")
    subscription_id = data.get("id")
    product_id = data.get("product_id")

    plan_roles: list[str] = []
    if product_id in [get_app_setting(store, "polar_product_id_basic_monthly"), get_app_setting(store, "polar_product_id_basic_quarterly")]:
        plan_roles = ["general_user"]
    elif product_id in [get_app_setting(store, "polar_product_id_pro_monthly"), get_app_setting(store, "polar_product_id_pro_quarterly")]:
        plan_roles = ["pro_user"]
    elif product_id in [get_app_setting(store, "polar_product_id_max_monthly"), get_app_setting(store, "polar_product_id_max_quarterly")]:
        plan_roles = ["max_user"]
    else:
        # SCHOLARDOCX-0157: surface instead of silent return — a paying
        # subscriber whose product_id isn't recognized (admin renamed/cleared
        # the setting) should trigger retry + investigation, not a silent 200.
        logger.error(
            f"Unknown Polar product_id {product_id} in subscription {subscription_id} "
            f"(event_id={event_id})"
        )
        raise HTTPException(status_code=500, detail="Unknown product")

    user = _find_user(store, customer_id, data)

    if not user:
        logger.error(
            f"Could not find user for Polar subscription {subscription_id} "
            f"(customer_id={customer_id}, event_id={event_id})"
        )
        # 500 → Polar retries, giving a "pay then sign up" flow time to complete.
        raise HTTPException(status_code=500, detail="User not found")

    user.roles = json.dumps(plan_roles)
    user.polar_subscription_id = subscription_id

    # SCHOLARDOCX-0157: don't reset plan_started_at on every event. It anchors
    # the AI-token billing cycle (ai_tokens._current_period); resetting on a
    # retry or a mid-cycle update would re-grant the monthly allowance. Only
    # set it on a genuine new subscription (no prior start) or after the plan
    # had lapsed (plan_ends_at in the past).
    now_utc = datetime.now(timezone.utc)
    prior_start = user.plan_started_at
    prior_ends = user.plan_ends_at
    # Parse prior_ends once so the `is not None` check narrows the type for the
    # comparison below (calling _parse_iso twice would defeat mypy's narrowing).
    prior_ends_dt = _parse_iso(prior_ends) if prior_ends else None
    start_fresh = (not prior_start) or (prior_ends_dt is not None and prior_ends_dt < now_utc)
    if start_fresh:
        user.plan_started_at = now_utc.isoformat()

    # Parse renewal fields. `canceled` (scheduled cancel) and the Polar
    # `cancel_at_period_end` flag both mean "keep access until period end".
    current_period_end = data.get("current_period_end")
    cancel_at_period_end = bool(canceled or data.get("cancel_at_period_end", False))

    if cancel_at_period_end:
        user.polar_cancel_at_period_end = 1
        user.plan_renews_at = None
        user.plan_ends_at = current_period_end if current_period_end else None
    else:
        user.polar_cancel_at_period_end = 0
        user.plan_renews_at = current_period_end if current_period_end else None
        user.plan_ends_at = None

    store.db.commit()
    logger.info(
        f"Updated user {user.id} to plan {plan_roles} from Polar subscription "
        f"{subscription_id} (cancels_at_period_end: {cancel_at_period_end}, event_id={event_id})"
    )


async def handle_subscription_revoked(data: Dict[str, Any], store: Store, event_id: Optional[str]) -> None:
    """Immediate termination (subscription.revoked). Downgrade to free now."""
    subscription_id = data.get("id")
    customer_id = data.get("customer_id")

    # SCHOLARDOCX-0157: look up by subscription OR customer OR email. Previously
    # only subscription_id was used, so a revoke arriving before any update event
    # had persisted polar_subscription_id (e.g. email-only match) silently no-oped.
    user = None
    if subscription_id:
        user = store.db.scalar(select(Users).where(Users.polar_subscription_id == subscription_id))
    if not user:
        user = _find_user(store, customer_id, data)

    if user:
        user.roles = json.dumps(["free_user"])
        user.polar_subscription_id = None
        user.plan_ends_at = datetime.now(timezone.utc).isoformat()
        user.plan_renews_at = None
        user.polar_cancel_at_period_end = 0
        store.db.commit()
        logger.info(
            f"Revoked subscription {subscription_id} for user {user.id}, fell back to free_user "
            f"(event_id={event_id})"
        )
    else:
        logger.error(
            f"Could not find user to revoke Polar subscription {subscription_id} "
            f"(customer_id={customer_id}, event_id={event_id})"
        )
        raise HTTPException(status_code=500, detail="User not found")


async def handle_order_created(data: Dict[str, Any], store: Store, event_id: Optional[str]) -> None:
    """Grant extra-credit pack tokens for a one-off Polar order."""
    product_id = data.get("product_id")

    pack_code: Optional[str] = None
    if product_id == get_app_setting(store, "polar_extra_credits_id_1"):
        pack_code = "small"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_2"):
        pack_code = "medium"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_3"):
        pack_code = "large"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_4"):
        pack_code = "extra_large"

    if not pack_code:
        logger.warning(f"Unknown Polar extra-credit product_id {product_id} in order (event_id={event_id})")
        return  # not ours — don't fail the webhook over unrelated products

    pack_row = store.db.scalar(select(AiTokenPacks).where(AiTokenPacks.code == pack_code))
    if not pack_row or pack_row.token_amount <= 0:
        logger.error(
            f"Polar product {product_id} maps to pack_code={pack_code} but the pack row "
            f"is missing or has 0 credits (event_id={event_id})"
        )
        raise HTTPException(status_code=500, detail="Pack misconfigured")

    customer_id = data.get("customer_id")
    user = _find_user(store, customer_id, data)

    if not user:
        logger.error(
            f"Could not find user to grant extra credits (product_id={product_id}, "
            f"customer_id={customer_id}, event_id={event_id})"
        )
        raise HTTPException(status_code=500, detail="User not found")

    # SCHOLARDOCX-0157 (C1 fix): grant_purchased's signature is
    # (user_id, tokens, *, session, source, note=None, ref_id=None). The
    # previous call passed an unsupported `metadata=` kwarg, which raised
    # TypeError on EVERY order.created — buyers got zero credits. `note` is
    # the correct parameter; `ref_id` is unused here because event-level
    # idempotency is handled by _mark_processed.
    grant_purchased(
        user_id=user.id,
        tokens=pack_row.token_amount,
        session=store.db,
        source="polar_order",
        note=pack_row.display_name,
    )
    store.db.commit()
    logger.info(
        f"Granted {pack_row.token_amount} extra credits to user {user.id} via Polar order "
        f"(pack={pack_code}, event_id={event_id})"
    )


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO 8601 timestamp from Polar (or our own) payloads.

    Returns None if the value is missing or unparseable, so callers can treat
    ambiguous dates conservatively (don't reset, don't revoke early).
    """
    if not value:
        return None
    try:
        # `fromisoformat` handles the `+00:00` suffix we write; Polar also sends
        # ISO 8601 with `Z`, which we normalize first.
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
