# SCHOLARDOCX-0239: Polish Advisor Atlas, Research Expert, Scholarship Hunt

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Owner: the three tool views look pale and hard. Findings: white cards on ivory with faint cool-grey borders, Research
Expert in indigo/violet that clashes with the teal app, washed-out disabled primary buttons, low-contrast helper text,
flat sub-tabs, no depth.

## Changes

- New `frontend/src/tools-polish.css` (imported in `main.tsx` after `app-brand.css`), selectors prefixed with
  `.main-content` for precedence: paper cards with warm borders and layered shadow plus hover lift; teal top edge on page
  headers; teal gradient primary buttons, secondary buttons with strong borders; inputs with stronger borders and teal
  focus ring; darker text; Research Expert paper/status/prompt states; Atlas hero, mode toggle, badge; Scholarship Hunt
  sub-tabs as pills, catalog and library cards, chips.
- `research-expert.css`: palette remap (indigo/violet to teal; cool slate to warm neutrals; rgba equivalents).

## Verification

Playwright screenshots (mocked API) of all three views at 1440x900 before and after; Advisor Atlas serif bleed onto the
eyebrow/description caught and fixed. Not exercised: states that need richer data (Atlas results and dossier, Hunt results and
Library/Catalog cards, Research analysis result and PDF viewer), narrow/mobile widths, dark text on every chip variant.
