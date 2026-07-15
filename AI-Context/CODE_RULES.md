# CODE_RULES.md

These are repository-wide coding rules for ScholarDocX.

## Architecture Rules

- Keep the product secure personal workspace.
- Use PostgreSQL (Supabase) for structured application data.
- Use the secure file system for uploaded and generated files.
- Keep AI providers behind backend service boundaries. UI code should not call GLM or Tavily directly.
- Treat external AI/search APIs as optional integrations that require user-provided API keys.
- Do not add remote persistence, telemetry, analytics, or cloud sync without explicit context updates and user approval.

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
