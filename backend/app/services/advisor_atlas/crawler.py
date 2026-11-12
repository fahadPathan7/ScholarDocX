from __future__ import annotations

import asyncio
import base64
import codecs
from html.parser import HTMLParser
import ipaddress
import re
import socket
import time
from typing import Any, Callable
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx


MAX_PAGE_BYTES = 1_500_000
MAX_VISUAL_BYTES = 4_000_000
ALLOWED_CONTENT_TYPES = ("text/html", "text/plain", "application/xhtml+xml")
ALLOWED_VISUAL_CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")
VISUAL_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp")
FACULTY_HINTS = (
    "faculty", "people", "staff", "professor", "profile", "directory", "lab",
    # Elsevier Pure portals (used by many universities) serve /persons/<name>;
    # /person/, /member/, /team/, /employee/ and /researcher/ are also common.
    # Requiring only the original seven silently skipped all of them.
    "person", "member", "team", "employee", "researcher", "academic", "author",
)

# Honorifics stripped before matching. Without this, "Professor John Smith"
# matched as a *name* and the title was stored in display_name.
HONORIFIC_PATTERN = re.compile(
    r"^\s*(?:"
    r"prof(?:\.|essor)?|dr\.?|doctor|assoc(?:\.|iate)?|asst\.?|assistant"
    r"|mr\.?|mrs\.?|ms\.?|miss|sir|dame|rev\.?|hon\.?"
    r"|a/?prof\.?|em(?:\.|eritus)?|lect(?:\.|urer)?|univ\.?"
    r")\s+",
    re.IGNORECASE,
)
# Trailing post-nominals ("John Smith, PhD", "Jane Doe MD, FRSC").
POSTNOMINAL_PATTERN = re.compile(
    r"[,\s]+(?:ph\.?d|m\.?d|d\.?phil|sc\.?d|m\.?sc|m\.?a|b\.?sc|b\.?a"
    r"|frs[a-z]*|fieee|facm|cpa|p\.?eng|jr|sr|i{1,3}|iv)\.?\s*$",
    re.IGNORECASE,
)

# A single name word. Unicode-aware by construction:
#   \w with re.UNICODE covers accented Latin (María, Müller, Lefèvre, Å),
#   CJK (李明), Cyrillic, Greek, and Devanagari.
# The leading character may be uppercase OR a lowercase nobiliary particle
# (van, de, der, dos, di, von, bin, al-) which legitimately appears mid-name.
# Digits and underscore are excluded so link labels like "Room 214" are rejected.
_NAME_WORD = r"(?:[^\W\d_][\w'`.\-’]*)"
NAME_PATTERN = re.compile(
    rf"^({_NAME_WORD}(?:[\s ]+{_NAME_WORD}){{1,4}})$",
    re.UNICODE,
)
# Single-token names (common for CJK, e.g. 李明) are accepted separately, but
# only when the token is non-Latin — a lone Latin word like "Directory" or
# "Publications" is far more likely to be navigation than a person.
CJK_NAME_PATTERN = re.compile(
    r"^([㐀-䶿一-鿿぀-ヿ가-힯]{2,12})$"
)
# Link labels that pass the shape test but are never people.
NON_NAME_LABELS = {
    "read more", "learn more", "view profile", "contact us", "our people",
    "faculty directory", "research faculty", "all faculty", "back to top",
    "skip to content", "privacy policy", "terms of use", "site map",
    "graduate program", "undergraduate program", "news events", "apply now",
}

# Lowercase particles that legitimately appear inside a personal name
# ("Ludwig van Beethoven", "Ana de la Cruz", "Ibn al-Haytham").
NAME_PARTICLES = {
    "van", "von", "de", "del", "della", "der", "den", "di", "da", "das",
    "dos", "du", "la", "le", "el", "al", "bin", "ibn", "ter", "ten", "af",
    "av", "bint", "san", "santa", "st", "mac", "mc", "op", "'t",
}

