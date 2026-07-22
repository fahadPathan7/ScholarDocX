/* ------------------------------------------------------------------ */
/*  ColumnEditor — add/edit column modals + SelectOptionsEditor        */
/* ------------------------------------------------------------------ */

import { FormEvent, useState } from "react";
import { ChevronUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Modal } from "../Modal";
import { ColumnDef, ColumnType, GROUP_COLORS, COLUMN_TYPES } from "./sheetModel";

/* ------------------------------------------------------------------ */
/*  SelectOptionsEditor                                                */
/* ------------------------------------------------------------------ */

export function SelectOptionsEditor({ options, onChange }: { options: string[], onChange: (opts: string[]) => void }) {
  const [newOpt, setNewOpt] = useState("");
  
  return (
    <div className="select-options-editor">
      <div className="select-options-list">
        {options.map((opt, i) => (
          <div key={i} className="select-option-pill">
            <input 
              value={opt} 
              onChange={(e) => {
                const newOpts = [...options];
                newOpts[i] = e.target.value;
                onChange(newOpts);
              }}
            />
            <button type="button" onClick={() => onChange(options.filter((_, idx) => idx !== i))}><X size={12} /></button>
          </div>
        ))}
      </div>
      <div className="select-add-row">
        <input 
          value={newOpt} 
          onChange={(e) => setNewOpt(e.target.value)} 
          placeholder="New option..." 
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (newOpt.trim()) {
                onChange([...options, newOpt.trim()]);
                setNewOpt("");
              }
            }
          }}
        />
        <button type="button" onClick={() => {
          if (newOpt.trim()) {
            onChange([...options, newOpt.trim()]);
            setNewOpt("");
          }
        }}>Add</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AddColumnModal                                                     */
/* ------------------------------------------------------------------ */

