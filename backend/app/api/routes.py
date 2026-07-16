from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text

from app.auth.rate_limit import rate_limiter, user_identity
from app.core.categories import normalize_media_category
from app.core.config import Settings, get_settings
from app.core.workspace import ensure_workspace, save_upload, workspace_status
from app.db.connection import initialize_database
from app.services.ai import AiService
from app.services.ai_actions import AiActionService
from app.services.store import Store
from app.auth.dependencies import get_current_user
from app.api.dependencies import get_store
from app.auth.dependencies import get_user_store


router = APIRouter()


def _default_provider(settings: Settings) -> Optional[str]:
    """First configured provider — must match AiService's fallback order."""
    if settings.groq_api_key:
        return "groq"
    if settings.gemini_api_key:
        return "gemini"
    if settings.mistral_api_key:
        return "mistral"
    if settings.glm_api_key:
        return "glm"
    return None


def verify_model_permission(model: Optional[str], current_user: dict, connection, settings: Optional[Settings] = None):
    from app.auth.limits import check_and_increment_limit
    if not model:
        # No explicit model → AiService falls back to the first configured
        # provider. Enforce that provider's permission so omitting the model
        # cannot bypass can_use_<provider> role limits.
        if settings is not None:
            provider = _default_provider(settings)
            if provider:
                check_and_increment_limit(current_user, f"can_use_{provider}", 0, connection)
        return

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
    
    from app.auth.limits import UsageLimitExceeded
    from sqlalchemy import text
    row = connection.execute(
        text("SELECT is_active FROM ai_models WHERE (provider || ':' || model_id) = :m OR model_id = :m"),
        {"m": model}
    ).fetchone()
    if row and not row[0]:
        raise UsageLimitExceeded("Admin has restricted this model use try another model.")


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
    initialize_database(settings.database_target)
    return status


@router.get("/workspace/status")
def get_workspace_status(settings: Settings = Depends(get_settings)) -> dict:
    return workspace_status(settings)


@router.get("/dashboard/summary")
def dashboard_summary(store: Store = Depends(get_user_store)) -> dict:
    return store.dashboard_summary()


