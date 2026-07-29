import { describe, it, expect } from "vitest";
import type { ColumnDef } from "./sheetModel";
import {
  alignFor,
  clearCells,
  coerceDensity,
  DENSITIES,
  existingValues,
  fillDown,
  setColumnValue,
  SHEET_SHORTCUTS,
  TYPE_LABELS,
} from "./sheetGrid";

const rows = (...values: Record<string, string>[]) => values;

const columns: ColumnDef[] = [
  { name: "University", type: "text" },
  { name: "Status", type: "select", options: ["Applied", "Draft"] },
  { name: "Transcript", type: "file" },
  { name: "Hidden", type: "text", hidden: true },
  { name: "Details", type: "group" },
];

describe("density", () => {
  it("falls back to the default for anything unrecognised", () => {
    // A junk value from storage must not produce a grid with undefined rows.
    expect(coerceDensity("nonsense")).toBe("cosy");
    expect(coerceDensity(undefined)).toBe("cosy");
    expect(coerceDensity(42)).toBe("cosy");
    expect(coerceDensity(null)).toBe("cosy");
  });

  it("keeps a valid stored value", () => {
    expect(coerceDensity("compact")).toBe("compact");
    expect(coerceDensity("roomy")).toBe("roomy");
  });

  it("orders the presets by height", () => {
    expect(DENSITIES.compact.rowHeight).toBeLessThan(DENSITIES.cosy.rowHeight);
    expect(DENSITIES.cosy.rowHeight).toBeLessThan(DENSITIES.roomy.rowHeight);
  });
});

describe("alignment", () => {
  it("right-aligns the types whose digits should line up", () => {
    expect(alignFor("number")).toBe("right");
    expect(alignFor("date")).toBe("right");
  });

  it("centres a yes/no mark and leaves language on the left", () => {
    expect(alignFor("bool")).toBe("center");
    expect(alignFor("text")).toBe("left");
    expect(alignFor("select")).toBe("left");
    expect(alignFor("url")).toBe("left");
    expect(alignFor("file")).toBe("left");
  });

  it("labels every column type", () => {
    (Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).forEach((type) => {
      expect(TYPE_LABELS[type].length).toBeGreaterThan(0);
    });
  });
});

describe("fillDown", () => {
  const data = rows(
    { Status: "Applied" },
    { Status: "" },
    { Status: "Draft" },
    { Status: "Applied" },
  );

  it("copies the topmost selected value into the rest", () => {
    expect(fillDown(data, [0, 1, 2], "Status")).toEqual([
      { rowIndex: 1, column: "Status", value: "Applied" },
      { rowIndex: 2, column: "Status", value: "Applied" },
    ]);
  });

  it("uses the topmost row regardless of the order they were selected in", () => {
    // Which end the user started the selection from should not change what
    // gets filled.
    expect(fillDown(data, [2, 1, 0], "Status")).toEqual(fillDown(data, [0, 1, 2], "Status"));
  });

  it("skips cells that already hold the value", () => {
    // A fill over an already-consistent column should not produce writes, or
    // an undo step that changes nothing.
    expect(fillDown(data, [0, 3], "Status")).toEqual([]);
  });

  it("does nothing with fewer than two rows", () => {
    expect(fillDown(data, [1], "Status")).toEqual([]);
    expect(fillDown(data, [], "Status")).toEqual([]);
  });

  it("ignores duplicate and out-of-range indices", () => {
    expect(fillDown(data, [0, 0, 1, 99], "Status")).toEqual([
      { rowIndex: 1, column: "Status", value: "Applied" },
    ]);
  });

  it("fills an empty value down, which is how a column gets blanked", () => {
    const blanks = rows({ Status: "" }, { Status: "Applied" });
    expect(fillDown(blanks, [0, 1], "Status")).toEqual([
      { rowIndex: 1, column: "Status", value: "" },
    ]);
  });

  it("does not mutate the rows", () => {
    fillDown(data, [0, 1, 2], "Status");
    expect(data[1].Status).toBe("");
  });
});

describe("setColumnValue", () => {
  const data = rows({ Status: "Applied" }, { Status: "Draft" }, { Status: "Draft" });

  it("writes only where the value differs", () => {
    expect(setColumnValue(data, [0, 1, 2], "Status", "Draft")).toEqual([
      { rowIndex: 0, column: "Status", value: "Draft" },
    ]);
  });

  it("returns nothing when every row already matches", () => {
    expect(setColumnValue(data, [1, 2], "Status", "Draft")).toEqual([]);
  });

  it("treats a missing key as empty rather than skipping the row", () => {
    expect(setColumnValue(rows({}), [0], "Status", "Draft")).toEqual([
      { rowIndex: 0, column: "Status", value: "Draft" },
    ]);
  });
});

describe("clearCells", () => {
  const data = rows(
    { University: "Leeds", Status: "Applied", Transcript: "file-1", Hidden: "x" },
    { University: "", Status: "Draft", Transcript: "", Hidden: "" },
  );

  it("blanks the editable, visible, non-file cells", () => {
    expect(clearCells(data, [0], columns)).toEqual([
      { rowIndex: 0, column: "University", value: "" },
      { rowIndex: 0, column: "Status", value: "" },
    ]);
  });

  it("never touches a file column", () => {
    // Detaching an uploaded document is a much bigger action than "clear".
    const changes = clearCells(data, [0, 1], columns);
    expect(changes.some((change) => change.column === "Transcript")).toBe(false);
  });

  it("leaves hidden columns and group headers alone", () => {
    const changes = clearCells(data, [0, 1], columns);
    expect(changes.some((change) => change.column === "Hidden")).toBe(false);
    expect(changes.some((change) => change.column === "Details")).toBe(false);
  });

  it("skips cells that are already empty", () => {
    expect(clearCells(data, [1], columns)).toEqual([
      { rowIndex: 1, column: "Status", value: "" },
    ]);
  });
});

describe("existingValues", () => {
  const data = rows(
    { Status: "Applied" },
    { Status: "Draft" },
    { Status: "Applied" },
    { Status: "  " },
    { Status: "" },
    {},
  );

  it("ranks by how often each value is used", () => {
    expect(existingValues(data, "Status")).toEqual(["Applied", "Draft"]);
  });

  it("ignores blank and whitespace-only values", () => {
    expect(existingValues(data, "Status")).not.toContain("");
    expect(existingValues(data, "Status")).not.toContain("  ");
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ Status: `s${i}` }));
    expect(existingValues(many, "Status", 5)).toHaveLength(5);
  });
});

describe("shortcut documentation", () => {
  it("has a description for every entry", () => {
    SHEET_SHORTCUTS.forEach((group) => {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);
      group.items.forEach((item) => {
        expect(item.keys.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
      });
    });
  });

  it("does not list the same keys twice", () => {
    const keys = SHEET_SHORTCUTS.flatMap((group) => group.items.map((item) => item.keys));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
