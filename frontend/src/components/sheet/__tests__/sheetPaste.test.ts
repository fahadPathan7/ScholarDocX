import { describe, it, expect } from "vitest";
import { parseTSV, formatTSV } from "../sheetPaste";
import type { ColumnDef } from "../sheetModel";

const cols: ColumnDef[] = [
  { name: "Name", type: "text" },
  { name: "Notes", type: "text" },
  { name: "Fee", type: "number" },
];

describe("parseTSV", () => {
  it("maps cells to visible columns left-to-right", () => {
    const rows = parseTSV("MIT\tGreat lab\t90\nETH\tStrong ML\t0", cols);
    expect(rows).toEqual([
      { Name: "MIT", Notes: "Great lab", Fee: "90" },
      { Name: "ETH", Notes: "Strong ML", Fee: "0" },
    ]);
  });

  it("skips fully empty lines", () => {
    const rows = parseTSV("MIT\tx\n\n\nETH\ty\n", cols);
    expect(rows).toHaveLength(2);
  });

  it("ignores extra cells beyond the visible columns", () => {
    const rows = parseTSV("A\tB\tC\tD\tE", cols);
    expect(rows[0]).toEqual({ Name: "A", Notes: "B", Fee: "C" });
  });

  it("parses quoted cells containing newlines and tabs (Excel/Sheets style)", () => {
    const tsv = 'MIT\t"line one\nline two"\t90';
    const rows = parseTSV(tsv, cols);
    expect(rows).toHaveLength(1);
    expect(rows[0].Notes).toBe("line one\nline two");
    expect(rows[0].Fee).toBe("90");
  });

  it("round-trips through formatTSV, including multiline and quoted values", () => {
    const original = [
      { Name: "MIT", Notes: "Dear Prof,\nSecond line\twith tab", Fee: "90" },
      { Name: 'The "best" one', Notes: "plain", Fee: "10" },
    ];
    const tsv = formatTSV(original, cols);
    const parsed = parseTSV(tsv, cols);
    expect(parsed).toEqual(original);
  });

  it("returns nothing for blank input", () => {
    expect(parseTSV("   \n  ", cols)).toEqual([]);
  });
});

describe("formatTSV", () => {
  it("quotes only values that need it", () => {
    const tsv = formatTSV([{ Name: "plain", Notes: "with\ttab", Fee: "1" }], cols);
    expect(tsv).toBe('plain\t"with\ttab"\t1');
  });
});
