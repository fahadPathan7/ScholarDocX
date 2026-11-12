/* ------------------------------------------------------------------ */
/*  SheetTabsBar — the project's sheets as tabs under the grid         */
/*                                                                     */
/*  Moving between two sheets used to mean: breadcrumb back to the     */
/*  project, find the card, press Open. This puts every sheet one      */
/*  click away, and a new blank one behind the "+".                    */
/*                                                                     */
/*  Double-click a tab to rename it in place.                          */
/*                                                                     */
/*  SCHOLARDOCX-0259.                                                  */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";
import { Plus, Table2 } from "lucide-react";
import type { RecordMap } from "../../lib/api";

const MAX_SHEET_NAME_LENGTH = 60;

export function SheetTabsBar({
  sheets,
  activeSheetId,
  rowCounts,
  isCreating,
  onOpen,
  onCreate,
  onRename,
}: {
  sheets: RecordMap[];
  activeSheetId: string;
  /** Record count per sheet id, shown beside the name. */
  rowCounts: Record<string, number>;
  isCreating: boolean;
  onOpen: (sheet: RecordMap) => void;
  onCreate: () => void;
  /** Resolves false when the rename did not save. */
  onRename: (sheet: RecordMap, name: string) => Promise<boolean>;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(false);

  // Oldest first, like spreadsheet tabs: a new sheet appears at the right,
  // next to the "+" that made it. (The card list is newest-first.)
  const ordered = [...sheets].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSheetId, sheets.length]);

  useEffect(() => {
    if (!renamingId) return;
    doneRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renamingId]);

  const finish = async (sheet: RecordMap, save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const name = draft.trim();
    if (save && name && name !== sheet.name) {
      await onRename(sheet, name.slice(0, MAX_SHEET_NAME_LENGTH));
    }
    setRenamingId(null);
  };

  return (
    <div className="sheet-tabs-bar" role="navigation" aria-label="Sheets in this project">
      <div className="sheet-tabs-scroll" role="tablist">
        {ordered.map((sheet) => {
          const id = String(sheet.id);
          const isActive = id === activeSheetId;
          const count = rowCounts[id];
          if (renamingId === id) {
            return (
              <span key={id} className={`sheet-tab is-renaming${isActive ? " is-active" : ""}`}>
                <input
                  ref={inputRef}
                  className="sheet-tab-input"
                  value={draft}
                  maxLength={MAX_SHEET_NAME_LENGTH}
                  aria-label={`Rename sheet ${sheet.name}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => { void finish(sheet, true); }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") { event.preventDefault(); void finish(sheet, true); }
                    if (event.key === "Escape") { event.preventDefault(); void finish(sheet, false); }
                  }}
                />
              </span>
            );
          }
          return (
            <button
              key={id}
              ref={isActive ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`sheet-tab${isActive ? " is-active" : ""}`}
              title={isActive ? "Double-click to rename" : `Open ${sheet.name}`}
              onClick={() => { if (!isActive) onOpen(sheet); }}
              onDoubleClick={() => { setDraft(String(sheet.name || "")); setRenamingId(id); }}
            >
              <Table2 size={13} />
              <span className="sheet-tab-name">{sheet.name}</span>
              {typeof count === "number" && count > 0 ? <span className="sheet-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="sheet-tab-add"
        title="New blank sheet"
        aria-label="New blank sheet"
        disabled={isCreating}
        onClick={onCreate}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
