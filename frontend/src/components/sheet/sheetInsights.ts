/* ------------------------------------------------------------------ */
/*  sheetInsights — column statistics and conditional formatting rules */
/*                                                                     */
/*  Pure functions over rows and columns. No React, no storage, no     */
/*  clock unless it is handed in — a "days until" figure depends       */
/*  entirely on what time it is, so `now` is always a parameter.       */
/*                                                                     */
/*  SCHOLARDOCX-0203.                                                  */
/* ------------------------------------------------------------------ */

import type { ColumnDef, ColumnType } from "./sheetModel";

/* ------------------------------------------------------------------ */
/*  Column statistics                                                  */
/* ------------------------------------------------------------------ */

export type ColumnStats = {
  column: string;
  type: ColumnType;
  total: number;
  filled: number;
  /** 0–100, rounded. 0 for an empty sheet rather than NaN. */
  fillRate: number;
  distinct: number;
  /** Most common values first, ties broken alphabetically. */
  top: { value: string; count: number }[];
  /** Numeric columns only. */
  numeric?: { min: number; max: number; sum: number; average: number };
  /** Date columns only. `next` is the soonest date not in the past. */
  dates?: { earliest: string; latest: string; next: string | null; overdue: number };
};

const isFilled = (value: unknown) => typeof value === "string" && value.trim() !== "";

/**
 * Parse a cell's date value in the *local* timezone.
 *
 * `new Date("2026-08-05")` is specified to parse a date-only string as UTC
 * midnight, while `new Date("2026-08-05T09:00")` parses as local. Sheet date
 * columns store the date-only form, so comparing them against a locally
 * computed "today" is an apples-to-oranges comparison that is off by a day
 * for anyone east of UTC — a deadline rule would fire a day early or late
 * depending on which side of the meridian the user sits.
 *
 * Date-only strings are therefore constructed explicitly as local midnight.
 * Anything else is left to the normal parser, which already treats a string
 * carrying a time as local.
 */
export function parseSheetDate(value: string): number {
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
  }
  return new Date(trimmed).getTime();
}

/**
 * Summarise one column.
 *
 * Blank cells are excluded from every statistic except `fillRate`, which is
 * the one figure that is *about* them. An average that quietly counts blanks
 * as zero is worse than no average — it looks authoritative and is wrong.
 */
export function columnStats(
  rows: Record<string, string>[],
  column: ColumnDef,
  now: Date,
): ColumnStats {
  const values = rows.map((row) => row?.[column.name] ?? "");
  const present = values.filter(isFilled).map((value) => value.trim());

  const counts = new Map<string, number>();
  present.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));

  const stats: ColumnStats = {
    column: column.name,
    type: column.type,
    total: rows.length,
    filled: present.length,
    fillRate: rows.length ? Math.round((present.length / rows.length) * 100) : 0,
    distinct: counts.size,
    top: [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value))
      .slice(0, 5),
  };

  if (column.type === "number") {
    const numbers = present.map(Number).filter((n) => Number.isFinite(n));
    if (numbers.length) {
      const sum = numbers.reduce((total, n) => total + n, 0);
      stats.numeric = {
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        sum,
        // Averaged over the values that parsed, not over every row: text in
        // a number column should not drag the mean toward zero.
        average: sum / numbers.length,
      };
    }
  }

  if (column.type === "date") {
    const parsed = present
      .map((value) => ({ value, time: parseSheetDate(value) }))
      .filter((entry) => Number.isFinite(entry.time))
      .sort((a, b) => a.time - b.time);
    if (parsed.length) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const upcoming = parsed.find((entry) => entry.time >= today);
      stats.dates = {
        earliest: parsed[0].value,
        latest: parsed[parsed.length - 1].value,
        next: upcoming ? upcoming.value : null,
        overdue: parsed.filter((entry) => entry.time < today).length,
      };
    }
  }

  return stats;
}

/* ------------------------------------------------------------------ */
/*  Conditional formatting                                             */
/* ------------------------------------------------------------------ */

export type RuleOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "lt"
  | "due_within"
  | "overdue";

export type RuleStyle = "red" | "amber" | "green" | "blue" | "grey" | "bold";

export type FormatRule = {
  id: string;
  column: string;
  operator: RuleOperator;
  /** Unused by is_empty / is_not_empty / overdue. */
  value: string;
  style: RuleStyle;
  /** Tint the whole row rather than just the cell. */
  wholeRow: boolean;
  enabled: boolean;
};

