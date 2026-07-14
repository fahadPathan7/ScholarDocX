"""Corner-case tests for app.core.categories pure-logic functions.

Covers normalize_media_category and category_display_name edge cases:
empty/whitespace/None input, unicode, length truncation, and the display-name
fallback behavior.
"""

import pytest

from app.core.categories import category_display_name, normalize_media_category


# ── normalize_media_category ────────────────────────────────────────────────

class TestNormalizeMediaCategory:
    def test_simple_name(self):
        assert normalize_media_category("CVs") == "cvs"

    def test_multi_word_slugified(self):
        assert normalize_media_category("My Custom Docs") == "my-custom-docs"

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="required"):
            normalize_media_category("")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError):
            normalize_media_category("   ")

    def test_none_raises(self):
        # The (value or "") guard coerces None to "", which then fails the slug check.
        with pytest.raises(ValueError):
            normalize_media_category(None)

    def test_special_chars_only_raises(self):
        # Dashes and symbols are not [a-z0-9], so the slug is empty.
        with pytest.raises(ValueError):
            normalize_media_category("---")
        with pytest.raises(ValueError):
            normalize_media_category("!@#$%")

    def test_truncates_to_80_chars(self):
        long_name = "a" * 100
        result = normalize_media_category(long_name)
        assert len(result) == 80
        assert result == "a" * 80

    def test_exactly_80_chars_not_truncated(self):
        name = "a" * 80
        assert normalize_media_category(name) == "a" * 80

    def test_unicode_chars_become_separators(self):
        # é is not [a-z0-9], so it becomes a separator. Multiple separators collapse.
        result = normalize_media_category("Café & Münster!")
        assert result == "caf-m-nster"

    def test_leading_trailing_dashes_stripped(self):
        assert normalize_media_category("---hello---") == "hello"

    def test_numbers_preserved(self):
        assert normalize_media_category("Year 2026") == "year-2026"

    def test_strips_whitespace_before_processing(self):
        assert normalize_media_category("  CVs  ") == "cvs"


# ── category_display_name ───────────────────────────────────────────────────

class TestCategoryDisplayName:
    def test_normal_name_stripped(self):
        assert category_display_name("  My Category  ") == "My Category"

    def test_empty_returns_fallback(self):
        assert category_display_name("") == "Untitled category"

    def test_none_returns_fallback(self):
        assert category_display_name(None) == "Untitled category"

    def test_whitespace_only_returns_fallback(self):
        assert category_display_name("   ") == "Untitled category"

    def test_normal_name_not_modified(self):
        assert category_display_name("CVs") == "CVs"
