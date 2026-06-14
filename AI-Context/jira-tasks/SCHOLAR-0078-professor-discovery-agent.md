# SCHOLAR-0078: Advisor Atlas

Status: Done

Owner: AI Agent

Created: 2026-06-11

## Summary

Build a new `Advisor Atlas` tab, presented as `AI-powered supervisor
intelligence`, that uses public-web discovery, respectful crawling, Tavily,
GLM-5.1, and a GLM vision fallback to discover and enrich professor profiles for
a selected university and department or for one named professor.

The feature ranks research fit, gathers lab and student context, identifies
recent publications, and classifies evidence about student openings or funded
opportunities without overstating uncertain signals.

The output is an organized advisor dossier and student action center, not a
generic AI answer or flat list of scraped profiles.

## Flagship Refinement: 2026-06-12

Advisor Atlas is being refined as ScholarDock's primary marketing feature.

Discovery is no longer a literal department-only search. It must first map the
selected university's schools, departments, institutes, centers, and
interdisciplinary units, then choose direct, adjacent, and interdisciplinary
units related to the user's requested field. Professors remain labeled with
their real affiliation.

The result experience becomes a transparent funnel:

1. all verified faculty from mapped units;
2. the semantic research-fit subset;
3. the current or next-two-to-three-semester PhD opportunity subset.

Professor mode becomes a distinct single-person intelligence brief with
granular background, research, lab, member, publication, academic-profile,
funding, recruitment, forecast, trajectory, evidence, and gap sections.

Current recruitment evidence and future recruitment likelihood must remain
separate. Funding or activity alone never proves a current opening.

Implementation constraints:

- Preserve local SQLite persistence and backend-only providers.
- Reuse the existing run/candidate/dossier boundaries.
- Keep new UI modules separate because `advisor-atlas.css` started this
  refinement at 1008 lines.
- Add focused tests for related-unit mapping, semantic fallback behavior,
  nested funnel membership, and semester forecasts.
- Browser-verify desktop and 375-390px mobile with no page overflow.

## Business Context

Links:

- Business requirement:
  [BR-006 AI-Powered Strategic Assistance](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/business-requirements.md)
- Detailed feature plan:
  [Advisor Atlas planbook](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/professor-discovery-agent.md)

Business value:

- Reduces the highest-effort part of research-degree targeting.
- Produces source-backed advisor dossiers instead of disconnected browser
  notes.
- Improves professor outreach quality through research, publication, lab, and
  recruitment context.
- Gives students a prioritized reading, verification, preparation, monitoring,
  and contact-preparation plan.
- Extends ScholarDock's local-first application workflow without adding remote
  persistence.

## Functional Context

Links:

- Planbook:
  [Advisor Atlas](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/professor-discovery-agent.md)
- Existing AI behavior:
  [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md)

Requirements:

- FR-9.1: Add a dedicated `Advisor Atlas` navigation tab.
- FR-9.2: Support university/department discovery and professor-specific search.
- FR-9.3: Accept optional user research interests, methods, degree, and intake
  context for matching.
- FR-9.4: Discover professor candidates from public university and department
  sources and deduplicate them.
- FR-9.5: Enrich candidates with official profile, personal page, lab, research,
  contact, publication, student, funding, and recruitment evidence.
- FR-9.6: Show the latest four or five verifiable publications with source
  attribution and graceful alternatives when Google Scholar is unavailable.
- FR-9.7: Keep match score and evidence confidence separate and explain both.
- FR-9.8: Classify recruitment evidence as confirmed, strong, possible, no
  current evidence, or unknown.
- FR-9.9: Never present funding or lab activity alone as proof that a professor
  is accepting students.
- FR-9.10: Persist runs, progress, partial results, evidence, scores, shortlists,
  and notes locally.
- FR-9.11: Let users stop, resume, revisit, and refresh discovery work.
- FR-9.12: Require explicit confirmation before saving a candidate into
  ScholarDock's existing professor records.
- FR-9.13: Preserve source URLs, source type, retrieval time, and evidence for
  consequential claims.
- FR-9.14: Respect public access restrictions and never bypass authentication,
  CAPTCHA, paywalls, robots rules, or blocked sources.
- FR-9.15: Show responsive, accessible loading, progress, partial, empty,
  cancelled, blocked-source, and failure states.
- FR-9.16: Build a guided student research profile covering topics, methods,
  experience, learning goals, constraints, and career direction.
- FR-9.17: Support Quick Map, Deep Atlas, and Focused Dossier search depths.
- FR-9.18: Run separate identity, research, publication, lab, opportunity, fit,
  verification, and action passes.
- FR-9.19: Produce a structured advisor dossier with research bridge, method
  bridge, lab intelligence, paper bridge, opportunity radar, application fit,
  risks, verification questions, and next actions.
- FR-9.20: Expose evidence coverage for identity, research, publications, lab,
  opportunity, and application information.
- FR-9.21: Organize results into decision lanes that distinguish supported
  matches, high-potential candidates, opportunities, uncertain candidates, and
  poor fits.
- FR-9.22: Provide a personalized paper reading order and reading-status
  tracking for shortlisted professors.
- FR-9.23: Compare up to four professors across fit, papers, projects, lab,
  opportunity, readiness, confidence, risks, and next action.
- FR-9.24: Produce a run-level student action center with prioritized reading,
  verification, preparation, monitoring, and contact-preparation steps.
- FR-9.25: Detect and show meaningful evidence changes when a shortlisted
  professor is refreshed.

## Technical Context

Links:

