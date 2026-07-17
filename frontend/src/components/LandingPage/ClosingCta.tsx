import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "./useReveal";
import "./ClosingCta.css";

export function ClosingCta() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="lp-closing-cta-section">
      <div className="lp-closing-cta reveal" ref={ref}>
        <div className="lp-closing-glow" />
        <h2>Ready to organize your applications?</h2>
        <p>
          Join scholars building a focused, private, AI-assisted application
          workflow. Start free — upgrade only when your ambitions do.
        </p>
        <Link to="/register" className="lp-closing-btn">
          Start for Free
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
