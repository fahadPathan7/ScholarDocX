import { describe, it, expect } from "vitest";
import type { ColumnDef } from "./sheetModel";
import {
  columnStats,
  countMatches,
  describeRule,
  formattingForRow,
  operatorNeedsValue,
  operatorsFor,
  ruleMatches,
  type FormatRule,
} from "./sheetInsights";

const NOW = new Date("2026-07-29T14:00:00");

const col = (name: string, type: ColumnDef["type"]): ColumnDef => ({ name, type });

const rule = (over: Partial<FormatRule> = {}): FormatRule => ({
  id: "r1",
  column: "Status",
  operator: "equals",
  value: "Rejected",
  style: "red",
  wholeRow: false,
  enabled: true,
  ...over,
});

describe("columnStats — fill rate", () => {
  it("counts whitespace-only cells as empty", () => {
    const rows: Record<string, string>[] = [{ Status: "Applied" }, { Status: "   " }, { Status: "" }, {}];
    const stats = columnStats(rows, col("Status", "select"), NOW);
    expect(stats.filled).toBe(1);
    expect(stats.total).toBe(4);
    expect(stats.fillRate).toBe(25);
  });

  it("returns 0 rather than NaN for an empty sheet", () => {
    expect(columnStats([], col("Status", "text"), NOW).fillRate).toBe(0);
  });

  it("counts distinct values after trimming", () => {
    const rows = [{ S: "Applied" }, { S: " Applied " }, { S: "Draft" }];
    expect(columnStats(rows, col("S", "text"), NOW).distinct).toBe(2);
  });

  it("ranks top values by count, then alphabetically", () => {
    const rows = [{ S: "b" }, { S: "a" }, { S: "a" }, { S: "c" }, { S: "b" }];
    expect(columnStats(rows, col("S", "text"), NOW).top).toEqual([
      { value: "a", count: 2 },
      { value: "b", count: 2 },
      { value: "c", count: 1 },
    ]);
  });
});

describe("columnStats — numbers", () => {
  const rows = [{ N: "10" }, { N: "20" }, { N: "" }, { N: "not a number" }, { N: "30" }];

  it("averages over the values that parsed, not every row", () => {
    // Blanks and junk must not drag the mean toward zero.
    const stats = columnStats(rows, col("N", "number"), NOW);
    expect(stats.numeric).toEqual({ min: 10, max: 30, sum: 60, average: 20 });
  });

  it("omits the numeric block when nothing parses", () => {
    expect(columnStats([{ N: "abc" }], col("N", "number"), NOW).numeric).toBeUndefined();
  });

  it("handles negatives and decimals", () => {
    const stats = columnStats([{ N: "-5" }, { N: "2.5" }], col("N", "number"), NOW);
    expect(stats.numeric?.min).toBe(-5);
    expect(stats.numeric?.max).toBe(2.5);
  });
});

describe("columnStats — dates", () => {
  const rows = [
    { D: "2026-01-15" },
    { D: "2026-07-29" },
    { D: "2026-12-01" },
    { D: "rubbish" },
    { D: "" },
  ];

  it("finds the range and the next upcoming date", () => {
    const stats = columnStats(rows, col("D", "date"), NOW);
    expect(stats.dates?.earliest).toBe("2026-01-15");
    expect(stats.dates?.latest).toBe("2026-12-01");
    // Today counts as upcoming, not overdue.
    expect(stats.dates?.next).toBe("2026-07-29");
    expect(stats.dates?.overdue).toBe(1);
  });

  it("reports no next date when everything is past", () => {
    const stats = columnStats([{ D: "2020-01-01" }], col("D", "date"), NOW);
    expect(stats.dates?.next).toBeNull();
    expect(stats.dates?.overdue).toBe(1);
  });

  it("omits the date block when nothing parses", () => {
    expect(columnStats([{ D: "soon" }], col("D", "date"), NOW).dates).toBeUndefined();
  });
});

describe("operators offered per type", () => {
  it("does not offer date operators on text", () => {
    expect(operatorsFor("text")).not.toContain("due_within");
    expect(operatorsFor("text")).not.toContain("overdue");
  });

  it("offers only date-shaped operators on a date column", () => {
    expect(operatorsFor("date")).toEqual(["overdue", "due_within", "is_empty", "is_not_empty"]);
  });

  it("offers comparison operators on numbers", () => {
    expect(operatorsFor("number")).toContain("gt");
    expect(operatorsFor("number")).toContain("lt");
  });

  it("knows which operators take no value", () => {
    expect(operatorNeedsValue("is_empty")).toBe(false);
    expect(operatorNeedsValue("overdue")).toBe(false);
    expect(operatorNeedsValue("equals")).toBe(true);
  });
});

