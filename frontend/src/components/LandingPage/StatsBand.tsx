import { useEffect, useRef, useState } from "react";
import { useReveal } from "./useReveal";
import "./StatsBand.css";

type Stat = {
  /** Numeric target to count up to. */
  value: number;
  /** Optional suffix shown after the number (e.g. "%", "+"). */
  suffix?: string;
  /** Label rendered beneath the number. */
  label: string;
};

const STATS: Stat[] = [
  { value: 6, suffix: "", label: "Core tools in one workspace" },
  { value: 4, suffix: "", label: "Flexible plan tiers" },
  { value: 100, suffix: "%", label: "Data isolated via Row-Level Security" },
  { value: 0, suffix: "", label: "Data shared with third parties" },
];

/**
 * Counts a single stat up to its target once it scrolls into view.
 * Respects prefers-reduced-motion (jumps to final value).
 */
function CountUp({ value, suffix }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  const sectionRef = useReveal<HTMLDivElement>();
  // Attach an observer via the shared hook by piggybacking on in-view class.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (prefersReduced || value === 0) {
        setDisplay(value);
        return;
      }
      const duration = 1100;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(eased * value));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    // If reduced motion, the reveal hook marks in-view immediately.
    if (prefersReduced) {
      start();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, sectionRef]);

  return (
    <span className="lp-stat-value" ref={sectionRef}>
      {display}
      {suffix}
    </span>
  );
}

export function StatsBand() {
  return (
    <section className="lp-stats-band">
      <div className="lp-stats-grid">
        {STATS.map((s) => (
          <div className="lp-stat-item" key={s.label}>
            <CountUp value={s.value} suffix={s.suffix} />
            <span className="lp-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
