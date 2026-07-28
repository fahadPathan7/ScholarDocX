import React, { useEffect, useState } from "react";
import { Loader2, RadioTower, Trash2 } from "lucide-react";
import {
  ScholarshipOpportunity,
  deleteScholarshipOpportunity,
  listScholarshipOpportunities,
  updateScholarshipOpportunity,
} from "../../lib/scholarshipOpportunitiesApi";
import { notify } from "../../lib/api";
import { OpportunityCard, DEADLINE_RADAR_THRESHOLD_DAYS, deadlineTone, nearestDeadlineOf } from "./OpportunityCard";

const STATUS_OPTIONS: ScholarshipOpportunity["status"][] = [
  "Found",
  "Vetting",
  "Applying",
  "Submitted",
  "Result",
];

interface OpportunityLibraryProps {
  onToast: (msg: string) => void;
  onAddToTracker: (opportunity: ScholarshipOpportunity) => void;
  refreshTrigger?: number;
}

function nearestDeadlineDate(opportunity: ScholarshipOpportunity): string {
  const dates = opportunity.deadlines.map((d) => d.date).filter(Boolean).sort();
  return dates[0] || "9999-12-31";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isWithinRadarThreshold(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  return days >= 0 && days <= DEADLINE_RADAR_THRESHOLD_DAYS;
}

// Module-level (not component state) so it survives the Library tab
// unmounting/remounting and React StrictMode's double-invoked effects in
// dev — both of which can otherwise race two scans past the server-side
// last_deadline_notified_at check before either write lands, double-firing
// the notification. This is a same-session guard; the server-side
// day-granularity check remains the source of truth across page reloads.
const notifiedThisSession = new Set<string>();

export function OpportunityLibrary({ onToast, onAddToTracker, refreshTrigger }: OpportunityLibraryProps) {
  const [opportunities, setOpportunities] = useState<ScholarshipOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await listScholarshipOpportunities();
      data.sort((a, b) => nearestDeadlineDate(a).localeCompare(nearestDeadlineDate(b)));
      setOpportunities(data);
      await scanDeadlineRadar(data);
    } catch (error) {
      onToast("Failed to load your Opportunity Library.");
    } finally {
      setIsLoading(false);
    }
  };

  // Deadline radar (FR-8.42): client-side on-load scan, deduped by
  // last_deadline_notified_at so reloading the tab doesn't re-notify the
  // same opportunity the same day. No cron/background job exists in this
  // codebase, so this scan is the mechanism (see SCHOLARDOCX-0124 notes).
  const scanDeadlineRadar = async (data: ScholarshipOpportunity[]) => {
    const today = todayKey();
    for (const opportunity of data) {
      if (!opportunity.linked_sheet_id) continue;
      if (opportunity.last_deadline_notified_at?.slice(0, 10) === today) continue;
      const nearest = nearestDeadlineOf(opportunity);
      if (!nearest || !isWithinRadarThreshold(nearest.date)) continue;
      // Claim synchronously before the first await so a second near-simultaneous
      // scan (React StrictMode's double effect invocation, or a fast tab
      // switch) can't both pass the check before either write lands.
      if (notifiedThisSession.has(opportunity.id)) continue;
      notifiedThisSession.add(opportunity.id);
      try {
        await notify("scholarship_deadline_approaching", {
          scholarshipName: opportunity.canonical_name,
          dueAt: nearest.date,
        });
        await updateScholarshipOpportunity(opportunity.id, {
          last_deadline_notified_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to notify/dedupe deadline radar for", opportunity.id, error);
        notifiedThisSession.delete(opportunity.id);
      }
    }
  };

  useEffect(() => {
    load();
  }, [refreshTrigger]);

  const radarItems = opportunities.filter((o) => {
    const nearest = nearestDeadlineOf(o);
    return nearest && isWithinRadarThreshold(nearest.date);
  });
  const radarTone = radarItems.some((o) => {
    const nearest = nearestDeadlineOf(o);
    return nearest && deadlineTone(nearest.date) === "urgent";
  })
    ? "urgent"
    : radarItems.length > 0
      ? "warning"
      : "idle";

  const handleStatusChange = async (opportunity: ScholarshipOpportunity, status: ScholarshipOpportunity["status"]) => {
    try {
      const updated = await updateScholarshipOpportunity(opportunity.id, { status });
      setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (error) {
      onToast("Failed to update status.");
    }
  };

  const handleDelete = async (opportunity: ScholarshipOpportunity) => {
    try {
      await deleteScholarshipOpportunity(opportunity.id);
      setOpportunities((prev) => prev.filter((o) => o.id !== opportunity.id));
      onToast("Removed from library.");
    } catch (error) {
      onToast("Failed to remove opportunity.");
    }
  };

  if (isLoading) {
    return (
      <div className="news-loading">
        <Loader2 className="icon-spin" size={24} />
        <span>Loading your Opportunity Library...</span>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="news-empty-state">
        <p>Your Opportunity Library is empty.</p>
        <p className="news-empty-subtext">
          Run a Search and save the results you want to keep — they'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="opportunity-library">
      {radarItems.length > 0 && (
        <div className={`deadline-radar-strip tone-${radarTone}`}>
          <RadioTower size={16} />
          <span>
            {radarItems.length} tracked opportunit{radarItems.length === 1 ? "y" : "ies"} due within{" "}
            {DEADLINE_RADAR_THRESHOLD_DAYS} days
          </span>
        </div>
      )}
      {opportunities.map((opportunity) => (
        <div key={opportunity.id} className="opportunity-library-row">
          <OpportunityCard opportunity={opportunity} onAddToTracker={onAddToTracker} />
          <div className="opportunity-library-controls">
            <select
              value={opportunity.status}
              data-status={opportunity.status}
              onChange={(e) => handleStatusChange(opportunity, e.target.value as ScholarshipOpportunity["status"])}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {opportunity.linked_row_snapshot && (
              <span className="opportunity-linked-badge">Tracked: {opportunity.linked_row_snapshot}</span>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={() => handleDelete(opportunity)}
              title="Remove from library"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
