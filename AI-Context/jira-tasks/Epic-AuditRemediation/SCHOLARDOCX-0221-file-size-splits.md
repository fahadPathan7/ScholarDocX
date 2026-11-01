# SCHOLARDOCX-0221: File-size splits for over-cap modules (audit batch 5)

Status: Review

Owner: AI Agent

Epic: Epic-AuditRemediation

Created: 2026-11-01

## Summary

Execute the file-size-rule splits that prior tasks demanded but deferred: the
worst offenders over the 1150-line grace cap get split into cohesive modules
with backward-compatible re-exports, so behavior is unchanged and importers
(including tests) keep working.

## Business Context

Links:

- Business file: n/a (maintainability debt, no user-visible change)

Business value:

- Keeps the codebase maintainable by AI assistants (project constraint); unblocks future features in files the size rule freezes.

## Functional Context

Links:

- n/a — pure refactor, zero behavior change intended.

## Technical Context

Links:

- Technical file: [../technical/file-size-and-modularity.md](../../technical/file-size-and-modularity.md)

Technical notes:

- Split by moving cohesive blocks to new modules and re-exporting from the old
  path (`from x import y` shims) so no importer changes.
- `make guard-billing` / `make guard-context` must stay green — moved functions
  keep their names; the drift guard re-indexes symbols.
- Priority order (worst first): `services/research_paper_service.py` (1840),
  `frontend/src/components/ResearchExpertView.tsx` (~1640),
  `frontend/src/components/FloatingAssistant.tsx` (~1240),
  `frontend/src/components/ProjectWorkspace.tsx` + `sheet/useSheetPage.ts`
  (0202/0203's explicit demand) — take as many as fit the batch.

## Scope

In scope:

- Mechanical, behavior-preserving splits with re-export shims for the files above (as many as the batch fits).
- Update `technical/file-size-and-modularity.md` Known Large Files list.

Out of scope:

- Any behavior change, renaming, or "cleanup while we're in here".

## Acceptance Criteria

- Each split file lands under 1000 lines (or materially closer with documented remainder).
- Zero import-site changes required (shims keep old paths working).
- tsc + compileall + both guards green; no test content changes needed.

## Unit Test Plan

Unit tests needed:

- No — pure refactor; existing tests unchanged must keep compiling (import paths preserved by shims). Verified via py_compile of the suite's imports touched.

If no unit tests are needed, explain why:

- No behavior change; compile/typecheck + guards are the verification.

## File Size Check

Files expected to be edited:

- The split files + new sibling modules (e.g. `research_paper_estimates.py`, `useAssistantHistory.ts`).

Line-count risk:

- Low after completion (that is the point).

## Verification Plan

- `npx tsc --noEmit`; `python -m compileall -q app`; guard scripts; line-count report before/after.

## Completion Notes

Changed files:

- `backend/app/services/research_paper_service.py` — 1840 → 842 lines.
- New: `research_paper_constants.py` (187), `research_paper_text.py` (259, PaperTextMixin), `research_paper_processing.py` (512, PaperProcessingMixin), `research_paper_estimates.py` (138, CostEstimateMixin), `research_paper_analyses.py` (150, SavedAnalysesMixin).
- `AI-Context/technical/file-size-and-modularity.md` — completed-split reference + still-over-cap list.

Verification completed:

- Method parity: 33 methods across the family = 33 in the original; interface check confirms every public/private method on the composed class and the re-exported constants (`PREDEFINED_PROMPTS`, `EMBEDDING_MODEL`) import from the original path.
- Byte-identical move: segments sliced verbatim from the original and reassembled with exact-coverage assertion; no hand edits between slice and write.
- `python -m compileall -q app` OK; `check-provider-call-billing.py` (charges moved verbatim) + `check-context-drift.py` ok.
- Test-patch compatibility preserved: `analyze_paper` and `_extract_paper_metadata` (the two methods referencing `AiService`, which tests patch via module globals) stayed in the main module; `httpx.AsyncClient` patches target the shared httpx module and are unaffected.

Unit tests added or updated:

- None (pure refactor; existing tests unchanged and still compile — import paths preserved). Per the story's test-plan note.

Follow-ups:

- Remaining over-cap splits not done in this batch (budget): models.py, ResearchExpertView.tsx, FloatingAssistant.tsx, ProjectWorkspace.tsx + useSheetPage.ts, store.py, ai_tokens.py, advisor_atlas/service.py, UsersTab.tsx — listed in file-size-and-modularity.md.
