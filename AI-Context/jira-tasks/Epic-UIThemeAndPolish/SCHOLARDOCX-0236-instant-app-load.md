# SCHOLARDOCX-0236: Faster app load (keep the loading splash)

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

After login or reload the "Loading ScholarDocX..." splash stayed up until `POST /workspace/init`
returned and then five parallel data requests all finished (`Promise.all`): two sequential network
round-trips, each paying auth and database latency. Measured from this machine to the hosted
database: ~3.8s for a fresh connection and 0.2-0.5s per query round trip, so every extra
sequential request is visible.

## Changes (frontend only)

- `App.tsx`: `message` starts as "Ready." so the shell renders immediately (auth comes from the token,
  already synchronous). The splash now only appears when loading fails.
- Dropped the sequential `/workspace/init` call: the backend already initializes at boot
  (`create_app` -> `ensure_db_initialized`) and every data route funnels through the same memoized,
  lock-guarded init, so nothing needs to run first. The endpoint remains.
- `refresh()` still awaits all five requests but applies each result as it arrives.
- `DashboardView` takes `loading` and shows "–" instead of a false 0 until the first summary lands.

## Verification

Playwright with a mocked API at 400ms per call: shell visible ~350ms (page load), dashboard numbers
filled ~740ms (one parallel round trip). Before: splash until init (400ms) + data (400ms) completed.

## Not done / next levers

- `pool_pre_ping=True` in `backend/app/db/connection.py` adds one round trip to every request's
  connection checkout; against a distant database that is ~0.2s per request. Removing it needs
  `pool_recycle` plus a retry story for stale pooled connections, so it was left alone.
- The first request after a backend restart still pays the ~3.8s fresh-connection cost; on Render it
  is the free tier's idle sleep (~30s) that dominates, which no code change fixes.

## Owner decision (same day): keep the splash

The first version removed the splash and rendered the shell immediately with placeholders; the owner found the
dashboard "keeps loading" and looked bad, and asked to keep the loading screen. Reverted that part: `message`
starts as "Loading ScholarDocX..." again and the splash lifts only after all five requests have landed. Kept: the
dropped `/workspace/init` round-trip (one fewer sequential request) and parallel loading. The `loading` prop on
`DashboardView` stays but is always false once the splash lifts. Do not remove the splash again without asking.
