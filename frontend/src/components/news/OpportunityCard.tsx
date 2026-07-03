import React from "react";
import { CalendarClock, ShieldCheck, Target } from "lucide-react";
import { ScholarshipOpportunity } from "../../lib/scholarshipOpportunitiesApi";
import { HuntProfile, computeFitScore } from "../../lib/huntProfile";

interface OpportunityCardProps {
  opportunity: ScholarshipOpportunity;
  onAddToTracker?: (opportunity: ScholarshipOpportunity) => void;
  huntProfile?: HuntProfile | null;
}

export const DEADLINE_RADAR_THRESHOLD_DAYS = 7;

// Mirrors the sheet system's default due-date thresholds (FR-7 Date Color Rules).
export function deadlineTone(dateStr: string): "urgent" | "warning" | "watch" | "normal" | "past" {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "normal";
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return "past";
  if (days <= 3) return "urgent";
  if (days <= 7) return "warning";
  if (days <= 10) return "watch";
  return "normal";
}

export function nearestDeadlineOf(opportunity: Pick<ScholarshipOpportunity, "deadlines">) {
  return [...opportunity.deadlines]
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function OpportunityCard({ opportunity, onAddToTracker, huntProfile }: OpportunityCardProps) {
  const nearestDeadline = nearestDeadlineOf(opportunity);
  const fit = huntProfile ? computeFitScore(huntProfile, opportunity) : null;

  return (
    <div className="opportunity-card">
      <div className="opportunity-card-header">
        <h4>{opportunity.canonical_name}</h4>
        {opportunity.sponsor && <span className="opportunity-sponsor">{opportunity.sponsor}</span>}
      </div>

      {fit && (
        <div className="opportunity-fit-row">
          <span className={`opportunity-fit-badge fit-${fit.score >= 70 ? "high" : fit.score >= 40 ? "medium" : "low"}`}>
            <Target size={13} />
            {fit.score}% fit
          </span>
          {fit.matches.map((m, i) => (
            <span key={`match-${i}`} className="opportunity-fit-chip fit-chip-match">✓ {m}</span>
          ))}
          {fit.mismatches.map((m, i) => (
            <span key={`mismatch-${i}`} className="opportunity-fit-chip fit-chip-mismatch">✗ {m}</span>
          ))}
        </div>
      )}

      <div className="opportunity-badges">
        {nearestDeadline && (
          <span className={`opportunity-deadline-chip tone-${deadlineTone(nearestDeadline.date)}`}>
            <CalendarClock size={13} />
            {nearestDeadline.label ? `${nearestDeadline.label}: ` : "Deadline: "}
            {nearestDeadline.date}
          </span>
        )}
        {opportunity.funding.coverage && (
          <span className={`opportunity-funding-badge coverage-${opportunity.funding.coverage}`}>
            <ShieldCheck size={13} />
            {opportunity.funding.coverage === "full" ? "Full funding" : "Partial funding"}
          </span>
        )}
      </div>

      {opportunity.funding.notes && (
        <p className="opportunity-funding-notes">{opportunity.funding.notes}</p>
      )}

      {(opportunity.degree_levels.length > 0 || opportunity.destinations.length > 0) && (
        <p className="opportunity-eligibility-summary">
          {opportunity.degree_levels.join(", ")}
          {opportunity.degree_levels.length > 0 && opportunity.destinations.length > 0 ? " · " : ""}
          {opportunity.destinations.join(", ")}
        </p>
      )}

      {opportunity.requirements.length > 0 && (
        <ul className="opportunity-requirements">
          {opportunity.requirements.slice(0, 5).map((req, idx) => (
            <li key={idx}>{req}</li>
          ))}
        </ul>
      )}

      {opportunity.deadlines.length === 0 &&
        opportunity.degree_levels.length === 0 &&
        opportunity.requirements.length === 0 && (
          <p className="opportunity-empty-note">
            No structured details could be verified from this page.
          </p>
        )}

      {onAddToTracker && (
        <button
          type="button"
          className="button-secondary opportunity-add-to-tracker-btn"
          onClick={() => onAddToTracker(opportunity)}
        >
          {opportunity.linked_sheet_id ? "Update in tracker" : "Add to tracker"}
        </button>
      )}
    </div>
  );
}
