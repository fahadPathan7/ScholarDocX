"""Supabase Storage client for persistent file uploads.

SCHOLARDOCX-0139: user-uploaded files (CVs, transcripts, certificates) must
survive serverless/host restarts. Local-disk storage loses files on Render free
(sleeps wipe the ephemeral disk) and Vercel (no filesystem at all). This module
uploads/downloads/deletes files in a Supabase Storage bucket via the REST API,
using httpx (already a dependency) — no extra SDK required.

The object key is the same ``relative_path`` value the static_files table already
stores (e.g. ``media/cv/abc123-resume.pdf``), so the schema needs no change.
When STORAGE is not configured (SUPABASE_URL + SUPABASE_SECRET_KEY unset), the
functions raise a clear error — there is no local-disk fallback, because the app
is now cloud-deployed.
"""

from __future__ import annotations

import os
from typing import IO

import httpx

from app.core.config import get_settings


def _is_configured() -> bool:
    """True when Supabase Storage env vars are present."""
    return bool(os.getenv("SUPABASE_URL")) and bool(os.getenv("SUPABASE_SECRET_KEY"))


def _bucket() -> str:
    return os.getenv("SUPABASE_BUCKET", "media")


def _base() -> str:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    return f"{url}/storage/v1/object"


def _object_key(relative_path: str) -> str:
    """Convert a static_files.relative_path to a bucket-relative object key.

    relative_path is stored as ``media/<category>/<file>`` (the old on-disk
    path). The Storage bucket is named ``media``, so the object key drops the
    leading ``media/`` prefix. Keys without the prefix are passed through.
    """
    if relative_path.startswith("media/"):
        return relative_path[len("media/"):]
    return relative_path


def _headers() -> dict[str, str]:
    key = os.getenv("SUPABASE_SECRET_KEY", "")
    return {
        "Authorization": f"Bearer {key}",
        # Supabase's new-format keys (sb_secret_...) require the apikey header
        # in addition to Authorization for the Storage REST API. The legacy
        # service_role JWT worked with Authorization alone, but the new keys
        # need both. Harmless to send apikey alongside the JWT too.
        "apikey": key,
        # x-upsert avoids 409 on overwrite for the same key.
        "x-upsert": "true",
    }


def upload_file(key: str, source: IO[bytes], content_type: str = "application/octet-stream") -> None:
    """Upload a file to the Storage bucket under ``key``.

    ``key`` is the relative_path stored in static_files (e.g.
    ``media/cv/<uuid>-resume.pdf``); a leading ``media/`` is stripped to form
    the bucket-relative object key. ``source`` is a binary file-like object.
    Raises RuntimeError if Storage is not configured, or HTTPStatusError on
    upload failure.
    """
    if not _is_configured():
        raise RuntimeError("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).")
    body = source.read()
    obj_key = _object_key(key)
    url = f"{_base()}/{_bucket()}/{obj_key}"
    resp = httpx.post(
        url,
        content=body,
        headers={**_headers(), "Content-Type": content_type},
        timeout=60.0,
    )
    resp.raise_for_status()


def download_bytes(key: str) -> tuple[bytes, str]:
    """Download a file from Storage. Returns (content_bytes, content_type).

    ``key`` is the static_files.relative_path (leading ``media/`` is stripped).
    Raises HTTPStatusError (404 if the object does not exist).
    """
    if not _is_configured():
        raise RuntimeError("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).")
    obj_key = _object_key(key)
    url = f"{_base()}/{_bucket()}/{obj_key}"
    resp = httpx.get(url, headers=_headers(), timeout=60.0)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "application/octet-stream")
    return resp.content, content_type


def delete_file(key: str) -> None:
    """Delete a single object from Storage. No-op (logged) if already gone.

    ``key`` is the static_files.relative_path (leading ``media/`` is stripped).
    """
    if not _is_configured():
        raise RuntimeError("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).")
    obj_key = _object_key(key)
    url = f"{_base()}/{_bucket()}/{obj_key}"
    resp = httpx.delete(url, headers=_headers(), timeout=30.0)
    # 404 = already deleted; treat as success. Other errors raise.
    if resp.status_code not in (200, 204, 404):
        resp.raise_for_status()


def delete_prefix(prefix: str) -> None:
    """Delete all objects under a folder prefix (e.g. ``media/cv/``).

    Supabase Storage REST has no recursive delete by prefix, so list then
    delete each. Best-effort: missing objects are skipped.
    """
    if not _is_configured():
        raise RuntimeError("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).")
    list_url = f"{os.getenv('SUPABASE_URL', '').rstrip('/')}/storage/v1/object/list"
    list_resp = httpx.post(
        list_url,
        json={
            "prefix": prefix,
            "limit": 1000,
            "offset": 0,
            "bucket_id": _bucket(),
        },
        headers=_headers(),
        timeout=30.0,
    )
    list_resp.raise_for_status()
    names = [item["name"] for item in list_resp.json() if item.get("name")]
    for name in names:
        # The list returns the key relative to the bucket root.
        try:
            delete_file(name)
        except Exception:
            pass  # best-effort cleanup


def file_size(key: str) -> int | None:
    """Return the size in bytes of a stored object, or None if absent."""
    if not _is_configured():
        return None
    url = f"{os.getenv('SUPABASE_URL', '').rstrip('/')}/storage/v1/object/list"
    # Filter by exact name via prefix + client-side match.
    prefix = key.rsplit("/", 1)[0] + "/" if "/" in key else ""
    resp = httpx.post(
        url,
        json={"prefix": prefix, "limit": 1000, "offset": 0, "bucket_id": _bucket()},
        headers=_headers(),
        timeout=30.0,
    )
    if resp.status_code >= 400:
        return None
    for item in resp.json():
        if item.get("name") == key:
            metadata = item.get("metadata", {})
            return int(metadata.get("size", 0))
    return None