export function AddColumnModal({
  newColName, setNewColName,
  newColType, setNewColType,
  newColColor, setNewColColor,
  newColOptions, setNewColOptions,
  newColGroup, setNewColGroup,
  newColUnique, setNewColUnique,
  tempColumns,
  isSaving,
  onSubmit,
  onClose,
}: {
  newColName: string; setNewColName: (v: string) => void;
  newColType: ColumnType; setNewColType: (v: ColumnType) => void;
  newColColor: string; setNewColColor: (v: string) => void;
  newColOptions: string; setNewColOptions: (v: string) => void;
  newColGroup: string; setNewColGroup: (v: string) => void;
  newColUnique: boolean; setNewColUnique: (v: boolean) => void;
  tempColumns: ColumnDef[];
  isSaving: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} zIndex={1060}>
      <form className="modal-panel column-form" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}>
        <div className="modal-header">
          <h2>{newColType === "group" ? "Add Group" : "Add Column"}</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close form">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label className="field">
            <span>{newColType === "group" ? "Group name" : "Column name"}</span>
            <input
              value={newColName}
              onChange={(event) => setNewColName(event.target.value)}
              placeholder={newColType === "group" ? "e.g. Email" : "e.g. University name"}
              required
              autoFocus
              maxLength={30}
            />
          </label>
          {newColType !== "group" && (
            <label className="field">
              <span>Type</span>
              <select value={newColType} onChange={(event) => setNewColType(event.target.value as ColumnType)}>
                {COLUMN_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </label>
          )}
          {newColType !== "group" && (
            <label className="field">
              <span>Group (Optional)</span>
              <select
                value={newColGroup}
                onChange={(event) => setNewColGroup(event.target.value)}
              >
                <option value="">No Group</option>
                {tempColumns.filter(c => c.type === "group").map(g => (
                  <option key={g.name} value={g.name}>{g.name}</option>
                ))}
              </select>
            </label>
          )}
          {newColType !== "group" && (
            <label className="field bool-field">
              <span>Unique combination check</span>
              <div
                className={`bool-toggle${newColUnique ? " active" : ""}`}
                role="switch"
                aria-checked={newColUnique}
                tabIndex={0}
                onClick={() => setNewColUnique(!newColUnique)}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    setNewColUnique(!newColUnique);
                  }
                }}
              >
                <span className="bool-toggle-track"><span className="bool-toggle-thumb" /></span>
                <span className="bool-toggle-label">{newColUnique ? "Yes" : "No"}</span>
              </div>
            </label>
          )}
          {newColType === "select" ? (
            <label className="field">
              <span>Options (comma-separated)</span>
              <input
                value={newColOptions}
                onChange={(event) => setNewColOptions(event.target.value)}
                placeholder="Option 1, Option 2, Option 3"
              />
            </label>
          ) : null}
          {newColType === "group" && (
            <div className="field">
              <span>Group color</span>
              <div className="color-picker-row">
                {GROUP_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${newColColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewColColor(color)}
                    title={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button className="primary" type="submit" disabled={isSaving}>
            <Plus size={16} /> {isSaving ? "Adding..." : newColType === "group" ? "Add group" : "Add column"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  EditColumnsModal                                                   */
/* ------------------------------------------------------------------ */

export function EditColumnsModal({
  tempColumns,
  showColumnForm,
  isSaving,
  onRename,
  onUpdateColumn,
  onDeleteColumn,
  onMoveUp,
  onMoveDown,
  onSave,
  onClose,
  onAddColumn,
  onAddGroup,
}: {
  tempColumns: (ColumnDef & { _originalName?: string })[];
  showColumnForm: boolean;
  isSaving: boolean;
  onRename: (index: number, name: string) => void;
  onUpdateColumn: (index: number, key: string, value: any) => void;
  onDeleteColumn: (name: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onSave: (e?: FormEvent) => void;
  onClose: () => void;
  onAddColumn: () => void;
  onAddGroup: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <form className={`modal-panel column-form edit-columns-form${showColumnForm ? ' blurred' : ''}`} onClick={(e) => e.stopPropagation()} onSubmit={onSave} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}>
        <div className="modal-header">
          <h2>Edit columns</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close form">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content edit-columns-list">
          {tempColumns.map((col, index) => {
            const groupColor = col.group ? tempColumns.find(c => c.type === "group" && c.name === col.group)?.color : undefined;
            return (
            <div key={index} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div className="edit-column-item">
                <div className="drag-handle-reorder">
                  <button className="icon-button" style={{ padding: "4px", width: "28px", minHeight: "28px" }} type="button" disabled={index === 0} onClick={() => onMoveUp(index)} title="Move up">
                    <ChevronUp size={16} />
                  </button>
                  <button className="icon-button" style={{ padding: "4px", width: "28px", minHeight: "28px" }} type="button" disabled={index === tempColumns.length - 1} onClick={() => onMoveDown(index)} title="Move down">
                    <ChevronDown size={16} />
                  </button>
                </div>
                <input
                  className="column-name-input"
                  value={col.name}
                  onChange={(e) => onRename(index, e.target.value)}
                  placeholder="Column name"
                  required
                  maxLength={30}
                />
                {col.type !== "group" ? (
                  <>
                    <select
                      className="column-group-select"
                      value={col.group || ""}
                      onChange={(e) => onUpdateColumn(index, "group", e.target.value)}
                      style={groupColor ? { 
                        backgroundColor: `${groupColor}1A`, 
                        borderColor: groupColor, 
                        color: groupColor,
                        fontWeight: 500
                      } : {}}
                    >
                      <option value="">No Group</option>
                      {tempColumns.filter(c => c.type === "group").map(g => (
                        <option key={g.name} value={g.name}>{g.name}</option>
                      ))}
                    </select>
                    <label className="column-unique-check" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!col.unique}
                        onChange={(e) => onUpdateColumn(index, "unique", e.target.checked)}
                      />
                      Include in unique check
                    </label>
                  </>
                ) : (
                  <div className="color-picker-row" style={{ marginTop: 0, padding: "0 8px", gridColumn: "span 2" }}>
                    {GROUP_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${col.color === color ? 'active' : ''}`}
                        style={{ backgroundColor: color, width: '18px', height: '18px', borderRadius: '50%' }}
                        onClick={() => onUpdateColumn(index, "color", color)}
                        title={`Select color ${color}`}
                      />
                    ))}
                  </div>
                )}
                <span className="column-type-badge">{col.type}</span>
                <button className="icon-button danger-hover" style={{ padding: "4px", width: "32px", minHeight: "32px" }} type="button" onClick={() => onDeleteColumn(col.name)} title="Delete column">
                  <Trash2 size={16} />
                </button>
              </div>
              {col.type === "select" && (
                <SelectOptionsEditor 
                  options={col.options || []}
                  onChange={(opts) => onUpdateColumn(index, "options", opts)}
                />
              )}
            </div>
            );
          })}
        </div>
        <div className="modal-actions" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="secondary" onClick={onAddColumn}>
            <Plus size={16} /> Column
          </button>
          <button type="button" className="secondary" onClick={onAddGroup}>
            <Plus size={16} /> Group
          </button>
          <button className="primary" style={{ marginLeft: "auto" }} type="submit">
            Done
          </button>
        </div>
      </form>
    </Modal>
  );
}
