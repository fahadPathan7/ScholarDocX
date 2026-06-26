import {
  Bot,
  BookOpen,
  CalendarDays,
  CalendarCheck,
  Database,
  ExternalLink,
  FileText,
  FolderPlus,
  GraduationCap,
  Globe,
  Mail,
  MessageCircle,
  PencilLine,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  X,
  Zap,
  Bell,
  Clock
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, RecordMap } from "../lib/api";
import { 
  notificationCategories, 
  defaultNotificationSettings, 
  notificationSettingsIntro 
} from "../config/notificationLabels";

const featureCards = [
  {
    icon: Database,
    tone: "storage",
    title: "Local Storage",
    copy: "Fast, local, and always yours."
  },
  {
    icon: ShieldCheck,
    tone: "privacy",
    title: "Privacy First",
    copy: "Your data. Your device. Your control."
  },
  {
    icon: Bot,
    tone: "ai",
    title: "AI Assistant",
    copy: "Lumi helps you research."
  },
  {
    icon: Mail,
    tone: "email",
    title: "Email Outreach",
    copy: "Write better outreach emails instantly."
  }
];

const flowItems = [
  { icon: BookOpen,      title: "Discover your dream universities" },
  { icon: CalendarCheck, title: "Build a clear plan with deadlines" },
  { icon: FileText,      title: "Keep all your documents organized" },
  { icon: Zap,           title: "Follow every application's journey" },
  { icon: UserCheck,     title: "Connect with the right professors" }
];

const aiGuideItems = [
  { icon: Bot,        title: "Fully agentic — just tell Lumi what to do" },
  { icon: Globe,      title: "Searches the web to power your research" },
  { icon: FolderPlus, title: "Spins up projects in seconds for you" },
  { icon: PencilLine, title: "Updates sheet rows exactly as you want" },
  { icon: Trash2,     title: "Cleans up data on your command" }
];

