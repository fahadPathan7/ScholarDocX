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
import {
  type ColumnDef,
  type DateColorConfig,
  type CellStyle,
  parseCellStyles,
  parseRowStyle,
  cellBoxToCss,
} from "./sheetModel";
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
  onCellStyle: (rowIndex: number, colName: string, patch: CellStyle) => void;
  onCellClearFormatting: (rowIndex: number, colName: string) => void;
  onRowStyle: (rowIndex: number, patch: { bg?: string }) => void;
};

export const SheetTableRow = React.memo(function SheetTableRow({
  row,
  rowIndex,
  renderColumns,
  files,
  fullScreenMode,
  isSelected,
  isNavFocused,
  isDuplicate,
  duplicateSiblings,
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
  isDuplicate: boolean;
  duplicateSiblings?: number[];
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
  const rowStyleBg = parseRowStyle(row).bg;

  return (
    <tr
      className={`sheet-table-row ${rowClass(row)} ${isSelected ? "row-selected" : ""} ${isNavFocused ? "row-focused" : ""} ${isDuplicate ? "row-duplicate" : ""}`}
      data-row-index={rowIndex}
      style={rowStyleBg ? { backgroundColor: rowStyleBg } : undefined}
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
            <span className="row-index-inner">
              {rowIndex + 1}
              {isDuplicate && duplicateSiblings && duplicateSiblings.length > 0 && (
                <span
                  className="row-duplicate-badge"
                  title={`Duplicate of row${duplicateSiblings.length > 1 ? "s" : ""} ${duplicateSiblings.map(i => i + 1).join(", ")}`}
                >
                  !
                </span>
              )}
            </span>
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
        const cellStyle = parseCellStyles(row)[col.name] || {};
        const cellBoxStyle = cellBoxToCss(cellStyle);

        return (
          <td
            key={`cell-${rowIndex}-${cIndex}`}
            className={`data-cell ${rCol.groupName ? "group-child-cell" : ""} ${isFocused ? 'cell-focused' : ''} ${matchesSearch ? 'cell-search-match' : ''}`}
            onClick={() => cb.onFocusCell(rowIndex, col.name)}
            onDoubleClick={() => {
              if (col.type === 'file') cb.onOpenModal(rowIndex, col.name);
              else cb.onStartEdit(rowIndex, col.name);
            }}
            style={{
              height: cellHeight,
              ...compactCell,
              ...cellBoxStyle,
              ...(isEditing && col.type !== 'file' ? { overflow: 'visible' } : {}),
            }}
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
                  cellStyle={cellStyle}
                  onCellStyle={col.type === 'file' ? undefined : (patch) => cb.onCellStyle(rowIndex, col.name, patch)}
                  onCellClearFormatting={col.type === 'file' ? undefined : () => cb.onCellClearFormatting(rowIndex, col.name)}
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
    </tr>
  );
});
