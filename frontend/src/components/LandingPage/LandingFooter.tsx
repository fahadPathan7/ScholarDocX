import "./LandingFooter.css";

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-content">
        <div className="lp-footer-logo">ScholarDocX</div>
        <p className="lp-footer-copy">
          © {new Date().getFullYear()} ScholarDocX. Made with care for scholars
          worldwide.
        </p>
      </div>
    </footer>
  );
}
