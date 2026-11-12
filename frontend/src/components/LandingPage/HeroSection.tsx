import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { ProductPreview } from "./ProductPreview";
import { useReveal } from "./useReveal";
import "./HeroSection.css";

export function HeroSection() {
  const heroRef = useReveal<HTMLDivElement>();
  const previewRef = useReveal<HTMLDivElement>();

  return (
    <section className="lp-hero-section">
      {/* Ruled-paper backdrop (SCHOLARDOCX-0223) */}
      <div className="lp-grid-texture" aria-hidden="true" />

      <div className="lp-hero-content reveal" ref={heroRef}>
        <div className="lp-badge-announcement">
          <Sparkles size={13} />
          <span className="lp-badge-rule" aria-hidden="true" />
          Privacy-First Graduate Application Portal
        </div>

        <h1 className="lp-hero-title">
          Organize Your Academic Applications.{" "}
          <em>Elevate Your Profile.</em>
        </h1>

        <p className="lp-hero-description">
          Your complete graduate application hub. Manage universities, track
          deadlines, organize documents, and draft outreach emails with
          privacy-first AI assistance.
        </p>

        <div className="lp-hero-actions">
          <Link to="/register" className="lp-hero-btn-primary">
            Start for Free
            <ArrowRight size={16} />
          </Link>
          <a href="#features" className="lp-hero-btn-secondary">
            Explore Features
          </a>
        </div>

        <a href="#mcp" className="lp-hero-mcp-link">
          <span className="lp-hero-mcp-new">New</span>
          Connect Claude Code, Cursor or VS Code with MCP
          <ArrowRight size={14} />
        </a>

        <p className="lp-hero-trust">
          <span>No credit card required</span>
          <span className="lp-hero-trust-dot" aria-hidden="true" />
          <span>Your data stays isolated</span>
        </p>
      </div>

      {/* Pure CSS/SVG product mock — see ProductPreview */}
      <div className="lp-hero-preview reveal" ref={previewRef} style={{ ["--reveal-delay" as string]: "120ms" }}>
        <ProductPreview />
      </div>
    </section>
  );
}
