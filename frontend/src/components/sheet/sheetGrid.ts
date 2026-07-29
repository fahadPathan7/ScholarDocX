/* ------------------------------------------------------------------ */
/*  sheetGrid — grid presentation rules and bulk cell edits            */
/*                                                                     */
/*  Pure functions only. Everything here is either a lookup table or a */
/*  transformation over plain row objects, so the behaviour can be     */
/*  tested without a renderer — the same split as sheetFilters.ts.     */
/*                                                                     */
/*  SCHOLARDOCX-0202.                                                  */
/* ------------------------------------------------------------------ */

import type { ColumnDef, ColumnType } from "./sheetModel";

/* ------------------------------------------------------------------ */
/*  Row density                                                        */
/* ------------------------------------------------------------------ */

export type Density = "compact" | "cosy" | "roomy";

export const DENSITIES: Record<Density, { label: string; rowHeight: number; lines: number }> = {
  compact: { label: "Compact", rowHeight: 28, lines: 1 },
  cosy: { label: "Cosy", rowHeight: 34, lines: 1 },
  roomy: { label: "Roomy", rowHeight: 52, lines: 2 },
};

export const DEFAULT_DENSITY: Density = "cosy";

/** Guard a value read back from storage — an unknown string must not
 *  produce a grid with `undefined` px rows. */
export function coerceDensity(value: unknown): Density {
  return typeof value === "string" && value in DENSITIES ? (value as Density) : DEFAULT_DENSITY;
}

/* ------------------------------------------------------------------ */
/*  Column type presentation                                           */
/* ------------------------------------------------------------------ */

export type CellAlign = "left" | "right" | "center";

/**
 * How a column's values should sit in their cells.
 *
 * Numbers and dates go right so digits line up on the decimal and dates on
 * the year — the whole reason a column of figures is scannable. Yes/No is
 * centred because the value is a mark rather than text. Everything else
 * reads as language and stays left.
 */
export function alignFor(type: ColumnType): CellAlign {
  if (type === "number") return "right";
  if (type === "date") return "right";
  if (type === "bool") return "center";
  return "left";
}

/** Short label for the header type icon's tooltip. */
export const TYPE_LABELS: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  bool: "Yes / No",
  file: "File",
  date: "Date",
  select: "Dropdown",
  url: "Link",
  group: "Group",
};

/* ------------------------------------------------------------------ */
/*  Bulk cell edits                                                    */
/* ------------------------------------------------------------------ */

/** One cell to write. Returned rather than applied, so the caller decides
 *  how to persist and can feed the whole batch through undo as one step. */
export type CellChange = { rowIndex: number; column: string; value: string };

const sortedUnique = (indices: number[]): number[] =>
  [...new Set(indices)].sort((a, b) => a - b);

/**
 * Copy the first selected row's value down through the rest.
 *
 * "First" means the topmost selected row, not the first one clicked — a
 * selection built bottom-up would otherwise fill the column with the wrong
 * value, and which end the user started from is not something they should
 * have to think about.
 *
 * Cells that already hold the target value are left out of the result, so a
 * fill over an already-consistent column is a no-op rather than a hundred
 * writes and an undo step that changes nothing.
 */
export function fillDown(
  rows: Record<string, string>[],
  rowIndices: number[],
  column: string,
): CellChange[] {
  const ordered = sortedUnique(rowIndices).filter((index) => rows[index]);
  if (ordered.length < 2) return [];
  const value = rows[ordered[0]]?.[column] ?? "";
  return ordered
    .slice(1)
    .filter((rowIndex) => (rows[rowIndex][column] ?? "") !== value)
    .map((rowIndex) => ({ rowIndex, column, value }));
}

/** Write one value into a column across the selected rows. */
export function setColumnValue(
  rows: Record<string, string>[],
  rowIndices: number[],
  column: string,
  value: string,
): CellChange[] {
  return sortedUnique(rowIndices)
    .filter((rowIndex) => rows[rowIndex] && (rows[rowIndex][column] ?? "") !== value)
    .map((rowIndex) => ({ rowIndex, column, value }));
}

/**
 * Blank every editable cell in the selected rows.
 *
 * File columns are skipped: their value is a reference to an uploaded
 * document, and silently detaching files as part of "clear cells" is a much
 * bigger action than the phrase suggests.
 */
export function clearCells(
  rows: Record<string, string>[],
  rowIndices: number[],
  columns: ColumnDef[],
): CellChange[] {
  const targets = columns.filter((col) => col.type !== "group" && col.type !== "file" && !col.hidden);
  const changes: CellChange[] = [];
  sortedUnique(rowIndices).forEach((rowIndex) => {
    const row = rows[rowIndex];
    if (!row) return;
    targets.forEach((col) => {
      if ((row[col.name] ?? "") !== "") changes.push({ rowIndex, column: col.name, value: "" });
    });
  });
  return changes;
}

/**
 * The distinct values already used in a column, for the bulk-set picker.
 *
 * Offering what is already there is what keeps a free-text column from
 * drifting into "Submitted", "submitted" and "Submitted " as three states.
 */
export function existingValues(
  rows: Record<string, string>[],
  column: string,
  limit = 12,
): string[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = (row?.[column] ?? "").trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

/* ------------------------------------------------------------------ */
/*  Keyboard shortcuts (single source for the help panel)              */
/* ------------------------------------------------------------------ */

export type Shortcut = { keys: string; description: string };

export type ShortcutGroup = { title: string; items: Shortcut[] };

/**
 * Documented here rather than in the panel's JSX so the list is data, and so
 * a shortcut cannot be added to the grid without an obvious place to
 * describe it. Every entry below is a binding that already exists.
 */
export const SHEET_SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Moving around",
    items: [
      { keys: "↑ ↓ ← →", description: "Move between cells" },
      { keys: "Tab / Shift+Tab", description: "Next or previous cell, wrapping at the row end" },
      { keys: "Enter", description: "Edit the focused cell" },
      { keys: "Esc", description: "Cancel an edit; press again to deselect the cell. Also clears the search box." },
    ],
  },
  {
    title: "Editing",
    items: [
      { keys: "Type anything", description: "Start editing and replace the cell's value" },
      { keys: "Ctrl/Cmd + D", description: "Copy the value from the cell above" },
      { keys: "Ctrl/Cmd + C", description: "Copy the cell, or every selected row" },
      { keys: "Ctrl/Cmd + V", description: "Paste, spilling across cells and rows" },
      { keys: "Delete / Backspace", description: "Clear the focused cell" },
      { keys: "Ctrl/Cmd + Z", description: "Undo · Ctrl/Cmd + Shift + Z to redo" },
    ],
  },
  {
    title: "Rows and selection",
    items: [
      { keys: "Click a row number", description: "Select the row · Shift+click extends the selection" },
      { keys: "Selection bar", description: "Fill down, set a column, clear, duplicate or delete" },
    ],
  },
  {
    title: "The sheet",
    items: [
      { keys: "Ctrl/Cmd + K", description: "Command palette — run anything by name" },
      { keys: "?", description: "Open this panel" },
      { keys: "/", description: "Jump to search" },
    ],
  },
  {
    title: "Record panel",
    items: [
      { keys: "← →", description: "Step to the previous or next record" },
    ],
  },
];
