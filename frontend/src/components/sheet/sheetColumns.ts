/* ------------------------------------------------------------------ */
/*  sheetColumns — lettered columns and direct column edits            */
/*                                                                     */
/*  Pure functions only (same split as sheetGrid.ts): every edit takes */
/*  the current columns/rows and returns the next ones, so the hook    */
/*  that calls them does one state update, one undo entry, one save.   */
/*                                                                     */
/*  Rows are keyed by column NAME. A rename therefore has to move the  */
/*  value, and the per-cell formatting stored under `_cellStyles`,     */
/*  from the old key to the new one, or the column appears to empty.   */
/*                                                                     */
/*  SCHOLARDOCX-0259.                                                  */
/* ------------------------------------------------------------------ */

import { CELL_STYLES_KEY, parseCellStyles, type ColumnDef, type ColumnType } from "./sheetModel";

export const MAX_COLUMN_NAME_LENGTH = 30;
export const BLANK_SHEET_COLUMN_COUNT = 5;

type Row = Record<string, string>;
export type SheetData = { columns: ColumnDef[]; rows: Row[] };

/** Spreadsheet letter for a zero-based index: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let letters = "";
  let n = Math.max(0, Math.floor(index)) + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** The starting columns of a blank sheet: A, B, C… as text. */
export function blankColumns(count = BLANK_SHEET_COLUMN_COUNT): ColumnDef[] {
  return Array.from({ length: count }, (_, index) => ({ name: columnLetter(index), type: "text" as ColumnType }));
}

const dataColumns = (columns: ColumnDef[]) => columns.filter((col) => col.type !== "group");

/**
 * The first letter name no data column is using.
 *
 * Starts from the column COUNT rather than from A, so a sheet whose A–E were
 * renamed to real names gets "F" next, the letter of the position being
 * added, and not a confusing "A" at the far right.
 */
export function nextLetterName(columns: ColumnDef[]): string {
  const taken = new Set(dataColumns(columns).map((col) => col.name.trim().toLowerCase()));
  let index = dataColumns(columns).length;
  while (taken.has(columnLetter(index).toLowerCase())) index += 1;
  return columnLetter(index);
}

/**
 * Why a proposed column name cannot be used, or null if it can.
 * `currentName` is the column being renamed (so keeping its own name, or
 * only changing its capitalisation, is allowed).
 */
export function columnNameError(columns: ColumnDef[], proposed: string, currentName?: string): string | null {
  const name = proposed.trim();
  if (!name) return "A column needs a name.";
  if (name.length > MAX_COLUMN_NAME_LENGTH) return `Keep column names under ${MAX_COLUMN_NAME_LENGTH} characters.`;
  if (name.startsWith("_")) return "Column names cannot start with an underscore.";
  const clash = dataColumns(columns).some(
    (col) => col.name !== currentName && col.name.trim().toLowerCase() === name.toLowerCase(),
  );
  return clash ? `There is already a column called “${name}”.` : null;
}

/** Move one key of a row (value + cell formatting) to a new name. */
function renameRowKey(row: Row, from: string, to: string): Row {
  const hasValue = Object.prototype.hasOwnProperty.call(row, from);
  const styles = parseCellStyles(row);
  const hasStyle = Object.prototype.hasOwnProperty.call(styles, from);
  if (!hasValue && !hasStyle) return row;

  const next: Row = {};
  // Rebuild in order so the renamed key keeps its position in the object.
  Object.keys(row).forEach((key) => {
    if (key === from) next[to] = row[from];
    else if (key !== to) next[key] = row[key];
  });
  if (hasStyle) {
    const nextStyles = { ...styles, [to]: styles[from] };
    delete nextStyles[from];
    next[CELL_STYLES_KEY] = JSON.stringify(nextStyles);
  }
  return next;
}

/**
 * Rename a data column everywhere it is referenced inside the sheet data:
 * the column definition, every row's value and every row's cell formatting.
 * Returns null when the rename is invalid or changes nothing.
 */
