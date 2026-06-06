from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.categories import normalize_media_category
from app.core.config import Settings, get_settings
from app.core.workspace import ensure_workspace, save_upload, workspace_status
from app.db.connection import connect, initialize_database
from app.services.ai import AiService
from app.services.ai_actions import AiActionService
from app.services.store import Store
from app.auth.dependencies import get_current_user
from app.api.dependencies import get_store
from app.auth.dependencies import get_user_store


router = APIRouter()


def verify_model_permission(model: Optional[str], current_user: dict, connection):
    from app.auth.limits import check_and_increment_limit
    if not model:
        return # AiService will pick a default, could add stricter checks here later
    
    provider = "glm"
    model_lower = model.lower()
    if ":" in model_lower:
        provider = model_lower.split(":")[0]
    elif model_lower.startswith("gemini-"):
        provider = "gemini"
    elif model_lower.startswith("mistral") or model_lower.startswith("devstral") or model_lower.startswith("pixtral") or model_lower.startswith("ministral"):
        provider = "mistral"
    elif model_lower.startswith("llama") or model_lower.startswith("qwen") or model_lower.startswith("mixtral") or model_lower.startswith("openai/") or model_lower.startswith("meta-llama/") or model_lower.startswith("groq/"):
        provider = "groq"
        
    feature_name = f"can_use_{provider}"
    check_and_increment_limit(current_user, feature_name, 0, connection)


class Payload(BaseModel):
    data: dict[str, Any]


class RenderPayload(BaseModel):
    variables: dict[str, Any] = {}


class OutreachPayload(BaseModel):
    data: dict[str, Any]
    follow_up_days: Optional[int] = None


class AiPayload(BaseModel):
    message: str
    context: str = ""
    model: Optional[str] = None
    background_model: Optional[str] = None
    web_search_max_results: int = 2
    web_search_max_chars: int = 300


class SummarizePayload(BaseModel):
    text: str
    model: Optional[str] = None


class AiActionPlanPayload(BaseModel):
    message: str
    context: str = ""
    model: Optional[str] = None


class AiActionExecutePayload(BaseModel):
    plan: dict[str, Any]


class SheetPayload(BaseModel):
    name: str = "Application sheet"


class CategoryPayload(BaseModel):
    name: str


@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    return {"status": "ok", "workspace": workspace_status(settings)}


@router.post("/workspace/init")
def init_workspace(settings: Settings = Depends(get_settings)) -> dict:
    status = ensure_workspace(settings)
    initialize_database(settings.database_path)
    return status


@router.get("/workspace/status")
def get_workspace_status(settings: Settings = Depends(get_settings)) -> dict:
    return workspace_status(settings)


@router.get("/dashboard/summary")
def dashboard_summary(store: Store = Depends(get_user_store)) -> dict:
    return store.dashboard_summary()


