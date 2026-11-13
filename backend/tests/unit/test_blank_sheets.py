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


# --- Column edits shared by the assistant and connected apps ---------------

import json

from app.services.sheet_templates import next_letter_name, rename_column_in_sheet
from app.services.ai_actions_workspace import normalize_workspace_action


def test_next_letter_name_uses_the_position_and_skips_taken_letters():
    assert next_letter_name(blank_sheet_columns()) == "F"
    assert next_letter_name([{"name": "Name", "type": "text"}, {"name": "c", "type": "text"}]) == "D"
    assert next_letter_name([{"name": "G", "type": "group"}, {"name": "A", "type": "text"}]) == "B"


def test_rename_column_moves_values_and_cell_formatting():
    columns = [{"name": "A", "type": "text"}, {"name": "B", "type": "number"}]
    rows = [
        {"A": "Oslo", "B": "1", "_height": "60", "_cellStyles": json.dumps({"A": {"bold": True}, "B": {"italic": True}})},
        {"B": "2"},
    ]
    new_columns, new_rows, old_name = rename_column_in_sheet(columns, rows, "a", "  City ")

    assert old_name == "A"
    assert new_columns == [{"name": "City", "type": "text"}, {"name": "B", "type": "number"}]
    assert new_rows[0]["City"] == "Oslo" and "A" not in new_rows[0]
    assert new_rows[0]["_height"] == "60"
    assert json.loads(new_rows[0]["_cellStyles"]) == {"City": {"bold": True}, "B": {"italic": True}}
    assert new_rows[1] == {"B": "2"}
    # Inputs are left alone.
    assert columns[0]["name"] == "A" and rows[0]["A"] == "Oslo"


def test_rename_column_leaves_a_group_with_the_same_name_alone():
    columns = [{"name": "Email", "type": "group"}, {"name": "Email", "type": "text", "group": "Email"}]
    new_columns, _, _ = rename_column_in_sheet(columns, [], "Email", "Address")
    assert new_columns == [{"name": "Email", "type": "group"}, {"name": "Address", "type": "text", "group": "Email"}]


@pytest.mark.parametrize("old,new", [("A", "b"), ("Missing", "City"), ("A", ""), ("A", "_height")])
def test_rename_column_refuses_bad_requests(old, new):
    columns = [{"name": "A", "type": "text"}, {"name": "B", "type": "text"}]
    with pytest.raises(ValueError):
        rename_column_in_sheet(columns, [], old, new)


def test_create_sheet_action_carries_columns_and_template():
    plain = normalize_workspace_action({"type": "create_sheet", "project_name": "P", "sheet": {"name": "S"}}, [])
    assert plain["sheet"] == {"name": "S"}

    shaped = normalize_workspace_action(
        {"type": "create_sheet", "project_name": "P",
         "sheet": {"name": "S", "template": "Application", "columns": ["City", {"name": "Rent", "type": "number"}]}},
        [],
    )
    assert shaped["sheet"]["template"] == "application"
    assert shaped["sheet"]["columns"] == [{"name": "City", "type": "text"}, {"name": "Rent", "type": "number"}]

    odd = normalize_workspace_action(
        {"type": "create_sheet", "project_name": "P", "sheet": {"name": "S", "template": "kanban"}}, []
    )
    assert "template" not in odd["sheet"]


def test_add_column_action_no_longer_needs_a_name():
    action = normalize_workspace_action(
        {"type": "add_column", "project_name": "P", "sheet_name": "S", "column": {}}, []
    )
    assert "missing" not in action


def test_rename_column_action_reports_what_is_missing():
    ok = normalize_workspace_action(
        {"type": "rename_column", "project_name": "P", "sheet_name": "S", "column_name": "A", "new_name": "City"}, []
    )
    assert ok["column_name"] == "A" and ok["new_name"] == "City"

    incomplete = normalize_workspace_action(
        {"type": "rename_column", "project_name": "P", "sheet_name": "S", "column_name": "A"}, []
    )
    assert incomplete["missing"] == ["new_name"]


def test_rename_column_is_available_to_connected_apps():
    from app.services.ai_actions_catalog import WORKSPACE_ACTIONS
    from app.services.connected_apps import ALLOWED_SUGGEST_ACTIONS

    assert "rename_column" in WORKSPACE_ACTIONS
    assert "rename_column" in ALLOWED_SUGGEST_ACTIONS
