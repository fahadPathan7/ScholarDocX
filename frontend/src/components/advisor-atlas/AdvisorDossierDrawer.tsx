import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpenCheck,
  Check,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  AdvisorCandidateDetail,
  advisorAtlasApi,
} from "../../lib/advisorAtlasApi";

type Props = {
  candidateId: number;
  onClose: () => void;
  onChanged: () => void;
  onToast: (message: string) => void;
  onConfirmSave: (candidate: AdvisorCandidateDetail) => Promise<boolean>;
};

function ValueBlock({ value }: { value: any }) {
  if (value == null || value === "") return <span className="atlas-muted">Not verified</span>;
  if (Array.isArray(value)) {
    return value.length ? (
      <ul>{value.map((item, index) => <li key={index}>{typeof item === "object" ? item.label || JSON.stringify(item) : String(item)}</li>)}</ul>
    ) : <span className="atlas-muted">No verified items</span>;
  }
  if (typeof value === "object") {
    return (
      <dl className="atlas-detail-list">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd><ValueBlock value={item} /></dd></div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

export function AdvisorDossierDrawer({
  candidateId,
  onClose,
  onChanged,
  onToast,
  onConfirmSave,
}: Props) {
  const [candidate, setCandidate] = useState<AdvisorCandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await advisorAtlasApi.getCandidate(candidateId);
      setCandidate(data);
      setNotes(data.user_notes || "");
    } catch {
      onToast("Could not load the advisor dossier.");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [candidateId]);

  const saveNotes = async () => {
    if (!candidate) return;
    setWorking("notes");
    try {
      const data = await advisorAtlasApi.updateCandidate(candidate.id, { user_notes: notes });
      setCandidate(data);
      onChanged();
      onToast("Advisor notes saved.");
    } finally {
      setWorking("");
    }
  };

  const updateReading = async (publicationId: number, readingStatus: string) => {
    if (!candidate) return;
    setWorking(`paper-${publicationId}`);
    try {
      const data = await advisorAtlasApi.updatePublication(candidate.id, publicationId, { reading_status: readingStatus });
      setCandidate(data);
      onChanged();
    } finally {
      setWorking("");
    }
  };

  const refresh = async () => {
    if (!candidate) return;
    setWorking("refresh");
    try {
      const data = await advisorAtlasApi.refreshCandidate(candidate.id);
      setCandidate(data);
      onChanged();
      onToast("Public evidence refreshed.");
    } catch {
      onToast("The refresh could not be completed.");
    } finally {
      setWorking("");
    }
  };

  const saveProfessor = async () => {
    if (!candidate || !(await onConfirmSave(candidate))) return;
    setWorking("save");
    try {
      await advisorAtlasApi.saveCandidate(candidate.id);
      await load();
      onChanged();
      onToast("Professor saved to ScholarDock.");
    } finally {
      setWorking("");
    }
  };

  return (
    <div className="atlas-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="atlas-dossier-drawer" role="dialog" aria-modal="true" aria-label="Advisor dossier">
        <header>
          <div>
            <span className="atlas-eyebrow">Advisor dossier</span>
            <h2>{candidate?.display_name || "Loading dossier"}</h2>
            <p>{candidate ? [candidate.title, candidate.department, candidate.institution].filter(Boolean).join(" · ") : "Reading local evidence..."}</p>
          </div>
          <button className="atlas-icon-button" onClick={onClose} aria-label="Close dossier"><X size={20} /></button>
        </header>

        {loading || !candidate ? (
          <div className="atlas-dossier-loading"><span className="atlas-spinner" /> Building the evidence view...</div>
        ) : (
          <>
            <div className="atlas-dossier-actions">
              <button onClick={refresh} disabled={!!working}><RefreshCw size={16} className={working === "refresh" ? "atlas-spin" : ""} /> Refresh evidence</button>
              <button onClick={saveProfessor} disabled={!!working || !!candidate.saved_professor_id}>
                {candidate.saved_professor_id ? <Check size={16} /> : <Save size={16} />}
                {candidate.saved_professor_id ? "Saved to professors" : "Save to professors"}
              </button>
              {candidate.official_profile_url && <a href={candidate.official_profile_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Official profile</a>}
              {candidate.linkedin_url && <a href={candidate.linkedin_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> LinkedIn</a>}
              {candidate.google_scholar_url && <a href={candidate.google_scholar_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Google Scholar</a>}
            </div>

            <section className="atlas-decision-snapshot">
              <div><span>Research fit</span><strong>{candidate.match_score}%</strong></div>
              <div><span>Evidence confidence</span><strong>{candidate.evidence_confidence}%</strong></div>
              <div><span>Decision lane</span><strong>{candidate.decision_lane}</strong></div>
              <div><span>Recruitment</span><strong>{candidate.recruitment_state.replace(/_/g, " ")}</strong></div>
            </section>

            <section className="atlas-dossier-section">
              <h3><ClipboardCheck size={18} /> Decision snapshot</h3>
              <ValueBlock value={candidate.dossier?.decision_snapshot} />
            </section>

            <section className="atlas-dossier-section">
              <h3><FileSearch size={18} /> Research and method bridge</h3>
              <div className="atlas-two-column">
                <ValueBlock value={candidate.dossier?.research_bridge} />
                <ValueBlock value={candidate.dossier?.method_bridge} />
              </div>
            </section>

            <section className="atlas-dossier-section">
              <h3><ShieldCheck size={18} /> Evidence coverage</h3>
              <div className="atlas-coverage-grid">
                {Object.entries(candidate.coverage || {}).map(([area, status]) => (
                  <div key={area}><span>{area}</span><strong className={`coverage-${status.toLowerCase()}`}>{status}</strong></div>
                ))}
              </div>
            </section>

            <section className="atlas-dossier-section">
              <h3><BookOpenCheck size={18} /> Paper bridge</h3>
              {candidate.publications.length ? candidate.publications.map((paper) => (
                <article className="atlas-paper" key={paper.id}>
                  <div className="atlas-paper-priority">{paper.reading_priority || "·"}</div>
                  <div>
                    <h4>{paper.title}</h4>
                    <p>{[paper.publication_year, paper.venue].filter(Boolean).join(" · ") || "Publication details not fully verified"}</p>
                    <small>{paper.relevance_reason}</small>
                    <div className="atlas-paper-actions">
                      <select
                        value={paper.reading_status}
                        disabled={working === `paper-${paper.id}`}
                        onChange={(event) => updateReading(paper.id, event.target.value)}
                        aria-label={`Reading status for ${paper.title}`}
                      >
                        <option value="unread">Unread</option>
                        <option value="read_next">Read next</option>
                        <option value="reading">Reading</option>
                        <option value="read">Read</option>
                      </select>
                      {paper.source_url && <a href={paper.source_url} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={14} /></a>}
                    </div>
                  </div>
                </article>
              )) : <p className="atlas-muted">No publication list could be verified from accessible sources.</p>}
            </section>

            <section className="atlas-dossier-section">
              <h3>Lab, trajectory and application fit</h3>
              <div className="atlas-three-column">
                <ValueBlock value={candidate.dossier?.lab_environment} />
                <ValueBlock value={candidate.dossier?.trajectory} />
                <ValueBlock value={candidate.dossier?.application_fit} />
              </div>
            </section>

            <section className="atlas-dossier-section">
              <h3>Verification questions</h3>
              <ValueBlock value={candidate.dossier?.verification_questions} />
            </section>

            <section className="atlas-dossier-section">
              <h3>Next-action plan</h3>
              <ValueBlock value={candidate.dossier?.next_actions} />
            </section>

            {candidate.watch_events.length > 0 && (
              <section className="atlas-dossier-section">
                <h3>What changed</h3>
                <ul>
                  {candidate.watch_events.map((event) => (
                    <li key={event.id}>{String(event.event_type).replace(/_/g, " ")} · {event.detected_at}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="atlas-dossier-section">
              <h3>Evidence ledger</h3>
              <div className="atlas-evidence-list">
                {candidate.evidence.map((evidence) => (
                  <a href={evidence.source_url} target="_blank" rel="noreferrer" key={evidence.id}>
                    <span><strong>{evidence.page_title || new URL(evidence.source_url).hostname}</strong><small>{evidence.source_type} · confidence {evidence.confidence}%</small></span>
                    <ArrowUpRight size={16} />
                    <p>{evidence.evidence_excerpt || evidence.claim_text}</p>
                  </a>
                ))}
              </div>
            </section>

            <section className="atlas-dossier-section">
              <h3>My notes</h3>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Record outreach ideas, questions or decisions..." />
              <button className="atlas-primary-button compact" onClick={saveNotes} disabled={working === "notes"}>
                <Save size={16} /> Save notes
              </button>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
