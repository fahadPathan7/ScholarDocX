import type { ComponentType } from "react";
import { FolderKanban, Compass, Sparkles, type LucideProps } from "lucide-react";
import { useReveal } from "./useReveal";
import "./HowItWorks.css";

type Step = {
  Icon: ComponentType<LucideProps>;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    Icon: FolderKanban,
    title: "Set up workspace & deadlines",
    body: "Create projects for each program, track requirements in customized sheets, and monitor deadlines in one place.",
  },
  {
    Icon: Compass,
    title: "Analyze research & vet advisors",
    body: "Upload papers for deep AI analysis with Research Expert and match prospective professors with Advisor Atlas.",
  },
  {
    Icon: Sparkles,
    title: "Draft outreach & refresh focus",
    body: "Generate personalized outreach emails tailored to your goals and take cognitive micro-breaks with built-in Focus Games.",
  },
];

export function HowItWorks() {
  const headerRef = useReveal<HTMLDivElement>();

  return (
    <section id="how" className="lp-how-section">
      <div className="reveal" ref={headerRef}>
        <h2 className="lp-section-title">How It Works</h2>
        <p className="lp-section-subtitle">
          From scattered spreadsheets to a focused application command center in
          three steps.
        </p>
      </div>

      <div className="lp-how-grid">
        <div className="lp-how-timeline-line" aria-hidden="true" />
        {STEPS.map((s, i) => (
          <StepCard key={s.title} step={s} index={i} />
        ))}
      </div>
    </section>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  const { Icon, title, body } = step;
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      className="lp-how-step reveal"
      ref={ref}
      style={{ ["--reveal-delay" as string]: `${index * 110}ms` }}
    >
      <div className="lp-how-node">
        <div className="lp-how-number">{index + 1}</div>
        <Icon size={28} />
      </div>
      <div className="lp-how-text">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}
