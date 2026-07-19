# SCHOLARDOCX-0148: Modal Blur Regression Fix + Guardrails

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-18

## Summary

The Create Project and Create Sheet modal backdrops were blurring the entire
viewport (including the global TopBar and the left Sidebar), violating the
visual-system blur-scoping rule established in SCHOLARDOCX-0145. The prior fix
was reverted by SCHOLARDOCX-0147-era CSS changes. Restore the scoped blur and
add guardrails (CSS comments + AGENTS.md rule + concrete spec) so the
regression stops recurring.

## Business Context

Links:

- Business file: none

Business value:

- A cohesive, premium modal experience where the backdrop blurs only the main
  work surface, keeping the TopBar and Sidebar crisp and interactive.

## Functional Context

Links:

- Functional file: AI-Context/technical/frontend-visual-system.md

Requirements:

- FR-1.1: Modals within the main content area blur only the main work surface.
- FR-1.2: The view's own headers are blurred; the global TopBar is not.
- FR-1.3: Modals sit ~160px from the top edge.

## Technical Context

Links:

- Technical file: AI-Context/technical/frontend-visual-system.md (canonical CSS)
- Prior task: Epic-UIThemeAndPolish/SCHOLARDOCX-0145-sheet-modal-blur-fix.md

Technical notes:

- `.modal-backdrop-main` is applied by `<Modal>` (scope="main"), which portals
  into `.main-content` (`position: relative`). Therefore `position: absolute;
  inset: 0` scopes the blur to the work surface. `position: fixed` was the bug.
- Regression introduced when `visual-refresh.css` `.modal-backdrop-main` was
  switched to `position: fixed; top/left/right/bottom: 0; min-height: 100vh`
  and `padding-top` reverted `160px → 80px`.
- **Third regression (2026-07-18):** sheet modals used inline backdrop divs
  inside `.section-body` (no portal). Agents copied class names from legacy files
  without portaling — blur covered table only, breadcrumbs stayed sharp.

### Why agents keep regressing (for future agents)

| Mistake | What agent thinks | Actual result |
|---------|-------------------|---------------|
| Copy `modal-backdrop-main` div from grep hits | "This is the project pattern" | Under-blur (section only) |
| Set `.modal-backdrop-main` to `position: fixed` | "Modals should cover viewport" | Over-blur (sidebar + TopBar) |
| Follow "use existing patterns" | RecordFormModal looks canonical | Propagates legacy inline backdrops |
| Inline `backdropFilter` styles | "Quick fix for one modal" | Bypasses shared CSS contract |

**Single source of truth for modal markup:** `Modal.tsx` + Create Project in
`ProjectWorkspace.tsx`. Everything else with inline backdrops is migration debt.

## Scope

In scope:

- Restore `.modal-backdrop-main` to `position: absolute; inset: 0;
  padding-top: 160px` in `visual-refresh.css` and `styles.css`.
- Add a loud DO-NOT-REGRESS comment block above the rule in both CSS files.
- Strengthen `frontend-visual-system.md` with the canonical, copy-pasteable CSS.
- Add a "Non-Negotiable UI Rules" section to `AGENTS.md`.

Out of scope:

- Any change to modal markup or the `<Modal>` component itself.
- New modal variants.

## Acceptance Criteria

- Create Project / Create Sheet modals blur only the main work surface.
- TopBar and Sidebar are NOT blurred when those modals are open.
- The modal panel sits ~160px from the top of the work surface.
- AGENTS.md and frontend-visual-system.md document the rule concretely.
- `npm run build` passes.

## Implementation Plan

- Edit `visual-refresh.css` `.modal-backdrop-main` (absolute/inset/160px) +
  comment block.
- Edit `styles.css` `.modal-backdrop-main` (match + comment).
- Update `frontend-visual-system.md` with canonical CSS + regression note.
- Add `AGENTS.md` "Non-Negotiable UI Rules" section.

## Unit Test Plan

Unit tests needed:

- No. Pure CSS/positioning + documentation change; verified visually and via
  production build.

## File Size Check

Files expected to be edited:

- frontend/src/visual-refresh.css
- frontend/src/styles.css
- AI-Context/technical/frontend-visual-system.md
- AGENTS.md

Line-count risk:

- Low.

## Verification Plan

- `npm run build` succeeds.
- Open Create Project and Create Sheet modals: blur covers only the main work
  surface; TopBar and Sidebar stay crisp and interactive; panel is lowered
  (~160px), not flush to the top.

## Completion Notes

Changed files:

- `frontend/src/visual-refresh.css` — restored `.modal-backdrop-main` to
  `position: absolute; inset: 0; padding-top: 160px`; added DO-NOT-REGRESS
  comment block.
- `frontend/src/styles.css` — matched `.modal-backdrop-main` (absolute/inset/
  160px) + comment.
- `AI-Context/technical/frontend-visual-system.md` — added canonical CSS block
  and explicit "regressed at least twice" warning.
- `AGENTS.md` — added "Non-Negotiable UI Rules" section with the modal blur
  scoping rule.
- `AI-Context/jira-tasks/Epic-UIThemeAndPolish/SCHOLARDOCX-0148-modal-blur-regression-guardrails.md`
  — this task.

Verification completed:

- `npm run build` clean.

Unit tests added or updated:

- None (CSS/docs only).

Follow-ups:

- Sheet modals (Email Configuration, Edit columns, Add column) were still
  rendering inline backdrops inside `.section-body` instead of portaling via
  `<Modal>`; fixed 2026-07-18 by wrapping those components in `<Modal>`.
- Context tightened 2026-07-18: AGENTS.md symptom/cause table, legacy file denylist,
  Modal.tsx file comment, scholardocx-coding skill exception for modals.
- **Migration debt** — still inline backdrops (convert to `<Modal>` when touched):
  `RecordFormModal.tsx`, `CsvImportModal.tsx`, `RowPeekPanel.tsx`,
  `StickyNotesView.tsx`, `HuntProfileModal.tsx`, `AddToTrackerModal.tsx`,
  `ProjectDashboard.tsx`, `AboutView.tsx`.
- If the blur ever covers the sidebar/TopBar again, revert
  `.modal-backdrop-main` to `position: absolute; inset: 0` per AGENTS.md.
