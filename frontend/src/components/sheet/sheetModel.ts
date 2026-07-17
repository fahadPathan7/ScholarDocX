/* ------------------------------------------------------------------ */
/*  Sheet data model — types, constants, column migration              */
/* ------------------------------------------------------------------ */

import type { CSSProperties } from "react";
import type { RecordMap } from "../../lib/api";
import type { EmailConfig } from "../EmailConfigModal";

/* ------------------------------------------------------------------ */
/*  Column definition types                                           */
/* ------------------------------------------------------------------ */

export type ColumnType = "text" | "number" | "bool" | "file" | "date" | "select" | "group" | "url";

export type ColumnDef = {
  name: string;
  type: ColumnType;
  width?: number;
  group?: string;
  color?: string;
  options?: string[];
  unique?: boolean;
  hidden?: boolean;
};

export const GROUP_COLORS = ["#2f6d7a", "#b24f4f", "#c58940", "#4f8a45", "#6f42c1", "#007bff"];

export interface DateColorConfig {
  redDays: number;
  yellowDays: number;
}

/* ------------------------------------------------------------------ */
/*  Cell / row formatting (stored as reserved row keys)               */
/*                                                                     */
/*  Mirrors the existing `_height` pattern: per-row metadata rides     */
/*  along on the row object as a JSON-string value under a reserved    */
/*  `_`-prefixed key. CSV/paste iterate over columns only, so these    */
/*  keys never leak; undo snapshots whole rows, so they round-trip;    */
/*  AI row updates use `.update()` and preserve them.                  */
/* ------------------------------------------------------------------ */

export const CELL_STYLES_KEY = "_cellStyles";
export const ROW_STYLE_KEY = "_rowStyle";

/** Text decoration toggles. */
export type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text color, e.g. "#cc0000". */
  color?: string;
  /** Cell background color, e.g. "#eeeeee". */
  bg?: string;
  align?: "left" | "center" | "right";
  fontSize?: "sm" | "md" | "lg" | "xl";
  fontFamily?: string;
};

/** Per-row style. Cell-level bg wins over row bg when both are set. */
export type RowStyle = {
  bg?: string;
};

/** Curated font size presets (px). Avoids arbitrary sizes. */
export const FONT_SIZES: Record<NonNullable<CellStyle["fontSize"]>, number> = {
  sm: 11,
  md: 13,
  lg: 15,
  xl: 18,
};

/** Restrained row-background palette for the row-color affordance. */
export const ROW_BG_COLORS = [
  "#ffffff", "#fff3bf", "#ffe3e3", "#d3f9d8",
  "#c5f6fa", "#d0ebff", "#e5dafc", "#f1f3f5",
];

/**
 * Curated system font stacks. No web fonts — keeps the app local-first
 * and offline-safe, and avoids layout shift from font loading.
 */
export const FONT_FAMILIES: Record<string, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  arial: 'Arial, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: '"Trebuchet MS", sans-serif',
  calibri: 'Calibri, Candara, sans-serif',
  optima: 'Optima, Segoe, "Segoe UI", Candara, sans-serif',
  century: '"Century Gothic", CenturyGothic, AppleGothic, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  palatino: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif',
  garamond: 'Garamond, "EB Garamond", serif',
  bookman: '"Bookman Old Style", Georgia, serif',
  goudy: '"Goudy Old Style", Georgia, serif',
  times: '"Times New Roman", Times, serif',
  mono: '"SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
};

