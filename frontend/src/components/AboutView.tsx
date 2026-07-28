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
  Clock,
  ChevronRight
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
    title: "Secure Cloud Workspace",
    copy: "Fast, secure, and accessible anywhere."
  },
  {
    icon: ShieldCheck,
    tone: "privacy",
    title: "Privacy First",
    copy: "Your data. Securely hosted. Your control."
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
  { icon: UserCheck,     title: "Track applications & professor outreach" },
  { icon: Bell,          title: "Get timely deadline & reminder alerts" },
  { icon: Clock,         title: "Monitor progress across every application" }
];

const aiGuideItems = [
  { icon: Bot,           title: "Fully agentic — just tell Lumi what to do" },
  { icon: Globe,         title: "Searches the web to power your research" },
  { icon: FolderPlus,    title: "Spins up projects & updates sheet rows" },
  { icon: Trash2,        title: "Cleans up data on your command" },
  { icon: PencilLine,    title: "Drafts SOPs, LORs & outreach emails for you" },
  { icon: MessageCircle, title: "Remembers context across your whole workspace" }
];

export function AboutView() {
  const [showModelsModal, setShowModelsModal] = useState(false);
  const [emailProvider, setEmailProvider] = useState<string>("gmail");

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
              <p className="eyebrow">Secure personal workspace application workspace</p>
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
        <div className="about-panel-footer">
          <a
            className="about-support-button"
            href={getEmailComposeUrl()}
            onClick={handleContactClick}
            rel="noreferrer"
          >
            <Mail size={14} />
            Contact Support
            <ExternalLink size={14} />
          </a>
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
        <div className="about-panel-footer">
          <button
            className="about-support-button"
            onClick={() => setShowModelsModal(true)}
          >
            <Bot size={14} />
            Explore AI Models
            <ChevronRight size={14} />
          </button>
        </div>
      </section>


      <p className="about-footer">
        ScholarDocX · Secure personal workspace · Privacy-first · Built for academic planning<br/>
        All system dates and deadlines follow UTC, not local timezone.
      </p>

      {showModelsModal && (
        <div className="modal-backdrop modal-backdrop-main models-modal-backdrop" onClick={() => setShowModelsModal(false)}>
          <div className="modal-panel models-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header models-modal-header">
              <div>
                <p className="eyebrow">AI Assistant</p>
                <h2>AI Models Comparison</h2>
              </div>
              <button className="icon-button close-btn" type="button" onClick={() => setShowModelsModal(false)} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content models-modal-content">
              <table className="about-models-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Context</th>
                    <th>Reasoning</th>
                    <th>Speed</th>
                    <th>Performance</th>
                    <th>Tool Use</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="rank-gold"><td><span className="rank-badge">1</span></td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5.2</strong></td><td>203K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-excellent">94</span></td></tr>
                  <tr className="rank-silver"><td><span className="rank-badge">2</span></td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5.1</strong></td><td>203K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-excellent">92</span></td></tr>
                  <tr className="rank-bronze"><td><span className="rank-badge">3</span></td><td><span className="provider-groq">Groq</span></td><td><strong>GPT OSS 120B</strong></td><td>131K</td><td>Excellent</td><td>Very fast</td><td>Excellent</td><td>Very good</td><td><span className="score-excellent">90</span></td></tr>
                  <tr><td>4</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5</strong></td><td>203K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-excellent">89</span></td></tr>
                  <tr><td>5</td><td><span className="provider-google">Google AI Studio</span></td><td><strong>Gemini 2.5 Flash</strong></td><td>1M</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Very good</td><td><span className="score-good">87</span></td></tr>
                  <tr><td>6</td><td><span className="provider-mistral">Mistral</span></td><td><strong>Mistral Large</strong></td><td>256K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-good">86</span></td></tr>
                  <tr><td>7</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5-Turbo</strong></td><td>203K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Excellent</td><td><span className="score-good">85</span></td></tr>
                  <tr><td>8</td><td><span className="provider-mistral">Mistral</span></td><td><strong>Mistral Medium 3.5</strong></td><td>256K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Excellent</td><td><span className="score-good">85</span></td></tr>
                  <tr><td>9</td><td><span className="provider-groq">Groq</span></td><td><strong>Groq Compound</strong></td><td>131K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Excellent</td><td><span className="score-good">84</span></td></tr>
                  <tr><td>10</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-4.7</strong></td><td>203K</td><td>Very good</td><td>Medium</td><td>Very good</td><td>Excellent</td><td><span className="score-good">83</span></td></tr>
                  <tr><td>11</td><td><span className="provider-groq">Groq</span></td><td><strong>Qwen 3 32B</strong></td><td>131K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Good</td><td><span className="score-good">80</span></td></tr>
                  <tr><td>12</td><td><span className="provider-groq">Groq</span></td><td><strong>Llama 3.3 70B Versatile</strong></td><td>131K</td><td>Good</td><td>Fast</td><td>Very good</td><td>Good</td><td><span className="score-good">78</span></td></tr>
                  <tr><td>13</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-4.6 Vision</strong></td><td>131K</td><td>Good</td><td>Medium</td><td>Good</td><td>Very good</td><td><span className="score-fair">76</span></td></tr>
                  <tr><td>14</td><td><span className="provider-google">Google AI Studio</span></td><td><strong>Gemini 2.5 Flash-Lite</strong></td><td>1M</td><td>Good</td><td>Very fast</td><td>Good</td><td>Good</td><td><span className="score-fair">75</span></td></tr>
                  <tr><td>15</td><td><span className="provider-mistral">Mistral</span></td><td><strong>Devstral 2512</strong></td><td>256K</td><td>Good</td><td>Medium</td><td>Good</td><td>Very good</td><td><span className="score-fair">75</span></td></tr>
                  <tr><td>16</td><td><span className="provider-groq">Groq</span></td><td><strong>GPT OSS 20B</strong></td><td>131K</td><td>Good</td><td>Very fast</td><td>Good</td><td>Good</td><td><span className="score-fair">74</span></td></tr>
                  <tr className="rank-lowest"><td>17</td><td><span className="provider-groq">Groq</span></td><td><strong>Llama 4 Scout 17B Instruct</strong></td><td>131K</td><td>Good</td><td>Very fast</td><td>Good</td><td>Good</td><td><span className="score-fair">72</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  </>
  );
}
