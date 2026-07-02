/* ------------------------------------------------------------------ */
/*  InlineCellEditor — in-cell editing with spreadsheet keyboard flow  */
/*                                                                     */
/*  Enter commits and moves down, Tab commits and moves right, Escape  */
/*  cancels, blur commits in place. File columns never render here —   */
/*  they keep the modal editor with the document picker.               */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ColumnDef } from "./sheetModel";

export type CommitDirection = "down" | "right" | "none";

export function InlineCellEditor({
  column,
  value,
  seedText,
  onCommit,
  onCancel,
}: {
  column: ColumnDef;
  value: string;
  /** When editing started by typing, the typed character replaces the value. */
  seedText?: string;
  onCommit: (value: string, direction: CommitDirection) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(seedText !== undefined ? seedText : value);
  const committedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Typing seeds place the caret at the end; plain edits select everything
    if (el instanceof HTMLInputElement) {
      if (seedText !== undefined) {
        el.setSelectionRange?.(el.value.length, el.value.length);
      } else if (el.type === "text" || el.type === "url") {
        el.select();
      }
    }
  }, []);

  const commit = (direction: CommitDirection, val?: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(val !== undefined ? val : draft, direction);
  };

  const cancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Keep grid-level shortcuts (arrows, Ctrl+Z, Delete…) out while editing
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit("down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      commit("right");
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  const handleBlur = () => commit("none");

  const common = {
    className: "sheet-inline-editor",
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
  };

  switch (column.type) {
    case "number":
      return (
        <input
          {...common}
          ref={(el) => { inputRef.current = el; }}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      );

    case "url":
      return (
        <input
          {...common}
          ref={(el) => { inputRef.current = el; }}
          type="url"
          value={draft}
          placeholder="https://..."
          onChange={(e) => setDraft(e.target.value)}
        />
      );

    case "date":
      return (
        <input
          {...common}
          ref={(el) => { inputRef.current = el; }}
          type={column.name.toLowerCase().includes("time") ? "datetime-local" : "date"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(event) => {
            if ("showPicker" in event.currentTarget) {
              (event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            }
          }}
        />
      );

    case "bool":
      return (
        <select
          {...common}
          ref={(el) => { inputRef.current = el; }}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit("none", e.target.value); }}
        >
          <option value="">Blank</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      );

    case "select": {
      const options = column.options || [];
      const includesDraft = !draft || options.includes(draft);
      return (
        <select
          {...common}
          ref={(el) => { inputRef.current = el; }}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit("none", e.target.value); }}
        >
          <option value="">Blank</option>
          {!includesDraft ? <option value={draft}>{draft}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    default:
      return (
        <input
          {...common}
          ref={(el) => { inputRef.current = el; }}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      );
  }
}
