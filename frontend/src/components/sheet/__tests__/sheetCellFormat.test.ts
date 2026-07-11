import { describe, it, expect } from "vitest";
import {
  CELL_STYLES_KEY,
  ROW_STYLE_KEY,
  applyCellStyle,
  clearCellStyle,
  applyRowStyle,
  parseCellStyles,
  parseRowStyle,
  textStyleToCss,
  cellBoxToCss,
} from "../sheetModel";

describe("parseCellStyles", () => {
  it("returns {} when no _cellStyles key is present", () => {
    expect(parseCellStyles({})).toEqual({});
    expect(parseCellStyles({ Name: "Alice" })).toEqual({});
  });

  it("parses a valid _cellStyles blob", () => {
    const row = { _cellStyles: JSON.stringify({ Name: { bold: true, color: "#cc0000" } }) };
    expect(parseCellStyles(row)).toEqual({ Name: { bold: true, color: "#cc0000" } });
  });

  it("returns {} for invalid JSON without throwing", () => {
    expect(parseCellStyles({ _cellStyles: "{not json" })).toEqual({});
  });

  it("returns {} for non-object JSON", () => {
    expect(parseCellStyles({ _cellStyles: "[]" })).toEqual({});
    expect(parseCellStyles({ _cellStyles: '"hello"' })).toEqual({});
  });
});

describe("parseRowStyle", () => {
  it("returns {} when absent", () => {
    expect(parseRowStyle({})).toEqual({});
  });

  it("parses a valid _rowStyle blob", () => {
    const row = { _rowStyle: JSON.stringify({ bg: "#eeeeee" }) };
    expect(parseRowStyle(row)).toEqual({ bg: "#eeeeee" });
  });

  it("does not throw on invalid JSON", () => {
    expect(parseRowStyle({ _rowStyle: "bad" })).toEqual({});
  });
});

describe("applyCellStyle", () => {
  it("sets a style on an empty row without mutating the input", () => {
    const row = { Name: "Alice" };
    const next = applyCellStyle(row, "Name", { bold: true });
    expect(row).toEqual({ Name: "Alice" }); // unchanged
    expect(next.Name).toBe("Alice");
    expect(parseCellStyles(next).Name).toEqual({ bold: true });
  });

  it("toggles bold on then off (removes the key when off)", () => {
    let row = applyCellStyle({}, "Title", { bold: true });
    expect(parseCellStyles(row).Title).toEqual({ bold: true });

    row = applyCellStyle(row, "Title", { bold: false });
    // bold removed -> empty style -> column key removed
    expect(parseCellStyles(row).Title).toBeUndefined();
  });

  it("removes the _cellStyles key entirely when the last style is cleared", () => {
    let row = applyCellStyle({}, "Title", { italic: true });
    expect(row[CELL_STYLES_KEY]).toBeDefined();
    row = applyCellStyle(row, "Title", { italic: false });
    expect(row[CELL_STYLES_KEY]).toBeUndefined();
  });

  it("merges patches without losing existing styles", () => {
    let row = applyCellStyle({}, "Name", { bold: true });
    row = applyCellStyle(row, "Name", { color: "#cc0000" });
    expect(parseCellStyles(row).Name).toEqual({ bold: true, color: "#cc0000" });
  });

  it("clears a string value when set to empty string", () => {
    let row = applyCellStyle({}, "Name", { color: "#cc0000" });
    row = applyCellStyle(row, "Name", { color: "" });
    expect(parseCellStyles(row).Name).toBeUndefined();
  });

  it("preserves other reserved keys like _height", () => {
    const row = { _height: "80", Name: "Bob" };
    const next = applyCellStyle(row, "Name", { bold: true });
    expect(next._height).toBe("80");
  });
});

describe("clearCellStyle", () => {
  it("removes all style keys for a cell", () => {
    let row = applyCellStyle({}, "Name", { bold: true, color: "#cc0000" });
    row = clearCellStyle(row, "Name");
    expect(parseCellStyles(row).Name).toBeUndefined();
    expect(row[CELL_STYLES_KEY]).toBeUndefined();
  });

  it("is a no-op when the cell has no style", () => {
    const row = { Name: "Alice" };
    const next = clearCellStyle(row, "Name");
    expect(next).toBe(row);
  });
});

describe("applyRowStyle", () => {
  it("sets a row background", () => {
    const next = applyRowStyle({}, { bg: "#eeeeee" });
    expect(parseRowStyle(next).bg).toBe("#eeeeee");
  });

  it("clears the row background when set to empty", () => {
    let next = applyRowStyle({}, { bg: "#eeeeee" });
    next = applyRowStyle(next, { bg: "" });
    expect(next[ROW_STYLE_KEY]).toBeUndefined();
  });

  it("does not mutate the input row", () => {
    const row = { Name: "Alice" };
    applyRowStyle(row, { bg: "#fff" });
    expect(row).toEqual({ Name: "Alice" });
  });
});

describe("textStyleToCss", () => {
  it("maps bold/italic/color", () => {
    const css = textStyleToCss({ bold: true, italic: true, color: "#cc0000" });
    expect(css.fontWeight).toBe("bold");
    expect(css.fontStyle).toBe("italic");
    expect(css.color).toBe("#cc0000");
  });

  it("combines underline + strike into a single text-decoration", () => {
    const css = textStyleToCss({ underline: true, strike: true });
    expect(css.textDecoration).toBe("underline line-through");
  });

  it("returns underline only when underline is set", () => {
    expect(textStyleToCss({ underline: true }).textDecoration).toBe("underline");
    expect(textStyleToCss({ strike: true }).textDecoration).toBe("line-through");
  });

  it("omits layout properties (those live on cellBoxToCss)", () => {
    const css = textStyleToCss({ align: "center", bg: "#fff", fontSize: "lg" });
    // align/bg/fontSize must NOT appear in text-level styles
    expect(css).toEqual({});
  });
});

describe("cellBoxToCss", () => {
  it("maps alignment, background, font family, and font size", () => {
    const css = cellBoxToCss({ align: "center", bg: "#eee", fontFamily: "serif", fontSize: "lg" });
    expect(css.textAlign).toBe("center");
    expect(css.backgroundColor).toBe("#eee");
    expect(css.fontFamily).toContain("Georgia");
    expect(css.fontSize).toBe("15px");
  });

  it("ignores text-level properties", () => {
    const css = cellBoxToCss({ bold: true, italic: true, color: "#cc0000" });
    expect(css).toEqual({});
  });
});
