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
    name: "Free",
    desc: "Perfect for starting out and trying application tracking features.",
    variant: "default",
    period: { monthly: "/ forever", quarterly: "/ forever" },
  },
  general_user: {
    tier: "general_user",
    name: "Basic",
    desc: "Great for applicants tracking up to a dozen programs and deadlines.",
    variant: "default",
    period: { monthly: "/ month", quarterly: "/ quarter" },
  },
  pro_user: {
    tier: "pro_user",
    name: "Pro",
    desc: "For candidates applying to multiple top-tier programs.",
    variant: "popular",
    badge: "Popular",
    period: { monthly: "/ month", quarterly: "/ quarter" },
  },
  max_user: {
    tier: "max_user",
    name: "Max",
    desc: "No boundaries. Designed for absolute power-users and collaborative labs.",
    variant: "premium",
    badge: "Ultimate",
    period: { monthly: "/ month", quarterly: "/ quarter" },
  },
};

// ---- Feature → human label mapping (aligned with PlanComparisonView) ----

/** A feature row to surface on a pricing card. */
export type PlanFeature = {
  key: string;
  label: string;
  format?: (count: number) => string;
  boolean?: boolean;
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
  { key: "total_projects", label: "Max Projects" },
  { key: "total_documents_bytes", label: "Storage Capacity", format: formatBytes },
  { key: "ai_tokens_per_month", label: "Monthly AI Credits", format: formatCredits },
  { key: "can_purchase_token_packs", label: "Extra AI Credit Packs", boolean: true },
  { key: "can_use_agents", label: "AI Agents Usage", boolean: true },
  { key: "can_use_scholarship_hunt", label: "Scholarship Hunt", boolean: true },
  { key: "can_use_advisor_atlas", label: "Advisor Atlas", boolean: true },
];

/**
 * Resolve a tier's feature list into display lines using the live limits map.
 * Returns the formatted lines in LANDING_FEATURES order, skipping features
 * that are absent from the response.
 */
export type ResolvedFeature = {
  key: string;
  label: string;
  value: string | boolean;
  isBoolean: boolean;
};

export function resolveFeatureLines(limits: PlanLimits): ResolvedFeature[] {
  const lines: ResolvedFeature[] = [];
  for (const f of LANDING_FEATURES) {
    // limits for booleans might be 0 or 1
    const entry = limits[f.key] || { limit_count: 0, reset_period: "none" };
    
    if (f.boolean) {
      lines.push({ key: f.key, label: f.label, value: entry.limit_count === 1, isBoolean: true });
    } else {
      const formatted = formatLimit(entry.limit_count, f.format);
      lines.push({ key: f.key, label: f.label, value: formatted, isBoolean: false });
    }
  }
  return lines;
}

/** Read a tier's price (USD) for the requested billing cycle. */
export function resolvePrice(
  tier: TierKey,
  pricing: PricingResponse,
  cycle: "monthly" | "quarterly"
): string {
  // Free tier is always 0 USD regardless of admin config (it's "free forever").
  if (tier === "free_user") return "0 USD";
  const shortTier = tier.replace("_user", ""); // general_user -> general
  const key = `plan_price_${shortTier}_${cycle}`;
  const raw = pricing[key];
  if (raw == null || raw === "") return "—";
  return `${raw} USD`;
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