- [AI integrations](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-integrations.md)
- [API boundaries](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/api-boundaries.md)
- [Security and privacy](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/security-privacy.md)
- [Data model draft](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/data-model-draft.md)
- [Planbook technical architecture](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/professor-discovery-agent.md#8-proposed-technical-architecture)

Technical notes:

- Use a dedicated backend API and service package for professor discovery.
- Use a persisted local background-run model rather than one long HTTP request.
- Keep crawler, extraction, publication, recruitment, evidence, matching, and
  persistence responsibilities modular.
- Reuse or extend backend-only GLM and Tavily provider boundaries.
- Use `GLM-5.1` for structured extraction, synthesis, and matching.
- Use the configured GLM vision model only for suitable public visual sources.
- Use schema-validated AI output with source IDs; unsupported claims become
  unknown.
- Prefer official and primary sources. Do not rely on search snippets for
  definitive recruitment claims.
- Do not directly scrape Google Scholar when access is restricted. Preserve a
  discoverable profile URL and use official/DOI/ORCID/OpenAlex/Crossref/
  Semantic Scholar fallbacks.
- Add SSRF protection, redirect validation, content-size/type controls, HTML
  sanitization, robots handling, caching, low per-domain concurrency, delays,
  and retry backoff.
- Persist user-owned records in local SQLite.
- Do not add remote queues, databases, telemetry, or hosted crawler services.
- Advisor Atlas uses one role-based monthly search/refresh quota. Operational
  crawl safeguards remain independently required.

## Scope

In scope:

- new navigation tab and responsive feature workspace;
- university/department and professor-specific search modes;
- public source discovery and respectful crawling;
- profile, lab, student, paper, funding, and recruitment enrichment;
- explainable research matching and evidence confidence;
- multi-pass intelligence search with visible coverage and stop reasons;
- organized advisor dossiers and decision lanes;
- personalized paper bridges, preparation readiness, risks, verification
  questions, and next-action plans;
- comparison, action center, reading status, and refresh change detection;
- local persisted run lifecycle with cancel/resume/refresh;
- partial results and source-level recovery;
- shortlist, compare, notes, evidence inspection, and confirmed save;
- provider, crawler, persistence, scoring, and UI tests;
- AI-Context updates during implementation.

Out of scope:

- automatic email or outreach;
- application submission;
- guaranteed supervisor availability or admission likelihood;
- access-control, robots, CAPTCHA, login, or paywall bypass;
- social-media profiling;
- cloud workers, remote persistence, or mass web crawling.

## Acceptance Criteria

- [ ] `Advisor Atlas` appears as an accessible navigation tab with the
  supporting line `AI-powered supervisor intelligence`.
- [ ] Users can start university/department discovery with required field
  validation.
- [ ] Users can start a professor-specific deep search.
- [ ] Optional interest, method, degree, and intake fields improve matching
  without becoming required.
- [ ] A guided builder helps users create and review a structured research
  profile.
- [ ] Users can choose Quick Map, Deep Atlas, or Focused Dossier.
- [ ] The UI previews external domains and user-entered context used by the run.
- [ ] A run persists status, stages, errors, and partial results locally.
- [ ] Users can stop a run and revisit its partial results.
- [ ] Interrupted eligible runs can resume without duplicating completed work.
- [ ] Official faculty candidates are extracted and deduplicated.
- [ ] Each result preserves source links and retrieval metadata.
- [ ] Profiles include available research, lab, student, contact, project, and
  publication evidence.
- [ ] Deep Atlas records separate identity, research, publication, lab,
  opportunity, fit, verification, and action passes.
- [ ] Each pass records inspected sources, useful evidence, unresolved gaps,
  and why the pass stopped.
- [ ] Latest four or five verifiable publications are shown with source labels.
- [ ] Restricted Google Scholar access falls back without bypass attempts.
- [ ] Match score, evidence confidence, matching reasons, mismatches, and
  missing evidence are separately visible.
- [ ] Every professor has an evidence-coverage matrix.
- [ ] Every shortlisted professor has a structured dossier with decision
  snapshot, research bridge, paper bridge, lab intelligence, opportunity radar,
  application fit, risks, verification questions, and next actions.
- [ ] Results are grouped into clear decision lanes with inclusion reasons.
- [ ] Paper recommendations explain relevance and provide a reading order.
- [ ] The compare workspace supports up to four professors and exposes reasons
  behind scores.
- [ ] The completed run produces a prioritized student action center.
- [ ] Refreshing a shortlisted professor shows meaningful changes since the
  previous evidence snapshot.
- [ ] Recruitment state uses the five-state evidence model.
- [ ] Recent funding without explicit recruitment is labeled only as a possible
  opportunity.
- [ ] Stale and conflicting recruitment evidence is visibly downgraded.
- [ ] Users can filter, sort, inspect, shortlist, compare, annotate, refresh, and
  save candidates.
- [ ] Saving to existing professor records requires confirmation and preserves
  source links.
- [ ] Provider failure does not delete successful partial results.
- [ ] Missing GLM or Tavily configuration has a clear recovery message.
- [ ] SSRF, unsafe redirects, remote scripts, oversized content, and unsupported
  content types are rejected.
- [ ] The crawler respects robots/access restrictions and uses polite
  per-domain request behavior.
- [ ] The feature works on desktop and mobile without horizontal page overflow.
- [ ] Keyboard navigation, focus states, labels, status semantics, and reduced
  motion are verified.
- [ ] Focused backend tests, frontend tests, and browser smoke checks pass.

## Implementation Plan

### Phase 1: Context and contracts

- [ ] Promote approved FR-9 requirements into canonical functional context.
- [ ] Record provider, crawler, data, privacy, and API decisions in technical
  context.
- [ ] Finalize request/response schemas and local tables.
- [ ] Confirm configured GLM-5.1 and vision model identifiers.

### Phase 2: Backend foundation

- [ ] Add discovery-run schemas, repository, and SQLite tables.
- [ ] Add create/list/detail/cancel/resume endpoints.
- [ ] Add persisted local background orchestration.
- [ ] Add URL safety, robots, content, redirect, caching, and crawl controls.
- [ ] Add official university, department, and faculty discovery.

### Phase 3: Extraction and enrichment

- [ ] Add professor candidate parsing and deduplication.
- [ ] Add profile, lab, member, project, and contact extraction.
- [ ] Add GLM-5.1 schema-validated extraction.
- [ ] Add GLM vision fallback for approved visual sources.
- [ ] Add publication enrichment and source fallbacks.
- [ ] Add funding and recruitment evidence collection.
- [ ] Add multi-pass search records, targeted gap searches, and coverage
  calculation.

### Phase 4: Intelligence

- [ ] Add field-level evidence confidence.
- [ ] Add five-state recruitment classifier.
- [ ] Add versioned, explainable matching scores.
- [ ] Add stale/conflicting evidence handling.
- [ ] Add research/method bridges, paper ordering, readiness, risk flags,
  verification questions, and next-action generation.
- [ ] Add dossier generation and source-snapshot change detection.

### Phase 5: Frontend

- [ ] Add a small lazy-loaded navigation integration in `App.tsx`.
- [ ] Build the feature view and progressive search form.
- [ ] Build the guided research-profile builder and search-depth selector.
- [ ] Build run progress, partial results, cancellation, retry, and resume UI.
- [ ] Build results, filters, sorting, evidence drawer, and comparison.
- [ ] Build decision lanes, advisor dossiers, paper reading path, and action
  center.
- [ ] Add shortlist, notes, refresh changes, and confirmed save flow.
- [ ] Verify responsive and accessible behavior.

### Phase 6: Verification and context closeout

- [ ] Add provider, crawler, repository, extraction, scoring, and API tests.
- [ ] Add frontend behavior tests.
- [ ] Run focused backend and frontend test suites.
- [ ] Run frontend production build.
- [ ] Verify desktop/mobile flows in the browser.
- [ ] Update canonical context and this Jira task with final files and outcomes.

## Unit Test Plan

Unit tests needed:

- Yes.

Planned tests:

- university/department normalization and ambiguity;
- URL allowlisting, DNS/redirect SSRF defense, robots decisions, and content
  controls;
- faculty directory parsing and candidate extraction fixtures;
- professor deduplication;
- GLM extraction schema validation and unsupported-claim rejection;
- publication normalization, deduplication, sorting, and latest-four/five
  selection;
- recruitment-state classification, freshness, and conflict handling;
- match score calculation, weight versioning, evidence confidence, and
  explanations;
- multi-pass search, coverage matrix, targeted gap-search, paper ordering,
  readiness, risk flags, verification questions, and next-action rules;
- dossier generation and source-snapshot change detection;
- run persistence, user scoping, cancel/resume, and partial failures;
- mocked GLM/Tavily success, no-key, malformed-output, timeout, and provider
  error behavior;
- confirmed save into existing professor records;
- frontend validation, progress, result, evidence, filter, shortlist, compare,
  dossier, reading path, action center, refresh-change, and save states.

If no unit tests are needed, explain why:

- N/A.

## File Size Check

Files expected to be edited or created:

- `frontend/src/App.tsx`
- `frontend/src/components/professor-discovery/*`
- `frontend/src/lib/professorDiscoveryApi.ts`
- `backend/app/api/professor_discovery.py`
- `backend/app/schemas/professor_discovery.py`
- `backend/app/services/professor_discovery/*`
- backend database schema/migration and model files
- focused backend and frontend tests
- relevant AI-Context functional and technical files

Line-count risk:

- High for `frontend/src/App.tsx`, which is already above 1150 lines.
- Low for new feature modules if the proposed boundaries are followed.
- Medium for shared database/config/provider modules.

Required response:

- Keep `App.tsx` changes minimal and extract any new navigation or routing
  structure needed to avoid growing the oversized file.
- Do not place the whole feature in one frontend component or backend service.
- Check line counts before and after each implementation phase.

## Verification Plan

- Run focused backend unit and integration tests with mocked provider traffic.
- Run security tests for private/local URLs, redirects, unsupported content,
  robots restrictions, and oversized payloads.
- Run frontend tests for primary and failure states.
- Run `npm run build`.
- Run `git diff --check`.
- Browser-test desktop and mobile search, progress, cancellation, partial
  result, decision lane, dossier, evidence, compare, action center, and save
  flows.
- Verify no private application data is sent in provider requests.
- Verify all consequential result claims open a source.
- Verify funding-only evidence never produces `Confirmed open`.
- Verify app restart preserves completed and partial run state.

## Implementation Record

Completed: 2026-06-11

UI polish reopened: 2026-06-11

- Reduce explanatory copy and vertical density on the new-search screen.
- Keep the primary search action visible sooner at common desktop heights.
- Simplify the lower form/action area without removing search capability.

UI polish completed:

- Removed the redundant feature-summary strip.
- Shortened hero, mode, depth, profile, privacy, and action copy.
- Expanded the search card to the available workspace width.
- Changed desktop fields to a compact three-column layout.
- Replaced the loose lower section with a clear, compact action bar.
- Verified desktop and mobile ordering without overlap or horizontal overflow.

Delivered:

- Added the `Advisor Atlas` tab with the supporting line `AI-powered supervisor
  intelligence`.
- Added department discovery and professor-specific Focused Dossier modes with
  Quick Map, Deep Atlas, and Focused Dossier search depths.
- Added a guided research-profile builder, privacy preview, persisted run
  history, progress, cancellation, resume, partial-result, failure, and empty
  states.
- Added local SQLite records for runs, candidates, evidence, publications,
  dossiers, reading status, shortlist state, notes, saved professors, and
  refresh watch events.
- Added public URL validation, DNS-based SSRF rejection, redirect validation,
  robots handling, content-type and size controls, and polite per-domain delay.
- Added Tavily discovery, GLM-5.1 structured analysis, deterministic no-key
  fallback, unsupported-claim validation, and GLM-4.6V inspection for bounded
  public image sources.
- Added evidence-backed decision lanes, five-state recruitment classification,
  separate fit and evidence scores, paper bridge, coverage matrix, dossier,
  action center, filter, sort, shortlist, notes, comparison, refresh, and
  confirmed save.
- Verified the real desktop and mobile application flows, including a completed
  Focused Dossier, action center, dossier drawer, and zero horizontal overflow.

Changed product files:

- `backend/app/api/advisor_atlas.py`
- `backend/app/services/advisor_atlas/*`
- `backend/app/db/models.py`
- `backend/app/db/connection.py`
- `backend/app/core/config.py`
- `backend/app/main.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/components/AdvisorAtlasView.tsx`
- `frontend/src/components/advisor-atlas/*`
- `frontend/src/lib/advisorAtlasApi.ts`
- `frontend/src/App.tsx`

Verification:

- Advisor Atlas backend tests: `8 passed`.
- Relevant backend regression tests: `49 passed`.
- Backend module compilation: passed.
- Frontend TypeScript and production build: passed.
- `git diff --check`: passed.
- Browser smoke: desktop and 390px mobile passed; dossier and page scroll widths
  matched their client widths.
- Full backend collection remains blocked by the pre-existing Python 3.9
  incompatibility in `tests/test_admin_notifications.py`, which uses
  `dict | None` syntax before test execution.
- The frontend currently has no automated test runner configured, so feature
  behavior was verified through the production build and browser-backed smoke
  flow.

## Completion Notes

Changed files:

- `AI-Context/README.md`
- `AI-Context/planbook/professor-discovery-agent.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`

### Flagship refinement completed: 2026-06-12

Delivered:

- Discovery now maps university academic units before professor discovery and
  includes direct, adjacent, and interdisciplinary units with rationale,
  confidence, and actual professor affiliation.
- Discovery results now use a visible nested funnel: verified department
  faculty, semantic research matches, and current/next-three-semester PhD
  opportunity outlook.
- Added explainable GLM semantic matching plus a labeled weighted concept-family
  fallback when GLM is unavailable.
- Added a separate future recruitment outlook with likelihood, confidence,
  likely semesters, supporting signals, counter-signals, and limitations.
- Added persisted `intelligence_json` for candidate background, funding, lab
  members, academic profiles, source gaps, semantic fit, department relation,
  and opportunity forecast.
- Professor mode now has a distinct intelligence brief and an expanded dossier
  with background, funding, lab-member, and recruitment-outlook sections.
- Added a modular flagship stylesheet instead of extending the existing
  1008-line base stylesheet.
- Added responsive history, search, funnel, professor brief, and dossier
  behavior with no page-level horizontal overflow.

Changed files:

- `backend/app/services/advisor_atlas/intelligence.py`
- `backend/app/services/advisor_atlas/analysis.py`
- `backend/app/services/advisor_atlas/service.py`
- `backend/app/services/advisor_atlas/repository.py`
- `backend/app/db/models.py`
- `backend/app/db/connection.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/lib/advisorAtlasApi.ts`
- `frontend/src/components/AdvisorAtlasView.tsx`
- `frontend/src/components/advisor-atlas/AdvisorAtlasSearchForm.tsx`
- `frontend/src/components/advisor-atlas/AdvisorDiscoveryFunnel.tsx`
- `frontend/src/components/advisor-atlas/AdvisorProfessorBrief.tsx`
- `frontend/src/components/advisor-atlas/AdvisorCandidateCard.tsx`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/AdvisorRunWorkspace.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`

Verification:

- Advisor Atlas and adjacent focused backend regression set: `24 passed`.
- Frontend TypeScript and production build: passed.
- Backend module compilation: passed.
- `git diff --check`: passed.
- Browser smoke: Discovery form, Professor form, completed Discovery funnel,
  completed Professor brief, and granular dossier passed.
- Browser containment: desktop dossier `805px` client/scroll width; mobile
  document, Advisor Atlas, and history surfaces matched their client widths.
- Frontend has no automated component test runner, so responsive interaction
  and visual behavior were verified through the production build and in-app
  browser.

### Professor brief display hardening: 2026-06-12

- Renamed the intelligence stylesheet to force reliable Vite delivery after the
  brief was observed in a partially unstyled state.
- Prevented URL values from appearing as professor institutions.
- Professor-mode research fit now reads `Not scored` when matching was not
  requested, instead of presenting a misleading percentage.
- Long search excerpts are normalized and clipped for the brief.
- Academic-domain links are preferred and labeled as official university
  sources; non-academic links are labeled as evidence sources.
- Verified against the saved Shaif Chowdhury result: card grids, metric
  separation, semester chips, source URL, and page containment rendered
  correctly with no browser errors.
- Frontend production build and `git diff --check`: passed.

### AI output capacity refinement: 2026-06-12

Scope:

- Remove Advisor Atlas-specific fixed output-token ceilings from structured
  professor analysis and optional vision analysis.
- Match standard AI chat behavior by omitting the provider output-token field.
- Preserve compact source inputs, JSON-only prompts, response validation, and
  deterministic fallback behavior.

Acceptance criteria:

- Advisor Atlas text analysis does not pass `max_tokens` to `AiService.chat`.
- Advisor Atlas vision payloads do not contain `max_tokens`.
- Focused provider-boundary tests verify both request shapes.

Completed:

- Removed the fixed `3000`-token text-analysis ceiling.
- Removed the fixed `1800`-token vision-analysis ceiling.
- Advisor Atlas now follows standard AI chat behavior and lets the provider use
  its normal output capacity.
- Retained compact public-source excerpts, JSON-only instructions, validation,
  and deterministic fallback behavior.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/technical/ai-integrations.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/services/advisor_atlas/analysis.py`
- `backend/tests/test_advisor_atlas.py`

Verification:

- `pytest -q tests/test_advisor_atlas.py`: `13 passed`.
- Backend compilation: passed.
- `git diff --check`: passed.

### Professor research-interest matching: 2026-06-12

Scope:

- Show the research-interest builder in both Discovery and Professor modes.
- Require at least one normalized interest for every Advisor Atlas run.
- Pass Professor-mode interests through the existing semantic analysis and
  dossier pipeline so research fit is scored and explained.
- Keep the form accessible, responsive, and limited to five interests.

Acceptance criteria:

- Professor mode cannot start without a non-empty research interest.
- Whitespace-only interests are rejected by the backend.
- Valid Professor runs persist normalized interests in `research_profile`.
- Existing semantic GLM and deterministic fallback paths receive those
  interests without a separate matching implementation.

Completed:

- Professor mode now shows the same expandable research-interest builder as
  Discovery mode, with Professor-specific semantic-matching guidance.
- Both frontend and backend require at least one non-empty interest.
- Backend validation trims interests and removes case-insensitive duplicates.
- Add/remove controls use Lucide icons, accessible labels, visible focus, and
  44px interaction targets.
- Professor interests flow through the existing GLM semantic analysis and
  deterministic concept fallback; no duplicate matching path was introduced.
- `advisor-atlas.css` is 1072 lines, within the current feature's 1150-line
  grace limit. The form-specific rules remain there to preserve the existing
  Advisor Atlas form ownership boundary.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/api/advisor_atlas.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/components/advisor-atlas/AdvisorAtlasSearchForm.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas.css`

Verification:

- Advisor Atlas backend tests: `15 passed`.
- Frontend TypeScript and production build: passed.
- Backend compilation and `git diff --check`: passed.
- Browser verified Professor-mode interest visibility, empty-interest
  validation, 44px add control, and zero page-level horizontal overflow.

### Dossier workspace redesign: 2026-06-12

Scope:

- Increase the full professor dossier width on desktop.
- Replace the narrow generic three-column layout with purpose-built,
  responsive information cards.
- Strengthen hierarchy across overview, research intelligence, publications,
  trajectory, verification, evidence, and notes.
- Prevent long nested values from collapsing into character-by-character text.

Acceptance criteria:

- Desktop dossier uses most of the available viewport while retaining a clear
  modal boundary.
- No dossier value is constrained to an unreadably narrow column.
- Dense sections collapse from three to two to one column based on available
  width.
- Header, actions, metrics, evidence, publications, and notes remain accessible
  and usable without horizontal page overflow.

Completed:

- Increased the desktop dossier to a maximum width of `1220px` while preserving
  a visible modal boundary and sticky identity header.
- Added a professor monogram, verified-source link, clearer action bar, stronger
  metric cards, and a two-column decision/recruitment overview.
- Reorganized background, funding, lab members, research bridge, papers,
  trajectory, application fit, verification questions, next actions, evidence,
  and notes into distinct responsive cards.
- Replaced the brittle generic three-column trajectory block with purpose-built
  lab, trajectory, and application-fit cards.
- Removed the duplicated nested opportunity outlook from trajectory because it
  already has a dedicated high-visibility section.
- Improved generic value rendering for booleans, enum labels, nested arrays,
  sentences, and empty evidence.
- Updated old flagship stylesheet rules that were overriding the redesigned
  dossier spacing.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-detail.css`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`

Verification:

- Frontend TypeScript and production build: passed.
- `git diff --check`: passed.
- Desktop browser at `1280x720`: dossier width `1220px`; overview, intelligence,
  and landscape grids had matching client and scroll widths.
- Formerly broken landscape values retained approximately `332px` of readable
  value width per card.
- Mobile browser at `390x844`: overview, intelligence, and landscape sections
  collapsed to one column; metrics used a balanced two-column grid; document
  client and scroll widths both measured `375px`.
- Browser console errors: none.
- Complete backend suite: `106 passed`, with three unrelated environment-state
  failures: the local environment exposes a Groq key to a missing-key fallback
  test, and two auth tests use a stale workspace database without
  `plan_started_at`.

### Granular Professor research pipeline: 2026-06-12

Scope:

- Replace broad Professor-mode search with purpose-specific identity, profile,
  research/lab, publication, funding, and recruitment passes.
- Crawl a bounded set of high-value accessible pages across those categories.
- Use specialist AI extraction plus final synthesis when GLM is configured.
- Add explicit academic profiles, research interests, latest publications,
  structured funding, contact/application, collaboration/activity, and source
  gap sections.
- Rename `Paper bridge` to `Latest publications` and reject non-publication
  pages from the publication list.
- Replace generic decision and outlook rendering with purpose-built UI.
- Limit the visible evidence ledger to the top five diverse sources.
- Show local research telemetry for searches, crawls, AI calls, estimated
  tokens, sources, and elapsed time.

Acceptance criteria:

- A Professor run performs multiple Tavily searches with distinct research
  purposes.
- Crawling is bounded, public-only, and prioritizes authoritative sources.
- Search snippets and recruitment ads cannot appear as latest publications.
- Academic profile collection supports official, personal/portfolio, lab,
  LinkedIn, Google Scholar, ORCID, Semantic Scholar, and other verified links.
- Funding items expose funder, project, period, amount/status when available,
  source, confidence, and limitations instead of one summary paragraph.
- Decision snapshot explains fit, evidence, risks, recommendation, and next
  action; recruitment outlook visually separates current evidence from future
  probability.
- Candidate detail returns at most five evidence-ledger entries.
- Research telemetry is persisted locally within candidate intelligence and
  rendered without introducing product usage limits.
- Focused provider, repository, analysis, and UI build tests pass.

Completed:

- Added six purpose-specific Professor search passes for identity, profiles,
  research/lab, publications, funding, and recruitment after initial identity
  discovery.
- Added bounded authoritative-source ranking and crawling, purpose tags,
  profile URL detection, diverse evidence ranking, and strict scholarly
  publication validation in a dedicated `professor_research.py` module.
- Added two specialist GLM analyses plus final synthesis when configured.
  Deterministic fallback remains available without provider keys.
- Added locally persisted research telemetry for Tavily searches, crawled
  pages, AI calls, estimated input/output tokens, inspected sources, and
  elapsed time. Telemetry is informational and does not impose a quota.
- Limited candidate detail to the five strongest evidence-ledger entries.
- Replaced `Paper bridge` with `Latest publications`, ordered by recent year.
- Added purpose-built Professor profiles, research interests, funding,
  decision, recruitment, contact/application, collaboration/activity, and
  telemetry UI.
- Kept responsive content widths readable and prevented horizontal overflow.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/technical/ai-integrations.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/services/advisor_atlas/professor_research.py`
- `backend/app/services/advisor_atlas/analysis.py`
- `backend/app/services/advisor_atlas/service.py`
- `backend/app/services/advisor_atlas/repository.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/lib/advisorAtlasApi.ts`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-detail.css`

Verification:

- Advisor Atlas backend tests: `18 passed`.
- Backend compilation and `git diff --check`: passed.
- Frontend TypeScript and production build: passed.
- Desktop browser at `1280x720`: document, drawer, and dossier content client
  widths matched scroll widths; five evidence entries, six profile links, and
  four latest publications rendered.
- Mobile browser at `390x844`: document width `375px`; drawer and content width
  `360px`; no horizontal overflow.
- Browser console errors: none.

Remaining environment note:

- The running local environment had no Tavily or GLM keys configured, so live
  provider calls were covered by mocked unit tests and the completed dossier
  presentation was browser-verified with a temporary local fixture that was
  removed after verification.

### Professor identity and authorship correction: 2026-06-13

Scope:

- Prevent shared faculty pages from assigning another professor's email or
  background to the searched professor.
- Resolve personal, official, Scholar, LinkedIn, GitHub, and lab links from
  professor-owned pages and preserve identity-bearing URL parameters.
- Follow trusted publications and activities/CV links one level.
- Extract verified education, appointment evidence, research interests, and
  publication rows deterministically.
- Require candidate authorship evidence for every displayed publication.
- Merge source purposes during deduplication instead of relabeling shared URLs
  with the final search pass.
- Label Advisor Atlas AI operations correctly in backend logs.

Regression acceptance:

- A generic `scholar.google.com/citations` URL is rejected; a URL containing
  the professor's `user` ID is retained.
- A department directory containing many emails selects only a name-matched
  email from the searched professor's section.
- Social posts and aggregators cannot become the official profile.
- A publication page that omits the searched professor from its authors is
  rejected even when the title, venue, and year look scholarly.
- Linked personal-site publication tables can produce multiple verified papers.
- AI logging prints Advisor Atlas operation labels, never `Standard Chat`, for
  Advisor Atlas analysis calls.

Completed:

- Preserved Google Scholar `user` identifiers during URL normalization,
  including malformed semicolon variants found on professor pages.
- Added professor-section excerpts, name-matched email selection, and
  deterministic identity reconciliation after AI synthesis.
- Added a bounded linked crawl seeded by verified personal and lab URLs, with
  up to two link-discovery rounds for activities/CV and publication pages.
- Added professor-owned table extraction for publications and enforced visible
  candidate authorship before any paper is persisted.
- Added trusted-source extraction for education, appointments, research
  interests, recent activity, GitHub, and academic profile destinations.
- Prevented aggregator snippets and shared-directory navigation from becoming
  research summaries, personal sites, or academic profiles.
- Changed source deduplication to merge purposes and prefer fully crawled pages
  over uncrawled search snippets.
- Added explicit Advisor Atlas operation labels for identity/research,
  publications/opportunity, and final synthesis calls.
- Added GitHub to the dossier's profile collection.

Live verification:

- Refreshed the persisted Shaif Chowdhury dossier through the configured
  six-pass Tavily and three-pass GLM pipeline.
- Verified `shaif.chowdhury@tamuk.edu`, the TAMUK EECS directory, personal
  website, LinkedIn, Google Scholar profile with `user=qJkLzcAAAAAJ`, and GitHub.
- Verified the professor-owned research statement and ten structured themes.
- Verified the 2025-26 new-faculty cohort, Baylor PhD, IEM B.Tech, and prior
  research/internship positions.
- Persisted five professor-authored publications from the personal publication
  table; the unrelated medical-AI paper was removed.
- Final live telemetry: 6 Tavily searches, 16 crawled pages, 3 AI analyses,
  34 inspected sources, approximately 52,676 tokens, and 140.7 seconds.

Verification:

- Focused backend suite: `35 passed`.
- Complete backend suite: `112 passed`, with three pre-existing
  environment-state failures: one missing-provider fallback test sees the
  configured Groq key, and two auth tests use the stale root workspace database
  without `plan_started_at`.
- Backend compilation: passed.
- Frontend TypeScript and production build: passed.
- `git diff --check`: passed.

### Strong Professor search intake: 2026-06-13

Scope:

- Make every identity, fit, and semester input required in Professor mode:
  professor name, university name, official university/professor URL,
  department or research area, degree target, intended intake, and at least one
  research interest.
- Normalize whitespace and reject malformed official URLs or intake values that
  omit a recognizable academic term and four-digit year.
- Explain the evidence value of each non-obvious required field in the form.
- Keep known personal, lab, Scholar, and other profile URLs optional because
  Advisor Atlas is responsible for discovering and verifying them.

Acceptance:

- Frontend and backend enforce the same required Professor-mode inputs.
- `Fall 2027`, `Spring 2027`, `Summer 2027`, and `Winter 2027` are accepted;
  term-only or year-only intake values are rejected.
- The official URL must use HTTP or HTTPS and contain a hostname.
- Discovery-mode requirements remain unchanged.
- Desktop and 390px mobile layouts remain contained and readable.

Completed:

- Professor mode now requires all seven inputs in both the React form and
  FastAPI request validator.
- Added whitespace normalization, complete HTTP/HTTPS URL validation, a
  first-and-last-name requirement, controlled degree values, academic
  term-plus-year intake validation, and bounded research-interest length.
- Added evidence-oriented helper text for the official URL, department/research
  area, and intake fields.
- Replaced the vague profile-field counter with a live `x/7 required inputs
  ready` indicator.
- Kept personal website, lab, Scholar, GitHub, and other profile hints
  discoverable rather than making the user find them first.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/api/advisor_atlas.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/components/advisor-atlas/AdvisorAtlasSearchForm.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas.css`

Verification:

- Focused Advisor Atlas and AI tests: `46 passed`.
- Backend compilation: passed.
- Frontend TypeScript and production build: passed.
- `git diff --check`: passed.
- Desktop browser: three balanced columns; document and form client/scroll
  widths matched.
- Mobile browser at 390px: seven required controls exposed, one-column grid,
  document width `375px`, and no horizontal overflow.

### Adaptive dossier detail rows: 2026-06-13

Scope:

- Keep compact two-column label/value rows only for short scalar facts.
- Render arrays, nested objects, multiline values, and long descriptions with
  the label on its own line and the value using the full card width.
- Give arrays of structured records a clean card/list treatment rather than
  nesting them inside a narrow right-hand column.
- Apply the behavior through the shared dossier value renderer so Background,
  lab members, recent activity, fit bridges, trajectory, and action sections
  remain consistent.

Acceptance:

- Background positions and education start below their labels and use the full
  card width.
- Nested member records do not collapse into character-width columns.
- Short values such as status, year, and degree may remain compact.
- Desktop and 390px dossier views have no horizontal overflow.

Completed:

- Added content-aware detail-row classification to the shared dossier value
  renderer.
- Arrays, nested objects, multiline text, and strings longer than 72
  characters now render as stacked full-width rows.
- Arrays containing structured records now render as separate subtle cards,
  removing bullets and narrow nested value columns.
- Short scalar facts retain the compact two-column layout.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-detail.css`

Verification:

- Frontend TypeScript and production build: passed.
- `git diff --check`: passed.
- Real Shaif Chowdhury dossier at desktop width: Summary, Positions, and
  Education values measured the full `335px` row width and began below their
  labels.
- Structured Items rows used their full `259px` width and rendered six member
  records as separate cards.
- Mobile at 390px: Positions row/value both measured `304px`; document width
  `375px` and drawer width `360px` matched their scroll widths.
- The temporary local visual fixture was restored after verification.

### Concise professor intelligence brief: 2026-06-13

Scope:

- Replace raw, text-heavy brief summaries with short decision-critical facts.
- Derive Background from the current appointment and highest verified degree
  when structured evidence is available.
- Normalize professor-owned first-person research prose into grammatical
  third-person copy and show only the core direction.
- Keep funding and lab cards focused on current status, while preserving full
  evidence and limitations in the dossier.

Acceptance:

- No Professor brief summary begins with `My research`, `I am`, `I'm`, or
  equivalent first-person source language.
- Each summary card remains readable at a glance and avoids copying long source
  paragraphs.
- Verified research themes appear as a small supporting set rather than another
  paragraph.
- Existing saved results receive the presentation fix without requiring a new
  research run, and future deterministic extraction stores normalized research
  wording.

Completed:

- Background now uses the current verified professor appointment and highest
  verified degree instead of a generic evidence-status sentence.
- Research direction is reduced to one core third-person sentence and up to
  four verified theme chips. Surname-based wording avoids gender assumptions.
- Funding and lab cards select the most decision-relevant sentence and remove
  copied qualifiers, social headings, markdown noise, and punctuation defects.
- Added deterministic backend normalization for common first-person professor
  prose so future persisted research summaries also use third-person voice.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/services/advisor_atlas/professor_research.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/components/advisor-atlas/AdvisorProfessorBrief.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`

Verification:

- Advisor Atlas backend suite: `35 passed`.
- Frontend TypeScript and production build: passed.
- `git diff --check`: passed.
- Real saved Shaif Chowdhury result showed concise appointment/degree,
  third-person research direction, four topic chips, current funded opportunity,
  and public lab-member status.
- Desktop document width matched scroll width at `1280px`.
- Mobile at `390px`: the brief grid collapsed to one `281px` column and the
  `375px` document width matched its scroll width.
- The temporary local visual fixture was restored after verification.

### Dossier scanability and evidence disclosure: 2026-06-13

Scope:

- Convert dense decision and recruitment evidence into clearer point-by-point
  presentation.
- Render Contact and application path above Collaborations and recent activity,
  with both sections using the full dossier width.
- Give collaborations structured person cards and recent activity a vertical
  chronological list rather than two generic objects squeezed side by side.
- Remove the visible Verification questions section.
- Make Evidence ledger an accessible native disclosure that is collapsed by
  default.

Acceptance:

- Contact, collaborations, and recent activity never share side-by-side columns.
- Collaboration records expose name, affiliation, and relationship without
  generic repeated `Summary` or `Items` labels.
- Dense supporting and counter-signals are visually separated point by point.
- Next actions remain visible in a full-width, scan-friendly plan.
- Evidence ledger can be opened by mouse or keyboard and begins closed on every
  dossier open.
- Desktop and 390px layouts remain free of horizontal overflow.

Test plan:

- Frontend production build and TypeScript validation.
- `git diff --check`.
- Browser verification with the real saved professor dossier at desktop and
  390px mobile widths, including collapsed/open evidence states.
- No backend test change is required because this task changes presentation
  only; existing Advisor Atlas backend behavior remains unchanged.

Completed:

- Decision and recruitment narratives now use spaced point lists instead of
  dense paragraph blocks where multiple claims are present.
- Contact and application details render as full-width stacked fact cards.
- Collaborations now use a dedicated vertical section with concise summary
  points and named collaborator cards; recent activity follows beneath it as a
  dated timeline.
- Removed Verification questions from the visible dossier.
- Replaced generic Next-action key/value rows with a numbered full-width plan.
- Evidence ledger is now a native `details` disclosure with source count,
  collapsed by default and expandable without leaving the dossier.
- Kept the dossier stylesheet below the repository's target at `990` lines.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-detail.css`

Verification:

- Frontend TypeScript and production build: passed.
- Scoped `git diff --check` for Advisor Atlas and context files: passed.
- Repository-wide `git diff --check` remains blocked by unrelated pre-existing
  whitespace in Scholarship News files; those edits were not changed.
- Real Shaif Chowdhury dossier at desktop width: Contact and Collaborations
  each measured `1157px` and appeared vertically in that order; collaborator
  records used three balanced columns.
- Evidence ledger loaded closed, expanded to exactly five sources, and the
  `1205px` drawer width matched its scroll width in both states.
- Mobile at `390px`: Contact and Collaborations each measured `336px`,
  collaborator cards collapsed to one column, and the `360px` drawer width
  matched its scroll width.
- The temporary local visual fixture and viewport override were restored after
  verification.

### Background, funding, and lab intelligence layout: 2026-06-13

Scope:

- Replace the three equal-column cards with an asymmetric intelligence bento.
- Give Background the wide primary area and separate career from education.
- Present positions and degrees as compact timelines with dates and supporting
  institution/location details.
- Make Funding status-led, separating a verified funded opportunity from
  missing sponsor, amount, stipend, or grant details.
- Replace the sparse Lab card with either structured member records or a clear
  verified empty state.

Acceptance:

- Desktop uses a wide Background panel with Funding and Lab stacked beside it.
- Background facts are scannable without generic `Summary`, `Positions`, and
  `Education` key/value rows.
- Funding communicates both the positive opportunity signal and evidence gaps
  without implying a named external grant.
- An unavailable member roster is visually intentional and explains the
  evidence limitation.
- Tablet and mobile collapse to a single natural reading order without
  horizontal overflow.

Test plan:

- Frontend TypeScript and production build.
- Scoped `git diff --check` for touched Advisor Atlas and context files.
- Browser verification using the real saved professor dossier at desktop and
  390px widths.
- No backend test change is required because source data and API behavior are
  unchanged.

Completed:

- Replaced the equal three-column layout with a responsive asymmetric bento:
  Background occupies the wide left area while Funding and Lab stack on the
  right.
- Background now separates Career path and Education into compact timelines,
  identifies the current appointment, and exposes dates without long list
  paragraphs.
- Funding now leads with a verified opportunity state, separates supporting
  evidence into points, explicitly identifies unavailable sponsor/amount data,
  and retains the source action.
- Lab intelligence now uses a clear public-roster status and concise evidence
  points instead of generic `Summary` and `Members` rows with blank space.
- Added a dedicated profile-section stylesheet so the existing dossier
  stylesheet remains below the repository line target.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/AdvisorAtlasView.tsx`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-detail.css`
- `frontend/src/components/advisor-atlas/advisor-atlas-profile-sections.css`

Verification:

- Frontend TypeScript and production build: passed.
- Scoped `git diff --check`: passed.
- Desktop real dossier: Background measured `737px`; Funding and Lab measured
  `404px` and stacked alongside it. The `1205px` drawer width matched its
  scroll width.
- Mobile at `390px`: Background, Funding, and Lab appeared in that order at
  `336px` each; the `360px` drawer width matched its scroll width.
- The temporary local visual fixture and viewport override were restored.

### Recruitment semester forecast timeline: 2026-06-14

Scope:

- Replace low-contrast pill-shaped semester labels in the Professor brief.
- Present likely semesters as an ordered, non-interactive forecast sequence.
- Improve contrast and responsive behavior without making forecast terms look
  guaranteed.

Acceptance:

- Each semester has a visible sequence marker and readable term label.
- Forecast periods do not resemble disabled or clickable buttons.
- Desktop remains compact and mobile stacks cleanly without overflow.

Completed:

- Replaced the pill-shaped semester labels with a numbered forecast timeline.
- Marked the first term as the nearest forecast and the remaining terms as
  later forecasts to make the sequence immediately understandable.
- Added a connecting line, high-contrast term text, and no button or hover
  affordance.
- Added a compact vertical sequence for mobile layouts.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/advisor-atlas/AdvisorProfessorBrief.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`

Verification:

- Frontend TypeScript and production build: passed.
- Scoped `git diff --check`: passed.
- Desktop real brief: the three terms rendered as a connected horizontal
  forecast sequence with readable high-contrast text.
- Mobile at `390px`: the timeline switched to one column, each term measured
  `247px`, and the document had no horizontal overflow.
- The temporary local visual fixture and viewport override were restored.

### Compact professor brief header: 2026-06-14

Scope:

- Remove the decorative professor initials tile from the completed brief.
- Reduce the header's vertical space without shrinking its action targets.
- Preserve the professor identity, status chips, source link, and dossier
  actions as the primary content.

Acceptance:

- No initials or monogram tile appears in the Professor brief header.
- The desktop header is visibly shorter while both actions remain at least
  `42px` high.
- The header remains balanced at desktop and stacks without horizontal
  overflow on mobile.

Test plan:

- Run the frontend production build.
- Verify the real completed brief at desktop and `390px` mobile widths.
- Run scoped `git diff --check`.
- No unit test is needed because this is a presentation-only layout change
  with no data or interaction behavior change.

Completed:

- Removed the decorative initials tile from the Professor intelligence brief.
- Changed the desktop header from a three-column layout to a focused
  identity-and-actions layout.
- Reduced vertical padding from `26px` to `20px` while retaining the existing
  action sizes and information hierarchy.
- Removed the now-unused monogram styles and their mobile override.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/advisor-atlas/AdvisorProfessorBrief.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`

Verification:

- Frontend TypeScript and production build: passed.
- Both desktop actions measured `44px` high.
- Mobile at `390px`: the header used one column, both actions measured
  `243px × 44px`, and the document had no horizontal overflow.
- Scoped `git diff --check`: passed.
- The temporary local visual fixture and viewport override were restored.

### Monthly Advisor Atlas role guard: 2026-06-14

Scope:

- Add `advisor_atlas_searches_per_month` to canonical role limits.
- Default General User to 3, Pro User to 10, and Max User to 30 actions per
  calendar month.
- Consume one shared quota unit for each accepted new Discovery or Professor
  search and each owned-candidate evidence refresh.
- Do not consume quota for viewing, saving, cancelling, deleting, or resuming
  an existing run.
- Show the entitlement in Admin Role Limits, plan comparison, the user's Usage
  & Limits view, and a persistent Advisor Atlas top-header indicator.

Acceptance:

- Backend enforcement cannot be bypassed by calling the API directly.
- An invalid or another user's candidate ID is rejected before quota is
  consumed.
- Existing databases receive all three role defaults without overwriting
  administrator-customized values.
- New users receive an initialized usage counter, while existing users can
  initialize it lazily.
- Successful search and refresh actions update the visible usage count.
- Limit exhaustion produces the centralized role-limit alert and prevents any
  new external research work.

Test plan:

- Add focused endpoint tests for search and refresh quota consumption and
  rejection.
- Verify seeded and migrated role defaults.
- Run the Advisor Atlas/backend focused tests and frontend production build.
- Verify Admin Role Limits, plan comparison, Usage & Limits, and the Advisor
  Atlas form in the browser.

Completed:

- Added the canonical `advisor_atlas_searches_per_month` role limit with
  General `3`, Pro `10`, and Max `30` monthly defaults.
- Added migration-safe `INSERT OR IGNORE` defaults, seed values, reset-to-default
  values, and new-user usage-counter initialization.
- Guarded new Advisor Atlas runs and owned-candidate evidence refreshes through
  the shared backend role-limit service. Refresh ownership is checked before
  quota consumption.
- Kept resume, view, save, cancel, and delete actions outside the quota.
- Added the quota to Admin Role Limits, plan comparison, Usage & Limits,
  centralized access-error copy, and a persistent Advisor Atlas top-header
  indicator.
- Advisor Atlas refreshes the visible usage count after successful searches and
  evidence refreshes, including refreshes initiated from the dossier.
- Preserved existing administrator-customized quota values during database
  reinitialization.

Changed files:

- `AI-Context/business/business-requirements.md`
- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/functional/requirements-index.md`
- `AI-Context/technical/ai-integrations.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/technical/data-model-draft.md`
- `AI-Context/technical/security-privacy.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/api/advisor_atlas.py`
- `backend/app/api/auth.py`
- `backend/app/db/connection.py`
- `backend/app/db/schema.py`
- `backend/app/services/admin.py`
- `backend/tests/test_advisor_atlas_limits.py`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/AdvisorAtlasView.tsx`
- `frontend/src/components/PlanComparisonView.tsx`
- `frontend/src/components/UsageModal.tsx`
- `frontend/src/components/advisor-atlas/AdvisorAtlasSearchForm.tsx`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas.css`
- `frontend/src/lib/accessErrors.ts`

Verification:

- Focused backend regression suite: `51 passed`.
- Frontend TypeScript and production build: passed.
- Scoped `git diff --check`: passed.
- Live SQLite defaults verified as General `3`, Pro `10`, and Max `30`, all
  with `monthly` reset periods.
- Real Max-user Advisor Atlas top header displayed
  `Monthly limit · 0 of 30 used`.
- The search footer no longer duplicates quota information and remains focused
  on required-input readiness, local storage, and the primary action.
- At the narrow responsive breakpoint, the header actions moved to their own
  row, the quota indicator remained fully readable, and there was no horizontal
  overflow.
- Real user Usage & Limits modal displayed
  `Advisor Atlas Searches & Refreshes Per Month` with `0 / 30`.
- Real Admin Role Limits displayed the Advisor Atlas section and General
  monthly value `3`.
- Temporary admin-role verification was restored to the original Max-only
  role, and the final browser layout had no horizontal overflow.

Maintenance note:

- `frontend/src/components/AdminView.tsx` was already above the repository's
  preferred file-size limit before this scoped addition. A future admin-module
  task should extract `LimitsTab` and `DashboardTab`; this task did not combine
  that broad refactor with quota enforcement in the existing dirty worktree.

### Discovery feature and workspace refinement: 2026-06-14

Scope:

- Strengthen university-unit mapping with multiple bounded searches.
- Selectively crawl official faculty-directory results for every mapped unit
  and retain accessible/inaccessible coverage outcomes.
- Use a bounded fallback faculty query only when a unit produces too few
  verified candidates.
- Report faculty, research-match, and high-confidence opportunity counts per
  mapped unit.
- Restrict the final opportunity subset to verified current recruitment or a
  supported `high_likelihood` forecast.
- Redesign Discovery as four distinct stages: University Map, Verified Faculty,
  Research Matches, and Opportunity Outlook.
- Add stage-aware search, unit filtering, sorting, coverage details, and
  purpose-built result cards.

Acceptance:

- Related academic units preserve relationship type, rationale, source, and
  actual professor affiliation.
- Directory coverage distinguishes inspected, accessible, and inaccessible
  sources and states when completeness cannot be guaranteed.
- Faculty rows emphasize verified identity and affiliation without premature
  opportunity claims.
- Research-match cards explain the semantic bridge to supplied interests.
- Opportunity cards show current status or high-likelihood outlook, likely
  semesters, supporting signals, confidence, and limitations.
- `possible` opportunity forecasts do not enter the final opportunity subset.
- Empty states explain why no professor reached a stage and how to inspect the
  previous level.
- Desktop and mobile layouts remain readable with no horizontal overflow.

File-size risk:

- `backend/app/services/advisor_atlas/service.py` starts above 1000 lines and
  must not absorb more discovery-specific helpers. New discovery collection
  logic belongs in a focused module.
- `frontend/src/components/advisor-atlas/advisor-atlas.css` is already within
  the grace range, so Discovery styling remains in the existing modular
  intelligence stylesheet.

Test plan:

- Add unit tests for directory-result selection, faculty candidate merging,
  coverage summaries, per-unit counts, and exclusion of `possible` forecasts.
- Run focused Advisor Atlas backend tests and frontend production build.
- Browser-verify all four stages, filters/sorting, comparison selection,
  empty/coverage states, and 390px responsive containment.

Completed:

- Added a focused `discovery.py` module for multi-pass academic-unit mapping,
  official faculty-directory selection, selective crawling, bounded fallback
  searches, source access outcomes, and run-level Discovery summaries.
- Reduced the main Advisor Atlas service from 1051 to 887 lines by moving
  Discovery-specific collection and action-center construction out of it.
- Added per-unit faculty, research-match, and high-confidence opportunity
  counts plus direct, adjacent, and interdisciplinary unit totals.
- Added transparent directory coverage for inspected, accessible, and
  inaccessible sources with concise coverage gaps.
- Restricted the final opportunity subset to confirmed current recruitment or
  a `current_open`/`high_likelihood` forecast. A merely `possible` forecast is
  retained in the research-match level but excluded from the opportunity level.
- Rebuilt the frontend as four distinct stages with purpose-built map, faculty,
  semantic-match, and opportunity presentations.
- Added stage-aware search, unit/relationship filters, sorting, intentional
  empty states, a collapsed coverage disclosure, and a contextual comparison
  tray.
- Updated comparison labels to `Research alignment` and `Source confidence`
  and added an accessible close label.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/technical/ai-integrations.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `backend/app/services/advisor_atlas/discovery.py`
- `backend/app/services/advisor_atlas/service.py`
- `backend/tests/test_advisor_atlas.py`
- `frontend/src/lib/advisorAtlasApi.ts`
- `frontend/src/components/AdvisorAtlasView.tsx`
- `frontend/src/components/advisor-atlas/AdvisorCandidateCard.tsx`
- `frontend/src/components/advisor-atlas/AdvisorDiscoveryFunnel.tsx`
- `frontend/src/components/advisor-atlas/AdvisorRunWorkspace.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-discovery.css`

Verification:

- Advisor Atlas, role-limit, and AI regression set: `57 passed`.
- Backend module compilation: passed.
- Frontend TypeScript and production build: passed.
- Scoped `git diff --check`: passed.
- Desktop browser verification covered all four stages, map filtering, coverage
  expansion, two-professor comparison selection, and comparison dialog.
- Desktop Discovery stage client/scroll width: `629px / 629px`; comparison
  dialog: `1060px / 1060px`.
- Mobile at 390px had no horizontal overflow. The page rendered at a 375px
  client width; Advisor Atlas, stage, toolbar, selection tray, cards, and
  semester sequences all matched their client and scroll widths.
- Browser console errors: none.
- Temporary local visual fixture was deleted after verification and did not
  consume Advisor Atlas quota.
- Existing `datetime.utcnow()` deprecation warnings in role-limit tests remain
  unrelated to this Discovery work.

### Explain dossier scores: 2026-06-14

Scope:

- Replace ambiguous `Research fit` and `Evidence confidence` labels with clearer
  language.
- Add visible one-line definitions beneath both scores.
- Explicitly keep the scores separate from admission, response, or acceptance
  probability.

Acceptance:

- `Research alignment` explains that it compares the user's supplied interests
  with verified professor research.
- `Source confidence` explains that it measures public-source strength and
  coverage.
- When alignment was not requested, the helper text explains how to enable it.
- The four-card metric row remains balanced and responsive.

Completed:

- Renamed `Research fit` to `Research alignment` and added a visible definition
  explaining that the score measures semantic similarity between user interests
  and verified professor research.
- Renamed `Evidence confidence` to `Source confidence` and clarified that it
  measures the strength and coverage of supporting public evidence.
- Added concise definitions for Decision lane and Current recruitment so users
  do not confuse recommendation category, present recruitment, future outlook,
  or admission probability.
- Added a specific not-scored explanation when no research interests were
  supplied.

Changed files:

- `AI-Context/functional/feature-advisor-atlas.md`
- `AI-Context/jira-tasks/SCHOLAR-0078-professor-discovery-agent.md`
- `frontend/src/components/advisor-atlas/AdvisorDossierDrawer.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-detail.css`

Verification:

- Frontend TypeScript and production build: passed.
- Scoped `git diff --check`: passed.
- Desktop real dossier: all four cards measured `282px × 101px`; the `1205px`
  drawer width matched its scroll width.
- Mobile at `390px`: cards remained in a readable two-column grid at `163px`;
  the `360px` drawer width matched its scroll width.
- The temporary local visual fixture and viewport override were restored.
