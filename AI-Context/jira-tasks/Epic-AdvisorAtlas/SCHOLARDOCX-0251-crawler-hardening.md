# SCHOLARDOCX-0251: Public Crawler Hardening

Status: Done

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-11-12

## Summary

A review of `PublicCrawler` (shared by Advisor Atlas and Scholarship Deep Hunt)
found correctness, robots-compliance, SSRF, and extraction bugs. This task fixes
them without changing the crawl budgets or the result schema.

## Business Context

Links:

- Business file: AI-Context/business (Advisor Atlas value: accurate, evidence-backed dossiers)

Business value:

- Profiles on `?id=` style university sites were fetched as the wrong page, so
  professors were missed or merged. Emails behind `mailto:` links were missed.
- The crawler must stay a polite, robots-respecting client and must never reach
  private networks.

## Functional Context

Links:

- Functional file: AI-Context/functional/feature-advisor-atlas.md

Requirements:

- FR-9.33 / FR-9.55: selective crawling must fetch the page the source actually
  points to, and respect robots and public-access restrictions.

## Technical Context

Links:

- Technical file: AI-Context/technical/security-privacy.md
- Technical file: AI-Context/technical/ai-integrations.md

Technical notes (bugs found, all in scope):

1. `canonicalize_url` dropped every query string (except Scholar `user`), and
   `fetch()` requested the canonical URL, so `profile.php?id=42` fetched
   `profile.php`. Fix: keep query parameters, drop only tracking parameters
   (`utm_*`, `fbclid`, `gclid`, ...); Scholar keeps its identity-only rule.
2. `fetch()` did not check robots.txt on redirect hops, and a cross-host
   redirect skipped the per-host delay.
3. robots.txt was fetched without following redirects (a 301 parsed as an empty
   file = allow all), and 5xx/network errors meant allow all. Fix: follow up to
   5 validated redirects; 4xx = allow all; 5xx/unreachable = disallow all
   (RFC 9309 §2.3.1.3–4).
4. DNS-rebinding SSRF: the host was resolved for validation and again by httpx
   to connect. Fix: a transport resolves once, rejects any non-global address
   (`not ip.is_global`, IPv4-mapped IPv6 unwrapped), and connects to the pinned
   IP with the original Host header and TLS SNI/certificate hostname.
5. `socket.getaddrinfo` blocked the event loop. Fix: `loop.getaddrinfo`.
6. Size caps were checked after the full body was buffered. Fix: stream and
   stop reading at the cap.
7. Scraped text reached GLM with no untrusted-data rule. Fix: every Advisor
   Atlas system prompt says source text is data, never instructions.
8. Visual evidence: the validated image was discarded and GLM re-fetched the
   URL itself. Fix: send the validated bytes as a base64 data URL.
9. `mailto:` links were discarded and `name [at] uni [dot] edu` was not
   recognised. Fix: collect both.
10. Faculty URL hints matched substrings (`lab` in `syllabus`). Fix: match the
    start of path segments' word tokens.
11. `faculty_candidates` accepted links to any site. Fix: same-site only.
12. Cards whose link says "View profile" yielded no person. Fix: fall back to
    the nearest preceding heading text for generic link labels.
13. A new `httpx.AsyncClient` per request. Fix: one shared client per crawler,
    closed when the run ends.
14. Per-host politeness and the robots cache were per run. Fix: module-level
    per-host slot schedule and a TTL'd, size-capped robots cache.

## Scope

In scope:

- `crawler.py`, `research_pipeline.py` (visual call), `analysis.py` (system
  prompts, base64 visual), `service.py` and `scholarship_deep_hunt.py`
  (close the crawler), unit tests.

Out of scope:

- Rendering JavaScript-only faculty directories (needs a headless browser,
  which conflicts with the zero-infra footprint).
- Crawl budgets, ranking, and result schema.

## Acceptance Criteria

