import json
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session
from sqlalchemy import text


def create_query_preview_feedback(
    session: Session,
    user_id: int,
    initial_query: str,
    filters: Dict[str, Any],
) -> int:
    cursor = session.execute(
        text("""
        INSERT INTO scholarship_search_feedback (
            user_id,
            initial_query,
            refined_query,
            filters_json,
            was_edited,
            provider_status
        )
        VALUES (:user_id, :initial_query, :refined_query, :filters_json, 0, 'previewed')
        RETURNING id
        """),
        {
            "user_id": user_id,
            "initial_query": initial_query,
            "refined_query": initial_query,
            "filters_json": json.dumps(filters, ensure_ascii=True, sort_keys=True),
        },
    )
    session.commit()
    return int(cursor.first()[0])


def create_search_feedback(
    session: Session,
    user_id: int,
    initial_query: str,
    refined_query: str,
    filters: Dict[str, Any],
) -> int:
    cursor = session.execute(
        text("""
        INSERT INTO scholarship_search_feedback (
            user_id,
            initial_query,
            refined_query,
            filters_json,
            was_edited,
            provider_status
        )
        VALUES (:user_id, :initial_query, :refined_query, :filters_json, :was_edited, 'pending')
        RETURNING id
        """),
        {
            "user_id": user_id,
            "initial_query": initial_query,
            "refined_query": refined_query,
            "filters_json": json.dumps(filters, ensure_ascii=True, sort_keys=True),
            "was_edited": int(initial_query != refined_query),
        },
    )
    session.commit()
    return int(cursor.first()[0])


def claim_query_preview_feedback(
    session: Session,
    feedback_id: int,
    user_id: int,
    approved_query: str,
) -> str:
    row = session.execute(
        text("""
        SELECT initial_query, provider_status
        FROM scholarship_search_feedback
        WHERE id = :feedback_id AND user_id = :user_id
        """),
        {"feedback_id": feedback_id, "user_id": user_id},
    ).mappings().fetchone()
    
    if row is None:
        raise LookupError("Preview feedback was not found for this user.")
    if row["provider_status"] != "previewed":
        raise ValueError("This preview has already been used or is no longer available.")

    initial_query = str(row["initial_query"])
    session.execute(
        text("""
        UPDATE scholarship_search_feedback
        SET refined_query = :approved_query,
            was_edited = :was_edited,
            provider_status = 'pending',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :feedback_id
        """),
        {
            "approved_query": approved_query,
            "was_edited": int(initial_query != approved_query),
            "feedback_id": feedback_id,
        },
    )
    session.commit()
    return initial_query


def complete_search_feedback(
    session: Session,
    feedback_id: int,
    provider_status: str,
    result_count: Optional[int] = None,
) -> None:
    session.execute(
        text("""
        UPDATE scholarship_search_feedback
        SET provider_status = :provider_status,
            result_count = :result_count,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :feedback_id
        """),
        {
            "provider_status": provider_status,
            "result_count": result_count,
            "feedback_id": feedback_id,
        },
    )
    session.commit()
