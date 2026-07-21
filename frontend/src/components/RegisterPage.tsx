import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus, ArrowLeft, CreditCard, Ticket } from "lucide-react";
import { api } from "../lib/api";
import { PasswordField } from "./PasswordField";
import {
  fetchPublicPlans,
  TIER_PRESENTATION,
  TIER_ORDER,
  type TierKey,
} from "./LandingPage/plans-data";
import "./LoginPage.css";

// SCHOLARDOCX-0162: registration supports two paths behind one page —
// invite-code (unchanged) and paid (purchase a Basic/Pro/Max plan at signup).
// Which tabs are visible is driven by the `registration_mode` app setting
// returned by /auth/plans/public:
//   invite_only    → invite tab only (legacy)
//   invite_or_paid → both tabs (default)
//   paid_only      → paid tab only
// The paid tab submits to /auth/register-paid, which creates an inert account
// and returns a hosted-checkout URL; the browser leaves the SPA to complete
// payment, then returns to /registration-complete.

type RegMode = "invite_only" | "invite_or_paid" | "paid_only";
type PaidPlanSlug = "basic" | "pro" | "max";
type BillingCycle = "monthly" | "quarterly";

// Tier presentation maps general_user→Basic, pro_user→Pro, max_user→Max. The
// /auth/register-paid payload uses the short slugs (basic/pro/max), so we map
// tierKey → slug here. Free is excluded (paid plans only).
const TIER_TO_PLAN_SLUG: Record<TierKey, PaidPlanSlug | null> = {
  free_user: null,
  general_user: "basic",
  pro_user: "pro",
  max_user: "max",
};

