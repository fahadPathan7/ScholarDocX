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
  return `${sheetPart}${namePart}${projectPart}`;
}

/**
 * Imperative instruction to use the IDs (not names) when emitting the plan.
 * Appended to action-oriented prompts so the model never falls back to name
 * matching, which is ambiguous when duplicates exist.
 */
const USE_IDS = ` When you emit the action plan, target this exact sheet using its project_id and sheet_id (not the names), because there may be other sheets with the same name.`;

export const ASK_AI_PROMPTS: AskAiPrompt[] = [
  // ── Analyze (read-only — targeting by ID is still exact) ──────────
  {
    id: "application-summary",
    title: "Application status breakdown",
    description:
      "Counts how many applications are in each stage (Applied, Interview, Offer, Rejected, Withdrawn) as a table, plus the overall conversion rate from applied to offer.",
    group: "analyze",
    build: (ctx) =>
      `Read every row in ${target(ctx)} and give me a full application-status breakdown. ` +
      `Group rows by their status column and count how many are in each stage ` +
      `(e.g. Applied, Interview, Offer, Rejected, Withdrawn, etc.). Present the result as a markdown table. ` +
      `Then compute: total applications, how many are still active (not rejected/withdrawn), and the conversion rate from applied to offer. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "funding-totals",
    title: "Funding & money totals",
    description:
      "Sums every money/funding/scholarship column across all rows and reports the total secured, total pending, and the biggest award so far with which university offered it.",
    group: "analyze",
    build: (ctx) =>
      `Read every row in ${target(ctx)} and calculate funding totals. ` +
      `Sum any money-related columns (funding, scholarship, stipend, tuition waiver, grant, award, etc.) across all rows. ` +
      `Report: total funding secured so far, total pending/unconfirmed, the single biggest award, and which university or program offered it. ` +
      `If a money column has non-numeric or mixed values, call those out. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "deadline-risk",
    title: "Deadline risk report",
    description:
      "Lists every deadline in the next 45 days sorted by soonest first, flags anything overdue in red, and counts how many deadlines land in the next 7, 14, and 30 days.",
    group: "analyze",
    build: (ctx) =>
      `Read every row in ${target(ctx)} and build a deadline risk report. ` +
      `Find all rows with a date/deadline column, then: (1) list every deadline in the next 45 days sorted by soonest first, ` +
      `(2) flag anything already overdue as URGENT, (3) tell me exactly how many deadlines fall in the next 7 days, 14 days, and 30 days. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "response-rate",
    title: "Outreach response rate",
    description:
      "Counts how many outreach emails were sent vs. how many got a reply, computes the response rate as a percentage, and lists the professors/universities that never replied so you can follow up.",
    group: "analyze",
    build: (ctx) =>
      `Read every row in ${target(ctx)} and analyze my outreach. ` +
      `Count how many rows have an outreach email sent, how many got a reply, and compute the response rate as a percentage. ` +
      `Then list every professor or university that has not replied yet so I know who to follow up with. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },

  // ── Fill & Transform (writes — must target by ID) ─────────────────
  {
    id: "draft-emails",
    title: "Draft outreach emails",
    description:
      "Adds an Email Draft column and writes a personalized, professional first-contact email in each row addressed to that professor/university, referencing their program and your interest.",
    group: "transform",
    build: (ctx) =>
      `Add a new "Email Draft" text column to ${target(ctx)}, then draft a personalized ` +
      `first-contact email for every row. Each email must reference that row's university/professor/program, be professional ` +
      `and concise (120–180 words), and express genuine interest. Read the existing rows first so each email matches its row. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`,
  },
  {
    id: "categorize-status",
    title: "Categorize every row by stage",
    description:
      "Adds a Stage column and assigns each row to Not Started, Researching, Ready to Apply, In Progress, or Done, based on the data already in the row.",
    group: "transform",
    build: (ctx) =>
      `Add a "Stage" select column to ${target(ctx)}, then assign every row to one of: ` +
      `"Not Started", "Researching", "Ready to Apply", "In Progress", or "Done". Base the choice on what is already in each row ` +
      `(status, dates, emails sent, application submitted, etc.). Read the rows first, then fill the column. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`
  },
  {
    id: "priority-score",
    title: "Score every row by priority 1–5",
    description:
      "Adds a Priority number column and scores each row from 1 (low) to 5 (urgent) based on deadline proximity, funding amount, and response status — so you know where to focus first.",
    group: "transform",
    build: (ctx) =>
      `Add a "Priority" number column to ${target(ctx)}, then score every row from ` +
      `1 (low) to 5 (urgent). Score based on: how close the deadline is, how large the funding is, and whether a reply is ` +
      `outstanding. Read every row first to compute the score, then fill the Priority column. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`
  },
  {
    id: "rank-by-fit",
    title: "Rank rows by best fit",
    description:
      "Adds a Fit Rank column and ranks all rows 1, 2, 3… by how well they match your goals (funding, ranking, research fit, deadline realism), so the strongest options rise to the top.",
    group: "transform",
    build: (ctx) =>
      `Add a "Fit Rank" number column to ${target(ctx)}, then rank every row ` +
      `from 1 (best) downward based on overall fit. Consider funding amount, program ranking/reputation, research alignment, ` +
      `and how realistic the deadline is. Read the rows first, then assign a rank so the strongest options are at the top. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`
  },

  // ── Selection-aware (shown only with a selection / focused cell) ──
  {
    id: "act-on-selected",
    title: "Bulk-update selected rows",
    description:
      "Reads only the rows you have selected right now and suggests 3 concrete bulk updates you can apply to all of them at once — then offers to run them.",
    group: "selection",
    build: (ctx) =>
      `I have selected ${ctx.selectionCount} row(s) in ${target(ctx)}.` +
      `${ctx.selectionSummary ? ` ${ctx.selectionSummary}.` : ""} ` +
      `Read only those selected rows and suggest 3 concrete bulk updates I could apply to all of them at once ` +
      `(for example: set the same status, add a tag, push out a deadline). Then ask me which one to run. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`
  },
  {
    id: "fill-cell",
    title: "Fill the focused cell",
    description:
      "Looks at the cell you are currently on, reads the rest of that row, and proposes a sensible value for that exact cell — then offers to write it in.",
    group: "selection",
    build: (ctx) => {
      const cell = ctx.focusedCell;
      if (!cell) {
        return `Look at ${target(ctx)} and suggest a value for ` +
          `the most important empty cell in the top row. Columns: ${columnList(ctx.columns)}.${USE_IDS}`;
      }
      return `Look at the "${cell.colName}" cell in row ${cell.rowIndex + 1} of ${target(ctx)}. ` +
        `Read that row's other data, then propose a sensible value for the "${cell.colName}" cell ` +
        `and offer to write it in. Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`;
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
