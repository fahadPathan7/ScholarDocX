# Feature: Advisor Atlas

Requirement group: FR-9

## Goal

Advisor Atlas is an evidence-backed supervisor intelligence workspace. It
discovers professors from a university and department, or deeply investigates
one professor, then organizes the findings into advisor dossiers and a
prioritized student action plan.

## Requirements

- FR-9.1: Show `Advisor Atlas` as a dedicated navigation tab with the supporting
  line `AI-powered supervisor intelligence`.
- FR-9.2: Support university/department discovery and professor-specific search.
- FR-9.3: Let users provide research topics, methods, experience, learning goals,
  degree, intake, constraints, and exclusions through a reviewable profile.
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
  states accessibly on desktop and mobile.

## Result Organization

Decision lanes:

- Best Supported Matches
- High Potential
- Open or Funded Signals
- Explore Further
- Needs Verification
- Not Recommended

Each dossier starts with a concise decision snapshot and progressively reveals
research, publications, lab, opportunity, application, and evidence detail.

## Non-Goals

- Guaranteed supervisor availability or admission likelihood.
- Automatic outreach or application submission.
- Social-media profiling.
- Access-control bypass.
- Product limits or usage accounting in this implementation.
