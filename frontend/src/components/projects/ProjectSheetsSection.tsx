/* ------------------------------------------------------------------ */
/*  ProjectSheetsSection — the sheet cards inside an open project      */
/*                                                                     */
/*  Extracted from ProjectWorkspace (SCHOLARDOCX-0259). Creating and   */
/*  renaming are passed in because the sheet tab strip does both too.  */
/* ------------------------------------------------------------------ */

import { FormEvent, useState } from "react";
import { Edit, LayoutDashboard, Pin, Plus, Table2, Trash2, X } from "lucide-react";
import { Field } from "../Field";
import { Modal } from "../Modal";
import { Section } from "../Section";
import { useDialog } from "../DialogProvider";
import { api, notify, RecordMap } from "../../lib/api";
import { formatLongDate } from "../../lib/date";
import { nextSheetName } from "../sheet/sheetColumns";
import type { SheetTemplate } from "../sheet/sheetModel";
import { CreateSheetModal, type SheetStart } from "./CreateSheetModal";
import { useLockMainScroll } from "./useLockMainScroll";

export function ProjectSheetsSection({
  projectId,
  sheets,
  rowCounts,
  recordsPerSheetLimit,
  customTemplates,
  isCreatingSheet,
  onCreateSheet,
  onRenameSheet,
  onOpenSheet,
  refreshSummary,
  onChanged,
  onToast,
}: {
  projectId: string;
  sheets: RecordMap[];
  /** Record count per sheet id. */
  rowCounts: Record<string, number>;
  recordsPerSheetLimit: number;
  customTemplates: SheetTemplate[];
  isCreatingSheet: boolean;
  /** Resolves true when the sheet was created (the parent then opens it). */
  onCreateSheet: (name: string, start: SheetStart) => Promise<boolean>;
  onRenameSheet: (sheet: RecordMap, name: string) => Promise<boolean>;
  onOpenSheet: (sheet: RecordMap) => void;
  refreshSummary: () => Promise<void>;
  onChanged?: () => Promise<void>;
  onToast?: (message: string) => void;
}) {
  const { showConfirm } = useDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState<RecordMap | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  useLockMainScroll(showCreate || !!renaming);

  const defaultName = nextSheetName(sheets.map((sheet) => String(sheet.name || "")));

  const startRename = (sheet: RecordMap) => {
    setRenaming(sheet);
    setRenameDraft(String(sheet.name || ""));
  };

  const saveRename = async (event: FormEvent) => {
    event.preventDefault();
    const name = renameDraft.trim();
    if (!renaming || isRenaming || !name) return;
    setIsRenaming(true);
    try {
      if (await onRenameSheet(renaming, name)) setRenaming(null);
    } finally {
      setIsRenaming(false);
    }
  };

  const deleteSheet = async (sheet: RecordMap) => {
    const confirmed = await showConfirm(
      `Delete “${sheet.name}”? This permanently deletes every record in it.`,
      "Delete Sheet",
    );
    if (!confirmed) return;
    const id = String(sheet.id);
    try {
      await api.delete(`/project_sheets/${id}`);
      await notify("sheet_delete", { project_id: projectId, sheetId: id, sheetName: sheet.name });
      onToast?.("Sheet deleted.");
      await refreshSummary();
    } catch (error) {
      console.error("Delete sheet error:", error);
      onToast?.("Failed to delete sheet.");
    }
  };

  const updatePin = async (sheet: RecordMap, data: RecordMap) => {
    await api.patch(`/project_sheets/${sheet.id}`, { data });
    await notify("sheet_pin", {
      project_id: sheet.project_id,
      sheetName: sheet.name,
      actionLabel: data.pinned_to_dashboard !== undefined
        ? (data.pinned_to_dashboard ? "added to dashboard" : "removed from dashboard")
        : (data.is_pinned ? "pinned" : "unpinned"),
    });
    await refreshSummary();
    await onChanged?.();
  };

  return (
    <Section
      title="Sheets"
      eyebrow="Grids for whatever this project needs to track"
      action={(
        <div className="project-home-actions">
          <button
            className="secondary"
            type="button"
            disabled={isCreatingSheet}
            title={`Create “${defaultName}” with columns A to E`}
            onClick={() => { void onCreateSheet(defaultName, { kind: "blank" }); }}
          >
            <Table2 size={16} /> {isCreatingSheet ? "Creating..." : "Blank sheet"}
          </button>
          <button className="primary" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create sheet
          </button>
        </div>
      )}
    >
      {showCreate ? (
        <CreateSheetModal
          defaultName={defaultName}
          customTemplates={customTemplates}
          isCreating={isCreatingSheet}
          onClose={() => setShowCreate(false)}
          onCreate={async (name, start) => {
            if (await onCreateSheet(name, start)) setShowCreate(false);
          }}
        />
      ) : null}

      {renaming ? (
        <Modal onClose={() => setRenaming(null)} label="Rename sheet">
          <form className="modal-panel small-modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={saveRename}>
            <div className="modal-header">
              <h2>Rename Sheet</h2>
              <button className="icon-button" type="button" onClick={() => setRenaming(null)} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content">
              <Field label="Sheet name" name="sheet_name" value={renameDraft} required onChange={(_, value) => setRenameDraft(value)} />
            </div>
            <div className="modal-footer">
              <button className="secondary" type="button" onClick={() => setRenaming(null)} disabled={isRenaming}>Cancel</button>
              <button className="primary" type="submit" disabled={isRenaming || !renameDraft.trim()}>
                {isRenaming ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {sheets.length === 0 ? (
        <div className="project-empty-state">
          <Table2 size={34} />
          <strong>No sheets yet</strong>
          <p>
            A sheet is a grid. Start blank with columns A to E and rename them as you go,
            or pick a template if one fits.
          </p>
          <div className="project-home-actions">
            <button
              className="primary"
              type="button"
              disabled={isCreatingSheet}
              onClick={() => { void onCreateSheet(defaultName, { kind: "blank" }); }}
            >
              <Table2 size={16} /> {isCreatingSheet ? "Creating..." : "Start a blank sheet"}
            </button>
            <button className="secondary" type="button" onClick={() => setShowCreate(true)}>
              Browse templates
            </button>
          </div>
        </div>
      ) : (
        <div className="sheet-card-grid">
          {sheets.map((sheet) => {
            const used = rowCounts[String(sheet.id)] || 0;
            const max = recordsPerSheetLimit;
            const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : -1;
            const isNear = pct >= 80;
            const isFull = pct >= 100;
            return (
              <article className="sheet-card" key={sheet.id}>
                <div className="sheet-card-header">
                  <div className="sheet-card-title-row">
                    <button type="button" className="sheet-card-open" onClick={() => onOpenSheet(sheet)} title={`Open ${sheet.name}`}>
                      <strong>{sheet.name}</strong>
                    </button>
                    <div className="sheet-quota-wrap">
                      <span className={`sheet-record-count${isFull ? " quota-full" : isNear ? " quota-near" : ""}`}>
                        {max > 0 ? `${used} / ${max}` : used}
                      </span>
                      {max > 0 ? (
                        <div className="quota-bar" title={`${used} of ${max} records used`}>
                          <div className={`quota-bar-fill${isFull ? " full" : isNear ? " near" : ""}`} style={{ width: `${pct}%` }} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <span className="sheet-card-meta">Created {formatLongDate(sheet.created_at)}</span>
                </div>
                <div className="sheet-card-actions">
                  <div className="sheet-card-pins">
                    <button
                      className={`pin-button${sheet.is_pinned ? " active" : ""}`}
                      type="button"
                      onClick={() => updatePin(sheet, { is_pinned: !sheet.is_pinned })}
                      title={sheet.is_pinned ? "Unpin from this view" : "Pin to this view"}
                    >
                      <Pin size={15} />
                    </button>
                    <button
                      className={`pin-button dashboard-pin${sheet.pinned_to_dashboard ? " active" : ""}`}
                      type="button"
                      onClick={() => updatePin(sheet, { pinned_to_dashboard: !sheet.pinned_to_dashboard })}
                      title={sheet.pinned_to_dashboard ? "Remove from dashboard" : "Add to dashboard"}
                    >
                      <LayoutDashboard size={15} />
                    </button>
                  </div>
                  <div className="sheet-card-main-actions">
                    <button className="primary" type="button" onClick={() => onOpenSheet(sheet)}>Open</button>
                    <button className="secondary" type="button" onClick={() => startRename(sheet)} title="Rename sheet">
                      <Edit size={15} />
                    </button>
                    <button className="secondary danger" type="button" onClick={() => deleteSheet(sheet)} title="Delete sheet">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}
