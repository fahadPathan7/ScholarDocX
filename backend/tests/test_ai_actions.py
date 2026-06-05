import json

import pytest

from app.core.config import Settings
from app.db.connection import connect, initialize_database
from app.services.ai_actions import AiActionService
from app.services.store import Store


def make_store(tmp_path):
    database_path = tmp_path / "app.db"
    initialize_database(database_path)
    connection = connect(database_path)
    return Store(connection), connection


@pytest.mark.asyncio
async def test_action_plan_ignores_ordinary_chat(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        settings = Settings()
        settings.glm_api_key = ""
        settings.gemini_api_key = ""
        settings.groq_api_key = ""
        service = AiActionService(settings, store)

        response = await service.plan("What can you help me research?")

        assert response["status"] == "no_action"
        assert response["actions"] == []
    finally:
        connection.close()


@pytest.mark.asyncio
async def test_action_plan_asks_for_missing_sheet_details(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        settings = Settings()
        settings.glm_api_key = ""
        settings.gemini_api_key = ""
        settings.groq_api_key = ""
        service = AiActionService(settings, store)

        response = await service.plan("Create a new sheet")

        assert response["status"] == "needs_info"
        assert "project_name" in response["missing"]
        assert "sheet_name" in response["missing"]
    finally:
        connection.close()


def test_action_execute_creates_project_sheet_rows_and_note(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        settings = Settings()
        service = AiActionService(settings, store)
        plan = {
            "status": "needs_confirmation",
            "actions": [
                {
                    "type": "create_project",
                    "project": {
                        "name": "Canada PhD 2027",
                        "degree_type": "phd",
                        "intake_term": "Fall 2027",
                        "status": "Active",
                        "description": "AI-created project",
                    },
                },
                {
                    "type": "create_sheet",
                    "project_name": "Canada PhD 2027",
                    "sheet": {"name": "Professor shortlist"},
                },
                {
                    "type": "add_rows",
                    "project_name": "Canada PhD 2027",
                    "sheet_name": "Professor shortlist",
                    "rows": [
                        {
                            "University name": "University of Toronto",
                            "Professor name": "Dr. Example",
                            "Email": "prof@example.edu",
                            "Status": "Researching",
                        }
                    ],
                },
                {
                    "type": "create_sticky_note",
                    "note": {
                        "title": "Canada TODO",
                        "body": "Check funding pages.",
                        "color": "mint",
                        "is_checklist": True,
                        "checklist_items": ["Verify deadlines", "Draft outreach"],
                    },
                },
            ],
        }

        response = service.execute(plan)
        projects = store.list_records("projects")
        project = next(item for item in projects if item["name"] == "Canada PhD 2027")
        summary = store.project_summary(project["id"])
        page = summary["pages"][0]
        notes = store.list_records("sticky_notes")

        assert response["status"] == "done"
        assert summary["sheets"][0]["name"] == "Professor shortlist"
        assert page["rows"][0]["University name"] == "University of Toronto"
        assert page["rows"][0]["Professor name"] == "Dr. Example"
        assert notes[0]["title"] == "Canada TODO"
        checklist = json.loads(notes[0]["checklist_json"])
        assert [item["text"] for item in checklist] == ["Verify deadlines", "Draft outreach"]
    finally:
        connection.close()
