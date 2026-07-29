import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, ArrowLeft, Ticket } from "lucide-react";
import { api } from "../lib/api";
import { PasswordField } from "./PasswordField";
import { GoogleAuthButton } from "./GoogleAuthButton";
import "./LoginPage.css";

// SCHOLARDOCX-0169: registration is simplified to two paths:
//   1. Invite code — fill the form, get a free account immediately.
//   2. Google — click "Sign up with Google", get a free account immediately.
// Paid self-registration was removed; users upgrade to paid plans later
// via the logged-in plan management flow.

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
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

        {error && <div className="auth-alert error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form auth-form-horizontal">
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
            {loading ? (<><span className="auth-spinner" aria-hidden="true" />Registering…</>) : "Create Account"}
          </button>
          {loading && (
            <p className="auth-loading-note">
              The first load after a period of inactivity may take up to a minute while the server wakes up.
            </p>
          )}

          <div className="auth-divider"><span>or</span></div>
          <GoogleAuthButton label="Sign up with Google" />
        </form>

        <div className="auth-switch-row">
          <span>
            Already have an account?{" "}
            <Link to="/login" className="auth-link-btn">
              Log in
            </Link>
          </span>
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
        </div>
      </div>
    </div>
  );
}
