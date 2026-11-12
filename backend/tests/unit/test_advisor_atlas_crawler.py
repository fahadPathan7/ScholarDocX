"""PublicCrawler hardening (SCHOLARDOCX-0251).

Network behaviour is exercised through `httpx.MockTransport` placed *behind*
the real `_PublicOnlyTransport`, so address validation and IP pinning run in
every test instead of being patched out.
"""

from __future__ import annotations

import asyncio
import socket

import httpx
import pytest

import app.services.advisor_atlas.crawler as crawler_module
from app.services.advisor_atlas.crawler import (
    PublicCrawler,
    canonicalize_url,
    validate_public_url,
)

PUBLIC_IP = "93.184.216.34"


@pytest.fixture(autouse=True)
def _fresh_politeness_state(monkeypatch):
    monkeypatch.setattr(crawler_module, "_ROBOTS_CACHE", {})
    monkeypatch.setattr(crawler_module, "_NEXT_SLOT", {})
    monkeypatch.setattr(crawler_module, "HOST_DELAY_SECONDS", 0.0)


def _public_dns(monkeypatch):
    async def resolve(host, port):
        return PUBLIC_IP

    monkeypatch.setattr(crawler_module, "_resolve_public_ip", resolve)


def _crawler(handler) -> PublicCrawler:
    return PublicCrawler(transport_factory=lambda: httpx.MockTransport(handler))


def _html(body: str, status: int = 200) -> httpx.Response:
    return httpx.Response(status, headers={"content-type": "text/html"}, content=body.encode())


# ── URL normalisation ────────────────────────────────────────────────────────


def test_content_query_is_kept_and_tracking_is_dropped():
    assert (
        canonicalize_url("https://www.uni.edu/people/profile.php?id=4821&utm_source=x&fbclid=y")
        == "https://www.uni.edu/people/profile.php?id=4821"
    )
    assert canonicalize_url("https://uni.edu/directory/?dept=cs&page=2#top") == (
        "https://uni.edu/directory?dept=cs&page=2"
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/x",
        "http://10.0.0.5/x",
        "http://100.64.0.1/x",  # CGNAT: not is_private, but not global either
        "http://[::ffff:127.0.0.1]/x",
        "http://169.254.169.254/latest/meta-data",
        "http://localhost/x",
        "http://intranet.localhost/x",
        "ftp://uni.edu/x",
    ],
)
def test_non_public_targets_are_rejected_without_dns(url):
    with pytest.raises(ValueError):
        validate_public_url(url)


# ── SSRF: resolve once, validate, pin ────────────────────────────────────────


@pytest.mark.asyncio
async def test_host_resolving_to_private_address_is_rejected(monkeypatch):
    loop = asyncio.get_running_loop()

    async def rebinding_dns(host, port, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.1.2.3", port))]

    monkeypatch.setattr(loop, "getaddrinfo", rebinding_dns)
    contacted: list[str] = []
    crawler = _crawler(lambda request: contacted.append(str(request.url)) or _html("x"))

    with pytest.raises(ValueError, match="Private or local"):
        await crawler.fetch("https://evil.example.com/page")
    await crawler.aclose()
    assert contacted == []


@pytest.mark.asyncio
async def test_connection_is_pinned_to_the_validated_address(monkeypatch):
    loop = asyncio.get_running_loop()
    lookups: list[str] = []

    async def dns(host, port, **kwargs):
        lookups.append(host)
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, port))]

    monkeypatch.setattr(loop, "getaddrinfo", dns)
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return _html("<title>Profile</title>")

    crawler = _crawler(handler)
    page = await crawler.fetch("https://faculty.uni.edu/people/ada")
    await crawler.aclose()

    request = seen[-1]
    assert request.url.host == PUBLIC_IP
    assert request.headers["host"] == "faculty.uni.edu"
    assert request.extensions["sni_hostname"] == "faculty.uni.edu"
    assert page["url"] == "https://faculty.uni.edu/people/ada"
    assert set(lookups) == {"faculty.uni.edu"}


# ── robots.txt ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_redirect_into_disallowed_path_is_refused(monkeypatch):
    _public_dns(monkeypatch)
    fetched: list[str] = []

    def handler(request):
        fetched.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private\n")
        if request.url.path == "/start":
            return httpx.Response(302, headers={"location": "/private/page"})
        return _html("secret")

    crawler = _crawler(handler)
    with pytest.raises(PermissionError):
        await crawler.fetch("https://uni.edu/start")
    await crawler.aclose()
    assert "/private/page" not in fetched