/** Parse a row's `_cellStyles` blob safely. Never throws. */
export function parseCellStyles(row: Record<string, string>): Record<string, CellStyle> {
  const raw = row[CELL_STYLES_KEY];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Parse a row's `_rowStyle` blob safely. Never throws. */
export function parseRowStyle(row: Record<string, string>): RowStyle {
  const raw = row[ROW_STYLE_KEY];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merge a partial CellStyle onto the cell's existing style.
 * Boolean keys set to `false` and string keys set to `""` / `undefined`
 * are removed (toggle-off), keeping the blob compact.
 * Returns the new row object (does not mutate the input).
 */
export function applyCellStyle(
  row: Record<string, string>,
  colName: string,
  patch: CellStyle,
): Record<string, string> {
  const styles = parseCellStyles(row);
  const current: CellStyle = styles[colName] || {};
  const merged: CellStyle = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    const k = key as keyof CellStyle;
    if (value === false || value === "" || value === undefined) {
      delete merged[k];
    } else {
      (merged[k] as unknown) = value;
    }
  }

  const nextStyles = { ...styles };
  if (Object.keys(merged).length === 0) {
    delete nextStyles[colName];
  } else {
    nextStyles[colName] = merged;
  }

  const nextRow = { ...row };
  if (Object.keys(nextStyles).length === 0) {
    delete nextRow[CELL_STYLES_KEY];
  } else {
    nextRow[CELL_STYLES_KEY] = JSON.stringify(nextStyles);
  }
  return nextRow;
}

/** Clear all style keys for a cell. Returns a new row object. */
export function clearCellStyle(
  row: Record<string, string>,
  colName: string,
): Record<string, string> {
  const styles = parseCellStyles(row);
  if (!styles[colName]) return row;
  const nextStyles = { ...styles };
  delete nextStyles[colName];
  const nextRow = { ...row };
  if (Object.keys(nextStyles).length === 0) {
    delete nextRow[CELL_STYLES_KEY];
  } else {
    nextRow[CELL_STYLES_KEY] = JSON.stringify(nextStyles);
  }
  return nextRow;
}

/** Merge a partial RowStyle onto the row's style. Returns a new row. */
export function applyRowStyle(
  row: Record<string, string>,
  patch: RowStyle,
): Record<string, string> {
  const current = parseRowStyle(row);
  const merged: RowStyle = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!value) {
      delete (merged as Record<string, unknown>)[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  const nextRow = { ...row };
  if (Object.keys(merged).length === 0) {
    delete nextRow[ROW_STYLE_KEY];
  } else {
    nextRow[ROW_STYLE_KEY] = JSON.stringify(merged);
  }
  return nextRow;
}

/**
 * Map a CellStyle to React CSSProperties for the inner text span.
 * Layout-level props (align, bg, fontFamily, fontSize) are handled
 * separately on the `<td>` so the whole cell area reflects them.
 */
export function textStyleToCss(style: CellStyle): CSSProperties {
  const css: CSSProperties = {};
  if (style.bold) css.fontWeight = "bold";
  if (style.italic) css.fontStyle = "italic";
  if (style.underline || style.strike) {
    css.textDecoration = [style.underline ? "underline" : null, style.strike ? "line-through" : null]
      .filter(Boolean)
      .join(" ") || undefined;
  }
  if (style.color) css.color = style.color;
  return css;
}

/**
 * Map a CellStyle to React CSSProperties for the `<td>`.
 * Includes alignment, background, font family, and font size so the whole
 * cell area (not just the inner span) reflects them.
 */
export function cellBoxToCss(style: CellStyle): CSSProperties {
  const css: CSSProperties = {};
  if (style.align) css.textAlign = style.align;
  if (style.bg) css.backgroundColor = style.bg;
  if (style.fontFamily && FONT_FAMILIES[style.fontFamily]) {
    css.fontFamily = FONT_FAMILIES[style.fontFamily];
  }
  if (style.fontSize && FONT_SIZES[style.fontSize]) {
    css.fontSize = `${FONT_SIZES[style.fontSize]}px`;
  }
  return css;
}

export const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "bool", label: "Yes / No" },
  { value: "file", label: "File / Document" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "url", label: "Link" },
];

/* ------------------------------------------------------------------ */
/*  Predefined Sheet Templates                                        */
/* ------------------------------------------------------------------ */