# Function words. A personal name does not contain them; a page heading or a
# navigation label almost always does ("Message from the Chair", "Masters in
# Computer Science", "Skip to main content", "Faculty and Staff").
NAME_STOPWORDS = {
    "and", "or", "for", "the", "an", "of", "in", "to", "from", "with", "at",
    "on", "by", "about", "into", "via", "our", "your", "their", "its", "my",
    "this", "that", "these", "those", "us", "we", "you", "all", "more",
    "here", "how", "what", "why", "when", "where", "who", "which", "is",
    "are", "was", "were", "be", "&",
}

# Institutional nouns. A label containing one of these describes a page, an
# organisation or a document — never a person.
#
# SCHOLARDOCX-0190: without this, every university site's own chrome was
# harvested as faculty. One live Discovery run reported "CHNG Brochure",
# "Faculty Resources", "Dean's Office Staff", "Council Members", "Personnel
# Profile", "Online Programs" and "CLICK HERE FOR FULL RESUME" among its
# "79 verified professors".
#
# Deliberately excluded because they are also real surnames: page, read, main,
# dean, chair, church, young, park, bishop, major. Those labels are caught by
# the stopword rule or by their companion tokens instead.
NON_PERSON_TOKENS = {
    # organisational units and pages
    "faculty", "staff", "personnel", "directory", "department", "departments",
    "school", "schools", "college", "university", "universities", "institute",
    "institution", "center", "centre", "division", "office", "offices",
    "council", "committee", "board", "administration", "campus", "portal",
    "library", "dashboard", "homepage", "sitemap", "site", "menu",
    "navigation", "index", "overview", "mission", "vision", "welcome",
    "about", "home",
    # programmes, degrees and courses
    "program", "programs", "programme", "programmes", "curriculum", "course",
    "courses", "degree", "degrees", "certificate", "certificates", "minor",
    "masters", "bachelors", "bachelor", "doctoral", "doctorate", "phd",
    "undergraduate", "graduate", "postgraduate", "admission", "admissions",
    "tuition", "scholarship", "scholarships", "syllabus", "catalog",
    "catalogue", "handbook", "seminar", "seminars", "colloquium", "workshop",
    "conference",
    # documents, actions and chrome
    "brochure", "resume", "cv", "vitae", "resource", "resources", "profile",
    "profiles", "publication", "publications", "project", "projects",
    "research", "areas", "team", "teams", "group", "groups", "lab", "labs",
    "laboratory", "people", "member", "members", "student", "students",
    "alumni", "career", "careers", "job", "jobs", "employment", "news",
    "event", "events", "calendar", "newsletter", "announcement",
    "announcements", "message", "contact", "contacts", "information", "info",
    "click", "skip", "content", "submit", "download", "downloads", "form",
    "forms", "link", "links", "faq", "faqs", "help", "search", "login",
    "logout", "apply", "application", "applications", "give", "giving",
    "donate", "support", "services", "service", "gallery", "photo", "photos",
    "map", "maps", "directions", "policy", "privacy", "terms", "list",
    "listing", "view", "next", "previous", "now", "online", "virtual",
    # role words that survive honorific stripping mid-label
    "professor", "professors", "lecturer", "lecturers", "instructor",
    "instructors", "adjunct", "emeritus", "emerita", "emeriti", "provost",
    "chancellor", "president", "registrar", "coordinator", "director",
    "administrator", "advisor", "advisors", "fellowship",
}


def _looks_like_person(name: str) -> bool:
    """Reject labels whose *words* say "page heading", not "person".

    Runs after the shape test in `clean_person_name`, which only proves the
    label is a run of capitalised words — a bar that "Graduate Faculty" and
    "Council Members" clear just as easily as "Ayush Goyal".
    """
    tokens = [
        re.sub(r"[^\w'’\-]", "", token).lower()
        for token in name.split()
    ]
    tokens = [token for token in tokens if token]
    if len(tokens) < 2:
        # Single-token names only reach here through CJK_NAME_PATTERN, which
        # is already narrow enough.
        return True
    for token in tokens:
        # A middle initial ("Ali A. Pilehvari") is a single letter, which would
        # otherwise collide with the article "a".
        if len(token) == 1 or token in NAME_PARTICLES:
            continue
        if token in NAME_STOPWORDS or token in NON_PERSON_TOKENS:
            return False
    # A name made only of particles is not a name.
    return any(token not in NAME_PARTICLES for token in tokens)


