# SCHOLARDOCX-0228: Calendar modal hugged the sidebar and ran off the bottom

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

`.modal-panel.calendar-modal-panel` was sized in viewport units (`min(1180px, 94vw)`,
`max-height: 80vh`), but the backdrop lives inside `.main-content` (viewport minus
the 280px sidebar), so on a ~1470px screen the panel started 5px from the sidebar,
touched the right edge, and ended at the bottom edge.

## Change

`styles.css`: width `min(1080px, calc(100% - 64px))`, max-width `calc(100% - 64px)`,
max-height `calc(100% - 28px)` — sized against the work surface, so it keeps
margins on every side and the content scrolls inside on short screens. Modal
backdrop pattern (`<Modal>`, 80px top offset) untouched.

## Verification

Playwright with a mocked API at 1470x900, 1280x650 (panel centered with margins,
inside the work surface) and 390x750 (unchanged full-width mobile sheet). Other
`.modal-panel` variants still use viewport units (`vw`/`vh`) and may show the
same offset; candidates for the same fix.