export function AboutView() {
  const [emailProvider, setEmailProvider] = useState<string>("gmail");
  const [utcTime, setUtcTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setUtcTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api.get<RecordMap[]>("/local_profiles").then((rows) => {
      const first = rows[0];
      if (first) {
        if (first.preferred_email_provider) {
          setEmailProvider(first.preferred_email_provider);
        }
      }
    });
  }, []);

  const getEmailComposeUrl = () => {
    const subject = encodeURIComponent("ScholarDocX Support");
    const recipient = "fahad.pathan.bd@gmail.com";

    if (emailProvider === "outlook") {
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${recipient}&subject=${subject}`;
    } else if (emailProvider === "gmail") {
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}`;
    } else {
      // desktop - use mailto
      return `mailto:${recipient}?subject=${subject}`;
    }
  };

  const handleContactClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (emailProvider !== "desktop") {
      e.preventDefault();
      window.open(getEmailComposeUrl(), "_blank", "noopener,noreferrer");
    }
    // For desktop, let the default mailto: behavior work
  };

  return (
    <>
      <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <div className="about-hero-title">
            <div className="about-hero-icon">
              <GraduationCap size={30} />
            </div>
            <div>
              <p className="eyebrow">Local-first application workspace</p>
              <h2>ScholarDocX</h2>
            </div>
          </div>
          <p>
            Turn your university application chaos into a clear, focused, winning journey.
          </p>
        </div>

        <div className="about-map" aria-hidden="true">
          <svg
            className="about-map-connections"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Path 1: Projects -> Emails -> Applications -> Deadlines */}
            <path
              id="path1"
              d="M 16 17 C 28 17, 34 41, 46 41 C 58 41, 60 55, 70 55 C 80 55, 75 73, 63 73"
              fill="none"
              stroke="rgba(79, 128, 118, 0.25)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="5 5"
            />
            
            {/* Path 2: Outreach -> Universities -> Documents */}
            <path
              id="path2"
              d="M 16 47 C 28 47, 34 13, 46 13 C 58 13, 60 25, 73 25"
              fill="none"
              stroke="rgba(79, 128, 118, 0.25)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="5 5"
            />
            
            {/* Path 3: Notes -> Deadlines */}
            <path
              id="path3"
              d="M 28 75 C 40 75, 50 73, 63 73"
              fill="none"
              stroke="rgba(79, 128, 118, 0.15)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="5 5"
            />

            {/* Moving Ball 1 */}
            <path
              d="M 0,0 L 0.01,0"
              stroke="#4e9786"
              strokeWidth="7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#glow)"
            >
              <animateMotion dur="10s" repeatCount="indefinite" calcMode="linear">
                <mpath href="#path1" />
              </animateMotion>
            </path>
            
            {/* Moving Ball 2 */}
            <path
              d="M 0,0 L 0.01,0"
              stroke="#4e9786"
              strokeWidth="7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#glow)"
            >
              <animateMotion dur="8s" repeatCount="indefinite" calcMode="linear">
                <mpath href="#path2" />
              </animateMotion>
            </path>
          </svg>
          {[
            { title: "Projects", icon: Route, x: "8%", y: "14%", float: "floatA" },
            { title: "Universities", icon: GraduationCap, x: "38%", y: "10%", float: "floatB" },
            { title: "Documents", icon: FileText, x: "65%", y: "22%", float: "floatC" },
            { title: "Outreach", icon: Send, x: "8%", y: "44%", float: "floatB" },
            { title: "Emails", icon: Mail, x: "38%", y: "38%", float: "floatA" },
            { title: "Applications", icon: Zap, x: "62%", y: "52%", float: "floatC" },
            { title: "Notes", icon: MessageCircle, x: "20%", y: "72%", float: "floatA" },
            { title: "Deadlines", icon: CalendarDays, x: "55%", y: "70%", float: "floatB" },
          ].map((card, index) => (
            <div
              key={card.title}
              className="about-map-node"
              style={
                {
                  "--x": card.x,
                  "--y": card.y,
                  "--float": card.float,
                  "--delay": `${index * -0.6}s`,
                } as React.CSSProperties
              }
            >
              <card.icon size={16} />
              <span>{card.title}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="about-flow-panel">
        <div className="about-ai-guide-head">
          <div className="about-card-icon project">
            <Route size={18} />
          </div>
          <div>
            <p className="eyebrow">Planning flow</p>
            <h3>Application Journey</h3>
          </div>
        </div>
        <div className="about-flow-list">
          {flowItems.map(({ icon: Icon, title }) => (
            <div className="about-flow-step" key={title}>
              <Icon size={16} />
              <strong>{title}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="about-grid">
        {featureCards.map(({ icon: Icon, tone, title, copy }) => (
          <div className="about-card" key={title}>
            <div className={`about-card-icon ${tone}`}>
              <Icon size={20} />
            </div>
            <div>
              <strong>{title}</strong>
              <p>{copy}</p>
            </div>
          </div>
        ))}
        
        <div className="about-card about-clock-card">
          <div className="about-clock-head">
            <div className="about-clock-label">
              <Clock size={16} />
              <span>System Clock</span>
            </div>
            <div className="about-clock-meta">
              <span className="about-clock-chip">24H</span>
              <span className="about-clock-chip about-clock-chip-live">
                <span
                  className="about-clock-live-dot"
                  style={{ opacity: utcTime.getSeconds() % 2 === 0 ? 1 : 0.28 }}
                />
                Live
              </span>
            </div>
          </div>

          <div className="about-clock-body">
            <p className="about-clock-caption">Coordinated Universal Time</p>
            <div className="about-clock-display" aria-label="Current UTC time">
              <span className="about-clock-primary">
                {utcTime.toISOString().substring(11, 13)}
              </span>
              <span
                className="about-clock-separator"
                style={{ opacity: utcTime.getSeconds() % 2 === 0 ? 1 : 0.22 }}
              >
                :
              </span>
              <span className="about-clock-primary">
                {utcTime.toISOString().substring(14, 16)}
              </span>
              <span className="about-clock-seconds">
                {utcTime.toISOString().substring(17, 19)}
              </span>
            </div>
            <div className="about-clock-footer">
              <span className="about-clock-date">
                {utcTime.toISOString().substring(0, 10)}
              </span>
              <span className="about-clock-zone">UTC</span>
            </div>
            <div className="about-clock-date-mobile">
              {utcTime.toISOString().substring(0, 10)}
            </div>
          </div>
        </div>
      </div>

      <section className="about-ai-guide">
        <div className="about-ai-guide-head">
          <div className="about-card-icon ai">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="eyebrow">Agentic AI</p>
            <h3>Lumi Assistant</h3>
          </div>
        </div>

        <div className="about-ai-guide-grid">
          {aiGuideItems.map(({ icon: Icon, title }) => (
            <div className="about-ai-guide-item" key={title}>
              <Icon size={16} />
              <strong>{title}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="about-support">
        <div className="about-support-text">
          <MessageCircle size={16} />
          <strong>Need help or have feedback?</strong>
        </div>
        <a
          className="about-support-button"
          href={getEmailComposeUrl()}
          onClick={handleContactClick}
          rel="noreferrer"
        >
          <Mail size={16} />
          Contact Support
          <ExternalLink size={14} />
        </a>
      </div>


      <p className="about-footer">ScholarDocX · Local-first · Privacy-first · Built for academic planning</p>
    </div>
  </>
  );
}
