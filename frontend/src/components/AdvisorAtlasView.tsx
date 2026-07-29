import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  History,
  Map,
  Plus,
  Trash2,
  Users,
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
import { AdvisorSavedProfessors } from "./advisor-atlas/AdvisorSavedProfessors";
import "./advisor-atlas/advisor-atlas.css";
import "./advisor-atlas/advisor-atlas-detail.css";
import "./advisor-atlas/advisor-atlas-intelligence.css";
import "./advisor-atlas/advisor-atlas-discovery.css";
import "./advisor-atlas/advisor-atlas-profile-sections.css";

type Props = {
  onToast: (message: string) => void;
  refreshTrigger?: number;
};

// SCHOLARDOCX-0186: fixed research-history cap, mirrors the backend's
// MAX_ADVISOR_ATLAS_RUNS constant (app/api/advisor_atlas.py). Not admin-
// configurable, so hardcoded here rather than fetched — same pattern the
// admin Info tab already uses for the other fixed per-user caps.
const MAX_HISTORY = 100;

export function AdvisorAtlasView({ onToast, refreshTrigger }: Props) {
  const { showConfirm } = useDialog();
  const { refreshUsage } = useUsage();
  const [runs, setRuns] = useState<AdvisorRun[]>([]);
  const [activeRun, setActiveRun] = useState<AdvisorRun | null>(null);
  const [showNewSearch, setShowNewSearch] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  // Set instead of `candidateId` when opening the frozen copy of a saved
  // professor whose originating search has been deleted.
  const [savedDossierId, setSavedDossierId] = useState<string | null>(null);
  const [refreshingCandidateId, setRefreshingCandidateId] = useState<string | null>(null);
  // "search" runs and inspects discoveries; "saved" is where the professors
  // kept out of those runs live. Two modes of the same feature — saving a
  // dossier led nowhere before, because the destination did not exist.
  const [mode, setMode] = useState<"search" | "saved">("search");
  // Bumped when a dossier is saved, so the saved list re-fetches on the way in
  // rather than showing a stale set.
  const [savedRefresh, setSavedRefresh] = useState(0);
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

  const selectRun = async (runId: string) => {
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

  const deleteRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Saved professors keep their own frozen dossier (SCHOLARDOCX-0197), so
    // deleting a search no longer takes them with it. Say so — the previous
    // wording implied everything went, which is what made deleting history
    // feel risky.
    const confirmed = await showConfirm(
      "Every professor discovered by this search is removed with it, and this cannot be undone. "
        + "Anyone you saved stays in Saved professors, with the dossier as it was when you saved them.",
      "Delete this search?",
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

  const refreshCandidate = async (id: string) => {
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

  const confirmSave = (candidate: AdvisorCandidateDetail) => {
    // The saved list is re-fetched on the way in, so a save made while
    // "Search" is showing is already there when the user switches over.
    setSavedRefresh((value) => value + 1);
    return showConfirm(
      "This adds them to your Saved professors, using the verified dossier fields. "
        + "Saved professors are what outreach, email drafts and applications link to.",
      `Save ${candidate.display_name}?`,
      "success",
    );
  };

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
          {mode === "search" && (
            <button className="atlas-new-search" onClick={() => setShowNewSearch(true)}>
              <Plus size={18} /> New search
            </button>
          )}
          {/* Same control the search form uses for its own two modes, reused
              rather than restyled. */}
          <div className="atlas-mode-toggle" role="tablist" aria-label="Advisor Atlas mode">
            <button
              role="tab"
              aria-selected={mode === "search"}
              className={mode === "search" ? "active" : ""}
              onClick={() => setMode("search")}
            >
              <Map size={15} /> Search
            </button>
            <button
              role="tab"
              aria-selected={mode === "saved"}
              className={mode === "saved" ? "active" : ""}
              onClick={() => {
                setMode("saved");
                setSavedRefresh((value) => value + 1);
              }}
            >
              <Users size={15} /> Saved professors
            </button>
          </div>
        </div>
      </header>

      {mode === "saved" ? (
        <AdvisorSavedProfessors
          refreshTrigger={savedRefresh}
          onToast={onToast}
          onOpenDossier={setCandidateId}
          onOpenSavedDossier={setSavedDossierId}
          onBackToSearch={() => setMode("search")}
        />
      ) : (
      <div className={`atlas-shell ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <aside className="atlas-history-panel">
          <div className="atlas-history-title">
            {isSidebarOpen ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <History size={17} />
                  <span>Research history</span>
                  <span className={`atlas-history-count${runs.length >= MAX_HISTORY ? " full" : ""}`}>
                    {runs.length}/{MAX_HISTORY}
                  </span>
                </div>
                <button 
                  type="button" 
                  className="atlas-sidebar-toggle"
                  onClick={() => setIsSidebarOpen(false)}
                  title="Collapse sidebar"
                >
                  <ChevronLeft size={17} />
                </button>
              </>
            ) : (
              <button 
                type="button" 
                className="atlas-sidebar-toggle"
                onClick={() => setIsSidebarOpen(true)}
                title="Expand research history"
              >
                <ChevronRight size={17} />
              </button>
            )}
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
                    <small>
                      {run.department || run.mode} · {run.candidate_count || 0} profiles
                      {run.shortlist_count ? ` · ${run.shortlist_count} shortlisted` : ""}
                    </small>
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
        </aside>

        <div className="atlas-main">
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
        </div>
      </div>
      )}

      {(candidateId != null || savedDossierId != null) && (
        <AdvisorDossierDrawer
          candidateId={candidateId}
          savedProfessorId={savedDossierId}
          onClose={() => {
            setCandidateId(null);
            setSavedDossierId(null);
          }}
          onChanged={async () => {
            // The dossier can be opened from either side, so a change has to
            // reach both: the run's candidate list and the saved library.
            // `reloadActive` no-ops when there is no active run, which is the
            // case when the dossier was opened from the library.
            await reloadActive();
            setSavedRefresh((value) => value + 1);
          }}
          onToast={onToast}
          onConfirmSave={confirmSave}
        />
      )}
    </div>
  );
}
