# Feature: Advisor Atlas

Requirement group: FR-9

## Goal

Advisor Atlas is an evidence-backed supervisor intelligence workspace. It
maps a university's academic structure around a user-selected field, discovers
professors across the related departments and interdisciplinary units, or
deeply investigates one professor. It turns public evidence into a transparent
research-fit funnel, semester-aware opportunity outlook, and granular dossier.

Advisor Atlas runs its structured extraction, fit analysis, and synthesis on
the GLM provider, using GLM-5.2 as the default model (overridable via the
`ADVISOR_ATLAS_GLM_MODEL` setting). The vision pass uses
`ADVISOR_ATLAS_VISION_MODEL` (default GLM-4.6V).

## Requirements

- FR-9.1: Show `Advisor Atlas` as a dedicated navigation tab with the supporting
  line `AI-powered supervisor intelligence`.
- FR-9.2: Support field-led university discovery and professor-specific search.
- FR-9.3: Require at least one user research interest in both Discovery and
  Professor modes, and let users provide up to five interests plus degree and
  intake context through a reviewable profile.
- FR-9.4: Support Quick Map, Deep Atlas, and Focused Dossier search depths.
- FR-9.5: Discover and deduplicate professors from public authoritative sources.
- FR-9.6: Enrich profiles with research, projects, labs, students, publications,
  funding, contact instructions, and recruitment evidence.
- FR-9.7: Show the latest four or five verifiable publications with source
  attribution and fallbacks when Google Scholar cannot be used.
- FR-9.8: Run separate identity, research, publication, lab, opportunity, fit,
  verification, and action passes for deep searches.
- FR-9.9: Preserve source URL, type, date, excerpt, confidence, and retrieval
  time for consequential claims.
- FR-9.10: Keep match score, evidence confidence, and recruitment state separate.
- FR-9.11: Classify recruitment as confirmed open, strong signal, possible
  opportunity, no current evidence, or unknown.
- FR-9.12: Never treat funding or lab activity alone as proof of recruitment.
- FR-9.13: Produce a structured dossier with research and method bridges, paper
  reading path, lab intelligence, opportunity radar, application fit, risks,
  verification questions, and next actions.
- FR-9.14: Expose evidence coverage and conflicting or missing information.
- FR-9.15: Organize candidates into decision lanes and compare up to four.
- FR-9.16: Persist runs, partial results, dossiers, shortlists, notes, reading
  status, and refresh changes in local SQLite.
- FR-9.17: Allow stop, revisit, refresh, and safe resume of eligible runs.
- FR-9.18: End completed runs with a prioritized student action center.
- FR-9.19: Require confirmation before saving a candidate into core professor
  records.
- FR-9.20: Respect public access restrictions and never bypass login, CAPTCHA,
  paywalls, robots rules, or blocked sources.
- FR-9.21: Handle loading, partial, empty, cancelled, blocked-source, and failure
  states accessibly on desktop and mobile. The full professor dossier must use
  a wide research-workspace layout on desktop, progressively collapse on
  smaller screens, and never render long values in character-width columns.
- FR-9.22: Before collecting faculty, discover the university's departments,
  schools, institutes, centers, and interdisciplinary units that may be related
  to the requested field.
- FR-9.23: Classify mapped units as direct, adjacent, or interdisciplinary
  matches, explain why they were included, and keep professors labeled with
  their actual unit.
- FR-9.24: Discovery results must expose three nested populations: all verified
  faculty from mapped units, the semantic research-fit subset, and the
  recruitment/opportunity subset drawn only from research matches.
- FR-9.25: Research matching must evaluate meaning, methods, problems, and
  application areas rather than requiring exact keyword overlap. Deterministic
  fallback may use weighted concept families but must identify its limitations.
- FR-9.26: Opportunity outlook must separate explicit current recruitment from
  evidence-based likelihood across the next two or three academic semesters.
- FR-9.27: Every future recruitment outlook must show likely semesters,
  confidence, supporting signals, counter-signals, and an evidence limitation.
- FR-9.28: Discovery must report coverage: mapped units, directories inspected,
  inaccessible or missing sources, verified faculty count, and whether
  completeness can be guaranteed.
