import { api } from "../../lib/api";

/**
 * Shared plan/pricing data layer for the public landing page.
 *
 * Mirrors the types + feature→label mapping used by the authenticated
 * PlanComparisonView so the wording stays consistent across surfaces. The
 * data itself comes from the admin-configured source of truth via the
 * public (anonymous) endpoint `GET /auth/plans/public`.
 */

// ---- API shapes (mirror backend _assemble_public_plans) ----

export type PlanLimits = {
  [feature: string]: { limit_count: number; reset_period: string };
};

export type PlansResponse = {
  free_user?: PlanLimits;
  general_user?: PlanLimits;
  pro_user?: PlanLimits;
  max_user?: PlanLimits;
  [tier: string]: PlanLimits | undefined;
};

export type PricingResponse = {
  [key: string]: string;
};

export type PublicPlansResponse = {
  status: string;
  plans: PlansResponse;
  pricing: PricingResponse;
};

// ---- Tier metadata (presentation layer — static, not admin-driven) ----

export type TierKey = "free_user" | "general_user" | "pro_user" | "max_user";

export type TierPresentation = {
  tier: TierKey;
  /** Display name on the card. */
  name: string;
  desc: string;
  variant: "default" | "popular" | "premium";
  badge?: string;
  /** Free-form period suffix shown next to the price. */
  period: { monthly: string; quarterly: string };
};

/** Order in which cards render. Kept static so the grid is stable. */
export const TIER_ORDER: TierKey[] = [
  "free_user",
  "general_user",
  "pro_user",
  "max_user",
];

/** Static presentation per tier (Pro = popular, Max = premium-dark). */
export const TIER_PRESENTATION: Record<TierKey, TierPresentation> = {
  free_user: {
    tier: "free_user",
    name: "Free Plan",
    desc: "Perfect for starting out and trying application tracking features.",
    variant: "default",
    period: { monthly: "/ forever", quarterly: "/ forever" },
  },
  general_user: {
    tier: "general_user",
    name: "General User",
    desc: "Great for applicants tracking up to a dozen programs and deadlines.",
    variant: "default",
    period: { monthly: "/ month", quarterly: "/ quarter" },
  },
  pro_user: {
    tier: "pro_user",
    name: "Pro User",
    desc: "For candidates applying to multiple top-tier programs.",
    variant: "popular",
    badge: "Popular",
    period: { monthly: "/ month", quarterly: "/ quarter" },
  },
  max_user: {
    tier: "max_user",
    name: "Max User",
    desc: "No boundaries. Designed for absolute power-users and collaborative labs.",
    variant: "premium",
    badge: "Ultimate",
    period: { monthly: "/ month", quarterly: "/ quarter" },
  },
};

// ---- Feature → human label mapping (aligned with PlanComparisonView) ----

/** A feature row to surface on a pricing card. */
export type PlanFeature = {
  /** role_limits / app_settings feature key. */
  key: string;
  /** Human-readable line; {v} is replaced with the formatted value. */
  template: (v: string) => string;
  /** Optional value formatter (e.g. bytes → MB). */
  format?: (count: number) => string;
};

/** Format a raw limit_count into a display string. "-1" means unlimited. */
export function formatLimit(count: number, formatter?: (v: number) => string): string {
  if (count === -1) return "Unlimited";
  if (formatter) return formatter(count);
  return count.toLocaleString();
}

function formatBytes(v: number): string {
  if (v === -1) return "Unlimited";
  return `${Math.round(v / (1024 * 1024))} MB`;
}

function formatCredits(v: number): string {
  if (v === -1) return "Unlimited";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return `${v}`;
}

/**
 * Features surfaced on the landing pricing cards, in display order. Each maps
 * a role_limits key to a one-line human description. Mirrors the labels used
 * in PlanComparisonView so the two surfaces agree.
 */
export const LANDING_FEATURES: PlanFeature[] = [
  { key: "total_projects", template: (v) => `${v} Active Project Workspaces` },
  { key: "sheets_per_project", template: (v) => `${v} Sheets per Project` },
  { key: "total_whiteboards", template: (v) => `${v} Active Whiteboards` },
  {
    key: "total_documents_bytes",
    template: (v) => `${v} File Storage`,
    format: formatBytes,
  },
  {
    key: "ai_tokens_per_month",
    template: (v) => `${v} Monthly AI Credits`,
    format: formatCredits,
  },
];

/**
 * Resolve a tier's feature list into display lines using the live limits map.
 * Returns the formatted lines in LANDING_FEATURES order, skipping features
 * that are absent from the response.
 */
export function resolveFeatureLines(limits: PlanLimits): string[] {
  const lines: string[] = [];
  for (const f of LANDING_FEATURES) {
    const entry = limits[f.key];
    if (!entry) continue;
    const formatted = formatLimit(entry.limit_count, f.format);
    lines.push(f.template(formatted));
  }
  return lines;
}

/** Read a tier's price (BDT) for the requested billing cycle. */
export function resolvePrice(
  tier: TierKey,
  pricing: PricingResponse,
  cycle: "monthly" | "quarterly"
): string {
  // Free tier is always 0 BDT regardless of admin config (it's "free forever").
  if (tier === "free_user") return "0 BDT";
  const shortTier = tier.replace("_user", ""); // general_user -> general
  const key = `plan_price_${shortTier}_${cycle}`;
  const raw = pricing[key];
  if (raw == null || raw === "") return "—";
  return `${raw} BDT`;
}

// ---- Fetcher ----

/** Fetch the public (anonymous) plans payload. Throws on non-success. */
export async function fetchPublicPlans(): Promise<PublicPlansResponse> {
  return api.get<PublicPlansResponse>("/auth/plans/public");
}

// ---- Cache (instant render, background refresh) ----
// Plans change rarely (admin edits), so a localStorage cache lets the pricing
// section render immediately on repeat visits instead of showing skeletons
// while the network request resolves. A staleness check triggers a silent
// background refresh so updates still propagate.

const PLANS_CACHE_KEY = "lp_plans_cache_v1";
// Max age before a cached payload is considered stale (and re-fetched).
const PLANS_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

type CachedPlans = { payload: PublicPlansResponse; at: number };

export function loadCachedPlans(): PublicPlansResponse | null {
  try {
    const raw = localStorage.getItem(PLANS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPlans;
    if (!parsed?.payload?.plans) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function isCacheStale(): boolean {
  try {
    const raw = localStorage.getItem(PLANS_CACHE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as CachedPlans;
    if (typeof parsed?.at !== "number") return true;
    return Date.now() - parsed.at > PLANS_CACHE_TTL_MS;
  } catch {
    return true;
  }
}

export function saveCachedPlans(payload: PublicPlansResponse): void {
  try {
    const entry: CachedPlans = { payload, at: Date.now() };
    localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota / private mode — caching is best-effort.
  }
}

/**
 * Load cached plans if present (synchronous). If the cache is empty or stale,
 * the caller should also kick off a background refresh. Returns null when no
 * usable cache exists.
 */
export function getCachedPlansIfFresh(): PublicPlansResponse | null {
  if (isCacheStale()) return null;
  return loadCachedPlans();
}
