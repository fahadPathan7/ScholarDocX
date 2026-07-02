/* ------------------------------------------------------------------ */
/*  Sheet data model — types, constants, column migration              */
/* ------------------------------------------------------------------ */

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
    description: "Track emails and meetings with prospective advisors.",
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
    description: "Compare universities, programs, and deadlines.",
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
    description: "Manage funding opportunities and applications.",
    columns: [
      { name: "Scholarship Name", type: "text", width: 200 },
      { name: "Amount", type: "number", width: 100 },
      { name: "Deadline", type: "date", width: 120 },
      { name: "Status", type: "select", options: ["Found", "Writing Essay", "Applied", "Won", "Lost"], width: 120 },
      { name: "Requirements", type: "text", width: 300 }
    ]
  },
  {
    id: "doc_checklist",
    name: "Document Checklist",
    description: "Keep track of transcripts, SOPs, and LORs.",
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
  projectId: number | string;
  sheetId?: number | string;
  pageId?: number | string;
  rowIndex?: number;
};
