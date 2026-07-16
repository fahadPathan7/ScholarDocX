import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogIn, Mail, Loader2, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { setToken, saveLoginCredentials, loadSavedCredentials, clearSavedCredentials } from "../lib/auth";
import { useAuth } from "../contexts/AuthContext";

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

  // Load saved credentials on mount
  useEffect(() => {
    const saved = loadSavedCredentials();
    if (saved) {
      setEmail(saved.email);
      setPassword(saved.password);
      setSaveCredentials(true);
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

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
            <LogIn size={24} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">
            {showInviteRequest ? "Request Invite" : showForgotPassword ? "Forgot Password" : "Welcome Back"}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 text-center">
            {showInviteRequest ? "Tell us about yourself to get an invite code" : showForgotPassword ? "Enter your email to request a password reset" : "Log in to your ScholarDocX account"}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
            {error}
          </div>
        )}

        {inviteSuccess ? (
          <div className="text-center">
            <div className="mb-6 rounded-md bg-emerald-500/10 p-4 text-sm text-emerald-500 border border-emerald-500/20">
              Your request has been submitted successfully. We will review it shortly.
            </div>
            <button
              onClick={() => {
                setShowInviteRequest(false);
                setInviteSuccess(false);
              }}
              className="font-medium text-emerald-500 hover:text-emerald-400"
            >
              Back to login
            </button>
          </div>
        ) : showInviteRequest ? (
          <form onSubmit={handleRequestInvite} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="inviteName">Full Name</label>
              <input id="inviteName" type="text" required className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="inviteEmail">Email Address</label>
              <input id="inviteEmail" type="email" required className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="invitePhone">Phone Number (Optional)</label>
              <input id="invitePhone" type="tel" className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="inviteDesc">Why do you want to join? (Optional)</label>
              <textarea id="inviteDesc" rows={3} maxLength={500} className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" value={inviteDesc} onChange={(e) => setInviteDesc(e.target.value)} />
            </div>
            <button type="submit" disabled={inviteLoading} className="group w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-lg shadow-emerald-900/30 text-sm font-semibold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-6">
              {inviteLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <span>Submit Request</span>
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
            <div className="mt-4 text-center text-sm">
              <button type="button" onClick={() => setShowInviteRequest(false)} className="font-medium text-zinc-400 hover:text-zinc-300">Back to login</button>
            </div>
          </form>
        ) : showForgotPassword ? (
          forgotSuccess ? (
            <div className="text-center">
              <div className="mb-6 rounded-md bg-emerald-500/10 p-4 text-sm text-emerald-500 border border-emerald-500/20">
                If an account exists for this email, your request has been submitted to the administrator. They will contact you shortly.
              </div>
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotSuccess(false);
                  setForgotEmail("");
                }}
                className="font-medium text-emerald-500 hover:text-emerald-400"
              >
                Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="forgotEmail">Email Address</label>
                <input
                  id="forgotEmail"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              <button type="submit" disabled={forgotLoading} className="group w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-lg shadow-emerald-900/30 text-sm font-semibold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-6">
                {forgotLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Request</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
              <div className="mt-4 text-center text-sm">
                <button type="button" onClick={() => setShowForgotPassword(false)} className="font-medium text-zinc-400 hover:text-zinc-300">Back to login</button>
              </div>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="saveCredentials"
                    name="saveCredentials"
                    type="checkbox"
                    checked={saveCredentials}
                    onChange={(e) => setSaveCredentials(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <label
                    htmlFor="saveCredentials"
                    className="ml-2 block text-sm text-zinc-300 cursor-pointer select-none"
                  >
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
                  className="text-sm font-medium text-emerald-500 hover:text-emerald-400 underline underline-offset-4 decoration-emerald-500/30 hover:decoration-emerald-400 transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-lg shadow-emerald-900/30 text-sm font-semibold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-6"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <>
                    <span>Log In</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-zinc-400 space-y-2 flex flex-col">
              <div>
                Don't have an account?{" "}
                <Link to="/register" className="font-medium text-emerald-500 hover:text-emerald-400 underline underline-offset-4 decoration-emerald-500/30 hover:decoration-emerald-400 transition-colors">
                  Sign up with invite code
                </Link>
              </div>
              <div>
                Need an invite code?{" "}
                <button type="button" onClick={() => setShowInviteRequest(true)} className="font-medium text-emerald-500 hover:text-emerald-400 underline underline-offset-4 decoration-emerald-500/30 hover:decoration-emerald-400 transition-colors">
                  Request one here
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isSuspendedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-red-500/20 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-semibold text-red-500">Account Suspended</h3>
            {appealSuccess ? (
              <>
                <div className="mb-6 rounded-md bg-emerald-500/10 p-4 text-sm text-emerald-500 border border-emerald-500/20">
                  Your message has been sent to the administrator. They will review your appeal shortly.
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setIsSuspendedModalOpen(false)}
                    className="rounded bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : showAppealForm ? (
              <form onSubmit={handleAppealSubmit}>
                {appealError && (
                  <div className="mb-4 rounded-md bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
                    {appealError}
                  </div>
                )}
                <textarea
                  value={appealMessage}
                  maxLength={500}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  placeholder="Explain why you think this suspension is a mistake..."
                  required
                  className="w-full h-32 mb-4 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAppealForm(false)}
                    className="rounded px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={appealLoading}
                    className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 focus:outline-none disabled:opacity-50 transition-colors"
                  >
                    {appealLoading ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="mb-6 text-sm text-zinc-300 leading-relaxed">
                  Your account has been suspended from ScholarDocX. If you think this was a mistake, please contact an administrator.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowAppealForm(true)}
                    className="inline-flex items-center gap-2 rounded bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition-colors"
                  >
                    <Mail size={16} />
                    Contact Admin
                  </button>
                  <button
                    onClick={() => setIsSuspendedModalOpen(false)}
                    className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition-colors"
                  >
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
