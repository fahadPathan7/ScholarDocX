# SCHOLARDOCX-0140: UUID Primary Keys (Replace Auto-Increment Integers)

Status: In Progress

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-07-16

Updated: 2026-07-16

## Summary

Replace all auto-incrementing integer primary keys and foreign keys with UUID
strings across the backend models, the raw-SQL service/repository layer, the
React/TypeScript frontend types, and the test fixtures. UUIDs are opaque,
non-sequential, and globally unique, which removes enumeration risk and keeps
the data model consistent with the Supabase/Postgres deployment
(SCHOLARDOCX-0139).

## Business Context

Business value:
- Removes predictable sequential IDs that allow row enumeration by untrusted clients.
- Aligns the data model with Supabase conventions and future multi-tenant/sync work.
- Makes imported and merged records globally unique without a central counter.

## Functional Context

Requirements:
- All `id` PKs and `*_id` FKs are 36-char UUID strings (Postgres `gen_random_uuid()` default, Python `uuid4()` fallback).
- New rows get a server-generated UUID; clients never invent IDs.
- Existing call sites that treated IDs as integers are corrected.

## Technical Context

Links:
- [technical/local-storage-and-data.md](../../technical/local-storage-and-data.md)
- [technical/security-privacy.md](../../technical/security-privacy.md)

Technical notes:
- Models (`backend/app/db/models.py`) use `String(36)` PKs with
  `default=lambda: str(uuid.uuid4())` and `server_default=text("gen_random_uuid()")`.
- The `LegacyConnection` shim already appends `RETURNING id` to INSERTs, so
  `cursor.lastrowid` now returns the UUID string. Call sites that wrapped it in
  `int(...)` or compared against `int(...)` had to be fixed.
- FK columns changed from `Integer`/`int` to `String(36)`/`str`.
- Frontend TS interfaces changed `id: number` -> `id: string` (and `*_id: number`).

## Scope

In scope:
- `backend/app/db/models.py` — PK/FK column types.
- Raw-SQL call sites in services/repositories/API that cast IDs to `int`.
- Frontend TS types and `Number(...)` / `parseInt` conversions on IDs.
- Test fixtures and helper signatures.

Out of scope:
- Legacy data migration (no production rows to convert; fresh schema).
- Changing legitimate integer counters (limits, scores, token counts, booleans).

## Acceptance Criteria

- Backend boots and seeds a fresh Postgres DB with UUID PKs.
- All `lastrowid` consumers receive UUID strings, not ints.
- No `int(id)` / `Number(id)` coercion remains on PK/FK values.
- Frontend type-checks with IDs as `string`.
- Targeted backend tests pass.

## Implementation Plan

1. **Models**: convert all PK/FK columns to `String(36)` UUID with Python + DB defaults.
2. **Backend call sites**: remove `int(...)` on `lastrowid`/IDs; fix the `ai_actions_execute` str/int comparison.
3. **Frontend**: change TS interface `id: number` -> `id: string`; remove `Number()` on IDs in `FullScreenSheet` and `huntProfile`.
4. **Tests**: update helper signatures annotated `uid: int`.
5. **Context**: update this task + relevant technical docs.

## Unit Test Plan

- Verify existing pytest suite still covers the touched code paths (auth, advisor atlas, scholarship deep hunt, limits).

## Verification Plan

- Run targeted pytest modules.
- TypeScript build (`tsc`) to confirm no type regressions.

## Completion Notes

_To be filled on completion._

## Known limitations / follow-ups

- `id` column ordering inside model classes is unchanged (cosmetic only; does not affect SQL).
