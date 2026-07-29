/* ------------------------------------------------------------------ */
/*  Ask AI prompt catalog for sheets                                   */
/*                                                                    */
/*  SCHOLARDOCX-0150: the sheet "Ask AI" button feeds Lumi one of     */
/*  these context-aware prompts. Each `build()` returns a natural-     */
/*  language message phrased as an imperative action request so the   */
/*  existing `/ai/actions/plan` -> `/ai/actions/execute` flow picks   */
/*  it up (see looksLikeWorkspaceAction in FloatingAssistant).        */
/*                                                                    */
/*  SCHOLARDOCX-0179: rewritten around row/column scope after a user  */
/*  report that the prior whole-sheet catalog (draft an email for     */
/*  every row, fill every empty cell, summarize every row, etc.) was  */
/*  "too heavy for AI". Root cause: the planner's JSON output is      */
/*  capped at 1200 tokens (AiActionService.plan) and only ever sees   */
/*  the sheet's first 30 rows of real data (_target_sheet_block in    */
/*  ai_actions.py) — a request needing unique generated content for   */
/*  every row of a 50+ row sheet cannot fit in that budget, and a     */
/*  request aimed at row 45 had no visibility into that row at all.   */
/*  Every prompt below targets one row, one column, or a small        */
/*  user-selected set of rows, and every build() explicitly tells     */
/*  the model to say so — not guess — when it doesn't have enough     */
/*  data for what was asked. Row-scoped and multi-row-compare         */
/*  prompts embed a `(row_index: N)` / `(row_indices: [N,M,...])`     */
/*  marker that `_target_sheet_block` reads to guarantee those exact  */
/*  rows' real data is included even outside the first-30 window.    */
/*                                                                    */
/*  Prompt design rules:                                              */
/*    - Concrete and metric-driven, not vague ("analyze it").         */
/*    - Descriptions are complete sentences shown inline, not hover   */
/*      tooltips — the user must understand the prompt before click.  */
/*    - Every prompt maps to a real action the planner can run.       */
/*    - Every prompt tells the model to admit insufficient data.      */
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
  /** 0-based indices of the currently selected rows, sorted ascending. */
  selectedRowIndices: number[];
  /** human-readable summary of the current selection/focus, for context. */
  selectionSummary?: string;
  focusedCell?: { rowIndex: number; colName: string } | null;
};

export type AskAiPromptGroup = "row" | "column" | "compare" | "deadlines";

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

/**
 * Row-scoped targeting clause: `target()` plus a structured `(row_index: N)`
 * marker. `_target_sheet_block` (backend) parses this to guarantee the
 * planner sees that row's real data even when it falls outside the default
 * first-30-rows injection window (SCHOLARDOCX-0179).
 */
export function rowTarget(ctx: AskAiContext): string {
  const cell = ctx.focusedCell;
  if (!cell) return target(ctx);
  return `${target(ctx)} (row_index: ${cell.rowIndex})`;
}

/** Like {@link rowTarget}, for a small set of selected rows (compare). */
export function selectedRowsTarget(ctx: AskAiContext): string {
  if (ctx.selectedRowIndices.length === 0) return target(ctx);
  return `${target(ctx)} (row_indices: [${ctx.selectedRowIndices.join(", ")}])`;
}

/** 1-based row number for the currently focused cell, defaulting to 1. */
function focusedRowNumber(ctx: AskAiContext): number {
  return (ctx.focusedCell?.rowIndex ?? 0) + 1;
}