@router.get("/projects/{project_id}/summary")
def project_summary(project_id: str, store: Store = Depends(get_user_store)) -> dict:
    try:
        return store.project_summary(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/projects/{project_id}/sheets")
def create_project_sheet(
    project_id: str, 
    payload: SheetPayload, 
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    limit_count = get_user_limit(current_user, "sheets_per_project", store.db)
    if limit_count != -1:
        current_sheet_count = store.legacy_connection.execute(
            "SELECT COUNT(*) AS sheet_count FROM project_sheets WHERE project_id = ?", (project_id,)
        ).fetchone()["sheet_count"]
        if current_sheet_count >= limit_count:
            raise UsageLimitExceeded(f"Limit exceeded for sheets_per_project. Your plan allows {limit_count}.")
            
    check_and_increment_limit(current_user, "total_sheets", 1, store.db)
    try:
        return store.create_sheet_with_defaults(project_id, payload.name)
    except LookupError as exc:
        # Give the sheet quota back if the project lookup/creation failed.
        check_and_increment_limit(current_user, "total_sheets", -1, store.db)
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
def rename_document_category(category_id: str, payload: CategoryPayload, store: Store = Depends(get_user_store)) -> dict:
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
    category_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
) -> dict:
    try:
        return store.delete_document_category(category_id, settings.workspace_path, settings.media_path)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# Deleting from these tables frees plan quota; the affected count-based
# usage counters are resynced from live data right after the delete.
RESYNC_FEATURES_BY_TABLE = {
    "projects": ("total_projects", "total_sheets", "total_records"),
    "project_sheets": ("total_sheets", "total_records"),
    "project_pages": ("total_records",),
    "sticky_notes": ("total_sticky_notes",),
    "whiteboards": ("total_whiteboards",),
    "static_files": ("total_documents_bytes",),
}


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
            check_and_increment_limit(current_user, feature, 1, store.db)

        try:
            return store.create_record(table_name, payload.data)
        except (ValueError, LookupError) as exc:
            # The counter was incremented before the write; give the quota
            # back so a failed create does not permanently consume it.
            if feature:
                from app.auth.limits import check_and_increment_limit
                check_and_increment_limit(current_user, feature, -1, store.db)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.patch(f"/{table}" + "/{record_id}")
    def update_record(
        record_id: str,
        payload: Payload,
        store: Store = Depends(get_user_store),
        table_name: str = table,
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        if table_name == "project_pages" and "rows_json" in payload.data:
            import json
            from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
            old_record = store.legacy_connection.execute("SELECT rows_json FROM project_pages WHERE id = ?", (record_id,)).fetchone()
            if old_record:
                old_rows = safe_json_loads(old_record["rows_json"], default=[])
                new_rows = payload.data["rows_json"]
                if isinstance(new_rows, str):
                    new_rows = safe_json_loads(new_rows, default=[])
                
                rows_diff = len(new_rows) - len(old_rows)
                
                limit_count = get_user_limit(current_user, "records_per_sheet", store.db)
                if limit_count != -1 and len(new_rows) > limit_count:
                    raise UsageLimitExceeded(f"Limit exceeded for records_per_sheet. Your plan allows {limit_count}.")
                
                if rows_diff != 0:
                    check_and_increment_limit(current_user, "total_records", rows_diff, store.db)
                    try:
                        return store.update_record(table_name, record_id, payload.data)
                    except LookupError as exc:
                        # Give the row quota back if the write itself failed.
                        check_and_increment_limit(current_user, "total_records", -rows_diff, store.db)
                        raise HTTPException(status_code=404, detail=str(exc)) from exc

        try:
            return store.update_record(table_name, record_id, payload.data)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.delete(f"/{table}" + "/{record_id}")
    def delete_record(
        record_id: str,
        store: Store = Depends(get_user_store),
        table_name: str = table,
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        try:
            deleted = store.delete_record(table_name, record_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        features = RESYNC_FEATURES_BY_TABLE.get(table_name)
        if features:
            from app.auth.limits import resync_usage_counts
            resync_usage_counts(current_user["id"], store.db, features)
        return deleted


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
    rate_limiter.check_and_record("files_upload", user_identity(current_user))
    from app.auth.limits import check_and_increment_limit, UsageLimitExceeded
    file_size = file.size or 0
    check_and_increment_limit(current_user, "total_documents_bytes", file_size, store.db)
    charged_bytes = file_size
    try:
        category_slug = normalize_media_category(category)
        file_type_slug = normalize_media_category(file_type or category_slug)
        store.ensure_document_category(category_slug)
        saved = save_upload(settings, category_slug, file.filename or "upload", file.file)
        # The pre-charge used the client-declared size, which can be absent or
        # wrong; settle the difference against the bytes actually written.
        actual_size = int(saved["size_bytes"] or 0)
        if actual_size != file_size:
            try:
                check_and_increment_limit(
                    current_user, "total_documents_bytes", actual_size - file_size, store.db
                )
            except UsageLimitExceeded:
                # SCHOLARDOCX-0139: compensate the Storage upload on failure.
                from app.core.storage import delete_file
                try:
                    delete_file(saved["relative_path"])
                except Exception:
                    pass
                check_and_increment_limit(
                    current_user, "total_documents_bytes", -file_size, store.db
                )
                raise
            charged_bytes = actual_size
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
        # Give the byte quota back if validation/saving failed after the
        # pre-charge.
        check_and_increment_limit(current_user, "total_documents_bytes", -charged_bytes, store.db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/files/{file_id}/content")
def view_file_content(
    file_id: str,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
):
    try:
        from fastapi.responses import Response
        from app.core.storage import download_bytes
        records = store.list_records("static_files")
        file_record = next((r for r in records if r["id"] == file_id), None)
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")

        # SCHOLARDOCX-0139: files live in Supabase Storage, not local disk.
        content, content_type = download_bytes(file_record["relative_path"])
        return Response(
            content=content,
            media_type=file_record.get("mime_type") or content_type,
            headers={"Content-Disposition": f'inline; filename="{file_record["display_name"]}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/email_templates/{template_id}/render")
def render_email_template(template_id: str, payload: RenderPayload, store: Store = Depends(get_user_store)) -> dict:
    try:
        return store.render_template(template_id, payload.variables)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/outreach/log")
def log_outreach(payload: OutreachPayload, store: Store = Depends(get_user_store)) -> dict:
    return store.log_outreach(payload.data, payload.follow_up_days)

@router.get("/ai/models")
def get_ai_models(store: Store = Depends(get_user_store)) -> list[dict]:
    # Returns all models (even inactive) so frontend can display them as disabled
    rows = store.db.execute(
        text("SELECT model_id, provider, display_name, is_active FROM ai_models ORDER BY sort_order ASC")
    ).mappings().fetchall()
    return [dict(row) for row in rows]



@router.post("/ai/chat")
async def ai_chat(
    payload: AiPayload,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    rate_limiter.check_and_record("ai_chat", user_identity(current_user))
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    verify_model_permission(payload.model, current_user, store.db, settings)
    
    # Enforce per-session limit without persisting a global counter
    session_limit = get_user_limit(current_user, "ai_messages_per_session", store.db)
    if session_limit != -1:
        try:
            context_list = safe_json_loads(payload.context, default=[])
            msg_count = len(context_list) // 2
        except Exception:
            msg_count = 0
        if msg_count >= session_limit:
            raise UsageLimitExceeded(f"Session limit exceeded. You can send up to {session_limit} messages per session.")
        
    # AI chat is metered by the central AI-token balance (ensure_can_spend +
    # charge happen inside chat()), not by daily/monthly message counts.
    return await AiService(settings, user=current_user, session=store.db).chat(
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
    rate_limiter.check_and_record("ai_research", user_identity(current_user))
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    verify_model_permission(payload.model, current_user, store.db, settings)
    if payload.background_model:
        verify_model_permission(payload.background_model, current_user, store.db, settings)
        
    session_limit = get_user_limit(current_user, "ai_messages_per_session", store.db)
    if session_limit != -1:
        try:
            context_list = safe_json_loads(payload.context, default=[])
            msg_count = len(context_list) // 2
        except Exception:
            msg_count = 0
        if msg_count >= session_limit:
            raise UsageLimitExceeded(f"Session limit exceeded. You can send up to {session_limit} messages per session.")
        
    # External web searches (Tavily) are metered by the central AI-token balance
    # via a flat USD fee per call.
    if payload.web_search_max_results > 0:
        check_and_increment_limit(current_user, "can_use_web_search", 0, store.db)
        from app.services.ai_tokens import charge_flat_fee, get_tavily_call_cost_usd, ensure_can_spend
        # Pre-check if they have enough balance to cover the flat fee before hitting Tavily
        ensure_can_spend(current_user, store.db)
        cost_usd = get_tavily_call_cost_usd(store.db)
        charge_flat_fee(current_user, store.db, cost_usd, source="web_search")
    return await AiService(settings, user=current_user, session=store.db).research(
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
    rate_limiter.check_and_record("ai_summarize", user_identity(current_user))
    verify_model_permission(payload.model, current_user, store.db, settings)
    return await AiService(settings, user=current_user, session=store.db).summarize_memory(payload.text, payload.model)


@router.post("/ai/actions/plan")
async def ai_action_plan(
    payload: AiActionPlanPayload,
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_user_store),
    current_user: dict = Depends(get_current_user)
) -> dict:
    rate_limiter.check_and_record("ai_action_plan", user_identity(current_user))
    from app.auth.limits import check_and_increment_limit, get_user_limit, UsageLimitExceeded
    verify_model_permission(payload.model, current_user, store.db, settings)
    check_and_increment_limit(current_user, "can_use_agents", 0, store.db)
    
    session_limit = get_user_limit(current_user, "ai_messages_per_session", store.db)
    if session_limit != -1:
        try:
            context_list = safe_json_loads(payload.context, default=[])
            msg_count = len(context_list) // 2
        except Exception:
            msg_count = 0
        if msg_count >= session_limit:
            raise UsageLimitExceeded(f"Session limit exceeded. You can send up to {session_limit} messages per session.")
        
    return await AiActionService(settings, store).plan(
        payload.message, payload.context, payload.model,
        user=current_user, session=store.db,
    )


@router.post("/ai/actions/execute")
def ai_action_execute(payload: AiActionExecutePayload, store: Store = Depends(get_user_store), settings: Settings = Depends(get_settings), current_user: dict = Depends(get_current_user)) -> dict:
    rate_limiter.check_and_record("ai_action_execute", user_identity(current_user))
    from app.auth.limits import check_and_increment_limit
    check_and_increment_limit(current_user, "can_use_agents", 0, store.db)
    try:
        # Passing the user enables the same role-limit checks manual routes use.
        return AiActionService(settings, store).execute(
            payload.plan, user=current_user, session=store.db
        )
    except (LookupError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
