from __future__ import annotations

import asyncio
from html.parser import HTMLParser
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
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


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._skip_depth = 0
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._current_href: str | None = None
        self._link_text: list[str] = []
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
        if tag == "a":
            self._current_href = attrs_dict.get("href")
            self._link_text = []
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
        if tag == "a" and self._current_href:
            text = " ".join(self._link_text).strip()
            self.links.append((self._current_href, text))
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
        if self._in_table_cell:
            self._table_cell_text.append(clean)


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    path = parsed.path.rstrip("/") or "/"
    query = ""
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


def _validate_public_host(hostname: str) -> None:
    if not hostname or hostname.lower() in {"localhost", "localhost.localdomain"}:
        raise ValueError("Only public web hosts are allowed.")
    try:
        addresses = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValueError("The source host could not be resolved.") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError("Private or local network sources are not allowed.")


def validate_public_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS sources are allowed.")
    _validate_public_host(parsed.hostname or "")
    return canonicalize_url(url)


def is_visual_url(url: str) -> bool:
    return urlparse(url).path.lower().endswith(VISUAL_SUFFIXES)


class PublicCrawler:
    def __init__(self, user_agent: str = "ScholarDocX-AdvisorAtlas/1.0") -> None:
        self.user_agent = user_agent
        self._robots: dict[str, RobotFileParser] = {}
        self._last_request: dict[str, float] = {}
        self._host_locks: dict[str, asyncio.Lock] = {}

    def _host_lock(self, host: str) -> asyncio.Lock:
        # Serialize requests per host so the polite per-domain delay holds even
        # when multiple candidates are researched concurrently.
        return self._host_locks.setdefault(host, asyncio.Lock())

    async def _robots_allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots:
            parser = RobotFileParser()
            parser.set_url(f"{origin}/robots.txt")
            try:
                async with httpx.AsyncClient(
                    timeout=8,
                    follow_redirects=False,
                    headers={"User-Agent": self.user_agent},
                ) as client:
                    response = await client.get(parser.url)
                if response.status_code < 400:
                    parser.parse(response.text.splitlines())
                else:
                    parser.parse([])
            except httpx.HTTPError:
                parser.parse([])
            self._robots[origin] = parser
        return self._robots[origin].can_fetch(self.user_agent, url)

    async def fetch(self, url: str) -> dict[str, Any]:
        safe_url = validate_public_url(url)
        if not await self._robots_allowed(safe_url):
            raise PermissionError("The source is disallowed by robots.txt.")
        host = urlparse(safe_url).netloc
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8",
        }
        async with self._host_lock(host):
            loop = asyncio.get_running_loop()
            last = self._last_request.get(host, 0.0)
            delay = max(0.0, 0.45 - (loop.time() - last))
            if delay:
                await asyncio.sleep(delay)
            self._last_request[host] = loop.time()

            async with httpx.AsyncClient(timeout=18, follow_redirects=False, headers=headers) as client:
                response = await client.get(safe_url)
                redirects = 0
                while response.is_redirect and redirects < 4:
                    target = urljoin(str(response.url), response.headers.get("location", ""))
                    safe_target = validate_public_url(target)
                    response = await client.get(safe_target)
                    redirects += 1
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                if not any(kind in content_type for kind in ALLOWED_CONTENT_TYPES):
                    raise ValueError("Unsupported source content type.")
                content = response.content[: MAX_PAGE_BYTES + 1]
                if len(content) > MAX_PAGE_BYTES:
                    raise ValueError("Source page is too large to inspect safely.")
                text = content.decode(response.encoding or "utf-8", errors="replace")

        parser = PageParser()
        parser.feed(text)
        clean_text = re.sub(r"\s+", " ", " ".join(parser.text_parts)).strip()
        links = []
        for href, label in parser.links:
            absolute = urljoin(safe_url, href)
            parsed_link = urlparse(absolute)
            if parsed_link.scheme in {"http", "https"}:
                links.append({"url": canonicalize_url(absolute), "text": label.strip()})
        return {
            "url": canonicalize_url(str(response.url)),
            "title": parser.title or urlparse(safe_url).netloc,
            "text": clean_text[:120_000],
            "links": links,
            "emails": sorted(set(EMAIL_PATTERN.findall(clean_text))),
            "table_rows": parser.table_rows[:500],
        }

    async def inspect_visual(self, url: str) -> dict[str, Any]:
        safe_url = validate_public_url(url)
        if not await self._robots_allowed(safe_url):
            raise PermissionError("The visual source is disallowed by robots.txt.")
        headers = {
            "User-Agent": self.user_agent,
            "Accept": ",".join(ALLOWED_VISUAL_CONTENT_TYPES),
        }
        async with httpx.AsyncClient(timeout=18, follow_redirects=False, headers=headers) as client:
            response = await client.get(safe_url)
            redirects = 0
            while response.is_redirect and redirects < 4:
                target = urljoin(str(response.url), response.headers.get("location", ""))
                safe_target = validate_public_url(target)
                if not await self._robots_allowed(safe_target):
                    raise PermissionError("The redirected visual source is disallowed by robots.txt.")
                response = await client.get(safe_target)
                redirects += 1
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type not in ALLOWED_VISUAL_CONTENT_TYPES:
                raise ValueError("Unsupported visual source content type.")
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > MAX_VISUAL_BYTES:
                raise ValueError("Visual source is too large to inspect safely.")
            if len(response.content) > MAX_VISUAL_BYTES:
                raise ValueError("Visual source is too large to inspect safely.")
        return {
            "url": canonicalize_url(str(response.url)),
            "content_type": content_type,
            "size_bytes": len(response.content),
        }

    def faculty_candidates(
        self,
        page: dict[str, Any],
        institution: str | None,
        department: str | None,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen: set[str] = set()
        source_host = urlparse(page["url"]).netloc
        for link in page.get("links", []):
            label = re.sub(r"\s+", " ", link.get("text", "")).strip()
            name = clean_person_name(label)
            path = urlparse(link["url"]).path.lower()
            if not name or not any(hint in path for hint in FACULTY_HINTS):
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                {
                    "display_name": name,
                    "institution": institution or source_host,
                    "department": department,
                    "official_profile_url": link["url"],
                    "source_title": page.get("title"),
                    "source_excerpt": f"Faculty link labeled {label}",
                }
            )
        return candidates
