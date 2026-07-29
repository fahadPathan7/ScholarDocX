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


class SavedProfessorLimitReached(Exception):
    """The saved-professor library is full (SCHOLARDOCX-0196).

    Its own type rather than a bare ValueError so the API layer can answer 409
    ("you already have as many as you can keep") instead of 400 ("your request
    was malformed") — the request was fine, the collection is full.
    """


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def _json_safe(value: Any) -> str:
    """`_json` for payloads read back out of storage.

    A candidate loaded from the database carries `datetime` objects, which
    plain `json.dumps` refuses — the same defect that silently killed every
    deep-research pass in SCHOLARDOCX-0190. `default=str` keeps a snapshot from
    ever failing on a type rather than on its content.
    """
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), default=str)


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

    def _resolve_university(
        self,
        db: Any,
        user_id: str,
        name: str | None,
    ) -> str | None:
        """Find (or create) the user's university record for this institution.

        SCHOLARDOCX-0195: saving a professor used to leave `university_id` null
        even though the run knew the institution, so a saved advisor arrived
        detached from the university they work at — invisible to anything that
        organises by institution.
        """
        clean = (name or "").strip()
        if not clean:
            return None
        row = db.execute(
            """
            SELECT id FROM universities
            WHERE user_id = ? AND lower(name) = lower(?)
            ORDER BY id LIMIT 1
            """,
            (user_id, clean),
        ).fetchone()
        if row:
            return str(row["id"])
        # `country` is NOT NULL on this table and Advisor Atlas does not
        # capture it, so it is left explicitly unknown rather than guessed.
        cursor = db.execute(
            "INSERT INTO universities (user_id, name, country) VALUES (?, ?, ?)",
            (user_id, clean, "Unspecified"),
        )
        return str(cursor.lastrowid)

    def _resolve_program(
        self,
        db: Any,
        user_id: str,
        university_id: str | None,
        department: str | None,
        degree_target: str | None,
    ) -> str | None:
        """Find (or create) a program row for this department at this university."""
        clean = (department or "").strip()
        if not clean or not university_id:
            return None
        row = db.execute(
            """
            SELECT id FROM programs
            WHERE user_id = ? AND university_id = ? AND lower(name) = lower(?)
            ORDER BY id LIMIT 1
            """,
            (user_id, university_id, clean),
        ).fetchone()
        if row:
            return str(row["id"])
        cursor = db.execute(
            """
            INSERT INTO programs (user_id, university_id, name, degree_type, department)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, university_id, clean, degree_target, clean),
        )
        return str(cursor.lastrowid)

    def count_saved_professors(self, user_id: str) -> int:
        """How many professors the user has kept.

        Counts the `professors` table rather than candidates carrying a
        `saved_professor_id`: two candidates from different runs can point at
        the same professor, and the library holds one card for them.
        """
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT COUNT(*) AS n FROM professors WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return int(row["n"]) if row else 0

    def list_saved_professors(self, user_id: str) -> list[dict[str, Any]]:
        """The saved-professor library, each row carrying its dossier link.

        SCHOLARDOCX-0196: the library is a way back into the dossier, so the
        candidate id has to come with the professor — the frontend cannot
        derive it (the foreign key points the other way, from candidate to
        professor). The newest link wins when a professor was saved from more
        than one run.
        """
        with legacy_session(self.database_url) as db:
            rows = db.execute(
                """
                SELECT p.*,
                       u.name AS university_name,
                       pr.name AS program_name,
                       (
                         SELECT c.id FROM advisor_atlas_candidates c
                         WHERE c.saved_professor_id = p.id AND c.user_id = p.user_id
                         ORDER BY c.updated_at DESC
                         LIMIT 1
                       ) AS candidate_id,
                       s.saved_at AS dossier_saved_at,
                       s.source_run_label,
                       CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS has_dossier
                FROM professors p
                LEFT JOIN advisor_atlas_saved_dossiers s
                  ON s.professor_id = p.id AND s.user_id = p.user_id
                LEFT JOIN universities u ON u.id = p.university_id
                LEFT JOIN programs pr ON pr.id = p.program_id
                WHERE p.user_id = ?
                ORDER BY p.updated_at DESC
                """,
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def get_saved_dossier(self, professor_id: str, user_id: str) -> dict[str, Any]:
        """The frozen dossier for a saved professor.

        Returned even when the originating search still exists — the snapshot
        is what the user chose to keep, and reading it costs one row rather
        than reassembling four tables.
        """
        with legacy_session(self.database_url) as db:
            row = db.execute(
                """
                SELECT * FROM advisor_atlas_saved_dossiers
                WHERE professor_id = ? AND user_id = ?
                """,
                (professor_id, user_id),
            ).fetchone()
            if not row:
                raise LookupError("No saved dossier for that professor.")
            record = dict(row)
            snapshot = safe_json_loads(record.get("snapshot_json") or "{}", default={})
            return {
                "professor_id": professor_id,
                "saved_at": record.get("saved_at"),
                "source_run_label": record.get("source_run_label"),
                "candidate": snapshot if isinstance(snapshot, dict) else {},
            }

    def _write_saved_dossier(
        self,
        db: Any,
        professor_id: str,
        user_id: str,
        candidate: dict[str, Any],
        source_run_label: str | None,
    ) -> None:
        """Freeze the candidate's full dossier against the saved professor.

        Re-saving overwrites: the user asked for the current state of the
        research, and keeping the older copy would leave two answers to
        "what did I save?".
        """
        payload = _json_safe(candidate)
        existing = db.execute(
            "SELECT id FROM advisor_atlas_saved_dossiers WHERE professor_id = ?",
            (professor_id,),
        ).fetchone()
        if existing:
            db.execute(
                """
                UPDATE advisor_atlas_saved_dossiers
                SET snapshot_json = ?, source_run_label = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (payload, source_run_label, str(existing["id"])),
            )
            return
        db.execute(
            """
            INSERT INTO advisor_atlas_saved_dossiers
              (professor_id, user_id, snapshot_json, source_run_label)
            VALUES (?, ?, ?, ?)
            """,
            (professor_id, user_id, payload, source_run_label),
        )

    def remove_saved_professor(self, professor_id: str, user_id: str) -> dict[str, Any]:
        """Drop a professor from the library.

        Clears `saved_professor_id` on any candidate pointing at them first,
        so the dossier's Save button becomes available again instead of
        staying stuck on "Saved to professors" against a record that is gone.
        """
        with legacy_session(self.database_url) as db:
            existing = db.execute(
                "SELECT id FROM professors WHERE id = ? AND user_id = ?",
                (professor_id, user_id),
            ).fetchone()
            if not existing:
                raise LookupError("Saved professor not found.")
            db.execute(
                """
                UPDATE advisor_atlas_candidates
                SET saved_professor_id = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE saved_professor_id = ? AND user_id = ?
                """,
                (professor_id, user_id),
            )
            db.execute(
                "DELETE FROM professors WHERE id = ? AND user_id = ?",
                (professor_id, user_id),
            )
            db.commit()
            return {"removed": professor_id}

    def save_to_professors(
        self,
        candidate_id: str,
        user_id: str,
        max_saved: int | None = None,
    ) -> dict[str, Any]:
        candidate = self.get_candidate(candidate_id, user_id)
        run = self.get_run(str(candidate["run_id"]), user_id, include_candidates=False)
        with legacy_session(self.database_url) as db:
            university_id = self._resolve_university(
                db,
                user_id,
                candidate.get("institution") or run.get("university_name"),
            )
            program_id = self._resolve_program(
                db,
                user_id,
                university_id,
                candidate.get("department") or run.get("department"),
                run.get("degree_target"),
            )
            # Match within the institution, not across the whole workspace.
            # Two different people can share a name; the same person at the
            # same university is the case worth merging. When the institution
            # is unknown, fall back to the old name-only match rather than
            # creating a duplicate.
            if university_id:
                existing = db.execute(
                    """
                    SELECT id FROM professors
                    WHERE user_id = ? AND lower(name) = lower(?)
                      AND (university_id = ? OR university_id IS NULL)
                    ORDER BY id LIMIT 1
                    """,
                    (user_id, candidate["display_name"], university_id),
                ).fetchone()
            else:
                existing = db.execute(
                    """
                    SELECT id FROM professors
                    WHERE user_id = ? AND lower(name) = lower(?)
                    ORDER BY id LIMIT 1
                    """,
                    (user_id, candidate["display_name"]),
                ).fetchone()
            # The cap applies to *adding* a professor. Re-saving one already in
            # the library refreshes them and must keep working at the cap —
            # refusing that would strand the user's most useful action.
            if not existing and max_saved is not None:
                total = db.execute(
                    "SELECT COUNT(*) AS n FROM professors WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                if total and int(total["n"]) >= max_saved:
                    raise SavedProfessorLimitReached(
                        f"You've saved the maximum of {max_saved} professors. "
                        "Remove one from Saved professors before adding another."
                    )

            if existing:
                professor_id = str(existing["id"])
                # COALESCE on the incoming side: a re-save refreshes what the
                # dossier now knows and leaves the rest alone. Passing a bare
                # value would blank a field the user had filled in by hand
                # whenever this run happened not to find it.
                db.execute(
                    """
                    UPDATE professors SET
                      title=COALESCE(?, title),
                      email=COALESCE(?, email),
                      profile_url=COALESCE(?, profile_url),
                      research_interests=COALESCE(?, research_interests),
                      notes=COALESCE(?, notes),
                      university_id=COALESCE(?, university_id),
                      program_id=COALESCE(?, program_id),
                      updated_at=CURRENT_TIMESTAMP
                    WHERE id=? AND user_id=?
                    """,
                    (
                        candidate.get("title"),
                        candidate.get("email"),
                        candidate.get("official_profile_url"),
                        candidate.get("research_summary"),
                        candidate.get("user_notes"),
                        university_id,
                        program_id,
                        professor_id,
                        user_id,
                    ),
                )
            else:
                cursor = db.execute(
                    """
                    INSERT INTO professors (
                      user_id, name, title, email, profile_url, research_interests,
                      notes, university_id, program_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        candidate["display_name"],
                        candidate.get("title"),
                        candidate.get("email"),
                        candidate.get("official_profile_url"),
                        candidate.get("research_summary"),
                        candidate.get("user_notes"),
                        university_id,
                        program_id,
                    ),
                )
                professor_id = str(cursor.lastrowid)
            db.execute(
                "UPDATE advisor_atlas_candidates SET saved_professor_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (professor_id, candidate_id),
            )
            # SCHOLARDOCX-0197: freeze the dossier alongside the five columns
            # above. Deleting the search cascades the candidate away, so
            # without this "saved" survives as a name and an email.
            self._write_saved_dossier(
                db,
                professor_id,
                user_id,
                candidate,
                run.get("professor_name")
                or " · ".join(
                    part
                    for part in (run.get("university_name"), run.get("department"))
                    if part
                )
                or None,
            )
            db.commit()
            row = db.execute("SELECT * FROM professors WHERE id = ?", (professor_id,)).fetchone()
            return dict(row)
