"""Retrieval policy for Research Expert paper analysis (SCHOLARDOCX-0192).

Pure decision logic, extracted from `research_paper_service.py` so it can be
reasoned about and tested without a database: which passages of a paper should
be put in front of the model for a given question, and which of them must
survive the final budget.

The service still owns the queries — these functions only decide.
"""

from __future__ import annotations

import re
from typing import Any


# Capturing, because the classifier reads the numbers themselves (a real
# bibliography ascends), not just how many there are.
CITATION_MARKER = re.compile(r"\[(\d{1,3})\]")
REFERENCE_HEADING = re.compile(r"\b(REFERENCES|BIBLIOGRAPHY|WORKS CITED)\b", re.IGNORECASE)

# Questions that need the bibliography itself rather than passages that happen
# to discuss related work.
REFERENCE_QUERY_TERMS = (
    "reference", "references", "citation", "citations", "bibliography",
    "cited", "cites", "works cited",
)

# Question keyword -> section words that must be considered even when cosine
# distance alone would not surface them.
SECTION_TERM_MAP: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (
        ("limitation", "weakness", "drawback", "risk"),
        ("limitation", "discussion", "drawback"),
    ),
    (
        ("future", "direction", "open question"),
        ("future", "conclusion", "direction"),
    ),
    (
        ("conclusion", "summary"),
        ("conclusion", "discussion"),
    ),
    (
        ("method", "experiment", "setup", "dataset", "architecture"),
        ("methodology", "method", "experimental", "dataset", "architecture"),
    ),
)


# --- Ranking within one document -------------------------------------------
#
# Cosine similarity is a poor discriminator *inside a single paper*: every
# passage shares the paper's vocabulary, topic and writing style, so scores
# bunch into a narrow band (a real run returned 0.56 and 0.57 for an
# acknowledgements paragraph and a garbled pseudo-code listing, against a best
# match barely above them). The absolute number therefore says almost nothing,
# and small differences in it are noise rather than signal.
#
# Term overlap breaks the tie. A question about citations is far better served
# by a passage containing the word "references" than by one that merely sits in
# the same semantic neighbourhood.

QUERY_STOPWORDS = frozenset(
    """
    a an the this that these those there here and or but if then else of in on
    at to for from by with without into over under about as is are was were be
    been being do does did doing have has had having what which who whom whose
    when where why how many much more most some any all both each few other
    can could should would may might will shall must it its it's they them
    their you your we our us i me my he she his her not no nor so than too very
    show tell give list explain describe paper study article does
    """.split()
)

# How much a full term-overlap match may add to a cosine score. Deliberately
# small: it reorders passages that cosine cannot separate, it does not overrule
# a genuinely strong semantic match.
LEXICAL_WEIGHT = 0.30

_WORD = re.compile(r"[a-z0-9]+")


def query_terms(query: str) -> set[str]:
    """Content words worth matching literally."""
    return {
        token
        for token in _WORD.findall((query or "").lower())
        if len(token) > 2 and token not in QUERY_STOPWORDS
    }


def lexical_overlap(chunk_text: str, terms: set[str]) -> float:
    """Fraction of the question's content words present in this passage."""
    if not terms:
        return 0.0
    text = (chunk_text or "").lower()
    hits = sum(
        1
        for term in terms
        if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text)
    )
    return hits / len(terms)


def rank_score(similarity: float, chunk_text: str, terms: set[str]) -> float:
    """Cosine plus a bounded literal-overlap bonus."""
    return float(similarity or 0.0) + LEXICAL_WEIGHT * lexical_overlap(chunk_text, terms)


# The model is told to cite passages as "[Section #N]", where N is the section
# number shown in that passage's block header (chunk_index + 1).
ANSWER_CITATION = re.compile(r"\[Section\s*#\s*(\d{1,4})\]", re.IGNORECASE)


def cited_section_numbers(answer: str) -> set[int]:
    """Which passages the answer actually leaned on.

    SCHOLARDOCX-0194: every retrieved passage was listed under the answer, so a
    reply citing three of them still showed ten. That reads as "the answer used
    all of this", when most of it was searched and set aside — and it hides the
    three that carry the claim among seven that do not.
    """
    return {int(match.group(1)) for match in ANSWER_CITATION.finditer(answer or "")}


def relevance_label(score: float, best: float, worst: float) -> str:
    """Where this passage stands *within this retrieval*.

    Rendering raw cosine as "Relevance: 56%" told the user a passage was
    moderately relevant when 56% was, for this paper and this question,
    indistinguishable from the floor. A position within the returned set is a
    claim the number can actually support.
    """
    if best <= worst:
        return "Top match"
    position = (score - worst) / (best - worst)
    if position >= 0.75:
        return "Top match"
    if position >= 0.4:
        return "Close match"
    return "Weak match"


# --- Whole-document questions ----------------------------------------------
#
# "How many figures are in this paper?", "how many papers were cited here?",
# "list all the tables" are *aggregate* questions: they are about the document
# as a whole, so no sample of it can answer them. Top-k retrieval will always
# return a subset, the model will always be able to see only part of the
# numbering, and the honest answer it can give from that is the one the user
# kept getting — "at least 4 … the true total cannot be determined".
#
# These do not need a model to answer at all. The numbering is a pattern, so
# the inventory is counted across every passage and handed over as fact.

