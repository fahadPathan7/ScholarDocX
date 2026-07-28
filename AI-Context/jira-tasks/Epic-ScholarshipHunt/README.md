# Epic: Scholarship Hunt Pipeline

Status: Phases 0-5 Done

Owner: AI Agent

Created: 2026-07-03

## Goal

Evolve Scholarship Hunt from a raw search-results page into a pipeline —
DISCOVER (catalog + hunt) → VET (structured extraction) → TRACK (sheet +
calendar) → MONITOR (watchlists, deferred) — per
[scholarship-hunt-pipeline.md](../../planbook/scholarship-hunt-pipeline.md).
First delivery covers Phases 0-2: a zero-cost curated catalog, AI-powered
structured extraction ("Analyze"), and add-to-tracker + an Opportunity
Library that supersedes bare bookmarks.

## Scope

In scope:
- Phase 0: curated, code-shipped scholarship catalog (zero provider cost to
  browse), with a paid "Check current cycle" action per entry.
- Phase 1: structured opportunity extraction ("Analyze") with per-field
  confidence, gated by a new `can_use_scholarship_analyze` role limit and
  the AI token economy.
- Phase 2: "Add to tracker" (project Scholarship Tracker sheet) and an
  Opportunity Library that migrates existing bookmarks in.
- Cross-cutting: the beta query-review dialog (FR-8.24) becomes opt-in,
  default off.

Also in scope (this delivery):
- Phase 3: Hunt Profile + local, provider-free fit scoring.
- Phase 4: watchlists (saved-query diffing) + deadline radar.
- Phase 5 (stretch): Deep Hunt multi-pass Atlas-style runs — see
  SCHOLARDOCX-0125.

## Success Metrics

- A user can browse the catalog with zero quota consumption.
- Analyzing a real Hunt result produces a structured opportunity with no
  invented fields, charging AI tokens exactly once.
- Adding an opportunity to a project's Scholarship Tracker creates the
  sheet from the template if absent, appends a row respecting
  `records_per_sheet`, and the project calendar picks up the deadline with
  no new plumbing.
- Existing bookmarks appear in the Opportunity Library without being
  deleted from `bookmarked_news`.

## Stories

- [x] SCHOLARDOCX-0119: Curated scholarship catalog (Phase 0)
- [x] SCHOLARDOCX-0120: Opportunity extraction service + Analyze action (Phase 1)
- [x] SCHOLARDOCX-0121: Add to tracker + Opportunity Library + bookmark migration (Phase 2)
- [x] SCHOLARDOCX-0122: Query-review dialog becomes opt-in toggle (OD-2)
- [x] SCHOLARDOCX-0123: Hunt Profile + local fit score (Phase 3)
- [x] SCHOLARDOCX-0124: Watchlists + deadline radar (Phase 4)
- [x] SCHOLARDOCX-0125: Deep Hunt runs (Phase 5)
- [x] SCHOLARDOCX-0173: Deep Hunt intent matching (field-of-study relevance)
- [x] SCHOLARDOCX-0175: Search v2 restructure (Brave + unified deep search + per-hit billing)
- [x] SCHOLARDOCX-0176: Catalog static-only restructure + Search autofill fix
- [x] SCHOLARDOCX-0177: Search result quality — dedup, relevance, sponsor accuracy

All seven stories (Phases 0-5) shipped and were verified end-to-end with
live, authenticated browser runs against real Tavily search, real AI
extraction, and real sheet creation — see each story's Completion Notes.
SCHOLARDOCX-0124's live run caught and fixed a real React-StrictMode
double-notification race in the deadline radar. SCHOLARDOCX-0125's live run
caught and fixed a real deadlock in the shared `check_and_increment_limit`
plan-gate helper (uncommitted bootstrap write on first-ever use of a new
boolean feature). The Scholarship Hunt pipeline planbook is now fully
delivered end to end.