def clean_person_name(label: str) -> str | None:
    """Normalise a link label to a bare personal name, or None if it isn't one.

    Handles honorifics, post-nominals, "Last, First" directory ordering, and
    Unicode scripts. Returns None for navigation text and non-name strings.
    """
    text = re.sub(r"\s+", " ", (label or "")).strip()
    if not text:
        return None

    previous = None
    while previous != text:
        previous = text
        text = HONORIFIC_PATTERN.sub("", text).strip()
        text = POSTNOMINAL_PATTERN.sub("", text).strip()

    # Directory listings frequently use "Smith, John" — flip to natural order.
    if text.count(",") == 1:
        surname, _, given = text.partition(",")
        surname, given = surname.strip(), given.strip()
        if surname and given and " " not in surname.strip():
            text = f"{given} {surname}"
    text = text.strip(" ,;:.-")
    if not text or normalize_label(text) in NON_NAME_LABELS:
        return None
    if CJK_NAME_PATTERN.match(text):
        return text
    match = NAME_PATTERN.match(text)
    if not match:
        return None
    candidate = match.group(1).strip()
    # Require at least one capitalised or non-Latin token so all-lowercase
    # navigation ("view all people") cannot slip through as a name.
    if not any(word[:1].isupper() or not word[:1].isascii() for word in candidate.split()):
        return None
    if not _looks_like_person(candidate):
        return None
    return candidate


def normalize_label(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
# "jane [at] uni [dot] edu", "jane (at) uni (dot) edu" — common anti-spam forms
# on faculty pages (SCHOLARDOCX-0251).
OBFUSCATED_AT = re.compile(r"\s*[\[\(\{<]\s*at\s*[\]\)\}>]\s*", re.IGNORECASE)
OBFUSCATED_DOT = re.compile(r"\s*[\[\(\{<]\s*dot\s*[\]\)\}>]\s*", re.IGNORECASE)

# Link labels that say "this is a profile" without naming the person. On card
# layouts the name sits in a heading just before the link, so the parser keeps
# that heading as the link's context.
GENERIC_PROFILE_LABELS = {
    "", "view profile", "profile", "full profile", "faculty profile",
    "see profile", "visit profile", "view full profile", "read more",
    "learn more", "more", "more info", "details", "view details", "bio",
    "biography", "view bio", "homepage", "home page", "website",
    "personal website",
}

# Query parameters that never change which page is served. Everything else is
# kept: `profile.php?id=42` and `profile.php?id=43` are different professors.
TRACKING_PARAM_PREFIXES = ("utm_",)
TRACKING_PARAMS = {
    "fbclid", "gclid", "dclid", "msclkid", "yclid", "mc_cid", "mc_eid",
    "_ga", "_gl", "igshid", "ref_src", "phpsessid", "jsessionid",
}

# Second-level labels under a two-letter country TLD ("ox.ac.uk", "unsw.edu.au")
# whose registrable site is three labels, not two.
_COUNTRY_SECOND_LEVELS = {"ac", "edu", "co", "gov", "org", "net", "com", "sch", "res"}

MAX_REDIRECTS = 4
MAX_ROBOTS_REDIRECTS = 5  # RFC 9309 §2.3.1.2
MAX_ROBOTS_BYTES = 500_000
ROBOTS_TTL_SECONDS = 3600.0
ROBOTS_UNREACHABLE_TTL_SECONDS = 300.0
ROBOTS_CACHE_LIMIT = 512
HOST_DELAY_SECONDS = 0.45
_HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "strong", "b"}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._skip_depth = 0
        self.text_parts: list[str] = []
        # (href, label, context): context is the last heading seen before the link.
        self.links: list[tuple[str, str, str]] = []
        self._current_href: str | None = None
        self._link_text: list[str] = []
        self._link_context = ""
        self._heading_depth = 0
        self._heading_text: list[str] = []
        self._last_heading = ""
        self._in_table_cell = False
        self._table_cell_text: list[str] = []
        self._table_row: list[str] = []
        self.table_rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag in _HEADING_TAGS:
            if not self._heading_depth:
                self._heading_text = []
            self._heading_depth += 1
        if tag == "a":
            self._current_href = attrs_dict.get("href")
            self._link_text = []
            self._link_context = self._last_heading
        if tag == "tr":
            self._table_row = []
        if tag in {"td", "th"}:
            self._in_table_cell = True
            self._table_cell_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag in _HEADING_TAGS and self._heading_depth:
            self._heading_depth -= 1
            if not self._heading_depth:
                heading = " ".join(self._heading_text).strip()
                if heading:
                    self._last_heading = heading
        if tag == "a" and self._current_href:
            text = " ".join(self._link_text).strip()
            self.links.append((self._current_href, text, self._link_context))
            self._current_href = None
            self._link_text = []
        if tag in {"td", "th"} and self._in_table_cell:
            value = " ".join(self._table_cell_text).strip()
            if value:
                self._table_row.append(value)
            self._in_table_cell = False
            self._table_cell_text = []
        if tag == "tr" and self._table_row:
            self.table_rows.append(self._table_row)
            self._table_row = []

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        clean = " ".join(data.split())
        if not clean:
            return
        if self._in_title:
            self.title = f"{self.title} {clean}".strip()
        self.text_parts.append(clean)
        if self._current_href is not None:
            self._link_text.append(clean)
        if self._heading_depth:
            self._heading_text.append(clean)
        if self._in_table_cell:
            self._table_cell_text.append(clean)


