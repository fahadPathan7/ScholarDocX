# SCHOLARDOCX-0188: Dossier Quality — Impossible Year Bug + Google Scholar Publication Extraction

Status: Completed (parsing fixes) / Open (root cause needs a decision — see Follow-ups)

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

User-reported quality bug from a live dossier: Google Scholar profile was found and verified, but zero publications were extracted ("found the google scholar but not found any paper"), plus a nonsensical `Latest Visible Year: 2094` in the Research Trajectory section. Investigated both:

**Round 1 — the two originally reported symptoms:**

1. **Fixed** — `YEAR_PATTERN` (`\b20\d{2}\b`) matched *any* bare number in the 2000–2099 range, including a Google Scholar "Cited by 2094"-style citation count. That got read as a real year, producing an impossible future "latest visible year" and permanently forcing `recent_activity = True` in the recruitment forecast (inflating likelihood/confidence off a fake recency signal). Clamped to `<= current_year` in both `analysis.py` and `intelligence.py`.
2. **Fixed** — `_publications_from_table`'s column-based author match can never succeed on Google Scholar's citation table: Scholar renders title+authors+venue combined in ONE `<td>` (nested `<div>`s the generic HTML table parser flattens into one string), with citation count and year in separate columns — there is no separate "authors" column for that function to match against. Added `_publications_from_google_scholar_profile`, which recognizes the candidate's own Scholar profile (via the `user=` query param — page ownership itself proves authorship, no per-row match needed) and uses the crawler's captured link text (Scholar always wraps the title in its own `<a>`) to get a clean title.
3. **Found, not fixed (root cause, needs a decision)** — Google Scholar's `robots.txt` disallows `/citations` entirely. Verified live: `PublicCrawler.fetch()` on a real Scholar citations URL raises `PermissionError("disallowed by robots.txt")` before any HTML is even requested. The crawler is correctly respecting this — it is not a bug to "fix" by bypassing it. This means fix #2 above is real and will help if `table_rows` is ever populated (e.g. if the crawl comes from a differently-sourced copy of the page, or if this changes later), but **today it does not by itself solve "zero papers from Scholar"**, because the crawl of Scholar's own page never happens at all.
4. **Found, not fixed (separate architectural finding)** — Semantic Scholar and ORCID author pages, verified live, return HTTP 200 with **empty page text** (`len(text) == 0` and `5` respectively) via the crawler's plain `httpx` GET. These are modern JS-rendered SPAs; the publication list never appears in the raw HTML this crawler fetches. This is a structural limitation of the current httpx-based crawler, not specific to any one host — it likely affects other JS-heavy sources too, and is a plausible contributor to the "quality" concern beyond just Scholar.

**Round 2 — user asked for a thorough review of the whole feature; additional bugs found (same session, same root ticket):**

5. **Fixed** — `semantic_fallback`'s phrase-match check used plain `in` (substring), the *exact* bug class `_contains_phrase` (in the same file) was built to prevent — a short interest like `"ai"` scored the highest-confidence tier (92 points, "supported research phrase") purely because `"ai"` is a substring of `"domain"`/`"certain"`/`"maintain"` etc., with zero relation to the professor's actual research. This is the most likely explanation for the reported dossier's "llm"/"computer vision" 96% research-alignment reasons looking suspicious — a short user interest silently riding a substring coincidence to a top-tier score. Fixed by routing through `_contains_phrase` instead.
6. **Fixed** — `dossier.lab_environment.known` used plain `"lab" in combined.lower()` — substring-vulnerable to `"collaborate"`/`"elaborate"`/`"label"`. `coverage["laboratory"]` right above it in the same function already guards this correctly (padded whole-word match); this second usage just hadn't been aligned to it. Fixed to match.
7. **Fixed** — `_dedupe_education`'s institution-matching regex recognized exactly two hardcoded literal strings (`"Baylor University"`, `"Institute of Engineering and Management"`) — leftover from whichever candidate this was first built/tested against. For every other real candidate, the institution half of the dedup key always came back empty, so two genuinely *different* degrees from two different real institutions (e.g. a PhD from MIT and a PhD from Stanford) would key identically and silently collapse into one — real data loss, reproduced and confirmed with a script before fixing. Replaced with a general `<words> (University|Institute|College|School)` pattern. Also broadened the degree pattern, which had the same PhD/B.Tech-only narrowing effect for every other degree type (Master's, Bachelor's, Ed.D, etc.).
8. **Fixed** — `professor_query_plan`'s "publications" and "news_activity" search queries had hardcoded literal years (`"2026 2025 2024 2023"`, `"2025 2026"`) — correct only for as long as "today" stayed inside that literal window; would go stale on its own with no code change needed to trigger it. Now computed relative to the actual current year.
9. **Fixed (cleanup)** — `professor_research.py`'s "new faculty cohort" year extraction had the same unbounded-year problem as item 1, just for a cosmetic label rather than the forecast; clamped the same way. `professor_facts.py`'s `SINGLE_YEAR` regex was dead code (defined, never referenced anywhere) — removed.

