import React, { useEffect, useRef, useState } from "react";
import { Loader2, Lock, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import {
  DeepHuntRun,
  scholarshipDeepHuntApi,
} from "../../lib/scholarshipDeepHuntApi";
import { ScholarshipOpportunity } from "../../lib/scholarshipOpportunitiesApi";
import { HuntProfile } from "../../lib/huntProfile";
import { OpportunityCard } from "./OpportunityCard";
import "./deep-hunt.css";

const POLL_INTERVAL_MS = 3000;
const IN_FLIGHT_STATUSES: DeepHuntRun["status"][] = ["queued", "running"];

interface DeepHuntViewProps {
  onToast: (msg: string) => void;
  onAddToTracker: (opportunity: ScholarshipOpportunity) => void;
  huntProfile?: HuntProfile | null;
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

export function DeepHuntView({ onToast, onAddToTracker, huntProfile, canUseDeepHunt }: DeepHuntViewProps) {
  const [runs, setRuns] = useState<DeepHuntRun[]>([]);
  const [activeRun, setActiveRun] = useState<DeepHuntRun | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [goal, setGoal] = useState("");
  const [degreeLevel, setDegreeLevel] = useState(huntProfile?.degree_level || "");
  const [destinationsText, setDestinationsText] = useState((huntProfile?.destinations || []).join(", "));
  const [intakeTerm, setIntakeTerm] = useState(huntProfile?.intake_term || "");
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
    } catch (error) {
      onToast("Failed to load that Deep Hunt run.");
    }
  };

  const handleCreate = async () => {
    if (!goal.trim()) {
      onToast("Enter a funding goal to start a Deep Hunt run.");
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
      });
      setRuns((prev) => [created, ...prev]);
      setActiveRun(created);
      setGoal("");
      onToast("Deep Hunt run started.");
    } catch (error: any) {
      onToast(error?.message || "Failed to start Deep Hunt run.");
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

  return (
    <div className="deep-hunt-view">
      {!canUseDeepHunt && (
        <div className="deep-hunt-locked">
          <Lock size={18} />
          <div>
            <strong>Deep Hunt is available on the Pro and Max plans.</strong>
            <p>
              Upgrade to run multi-pass scholarship research that searches, crawls, and extracts several
              evidence-backed opportunities for one funding goal. Ask an admin to upgrade your plan, or
              open Profile &rarr; Plans.
            </p>
          </div>
        </div>
      )}

      {canUseDeepHunt && (
        <div className="deep-hunt-launcher">
          <div className="deep-hunt-launcher-header">
            <Sparkles size={16} />
            <span>Start a Deep Hunt run</span>
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
          </div>
          <button
            type="button"
            className="button-primary"
            onClick={handleCreate}
            disabled={isCreating || !goal.trim()}
          >
            {isCreating ? <Loader2 className="icon-spin" size={16} /> : <Sparkles size={16} />}
            <span>Start Deep Hunt</span>
          </button>
        </div>
      )}

      <div className="deep-hunt-body">
        <div className="deep-hunt-run-list">
          {isLoadingRuns ? (
            <div className="news-loading">
              <Loader2 className="icon-spin" size={20} />
              <span>Loading runs...</span>
            </div>
          ) : runs.length === 0 ? (
            <div className="news-empty-state">
              <p>No Deep Hunt runs yet.</p>
            </div>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className={`deep-hunt-run-row status-${run.status} ${activeRun?.id === run.id ? "active" : ""}`}
                onClick={() => openRun(run)}
              >
                <div className="deep-hunt-run-row-main">
                  <span className="deep-hunt-run-goal">{run.goal}</span>
                  <span className={`deep-hunt-status-badge status-${run.status}`}>{run.status}</span>
                </div>
                <div className="deep-hunt-run-row-meta">
                  <span>{run.result_count} found</span>
                  <span>{new Date(run.created_at).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title="Delete run"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(run);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

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
              {(activeRun.opportunities || []).length === 0 ? (
                <p className="news-empty-subtext">
                  {activeRun.status === "completed"
                    ? "No opportunities matched this goal well enough to keep."
                    : "Results will appear here as they're found."}
                </p>
              ) : (
                activeRun.opportunities!.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    onAddToTracker={onAddToTracker}
                    huntProfile={huntProfile}
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
