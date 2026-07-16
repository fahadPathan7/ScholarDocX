import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, listRecords, RecordMap } from "../../lib/api";
import { SHEET_TEMPLATES } from "../sheet/sheetModel";
import { ScholarshipOpportunity, updateScholarshipOpportunity } from "../../lib/scholarshipOpportunitiesApi";

const TRACKER_SHEET_NAME = "Scholarship Tracker";
const TRACKER_TEMPLATE = SHEET_TEMPLATES.find((t) => t.id === "scholarship_tracker")!;

interface AddToTrackerModalProps {
  opportunity: ScholarshipOpportunity;
  onClose: () => void;
  onDone: (updated: ScholarshipOpportunity) => void;
  onToast: (msg: string) => void;
}

function buildRow(opportunity: ScholarshipOpportunity): Record<string, string> {
  const nearestDeadline = [...opportunity.deadlines]
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    "Scholarship Name": opportunity.canonical_name,
    "Sponsor": opportunity.sponsor || "",
    "Funding Coverage": opportunity.funding.coverage
      ? `${opportunity.funding.coverage}${opportunity.funding.notes ? ` — ${opportunity.funding.notes}` : ""}`
      : "",
    "Deadline": nearestDeadline?.date || "",
    "Status": opportunity.status,
    "Eligible Countries": opportunity.eligible_nationalities.join(", "),
    "Requirements": opportunity.requirements.join("; "),
    "Application URL": opportunity.application_url || "",
  };
}

export function AddToTrackerModal({ opportunity, onClose, onDone, onToast }: AddToTrackerModalProps) {
  const [projects, setProjects] = useState<RecordMap[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listRecords<RecordMap>("projects")
      .then((data) => {
        setProjects(data);
        if (data.length > 0) setSelectedProjectId(String(data[0].id));
      })
      .catch(() => onToast("Failed to load projects."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!selectedProjectId) return;
    setIsSubmitting(true);
    try {
      const sheets = await listRecords<RecordMap>("project_sheets");
      let sheet = sheets.find(
        (s) => String(s.project_id) === selectedProjectId && s.name === TRACKER_SHEET_NAME,
      );
      let pageId: string;

      if (!sheet) {
        const created = await api.post<RecordMap>(`/projects/${selectedProjectId}/sheets`, {
          name: TRACKER_SHEET_NAME,
        });
        await api.patch(`/project_pages/${created.page.id}`, {
          data: { columns_json: TRACKER_TEMPLATE.columns, rows_json: [] },
        });
        pageId = created.page.id;
      } else {
        const pages = await listRecords<RecordMap>("project_pages");
        const page = pages.find((p) => String(p.sheet_id) === String(sheet!.id));
        if (!page) throw new Error("Scholarship Tracker sheet has no page.");
        pageId = page.id;
      }

      const pages = await listRecords<RecordMap>("project_pages");
      const page = pages.find((p) => String(p.id) === String(pageId))!;
      const existingRows = page.rows || JSON.parse(page.rows_json || "[]");
      const newRow = buildRow(opportunity);
      await api.patch(`/project_pages/${pageId}`, {
        data: { rows_json: [...existingRows, newRow] },
      });

      const updatedOpportunity = await updateScholarshipOpportunity(opportunity.id, {
        linked_sheet_id: String(sheet?.id ?? pageId),
        linked_row_snapshot: `${newRow["Scholarship Name"]} · ${newRow["Deadline"] || "no deadline"}`,
      });

      onToast(`Added to ${TRACKER_SHEET_NAME}.`);
      onDone(updatedOpportunity);
    } catch (error) {
      // 403/limit errors already surface the standard styled alert via the
      // global api client (FR-7.21); this toast is a fallback for anything else.
      onToast("Could not add this opportunity to the tracker.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop-main" onClick={onClose}>
      <div className="modal-panel small-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add to tracker</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content">
          <p>
            Appends <strong>{opportunity.canonical_name}</strong> as a row in the selected project's
            Scholarship Tracker sheet (created automatically if it doesn't exist yet).
          </p>
          {isLoading ? (
            <p>Loading projects...</p>
          ) : projects.length === 0 ? (
            <p>Create a project first, then add this opportunity to its tracker.</p>
          ) : (
            <label className="field">
              <span>Project</span>
              <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button className="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="primary"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedProjectId}
          >
            {isSubmitting ? "Adding..." : "Add to tracker"}
          </button>
        </div>
      </div>
    </div>
  );
}
