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
      {/* Decorative ambient orbs */}
      <div className="lp-orb lp-hero-orb-1" />
      <div className="lp-orb lp-hero-orb-2" />

      <div className="lp-hero-content reveal" ref={heroRef}>
        <div className="lp-badge-announcement">
          <Sparkles size={14} />
          Privacy-First Graduate Application Portal
        </div>

        <h1 className="lp-hero-title">
          Organize Your Academic Applications.{" "}
          <span>Elevate Your Profile.</span>
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

        <p className="lp-hero-trust">
          No credit card required &nbsp;•&nbsp; Your data stays isolated
        </p>
      </div>

      {/* Pure CSS/SVG product mock — see ProductPreview */}
      <div className="lp-hero-preview reveal" ref={previewRef} style={{ ["--reveal-delay" as string]: "120ms" }}>
        <ProductPreview />
      </div>
    </section>
  );
}
