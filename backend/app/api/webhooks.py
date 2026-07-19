import json
import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select
from svix.webhooks import Webhook

from app.api.dependencies import get_store
from app.db.models import Users, AiTokenPacks, AppSettings
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
        logger.error(f"Webhook verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event.get("type")
    data = event.get("data", {})
    
    logger.info(f"Received Polar webhook: {event_type}")
    
    if event_type in ["subscription.created", "subscription.updated"]:
        await handle_subscription_updated(data, store)
    elif event_type in ["subscription.revoked", "subscription.canceled"]:
        await handle_subscription_revoked(data, store)
    elif event_type == "order.created":
        await handle_order_created(data, store)
        
    return {"status": "ok"}

async def handle_subscription_updated(data: Dict[str, Any], store: Store):
    customer_id = data.get("customer_id")
    subscription_id = data.get("id")
    product_id = data.get("product_id")
    
    plan_roles = []
    if product_id in [get_app_setting(store, "polar_product_id_basic_monthly"), get_app_setting(store, "polar_product_id_basic_quarterly")]:
        plan_roles = ["general_user"]
    elif product_id in [get_app_setting(store, "polar_product_id_pro_monthly"), get_app_setting(store, "polar_product_id_pro_quarterly")]:
        plan_roles = ["pro_user"]
    elif product_id in [get_app_setting(store, "polar_product_id_max_monthly"), get_app_setting(store, "polar_product_id_max_quarterly")]:
        plan_roles = ["max_user"]
    else:
        logger.warning(f"Unknown Polar product_id {product_id} in subscription {subscription_id}")
        return

    user = None
    if customer_id:
        user = store.db.scalar(select(Users).where(Users.polar_customer_id == customer_id))
    
    if not user:
        customer = data.get("customer", {})
        email = customer.get("email")
        if email:
            user = store.db.scalar(select(Users).where(Users.email == email))
            if user and customer_id:
                user.polar_customer_id = customer_id

    if user:
        user.roles = json.dumps(plan_roles)
        user.polar_subscription_id = subscription_id
        
        # Parse renewal fields
        current_period_end = data.get("current_period_end")
        cancel_at_period_end = data.get("cancel_at_period_end", False)
        
        user.plan_started_at = datetime.now(timezone.utc).isoformat()
        
        if cancel_at_period_end:
            user.polar_cancel_at_period_end = 1
            user.plan_renews_at = None
            user.plan_ends_at = current_period_end if current_period_end else None
        else:
            user.polar_cancel_at_period_end = 0
            user.plan_renews_at = current_period_end if current_period_end else None
            user.plan_ends_at = None

        store.db.commit()
        logger.info(f"Updated user {user.id} to plan {plan_roles} from Polar subscription {subscription_id} (cancels: {cancel_at_period_end})")
    else:
        logger.warning(f"Could not find user for Polar subscription {subscription_id}")

async def handle_subscription_revoked(data: Dict[str, Any], store: Store):
    subscription_id = data.get("id")
    
    user = store.db.scalar(select(Users).where(Users.polar_subscription_id == subscription_id))
    if user:
        user.roles = json.dumps(["free_user"])
        user.polar_subscription_id = None
        user.plan_ends_at = datetime.now(timezone.utc).isoformat()
        user.plan_renews_at = None
        user.polar_cancel_at_period_end = 0
        store.db.commit()
        logger.info(f"Revoked subscription {subscription_id} for user {user.id}, fell back to free_user")

async def handle_order_created(data: Dict[str, Any], store: Store):
    product_id = data.get("product_id")
    
    pack_code = None
    if product_id == get_app_setting(store, "polar_extra_credits_id_1"):
        pack_code = "small"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_2"):
        pack_code = "medium"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_3"):
        pack_code = "large"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_4"):
        pack_code = "extra_large"

    if pack_code:
        # Fetch the token pack from the database dynamically
        pack_row = store.db.scalar(select(AiTokenPacks).where(AiTokenPacks.code == pack_code))
        if pack_row and pack_row.token_amount > 0:
            customer_id = data.get("customer_id")
            user = store.db.scalar(select(Users).where(Users.polar_customer_id == customer_id))
            
            if not user:
                customer = data.get("customer", {})
                email = customer.get("email")
                if email:
                    user = store.db.scalar(select(Users).where(Users.email == email))
                    if user and customer_id:
                        user.polar_customer_id = customer_id
                        store.db.commit()

            if user:
                grant_purchased(
                    user_id=user.id,
                    tokens=pack_row.token_amount,
                    session=store.db,
                    source="polar_order",
                    metadata={"pack_code": pack_row.code, "pack_name": pack_row.display_name}
                )
                store.db.commit()
                logger.info(f"Granted {pack_row.token_amount} extra credits to user {user.id} via Polar order")
            else:
                logger.warning(f"Could not find user to grant extra credits (product_id {product_id})")
        else:
            logger.warning(f"Found product {product_id} but token pack is invalid or has 0 credits")
    else:
        logger.warning(f"Unknown Polar extra credit product_id {product_id} in order")
