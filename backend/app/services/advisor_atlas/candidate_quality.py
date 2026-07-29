"""Candidate-level quality gates for Advisor Atlas discovery (SCHOLARDOCX-0190).

Three concerns, all deliberately deterministic — they judge whether a result
deserves the user's attention, so they must not depend on a model call that
can fail, drift, or cost credits:

1. `advising_eligibility` — can this person actually supervise a PhD?
2. `calibrate_evidence_confidence` — is the confidence number earned?
3. `merge_duplicate_candidates` — is this the same professor twice?

Nothing here deletes a person. Advisor Atlas reports what it found and why it
ranked it where it did; hiding a real professor behind a heuristic would be a
worse failure than showing them with an honest caveat.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from app.services.advisor_atlas.crawler import canonicalize_url


def person_tokens(name: str) -> list[str]:
    """Every word of a personal name, lowercased, punctuation removed.

    Deliberately not `professor_facts.name_tokens`, which drops tokens of two
    characters or fewer — that is right for topic matching and wrong here,
    where it would erase the surnames of Hua **Li** and Joon-Yeoul **Oh** and
    every middle initial.
    """
    parts = re.findall(r"[^\W\d_][\w'’\-]*", name or "", re.UNICODE)
    return [part.lower() for part in parts]


def surname_of(name: str) -> str:
    """The token to search for when asking "does this page mention them?"."""
    tokens = [token for token in person_tokens(name) if len(token) > 1]
    return tokens[-1] if tokens else ""


# --- 1. Advising eligibility ------------------------------------------------

# Titles that make PhD supervision impossible or conditional. Ordered: the
# first match wins, so the most disqualifying patterns come first.
#
# "ineligible" — no PhD supervision authority at all.
# "limited"    — may co-supervise or supervise only with a tenured co-advisor;
#                worth showing, never worth ranking beside a full advisor.
ROLE_SIGNALS: tuple[tuple[str, str, str], ...] = (
    (
        r"\b(lab|laboratory)\s+(manager|technician|coordinator|supervisor)\b",
        "ineligible",
        "Laboratory staff role with no documented PhD supervision authority.",
    ),
    (
        r"\b(office|department|dean'?s|administrative)\s+(staff|assistant|manager)\b",
        "ineligible",
        "Administrative staff role, not a research appointment.",
    ),
    (
        r"\bph\.?d\.?\s+(candidate|student)\b|\bdoctoral\s+(candidate|student)\b",
        "ineligible",
        "Currently a doctoral candidate, so cannot supervise doctoral students.",
    ),
    (
        r"\bemerit(?:us|a|i)\b|\bretired\b",
        "ineligible",
        "Emeritus or retired appointment; unlikely to take new doctoral students.",
    ),
    (
        r"\bprofessor\s+of\s+practice\b|\bclinical\s+professor\b",
        "limited",
        "Practice or clinical appointment, which often carries no doctoral "
        "supervision authority or research funding eligibility.",
    ),
    (
        r"\badjunct\b",
        "limited",
        "Adjunct appointment; doctoral supervision usually requires a "
        "full-time faculty co-advisor.",
    ),
    (
        r"\bvisiting\b",
        "limited",
        "Visiting appointment, which is time-limited and may end before a "
        "doctorate completes.",
    ),
    (
        # "Research Assistant Professor" is a real tenure-track-adjacent rank —
        # the negative lookahead keeps it out of the staff bucket.
        r"\bresearch\s+(?:associate|assistant|scientist|fellow)\b(?!\s+professor)",
        "limited",
        "Research-track appointment; doctoral supervision rights vary by "
        "institution and are rarely independent.",
    ),
    (
        # UK "Lecturer"/"Senior Lecturer"/"Reader" are permanent faculty who do
        # supervise; US "Lecturer"/"Instructor" is a teaching-only rank. The
        # senior variants are excluded so the UK case is not penalised.
        r"(?<!senior\s)(?<!principal\s)\b(lecturer|instructor)\b(?!\s*/\s*reader)",
        "limited",
        "Teaching-focused rank; may not hold independent doctoral "
        "supervision rights.",
    ),
)

RETIREE_EMAIL = re.compile(r"@(?:retiree|alumni|emeritus)\.", re.IGNORECASE)


def advising_eligibility(
    candidate: dict[str, Any],
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Judge whether this candidate can supervise a doctorate.

    Reads the title first (the strongest signal), then the email domain, then
    — only if the title said nothing — a bounded window of the candidate's own
    profile text. Returns `status` in {"eligible", "limited", "ineligible"}
    with a user-facing reason.
    """
    signals: list[str] = []
    title = str(candidate.get("title") or "")
    email = str(candidate.get("email") or "")

    for pattern, status, reason in ROLE_SIGNALS:
        if re.search(pattern, title, re.IGNORECASE):
            signals.append(f"Title: {title.strip()}")
            return {
                "status": status,
                "can_supervise": False,
                "reason": reason,
                "signals": signals,
            }

    if RETIREE_EMAIL.search(email):
        return {
            "status": "ineligible",
            "can_supervise": False,
            "reason": (
                "The listed contact address is a retiree or alumni address, "
                "which indicates the appointment has ended."
            ),
            "signals": [f"Contact address: {email}"],
        }

    # Only consult page text when the title is absent or uninformative — page
    # text mentions other people's ranks constantly, so it is a weak signal.
    if not title.strip():
        window = _profile_window(candidate, sources or [])
        for pattern, status, reason in ROLE_SIGNALS:
            if re.search(pattern, window, re.IGNORECASE):
                return {
                    "status": status,
                    "can_supervise": False,
                    "reason": reason,
                    "signals": ["Stated on the professor's own profile page."],
                }

    return {
        "status": "eligible",
        "can_supervise": True,
        "reason": "",
        "signals": signals,
    }


