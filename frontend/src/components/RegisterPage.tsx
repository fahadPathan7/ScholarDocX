import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, ArrowLeft, Ticket } from "lucide-react";
import { api, API_BASE } from "../lib/api";
import { PasswordField } from "./PasswordField";
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
            {loading ? "Registering..." : "Create Account"}
          </button>

          <div className="auth-divider"><span>or</span></div>
          <a href={`${API_BASE}/auth/google/login`} className="auth-google-btn">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            <span>Sign up with Google</span>
          </a>
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
