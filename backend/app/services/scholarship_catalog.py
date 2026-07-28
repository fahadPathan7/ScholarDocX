"""Zero-cost, code-shipped catalog of major scholarships.

SCHOLARDOCX-0176: the catalog is now static-only. The paid "Check current
cycle" action is removed; each entry ships with multiple official links,
a richer description, and tags. Entries are split into two categories:

- ``program``  — government / foundation / multilateral programs and central
                 scholarship agencies (Chevening, DAAD, Fulbright, ...).
- ``university`` — scholarships bound to a specific host institution
                 (Rhodes at Oxford, Knight-Hennessy at Stanford, ...).

Metadata is hand-authored and deliberately conservative: funding coverage is
qualitative ("full"/"partial") rather than an invented dollar amount, and
cycle months describe a *typical* application window. If a fact could not be
verified it is left empty (``cycle_months: []``) rather than guessed.

Each entry shape:
    id            str           unique slug
    category      "program" | "university"
    canonical_name str
    aliases       list[str]     used for search targeting elsewhere
    sponsor       str
    levels        list[str]     bachelor's | master's | phd | postdoctoral
    destinations  list[str]     region or country
    funding       {coverage, notes}
    cycle_months  list[str]     typical window; [] if not verified
    links         list[{label, url}]   1..N official links
    tags          list[str]     searchable keywords
    blurb         str           one-line card summary
    description   str           richer multi-sentence detail
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


from app.services.scholarship_catalog_data import CATALOG


def normalize_url(url: str) -> str:
    """Shared normalization for opportunity dedupe keys (catalog, extraction,
    bookmark migration). Keeps host + path (two different scholarship pages
    on the same domain must not collide) but drops scheme, "www.", query
    string, and fragment."""
    parsed = urlparse(url.strip().lower())
    host = (parsed.netloc or "").removeprefix("www.")
    path = parsed.path.rstrip("/") if parsed.netloc else parsed.path
    return f"{host}{path}" if host else path


def list_catalog(
    levels: Optional[List[str]] = None,
    destinations: Optional[List[str]] = None,
    funding_coverage: Optional[List[str]] = None,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Filter the static catalog. Pure function, no network calls.

    Filter params tolerate the FastAPI ``Query`` sentinel: when the endpoint
    is called directly (e.g. in tests) without FastAPI resolving defaults,
    the params arrive as the unresolved ``Query`` object rather than ``None``.
    We coerce any non-list / non-str to ``None`` so the filter is skipped.
    """
    def _as_str_list(value):
        return value if isinstance(value, list) else None

    def _as_str(value):
        return value if isinstance(value, str) else None

    entries = CATALOG
    cat = _as_str(category)
    if cat:
        wanted_cat = cat.strip().lower()
        entries = [e for e in entries if e["category"].lower() == wanted_cat]
    levels_list = _as_str_list(levels)
    if levels_list:
        wanted = {v.strip().lower() for v in levels_list}
        entries = [e for e in entries if wanted & {lv.lower() for lv in e["levels"]}]
    destinations_list = _as_str_list(destinations)
    if destinations_list:
        wanted = {v.strip().lower() for v in destinations_list}
        entries = [e for e in entries if wanted & {d.lower() for d in e["destinations"]}]
    funding_list = _as_str_list(funding_coverage)
    if funding_list:
        wanted = {v.strip().lower() for v in funding_list}
        entries = [e for e in entries if e["funding"]["coverage"].lower() in wanted]
    tags_list = _as_str_list(tags)
    if tags_list:
        wanted = {v.strip().lower() for v in tags_list}
        entries = [e for e in entries if wanted & {t.lower() for t in e["tags"]}]
    return entries


def get_catalog_entry(catalog_id: str) -> Optional[Dict[str, Any]]:
    for entry in CATALOG:
        if entry["id"] == catalog_id:
            return entry
    return None


def catalog_entry_normalized_url(entry: Dict[str, Any]) -> str:
    """Normalized URL of the entry's primary (first) link, used as the
    dedupe key against the user's opportunity library."""
    links = entry.get("links") or []
    primary = links[0]["url"] if links else ""
    return normalize_url(primary)