def _profile_window(
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
    width: int = 240,
) -> str:
    """Text immediately around the candidate's name on their own profile page."""
    profile_url = candidate.get("official_profile_url")
    name = str(candidate.get("display_name") or "")
    if not profile_url or not name:
        return ""
    try:
        wanted = canonicalize_url(str(profile_url))
    except (TypeError, ValueError):
        return ""
    for source in sources:
        url = source.get("url")
        if not url:
            continue
        try:
            if canonicalize_url(str(url)) != wanted:
                continue
        except (TypeError, ValueError):
            continue
        text = str(source.get("content") or source.get("text") or "")
        match = re.search(re.escape(name), text, re.IGNORECASE)
        if not match:
            return text[:width]
        return text[match.start() : match.start() + width]
    return ""


# --- 2. Evidence confidence -------------------------------------------------

# How many independent sources must actually *name* this person before a
# confidence figure is allowed to climb.
CONFIDENCE_CEILINGS = ((0, 25), (1, 55), (2, 70), (3, 85))
OFFICIAL_SOURCE_BONUS = 10
CONFIDENCE_MAX = 95


def naming_source_count(
    sources: list[dict[str, Any]],
    candidate_name: str,
) -> tuple[int, bool, str | None]:
    """Count distinct sources that name the candidate; flag official ones.

    "Names" means the surname appears as a whole word — the same bar
    `candidate_excerpt` uses to anchor a quote. A page that merely sits on the
    right department's website proves nothing about this individual.
    """
    surname = surname_of(candidate_name)
    if not surname:
        return 0, False, None
    pattern = re.compile(rf"(?<![\w]){re.escape(surname)}(?![\w])", re.IGNORECASE)
    seen: set[str] = set()
    official_host: str | None = None
    for source in sources:
        url = str(source.get("url") or "")
        if not url or "example.invalid" in url:
            continue
        text = f"{source.get('title') or ''} {source.get('content') or source.get('text') or ''}"
        if not pattern.search(text):
            continue
        try:
            key = canonicalize_url(url)
        except (TypeError, ValueError):
            continue
        if key in seen:
            continue
        seen.add(key)
        host = urlparse(url).netloc.lower()
        if host.endswith(".edu") or ".edu." in host or host.endswith(".ac.uk"):
            official_host = official_host or host
    return len(seen), bool(official_host), official_host


