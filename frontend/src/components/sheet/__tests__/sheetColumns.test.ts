import { describe, expect, it } from "vitest";
import {
  blankColumns,
  changeColumnType,
  columnLetter,
  columnNameError,
  filledCellCount,
  insertColumn,
  nextLetterName,
  nextSheetName,
  removeColumn,
  renameColumn,
} from "../sheetColumns";
import { CELL_STYLES_KEY, type ColumnDef } from "../sheetModel";
import type { SheetData } from "../sheetColumns";

const text = (name: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({ name, type: "text", ...extra });

describe("columnLetter", () => {
  it("follows spreadsheet order past Z", () => {
    expect([0, 1, 2, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      "A", "B", "C", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA",
    ]);
  });
});

describe("blankColumns", () => {
  it("is five lettered text columns", () => {
    expect(blankColumns()).toEqual([text("A"), text("B"), text("C"), text("D"), text("E")]);
  });
});

describe("nextLetterName", () => {
  it("continues after the last letter", () => {
    expect(nextLetterName(blankColumns())).toBe("F");
  });

  it("uses the position's letter when earlier columns were renamed", () => {
    expect(nextLetterName([text("Name"), text("City"), text("Notes")])).toBe("D");
  });

  it("skips a letter that is already taken, whatever its case", () => {
    expect(nextLetterName([text("Name"), text("c")])).toBe("D");
    expect(nextLetterName([text("Name"), text("C"), text("d")])).toBe("E");
  });

  it("does not count groups as positions", () => {
    expect(nextLetterName([{ name: "Details", type: "group" }, text("A", { group: "Details" })])).toBe("B");
  });
});

describe("columnNameError", () => {
  const columns = [text("Name"), text("City"), { name: "Extra", type: "group" } as ColumnDef];

  it("accepts a free name", () => {
    expect(columnNameError(columns, "Country")).toBeNull();
  });

  it("refuses empty, over-long and reserved names", () => {
    expect(columnNameError(columns, "   ")).toMatch(/needs a name/);
    expect(columnNameError(columns, "x".repeat(31))).toMatch(/under 30/);
    expect(columnNameError(columns, "_height")).toMatch(/underscore/);
  });

  it("refuses a name another data column has, ignoring case", () => {
    expect(columnNameError(columns, "city")).toMatch(/already a column/);
  });

  it("lets a column keep its own name or change only its case", () => {
    expect(columnNameError(columns, "City", "City")).toBeNull();
    expect(columnNameError(columns, "CITY", "City")).toBeNull();
  });

  it("allows a data column to share a name with a group", () => {
    expect(columnNameError(columns, "Extra")).toBeNull();
  });
});

describe("renameColumn", () => {
  const data: SheetData = {
    columns: [text("A"), text("B")],
    rows: [
      { A: "Oslo", B: "Norway", _height: "60", [CELL_STYLES_KEY]: JSON.stringify({ A: { bold: true }, B: { italic: true } }) },
      { B: "Chile" },
      {},
    ],
  };

  it("moves values and cell formatting to the new name", () => {
    const next = renameColumn(data, "A", "City")!;
    expect(next.columns.map((c) => c.name)).toEqual(["City", "B"]);
    expect(next.rows[0].City).toBe("Oslo");
    expect("A" in next.rows[0]).toBe(false);
    expect(JSON.parse(next.rows[0][CELL_STYLES_KEY])).toEqual({ City: { bold: true }, B: { italic: true } });
    expect(next.rows[0]._height).toBe("60");
  });

  it("leaves rows that never had the column as the same objects", () => {
    const next = renameColumn(data, "A", "City")!;
    expect(next.rows[1]).toBe(data.rows[1]);
    expect(next.rows[2]).toBe(data.rows[2]);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(data);
    renameColumn(data, "A", "City");
    expect(JSON.stringify(data)).toBe(before);
  });

  it("trims the new name", () => {
    expect(renameColumn(data, "A", "  City  ")!.columns[0].name).toBe("City");
  });

  it("returns null for a no-op, a clash, an empty name or an unknown column", () => {
    expect(renameColumn(data, "A", "A")).toBeNull();
    expect(renameColumn(data, "A", "b")).toBeNull();
    expect(renameColumn(data, "A", "")).toBeNull();
    expect(renameColumn(data, "Z", "City")).toBeNull();
  });

  it("allows a change of case only", () => {
    const next = renameColumn({ columns: [text("city")], rows: [{ city: "Oslo" }] }, "city", "City")!;
    expect(next.rows[0]).toEqual({ City: "Oslo" });
  });

  it("renames the data column, not a group with the same name", () => {
    const grouped: SheetData = {
      columns: [{ name: "Email", type: "group" } as ColumnDef, text("Email", { group: "Email" })],
      rows: [{ Email: "a@b.c" }],
    };
    const next = renameColumn(grouped, "Email", "Address")!;
    expect(next.columns).toEqual([{ name: "Email", type: "group" }, text("Address", { group: "Email" })]);
  });
});

describe("insertColumn", () => {
  const data: SheetData = { columns: [text("A"), text("B")], rows: [{ A: "1" }] };

  it("appends the next letter by default and leaves rows untouched", () => {
    const result = insertColumn(data)!;
    expect(result.name).toBe("C");
    expect(result.data.columns.map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect(result.data.rows).toBe(data.rows);
  });

  it("inserts beside an anchor", () => {
    expect(insertColumn(data, { anchor: "A", side: "right" })!.data.columns.map((c) => c.name)).toEqual(["A", "C", "B"]);
    expect(insertColumn(data, { anchor: "A", side: "left" })!.data.columns.map((c) => c.name)).toEqual(["C", "A", "B"]);
  });

  it("joins the anchor's group", () => {
    const grouped: SheetData = { columns: [{ name: "G", type: "group" } as ColumnDef, text("A", { group: "G" })], rows: [] };
    const result = insertColumn(grouped, { anchor: "A", side: "right" })!;
    expect(result.data.columns[2]).toEqual({ name: "B", type: "text", group: "G" });
  });

  it("refuses a name that is taken", () => {
    expect(insertColumn(data, { name: "a" })).toBeNull();
  });
});

describe("removeColumn", () => {
  it("drops the definition, the values and the formatting", () => {
    const data: SheetData = {
      columns: [text("A"), text("B")],
      rows: [{ A: "1", B: "2", [CELL_STYLES_KEY]: JSON.stringify({ A: { bold: true } }) }, { B: "3" }],
    };
    const next = removeColumn(data, "A")!;
    expect(next.columns).toEqual([text("B")]);
    expect(next.rows[0]).toEqual({ B: "2" });
    expect(next.rows[1]).toBe(data.rows[1]);
  });

  it("keeps formatting that belongs to other columns", () => {
    const data: SheetData = {
      columns: [text("A"), text("B")],
      rows: [{ A: "1", [CELL_STYLES_KEY]: JSON.stringify({ A: { bold: true }, B: { italic: true } }) }],
    };
    expect(JSON.parse(removeColumn(data, "A")!.rows[0][CELL_STYLES_KEY])).toEqual({ B: { italic: true } });
  });

  it("returns null for an unknown column", () => {
    expect(removeColumn({ columns: [text("A")], rows: [] }, "B")).toBeNull();
  });
});

describe("filledCellCount", () => {
  it("counts non-blank values only", () => {
    expect(filledCellCount([{ A: "x" }, { A: "  " }, {}, { A: "y" }], "A")).toBe(2);
  });
});

describe("changeColumnType", () => {
  const data: SheetData = { columns: [text("Stage")], rows: [{ Stage: "Draft" }, { Stage: "Sent" }, { Stage: "Draft" }, {}] };

  it("seeds dropdown options from the values in use", () => {
    const next = changeColumnType(data, "Stage", "select")!;
    expect(next.columns[0]).toEqual({ name: "Stage", type: "select", options: ["Draft", "Sent"] });
    expect(next.rows).toBe(data.rows);
  });

  it("drops options when leaving dropdown", () => {
    const select: SheetData = { columns: [{ name: "Stage", type: "select", options: ["Draft"] } as ColumnDef], rows: [] };
    expect(changeColumnType(select, "Stage", "text")!.columns[0]).toEqual({ name: "Stage", type: "text" });
  });

  it("returns null when nothing would change", () => {
    expect(changeColumnType(data, "Stage", "text")).toBeNull();
    expect(changeColumnType(data, "Stage", "group")).toBeNull();
    expect(changeColumnType(data, "Missing", "number")).toBeNull();
  });
});

describe("nextSheetName", () => {
  it("numbers from the sheet count and skips taken names", () => {
    expect(nextSheetName([])).toBe("Sheet 1");
    expect(nextSheetName(["Budget"])).toBe("Sheet 2");
    expect(nextSheetName(["Budget", "sheet 3", "Sheet 2"])).toBe("Sheet 4");
  });
});
