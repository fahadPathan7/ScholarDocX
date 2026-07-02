/* ------------------------------------------------------------------ */
/*  SheetTable — the data grid (headers, rows, cells, resize, scroll)  */
/* ------------------------------------------------------------------ */

import React, { useState, useRef, useEffect } from "react";
import { Edit, Mail, Trash2, ArrowUp, ArrowDown, Filter, X, Copy, Eye, ChevronRight, ChevronDown } from "lucide-react";
import { CellRenderer, rowClass } from "../SheetRecordFields";
import type { ColumnDef, ColumnType, DateColorConfig } from "./sheetModel";
import type { RecordMap } from "../../lib/api";
import { SortState, ColumnFilter, DateFilterPreset } from "./sheetFilters";

/* ------------------------------------------------------------------ */
/*  RenderColumn type for group/data column layout                     */
/* ------------------------------------------------------------------ */

type RenderColumn = 
  | { type: 'data'; col: ColumnDef; originalIndex: number; groupName?: string }
  | { type: 'group-control'; groupName: string; collapsed: boolean };

/* ------------------------------------------------------------------ */
/*  Build renderColumns from columns + collapsedGroups                 */
/* ------------------------------------------------------------------ */

function buildRenderColumns(columns: ColumnDef[], collapsedGroups: Record<string, boolean>): RenderColumn[] {
  const renderColumns: RenderColumn[] = [];

  // Filter out hidden columns entirely for rendering
  const visibleColumns = columns.map((c, i) => ({ ...c, originalIndex: i })).filter(c => !c.hidden);

  visibleColumns.forEach((col) => {
    if (col.type === "group") {
      const groupName = col.name;
      const isCollapsed = collapsedGroups[groupName] ?? true;
      renderColumns.push({
        type: 'group-control',
        groupName,
        collapsed: isCollapsed
      });

      if (!isCollapsed) {
        visibleColumns.forEach((childCol) => {
          if (childCol.type !== "group" && childCol.group === groupName) {
            renderColumns.push({
              type: 'data',
              col: childCol,
              originalIndex: childCol.originalIndex,
              groupName
            });
          }
        });
      }
    } else if (!col.group || !visibleColumns.some(c => c.type === "group" && c.name === col.group)) {
      renderColumns.push({
        type: 'data',
        col,
        originalIndex: col.originalIndex
      });
    }
  });

  return renderColumns;
}

/* ------------------------------------------------------------------ */
/*  SheetTable component                                               */
/* ------------------------------------------------------------------ */

