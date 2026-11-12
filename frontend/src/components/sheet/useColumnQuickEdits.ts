/* ------------------------------------------------------------------ */
/*  useColumnQuickEdits — column edits made straight from the header   */
/*                                                                     */
/*  The column editor modal stages changes and saves them together.    */
/*  These are the one-step versions: rename in place, add the next     */
/*  letter, change a type, delete. Each is ONE state update, ONE undo  */
/*  entry and ONE save — the arithmetic lives in sheetColumns.ts.      */
/*                                                                     */
/*  A rename also has to follow the column through the view state      */
/*  (sort, filters, grouping, focus) or the view silently stops        */
/*  applying to a column that, as far as the user can see, still       */
/*  exists.                                                            */
/*                                                                     */
/*  SCHOLARDOCX-0259.                                                  */
/* ------------------------------------------------------------------ */

import type { ColumnDef, ColumnType } from "./sheetModel";
import type { ColumnFilter, SortState } from "./sheetFilters";
import {
  changeColumnType,
  columnNameError,
  filledCellCount,
  insertColumn,
  removeColumn,
  renameColumn,
  type SheetData,
} from "./sheetColumns";

type Row = Record<string, string>;
type FocusedCell = { rowIndex: number; colName: string } | null;

export type ColumnQuickEditDeps = {
  columns: ColumnDef[];
  rows: Row[];
  selectedPageId: string;
  setColumns: (columns: ColumnDef[]) => void;
  setRows: (rows: Row[]) => void;
  record: (snapshot: SheetData) => void;
  persistPage: (columns: ColumnDef[], rows: Row[], silent?: boolean) => Promise<void>;
  onToast?: (message: string) => void;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
  sortState: SortState;
  setSortState: (state: SortState) => void;
  filters: ColumnFilter[];
  setFilters: (filters: ColumnFilter[]) => void;
  groupBy: string | null;
  setGroupBy: (column: string | null) => void;
  focusedCell: FocusedCell;
  setFocusedCell: (cell: FocusedCell) => void;
};

export function useColumnQuickEdits(deps: ColumnQuickEditDeps) {
  const { columns, rows, selectedPageId, setColumns, setRows, record, persistPage, onToast, showConfirm } = deps;

  const apply = async (next: SheetData) => {
    setColumns(next.columns);
    setRows(next.rows);
    record(next);
    await persistPage(next.columns, next.rows, true);
  };

  /** Why a name cannot be used for `currentName` (or a new column), or null. */
  const columnNameProblem = (proposed: string, currentName?: string) =>
    columnNameError(columns, proposed, currentName);

  /** Rename in place. Resolves false when the name was refused. */
  const renameColumnInline = async (from: string, proposed: string): Promise<boolean> => {
    if (!selectedPageId) return false;
    const to = proposed.trim();
    if (to === from) return true;
    const problem = columnNameError(columns, to, from);
    if (problem) {
      onToast?.(problem);
      return false;
    }
    const next = renameColumn({ columns, rows }, from, to);
    if (!next) return false;

    if (deps.sortState.column === from) deps.setSortState({ ...deps.sortState, column: to });
    if (deps.filters.some((filter) => filter.column === from)) {
      deps.setFilters(deps.filters.map((filter) => (filter.column === from ? { ...filter, column: to } : filter)));
    }
    if (deps.groupBy === from) deps.setGroupBy(to);
    if (deps.focusedCell?.colName === from) deps.setFocusedCell({ ...deps.focusedCell, colName: to });

    await apply(next);
    return true;
  };

  /** Add a text column named with the next free letter. Returns its name. */
  const quickAddColumn = async (anchor?: string, side: "left" | "right" = "right"): Promise<string | null> => {
    if (!selectedPageId) return null;
    const result = insertColumn({ columns, rows }, { anchor, side });
    if (!result) return null;
    await apply(result.data);
    return result.name;
  };

  const setColumnType = async (name: string, type: ColumnType) => {
    if (!selectedPageId) return;
    const next = changeColumnType({ columns, rows }, name, type);
    if (next) await apply(next);
  };

  const deleteColumnDirect = async (name: string) => {
    if (!selectedPageId) return;
    const filled = filledCellCount(rows, name);
    // An empty column goes without ceremony; one with data names the cost.
    if (filled > 0) {
      const confirmed = await showConfirm(
        `Delete the column “${name}”? ${filled} filled cell${filled === 1 ? "" : "s"} will be removed. You can undo this with Ctrl+Z.`,
        "Delete Column",
      );
      if (!confirmed) return;
    }
    const next = removeColumn({ columns, rows }, name);
    if (!next) return;

    if (deps.sortState.column === name) deps.setSortState({ column: "", direction: "off" });
    if (deps.filters.some((filter) => filter.column === name)) {
      deps.setFilters(deps.filters.filter((filter) => filter.column !== name));
    }
    if (deps.groupBy === name) deps.setGroupBy(null);
    if (deps.focusedCell?.colName === name) deps.setFocusedCell(null);

    await apply(next);
    onToast?.(`Column “${name}” deleted.`);
  };

  return { columnNameProblem, renameColumnInline, quickAddColumn, setColumnType, deleteColumnDirect };
}
