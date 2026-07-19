/* ------------------------------------------------------------------ */
/*  SheetToolbar — actions row above the sheet grid                    */
/* ------------------------------------------------------------------ */

import { useState, useRef, useEffect } from "react";
import { ExternalLink, Mail, Plus, Settings, Search, EyeOff, X, Columns, Database, Download, Upload, Save, ListFilter, Rows3, Check, Calendar, Info } from "lucide-react";
import type { ColumnDef, CellStyle } from "./sheetModel";
import type { SheetView } from "./sheetFilters";
import { useDialog } from "../DialogProvider";
import { CellStyleBar } from "./CellStyleBar";
import { AskAiMenuFromSheet } from "./AskAiMenu";
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
  onExportCsv,
  onImportCsv,
  onSaveTemplate,
  focusedCell,
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
  onExportCsv: () => void;
  onImportCsv: () => void;
  onSaveTemplate: () => void;
  focusedCell: { rowIndex: number; colName: string } | null;
  selectedRows: Set<number>;
  rows: RecordMap[];
  columns: ColumnDef[];
  onCellStyle: (rowIndex: number, column: string, patch: CellStyle) => void;
  onClearCellFormatting: (rowIndex: number, column: string) => void;
  bulkRowCellStyle: (rowIndices: number[], patch: CellStyle) => void;
  bulkClearRowFormatting: (rowIndices: number[]) => void;
}) {
  const [showDataMenu, setShowDataMenu] = useState(false);
  const dataMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dataMenuRef.current && !dataMenuRef.current.contains(event.target as Node)) {
        setShowDataMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const btnStyle: React.CSSProperties = { fontSize: '11px', padding: '4px 10px' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
              {hasSelection && (
                <span className="format-rail-scope" style={{ fontSize: '10.5px', padding: '2px 6px' }}>
                  Applying to {targetRows.length} selected row{targetRows.length > 1 ? "s" : ""}
                </span>
              )}
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

      {/* Import / Export */}
      <div className="data-menu-container" ref={dataMenuRef} style={{ position: 'relative' }}>
        <button
          className="secondary"
          onClick={() => setShowDataMenu(!showDataMenu)}
          style={btnStyle}
          title="Import/Export data"
        >
          <Database size={12} /> Import / Export
        </button>
        {showDataMenu && (
          <div className="data-dropdown-menu" style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            backgroundColor: 'var(--ui-paper-strong)',
            border: '1px solid var(--ui-line)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px',
            zIndex: 100,
            width: '180px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}>
            <button className="text-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px', fontSize: '13px' }} onClick={() => { setShowDataMenu(false); onExportCsv(); }}>
              <Download size={14} style={{ marginRight: '8px' }} /> Export CSV
            </button>
            <button className="text-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px', fontSize: '13px' }} onClick={() => { setShowDataMenu(false); onImportCsv(); }}>
              <Upload size={14} style={{ marginRight: '8px' }} /> Import CSV
            </button>
            <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }}></div>
            <button className="text-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px', fontSize: '13px' }} onClick={() => { setShowDataMenu(false); onSaveTemplate(); }}>
              <Save size={14} style={{ marginRight: '8px' }} /> Save as Template
            </button>
          </div>
        )}
      </div>

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
  recordsPerSheetLimit,
  fullScreenMode,
  showEditColumns,
  searchQuery,
  onSearchChange,
  onToggleColumnVisibility,
  onAddRow,
  onOpenEditColumns,
  onOpenEmailConfig,
  onOpenDateColors,
  isEmailConfigOpen,
  showDateColorConfig,
  groupBy,
  onGroupByChange,
  savedViews,
  currentViewId,
  onSaveView,
  onLoadView,
  onDeleteView,
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
}) {
  const { showPrompt } = useDialog();
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showViewsMenu, setShowViewsMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const viewsMenuRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
        setShowColumnsMenu(false);
      }
      if (viewsMenuRef.current && !viewsMenuRef.current.contains(event.target as Node)) {
        setShowViewsMenu(false);
      }
      if (groupMenuRef.current && !groupMenuRef.current.contains(event.target as Node)) {
        setShowGroupMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isFiltering = searchQuery.trim().length > 0 || viewRows.length !== rows.length;

  return (
    <div className="sheet-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', ...(fullScreenMode ? { marginBottom: '12px' } : {}) }}>
      <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

        {/* 1. Add Record */}
        <button className="secondary" onClick={onAddRow} disabled={columns.length === 0} title={columns.length === 0 ? "Add columns first" : "Add a new record"} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
          <Plus size={14} /> Add Record
        </button>

        {/* 2. Search */}
        <div className="search-input-wrapper" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search rows..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onSearchChange(""); } }}
            style={{
              paddingLeft: '28px',
              paddingRight: searchQuery ? '24px' : undefined,
              height: fullScreenMode ? '28px' : '32px',
              fontSize: fullScreenMode ? '11px' : '13px',
              width: '180px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 74, 67, 0.28)',
              backgroundColor: 'var(--bg-secondary)'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-button"
              onClick={() => onSearchChange("")}
              title="Clear search (Esc)"
              style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '2px' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Left side ends after search */}

      </div>

      {/* Right side */}
      <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Match count when the view is narrowed by search/filters */}
        {isFiltering && (
          <span className="sheet-match-count" title="Rows matching the current search and filters">
            {viewRows.length} of {rows.length}
          </span>
        )}

        {/* 3. Columns Menu */}
        <div className="columns-menu-container" ref={columnsMenuRef} style={{ position: 'relative' }}>
          <button
            className={`secondary ${showColumnsMenu ? 'active' : ''}`}
            onClick={() => setShowColumnsMenu(!showColumnsMenu)}
            style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}
            title="Hide/show columns"
          >
            <Columns size={14} /> Columns
          </button>
          {showColumnsMenu && (
            <div className="columns-dropdown-menu" style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: 'var(--ui-paper-strong)',
              border: '1px solid var(--ui-line)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '6px 8px',
              zIndex: 100,
              width: '220px',
              maxHeight: '300px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.125px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                Visible columns
              </div>
              {columns.filter(c => c.type !== "group").map(col => (
                <label key={col.name} className="column-visibility-item" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.2px 8px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '12px',
                  lineHeight: '1.2'
                }}>
                  <input
                    type="checkbox"
                    checked={!col.hidden}
                    onChange={() => onToggleColumnVisibility(col.name)}
                    style={{ margin: 0 }}
                  />
                  {col.name}
                  {col.hidden && <EyeOff size={12} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 4. Edit columns */}
        <button className={`secondary btn-edit-columns ${showEditColumns ? 'active' : ''}`} onClick={onOpenEditColumns} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
          <Settings size={14} /> Edit columns
        </button>

        {/* 5. Categorize */}
        <div className="group-menu-container" ref={groupMenuRef} style={{ position: 'relative' }}>
          <button
            className={`secondary ${groupBy || showGroupMenu ? 'active' : ''}`}
            onClick={() => setShowGroupMenu(!showGroupMenu)}
            style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}
            title="Categorize rows"
          >
            <Rows3 size={14} />
            <span style={{ marginLeft: '4px' }}>
              {groupBy ? `Categorized by ${groupBy}` : 'Categorize'}
            </span>
          </button>
          {showGroupMenu && (
            <div className="group-dropdown-menu" style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              backgroundColor: 'var(--ui-paper-strong)', border: '1px solid var(--ui-line)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '6px 8px', zIndex: 100, width: '220px', maxHeight: '300px',
              overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.125px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                Categorize by column
              </div>
              <label className="group-item" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '0.2px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px',
                lineHeight: '1.2'
              }}>
                <input
                  type="radio"
                  name="group_by"
                  checked={groupBy === null}
                  onChange={() => { onGroupByChange(null); setShowGroupMenu(false); }}
                  style={{ margin: 0 }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>None (Flat list)</span>
              </label>

              {columns.filter(c => c.type === 'select' || c.type === 'bool').map(col => (
                <label key={col.name} className="group-item" style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '0.2px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px',
                  lineHeight: '1.2'
                }}>
                  <input
                    type="radio"
                    name="group_by"
                    checked={groupBy === col.name}
                    onChange={() => { onGroupByChange(col.name); setShowGroupMenu(false); }}
                    style={{ margin: 0 }}
                  />
                  {col.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 6. Date Colors */}
        <button className={`secondary ${showDateColorConfig ? 'active' : ''}`} onClick={onOpenDateColors} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
          <Calendar size={14} /> Date Colors
        </button>

        {/* 7. Email Config */}
        <button className={`secondary ${isEmailConfigOpen ? 'active' : ''}`} onClick={onOpenEmailConfig} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
          <Mail size={14} /> Email Config
        </button>

        {/* Views Menu */}
        <div className="views-menu-container" ref={viewsMenuRef} style={{ position: 'relative' }}>
          <button
            className={`secondary ${showViewsMenu || currentViewId ? 'active' : ''}`}
            onClick={() => setShowViewsMenu(!showViewsMenu)}
            style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}
            title="Saved Views"
          >
            <ListFilter size={14} />
            <span style={{ marginLeft: '4px' }}>
              {currentViewId ? savedViews.find(v => v.id === currentViewId)?.name || 'Views' : 'Views'}
            </span>
          </button>
          {showViewsMenu && (
            <div className="views-dropdown-menu" style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              backgroundColor: 'var(--ui-paper-strong)', border: '1px solid var(--ui-line)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '4px', zIndex: 100, width: '200px', display: 'flex',
              flexDirection: 'column', gap: '2px'
            }}>
              <button
                className="text-button"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '6px 12px', fontSize: '13px', color: 'var(--text-secondary)' }}
                onClick={() => { setShowViewsMenu(false); onLoadView(null); }}
              >
                <span>Reset to default</span>
              </button>

              {savedViews.length > 0 && <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>}

              {savedViews.map(view => (
                <div key={view.id} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <button
                    className={`text-button ${currentViewId === view.id ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'space-between', padding: '6px 12px', fontSize: '13px' }}
                    onClick={() => { setShowViewsMenu(false); onLoadView(view.id); }}
                  >
                    <span>{view.name}</span>
                    {currentViewId === view.id && <Check size={14} />}
                  </button>
                </div>
              ))}

              <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
              <button
                className="text-button"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px', fontSize: '13px' }}
                onClick={async () => {
                  setShowViewsMenu(false);
                  const name = await showPrompt("Save current view as:");
                  if (name) onSaveView(name);
                }}
                title="Saves your current filters, sorting, column visibility, and grouping state so you can quickly restore them later."
              >
                <Save size={14} style={{ marginRight: '8px' }} /> Save view
                <Info size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
