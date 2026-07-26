/* ------------------------------------------------------------------ */
/*  Ask AI prompt catalog for sheets                                   */
/*                                                                    */
/*  SCHOLARDOCX-0150: the sheet "Ask AI" button feeds Lumi one of     */
/*  these context-aware prompts. Each `build()` returns a natural-     */
/*  language message phrased as an imperative action request so the   */
/*  existing `/ai/actions/plan` -> `/ai/actions/execute` flow picks   */
/*  it up (see looksLikeWorkspaceAction in FloatingAssistant). No     */
/*  cell values are sent — only schema + selection, matching the      */
/*  action planner's design (it uses read actions to inspect data).   */
/*                                                                    */
/*  Prompt design rules (user feedback 2026-07-19):                   */
/*    - Concrete and metric-driven, not vague ("analyze it").         */
/*    - Descriptions are complete sentences shown inline, not hover   */
/*      tooltips — the user must understand the prompt before click.  */
/*    - Every prompt maps to a real action the planner can run.       */
/* ------------------------------------------------------------------ */

import type { ColumnDef } from "./sheetModel";

export type AskAiContext = {
  projectName: string;
  sheetName: string;
  /**
   * Exact IDs of the open project + sheet. SCHOLARDOCX-0150: names can
   * collide (several projects/sheets with the same name), so prompts must
   * target the sheet by ID. The backend action planner resolves
   * `project_id` / `sheet_id` before falling back to names
   * (ai_actions_workspace.py:45-65, ai_actions_execute.py:27-60), and the
   * workspace snapshot already exposes these IDs to the model, so this is
   * a safe, unambiguous reference.
   */
  projectId: string;
  sheetId?: string;
  /** degree_type of the owning project, if any (shapes domain hints). */
  degreeType?: string;
  /** data columns only — `group` columns are excluded. */
  columns: { name: string; type: string }[];
  rowCount: number;
  /** number of currently selected rows (0 if none). */
  selectionCount: number;
  /** human-readable summary of the current selection/focus, for context. */
  selectionSummary?: string;
  focusedCell?: { rowIndex: number; colName: string } | null;
};

export type AskAiPromptGroup = "analyze" | "transform" | "selection";

export type AskAiPrompt = {
  id: string;
  /** short label shown as the row title. */
  title: string;
  /** full, self-contained description shown inline (never hover-only). */
  description: string;
  group: AskAiPromptGroup;
  /** builds the message Lumi receives. */
  build: (ctx: AskAiContext) => string;
};

/** Compact column listing for the prompt body (name + type). */
function columnList(columns: AskAiContext["columns"]): string {
  if (columns.length === 0) return "(no columns yet)";
  return columns.map((c) => `${c.name} (${c.type})`).join(", ");
}

/**
 * Unambiguous targeting clause for the prompt body. Sends the exact IDs the
 * planner resolves first, with the names kept purely as human-readable
 * labels. Example output:
 *   the sheet "Professors" (sheet_id: "abc-123") in project "Canada PhD" (project_id: "def-456")
 */
export function target(ctx: AskAiContext): string {
  const sheetPart = ctx.sheetId
    ? `the sheet "${ctx.sheetName}" (sheet_id: "${ctx.sheetId}")`
    : `the sheet "${ctx.sheetName}"`;
  const projectPart = `(project_id: "${ctx.projectId}")`;
  const namePart = ctx.projectName ? ` in project "${ctx.projectName}" ` : " ";
  const rowsPart = `[rows: ${ctx.rowCount}]`;
  return `${sheetPart}${namePart}${projectPart} ${rowsPart}`;
}


