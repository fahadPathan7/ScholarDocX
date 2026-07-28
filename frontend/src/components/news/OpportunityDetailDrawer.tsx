import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  CalendarClock,
  FileText,
  Globe2,
  GraduationCap,
  MapPin,
  ShieldCheck,
  Target,
  Users2,
  X,
} from "lucide-react";
import { ScholarshipOpportunity } from "../../lib/scholarshipOpportunitiesApi";
import {
  deadlineTone,
} from "./OpportunityCard";

interface OpportunityDetailDrawerProps {
  opportunity: ScholarshipOpportunity;
  onAddToTracker?: (opportunity: ScholarshipOpportunity) => void;
  onClose: () => void;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source page";
  }
}

function isFutureDate(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= Date.now();
}

function Section({
  icon: Icon,
  title,
  children,
  empty,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
  empty?: string;
}) {
  const hasChildren = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <section className="opp-drawer-section">
      <h3>
        <Icon size={15} />
        {title}
      </h3>
      {hasChildren ? children : <p className="opp-drawer-muted">{empty || "No verified detail on the source page."}</p>}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="opp-drawer-chip">{children}</span>;
}

export function OpportunityDetailDrawer({
  opportunity,
  onClose,
}: OpportunityDetailDrawerProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const futureDeadlines = opportunity.deadlines.filter((d) => d.date && isFutureDate(d.date));
  const pastDeadlines = opportunity.deadlines.filter((d) => d.date && !isFutureDate(d.date));
  const confidenceEntries = Object.entries(opportunity.field_confidence || {}).filter(([, value]) => typeof value === "number");

  const root = document.getElementById("root") || document.body;

  return createPortal(
    <div
      className="opp-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="opp-drawer" role="dialog" aria-modal="true" aria-label="Opportunity details">
        <header className="opp-drawer-header">
          <div className="opp-drawer-identity">
            <span className="opp-drawer-eyebrow">
              {opportunity.source === "deep_hunt"
                ? "Deep Hunt result"
                : opportunity.source === "catalog"
                ? "Catalog entry"
                : "Scholarship opportunity"}
            </span>
            <h2>{opportunity.canonical_name}</h2>
            {opportunity.sponsor && <p>{opportunity.sponsor}</p>}
            <a href={opportunity.application_url || opportunity.normalized_url} target="_blank" rel="noreferrer">
              {hostname(opportunity.application_url || opportunity.normalized_url)} <ArrowUpRight size={13} />
            </a>
          </div>
          <button className="opp-drawer-close" onClick={onClose} aria-label="Close details">
            <X size={20} />
          </button>
        </header>

        <div className="opp-drawer-body">
          <Section icon={CalendarClock} title="Deadlines" empty="No deadlines were verified on the source page.">
            {futureDeadlines.length > 0 && (
              <ul className="opp-drawer-deadlines">
                {futureDeadlines.map((d, i) => (
                  <li key={`f-${i}`}>
                    <span className={`opp-drawer-deadline-chip tone-${deadlineTone(d.date)}`}>
                      <CalendarClock size={13} />
                      {d.label ? `${d.label}: ` : ""}
                      {d.date}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {pastDeadlines.length > 0 && (
              <details className="opp-drawer-past-deadlines">
                <summary>{pastDeadlines.length} past deadline{pastDeadlines.length === 1 ? "" : "s"}</summary>
                <ul>
                  {pastDeadlines.map((d, i) => (
                    <li key={`p-${i}`} className="opp-drawer-muted">
                      {d.label ? `${d.label}: ` : ""}
                      {d.date}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section icon={ShieldCheck} title="Funding" empty="No funding detail was verified on the source page.">
            <div className="opp-drawer-funding">
              {opportunity.funding.coverage && (
                <span className={`opp-drawer-coverage coverage-${opportunity.funding.coverage}`}>
                  <ShieldCheck size={13} />
                  {opportunity.funding.coverage === "full" ? "Full funding" : "Partial funding"}
                </span>
              )}
              {opportunity.funding.notes && <p>{opportunity.funding.notes}</p>}
            </div>
          </Section>

          <Section icon={GraduationCap} title="Degree levels" empty="Not stated on the source page.">
            <div className="opp-drawer-chips">
              {opportunity.degree_levels.map((level, i) => (
                <Chip key={i}>{level}</Chip>
              ))}
            </div>
          </Section>

          <Section icon={FileText} title="Fields of study" empty="Not stated on the source page.">
            <div className="opp-drawer-chips">
              {opportunity.fields_of_study.map((field, i) => (
                <Chip key={i}>{field}</Chip>
              ))}
            </div>
          </Section>

          <Section icon={MapPin} title="Destinations" empty="Not stated on the source page.">
            <div className="opp-drawer-chips">
              {opportunity.destinations.map((dest, i) => (
                <Chip key={i}>{dest}</Chip>
              ))}
            </div>
          </Section>

          <Section icon={Users2} title="Eligible nationalities" empty="Not stated on the source page.">
            <div className="opp-drawer-chips">
              {opportunity.eligible_nationalities.map((nat, i) => (
                <Chip key={i}>{nat}</Chip>
              ))}
            </div>
          </Section>

          <Section icon={FileText} title="Requirements" empty="No requirements were verified on the source page.">
            <ul className="opp-drawer-requirements">
              {opportunity.requirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </Section>

          <Section icon={Globe2} title="Source">
            <a
              className="opp-drawer-source-link"
              href={opportunity.application_url || opportunity.normalized_url}
              target="_blank"
              rel="noreferrer"
            >
              <Globe2 size={14} />
              {opportunity.application_url || opportunity.normalized_url}
              <ArrowUpRight size={13} />
            </a>
          </Section>

          {confidenceEntries.length > 0 && (
            <details className="opp-drawer-confidence-details">
              <summary>
                <Target size={15} />
                Extraction confidence
              </summary>
              <dl className="opp-drawer-confidence">
                {confidenceEntries
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replace(/_/g, " ")}</dt>
                      <dd>
                        <span className="opp-drawer-confidence-bar">
                          <span
                            className="opp-drawer-confidence-fill"
                            style={{ width: `${Math.round((value as number) * 100)}%` }}
                          />
                        </span>
                        <span className="opp-drawer-confidence-value">{Math.round((value as number) * 100)}%</span>
                      </dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
        </div>
      </aside>
    </div>,
    root,
  );
}
