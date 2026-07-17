import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogIn, Mail, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { setToken, saveLoginCredentials, loadSavedCredentials, clearSavedCredentials } from "../lib/auth";
import { useAuth } from "../contexts/AuthContext";
import { PasswordField } from "./PasswordField";
import "./LoginPage.css";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [isSuspendedModalOpen, setIsSuspendedModalOpen] = useState(false);

  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Invite Request State
  const [showInviteRequest, setShowInviteRequest] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteDesc, setInviteDesc] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Appeal State
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealMessage, setAppealMessage] = useState("");
  const [appealSuccess, setAppealSuccessState] = useState(false);
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealError, setAppealError] = useState("");

  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Load saved credentials on mount. Also honor a `requestInvite` flag passed
  // via router state (e.g. from the register page's "Need an invite code?"
  // link) to auto-open the invite-request view.
  useEffect(() => {
    const saved = loadSavedCredentials();
    if (saved) {
      setEmail(saved.email);
      setPassword(saved.password);
      setSaveCredentials(true);
    }
    if (location.state?.requestInvite) {
      setShowInviteRequest(true);
    }
  }, []);

  const handleRequestInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInviteLoading(true);
    setInviteSuccess(false);

    try {
      const response = await api.post<any>("/auth/invite-request", {
        name: inviteName,
        email: inviteEmail,
        phone: invitePhone,
        description: inviteDesc
      });
      if (response && response.status === "success") {
        setInviteSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setForgotLoading(true);
    setForgotSuccess(false);

    try {
      await api.post<any>("/auth/forgot-password", { email: forgotEmail });
      // Always show the same success message regardless of whether the email is
      // registered (the backend never reveals account existence).
      setForgotSuccess(true);
    } catch (err: any) {
      // Only surface genuine network/server errors; never an "email not found"
      // message, to avoid user enumeration.
      setError(err.message || "Unable to submit request. Please try again later.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post<{ token: string, user: any }>("/auth/login", { email, password });
      if (response && response.token) {
        setToken(response.token, saveCredentials);
        // Save or clear credentials based on the checkbox
        if (saveCredentials) {
          saveLoginCredentials(email, password);
        } else {
          clearSavedCredentials();
        }
        // Use window.location for redirect so browser recognizes successful login for password saving
        const from = location.state?.from?.pathname || "/";
        window.location.href = from === "/login" ? "/" : from;
      }
    } catch (err: any) {
      if (err.message === "user_suspended" || err.message === "user_blocked") {
        setIsSuspendedModalOpen(true);
      } else {
        setError(err.message || "Failed to log in. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppealLoading(true);
    setAppealError("");
    try {
      await api.post("/auth/contact-admin", { email, message: appealMessage });
      setAppealSuccessState(true);
    } catch (err: any) {
      setAppealError(err.message || "Failed to send message.");
    } finally {
      setAppealLoading(false);
    }
  };

  const heading = showInviteRequest
    ? "Request Invite"
    : showForgotPassword
    ? "Forgot Password"
    : "Welcome Back";
  const subheading = showInviteRequest
    ? "Tell us about yourself to get an invite code"
    : showForgotPassword
    ? "Enter your email to request a password reset"
    : "Log in to your ScholarDocX account";

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Back to home + back navigation row */}
        <div className="auth-topnav">
          <Link to="/" className="auth-back-home">
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>

        <div className="auth-header">
          <div className="auth-logo-mark">
            <LogIn size={24} />
          </div>
          <h1 className="auth-title">{heading}</h1>
          <p className="auth-subtitle">{subheading}</p>
        </div>

        {error && (
          <div className="auth-alert error">{error}</div>
        )}

        {inviteSuccess ? (
          <div className="auth-feedback">
            <div className="auth-alert success">
              Your request has been submitted successfully. We will review it shortly.
            </div>
            <button
              onClick={() => {
                setShowInviteRequest(false);
                setInviteSuccess(false);
              }}
              className="auth-link-btn"
            >
              Back to login
            </button>
          </div>
        ) : showInviteRequest ? (
          <form onSubmit={handleRequestInvite} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="inviteName">Full Name</label>
              <input id="inviteName" type="text" required className="auth-input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="inviteEmail">Email Address</label>
              <input id="inviteEmail" type="email" required className="auth-input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="invitePhone">Phone Number (Optional)</label>
              <input id="invitePhone" type="tel" className="auth-input" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="inviteDesc">Why do you want to join? (Optional)</label>
              <textarea id="inviteDesc" rows={3} maxLength={500} className="auth-input auth-textarea" value={inviteDesc} onChange={(e) => setInviteDesc(e.target.value)} />
            </div>
            <button type="submit" disabled={inviteLoading} className="auth-submit">
              {inviteLoading ? "Submitting..." : "Submit Request"}
            </button>
            <div className="auth-switch-row">
              <button type="button" onClick={() => setShowInviteRequest(false)} className="auth-link-btn muted">Back to login</button>
            </div>
          </form>
        ) : showForgotPassword ? (
          forgotSuccess ? (
            <div className="auth-feedback">
              <div className="auth-alert success">
                If an account exists for this email, your request has been submitted to the administrator. They will contact you shortly.
              </div>
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotSuccess(false);
                  setForgotEmail("");
                }}
                className="auth-link-btn"
              >
                Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="auth-form">
              <div className="auth-field">
                <label className="auth-label" htmlFor="forgotEmail">Email Address</label>
                <input
                  id="forgotEmail"
                  type="email"
                  required
                  autoComplete="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              <button type="submit" disabled={forgotLoading} className="auth-submit">
                {forgotLoading ? "Submitting..." : "Submit Request"}
              </button>
              <div className="auth-switch-row">
                <button type="button" onClick={() => setShowForgotPassword(false)} className="auth-link-btn muted">Back to login</button>
              </div>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
              <div className="auth-field">
                <label className="auth-label" htmlFor="email">Email Address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
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
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="auth-form-row">
                <div className="auth-check-wrap">
                  <input
                    id="saveCredentials"
                    name="saveCredentials"
                    type="checkbox"
                    checked={saveCredentials}
                    onChange={(e) => setSaveCredentials(e.target.checked)}
                    className="auth-checkbox"
                  />
                  <label htmlFor="saveCredentials" className="auth-check-label">
                    Save credentials
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setError("");
                    setForgotSuccess(false);
                  }}
                  className="auth-link-btn"
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={loading} className="auth-submit">
                {loading ? "Logging in..." : "Log In"}
              </button>
            </form>

            <div className="auth-switch-row col">
              <div>
                Don't have an account?{" "}
                <Link to="/register" className="auth-link-btn">Sign up with invite code</Link>
              </div>
              <div>
                Need an invite code?{" "}
                <button type="button" onClick={() => setShowInviteRequest(true)} className="auth-link-btn">Request one here</button>
              </div>
            </div>
          </>
        )}
      </div>

      {isSuspendedModalOpen && (
        <div className="auth-modal-backdrop">
          <div className="auth-modal">
            <h3 className="auth-modal-title danger">Account Suspended</h3>
            {appealSuccess ? (
              <>
                <div className="auth-alert success">
                  Your message has been sent to the administrator. They will review your appeal shortly.
                </div>
                <div className="auth-modal-actions">
                  <button onClick={() => setIsSuspendedModalOpen(false)} className="auth-ghost-btn">
                    Close
                  </button>
                </div>
              </>
            ) : showAppealForm ? (
              <form onSubmit={handleAppealSubmit}>
                {appealError && (
                  <div className="auth-alert error">{appealError}</div>
                )}
                <textarea
                  value={appealMessage}
                  maxLength={500}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  placeholder="Explain why you think this suspension is a mistake..."
                  required
                  className="auth-input auth-textarea tall"
                />
                <div className="auth-modal-actions">
                  <button type="button" onClick={() => setShowAppealForm(false)} className="auth-ghost-btn">
                    Cancel
                  </button>
                  <button type="submit" disabled={appealLoading} className="auth-submit slim">
                    {appealLoading ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="auth-modal-body">
                  Your account has been suspended from ScholarDocX. If you think this was a mistake, please contact an administrator.
                </p>
                <div className="auth-modal-actions">
                  <button onClick={() => setShowAppealForm(true)} className="auth-ghost-btn">
                    <Mail size={16} />
                    Contact Admin
                  </button>
                  <button onClick={() => setIsSuspendedModalOpen(false)} className="auth-danger-btn">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
