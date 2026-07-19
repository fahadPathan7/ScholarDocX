/* ------------------------------------------------------------------ */
/*  RecordFormModal — add/edit record form modal                       */
/* ------------------------------------------------------------------ */

import { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Modal } from "../Modal";
import { TypedRecordField } from "../SheetRecordFields";
import type { ColumnDef } from "./sheetModel";
import type { RecordMap } from "../../lib/api";

export function RecordFormModal({
  columns,
  recordForm,
  setRecordForm,
  editingRowIndex,
  validationError,
  isSaving,
  files,
  onFilesChanged,
  onSave,
  onCancel,
}: {
  columns: ColumnDef[];
  recordForm: Record<string, string>;
  setRecordForm: (fn: (current: Record<string, string>) => Record<string, string>) => void;
  editingRowIndex: number | null;
  validationError: string;
  isSaving: boolean;
  files: RecordMap[];
  onFilesChanged: () => Promise<void>;
  onSave: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <form className="modal-panel record-form" onClick={(e) => e.stopPropagation()} onSubmit={onSave} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}>
        <div className="modal-header">
          <h2>{editingRowIndex !== null ? "Edit Record" : "Add Record"}</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="Close form">
            <X size={20} />
          </button>
        </div>
        {validationError ? <p className="validation-error" style={{ margin: "16px 24px 0" }}>{validationError}</p> : null}
        <div className="modal-content record-form-fields" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {columns.filter(col => col.type !== "group").map((col) => (
            <TypedRecordField
              key={col.name}
              column={col}
              value={recordForm[col.name] || ""}
              files={files}
              onChange={(value) => setRecordForm((current) => ({ ...current, [col.name]: value }))}
              onFileUploaded={onFilesChanged}
            />
          ))}
        </div>
        <div className="modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button className="primary full" type="submit" disabled={isSaving}>
            <Plus size={16} /> {isSaving ? "Saving..." : editingRowIndex !== null ? "Save changes" : "Add to sheet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
