"""AnalyzeRequest source_url validation (SCHOLARDOCX-0217).

The analyze endpoint forwards ``source_url`` to an external analysis call and
persists it, so non-web links are rejected at the API boundary — before any
permission gate or external call. These tests verify both the rejection and
the gate ORDER (rejection happens before the permission gate).
"""
import asyncio
from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from app.api import scholarship_opportunities as mod


def _analyze(source_url: str):
    async def call():
        return await mod.analyze_scholarship_opportunity(
            mod.AnalyzeRequest(source_url=source_url, source_title="t", source_snippet=""),
            user={"id": "analyze-url-test", "roles": ["free_user"]},
            store=Mock(),
        )

    return asyncio.run(call())


@pytest.fixture(autouse=True)
def _isolated_rate_limit(monkeypatch):
    monkeypatch.setattr(mod.rate_limiter, "check_and_record", lambda *a, **k: None)
    monkeypatch.setattr(mod, "user_identity", lambda user: "test-user")


@pytest.mark.parametrize(
    "bad_url",
    [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://example.com/paper.pdf",
        "not a url",
        "",
    ],
)
def test_analyze_rejects_non_http_links_before_permission_gate(monkeypatch, bad_url):
    def _gate_reached(*args, **kwargs):
        raise AssertionError("permission gate must not run for an invalid link")

    monkeypatch.setattr(mod, "_require_scholarship_analyze", _gate_reached)

    with pytest.raises(HTTPException) as exc:
        _analyze(bad_url)

    assert exc.value.status_code == 400
    assert "valid link" in exc.value.detail


def test_analyze_valid_http_link_reaches_the_permission_gate(monkeypatch):
    """A well-formed link passes the URL gate and proceeds to the permission
    gate — proving validation only rejects non-web links (no provider call,
    no persistence: the gate is mocked to stop the request)."""
    def _gate_reached(*args, **kwargs):
        raise HTTPException(status_code=403, detail="gate-reached")

    monkeypatch.setattr(mod, "_require_scholarship_analyze", _gate_reached)

    with pytest.raises(HTTPException) as exc:
        _analyze("https://example.com/scholarship")

    assert exc.value.status_code == 403
    assert exc.value.detail == "gate-reached"
