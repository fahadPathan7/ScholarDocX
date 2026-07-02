/* ------------------------------------------------------------------ */
/*  sheetPaste — TSV parsing and clipboard utilities                   */
/* ------------------------------------------------------------------ */

import type { ColumnDef } from "./sheetModel";
import { parseDelimited } from "./sheetCsv";

/**
 * Parse a TSV string from the clipboard into row objects mapped to the
 * visible columns left-to-right. Handles quoted cells (multiline values,
 * embedded tabs) the way Excel/Google Sheets emit them — and the way our
 * own formatTSV emits them, so copy → paste round-trips.
 */
export function parseTSV(tsv: string, visibleColumns: ColumnDef[]): Record<string, string>[] {
  const newRows: Record<string, string>[] = [];

  if (!tsv.trim()) return newRows;

  const lines = parseDelimited(tsv, '\t');

  for (const cells of lines) {
    const newRow: Record<string, string> = {};

    // Map cells to visible columns left-to-right
    for (let i = 0; i < Math.min(cells.length, visibleColumns.length); i++) {
      const colName = visibleColumns[i].name;
      const cellValue = cells[i].trim();

      if (cellValue) {
        newRow[colName] = cellValue;
      }
    }

    if (Object.keys(newRow).length > 0) {
      newRows.push(newRow);
    }
  }

  return newRows;
}

/**
 * Format an array of rows into a TSV string using visible columns.
 */
export function formatTSV(rows: Record<string, string>[], visibleColumns: ColumnDef[]): string {
  const lines = rows.map(row => {
    return visibleColumns.map(col => {
      const val = row[col.name] || "";
      // Escape tabs and newlines within the value by wrapping in quotes
      if (val.includes('\t') || val.includes('\n') || val.includes('\r') || val.includes('"')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join('\t');
  });

  return lines.join('\n');
}
