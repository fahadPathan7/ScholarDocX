import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ScholarDocXMark } from "../ScholarDocXMark";
import "./LandingNav.css";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Shrink/tighten the header once the user scrolls away from the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the viewport grows to desktop width.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Lock body scroll while the mobile panel is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMobile = () => setMenuOpen(false);

  return (
    <header className={`lp-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="lp-nav">
        <a href="#" className="lp-logo" onClick={closeMobile}>
          <div className="lp-logo-icon">
            <ScholarDocXMark size={36} className="" />
          </div>
          <span className="lp-logo-word">ScholarDocX</span>
        </a>

        <nav className="lp-nav-links">
          <a href="#features" className="lp-nav-link">Features</a>
          <a href="#how" className="lp-nav-link">How It Works</a>
          <a href="#pricing" className="lp-nav-link">Pricing</a>
          <a href="#faq" className="lp-nav-link">FAQ</a>
        </nav>

        <div className="lp-nav-actions">
          <Link to="/login" className="lp-btn-login">Log In</Link>
          <Link to="/register" className="lp-btn-signup">Get Started</Link>
        </div>

        <button
          type="button"
          className="lp-nav-burger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="lp-mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile slide-down panel */}
      <div
        id="lp-mobile-menu"
        className={`lp-mobile-menu${menuOpen ? " is-open" : ""}`}
      >
        <a href="#features" className="lp-mobile-link" onClick={closeMobile}>Features</a>
        <a href="#how" className="lp-mobile-link" onClick={closeMobile}>How It Works</a>
        <a href="#pricing" className="lp-mobile-link" onClick={closeMobile}>Pricing</a>
        <a href="#faq" className="lp-mobile-link" onClick={closeMobile}>FAQ</a>
        <div className="lp-mobile-actions">
          <Link to="/login" className="lp-btn-login" onClick={closeMobile}>Log In</Link>
          <Link to="/register" className="lp-btn-signup" onClick={closeMobile}>Get Started</Link>
        </div>
      </div>

      {/* Click-away backdrop for the mobile panel */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="lp-mobile-backdrop"
          onClick={closeMobile}
        />
      )}
    </header>
  );
}