export type SheetTemplate = {
  id: string;
  name: string;
  description: string;
  columns: ColumnDef[];
};

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: "prof_outreach",
    name: "Professor Outreach",
    description: "Track professor contacts with columns for Name, University, Research Area, Status, Website, Last Contact, and Notes.",
    columns: [
      { name: "Professor Name", type: "text", width: 150 },
      { name: "University", type: "text", width: 150 },
      { name: "Research Area", type: "text", width: 200 },
      { name: "Status", type: "select", options: ["To Contact", "Emailed", "Replied", "Meeting Scheduled", "Rejected", "Accepted"], width: 150 },
      { name: "Website", type: "url", width: 200 },
      { name: "Last Contact", type: "date", width: 120 },
      { name: "Notes", type: "text", width: 300 }
    ]
  },
  {
    id: "univ_shortlist",
    name: "University Shortlist",
    description: "Compare universities and programs with columns for University, Program, Deadline, Application Fee, GRE Required, Status, and Portal Link.",
    columns: [
      { name: "University", type: "text", width: 150 },
      { name: "Program", type: "text", width: 150 },
      { name: "Deadline", type: "date", width: 120 },
      { name: "Application Fee", type: "number", width: 100 },
      { name: "GRE Required", type: "bool", width: 100 },
      { name: "Status", type: "select", options: ["Researching", "Applying", "Applied", "Admitted", "Waitlisted", "Rejected"], width: 150 },
      { name: "Portal Link", type: "url", width: 200 }
    ]
  },
  {
    id: "scholarship_tracker",
    name: "Scholarship Tracker",
    description: "Monitor funding opportunities with columns for Scholarship Name, Sponsor, Amount, Coverage, Deadline, Status, Eligible Countries, Requirements, and URL.",
    columns: [
      { name: "Scholarship Name", type: "text", width: 200 },
      { name: "Sponsor", type: "text", width: 160 },
      { name: "Amount", type: "number", width: 100 },
      { name: "Funding Coverage", type: "text", width: 160 },
      { name: "Deadline", type: "date", width: 120 },
      { name: "Status", type: "select", options: ["Found", "Writing Essay", "Applied", "Won", "Lost"], width: 120 },
      { name: "Eligible Countries", type: "text", width: 200 },
      { name: "Requirements", type: "text", width: 300 },
      { name: "Application URL", type: "url", width: 200 }
    ]
  },
  {
    id: "doc_checklist",
    name: "Document Checklist",
    description: "Organize application materials with columns for Document Type, Target, Status, File attachment, and Notes.",
    columns: [
      { name: "Document Type", type: "select", options: ["SOP", "Resume", "Transcript", "LOR", "Passport", "Test Score"], width: 150 },
      { name: "Target", type: "text", width: 150 },
      { name: "Status", type: "select", options: ["Not Started", "Drafting", "Reviewing", "Finalized", "Submitted"], width: 120 },
      { name: "File", type: "file", width: 200 },
      { name: "Notes", type: "text", width: 200 }
    ]
  }
];

export function getCustomTemplates(): SheetTemplate[] {
  try {
    const data = localStorage.getItem("scholardock_custom_templates");
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load custom templates", e);
  }
  return [];
}

export function saveCustomTemplate(name: string, description: string, columns: ColumnDef[]) {
  const templates = getCustomTemplates();
  const id = "custom_" + Date.now();
  templates.push({ id, name, description, columns });
  localStorage.setItem("scholardock_custom_templates", JSON.stringify(templates));
  return id;
}

/* ------------------------------------------------------------------ */
/*  Column migration (old string[] → ColumnDef[])                      */
/* ------------------------------------------------------------------ */

/** Migrate old string[] columns to ColumnDef[]. */
export function migrateColumns(raw: unknown[]): ColumnDef[] {
  if (!raw || raw.length === 0) return [];
  let cols: ColumnDef[];
  if (typeof raw[0] === "string") {
    cols = (raw as string[]).map((name) => ({ name, type: "text" as ColumnType }));
  } else {
    cols = raw as ColumnDef[];
  }

  let hasEmailGroup = cols.some(c => c.type === "group" && c.name === "Email");
  let hasAttachGroup = cols.some(c => c.type === "group" && c.name === "Attachments");
  
  const finalCols: ColumnDef[] = [];
  for (const col of cols) {
    if (!hasEmailGroup && !col.group && (col.name.toLowerCase().includes("email subject") || col.name.toLowerCase().includes("email body"))) {
      finalCols.push({ name: "Email", type: "group", color: "#4f8a45" });
      hasEmailGroup = true;
    }
    if (!hasAttachGroup && col.type === "file" && !col.group) {
      finalCols.push({ name: "Attachments", type: "group", color: "#c58940" });
      hasAttachGroup = true;
    }

    if (col.name.toLowerCase().includes("email subject") || col.name.toLowerCase().includes("email body")) {
      if (!col.group) col.group = "Email";
    } else if (col.type === "file" && !col.group) {
      col.group = "Attachments";
    }
    
    finalCols.push(col);
  }
  
  return finalCols;
}

/* ------------------------------------------------------------------ */
/*  Sheet page type                                                   */
/* ------------------------------------------------------------------ */

export type SheetPage = RecordMap & {
  columns?: ColumnDef[];
  rows?: Record<string, string>[];
  email_config?: EmailConfig;
};

/* ------------------------------------------------------------------ */
/*  Navigation target type                                            */
/* ------------------------------------------------------------------ */

export type ProjectNavigationTarget = {
  token: number;
  projectId: string;
  sheetId?: string;
  pageId?: string;
  rowIndex?: number;
};
