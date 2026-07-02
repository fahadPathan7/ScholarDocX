/* ------------------------------------------------------------------ */
/*  sheetPaste — TSV parsing and clipboard utilities                   */
/* ------------------------------------------------------------------ */

import type { ColumnDef } from "./sheetModel";

/**
 * Parse a TSV string from clipboard into an array of row objects mapped to visible columns.
 */
export function parseTSV(tsv: string, visibleColumns: ColumnDef[]): Record<string, string>[] {
  const newRows: Record<string, string>[] = [];
  
  if (!tsv.trim()) return newRows;

  // Split by newline, handling Windows (\r\n) and Unix (\n)
  const lines = tscSplit(tsv);

  for (const line of lines) {
    if (!line.trim()) continue; // skip empty lines

    const cells = line.split('\t');
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
 * Safely split TSV into lines avoiding issues with quoted newlines (basic implementation)
 */
function tscSplit(tsv: string): string[] {
  // A robust CSV/TSV parser would handle quotes. 
  // For basic TSV paste, splitting by \n is usually sufficient for Excel/Google Sheets.
  return tsv.split(/\r?\n/);
}

/**
 * Format an array of rows into a TSV string using visible columns.
 */
export function formatTSV(rows: Record<string, string>[], visibleColumns: ColumnDef[]): string {
  const lines = rows.map(row => {
    return visibleColumns.map(col => {
      const val = row[col.name] || "";
      // Escape tabs and newlines within the value by wrapping in quotes
      if (val.includes('\t') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join('\t');
  });

  return lines.join('\n');
}
