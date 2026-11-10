# Data Model

**The source of truth is `backend/app/db/models.py` (plus `calendar_models.py`) and the
idempotent `_add_*` migrations in `backend/app/db/connection.py`.** This file lists what each
table group is for and records the invariants the code does not make obvious. It does not list
columns; read the models for those. Every user-owned table carries `user_id` (FK `users.id`,
cascade delete) and is always queried scoped to the signed-in user.

## Table groups

| Group | Tables | Purpose |
|---|---|---|
| Accounts and access | `users`, `external_identities`, `user_sessions`, `invite_codes`, `invite_requests`, `suspension_appeals`, `password_reset_requests`, `audit_logs` | Identity, sessions, registration paths, admin-mediated requests |
| Limits and settings | `role_limits`, `user_usage_stats`, `app_settings` | Per-role limits, per-user usage counters, admin-editable settings |
| Billing and credits | `ai_token_balances`, `ai_token_ledger`, `ai_token_packs`, `ai_token_purchase_requests`, `ai_models`, `plan_upgrade_requests`, `polar_processed_events` | Credits, purchases, plan requests, webhook idempotency (see [ai-token-economy.md](ai-token-economy.md), [billing-and-payments.md](billing-and-payments.md)) |
| Projects and sheets | `projects`, `project_sheets`, `project_pages`, `notifications`, `calendar_reminders`, `sheet_calendar_item_marks`, `local_profiles` | The workspace users live in: projects contain sheets; pages hold the rows |
| Legacy hierarchy | `degree_workspaces`, `universities`, `programs`, `professors`, `applications`, `deadlines`, `research_notes`, `outreach_logs`, `email_drafts`, `email_templates`, `reminders` | Original hierarchical tracker schema; outreach and records now live inside project sheets |
| Documents | `documents`, `document_versions`, `document_categories`, `static_files` | Uploaded files (bytes live in object storage; rows hold metadata) |
| Notes and boards | `sticky_notes`, `whiteboards` | Sticky notes and whiteboards |
| AI chat | `ai_conversations` | Assistant conversation memory |
| Research Expert | `research_papers`, `research_paper_chunks`, `research_paper_analyses` | Uploaded papers, searchable passages, saved analyses |
| Advisor Atlas | `advisor_atlas_runs`, `_candidates`, `_evidence`, `_publications`, `_dossiers`, `_saved_dossiers`, `_watch_events` | Supervisor discovery runs and results |
| Scholarship Hunt | `scholarship_deep_hunt_runs`, `scholarship_opportunities`, `saved_scholarship_queries`, `scholarship_search_feedback`, `bookmarked_news` | Searches, the opportunity library, feedback |

## Invariants worth knowing

- **Sheet rows** (`project_pages.rows_json`) are a JSON array of `Record<string, string>`. Rows also carry reserved `_`-prefixed metadata keys that survive CSV, paste, undo, and AI edits without leaking into exports: `_height` (row height px), `_cellStyles` (JSON of per-cell formatting; see `CellStyle` in `sheetModel.ts`), `_rowStyle` (JSON `{ bg }`). New reserved keys follow the same `_` prefix + JSON-string convention, which avoids a schema migration.
- **Pinning**: `projects` and `project_sheets` each have `is_pinned` (top of lists) and `pinned_to_dashboard` (shows on the dashboard). Unpinning also removes the dashboard entry.
- **Notifications** keep `notification_type` for routing/display and `preference_key` for the user preference bucket (workspace events plus admin categories such as `system`, `billing`, `plans`, `announcements`).
- **`plan_upgrade_requests.request_type`** distinguishes an upgrade from a renewal. A renewal on an expired plan extends from approval time; on an active plan, from the current end date.
- **`password_reset_requests`**: never confirms whether an email exists. A row is created only when the email matches a user, no pending request exists, and the IP limit allows. `Completed` means an admin set a new password (and bumped the user's `token_version`); `Dismissed` means cleared without a reset.
- **Research papers**: `research_paper_analyses` is capped at 10 rows per paper (enforced in the service, FIFO per [CODE_RULES.md](../CODE_RULES.md)); analyses and passages cascade-delete with the paper or user. Passages store a vector column used for search.
- **Advisor Atlas** has no count limit: it is gated by the `can_use_advisor_atlas` plan check and metered in credits ([ai-token-economy.md](ai-token-economy.md)).
- **Scholarship feedback** rows are user-scoped, created when the user confirms a query and updated with the outcome; previewing creates none.
- **Polar linkage** on `users`: `polar_customer_id` (primary reconciliation key, backfilled on first webhook match), `polar_subscription_id` (null for pack-only buyers), `polar_cancel_at_period_end`, `plan_started_at` (anchor for the monthly credit cycle; set on a genuine new subscription or after a lapse, never on every webhook), `plan_renews_at`, `plan_ends_at`. `polar_processed_events.event_id` is unique and append-only: it is the dedup point for retried webhooks.
- **Credentials**: no OAuth or refresh tokens are stored; Google sign-in keeps only the subject id and basic profile in `external_identities`.
- **Schema changes** ship as idempotent `_add_*` helpers in `connection.py`, never as ad-hoc scripts.
