import { FormEvent } from "react";
import { X, Save } from "lucide-react";
import { Modal } from "./Modal";
import { ColumnDef } from "./sheet/sheetModel";

export interface EmailConfig {
  toColumn?: string;
  subjectColumn?: string;
  bodyColumn?: string;
}

export function EmailConfigModal({
  config,
  columns,
  onSave,
  onClose,
  degreeType,
}: {
  config: EmailConfig | null;
  columns: ColumnDef[];
  onSave: (newConfig: EmailConfig) => void;
  onClose: () => void;
  degreeType?: string;
}) {
  const isBachelors = degreeType?.toLowerCase() === "bachelors";
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newConfig: EmailConfig = {
      toColumn: formData.get("toColumn")?.toString() || undefined,
      subjectColumn: formData.get("subjectColumn")?.toString() || undefined,
      bodyColumn: formData.get("bodyColumn")?.toString() || undefined,
    };
    onSave(newConfig);
  }

  // Safely filter out any malformed columns and remove duplicate names
  const validColumns = Array.from(new Map(
    (columns || []).filter(c => c && c.name).map(c => [c.name, c])
  ).values());

  // Pre-fill defaults based on common column names if config is empty
  const defaultTo = isBachelors ? "" : (validColumns.find(c => c.name.toLowerCase() === "professor email")?.name 
    || validColumns.find(c => c.name.toLowerCase().includes("email"))?.name 
    || "");
  const defaultSubject = isBachelors ? "" : (validColumns.find(c => c.name.toLowerCase() === "email subject")?.name || validColumns.find(c => c.name.toLowerCase() === "subject")?.name || "");
  const defaultBody = isBachelors ? "" : (validColumns.find(c => c.name.toLowerCase() === "email body")?.name || validColumns.find(c => c.name.toLowerCase() === "body")?.name || "");

  const initialTo = config?.toColumn !== undefined ? config.toColumn : defaultTo;
  const initialSubject = config?.subjectColumn !== undefined ? config.subjectColumn : defaultSubject;
  const initialBody = config?.bodyColumn !== undefined ? config.bodyColumn : defaultBody;

  return (
    <Modal onClose={onClose}>
      <form className="modal-panel small-modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>Email Configuration</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close form">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label className="field">
            <span>"To" Address Column</span>
            <select name="toColumn" defaultValue={initialTo} disabled={isBachelors}>
              <option value="">-- None --</option>
              {validColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Subject Line Column</span>
            <select name="subjectColumn" defaultValue={initialSubject} disabled={isBachelors}>
              <option value="">-- Default generated subject --</option>
              {validColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Email Body Column</span>
            <select name="bodyColumn" defaultValue={initialBody} disabled={isBachelors}>
              <option value="">-- Empty body --</option>
              {validColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={isBachelors}>
            <Save size={16} /> Save Configuration
          </button>
        </div>
      </form>
    </Modal>
  );
}
