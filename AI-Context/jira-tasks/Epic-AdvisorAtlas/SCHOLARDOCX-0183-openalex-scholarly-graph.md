# SCHOLARDOCX-0183: Advisor Atlas - OpenAlex Scholarly Graph Integration

Status: In Progress (Stage 1)

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

Advisor Atlas currently learns everything it knows about a professor from web
search snippets plus regex over faculty HTML. Three consecutive tasks
(SCHOLARDOCX-0180, 0181, 0182) each ended at the same wall: the facts an
applicant most wants — what this professor actually publishes, how active they
are, who they work with, how their output compares — are *structured* data being
reconstructed from *unstructured* pages, badly.

OpenAlex is that structured data. This task adds it as a first-class evidence
source, starting with the professor dossier.

Explicitly, this is what makes the metrics deferred in SCHOLARDOCX-0182
implementable without the guess-and-assert pattern those tasks removed: an
h-index read from `summary_stats.h_index` is a retrieved fact with a source, not
a number scraped out of a search preview.

## Corrected cost model

An earlier note in SCHOLARDOCX-0181 described OpenAlex as "free, needs no API
key". **That is out of date and the correction matters for the guardrails.**
Per [Authentication & Pricing](https://developers.openalex.org/guides/authentication):

- The API is **freemium**. Free daily usage is **$0.10/day with no key**, or
  **$1/day with a free key** (account creation, no payment details).
- Within the $1/day free budget: **single-entity lookups are unlimited**,
  ~10,000 list+filter calls, ~1,000 searches, ~100 content downloads.
- The bulk data snapshot remains completely free (CC0) but is hundreds of GB and
  refreshed quarterly.

Sizing for ScholarDocX: a professor dossier costs roughly one *search* (resolve
the name to an author ID) plus one or two *single-entity* lookups (free). At the
keyless tier that is ~100 dossiers/day; with a free key, ~1,000/day. ScholarDocX
is a locally-hosted, single-user app, so even the keyless tier is comfortably
sufficient and the CLAUDE.md guardrail — *do not add features that require paid
infrastructure by default* — is satisfied without a key.

## Business Context

Links:

- [business/decisions.md](../../business/decisions.md)

Business value:

- Turns "we found some pages mentioning this professor" into "here is their
  verified publication record, citation profile, topic distribution, and
  affiliation history". That is the difference between a lead and a dossier.
- Publication *cadence* (`counts_by_year`) answers the question applicants
  actually care about and which no faculty page states: is this lab active right
  now, or coasting.
- Author disambiguation is done by OpenAlex rather than by us. Our current
  `candidate_source_relevance` heuristic cannot tell two same-named researchers
  apart; OpenAlex maintains disambiguated author identities with ORCID links.

## Privacy Posture (decided)

**Only public facts about public figures leave the machine: the professor's name
and institution.** These are things the user could type into any search engine
themselves, and are already sent to Tavily on every existing run.

**The applicant's own data never leaves.** No SOP text, research interests, CV,
profile, or documents are sent to OpenAlex. Topic matching against the user's
interests happens locally, after results return.

This keeps the CLAUDE.md guardrail — *do not store private application data
outside the local machine* — intact, and does not widen the existing posture:
the run already sends the same professor name to Tavily.

The `mailto`/`api_key` parameter identifies the *deployment*, not the user, and
must never be populated with the end user's email address without consent.

## Functional Context

Links:

- [functional/feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)

- FR-9.30: The dossier may include verified scholarly-record data — publication
  count, citation count, h-index, i10-index, publication cadence by year,
  OpenAlex topics, and affiliation history with years.
- FR-9.31: Every scholarly-record value is attributed to its source and is
  omitted when unavailable. No metric is ever estimated, interpolated, or
  inferred from a search snippet.
- FR-9.32: An author record is only attached when identity is confidently
  resolved. A weak or ambiguous name match yields no record rather than the wrong
  person's citation profile — attaching the wrong researcher's h-index is a worse
  failure than showing none.
- FR-9.33: The feature degrades silently. Missing key, exhausted daily budget,
  rate limiting, or an outage must leave the run exactly as good as it is today,
  never failed or blocked.

## Technical Context

Links:

- [technical/ai-integrations.md](../../technical/ai-integrations.md)
- [technical/ai-token-economy.md](../../technical/ai-token-economy.md)

### Grounded response schema

Confirmed against the live API reference for `GET /authors/{id}`:

```json
{
  "id": "https://openalex.org/A5023888391",
  "orcid": "...",
  "display_name": "...",
  "display_name_alternatives": ["..."],
  "parsed_longest_name": {"first": "...", "middle": "...", "last": "...", "suffix": "..."},
  "works_count": 123,
  "cited_by_count": 123,
  "summary_stats": {"2yr_mean_citedness": 1.2, "h_index": 23, "i10_index": 40},
  "affiliations": [{"institution": {"id": "...", "display_name": "...", "ror": "...",
                                    "country_code": "..", "type": "..."},
                    "years": [2021, 2022]}],
  "last_known_institutions": [{"id": "...", "display_name": "...", "ror": "..."}],
  "topics": [{"id": "...", "display_name": "...", "count": 12}],
  "counts_by_year": [{"year": 2025, "works_count": 7, "cited_by_count": 310}],
  "ids": {"openalex": "...", "orcid": "...", "scopus": "..."},
  "works_api_url": "..."
}
```

Useful filters confirmed on the authors endpoint: `last_known_institutions.id`,
`last_known_institutions.ror`, `affiliations.institution.id`, `topics.id`,
`concepts.id`, `summary_stats.h_index`, `cited_by_count`, `works_count`,
`has_orcid`, `orcid`.

`affiliations[].years` is a genuine bonus — it supplies the career timeline that
SCHOLARDOCX-0182 built by parsing prose, from structured data, with years.

### Design

- New `app/services/advisor_atlas/openalex.py`: a small, dependency-light client.
  - `resolve_author(name, institution)` — search, then score candidates on
    surname match, institution match, and works count. Returns `None` below a
    confidence floor (FR-9.32).
  - `author_profile(author_id)` — single-entity lookup, unlimited on the free
    tier, using `select=` to keep responses small.
  - All parsing defensive: every field optional, unexpected shapes yield `None`
    rather than raising.
- Wired into `_process_candidate` after `extract_verified_professor_facts`,
  merged through the existing `_merge_fact_section` so neither the scholarly
  record nor the page-derived facts can silently overwrite the other.
- **Billing (added after review).** The initial design shipped with no billing
  hook, on the reasoning that the free tier covers this workload. That was
  overridden as a product decision: OpenAlex is now charged like Tavily/Jina/Brave
  via `charge_flat_fee(..., source="openalex_author_lookup")`, priced by
  `app_settings.openalex_call_cost_usd` (default `0.001`, matching OpenAlex's own
  $1/1,000 search list price) and editable in admin **Settings → External APIs &
  Agents Pricing**.
  - Charged once per metered author `search`, and **on the call, not the match** —
    OpenAlex bills the search whether or not the result clears our confidence
    floor. The service bills on `OpenAlexClient.attempted_metered_call`.
  - Follow-on single-entity lookups are free at OpenAlex and are not charged.
  - Not charged when no request is issued: blank name, budget guard tripped, or a
    latched 429.
  - Pre-flight `AiService.can_spend_external()`; a user at zero credits skips
    enrichment rather than going negative.
  - **One charge site only** — `_attach_scholarly_record`. `OpenAlexClient` never
    bills. SCHOLARDOCX-0180 is the precedent for why a second charge in a wrapper
    must not be added.
- **Budget guard.** OpenAlex does not hard-stop at the daily budget; spend beyond
  it draws on any prepaid balance. The client reads `X-RateLimit-Limit` /
  `-Remaining` / `-Credits-Used` and `meta.cost_usd` from every response and stops
  issuing metered calls once remaining falls below 5% of the daily limit.

## Scope

Stage 1 (this task):

- OpenAlex client + author resolution.
- Dossier enrichment: metrics, cadence, topics, affiliation history.
- Config, `.env.example`, context docs, fixture-based tests.

Stage 2 (follow-up, not this task):

- Discovery: find related professors by `last_known_institutions.id` +
  `topics.id` directly, instead of inferring them from department names. This is
  the larger prize but depends on institution resolution (name → ROR/OpenAlex ID)
  and on Stage 1's disambiguation proving out.
- Publications list from `works_api_url`, replacing the current regex-scraped
  publication extraction.
- Co-author network.

## Acceptance Criteria

- [x] A confident name+institution match attaches an author record.
- [x] A surname-only match attaches nothing.
- [x] Two near-tied candidates attach nothing.
- [x] Missing key / 401 / 403 / 429 / 500 / 503 / network error all degrade to
      today's behaviour.
- [x] A blank name spends no metered search.
- [x] No user profile data is included in any outbound request.
- [x] Metrics are absent rather than zero when OpenAlex omits them.
- [x] Malformed or unexpected payload shapes degrade instead of raising.
- [x] Scholarly facts merge with, and never overwrite, page-derived facts.
- [x] Enrichment runs on deep runs only, so a Discovery run cannot exhaust the
      daily budget on candidates it may never surface.

## Unit Test Plan

Fixtures built from the documented schema above. Cover: confident resolution,
ambiguous rejection, missing `summary_stats`, empty `counts_by_year`, HTTP 429,
HTTP 401, and network failure.

## File Size Check

New `openalex.py` is 340 lines, self-contained.

`service.py` went **964 → 1047 lines**, crossing the 1000-line target in
[CODE_RULES.md](../../CODE_RULES.md) (still well under the 1150 hard-split
threshold). Recording it rather than glossing: the growth is
`_attach_scholarly_record` plus the merge plumbing. **`service.py` should be split
by the next task that touches it** — the natural seam is run orchestration
(`run`, `refresh_candidate`, progress/stage handling) versus per-candidate
processing (`_process_candidate`, `_reconcile_verified_facts`,
`_attach_scholarly_record`, `_merge_fact_section`).

## Verification Plan

Fixture-driven, because this environment has no outbound network access and no
API key. **The parser has never seen a live response** — see Completion Notes.

## Completion Notes

### Tests actually ran this time

Unlike SCHOLARDOCX-0180/0181/0182, this was executed under real pytest. The
blocker in those tasks was `tests/conftest.py`, which requires a live Postgres for
*every* test including pure-function ones. Installing the runtime deps and running
with `--noconftest` bypasses that:

```
python3 -m pytest tests/unit/test_advisor_atlas_openalex.py \
  --noconftest -o addopts=""
→ 25 passed
```

The same approach retroactively verified the two previous tasks:

```
tests/unit/test_advisor_atlas.py  tests/unit/test_advisor_atlas_deep.py \
tests/unit/test_advisor_atlas_openalex.py --noconftest -o addopts=""
→ 123 passed, 9 failed
```

All 9 failures are one identical environmental cause —
`RuntimeError: DATABASE_URL is required (SCHOLARDOCX-0139)` — in repository and
run-persistence tests. **Zero logic failures.** So SCHOLARDOCX-0181's discovery
recall tests and SCHOLARDOCX-0182's dossier tests are now confirmed passing, not
merely asserted.

`tests/unit/test_research_paper.py` (SCHOLARDOCX-0180) remains unverified: every
test there builds `Settings` and touches the database, so none are runnable
without Postgres.

**Worth adopting**: the conftest requiring a live database for pure-function tests
is why three tasks in a row shipped unverified. Splitting it so DB fixtures are
opt-in would make most of this suite runnable anywhere.

### The key is configured, but I could not use it

`OPENALEX_API_KEY` is present in the project `.env` (22 characters) and
`Settings.openalex_api_key` reads it correctly, so at runtime on the developer's
machine the client will pick it up and get the $1/day tier. `.env` is gitignored
and untracked, so the key is not exposed in the repository.

I still could not make a live call: this sandbox has no outbound network access
(`403 Forbidden` at the egress proxy for every host except the documentation
fetch tool). Having the key changes nothing about that. So the verification below
stands unchanged — **the parser has been validated against the documented schema,
never against a real response.**

### The parser has still never seen a live response

This is the real caveat. There is no outbound network access here and no API key,
so every fixture in `test_advisor_atlas_openalex.py` was hand-built from the
published schema at
`https://developers.openalex.org/api-reference/authors/get-a-single-author`,
which I fetched and transcribed. The tests prove the parser is internally
consistent and fails safe; they cannot prove the field names are right.

**Before trusting this in production, run the probe script** (added by this task,
and the single most important follow-up here):

```bash
cd backend && python3 scripts/probe_openalex.py "Yann LeCun" "New York University"
```

It reports whether the key works, checks every field the parser reads against the
live payload, prints the parsed record, and exercises the metered resolution path.
It exits non-zero on schema drift.

Check especially: `summary_stats` key names, whether `last_known_institutions` is
still plural (it was singular in older versions of the API), and whether
`affiliations[].years` is populated for real authors. The failure mode if a name is
wrong is benign by construction — the field parses as `None` and the dossier omits
it — but you would silently get empty enrichment rather than an error, which is
exactly the kind of quiet degradation the previous three tasks were about.

The probe also reports whether identity resolution *accepts* a known-correct
professor. `MIN_MATCH_CONFIDENCE` and the institution scoring were tuned against
fixtures, so the floor may be too strict or too lax against real data; that is
the second thing to check.

Also note the docs are self-inconsistent on whether `api_key` is required: the
pricing page advertises a $0.10/day keyless tier, while the endpoint reference
marks `api_key` as required. The client handles both — it omits the parameter when
unset and treats 401/403 as "not configured, carry on".

### Corrected an earlier claim of mine

SCHOLARDOCX-0181's notes said OpenAlex "is free, needs no API key". That was wrong
as of the current docs, and the correction is recorded at the top of this task
because it bears directly on the CLAUDE.md guardrail about paid infrastructure.
The conclusion still holds — the free tier is sufficient — but for a different
reason than I originally gave.

### Stage 2 not started

Discovery by `last_known_institutions.id` + `topics.id` is the larger prize and is
deliberately unstarted. It needs institution resolution (university name → ROR or
OpenAlex ID), which is its own disambiguation problem, and it should not be built
until Stage 1's author matching has been observed against real data. The
publications list from `works_api_url` and the co-author network sit behind the
same gate.
