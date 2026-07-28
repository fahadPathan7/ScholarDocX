import React, { useEffect, useRef, useState } from "react";
import { Clock, Loader2, Lock, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import {
  DeepHuntRun,
  DeepHuntResult,
  scholarshipDeepHuntApi,
  formatCostEstimate,
  shouldShowFunnel,
} from "../../lib/scholarshipDeepHuntApi";
import { DeepHuntResultCard } from "./DeepHuntResultCard";
import { Modal } from "../Modal";
import "./deep-hunt.css";

const POLL_INTERVAL_MS = 3000;
const IN_FLIGHT_STATUSES: DeepHuntRun["status"][] = ["queued", "running"];

interface DeepHuntViewProps {
  onToast: (msg: string) => void;
  canUseDeepHunt: boolean;
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: "Queued",
    planning: "Planning search passes",
    searching: "Searching",
    crawling: "Inspecting pages",
    extracting: "Extracting structured details",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return labels[stage] || stage;
}

export function DeepHuntView({ onToast, canUseDeepHunt }: DeepHuntViewProps) {
  const [runs, setRuns] = useState<DeepHuntRun[]>([]);
  const [activeRun, setActiveRun] = useState<DeepHuntRun | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [degreeLevel, setDegreeLevel] = useState("");
  const [destinationsText, setDestinationsText] = useState("");
  const [intakeTerm, setIntakeTerm] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  // Cost estimate from the most recent create response; shown before submit
  // as a static ceiling and refreshed when a run starts.
  const [costEstimate, setCostEstimate] = useState<{ max_sources: number; max_credits: number } | null>(null);
  // Guards a result's "Save to Library" button against duplicate clicks;
  // holds the normalized_url currently being saved, or null.
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadRuns = async () => {
    setIsLoadingRuns(true);
    try {
      const data = await scholarshipDeepHuntApi.listRuns();
      setRuns(data);
    } catch (error) {
      onToast("Failed to load Deep Hunt runs.");
    } finally {
      setIsLoadingRuns(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!activeRun || !IN_FLIGHT_STATUSES.includes(activeRun.status)) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const data = await scholarshipDeepHuntApi.getRun(activeRun.id);
        setActiveRun(data);
        setRuns((prev) => prev.map((r) => (r.id === data.id ? { ...r, ...data } : r)));
        if (!IN_FLIGHT_STATUSES.includes(data.status) && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (error) {
        // transient poll failure; try again on the next tick
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id, activeRun?.status]);

  const openRun = async (run: DeepHuntRun) => {
    try {
      const data = await scholarshipDeepHuntApi.getRun(run.id);
      setActiveRun(data);
      setHistoryModalOpen(false);
    } catch (error) {
      onToast("Failed to load that Deep Hunt run.");
    }
  };

  const handleCreate = async () => {
    if (!goal.trim()) {
      onToast("Enter a funding goal to start a search.");
      return;
    }
    setIsCreating(true);
    try {
      const destinations = destinationsText
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      const created = await scholarshipDeepHuntApi.createRun({
        goal: goal.trim(),
        degree_level: degreeLevel.trim() || undefined,
        destinations,
        intake_term: intakeTerm.trim() || undefined,
        field_of_study: fieldOfStudy.trim() || undefined,
      });
      if (created.cost_estimate) setCostEstimate(created.cost_estimate);
      // SCHOLARDOCX-0178: the backend FIFO-evicts past MAX_STORED_RUNS (10);
      // mirror that here so the history list doesn't show a stale 11th run
      // until the next reload.
      setRuns((prev) => [created, ...prev].slice(0, 10));
      setActiveRun(created);
      setGoal("");
      onToast("Search started.");
    } catch (error: any) {
      onToast(error?.message || "Failed to start search.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = async (run: DeepHuntRun) => {
    try {
      const updated = await scholarshipDeepHuntApi.cancelRun(run.id);
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      if (activeRun?.id === updated.id) setActiveRun((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (error) {
      onToast("Failed to cancel run.");
    }
  };

  const handleResume = async (run: DeepHuntRun) => {
    try {
      const updated = await scholarshipDeepHuntApi.resumeRun(run.id);
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      if (activeRun?.id === updated.id) setActiveRun((prev) => (prev ? { ...prev, ...updated } : prev));
      onToast("Deep Hunt run resumed.");
    } catch (error: any) {
      onToast(error?.message || "Failed to resume run.");
    }
  };

  const handleDelete = async (run: DeepHuntRun) => {
    try {
      await scholarshipDeepHuntApi.deleteRun(run.id);
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
      if (activeRun?.id === run.id) setActiveRun(null);
    } catch (error) {
      onToast("Failed to delete run.");
    }
  };

  // Explicit save (SCHOLARDOCX-0178): a Search result is only persisted to
  // the Opportunity Library when the user picks it, not automatically.
  const handleSaveResult = async (result: DeepHuntResult) => {
    if (!activeRun || savingUrl) return;
    setSavingUrl(result.normalized_url);
    try {
      const saved = await scholarshipDeepHuntApi.saveResult(activeRun.id, result.normalized_url);
      setActiveRun((prev) =>
        prev
          ? {
              ...prev,
              results: (prev.results || []).map((r) =>
                r.normalized_url === result.normalized_url
                  ? { ...r, in_library: true, opportunity_id: saved.id }
                  : r
              ),
            }
          : prev
      );
      onToast("Saved to Library.");
    } catch (error: any) {
      onToast(error?.message || "Failed to save to Library.");
    } finally {
      setSavingUrl(null);
    }
  };

  return (
    <div className="deep-hunt-view">
      {!canUseDeepHunt && (
        <div className="deep-hunt-locked">
          <Lock size={18} />
          <div>
            <strong>Your account doesn&rsquo;t have access to Scholarship Hunt.</strong>
            <p>
              Scholarship Hunt runs multi-pass research that searches, vets, and extracts several
              evidence-backed opportunities for one funding goal. Access is controlled by your
              workspace&rsquo;s role limits &mdash; ask an admin to enable it, or check your options in
              Profile &rarr; Plans.
            </p>
          </div>
        </div>
      )}

      {canUseDeepHunt && (
        <div className="deep-hunt-launcher">
          <div className="deep-hunt-launcher-header">
            <div className="deep-hunt-launcher-title">
              <Sparkles size={16} />
              <span>Search for funding</span>
            </div>
            {!isLoadingRuns && runs.length > 0 && (
              <button
                type="button"
                className="deep-hunt-history-btn"
                onClick={() => setHistoryModalOpen(true)}
                title="View previous searches"
              >
                <Clock size={13} />
                <span>Previous Searches</span>
                <span className="deep-hunt-history-count">{runs.length}</span>
              </button>
            )}
          </div>
          <textarea
            className="deep-hunt-goal-input"
            placeholder='Describe the funding goal, e.g. "fully funded CS PhD funding, EU, Fall 2027"'
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <div className="deep-hunt-launcher-facets">
            <input
              type="text"
              placeholder="Degree level (optional)"
              value={degreeLevel}
              onChange={(e) => setDegreeLevel(e.target.value)}
            />
            <input
              type="text"
              placeholder="Destinations, comma separated (optional)"
              value={destinationsText}
              onChange={(e) => setDestinationsText(e.target.value)}
            />
            <input
              type="text"
              placeholder="Intake term (optional)"
              value={intakeTerm}
              onChange={(e) => setIntakeTerm(e.target.value)}
            />
            <input
              type="text"
              placeholder="Field of study (optional)"
              value={fieldOfStudy}
              onChange={(e) => setFieldOfStudy(e.target.value)}
            />
          </div>
          {/* SCHOLARDOCX-0175: transparent cost ceiling before submit. Actual
              charges scale with sources scanned, so this is the worst case. */}
          <p className="deep-hunt-cost-estimate">{formatCostEstimate(costEstimate)}</p>
          <button
            type="button"
            className="button-primary"
            onClick={handleCreate}
            disabled={isCreating || !goal.trim()}
          >
            {isCreating ? <Loader2 className="icon-spin" size={16} /> : <Sparkles size={16} />}
            <span>Search</span>
          </button>
        </div>
      )}

      {/* Previous Searches Modal */}
      {historyModalOpen && (
        <Modal onClose={() => setHistoryModalOpen(false)} compact>
          <div className="deep-hunt-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="deep-hunt-history-modal-header">
              <div className="deep-hunt-history-modal-title">
                <Clock size={16} />
                <span>Previous Searches</span>
                <span className="deep-hunt-history-count">{runs.length}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setHistoryModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="deep-hunt-history-modal-list">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className={`deep-hunt-run-row status-${run.status} ${activeRun?.id === run.id ? "active" : ""}`}
                  onClick={() => openRun(run)}
                >
                  <div className="deep-hunt-run-row-main">
                    <span className="deep-hunt-run-goal" data-tooltip={run.goal}>{run.goal}</span>
                    <div className="deep-hunt-run-row-actions">
                      <span className={`deep-hunt-status-badge status-${run.status}`}>{run.status}</span>
                      <button
                        type="button"
                        className="deep-hunt-delete-btn"
                        title="Delete run"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(run);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="deep-hunt-run-row-meta">
                    <span>{run.result_count} found</span>
                    <span>{new Date(run.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      <div className="deep-hunt-body">
        {activeRun && (
          <div className="deep-hunt-detail">
            <div className="deep-hunt-detail-header">
              <div>
                <h4>{activeRun.goal}</h4>
                <span className="deep-hunt-stage">{stageLabel(activeRun.current_stage)}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setActiveRun(null)}>
                <X size={16} />
              </button>
            </div>

            {IN_FLIGHT_STATUSES.includes(activeRun.status) && (
              <div className="deep-hunt-progress">
                <Loader2 className="icon-spin" size={16} />
                <span>{activeRun.progress?.message || "Working..."}</span>
                {canUseDeepHunt && (
                  <button type="button" className="button-secondary" onClick={() => handleCancel(activeRun)}>
                    Cancel
                  </button>
                )}
              </div>
            )}

            {/* SCHOLARDOCX-0175: live funnel counters so the user sees noise
                being filtered out and opportunities being vetted in real time. */}
            {IN_FLIGHT_STATUSES.includes(activeRun.status) && shouldShowFunnel(activeRun.progress) && (
              <div className="deep-hunt-funnel" aria-live="polite">
                <span className="deep-hunt-funnel-step">
                  <strong>{activeRun.progress?.sources_scanned ?? 0}</strong> scanned
                </span>
                <span className="deep-hunt-funnel-arrow">&rarr;</span>
                <span className="deep-hunt-funnel-step">
                  <strong>{activeRun.progress?.sources_filtered ?? 0}</strong> on-target
                </span>
                <span className="deep-hunt-funnel-arrow">&rarr;</span>
                <span className="deep-hunt-funnel-step">
                  <strong>{activeRun.progress?.opportunities_extracted ?? 0}</strong> opportunities
                </span>
              </div>
            )}

            {activeRun.status === "failed" && (
              <div className="deep-hunt-error">
                <span>{activeRun.error_message || "The run stopped before completion."}</span>
                {canUseDeepHunt && (
                  <button type="button" className="button-secondary" onClick={() => handleResume(activeRun)}>
                    <RefreshCw size={14} />
                    <span>Resume</span>
                  </button>
                )}
              </div>
            )}

            {activeRun.status === "cancelled" && canUseDeepHunt && (
              <div className="deep-hunt-error">
                <span>This run was cancelled.</span>
                <button type="button" className="button-secondary" onClick={() => handleResume(activeRun)}>
                  <RefreshCw size={14} />
                  <span>Resume</span>
                </button>
              </div>
            )}

            <div className="deep-hunt-results">
              {(activeRun.results || []).length === 0 ? (
                <p className="news-empty-subtext">
                  {activeRun.status === "completed"
                    ? "No opportunities matched this goal well enough to keep."
                    : "Results will appear here as they're found."}
                </p>
              ) : (
                activeRun.results!.map((result) => (
                  <DeepHuntResultCard
                    key={result.normalized_url}
                    result={result}
                    onSave={handleSaveResult}
                    isSaving={savingUrl === result.normalized_url}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