export function SheetTable({
  columns,
  rows,
  viewRows,
  files,
  fullScreenMode,
  collapsedGroups,
  focusedRowIndex,
  sortState,
  filters,
  onToggleGroup,
  onResizeColumn,
  onResizeRow,
  onSaveCellValue,
  onEditRow,
  onCompose,
  onDeleteRow,
  onFilesChanged,
  onToggleSort,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  onReorderColumn,
  selectedRows,
  onToggleRowSelection,
  onSelectAll,
  focusedCell,
  onFocusedCellChange,
  onUndo,
  onRedo,
  groupBy,
  dateColorConfig,
  onPeekRow,
}: {
  columns: ColumnDef[];
  rows: Record<string, string>[];
  viewRows: Record<string, string>[];
  files: RecordMap[];
  fullScreenMode: boolean;
  collapsedGroups: Record<string, boolean>;
  focusedRowIndex: number | null;
  sortState: SortState;
  filters: ColumnFilter[];
  onToggleGroup: (groupName: string) => void;
  onResizeColumn: (e: React.MouseEvent, index: number) => void;
  onResizeRow: (e: React.MouseEvent, rowIndex: number) => void;
  onSaveCellValue: (rowIndex: number, colName: string, value: string) => void;
  onEditRow: (rowIndex: number) => void;
  onCompose: (row: Record<string, string>) => void;
  onDeleteRow: (rowIndex: number) => void;
  onFilesChanged: () => Promise<void>;
  onToggleSort: (columnName: string) => void;
  onAddFilter: (filter: ColumnFilter) => void;
  onRemoveFilter: (columnName: string) => void;
  onClearFilters: () => void;
  onReorderColumn: (fromIndex: number, toIndex: number) => Promise<void>;
  selectedRows: Set<number>;
  onToggleRowSelection: (rowIndex: number, extend: boolean) => void;
  onSelectAll: () => void;
  focusedCell: { rowIndex: number, colName: string } | null;
  onFocusedCellChange: (cell: { rowIndex: number, colName: string } | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  groupBy?: string | null;
  dateColorConfig?: DateColorConfig;
  onPeekRow?: (rowIndex: number) => void;
}) {
  const renderColumns = buildRenderColumns(columns, collapsedGroups);
  
  // Header filter menu state
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setActiveFilterMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, originalIndex: number) => {
    setDraggedIndex(originalIndex);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, originalIndex: number) => {
    e.preventDefault();
    setDragOverIndex(originalIndex);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      await onReorderColumn(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Global undo/redo
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
      return;
    }

    if (!focusedCell) return;
    
    // Check if we're actually inside a cell editor (input or textarea)
    // If so, let the editor handle most keys except Escape
    const activeEl = document.activeElement;
    const isEditing = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";

    if (e.key === "Escape") {
      onFocusedCellChange(null);
      // Blur the element if editing
      if (isEditing) (activeEl as HTMLElement).blur();
      return;
    }

    if (isEditing) return; // Ignore nav keys while typing

    const { rowIndex, colName } = focusedCell;
    const visibleDataCols = renderColumns.filter(c => c.type === 'data');
    const colIdx = visibleDataCols.findIndex(c => c.type === 'data' && c.col.name === colName);

    if (colIdx === -1) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIndex > 0) onFocusedCellChange({ rowIndex: rowIndex - 1, colName });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex < viewRows.length - 1) onFocusedCellChange({ rowIndex: rowIndex + 1, colName });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIdx > 0) onFocusedCellChange({ rowIndex, colName: (visibleDataCols[colIdx - 1] as any).col.name });
    } else if (e.key === "ArrowRight" || e.key === "Tab") {
      e.preventDefault();
      if (colIdx < visibleDataCols.length - 1) {
        onFocusedCellChange({ rowIndex, colName: (visibleDataCols[colIdx + 1] as any).col.name });
      } else if (e.key === "Tab" && rowIndex < viewRows.length - 1) {
        // Tab wraps to next row
        onFocusedCellChange({ rowIndex: rowIndex + 1, colName: (visibleDataCols[0] as any).col.name });
      }
    }
  };

  // State to force editor open when Enter is pressed
  const [editingCell, setEditingCell] = useState<{rowIndex: number, colName: string} | null>(null);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (focusedCell && e.key === "Enter") {
        const activeEl = document.activeElement;
        const isEditing = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
        if (!isEditing) {
          e.preventDefault();
          setEditingCell(focusedCell);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [focusedCell]);

  return (
    <div 
      className="sheet-scroll" 
      style={fullScreenMode ? { fontSize: '11px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' } : {}}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={(e) => {
        // If focusing the container without a cell, default to first cell
        if (!focusedCell && viewRows.length > 0 && e.target === e.currentTarget) {
          const firstCol = renderColumns.find(c => c.type === 'data');
          if (firstCol && firstCol.type === 'data') {
            onFocusedCellChange({ rowIndex: 0, colName: firstCol.col.name });
          }
        }
      }}
    >
      {/* Active filters chips area */}
      {filters.length > 0 && (
        <div className="active-filters-row" style={{ display: 'flex', gap: '8px', padding: '8px 12px', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Filter size={12}/> Filters:</span>
          {filters.map(f => (
            <div key={f.column} className="filter-chip" style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>
              <span style={{ fontWeight: 600 }}>{f.column}</span>
              <button className="icon-button" style={{ padding: '2px' }} onClick={() => onRemoveFilter(f.column)}><X size={12}/></button>
            </div>
          ))}
          <button className="text-button" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={onClearFilters}>Clear all</button>
        </div>
      )}

      <table className="sheet-table grouped-table" style={fullScreenMode ? { fontSize: '11px' } : {}}>
        <thead>
          <tr>
            <th className="row-index-header" style={{ width: '40px', minWidth: '40px', textAlign: 'center', padding: '0' }}>
              <input 
                type="checkbox" 
                className="row-checkbox"
                title="Select all rows"
                checked={selectedRows.size === viewRows.length && viewRows.length > 0}
                onChange={onSelectAll}
                style={{ width: '13px', height: '13px', margin: 0, padding: 0 }}
              />
            </th>
            {renderColumns.map((rCol, cIndex) => {
              const groupDef = columns.find(c => c.type === 'group' && c.name === rCol.groupName);
              const groupColor = groupDef?.color || "#2f6d7a";
              
              if (rCol.type === 'group-control') {
                return (
                  <th 
                    key={`ctrl-${rCol.groupName}`} 
                    className="group-control-cell"
                    style={{ 
                      width: groupDef?.width ? `${groupDef.width}px` : "130px", 
                      cursor: "pointer",
                      ...(fullScreenMode ? { padding: '4px 6px', fontSize: '11px' } : {})
                    }}
                    onClick={() => onToggleGroup(rCol.groupName)}
                  >
                    <div className="column-head-text" style={{ fontWeight: 600, color: groupColor, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '4px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rCol.groupName}</span>
                      {rCol.collapsed ? <ChevronRight size={14} style={{ opacity: 0.7, flexShrink: 0 }} /> : <ChevronDown size={14} style={{ opacity: 0.7, flexShrink: 0 }} />}
                    </div>
                  </th>
                );
              } else {
                const isSorted = sortState.column === rCol.col.name;
                const sortDir = isSorted ? sortState.direction : "off";
                const isFiltered = filters.some(f => f.column === rCol.col.name);
                const isDragged = draggedIndex === rCol.originalIndex;
                const isDragOver = dragOverIndex === rCol.originalIndex;

                return (
                  <th 
                    key={`col-${rCol.col.name}-${cIndex}`}
                    className={`${rCol.groupName ? "group-child-cell" : ""} ${isDragged ? "dragging" : ""} ${isDragOver ? "drag-over" : ""}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, rCol.originalIndex)}
                    onDragOver={(e) => handleDragOver(e, rCol.originalIndex)}
                    onDrop={(e) => handleDrop(e, rCol.originalIndex)}
                    onDragEnd={handleDragEnd}
                    style={{ 
                      width: rCol.col.width ? `${rCol.col.width}px` : "150px", 
                      position: "relative",
                      zIndex: activeFilterMenu === rCol.col.name ? 100 : 1,
                      ...(fullScreenMode ? { padding: '4px 6px', fontSize: '11px' } : {})
                    }}
                  >
                    <div className="column-head-inner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', width: '100%', height: '100%', minHeight: '38px', gap: '3px' }}>

                      {rCol.groupName && (
                        <span className="group-parent-indicator" style={{ color: groupColor, borderColor: groupColor, opacity: 0.9, alignSelf: 'flex-start' }}>
                          {rCol.groupName}
                        </span>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '4px', minWidth: 0 }}>
                        <div
                          className="column-head-text"
                          onClick={() => onToggleSort(rCol.col.name)}
                          style={{ cursor: 'pointer', flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rCol.col.name}</span>
                          {sortDir === "asc" && <ArrowUp size={13} style={{ color: 'var(--primary)', flexShrink: 0 }}/>}
                          {sortDir === "desc" && <ArrowDown size={13} style={{ color: 'var(--primary)', flexShrink: 0 }}/>}
                        </div>

                        <div className="column-filter-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                          <button
                            className={`icon-button ${isFiltered ? 'active-filter' : ''}`}
                            onClick={(e) => { e.stopPropagation(); setActiveFilterMenu(activeFilterMenu === rCol.col.name ? null : rCol.col.name); }}
                            style={{
                              padding: '2px',
                              color: isFiltered ? 'var(--primary)' : 'var(--text-secondary)',
                              opacity: isFiltered ? 1 : 0.6,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Filter size={14} />
                          </button>

                          {activeFilterMenu === rCol.col.name && (
                            <div
                              ref={filterMenuRef}
                              className="filter-popup-menu"
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: cIndex < 3 ? 0 : 'auto',
                                right: cIndex >= 3 ? 0 : 'auto',
                                marginTop: '4px',
                                backgroundColor: 'var(--ui-paper-strong)',
                                border: '1px solid var(--ui-line)',
                                color: 'var(--ui-ink)',
                                textAlign: 'left',
                                fontWeight: 'normal',
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                padding: '12px',
                                zIndex: 100,
                                width: '240px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                cursor: 'default'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FilterMenuContent
                                col={rCol.col}
                                currentFilter={filters.find(f => f.column === rCol.col.name)}
                                onApply={(f) => { onAddFilter(f); setActiveFilterMenu(null); }}
                                onClear={() => { onRemoveFilter(rCol.col.name); setActiveFilterMenu(null); }}
                                onClose={() => setActiveFilterMenu(null)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div 
                      className="col-resize-handle"
                      onMouseDown={(e) => onResizeColumn(e, rCol.originalIndex)}
                    />
                  </th>
                );
              }
            })}
            <th style={{ 
              width: "140px", 
              minWidth: "140px",
              ...(fullScreenMode ? { padding: '4px 6px', fontSize: '11px', width: '100px', minWidth: '100px' } : {})
            }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let prevGroupVal: string | undefined = undefined;
            return viewRows.map((row, _idx) => {
              const rowIndex = rows.indexOf(row);
              const isRowSelected = selectedRows.has(rowIndex);
              
              const rowGroupVal = groupBy ? (row[groupBy] || "(Empty)") : undefined;
              let groupHeader = null;
              
              const groupStateKey = `__group_${groupBy}_${rowGroupVal}`;
              // Groups are expanded by default (false = not collapsed)
              const isGroupCollapsed = groupBy ? (collapsedGroups[groupStateKey] ?? false) : false;

              if (groupBy && rowGroupVal !== prevGroupVal) {
                prevGroupVal = rowGroupVal;
                groupHeader = (
                  <tr key={`group-header-${rowGroupVal}`} className="sheet-table-row group-header-row" onClick={() => onToggleGroup(groupStateKey)}>
                    <td colSpan={renderColumns.length + 2} style={{ 
                      padding: '8px 12px', 
                      fontWeight: 600, 
                      backgroundColor: 'var(--bg-secondary)', 
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <span style={{ display: 'inline-block', width: '20px', transition: 'transform 0.2s', transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                        ▼
                      </span>
                      {rowGroupVal}
                    </td>
                  </tr>
                );
              }
              
              if (isGroupCollapsed) {
                return <React.Fragment key={`row-frag-${rowIndex}`}>{groupHeader}</React.Fragment>;
              }

              return (
                <React.Fragment key={`row-frag-${rowIndex}`}>
                  {groupHeader}
                  <tr
                    className={`sheet-table-row ${rowClass(row)} ${isRowSelected ? "row-selected" : ""} ${focusedRowIndex === rowIndex ? "row-focused" : ""}`}
                    data-row-index={rowIndex}
                  >
                    <td 
                      className="row-header" 
                      style={{ 
                        height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'), 
                        textAlign: 'center', 
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRowSelection(rowIndex, (e.nativeEvent as any).shiftKey);
                      }}
                    >
                      <span className="row-index-number" style={{ userSelect: 'none' }}>
                        {isRowSelected ? (
                          <input 
                            type="checkbox" 
                            checked={true}
                            readOnly
                            style={{ width: '13px', height: '13px', margin: 0, padding: 0, pointerEvents: 'none' }}
                          />
                        ) : (
                          rowIndex + 1
                        )}
                      </span>
                      <div 
                        className="row-resize-handle"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onResizeRow(e, rowIndex);
                        }}
                      />
                    </td>
                    {renderColumns.map((rCol, cIndex) => {
                      if (rCol.type === 'group-control') {
                        return (
                          <td
                            key={`ctrl-${rCol.groupName}`}
                            className="group-control-cell"
                            style={{
                              height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'),
                              ...(fullScreenMode ? { padding: '2px 4px' } : {})
                            }}
                          ></td>
                        );
                      } else {
                        const isFocused = focusedCell?.rowIndex === rowIndex && focusedCell?.colName === rCol.col.name;
                        const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colName === rCol.col.name;
                        
                        return (
                          <td
                            key={`cell-${rowIndex}-${cIndex}`}
                            className={`data-cell ${rCol.groupName ? "group-child-cell" : ""} ${isFocused ? 'cell-focused' : ''}`}
                            onClick={() => onFocusedCellChange({ rowIndex, colName: rCol.col.name })}
                            style={{
                              height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'),
                              ...(fullScreenMode ? { padding: '2px 4px' } : {})
                            }}
                          >
                            <CellRenderer 
                              column={rCol.col} 
                              value={row[rCol.col.name] || ""} 
                              files={files}
                              onSave={(nextValue) => onSaveCellValue(rowIndex, rCol.col.name, nextValue)}
                              onFileUploaded={onFilesChanged}
                              isEditing={isEditing}
                              onCloseEdit={() => setEditingCell(null)}
                              dateColorConfig={dateColorConfig}
                            />
                          </td>
                        );
                      }
                    })}
                    <td style={{
                      height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'),
                      width: "140px",
                      minWidth: "140px",
                      ...(fullScreenMode ? { padding: '2px 4px', width: '100px', minWidth: '100px' } : {})
                    }}>
                      <div className="row-actions static-actions">
                        <button className="secondary" onClick={() => onPeekRow?.(rowIndex)} title="Peek record details" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                          <Eye size={12} />
                        </button>
                        <button className="secondary" onClick={() => onEditRow(rowIndex)} title="Edit record" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                          <Edit size={12} />
                        </button>
                        <button className="secondary" onClick={() => onCompose(row)} title="Open email composer" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                          <Mail size={12} />
                        </button>
                        <button className="secondary danger" onClick={() => onDeleteRow(rowIndex)} title="Delete record" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Menu Content Sub-component                                  */
/* ------------------------------------------------------------------ */

function FilterMenuContent({
  col,
  currentFilter,
  onApply,
  onClear,
  onClose
}: {
  col: ColumnDef;
  currentFilter?: ColumnFilter;
  onApply: (f: ColumnFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [textVal, setTextVal] = useState(currentFilter?.kind === 'text' ? currentFilter.contains : "");
  const [numMin, setNumMin] = useState(currentFilter?.kind === 'number' ? (currentFilter.min?.toString() || "") : "");
  const [numMax, setNumMax] = useState(currentFilter?.kind === 'number' ? (currentFilter.max?.toString() || "") : "");
  
  // Basic select support
  const [selValues, setSelValues] = useState<Set<string>>(
    currentFilter?.kind === 'values' ? currentFilter.values : new Set()
  );

  const handleApply = () => {
    if (col.type === 'number') {
      const min = numMin ? parseFloat(numMin) : undefined;
      const max = numMax ? parseFloat(numMax) : undefined;
      onApply({ column: col.name, type: col.type, kind: 'number', min, max });
    } else if (col.type === 'select' || col.type === 'bool') {
      onApply({ column: col.name, type: col.type, kind: 'values', values: selValues });
    } else if (col.type === 'date') {
      // Date preset is implemented later, fallback to text for now or simple preset
      // Just hardcoding "overdue" for date demo
      onApply({ column: col.name, type: col.type, kind: 'datePreset', preset: 'overdue' });
    } else {
      onApply({ column: col.name, type: col.type, kind: 'text', contains: textVal });
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>Filter {col.name}</div>
        <button className="icon-button" onClick={onClose} style={{ padding: '2px', margin: '-4px' }} title="Close">
          <X size={14} />
        </button>
      </div>
      
      {col.type === 'number' ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="number" placeholder="Min" value={numMin} onChange={e => setNumMin(e.target.value)} style={{ width: '80px', padding: '4px' }} />
          <span>-</span>
          <input type="number" placeholder="Max" value={numMax} onChange={e => setNumMax(e.target.value)} style={{ width: '80px', padding: '4px' }} />
        </div>
      ) : col.type === 'select' || col.type === 'bool' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
          {(col.options || (col.type === 'bool' ? ['true', 'false'] : [])).map(opt => (
            <label key={opt} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              <input 
                type="checkbox" 
                checked={selValues.has(opt)} 
                onChange={(e) => {
                  const next = new Set(selValues);
                  if (e.target.checked) next.add(opt); else next.delete(opt);
                  setSelValues(next);
                }} 
              />
              {opt}
            </label>
          ))}
        </div>
      ) : col.type === 'date' ? (
        <div style={{ fontSize: '12px' }}>
           <p>Date filtering preset demo: OVERDUE.</p>
        </div>
      ) : (
        <input 
          type="text" 
          placeholder="Contains text..." 
          value={textVal} 
          onChange={e => setTextVal(e.target.value)} 
          style={{ padding: '6px', width: '100%', boxSizing: 'border-box' }}
          onKeyDown={e => { if(e.key === 'Enter') handleApply(); }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
        <button className="text-button danger" onClick={onClear} style={{ fontSize: '12px', padding: '4px 8px' }}>Clear</button>
        <button className="primary" onClick={handleApply} style={{ fontSize: '12px', padding: '0 14px', height: '28px', minHeight: '28px', borderRadius: '6px' }}>Apply</button>
      </div>
    </>
  );
}
