# SCHOLARDOCX-0216: Automated Supabase keep-alive to prevent free-tier inactivity pause

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-10-31

## Summary

Supabase pauses free-tier projects after ~7 days of low user database activity,
and restoring is a manual dashboard click. Add a scheduled GitHub Actions
workflow that runs one trivial `SELECT` against the database twice a day, plus
a manual script for ad-hoc runs. Nothing is written, so there is nothing to
clean up.

## Business Context

Links:

- Business file: [business/product-vision.md](../../business/product-vision.md)

Business value:

- The production database stays reachable without the operator remembering to
  click "Resume project" after idle weeks.
- Honours the zero-infrastructure-cost constraint: GitHub Actions free quota
  (a ~10 s job twice a day) costs nothing.

## Functional Context

Links:

- Functional file: none — no user-visible feature; infrastructure automation
  only.

Requirements:

- None (no FR). The database must simply never be paused by inactivity.

## Technical Context

Links:

- Technical file: [technical/stack-and-runtime.md](../../technical/stack-and-runtime.md)

Technical notes:

- Supabase policy: free projects pause after ~7 days of low *user database
  activity*; a few real queries a day is enough to prevent it
  (https://supabase.com/docs/guides/platform/free-project-pausing).
- Same scheduling constraint as SCHOLARDOCX-0162: Render free web services
  sleep after 15 min, so the trigger must live outside Render. GitHub Actions
  scheduled workflows run on GitHub's runners and are the established repo
  pattern.
- The workflow connects via the Supabase **connection pooler** URI
  (`…pooler.supabase.com`), because GitHub runners have no IPv6 and the
  direct `db.<ref>.supabase.co` host is IPv6-only.
- Deliberately reads only (`SELECT 1`): no churn against the 500 MB free-tier
  disk, no WAL/dead-tuple bloat, no destructive-cleanup risk.
- Scheduled workflows only run on the default branch; GitHub disables cron
  schedules after 60 days of repo inactivity (emails first) — a non-issue for
  an actively developed repo.

## Scope

In scope:

- `.github/workflows/supabase-keepalive.yml` — scheduled + manual-trigger ping.
- `backend/scripts/keepalive_supabase.py` — same ping for ad-hoc local runs.
- Context updates in [technical/stack-and-runtime.md](../../technical/stack-and-runtime.md).

Out of scope:

- Keeping the Render web service warm (cold start is a separate annoyance;
  could be a follow-up uptime-monitor task).
- Any backend/app code change. Any schema change. Any write activity.

## Acceptance Criteria

- Workflow file present with a twice-daily schedule and `workflow_dispatch`.
- Workflow fails loudly (red run) if the `SUPABASE_DB_URL` secret is missing.
- Successful run executes exactly one `SELECT` and writes no data.
- Manual script runs from repo root using the backend's existing env
  resolution and exits non-zero on connection failure.

## Implementation Plan

- Copy the structure of `.github/workflows/cleanup-pending-accounts.yml`
  (curl/psql + secret guard + `workflow_dispatch`), replacing the endpoint
  call with a pooled `psql` connection.
- Manual script follows `backend/scripts/create_superadmin.py` conventions
  (PYTHONPATH bootstrap, root `.env` load, `get_engine`).

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- None.

If no unit tests are needed, explain why:

- Pure ops glue: declarative YAML plus a connectivity script with no data
  transformation, validation, or persistence logic. Verified by executing the
  workflow (Actions tab) and the script directly.

## File Size Check

Files expected to be edited:

- `.github/workflows/supabase-keepalive.yml` (new, ~60 lines)
- `backend/scripts/keepalive_supabase.py` (new, ~50 lines)
- `AI-Context/technical/stack-and-runtime.md` (small addition)

Line-count risk:

- Low

## Verification Plan

- YAML parses; Python script compiles and (with DATABASE_URL set) answers.
- After merge: run the workflow manually from the Actions tab and inspect the
  green log output showing the `SELECT` result.

## Completion Notes

Changed files:

- `.github/workflows/supabase-keepalive.yml` (new)
- `backend/scripts/keepalive_supabase.py` (new)
- `AI-Context/technical/stack-and-runtime.md` (new "Supabase Keep-Alive" subsection)
- This task file.

Verification completed:

- Workflow YAML parsed cleanly; script compiled; labelled-row access pattern
  verified.
- Live run of `python backend/scripts/keepalive_supabase.py` from the repo
  root answered: "Database is awake and answering (server time: 2026-10-31
  21:19 UTC)" through the same pooler endpoint the workflow will use.
- Workflow's scheduled run itself is pending: needs the `SUPABASE_DB_URL`
  repo secret and a merge to main (owner action, see Follow-ups).

Unit tests added or updated:

- None (see Unit Test Plan).

Follow-ups:

- Owner: add the `SUPABASE_DB_URL` repo secret (reuse the root `.env`
  `DATABASE_URL` value — it is already a pooler URI) and merge this branch to
  main, then trigger one manual run from the Actions tab to confirm green.
- Optional future task: keep the Render web service warm (uptime monitor) if
  cold starts become a complaint.