export const ASK_AI_PROMPTS: AskAiPrompt[] = [
  // ── Analyze (read-only) ───────────────────────────────────────────
  {
    id: "deadline-risk",
    title: "What deadlines are coming up?",
    description:
      "Shows every deadline in the next 45 days, warns about anything overdue, and breaks down how many are due this week, next two weeks, and this month.",
    group: "analyze",
    build: (ctx) =>
      `Show me all upcoming deadlines in ${target(ctx)} for the next 45 days. ` +
      `Also check for any overdue items with dates that already passed. ` +
      `Present: 1) OVERDUE items first (if any), 2) upcoming deadlines sorted soonest-first with university/professor name and the date, ` +
      `3) count: how many due in 7 days, 14 days, 30 days. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "missing-info",
    title: "Find incomplete rows",
    description:
      "Scans every row for missing deadlines, empty program names, blank emails, or no status — then lists exactly what's missing and what to fix first.",
    group: "analyze",
    build: (ctx) =>
      `Read all rows in ${target(ctx)} and find which ones have missing or empty values in important columns ` +
      `(deadlines, university/program name, status, contact emails, professor name). ` +
      `For each incomplete row, tell me: the row number, what specific fields are blank, ` +
      `and rank by urgency (missing deadlines = fix first, missing notes = fix last). ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "find-duplicates",
    title: "Find duplicate entries",
    description:
      "Checks if any university, professor, or program appears more than once in your sheet so you can clean up accidental duplicates.",
    group: "analyze",
    build: (ctx) =>
      `Read all rows in ${target(ctx)} and check for duplicate entries. ` +
      `Look at key identifier columns (university name, professor name, program name, email) ` +
      `and flag any values that appear in more than one row. ` +
      `For each duplicate found, show: the duplicate value, which rows contain it (by row number), ` +
      `and whether the rows are exact duplicates or partial matches. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "daily-action-plan",
    title: "What should I work on today?",
    description:
      "Reads your data and gives you a plain-English to-do list: which emails to send, which deadlines to prepare for, which applications need attention right now.",
    group: "analyze",
    build: (ctx) =>
      `Read all rows in ${target(ctx)} and create a concrete, prioritized action list for today. ` +
      `Look at: 1) deadlines in the next 7 days (prepare or submit), ` +
      `2) rows where an email was sent but no response yet (follow up if 7+ days), ` +
      `3) rows with status like "Researching" or blank that need progress, ` +
      `4) anything overdue that needs immediate action. ` +
      `Present as a numbered to-do list with specific actions like "Email Prof. X at Y University" ` +
      `or "Finalize SOP for Z (deadline: DATE)". Keep it actionable, not analytical. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },

  // ── Smart Actions (writes) ────────────────────────────────────────
  {
    id: "draft-emails",
    title: "Write outreach emails for each row",
    description:
      "Creates an Email Draft column and writes a unique, professional first-contact email for each professor/program that mentions their name and your interest.",
    group: "transform",
    build: (ctx) =>
      `Add a new "Email Draft" text column to ${target(ctx)}, then draft a personalized ` +
      `first-contact email for every row. Each email must reference that row's university/professor/program, be professional ` +
      `and concise (120–180 words), and express genuine interest. Read the existing rows first so each email matches its row. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "fill-empty-cells",
    title: "Fill all empty cells",
    description:
      "Scans every row for blank cells and fills in what it can infer from context — like missing statuses, dates, or program details based on other columns.",
    group: "transform",
    build: (ctx) =>
      `Read all rows in ${target(ctx)} and identify every empty cell. ` +
      `For each empty cell, try to infer a reasonable value from the other columns in the same row. ` +
      `Examples: if university and program are filled but status is empty, set status to "Researching". ` +
      `If a deadline column is empty but other deadline info exists in notes, extract it. ` +
      `If a boolean column (like "GRE Required" or "Applied") is blank, infer from context. ` +
      `Only fill cells where you have reasonable confidence. Skip cells you can't infer. ` +
      `Use update_row to fill each cell. Report what you filled and what you skipped. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "row-summaries",
    title: "Add a summary for each row",
    description:
      "Creates a Summary column and writes a one-line plain-English description of each application's current state — great for quick scanning.",
    group: "transform",
    build: (ctx) =>
      `Add a new "Summary" text column to ${target(ctx)}, then read all rows and write a concise ` +
      `one-line summary for each row (max 100 characters). The summary should capture the most important ` +
      `current state, for example: "MIT CS PhD — applied Nov 15, waiting for response" or ` +
      `"Prof. Chen at Stanford — emailed, no reply yet, deadline Dec 1". ` +
      `Use the row's actual data, not generic text. Each summary must be unique to its row. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },

  // ── Selection-aware (shown only with a selection / focused cell) ──
  {
    id: "compare-selected",
    title: "Compare these rows side by side",
    description:
      "Creates a detailed comparison of your selected rows highlighting key differences in deadlines, funding, status, and requirements so you can make a decision.",
    group: "selection",
    build: (ctx) =>
      `I have selected ${ctx.selectionCount} row(s) in ${target(ctx)}.` +
      `${ctx.selectionSummary ? ` ${ctx.selectionSummary}.` : ""} ` +
      `Read all rows, then compare ONLY the selected rows side by side. ` +
      `Create a comparison covering: ` +
      `1. Key facts (university, program, professor if available) ` +
      `2. Deadlines — which is soonest? ` +
      `3. Funding/scholarships — which offers more? ` +
      `4. Status — where is each application in the process? ` +
      `5. Missing info — which one has more gaps? ` +
      `Present as a markdown comparison table, then give a brief recommendation on which to prioritize. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "fill-cell",
    title: "Smart-fill this cell",
    description:
      "Reads the data in this row and intelligently suggests what should go in the cell you're focused on, then offers to fill it in for you.",
    group: "selection",
    build: (ctx) => {
      const cell = ctx.focusedCell;
      if (!cell) {
        return `Look at ${target(ctx)} and suggest a value for ` +
          `the most important empty cell in the top row. Columns: ${columnList(ctx.columns)}.`;
      }
      return `Look at the "${cell.colName}" cell in row ${cell.rowIndex + 1} of ${target(ctx)}. ` +
        `Read that row's other data, then propose a sensible value for the "${cell.colName}" cell ` +
        `and offer to write it in. Columns in this sheet: ${columnList(ctx.columns)}.`;
    },
  },
];