def _is_tracking_param(key: str) -> bool:
    lowered = key.lower()
    return lowered in TRACKING_PARAMS or lowered.startswith(TRACKING_PARAM_PREFIXES)


def canonicalize_url(url: str) -> str:
    """Normalise a URL for de-duplication *and* fetching.

    Content-selecting query parameters are kept (SCHOLARDOCX-0251: dropping
    them fetched `profile.php` instead of `profile.php?id=42`); only tracking
    parameters, fragments, and `;params` are removed. Google Scholar keeps only
    its identity parameter so one profile has one URL.
    """
    parsed = urlparse(url.strip())
    path = parsed.path.rstrip("/") or "/"
    if "scholar.google." in parsed.netloc.lower():
        identity_query = [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=False)
            if key == "user"
        ]
        params_user = re.search(r"(?:^|;)user=([^;]+)", parsed.params)
        if params_user and not identity_query:
            identity_query = [("user", params_user.group(1))]
        query = urlencode(identity_query)
    else:
        query = urlencode(
            [
                (key, value)
                for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                if not _is_tracking_param(key)
            ]
        )
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            "",
            query,
            "",
        )
    )


class UnsafeTargetError(ValueError):
    """The host is not a public address, or could not be resolved to one.

    A ValueError subclass so existing `except ValueError` call sites keep
    skipping the source; robots handling re-raises it instead of treating the
    site as "robots.txt unreachable".
    """


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    # `is_global` excludes private, loopback, link-local, reserved,
    # unspecified, CGNAT (100.64/10) and documentation ranges.
    return ip.is_global and not ip.is_multicast


def _literal_ip(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(host.strip("[]").split("%", 1)[0])
    except ValueError:
        return None


async def _resolve_public_ip(host: str, port: int) -> str:
    """Resolve `host` once, without blocking the event loop, and return a public IP.

    Every address must be public: a name that resolves to any private address
    is rejected outright rather than filtered, so it cannot be used to probe
    internal hosts.
    """
    literal = _literal_ip(host)
    if literal is not None:
        if not _is_public_ip(literal):
            raise UnsafeTargetError("Private or local network sources are not allowed.")
        return str(literal)
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, port, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise UnsafeTargetError("The source host could not be resolved.") from exc
    addresses = [ipaddress.ip_address(info[4][0].split("%", 1)[0]) for info in infos]
    if not addresses or not all(_is_public_ip(address) for address in addresses):
        raise UnsafeTargetError("Private or local network sources are not allowed.")
    return str(addresses[0])


def validate_public_url(url: str) -> str:
    """Cheap, synchronous checks; DNS-based checks happen at connect time.

    The resolved address is validated and pinned by `_PublicOnlyTransport`, so
    there is no gap between "checked" and "connected" for DNS rebinding.
    """
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS sources are allowed.")
    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".localhost"):
        raise UnsafeTargetError("Only public web hosts are allowed.")
    literal = _literal_ip(hostname)
    if literal is not None and not _is_public_ip(literal):
        raise UnsafeTargetError("Private or local network sources are not allowed.")
    return canonicalize_url(url)


