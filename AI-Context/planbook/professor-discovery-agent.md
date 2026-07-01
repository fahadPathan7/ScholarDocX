# Planbook: Advisor Atlas

Status: Implemented 2026-06-11

Jira: [SCHOLARDOCX-0078](../jira-tasks/Epic-AdvisorAtlas/SCHOLARDOCX-0078-professor-discovery-agent.md)

## 1. Product Definition

`Advisor Atlas` is a dedicated ScholarDocX tab for finding, enriching,
comparing, and saving potential supervisors from public university, department,
faculty, laboratory, funding, and publication sources.

The user provides a university and department. They may also provide their
degree target, research interests, methods, preferred intake, and other matching
context. The agent discovers relevant professors, builds evidence-backed
profiles, estimates research fit, and identifies current or possible student
recruitment signals.

Product identity:

- navigation label: `Advisor Atlas`;
- page title: `Advisor Atlas`;
- supporting line: `AI-powered supervisor intelligence`;
- internal technical name: `professor_discovery`.

The name presents the feature as a guided map of the academic-supervisor
landscape rather than a generic people search.

## 2. User Value

The feature should replace repetitive manual work:

- finding the correct department and faculty directory;
- opening every professor, lab, and publication page;
- identifying research themes and recent work;
- checking whether a lab appears active;
- looking for explicit student openings or funded-project signals;
- comparing the user's interests with professor and lab work;
- preserving source links and notes for later outreach.

The result is an organized decision workspace, not a list of links and not an
admission guarantee.

### 2.1 Signature experience

Advisor Atlas should provide a level of organization that a general-purpose AI
chat cannot reliably maintain across dozens of professors and hundreds of
sources.

Each run produces:

1. an institution and department map;
2. a cleaned faculty universe with inclusion and exclusion reasons;
3. ranked advisor-fit dossiers;
4. a recruitment and funding opportunity radar;
5. lab and student-environment intelligence;
6. a personalized publication reading path;
7. fit gaps, risks, and unanswered questions;
8. a practical next-action plan for every shortlisted professor;
9. an evidence ledger showing where every important conclusion came from;
10. a refreshable watchlist for changed openings, funding, team membership, or
    research direction.

The experience should help a student answer:

- Is this professor genuinely relevant to my proposed work?
- Which recent papers should I read first, and why?
- Does the lab appear compatible with my methods and degree target?
- Is there credible evidence of an opening?
- What important information remains unknown?
- What should I verify before contacting the professor?
- What should I do next, and in what order?

## 3. Product Principles

### 3.1 Evidence before claims

Every important extracted fact must retain its source URL, source type, retrieval
time, and supporting excerpt or structured evidence.

The UI must distinguish:

- verified facts;
- AI-extracted facts with source support;
- reasoned signals;
- unknown or unavailable information.

### 3.2 Match score and confidence are different

`Match score` estimates alignment between the user and professor.

`Evidence confidence` estimates how reliable and current the underlying sources
are. A high match with weak evidence must remain visibly uncertain.

### 3.3 Recruitment must not be overstated

The agent must never convert recent funding, recent publications, or an active
lab into a definitive claim that a professor is accepting students.

Recruitment states:

1. `Confirmed open`: an explicit, current statement invites PhD, Master's,
   research assistant, or graduate applicants.
2. `Strong opportunity signal`: a current funded opening, project vacancy, or
   lab recruitment notice strongly suggests availability.
3. `Possible opportunity`: recent funding, expansion, or active student hiring
   suggests capacity, but no explicit opening is found.
4. `No current evidence`: relevant pages were checked but no current signal was
   found.
5. `Unknown`: sources were inaccessible, missing, conflicting, or too old.

Each state must show why it was assigned and when the evidence was published or
retrieved.

### 3.4 Public-web and respectful crawling

The feature uses public pages only.

It must:

- respect `robots.txt`, public terms, and site access restrictions;
- identify itself with a ScholarDocX crawler user agent where appropriate;
- use low per-domain concurrency, delays, caching, and retry backoff;
- stay within the selected university, department, lab, and approved linked
  public domains;
