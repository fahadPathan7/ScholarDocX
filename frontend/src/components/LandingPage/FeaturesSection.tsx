import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Table2,
  Sparkles,
  Mail,
  FileText,
  Lock,
  type LucideProps,
} from "lucide-react";
import { useReveal } from "./useReveal";
import "./FeaturesSection.css";

type Feature = {
  Icon: ComponentType<LucideProps>;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    Icon: LayoutDashboard,
    title: "Centralized Workspaces",
    body: "Manage universities, applications, and milestones in a single, unified workspace.",
  },
  {
    Icon: Table2,
    title: "Dynamic Tracker Sheets",
    body: "Track deadlines, requirements, and funding statuses with our built-in customized sheets.",
  },
  {
    Icon: Sparkles,
    title: "Contextual AI Assistant",
    body: "Draft outreach emails, summarize research, and refine statements with an AI assistant built for academics.",
  },
  {
    Icon: Mail,
    title: "Outreach Logger",
    body: "Log cold emails, professor replies, and meetings to keep your communication campaigns organized.",
  },
  {
    Icon: FileText,
    title: "Safe Document Vault",
    body: "Securely store CVs, transcripts, and personal statements in private, isolated vaults.",
  },
  {
    Icon: Lock,
    title: "Security & Privacy",
    body: "Protect your data with strict access controls and advanced local-first privacy configurations.",
  },
];

export function FeaturesSection() {
  const headerRef = useReveal<HTMLDivElement>();

  return (
    <section id="features" className="lp-features-section">
      <div className="reveal" ref={headerRef}>
        <h2 className="lp-section-title">Everything You Need to Succeed</h2>
        <p className="lp-section-subtitle">
          Engineered specifically for higher education application management
          and research tracking.
        </p>
      </div>

      <div className="lp-features-grid">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const { Icon, title, body } = feature;
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      className="lp-feature-card reveal"
      ref={ref}
      style={{ ["--reveal-delay" as string]: `${(index % 3) * 90}ms` }}
    >
      <div className="lp-feature-icon-wrapper">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
