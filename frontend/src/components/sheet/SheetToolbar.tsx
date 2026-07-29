/* ------------------------------------------------------------------ */
/*  SheetToolbar — actions row above the sheet grid                    */
/* ------------------------------------------------------------------ */

import { useRef, useState } from "react";
import { Calendar, Check, Columns, Database, Download, ExternalLink, Eye, EyeOff, Keyboard, ListFilter, Mail, Palette, Pin, Plus, Rows3, Save, Search, Settings, Table2, Trash2, Upload, X } from "lucide-react";
import type { ColumnDef, CellStyle } from "./sheetModel";
import type { SheetView } from "./sheetFilters";
import { useDialog } from "../DialogProvider";
import { CellStyleBar } from "./CellStyleBar";
import { AskAiMenuFromSheet } from "./AskAiMenu";
import { DropdownPortal } from "./DropdownPortal";
import { SheetMenu, SheetMenuDivider, SheetMenuItem, SheetMenuLabel, SheetMenuToggle } from "./SheetMenu";
import { DENSITIES, type Density } from "./sheetGrid";
import "./sheet-chrome.css";
import type { RecordMap } from "../../lib/api";

/* ------------------------------------------------------------------ */
/*  SheetToolbarActions — right-side actions placed in the section     */
/*  header next to the sheet name                                      */
/* ------------------------------------------------------------------ */

export function SheetToolbarActions({
  fullScreenMode,
  selectedProjectId,
  selectedPageId,
  selectedSheetId,
  projectName,
  sheetName,
  degreeType,
  onAskAi,
  focusedCell,
  onClearFocus,
  selectedRows,
  rows,
  columns,
  onCellStyle,
  onClearCellFormatting,
  bulkRowCellStyle,
  bulkClearRowFormatting,
}: {
  fullScreenMode: boolean;
  selectedProjectId: string;
  selectedPageId: string;
  /** SCHOLARDOCX-0150: project_sheets.id, so prompts target the exact sheet by ID. */
  selectedSheetId?: string;
  projectName: string;
  sheetName: string;
  degreeType?: string;
  /** SCHOLARDOCX-0150: receives the built prompt message. */
  onAskAi: (message: string) => void;
  focusedCell: { rowIndex: number; colName: string } | null;
  onClearFocus: () => void;
  selectedRows: Set<number>;
  rows: RecordMap[];
  columns: ColumnDef[];
  onCellStyle: (rowIndex: number, column: string, patch: CellStyle) => void;
  onClearCellFormatting: (rowIndex: number, column: string) => void;
  bulkRowCellStyle: (rowIndices: number[], patch: CellStyle) => void;
  bulkClearRowFormatting: (rowIndices: number[]) => void;
}) {
  const btnStyle: React.CSSProperties = { fontSize: '11px', padding: '4px 10px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', flexShrink: 0 }}>
      {focusedCell && (
        (() => {
          const hasSelection = selectedRows.size > 0;
          const targetRows = hasSelection
            ? [...selectedRows].sort((a, b) => a - b)
            : [focusedCell.rowIndex];
          const colName = focusedCell.colName;

          const firstRow = rows[targetRows[0]];
          const displayStyle = firstRow
            ? JSON.parse(firstRow._cellStyles || "{}")[colName] || {}
            : {};

          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px', maxWidth: '100%', minWidth: 0, overflowX: 'auto', flexShrink: 0 }}>
              {hasSelection && (
                <span className="format-rail-scope" style={{ fontSize: '10.5px', padding: '2px 6px' }}>
                  Applying to {targetRows.length} selected row{targetRows.length > 1 ? "s" : ""}
                </span>
              )}
              {/* A selected cell had no visible way out — Escape worked only
                  when the grid container happened to hold focus, so in
                  practice the highlight was stuck. */}
              <button
                type="button"
                className="sheet-cell-clear"
                onClick={() => onClearFocus()}
                title="Deselect this cell (Esc)"
                aria-label="Deselect cell"
              >
                <X size={12} /> Deselect cell
              </button>
              <CellStyleBar
                style={displayStyle}
                onChange={(patch) => {
                  if (hasSelection) {
                    bulkRowCellStyle(targetRows, patch);
                  } else {
                    onCellStyle(focusedCell.rowIndex, colName, patch);
                  }
                }}
                onClear={() => {
                  if (hasSelection) {
                    bulkClearRowFormatting(targetRows);
                  } else {
                    onClearCellFormatting(focusedCell.rowIndex, colName);
                  }
                }}
                compact
              />
            </div>
          );
        })()
      )}

      {/* Import / Export used to live here as its own menu, duplicating the
          Data menu in the toolbar below — two controls, different labels,
          same three actions. Removed; "Save as Template" moved into Data,
          which is where the rest of it already was. */}

      {/* Ask AI — SCHOLARDOCX-0150: dropdown of context-aware prompts */}
      <AskAiMenuFromSheet
        projectId={selectedProjectId}
        sheetId={selectedSheetId}
        projectName={projectName}
        sheetName={sheetName}
        degreeType={degreeType}
        columns={columns}
        rows={rows}
        selectedRows={selectedRows}
        focusedCell={focusedCell}
        onPick={onAskAi}
        btnStyle={btnStyle}
      />

      {/* Full Screen */}
      <button
        className="secondary"
        onClick={() => {
          const url = `/sheet/fullscreen?projectId=${selectedProjectId}&pageId=${selectedPageId}`;
          window.open(url, '_blank');
        }}
        title="Open sheet in full screen"
        style={{ ...btnStyle, display: fullScreenMode ? 'none' : 'inline-flex' }}
      >
        <ExternalLink size={12} /> Full Screen
      </button>
    </div>
  );
}

