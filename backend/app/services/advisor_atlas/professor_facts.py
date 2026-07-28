"""Deterministic professor fact extraction (SCHOLARDOCX-0182).

Split out of ``professor_research.py`` to keep both files under the size target
in CODE_RULES.md.

Design rule for everything in this module: **a missing fact is acceptable, an
invented one is not.** The previous implementation asserted "Assistant Professor"
whenever that phrase appeared anywhere on a page, and attributed it to the
candidate's institution — so a professor whose page mentioned a former junior post
elsewhere was reported at the wrong rank and the wrong university. Seniority is
precisely what an applicant uses to judge whether a professor can independently
admit students, so every extractor here binds a fact to the person and place the
evidence actually names, or emits nothing.
"""

from __future__ import annotations

import re
from typing import Any

# Ranks ordered longest-first so "Associate Professor" wins over "Professor".
ACADEMIC_RANKS: tuple[str, ...] = (
    "distinguished professor",
    "university professor",
    "emeritus professor",
    "professor emeritus",
    "associate professor",
    "assistant professor",
    "adjunct professor",
    "visiting professor",
    "clinical professor",
    "research professor",
    "honorary professor",
    "full professor",
    "senior lecturer",
    "principal lecturer",
    "associate lecturer",
    "postdoctoral researcher",
    "postdoctoral fellow",
    "research fellow",
    "senior researcher",
    "principal investigator",
    "department head",
    "head of department",
    "vice chancellor",
    "pro vice chancellor",
    "associate dean",
    "professor",
    "reader",
    "lecturer",
    "dozent",
    "docent",
    "director",
    "dean",
    "chair",
    "provost",
)

# Leadership roles that accompany rather than replace an academic rank.
LEADERSHIP_ROLES: tuple[str, ...] = (
    "director", "dean", "chair", "head of department", "department head",
    "principal investigator", "provost", "associate dean",
)

# Wording that marks a rank as PAST or as held ELSEWHERE. A rank matched in the
# same sentence as any of these is recorded as history, never as current.
_HISTORY_MARKERS = (
    "previously", "formerly", "prior to joining", "before joining", "until",
    "from 20", "was a", "was an", "served as", "has held", "used to",
    "earlier", "past", "former", "between 19", "between 20",
)

DEGREE_PATTERN = re.compile(
    r"\b("
    r"Ph\.?\s?D|D\.?Phil|Sc\.?D|Ed\.?D|M\.?D|J\.?D|LL\.?[MB]"
    r"|M\.?Phil|M\.?Sc|M\.?S|M\.?A|M\.?Eng|M\.?B\.?A|M\.?Tech"
    r"|B\.?Sc|B\.?S|B\.?A|B\.?Eng|B\.?Tech|B\.?E"
    r"|Dr\.?\s?rer\.?\s?nat|Habilitation|Diplom|Laurea|Licenciatura"
    r")\b"
    r"[.,:]?\s*(?:in\s+|of\s+)?"
    r"([^.;|\n]{0,90}?)"
    r"(?:[,(]\s*((?:19|20)\d{2})\s*\)?)?"
    r"(?=[.;|\n]|$)",
    re.IGNORECASE,
)

YEAR_RANGE = re.compile(r"((?:19|20)\d{2})\s*(?:[-–—]|to)\s*((?:19|20)\d{2}|present|now)", re.IGNORECASE)
SINGLE_YEAR = re.compile(r"\b((?:19|20)\d{2})\b")

# Section headings seen across university templates, not one site's wording.
INTEREST_LABELS = (
    "research interests", "key research areas", "research areas",
    "areas of interest", "areas of expertise", "research focus",
    "research topics", "research summary", "current research",
    "my research", "expertise", "specialisation", "specialization",
    "research",
)
TEACHING_LABELS = (
    "teaching", "courses taught", "courses", "teaching interests",
    "current courses", "modules", "lectures",
)
SERVICE_LABELS = (
    "service", "administrative roles", "academic service",
    "professional service", "committees", "editorial",
)
LAB_LABELS = (
    "lab members", "group members", "research group", "team members",
    "current students", "phd students", "doctoral students", "advisees",
    "supervision", "my students", "graduate students", "our team",
)
GRADUATE_LABELS = (
    "alumni", "former students", "past students", "graduated",
    "phd alumni", "former group members",
)

_STOP_TOPIC_WORDS = {
    "and", "or", "the", "a", "an", "of", "in", "for", "with", "on", "to",
    "my", "our", "his", "her", "their", "research", "interests", "areas",
    "including", "such", "as", "also", "current", "current ly", "work",
    "works", "using", "based", "focus", "focuses", "focused", "study",
    "studies", "studying", "topics", "area", "interest", "i", "we",
}


