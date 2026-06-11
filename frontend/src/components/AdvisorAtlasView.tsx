import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  Compass,
  History,
  Map,
  Plus,
} from "lucide-react";
import { useDialog } from "./DialogProvider";
import {
  AdvisorCandidate,
  AdvisorCandidateDetail,
  AdvisorRun,
  CreateAdvisorRun,
  advisorAtlasApi,
} from "../lib/advisorAtlasApi";
import { AdvisorAtlasSearchForm } from "./advisor-atlas/AdvisorAtlasSearchForm";
import { AdvisorRunWorkspace } from "./advisor-atlas/AdvisorRunWorkspace";
import { AdvisorDossierDrawer } from "./advisor-atlas/AdvisorDossierDrawer";
import "./advisor-atlas/advisor-atlas.css";
import "./advisor-atlas/advisor-atlas-detail.css";

type Props = {
  onToast: (message: string) => void;
};

export function AdvisorAtlasView({ onToast }: Props) {
  const { showConfirm } = useDialog();
  const [runs, setRuns] = useState<AdvisorRun[]>([]);
  const [activeRun, setActiveRun] = useState<AdvisorRun | null>(null);
  const [showNewSearch, setShowNewSearch] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [refreshingCandidateId, setRefreshingCandidateId] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadRuns = async (selectLatest = false) => {
    try {
      const data = await advisorAtlasApi.listRuns();
      setRuns(data);
      if (selectLatest && data[0]) {
        await selectRun(data[0].id);
      }
    } catch {
      onToast("Could not load Advisor Atlas history.");
    } finally {
      setLoadingRuns(false);
    }
  };

  const selectRun = async (runId: number) => {
    try {
      const data = await advisorAtlasApi.getRun(runId);
      setActiveRun(data);
      setShowNewSearch(false);
    } catch {
      onToast("Could not load that Advisor Atlas run.");
    }
  };

  const reloadActive = async () => {
    if (!activeRun) return;
    const data = await advisorAtlasApi.getRun(activeRun.id);
    setActiveRun(data);
    await loadRuns();
  };

  useEffect(() => {
    loadRuns();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (!activeRun || !["queued", "running"].includes(activeRun.status)) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const data = await advisorAtlasApi.getRun(activeRun.id);
        setActiveRun(data);
        if (!["queued", "running"].includes(data.status)) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          await loadRuns();
          onToast(data.status === "completed" ? "Advisor Atlas completed." : "Advisor Atlas run stopped.");
        }
      } catch {
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    }, 2200);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [activeRun?.id, activeRun?.status]);

  const createRun = async (payload: CreateAdvisorRun) => {
    setSubmitting(true);
    try {
      const run = await advisorAtlasApi.createRun(payload);
      setActiveRun(run);
      setShowNewSearch(false);
      await loadRuns();
      onToast("Advisor Atlas started.");
    } catch (error) {
      onToast((error as Error).message || "Could not start Advisor Atlas.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!activeRun) return;
    const confirmed = await showConfirm(
      "Completed professor dossiers will be preserved. You can resume the run later.",
      "Stop this Advisor Atlas run?",
      "danger",
    );
    if (!confirmed) return;
    setActiveRun(await advisorAtlasApi.cancelRun(activeRun.id));
    await loadRuns();
  };

  const resume = async () => {
    if (!activeRun) return;
    setActiveRun(await advisorAtlasApi.resumeRun(activeRun.id));
    await loadRuns();
    onToast("Advisor Atlas resumed.");
  };

  const shortlist = async (candidate: AdvisorCandidate) => {
    const status = candidate.shortlist_status === "shortlisted" ? "unreviewed" : "shortlisted";
    await advisorAtlasApi.updateCandidate(candidate.id, { shortlist_status: status });
    await reloadActive();
    onToast(status === "shortlisted" ? "Professor shortlisted." : "Professor removed from shortlist.");
  };

  const refreshCandidate = async (id: number) => {
    setRefreshingCandidateId(id);
    try {
      await advisorAtlasApi.refreshCandidate(id);
      await reloadActive();
      onToast("Professor evidence refreshed.");
    } catch {
      onToast("Could not refresh that professor.");
    } finally {
      setRefreshingCandidateId(null);
    }
  };

  const confirmSave = (candidate: AdvisorCandidateDetail) =>
    showConfirm(
      "This creates or updates a professor record in your local ScholarDock workspace using the verified dossier fields.",
      `Save ${candidate.display_name}?`,
      "success",
    );

  return (
    <div className="advisor-atlas-view">
      <header className="atlas-hero">
        <div className="atlas-hero-mark"><Map size={28} /></div>
        <div>
          <span className="atlas-eyebrow">AI-powered supervisor intelligence</span>
          <h1>Advisor Atlas</h1>
          <p>Find and compare potential supervisors.</p>
        </div>
        <button className="atlas-new-search" onClick={() => setShowNewSearch(true)}>
          <Plus size={18} /> New search
        </button>
      </header>

      <div className="atlas-shell">
        <aside className="atlas-history-panel">
          <div className="atlas-history-title"><History size={17} /><span>Research history</span></div>
          {loadingRuns ? (
            <div className="atlas-history-empty"><span className="atlas-spinner" /> Loading runs</div>
          ) : runs.length === 0 ? (
            <div className="atlas-history-empty"><Archive size={24} /><span>Your searches appear here.</span></div>
          ) : (
            <div className="atlas-run-list">
              {runs.map((run) => (
                <button
                  key={run.id}
                  className={activeRun?.id === run.id && !showNewSearch ? "active" : ""}
                  onClick={() => selectRun(run.id)}
                >
                  <span className={`atlas-run-status ${run.status}`} />
                  <div>
                    <strong>{run.professor_name || run.university_name || "Advisor search"}</strong>
                    <small>{run.department || run.search_depth} · {run.candidate_count || 0} profiles</small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          )}
          <div className="atlas-history-note">
            <Compass size={16} />
            <span>Results stay local.</span>
          </div>
        </aside>

        <main className="atlas-main">
          {showNewSearch || !activeRun ? (
            <AdvisorAtlasSearchForm submitting={submitting} onSubmit={createRun} />
          ) : (
            <AdvisorRunWorkspace
              run={activeRun}
              refreshingCandidateId={refreshingCandidateId}
              onOpenCandidate={setCandidateId}
              onRefreshCandidate={refreshCandidate}
              onShortlist={shortlist}
              onCancel={cancel}
              onResume={resume}
              onReload={reloadActive}
            />
          )}
        </main>
      </div>

      {candidateId != null && (
        <AdvisorDossierDrawer
          candidateId={candidateId}
          onClose={() => setCandidateId(null)}
          onChanged={reloadActive}
          onToast={onToast}
          onConfirmSave={confirmSave}
        />
      )}
    </div>
  );
}
