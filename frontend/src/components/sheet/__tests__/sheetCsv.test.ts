import { describe, it, expect } from "vitest";
import { parseCSV, formatCSV, parseDelimited } from "../sheetCsv";

describe("parseCSV / formatCSV", () => {
  it("round-trips values with commas, quotes, and newlines", () => {
    const rows = [
      ["Name", "Notes"],
      ["MIT, Cambridge", 'He said "hi"\nnext line'],
    ];
    expect(parseCSV(formatCSV(rows))).toEqual(rows);
  });

  it("handles CRLF line endings", () => {
    expect(parseCSV("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("drops the trailing empty row", () => {
    expect(parseCSV("a,b\n")).toEqual([["a", "b"]]);
  });

  it("keeps a mid-value quote literal (only leading quotes open a quoted field)", () => {
    expect(parseCSV('5" tablet,x')).toEqual([['5" tablet', "x"]]);
  });
});

describe("parseDelimited with tab", () => {
  it("splits on tabs and respects quoted fields", () => {
    expect(parseDelimited('a\t"b\tc"\td', "\t")).toEqual([["a", "b\tc", "d"]]);
  });
});
