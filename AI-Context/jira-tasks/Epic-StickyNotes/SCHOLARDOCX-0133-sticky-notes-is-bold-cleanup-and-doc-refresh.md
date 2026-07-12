# SCHOLARDOCX-0133: Sticky Notes — remove dead is_bold field and refresh data-model doc

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-07-12

## Summary

Remove the unused `is_bold` column from the sticky notes data model and all its references (model, store allow-list, frontend save payload, test fixture), and refresh the stale `data-model-draft.md` sticky_notes section so it matches the real model.

## Business Context

Links:

- Business file: n/a (maintenance)

Business value:

- Reduces dead code and schema noise. `is_bold` was removed from the UI in SCHOLARDOCX-0046 but never deleted from the data layer. Keeping it forces every note create/update to write a meaningless `false`, and misleads future agents reading the model doc.

## Functional Context

Links:

- Functional file: AI-Context/functional/feature-sticky-notes.md

Requirements:

- FR-8: Sticky Notes remain a lightweight local-only note/checklist/sketch feature. No behavior change to the user-facing feature.

## Technical Context

Links:

- Technical file: AI-Context/technical/data-model-draft.md
- Model: backend/app/db/models.py (StickyNotes, ~line 361)
- Store allow-list: backend/app/services/store.py (TABLE_COLUMNS["sticky_notes"], ~line 56)
- Frontend payload: frontend/src/components/StickyNotesView.tsx (~line 274)
- Test: backend/tests/test_store.py (~line 160)

Technical notes:

- `is_bold` is written but never read anywhere (verified via `rg "is_bold"` across backend + frontend; only 4 hits: model, allow-list, test fixture, frontend payload). No UI control, no renderer, no AI action references it.
- Existing SQLite DBs will retain the physical `is_bold` column. SQLAlchemy ignores extra columns on read and no longer writes the column on create/update once it leaves the model + allow-list, so orphan columns are harmless. A destructive table-rebuild migration on local user data is **out of scope** (privacy-first: don't risk user data to remove a nullable-defaulted column).
- The quota "discrepancy" between schema.py and connection.py was investigated and is **not a bug**: connection.py lines 611-631 are a legacy-value migration (`old → new`), and both files converge on the same baseline (free=3, general=5, pro=20, max=50). No quota change is needed.

## Scope

In scope:

- Delete `is_bold` column from `StickyNotes` model.
- Remove `is_bold` from `TABLE_COLUMNS["sticky_notes"]` allow-list.
- Remove `is_bold: false` from the frontend save payload.
- Remove `is_bold` from the `test_store.py` sticky fixture.
- Refresh `data-model-draft.md` sticky_notes section: drop `is_bold`, add `font`, `font_size`, `is_pinned`, `user_id`.

Out of scope:

- No destructive migration of existing SQLite tables (orphan `is_bold` columns are harmless).
- No quota value changes (no discrepancy exists).
- No user-facing behavior change.

## Acceptance Criteria

- `rg "is_bold"` across `backend/` and `frontend/` returns zero hits.
- `data-model-draft.md` sticky_notes section matches the live model field list (minus physical-only artifacts).
- Backend test suite still passes.
- Sticky notes still create / update / list / delete correctly via the existing API and UI.

## Implementation Plan

- [ ] Edit `backend/app/db/models.py`: remove the `is_bold` line from `StickyNotes`.
- [ ] Edit `backend/app/services/store.py`: remove `"is_bold"` from the sticky_notes allow-list set.
- [ ] Edit `frontend/src/components/StickyNotesView.tsx`: remove the `is_bold: false` line from the save `data` object.
- [ ] Edit `backend/tests/test_store.py`: remove `"is_bold": True` from the sticky fixture.
- [ ] Edit `AI-Context/technical/data-model-draft.md`: refresh sticky_notes field list.

## Unit Test Plan

Unit tests needed:

- Yes (update existing, no new test required)

Planned tests:

- Existing `test_sticky_notes_are_persisted_and_counted` continues to assert create/update/count works after the `is_bold` removal.

If no unit tests are needed, explain why:

- n/a

## File Size Check

Files expected to be edited:

- backend/app/db/models.py
- backend/app/services/store.py
- frontend/src/components/StickyNotesView.tsx
- backend/tests/test_store.py
- AI-Context/technical/data-model-draft.md

Line-count risk:

- Low (all edits are single-line removals or small doc refresh; no file approaches the 1000-line limit)

## Verification Plan

- Run `rg "is_bold" backend/ frontend/` → expect zero hits.
- Run backend pytest → expect all green, including the sticky note test.
- Confirm no other table/model accidentally shares the edited allow-list line.

## Completion Notes

Changed files:

- backend/app/db/models.py — removed `is_bold` column from `StickyNotes`
- backend/app/services/store.py — removed `is_bold` from `TABLE_COLUMNS["sticky_notes"]` allow-list
- frontend/src/components/StickyNotesView.tsx — removed `is_bold: false` from save payload
- backend/tests/test_store.py — removed `is_bold: True` from sticky fixture
- AI-Context/technical/data-model-draft.md — refreshed sticky_notes section (dropped is_bold, added user_id/body-overload/font/font_size/is_pinned notes)

Verification completed:

- `grep -rn "is_bold" backend/app backend/tests frontend/src` → zero matches (exit 1).
- `python -m pytest tests/test_store.py` → 14 passed, including `test_sticky_notes_are_persisted_and_counted`.
- Note: `frontend/dist/` still contains `is_bold` in a stale minified bundle; it is a build artifact that regenerates on the next `npm run build`, not source.

Unit tests added or updated:

- Updated `test_sticky_notes_are_persisted_and_counted` fixture (dropped `is_bold`). No new test needed — the change is pure dead-code removal with no new behavior.

Follow-ups:

- Optional: a one-off cleanup script to `ALTER TABLE sticky_notes DROP COLUMN is_bold` on existing local DBs. Skipped here because the orphan column is harmless (ignored on read, no longer written) and rebuilding user tables conflicts with the privacy-first "don't touch user data unnecessarily" stance. SQLite also requires a full table rebuild to drop a column, which is riskier than leaving it.
- Quota "discrepancy" between schema.py and connection.py investigated and confirmed **not a bug** — documented in Technical notes above. No action needed.
- Separate review scope (search, type filters, entity linking, sketch normalization, etc.) noted in the prior review; not part of this task.
