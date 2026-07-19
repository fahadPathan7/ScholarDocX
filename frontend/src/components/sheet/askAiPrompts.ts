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
    title: "Show my application progress",
    description:
      "Counts how many applications are Applied, In Progress, Offer Received, Rejected, or Withdrawn. Shows which stage has the most applications and your success rate.",
    group: "analyze",
    build: (ctx) =>
      `Read every row in ${target(ctx)} and give me a full application-status breakdown. ` +
      `Group rows by their status column and count how many are in each stage ` +
      `(e.g. Applied, Interview, Offer, Rejected, Withdrawn, etc.). Present the result as a markdown table. ` +
      `Then compute: total applications, how many are still active (not rejected/withdrawn), and the conversion rate from applied to offer. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.`,
  },
  {
    id: "deadline-risk",
    title: "What deadlines are coming up?",
    description:
      "Shows all deadlines in the next 45 days, warns you about anything overdue, and tells you exactly how many are due in the next week, two weeks, and month.",
    group: "analyze",
    build: (ctx) =>
      `Use get_deadlines with days_ahead=45 for ${target(ctx)} to find all upcoming deadlines. ` +
      `Then use get_overdue_rows to identify any deadlines that have already passed. ` +
      `Present the results as: ` +
      `1. OVERDUE items (if any) with dates and row details ` +
      `2. Upcoming deadlines sorted by date (soonest first) ` +
      `3. Count breakdown: how many are due in next 7 days, next 14 days, and next 30 days ` +
      `4. For each deadline, show the date, what it's for (university/professor name), and which column it's from. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "funding-totals",
    title: "Calculate my total funding offers",
    description:
      "Adds up all funding, scholarships, stipends, and tuition waivers. Shows total secured, total pending, and which university offered the highest amount.",
    group: "analyze",
    build: (ctx) =>
      `First, use get_rows to read all rows from ${target(ctx)}. ` +
      `Then identify columns with money/funding values (look for keywords: funding, scholarship, stipend, tuition, waiver, grant, award). ` +
      `For each money column found, extract the numeric values and compute: ` +
      `1. Total amount across all rows (secured + pending) ` +
      `2. Identify which rows/universities have the highest single funding amount ` +
      `3. Flag any rows with non-numeric or missing funding data ` +
      `Present the results as: Total funding by column, Top 3 highest offers with university names, and any data quality issues. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "missing-info",
    title: "Find incomplete applications",
    description:
      "Identifies rows with missing important data like deadlines, program names, contact emails, or application status. Helps you fill gaps before submission.",
    group: "analyze",
    build: (ctx) =>
      `Use get_rows to read all rows from ${target(ctx)}. ` +
      `Then analyze each row for missing critical information. Check for empty/missing values in key columns: ` +
      `- Deadline/date columns (most critical) ` +
      `- University or Program name ` +
      `- Status or Application status ` +
      `- Contact information (email, professor name) ` +
      `- Any other column that appears in most rows but is missing in some ` +
      `For each incomplete row, report: row number, what specific fields are missing, and prioritize by urgency ` +
      `(missing deadlines = highest priority, missing notes = lowest). ` +
      `Present as a numbered list of incomplete applications with action items. ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },
  {
    id: "response-rate",
    title: "Who hasn't responded to my emails?",
    description:
      "Counts how many emails you sent vs. how many got replies, shows your response rate percentage, and lists everyone you should follow up with.",
    group: "analyze",
    build: (ctx) =>
      `Use get_rows to read all rows from ${target(ctx)}. ` +
      `Then use semantic column matching to find email-related columns (sent, response, reply, follow-up). ` +
      `Count: ` +
      `1. Total rows with an email sent (any column indicating "sent" = yes/true or has a sent date) ` +
      `2. How many of those got a response (response status column or reply received) ` +
      `3. Calculate response rate as percentage: (responses / sent) * 100 ` +
      `Then use filter_rows to find all rows where email was sent BUT no response received. ` +
      `List those non-responders with: professor/university name, when email was sent, and days since sent. ` +
      `Sort by longest time waiting (highest priority for follow-up). ` +
      `Columns available: ${columnList(ctx.columns)}.`,
  },

  // ── Fill & Transform (writes — must target by ID) ─────────────────
  {
    id: "draft-emails",
    title: "Write personalized outreach emails for me",
    description:
      "Creates an Email Draft column and writes a unique, professional first-contact email for each program/professor that mentions their research and your interest.",
    group: "transform",
    build: (ctx) =>
      `Add a new "Email Draft" text column to ${target(ctx)}, then draft a personalized ` +
      `first-contact email for every row. Each email must reference that row's university/professor/program, be professional ` +
      `and concise (120–180 words), and express genuine interest. Read the existing rows first so each email matches its row. ` +
      `Columns in this sheet: ${columnList(ctx.columns)}.${USE_IDS}`,
  },
  {
    id: "priority-score",
    title: "Which applications should I focus on first?",
    description:
      "Adds a Priority column scoring each application 1-5 (5 = most urgent) based on deadline, funding amount, and response status so you know what needs immediate attention.",
    group: "transform",
    build: (ctx) =>
      `First use get_rows to read all rows from ${target(ctx)}. ` +
      `Then use add_column to create a new "Priority" column with type "number". ` +
      `After adding the column, analyze each row and assign a priority score 1-5 based on: ` +
      `- Deadline proximity: days until deadline (closer = higher score) ` +
      `- Funding amount: higher funding = higher priority ` +
      `- Response status: awaiting response or action needed = higher priority ` +
      `Scoring logic: 5 = urgent (deadline <7 days OR high funding + response needed), ` +
      `4 = important (deadline <14 days), 3 = normal (deadline <30 days), ` +
      `2 = low priority (deadline >30 days), 1 = very low (no deadline or completed). ` +
      `Use bulk_update_rows or update_row to set the Priority value for each row. ` +
      `Columns available: ${columnList(ctx.columns)}.${USE_IDS}`,
  },
  {
    id: "categorize-status",
    title: "Organize my applications by stage",
    description:
      "Adds a Stage column (Not Started, Researching, Ready to Apply, In Progress, Done) and automatically sorts each application into the right stage based on your data.",
    group: "transform",
    build: (ctx) =>
      `First use get_rows to read all rows from ${target(ctx)}. ` +
      `Then use add_column to create a new "Stage" column with type "select" and options: ` +
      `["Not Started", "Researching", "Ready to Apply", "In Progress", "Done"]. ` +
      `After adding the column, analyze each row and determine the appropriate stage: ` +
      `- "Done" if: status shows completed/accepted/rejected/withdrawn OR has a final outcome ` +
      `- "In Progress" if: application submitted OR status is "applied"/"interview"/"under review" ` +
      `- "Ready to Apply" if: has university, program, and deadline filled BUT not yet applied ` +
      `- "Researching" if: has some basic info (university or professor) BUT missing key details ` +
      `- "Not Started" if: mostly empty or just a placeholder row ` +
      `Use bulk_update_rows or update_row to set the Stage for each row based on your analysis. ` +
      `Columns available: ${columnList(ctx.columns)}.${USE_IDS}`,
  },
  {
    id: "rank-by-fit",
    title: "Rank programs by best match for me",
    description:
      "Adds a Fit Rank column rating programs 1, 2, 3... based on funding, reputation, research alignment, and realistic deadlines so your best options appear at the top.",
    group: "transform",
    build: (ctx) =>
      `First use get_rows to read all rows from ${target(ctx)}. ` +
      `Then use add_column to create a new "Fit Rank" column with type "number". ` +
      `After adding the column, analyze and rank ALL rows from 1 (best fit) to N (lowest fit) based on: ` +
      `- Funding amount: higher funding = better rank ` +
      `- Program ranking/reputation: higher ranked universities = better (if available) ` +
      `- Research alignment: match between your interests and professor/department (if info available) ` +
      `- Deadline realism: enough time to apply properly = better (too soon or past = worse) ` +
      `Assign rank 1 to the single best option, rank 2 to second best, etc. No ties - every row gets a unique rank. ` +
      `Use bulk_update_rows or update_row to set the Fit Rank for each row. ` +
      `Columns available: ${columnList(ctx.columns)}.${USE_IDS}`,
  },

  // ── Selection-aware (shown only with a selection / focused cell) ──
  {
    id: "act-on-selected",
    title: "Update all selected rows at once",
    description:
      "Looks at just the rows you selected and suggests 3 smart bulk updates (like changing status, adding notes, or updating dates) then lets you pick which to apply.",
    group: "selection",
    build: (ctx) =>
      `I have selected ${ctx.selectionCount} row(s) in ${target(ctx)}.` +
      `${ctx.selectionSummary ? ` ${ctx.selectionSummary}.` : ""} ` +
      `Use get_rows to read the full sheet, then analyze ONLY the selected rows (indices: [provide actual selected indices if available]). ` +
      `Based on what's in those specific rows, suggest 3 concrete bulk update actions I can apply to all of them, such as: ` +
      `1. Set a common status (e.g., "In Progress" if multiple are mid-application) ` +
      `2. Add the same tag or note (e.g., "Follow up needed") ` +
      `3. Push out deadlines by X days OR set to a common date ` +
      `4. Mark as a group for batch processing ` +
      `Present the 3 suggestions with clear descriptions, then ask me which one to execute. ` +
      `Once I choose, use bulk_update_rows with the selected row indices to apply the update. ` +
      `Columns available: ${columnList(ctx.columns)}.${USE_IDS}`,
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
