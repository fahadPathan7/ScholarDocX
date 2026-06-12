import { ReactNode, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  CircleStop,
  ClipboardList,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  X,
} from "lucide-react";
import { AdvisorCandidate, AdvisorRun } from "../../lib/advisorAtlasApi";
import { AdvisorCandidateCard } from "./AdvisorCandidateCard";

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

const laneOrder = [
  "Best Supported Matches",
  "High Potential",
  "Open or Funded Signals",
  "Explore Further",
  "Needs Verification",
  "Not Recommended",
];

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
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("fit");
  const candidates = run.candidates || [];
  const filtered = candidates.filter((candidate) => {
    const haystack = `${candidate.display_name} ${candidate.department} ${candidate.research_summary} ${candidate.decision_lane}`.toLowerCase();
    return haystack.includes(filter.toLowerCase());
  });
  const sorted = [...filtered].sort((left, right) => {
    if (sortBy === "evidence") return right.evidence_confidence - left.evidence_confidence;
    if (sortBy === "name") return left.display_name.localeCompare(right.display_name);
    return right.match_score - left.match_score;
  });
  const lanes = useMemo(
    () => laneOrder.map((lane) => ({
      lane,
      candidates: sorted.filter((candidate) => candidate.decision_lane === lane),
    })).filter((group) => group.candidates.length),
    [sorted],
  );
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

      {candidates.length > 0 && (
        <>
          <section className="atlas-result-toolbar">
            <label>
              <SearchCheck size={17} />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter professors, topics or lanes" />
            </label>
            <div>
              <span>{filtered.length} professors</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort professor results">
                <option value="fit">Highest fit</option>
                <option value="evidence">Strongest evidence</option>
                <option value="name">Professor name</option>
              </select>
              <button disabled={compareIds.length < 2} onClick={() => setShowCompare(true)}>
                <GitCompareArrows size={16} /> Compare {compareIds.length || ""}
              </button>
            </div>
          </section>

          <div className="atlas-decision-lanes">
            {lanes.map((group) => (
              <section key={group.lane} className="atlas-lane">
                <header>
                  <div><h3>{group.lane}</h3><p>{laneDescription(group.lane)}</p></div>
                  <span>{group.candidates.length}</span>
                </header>
                <div className="atlas-candidate-grid">
                  {group.candidates.map((candidate) => (
                    <AdvisorCandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      selected={compareIds.includes(candidate.id)}
                      refreshing={refreshingCandidateId === candidate.id}
                      onOpen={() => onOpenCandidate(candidate.id)}
                      onCompare={() => toggleCompare(candidate)}
                      onShortlist={() => onShortlist(candidate)}
                      onRefresh={() => onRefreshCandidate(candidate.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {run.status === "completed" && candidates.length === 0 && (
        <div className="atlas-empty-results"><SearchCheck size={34} /><h3>No professor profiles were verified.</h3><p>Try adding the official department directory URL or use a Focused Dossier.</p></div>
      )}

      {run.status === "completed" && Object.keys(run.action_center || {}).length > 0 && (
        <section className="atlas-action-center">
          <div className="atlas-action-heading"><ClipboardList size={22} /><div><span className="atlas-eyebrow">Student action center</span><h2>Turn the research into momentum.</h2></div></div>
          <div className="atlas-action-grid">
            <ActionList title="Matches & Open Positions" icon={<SearchCheck size={18} />} values={(run.action_center.matching_open || []).map((item: any) => `${item.name} · ${item.state.replace(/_/g, " ")}`)} />
            <ActionList title="Matches Interests" icon={<SearchCheck size={18} />} values={(run.action_center.matching_only || []).map((item: any) => `${item.name} · ${item.match_score}% fit`)} />
            <ActionList title="Read next" icon={<BookOpen size={18} />} values={run.action_center.reading_plan || []} />
            <ActionList title="Prepare" icon={<ClipboardList size={18} />} values={run.action_center.preparation_plan || []} />
          </div>
        </section>
      )}

      {showCompare && (
        <div className="atlas-compare-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowCompare(false)}>
          <section className="atlas-compare-panel" role="dialog" aria-modal="true" aria-label="Compare professors">
            <header><div><span className="atlas-eyebrow">Evidence comparison</span><h2>Compare advisor fit</h2></div><button className="atlas-icon-button" onClick={() => setShowCompare(false)}><X size={20} /></button></header>
            <div className="atlas-compare-table">
              <div className="atlas-compare-row heading"><span>Dimension</span>{compared.map((candidate) => <strong key={candidate.id}>{candidate.display_name}</strong>)}</div>
              <CompareRow label="Research fit" candidates={compared} value={(candidate) => `${candidate.match_score}%`} />
              <CompareRow label="Evidence confidence" candidates={compared} value={(candidate) => `${candidate.evidence_confidence}%`} />
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

function laneDescription(lane: string) {
  const descriptions: Record<string, string> = {
    "Best Supported Matches": "Strong fit supported by comparatively complete public evidence.",
    "High Potential": "Promising alignment with meaningful evidence still to verify.",
    "Open or Funded Signals": "Current recruitment or project signals deserve timely review.",
    "Explore Further": "Adjacent possibilities that may broaden the shortlist.",
    "Needs Verification": "Conflicting, thin or stale evidence requires manual checking.",
    "Not Recommended": "Material mismatch or insufficient relevance, with reasons preserved.",
  };
  return descriptions[lane] || "Evidence-backed candidate group.";
}

function ActionList({ title, icon, values }: { title: string; icon: ReactNode; values: string[] }) {
  return <div className="atlas-action-card"><h3>{icon}{title}</h3>{values.length ? <ol>{values.map((value, index) => <li key={index}>{value}</li>)}</ol> : <p>No urgent items.</p>}</div>;
}

function CompareRow({ label, candidates, value }: { label: string; candidates: AdvisorCandidate[]; value: (candidate: AdvisorCandidate) => string }) {
  return <div className="atlas-compare-row"><span>{label}</span>{candidates.map((candidate) => <div key={candidate.id}>{value(candidate)}</div>)}</div>;
}
