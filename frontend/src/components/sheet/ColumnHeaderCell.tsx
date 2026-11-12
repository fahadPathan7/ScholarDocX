/* ------------------------------------------------------------------ */
/*  ColumnHeaderCell — one data column's header                        */
/*                                                                     */
/*  Extracted from SheetTable when the header learned to do more than  */
/*  sort (SCHOLARDOCX-0259):                                           */
/*  - double-click the name to rename it in place;                     */
/*  - a menu for retype / insert / hide / summary / delete.            */
/*                                                                     */
/*  A single click still sorts. Because a double-click is two clicks,  */
/*  the sort waits a beat and is cancelled if the second click lands;  */
/*  otherwise renaming a column would also flip its sort twice.        */
/* ------------------------------------------------------------------ */

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, BarChart3, Check,
  ChevronDown, EyeOff, Pencil, Trash2,
} from "lucide-react";
import { ColumnTypeIcon } from "./ColumnTypeIcon";
import { DropdownPortal } from "./DropdownPortal";
import { alignFor, TYPE_LABELS } from "./sheetGrid";
import { COLUMN_TYPES, type ColumnDef, type ColumnType } from "./sheetModel";
import { MAX_COLUMN_NAME_LENGTH } from "./sheetColumns";

const SORT_CLICK_DELAY_MS = 220;

/** The header-level column actions. Absent (undefined) = a read-only header. */
export type ColumnHeaderActions = {
  nameProblem: (proposed: string, currentName?: string) => string | null;
  onRename: (from: string, to: string) => Promise<boolean>;
  /** Resolves to the new column's name (the table then renames it). */
  onInsert: (anchor: string, side: "left" | "right") => Promise<string | null>;
  onSetType: (name: string, type: ColumnType) => void;
  onHide: (name: string) => void;
  onDelete: (name: string) => void;
};