def name_tokens(candidate_name: str) -> list[str]:
    """Unicode-aware significant tokens from a person's name.

    ``[A-Za-z]``-based tokenisation split "Jürgen Müller" into the fragments
    ``rgen`` and ``ller``, so sources genuinely about that professor failed the
    relevance check and were discarded before extraction ever ran.
    """
    parts = re.findall(r"[^\W\d_][\w'\-]*", candidate_name or "", re.UNICODE)
    return [part.lower() for part in parts if len(part) > 2]


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.;!?])\s+|\n+", text or "") if part.strip()]


def _is_history(sentence: str) -> bool:
    lowered = sentence.lower()
    return any(marker in lowered for marker in _HISTORY_MARKERS)


def _opens_as_self_description(sentence: str, rank: str) -> bool:
    """True when a sentence-initial rank describes the page's own subject.

    "Professor of Chemistry at X" is a self-description. "Professor Alan
    Whitfield has retired" is a sentence about somebody else that happens to
    start with the same word — accepting it attributed a colleague's (or a
    retiree's) rank to the professor being researched. The discriminator is what
    follows the rank: a preposition or punctuation means the rank is being
    described, a capitalised word means it is titling a different person.
    """
    stripped = sentence.lstrip()
    if not stripped.lower().startswith(rank):
        return False
    remainder = stripped[len(rank) :].lstrip()
    if not remainder:
        return True
    if remainder[0] in ",;:.-–—(":
        return True
    following = remainder.split(None, 1)[0].lower().strip(",;:.")
    return following in {"of", "in", "at", "for", "and", "with", "emeritus", "emerita"}


def _institution_in(sentence: str) -> str | None:
    """Institution named in this sentence, if any.

    Taken from the sentence itself rather than from the candidate record — using
    the candidate's institution was how a rank held at Yale got reported as held
    at the university being searched.
    """
    match = re.search(
        r"\b((?:[A-Z][\w&'\-]*\s+){0,3}"
        r"(?:University|Universität|Université|Universidad|Institute|Institut"
        r"|College|School|Laboratory|Academy|Hospital|Centre|Center)"
        r"(?:\s+(?:of|for|at)\s+(?:[A-Z][\w&'\-]*\s?){1,4})?)",
        sentence,
    )
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(1)).strip(" ,.")


