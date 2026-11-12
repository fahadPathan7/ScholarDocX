import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Eye,
  KeyRound,
  Plug,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { useReveal } from "./useReveal";
import "./McpSection.css";

const BENEFITS = [
  {
    Icon: Eye,
    title: "Reads, nothing more",
    body: "Your AI app can look at your projects, sheets and deadlines. Read-only until you decide otherwise.",
  },
  {
    Icon: ShieldCheck,
    title: "You approve every change",
    body: "Suggestions land in a review inbox with a notification. Nothing happens until you click Confirm.",
  },
  {
    Icon: Zap,
    title: "Or let it act",
    body: "Trust your AI app's own safeguards? Allow direct changes per app. Deletes and bulk edits stay blocked.",
  },
  {
    Icon: Coins,
    title: "Zero AI credits",
    body: "It runs on the AI subscription you already pay for, so ScholarDocX credits are never used.",
  },
];

const TRUST = [
  "Scoped access keys",
  "Keys expire automatically",
  "Revoke in one click",
  "Basic, Pro and Max plans",
];

export function McpSection() {
  const copyRef = useReveal<HTMLDivElement>();
  const demoRef = useReveal<HTMLDivElement>();
  const cardsRef = useReveal<HTMLDivElement>();

  return (
    <section id="mcp" className="lp-mcp-section" aria-labelledby="lp-mcp-title">
      <div className="lp-mcp-glow lp-mcp-glow-gold" aria-hidden="true" />
      <div className="lp-mcp-glow lp-mcp-glow-blue" aria-hidden="true" />

      <div className="lp-mcp-inner">
        <div className="lp-mcp-hero">
          <div className="lp-mcp-copy reveal" ref={copyRef}>
            <span className="lp-mcp-badge">
              <span className="lp-mcp-badge-dot" aria-hidden="true" />
              New · Model Context Protocol
            </span>
            <h2 id="lp-mcp-title" className="lp-mcp-title">
              Bring your own AI. <span>Connect it with MCP.</span>
            </h2>
            <p className="lp-mcp-lead">
              ScholarDocX is now an <strong>MCP server</strong> for your applications. Plug in the AI
              you already use and let it read your deadlines, search your sheets and propose changes,
              while you stay in control.
            </p>
            <p className="lp-mcp-explain">
              MCP (Model Context Protocol) is the open standard that lets AI apps safely use your tools.
            </p>

            <ul className="lp-mcp-clients" aria-label="Works with">
              <li>Claude Code</li>
              <li>Cursor</li>
              <li>VS Code</li>
              <li className="lp-mcp-clients-more">+ other MCP clients</li>
            </ul>

            <div className="lp-mcp-actions">
              <Link to="/register" className="lp-mcp-btn-primary">
                Start for Free
                <ArrowRight size={16} />
              </Link>
              <a href="#pricing" className="lp-mcp-btn-secondary">
                See plans
              </a>
            </div>
          </div>

          <div
            className="lp-mcp-demo reveal"
            ref={demoRef}
            style={{ ["--reveal-delay" as string]: "120ms" }}
            role="img"
            aria-label="Example: an AI app asks ScholarDocX for upcoming deadlines, then suggests a new row that waits for your approval."
          >
            <div className="lp-mcp-terminal">
              <div className="lp-mcp-terminal-bar">
                <span /><span /><span />
                <em><Terminal size={12} /> Claude Code</em>
              </div>
              <div className="lp-mcp-terminal-body">
                <p className="lp-mcp-line lp-mcp-you">
                  <b>You</b> What is due in the next 14 days?
                </p>
                <p className="lp-mcp-line lp-mcp-tool">
                  <Plug size={12} /> get_deadlines <i>project: "MSc 2027"</i>
                  <CheckCircle2 size={12} className="lp-mcp-ok" />
                </p>
                <p className="lp-mcp-line lp-mcp-ai">
                  <b>AI</b> 3 deadlines: TU Munich (Jan 15), ETH Zurich (Jan 20), KTH (Jan 27).
                </p>
                <p className="lp-mcp-line lp-mcp-you">
                  <b>You</b> Add a row for Delft, MSc Computer Science.
                </p>
                <p className="lp-mcp-line lp-mcp-tool">
                  <Plug size={12} /> propose_changes <i>awaiting your approval</i>
                </p>
              </div>
            </div>

            <div className="lp-mcp-approval">
              <div className="lp-mcp-approval-head">
                <KeyRound size={14} />
                Suggested by Claude Code
                <span className="lp-mcp-approval-count">1</span>
              </div>
              <p>Add row: Delft · MSc Computer Science</p>
              <div className="lp-mcp-approval-actions">
                <span className="lp-mcp-dismiss">Dismiss</span>
                <span className="lp-mcp-confirm">Confirm</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-mcp-cards reveal" ref={cardsRef}>
          {BENEFITS.map(({ Icon, title, body }) => (
            <article key={title} className="lp-mcp-card">
              <span className="lp-mcp-card-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <ul className="lp-mcp-trust" aria-label="Safety and availability">
          {TRUST.map((item) => (
            <li key={item}>
              <CheckCircle2 size={14} /> {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