- avoid login walls, CAPTCHA bypass, paywall bypass, or access-control evasion;
- allow the user to stop an active run;
- preserve enough run state to show partial results after failures.

These are operational safety controls, not plan or subscription usage limits.

### 3.5 Local-first storage

Search configuration, crawl state, normalized professor profiles, evidence,
match results, shortlists, and user notes remain in local SQLite.

Only the minimum required public page content and user-entered matching context
may be sent to configured external providers.

## 4. Search Modes

### 4.1 University and department discovery

Required inputs:

- university name;
- department, school, program, or research area.

Optional inputs:

- university website or department URL;
- country or campus to disambiguate the institution;
- degree target: PhD, research Master's, or either;
- desired intake term or year;
- research-interest statement;
- keywords, methods, techniques, populations, datasets, or application areas;
- excluded topics;
- preference for experimental, theoretical, computational, clinical, or mixed
  work.

### 4.2 Professor-specific deep search

Inputs:

- professor name;
- optional university or profile URL;
- optional user-interest profile.

The agent focuses on one professor and produces the complete evidence profile,
including current institution, research, lab, publications, students, funding,
and recruitment signals.

### 4.3 Refresh existing result

The user can refresh a saved professor or prior run. Refresh creates new source
snapshots and signals without silently replacing user notes or historical
evidence.

### 4.4 Guided research-profile builder

Users who do not yet have a polished research-interest statement can build a
matching profile through short guided fields:

- broad field and specific subfields;
- research problem or question;
- preferred theories or themes;
- methods already known;
- methods the student wants to learn;
- software, instruments, datasets, populations, or study settings;
- prior thesis, project, paper, or work experience;
- preferred balance of theory, experimentation, computation, fieldwork, or
  clinical work;
- target degree and intake;
- geographic or funding constraints;
- hard exclusions and deal-breakers;
- career direction after the degree.

GLM-5.1 may convert these inputs into a structured matching profile, but the
user must review and edit it before search.

### 4.5 Search depth

The user can select:

- `Quick Map`: official faculty discovery and compact fit screening;
- `Deep Atlas`: full professor, lab, student, paper, funding, and recruitment
  investigation;
- `Focused Dossier`: exhaustive research for one named professor.

Search depth changes completeness and run time, not the truth standard. Every
mode still requires evidence-backed claims.

## 5. End-to-End Workflow

### Stage A: Define the search

1. User opens the `Advisor Atlas` tab.
2. User selects university/department discovery or professor-specific search.
3. User enters required and optional matching context.
4. ScholarDocX resolves ambiguous universities before starting.
5. The UI previews the public domains and user profile context that will be
   used.
6. User starts the run.

### Stage B: Discover authoritative sources

1. Locate the official university domain.
2. Locate the requested department, school, or program.
3. Locate faculty directories and faculty category pages.
4. Extract candidate professor names, roles, profile URLs, and contact details.
5. Follow approved links to official personal pages and laboratory sites.
6. Use web search to find missing official profile, lab, funding, publication,
   and recruitment pages.
7. Deduplicate candidates by normalized name, institution, department, email,
   and canonical profile URL.
8. Build a department map of faculty groups, research centers, labs, graduate
   programs, and cross-appointed professors.
9. Record why each discovered person was included, excluded, or marked
   uncertain.

### Stage C: Crawl and extract

For each candidate, collect when publicly available:

- full name, title, department, institution, and contact details;
- official profile and personal website;
- lab name and lab website;
- research interests, methods, topics, and application areas;
- biography and current projects;
- latest four or five relevant publications;
- Google Scholar profile URL when publicly discoverable;
- lab members, student degree types, alumni outcomes, and current team shape;
- explicit recruitment language and application instructions;
- current vacancies or funded student positions;
- recent grants, awards, funded projects, and project dates;
- page dates, source quality, and evidence excerpts;
- academic position, appointment type, cross-appointments, and career stage;
- research facilities, datasets, instruments, field sites, and computational
  resources;
