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
  refreshingCandidateId: string | null;
  onOpenCandidate: (id: string) => void;
  onRefreshCandidate: (id: string) => void;
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
  const [compareIds, setCompareIds] = useState<string[]>([]);
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
            <header>
              <div>
                <span className="atlas-eyebrow">Evidence comparison</span>
                <h2>Who should you write to first?</h2>
              </div>
              <button className="atlas-icon-button" onClick={() => setShowCompare(false)} aria-label="Close comparison"><X size={20} /></button>
            </header>
            <div
              className="atlas-compare-table"
              style={{ ["--compare-columns" as string]: compared.length }}
            >
              <div className="atlas-compare-row heading">
                <span>Dimension</span>
                {compared.map((candidate) => (
                  <strong key={candidate.id}>
                    {candidate.display_name}
                    <small>{candidate.title || candidate.department}</small>
                  </strong>
                ))}
              </div>

              {/* Ordered as the decision is actually made: can they take you,
                  do they work on your thing, are they funded, are they active,
                  when could you start, and can you reach them. */}
              <CompareRow
                label="Can supervise"
                hint="A lab manager, emeritus or teaching-only rank cannot take a doctoral student."
                candidates={compared}
                render={(candidate) => {
                  const eligibility = candidate.intelligence?.advising_eligibility;
                  if (eligibility?.can_supervise === false) {
                    return <Flag tone="bad" label={eligibility.status === "ineligible" ? "No" : "Unclear"} note={eligibility.reason} />;
                  }
                  return <Flag tone="good" label="Yes" />;
                }}
              />
              <CompareRow
                label="Your interests they match"
                hint="Which of your stated research interests have a defensible bridge to their work."
                candidates={compared}
                render={(candidate) => {
                  const matched = candidate.intelligence?.matched_interests || [];
                  if (!matched.length) return <span className="atlas-compare-empty">No interest overlap found</span>;
                  return (
                    <div className="atlas-compare-tags">
                      {matched.slice(0, 4).map((interest) => <span key={interest}>{interest}</span>)}
                    </div>
                  );
                }}
              />
              <CompareRow
                label="Research alignment"
                candidates={compared}
                render={(candidate) => <Meter value={candidate.match_score} />}
              />
              <CompareRow
                label="Funding"
                hint="Documented grants. Funding never proves an opening, but its absence usually rules one out."
                candidates={compared}
                render={(candidate) => {
                  const items = candidate.intelligence?.funding?.items || [];
                  if (!items.length) return <span className="atlas-compare-empty">None documented</span>;
                  const latest = items[0] || {};
                  return (
                    <div>
                      <strong>{items.length} recorded</strong>
                      {(latest.funder || latest.project) && (
                        <small>{[latest.funder, latest.period].filter(Boolean).join(" · ")}</small>
                      )}
                    </div>
                  );
                }}
              />
              <CompareRow
                label="Publishing activity"
                hint="From the scholarly index — whether the lab is publishing right now."
                candidates={compared}
                render={(candidate) => {
                  const record = candidate.intelligence?.scholarly_record;
                  if (!record) return <span className="atlas-compare-empty">Not resolved</span>;
                  const cadence = record.publication_cadence || [];
                  const recent = cadence.slice(0, 3);
                  return (
                    <div>
                      <strong>
                        {typeof record.h_index === "number" ? `h-index ${record.h_index}` : "Indexed"}
                      </strong>
                      {!!recent.length && (
                        <small>{recent.map((entry: any) => `${entry.year}: ${entry.works ?? 0}`).join(" · ")}</small>
                      )}
                    </div>
                  );
                }}
              />
              <CompareRow
                label="Next likely intake"
                hint="Forecast semesters, shown with the confidence behind the forecast."
                candidates={compared}
                render={(candidate) => {
                  const outlook = candidate.intelligence?.opportunity_outlook;
                  const semesters = outlook?.likely_semesters || [];
                  return (
                    <div>
                      <strong>{candidate.recruitment_state.replace(/_/g, " ")}</strong>
                      {!!semesters.length && <small>{semesters.slice(0, 2).join(", ")}</small>}
                      {typeof outlook?.confidence === "number" && (
                        <small>{outlook.confidence}% confidence</small>
                      )}
                    </div>
                  );
                }}
              />
              <CompareRow
                label="Contact readiness"
                hint="Whether you have a verified address and profile to write from."
                candidates={compared}
                render={(candidate) => {
                  const email = candidate.email || candidate.intelligence?.contact?.email;
                  if (!email) return <Flag tone="warn" label="No verified address" />;
                  return (
                    <div>
                      <a href={`mailto:${email}`}>{email}</a>
                      {candidate.official_profile_url && (
                        <small><a href={candidate.official_profile_url} target="_blank" rel="noreferrer">Official profile</a></small>
                      )}
                    </div>
                  );
                }}
              />
              <CompareRow
                label="Evidence behind this"
                hint="How many independent public sources actually name this professor."
                candidates={compared}
                render={(candidate) => {
                  const basis = candidate.intelligence?.evidence_basis;
                  const naming = basis?.naming_sources;
                  return (
                    <div>
                      <strong>{candidate.evidence_confidence}% confidence</strong>
                      {typeof naming === "number" && (
                        <small>{naming} source{naming === 1 ? "" : "s"} name them</small>
                      )}
                    </div>
                  );
                }}
              />
              <CompareRow
                label="Watch out for"
                candidates={compared}
                render={(candidate) => {
                  const flags = candidate.risk_flags || [];
                  if (!flags.length) return <span className="atlas-compare-empty">Nothing flagged</span>;
                  return (
                    <ul className="atlas-compare-risks">
                      {flags.slice(0, 3).map((flag) => <li key={flag}>{flag.replace(/_/g, " ")}</li>)}
                    </ul>
                  );
                }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CompareRow({
  label,
  hint,
  candidates,
  render,
}: {
  label: string;
  hint?: string;
  candidates: AdvisorCandidate[];
  render: (candidate: AdvisorCandidate) => React.ReactNode;
}) {
  return (
    <div className="atlas-compare-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {candidates.map((candidate) => <div key={candidate.id}>{render(candidate)}</div>)}
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="atlas-compare-meter">
      <strong>{value}%</strong>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Flag({ tone, label, note }: { tone: "good" | "warn" | "bad"; label: string; note?: string }) {
  return (
    <div className={`atlas-compare-flag ${tone}`}>
      <strong>{label}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