export function SheetToolbar({
  columns,
  rows,
  viewRows,
  fullScreenMode,
  showEditColumns,
  isEmailConfigOpen,
  showDateColorConfig,
  searchQuery,
  onSearchChange,
  onToggleColumnVisibility,
  onAddRow,
  onOpenEditColumns,
  onOpenEmailConfig,
  onOpenDateColors,
  groupBy,
  onGroupByChange,
  savedViews,
  currentViewId,
  onSaveView,
  onLoadView,
  onDeleteView,
  density,
  onDensityChange,
  onOpenShortcuts,
  onOpenFormatRules,
  ruleCount,
  onExportCsv,
  onImportCsv,
  onSaveTemplate,
}: {
  columns: ColumnDef[];
  rows: Record<string, string>[];
  viewRows: Record<string, string>[];
  recordsPerSheetLimit: number;
  fullScreenMode: boolean;
  showEditColumns: boolean;
  isEmailConfigOpen?: boolean;
  showDateColorConfig?: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggleColumnVisibility: (columnName: string) => void;
  onAddRow: () => void;
  onOpenEditColumns: () => void;
  onOpenEmailConfig: () => void;
  onOpenDateColors: () => void;
  groupBy: string | null;
  onGroupByChange: (col: string | null) => void;
  savedViews: SheetView[];
  currentViewId: string | null;
  onSaveView: (name: string) => void;
  onLoadView: (id: string | null) => void;
  onDeleteView: (id: string) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  onOpenShortcuts: () => void;
  onOpenFormatRules: () => void;
  ruleCount: number;
  onExportCsv: () => void;
  onImportCsv: () => void;
  onSaveTemplate: () => void;
}) {
  const { showPrompt, showConfirm } = useDialog();
  const searchRef = useRef<HTMLInputElement>(null);

  const dataColumns = columns.filter((col) => col.type !== "group");
  const hiddenCount = dataColumns.filter((col) => col.hidden).length;
  const groupableColumns = columns.filter((col) => col.type === "select" || col.type === "bool");
  const isFiltering = searchQuery.trim().length > 0 || viewRows.length !== rows.length;
  const activeView = savedViews.find((view) => view.id === currentViewId);

  return (
    <div className={`sheet-toolbar${fullScreenMode ? " is-fullscreen" : ""}`}>
      {/* Primary actions: the two things people came here to do. Everything
          else is a tool and lives in a menu — the old bar gave eight
          controls identical weight and then scrolled them off the edge. */}
      <div className="sheet-toolbar-primary">
        <button
          type="button"
          className="sheet-btn is-primary"
          onClick={onAddRow}
          disabled={dataColumns.length === 0}
          title={dataColumns.length === 0 ? "Add a column first" : "Add a new record"}
        >
          <Plus size={14} /> <span className="sheet-btn-label">Add record</span>
        </button>

        <div className={`sheet-search${searchQuery ? " has-value" : ""}`}>
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            placeholder="Search rows…"
            aria-label="Search rows"
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              onSearchChange("");
            }}
          />
          {searchQuery ? (
            <button type="button" onClick={() => onSearchChange("")} title="Clear search (Esc)" aria-label="Clear search">
              <X size={12} />
            </button>
          ) : null}
        </div>

        {isFiltering ? (
          <span className="sheet-match-count" title="Rows matching the current search and filters">
            {viewRows.length} of {rows.length}
          </span>
        ) : null}
      </div>

      <div className="sheet-toolbar-tools">
        {/* View — what you can see and how it is arranged. */}
        {/* "View" and "Views" were adjacent and differed by one letter, which
            is not a distinction anyone should have to make at a glance.
            "Display" covers how the grid is shown; "Saved views" covers
            stored arrangements. No shared stem. */}
        <SheetMenu
          label="Display"
          icon={<Table2 size={14} />}
          active={Boolean(groupBy) || hiddenCount > 0}
          badge={hiddenCount ? `${hiddenCount} hidden` : null}
          title="Row height, columns, grouping"
        >
          {(close) => (
            <>
              <SheetMenuLabel>Row height</SheetMenuLabel>
              {(Object.keys(DENSITIES) as Density[]).map((key) => (
                <SheetMenuToggle
                  key={key}
                  kind="radio"
                  name="sheet-density"
                  checked={density === key}
                  onChange={() => onDensityChange(key)}
                >
                  {DENSITIES[key].label}
                </SheetMenuToggle>
              ))}

              <SheetMenuDivider />
              {/* A <select>, not a radio per column. This sheet has ten
                  groupable columns, and eleven radio rows pushed everything
                  below them — including the whole "Show columns" list — off
                  the bottom of the menu, where it read as empty. One control
                  is also simply the right shape for "pick one of many". */}
              <SheetMenuLabel>Categorise rows</SheetMenuLabel>
              {groupableColumns.length ? (
                <label className="sheet-menu-select">
                  <select
                    value={groupBy ?? ""}
                    aria-label="Categorise rows by column"
                    onChange={(event) => onGroupByChange(event.target.value || null)}
                  >
                    <option value="">None — one flat list</option>
                    {groupableColumns.map((col) => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="sheet-menu-empty">
                  Rows group by a dropdown or yes/no column. There isn’t one on this sheet yet.
                </p>
              )}

              <SheetMenuDivider />
              <SheetMenuLabel>
                Show columns
                {hiddenCount ? <span className="sheet-menu-label-note">{hiddenCount} hidden</span> : null}
              </SheetMenuLabel>
              {dataColumns.length ? (
                <div className="sheet-menu-scroll">
                  {dataColumns.map((col) => (
                    <SheetMenuToggle
                      key={col.name}
                      checked={!col.hidden}
                      onChange={() => onToggleColumnVisibility(col.name)}
                      trailing={col.hidden ? <EyeOff size={12} /> : null}
                    >
                      {col.name}
                    </SheetMenuToggle>
                  ))}
                </div>
              ) : (
                <p className="sheet-menu-empty">No columns yet.</p>
              )}
            </>
          )}
        </SheetMenu>

        {/* Views — saved arrangements of the above. */}
        <SheetMenu
          label={activeView ? activeView.name : "Saved views"}
          icon={<ListFilter size={14} />}
          active={Boolean(currentViewId)}
          title="Saved views — stored filters, sorting and column layouts"
          width={224}
        >
          {(close) => (
            <>
              <SheetMenuLabel>Saved views</SheetMenuLabel>
              {savedViews.length ? (
                savedViews.map((view) => (
                  <div className="sheet-menu-row" key={view.id}>
                    <SheetMenuItem
                      selected={currentViewId === view.id}
                      icon={currentViewId === view.id ? <Check size={13} /> : <span />}
                      onClick={() => { onLoadView(view.id); close(); }}
                    >
                      {view.name}
                    </SheetMenuItem>
                    <button
                      type="button"
                      className="sheet-menu-row-delete"
                      title={`Delete the "${view.name}" view`}
                      aria-label={`Delete the ${view.name} view`}
                      onClick={async () => {
                        // A saved view is a few minutes of setup, so this
                        // asks first — unlike the old menu, which offered no
                        // way to delete one at all.
                        const ok = await showConfirm(`Delete the "${view.name}" view? The rows are not affected.`, "Delete view");
                        if (ok) onDeleteView(view.id);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="sheet-menu-empty">
                  A view remembers your filters, sorting, hidden columns and grouping.
                </p>
              )}

              <SheetMenuDivider />
              <SheetMenuItem
                icon={<Save size={13} />}
                onClick={async () => {
                  close();
                  const name = await showPrompt("Save current view as:");
                  if (name) onSaveView(name);
                }}
                hint="Remembers your filters, sorting, column visibility and grouping."
              >
                Save this arrangement
              </SheetMenuItem>
              <SheetMenuItem
                icon={<Eye size={13} />}
                onClick={() => { onLoadView(null); close(); }}
              >
                Reset to default
              </SheetMenuItem>
            </>
          )}
        </SheetMenu>

        {/* Format — how the grid looks, as opposed to what it shows. */}
        <SheetMenu
          label="Format"
          icon={<Palette size={14} />}
          active={Boolean(showDateColorConfig) || showEditColumns || ruleCount > 0}
          title="Columns and colours"
        >
          {(close) => (
            <>
              <SheetMenuItem icon={<Settings size={13} />} onClick={() => { onOpenEditColumns(); close(); }}>
                Edit columns…
              </SheetMenuItem>
              <SheetMenuItem icon={<Calendar size={13} />} onClick={() => { onOpenDateColors(); close(); }}>
                Deadline colours…
              </SheetMenuItem>
              <SheetMenuItem icon={<Palette size={13} />} onClick={() => { onOpenFormatRules(); close(); }}>
                Colour rules…
                {ruleCount ? <span className="sheet-btn-badge">{ruleCount}</span> : null}
              </SheetMenuItem>
            </>
          )}
        </SheetMenu>

        {/* Data — things that cross the sheet's boundary. */}
        <SheetMenu
          label="Data"
          icon={<Database size={14} />}
          active={Boolean(isEmailConfigOpen)}
          title="Import, export and email"
          width={224}
        >
          {(close) => (
            <>
              <SheetMenuItem icon={<Upload size={13} />} onClick={() => { onImportCsv(); close(); }}>
                Import from CSV…
              </SheetMenuItem>
              <SheetMenuItem icon={<Download size={13} />} onClick={() => { onExportCsv(); close(); }}>
                Export to CSV
              </SheetMenuItem>
              <SheetMenuItem icon={<Save size={13} />} onClick={() => { onSaveTemplate(); close(); }}>
                Save columns as a template
              </SheetMenuItem>
              <SheetMenuDivider />
              <SheetMenuItem icon={<Mail size={13} />} onClick={() => { onOpenEmailConfig(); close(); }}>
                Email settings…
              </SheetMenuItem>
            </>
          )}
        </SheetMenu>

        <button
          type="button"
          className="sheet-btn sheet-btn-icon"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={14} />
        </button>
      </div>
    </div>
  );
}