- collaboration network and recurring coauthors;
- publication trajectory and recent changes in research direction;
- lab composition by PhD, Master's, undergraduate, postdoctoral, research
  staff, and alumni;
- student research topics, coauthorship patterns, and publicly stated outcomes;
- funding source, grant period, project theme, and whether student support is
  explicit or inferred;
- application prerequisites, contact preferences, and instructions for
  prospective students;
- public statements that the professor is not recruiting or is on leave.

Extraction uses deterministic HTML metadata and selectors first. GLM is used for
structured extraction and synthesis when page structures differ.

### Stage D: Enrich and verify

1. Normalize names, titles, URLs, topics, publication identifiers, dates, and
   degree labels.
2. Cross-check important facts across independent sources where possible.
3. Prefer official university, lab, funder, grant, publisher, DOI, and
   researcher pages over search snippets.
4. Detect stale, conflicting, or undated evidence.
5. Assign field-level evidence confidence.
6. Keep source excerpts short and tied to the exact claim.
7. Build a coverage matrix for every professor so missing areas remain visible.
8. Run targeted gap searches only for missing high-value fields.
9. Detect identity collisions between professors with similar names.
10. Separate current facts from historical facts and preserve change dates.

### Stage D2: Multi-pass intelligence search

Deep Atlas uses an organized sequence instead of one broad query:

1. `Identity pass`: confirm professor, institution, department, title, and
   canonical pages.
2. `Research pass`: extract themes, methods, projects, facilities, and recent
   direction.
3. `Publication pass`: identify the latest and most relevant papers, not merely
   the most cited papers.
4. `Lab pass`: map team composition, student types, research topics, and
   publicly visible outcomes.
5. `Opportunity pass`: search openings, prospective-student notices, funded
   positions, grants, vacancies, and negative recruiting statements.
6. `Fit pass`: compare the student's profile against the evidence.
7. `Verification pass`: challenge high-impact conclusions, conflicts, stale
   pages, and unsupported assumptions.
8. `Action pass`: produce reading, verification, and contact-preparation steps.

Each pass records its search intent, inspected sources, useful evidence,
unresolved questions, and stop reason. This prevents a shallow answer from
appearing to be a complete investigation.

### Stage E: Match and rank

The agent compares the user's research profile with:

- professor research themes;
- recent publication topics;
- active projects;
- lab methods and facilities;
- current student types and degree mix;
- explicit degree requirements;
- recruitment and funding signals.

Initial explainable score dimensions:

- research-question and topic alignment: 25%;
- method and technical alignment: 15%;
- recent-publication alignment: 15%;
- active-project and research-direction alignment: 10%;
- lab and student-environment fit: 10%;
- degree, intake, and recruitment alignment: 10%;
- student preparation and prerequisite fit: 10%;
- source freshness and completeness: 5%.

Weights are a planning baseline and should be configurable and tested before
being treated as final product behavior.

The result must include:

- overall match score;
- evidence confidence;
- strongest matching reasons;
- important mismatches or missing evidence;
- recruitment state;
- suggested questions for the user to verify before outreach.
- `why this professor` summary grounded in evidence;
- `why this may not work` summary;
- skills the student already brings;
- preparation gaps and suggested ways to close them;
- professor-specific paper bridge connecting the student's interests to recent
  work;
- confidence-adjusted rank so thin evidence cannot silently outrank a
  well-supported profile;
- recommended next action and urgency.

### Stage E2: Student decision intelligence

The system should derive structured, source-backed guidance:

- `Research bridge`: how the student's interests connect to concrete professor
  projects or papers.
- `Method bridge`: matching methods, missing methods, and learnable adjacent
  skills.
- `Lab environment`: visible lab size, degree mix, collaboration and
  coauthorship patterns, plus caveats about unavailable information.
- `Trajectory`: whether recent work appears stable, expanding, shifting, or
  unclear.
- `Opportunity timing`: evidence dates, deadlines, likely intake relevance, and
  urgency.
