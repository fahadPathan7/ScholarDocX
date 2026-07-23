"""Google OAuth sign-in + sign-up router (SCHOLARDOCX-0169).

Authorization-code + PKCE flow, server-side token exchange via authlib.

Design (simplified registration, SCHOLARDOCX-0169):
- Google sign-in: a returning user with a linked account logs in directly.
- Google sign-up: a NEW Google user gets a free account created
  immediately (signup_method='google', is_active=1, roles=['free_user']).
  No invite code or payment required — the user goes straight to the
  dashboard and can upgrade to a paid plan later.
- Auto-link by verified email: if the Google email matches an existing
  active user, the Google identity is linked and the user logs in.
- Scopes: ``openid email profile`` only.
- Client secret never touches the frontend.

Flow:
  1. GET /auth/google/login   -> 302 to Google consent.
  2. GET /auth/google/callback?code=...&state=... -> validates id_token,
     resolves or creates the user, mints the EXISTING JWT, and 302s the
     browser to FRONTEND_ORIGIN/auth-complete?token=...
"""
import base64
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.auth.jwt import create_token
from app.auth.dependencies import get_jwt_secret
from app.core.config import Settings, get_settings
from app.services.store import Store
from app.api.dependencies import get_store

router = APIRouter(prefix="/auth/google", tags=["auth"])
logger = logging.getLogger(__name__)


def _jwt_secret() -> str:
    """Return the JWT signing secret, narrowed to ``str``.

    ``Settings.jwt_secret_key`` is ``Optional[str]`` (it's read from env
    and can be unset). Every call site in this module needs a non-optional
    ``str`` for ``pyjwt`` encode/decode. We assert here so the type checker
    is satisfied and a missing secret fails loudly instead of passing
    ``None`` silently into ``jwt.encode``.
    """
    secret = get_settings().jwt_secret_key
    assert secret, "JWT_SECRET is required for Google OAuth"
    return secret


# Cookie name holding the signed (state + nonce + PKCE verifier) between
# the login redirect and the callback. HttpOnly + SameSite=Lax so it
# survives the top-level Google redirect but is not readable by JS.
_STATE_COOKIE = "sd_google_oauth_state"
_STATE_COOKIE_MAX_AGE = 600  # 10 minutes


def _google_oauth_client():
    """Return the authlib OAuth2Client class.

    Imported lazily so the app still boots when authlib is not installed
    (the route returns 503 in that case).
    """
    from authlib.integrations.httpx_client import OAuth2Client
    return OAuth2Client


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _frontend_redirect(path: str, request: Optional[Request] = None, **params: str) -> RedirectResponse:
    """Build a 302 to the frontend origin with optional query params.

    All OAuth completion routes land the browser on the frontend, which
    then reads the token/error from the URL and continues client-side.

    The frontend origin is read from ``FRONTEND_ORIGIN``. If unset, it
    falls back to the ``Origin`` or ``Referer`` header from the request
    (the browser sends these on the callback redirect). This makes the
    flow work even if ``FRONTEND_ORIGIN`` isn't configured on Render.
    """
    from urllib.parse import urlencode

    settings = get_settings()
    base = (settings.frontend_origin or "").rstrip("/")

    # Fallback: derive the frontend origin from the request headers if
    # FRONTEND_ORIGIN isn't set. The Google callback request won't have
    # a useful Origin/Referer (it comes from Google), so this mainly
    # helps the /login route. For the callback, FRONTEND_ORIGIN is
    # required — log a warning if it's missing.
    if not base and request:
        origin = request.headers.get("origin") or ""
        if origin:
            base = origin.rstrip("/")
    if not base:
        logger.error(
            "FRONTEND_ORIGIN is not set — cannot redirect to frontend after "
            "Google OAuth. Set FRONTEND_ORIGIN on Render."
        )
        base = "https://scholardocx.onrender.com"

    qs = urlencode({k: v for k, v in params.items() if v})
    location = f"{base}{path}" + (f"?{qs}" if qs else "")
    logger.info("Google OAuth redirecting to: %s", location)
    resp = RedirectResponse(url=location, status_code=status.HTTP_302_FOUND)
    resp.delete_cookie(_STATE_COOKIE)
    return resp


def _oauth_error_redirect(detail: str) -> RedirectResponse:
    """Redirect to /auth-complete with an error the frontend surfaces."""
    return _frontend_redirect("/auth-complete", error=detail)


