import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { PasswordField } from "./PasswordField";
import "./LoginPage.css";

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
        invite_code: inviteCode
      });

      if (response && response.status === "success") {
        // Redirect to login on success
        navigate("/login", { state: { message: "Registration successful. Please log in." } });
      }
    } catch (err: any) {
      setError(err.message || "Registration failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Back to home */}
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
          <p className="auth-subtitle">Join ScholarDocX with your invite code</p>
        </div>

        {error && (
          <div className="auth-alert error">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="inviteCode">Invite Code</label>
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
            <label className="auth-label" htmlFor="displayName">Display Name</label>
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
            <label className="auth-label" htmlFor="email">Email Address</label>
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
            <label className="auth-label" htmlFor="password">Password</label>
            <PasswordField
              id="password"
              required
              placeholder="3-10 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="confirmPassword">Confirm Password</label>
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

        <div className="auth-switch-row">
          Already have an account?{" "}
          <Link to="/login" className="auth-link-btn">Log in</Link>
        </div>
      </div>
    </div>
  );
}