- `Preparation readiness`: ready now, small gaps, substantial gaps, or
  insufficient evidence.
- `Risk flags`: stale website, conflicting affiliation, no recent output,
  inactive lab page, unclear funding, explicit no-opening notice, or poor topic
  overlap.
- `Verification questions`: concise questions for official pages, program
  coordinators, current students, or the professor.

These are decision aids, not personality judgments. The system must not infer
private traits, mentoring quality, or lab culture beyond public evidence.

### Stage F: Review and save

Users can:

- filter and sort results;
- inspect a professor evidence drawer;
- compare selected professors;
- shortlist or dismiss candidates;
- add local notes and tags;
- save a professor into ScholarDocX's existing professor records;
- link a result to a university, program, project, or application;
- open original sources;
- rerun or refresh selected candidates.
- organize candidates into `Top Match`, `Promising`, `Needs Verification`,
  `Watch`, `Contacted`, and `Not a Fit`;
- create a ranked application wave;
- mark papers as `Read next`, `Reading`, or `Read`;
- track unanswered questions and evidence gaps;
- view what changed since the previous refresh;
- generate a local contact-preparation brief without sending email.

Saving into core records requires explicit user confirmation.

## 6. Source Strategy

### 6.1 Source priority

1. Official university and department pages.
2. Official professor, personal, and lab pages.
3. Official vacancy, graduate recruitment, and project pages.
4. Official funder, grant database, and institutional news pages.
5. DOI/publisher, ORCID, OpenAlex, Crossref, or Semantic Scholar records.
6. Public Google Scholar profile links or indexed references when accessible.
7. Other reputable public pages and search results.

### 6.2 Google Scholar boundary

Google Scholar is useful but automated direct scraping is fragile and may be
restricted. The feature must not bypass blocks or CAPTCHA challenges.

The implementation should:

- discover and preserve a public Google Scholar profile URL when available;
- use it only when access is technically and legally permitted;
- fall back to official publication lists, DOI/publisher pages, ORCID, OpenAlex,
  Crossref, or Semantic Scholar for the latest four or five papers;
- show which source supplied each publication;
- avoid claiming a list is complete when Scholar data could not be verified.

### 6.3 Freshness

Recruitment and funding evidence should prefer current and future academic
cycles. Undated or old evidence must be labeled.

Recommended baseline:

- explicit openings: current deadline or page updated within 12 months;
- grants/funded projects: active project period or announcement within 24
  months;
- publications: latest available records, with publication year displayed;
- lab membership: current page snapshot with retrieval date.

These thresholds should be configurable rather than buried in prompts.

### 6.4 Evidence completeness matrix

Each dossier exposes coverage instead of hiding missing data:

| Area | Example coverage |
|---|---|
| Identity | title, department, institution, current appointment |
| Research | themes, methods, active projects, facilities |
| Publications | recent papers, dates, venues, relevance |
| Laboratory | lab page, members, student types, alumni |
| Opportunity | openings, vacancies, funding, negative signals |
| Application | degree fit, prerequisites, contact instructions |

Coverage states:

- `Strong`: recent primary sources support the area.
- `Partial`: useful evidence exists but important gaps remain.
- `Weak`: only indirect, old, or low-authority evidence exists.
- `Unavailable`: the agent could not verify the area.

### 6.5 Contradiction handling

When sources disagree:

- show both claims;
- rank sources by authority and date;
- do not silently select the more optimistic statement;
- explain the likely interpretation;
- create a verification question;
- lower evidence confidence until resolved.

## 7. AI Responsibilities

### 7.1 GLM-5.1

Use `GLM-5.1` as the primary reasoning and structured text-extraction model for:

- classifying pages and source types;
- extracting normalized professor facts into a strict schema;
- synthesizing research themes from multiple sources;
- matching user interests to professor work;
- explaining scores, conflicts, and missing evidence;
- classifying recruitment signals from supplied evidence.

### 7.2 GLM vision model

Use the configured GLM vision model only when useful for public source content
that cannot be reliably read as text, such as:

