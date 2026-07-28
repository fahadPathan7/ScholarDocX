"""Unit tests for the static scholarship catalog (SCHOLARDOCX-0176).

Validates catalog data integrity (every entry has the required schema, links
are non-empty, categories are valid, no duplicate IDs) and the filtering /
lookup helpers. Also confirms the catalog makes zero network calls (the
paid check-cycle action was removed in SCHOLARDOCX-0176).
"""
from app.services import scholarship_catalog
from app.services.scholarship_catalog import (
    CATALOG,
    catalog_entry_normalized_url,
    get_catalog_entry,
    list_catalog,
    normalize_url,
)


REQUIRED_FIELDS = {
    "id",
    "category",
    "canonical_name",
    "aliases",
    "sponsor",
    "levels",
    "destinations",
    "funding",
    "cycle_months",
    "links",
    "tags",
    "blurb",
    "description",
}
VALID_CATEGORIES = {"program", "university"}
VALID_LEVELS = {"bachelor's", "master's", "phd", "postdoctoral", "short course"}
VALID_COVERAGE = {"full", "partial"}


def test_list_catalog_zero_network_calls(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("catalog browsing must not open a network client")

    monkeypatch.setattr("httpx.AsyncClient", fail)
    monkeypatch.setattr("httpx.Client", fail)

    entries = list_catalog()
    assert len(entries) > 0
    assert all("canonical_name" in entry for entry in entries)


def test_catalog_has_meaningful_size_after_expansion():
    assert len(CATALOG) >= 40, "catalog should have at least 40 entries after SCHOLARDOCX-0176 expansion"


def test_every_entry_has_required_fields():
    for entry in CATALOG:
        missing = REQUIRED_FIELDS - set(entry.keys())
        assert not missing, f"{entry['id']} missing fields: {missing}"


def test_every_entry_has_valid_category():
    for entry in CATALOG:
        assert entry["category"] in VALID_CATEGORIES, (
            f"{entry['id']} has bad category: {entry['category']}"
        )


def test_every_entry_has_at_least_one_link_with_label_and_absolute_url():
    for entry in CATALOG:
        assert isinstance(entry["links"], list) and len(entry["links"]) >= 1, (
            f"{entry['id']} must have at least one link"
        )
        for link in entry["links"]:
            assert isinstance(link, dict), f"{entry['id']} link is not a dict"
            assert "label" in link and "url" in link, (
                f"{entry['id']} link missing label/url: {link}"
            )
            assert link["url"].startswith(("http://", "https://")), (
                f"{entry['id']} link url is not absolute: {link['url']}"
            )


def test_every_entry_has_tags_list():
    for entry in CATALOG:
        assert isinstance(entry["tags"], list), f"{entry['id']} tags is not a list"
        assert len(entry["tags"]) >= 1, f"{entry['id']} must have at least one tag"


def test_every_entry_has_valid_levels():
    for entry in CATALOG:
        assert isinstance(entry["levels"], list) and len(entry["levels"]) >= 1, (
            f"{entry['id']} must have at least one level"
        )
        for level in entry["levels"]:
            assert level.lower() in VALID_LEVELS, (
                f"{entry['id']} has bad level: {level}"
            )


def test_every_entry_has_valid_funding_coverage_and_no_fabricated_amount():
    for entry in CATALOG:
        coverage = entry["funding"]["coverage"].lower()
        assert coverage in VALID_COVERAGE, (
            f"{entry['id']} has bad funding coverage: {coverage}"
        )
        assert "amount" not in entry["funding"], (
            f"{entry['id']} must not carry an invented numeric amount"
        )


def test_no_duplicate_ids():
    ids = [entry["id"] for entry in CATALOG]
    assert len(ids) == len(set(ids)), (
        f"duplicate ids: {set([i for i in ids if ids.count(i) > 1])}"
    )


def test_both_categories_are_populated():
    """SCHOLARDOCX-0176: both sections must have meaningful content."""
    program = [e for e in CATALOG if e["category"] == "program"]
    university = [e for e in CATALOG if e["category"] == "university"]
    assert len(program) >= 20, f"program section thin: {len(program)}"
    assert len(university) >= 15, f"university section thin: {len(university)}"


def test_list_catalog_filters_by_category():
    program = list_catalog(category="program")
    university = list_catalog(category="university")
    assert all(e["category"] == "program" for e in program)
    assert all(e["category"] == "university" for e in university)
    assert len(program) + len(university) == len(CATALOG)


def test_list_catalog_category_is_case_insensitive():
    assert len(list_catalog(category="PROGRAM")) == len(list_catalog(category="program"))


def test_list_catalog_filters_by_levels():
    phd_only = list_catalog(levels=["phd"])
    assert phd_only
    for entry in phd_only:
        assert "phd" in [lv.lower() for lv in entry["levels"]]


def test_list_catalog_filters_by_destinations():
    entries = list_catalog(destinations=["Germany"])
    assert entries
    for entry in entries:
        assert "germany" in [d.lower() for d in entry["destinations"]]


def test_list_catalog_filters_by_funding_coverage():
    entries = list_catalog(funding_coverage=["partial"])
    assert entries
    for entry in entries:
        assert entry["funding"]["coverage"] == "partial"


def test_list_catalog_filters_by_tags():
    stem = list_catalog(tags=["stem"])
    assert stem
    for entry in stem:
        assert "stem" in [t.lower() for t in entry["tags"]]


def test_list_catalog_combines_filters_with_and_semantics():
    entries = list_catalog(levels=["master's"], destinations=["France"])
    assert entries
    for entry in entries:
        assert "master's" in [lv.lower() for lv in entry["levels"]]
        assert "france" in [d.lower() for d in entry["destinations"]]


def test_list_catalog_category_plus_level_combines():
    result = list_catalog(category="university", levels=["phd"])
    for entry in result:
        assert entry["category"] == "university"
        assert "phd" in [lv.lower() for lv in entry["levels"]]


def test_list_catalog_no_filters_returns_everything():
    assert len(list_catalog()) == len(CATALOG)


def test_get_catalog_entry_finds_by_id():
    entry = get_catalog_entry("chevening")
    assert entry is not None
    assert entry["canonical_name"] == "Chevening Scholarship"


def test_get_catalog_entry_returns_none_for_unknown_id():
    assert get_catalog_entry("does-not-exist") is None


def test_catalog_entry_normalized_url_uses_primary_link():
    entry = get_catalog_entry("gates-cambridge")
    normalized = catalog_entry_normalized_url(entry)
    # Primary link is https://www.gatescambridge.org -> gatescambridge.org
    assert normalized == "gatescambridge.org"


def test_normalize_url_strips_scheme_and_www_but_keeps_path():
    assert normalize_url("https://www.example.org/path") == "example.org/path"
    assert normalize_url("http://example.com") == "example.com"
    assert normalize_url("HTTPS://WWW.Example.Com/Path/?q=1#frag") == "example.com/path"


def test_normalize_url_keeps_path_so_different_pages_on_one_host_differ():
    a = normalize_url("https://example.edu/scholarships/alpha")
    b = normalize_url("https://example.edu/scholarships/beta")
    assert a != b
