import React, { useState } from "react";
import { ArrowDownToLine, Copy as CopyIcon, Edit, Eraser, Eye, Files, Mail, PenLine, Trash2, X } from "lucide-react";
import { SheetMenu, SheetMenuDivider, SheetMenuItem, SheetMenuLabel } from "./SheetMenu";
import { existingValues } from "./sheetGrid";
import type { ColumnDef } from "./sheetModel";

interface SelectionToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPeek?: () => void;
  onEdit?: () => void;
  onEmail?: () => void;
  /* SCHOLARDOCX-0202 — bulk cell editing */
  columns?: ColumnDef[];
  rows?: Record<string, string>[];
  /** The column the bulk actions apply to — normally the focused cell's. */
  activeColumn?: string | null;
  onFillDown?: (column: string) => void;
  onSetColumnValue?: (column: string, value: string) => void;
  onClearCells?: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectedCount,
  onClear,
  onDelete,
  onDuplicate,
  onCopy,
  onPeek,
  onEdit,
  onEmail,
  columns = [],
  rows = [],
  activeColumn,
  onFillDown,
  onSetColumnValue,
  onClearCells,
}) => {
  const [customValue, setCustomValue] = useState("");
  if (selectedCount === 0) return null;

  const editableColumns = columns.filter(
    (col) => col.type !== "group" && col.type !== "file" && !col.hidden,
  );
  // The bulk actions need a column to act on. The focused cell names one; if
  // nothing is focused we fall back to the first editable column rather than
  // hiding the menu, so the feature is not invisible until the user happens
  // to click a cell first.
  const target =
    editableColumns.find((col) => col.name === activeColumn)?.name || editableColumns[0]?.name || null;
  const targetColumn = editableColumns.find((col) => col.name === target);
  const canBulkEdit = Boolean(target && onFillDown && onSetColumnValue);

  // Offer the column's own options where it has them, and otherwise what is
  // already in use — which is what keeps a free-text column from drifting
  // into "Submitted", "submitted" and "Submitted " as three separate states.
  const suggestions = targetColumn
    ? targetColumn.type === "select" && targetColumn.options?.length
      ? targetColumn.options
      : targetColumn.type === "bool"
        ? ["Yes", "No"]
        : existingValues(rows, targetColumn.name, 8)
    : [];

  return (
    <div className="selection-toolbar">
      <div className="selection-toolbar-left">
        <span className="selection-count-badge">{selectedCount}</span>
        <span className="selection-count-label">
          {selectedCount} row{selectedCount > 1 ? "s" : ""} selected
        </span>
        <button className="selection-deselect-btn" onClick={onClear} title="Clear selection">
          <X size={12} /> Deselect
        </button>
      </div>
      <div className="selection-toolbar-actions" style={{ position: "relative" }}>
        {selectedCount === 1 && (
          <>
            <button className="sel-action-btn" onClick={onPeek} title="Peek details">
              <Eye size={13} /> View Details
            </button>
            <button className="sel-action-btn" onClick={onEdit} title="Edit row">
              <Edit size={13} /> Edit
            </button>
            <button className="sel-action-btn" onClick={onEmail} title="Compose email">
              <Mail size={13} /> Email
            </button>
          </>
        )}

        {canBulkEdit && target ? (
          <SheetMenu
            /* Not "Edit <column>" — that read as renaming the column itself
               rather than writing values into it. The column name belongs
               inside the menu, where it is describing a target, not on the
               trigger, where it looked like a subject. */
            label="Fill values"
            icon={<PenLine size={13} />}
            title={`Write values into the "${target}" column for the selected rows`}
            width={252}
          >
            {(close) => (
              <>
                <SheetMenuLabel>Column · {target}</SheetMenuLabel>
                <SheetMenuItem
                  icon={<ArrowDownToLine size={13} />}
                  onClick={() => { onFillDown!(target); close(); }}
                  hint="Copies the value from the topmost selected row into the rest"
                >
                  Fill down from the top row
                </SheetMenuItem>

                <SheetMenuDivider />
                <SheetMenuLabel>Set every selected row to</SheetMenuLabel>
                {suggestions.length ? (
                  suggestions.map((value) => (
                    <SheetMenuItem key={value} onClick={() => { onSetColumnValue!(target, value); close(); }}>
                      {value}
                    </SheetMenuItem>
                  ))
                ) : (
                  <p className="sheet-menu-empty">Nothing in this column yet — type a value below.</p>
                )}
                <form
                  className="selection-bulk-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSetColumnValue!(target, customValue.trim());
                    setCustomValue("");
                    close();
                  }}
                >
                  <input
                    value={customValue}
                    onChange={(event) => setCustomValue(event.target.value)}
                    placeholder="Type a value…"
                    aria-label={`Value for ${target}`}
                  />
                  <button type="submit" disabled={!customValue.trim()}>Set</button>
                </form>

                {onClearCells ? (
                  <>
                    <SheetMenuDivider />
                    <SheetMenuItem danger icon={<Eraser size={13} />} onClick={() => { onClearCells(); close(); }}>
                      Clear all cells in these rows
                    </SheetMenuItem>
                  </>
                ) : null}
              </>
            )}
          </SheetMenu>
        ) : null}

        <button className="sel-action-btn" onClick={onCopy}>
          <CopyIcon size={13} /> Copy
        </button>
        <button className="sel-action-btn" onClick={onDuplicate}>
          <Files size={13} /> Duplicate
        </button>
        <button className="sel-action-btn sel-danger" onClick={onDelete}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  );
};