- image-based laboratory member pages;
- scanned public vacancy flyers;
- public PDF screenshots or diagrams containing recruitment details.

Vision output must pass through the same evidence schema and validation rules.
Ordinary HTML pages should use text extraction instead of screenshots.

### 7.3 AI output constraints

- Require bounded structured JSON for extraction and classification.
- Treat model output as untrusted until schema validation succeeds.
- Never let the model invent URLs, dates, grants, papers, student names, or
  recruitment claims.
- Reject unsupported claims or downgrade them to `Unknown`.
- Include source IDs in every synthesized claim.
- Keep matching explanations concise and inspectable.

## 8. Proposed Technical Architecture

### 8.1 Frontend modules

Suggested feature boundary:

```text
frontend/src/components/professor-discovery/
  ProfessorDiscoveryView.tsx
  DiscoverySearchForm.tsx
  DiscoveryRunProgress.tsx
  ProfessorResults.tsx
  ProfessorResultCard.tsx
  ProfessorEvidenceDrawer.tsx
  ProfessorCompareView.tsx
  RecruitmentSignalBadge.tsx
  professor-discovery.css
frontend/src/lib/professorDiscoveryApi.ts
```

`frontend/src/App.tsx` is already above the repository file-size limit. The new
tab should add only a small lazy-loaded route/view hook there and keep all
feature state inside the new module.

### 8.2 Backend modules

Suggested feature boundary:

```text
backend/app/api/professor_discovery.py
backend/app/schemas/professor_discovery.py
backend/app/services/professor_discovery/
  orchestrator.py
  source_discovery.py
  crawler.py
  page_parser.py
  extractor.py
  publications.py
  recruitment.py
  matching.py
  dossier.py
  gap_search.py
  change_detection.py
  next_actions.py
  evidence.py
  repository.py
```

Provider calls should reuse or extend existing backend GLM and Tavily
boundaries. Provider-specific transport must not be placed in the frontend or
mixed into crawler logic.

### 8.3 Local execution model

The first implementation should use a local persisted job:

- create a discovery-run record;
- execute work in an in-process background worker;
- persist stage, progress, errors, and partial results;
- let the frontend poll or use a local event stream;
- support cancel and safe resume;
- avoid external queues or cloud workers.

Long-running provider and crawl operations must not hold one request open until
the full run completes.

### 8.4 Proposed API surface

```text
POST   /professor-discovery/runs
GET    /professor-discovery/runs
GET    /professor-discovery/runs/{run_id}
POST   /professor-discovery/runs/{run_id}/cancel
POST   /professor-discovery/runs/{run_id}/resume
GET    /professor-discovery/runs/{run_id}/professors
GET    /professor-discovery/professors/{candidate_id}
POST   /professor-discovery/professors/{candidate_id}/refresh
POST   /professor-discovery/professors/{candidate_id}/save
PATCH  /professor-discovery/professors/{candidate_id}/shortlist
```

The exact contracts must be finalized in technical context before code.

## 9. Proposed Local Data Model

### `professor_discovery_runs`

- id, user_id, mode, university_name, university_url;
- department, degree_target, intake_term;
- research_profile_json, status, current_stage;
- progress_json, approved_domains_json;
- started_at, completed_at, cancelled_at, created_at, updated_at.

### `professor_candidates`

- id, run_id, normalized_name, display_name, title;
- institution, department, email;
- official_profile_url, personal_url, lab_name, lab_url;
- research_summary, match_score, evidence_confidence;
- recruitment_state, recruitment_summary;
- shortlist_status, saved_professor_id;
- created_at, updated_at.

### `professor_evidence`

- id, candidate_id, source_url, canonical_url, source_type;
- page_title, retrieved_at, published_at;
- claim_type, claim_text, evidence_excerpt;
- confidence, content_hash, metadata_json.

### `professor_publications`

- id, candidate_id, title, authors_json, publication_year;
- venue, doi, source_url, abstract_summary;
- topic_tags_json, evidence_id.

