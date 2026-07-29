/* ------------------------------------------------------------------ */
/*  useBulkCellEdits — fill down, set a column, clear a range          */
/*                                                                     */
/*  The arithmetic lives in sheetGrid.ts and is tested there; this hook */
/*  only turns a batch of changes into ONE state update, ONE undo entry */
/*  and ONE save.                                                      */
/*                                                                     */
/*  That batching is the whole point. Looping the existing             */
/*  saveCellValue would fire a PATCH per cell and push a history entry */
/*  per cell, so undoing a fill across forty rows would take forty     */
/*  presses of Ctrl+Z — which is not an undo, it is a punishment.      */
/*                                                                     */
/*  SCHOLARDOCX-0202.                                                  */
/* ------------------------------------------------------------------ */

import { clearCells, fillDown, setColumnValue, type CellChange } from "./sheetGrid";
import type { ColumnDef } from "./sheetModel";

export type BulkCellEditDeps = {
  columns: ColumnDef[];
  rows: Record<string, string>[];
  selectedRows: Set<number>;
  selectedPageId: string;
  setRows: (rows: Record<string, string>[]) => void;
  record: (snapshot: { columns: ColumnDef[]; rows: Record<string, string>[] }) => void;
  persistPage: (columns: ColumnDef[], rows: Record<string, string>[]) => Promise<void>;
  onToast?: (message: string) => void;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
};

export function useBulkCellEdits(deps: BulkCellEditDeps) {
  const { columns, rows, selectedRows, selectedPageId, setRows, record, persistPage, onToast, showConfirm } = deps;

  const applyCellChanges = async (changes: CellChange[], describe: (count: number) => string) => {
    if (!selectedPageId) throw new Error("Sheet is busy.");
    if (!changes.length) {
      // Saying so beats a silent no-op that looks like a broken button.
      onToast?.("Nothing to change — those cells already match.");
      return;
    }
    const byRow = new Map<number, Record<string, string>>();
    changes.forEach(({ rowIndex, column, value }) => {
      const patch = byRow.get(rowIndex) || {};
      patch[column] = value;
      byRow.set(rowIndex, patch);
    });
    const nextRows = rows.map((row, index) => {
      const patch = byRow.get(index);
      return patch ? { ...row, ...patch } : row;
    });
    setRows(nextRows);
    record({ columns, rows: nextRows });
    onToast?.(describe(changes.length));
    await persistPage(columns, nextRows);
  };

  const fillDownSelection = (column: string) =>
    applyCellChanges(
      fillDown(rows, [...selectedRows], column),
      (count) => `Filled ${count} cell${count === 1 ? "" : "s"} down.`,
    );

  const setColumnForSelection = (column: string, value: string) =>
    applyCellChanges(
      setColumnValue(rows, [...selectedRows], column, value),
      (count) => `Updated ${count} cell${count === 1 ? "" : "s"}.`,
    );

  const clearSelectedCells = async () => {
    const changes = clearCells(rows, [...selectedRows], columns);
    if (changes.length) {
      // This can wipe a lot at once, so it names the number and says what it
      // will not touch — file columns are left alone.
      const confirmed = await showConfirm(
        `Clear ${changes.length} cell${changes.length === 1 ? "" : "s"} across ${selectedRows.size} row${selectedRows.size === 1 ? "" : "s"}? Attached files are left alone.`,
        "Clear cells",
      );
      if (!confirmed) return;
    }
    await applyCellChanges(changes, (count) => `Cleared ${count} cell${count === 1 ? "" : "s"}.`);
  };

  return { fillDownSelection, setColumnForSelection, clearSelectedCells };
}
