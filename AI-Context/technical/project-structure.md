# Project Structure

Where code lives. Keep this in sync when folders are added or renamed.

Agent skills live in `.agents/skills`, `.claude/skills`, and `.codex/skills`.

## Layout

```text

AI-Context/
  business/
  functional/
  jira-tasks/
  planbook/
  technical/
  workflows/

.agents/skills/
.claude/skills/
.codex/skills/

frontend/
  index.html
  package.json
  tailwind.config.js
  src/
    App.tsx
    main.tsx
    components/
      admin/
      advisor-atlas/
      news/
      sheet/
        sheetModel.ts        (types, templates, column migration)
        sheetFilters.ts      (sort/filter/search pipeline + view types)
        sheetUndo.ts         (pure history fns + useUndoRedo hook)
        sheetCsv.ts          (parseDelimited/CSV format, shared by paste)
        sheetPaste.ts        (quoted TSV parse/format for clipboard)
        useSheetPage.ts      (page state, persistence, CRUD, bulk ops)
        sheetColumns.ts      (lettered columns, rename/insert/retype/remove)
        useColumnQuickEdits.ts (header-level column edits, one undo step each)
        ColumnHeaderCell.tsx (header: sort, inline rename, column menu)
        SheetTabsBar.tsx     (the project's sheets as tabs under the grid)
      projects/
        ProjectsHome.tsx          (Projects root: cards, create/edit)
        ProjectSheetsSection.tsx  (sheet cards inside a project)
        CreateSheetModal.tsx      (name + blank/template gallery)
        projectIdentity.ts        (stable colour + monogram per project)
        SheetTable.tsx       (grid orchestrator, keyboard flow)
        SheetTableRow.tsx    (memoized row)
        InlineCellEditor.tsx (in-cell editor, commit-and-move)
        FilterMenu.tsx       (per-column filter popup)
        SheetToolbar.tsx
        SheetFooter.tsx
        SelectionToolbar.tsx (bulk copy/duplicate/delete/set-value)
        ColumnEditor.tsx
        RecordFormModal.tsx
        RowPeekPanel.tsx
        CsvImportModal.tsx
        DateColorConfigModal.tsx
        __tests__/           (vitest unit tests for the pure modules)
      AboutView.tsx
      AdminView.tsx
      CalendarMonthView.tsx
      FloatingAssistant.tsx
      ProjectDashboard.tsx
      NotificationsView.tsx
      ProfileView.tsx
      ProjectWorkspace.tsx
      SheetRecordFields.tsx
      StickyNotesView.tsx
    lib/
      api.ts
      email.ts
    styles.css

backend/
  requirements.txt
  pytest.ini
  app/
    api/         # auth.py (auth + plans + checkout), webhooks.py (Polar svix),
                 # admin.py, ai_tokens.py, dependencies.py, ...
    core/        # config.py (Settings incl. polar_*), compat.py
    db/          # models.py (SQLAlchemy), connection.py (init + migrations), schema.py (seed SQL)
    services/    # store.py, sheet_templates.py (starting columns for a new sheet), ai_tokens.py (grant_purchased), admin.py, mcp_server.py + connected_apps.py (connected apps), ...
  tests/

workspace/
  db/
  media/
```

## Keeping this file honest

Update it when code structure changes.

- **Sticky Notes (SCHOLARDOCX-0201)**: the feature lives in
  `frontend/src/components/sticky/` — `StickyNotesView` (container: data,
  writes, shortcuts, undo), `NoteCard`, `NoteComposer`, `NoteViewer`,
  `NoteToolbar`, `TagInput`, `SketchCanvas`, and two stylesheets split by role
  (`sticky-notes.css` = board and card, `sticky-controls.css` = everything
  surrounding a note). All rules — body parsing, tag normalization, due-date
  bucketing, search, filter, sort, group, reorder — are pure functions in
  `frontend/src/lib/stickyNotes.ts` with tests in
  `frontend/src/lib/__tests__/stickyNotes.test.ts`. Components render and
  handle input only. Follow this split when extending the feature: it is the
  only reason any of the behaviour is testable in a repo with no DOM test
  harness, and it is the same arrangement as `lib/games/`.