- `profile.php?id=42` is fetched with its query; `utm_*` is dropped.
- A redirect to a robots-disallowed path raises `PermissionError`.
- robots.txt behind a 301 is honoured; a 5xx robots.txt disallows the site.
- A host resolving to a private address is rejected before connecting, and the
  connection goes to the address that was validated.
- Bodies larger than the cap are rejected without being fully read.
- `mailto:` and `[at]`/`[dot]` emails appear in `page["emails"]`.
- Off-site name links are not faculty candidates; "View profile" cards are.

## Implementation Plan

- Rewrite the network half of `crawler.py` around a pinned public-only
  transport, a streaming capped reader, and a hop-by-hop redirect loop that
  validates, robots-checks, and throttles every hop.
- Extend `PageParser` with heading context and keep `mailto:` links.
- Update callers and prompts; add `PublicCrawler.aclose()`.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests (`backend/tests/unit/test_advisor_atlas_crawler.py`, using
`httpx.MockTransport`):

- query preservation and tracking-parameter removal
- robots on redirect hop; robots behind 301; robots 5xx disallows
- private resolution rejected; pinned IP + Host header + SNI on the request
- streaming size cap
- mailto and obfuscated emails
- same-site faculty filter, path-token hints, "View profile" heading fallback
- per-host delay under concurrency (replaces the old FakeClient test)

## File Size Check

Files expected to be edited:

- crawler.py (483 → ~650), analysis.py (816), service.py (1221, only a few
  lines; already over the limit before this task, not grown materially).

Line-count risk:

- Low

## Verification Plan

- Run the new crawler unit tests plus the existing Advisor Atlas and Deep Hunt
  unit tests when the user asks.

## Completion Notes

Changed files:

- backend/app/services/advisor_atlas/crawler.py: `_PublicOnlyTransport`
  (resolve once via `loop.getaddrinfo`, `is_global` check, IP pinning with
  Host + SNI, one inner transport per hostname), `UnsafeTargetError`,
  `_get` hop loop (validate + robots + throttle per hop), `_read_capped`
  streaming cap, RFC 9309 `_load_robots`, process-wide `_NEXT_SLOT` /
  `_ROBOTS_CACHE`, shared client + `aclose()`, query-preserving
  `canonicalize_url`, mailto/obfuscated emails, heading context, same-site and
  token-prefix faculty hints, `inspect_visual` returns `data_url`.
- backend/app/services/advisor_atlas/analysis.py: `UNTRUSTED_SOURCES_RULE` on
  all three system prompts; vision call sends `visual["data_url"]`.
- backend/app/services/advisor_atlas/service.py,
  backend/app/services/scholarship_deep_hunt.py: close the crawler when a run
  or refresh ends.
- AI-Context/technical/security-privacy.md, ai-integrations.md.

Verification completed:

- The backend `.venv` points at a missing interpreter, and AGENTS.md says not
  to run suites unprompted, so pytest was not run. The crawler module was
  loaded on its own (httpx 0.28.1) and exercised with `httpx.MockTransport`:
  query kept, IP pinned with Host/SNI, robots on redirect hop, robots behind
  301, 5xx robots disallows, streaming cap stopped after 3 chunks, private
  DNS rejected before any request, mailto + `[at]` emails, card-heading
  candidates, base64 visual, 0.45 s per-host spacing under concurrency.

Unit tests added or updated:

- New: backend/tests/unit/test_advisor_atlas_crawler.py.
- Updated: test_advisor_atlas_deep.py (per-host delay test now uses
  MockTransport behind the real transport), test_advisor_atlas.py (vision
  payload carries the data URL).

Follow-ups:

- Confirm against the live GLM endpoint that a `data:` URL is accepted for
  `image_url` (z.ai documents URL or base64).
- A 5xx/unreachable robots.txt now skips the site for 5 minutes; watch
  Discovery coverage on flaky university hosts.
- JavaScript-rendered directories still yield no people (out of scope:
  needs a headless browser).
- service.py was already over 1150 lines before this task (+5 lines here);
  split it before the next Advisor Atlas feature.
