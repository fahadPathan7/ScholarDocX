import { describe, it, expect } from "vitest";
import {
  sortRows,
  nextSortDirection,
  filterRows,
  searchRows,
  applyViewState,
  ColumnFilter,
} from "../sheetFilters";
import type { ColumnDef } from "../sheetModel";

const columns: ColumnDef[] = [
  { name: "Name", type: "text" },
  { name: "Fee", type: "number" },
  { name: "Deadline", type: "date" },
  { name: "GRE", type: "bool" },
  { name: "Status", type: "select", options: ["Applied", "Admitted"] },
];

const rows = [
  { Name: "MIT", Fee: "90", Deadline: "2026-08-01", GRE: "Yes", Status: "Applied" },
  { Name: "aalto", Fee: "0", Deadline: "", GRE: "No", Status: "Admitted" },
  { Name: "Zurich", Fee: "", Deadline: "2026-06-01", GRE: "Yes", Status: "" },
];

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("sortRows", () => {
  it("sorts text case-insensitively", () => {
    const sorted = sortRows(rows, { column: "Name", direction: "asc" }, columns);
    expect(sorted.map(r => r.Name)).toEqual(["aalto", "MIT", "Zurich"]);
  });

  it("sorts numbers numerically with empties last", () => {
    const sorted = sortRows(rows, { column: "Fee", direction: "asc" }, columns);
    expect(sorted.map(r => r.Name)).toEqual(["aalto", "MIT", "Zurich"]);
  });

  it("keeps empty values last even when descending", () => {
    const sorted = sortRows(rows, { column: "Deadline", direction: "desc" }, columns);
    expect(sorted.map(r => r.Name)).toEqual(["MIT", "Zurich", "aalto"]);
  });

  it("sorts booleans (Yes-like values as true)", () => {
    const sorted = sortRows(rows, { column: "GRE", direction: "asc" }, columns);
    expect(sorted[sorted.length - 1].GRE).toBe("Yes");
  });

  it("returns rows unchanged when direction is off", () => {
    expect(sortRows(rows, { column: "Name", direction: "off" }, columns)).toBe(rows);
  });
});

describe("nextSortDirection", () => {
  it("cycles off → asc → desc → off", () => {
    expect(nextSortDirection("off")).toBe("asc");
    expect(nextSortDirection("asc")).toBe("desc");
    expect(nextSortDirection("desc")).toBe("off");
  });
});

describe("filterRows", () => {
  it("filters by value checklist", () => {
    const f: ColumnFilter = { column: "Status", type: "select", kind: "values", values: new Set(["Applied"]) };
    expect(filterRows(rows, [f]).map(r => r.Name)).toEqual(["MIT"]);
  });

  it("empty checklist matches everything", () => {
    const f: ColumnFilter = { column: "Status", type: "select", kind: "values", values: new Set() };
    expect(filterRows(rows, [f])).toHaveLength(3);
  });

  it("filters text contains, case-insensitive", () => {
    const f: ColumnFilter = { column: "Name", type: "text", kind: "text", contains: "mit" };
    expect(filterRows(rows, [f]).map(r => r.Name)).toEqual(["MIT"]);
  });

  it("filters numbers by min/max and excludes non-numeric", () => {
    const f: ColumnFilter = { column: "Fee", type: "number", kind: "number", min: 1, max: 100 };
    expect(filterRows(rows, [f]).map(r => r.Name)).toEqual(["MIT", "Zurich"]); // empty Fee passes
  });

  it("filters overdue dates", () => {
    const data = [
      { Deadline: isoDaysFromToday(-2) },
      { Deadline: isoDaysFromToday(2) },
      { Deadline: "" },
    ];
    const f: ColumnFilter = { column: "Deadline", type: "date", kind: "datePreset", preset: "overdue" };
    expect(filterRows(data, [f])).toHaveLength(1);
  });

  it("filters next-7-days preset", () => {
    const data = [
      { Deadline: isoDaysFromToday(3) },
      { Deadline: isoDaysFromToday(20) },
      { Deadline: isoDaysFromToday(-1) },
    ];
    const f: ColumnFilter = { column: "Deadline", type: "date", kind: "datePreset", preset: "next7" };
    expect(filterRows(data, [f])).toHaveLength(1);
  });

  it("filters custom date ranges inclusively", () => {
    const data = [
      { Deadline: "2026-07-10" },
      { Deadline: "2026-07-20" },
      { Deadline: "2026-08-05" },
      { Deadline: "" },
    ];
    const f: ColumnFilter = { column: "Deadline", type: "date", kind: "dateRange", from: "2026-07-10", to: "2026-07-20" };
    expect(filterRows(data, [f]).map(r => r.Deadline)).toEqual(["2026-07-10", "2026-07-20"]);
  });

  it("open-ended date range works with only from", () => {
    const data = [{ Deadline: "2026-07-10" }, { Deadline: "2026-06-01" }];
    const f: ColumnFilter = { column: "Deadline", type: "date", kind: "dateRange", from: "2026-07-01" };
    expect(filterRows(data, [f]).map(r => r.Deadline)).toEqual(["2026-07-10"]);
  });

  it("ANDs multiple filters", () => {
    const f1: ColumnFilter = { column: "GRE", type: "bool", kind: "values", values: new Set(["Yes"]) };
    const f2: ColumnFilter = { column: "Name", type: "text", kind: "text", contains: "z" };
    expect(filterRows(rows, [f1, f2]).map(r => r.Name)).toEqual(["Zurich"]);
  });
});

describe("searchRows", () => {
  it("matches across all non-group columns", () => {
    expect(searchRows(rows, "admit", columns).map(r => r.Name)).toEqual(["aalto"]);
  });

  it("empty query returns all rows", () => {
    expect(searchRows(rows, "  ", columns)).toHaveLength(3);
  });
});

describe("applyViewState", () => {
  it("reports total and filtered counts and applies group-by ordering", () => {
    const { viewRows, totalCount, filteredCount } = applyViewState(
      rows, "", [], { column: "", direction: "off" }, "Status", columns
    );
    expect(totalCount).toBe(3);
    expect(filteredCount).toBe(3);
    // group-by sorts by the grouping column so groups are contiguous
    const statuses = viewRows.map(r => r.Status || "");
    expect(statuses).toEqual([...statuses].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    }));
  });

  it("search narrows filteredCount", () => {
    const { filteredCount, totalCount } = applyViewState(
      rows, "zurich", [], { column: "", direction: "off" }, null, columns
    );
    expect(totalCount).toBe(3);
    expect(filteredCount).toBe(1);
  });
});
