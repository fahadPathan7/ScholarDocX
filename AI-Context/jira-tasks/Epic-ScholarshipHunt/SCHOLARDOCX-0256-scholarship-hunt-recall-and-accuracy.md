# SCHOLARDOCX-0256: Scholarship Hunt recall and accuracy

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-11-12

## Summary

Users reported runs that "sometimes lack the correct results". A pipeline review
found that valid opportunities were being discarded before anyone read them,
extraction often saw the wrong text, and the relevance judge ignored the user's
form selections. This task fixes recall and accuracy at the same search cost.

## Business Context

Links:

- Business file: N/A (quality of an existing paid feature)

Business value:

- Well-known, correct scholarships (DAAD, Chevening, Fulbright, Erasmus Mundus,
  MEXT) must appear for a matching goal.

## Functional Context

Links:

- Functional file: AI-Context/functional (Scholarship Hunt)

Requirements:

- Pre-crawl filters reject only explicit contradictions, never "not mentioned
  in a 150-character snippet".
- Expired opportunities are not returned.

## Technical Context

Links:

- Technical file: AI-Context/technical/ai-integrations.md (Scholarship Hunt)

Findings (all in scope):

1. **Destination hard filter required a positive mention in the search
   snippet** (`matches_destinations`), so official pages whose snippet did not
   name the country were dropped before crawling. Now: reject only when the
   snippet names another known destination and none of the selected ones.
2. **Field hard filter dropped "open to all fields" pages** that listed other
   disciplines in the snippet. Now: all-fields wording is never a conflict.
3. **Brave `freshness="py"`** excluded long-lived official programme pages.
   Removed for Scholarship Hunt; staleness is handled by `_is_stale_cycle` and
   the new expired-deadline check.
4. **Only 2 of the planner's 3-4 queries were searched.** Owner decision: 4
   queries x 4 results (still 16 raw hits, same worst-case cost).
5. **Crawl lookup bug**: pages were stored under their post-redirect URL but
   looked up by the search URL, so any redirect sent extraction the 3,000-char
   snippet instead of the page. Now keyed by the search URL.
6. **Extraction saw the first 6,000 characters** (mostly navigation). Now a
   focused excerpt: page head plus windows around deadline / eligibility /
   funding / application terms, capped at 8,000 characters.
7. **A failed Brave pass failed the whole run** (`HTTPException` not caught).
8. **Relevance judge saw only the free-text goal**, not the selected degree
   level, destinations, field, or intake. Now passed explicitly.
9. **Umbrella programmes were rejected** (SCHOLARDOCX-0177 rule). Owner
   decision (2026-11-12): keep them, ranked below field-specific matches
   (~0.5, above the 0.4 floor); the 0177 de-dup still collapses repeats.
10. **No post-extraction checks**: an opportunity whose stated destinations
    conflict with the selection, or whose every stated deadline is in the
    past, is now dropped.

## Scope

In scope:

- scholarship_deep_hunt.py, deep_hunt_query_planner.py, news_filter_rules.py
  (two new conflict helpers), brave_search_service.py (optional freshness),
  tests, context.

Out of scope:

- PDF scholarship calls (the crawler accepts HTML/text only).
- Search provider changes.

## Acceptance Criteria

- A DAAD page whose snippet omits "Germany" reaches crawling for a Germany run.
- A redirected page is extracted from its crawled text.
- An all-fields programme scores >= 0.4 and ranks below a field-specific one.
- An opportunity whose deadlines are all past is not returned.
- One failing search pass does not fail the run.

## Implementation Plan

- As in findings.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests (`tests/unit/test_scholarship_hunt_recall.py` plus updates):

- destination conflict vs silence; all-fields wording; focused excerpt keeps a
  deep deadline; expired-deadline check; umbrella heuristic score; relevance
  prompt carries form filters; Brave params omit freshness when None.

## File Size Check

Files expected to be edited:

- scholarship_deep_hunt.py (856 → ~960), deep_hunt_query_planner.py (545).

Line-count risk:

- Low

## Verification Plan

- Unit tests in a scratch venv (non-DB); billing and context guards.

## Completion Notes

Changed files:

- backend/app/services/scholarship_deep_hunt.py (4 x 4 passes, conflict-only
  pre-crawl filters, crawl keyed by search URL, `focused_excerpt`,
  `all_deadlines_passed`, post-extraction destination check, no freshness,
  failed pass tolerated, filters passed to the judge)
- backend/app/services/deep_hunt_query_planner.py (filters in the relevance
  prompt; umbrella programmes RELEVANT at 0.5-0.6; heuristic 0.2 -> 0.5)
- backend/app/services/news_filter_rules.py (`conflicts_with_destinations`,
  `conflicts_with_fields`, `ALL_FIELDS_RE`)
- backend/app/services/brave_search_service.py (optional `freshness`)
- AI-Context/technical/ai-integrations.md

Verification completed:

- Scratch venv: test_scholarship_hunt_recall.py, test_deep_hunt_intent.py
  (non-DB), test_brave_search_service.py, test_scholarship_extraction.py pass.
- `run()` driven end to end with in-memory fakes: 4 queries x 4; a DAAD page
  whose snippet omits the country and that redirects was kept and extracted
  from the crawled page (deadline deep in the page found); a Canada-only
  snippet was dropped; an expired programme was dropped; an all-fields
  programme was kept at 0.5 below the field-specific match; the judge received
  the form filters.
- DB-backed repository/run tests not run (test Postgres down: Docker off).
- Billing and context guards pass.

Unit tests added or updated:

- New: backend/tests/unit/test_scholarship_hunt_recall.py.
- Updated: test_deep_hunt_intent.py (umbrella now 0.5, owner decision).
- Fixed pre-existing break: test_scholarship_extraction.py's FakeAiService
  lacked `can_spend` / `charge_tokens` since commit 1eff779.

Follow-ups:

- Support PDF scholarship calls (crawler is HTML/text only).
- Use Brave `extra_snippets` in the pre-crawl filters for more context.
