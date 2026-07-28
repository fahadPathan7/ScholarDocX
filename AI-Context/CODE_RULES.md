# CODE_RULES.md

These are repository-wide coding rules for ScholarDocX.

## Architecture Rules

- Keep the product secure personal workspace.
- Use PostgreSQL (Supabase) for structured application data.
- Use the secure file system for uploaded and generated files.
- Keep AI providers behind backend service boundaries. UI code should not call GLM or Tavily directly.
- Treat external AI/search APIs as optional integrations that require user-provided API keys.
- Do not add remote persistence, telemetry, analytics, or cloud sync without explicit context updates and user approval.

## Design Principle: Capped Lists Use FIFO Eviction

Any feature that keeps a running list/history of items per user and needs a
maximum size follows the same two rules, established SCHOLARDOCX-0178:

1. **Fixed caps are fixed.** A cap that exists purely to bound storage/noise
   (not to gate a paid feature) is a hardcoded constant, not an
   admin-configurable role limit. Document it as information in the Admin
   panel's **Info tab** ("Save & Storage Caps" section) — the Info tab is
   for fixed boundaries common to every user, never for admin-editable
   settings (those belong in Role Limits / Settings instead; see
   SCHOLARDOCX-0178's removal of the Research Expert library cap from the
   Info tab for exactly this reason — it's admin-configurable, so it
   doesn't belong there).
2. **At the cap, the newest item evicts the oldest — never the reverse, and
   never a rejection.** A "save"/"create" action that would push the
   count over the cap deletes the single oldest existing item first, then
   proceeds. The user is never blocked from creating a new item because an
   old one is in the way; they lose visibility into the oldest one instead
   (which is the tradeoff a bounded *history* implies — this differs from
   the Opportunity Library and Research Expert saved-analysis caps, which
   are bounded *collections* the user curates and are correctly a hard
   reject instead, since silently deleting a user's deliberately-saved item
   would be wrong).

Current instances of this pattern:
- **Scholarship Hunt "Previous Searches"** (`ScholarshipDeepHuntRepository.
  create_run` / `_evict_oldest_over_cap`, backend): capped at 10 runs per
  user. Any Library opportunities the user saved from an evicted run are
  detached (`deep_hunt_run_id` set to NULL), never deleted — see
  `_detach_saved_opportunities`.
- **Ask AI chat history** (`FloatingAssistant.tsx`, `MAX_HISTORY`,
  frontend-only / browser `localStorage`): capped at 10 sessions per user.
  Newest-first list, sliced to the cap on every save — the tail (oldest)
  falls off.

When adding a new capped history feature, follow this same shape: a
named constant, eviction on the create path (not a separate cleanup job),
and a row in the Info tab's "Save & Storage Caps" table.

## Recommended Stack

Initial recommended stack from project context:

- Frontend: Next.js or React/Vite with Tailwind CSS.
- Backend: Python FastAPI.
- Database: PostgreSQL (Supabase).
- File storage: local workspace directory.
- AI integrations: GLM AI API and Tavily API.

Final stack selection must be recorded in:

- [AI-Context/technical/stack-and-runtime.md](technical/stack-and-runtime.md)
- [AI-Context/business/decisions.md](business/decisions.md)

## File Size Rules

- Target: keep every source file under 1000 lines.
- Grace: a file may temporarily reach 1150 lines when a feature starts near the limit and the added work is cohesive.
- After that feature is complete, split the file before starting another feature.
- If a file is over 900 lines before editing, consider extraction first.
- If a file is over 1000 lines after editing, document why in the Jira task.
- If a file is over 1150 lines after editing, split it as part of the same task unless the user explicitly pauses the work.

Good split targets:

- UI components
- Hooks
- API route handlers
- Services
- Repositories
- Schemas
- Validators
- Constants
- Test fixtures
- Feature-specific utilities

## Blast Radius & Related Tasks

- **Dependency Scanning**: Before modifying any function, endpoint, UI component, or database schema, you MUST perform a global search (`grep_search`) to find all dependents.
- **Symmetric Updates**: If you update a data model, you must update the related backend routes, frontend types, UI inputs, and tests. Never do one task while ignoring related layers.
- **Side-Effect Prevention**: When changing shared components (e.g., forms, buttons, layout containers), ensure the changes do not break other pages that consume them.

## Context-First Development

For every new feature or feature modification:

1. Update relevant AI-Context files.
2. Determine if the feature fits in an existing Epic in `AI-Context/jira-tasks/` (e.g., `Epic-SheetRecords/`). If not, create a new Epic directory with a `README.md`.
3. Create or update the Jira task file (story) **inside** the relevant Epic directory.
4. Implement code.
5. Run focused verification.
6. Update the Jira task with completion notes.

### STRICT ENFORCEMENTS
- **NO WORK WITHOUT JIRA**: Every piece of major work (features, large refactors, UI updates) MUST have an associated Jira story in `AI-Context/jira-tasks/`. Do not start writing code for major changes without first creating the task file inside an Epic.
- **MANDATORY CONTEXT UPDATE**: After every feature or code update, the AI Agent MUST update the relevant AI-Context files (for example `technical/frontend-visual-system.md`, `technical/api-boundaries.md`, `technical/project-structure.md`, or `technical/security-privacy.md`) with any new architectural or design decisions. Do not end the session without updating the context.

## Documentation Rules

- Keep docs short enough for AI agents to load cheaply.
- Prefer IDs for requirements and decisions.
- Link related context files.
- Move historical details into decision logs instead of bloating feature specs.

## Security Rules

- Never commit `.env` files with real values.
- Never print API keys in logs.
- Store only file paths and metadata in the database; store file bytes in Supabase Storage or local media folders unless a later decision changes this.
- Validate uploaded file types and paths.
- Prevent path traversal when reading or writing secure files.
- Keep professor, university, essay, transcript, and outreach data private by default.
- **Role-Based Access Control (RBAC)**: Every new feature, API endpoint, and UI view MUST have explicit roles defined and implemented.
- Do not create endpoints without appropriate authorization decorators/checks (e.g., admin, pro, user).
- Do not create UI components that expose actions the user's role should not have access to.

## Testing Rules

- Each feature should include unit tests when it introduces meaningful behavior, data transformations, validation, persistence logic, or integration boundaries.
- If unit tests are not needed for a feature, explain why in the Jira task.
- Add tests around business-critical behavior, storage behavior, and data transformations.
- For UI work, test main flows and failure states.
- When creating a new page or tab component, it is MANDATORY to include a unit test verifying that it correctly accepts and handles the `refreshTrigger` prop for state-preserving data refreshes.
- For AI integrations, test provider boundaries with mocks.
- For file operations, test path validation and workspace initialization.
- Do not leave feature work complete with "tests skipped" unless the reason is recorded in the task file.

### STRICT: Run scoped tests, not the whole suite, for a single feature change

This backend suite runs against a real shared database with no ephemeral
per-run isolation (see the strict rule below) — every additional test file
in a verification run is more real network round trips, more runtime, and
more surface area for the shared-state races described below. After
implementing or fixing one feature, run only the test file(s) that cover
that feature (and any file whose behavior you directly changed). Do not
proactively run the entire backend or frontend suite "to be safe" — a full
run is expensive on this database and is the user's call to make, not the
default after every change. Run the full suite only when the user
explicitly asks for it (e.g. "run everything," "run the whole suite").

### STRICT: Never permanently mutate shared/global state for a test (SCHOLARDOCX-0178 incident)

This backend test suite runs against a real, shared database (`tests/conftest.py` loads the project's own `.env`/`DATABASE_URL` — there is no separate ephemeral test database). Per-user rows are fine to create and clean up (see `cleanup_user_records`), but tables that hold **global, admin-configured, shared** state — `app_settings`, `role_limits`, `ai_models`, `ai_token_packs`, and anything else with no `user_id` scoping — are a different category entirely: a write there is not test data, it is a live change to the running application, visible to every real user, until something changes it back.

This is not hypothetical. It happened: a test inserted `app_settings.brave_call_cost_per_hit_usd = '0.025'` and another set `jina_call_cost_usd = '0.02'` to exercise an "admin override" code path, asserted against it, and never restored the row — both stayed corrupted in the live database indefinitely (silently overcharging real users) until caught by inspecting the Admin panel. Separately, a test zeroed out `role_limits.can_use_advisor_atlas` for **every role** (including `pro_user`, whose real default is `1`) to test a fallback message, and two more tests each zeroed a `general_admin` permission (`admin_manage_password_resets`, `admin_manage_plan_requests`) — none restored their rows, so real Pro users lost Advisor Atlas access and real general-admins lost those permissions in production until caught and fixed.

**The rule:**
- Before a test writes to a shared/global table, it MUST first read (snapshot) the current value(s) of every row it is about to touch.
- In a `finally` block, it MUST write those exact snapshotted values back — not a hardcoded "default." The value that was there before the test ran might be a real admin's deliberate configuration, and code-level defaults (`DEFAULT_ROLE_LIMITS`, `schema.py`'s `SEED_SQL`) are only what a *fresh install* starts with, not necessarily what is live right now.
- If a helper's job is to "ensure a default row exists" (a fresh-install seed shim), it must use `ON CONFLICT ... DO NOTHING`, never `DO UPDATE`, so it can never overwrite a value that is already there for any reason.
- Prefer `monkeypatch`/mocking the reading function (e.g. `monkeypatch.setattr(ai_tokens, "get_brave_call_cost_per_hit_usd", lambda session: 0.025)`) over a real database write whenever the test's actual goal is "verify this code path uses whatever value the getter returns" — this is both safer and simpler, and several tests in this exact area already use this pattern correctly. Only touch the real row when the test is specifically about the persistence/lookup behavior itself.
- Never call a real destructive admin action (e.g. `AdminService.reset_role_limits`, anything that resets/deletes a whole role's or the whole system's configuration) against the shared database without snapshotting the full prior row set and restoring it in `finally`.
- When reviewing or writing a test that touches `app_settings`, `role_limits`, `ai_models`, or `ai_token_packs`, treat a missing snapshot/restore as a blocking defect, not a style nit.

If you discover a table value that doesn't match its code-level default, do not assume it is corruption and "fix" it back to the default — it may be genuine admin configuration. Only restore a value when you have direct evidence it was set by a test (e.g. it exactly matches a literal from test source, or a test unconditionally zeroed every row for a feature rather than scoping to the one role it claimed to test).

**Parallel test execution makes this rule sharper, not softer.** `pytest.ini` runs the suite with `pytest-xdist` (`-n auto --dist loadscope`, for local speed on multi-core machines) — `loadscope` keeps all tests within one *file* on the same worker (so a file's own fixed-UUID tests still run one at a time), but different files now run **concurrently in separate processes**. Two files that both touch the same global row (e.g. `app_settings.brave_call_cost_per_hit_usd`) can now race in a way they never could under old-style serial execution. This makes the snapshot/restore requirement above load-bearing for correctness under parallelism, not just tidiness — a test that mutates a global row and restores it a few lines later can still collide with a concurrent worker mutating the same row mid-window. When adding a new test that must touch shared/global state, prefer `monkeypatch` over a real write even more strongly than the guidance above already suggests, specifically because of this concurrency exposure.

## UI/UX Rules

- Forms with many fields must be scrollable and fit within viewport constraints.
- Use `max-height: calc(100vh - [offset])` for forms that may grow beyond screen height.
- Keep form headers and submit buttons visible (fixed) while field content scrolls.
- Always validate user input before submission and show clear error messages.
- Provide loading states during async operations (saving, fetching, etc.).
- Disable action buttons during operations to prevent double-submission.
- Support keyboard shortcuts for common actions (Escape to close, Enter/Ctrl+Enter to submit).
- Show empty states with helpful guidance when content is missing.
- Auto-save critical user data to prevent data loss.
- Clear form state on cancel or successful submission.
- Provide visual feedback for success and error states.
- Use consistent styling for validation errors, success messages, and empty states.

### Preventing Race Conditions in Async Form Submissions

**Problem**: Multiple rapid clicks on submit buttons can trigger duplicate API calls, creating duplicate records or inconsistent state.

**Solution Pattern**: Implement submission state tracking with button disabling and visual feedback.

**Required Implementation Steps**:

1. **Add submission state**: Create a boolean state variable (e.g., `isCreatingSheet`, `isCreatingProject`, `isSaving`)
2. **Guard the handler**: Check the state at the start of the async handler and return early if already in progress
3. **Wrap in try-finally**: Set state to `true` at start, `false` in finally block (ensures cleanup on error)
4. **Disable buttons**: Disable both submit and cancel buttons during submission using the state
5. **Update button text**: Change button text to show progress (e.g., "Creating...", "Saving...")
6. **Add error handling**: Catch errors, log them, show user feedback, and ensure state resets

**Code Example**:

```typescript
// 1. Add state
const [isCreating, setIsCreating] = useState(false);

// 2. Update async handler
const handleSubmit = async (event: FormEvent) => {
  event.preventDefault();
  if (isCreating) return; // Guard against duplicate calls
  
  setIsCreating(true);
  try {
    await api.post('/endpoint', data);
    // Success handling
    onToast?.("Created successfully.");
    closeModal();
  } catch (error) {
    console.error("Error creating:", error);
    onToast?.("Failed to create. Please try again.");
  } finally {
    setIsCreating(false); // Always reset state
  }
};

// 3. Update button UI
<button 
  type="submit" 
  disabled={isCreating}
  className="primary"
>
  {isCreating ? "Creating..." : "Create"}
</button>

<button 
  type="button" 
  disabled={isCreating}
  onClick={closeModal}
  className="secondary"
>
  Cancel
</button>
```

**When to Apply**:
- All form submission handlers that perform async operations (POST, PUT, PATCH, DELETE)
- Any user-triggered action that modifies server state or creates/updates records
- Modal forms, inline editors, and any UI that allows rapid repeated clicks

**Applied Examples in Codebase**:
- `ProjectWorkspace.tsx`: `createProject()`, `createSheet()`
- Pattern should be used for: creating records, updating data, deleting items, uploading files

### Visual Design and Symmetry

- **Form layouts must be symmetric and visually balanced**
- Use CSS Grid or Flexbox with consistent gaps and alignment
- All form elements in a row should have equal heights and aligned baselines
- Input fields, dropdowns, and buttons should align vertically and horizontally
- Use consistent spacing: gaps, padding, and margins should follow a scale (e.g., 8px, 12px, 16px, 24px)
- Group related controls together with consistent spacing
- Buttons should have consistent sizing and spacing
- Icons should be vertically centered with their labels
- Multi-column layouts should have equal column widths unless intentionally asymmetric
- Modal dialogs should be centered with balanced padding on all sides
- Action buttons (Save, Cancel, Done) should be consistently positioned (typically bottom-right)
- Use visual hierarchy: primary actions prominent, secondary actions subtle
- Maintain consistent border-radius, shadows, and visual weight across similar elements

### ScholarDocX Theme & Preferences

- **Color Palette**: Stick to the established natural, academic palette:
  - Backgrounds: `#f6f0e7` (paper), `#fcf9f2`, `#ffffff`.
  - Dark/Ink: `#17201d` (primary text, sidebar background), `#173f46` (atlas ink).
  - Accents: Teals (`#1f4f5a`, `#2f6d7a`, `#38a37f`, `#2f7d74`) and Golds/Warning (`#d99a3d`, `#c98828`).
  - Muted Text: `#65756d`, `#70827f`.
- **Typography**: The primary font is **Inter** (`font-family: Inter, ui-sans-serif, system-ui, ...`). Do not introduce new font families.
- **Visual Style**: 
  - Use subtle radial and linear gradients for headers and hero sections (e.g., `#fcf9f2` with teal/blue radial highlights).
  - Use `backdrop-filter: blur(18px)` and semi-transparent white backgrounds (`rgba(255, 255, 255, 0.82)`) for floating headers or cards.
  - Border radii are typically `8px` for buttons/cards, `12px` to `18px` for larger panels or specific hero cards.
  - Box shadows are soft and layered (e.g., `box-shadow: 0 10px 26px rgba(23, 32, 29, 0.06)`).
  - **Modals & Dialogs**: 
    - **Scope**: Modals should generally be scoped to the `<main>` content area (e.g., using `position: absolute; inset: 0;` within a relative container) so they do NOT shadow the left navigation panel or the top header.
    - **Backdrops**: Backdrops must use a dark, blurred radial gradient overlay (e.g., `radial-gradient(circle, rgba(15, 23, 20, 0.4) 0%, rgba(15, 23, 20, 0.55) 100%)`) with `backdrop-filter: blur(8px) saturate(110%)`.
    - **Panels**: Modal panels should use a layered box-shadow to stand out heavily (e.g., `box-shadow: 0 20px 25px -5px rgba(15, 23, 20, 0.15), 0 10px 10px -5px rgba(15, 23, 20, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)`).
- **Avoid Tailwind Utility Clutter**: The project uses standard CSS (e.g., `styles.css`, `advisor-atlas.css`) heavily. Do not aggressively switch to Tailwind utilities if a semantic CSS class fits the existing pattern.
