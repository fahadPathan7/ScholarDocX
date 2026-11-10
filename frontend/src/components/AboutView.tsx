import {
  Bot,
  BookOpen,
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
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  X,
  Bell,
  Clock,
  ChevronRight
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, RecordMap } from "../lib/api";
import { Modal } from "./Modal";
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
      <div className="ab-page">
        <section className="ab-hero">
          <div className="ab-hero-copy">
            <p className="ab-eyebrow">
              <GraduationCap size={14} /> Secure personal workspace
            </p>
            <h2>ScholarDocX</h2>
            <p className="ab-lede">
              Turn your university application chaos into a clear, focused, winning journey.
            </p>
            <div className="ab-hero-actions">
              <a
                className="ab-btn ab-btn-primary"
                href={getEmailComposeUrl()}
                onClick={handleContactClick}
                rel="noreferrer"
              >
                <Mail size={15} />
                Contact Support
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                className="ab-btn ab-btn-ghost"
                onClick={() => setShowModelsModal(true)}
              >
                <Bot size={15} />
                Explore AI Models
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <ul className="ab-principles">
            {featureCards.map(({ icon: Icon, tone, title, copy }) => (
              <li className="ab-principle" key={title}>
                <span className={`ab-icon ab-tone-${tone}`}>
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ab-section">
          <header className="ab-section-head">
            <p className="ab-eyebrow">
              <Route size={14} /> Planning flow
            </p>
            <h3>Your application journey</h3>
          </header>
          <ol className="ab-steps">
            {flowItems.map(({ icon: Icon, title }, index) => (
              <li className="ab-step" key={title}>
                <span className="ab-step-num">{index + 1}</span>
                <Icon size={18} className="ab-step-icon" />
                <strong>{title}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="ab-section ab-lumi">
          <header className="ab-section-head">
            <p className="ab-eyebrow">
              <Sparkles size={14} /> Agentic AI
            </p>
            <h3>Meet Lumi, your assistant</h3>
          </header>
          <ul className="ab-lumi-grid">
            {aiGuideItems.map(({ icon: Icon, title }) => (
              <li className="ab-lumi-item" key={title}>
                <Icon size={17} />
                <span>{title}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="ab-footnote">
          ScholarDocX · Secure personal workspace · Privacy-first · Built for academic planning
          <br />
          Deadlines are calendar days shown as entered; timestamps are shown in your local timezone.
        </p>
      </div>

      {showModelsModal && (
        <Modal onClose={() => setShowModelsModal(false)}>
          {/* marginLeft:0 neutralizes the legacy 150px sidebar offset baked
              into .models-modal-panel (about-refresh.css) for the old
              fixed-position backdrop; the canonical <Modal> already portals
              into .main-content, next to the sidebar. */}
          <div
            className="modal-panel models-modal-panel"
            style={{ marginLeft: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
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
        </Modal>
      )}
    </>
  );
}