@router.get("/login")
def google_login(request: Request):
    """Start the Google OAuth flow — redirect to Google's consent screen.

    Generates a random state + nonce, stores them in a signed HttpOnly
    cookie, and 302s to Google's authorization endpoint. PKCE is used
    (S256) so the code can't be intercepted even if the redirect leaks.
    """
    settings = get_settings()
    if not settings.google_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured.",
        )

    state = _b64url(secrets.token_bytes(24))
    nonce = _b64url(secrets.token_bytes(24))
    # PKCE verifier — stays server-side; only the challenge goes to Google.
    code_verifier = _b64url(secrets.token_bytes(48))
    import hashlib
    code_challenge = _b64url(
        hashlib.sha256(code_verifier.encode("ascii")).digest()
    )

    # Stash the PKCE verifier alongside state/nonce in the signed cookie.
    import time
    import jwt
    cookie_payload = {
        "oas": state,
        "nonce": nonce,
        "cv": code_verifier,   # PKCE verifier, needed at callback
        "iat": int(time.time()),
        "exp": int(time.time()) + _STATE_COOKIE_MAX_AGE,
    }
    cookie_value = jwt.encode(
        cookie_payload, _jwt_secret(), algorithm="HS256"
    )

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    from urllib.parse import urlencode
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    resp = RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)
    resp.set_cookie(
        key=_STATE_COOKIE,
        value=cookie_value,
        max_age=_STATE_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return resp


@router.get("/callback")
def google_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    store: Store = Depends(get_store),
):
    """Handle the Google redirect back.

    Validates state, exchanges the code for tokens, validates the
    id_token (signature + nonce), then resolves the local user via
    external_identities or auto-link-by-email. Mints the existing JWT
    and redirects to the frontend with the token.
    """
    settings = get_settings()
    if not settings.google_enabled:
        return _oauth_error_redirect("Google sign-in is not configured.")

    # If Google itself reported an error (e.g. user cancelled), send the
    # user back to the frontend with a clean message.
    if error:
        logger.info("Google OAuth returned error: %s", error)
        return _oauth_error_redirect(
            "Google sign-in was cancelled or failed. Please try again."
        )
    if not code or not state:
        return _oauth_error_redirect("Google sign-in callback is missing data.")

    # Verify the signed state cookie. This is the CSRF guard for OAuth.
    cookie_token = request.cookies.get(_STATE_COOKIE)
    if not cookie_token:
        return _oauth_error_redirect("Sign-in session expired. Please try again.")
    try:
        cookie_payload = _decode_state_cookie(cookie_token)
    except Exception:
        return _oauth_error_redirect("Sign-in session expired. Please try again.")

    if cookie_payload.get("oas") != state:
        return _oauth_error_redirect("Sign-in state mismatch. Please try again.")

    code_verifier = cookie_payload.get("cv")
    expected_nonce = cookie_payload.get("nonce")
    if not code_verifier or not expected_nonce:
        return _oauth_error_redirect("Sign-in session is invalid. Please try again.")

    # Exchange the authorization code for tokens (server-side).
    try:
        token_data = _exchange_code(code, code_verifier, settings)
    except Exception as exc:
        logger.exception("Google token exchange failed: %s", exc)
        return _oauth_error_redirect(
            "We could not complete Google sign-in. Please try again."
        )

    id_token_str = token_data.get("id_token")
    if not id_token_str:
        return _oauth_error_redirect("Google did not return an identity token.")

    # Validate the id_token: signature, audience, issuer, nonce.
    try:
        claims = _validate_id_token(
            id_token_str,
            expected_nonce=expected_nonce,
            client_id=settings.google_client_id,
        )
    except Exception as exc:
        logger.exception("Google id_token validation failed: %s", exc)
        return _oauth_error_redirect("Google identity token could not be verified.")

    google_sub = claims.get("sub")
    verified_email = claims.get("email")
    email_verified = claims.get("email_verified") is True
    if not google_sub or not verified_email:
        return _oauth_error_redirect(
            "Your Google account did not provide an email address."
        )
    if not email_verified:
        # Refuse unverified Google emails for auto-link safety — a
        # verified-email guarantee is what makes auto-link acceptable.
        return _oauth_error_redirect(
            "Please verify your email address in your Google account first."
        )

    user_dict = _resolve_user(
        store=store,
        google_sub=google_sub,
        email=verified_email.lower(),
        display_name=claims.get("name"),
        avatar_url=claims.get("picture"),
    )

    if not user_dict.get("is_active"):
        # Respect the same suspended/pending gate as password login.
        if user_dict.get("pending_payment_since") is not None:
            return _oauth_error_redirect(
                "Your account is being activated after payment. "
                "Please wait a moment and try again."
            )
        return _oauth_error_redirect("Your account has been suspended.")

    # Mint the EXISTING JWT so the frontend stays unchanged downstream.
    secret_key = get_jwt_secret(store.legacy_connection)
    exp_row = store.legacy_connection.execute(
        "SELECT value FROM app_settings WHERE key = 'jwt_expiration_days'"
    ).fetchone()
    expiration_days = int(exp_row["value"]) if exp_row else 30

    token = create_token(user_dict, secret_key, expiration_days)

    # Update last login, mirroring password login.
    store.legacy_connection.execute(
        "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
        (user_dict["id"],),
    )
    store.legacy_connection.commit()

    return _frontend_redirect("/auth-complete", request=request, token=token)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_state_cookie(cookie_token: str) -> dict:
    """Decode the signed state cookie. Raises on tamper/expiry."""
    import jwt
    return jwt.decode(
        cookie_token, _jwt_secret(), algorithms=["HS256"]
    )


