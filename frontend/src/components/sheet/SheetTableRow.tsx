/* ------------------------------------------------------------------ */
/*  SheetTableRow — one memoized grid row                              */
/*                                                                     */
/*  React.memo + stable callback object means editing one cell only    */
/*  re-renders the affected row, not the whole grid.                   */
/* ------------------------------------------------------------------ */

import React from "react";
import { Edit, Mail, Trash2, Eye, Maximize2 } from "lucide-react";
import { CellRenderer, rowClass } from "../SheetRecordFields";
import { InlineCellEditor, CommitDirection } from "./InlineCellEditor";
import { cellMatchesSearch } from "./sheetFilters";
import type { ColumnDef, DateColorConfig } from "./sheetModel";
import type { RecordMap } from "../../lib/api";
import type { RenderColumn } from "./SheetTable";

export type RowCallbacks = {
  onToggleRowSelection: (rowIndex: number, extend: boolean) => void;
  onResizeRow: (e: React.MouseEvent, rowIndex: number) => void;
  onFocusCell: (rowIndex: number, colName: string) => void;
  onStartEdit: (rowIndex: number, colName: string, seed?: string) => void;
  onCommitEdit: (rowIndex: number, colName: string, value: string, direction: CommitDirection) => void;
  onCancelEdit: () => void;
  onOpenModal: (rowIndex: number, colName: string) => void;
  onCloseModal: () => void;
  onSaveCellValue: (rowIndex: number, colName: string, value: string) => void;
  onFilesChanged: () => Promise<void>;
  onEditRow: (rowIndex: number) => void;
  onCompose: (row: Record<string, string>) => void;
  onDeleteRow: (rowIndex: number) => void;
  onPeekRow: (rowIndex: number) => void;
};

export const SheetTableRow = React.memo(function SheetTableRow({
  row,
  rowIndex,
  renderColumns,
  files,
  fullScreenMode,
  isSelected,
  isNavFocused,
  focusedColName,
  editingColName,
  editingSeed,
  modalColName,
  searchQuery,
  dateColorConfig,
  callbacks,
}: {
  row: Record<string, string>;
  rowIndex: number;
  renderColumns: RenderColumn[];
  files: RecordMap[];
  fullScreenMode: boolean;
  isSelected: boolean;
  isNavFocused: boolean;
  focusedColName: string | null;
  editingColName: string | null;
  editingSeed?: string;
  modalColName: string | null;
  searchQuery: string;
  dateColorConfig?: DateColorConfig;
  callbacks: RowCallbacks;
}) {
  const cb = callbacks;
  const cellHeight = row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)');
  const compactCell = fullScreenMode ? { padding: '2px 4px' } : {};

  return (
    <tr
      className={`sheet-table-row ${rowClass(row)} ${isSelected ? "row-selected" : ""} ${isNavFocused ? "row-focused" : ""}`}
      data-row-index={rowIndex}
    >
      <td
        className="row-header"
        style={{
          height: cellHeight,
          textAlign: 'center',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          position: 'relative'
        }}
        onClick={(e) => {
          e.stopPropagation();
          cb.onToggleRowSelection(rowIndex, (e.nativeEvent as any).shiftKey);
        }}
      >
        <span className="row-index-number" style={{ userSelect: 'none' }}>
          {isSelected ? (
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
            cb.onResizeRow(e, rowIndex);
          }}
        />
      </td>
      {renderColumns.map((rCol, cIndex) => {
        if (rCol.type === 'group-control') {
          return (
            <td
              key={`ctrl-${rCol.groupName}`}
              className="group-control-cell"
              style={{ height: cellHeight, ...compactCell }}
            ></td>
          );
        }

        const col = rCol.col;
        const value = row[col.name] || "";
        const isFocused = focusedColName === col.name;
        const isEditing = editingColName === col.name;
        const matchesSearch = searchQuery ? cellMatchesSearch(value, searchQuery) : false;

        return (
          <td
            key={`cell-${rowIndex}-${cIndex}`}
            className={`data-cell ${rCol.groupName ? "group-child-cell" : ""} ${isFocused ? 'cell-focused' : ''} ${matchesSearch ? 'cell-search-match' : ''}`}
            onClick={() => cb.onFocusCell(rowIndex, col.name)}
            onDoubleClick={() => {
              if (col.type === 'file') cb.onOpenModal(rowIndex, col.name);
              else cb.onStartEdit(rowIndex, col.name);
            }}
            style={{ height: cellHeight, ...compactCell }}
          >
            {isEditing && col.type !== 'file' ? (
              <InlineCellEditor
                column={col}
                value={value}
                seedText={editingSeed}
                onCommit={(v, dir) => cb.onCommitEdit(rowIndex, col.name, v, dir)}
                onCancel={cb.onCancelEdit}
              />
            ) : (
              <>
                <CellRenderer
                  column={col}
                  value={value}
                  files={files}
                  onSave={(nextValue) => cb.onSaveCellValue(rowIndex, col.name, nextValue)}
                  onFileUploaded={cb.onFilesChanged}
                  isEditing={modalColName === col.name}
                  onCloseEdit={cb.onCloseModal}
                  dateColorConfig={dateColorConfig}
                  openOnClick={col.type === 'file'}
                />
                {isFocused && col.type !== 'file' ? (
                  <button
                    className="cell-expand-btn"
                    title="Open full editor (long text, copy)"
                    onClick={(e) => { e.stopPropagation(); cb.onOpenModal(rowIndex, col.name); }}
                  >
                    <Maximize2 size={11} />
                  </button>
                ) : null}
              </>
            )}
          </td>
        );
      })}
      <td style={{
        height: cellHeight,
        width: "140px",
        minWidth: "140px",
        ...(fullScreenMode ? { padding: '2px 4px', width: '100px', minWidth: '100px' } : {})
      }}>
        <div className="row-actions static-actions">
          <button className="secondary" onClick={() => cb.onPeekRow(rowIndex)} title="Peek record details" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
            <Eye size={12} />
          </button>
          <button className="secondary" onClick={() => cb.onEditRow(rowIndex)} title="Edit record" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
            <Edit size={12} />
          </button>
          <button className="secondary" onClick={() => cb.onCompose(row)} title="Open email composer" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
            <Mail size={12} />
          </button>
          <button className="secondary danger" onClick={() => cb.onDeleteRow(rowIndex)} title="Delete record" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
});
