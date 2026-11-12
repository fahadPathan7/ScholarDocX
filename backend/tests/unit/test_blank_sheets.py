"""Starting columns for a new sheet (SCHOLARDOCX-0259).

Pure functions only, so no database is touched.
"""

import pytest

from app.services.sheet_templates import (
    MAX_COLUMN_NAME_LENGTH,
    MAX_SHEET_COLUMNS,
    blank_sheet_columns,
    clean_sheet_columns,
    column_letter,
)
from app.services.ai_actions_workspace import normalize_degree


def test_column_letter_follows_spreadsheet_order():
    assert [column_letter(i) for i in range(3)] == ["A", "B", "C"]
    assert column_letter(25) == "Z"
    assert column_letter(26) == "AA"
    assert column_letter(27) == "AB"
    assert column_letter(51) == "AZ"
    assert column_letter(52) == "BA"
    assert column_letter(701) == "ZZ"
    assert column_letter(702) == "AAA"


def test_blank_sheet_is_five_lettered_text_columns():
    columns = blank_sheet_columns()
    assert [c["name"] for c in columns] == ["A", "B", "C", "D", "E"]
    assert {c["type"] for c in columns} == {"text"}


def test_blank_sheet_columns_are_fresh_objects_each_call():
    first = blank_sheet_columns()
    first[0]["name"] = "Changed"
    assert blank_sheet_columns()[0]["name"] == "A"


def test_clean_sheet_columns_keeps_known_fields_and_drops_the_rest():
    cleaned = clean_sheet_columns([
        {"name": "  Title  ", "type": "text", "width": 200.0, "surprise": "x"},
        {"name": "Stage", "type": "select", "options": ["A", "", "B"], "unique": True},
        {"name": "Details", "type": "group", "color": "#2f6d7a"},
        {"name": "Note", "group": "Details"},
    ])
    assert cleaned == [
        {"name": "Title", "type": "text", "width": 200},
        {"name": "Stage", "type": "select", "options": ["A", "B"], "unique": True},
        {"name": "Details", "type": "group", "color": "#2f6d7a"},
        {"name": "Note", "type": "text", "group": "Details"},
    ]


def test_clean_sheet_columns_truncates_long_names():
    cleaned = clean_sheet_columns([{"name": "x" * 80, "type": "text"}])
    assert len(cleaned[0]["name"]) == MAX_COLUMN_NAME_LENGTH


def test_a_group_may_share_a_name_with_a_data_column():
    # The grid allows an "Email" group that contains an "Email" column.
    cleaned = clean_sheet_columns([
        {"name": "Email", "type": "group"},
        {"name": "Email", "type": "text", "group": "Email"},
    ])
    assert len(cleaned) == 2


@pytest.mark.parametrize(
    "bad",
    [
        None,
        [],
        "A,B,C",
        ["A", "B"],
        [{"name": "", "type": "text"}],
        [{"name": "   ", "type": "text"}],
        [{"name": "A", "type": "formula"}],
        [{"name": "A", "type": "text"}, {"name": "A", "type": "number"}],
        [{"name": f"c{i}", "type": "text"} for i in range(MAX_SHEET_COLUMNS + 1)],
    ],
)
def test_clean_sheet_columns_rejects_broken_input(bad):
    with pytest.raises(ValueError):
        clean_sheet_columns(bad)


def test_boolean_width_is_not_mistaken_for_a_number():
    cleaned = clean_sheet_columns([{"name": "A", "type": "text", "width": True}])
    assert "width" not in cleaned[0]


def test_normalize_degree_leaves_an_unlabelled_project_unlabelled():
    assert normalize_degree("") == ""
    assert normalize_degree(None) == ""
    assert normalize_degree("MSc") == "masters"
    assert normalize_degree("undergrad") == "bachelors"
    assert normalize_degree("PhD") == "phd"