def is_visual_url(url: str) -> bool:
    return urlparse(url).path.lower().endswith(VISUAL_SUFFIXES)


def _site_key(host: str | None) -> str:
    host = (host or "").lower().removeprefix("www.")
    if _literal_ip(host) is not None:
        return host
    labels = [label for label in host.split(".") if label]
    if (
        len(labels) >= 3
        and len(labels[-1]) == 2
        and labels[-2] in _COUNTRY_SECOND_LEVELS
    ):
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def _path_has_faculty_hint(path: str) -> bool:
    # Token-prefix match, not substring: "lab" must not match "/syllabus/" and
    # "member" must not match "/remember/". Prefix keeps plurals and joined
    # words ("persons", "facultystaff").
    tokens = [token for token in re.split(r"[^a-z0-9]+", path.lower()) if token]
    return any(token.startswith(hint) for token in tokens for hint in FACULTY_HINTS)


def _deobfuscate_emails(text: str) -> str:
    return OBFUSCATED_DOT.sub(".", OBFUSCATED_AT.sub("@", text))


def _mailto_emails(href: str) -> list[str]:
    address = unquote(href.split(":", 1)[1].split("?", 1)[0])
    return EMAIL_PATTERN.findall(address)


def _decode(body: bytes, charset: str | None) -> str:
    try:
        codecs.lookup(charset or "utf-8")
    except LookupError:
        charset = "utf-8"
    return body.decode(charset or "utf-8", errors="replace")


async def _read_capped(response: httpx.Response, cap: int, message: str) -> bytes:
    """Stream the body and stop at `cap` — never buffer an oversized response."""
    declared = response.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > cap:
        raise ValueError(message)
    body = bytearray()
    # aiter_bytes yields *decoded* bytes, so the cap also bounds gzip bombs.
    async for chunk in response.aiter_bytes():
        body.extend(chunk)
        if len(body) > cap:
            raise ValueError(message)
    return bytes(body)


# Process-wide politeness state, shared by every run (SCHOLARDOCX-0251): two
# users researching the same university must not double its request rate.
# No locks: reserving a slot is a synchronous read-modify-write, which is
# atomic under asyncio, and avoids binding a lock to one event loop.
_NEXT_SLOT: dict[str, float] = {}
_ROBOTS_CACHE: dict[str, tuple[float, RobotFileParser]] = {}


async def _throttle(host: str) -> None:
    now = time.monotonic()
    slot = max(now, _NEXT_SLOT.get(host, 0.0))
    _NEXT_SLOT[host] = slot + HOST_DELAY_SECONDS
    if len(_NEXT_SLOT) > 2048:
        for stale in [key for key, value in _NEXT_SLOT.items() if value < now]:
            _NEXT_SLOT.pop(stale, None)
    if slot > now:
        await asyncio.sleep(slot - now)


class _PublicOnlyTransport(httpx.AsyncBaseTransport):
    """Resolve, validate, and pin the destination IP for every request.

    The request goes to the validated IP while the Host header and TLS
    SNI/certificate hostname stay the original name, so a DNS answer that
    changes between check and connect cannot reach a private address.

    One inner transport per hostname: pooled connections are keyed by the
    pinned IP, and a TLS connection opened for one virtual host on a shared
    CDN address must not be reused for another.
    """

    def __init__(
        self,
        inner_factory: Callable[[], httpx.AsyncBaseTransport] | None = None,
    ) -> None:
        self._inner_factory = inner_factory or (lambda: httpx.AsyncHTTPTransport())
        self._inners: dict[str, httpx.AsyncBaseTransport] = {}

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        if url.scheme not in {"http", "https"}:
            raise ValueError("Only HTTP and HTTPS sources are allowed.")
        host = url.host
        port = url.port or (443 if url.scheme == "https" else 80)
        ip = await _resolve_public_ip(host, port)
        extensions = dict(request.extensions)
        if url.scheme == "https":
            extensions["sni_hostname"] = host
        pinned = httpx.Request(
            request.method,
            url.copy_with(host=ip),
            headers=request.headers,  # already carries Host: <original name>
            stream=request.stream,
            extensions=extensions,
        )
        inner = self._inners.get(host)
        if inner is None:
            inner = self._inners[host] = self._inner_factory()
        return await inner.handle_async_request(pinned)

    async def aclose(self) -> None:
        inners, self._inners = list(self._inners.values()), {}
        for inner in inners:
            await inner.aclose()