def calibrate_evidence_confidence(
    raw_confidence: int,
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
) -> tuple[int, dict[str, Any]]:
    """Cap a generated confidence figure at what the evidence actually supports.

    SCHOLARDOCX-0190: a live run showed "Source confidence 95% · 3 strong
    evidence areas" for entries that were *web pages*, and 95% for real
    professors whose only supporting text was a colleague's grant paragraph on
    a shared department page. The number was generated alongside the analysis
    rather than derived from it, so nothing tied it to whether any source had
    named the person at all.
    """
    count, has_official, host = naming_source_count(
        sources,
        str(candidate.get("display_name") or ""),
    )
    ceiling = CONFIDENCE_CEILINGS[-1][1]
    for threshold, value in CONFIDENCE_CEILINGS:
        if count <= threshold:
            ceiling = value
            break
    if has_official:
        ceiling = min(CONFIDENCE_MAX, ceiling + OFFICIAL_SOURCE_BONUS)
    calibrated = max(0, min(int(raw_confidence or 0), ceiling))
    return calibrated, {
        "naming_sources": count,
        "official_source": has_official,
        "official_host": host,
        "ceiling": ceiling,
        "generated": int(raw_confidence or 0),
        "note": (
            "Confidence is capped by the number of independent public sources "
            "that name this professor."
        ),
    }


# --- 3. Same-person merging -------------------------------------------------

def identity_signature(name: str) -> tuple[str, str]:
    """(surname, first token) for a personal name, both normalized."""
    tokens = person_tokens(name)
    if not tokens:
        return "", ""
    if len(tokens) == 1:
        return tokens[0], ""
    return tokens[-1], tokens[0]


def _first_names_compatible(left: str, right: str) -> bool:
    """"A." and "Ayush" are the same person; "Hua" and "Hui" are not.

    Only initial-vs-full is treated as compatible. Prefix matching beyond a
    single letter would merge genuinely different people — `Hua Li` and
    `Hui Li` are two real professors in the same college.
    """
    if not left or not right:
        return True
    if left == right:
        return True
    if len(left) == 1 or len(right) == 1:
        return left[0] == right[0]
    return False


def same_person(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Conservative identity match between two discovered candidates."""
    left_url = _canonical(left.get("official_profile_url"))
    right_url = _canonical(right.get("official_profile_url"))
    if left_url and left_url == right_url:
        return True

    left_email = str(left.get("email") or "").strip().lower()
    right_email = str(right.get("email") or "").strip().lower()
    if left_email and left_email == right_email:
        return True

    left_surname, left_first = identity_signature(str(left.get("display_name") or ""))
    right_surname, right_first = identity_signature(str(right.get("display_name") or ""))
    if not left_surname or left_surname != right_surname:
        return False
    if not _first_names_compatible(left_first, right_first):
        return False
    left_institution = str(left.get("institution") or "").strip().lower()
    right_institution = str(right.get("institution") or "").strip().lower()
    if left_institution and right_institution and left_institution != right_institution:
        return False
    return True


def _canonical(url: Any) -> str:
    if not url:
        return ""
    try:
        return canonicalize_url(str(url))
    except (TypeError, ValueError):
        return ""


def merge_duplicate_candidates(
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Collapse the same professor discovered under several labels or URLs.

    Keeps the longest display name (so "A. Goyal" yields to "Ayush Goyal") and
    unions every other field, preferring values already present. Order is
    preserved so discovery ranking is untouched.
    """
    merged: list[dict[str, Any]] = []
    for candidate in candidates:
        for existing in merged:
            if same_person(existing, candidate):
                _absorb(existing, candidate)
                break
        else:
            merged.append(dict(candidate))
    return merged


def _name_fullness(name: str) -> tuple[int, int]:
    tokens = person_tokens(name)
    return sum(1 for token in tokens if len(token) > 1), len(tokens)


def _absorb(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    incoming_name = str(incoming.get("display_name") or "")
    existing_name = str(existing.get("display_name") or "")
    # The fuller spelling is the better record: "Ayush Goyal" beats "A. Goyal",
    # which has the same token count but one fewer spelled-out name.
    if _name_fullness(incoming_name) > _name_fullness(existing_name):
        existing["display_name"] = incoming_name
    for key, value in incoming.items():
        if key == "display_name":
            continue
        if value in (None, "", [], {}):
            continue
        if existing.get(key) in (None, "", [], {}):
            existing[key] = value
    aliases = list(existing.get("discovered_aliases") or [])
    for alias in {existing_name, incoming_name}:
        if alias and alias != existing["display_name"] and alias not in aliases:
            aliases.append(alias)
    if aliases:
        existing["discovered_aliases"] = aliases
