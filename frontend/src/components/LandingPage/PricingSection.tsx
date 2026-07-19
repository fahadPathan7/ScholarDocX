import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useReveal } from "./useReveal";
import {
  fetchPublicPlans,
  getCachedPlansIfFresh,
  loadCachedPlans,
  resolveFeatureLines,
  resolvePrice,
  saveCachedPlans,
  TIER_ORDER,
  TIER_PRESENTATION,
  type PublicPlansResponse,
  type TierKey,
  type ResolvedFeature,
} from "./plans-data";
import "./PricingSection.css";

/**
 * Pricing section driven by the admin-configured source of truth.
 *
 * Renders INSTANTLY from a localStorage cache (or a hardcoded fallback on first
 * visit), then silently refreshes from `GET /auth/plans/public` in the
 * background. There is no loading/skeleton state — the cards are always
 * visible, so there's no perceived "loading time" on repeat visits.
 */

// ---- Fallback (used only when the API is unavailable) ----

type FallbackPlan = {
  tier: TierKey;
  monthly: string;
  quarterly: string;
  features: ResolvedFeature[];
};

const FALLBACK_PLANS: FallbackPlan[] = [
  {
    tier: "free_user",
    monthly: "0 BDT",
    quarterly: "0 BDT",
    features: [
      { key: "p", label: "Max Projects", value: "1", isBoolean: false },
      { key: "s", label: "Storage Capacity", value: "50 MB", isBoolean: false },
      { key: "w", label: "Active Whiteboards", value: "1", isBoolean: false },
      { key: "a", label: "AI Agents Usage", value: false, isBoolean: true },
    ],
  },
  {
    tier: "general_user",
    monthly: "0 BDT",
    quarterly: "0 BDT",
    features: [
      { key: "p", label: "Max Projects", value: "3", isBoolean: false },
      { key: "s", label: "Storage Capacity", value: "200 MB", isBoolean: false },
      { key: "w", label: "Active Whiteboards", value: "2", isBoolean: false },
      { key: "a", label: "AI Agents Usage", value: true, isBoolean: true },
    ],
  },
  {
    tier: "pro_user",
    monthly: "50 BDT",
    quarterly: "500 BDT",
    features: [
      { key: "p", label: "Max Projects", value: "10", isBoolean: false },
      { key: "s", label: "Storage Capacity", value: "1 GB", isBoolean: false },
      { key: "w", label: "Active Whiteboards", value: "5", isBoolean: false },
      { key: "a", label: "AI Agents Usage", value: true, isBoolean: true },
    ],
  },
  {
    tier: "max_user",
    monthly: "180 BDT",
    quarterly: "1500 BDT",
    features: [
      { key: "p", label: "Max Projects", value: "Unlimited", isBoolean: false },
      { key: "s", label: "Storage Capacity", value: "Unlimited", isBoolean: false },
      { key: "w", label: "Active Whiteboards", value: "Unlimited", isBoolean: false },
      { key: "a", label: "AI Agents Usage", value: true, isBoolean: true },
    ],
  },
];

type LoadState = "loading" | "success" | "fallback";

