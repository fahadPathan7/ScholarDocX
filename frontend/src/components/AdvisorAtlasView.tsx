import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  Compass,
  History,
  Map,
  Plus,
  Trash2,
} from "lucide-react";
import { useDialog } from "./DialogProvider";
import { useUsage } from "../contexts/UsageContext";
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
import "./advisor-atlas/advisor-atlas-intelligence.css";
import "./advisor-atlas/advisor-atlas-discovery.css";
import "./advisor-atlas/advisor-atlas-profile-sections.css";

type Props = {
  onToast: (message: string) => void;
  refreshTrigger?: number;
};

export function AdvisorAtlasView({ onToast, refreshTrigger }: Props) {
  const { showConfirm } = useDialog();
  const { refreshUsage } = useUsage();
  const [runs, setRuns] = useState<AdvisorRun[]>([]);
  const [activeRun, setActiveRun] = useState<AdvisorRun | null>(null);
  const [showNewSearch, setShowNewSearch] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
    if (refreshTrigger && refreshTrigger > 0) {
      loadRuns();
      if (activeRun) {
        reloadActive();
      }
    }
  }, [refreshTrigger]);

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
      await refreshUsage();
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

  const deleteRun = async (runId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm(
      "Are you sure you want to delete this search? All discovered candidates will be removed. This cannot be undone.",
      "Delete search history?",
      "danger",
    );
    if (!confirmed) return;
    try {
      await advisorAtlasApi.deleteRun(runId);
      if (activeRun?.id === runId) {
        setActiveRun(null);
        setShowNewSearch(true);
      }
      await loadRuns();
      onToast("Search deleted.");
    } catch (error) {
      onToast((error as Error).message || "Could not delete search.");
    }
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
      await refreshUsage();
      onToast("Professor evidence refreshed.");
    } catch {
      onToast("Could not refresh that professor.");
    } finally {
      setRefreshingCandidateId(null);
    }
  };

  const confirmSave = (candidate: AdvisorCandidateDetail) =>
    showConfirm(
      "This creates or updates a professor record in your local ScholarDocX workspace using the verified dossier fields.",
      `Save ${candidate.display_name}?`,
      "success",
    );

  return (
    <div className="advisor-atlas-view">
      <header className="atlas-hero">
        <div className="atlas-hero-mark"><Map size={28} /></div>
        <div className="atlas-hero-titles">
          <h1>
            Advisor Atlas
            <span className="atlas-badge">Flagship intelligence</span>
          </h1>
          <p>Map the university. Find the fit. See the opportunity.</p>
        </div>
        <div className="atlas-hero-actions">
          <button className="atlas-new-search" onClick={() => setShowNewSearch(true)}>
            <Plus size={18} /> New search
          </button>
        </div>
      </header>

      <div className={`atlas-shell ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <aside className="atlas-history-panel">
          <div className="atlas-history-title">
            {isSidebarOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <History size={17} />
                <span>Research history</span>
              </div>
            )}
            <button 
              type="button" 
              className="atlas-sidebar-toggle"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronRight size={17} className={isSidebarOpen ? "rotated-180" : ""} />
            </button>
          </div>
          {loadingRuns ? (
            <div className="atlas-history-empty"><span className="atlas-spinner" /> Loading runs</div>
          ) : runs.length === 0 ? (
            <div className="atlas-history-empty"><Archive size={24} /><span>Your searches appear here.</span></div>
          ) : (
            <div className="atlas-run-list">
              {runs.map((run) => {
                const title = run.professor_name || run.university_name || "Advisor search";
                const initial = title.charAt(0).toUpperCase();
                return (
                <button
                  key={run.id}
                  className={activeRun?.id === run.id && !showNewSearch ? "active" : ""}
                  onClick={() => selectRun(run.id)}
                >
                  <div className="atlas-run-avatar">
                    {initial}
                    <span className={`atlas-run-status ${run.status}`} />
                  </div>
                  <div className="atlas-run-info">
                    <strong>{title}</strong>
                    <small>{run.department || run.mode} · {run.candidate_count || 0} profiles</small>
                  </div>
                  <div className="atlas-run-actions">
                    <div
                      className="atlas-run-delete"
                      onClick={(e) => deleteRun(run.id, e)}
                      aria-label="Delete run"
                      title="Delete this search"
                      role="button"
                      tabIndex={0}
                    >
                      <Trash2 size={15} />
                    </div>
                    <ChevronRight size={15} />
                  </div>
                </button>
                );
              })}
            </div>
          )}
          <div className="atlas-history-note">
            <Compass size={16} />
            <span>Results stay local.</span>
          </div>
        </aside>

        <main className="atlas-main">
          {showNewSearch || !activeRun ? (
            <AdvisorAtlasSearchForm
              submitting={submitting}
              onSubmit={createRun}
            />
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