def extract_positions(
    text: str,
    candidate_name: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (current_positions, career_history).

    A rank is only attributed when it appears in a sentence that also refers to
    the professor (by name or pronoun-free subject position). Sentences carrying
    history wording, or naming a different institution, land in career history.
    """
    tokens = set(name_tokens(candidate_name))
    current: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for sentence in _sentences(text):
        lowered = sentence.lower()
        matched_rank = next((rank for rank in ACADEMIC_RANKS if rank in lowered), None)
        if not matched_rank:
            continue

        is_history = _is_history(sentence)
        mentions_person = any(token in lowered for token in tokens) if tokens else False
        opens_with_rank = _opens_as_self_description(sentence, matched_rank)
        # A rank may be claimed as CURRENT only when the sentence is demonstrably
        # about this professor — their name appears, or the sentence opens with
        # the rank (the standard "Professor of X at Y" self-description).
        #
        # History sentences are admitted more freely: "Previously Assistant
        # Professor at Yale" rarely repeats the name, and mis-filing a past role
        # as past cannot mislead an applicant about who can admit them today.
        # It is still never promoted to a current appointment.
        if not (mentions_person or opens_with_rank or is_history):
            continue

        institution = _institution_in(sentence)
        years = YEAR_RANGE.search(sentence)
        period = f"{years.group(1)}–{years.group(2)}" if years else None
        entry = {
            "rank": matched_rank.title(),
            "institution": institution,
            "period": period,
            "evidence": re.sub(r"\s+", " ", sentence)[:240],
        }
        key = (entry["rank"].lower(), (institution or "").lower())
        if key not in seen:
            seen.add(key)
            (history if is_history else current).append(entry)

        # A leadership role sits alongside the academic rank rather than
        # replacing it — "Professor of Chemistry and Director of the Institute"
        # is two facts, and the directorship is a strong seniority signal.
        if not is_history:
            for role in LEADERSHIP_ROLES:
                if role not in lowered or role == matched_rank:
                    continue
                role_key = (role, (institution or "").lower())
                if role_key in seen:
                    continue
                seen.add(role_key)
                current.append(
                    {
                        "rank": role.title(),
                        "institution": institution,
                        "period": period,
                        "evidence": re.sub(r"\s+", " ", sentence)[:240],
                        "is_leadership": True,
                    }
                )

    # Lead with the academic rank (lowest index = most senior in ACADEMIC_RANKS),
    # then leadership roles, so the dossier opens on seniority.
    current.sort(
        key=lambda item: (
            bool(item.get("is_leadership")),
            ACADEMIC_RANKS.index(item["rank"].lower())
            if item["rank"].lower() in ACADEMIC_RANKS
            else len(ACADEMIC_RANKS),
        )
    )
    return current[:6], history[:8]


def extract_education(text: str) -> list[dict[str, Any]]:
    """Degrees across regions and disciplines, not just PhD and B.Tech."""
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in DEGREE_PATTERN.finditer(text or ""):
        degree = re.sub(r"\s+", " ", match.group(1)).strip().rstrip(".")
        field_and_place = re.sub(r"\s+", " ", (match.group(2) or "")).strip(" ,.-")
        year = match.group(3)
        if not field_and_place and not year:
            continue
        if len(field_and_place) > 90:
            continue
        label = degree
        if field_and_place:
            label += f" — {field_and_place}"
        if year:
            label += f" ({year})"
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        results.append(
            {
                "degree": degree,
                "detail": field_and_place or None,
                "year": year,
                "label": label,
            }
        )
    return results[:10]


def section_text(text: str, labels: tuple[str, ...], limit: int = 600) -> str:
    """Text following the first matching section heading.

    Stops at the next heading-like token so a section does not bleed into the
    one after it. Matching is label-set based rather than tied to one site's
    exact wording.
    """
    if not text:
        return ""
    lowered = text.lower()
    best: tuple[int, str] | None = None
    for label in labels:
        index = lowered.find(label)
        if index == -1:
            continue
        if best is None or index < best[0]:
            best = (index, label)
    if best is None:
        return ""
    start = best[0] + len(best[1])
    chunk = text[start : start + limit].lstrip(" :：.-–—\n\t")
    # Cut at the next section heading if one appears.
    stops = [
        chunk.lower().find(other)
        for group in (INTEREST_LABELS, TEACHING_LABELS, SERVICE_LABELS, LAB_LABELS, GRADUATE_LABELS)
        for other in group
        if chunk.lower().find(other) > 20
    ]
    stops.extend(
        position
        for position in (chunk.find("\n\n"), chunk.lower().find("education"), chunk.lower().find("publications"))
        if position > 20
    )
    if stops:
        chunk = chunk[: min(stops)]
    return re.sub(r"\s+", " ", chunk).strip(" ,;:.-")


def extract_topics(interest_text: str) -> list[str]:
    """Topics from what the page says, not from a shipped vocabulary.

    Replaces a hardcoded eight-phrase computer-vision list that made
    ``themes: []`` the guaranteed result for every professor outside that
    subfield. Splits the labelled interests text on separators and keeps
    plausible topical phrases.
    """
    if not interest_text:
        return []
    parts = re.split(r"[;,•·•]|\s+and\s+|\s*/\s*|\s*\|\s*", interest_text)
    topics: list[str] = []
    seen: set[str] = set()
    for part in parts:
        phrase = re.sub(r"\s+", " ", part).strip(" .;:-—–")
        if not (3 <= len(phrase) <= 70):
            continue
        words = [word for word in phrase.lower().split() if word not in _STOP_TOPIC_WORDS]
        if not words:
            continue
        # A topic should read as a noun phrase, not a clause.
        if len(phrase.split()) > 8:
            continue
        key = " ".join(words)
        if key in seen:
            continue
        seen.add(key)
        topics.append(phrase)
    return topics[:12]


def extract_people(text: str, labels: tuple[str, ...]) -> list[str]:
    """Person names listed under a lab/advisee style heading."""
    from app.services.advisor_atlas.crawler import clean_person_name

    chunk = section_text(text, labels, limit=900)
    if not chunk:
        return []
    people: list[str] = []
    seen: set[str] = set()
    for part in re.split(r"[;,•·•\n]|\s{2,}", chunk):
        name = clean_person_name(part.strip())
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        people.append(name)
    return people[:15]


def extract_courses(text: str) -> list[str]:
    """Course titles, including the common '<CODE 123> Title' form."""
    courses: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"\b([A-Z]{2,5}\s?\d{3,4}[A-Z]?)\s*[:–—-]?\s*([A-Z][^.;|\n]{3,70})", text or ""):
        title = re.sub(r"\s+", " ", match.group(2)).strip(" ,.-")
        label = f"{match.group(1)} {title}"
        key = label.lower()
        if key not in seen:
            seen.add(key)
            courses.append(label)
    if not courses:
        chunk = section_text(text, TEACHING_LABELS, limit=500)
        for part in re.split(r"[;,•·•\n]", chunk):
            title = re.sub(r"\s+", " ", part).strip(" .;:-")
            if 6 <= len(title) <= 80 and title[:1].isupper():
                key = title.lower()
                if key not in seen:
                    seen.add(key)
                    courses.append(title)
    return courses[:10]


def build_enrichment(text: str, candidate_name: str) -> dict[str, Any]:
    """Career timeline, lab/advisees, and teaching/service for one source's text.

    Every field is omitted when unsupported rather than filled with a guess.
    """
    current, history = extract_positions(text, candidate_name)
    interests = section_text(text, INTEREST_LABELS)
    return {
        "current_positions": current,
        "career_history": history,
        "education": extract_education(text),
        "topics": extract_topics(interests),
        "interests_text": interests,
        "lab_members": extract_people(text, LAB_LABELS),
        "graduates": extract_people(text, GRADUATE_LABELS),
        "courses": extract_courses(text),
        "service": section_text(text, SERVICE_LABELS, limit=400),
    }
