import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, RecordMap } from "../lib/api";
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
          <div className="splash-loader-container">
            <div className="splash-loader">
              <div className="splash-loader-bar" />
            </div>
            <p className="splash-message">{message}</p>
          </div>

          <div className="splash-tips-container">
            <span className="splash-tips-label">Tip</span>
            <p className={`splash-tip-text ${fadeClass}`}>
              {TIPS_AND_QUOTES[tipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

