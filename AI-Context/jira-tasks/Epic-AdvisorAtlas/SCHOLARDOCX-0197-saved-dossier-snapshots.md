# SCHOLARDOCX-0197: Deleting a search destroyed the dossier of a professor you had saved

Status: Completed

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

User noticed that deleting a search from history took the dossier of a saved
professor with it, and asked the better question behind it: *"then what is the
diff between history and saved profs?"*

They were right, and the answer exposed that the two were barely different.

`advisor_atlas_candidates.run_id` is `ON DELETE CASCADE`, so deleting a run
removes its candidates and, through their own cascades, the evidence,
publications and dossier rows. The `professors` row survived — separate table,
no link to the run — but `save_to_professors` had only ever copied **five
columns**: name, title, email, profile URL and research summary.

So what "saved" kept was five fields plus a pointer that broke:

| | Kept | Lost on deleting the search |
|---|---|---|
| Before | name, title, email, profile URL, research summary | match score, evidence confidence, recruitment state, every evidence excerpt and source, publications, scholarly record, funding, lab and advisees, opportunity outlook, risk flags, coverage, decision snapshot, research bridge, method bridge, trajectory, application fit, verification questions, next actions |

The word promised durability the implementation did not deliver. The intended
split — history is the **work** (expendable, re-runnable), saved is the
**keep** (durable, independent of how it was found) — did not exist.

## What changed

Saving now freezes the whole dossier alongside the professor.

- New `advisor_atlas_saved_dossiers` (one row per professor, `UNIQUE`), holding
  the entire `get_candidate` payload — candidate row, intelligence, evidence,
  publications, dossier sections — plus `saved_at` and a `source_run_label` so
  the provenance survives the run that produced it.
- Its own table rather than a column on `professors`, because `professors` is
  served by the generic CRUD list route: a blob there would ship on every
  unrelated list call.
- `create_all` builds it on boot; no migration needed.
- Re-saving overwrites. The user asked for the current state of the research,
  and keeping the older copy would leave two answers to "what did I save?".

Reading it back:

- `GET /advisor-atlas/saved-professors/{id}/dossier` returns the frozen copy.
- The library prefers the live candidate and falls back to the snapshot, so a
  card stays clickable after its search is deleted.
- `AdvisorDossierDrawer` takes `savedProfessorId` as an alternative to
  `candidateId`. A snapshot is read-only: Refresh evidence and Save to
  professors act on a live candidate, so they are **absent rather than
  disabled**, and a notice states the date and the search it came from.

`_json_safe` (`default=str`) is used for the snapshot because a candidate read
from storage carries `datetime` objects — the exact type that silently killed
every deep-research pass in SCHOLARDOCX-0190. A snapshot must never fail on a
type.

## The delete dialog was also lying by omission

It said "All discovered candidates will be removed", which read as *everything
goes*. Now it says what actually happens: the search's professors go, the ones
you saved stay, with the dossier as it was when you saved them.

## What the two things mean now

- **History** — the searches you ran and everything they found. Expendable;
  delete freely, re-run when you want fresh results. Capped at 100.
- **Saved professors** — the advisors you chose, each with the dossier as it
  stood when you kept them. Independent of history. Capped at 100.

## Technical Context

- `db/models.py`: `AdvisorAtlasSavedDossiers`.
- `advisor_atlas/repository.py`: `_json_safe`, `_write_saved_dossier`,
  `get_saved_dossier`; `save_to_professors` writes the snapshot inside the same
  transaction as the professor row; `list_saved_professors` returns
  `has_dossier`, `dossier_saved_at`, `source_run_label`.
- `api/advisor_atlas.py`: `GET /saved-professors/{id}/dossier`.
- `advisorAtlasApi.ts`: `SavedDossier`, `getSavedDossier`, the new
  `SavedProfessor` fields.
- `AdvisorDossierDrawer.tsx`: `savedProfessorId`, archived notice, actions
  hidden in archive mode.
- `AdvisorSavedProfessors.tsx`: falls back to the snapshot; the unopenable
  state now only applies to professors saved before this change.
- `AdvisorAtlasView.tsx`: `savedDossierId` state, honest delete copy.
- `advisor-atlas-intelligence.css`: `.atlas-archived-notice`.

## Scope

In scope: the files above.

Out of scope:
- **Backfilling snapshots for professors already saved.** Their candidates may
  be gone, and where they still exist a snapshot would be dated today rather
  than when the user actually saved them — a false provenance. Those cards read
  "No dossier kept" and re-saving from a live dossier fixes them.
- Diffing a snapshot against a fresh run ("what changed since you saved this").
  Real value, considerably more work.

## Verification Plan

- `_json_safe` round-trip on a storage-shaped candidate carrying `datetime`
  objects: serialises, and intelligence / evidence / publications / dossier all
  survive.
- Model check: table name, columns, and both foreign keys resolving with
  `ON DELETE CASCADE` (so removing a professor takes their snapshot, and
  deleting a user takes both).
- `npx tsc --noEmit` clean; backend compiles.

## Completion Notes

Changed files: as listed under Technical Context.

Follow-ups:
- Storage grows with the library: a dossier is roughly 30–60 KB, so a full
  100-professor library is a few MB per user. Acceptable, but worth watching
  if the cap is ever raised.
- A snapshot ages silently. It states its date, which is honest, but there is
  no prompt to refresh a saved professor whose research has moved on.