export function renameColumn(data: SheetData, from: string, proposed: string): SheetData | null {
  const to = proposed.trim();
  if (to === from) return null;
  if (!data.columns.some((col) => col.type !== "group" && col.name === from)) return null;
  if (columnNameError(data.columns, to, from)) return null;
  return {
    columns: data.columns.map((col) => (col.type !== "group" && col.name === from ? { ...col, name: to } : col)),
    rows: data.rows.map((row) => renameRowKey(row, from, to)),
  };
}

/**
 * Insert a new text column. With no anchor it goes at the end; with one it
 * goes beside that column and joins the same group, so a column added from
 * inside a group stays visible instead of landing outside it.
 */
export function insertColumn(
  data: SheetData,
  options: { name?: string; anchor?: string; side?: "left" | "right"; type?: ColumnType } = {},
): { data: SheetData; name: string } | null {
  const name = (options.name ?? nextLetterName(data.columns)).trim();
  if (columnNameError(data.columns, name)) return null;
  const column: ColumnDef = { name, type: options.type ?? "text" };

  const anchorIndex = options.anchor
    ? data.columns.findIndex((col) => col.type !== "group" && col.name === options.anchor)
    : -1;
  const columns = [...data.columns];
  if (anchorIndex === -1) {
    columns.push(column);
  } else {
    const anchor = data.columns[anchorIndex];
    if (anchor.group) column.group = anchor.group;
    columns.splice(options.side === "left" ? anchorIndex : anchorIndex + 1, 0, column);
  }
  // Rows are sparse: a missing key reads as an empty cell, so they are
  // returned untouched and a big sheet is not rewritten to add a column.
  return { data: { columns, rows: data.rows }, name };
}

/** Remove a data column, its values and its cell formatting. */
export function removeColumn(data: SheetData, name: string): SheetData | null {
  if (!data.columns.some((col) => col.type !== "group" && col.name === name)) return null;
  return {
    columns: data.columns.filter((col) => col.type === "group" || col.name !== name),
    rows: data.rows.map((row) => {
      const styles = parseCellStyles(row);
      const hasStyle = Object.prototype.hasOwnProperty.call(styles, name);
      if (!Object.prototype.hasOwnProperty.call(row, name) && !hasStyle) return row;
      const next = { ...row };
      delete next[name];
      if (hasStyle) {
        delete styles[name];
        if (Object.keys(styles).length) next[CELL_STYLES_KEY] = JSON.stringify(styles);
        else delete next[CELL_STYLES_KEY];
      }
      return next;
    }),
  };
}

/** How many rows hold a non-empty value in a column (for the delete warning). */
export function filledCellCount(rows: Row[], name: string): number {
  return rows.reduce((count, row) => count + ((row[name] ?? "").trim() ? 1 : 0), 0);
}

/**
 * Change a column's type. Values are kept as typed: a text column switched to
 * Number still shows whatever was there, so nothing is lost by trying a type
 * and switching back. Dropdown options are seeded from the values in use.
 */
export function changeColumnType(data: SheetData, name: string, type: ColumnType): SheetData | null {
  const current = data.columns.find((col) => col.type !== "group" && col.name === name);
  if (!current || current.type === type || type === "group") return null;
  return {
    rows: data.rows,
    columns: data.columns.map((col) => {
      if (col !== current) return col;
      const next: ColumnDef = { ...col, type };
      if (type === "select") {
        const seen = new Set<string>(col.options || []);
        data.rows.forEach((row) => {
          const value = (row[name] ?? "").trim();
          if (value && seen.size < 30) seen.add(value);
        });
        next.options = [...seen];
      } else {
        delete next.options;
      }
      return next;
    }),
  };
}

/** A default name for the next sheet in a project: "Sheet 1", "Sheet 2"… */
export function nextSheetName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  let n = existingNames.length + 1;
  while (taken.has(`sheet ${n}`)) n += 1;
  return `Sheet ${n}`;
}