class PublicCrawler:
    def __init__(
        self,
        user_agent: str = "ScholarDocX-AdvisorAtlas/1.0",
        transport_factory: Callable[[], httpx.AsyncBaseTransport] | None = None,
    ) -> None:
        self.user_agent = user_agent
        # Tests pass an httpx.MockTransport factory; it still sits behind the
        # public-only pinning layer, so the SSRF path is exercised too.
        self._transport_factory = transport_factory
        self._http: httpx.AsyncClient | None = None

    def _client(self) -> httpx.AsyncClient:
        # One client per crawler (one crawler per run): connections and TLS
        # sessions are reused across the dozens of pages a run fetches.
        if self._http is None:
            self._http = httpx.AsyncClient(
                transport=_PublicOnlyTransport(self._transport_factory),
                timeout=httpx.Timeout(18.0, connect=8.0),
                follow_redirects=False,
                headers={"User-Agent": self.user_agent},
            )
        return self._http

    async def aclose(self) -> None:
        client, self._http = self._http, None
        if client is not None:
            await client.aclose()

    async def _robots_allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        cached = _ROBOTS_CACHE.get(origin)
        if cached is None or cached[0] < time.monotonic():
            parser, ttl = await self._load_robots(origin)
            _ROBOTS_CACHE.pop(origin, None)
            while len(_ROBOTS_CACHE) >= ROBOTS_CACHE_LIMIT:
                _ROBOTS_CACHE.pop(next(iter(_ROBOTS_CACHE)))
            _ROBOTS_CACHE[origin] = (time.monotonic() + ttl, parser)
            cached = _ROBOTS_CACHE[origin]
        return cached[1].can_fetch(self.user_agent, url)

    async def _load_robots(self, origin: str) -> tuple[RobotFileParser, float]:
        """Fetch robots.txt per RFC 9309.

        Redirects are followed (each hop re-validated); 4xx means no rules
        (allow all); 5xx or an unreachable server means complete disallow,
        cached briefly so a transient outage does not block the site for long.
        """
        parser = RobotFileParser()
        target = f"{origin}/robots.txt"
        parser.set_url(target)
        client = self._client()
        try:
            for _ in range(MAX_ROBOTS_REDIRECTS + 1):
                await _throttle(urlparse(target).netloc)
                async with client.stream(
                    "GET", target, headers={"Accept": "text/plain"}, timeout=8.0
                ) as response:
                    if response.is_redirect:
                        target = validate_public_url(
                            urljoin(target, response.headers.get("location", ""))
                        )
                        continue
                    if response.status_code >= 500:
                        parser.disallow_all = True
                        return parser, ROBOTS_UNREACHABLE_TTL_SECONDS
                    if response.status_code >= 400:
                        parser.allow_all = True
                        return parser, ROBOTS_TTL_SECONDS
                    body = await _read_capped(
                        response, MAX_ROBOTS_BYTES, "robots.txt is too large."
                    )
                    parser.parse(_decode(body, "utf-8").splitlines())
                    return parser, ROBOTS_TTL_SECONDS
            # More than five redirects: RFC 9309 allows treating it as unavailable.
            parser.allow_all = True
            return parser, ROBOTS_TTL_SECONDS
        except UnsafeTargetError:
            # The site itself is not a public host: report that, and do not
            # cache a robots verdict for it.
            if urlparse(target).netloc == urlparse(origin).netloc:
                raise
            parser.disallow_all = True
            return parser, ROBOTS_UNREACHABLE_TTL_SECONDS
        except (httpx.HTTPError, ValueError):
            parser.disallow_all = True
            return parser, ROBOTS_UNREACHABLE_TTL_SECONDS

    async def _get(
        self,
        url: str,
        *,
        accept: str,
        allowed_types: tuple[str, ...],
        cap: int,
        kind: str,
    ) -> tuple[str, str, bytes, str | None]:
        """GET with every redirect hop validated, robots-checked, and throttled.

        Returns (final_url, media_type, body, charset).
        """
        target = validate_public_url(url)
        client = self._client()
        for _ in range(MAX_REDIRECTS + 1):
            if not await self._robots_allowed(target):
                raise PermissionError(f"The {kind} is disallowed by robots.txt.")
            await _throttle(urlparse(target).netloc)
            async with client.stream("GET", target, headers={"Accept": accept}) as response:
                if response.is_redirect:
                    target = validate_public_url(
                        urljoin(target, response.headers.get("location", ""))
                    )
                    continue
                response.raise_for_status()
                media_type = (
                    response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                )
                if media_type not in allowed_types:
                    raise ValueError(f"Unsupported {kind} content type.")
                body = await _read_capped(
                    response, cap, f"The {kind} is too large to inspect safely."
                )
                return target, media_type, body, response.charset_encoding
        raise ValueError(f"The {kind} redirected too many times.")

    async def fetch(self, url: str) -> dict[str, Any]:
        final_url, _, body, charset = await self._get(
            url,
            accept="text/html,application/xhtml+xml,text/plain;q=0.8",
            allowed_types=ALLOWED_CONTENT_TYPES,
            cap=MAX_PAGE_BYTES,
            kind="source",
        )
        parser = PageParser()
        parser.feed(_decode(body, charset))
        clean_text = re.sub(r"\s+", " ", " ".join(parser.text_parts)).strip()
        links = []
        emails = set(EMAIL_PATTERN.findall(_deobfuscate_emails(clean_text)))
        for href, label, context in parser.links:
            if href.strip().lower().startswith("mailto:"):
                emails.update(_mailto_emails(href.strip()))
                continue
            # Resolve against the page actually served, not the pre-redirect URL.
            absolute = urljoin(final_url, href.strip())
            if urlparse(absolute).scheme not in {"http", "https"}:
                continue
            link: dict[str, Any] = {"url": canonicalize_url(absolute), "text": label.strip()}
            if context and normalize_label(label) in GENERIC_PROFILE_LABELS:
                link["context"] = context
            links.append(link)
        return {
            "url": final_url,
            "title": parser.title or urlparse(final_url).netloc,
            "text": clean_text[:120_000],
            "links": links,
            "emails": sorted(emails),
            "table_rows": parser.table_rows[:500],
        }

    async def inspect_visual(self, url: str) -> dict[str, Any]:
        final_url, media_type, body, _ = await self._get(
            url,
            accept=",".join(ALLOWED_VISUAL_CONTENT_TYPES),
            allowed_types=ALLOWED_VISUAL_CONTENT_TYPES,
            cap=MAX_VISUAL_BYTES,
            kind="visual source",
        )
        # The vision model gets these validated bytes, never the URL: letting the
        # provider fetch the URL itself would bypass every check above.
        return {
            "url": final_url,
            "content_type": media_type,
            "size_bytes": len(body),
            "data_url": f"data:{media_type};base64,{base64.b64encode(body).decode('ascii')}",
        }

    def faculty_candidates(
        self,
        page: dict[str, Any],
        institution: str | None,
        department: str | None,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen: set[str] = set()
        source = urlparse(page["url"])
        source_site = _site_key(source.hostname)
        for link in page.get("links", []):
            label = re.sub(r"\s+", " ", link.get("text", "")).strip()
            name = clean_person_name(label)
            excerpt = f"Faculty link labeled {label}"
            context = re.sub(r"\s+", " ", link.get("context") or "").strip()
            if not name and context and normalize_label(label) in GENERIC_PROFILE_LABELS:
                name = clean_person_name(context)
                excerpt = f"Faculty profile link under the heading {context}"
            if not name:
                continue
            target = urlparse(link["url"])
            # Same site only: a directory's links to news sites, Wikipedia, or
            # partner institutions are not this unit's faculty.
            if _site_key(target.hostname) != source_site:
                continue
            if not _path_has_faculty_hint(target.path):
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                {
                    "display_name": name,
                    "institution": institution or source.netloc,
                    "department": department,
                    "official_profile_url": link["url"],
                    "source_title": page.get("title"),
                    "source_excerpt": excerpt,
                }
            )
        return candidates