@pytest.mark.asyncio
async def test_robots_behind_redirect_is_honoured(monkeypatch):
    _public_dns(monkeypatch)

    def handler(request):
        if request.url.host == PUBLIC_IP and request.headers["host"] == "uni.edu":
            # Apex redirects everything to www, including robots.txt.
            return httpx.Response(301, headers={"location": f"https://www.uni.edu{request.url.path}"})
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /\n")
        return _html("page")

    crawler = _crawler(handler)
    with pytest.raises(PermissionError):
        await crawler.fetch("https://uni.edu/people")
    await crawler.aclose()


@pytest.mark.asyncio
async def test_unreachable_robots_disallows_and_missing_robots_allows(monkeypatch):
    _public_dns(monkeypatch)

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(503 if request.headers["host"] == "down.edu" else 404)
        return _html("<title>ok</title>")

    crawler = _crawler(handler)
    with pytest.raises(PermissionError):
        await crawler.fetch("https://down.edu/people")
    page = await crawler.fetch("https://open.edu/people")
    await crawler.aclose()
    assert page["title"] == "ok"


# ── Size cap ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_oversized_body_is_cut_off_while_streaming(monkeypatch):
    _public_dns(monkeypatch)
    monkeypatch.setattr(crawler_module, "MAX_PAGE_BYTES", 10_000)
    produced = 0

    async def endless():
        nonlocal produced
        for _ in range(1_000):
            produced += 1
            yield b"x" * 4_096

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        # No content-length: only the streaming cap can stop this.
        return httpx.Response(200, headers={"content-type": "text/html"}, content=endless())

    crawler = _crawler(handler)
    with pytest.raises(ValueError, match="too large"):
        await crawler.fetch("https://uni.edu/huge")
    await crawler.aclose()
    assert produced < 10


# ── Extraction ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mailto_and_obfuscated_emails_are_collected(monkeypatch):
    _public_dns(monkeypatch)

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return _html(
            '<a href="mailto:ada.scholar@uni.edu?subject=PhD">Email</a>'
            "<p>Office: alan [at] cs.uni [dot] edu</p>"
        )

    crawler = _crawler(handler)
    page = await crawler.fetch("https://uni.edu/people/ada")
    await crawler.aclose()
    assert page["emails"] == ["ada.scholar@uni.edu", "alan@cs.uni.edu"]
    assert all(not link["url"].startswith("mailto") for link in page["links"])


@pytest.mark.asyncio
async def test_query_profile_links_are_fetched_with_their_query(monkeypatch):
    _public_dns(monkeypatch)
    paths: list[str] = []

    def handler(request):
        paths.append(str(request.url.raw_path, "ascii"))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return _html("<title>Profile</title>")

    crawler = _crawler(handler)
    await crawler.fetch("https://uni.edu/profile.php?id=42&utm_campaign=x")
    await crawler.aclose()
    assert paths[-1] == "/profile.php?id=42"


def test_faculty_candidates_are_same_site_hinted_and_read_card_headings():
    page = {
        "url": "https://cs.uni.edu/people",
        "title": "People",
        "links": [
            {"url": "https://profiles.uni.edu/persons/ada-scholar", "text": "Ada Scholar"},
            {"url": "https://en.wikipedia.org/wiki/people/Alan_Turing", "text": "Alan Turing"},
            {"url": "https://cs.uni.edu/courses/syllabus/grace", "text": "Grace Hopper"},
            {
                "url": "https://cs.uni.edu/faculty/barbara",
                "text": "View profile",
                "context": "Barbara Liskov",
            },
        ],
    }
    names = [
        item["display_name"]
        for item in PublicCrawler().faculty_candidates(page, "Uni", "CS")
    ]
    assert names == ["Ada Scholar", "Barbara Liskov"]


@pytest.mark.asyncio
async def test_card_heading_becomes_context_for_generic_profile_links(monkeypatch):
    _public_dns(monkeypatch)

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return _html(
            '<div class="card"><h3>Barbara Liskov</h3><p>Professor</p>'
            '<a href="/faculty/barbara">View profile</a></div>'
            '<a href="/faculty/ada">Ada Scholar</a>'
        )

    crawler = _crawler(handler)
    page = await crawler.fetch("https://cs.uni.edu/people")
    await crawler.aclose()
    by_url = {link["url"]: link for link in page["links"]}
    assert by_url["https://cs.uni.edu/faculty/barbara"]["context"] == "Barbara Liskov"
    assert "context" not in by_url["https://cs.uni.edu/faculty/ada"]
