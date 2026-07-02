/* ------------------------------------------------------------------ */
/*  SheetTable — the data grid (headers, rows, cells, resize, scroll)  */
/* ------------------------------------------------------------------ */

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ArrowUp, ArrowDown, Filter, X, Plus } from "lucide-react";
import type { ColumnDef, DateColorConfig } from "./sheetModel";
import type { RecordMap } from "../../lib/api";
import { SortState, ColumnFilter, filterSummary } from "./sheetFilters";
import { FilterMenuContent } from "./FilterMenu";
import { SheetTableRow, RowCallbacks } from "./SheetTableRow";
import type { CommitDirection } from "./InlineCellEditor";
import { formatTSV } from "./sheetPaste";

/* ------------------------------------------------------------------ */
/*  RenderColumn type for group/data column layout                     */
/* ------------------------------------------------------------------ */

export type RenderColumn =
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
  rowIndexMap,
  files,
  fullScreenMode,
  collapsedGroups,
  focusedRowIndex,
  sortState,
  filters,
  searchQuery,
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
  onQuickAddRow,
  groupBy,
  dateColorConfig,
  onPeekRow,
}: {
  columns: ColumnDef[];
  rows: Record<string, string>[];
  viewRows: Record<string, string>[];
  rowIndexMap: Map<Record<string, string>, number>;
  files: RecordMap[];
  fullScreenMode: boolean;
  collapsedGroups: Record<string, boolean>;
  focusedRowIndex: number | null;
  sortState: SortState;
  filters: ColumnFilter[];
  searchQuery: string;
  onToggleGroup: (groupName: string) => void;
  onResizeColumn: (e: React.MouseEvent, index: number) => void;
  onResizeRow: (e: React.MouseEvent, rowIndex: number) => void;
  onSaveCellValue: (rowIndex: number, colName: string, value: string) => Promise<void>;
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
  onQuickAddRow?: () => Promise<number | null>;
  groupBy?: string | null;
  dateColorConfig?: DateColorConfig;
  onPeekRow?: (rowIndex: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderColumns = useMemo(
    () => buildRenderColumns(columns, collapsedGroups),
    [columns, collapsedGroups]
  );
  const visibleDataCols = useMemo(
    () => renderColumns.filter((c): c is Extract<RenderColumn, { type: 'data' }> => c.type === 'data'),
    [renderColumns]
  );

  // Position of each original row index inside the current view order,
  // so keyboard navigation follows what the user actually sees
  const viewPositions = useMemo(() => {
    const byRowIndex = new Map<number, number>();
    viewRows.forEach((row, pos) => {
      const rowIndex = rowIndexMap.get(row);
      if (rowIndex !== undefined) byRowIndex.set(rowIndex, pos);
    });
    return byRowIndex;
  }, [viewRows, rowIndexMap]);

  const allViewSelected = useMemo(() => {
    if (viewRows.length === 0) return false;
    for (const row of viewRows) {
      const idx = rowIndexMap.get(row);
      if (idx === undefined || !selectedRows.has(idx)) return false;
    }
    return true;
  }, [viewRows, rowIndexMap, selectedRows]);

  /* -------------------- header filter menu state -------------------- */

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

  // Checklist choices for the open select/bool filter menu: declared options
  // plus any values already present in rows (covers legacy values)
  const filterValueOptions = useMemo(() => {
    if (!activeFilterMenu) return [];
    const col = columns.find(c => c.name === activeFilterMenu);
    if (!col || (col.type !== 'select' && col.type !== 'bool')) return [];
    const values = new Set<string>(col.type === 'bool' ? ["Yes", "No"] : (col.options || []));
    rows.forEach(row => {
      const v = (row[col.name] || "").trim();
      if (v) values.add(v);
    });
    return Array.from(values);
  }, [activeFilterMenu, columns, rows]);

  /* -------------------- column drag and drop -------------------- */

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

  /* -------------------- inline editing state -------------------- */

  const [editingCell, setEditingCell] = useState<{ rowIndex: number, colName: string, seed?: string } | null>(null);
  const [modalCell, setModalCell] = useState<{ rowIndex: number, colName: string } | null>(null);

  const refocusGrid = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  /** Move focus by view-order offsets; returns the target cell (or null at an edge). */
  const neighborCell = useCallback((rowIndex: number, colName: string, dRow: number, dCol: number, wrap = false) => {
    const colIdx = visibleDataCols.findIndex(c => c.col.name === colName);
    if (colIdx === -1) return null;
    let nextColIdx = colIdx + dCol;
    let pos = viewPositions.get(rowIndex);
    if (pos === undefined) return null;

    if (nextColIdx >= visibleDataCols.length) {
      if (!wrap) return null;
      nextColIdx = 0;
      pos += 1; // Tab past the last column wraps to the next row
    } else if (nextColIdx < 0) {
      return null;
    }
    pos += dRow;
    if (pos < 0 || pos >= viewRows.length) return null;
    const targetRowIndex = rowIndexMap.get(viewRows[pos]);
    if (targetRowIndex === undefined) return null;
    return { rowIndex: targetRowIndex, colName: visibleDataCols[nextColIdx].col.name };
  }, [visibleDataCols, viewPositions, viewRows, rowIndexMap]);

  const commitEdit = useCallback((rowIndex: number, colName: string, value: string, direction: CommitDirection) => {
    setEditingCell(null);
    onSaveCellValue(rowIndex, colName, value).catch(() => { /* toast handled upstream */ });
    if (direction !== "none") {
      const next = neighborCell(rowIndex, colName, direction === "down" ? 1 : 0, direction === "right" ? 1 : 0, direction === "right");
      onFocusedCellChange(next || { rowIndex, colName });
    }
    refocusGrid();
  }, [onSaveCellValue, neighborCell, onFocusedCellChange, refocusGrid]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    refocusGrid();
  }, [refocusGrid]);

  /* -------------------- stable row callbacks -------------------- */

  const rowCallbacks: RowCallbacks = useMemo(() => ({
    onToggleRowSelection,
    onResizeRow,
    onFocusCell: (rowIndex, colName) => onFocusedCellChange({ rowIndex, colName }),
    onStartEdit: (rowIndex, colName, seed) => {
      onFocusedCellChange({ rowIndex, colName });
      setEditingCell({ rowIndex, colName, seed });
    },
    onCommitEdit: commitEdit,
    onCancelEdit: cancelEdit,
    onOpenModal: (rowIndex, colName) => setModalCell({ rowIndex, colName }),
    onCloseModal: () => setModalCell(null),
    onSaveCellValue: (rowIndex, colName, value) => { onSaveCellValue(rowIndex, colName, value).catch(() => {}); },
    onFilesChanged,
    onEditRow,
    onCompose,
    onDeleteRow,
    onPeekRow: (rowIndex) => onPeekRow?.(rowIndex),
  }), [onToggleRowSelection, onResizeRow, onFocusedCellChange, commitEdit, cancelEdit, onSaveCellValue, onFilesChanged, onEditRow, onCompose, onDeleteRow, onPeekRow]);

  /* -------------------- keyboard flow -------------------- */

  // Keep the keyboard-focused cell in view
  useEffect(() => {
    if (!focusedCell || !containerRef.current) return;
    const cell = containerRef.current.querySelector("td.cell-focused");
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedCell]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Global undo/redo
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
      return;
    }

    if (!focusedCell) return;

    // Inside an editor (inline editors stopPropagation; this covers the modal)
    const activeEl = document.activeElement;
    const isTyping = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA" || activeEl?.tagName === "SELECT";

    if (e.key === "Escape") {
      onFocusedCellChange(null);
      setEditingCell(null);
      if (isTyping) (activeEl as HTMLElement).blur();
      return;
    }

    if (isTyping || editingCell || modalCell) return;

    const { rowIndex, colName } = focusedCell;
    const focusedColDef = visibleDataCols.find(c => c.col.name === colName)?.col;

    const move = (dRow: number, dCol: number) => {
      const next = neighborCell(rowIndex, colName, dRow, dCol);
      if (next) onFocusedCellChange(next);
    };

    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1, 0);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(0, -1);
    } else if (e.key === "ArrowRight" || e.key === "Tab") {
      e.preventDefault();
      const next = neighborCell(rowIndex, colName, 0, 1, e.key === "Tab");
      if (next) onFocusedCellChange(next);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if (focusedColDef?.type === 'file') setModalCell({ rowIndex, colName });
      else setEditingCell({ rowIndex, colName });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onSaveCellValue(rowIndex, colName, "").catch(() => {});
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      // Copy selected rows as TSV, or just the focused cell value
      const domSelection = window.getSelection();
      if (domSelection && !domSelection.isCollapsed) return; // let real text selection copy normally
      e.preventDefault();
      if (selectedRows.size > 0) {
        const visibleCols = columns.filter(c => c.type !== 'group' && !c.hidden);
        const selectedData = Array.from(selectedRows).sort((a, b) => a - b).map(idx => rows[idx]).filter(Boolean);
        navigator.clipboard.writeText(formatTSV(selectedData, visibleCols)).catch(() => {});
      } else {
        navigator.clipboard.writeText(rows[rowIndex]?.[colName] || "").catch(() => {});
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
      // Fill down from the visible row above
      e.preventDefault();
      const above = neighborCell(rowIndex, colName, -1, 0);
      if (above) {
        onSaveCellValue(rowIndex, colName, rows[above.rowIndex]?.[above.colName] || "").catch(() => {});
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-to-edit: replace the value with what was typed (spreadsheet convention).
      // Only free-text-like cells take the typed seed; select/bool/date just open.
      if (!focusedColDef || focusedColDef.type === 'file') return;
      e.preventDefault();
      const takesSeed =
        focusedColDef.type === 'text' ||
        focusedColDef.type === 'url' ||
        (focusedColDef.type === 'number' && /[0-9.\-]/.test(e.key));
      setEditingCell({ rowIndex, colName, seed: takesSeed ? e.key : undefined });
    }
  };

  return (
    <div
      ref={containerRef}
      className="sheet-scroll"
      style={fullScreenMode ? { fontSize: '11px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' } : {}}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={(e) => {
        // If focusing the container without a cell, default to first cell
        if (!focusedCell && viewRows.length > 0 && e.target === e.currentTarget) {
          const firstCol = visibleDataCols[0];
          const firstRowIndex = rowIndexMap.get(viewRows[0]);
          if (firstCol && firstRowIndex !== undefined) {
            onFocusedCellChange({ rowIndex: firstRowIndex, colName: firstCol.col.name });
          }
        }
      }}
    >
      {/* Active filters chips area */}
      {filters.length > 0 && (
        <div className="active-filters-row" style={{ display: 'flex', gap: '8px', padding: '8px 12px', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Filter size={12}/> Filters:</span>
          {filters.map(f => (
            <div key={f.column} className="filter-chip" style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>
              <span style={{ fontWeight: 600 }}>{f.column}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{filterSummary(f)}</span>
              <button className="icon-button" style={{ padding: '2px' }} onClick={() => onRemoveFilter(f.column)} title={`Remove ${f.column} filter`}><X size={12}/></button>
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
                title="Select all visible rows"
                checked={allViewSelected}
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
                      {rCol.collapsed ? <span style={{ opacity: 0.7, flexShrink: 0 }}>▸</span> : <span style={{ opacity: 0.7, flexShrink: 0 }}>▾</span>}
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
                          title="Sort (click to cycle)"
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rCol.col.name}</span>
                          {sortDir === "asc" && <ArrowUp size={13} style={{ color: 'var(--primary)', flexShrink: 0 }}/>}
                          {sortDir === "desc" && <ArrowDown size={13} style={{ color: 'var(--primary)', flexShrink: 0 }}/>}
                        </div>

                        <div className="column-filter-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                          <button
                            className={`icon-button ${isFiltered ? 'active-filter' : ''}`}
                            onClick={(e) => { e.stopPropagation(); setActiveFilterMenu(activeFilterMenu === rCol.col.name ? null : rCol.col.name); }}
                            title={`Filter ${rCol.col.name}`}
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
                                valueOptions={filterValueOptions}
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
            return viewRows.map((row) => {
              const rowIndex = rowIndexMap.get(row) ?? -1;

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

              const isRowFocused = focusedCell?.rowIndex === rowIndex;

              return (
                <React.Fragment key={`row-frag-${rowIndex}`}>
                  {groupHeader}
                  <SheetTableRow
                    row={row}
                    rowIndex={rowIndex}
                    renderColumns={renderColumns}
                    files={files}
                    fullScreenMode={fullScreenMode}
                    isSelected={selectedRows.has(rowIndex)}
                    isNavFocused={focusedRowIndex === rowIndex}
                    focusedColName={isRowFocused ? focusedCell!.colName : null}
                    editingColName={editingCell?.rowIndex === rowIndex ? editingCell.colName : null}
                    editingSeed={editingCell?.rowIndex === rowIndex ? editingCell.seed : undefined}
                    modalColName={modalCell?.rowIndex === rowIndex ? modalCell.colName : null}
                    searchQuery={searchQuery}
                    dateColorConfig={dateColorConfig}
                    callbacks={rowCallbacks}
                  />
                </React.Fragment>
              );
            });
          })()}
          {onQuickAddRow && columns.length > 0 ? (
            <tr className="quick-add-row">
              <td colSpan={renderColumns.length + 2} style={{ padding: 0 }}>
                <button
                  type="button"
                  className="quick-add-row-btn"
                  onClick={async () => {
                    const newIndex = await onQuickAddRow();
                    if (newIndex !== null && visibleDataCols.length > 0) {
                      const colName = visibleDataCols[0].col.name;
                      onFocusedCellChange({ rowIndex: newIndex, colName });
                      setEditingCell({ rowIndex: newIndex, colName });
                    }
                  }}
                >
                  <Plus size={13} /> New row
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