@router.get("/projects/{project_id}/summary")
def project_summary(project_id: int, store: Store = Depends(get_user_store)) -> dict:
    try:
        return store.project_summary(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/projects/{project_id}/sheets")
def create_project_sheet(
    project_id: int, 
    payload: SheetPayload, 
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    from app.auth.limits import check_and_increment_limit
    check_and_increment_limit(current_user, "total_sheets", 1, store.connection)
    check_and_increment_limit(current_user, "sheets_per_project", 1, store.connection)
    try:
        return store.create_sheet_with_defaults(project_id, payload.name)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/document_categories")
def list_document_categories(store: Store = Depends(get_user_store)) -> list[dict]:
    return store.document_categories()


@router.post("/document_categories")
def create_document_category(payload: CategoryPayload, store: Store = Depends(get_user_store)) -> dict:
    try:
        return store.create_document_category(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Category already exists") from exc


@router.patch("/document_categories/{category_id}")
def rename_document_category(category_id: int, payload: CategoryPayload, store: Store = Depends(get_user_store)) -> dict:
    try:
        return store.rename_document_category(category_id, payload.name)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Category already exists") from exc


@router.delete("/document_categories/{category_id}")
def delete_document_category(
    category_id: int,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
) -> dict:
    try:
        return store.delete_document_category(category_id, settings.workspace_path, settings.media_path)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _crud_routes(table: str):
    @router.get(f"/{table}")
    def list_records(store: Store = Depends(get_user_store), table_name: str = table) -> list[dict]:
        return store.list_records(table_name)

    @router.post(f"/{table}")
    def create_record(
        payload: Payload, 
        store: Store = Depends(get_user_store), 
        current_user: dict = Depends(get_current_user),
        table_name: str = table
    ) -> dict:
        feature_map = {
            "projects": "total_projects",
            "project_sheets": "total_sheets",
            "sticky_notes": "total_sticky_notes",
            "whiteboards": "total_whiteboards"
        }
        
        feature = feature_map.get(table_name)
        if feature:
            from app.auth.limits import check_and_increment_limit
            check_and_increment_limit(current_user, feature, 1, store.connection)
            
        try:
            return store.create_record(table_name, payload.data)
        except (ValueError, LookupError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.patch(f"/{table}" + "/{record_id}")
    def update_record(
        record_id: int,
        payload: Payload,
        store: Store = Depends(get_user_store),
        table_name: str = table,
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        if table_name == "project_pages" and "rows_json" in payload.data:
            import json
            from app.auth.limits import check_and_increment_limit
            old_record = store.connection.execute("SELECT rows_json FROM project_pages WHERE id = ?", (record_id,)).fetchone()
            if old_record:
                old_rows = json.loads(old_record["rows_json"] or "[]")
                new_rows = payload.data["rows_json"]
                if isinstance(new_rows, str):
                    new_rows = json.loads(new_rows)
                
                rows_diff = len(new_rows) - len(old_rows)
                if rows_diff != 0:
                    check_and_increment_limit(current_user, "records_per_sheet", rows_diff, store.connection)
                    check_and_increment_limit(current_user, "total_records", rows_diff, store.connection)

        try:
            return store.update_record(table_name, record_id, payload.data)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.delete(f"/{table}" + "/{record_id}")
    def delete_record(record_id: int, store: Store = Depends(get_user_store), table_name: str = table) -> dict:
        try:
            return store.delete_record(table_name, record_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


for table_name in (
    "degree_workspaces",
    "local_profiles",
    "projects",
    "project_sheets",
    "project_pages",
    "notifications",
    "universities",
    "programs",
    "professors",
    "applications",
    "deadlines",
    "documents",
    "document_versions",
    "static_files",
    "sticky_notes",
    "email_templates",
    "email_drafts",
    "outreach_logs",
    "reminders",
    "ai_conversations",
    "research_notes",
    "whiteboards",
):
    _crud_routes(table_name)


@router.post("/files/upload")
def upload_file(
    category: str = Form("other"),
    file_type: str = Form("other"),
    application_id: Optional[int] = Form(None),
    notes: str = Form(""),
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    from app.auth.limits import check_and_increment_limit
    try:
        file_size = file.size or 0
        check_and_increment_limit(current_user, "total_documents_bytes", file_size, store.connection)
        
        category_slug = normalize_media_category(category)
        file_type_slug = normalize_media_category(file_type or category_slug)
        store.ensure_document_category(category_slug)
        saved = save_upload(settings, category_slug, file.filename or "upload", file.file)
        return store.create_record(
            "static_files",
            {
                "display_name": file.filename or "upload",
                "file_type": file_type_slug,
                "relative_path": saved["relative_path"],
                "mime_type": file.content_type,
                "size_bytes": saved["size_bytes"],
                "application_id": application_id,
                "notes": notes,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/files/{file_id}/content")
def view_file_content(
    file_id: int,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
):
    try:
        from fastapi.responses import FileResponse
        records = store.list_records("static_files")
        file_record = next((r for r in records if r["id"] == file_id), None)
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = settings.workspace_path / file_record["relative_path"]
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Physical file not found")
            
        return FileResponse(
            path=str(file_path),
            filename=file_record["display_name"],
            media_type=file_record.get("mime_type")
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/email_templates/{template_id}/render")
def render_email_template(template_id: int, payload: RenderPayload, store: Store = Depends(get_user_store)) -> dict:
    try:
        return store.render_template(template_id, payload.variables)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/outreach/log")
def log_outreach(payload: OutreachPayload, store: Store = Depends(get_user_store)) -> dict:
    return store.log_outreach(payload.data, payload.follow_up_days)


@router.post("/ai/chat")
async def ai_chat(
    payload: AiPayload, 
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    verify_model_permission(payload.model, current_user, store.connection)
    
    # Enforce per-session limit without persisting a global counter
    session_limit = get_user_limit(current_user, "ai_messages_per_session", store.connection)
    if session_limit != -1:
        try:
            context_list = json.loads(payload.context) if payload.context else []
            msg_count = len(context_list) // 2
        except Exception:
            msg_count = 0
        if msg_count >= session_limit:
            raise UsageLimitExceeded(f"Session limit exceeded. You can send up to {session_limit} messages per session.")
        
    check_and_increment_limit(current_user, "daily_ai_chats", 1, store.connection)
    check_and_increment_limit(current_user, "monthly_ai_chats", 1, store.connection)
    return await AiService(settings).chat(
        payload.message, 
        payload.context, 
        payload.model
    )


@router.post("/ai/research")
async def ai_research(
    payload: AiPayload, 
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    verify_model_permission(payload.model, current_user, store.connection)
    if payload.background_model:
        verify_model_permission(payload.background_model, current_user, store.connection)
        
    session_limit = get_user_limit(current_user, "ai_messages_per_session", store.connection)
    if session_limit != -1:
        try:
            context_list = json.loads(payload.context) if payload.context else []
            msg_count = len(context_list) // 2
        except Exception:
            msg_count = 0
        if msg_count >= session_limit:
            raise UsageLimitExceeded(f"Session limit exceeded. You can send up to {session_limit} messages per session.")
        
    check_and_increment_limit(current_user, "daily_ai_chats", 1, store.connection)
    check_and_increment_limit(current_user, "monthly_ai_chats", 1, store.connection)
    if payload.web_search_max_results > 0:
        check_and_increment_limit(current_user, "can_use_web_search", 0, store.connection)
        check_and_increment_limit(current_user, "web_searches_per_day", 1, store.connection)
        check_and_increment_limit(current_user, "web_searches_per_month", 1, store.connection)
    return await AiService(settings).research(
        payload.message,
        payload.context,
        payload.model,
        payload.background_model,
        payload.web_search_max_results,
        payload.web_search_max_chars
    )


@router.post("/ai/summarize")
async def ai_summarize(
    payload: SummarizePayload,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user),
) -> dict:
    verify_model_permission(payload.model, current_user, store.connection)
    return await AiService(settings).summarize_memory(payload.text, payload.model)


@router.post("/ai/actions/plan")
async def ai_action_plan(
    payload: AiActionPlanPayload,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    verify_model_permission(payload.model, current_user, store.connection)
    check_and_increment_limit(current_user, "can_use_agents", 0, store.connection)
    
    session_limit = get_user_limit(current_user, "ai_messages_per_session", store.connection)
    if session_limit != -1:
        try:
            context_list = json.loads(payload.context) if payload.context else []
            msg_count = len(context_list) // 2
        except Exception:
            msg_count = 0
        if msg_count >= session_limit:
            raise UsageLimitExceeded(f"Session limit exceeded. You can send up to {session_limit} messages per session.")
        
    check_and_increment_limit(current_user, "daily_ai_chats", 1, store.connection)
    check_and_increment_limit(current_user, "monthly_ai_chats", 1, store.connection)
    return await AiActionService(settings, store).plan(payload.message, payload.context, payload.model)


@router.post("/ai/actions/execute")
def ai_action_execute(payload: AiActionExecutePayload, store: Store = Depends(get_user_store), settings: Settings = Depends(get_settings), current_user: dict = Depends(get_current_user)) -> dict:
    from app.auth.limits import check_and_increment_limit
    check_and_increment_limit(current_user, "can_use_agents", 1, store.connection)
    try:
        return AiActionService(settings, store).execute(payload.plan)
    except (LookupError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
