import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { LandingNav } from "./LandingNav";
import { HeroSection } from "./HeroSection";
import { StatsBand } from "./StatsBand";
import { PillarsShowcase } from "./PillarsShowcase";
import { FeaturesSection } from "./FeaturesSection";
import { HowItWorks } from "./HowItWorks";
import { PricingSection } from "./PricingSection";
import { FaqSection } from "./FaqSection";
import { ClosingCta } from "./ClosingCta";
import { LandingFooter } from "./LandingFooter";
import "./landing-shared.css";

/**
 * Public landing page for unauthenticated visitors.
 *
 * Authenticated users are automatically redirected to the workspace dashboard.
 * Sections are split into colocated components (see this directory) to stay
 * within the project's file-size limits. Each section opts into the shared
 * scroll-reveal system via the `useReveal` hook.
 */
export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Automatically redirect authenticated users to the workspace dashboard.
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="lp-container">
      <LandingNav />
      <main>
        <HeroSection />
        <StatsBand />
        <PillarsShowcase />
        <FeaturesSection />
        <HowItWorks />
        <PricingSection />
        <FaqSection />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
