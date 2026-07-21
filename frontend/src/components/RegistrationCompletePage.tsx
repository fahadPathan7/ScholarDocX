import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import "./LoginPage.css";

// SCHOLARDOCX-0162: landing target after returning from the hosted checkout.
// Payment is confirmed by the payment provider, but the activation webhook can
// land a moment later — if login still reports "being activated", this page
// offers a gentle retry instead of a confusing dead-end.
export function RegistrationCompletePage() {
  const [message, setMessage] = useState(
    "Payment received — your account is now active."
  );

  useEffect(() => {
    // If the provider appended a status hint, reflect it without exposing any
    // provider-specific detail in the copy.
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "pending") {
      setMessage(
        "Payment is being processed. Your account will be active shortly — please wait a moment and try logging in."
      );
    }
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-topnav">
          <Link to="/" className="auth-back-home">
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>

        <div className="auth-header">
          <div className="auth-logo-mark">
            <CheckCircle2 size={24} />
          </div>
          <h1 className="auth-title">You're all set</h1>
          <p className="auth-subtitle">{message}</p>
        </div>

        <div className="auth-switch-row">
          <Link to="/login" className="auth-link-btn">
            Continue to log in
          </Link>
        </div>
      </div>
    </div>
  );
}