const PAID_TIERS = TIER_ORDER.filter((t) => TIER_TO_PLAN_SLUG[t] !== null) as TierKey[];

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const initialFromPlan = searchParams.get("plan"); // ?plan=pro deep-link from pricing

  // Default tab: Purchase a plan (paid). Fallback to invite if regMode is invite_only.
  const [tab, setTab] = useState<"invite" | "paid">("paid");
  const [regMode, setRegMode] = useState<RegMode>("invite_or_paid");

  // ---- invite form state (unchanged) ----
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ---- paid form state ----
  const [pEmail, setPEmail] = useState("");
  const [pDisplayName, setPDisplayName] = useState("");
  const [pPassword, setPPassword] = useState("");
  const [pConfirmPassword, setPConfirmPassword] = useState("");
  const [plan, setPlan] = useState<PaidPlanSlug>(
    (initialFromPlan as PaidPlanSlug) || "pro"
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [pricing, setPricing] = useState<Record<string, string>>({});

  const navigate = useNavigate();

  // Load registration_mode + pricing from the public endpoint (anonymous).
  useEffect(() => {
    let cancelled = false;
    fetchPublicPlans()
      .then((resp) => {
        if (cancelled) return;
        const mode = (resp.registration_mode as RegMode) || "invite_or_paid";
        setRegMode(mode);
        if (mode === "paid_only") setTab("paid");
        if (mode === "invite_only") setTab("invite");
        setPricing(resp.pricing || {});
      })
      .catch(() => {
        // Network/config error — leave defaults; the invite tab still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showInviteTab = regMode !== "paid_only";
  const showPaidTab = regMode !== "invite_only";

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post<any>("/auth/register", {
        email,
        password,
        display_name: displayName,
        invite_code: inviteCode,
      });

      if (response && response.status === "success") {
        navigate("/login", {
          state: { message: "Registration successful. Please log in." },
        });
      }
    } catch (err: any) {
      setError(err.message || "Registration failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  const handlePaidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (pPassword !== pConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // The backend creates an inert account and returns a hosted-checkout URL.
      // Redirecting the full browser (not client-side navigate) is correct here:
      // checkout is hosted by the payment provider, outside the SPA. The user
      // returns to /registration-complete after paying.
      const response = await api.post<any>("/auth/register-paid", {
        email: pEmail,
        password: pPassword,
        display_name: pDisplayName,
        plan,
        billing_cycle: billingCycle,
        success_url: `${window.location.origin}/registration-complete`,
      });

      if (response && response.status === "success" && response.checkout_url) {
        window.location.href = response.checkout_url;
        return; // page is unloading; stay in loading state
      }
      setError("Checkout could not be started. Please try again.");
    } catch (err: any) {
      setError(
        err.message ||
          "Paid registration failed. Please check your inputs and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const priceFor = (slug: PaidPlanSlug): string => {
    // polar_product_id_<tier>_<cycle> presence is gated by the backend (UUID
    // check), so a configured plan always has a price here. Free is excluded.
    const tierKey: TierKey =
      slug === "basic" ? "general_user" : slug === "pro" ? "pro_user" : "max_user";
    const shortTier = tierKey.replace("_user", "");
    const key = `plan_price_${shortTier}_${billingCycle}`;
    const raw = pricing[key];
    if (raw == null || raw === "") return "—";
    return `${raw} USD`;
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-topnav">
          <Link to="/" className="auth-back-home">
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>

        <div className="auth-header">
          <div className="auth-logo-mark">
            <UserPlus size={24} />
          </div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join ScholarDocX</p>
        </div>

        {/* Tab switcher — only render when both paths are open. In a single-mode
            config the lone tab still shows so the copy stays consistent. */}
        {showInviteTab && showPaidTab && (
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "invite"}
              className={`auth-tab ${tab === "invite" ? "active" : ""}`}
              onClick={() => {
                setError("");
                setTab("invite");
              }}
            >
              <Ticket size={14} /> Invite code
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "paid"}
              className={`auth-tab ${tab === "paid" ? "active" : ""}`}
              onClick={() => {
                setError("");
                setTab("paid");
              }}
            >
              <CreditCard size={14} /> Purchase a plan
            </button>
          </div>
        )}

        {error && <div className="auth-alert error">{error}</div>}

        {/* ---- Invite-code form (unchanged behavior) ---- */}
        {tab === "invite" && showInviteTab && (
          <form onSubmit={handleInviteSubmit} className="auth-form auth-form-horizontal">
            <div className="auth-field auth-field-full">
              <label className="auth-label" htmlFor="inviteCode">
                Invite Code
              </label>
              <input
                id="inviteCode"
                type="text"
                required
                className="auth-input"
                placeholder="e.g. SCHOLARDOCX-2026-XYZ"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="displayName">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                required
                className="auth-input"
                placeholder="Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                Password
              </label>
              <PasswordField
                id="password"
                required
                placeholder="8+ characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <PasswordField
                id="confirmPassword"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? "Registering..." : "Create Account"}
            </button>
          </form>
        )}

        {/* ---- Paid registration form ---- */}
        {tab === "paid" && showPaidTab && (
          <form onSubmit={handlePaidSubmit} className="auth-form auth-form-horizontal">
            <div className="auth-field">
              <label className="auth-label" htmlFor="pPlan">
                Plan
              </label>
              <select
                id="pPlan"
                className="auth-input"
                value={plan}
                onChange={(e) => setPlan(e.target.value as PaidPlanSlug)}
              >
                {PAID_TIERS.map((t) => {
                  const slug = TIER_TO_PLAN_SLUG[t]!;
                  const pres = TIER_PRESENTATION[t];
                  return (
                    <option key={t} value={slug}>
                      {pres.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="billingCycle">
                Billing cycle
              </label>
              <div className="auth-cycle-toggle" role="group" aria-label="Billing cycle">
                <button
                  type="button"
                  className={`auth-cycle-btn ${billingCycle === "monthly" ? "active" : ""}`}
                  onClick={() => setBillingCycle("monthly")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={`auth-cycle-btn ${billingCycle === "quarterly" ? "active" : ""}`}
                  onClick={() => setBillingCycle("quarterly")}
                >
                  Quarterly <span className="auth-discount-tag">Save 20%</span>
                </button>
              </div>
            </div>

            <div className="auth-plan-readout auth-field-full">
              <span className="auth-plan-price">{priceFor(plan)}</span>
              <span className="auth-plan-dot">•</span>
              <span className="auth-plan-desc">
                {TIER_PRESENTATION[
                  plan === "basic"
                    ? "general_user"
                    : plan === "pro"
                    ? "pro_user"
                    : "max_user"
                ].desc}
              </span>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="pDisplayName">
                Display Name
              </label>
              <input
                id="pDisplayName"
                type="text"
                required
                className="auth-input"
                placeholder="Jane Doe"
                value={pDisplayName}
                onChange={(e) => setPDisplayName(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="pEmail">
                Email Address
              </label>
              <input
                id="pEmail"
                type="email"
                required
                className="auth-input"
                placeholder="you@example.com"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="pPassword">
                Password
              </label>
              <PasswordField
                id="pPassword"
                required
                placeholder="8+ characters"
                value={pPassword}
                onChange={(e) => setPPassword(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="pConfirmPassword">
                Confirm Password
              </label>
              <PasswordField
                id="pConfirmPassword"
                required
                placeholder="••••••••"
                value={pConfirmPassword}
                onChange={(e) => setPConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? "Starting secure checkout..." : "Continue to secure checkout"}
            </button>

            <p className="auth-hint">
              You won't be able to log in until payment is confirmed. Unpaid
              accounts are removed after 2 hours.
            </p>
          </form>
        )}

        <div className="auth-switch-row">
          <span>
            Already have an account?{" "}
            <Link to="/login" className="auth-link-btn">
              Log in
            </Link>
          </span>
          {showInviteTab && (
            <>
              <span className="auth-switch-sep">•</span>
              <span>
                Need an invite code?{" "}
                <Link
                  to="/login"
                  state={{ requestInvite: true }}
                  className="auth-link-btn"
                >
                  Request one here
                </Link>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