export function ColumnHeaderCell({
  col,
  groupName,
  groupColor,
  isFirstDataCol,
  sortDir,
  isDragged,
  isDragOver,
  raised,
  fullScreenMode,
  dragHandlers,
  onToggleSort,
  onOpenColumnStats,
  onResizeStart,
  filterSlot,
  actions,
  isRenaming,
  onStartRename,
  onStopRename,
}: {
  col: ColumnDef;
  groupName?: string;
  groupColor: string;
  isFirstDataCol: boolean;
  sortDir: "asc" | "desc" | "off";
  isDragged: boolean;
  isDragOver: boolean;
  /** Lift the cell above its neighbours (its filter popup is open). */
  raised: boolean;
  fullScreenMode: boolean;
  dragHandlers: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  onToggleSort: (columnName: string) => void;
  onOpenColumnStats: (columnName: string) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  filterSlot: React.ReactNode;
  actions?: ColumnHeaderActions;
  isRenaming: boolean;
  onStartRename: () => void;
  /** `advance` asks the table to start renaming the next column (Tab). */
  onStopRename: (advance?: boolean) => void;
}) {
  const [draft, setDraft] = useState(col.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const sortTimerRef = useRef<number | null>(null);
  // Enter/Tab commit and then blur fires as the input unmounts; this stops
  // the same rename being submitted twice.
  const committingRef = useRef(false);

  useEffect(() => {
    if (!isRenaming) return;
    setDraft(col.name);
    committingRef.current = false;
    // After paint, so the input exists; select-all makes typing replace.
    const frame = window.requestAnimationFrame(() => {
      // A column just added at the far right may be outside the scroller.
      cellRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRenaming]);

  useEffect(() => () => {
    if (sortTimerRef.current !== null) window.clearTimeout(sortTimerRef.current);
  }, []);

  const problem = isRenaming && actions ? actions.nameProblem(draft, col.name) : null;

  const commit = async (advance: boolean, fromBlur = false) => {
    if (!actions || committingRef.current) return;
    if (draft.trim() === col.name) { committingRef.current = true; onStopRename(advance); return; }
    if (actions.nameProblem(draft, col.name)) {
      // Leaving the field with a bad name puts the old one back; pressing
      // Enter keeps the field open so it can be fixed.
      if (fromBlur) onStopRename(false);
      return;
    }
    // Stays set after a successful save: the input unmounts and blurs, and
    // that blur must not run a second commit (it would cancel a Tab advance).
    committingRef.current = true;
    const saved = await actions.onRename(col.name, draft);
    if (saved) onStopRename(advance);
    else committingRef.current = false;
  };

  const handleNameClick = () => {
    if (isRenaming) return;
    if (!actions) { onToggleSort(col.name); return; }
    if (sortTimerRef.current !== null) window.clearTimeout(sortTimerRef.current);
    sortTimerRef.current = window.setTimeout(() => {
      sortTimerRef.current = null;
      onToggleSort(col.name);
    }, SORT_CLICK_DELAY_MS);
  };

  const handleNameDoubleClick = () => {
    if (!actions) return;
    if (sortTimerRef.current !== null) {
      window.clearTimeout(sortTimerRef.current);
      sortTimerRef.current = null;
    }
    onStartRename();
  };

  const runMenu = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <th
      ref={cellRef}
      className={`sheet-col-head ${groupName ? "group-child-cell" : ""} ${isDragged ? "dragging" : ""} ${isDragOver ? "drag-over" : ""} align-${alignFor(col.type)} ${isFirstDataCol ? "is-first-data-col" : ""} ${isRenaming ? "is-renaming" : ""} ${menuOpen ? "is-menu-open" : ""}`}
      draggable={!isRenaming}
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onDragEnd={dragHandlers.onDragEnd}
      style={{
        width: col.width ? `${col.width}px` : "150px",
        position: "relative",
        zIndex: raised ? 100 : 1,
        ...(fullScreenMode ? { padding: "4px 6px", fontSize: "11px" } : {}),
      }}
    >
      <div className="column-head-inner" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", width: "100%", height: "100%", minHeight: "38px", gap: "3px" }}>
        {groupName && (
          <span className="group-parent-indicator" style={{ color: groupColor, borderColor: groupColor, opacity: 0.9, alignSelf: "flex-start" }}>
            {groupName}
          </span>
        )}

        <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "4px", minWidth: 0 }}>
          <div
            className="column-head-text"
            onClick={handleNameClick}
            onDoubleClick={handleNameDoubleClick}
            style={{ cursor: isRenaming ? "text" : "pointer", flex: "1 1 auto", display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}
            title={isRenaming ? undefined : actions ? "Click to sort · double-click to rename" : "Sort (click to cycle)"}
          >
            <button
              type="button"
              className="column-stats-trigger"
              title={`${TYPE_LABELS[col.type]} column — click for a summary`}
              aria-label={`Summary of ${col.name}`}
              onClick={(event) => { event.stopPropagation(); onOpenColumnStats(col.name); }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <ColumnTypeIcon type={col.type} />
            </button>

            {isRenaming ? (
              <input
                ref={inputRef}
                className={`column-rename-input${problem ? " has-problem" : ""}`}
                value={draft}
                maxLength={MAX_COLUMN_NAME_LENGTH}
                aria-label={`Rename column ${col.name}`}
                aria-invalid={problem ? true : undefined}
                title={problem || "Enter to save · Tab for the next column · Esc to cancel"}
                onChange={(event) => setDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onBlur={() => { void commit(false, true); }}
                onKeyDown={(event) => {
                  // The grid's own key handler must not see these.
                  event.stopPropagation();
                  if (event.key === "Enter") { event.preventDefault(); void commit(false); }
                  else if (event.key === "Tab") { event.preventDefault(); void commit(!event.shiftKey); }
                  else if (event.key === "Escape") { event.preventDefault(); committingRef.current = true; onStopRename(false); }
                }}
              />
            ) : (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.name}</span>
            )}
            {!isRenaming && sortDir === "asc" && <ArrowUp size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
            {!isRenaming && sortDir === "desc" && <ArrowDown size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
          </div>

          {!isRenaming && filterSlot}

          {actions && !isRenaming ? (
            <>
              <button
                ref={menuTriggerRef}
                type="button"
                className="column-menu-trigger"
                title={`Column options for ${col.name}`}
                aria-label={`Column options for ${col.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }}
              >
                <ChevronDown size={14} />
              </button>
              {menuOpen ? (
                <DropdownPortal triggerRef={menuTriggerRef} className="sheet-col-menu" onOutsideClick={() => setMenuOpen(false)}>
                  <div role="menu" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
                    <button type="button" role="menuitem" className="sheet-col-menu-item" onClick={() => runMenu(onStartRename)}>
                      <Pencil size={14} /> Rename
                    </button>
                    <div className="sheet-col-menu-label">Column type</div>
                    <div className="sheet-col-menu-types">
                      {COLUMN_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={col.type === type.value}
                          className={`sheet-col-menu-type${col.type === type.value ? " is-current" : ""}`}
                          onClick={() => runMenu(() => actions.onSetType(col.name, type.value))}
                        >
                          <ColumnTypeIcon type={type.value} />
                          <span>{type.label}</span>
                          {col.type === type.value ? <Check size={13} /> : null}
                        </button>
                      ))}
                    </div>
                    <div className="sheet-col-menu-sep" />
                    <button type="button" role="menuitem" className="sheet-col-menu-item" onClick={() => runMenu(() => { void actions.onInsert(col.name, "left"); })}>
                      <ArrowLeftToLine size={14} /> Insert column left
                    </button>
                    <button type="button" role="menuitem" className="sheet-col-menu-item" onClick={() => runMenu(() => { void actions.onInsert(col.name, "right"); })}>
                      <ArrowRightToLine size={14} /> Insert column right
                    </button>
                    <div className="sheet-col-menu-sep" />
                    <button type="button" role="menuitem" className="sheet-col-menu-item" onClick={() => runMenu(() => onOpenColumnStats(col.name))}>
                      <BarChart3 size={14} /> Summary
                    </button>
                    <button type="button" role="menuitem" className="sheet-col-menu-item" onClick={() => runMenu(() => actions.onHide(col.name))}>
                      <EyeOff size={14} /> Hide column
                    </button>
                    <button type="button" role="menuitem" className="sheet-col-menu-item is-danger" onClick={() => runMenu(() => actions.onDelete(col.name))}>
                      <Trash2 size={14} /> Delete column
                    </button>
                  </div>
                </DropdownPortal>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="col-resize-handle" onMouseDown={onResizeStart} />
    </th>
  );
}