- FR-9.29: Professor mode must provide granular background, lab, member,
  publication, academic-profile, funding, recruitment, trajectory, and source
  sections while clearly marking unavailable information. It must also compare
  the supplied user interests with the professor's verified research direction
  and explain the semantic match or mismatch.
- FR-9.30: The two modes must have distinct result experiences: Discovery is a
  funnel and landscape view; Professor is a single-person intelligence brief.
- FR-9.31: Advisor Atlas AI analysis must not impose a feature-specific fixed
  output-token ceiling. Provider requests should follow the same uncapped
  output behavior as standard AI chat unless a future provider requirement
  explicitly demands a bounded response.
- FR-9.32: Professor mode must use multiple purpose-specific public-web searches
  rather than relying on one broad query. Required passes cover identity and
  official pages, academic profiles, research and lab activity, latest
  publications, grants and funding, and recruitment/application evidence.
- FR-9.33: Professor mode must selectively crawl high-value accessible results
  from those passes and preserve each source's research purpose. Social or
  aggregator snippets may support discovery but must not displace official,
  publication, grant, or academic-profile sources.
- FR-9.34: The dossier must expose separate sections for professional and
  academic profiles, verified professor research interests, latest verified
  publications, organized funding and grants, lab and current members,
  contact/application path, collaborations or recent activity when available,
  and explicit source gaps.
- FR-9.35: `Latest publications` means actual scholarly works, not faculty pages,
  recruitment advertisements, search-result pages, or generic web pages.
- FR-9.36: Decision snapshot and recruitment outlook must use decision-oriented
  presentation rather than raw nested key/value output.
- FR-9.37: The visible evidence ledger must show only the three to five
  strongest and most diverse sources. The complete internal source set may
  still support analysis and verification.
- FR-9.38: Completed Professor results must show local research telemetry:
  Tavily search count, AI-call count, estimated input/output token use, crawled
  page count, source count, and elapsed time. Token values must be labeled as
  estimates unless returned directly by the provider.
- FR-9.39: Professor identity fields must be owned by the searched professor.
  Shared department pages may support identity and affiliation, but email,
  profile links, education, positions, and research interests must be extracted
  from the professor's own section or a professor-owned/verified profile.
- FR-9.40: Identity-bearing profile URLs must preserve required identifiers.
  In particular, Google Scholar links without a `user` identifier are not valid
  professor profiles, and social posts or aggregators cannot be labeled as the
  official university profile.
- FR-9.41: Advisor Atlas must follow a bounded set of trusted links exposed by
  a verified professor page, including publications, activities/CV, homepage,
  Google Scholar, GitHub, LinkedIn, and lab pages.
- FR-9.42: Every displayed publication must have verified authorship evidence
  for the searched professor. A scholarly-looking page is insufficient when
  its source does not contain both the work and the professor's authorship.
- FR-9.43: Verified deterministic extraction must repair or override conflicting
  AI output for identity, email, profiles, education, research interests, and
  publications. Unsupported AI values must be removed.
- FR-9.44: Backend AI logs must identify Advisor Atlas operations by purpose,
  such as identity/research extraction, publications/opportunity extraction,
  and final synthesis. They must not be labeled as standard AI chat.
- FR-9.45: Professor mode must require the professor's full name, university
  name, an official university or professor URL, department or research area,
  target degree, intended intake term with year, and at least one research
  interest. These inputs form the minimum identity, fit, and semester context
  for a high-confidence search. Known personal, lab, or scholarly profile URLs
  remain discoverable evidence and are not required from the user.
- FR-9.46: Dossier detail rows must adapt to content density. Short scalar facts
  may use compact label/value columns, while arrays, nested objects, multiline
  text, and long descriptions must place the label above a full-width value.
  Nested records must never be squeezed into character-width columns.
- FR-9.47: The completed Professor brief must summarize only decision-critical
  facts: current appointment and highest verified degree, one concise research
  direction, current funding or opportunity status, and public lab-member
  status. Brief copy must use third-person professor voice, correct grammar,
  and short sentences instead of reproducing first-person website prose or
  dense evidence narratives. Detailed evidence remains available in the full
  dossier.