### `professor_opportunity_signals`

- id, candidate_id, signal_type, state;
- title, description, deadline, project_start, project_end;
- evidence_id, confidence, detected_at.

### `professor_match_details`

- id, candidate_id, total_score;
- topic_score, method_score, publication_score;
- lab_fit_score, recruitment_score, freshness_score;
- reasons_json, gaps_json, scoring_version.

### `professor_dossiers`

- id, candidate_id, dossier_version;
- research_bridge_json, method_bridge_json;
- lab_environment_json, trajectory_json;
- readiness_json, risk_flags_json;
- verification_questions_json, next_actions_json;
- generated_at, updated_at.

### `professor_watch_events`

- id, candidate_id, event_type, previous_value_json, new_value_json;
- evidence_id, importance, detected_at, acknowledged_at.

### `professor_reading_items`

- id, candidate_id, publication_id, relevance_reason;
- reading_priority, reading_status, user_note, updated_at.

All user-owned records must be scoped by the current local user through the run
or direct user ID.

## 10. UI and UX Structure

### Empty state

- Explain what the agent searches and what it cannot guarantee.
- Offer `University & Department` and `Specific Professor` starting actions.
- Show a compact privacy and public-source notice.
- Introduce `Advisor Atlas` with the supporting line
  `AI-powered supervisor intelligence`.

### Search form

- Use progressive disclosure.
- Keep university and department prominent.
- Place detailed research profile fields in an optional `Improve matching`
  section.
- Validate required fields near the input.
- Preserve a local draft.
- Show exactly what user context may be sent to GLM.

### Running state

Display pipeline stages:

1. Resolving university.
2. Mapping department, centers, labs, and faculty.
3. Verifying professor identities.
4. Reading profiles, projects, and laboratories.
5. Building publication and student intelligence.
6. Checking funding, openings, and negative signals.
7. Verifying conflicts and evidence gaps.
8. Matching, ranking, and preparing next actions.

Show:

- current stage and completed counts;
- partial results as they become available;
- warnings for blocked or inaccessible sources;
- stop control;
- no fake percentage when total work is unknown.

### Results

Default card/list information:

- professor, title, university, department;
- match score and evidence confidence;
- research-theme chips;
- latest paper year;
- lab/student summary;
- recruitment state and freshness;
- strongest match reason;
- source count;
- shortlist, compare, inspect, refresh, and save actions.

Organize results into decision lanes:

- `Best Supported Matches`: strong fit with strong evidence;
- `High Potential`: strong fit with meaningful evidence gaps;
- `Open or Funded Signals`: current opportunity evidence;
- `Explore Further`: plausible adjacent matches;
- `Needs Verification`: promising but conflicting, stale, or incomplete;
- `Not Recommended`: weak fit or a material mismatch, with an explanation.

Filters:

- minimum match score;
- recruitment state;
- evidence confidence;
- research topics and methods;
- degree fit;
- publication recency;
- lab/student profile;
- shortlisted status.
- readiness level;
- risk flags;
- evidence coverage area;
- changed-since-last-check signals.

### Advisor dossier

Opening a professor presents a structured dossier, not a long AI paragraph:

1. `Decision snapshot`: rank, fit, confidence, recruitment state, freshness,
   readiness, and recommended next action.
2. `Why this match`: strongest evidence-backed connections.
3. `Possible mismatch`: gaps, risks, and reasons to deprioritize.
4. `Research map`: themes, methods, projects, facilities, and direction.
5. `Paper bridge`: latest four or five papers, relevance, and reading order.
6. `Lab intelligence`: team shape, degree mix, student topics, collaboration
   signals, and unavailable information.
7. `Opportunity radar`: openings, funding, grants, deadlines, and negative
   recruitment evidence.
8. `Application fit`: degree route, prerequisites, intake alignment, contact
   instructions, and preparation gaps.
9. `Next-action plan`: read, verify, prepare, monitor, or contact.
10. `Evidence ledger`: claim sources, dates, authority, confidence, conflicts,
    and search coverage.

