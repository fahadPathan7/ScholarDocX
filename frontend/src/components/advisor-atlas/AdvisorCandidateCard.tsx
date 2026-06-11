import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  FlaskConical,
  GitCompareArrows,
  RefreshCw,
  ShieldCheck,
  Star,
} from "lucide-react";
import { AdvisorCandidate } from "../../lib/advisorAtlasApi";

type Props = {
  candidate: AdvisorCandidate;
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
  selected,
  refreshing,
  onOpen,
  onCompare,
  onShortlist,
  onRefresh,
}: Props) {
  return (
    <article className="atlas-candidate-card">
      <div className="atlas-candidate-top">
        <div className="atlas-professor-avatar" aria-hidden="true">
          {candidate.display_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
        </div>
        <div className="atlas-candidate-identity">
          <div className="atlas-candidate-title-row">
            <h4>{candidate.display_name}</h4>
            {candidate.saved_professor_id && <span className="atlas-saved-badge"><Check size={13} /> Saved</span>}
          </div>
          <p>{candidate.title || "Academic researcher"}</p>
          <small>{[candidate.department, candidate.institution].filter(Boolean).join(" · ")}</small>
        </div>
        <button className="atlas-icon-button" onClick={onOpen} aria-label={`Open ${candidate.display_name} dossier`}>
          <ArrowUpRight size={18} />
        </button>
      </div>

      <div className="atlas-score-grid">
        <div>
          <span>Research fit</span>
          <strong>{candidate.match_score}%</strong>
          <div className="atlas-score-track"><i style={{ width: `${candidate.match_score}%` }} /></div>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{candidate.evidence_confidence}%</strong>
          <div className="atlas-score-track confidence"><i style={{ width: `${candidate.evidence_confidence}%` }} /></div>
        </div>
      </div>

      <p className="atlas-candidate-summary">
        {candidate.research_summary || "Open the dossier to inspect available public research evidence."}
      </p>

      <div className="atlas-signal-row">
        <span className={`atlas-recruitment ${candidate.recruitment_state}`}>
          <FlaskConical size={14} />
          {recruitmentLabels[candidate.recruitment_state] || candidate.recruitment_state}
        </span>
        <span className="atlas-coverage-pill">
          <ShieldCheck size={14} />
          {Object.values(candidate.coverage || {}).filter((value) => value === "Strong").length} strong areas
        </span>
      </div>

      {candidate.risk_flags?.length > 0 && (
        <div className="atlas-risk-line">
          <CircleAlert size={14} />
          {candidate.risk_flags.slice(0, 2).map((flag) => flag.replace(/_/g, " ")).join(" · ")}
        </div>
      )}

      <div className="atlas-card-actions">
        <button onClick={onShortlist} className={candidate.shortlist_status === "shortlisted" ? "active" : ""}>
          <Star size={16} fill={candidate.shortlist_status === "shortlisted" ? "currentColor" : "none"} />
          {candidate.shortlist_status === "shortlisted" ? "Shortlisted" : "Shortlist"}
        </button>
        <button onClick={onCompare} className={selected ? "active" : ""}>
          <GitCompareArrows size={16} />
          {selected ? "Selected" : "Compare"}
        </button>
        <button onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "atlas-spin" : ""} />
          Refresh
        </button>
        <button onClick={onOpen}>
          <BookOpen size={16} />
          Dossier
        </button>
      </div>
    </article>
  );
}