Also reviewed and found no changes needed in: `crawler.py` (SSRF/private-IP guards, robots.txt handling, HTML/table parsing), `discovery.py` (unit mapping, candidate discovery), `intelligence.py`'s taxonomy/family-adjacency logic (already carefully hardened by SCHOLARDOCX-0181, well-documented). One lower-priority, non-blocking finding not acted on: `_validate_public_url`'s private-IP check resolves DNS once to validate, then `httpx` resolves again independently to connect — a DNS-rebinding TOCTOU gap in principle. Not exploitable through this app's normal flow (crawl targets come from search results/discovered links, not raw user-supplied URLs) and fixing it properly needs a custom resolver/transport — flagged as a follow-up, not fixed.

## Technical Context

- `app/services/advisor_atlas/analysis.py`: `deterministic_analysis` — `years`/`latest_year` computation now filters `int(value) <= current_year`.
- `app/services/advisor_atlas/intelligence.py`: `opportunity_forecast` — same clamp on its own `YEAR_PATTERN` usage (a separate, duplicated instance of the same regex/bug).
- `app/services/advisor_atlas/professor_research.py`: new `_publications_from_google_scholar_profile`, called alongside the existing `_publications_from_table` in `extract_verified_professor_facts`'s per-source loop. Verified downstream: passes `is_scholarly_publication` (host is `scholar.google.*`, in the allowed scholarly-host list already), `publication_authorship_matches` (authors list is `[candidate_name]` exactly, trivially matches), and `publication_supported_by_sources` (title tokens will always be present in the same source's own `content`, since that's where they came from).
- Live diagnostic checks performed (single fetches, not scraping at scale):
  - `https://scholar.google.com/citations?user=...` → `PermissionError`, robots.txt disallow.
  - `https://www.semanticscholar.org/author/...` → HTTP 200, 0 bytes of text.
  - `https://orcid.org/...` → HTTP 200, 5 bytes of text.
  - `https://dblp.org/pid/...` → 404 (unrelated — wrong/stale PID used for the diagnostic, not evidence of a DBLP-wide problem).

## Scope

In scope (this session):
- `backend/app/services/advisor_atlas/analysis.py` — year clamp, `lab_environment.known` substring fix, dead `_publication_fallback` cleanup.
- `backend/app/services/advisor_atlas/intelligence.py` — year clamp, `semantic_fallback` phrase-match substring fix.
- `backend/app/services/advisor_atlas/professor_research.py` — Scholar-aware publication extractor, `_dedupe_education` generalization, dynamic query-plan years, new-faculty-cohort year clamp.
- `backend/app/services/advisor_atlas/professor_facts.py` — removed dead `SINGLE_YEAR` regex.
- `backend/tests/unit/test_advisor_atlas_publications.py`, `test_advisor_atlas_dossier_quality.py` (new files).

Explicitly out of scope (deferred to a user decision — see Follow-ups):
- Bypassing or ignoring `robots.txt` for Google Scholar. Not proposed, not implemented, not recommended.
- Adding headless-browser rendering (e.g. Playwright) to the crawler to handle JS-rendered sources (Semantic Scholar, ORCID, and potentially others). This is a real architectural change with real infrastructure cost (larger deployment image, more memory, slower per-source fetch) and needs to be a deliberate decision, not something bundled into a bug-fix pass.
- The DNS-rebinding TOCTOU gap in `_validate_public_url` (see Round 2 note above) — real but low-priority given how crawl targets are sourced today; needs a custom resolver/transport to fix properly.

## Verification Plan

- Live diagnostic fetches against real Google Scholar, Semantic Scholar, ORCID, DBLP URLs (see Technical Context) — confirms the root cause definitively rather than guessing.
- Direct script execution (not pytest) of every fixed code path, individually: year clamp (both files), the false `recent_activity` signal, the Scholar-table extractor (accepts real Scholar-shaped rows, rejects non-Scholar URLs and Scholar search-result URLs without `user=`), the `semantic_fallback` substring fix (rejects a coincidental "ai" match, still accepts a genuine one), the `lab_environment.known` substring fix (same pattern), `_dedupe_education` (confirmed two different real institutions no longer collapse into one; confirmed genuine same-entry variants still do), and the dynamic query-plan years.
- Unit tests added, not run this session (per project policy): `test_advisor_atlas_publications.py`, `test_advisor_atlas_dossier_quality.py`.

## Completion Notes

Changed files:
- `backend/app/services/advisor_atlas/analysis.py`
- `backend/app/services/advisor_atlas/intelligence.py`
- `backend/app/services/advisor_atlas/professor_research.py`
- `backend/app/services/advisor_atlas/professor_facts.py`
- `backend/tests/unit/test_advisor_atlas_publications.py` (new)
- `backend/tests/unit/test_advisor_atlas_dossier_quality.py` (new)

Verification completed: see Verification Plan above.

Follow-ups (need the user's call, not implemented):
- Should Advisor Atlas add headless-browser rendering (e.g. Playwright) for JS-rendered scholarly sources (Semantic Scholar, ORCID, possibly others)? Real cost/complexity tradeoff — larger deploy, more memory, slower per-source fetch, in exchange for actually being able to read these sites at all.
- Given Google Scholar can never be crawled directly (robots.txt), should the research-pass query planner be adjusted to lean harder on alternative publication sources (official .edu CV pages/PDFs, arXiv author pages, DBLP) for the "Latest publications" section, rather than treating Scholar discovery as sufficient?
- The DNS-rebinding TOCTOU gap noted above, if this ever starts accepting more adversarial URL sources.
