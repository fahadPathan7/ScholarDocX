import { useState } from "react";
import {
  Activity,
  CircleStop,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { AdvisorCandidate, AdvisorRun } from "../../lib/advisorAtlasApi";
import { AdvisorDiscoveryFunnel } from "./AdvisorDiscoveryFunnel";
import { AdvisorProfessorBrief } from "./AdvisorProfessorBrief";

type Props = {
  run: AdvisorRun;
  refreshingCandidateId: number | null;
  onOpenCandidate: (id: number) => void;
  onRefreshCandidate: (id: number) => void;
  onShortlist: (candidate: AdvisorCandidate) => void;
  onCancel: () => void;
  onResume: () => void;
  onReload: () => void;
};

export function AdvisorRunWorkspace({
  run,
  refreshingCandidateId,
  onOpenCandidate,
  onRefreshCandidate,
  onShortlist,
  onCancel,
  onResume,
  onReload,
}: Props) {
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const candidates = run.candidates || [];
  const compared = candidates.filter((candidate) => compareIds.includes(candidate.id));
  const progress = run.progress || {};
  const determinate = typeof progress.total === "number" && progress.total > 0;
  const progressValue = determinate ? Math.round(((progress.completed || 0) / progress.total!) * 100) : 0;

  const toggleCompare = (candidate: AdvisorCandidate) => {
    setCompareIds((current) => {
      if (current.includes(candidate.id)) return current.filter((id) => id !== candidate.id);
      if (current.length >= 4) return current;
      return [...current, candidate.id];
    });
  };

  return (
    <div className="atlas-run-workspace">
      <section className="atlas-run-header">
        <div>
          <span className="atlas-eyebrow">{run.mode === "professor" ? "Individual Professor search" : "Broad Discovery search"} · {run.status}</span>
          <h2>{run.professor_name || `${run.university_name} · ${run.department}`}</h2>
          <p>{progress.message || "Review the evidence-backed advisor landscape."}</p>
        </div>
        <div className="atlas-run-actions">
          <button onClick={onReload}><RefreshCw size={16} /> Refresh view</button>
          {["queued", "running"].includes(run.status) && <button className="danger" onClick={onCancel}><CircleStop size={16} /> Stop run</button>}
          {["failed", "cancelled"].includes(run.status) && <button onClick={onResume}><RotateCcw size={16} /> Resume</button>}
        </div>
      </section>

      {["queued", "running"].includes(run.status) && (
        <section className="atlas-progress-panel" aria-live="polite">
          <div className="atlas-progress-icon"><Activity size={22} /></div>
          <div>
            <strong>{run.current_stage.replace(/_/g, " ")}</strong>
            <span>{progress.message}</span>
            <div className={determinate ? "atlas-progress-track" : "atlas-progress-track indeterminate"}>
              <i style={determinate ? { width: `${progressValue}%` } : undefined} />
            </div>
            <small>{determinate ? `${progress.completed || 0} of ${progress.total} dossiers completed` : "Mapping source coverage..."}</small>
          </div>
        </section>
      )}

      {run.status === "failed" && (
        <div className="atlas-run-error" role="alert">
          <strong>The run stopped before completion.</strong>
          <span>{run.error_message}</span>
        </div>
      )}

      {candidates.length > 0 && run.mode === "department" && (
        <>
          <AdvisorDiscoveryFunnel
            candidates={candidates}
            summary={run.action_center?.discovery}
            compareIds={compareIds}
            refreshingCandidateId={refreshingCandidateId}
            onOpenCandidate={onOpenCandidate}
            onRefreshCandidate={onRefreshCandidate}
            onShortlist={onShortlist}
            onCompare={toggleCompare}
            onOpenComparison={() => setShowCompare(true)}
            onClearComparison={() => setCompareIds([])}
          />
        </>
      )}

      {candidates.length > 0 && run.mode === "professor" && (
        <AdvisorProfessorBrief
          candidate={candidates[0]}
          onOpen={() => onOpenCandidate(candidates[0].id)}
          onRefresh={() => onRefreshCandidate(candidates[0].id)}
          refreshing={refreshingCandidateId === candidates[0].id}
        />
      )}

      {run.status === "completed" && candidates.length === 0 && (
        <div className="atlas-empty-results"><h3>No professor profiles were verified.</h3><p>Add an official university or faculty URL, or try the Professor tab for one named person.</p></div>
      )}

      {showCompare && (
        <div className="atlas-compare-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowCompare(false)}>
          <section className="atlas-compare-panel" role="dialog" aria-modal="true" aria-label="Compare professors">
            <header><div><span className="atlas-eyebrow">Evidence comparison</span><h2>Compare advisor fit</h2></div><button className="atlas-icon-button" onClick={() => setShowCompare(false)} aria-label="Close comparison"><X size={20} /></button></header>
            <div className="atlas-compare-table">
              <div className="atlas-compare-row heading"><span>Dimension</span>{compared.map((candidate) => <strong key={candidate.id}>{candidate.display_name}</strong>)}</div>
              <CompareRow label="Research alignment" candidates={compared} value={(candidate) => `${candidate.match_score}%`} />
              <CompareRow label="Source confidence" candidates={compared} value={(candidate) => `${candidate.evidence_confidence}%`} />
              <CompareRow label="Recruitment" candidates={compared} value={(candidate) => candidate.recruitment_state.replace(/_/g, " ")} />
              <CompareRow label="Decision lane" candidates={compared} value={(candidate) => candidate.decision_lane} />
              <CompareRow label="Strong coverage" candidates={compared} value={(candidate) => `${Object.values(candidate.coverage || {}).filter((item) => item === "Strong").length} areas`} />
              <CompareRow label="Risk flags" candidates={compared} value={(candidate) => candidate.risk_flags?.map((item) => item.replace(/_/g, " ")).join(", ") || "None visible"} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, candidates, value }: { label: string; candidates: AdvisorCandidate[]; value: (candidate: AdvisorCandidate) => string }) {
  return <div className="atlas-compare-row"><span>{label}</span>{candidates.map((candidate) => <div key={candidate.id}>{value(candidate)}</div>)}</div>;
}