AGGREGATE_CUES = (
    "how many", "how much", "number of", "count", "total", "all of the",
    "list all", "list the", "list every", "every ", " each ", "overall",
    "altogether", "in total", "complete list", "full list", "enumerate",
)

# target -> (question words, numbering pattern, plural noun for the note)
# `(?!\d)` matters: without it "published in Figure 2024" yields figure 202,
# because a bounded {1,3} happily matches the first three digits of a year.
INVENTORY_TARGETS: dict[str, tuple[tuple[str, ...], "re.Pattern[str]", str]] = {
    "figure": (
        ("figure", "figures", "fig.", "figs", "diagram", "diagrams", "chart", "charts"),
        re.compile(r"\bfig(?:ure)?s?\.?\s*(\d{1,3})(?!\d)", re.IGNORECASE),
        "figures",
    ),
    "table": (
        ("table", "tables"),
        re.compile(r"\btable\s*(\d{1,3})(?!\d)", re.IGNORECASE),
        "tables",
    ),
    "equation": (
        ("equation", "equations", "formula", "formulas", "formulae"),
        re.compile(
            r"\b(?:eq(?:uation)?s?\.?|formula)\s*\(?(\d{1,3})(?!\d)\)?",
            re.IGNORECASE,
        ),
        "equations",
    ),
    "algorithm": (
        ("algorithm", "algorithms", "pseudocode", "pseudo-code"),
        re.compile(r"\balgorithms?\s*(\d{1,3})(?!\d)", re.IGNORECASE),
        "algorithms",
    ),
    "reference": (
        REFERENCE_QUERY_TERMS,
        re.compile(r"\[(\d{1,3})(?!\d)\]"),
        "cited works",
    ),
}


def detect_inventory_target(query: str) -> str | None:
    """Which numbered thing this question wants counted, if any.

    Requires both a target word and an aggregate cue, so "what does Figure 3
    show?" still goes through ordinary semantic retrieval — that one really is
    about a passage, not about the document.
    """
    lowered = (query or "").lower()
    if not any(cue in lowered for cue in AGGREGATE_CUES):
        return None
    for target, (words, _pattern, _noun) in INVENTORY_TARGETS.items():
        if any(word in lowered for word in words):
            return target
    return None


def scan_inventory(
    passages: list[tuple[Any, str]],
    target: str,
) -> dict[str, Any]:
    """Count a numbered series across the whole document.

    `passages` is (identifier, text) for **every** passage of the paper, not a
    retrieved subset — that is the entire point. Returns the distinct numbers
    seen, in order, plus the identifiers of the passages that carry the most of
    them so the caller can put those in front of the model as corroboration.
    """
    _words, pattern, noun = INVENTORY_TARGETS[target]
    seen: set[int] = set()
    per_passage: list[tuple[int, Any]] = []
    for identifier, text in passages:
        found = {int(match) for match in pattern.findall(text or "")}
        # Guard against a stray four-digit year or a page number sneaking in as
        # "Figure 2019"; a paper does not have a 300th figure.
        found = {number for number in found if 1 <= number <= 300}
        if found:
            seen |= found
            per_passage.append((len(found), identifier))
    per_passage.sort(key=lambda pair: pair[0], reverse=True)
    return {
        "target": target,
        "noun": noun,
        "numbers": sorted(seen),
        "count": len(seen),
        "evidence_ids": [identifier for _size, identifier in per_passage],
    }


def inventory_note(inventory: dict[str, Any]) -> str:
    """The coverage statement handed to the model alongside the passages."""
    numbers = inventory["numbers"]
    noun = inventory["noun"]
    if not numbers:
        return (
            f"DOCUMENT-WIDE SCAN: no numbered {noun} were found anywhere in the "
            "paper's extracted text. Say so plainly rather than guessing."
        )
    listed = ", ".join(str(number) for number in numbers[:60])
    note = (
        f"DOCUMENT-WIDE SCAN (computed over EVERY passage of the paper, not a "
        f"sample): {inventory['count']} distinct {noun} are referenced — "
        f"numbered {listed}. This count is authoritative for the extracted "
        f"text: state it directly and do NOT claim the sections are partial or "
        f"that the total cannot be determined."
    )
    present = set(numbers)
    gaps = [
        number
        for number in range(numbers[0], numbers[-1] + 1)
        if number not in present
    ]
    # Only worth mentioning on a series that is otherwise dense. On a sparse or
    # outlier-skewed one, "numbers 10–29 never appear" is noise, not a finding.
    if gaps and len(gaps) < inventory["count"]:
        note += (
            f" Numbers {', '.join(str(number) for number in gaps[:20])} never "
            "appear in the text; mention this gap only if the user asks why."
        )
    return note