The dossier starts with concise decision information and progressively reveals
detail. It must remain scannable even with dozens of sources.

### Compare workspace

Users can compare up to four professors across:

- research and method fit;
- latest-paper relevance;
- active projects;
- lab composition;
- opportunity evidence;
- application readiness;
- evidence confidence and freshness;
- risk flags and unresolved questions;
- recommended next action.

Comparison cells show the reason behind a score and never rely on color alone.

### Action center

Each completed run concludes with an organized student plan:

- top professors to investigate first;
- papers to read this week;
- facts requiring manual verification;
- skills or portfolio evidence to prepare;
- time-sensitive openings or deadlines;
- candidates to monitor;
- candidates to deprioritize and why.

Advisor Atlas may prepare a professor-specific contact brief containing the
research bridge, relevant papers, useful questions, and evidence links. Actual
message drafting or sending remains a separate confirmed workflow.

### Evidence drawer

Use sections for:

- overview;
- research fit;
- recent publications;
- laboratory and students;
- recruitment and funding signals;
- contacts and links;
- evidence timeline;
- conflicts and missing information.

Every consequential claim must open its source.

### Accessibility and responsive behavior

- full keyboard navigation and visible focus;
- labels for all controls and icon buttons;
- 44px minimum interactive targets;
- status text in addition to color;
- `aria-live` updates for run progress without excessive announcements;
- mobile cards instead of a compressed wide table;
- no horizontal page overflow;
- reduced-motion support;
- clear retry and recovery actions.

## 11. Error and Recovery Behavior

Handle:

- ambiguous university names;
- missing department pages;
- empty or JavaScript-only faculty directories;
- blocked pages and robots restrictions;
- provider key missing;
- Tavily or GLM failure;
- malformed AI output;
- duplicate professors;
- conflicting title, institution, or recruitment evidence;
- stale recruitment pages;
- cancelled and partially completed runs;
- app restart during a run.

Partial evidence is retained. A failed source must not erase successful
professor profiles from the same run.

## 12. Security and Privacy

- External requests occur only after explicit user action.
- Display the public domains and user-entered matching context involved.
- Never send local documents, transcripts, emails, or application records
  unless a later explicit workflow requests and previews that context.
- Keep GLM and Tavily keys backend-only.
- Sanitize fetched HTML and never execute remote scripts.
- Block local network, loopback, file, and private-address URLs to prevent SSRF.
- Validate redirects and DNS resolution before each fetch.
- Limit downloaded content by type and size.
- Do not store full fetched pages indefinitely when evidence excerpts and
  content hashes are sufficient.
- Escape all rendered source content.

## 13. Scope

### In scope

- new `Advisor Atlas` navigation tab;
- university/department and professor-specific searches;
- public-web source discovery and respectful crawling;
- professor, lab, student, publication, funding, and recruitment enrichment;
- latest four or five publication records where verifiable;
- GLM-5.1 extraction, reasoning, matching, and explanation;
- GLM vision fallback for suitable public visual documents;
- evidence-backed recruitment states;
- explainable matching and confidence;
- local persisted runs, results, shortlists, notes, and refreshes;
- organized advisor dossiers, evidence coverage, reading paths, risk flags,
  verification questions, and next-action plans;
- change detection for refreshed shortlisted professors;
- explicit save into existing ScholarDocX professor data;
- focused unit, integration, and browser tests.

### Out of scope for this story

- subscription, role, quota, and usage-limit design;
- automatic email sending or outreach;
- automatic application submission;
- guaranteed admission or supervisor availability;
- scraping behind authentication, CAPTCHA, paywalls, or blocked robots rules;
- remote job queues or hosted crawling infrastructure;
- mass crawling unrelated to the user's selected university or professor;
- social-media profiling;
- collecting sensitive personal information unrelated to academic matching.

## 14. Delivery Phases

### Phase 1: Foundation

- tab and responsive workspace;
- run lifecycle and local persistence;
- search form and professor-specific mode;
- official university/department/faculty discovery;
- respectful crawler and evidence storage.

