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
- Product quotas, role limits, and usage accounting are deferred. Operational
  crawl safeguards remain required.

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

- role, plan, quota, and usage-limit design;
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

Verification completed:

- Documentation structure and links reviewed.
- No product code changed.

Unit tests added or updated:

- None; this is a documentation-only planning task.

Follow-ups:

- Begin implementation only after promoting final requirements and technical
  decisions from the planbook into canonical functional and technical context.
- Design product limits and usage accounting only after the end-to-end feature
  is complete, as explicitly requested.
