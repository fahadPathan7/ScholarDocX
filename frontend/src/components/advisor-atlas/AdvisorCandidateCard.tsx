import {
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  GitCompareArrows,
  RefreshCw,
  ShieldCheck,
  Star,
  Target,
  Telescope,
} from "lucide-react";
import { AdvisorCandidate } from "../../lib/advisorAtlasApi";

export type DiscoveryCardVariant = "faculty" | "matches" | "opportunities";

type Props = {
  candidate: AdvisorCandidate;
  variant: DiscoveryCardVariant;
  selected: boolean;
  refreshing: boolean;
  onOpen: () => void;
  onCompare: () => void;
  onShortlist: () => void;
  onRefresh: () => void;
};

const recruitmentLabels: Record<string, string> = {
  confirmed_open: "Confirmed open",
  strong_signal: "Strong opportunity",
  possible_opportunity: "Possible opportunity",
  no_current_evidence: "No current evidence",
  unknown: "Unknown",
};

export function AdvisorCandidateCard({
  candidate,
  variant,
  selected,
  refreshing,
  onOpen,
  onCompare,
  onShortlist,
  onRefresh,
}: Props) {
  const intelligence = candidate.intelligence || {};
  const relation = intelligence.department_relation;
  const outlook = intelligence.opportunity_outlook;
  const matchedInterests = intelligence.matched_interests || [];
  const matchReasons = intelligence.match_reasons || [];
  const strongCoverage = Object.values(candidate.coverage || {}).filter(
    (value) => value === "Strong",
  ).length;
  const status = recruitmentLabels[candidate.recruitment_state]
    || candidate.recruitment_state.replace(/_/g, " ");

  return (
    <article className={`atlas-discovery-card ${variant}${selected ? " selected" : ""}`}>
      <header className="atlas-discovery-card-header">
        <div className="atlas-candidate-identity">
          <div className="atlas-candidate-title-row">
            <h4>{candidate.display_name}</h4>
            {candidate.saved_professor_id && (
              <span className="atlas-saved-badge"><Check size={13} /> Saved</span>
            )}
          </div>
          <p>{candidate.title || "Academic researcher"}</p>
          <small>{[candidate.department, candidate.institution].filter(Boolean).join(" · ")}</small>
          {relation?.relation && (
            <span className={`atlas-relation-pill ${relation.relation}`}>
              {relation.relation} field
            </span>
          )}
        </div>
        <button
          className="atlas-icon-button"
          onClick={onOpen}
          aria-label={`Open ${candidate.display_name} dossier`}
        >
          <ArrowUpRight size={18} />
        </button>
      </header>

      {variant === "faculty" && (
        <>
          <div className="atlas-faculty-proof">
            <span><ShieldCheck size={15} /> Source confidence</span>
            <strong>{candidate.evidence_confidence}%</strong>
            <small>{strongCoverage} strong evidence areas</small>
          </div>
          <p className="atlas-candidate-summary">
            {candidate.research_summary || "Research direction needs verification from the professor dossier."}
          </p>
        </>
      )}

      {variant === "matches" && (
        <>
          <div className="atlas-alignment-summary">
            <div>
              <span><Target size={15} /> Research alignment</span>
              <strong>{candidate.match_score}%</strong>
            </div>
            <div className="atlas-score-track">
              <i style={{ width: `${candidate.match_score}%` }} />
            </div>
          </div>
          {!!matchedInterests.length && (
            <div className="atlas-interest-tags" aria-label="Matched research interests">
              {matchedInterests.slice(0, 3).map((interest) => (
                <span key={interest}>{interest}</span>
              ))}
            </div>
          )}
          <div className="atlas-match-bridge">
            <strong>Why this is a match</strong>
            <span>
              {matchReasons[0]
                || candidate.research_summary
                || "Open the dossier to verify the research bridge."}
            </span>
          </div>
          <div className="atlas-card-evidence-line">
            <ShieldCheck size={14} />
            {candidate.evidence_confidence}% source confidence
          </div>
        </>
      )}

      {variant === "opportunities" && (
        <>
          <div className="atlas-opportunity-card-lead">
            <span className={`atlas-recruitment ${candidate.recruitment_state}`}>
              <Telescope size={14} />
              {status}
            </span>
            <div>
              <strong>{outlook?.likelihood ?? 0}%</strong>
              <span>recruitment outlook</span>
            </div>
          </div>
          {!!outlook?.likely_semesters?.length && (
            <div className="atlas-semester-sequence" aria-label="Likely recruitment semesters">
              {outlook.likely_semesters.slice(0, 3).map((semester) => (
                <span key={semester}>{semester}</span>
              ))}
            </div>
          )}
          <div className="atlas-opportunity-signals">
            <strong>Supporting evidence</strong>
            {(outlook?.signals || []).slice(0, 2).map((signal) => (
              <span key={signal}>{signal}</span>
            ))}
          </div>
          <div className="atlas-opportunity-fit">
            <span>Research alignment</span>
            <strong>{candidate.match_score}%</strong>
          </div>
        </>
      )}

      {candidate.risk_flags?.length > 0 && (
        <div className="atlas-risk-line">
          <CircleAlert size={14} />
          {candidate.risk_flags[0].replace(/_/g, " ")}
        </div>
      )}

      <footer className="atlas-discovery-card-actions">
        <button
          onClick={onShortlist}
          className={candidate.shortlist_status === "shortlisted" ? "active" : ""}
        >
          <Star
            size={16}
            fill={candidate.shortlist_status === "shortlisted" ? "currentColor" : "none"}
          />
          {candidate.shortlist_status === "shortlisted" ? "Shortlisted" : "Shortlist"}
        </button>
        <button onClick={onCompare} className={selected ? "active" : ""}>
          <GitCompareArrows size={16} />
          {selected ? "Selected" : "Compare"}
        </button>
        <button onClick={onRefresh} disabled={refreshing} aria-label={`Refresh ${candidate.display_name}`}>
          <RefreshCw size={16} className={refreshing ? "atlas-spin" : ""} />
          <span className="atlas-action-label">Refresh</span>
        </button>
        <button onClick={onOpen} className="primary">
          <ExternalLink size={16} />
          Dossier
        </button>
      </footer>
    </article>
  );
}
