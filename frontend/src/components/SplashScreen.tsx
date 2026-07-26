import { useEffect, useState } from "react";
import { ShieldAlert, Send, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import { api, RecordMap } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ScholarDocXMark } from "./ScholarDocXMark";

const TIPS_AND_QUOTES = [
  "Use Advisor Atlas to search, filter, and organize prospective graduate advisors.",
  "Categorize application files in the Documents tab for structured storage.",
  "Track deadline status and priorities dynamically using the Tracker grid view.",
  "Draft personalized advisor outreach letters using custom AI integrations.",
  "\"The beautiful thing about learning is that no one can take it away from you.\" — B.B. King",
  "\"Education is the passport to the future, for tomorrow belongs to those who prepare for it today.\" — Malcolm X",
  "\"It always seems impossible until it's done.\" — Nelson Mandela",
  "\"Live as if you were to die tomorrow. Learn as if you were to live forever.\" — Mahatma Gandhi",
  "Tip: Tap cell headers to format text, change alignments, or assign custom colors."
];

export function SplashScreen({ message }: { message: string }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<RecordMap | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [fadeClass, setFadeClass] = useState("fade-in");

  // Appeal State for Suspended Accounts
  const [appealEmail, setAppealEmail] = useState("");
  const [appealMessage, setAppealMessage] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealSuccess, setAppealSuccess] = useState(false);
  const [appealError, setAppealError] = useState("");

  const isSuspended = message === "user_suspended" || message === "user_blocked" || message.includes("suspended");

  useEffect(() => {
    if (user?.email) {
      setAppealEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (!isSuspended) {
      api.get<RecordMap[]>("/local_profiles").then((rows) => {
        if (rows[0]) {
          setProfile(rows[0]);
          setTimeout(() => setShowProfile(true), 300);
        }
      }).catch(() => {});
    }
  }, [isSuspended]);

  useEffect(() => {
    if (isSuspended) return;
    const interval = setInterval(() => {
      setFadeClass("fade-out");
      setTimeout(() => {
        setTipIndex((prev) => (prev + 1) % TIPS_AND_QUOTES.length);
        setFadeClass("fade-in");
      }, 400);
    }, 6000);

    return () => clearInterval(interval);
  }, [isSuspended]);

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealEmail || !appealMessage.trim()) return;
    setAppealLoading(true);
    setAppealError("");
    try {
      await api.post("/auth/contact-admin", {
        email: appealEmail.trim(),
        message: appealMessage.trim(),
      });
      setAppealSuccess(true);
    } catch (err: any) {
      setAppealError(err.message || "Failed to submit appeal. Please try again.");
    } finally {
      setAppealLoading(false);
    }
  };

  return (
    <div className="splash-screen">
      <div className="splash-background">
        <div className="splash-orb orb-1" />
        <div className="splash-orb orb-2" />
        <div className="splash-orb orb-3" />
      </div>

      <div className="splash-container-horizontal">
        <div className="splash-col-left">
          <div className="splash-brand-horizontal">
            <div className="splash-icon">
              <ScholarDocXMark size={90} className="splash-logo-mark" />
            </div>
            <div className="splash-brand-text-left">
              <h1>ScholarDocX</h1>
              <p className="splash-tagline">Application planning workspace</p>
            </div>
          </div>
        </div>

        <div className="splash-col-right">
          {isSuspended ? (
            <div className="bg-slate-900/90 border border-rose-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-xl max-w-lg w-full text-left">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <ShieldAlert size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Account Suspended</h2>
                  <p className="text-xs text-rose-400/90">Access to your workspace has been restricted</p>
                </div>
              </div>

              {appealSuccess ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4 text-emerald-300 text-sm flex items-start gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-200 mb-1">Appeal Submitted Successfully</p>
                    <p className="text-xs text-emerald-300/80">
                      Your appeal has been received. Our administration team will review your request and contact you.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAppealSubmit} className="space-y-3.5 mb-4">
                  {appealError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-400 shrink-0" />
                      <span>{appealError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Account Email</label>
                    <input
                      type="email"
                      value={appealEmail}
                      onChange={(e) => setAppealEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-rose-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Reason for Appeal</label>
                    <textarea
                      value={appealMessage}
                      onChange={(e) => setAppealMessage(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Explain why your account suspension should be reviewed..."
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-rose-500/50 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={appealLoading}
                    className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-semibold shadow-lg shadow-rose-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Send size={14} />
                    {appealLoading ? "Submitting..." : "Submit Suspension Appeal"}
                  </button>
                </form>
              )}

              <div className="pt-3 border-t border-slate-800/80 flex justify-end">
                <button
                  type="button"
                  onClick={logout}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={13} />
                  Log Out & Return to Login
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.startsWith("Failed") || message.includes("404") || message.includes("500") || message.toLowerCase().includes("error") ? (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-left max-w-lg w-full mb-4 backdrop-blur-xl">
                  <div className="flex items-center gap-2.5 text-rose-300 text-sm font-semibold mb-2">
                    <AlertCircle size={18} className="text-rose-400 shrink-0" />
                    <span>Connection Error</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-3">{message}</p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    Retry Connection
                  </button>
                </div>
              ) : (
                <div className="splash-loader-container">
                  <div className="splash-loader">
                    <div className="splash-loader-bar" />
                  </div>
                  <p className="splash-message-secondary">
                    The first load after a period of inactivity may take up to a minute while the server wakes up.
                  </p>
                </div>
              )}

              <div className="splash-tips-container">
                <span className="splash-tips-label">Tip</span>
                <p className={`splash-tip-text ${fadeClass}`}>
                  {TIPS_AND_QUOTES[tipIndex]}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
