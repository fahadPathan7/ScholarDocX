from app.services import scholarship_catalog


def test_list_catalog_zero_network_calls(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("catalog browsing must not open a network client")

    monkeypatch.setattr("httpx.AsyncClient", fail)
    monkeypatch.setattr("httpx.Client", fail)

    entries = scholarship_catalog.list_catalog()
    assert len(entries) > 0
    assert all("canonical_name" in entry for entry in entries)


def test_list_catalog_filters_by_level():
    entries = scholarship_catalog.list_catalog(levels=["phd"])
    assert entries
    assert all("phd" in [lv.lower() for lv in e["levels"]] for e in entries)


def test_list_catalog_filters_by_destination():
    entries = scholarship_catalog.list_catalog(destinations=["Germany"])
    assert entries
    assert all("germany" in [d.lower() for d in e["destinations"]] for e in entries)


def test_list_catalog_filters_by_funding_coverage():
    entries = scholarship_catalog.list_catalog(funding_coverage=["partial"])
    assert entries
    assert all(e["funding"]["coverage"] == "partial" for e in entries)


def test_list_catalog_combines_filters_with_and_semantics():
    entries = scholarship_catalog.list_catalog(levels=["master's"], destinations=["France"])
    assert entries
    for entry in entries:
        assert "master's" in [lv.lower() for lv in entry["levels"]]
        assert "france" in [d.lower() for d in entry["destinations"]]


def test_get_catalog_entry_found_and_missing():
    entry = scholarship_catalog.get_catalog_entry("chevening")
    assert entry is not None
    assert entry["canonical_name"] == "Chevening Scholarship"
    assert scholarship_catalog.get_catalog_entry("does-not-exist") is None


def test_catalog_entry_normalized_url_strips_scheme_and_www_but_keeps_path():
    entry = {"portal_url": "https://www.example.org/path"}
    assert scholarship_catalog.catalog_entry_normalized_url(entry) == "example.org/path"


def test_normalize_url_keeps_path_so_different_pages_on_one_host_differ():
    a = scholarship_catalog.normalize_url("https://example.edu/scholarships/alpha")
    b = scholarship_catalog.normalize_url("https://example.edu/scholarships/beta")
    assert a != b


def test_normalize_url_is_case_and_slash_insensitive():
    assert scholarship_catalog.normalize_url("HTTPS://Example.com/") == scholarship_catalog.normalize_url(
        "http://example.com"
    )


def test_catalog_entries_have_no_fabricated_numeric_funding_amounts():
    # Funding coverage is qualitative (full/partial); entries must not carry
    # an invented dollar amount field.
    for entry in scholarship_catalog.CATALOG:
        assert entry["funding"]["coverage"] in {"full", "partial"}
        assert "amount" not in entry["funding"]
