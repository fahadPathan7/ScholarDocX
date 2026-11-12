import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  GTM_ID,
  readStoredConsent,
  setAppAnalyticsConsent,
  storeConsent,
} from "../lib/analytics";
import "./analytics-consent.css";

/**
 * Asks a signed-in user once (per browser) whether pages inside the app may be
 * counted in usage analytics (SCHOLARDOCX-0257). Public pages do not ask.
 * Until the user allows it, nothing inside the app is tracked.
 */
export function AnalyticsConsentBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user?.id || !GTM_ID) {
      setAppAnalyticsConsent("unknown");
      setVisible(false);
      return;
    }
    const stored = readStoredConsent(user.id);
    setAppAnalyticsConsent(stored);
    setVisible(stored === "unknown");
  }, [user?.id]);

  if (!visible || !user?.id) return null;

  const choose = (value: "granted" | "denied") => {
    storeConsent(user.id, value);
    setAppAnalyticsConsent(value);
    setVisible(false);
  };

  return (
    <div className="analytics-consent" role="dialog" aria-live="polite" aria-label="Usage analytics">
      <p className="analytics-consent__text">
        <strong>Help us improve ScholarDocX?</strong> We'd like to count which pages you
        visit, using cookies. We never collect your documents, notes, or sheet data.
      </p>
      <div className="analytics-consent__actions">
        <button type="button" className="secondary" onClick={() => choose("denied")}>
          No thanks
        </button>
        <button type="button" className="primary" onClick={() => choose("granted")}>
          Allow
        </button>
      </div>
    </div>
  );
}
