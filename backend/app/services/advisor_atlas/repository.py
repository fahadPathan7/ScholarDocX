from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
import json
from typing import Any

from app.db.legacy_db import legacy_session


JSON_FIELDS = {
    "research_profile_json",
    "approved_domains_json",
    "progress_json",
    "action_center_json",
    "coverage_json",
    "risk_flags_json",
    "intelligence_json",
    "authors_json",
    "metadata_json",
    "decision_snapshot_json",
    "research_bridge_json",
    "method_bridge_json",
    "lab_environment_json",
    "trajectory_json",
    "application_fit_json",
    "verification_questions_json",
    "next_actions_json",
    "previous_value_json",
    "new_value_json",
}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def _decode_row(row) -> dict[str, Any]:
    item = dict(row)
    for field in JSON_FIELDS:
        if field in item and isinstance(item[field], str):
            try:
                item[field.removesuffix("_json")] = safe_json_loads(item[field], default=[])
            except (TypeError, ValueError):
                item[field.removesuffix("_json")] = {} if item[field].startswith("{") else []
            del item[field]
    return item


class AdvisorAtlasRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def create_run(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            cursor = db.execute(
                """
                INSERT INTO advisor_atlas_runs (
                    user_id, mode, search_depth, university_name, university_url,
                    department, professor_name, degree_target, intake_term,
                    research_profile_json, approved_domains_json, progress_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    payload["mode"],
                    payload.get("search_depth", "deep"),
                    payload.get("university_name"),
                    payload.get("university_url"),
                    payload.get("department"),
                    payload.get("professor_name"),
                    payload.get("degree_target"),
                    payload.get("intake_term"),
                    _json(payload.get("research_profile", {})),
                    _json(payload.get("approved_domains", [])),
                    _json({"completed": 0, "total": None, "message": "Queued"}),
                ),
            )
            db.commit()
            return self.get_run(str(cursor.lastrowid), user_id)

    def count_runs(self, user_id: str) -> int:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT COUNT(*) AS n FROM advisor_atlas_runs WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return int(row["n"]) if row else 0

    def list_runs(self, user_id: str) -> list[dict[str, Any]]:
        with legacy_session(self.database_url) as db:
            rows = db.execute(
                """
                SELECT r.*,
                       COUNT(c.id) AS candidate_count,
                       SUM(CASE WHEN c.shortlist_status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlist_count
                FROM advisor_atlas_runs r
                LEFT JOIN advisor_atlas_candidates c ON c.run_id = r.id
                WHERE r.user_id = ?
                GROUP BY r.id
                ORDER BY r.created_at DESC
                """,
                (user_id,),
            ).fetchall()
            return [_decode_row(row) for row in rows]

    def get_run(self, run_id: str, user_id: str, include_candidates: bool = True) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT * FROM advisor_atlas_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
            if not row:
                raise LookupError("Advisor Atlas run not found.")
            result = _decode_row(row)
            if include_candidates:
                candidates = db.execute(
                    """
                    SELECT * FROM advisor_atlas_candidates
                    WHERE run_id = ? AND user_id = ?
                    ORDER BY match_score DESC, evidence_confidence DESC, display_name ASC
                    """,
                    (run_id, user_id),
                ).fetchall()
                result["candidates"] = [_decode_row(item) for item in candidates]
            return result

    def update_run(self, run_id: str, **values: Any) -> None:
        if not values:
            return
        allowed = {
            "status", "current_stage", "progress_json", "action_center_json",
            "error_message", "started_at", "completed_at", "cancelled_at",
        }
        clean = {key: value for key, value in values.items() if key in allowed}
        for key in ("progress_json", "action_center_json"):
            if key in clean and not isinstance(clean[key], str):
                clean[key] = _json(clean[key])
        clean["updated_at"] = "CURRENT_TIMESTAMP"
        assignments = []
        params = []
        for key, value in clean.items():
            if key == "updated_at":
                assignments.append("updated_at = CURRENT_TIMESTAMP")
            else:
                assignments.append(f"{key} = ?")
                params.append(value)
        params.append(run_id)
        with legacy_session(self.database_url) as db:
            db.execute(
                f"UPDATE advisor_atlas_runs SET {', '.join(assignments)} WHERE id = ?",
                params,
            )
            db.commit()

    def is_cancelled(self, run_id: str) -> bool:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT status FROM advisor_atlas_runs WHERE id = ?",
                (run_id,),
            ).fetchone()
            return not row or row["status"] == "cancelled"

    def cancel_run(self, run_id: str, user_id: str) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            cursor = db.execute(
                """
                UPDATE advisor_atlas_runs
                SET status = 'cancelled', current_stage = 'cancelled',
                    cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ? AND status IN ('queued', 'running', 'failed')
                """,
                (run_id, user_id),
            )
            if cursor.rowcount == 0:
                existing = db.execute(
                    "SELECT id FROM advisor_atlas_runs WHERE id = ? AND user_id = ?",
                    (run_id, user_id),
                ).fetchone()
                if not existing:
                    raise LookupError("Advisor Atlas run not found.")
            db.commit()
        return self.get_run(run_id, user_id)

    def prepare_resume(self, run_id: str, user_id: str) -> dict[str, Any]:
        run = self.get_run(run_id, user_id, include_candidates=False)
        if run["status"] not in {"failed", "cancelled"}:
            raise ValueError("Only failed or cancelled runs can be resumed.")
        with legacy_session(self.database_url) as db:
            db.execute(
                """
                UPDATE advisor_atlas_runs
                SET status = 'queued', current_stage = 'queued', error_message = NULL,
                    cancelled_at = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
                """,
                (run_id, user_id),
            )
            db.commit()
        return self.get_run(run_id, user_id)

    def replace_candidate_data(
        self,
        run_id: str,
        user_id: str,
        candidate: dict[str, Any],
        evidence: list[dict[str, Any]],
        publications: list[dict[str, Any]],
        dossier: dict[str, Any],
    ) -> int:
        normalized_name = candidate["display_name"].strip().lower()
        with legacy_session(self.database_url) as db:
            existing = db.execute(
                """
                SELECT id, recruitment_state, match_score FROM advisor_atlas_candidates
                WHERE run_id = ? AND user_id = ? AND normalized_name = ?
                """,
                (run_id, user_id, normalized_name),
            ).fetchone()
            values = (
                candidate["display_name"],
                candidate.get("title"),
                candidate.get("institution"),
                candidate.get("department"),
                candidate.get("email"),
                candidate.get("official_profile_url"),
                candidate.get("personal_url"),
                candidate.get("linkedin_url"),
                candidate.get("google_scholar_url"),
                candidate.get("lab_name"),
                candidate.get("lab_url"),
                candidate.get("research_summary"),
                int(candidate.get("match_score", 0)),
                int(candidate.get("evidence_confidence", 0)),
                candidate.get("recruitment_state", "unknown"),
                candidate.get("recruitment_summary"),
                candidate.get("decision_lane", "Needs Verification"),
                _json(candidate.get("intelligence", {})),
                _json(candidate.get("coverage", {})),
                _json(candidate.get("risk_flags", [])),
            )
            if existing:
                candidate_id = str(existing["id"])
                db.execute(
                    """
                    UPDATE advisor_atlas_candidates SET
                      display_name=?, title=?, institution=?, department=?, email=?,
                      official_profile_url=?, personal_url=?, linkedin_url=?, google_scholar_url=?, 
                      lab_name=?, lab_url=?,
                      research_summary=?, match_score=?, evidence_confidence=?,
                      recruitment_state=?, recruitment_summary=?, decision_lane=?,
                      intelligence_json=?, coverage_json=?, risk_flags_json=?,
                      updated_at=CURRENT_TIMESTAMP
                    WHERE id=?
                    """,
                    (*values, candidate_id),
                )
                for field, new_value in (
                    ("recruitment_state", candidate.get("recruitment_state")),
                    ("match_score", int(candidate.get("match_score", 0))),
                ):
                    old_value = existing[field]
                    if old_value != new_value:
                        db.execute(
                            """
                            INSERT INTO advisor_atlas_watch_events
                              (candidate_id, event_type, previous_value_json, new_value_json, importance)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (
                                candidate_id,
                                f"{field}_changed",
                                _json(old_value),
                                _json(new_value),
                                "high" if field == "recruitment_state" else "medium",
                            ),
                        )
                db.execute("DELETE FROM advisor_atlas_evidence WHERE candidate_id = ?", (candidate_id,))
                db.execute("DELETE FROM advisor_atlas_publications WHERE candidate_id = ?", (candidate_id,))
            else:
                cursor = db.execute(
                    """
                    INSERT INTO advisor_atlas_candidates (
                      run_id, user_id, normalized_name, display_name, title,
                      institution, department, email, official_profile_url,
                      personal_url, linkedin_url, google_scholar_url, lab_name, lab_url, research_summary,
                      match_score, evidence_confidence, recruitment_state,
                      recruitment_summary, decision_lane, intelligence_json,
                      coverage_json, risk_flags_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (run_id, user_id, normalized_name, *values),
                )
                candidate_id = str(cursor.lastrowid)

            for item in evidence:
                db.execute(
                    """
                    INSERT INTO advisor_atlas_evidence (
                      candidate_id, source_url, canonical_url, source_type,
                      page_title, claim_type, claim_text, evidence_excerpt,
                      confidence, published_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        candidate_id,
                        item["source_url"],
                        item.get("canonical_url", item["source_url"]),
                        item.get("source_type", "web"),
                        item.get("page_title"),
                        item.get("claim_type", "profile"),
                        item.get("claim_text", ""),
                        item.get("evidence_excerpt"),
                        int(item.get("confidence", 50)),
                        item.get("published_at"),
                        _json(item.get("metadata", {})),
                    ),
                )

            for item in publications[:8]:
                db.execute(
                    """
                    INSERT INTO advisor_atlas_publications (
                      candidate_id, title, authors_json, publication_year, venue,
                      doi, source_url, relevance_reason, citation_count,
                      evidence_source, reading_priority
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        candidate_id,
                        item["title"],
                        _json(item.get("authors", [])),
                        item.get("publication_year"),
                        item.get("venue"),
                        item.get("doi"),
                        item.get("source_url"),
                        item.get("relevance_reason"),
                        item.get("citation_count"),
                        item.get("evidence_source"),
                        int(item.get("reading_priority", 0)),
                    ),
                )

            db.execute(
                """
                INSERT INTO advisor_atlas_dossiers (
                  candidate_id, decision_snapshot_json, research_bridge_json,
                  method_bridge_json, lab_environment_json, trajectory_json,
                  application_fit_json, verification_questions_json,
                  next_actions_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(candidate_id) DO UPDATE SET
                  dossier_version = advisor_atlas_dossiers.dossier_version + 1,
                  decision_snapshot_json = excluded.decision_snapshot_json,
                  research_bridge_json = excluded.research_bridge_json,
                  method_bridge_json = excluded.method_bridge_json,
                  lab_environment_json = excluded.lab_environment_json,
                  trajectory_json = excluded.trajectory_json,
                  application_fit_json = excluded.application_fit_json,
                  verification_questions_json = excluded.verification_questions_json,
                  next_actions_json = excluded.next_actions_json,
                  updated_at = CURRENT_TIMESTAMP
                """,
                (
                    candidate_id,
                    _json(dossier.get("decision_snapshot", {})),
                    _json(dossier.get("research_bridge", {})),
                    _json(dossier.get("method_bridge", {})),
                    _json(dossier.get("lab_environment", {})),
                    _json(dossier.get("trajectory", {})),
                    _json(dossier.get("application_fit", {})),
                    _json(dossier.get("verification_questions", [])),
                    _json(dossier.get("next_actions", [])),
                ),
            )
            db.commit()
            return candidate_id

    def get_candidate(self, candidate_id: str, user_id: str) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT * FROM advisor_atlas_candidates WHERE id = ? AND user_id = ?",
                (candidate_id, user_id),
            ).fetchone()
            if not row:
                raise LookupError("Advisor candidate not found.")
            candidate = _decode_row(row)
            candidate["evidence"] = [
                _decode_row(item)
                for item in db.execute(
                    """
                    SELECT * FROM advisor_atlas_evidence
                    WHERE candidate_id = ?
                    ORDER BY confidence DESC, retrieved_at DESC
                    LIMIT 8
                    """,
                    (candidate_id,),
                ).fetchall()
            ]
            candidate["publications"] = [
                _decode_row(item)
                for item in db.execute(
                    """
                    SELECT * FROM advisor_atlas_publications
                    WHERE candidate_id = ?
                    ORDER BY publication_year DESC, reading_priority DESC
                    """,
                    (candidate_id,),
                ).fetchall()
            ]
            dossier = db.execute(
                "SELECT * FROM advisor_atlas_dossiers WHERE candidate_id = ?",
                (candidate_id,),
            ).fetchone()
            candidate["dossier"] = _decode_row(dossier) if dossier else {}
            candidate["watch_events"] = [
                _decode_row(item)
                for item in db.execute(
                    "SELECT * FROM advisor_atlas_watch_events WHERE candidate_id = ? ORDER BY detected_at DESC",
                    (candidate_id,),
                ).fetchall()
            ]
            return candidate

    def delete_run(self, run_id: str, user_id: str) -> bool:
        with legacy_session(self.database_url) as db:
            cursor = db.execute(
                "DELETE FROM advisor_atlas_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            )
            return cursor.rowcount > 0

    def update_candidate(self, candidate_id: str, user_id: str, values: dict[str, Any]) -> dict[str, Any]:
        allowed = {"shortlist_status", "decision_lane", "user_notes"}
        clean = {key: value for key, value in values.items() if key in allowed}
        if clean:
            assignments = [f"{key} = ?" for key in clean]
            with legacy_session(self.database_url) as db:
                db.execute(
                    f"UPDATE advisor_atlas_candidates SET {', '.join(assignments)}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
                    [*clean.values(), candidate_id, user_id],
                )
                db.commit()
        return self.get_candidate(candidate_id, user_id)

    def update_publication(self, publication_id: str, candidate_id: str, user_id: str, values: dict[str, Any]) -> dict[str, Any]:
        candidate = self.get_candidate(candidate_id, user_id)
        allowed = {"reading_status", "user_note"}
        clean = {key: value for key, value in values.items() if key in allowed}
        if clean:
            assignments = [f"{key} = ?" for key in clean]
            with legacy_session(self.database_url) as db:
                db.execute(
                    f"UPDATE advisor_atlas_publications SET {', '.join(assignments)}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND candidate_id=?",
                    [*clean.values(), publication_id, candidate["id"]],
                )
                db.commit()
        return self.get_candidate(candidate_id, user_id)

    def save_to_professors(self, candidate_id: str, user_id: str) -> dict[str, Any]:
        candidate = self.get_candidate(candidate_id, user_id)
        with legacy_session(self.database_url) as db:
            existing = db.execute(
                """
                SELECT id FROM professors
                WHERE user_id = ? AND lower(name) = lower(?)
                ORDER BY id LIMIT 1
                """,
                (user_id, candidate["display_name"]),
            ).fetchone()
            if existing:
                professor_id = str(existing["id"])
                db.execute(
                    """
                    UPDATE professors SET title=?, email=?, profile_url=?,
                      research_interests=?, notes=?, updated_at=CURRENT_TIMESTAMP
                    WHERE id=? AND user_id=?
                    """,
                    (
                        candidate.get("title"),
                        candidate.get("email"),
                        candidate.get("official_profile_url"),
                        candidate.get("research_summary"),
                        candidate.get("user_notes"),
                        professor_id,
                        user_id,
                    ),
                )
            else:
                cursor = db.execute(
                    """
                    INSERT INTO professors (
                      user_id, name, title, email, profile_url, research_interests, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        candidate["display_name"],
                        candidate.get("title"),
                        candidate.get("email"),
                        candidate.get("official_profile_url"),
                        candidate.get("research_summary"),
                        candidate.get("user_notes"),
                    ),
                )
                professor_id = str(cursor.lastrowid)
            db.execute(
                "UPDATE advisor_atlas_candidates SET saved_professor_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (professor_id, candidate_id),
            )
            db.commit()
            row = db.execute("SELECT * FROM professors WHERE id = ?", (professor_id,)).fetchone()
            return dict(row)
