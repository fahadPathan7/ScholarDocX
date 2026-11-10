# SCHOLARDOCX-0235: Slim and clean root rules and living context

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Owner asked for lean, current context: no references to deleted or no-impact files, no
history in entry files, nothing that costs tokens without value.

## Changes

- `AGENTS.md` 226 -> ~67 lines; `CLAUDE.md` 48 -> ~32 lines. Duplicated rules (billing
  detail, scripts, file size, source-of-truth essay, skill paragraph) replaced by links.
  Fixed a wrong claim: CLAUDE.md listed "rich document drafting"; documents are upload/link only.
- `AI-Context/README.md`: removed the historical note and long preamble; added AGENTS.md to
  the rule-home table.
- Technical docs: deleted `file-size-and-modularity.md` (CODE_RULES.md is the home, its
  "known large files" list was stale); rewrote `architecture-overview.md` (cloud, not
  local-first); `project-structure.md` and `stack-and-runtime.md` lost "future/recommended"
  framing; `local-storage-and-data.md` intro corrected; `technical/README.md` index updated;
  `frontend-visual-system.md` no longer restates the jargon rule.
- `business/decisions.md`: added BD-013; replaced stale pending decisions (desktop delivery,
  document editor, Google OAuth priority) with current ones. Root `README.md` meta bullets removed.

## Verification

`make guard-context` passes (paths, links, symbols resolve). No code changed.

## Known remaining debt (not fixed)

`technical/data-model-draft.md` (555 lines) still contains planning-era detail and pipeline
terms; its source of truth is `backend/app/db/models.py`. `technical/ai-integrations.md`
(900 lines), `ai-token-economy.md` (578) and `api-boundaries.md` (460) were not re-audited
line by line. Deleting or splitting them needs a per-file check against code.