export const ASK_AI_PROMPTS: AskAiPrompt[] = [
  // ── This Row (needs a focused cell) ────────────────────────────────
  {
    id: "fill-cell",
    title: "Smart-fill this cell",
    description:
      "Reads this row's other data and suggests a value for the cell you're focused on, then offers to write it in — or tells you if there isn't enough context to suggest anything.",
    group: "row",
    build: (ctx) => {
      const cell = ctx.focusedCell;
      if (!cell) {
        return `Focus a cell first, then ask me to smart-fill it. Columns in ${target(ctx)}: ${columnList(ctx.columns)}.`;
      }
      return (
        `Using ONLY the actual data shown for row ${cell.rowIndex + 1} in ${rowTarget(ctx)}, propose a sensible ` +
        `value for the "${cell.colName}" cell in that row and offer to write it in with update_row. ` +
        `If you do not have this row's real data in view, or the row's other cells don't give you enough to infer ` +
        `a confident value, say so plainly and name what's missing instead of guessing. ` +
        `Columns in this sheet: ${columnList(ctx.columns)}.`
      );
    },
  },
  {
    id: "row-summary",
    title: "Summarize this row",
    description:
      "Writes one plain-English sentence describing this row's current state — e.g. \"MIT CS PhD — applied Nov 15, no response yet\" — using only this row's real data.",
    group: "row",
    build: (ctx) =>
      `Using ONLY the actual data shown for row ${focusedRowNumber(ctx)} in ${rowTarget(ctx)}, add a "Summary" ` +
      `text column if it doesn't already exist, then write one plain-English sentence (max 20 words) describing ` +
      `that row's current state, e.g. "MIT CS PhD — applied Nov 15, no response yet". Write it into that one row only. ` +
      `If you do not have this row's real data in view, or the row has no data yet to summarize, say so plainly ` +
      `instead of inventing a summary. Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "row-email-draft",
    title: "Draft an email for this row",
    description:
      "Writes one personalized outreach email for this row's university/professor/program, using only what's actually in the row — and tells you if there's not enough there to personalize it.",
    group: "row",
    build: (ctx) =>
      `Using ONLY the actual data shown for row ${focusedRowNumber(ctx)} in ${rowTarget(ctx)}, add an "Email Draft" ` +
      `text column if it doesn't already exist, then write ONE personalized first-contact email (120-180 words, ` +
      `professional, concise) for that row only, referencing its real university/professor/program values. Do not ` +
      `write emails for any other row. If this row doesn't have enough identifying information (e.g. no university ` +
      `or professor name) to personalize an email, say so plainly and name what's missing instead of writing a ` +
      `generic one. Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "row-next-step",
    title: "What's next for this row?",
    description:
      "Looks at this one row's deadline, status, and outreach fields and tells you the single next action to take — or says there isn't enough tracked yet to suggest one.",
    group: "row",
    build: (ctx) =>
      `Using ONLY the actual data shown for row ${focusedRowNumber(ctx)} in ${rowTarget(ctx)}, tell me the single ` +
      `most important next action for this application, e.g. "Follow up with Prof. X — no response in 9 days" or ` +
      `"Submit before the Dec 1 deadline". Base it strictly on this row's deadline, status, and outreach fields — ` +
      `nothing invented. If this row doesn't have enough tracked data (no deadline, no status, no outreach info) to ` +
      `suggest a concrete next step, say so plainly instead of giving generic advice. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },

  // ── This Column (needs a focused cell, used for its column name) ───
  {
    id: "column-missing",
    title: "Find rows missing this column",
    description:
      "Checks the column you're focused on and lists every row where it's empty, so you know exactly what to fill in.",
    group: "column",
    build: (ctx) => {
      const col = ctx.focusedCell?.colName;
      if (!col) {
        return `Focus a cell in a column first, then ask me to find rows missing that column. Columns in ${target(ctx)}: ${columnList(ctx.columns)}.`;
      }
      return (
        `In ${target(ctx)}, filter rows where the "${col}" column is empty and list them by row number. ` +
        `If the "${col}" column doesn't exist, or every row already has a value in it, tell me that directly ` +
        `instead of listing unrelated rows. Columns in this sheet: ${columnList(ctx.columns)}.`
      );
    },
  },
  {
    id: "column-breakdown",
    title: "Break down this column's values",
    description:
      "Shows every distinct value in the focused column and how many rows have each one — useful for spotting duplicates or an uneven status spread.",
    group: "column",
    build: (ctx) => {
      const col = ctx.focusedCell?.colName;
      if (!col) {
        return `Focus a cell in a column first, then ask me to break down its values. Columns in ${target(ctx)}: ${columnList(ctx.columns)}.`;
      }
      return (
        `In ${target(ctx)}, get the unique values in the "${col}" column and how many rows have each one. Call out ` +
        `any value that appears in more than one row (a likely duplicate) and how many rows have no value at all. ` +
        `If the "${col}" column doesn't exist, tell me that directly. Columns in this sheet: ${columnList(ctx.columns)}.`
      );
    },
  },

  // ── Compare (needs 2+ selected rows) ────────────────────────────────
  {
    id: "compare-selected",
    title: "Compare selected rows",
    description:
      "Creates a side-by-side comparison of the rows you've selected (2-5 works best) — deadlines, funding, status, and what's missing — with a recommendation on which to prioritize.",
    group: "compare",
    build: (ctx) => {
      const rowNumbers = ctx.selectedRowIndices.map((i) => i + 1).join(", ");
      return (
        `Using ONLY the actual data shown for rows ${rowNumbers} in ${selectedRowsTarget(ctx)}, compare exactly ` +
        `those rows side by side and nothing else. Cover: key identifying facts, deadlines (which is soonest), ` +
        `funding/scholarships (which offers more), status, and which has more missing information. Present as a ` +
        `markdown table, then one line recommending which to prioritize. If any of these rows' data is not ` +
        `available to you, say so by row number instead of guessing its contents. ` +
        `Columns available: ${columnList(ctx.columns)}.`
      );
    },
  },

  // ── Deadlines (single-purpose column scan, always available) ───────
  {
    id: "deadline-risk",
    title: "What deadlines are coming up?",
    description:
      "Scans the deadline column for what's due in the next 45 days and flags anything overdue — tells you plainly if this sheet doesn't track deadlines yet.",
    group: "deadlines",
    build: (ctx) =>
      `Show me all upcoming deadlines in ${target(ctx)} for the next 45 days, and separately flag anything overdue ` +
      `with a date that already passed. Sort soonest-first, including each row's identifying info (university/` +
      `professor/program) and the date. If this sheet has no deadline-type column, tell me that directly instead ` +
      `of treating an unrelated column as a deadline. Columns available: ${columnList(ctx.columns)}.`,
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

  const selectedRowIndices = Array.from(selectedRows).sort((a, b) => a - b);
  const selectionCount = selectedRowIndices.length;
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
    selectedRowIndices,
    selectionSummary,
    focusedCell,
  };
}

/**
 * Prompts gated on sheet state (SCHOLARDOCX-0179): "row"/"column" prompts
 * need a focused cell (that's the only reliable single-row/single-column
 * reference point today); "compare" needs 2+ selected rows; "deadlines" is
 * always available (single-purpose column scan, safe at any sheet size).
 */
export function visiblePrompts(ctx: AskAiContext): AskAiPrompt[] {
  const hasFocusedCell = !!ctx.focusedCell;
  const hasCompareSelection = ctx.selectedRowIndices.length >= 2;
  return ASK_AI_PROMPTS.filter((p) => {
    if (p.group === "row" || p.group === "column") return hasFocusedCell;
    if (p.group === "compare") return hasCompareSelection;
    return true;
  });
}