/**
 * Build an {@link AskAiContext} from raw sheet state. Lives here so
 * ProjectWorkspace stays thin and the prompt logic is testable in isolation.
 */
export function buildAskAiContext(args: {
  projectId: string;
  sheetId?: string;
  projectName: string;
  sheetName: string;
  degreeType?: string;
  columns: ColumnDef[];
  rows: unknown[];
  selectedRows: Set<number>;
  focusedCell?: { rowIndex: number; colName: string } | null;
}): AskAiContext {
  const {
    projectId,
    sheetId,
    projectName,
    sheetName,
    degreeType,
    columns,
    rows,
    selectedRows,
    focusedCell,
  } = args;

  const dataColumns = columns
    .filter((c) => c.type !== "group")
    .map((c) => ({ name: c.name, type: c.type }));

  const selectionCount = selectedRows.size;
  let selectionSummary: string | undefined;
  if (selectionCount > 0) {
    selectionSummary = `${selectionCount} row${selectionCount > 1 ? "s" : ""} selected`;
  } else if (focusedCell) {
    selectionSummary = `focused on "${focusedCell.colName}" in row ${focusedCell.rowIndex + 1}`;
  }

  return {
    projectId,
    sheetId,
    projectName,
    sheetName,
    degreeType,
    columns: dataColumns,
    rowCount: rows.length,
    selectionCount,
    selectionSummary,
    focusedCell,
  };
}

/** Prompts that should only render when the user has a selection or focus. */
export function visiblePrompts(ctx: AskAiContext): AskAiPrompt[] {
  const hasSelection = ctx.selectionCount > 0 || !!ctx.focusedCell;
  return ASK_AI_PROMPTS.filter((p) => p.group !== "selection" || hasSelection);
}