describe("ruleMatches", () => {
  it("ignores case and surrounding space", () => {
    expect(ruleMatches(rule(), { Status: " rejected " }, NOW)).toBe(true);
  });

  it("never matches while disabled", () => {
    expect(ruleMatches(rule({ enabled: false }), { Status: "Rejected" }, NOW)).toBe(false);
  });

  it("treats a missing key as empty", () => {
    expect(ruleMatches(rule({ operator: "is_empty" }), {}, NOW)).toBe(true);
    expect(ruleMatches(rule({ operator: "is_not_empty" }), {}, NOW)).toBe(false);
  });

  it("does not let an empty 'contains' match everything", () => {
    // The obvious bug: "".includes("") is true, so a half-built rule would
    // tint the entire sheet.
    expect(ruleMatches(rule({ operator: "contains", value: "" }), { Status: "Applied" }, NOW)).toBe(false);
  });

  it("returns false rather than coercing unparseable numbers", () => {
    expect(ruleMatches(rule({ column: "N", operator: "gt", value: "5" }), { N: "TBC" }, NOW)).toBe(false);
    expect(ruleMatches(rule({ column: "N", operator: "gt", value: "x" }), { N: "10" }, NOW)).toBe(false);
    expect(ruleMatches(rule({ column: "N", operator: "gt", value: "5" }), { N: "10" }, NOW)).toBe(true);
    expect(ruleMatches(rule({ column: "N", operator: "lt", value: "5" }), { N: "10" }, NOW)).toBe(false);
  });

  it("counts a past date as overdue and today as not", () => {
    const r = rule({ column: "D", operator: "overdue", value: "" });
    expect(ruleMatches(r, { D: "2026-07-28" }, NOW)).toBe(true);
    expect(ruleMatches(r, { D: "2026-07-29" }, NOW)).toBe(false);
    expect(ruleMatches(r, { D: "2026-08-01" }, NOW)).toBe(false);
    expect(ruleMatches(r, { D: "nonsense" }, NOW)).toBe(false);
  });

  it("bounds 'due within' at both ends", () => {
    const r = rule({ column: "D", operator: "due_within", value: "7" });
    expect(ruleMatches(r, { D: "2026-07-29" }, NOW)).toBe(true);
    expect(ruleMatches(r, { D: "2026-08-05" }, NOW)).toBe(true);
    expect(ruleMatches(r, { D: "2026-08-06" }, NOW)).toBe(false);
    // Already overdue is not "due within" — that is the overdue rule's job.
    expect(ruleMatches(r, { D: "2026-07-01" }, NOW)).toBe(false);
  });
});

describe("formattingForRow", () => {
  it("lets a later rule win over an earlier one", () => {
    // Reading top-to-bottom as "and then" is what people expect: the rule
    // you just added at the bottom is the one that takes effect.
    const rules = [
      rule({ id: "a", style: "red" }),
      rule({ id: "b", style: "green" }),
    ];
    expect(formattingForRow(rules, { Status: "Rejected" }, NOW).cells.Status).toBe("green");
  });

  it("keeps row and cell scopes separate", () => {
    const rules = [
      rule({ id: "a", style: "amber", wholeRow: true }),
      rule({ id: "b", style: "blue", wholeRow: false }),
    ];
    const result = formattingForRow(rules, { Status: "Rejected" }, NOW);
    expect(result.row).toBe("amber");
    expect(result.cells.Status).toBe("blue");
  });

  it("returns nothing when no rule matches", () => {
    expect(formattingForRow([rule()], { Status: "Applied" }, NOW)).toEqual({ row: null, cells: {} });
  });

  it("skips disabled rules", () => {
    expect(formattingForRow([rule({ enabled: false })], { Status: "Rejected" }, NOW).cells).toEqual({});
  });
});

describe("rule helpers", () => {
  it("counts matches even for a rule that is switched off", () => {
    // The count is a preview — it should answer "what would this do?", not
    // "what is it doing right now".
    const rows = [{ Status: "Rejected" }, { Status: "Applied" }, { Status: "rejected" }];
    expect(countMatches(rule({ enabled: false }), rows, NOW)).toBe(2);
  });

  it("describes a rule in plain language", () => {
    expect(describeRule(rule())).toBe("Status is exactly Rejected → red cell");
    expect(describeRule(rule({ operator: "is_empty", wholeRow: true, style: "grey" })))
      .toBe("Status is empty → muted row");
  });

  it("shows a placeholder for a rule with no value yet", () => {
    expect(describeRule(rule({ value: "" }))).toContain("…");
  });
});
