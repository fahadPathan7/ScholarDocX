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

## Second pass: the four large technical docs

Each rewritten against the code and shrunk (technical folder 4,862 -> ~2,580 lines):

- `data-model-draft.md` (555) -> `data-model.md` (~45): table groups plus invariants; columns live in
  `models.py`. Removed speculative "likely fields" and a claim about `advisor_atlas_searches_per_month`
  (that limit no longer exists).
- `api-boundaries.md` (460) -> ~110: dropped the endpoint catalog (OpenAPI at `/docs` is the source) and
  the removed `/auth/register-paid` and `/news/search` descriptions; kept boundary rules and non-obvious contracts.
- `ai-token-economy.md` (578) -> ~90: removed phase/"implemented"/superseded history; the billing
  coverage and mechanisms sections now live only in `billing-contract.md`.
- `ai-integrations.md` (900) -> ~190: removed audit banners, phantom `charge_ai_tokens` guidance, stale
  monthly-search-limit text, and the deleted-files list; kept pipelines and the hard-won invariants.

Verification: `make guards` (billing + context drift) passes. Claims were spot-checked against code
(function and file names, limits, removed routes) but not every behavioural sentence was re-tested.

## Third pass: the five remaining large technical docs

- `frontend-visual-system.md` (521 -> ~95): grouped into layout, modals, theme, sheets, sticky/games, CSS
  organization. Removed withdrawn rules, a stale "Purchase a plan" registration tab, a stale 768px drawer
  description (it is 1100px), the vestigial cron-panel notes, and the duplicated modal spec (AGENTS.md owns the
  pattern; this file keeps the mechanics).
- `security-privacy.md` (249 -> ~70): fixed claims that contradicted the code: JWT secret is `JWT_SECRET`
  from the environment (not generated into `app_settings`), missing `role_limits` rows deny (not allow), the
  Advisor Atlas monthly limit no longer exists, Research Expert uses Jina (not Gemini), Deep Hunt uses Brave
  (not Tavily), rate-limit registry has 22 rules, and `USER_SCOPED_TABLES` does not exist (scoping is
  `Store.current_user_id` + `get_user_store`).
- `testing-strategy.md` (223 -> ~45) and `authentication-and-identity.md` (198 -> ~55): removed duplicated
  rules and the paid-registration description that 0169 removed (JWT secret fixed here too).
- `billing-and-payments.md` (194 -> ~50): `subscription.uncanceled` is routed (it was listed as unhandled).
- Technical folder total: 4,862 -> ~1,500 lines.
- `Makefile`: new `guard-css` (the three CSS guards) included in `make guards`; deleted the diverged duplicate
  `frontend/scripts/check-sticky-column.py` (the canonical one is `scripts/`, run from `frontend/`).
  `backend/pytest.ini` comment no longer cites a renamed AGENTS.md heading.

## Verification

`make guards` (billing, context drift, css) passes. Facts were checked against the code (function, file, setting
and route names, limits, removed routes); not every behavioural sentence was re-tested.

## Known remaining debt

`stack-and-runtime.md` (158), `local-storage-and-data.md` (103), `project-structure.md` (100) and
`responsive-design-system.md` (190) were only lightly edited. The functional and business folders were not
re-audited line by line.