export const RULE_OPERATOR_LABELS: Record<RuleOperator, string> = {
  equals: "is exactly",
  not_equals: "is not",
  contains: "contains",
  is_empty: "is empty",
  is_not_empty: "is filled in",
  gt: "is greater than",
  lt: "is less than",
  due_within: "is due within (days)",
  overdue: "is in the past",
};

export const RULE_STYLE_LABELS: Record<RuleStyle, string> = {
  red: "Red",
  amber: "Amber",
  green: "Green",
  blue: "Blue",
  grey: "Muted",
  bold: "Bold only",
};

/** Which operators make sense for a column type. Offering "is due within"
 *  on a text column would be an invitation to build a rule that can never
 *  fire. */
export function operatorsFor(type: ColumnType): RuleOperator[] {
  const base: RuleOperator[] = ["equals", "not_equals", "contains", "is_empty", "is_not_empty"];
  if (type === "number") return ["equals", "not_equals", "gt", "lt", "is_empty", "is_not_empty"];
  if (type === "date") return ["overdue", "due_within", "is_empty", "is_not_empty"];
  if (type === "bool" || type === "select") return ["equals", "not_equals", "is_empty", "is_not_empty"];
  return base;
}

export const operatorNeedsValue = (operator: RuleOperator): boolean =>
  !["is_empty", "is_not_empty", "overdue"].includes(operator);

/**
 * Does one rule match one row?
 *
 * Text comparisons are case-insensitive and trimmed, because "Rejected" and
 * "rejected " are the same answer as far as anyone reading the sheet is
 * concerned. Numeric and date comparisons return false on unparseable input
 * rather than throwing or coercing — a rule should not fire because a cell
 * contains "TBC".
 */
export function ruleMatches(rule: FormatRule, row: Record<string, string>, now: Date): boolean {
  if (!rule.enabled) return false;
  const raw = (row?.[rule.column] ?? "").trim();
  const needle = rule.value.trim();

  switch (rule.operator) {
    case "is_empty":
      return raw === "";
    case "is_not_empty":
      return raw !== "";
    case "equals":
      return raw.toLowerCase() === needle.toLowerCase();
    case "not_equals":
      return raw.toLowerCase() !== needle.toLowerCase();
    case "contains":
      return needle !== "" && raw.toLowerCase().includes(needle.toLowerCase());
    case "gt":
    case "lt": {
      const left = Number(raw);
      const right = Number(needle);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      return rule.operator === "gt" ? left > right : left < right;
    }
    case "overdue": {
      const time = parseSheetDate(raw);
      if (!Number.isFinite(time)) return false;
      return time < startOfToday(now);
    }
    case "due_within": {
      const time = parseSheetDate(raw);
      const days = Number(needle);
      if (!Number.isFinite(time) || !Number.isFinite(days)) return false;
      const from = startOfToday(now);
      return time >= from && time <= from + days * 86_400_000;
    }
    default:
      return false;
  }
}

const startOfToday = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

export type RowFormatting = {
  /** Style for the whole row, if any rule asked for one. */
  row: RuleStyle | null;
  /** Column name → style, for cell-scoped rules. */
  cells: Record<string, RuleStyle>;
};

/**
 * Resolve every rule against one row.
 *
 * Later rules win over earlier ones for the same target, so the list reads
 * top-to-bottom as "and then". This is the opposite of first-match-wins and
 * is the convention people expect from spreadsheet rule lists: the rule you
 * just added at the bottom is the one that takes effect.
 */
export function formattingForRow(
  rules: FormatRule[],
  row: Record<string, string>,
  now: Date,
): RowFormatting {
  const result: RowFormatting = { row: null, cells: {} };
  rules.forEach((rule) => {
    if (!ruleMatches(rule, row, now)) return;
    if (rule.wholeRow) result.row = rule.style;
    else result.cells[rule.column] = rule.style;
  });
  return result;
}

/** How many of the given rows a rule currently matches — shown next to the
 *  rule so it can be checked without hunting through the grid. */
export const countMatches = (
  rule: FormatRule,
  rows: Record<string, string>[],
  now: Date,
): number => rows.filter((row) => ruleMatches({ ...rule, enabled: true }, row, now)).length;

/** A plain-language summary of a rule, for the rules list. */
export function describeRule(rule: FormatRule): string {
  const operator = RULE_OPERATOR_LABELS[rule.operator];
  const value = operatorNeedsValue(rule.operator) ? ` ${rule.value || "…"}` : "";
  const scope = rule.wholeRow ? "row" : "cell";
  return `${rule.column} ${operator}${value} → ${RULE_STYLE_LABELS[rule.style].toLowerCase()} ${scope}`;
}
