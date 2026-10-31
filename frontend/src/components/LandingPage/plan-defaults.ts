/**
 * Static plan defaults — the pricing/limits shown when the backend is
 * unavailable (SCHOLARDOCX-0210).
 *
 * WHY THIS EXISTS
 * The public landing pricing table and the authenticated plan comparison both
 * fetch live plan data from the backend (`/auth/plans/public` and
 * `/auth/plans`). When the backend is down or still booting, the landing page
 * previously showed a stale, incomplete hardcoded table (wrong prices, four
 * features instead of eight) and the authenticated view showed a hard red
 * "Failed to load" error. These defaults make both surfaces show a complete,
 * accurate read-only table instead.
 *
 * SOURCE OF THE VALUES
 * The values below are a snapshot of the live admin-configured `app_settings`
 * (prices) and `role_limits` (per-tier feature counts) as of 2026-08-06. They
 * are NOT the backend seed defaults (which are 0/50/180); they match what
 * users actually see on the running deployment.
 *
 * KEEPING THIS IN SYNC
 * If an admin changes plan prices or limits in the Admin panel, update the
 * matching values here so the offline fallback stays accurate. Prices live in
 * `STATIC_PRICING`; per-tier feature counts live in `STATIC_PLANS`.
 *
 * SHAPE
 * Mirrors the backend's `/auth/plans` response (`{ plans, pricing }`) so both
 * consumers can feed it through their existing render paths unchanged.
 * `limit_count` semantics match the backend: `-1` = unlimited, `0`/`1` for
 * boolean features. `total_documents_bytes` is raw bytes.
 */
import type { PlansResponse, PricingResponse } from "./plans-data";

/**
 * Per-tier feature limits. Mirrors `role_limits` rows plus the derived
 * `ai_tokens_per_month` (sourced from `plan_ai_credits_*` on the backend).
 */
export const STATIC_PLANS: PlansResponse = {
  free_user: {
    total_projects: { limit_count: 1, reset_period: "never" },
    total_documents_bytes: { limit_count: 5242880, reset_period: "never" },
    ai_tokens_per_month: { limit_count: 500, reset_period: "monthly" },
    can_purchase_token_packs: { limit_count: 0, reset_period: "never" },
    can_use_agents: { limit_count: 0, reset_period: "never" },
    can_use_scholarship_hunt: { limit_count: 0, reset_period: "never" },
    can_use_advisor_atlas: { limit_count: 0, reset_period: "never" },
    can_use_research_reader: { limit_count: 0, reset_period: "never" },
    research_papers_per_month: { limit_count: 0, reset_period: "monthly" },
    max_research_papers_library: { limit_count: 0, reset_period: "never" },
    ai_messages_per_session: { limit_count: 5, reset_period: "per_session" },
    total_sheets: { limit_count: 2, reset_period: "never" },
    total_records: { limit_count: 50, reset_period: "never" },
    sheets_per_project: { limit_count: 2, reset_period: "never" },
    records_per_sheet: { limit_count: 20, reset_period: "never" },
    total_sticky_notes: { limit_count: 3, reset_period: "never" },
    total_whiteboards: { limit_count: 1, reset_period: "never" },
  },
  general_user: {
    total_projects: { limit_count: 3, reset_period: "never" },
    total_documents_bytes: { limit_count: 31457280, reset_period: "never" },
    ai_tokens_per_month: { limit_count: 9000, reset_period: "monthly" },
    can_purchase_token_packs: { limit_count: 0, reset_period: "never" },
    can_use_agents: { limit_count: 0, reset_period: "never" },
    can_use_scholarship_hunt: { limit_count: 0, reset_period: "never" },
    can_use_advisor_atlas: { limit_count: 0, reset_period: "never" },
    can_use_research_reader: { limit_count: 0, reset_period: "never" },
    research_papers_per_month: { limit_count: 0, reset_period: "monthly" },
    max_research_papers_library: { limit_count: 0, reset_period: "never" },
    ai_messages_per_session: { limit_count: 10, reset_period: "per_session" },
    total_sheets: { limit_count: 10, reset_period: "never" },
    total_records: { limit_count: 1000, reset_period: "never" },
    sheets_per_project: { limit_count: 5, reset_period: "never" },
    records_per_sheet: { limit_count: 100, reset_period: "never" },
    total_sticky_notes: { limit_count: 5, reset_period: "never" },
    total_whiteboards: { limit_count: 1, reset_period: "never" },
  },
  pro_user: {
    total_projects: { limit_count: 10, reset_period: "never" },
    total_documents_bytes: { limit_count: 52428800, reset_period: "never" },
    ai_tokens_per_month: { limit_count: 28000, reset_period: "monthly" },
    can_purchase_token_packs: { limit_count: 1, reset_period: "never" },
    can_use_agents: { limit_count: 1, reset_period: "never" },
    can_use_scholarship_hunt: { limit_count: 1, reset_period: "never" },
    can_use_advisor_atlas: { limit_count: 1, reset_period: "never" },
    can_use_research_reader: { limit_count: 1, reset_period: "never" },
    research_papers_per_month: { limit_count: 30, reset_period: "monthly" },
    max_research_papers_library: { limit_count: 20, reset_period: "never" },
    ai_messages_per_session: { limit_count: 30, reset_period: "per_session" },
    total_sheets: { limit_count: 50, reset_period: "never" },
    total_records: { limit_count: 1000, reset_period: "never" },
    sheets_per_project: { limit_count: 10, reset_period: "never" },
    records_per_sheet: { limit_count: 100, reset_period: "never" },
    total_sticky_notes: { limit_count: 20, reset_period: "never" },
    total_whiteboards: { limit_count: 3, reset_period: "never" },
  },
  max_user: {
    total_projects: { limit_count: 50, reset_period: "never" },
    total_documents_bytes: { limit_count: 314572800, reset_period: "never" },
    ai_tokens_per_month: { limit_count: 70000, reset_period: "monthly" },
    can_purchase_token_packs: { limit_count: 1, reset_period: "never" },
    can_use_agents: { limit_count: 1, reset_period: "never" },
    can_use_scholarship_hunt: { limit_count: 1, reset_period: "never" },
    can_use_advisor_atlas: { limit_count: 1, reset_period: "never" },
    can_use_research_reader: { limit_count: 1, reset_period: "never" },
    research_papers_per_month: { limit_count: 100, reset_period: "monthly" },
    max_research_papers_library: { limit_count: 50, reset_period: "never" },
    ai_messages_per_session: { limit_count: 100, reset_period: "per_session" },
    total_sheets: { limit_count: 200, reset_period: "never" },
    total_records: { limit_count: 5000, reset_period: "never" },
    sheets_per_project: { limit_count: 20, reset_period: "never" },
    records_per_sheet: { limit_count: 500, reset_period: "never" },
    total_sticky_notes: { limit_count: 50, reset_period: "never" },
    total_whiteboards: { limit_count: 10, reset_period: "never" },
  },
};

/**
 * Plan prices (USD), keyed exactly like the backend's `app_settings`.
 * Free is always 0; the paid tiers carry the admin-configured amounts.
 */
export const STATIC_PRICING: PricingResponse = {
  plan_price_general_monthly: "2.49",
  plan_price_general_quarterly: "6.49",
  plan_price_pro_monthly: "5.99",
  plan_price_pro_quarterly: "15.99",
  plan_price_max_monthly: "11.99",
  plan_price_max_quarterly: "31.99",
};
