# SCHOLARDOCX-0048: Whiteboard UI Scaffolding

Status: In Progress

Epic: Epic-Whiteboard

## Goal
Implement the UI scaffolding for the new "Whiteboard" tab, matching the provided sleek dark-panel design with a dot-grid canvas. This prepares the visual structure before implementing drawing functionality.

## Context
- **Business**: Provide a flexible space for students/researchers to visually map out ideas, research plans, and relationships.
- **Functional**: The UI must include a central canvas, top tools palette, right properties panel, and bottom status bar.
- **Technical**: Create `WhiteboardView.tsx` and `whiteboard.css`. Update `App.tsx` navigation.

## Plan
1. Create this Jira task.
2. Add `whiteboard.css` for the dark theme and grid canvas.
3. Build `WhiteboardView.tsx` with static placeholders for tools and properties.
4. Update `App.tsx` navigation array.

## Decisions
- Used the `Presentation` or `Square` icon for the tab.
- Styled the panels strictly to the provided mockup's dark gray theme, contrasting with the main app's lighter theme.

## Progress Notes
- Writing UI code.