export function PricingSection() {
  const [isQuarterly, setIsQuarterly] = useState(false);
  const headerRef = useReveal<HTMLDivElement>();
  const gridRef = useReveal<HTMLDivElement>();

  // Render INSTANTLY from cache or fallback — never start in a blank skeleton
  // state. The network fetch (if needed) runs in the background and refreshes
  // the view silently once it resolves. localStorage may be unavailable (SSR /
  // private mode), so guard with try/catch via the helpers.
  const initialCached = getCachedPlansIfFresh();
  const [state, setState] = useState<LoadState>(
    initialCached ? "success" : "fallback"
  );
  const [data, setData] = useState<PublicPlansResponse | null>(initialCached);

  useEffect(() => {
    let cancelled = false;
    // Always refresh in the background so admin changes propagate, even when we
    // rendered from a fresh cache. Silent: no skeleton flash.
    fetchPublicPlans()
      .then((res) => {
        if (cancelled) return;
        if (res?.plans && Object.keys(res.plans).length > 0) {
          saveCachedPlans(res);
          setData(res);
          setState("success");
        }
      })
      .catch(() => {
        // Network/endpoint failure. If we have *any* cached data (even stale),
        // prefer it over the hardcoded fallback so prices stay admin-accurate.
        if (cancelled) return;
        const stale = loadCachedPlans();
        if (stale?.plans && Object.keys(stale.plans).length > 0) {
          setData(stale);
          setState("success");
        } else {
          setState("fallback");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the list of tiers to render. On success, only tiers present in the
  // (already active-filtered) response are shown. On fallback, use all four.
  const tiers: TierKey[] =
    state === "success" && data
      ? TIER_ORDER.filter((t) => data.plans[t])
      : TIER_ORDER;

  return (
    <section id="pricing" className="lp-pricing-section">
      <div className="lp-pricing-container">
        <div className="reveal" ref={headerRef}>
          <h2 className="lp-section-title">Simple, Transparent Pricing</h2>
          <p className="lp-section-subtitle">
            Choose the workspace capability that matches your application scale.
          </p>
        </div>

        <div className="lp-pricing-toggle-bar">
          <div className="lp-pricing-toggle-track">
            <button
              type="button"
              className={`lp-pricing-toggle-btn${!isQuarterly ? " active" : ""}`}
              onClick={() => setIsQuarterly(false)}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              className={`lp-pricing-toggle-btn${isQuarterly ? " active" : ""}`}
              onClick={() => setIsQuarterly(true)}
            >
              Quarterly Billing
            </button>
          </div>
        </div>

        <div className="lp-pricing-grid reveal" ref={gridRef}>
          {tiers.map((tier, i) => {
            const plan = TIER_PRESENTATION[tier];
            const fallback = FALLBACK_PLANS.find((p) => p.tier === tier);
            const cycle = isQuarterly ? "quarterly" : "monthly";

            // Live data path
            if (state === "success" && data) {
              const limits = data.plans[tier]!;
              const price = resolvePrice(tier, data.pricing, cycle);
              const features = resolveFeatureLines(limits);
              return (
                <PricingCard
                  key={tier}
                  plan={plan}
                  price={price}
                  period={plan.period[cycle]}
                  features={features}
                  index={i}
                />
              );
            }

            // Fallback path
            const price = isQuarterly ? fallback!.quarterly : fallback!.monthly;
            return (
              <PricingCard
                key={tier}
                plan={plan}
                price={price}
                period={plan.period[cycle]}
                features={fallback!.features}
                index={i}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

type CardProps = {
  plan: (typeof TIER_PRESENTATION)[TierKey];
  price: string;
  period: string;
  features: ResolvedFeature[];
  index: number;
};

function PricingCard({ plan, price, period, features, index }: CardProps) {
  const variantClass =
    plan.variant === "premium"
      ? " premium-dark"
      : plan.variant === "popular"
        ? " popular"
        : "";

  // Per-tier accent color: drives the icon chip, badge, and check icons so each
  // card reads as distinct while staying within the muted system palette.
  const accent: Record<TierKey, string> = {
    free_user: "#6b7c8a",      // slate blue-grey
    general_user: "#347f78",   // teal (primary brand)
    pro_user: "#c77964",       // warm clay
    max_user: "#6366f1",       // indigo (matches premium-dark)
  };

  return (
    <div
      className={`lp-pricing-card${variantClass}`}
      style={{
        ["--reveal-delay" as string]: `${index * 80}ms`,
        ["--tier-accent" as string]: accent[plan.tier],
      }}
    >
      {plan.variant === "popular" && <div className="lp-pricing-card-glow" />}
      {plan.badge && (
        <span
          className="lp-pricing-badge-popular"
          style={
            plan.variant === "premium"
              ? { background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }
              : { backgroundColor: "#347f78" }
          }
        >
          {plan.badge}
        </span>
      )}

      <h3>{plan.name}</h3>
      <p className="lp-pricing-desc">{plan.desc}</p>

      <div className="lp-pricing-price-row">
        <span className="lp-pricing-price">{price}</span>
        <span className="lp-pricing-price-period">{period}</span>
      </div>

      <div className="lp-pricing-features-list">
        {features.map((f, idx) => (
          <div className="lp-pricing-feature-item justify-between" key={f.key || idx}>
            <div className="flex items-center gap-2">
              {f.isBoolean ? (
                f.value ? <Check size={16} className="lp-pricing-feature-icon" /> : <X size={16} className="text-slate-300" />
              ) : (
                <Check size={16} className="lp-pricing-feature-icon" />
              )}
              <span className={f.isBoolean && !f.value ? "text-slate-400" : ""}>{f.label}</span>
            </div>
            {!f.isBoolean && (
              <span className="lp-pricing-feature-value font-semibold">{f.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
