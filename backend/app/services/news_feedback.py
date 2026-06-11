import json
import sqlite3
from typing import Any, Dict, Optional


def create_query_preview_feedback(
    connection: sqlite3.Connection,
    user_id: int,
    initial_query: str,
    filters: Dict[str, Any],
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO scholarship_search_feedback (
            user_id,
            initial_query,
            refined_query,
            filters_json,
            was_edited,
            provider_status
        )
        VALUES (?, ?, ?, ?, 0, 'previewed')
        """,
        (
            user_id,
            initial_query,
            initial_query,
            json.dumps(filters, ensure_ascii=True, sort_keys=True),
        ),
    )
    connection.commit()
    return int(cursor.lastrowid)


def create_search_feedback(
    connection: sqlite3.Connection,
    user_id: int,
    initial_query: str,
    refined_query: str,
    filters: Dict[str, Any],
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO scholarship_search_feedback (
            user_id,
            initial_query,
            refined_query,
            filters_json,
            was_edited,
            provider_status
        )
        VALUES (?, ?, ?, ?, ?, 'pending')
        """,
        (
            user_id,
            initial_query,
            refined_query,
            json.dumps(filters, ensure_ascii=True, sort_keys=True),
            int(initial_query != refined_query),
        ),
    )
    connection.commit()
    return int(cursor.lastrowid)


def claim_query_preview_feedback(
    connection: sqlite3.Connection,
    feedback_id: int,
    user_id: int,
    approved_query: str,
) -> str:
    row = connection.execute(
        """
        SELECT initial_query, provider_status
        FROM scholarship_search_feedback
        WHERE id = ? AND user_id = ?
        """,
        (feedback_id, user_id),
    ).fetchone()
    if row is None:
        raise LookupError("Preview feedback was not found for this user.")
    if row["provider_status"] != "previewed":
        raise ValueError("This preview has already been used or is no longer available.")

    initial_query = str(row["initial_query"])
    connection.execute(
        """
        UPDATE scholarship_search_feedback
        SET refined_query = ?,
            was_edited = ?,
            provider_status = 'pending',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            approved_query,
            int(initial_query != approved_query),
            feedback_id,
        ),
    )
    connection.commit()
    return initial_query


def complete_search_feedback(
    connection: sqlite3.Connection,
    feedback_id: int,
    provider_status: str,
    result_count: Optional[int] = None,
) -> None:
    connection.execute(
        """
        UPDATE scholarship_search_feedback
        SET provider_status = ?,
            result_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (provider_status, result_count, feedback_id),
    )
    connection.commit()
