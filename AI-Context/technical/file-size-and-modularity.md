# File Size And Modularity

## Policy

- Target maximum source file length: 1000 lines.
- Temporary grace limit: 1150 lines.
- A feature may push a file from around 950 lines to around 1150 lines if the change is cohesive.
- After that feature, split the file before adding more work.

## Required Behavior For AI Agents

Before editing a large source file:

1. Check line count.
2. If over 900 lines, consider extraction.
3. If the task pushes it over 1000 lines, document why in the Jira task.
4. If it reaches over 1150 lines, split it before the task is complete unless the user pauses the work.

## Known Large Files

The current codebase has inherited large files above the target. Treat these as known debt, not permission to expand them further:

- `frontend/src/styles.css`
- `frontend/src/components/AdminView.tsx`
- `backend/app/services/ai_actions.py`
- `frontend/src/visual-refresh.css`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/App.tsx`

When a task touches one of these files, prefer extracting focused CSS, components, hooks, services, or helpers in the same area. Do not start a broad unrelated refactor just because the file is already large; keep cleanup scoped to the active Jira task.

## Completed Splits (reference pattern)

- `backend/app/services/research_paper_service.py` (SCHOLARDOCX-0221): 1840 →
  842 lines via mechanical mixin extraction — `research_paper_constants.py`
  (shared constants, single source), `research_paper_text.py`
  (`PaperTextMixin`: PDF/text utilities), `research_paper_processing.py`
  (`PaperProcessingMixin`: upload/retry/embedding), `research_paper_estimates.py`
  (`CostEstimateMixin`: 0218 ceilings), `research_paper_analyses.py`
  (`SavedAnalysesMixin`). Method bodies were moved byte-identical; the composed
  class keeps the original name and every method, so no importer changed.
  NOTE for future splits: keep methods that tests patch via module globals
  (e.g. `patch("...research_paper_service.AiService")`) in the main module, or
  update the patch paths in the same change.

## Still Over The Grace Cap (as of SCHOLARDOCX-0221)

- `backend/app/services/research_paper_service.py` is now 842 (fixed), but
  these remain and must be split before the next feature that grows them:
  `backend/app/db/models.py` (~1295), `frontend/src/components/
  ResearchExpertView.tsx` (~1640), `frontend/src/components/FloatingAssistant.tsx`
  (~1240), `frontend/src/components/ProjectWorkspace.tsx` (~1430),
  `frontend/src/components/sheet/useSheetPage.ts` (~1221),
  `backend/app/services/store.py` (~1186), `backend/app/services/ai_tokens.py`
  (~1254), `backend/app/services/advisor_atlas/service.py` (~1221),
  `frontend/src/components/admin/UsersTab.tsx` (~1372).

## Split Strategies

Frontend:

- Extract child components.
- Extract hooks.
- Extract schema and validation.
- Extract table columns, filters, and actions.
- Extract feature services.

Backend:

- Extract service methods.
- Extract repository modules.
- Extract schema files.
- Extract provider clients.
- Extract utility functions.
- Split large route files by resource or workflow.

Tests:

- Split fixtures.
- Split integration tests by workflow.
- Split unit tests by module.

## Anti-Patterns

- One file for all API routes.
- One dashboard component containing all cards, queries, filters, and modals.
- One service handling unrelated workflows.
- Provider-specific API calls mixed into application logic.
- Large constants embedded in components.