def _exchange_code(code: str, code_verifier: str, settings) -> dict:
    """Exchange the authorization code for id_token + access_token.

    Uses authlib's httpx client. Raises on non-200 or error in the
    response body.
    """
    OAuth2Client = _google_oauth_client()
    client = OAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
        state=None,
    )
    token_resp = client.fetch_token(
        url="https://oauth2.googleapis.com/token",
        grant_type="authorization_code",
        code=code,
        code_verifier=code_verifier,
    )
    if "error" in token_resp:
        raise RuntimeError(f"token endpoint error: {token_resp.get('error_description') or token_resp.get('error')}")
    return token_resp


def _validate_id_token(id_token_str: str, expected_nonce: str, client_id: str) -> dict:
    """Validate the Google id_token and return its claims.

    Verifies signature against Google's JWKS, checks audience (our
    client_id) and issuer, and enforces the nonce we sent at /login.
    Uses PyJWT (not authlib.jose which is deprecated in 1.7+).
    """
    import jwt as _jwt
    from jwt import PyJWKClient

    # Fetch Google's public keys and resolve the signing key for this token.
    # PyJWKClient caches the JWKS internally and auto-refreshes per the
    # cache-control headers Google returns (max-age ~36000s).
    jwks_client = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")
    signing_key = jwks_client.get_signing_key_from_jwt(id_token_str)

    # Decode + verify signature, audience, and expiry. We validate the
    # issuer manually below because Google accepts both
    # "https://accounts.google.com" and "accounts.google.com" as the iss
    # claim, and passing a list to PyJWT's issuer param can fail on
    # some versions (observed on Render's PyJWT + Python 3.14).
    claims = _jwt.decode(
        id_token_str,
        signing_key.key,
        algorithms=["RS256"],
        audience=client_id,
    )

    # Validate issuer manually — supports both Google issuer formats.
    token_iss = claims.get("iss")
    if token_iss not in ("https://accounts.google.com", "accounts.google.com"):
        raise ValueError(f"Invalid issuer: {token_iss}")

    # Enforce the nonce we sent at /login (prevents token replay).
    if claims.get("nonce") != expected_nonce:
        raise ValueError("nonce mismatch — id_token may be replayed")

    return dict(claims)


def _resolve_user(
    store: Store,
    google_sub: str,
    email: str,
    display_name: Optional[str],
    avatar_url: Optional[str],
) -> dict:
    """Resolve a local user from a verified Google identity.

    1. Look up external_identities by (google, google_sub). If found,
       load the linked user.
    2. Else, if users.email matches the verified Google email, auto-link
       by inserting an external_identities row and load that user.
    3. Else CREATE a new active free user (signup_method='google',
       is_active=1, roles=['free_user']) — the user goes straight to the
       dashboard and can upgrade to a paid plan later.

    Returns a user dict (roles parsed as a list). Never returns None.
    """
    from app.api.auth import _seed_new_user_dependents

    conn = store.legacy_connection
    now_iso = datetime.now(timezone.utc).isoformat()

    linked = conn.execute(
        "SELECT user_id FROM external_identities "
        "WHERE provider = ? AND provider_subject_id = ?",
        ("google", google_sub),
    ).fetchone()

    user_id: Optional[str] = None

    if linked:
        user_id = linked["user_id"]
    else:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        if existing:
            user_id = existing["id"]
            _insert_external_identity(
                conn, google_sub, user_id, email, display_name, avatar_url
            )
            conn.commit()
            logger.info("Auto-linked Google identity to user %s", user_id)
        else:
            # NEW Google user — create an active free account immediately.
            # No invite code or payment required; the user can upgrade later.
            display_name = display_name or email.split("@")[0]
            cursor = conn.execute(
                "INSERT INTO users "
                "(email, password_hash, display_name, avatar, roles, is_active, "
                " is_blocked, plan_started_at, signup_method) "
                "VALUES (?, ?, ?, ?, ?, 1, 0, ?, 'google')",
                (
                    email,
                    "",  # Google users have no password
                    display_name,
                    avatar_url,
                    json.dumps(["free_user"]),
                    now_iso,
                ),
            )
            user_id = cursor.lastrowid
            if not user_id:
                raise RuntimeError("Failed to create Google user record")
            _insert_external_identity(
                conn, google_sub, user_id, email, display_name, avatar_url
            )
            _seed_new_user_dependents(store, user_id, display_name, email)
            conn.commit()
            logger.info("Created active free Google account for user %s", user_id)

    user = conn.execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not user:
        # Should be unreachable, but guard against a race.
        raise RuntimeError("Google-resolved user not found after insert")

    user_dict = dict(user)
    try:
        user_dict["roles"] = json.loads(user_dict.get("roles") or "[]")
    except (TypeError, ValueError):
        user_dict["roles"] = []
    return user_dict


def _insert_external_identity(
    conn,
    google_sub: str,
    user_id: str,
    email: str,
    display_name: Optional[str],
    avatar_url: Optional[str],
) -> None:
    """Insert a row linking a Google subject id to a local user."""
    conn.execute(
        "INSERT INTO external_identities "
        "(id, provider, provider_subject_id, user_id, email, "
        " display_name, avatar_url) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            "google",
            google_sub,
            user_id,
            email,
            display_name,
            avatar_url,
        ),
    )
