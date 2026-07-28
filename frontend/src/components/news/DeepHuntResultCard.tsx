import React from "react";
import { BookmarkPlus, CalendarClock, Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { DeepHuntResult } from "../../lib/scholarshipDeepHuntApi";
import { deadlineTone, nearestDeadlineOf } from "./OpportunityCard";

interface DeepHuntResultCardProps {
  result: DeepHuntResult;
  onSave: (result: DeepHuntResult) => void;
  isSaving: boolean;
}

// SCHOLARDOCX-0178: a Search result before it is saved to the Opportunity
// Library. Deliberately separate from OpportunityCard (Library items) —
// this has no id/status yet, no drawer, and no fit score (Hunt Profile was
// removed). Its one job is to show the vetted result and let the user pick
// whether to keep it. "Add to tracker" lives in the Library tab only, once
// a result has actually been saved.
export function DeepHuntResultCard({ result, onSave, isSaving }: DeepHuntResultCardProps) {
  const nearestDeadline = nearestDeadlineOf(result);
  const isSaved = result.in_library;

  return (
    <div className="opportunity-card deep-hunt-result-card">
      <div className="opportunity-card-header">
        <h4>{result.canonical_name}</h4>
        {result.sponsor && <span className="opportunity-sponsor">{result.sponsor}</span>}
      </div>

      <div className="opportunity-badges">
        {nearestDeadline && (
          <span className={`opportunity-deadline-chip tone-${deadlineTone(nearestDeadline.date)}`}>
            <CalendarClock size={13} />
            {nearestDeadline.label ? `${nearestDeadline.label}: ` : "Deadline: "}
            {nearestDeadline.date}
          </span>
        )}
        {result.funding.coverage && (
          <span className={`opportunity-funding-badge coverage-${result.funding.coverage}`}>
            <ShieldCheck size={13} />
            {result.funding.coverage === "full" ? "Full funding" : "Partial funding"}
          </span>
        )}
      </div>

      {result.funding.notes && <p className="opportunity-funding-notes">{result.funding.notes}</p>}

      {(result.degree_levels.length > 0 || result.destination_countries.length > 0 || result.fields_of_study.length > 0) && (
        <p className="opportunity-eligibility-summary">
          {result.degree_levels.join(", ")}
          {result.degree_levels.length > 0 && result.destination_countries.length > 0 ? " · " : ""}
          {result.destination_countries.join(", ")}
          {result.fields_of_study.length > 0 && (
            <>
              {result.degree_levels.length > 0 || result.destination_countries.length > 0 ? " · " : ""}
              {result.fields_of_study.join(", ")}
            </>
          )}
        </p>
      )}

      {result.requirements.length > 0 && (
        <ul className="opportunity-requirements">
          {result.requirements.slice(0, 5).map((req, idx) => (
            <li key={idx}>{req}</li>
          ))}
        </ul>
      )}

      {result.deadlines.length === 0 && result.degree_levels.length === 0 && result.requirements.length === 0 && (
        <p className="opportunity-empty-note">No structured details could be verified from this page.</p>
      )}

      <div className="deep-hunt-result-footer">
        <a
          className="opportunity-view-details"
          href={result.application_url || result.source_url}
          target="_blank"
          rel="noreferrer"
        >
          View source <ExternalLink size={13} />
        </a>

        {isSaved ? (
          <span className="deep-hunt-result-saved-badge">
            <Check size={14} /> Saved to Library
          </span>
        ) : (
          <button
            type="button"
            className="deep-hunt-save-btn"
            onClick={() => onSave(result)}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="icon-spin" size={14} /> : <BookmarkPlus size={14} />}
            <span>{isSaving ? "Saving..." : "Save to Library"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