# A bibliography entry is short: "[12] A. Author, Title, Journal 11 (2025) 1–14,
# https://doi.org/…". Body prose runs far longer between citations, even when it
# cites densely.
MAX_CHARS_PER_REFERENCE_ENTRY = 400
BIBLIOGRAPHIC_MARKERS = re.compile(r"doi\.org|https?://|\bdoi:", re.IGNORECASE)


def is_reference_chunk(chunk_text: str) -> bool:
    """Is this passage part of the reference list rather than the body?

    An explicit heading settles it. Otherwise the test is *density and order*,
    not a raw count of citation markers.

    SCHOLARDOCX-0194: the previous rule — four or more bracketed numbers — was
    far too loose, and became visible once passages started being labelled in
    the UI. A related-work paragraph cites four works in a sentence; a results
    table comparing prior methods carries [35] and [36] beside every row. Both
    were being labelled "Reference list" to the user, alongside genuine
    bibliography pages.

    Two things separate a real reference list:

    * **Density** — entries are short, so markers come every few hundred
      characters. Prose puts far more text between them.
    * **Order** — a numbered bibliography ascends, [1] [2] [3]. Prose cites in
      whatever order the argument needs and repeats earlier works.
    """
    text = chunk_text or ""
    if REFERENCE_HEADING.search(text[:150]):
        return True

    found = list(CITATION_MARKER.finditer(text))
    markers = [int(match.group(1)) for match in found]
    if len(markers) < 4:
        return False

    if len(text) / len(markers) > MAX_CHARS_PER_REFERENCE_ENTRY:
        return False

    # In a bibliography every marker *opens* an entry, so it follows a line
    # break or a space. A results table comparing prior methods writes
    # "Sanidaetal.[35]" — dense, ascending, and attached to the author name.
    # That table was the last thing still being labelled "Reference list".
    entry_initial = sum(
        1
        for match in found
        if match.start() == 0 or text[match.start() - 1].isspace()
    )
    if entry_initial < len(markers) * 0.6:
        return False

    ascending = sum(
        1 for first, second in zip(markers, markers[1:]) if second > first
    )
    if ascending < len(markers) - 1:
        # Allow one break: a chunk boundary can start mid-entry.
        if ascending < len(markers) - 2:
            return False

    # Density and order together are already strong. A DOI or URL on top of
    # them makes it certain; without one, require the run to be a clean
    # ascending sequence rather than merely mostly ascending.
    if BIBLIOGRAPHIC_MARKERS.search(text):
        return True
    return ascending == len(markers) - 1


def wants_reference_section(query: str) -> bool:
    """Does this question need the bibliography retrieved as a unit?"""
    lowered = (query or "").lower()
    return any(term in lowered for term in REFERENCE_QUERY_TERMS)


def section_terms_for(query: str) -> list[str]:
    """Section words worth guaranteeing for this question."""
    lowered = (query or "").lower()
    terms: list[str] = []
    for triggers, section_words in SECTION_TERM_MAP:
        if any(trigger in lowered for trigger in triggers):
            terms.extend(section_words)
    return terms


def reference_budget(top_k: int) -> int:
    """How many passages the bibliography may claim.

    Leaves at least two slots for body context so the model can still tell what
    kind of paper it is answering about.
    """
    return max(top_k - 2, 4)


def apply_retrieval_budget(
    chunks: list[dict[str, Any]],
    top_k: int,
    query: str = "",
) -> list[dict[str, Any]]:
    """Trim to `top_k` by relevance, then restore reading order.

    Ranking is cosine plus literal term overlap (`rank_score`), because cosine
    alone cannot separate passages of the same paper. Each survivor is labelled
    with its standing inside the returned set.

    Passages retrieved *structurally* (the bibliography, when the question is
    about references) are exempt from the trim. They have to be: a reference
    entry is semantically bland, so it scores far below prose against any
    natural-language question and would be dropped by the very step that
    follows the retrieval which deliberately fetched it.

    This is also why their `similarity_score` stays the real measured value.
    Writing a flattering number instead would reproduce the fabricated
    "Relevance: 85%" badge this area was already fixed for once.
    """
    terms = query_terms(query)
    for item in chunks:
        item["rank_score"] = rank_score(
            item.get("similarity_score", 0.0),
            item.get("chunk_text", ""),
            terms,
        )
        item["lexical_overlap"] = round(
            lexical_overlap(item.get("chunk_text", ""), terms), 4
        )

    protected = [item for item in chunks if item.get("retrieval") == "reference_section"]
    rest = [item for item in chunks if item.get("retrieval") != "reference_section"]
    rest.sort(key=lambda item: item.get("rank_score", 0.0), reverse=True)
    selected = protected + rest[: max(0, top_k - len(protected))]

    if selected:
        scores = [item.get("rank_score", 0.0) for item in selected]
        best, worst = max(scores), min(scores)
        for item in selected:
            item["relevance_label"] = (
                # The bibliography was fetched because it was asked for, not
                # because it scored well. Saying "Weak match" beside it would
                # be as wrong as the percentage was.
                "Reference list"
                if item.get("retrieval") == "reference_section"
                else relevance_label(item.get("rank_score", 0.0), best, worst)
            )

    selected.sort(key=lambda item: item.get("chunk_index", 0))
    return selected
