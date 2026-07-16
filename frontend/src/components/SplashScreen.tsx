import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, RecordMap } from "../lib/api";
import { avatarImageSrc, getAvatarById } from "../data/avatars";

const TIPS_AND_QUOTES = [
  "ScholarDocX stores files securely in Supabase Storage with local control.",
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
  const [profile, setProfile] = useState<RecordMap | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [fadeClass, setFadeClass] = useState("fade-in");

  useEffect(() => {
    api.get<RecordMap[]>("/local_profiles").then((rows) => {
      if (rows[0]) {
        setProfile(rows[0]);
        setTimeout(() => setShowProfile(true), 300);
      }
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeClass("fade-out");
      setTimeout(() => {
        setTipIndex((prev) => (prev + 1) % TIPS_AND_QUOTES.length);
        setFadeClass("fade-in");
      }, 400); // match CSS fade transition duration
    }, 6000); // cycle every 6 seconds

    return () => clearInterval(interval);
  }, []);

  const avatar = profile?.avatar ? getAvatarById(profile.avatar) : null;
  const initials = profile?.display_name
    ? profile.display_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "SD";

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-brand">
          <div className="splash-icon">
            {avatar ? (
              <img
                className="splash-icon-avatar"
                src={avatarImageSrc(avatar)}
                alt={avatar.label}
              />
            ) : (
              <div className="splash-icon-initials">{initials}</div>
            )}
            <Sparkles size={20} className="splash-sparkle" />
          </div>
          <h1>ScholarDocX</h1>
          <p className="splash-tagline">Application planning workspace</p>
        </div>

        {profile?.display_name && showProfile && (
          <div className="splash-profile">
            <p className="splash-welcome">
              Welcome back, <strong>{profile.display_name}</strong>
            </p>
          </div>
        )}

        <div className="splash-loader">
          <div className="splash-loader-bar" />
        </div>
        <p className="splash-message">{message}</p>

        <div className="splash-render-warning">
          <span className="splash-warning-pulsar" />
          <p>
            <strong>Waking up server...</strong> ScholarDocX is hosted on Render's free tier, which sleeps after inactivity. Initial wakeup takes <strong>1–2 minutes</strong>. Please stay with us!
          </p>
        </div>

        <div className="splash-tips-container">
          <span className="splash-tips-label">Did you know?</span>
          <p className={`splash-tip-text ${fadeClass}`}>
            {TIPS_AND_QUOTES[tipIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

