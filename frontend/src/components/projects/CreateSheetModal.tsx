/* ------------------------------------------------------------------ */
/*  CreateSheetModal — name a sheet and pick how it starts             */
/*                                                                     */
/*  Blank is the default and is selected on open, so "Create sheet →   */
/*  Enter" gives an empty grid with columns A–E. Templates are a       */
/*  gallery beside it, each showing the columns it would create,       */
/*  instead of a dropdown you had to open to learn what was in it.     */
/*                                                                     */
/*  SCHOLARDOCX-0259.                                                  */
/* ------------------------------------------------------------------ */

import { FormEvent, useMemo, useState } from "react";
import { BookmarkCheck, ClipboardList, FileCheck2, GraduationCap, Grid3x3, Plus, Trophy, Users, X, type LucideIcon } from "lucide-react";
import { Modal } from "../Modal";
import { blankColumns } from "../sheet/sheetColumns";
import { SHEET_TEMPLATES, type ColumnDef, type SheetTemplate } from "../sheet/sheetModel";

/** How a new sheet gets its first columns. */
export type SheetStart =
  | { kind: "blank" }
  | { kind: "application" }
  | { kind: "columns"; columns: ColumnDef[] };

type StartOption = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Column names shown as a preview strip. */
  preview: string[];
  start: SheetStart;
};

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  prof_outreach: Users,
  univ_shortlist: ClipboardList,
  scholarship_tracker: Trophy,
  doc_checklist: FileCheck2,
};

/** Header cells shown per card. Letters fit five across; real column names
 *  need the room, so they get three and a "+N". */
const previewLimit = (names: string[]) => (names.every((name) => name.length <= 2) ? 5 : 3);

const columnNames = (columns: ColumnDef[]) => columns.filter((col) => col.type !== "group").map((col) => col.name);

function templateOption(template: SheetTemplate, icon: LucideIcon): StartOption {
  return {
    id: template.id,
    name: template.name,
    // The stored descriptions end by listing the columns; the preview strip
    // shows those, so keep only the opening clause.
    description: template.description.split(" with columns")[0].replace(/\.$/, "") + ".",
    icon,
    preview: columnNames(template.columns),
    start: { kind: "columns", columns: template.columns },
  };
}

export function CreateSheetModal({
  defaultName,
  customTemplates,
  isCreating,
  onCreate,
  onClose,
}: {
  /** Used when the name is left empty, and shown as the placeholder. */
  defaultName: string;
  customTemplates: SheetTemplate[];
  isCreating: boolean;
  onCreate: (name: string, start: SheetStart) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("blank");

  const options = useMemo<StartOption[]>(() => [
    {
      id: "blank",
      name: "Blank",
      description: "An empty grid. Rename the columns to whatever you need.",
      icon: Grid3x3,
      preview: columnNames(blankColumns()),
      start: { kind: "blank" },
    },
    {
      id: "application",
      name: "Application tracker",
      description: "Universities, professors, funding, emails and documents in one sheet.",
      icon: GraduationCap,
      preview: ["University name", "Program", "Deadline", "Professor name", "Status", "Notes", "Subject", "Body", "CV", "SOP"],
      start: { kind: "application" },
    },
    ...SHEET_TEMPLATES.map((template) => templateOption(template, TEMPLATE_ICONS[template.id] || ClipboardList)),
    ...customTemplates.map((template) => ({
      ...templateOption(template, BookmarkCheck),
      description: "One of your saved templates.",
    })),
  ], [customTemplates]);

  const selected = options.find((option) => option.id === selectedId) || options[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isCreating) return;
    onCreate(name.trim() || defaultName, selected.start);
  };

  return (
    <Modal onClose={onClose} label="Create sheet">
      <form className="modal-panel create-sheet-panel" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Start blank or from a template</p>
            <h2>Create Sheet</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close form" disabled={isCreating}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-content stacked">
          <label className="field">
            <span>Sheet name</span>
            <input
              type="text"
              name="sheet_name"
              value={name}
              maxLength={60}
              placeholder={defaultName}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="sheet-start-grid" role="radiogroup" aria-label="How the sheet starts">
            {options.map((option) => {
              const Icon = option.icon;
              const isSelected = option.id === selected.id;
              const limit = previewLimit(option.preview);
              const extra = option.preview.length - limit;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`sheet-start-card${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(option.id)}
                  onDoubleClick={() => { if (!isCreating) onCreate(name.trim() || defaultName, option.start); }}
                >
                  <span className="sheet-start-head">
                    <span className="sheet-start-icon"><Icon size={16} /></span>
                    <strong>{option.name}</strong>
                  </span>
                  <span className="sheet-start-desc">{option.description}</span>
                  <span className="sheet-start-preview" aria-hidden="true">
                    {option.preview.slice(0, limit).map((column) => (
                      <span key={column} className="sheet-start-col">{column}</span>
                    ))}
                    {extra > 0 ? <span className="sheet-start-col is-more">+{extra}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="secondary" type="button" onClick={onClose} disabled={isCreating}>Cancel</button>
          <button className="primary" type="submit" disabled={isCreating}>
            <Plus size={16} /> {isCreating ? "Creating..." : `Create ${selected.id === "blank" ? "blank sheet" : "sheet"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
