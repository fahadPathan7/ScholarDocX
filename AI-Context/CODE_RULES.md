# CODE_RULES.md

These are repository-wide coding rules for ScholarDocX.

## Architecture Rules

- Keep the product local-first.
- Use SQLite for structured application data unless context is updated and the user approves a different local database.
- Use the local file system for uploaded and generated files.
- Keep AI providers behind backend service boundaries. UI code should not call GLM or Tavily directly.
- Treat external AI/search APIs as optional integrations that require user-provided API keys.
- Do not add remote persistence, telemetry, analytics, or cloud sync without explicit context updates and user approval.

## Recommended Stack

Initial recommended stack from project context:

- Frontend: Next.js or React/Vite with Tailwind CSS.
- Backend: Python FastAPI.
- Database: SQLite.
- File storage: local workspace directory.
- AI integrations: GLM AI API and Tavily API.

Final stack selection must be recorded in:

- [AI-Context/technical/stack-and-runtime.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/stack-and-runtime.md)
- [AI-Context/business/decisions.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/decisions.md)

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

## Context-First Development

For every new feature or feature modification:

1. Update relevant AI-Context files.
2. Create or update the Jira task file.
3. Implement code.
4. Run focused verification.
5. Update the Jira task with completion notes.

## Documentation Rules

- Keep docs short enough for AI agents to load cheaply.
- Prefer IDs for requirements and decisions.
- Link related context files.
- Move historical details into decision logs instead of bloating feature specs.

## Security Rules

- Never commit `.env` files with real values.
- Never print API keys in logs.
- Store only file paths and metadata in SQLite; store file bytes in local media folders unless a later decision changes this.
- Validate uploaded file types and paths.
- Prevent path traversal when reading or writing local files.
- Keep professor, university, essay, transcript, and outreach data private by default.

## Testing Rules

- Each feature should include unit tests when it introduces meaningful behavior, data transformations, validation, persistence logic, or integration boundaries.
- If unit tests are not needed for a feature, explain why in the Jira task.
- Add tests around business-critical behavior, storage behavior, and data transformations.
- For UI work, test main flows and failure states.
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
