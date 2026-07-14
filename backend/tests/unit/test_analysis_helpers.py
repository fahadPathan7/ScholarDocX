"""Corner-case tests for advisor_atlas.analysis pure-logic helpers.

Covers extract_json_object and tokenize — both have zero direct test coverage.
extract_json_object has a known limitation: multiple JSON objects in one string
return None (documented here, not fixed — fixing is a separate task).
"""

import pytest

from app.services.advisor_atlas.analysis import extract_json_object, tokenize


# ── extract_json_object ─────────────────────────────────────────────────────

class TestExtractJsonObject:
    def test_empty_string_returns_none(self):
        assert extract_json_object("") is None

    def test_no_braces_returns_none(self):
        assert extract_json_object("no json here") is None

    def test_array_returns_none(self):
        # Valid JSON but not a dict — the isinstance check rejects it.
        assert extract_json_object("[1, 2, 3]") is None

    def test_empty_object(self):
        assert extract_json_object("{}") == {}

    def test_simple_object(self):
        assert extract_json_object('{"a": 1}') == {"a": 1}

    def test_nested_object(self):
        assert extract_json_object('{"nested": {"deep": true}}') == {
            "nested": {"deep": True}
        }

    def test_text_wrapped_object(self):
        text = 'Here is the result: {"name": "MIT", "rank": 1} done.'
        assert extract_json_object(text) == {"name": "MIT", "rank": 1}

    def test_object_with_brace_in_string_value(self):
        # A } inside a string literal; rfind still finds the real closing brace.
        text = '{"key": "value with } brace"}'
        assert extract_json_object(text) == {"key": "value with } brace"}

    def test_multiple_objects_returns_none(self):
        # KNOWN LIMITATION: rfind("}") grabs the last }, so json.loads sees
        # '{"a": 1} {"b": 2}' which is invalid JSON → None instead of the first
        # object. This documents current behavior; fixing is a follow-up.
        result = extract_json_object('{"a": 1} {"b": 2}')
        assert result is None

    def test_malformed_json_returns_none(self):
        assert extract_json_object("{invalid}") is None


# ── tokenize ────────────────────────────────────────────────────────────────

class TestTokenize:
    def test_empty_string(self):
        assert tokenize("") == set()

    def test_all_stopwords_returns_empty(self):
        assert tokenize("the and for with from that this") == set()

    def test_two_char_token_excluded(self):
        # Regex requires [a-z0-9][a-z0-9+-]{2,} — minimum 3 chars.
        assert tokenize("ab") == set()

    def test_exactly_three_chars_included(self):
        assert tokenize("abc") == {"abc"}

    def test_ai_excluded_as_two_chars(self):
        # "ai" after lowercasing is 2 chars — below the 3-char minimum.
        assert tokenize("AI") == set()

    def test_plus_in_token(self):
        # The + is in the regex character class, so c++ is one token.
        result = tokenize("C++ programming")
        assert "c++" in result
        assert "programming" in result

    def test_hyphenated_term_is_single_token(self):
        # The - is in the regex character class, so machine-learning is one token.
        result = tokenize("machine-learning")
        assert "machine-learning" in result

    def test_stopwords_removed(self):
        result = tokenize("machine learning research")
        assert "machine" in result
        assert "learning" in result
        # "research" is in the stopword set
        assert "research" not in result

    def test_mixed_case_lowercased(self):
        result = tokenize("MIT Stanford")
        assert "mit" in result
        assert "stanford" in result

    def test_numbers_preserved(self):
        result = tokenize("2026 deadline")
        assert "2026" in result
        assert "deadline" in result