### Phase 2: Professor profiles

- normalized profile extraction;
- lab and member-page discovery;
- deduplication;
- evidence drawer;
- partial-results UI.

### Phase 3: Publications and matching

- latest publication enrichment with source fallbacks;
- GLM-5.1 structured extraction;
- research-profile matching;
- explainable scoring and confidence.
- personalized paper bridge and reading order;
- preparation readiness, fit gaps, and risk flags.

### Phase 4: Recruitment and funding intelligence

- explicit openings;
- vacancies and funded positions;
- recent grants and active projects;
- recruitment-state classifier with freshness and evidence rules.

### Phase 5: ScholarDocX integration

- decision lanes, dossiers, shortlist, compare, notes, reading path, and refresh;
- change detection, watch events, and action center;
- save/link to existing professor, university, program, project, or application;
- regression tests and browser verification.

Limits and commercial usage policy are intentionally deferred until the feature
works end to end.

## 15. Test Strategy

### Unit tests

- university and department normalization;
- URL allowlisting, redirect validation, SSRF prevention, and robots decisions;
- HTML parsing and faculty candidate extraction fixtures;
- professor deduplication;
- JSON-schema validation for GLM output;
- publication normalization and latest-four/five selection;
- recruitment-state rules and stale-evidence handling;
- match scoring, weight versioning, and explanation generation;
- evidence-confidence calculation;
- evidence coverage, risk flags, readiness, dossier generation, paper ordering,
  and next-action rules;
- change detection between source snapshots;
- user scoping and repository persistence.

### Integration tests

- run creation, polling, cancellation, resume, and partial failure;
- mocked Tavily and GLM success/failure;
- multi-page department to professor to lab flow;
- save candidate into existing professor records;
- app restart with incomplete persisted run;
- no-key behavior and provider recovery.

### Frontend tests

- required-field validation;
- progressive form sections;
- progress and partial-result states;
- result filtering and sorting;
- evidence drawer source navigation;
- dossier organization and progressive disclosure;
- decision lanes, comparison, reading status, action center, and change events;
- shortlist, compare, refresh, and save confirmation;
- loading, empty, blocked, cancelled, and error states.

### Browser verification

- desktop and mobile tab flow;
- long-running progress behavior;
- large professor result set;
- no horizontal overflow;
- keyboard-only navigation;
- screen-reader status semantics;
- responsive evidence drawer and compare view.

## 16. Definition of Done

- A user can start either search mode from the new tab.
- The system discovers and deduplicates relevant professors from public sources.
- Each profile shows traceable evidence for research, lab, publications, and
  recruitment/funding signals.
- Latest four or five papers are shown when verifiable, with clear fallbacks
  when Google Scholar cannot be used.
- Match score, evidence confidence, and recruitment state are separately
  explained.
- Each shortlisted professor has an organized dossier, paper bridge, coverage
  matrix, risks, verification questions, and next-action plan.
- The final run summary provides a prioritized action center rather than only
  ranked cards.
- The user can stop, resume, revisit, refresh, shortlist, compare, and save.
- Partial results survive provider failures and app restart.
- No source restrictions or access controls are bypassed.
- Local data remains user-scoped and external calls expose only necessary data.
- Unit/integration tests and responsive browser verification pass.
- AI-Context and Jira completion notes match the implemented behavior.

## 17. Open Implementation Decisions

- Final Lucide icon for `Advisor Atlas`; `Map`, `Compass`, and `Telescope` are
  candidates, with no emoji icon.
- Whether Tavily search alone is sufficient for source discovery or whether a
  second standards-based publication API is required.
- Which GLM vision model identifier is available in the configured provider at
  implementation time.
- Whether JavaScript-rendered official pages require an optional local browser
  fetcher after the static-HTML path.
- Final crawl page/depth/time safeguards for personal-scale runs.
- Final matching weights and user control over them.
- Retention policy for fetched page snapshots versus compact evidence only.
- Whether comparison/export ships in the first implementation increment or the
  final integration phase.
