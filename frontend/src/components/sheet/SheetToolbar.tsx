/* ------------------------------------------------------------------ */
/*  SheetToolbar — actions row above the sheet grid                    */
/* ------------------------------------------------------------------ */

import { useState, useRef, useEffect } from "react";
import { ExternalLink, Mail, Plus, Settings, Search, EyeOff, Eye, Columns, Database, Download, Upload, Save, ListFilter, Rows3, Check, Calendar, Sparkles, Info } from "lucide-react";
import type { ColumnDef } from "./sheetModel";
import type { SheetView } from "./sheetFilters";
import { useDialog } from "../DialogProvider";

export function SheetToolbar({
  columns,
  rows,
  viewRows,
  recordsPerSheetLimit,
  fullScreenMode,
  selectedProjectId,
  selectedPageId,
  showEditColumns,
  searchQuery,
  onSearchChange,
  onToggleColumnVisibility,
  onAddRow,
  onOpenEditColumns,
  onOpenEmailConfig,
  onOpenDateColors,
  onAskAI,
  onExportCsv,
  onImportCsv,
  onSaveTemplate,
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
  selectedProjectId: string;
  selectedPageId: string;
  showEditColumns: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggleColumnVisibility: (columnName: string) => void;
  onAddRow: () => void;
  onOpenEditColumns: () => void;
  onOpenEmailConfig: () => void;
  onOpenDateColors: () => void;
  onAskAI: () => void;
  onExportCsv: () => void;
  onImportCsv: () => void;
  onSaveTemplate: () => void;
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
  const [showDataMenu, setShowDataMenu] = useState(false);
  const [showViewsMenu, setShowViewsMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const dataMenuRef = useRef<HTMLDivElement>(null);
  const viewsMenuRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
        setShowColumnsMenu(false);
      }
      if (dataMenuRef.current && !dataMenuRef.current.contains(event.target as Node)) {
        setShowDataMenu(false);
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
    <div className="sheet-toolbar" style={fullScreenMode ? { marginBottom: '12px', gap: '8px' } : {}}>
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
            style={{ 
              paddingLeft: '28px', 
              height: fullScreenMode ? '28px' : '32px',
              fontSize: fullScreenMode ? '11px' : '13px',
              width: '180px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-button"
              onClick={() => onSearchChange("")}
              style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '2px' }}
            >
              <EyeOff size={12} />
            </button>
          )}
        </div>

        {/* 3. Columns Menu */}
        <div className="columns-menu-container" ref={columnsMenuRef} style={{ position: 'relative' }}>
          <button 
            className="secondary"
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
              left: 0,
              marginTop: '4px',
              backgroundColor: 'var(--ui-paper-strong)',
              border: '1px solid var(--ui-line)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '8px',
              zIndex: 100,
              width: '220px',
              maxHeight: '300px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, padding: '4px 8px', color: 'var(--text-secondary)' }}>
                Visible columns
              </div>
              {columns.filter(c => c.type !== "group").map(col => (
                <label key={col.name} className="column-visibility-item" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}>
                  <input 
                    type="checkbox" 
                    checked={!col.hidden}
                    onChange={() => onToggleColumnVisibility(col.name)}
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

        {/* 5. Group */}
        <div className="group-menu-container" ref={groupMenuRef} style={{ position: 'relative' }}>
          <button 
            className={`secondary ${groupBy ? 'active' : ''}`}
            onClick={() => setShowGroupMenu(!showGroupMenu)}
            style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}
            title="Group rows"
          >
            <Rows3 size={14} /> 
            <span style={{ marginLeft: '4px' }}>
              {groupBy ? `Grouped by ${groupBy}` : 'Group'}
            </span>
          </button>
          {showGroupMenu && (
            <div className="group-dropdown-menu" style={{
              position: 'absolute', top: '100%', left: 0, marginTop: '4px',
              backgroundColor: 'var(--ui-paper-strong)', border: '1px solid var(--ui-line)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '8px', zIndex: 100, width: '220px', maxHeight: '300px',
              overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, padding: '4px 8px', color: 'var(--text-secondary)' }}>
                Group by column
              </div>
              <label className="group-item" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px'
              }}>
                <input 
                  type="radio" 
                  name="group_by" 
                  checked={groupBy === null}
                  onChange={() => { onGroupByChange(null); setShowGroupMenu(false); }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>None (Flat list)</span>
              </label>
              
              {columns.filter(c => c.type === 'select' || c.type === 'bool').map(col => (
                <label key={col.name} className="group-item" style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px'
                }}>
                  <input 
                    type="radio" 
                    name="group_by" 
                    checked={groupBy === col.name}
                    onChange={() => { onGroupByChange(col.name); setShowGroupMenu(false); }}
                  />
                  {col.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 6. Date Colors */}
        <button className="secondary" onClick={onOpenDateColors} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
          <Calendar size={14} /> Date Colors
        </button>

        {/* 7. Email Config */}
        <button className="secondary" onClick={onOpenEmailConfig} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
          <Mail size={14} /> Email Config
        </button>

        {/* 8. Views Menu */}
        <div className="views-menu-container" ref={viewsMenuRef} style={{ position: 'relative' }}>
          <button 
            className="secondary"
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
              position: 'absolute', top: '100%', left: 0, marginTop: '4px',
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
                <Save size={14} style={{ marginRight: '8px' }}/> Save view
                <Info size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
              </button>
            </div>
          )}
        </div>

      </div>

      <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
        
        {/* Data */}
        <div className="data-menu-container" ref={dataMenuRef} style={{ position: 'relative' }}>
          <button 
            className="secondary"
            onClick={() => setShowDataMenu(!showDataMenu)}
            style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}
            title="Import/Export data"
          >
            <Database size={14} /> Import / Export
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
                <Download size={14} style={{ marginRight: '8px' }}/> Export CSV
              </button>
              <button className="text-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px', fontSize: '13px' }} onClick={() => { setShowDataMenu(false); onImportCsv(); }}>
                <Upload size={14} style={{ marginRight: '8px' }}/> Import CSV
              </button>
              <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }}></div>
              <button className="text-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px', fontSize: '13px' }} onClick={() => { setShowDataMenu(false); onSaveTemplate(); }}>
                <Save size={14} style={{ marginRight: '8px' }}/> Save as Template
              </button>
            </div>
          )}
        </div>

        {/* Ask AI */}
        <button className="secondary" onClick={onAskAI} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px', color: 'var(--ui-brand)' } : { color: 'var(--ui-brand)' }}>
          <Sparkles size={14} /> Ask AI
        </button>

        {/* Full Screen */}
        <button 
          className="secondary" 
          onClick={() => {
            const url = `/sheet/fullscreen?projectId=${selectedProjectId}&pageId=${selectedPageId}`;
            window.open(url, '_blank');
          }}
          title="Open sheet in full screen"
          style={{ display: fullScreenMode ? 'none' : 'inline-flex' }}
        >
          <ExternalLink size={16} /> Full Screen
        </button>
      </div>
    </div>
  );
}
