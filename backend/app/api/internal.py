"""Internal endpoints for external schedulers (SCHOLARDOCX-0162).

These routes are NOT authenticated via the normal user/JWT path — they are
gated by a shared secret header so an external scheduler (GitHub Actions cron)
can call them without an admin login. The pattern mirrors the Polar webhook
shared secret: a header value compared against an env var.

Mounted under ``/api/internal`` so it is clearly separate from the user/admin
surfaces and easy to audit.
"""
from __future__ import annotations

import os
import hmac
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.dependencies import get_store
from app.services.registration_cleanup import purge_expired_pending_accounts
from app.services.store import Store

router = APIRouter(prefix="/internal", tags=["internal"])


def _cleanup_secret() -> str:
    """Return the configured shared secret for the cleanup endpoint.

    Empty string when unset. The endpoint refuses to run when this is empty so
    a misconfigured deploy never exposes an unauthenticated delete path.
    """
    return (os.environ.get("CLEANUP_SECRET") or "").strip()


@router.post("/cleanup-pending")
def cleanup_pending_accounts(
    x_cleanup_token: Optional[str] = Header(default=None, alias="X-Cleanup-Token"),
    store: Store = Depends(get_store),
):
    """Delete unpaid pending-payment accounts older than the TTL.

    Called by the GitHub Actions ``cleanup-pending-accounts`` workflow every 2h.
    Returns ``{status, deleted}``. Auth is a constant-time comparison of the
    ``X-Cleanup-Token`` header against ``CLEANUP_SECRET``; if the secret is
    unset the endpoint returns 503 (refuses to serve) rather than 401, so a
    deploy that forgot the env var fails closed without leaking that the route
    exists.
    """
    secret = _cleanup_secret()
    if not secret:
        # Fail closed: do not advertise that the route exists; surface a generic
        # unavailable status so the scheduler logs a visible failure.
        raise HTTPException(status_code=503, detail="Cleanup endpoint not configured.")
    if not x_cleanup_token or not hmac.compare_digest(x_cleanup_token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized.")
    deleted = purge_expired_pending_accounts(store)
    return {"status": "success", "deleted": deleted}
