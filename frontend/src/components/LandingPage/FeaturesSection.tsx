import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Table2,
  Sparkles,
  Mail,
  FileText,
  Lock,
  Award,
  CheckCircle2,
  Zap,
  type LucideProps,
} from "lucide-react";
import { useReveal } from "./useReveal";
import "./FeaturesSection.css";

interface BentoFeature {
  id: string;
  Icon: ComponentType<LucideProps>;
  category: string;
  title: string;
  tagline?: string;
  body: string;
  badge?: string;
  accentClass: string;
  gridSpan: string; // e.g., "span-7", "span-5", "span-6", "span-4"
  metaPill?: string;
  highlights?: string[];
}

const BENTO_FEATURES: BentoFeature[] = [
  {
    id: "workspace",
    Icon: LayoutDashboard,
    category: "APPLICATION COMMAND CENTER",
    title: "Centralized Workspaces",
    body: "Organize target universities, program deadlines, prospective advisors, and documents into clean, dedicated project spaces.",
    badge: "Core Platform",
    accentClass: "bento-indigo",
    gridSpan: "span-7",
    metaPill: "Unified Portal",
    highlights: ["Multi-Program Support", "Milestone Tracking", "Custom Degree Tags"],
  },
  {
    id: "sheets",
    Icon: Table2,
    category: "REQUIREMENT TRACKING",
    title: "Dynamic Tracker Sheets",
    body: "Customize tracker sheets with spreadsheet-level flexibility — conditional date coloring, cell formatting styles, and custom categories.",
    badge: "Spreadsheet Power",
    accentClass: "bento-teal",
    gridSpan: "span-5",
    metaPill: "Spreadsheet Grid",
    highlights: ["Conditional Date Color", "CSV Import / Export"],
  },
  {
    id: "ai-assistant",
    Icon: Sparkles,
    category: "AI WRITING ASSISTANCE",
    title: "Contextual AI Assistant",
    body: "Draft outreach emails, summarize papers, and polish statements of purpose with an AI assistant built specifically for academic applicants.",
    accentClass: "bento-purple",
    gridSpan: "span-6",
    metaPill: "Academic AI",
    highlights: ["Statement Refinement", "Tailored Email Drafting"],
  },
  {
    id: "scholarships",
    Icon: Award,
    category: "FUNDING & FELLOWSHIPS",
    title: "Scholarship Hunt",
    body: "Discover funding opportunities, graduate assistantships, and merit fellowships matched to your academic field and background.",
    accentClass: "bento-amber",
    gridSpan: "span-6",
    metaPill: "Funding Finder",
    highlights: ["AI Intent Matching", "Fellowship Discovery"],
  },
  {
    id: "outreach",
    Icon: Mail,
    category: "FACULTY COMMUNICATION",
    title: "Outreach Logger",
    body: "Log cold emails, professor replies, and interview schedules to keep your communication campaigns organized.",
    accentClass: "bento-rose",
    gridSpan: "span-4",
    metaPill: "Email Campaign Tracker",
  },
  {
    id: "vault",
    Icon: FileText,
    category: "DOCUMENT VAULT",
    title: "Safe Document Vault",
    body: "Securely store CVs, transcripts, SOP drafts, and recommendation letters in isolated private vaults.",
    accentClass: "bento-sky",
    gridSpan: "span-4",
    metaPill: "Cloud Storage",
  },
  {
    id: "security",
    Icon: Lock,
    category: "DATA PROTECTION",
    title: "Security & Privacy",
    body: "Rest easy knowing your documents and application data are protected with strict access controls and Row-Level Security.",
    accentClass: "bento-slate",
    gridSpan: "span-4",
    metaPill: "100% Isolated Data",
  },
];

export function FeaturesSection() {
  const headerRef = useReveal<HTMLDivElement>();

  return (
    <section id="features" className="lp-features-section">
      {/* Background ambient lighting */}
      <div className="lp-features-ambient-glow" />

      <div className="reveal text-center" ref={headerRef}>
        <div className="lp-features-top-chip">
          <Zap size={14} />
          <span>All-In-One Academic Platform</span>
        </div>
        <h2 className="lp-section-title">
          Everything You Need to Succeed
        </h2>
        <p className="lp-section-subtitle">
          Engineered specifically for higher education application management, advisor vetting, and deep research tracking.
        </p>
      </div>

      {/* Bento Grid Layout */}
      <div className="lp-bento-grid">
        {BENTO_FEATURES.map((item, idx) => (
          <BentoCard key={item.id} feature={item} index={idx} />
        ))}
      </div>
    </section>
  );
}

function BentoCard({ feature, index }: { feature: BentoFeature; index: number }) {
  const { Icon, category, title, tagline, body, badge, accentClass, gridSpan, metaPill, highlights } = feature;
  const cardRef = useReveal<HTMLDivElement>();

  return (
    <div
      className={`lp-bento-card ${gridSpan} ${accentClass} reveal`}
      ref={cardRef}
      style={{ ["--reveal-delay" as string]: `${(index % 4) * 80}ms` }}
    >
      <div className="lp-bento-glare" />

      <div className="lp-bento-top">
        <div className="lp-bento-header-left">
          <div className="lp-bento-icon-box">
            <Icon size={20} />
          </div>
          <span className="lp-bento-category">{category}</span>
        </div>

        <div className="lp-bento-badges">
          {badge && <span className="lp-bento-badge-chip">{badge}</span>}
          {metaPill && <span className="lp-bento-meta-chip">{metaPill}</span>}
        </div>
      </div>

      <div className="lp-bento-main">
        <h3 className="lp-bento-title">{title}</h3>
        {tagline && <p className="lp-bento-subtag">{tagline}</p>}
        <p className="lp-bento-body">{body}</p>

        {highlights && highlights.length > 0 && (
          <div className="lp-bento-highlights">
            {highlights.map((h) => (
              <span key={h} className="lp-bento-pill">
                <CheckCircle2 size={12} />
                {h}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