- FR-9.48: Text-heavy Professor dossier sections must use scan-friendly
  editorial layouts instead of dense paragraphs or parallel generic key/value
  columns. Contact/application information, collaborations, and recent activity
  must appear as full-width vertical sections with structured points, cards, or
  timelines. Verification questions are not part of the visible dossier.
  The evidence ledger must use an accessible disclosure and remain collapsed by
  default so primary decision content retains visual priority.
- FR-9.49: Background, funding, and lab intelligence must not be forced into
  equal-height or equal-width cards when their information density differs.
  Background must receive the largest area and organize verified positions and
  education as readable timelines. Funding must distinguish confirmed
  opportunity signals from unavailable grant details. Lab intelligence must
  show either structured members or an intentional verified empty state, never
  a largely blank panel.
- FR-9.50: Professor dossier scores must explain what they measure. Research
  alignment represents semantic similarity between the user's supplied
  interests and the professor's verified research; source confidence represents
  the strength and coverage of public evidence supporting the profile. Neither
  score may be presented as admission probability or professor response
  likelihood.
- FR-9.51: Likely recruitment semesters in the Professor brief must read as a
  non-interactive forecast sequence, not as disabled buttons. Terms must have
  sufficient contrast, visible ordering, and responsive wrapping while
  remaining subordinate to the evidence limitation.
- FR-9.52: The Professor intelligence brief header must prioritize verified
  identity, status, source, and dossier actions without a decorative initials
  tile. Its vertical spacing must remain compact while preserving readable
  hierarchy and accessible action sizes.
- FR-9.53: Advisor Atlas must enforce one shared calendar-month quota for new
  Discovery searches, new Professor searches, and professor evidence refreshes.
  General User receives 3 actions, Pro User 10, and Max User 30. Viewing,
  saving, cancelling, deleting, and resuming existing runs do not consume this
  quota. Remaining usage must be persistently visible in the Advisor Atlas top
  header, not only inside a search form, and in the user's Usage & Limits view.
  Administrators can inspect and edit the quota through Role Limits.
- FR-9.54: Completed Discovery runs must use four purpose-built stages:
  `University Map`, `Verified Faculty`, `Research Matches`, and
  `Opportunity Outlook`. Each stage must answer a different decision question
  instead of repeating one generic professor-card layout.
- FR-9.55: Discovery must use multiple bounded searches and selective crawling
  for academic-unit mapping and official faculty-directory collection. It must
  report directories inspected, accessible directories, inaccessible sources,
  faculty counts by mapped unit, and coverage limitations.
- FR-9.56: The final `Opportunity Outlook` population must include only
  research matches with verified current recruitment or a supported
  `high_likelihood` forecast. Generic activity, funding, or a merely
  `possible` forecast remains visible as context but does not enter this final
  shortlist.
- FR-9.57: Discovery controls must support stage-aware search, academic-unit
  filtering, and useful sorting. Faculty views prioritize identity and
  affiliation; research-match views prioritize semantic bridges; opportunity
  views prioritize recruitment state, likelihood, likely semesters, and
  supporting signals.

## Discovery Funnel

1. `University Map`: identify potentially relevant academic units.
2. `Department Faculty`: collect and deduplicate verified professors from those
   units while preserving actual affiliation.
3. `Research Matches`: retain professors with at least one meaningful semantic
   bridge to the user's research interests.
4. `Opportunity Outlook`: retain only research matches with explicit current
   recruitment or a supported high likelihood of recruiting in the next two or
   three semesters.

Related-unit mapping is intentionally broader than a literal department-name
match. A Computer Science request may include CSE, Software Engineering, AI,
Data Science, Information Science, Computer Engineering, EEE, Robotics, or an
interdisciplinary institute when the university structure and faculty research
support the relationship. Weak adjacency alone is insufficient.

## Result Organization

Supporting decision lanes:

- Best Supported Matches
- High Potential
- Open or Funded Signals
- Explore Further
- Needs Verification
- Not Recommended

Each dossier starts with a concise decision snapshot and progressively reveals
research, publications, lab, opportunity, application, and evidence detail.

Decision lanes support comparison and prioritization; they do not replace the
three nested Discovery populations.

## Non-Goals

- Guaranteed supervisor availability or admission likelihood.
- Automatic outreach or application submission.
- Social-media profiling.
- Access-control bypass.
- Product limits or usage accounting in this implementation.
