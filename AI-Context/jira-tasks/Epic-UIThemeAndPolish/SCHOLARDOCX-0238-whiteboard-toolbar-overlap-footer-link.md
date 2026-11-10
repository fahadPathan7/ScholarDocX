# SCHOLARDOCX-0238: Whiteboard toolbar overlapped the properties panel; footer credit link

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Changes

- Whiteboard: the toolbar was centered on the whole view (`left: 50%`, no wrapping), so on a ~1000px canvas it ran under the
  260px docked properties panel. `.wb-toolbar` now sizes to its content, may wrap onto a second row, and is capped to the canvas;
  with the panel open (`.panel-open`, from 768px up; phones use the overlay panel) it centers over the visible canvas only and keeps
  clear of the panel. `whiteboard.css`, `WhiteboardView.tsx`.
- Landing footer: the "Fahad Pathan" credit links to https://fahadpathan7.github.io/ (new tab, `rel="noopener noreferrer"`),
  styled as an underlined serif italic link. `LandingFooter.tsx` / `.css`.

## Verification

Playwright with a mocked board at 1100, 1180, 1280, 1440 px, panel open: no overlap at any width; the toolbar wraps to two rows
when the canvas is under ~730px and stays one row at 1440. Footer link checked in the markup only.
