import { describe, it, expect } from "vitest";
import {
  ASK_AI_PROMPTS,
  buildAskAiContext,
  rowTarget,
  selectedRowsTarget,
  target,
  visiblePrompts,
  type AskAiContext,
} from "./askAiPrompts";

function baseArgs(overrides: Partial<Parameters<typeof buildAskAiContext>[0]> = {}) {
  return {
    projectId: "proj-1",
    sheetId: "sheet-1",
    projectName: "Canada PhD",
    sheetName: "Professor Shortlist",
    columns: [
      { name: "University name", type: "text" },
      { name: "Status", type: "select" },
      { name: "Deadline", type: "date" },
    ],
    rows: [{}, {}, {}, {}],
    selectedRows: new Set<number>(),
    focusedCell: null,
    ...overrides,
  } as Parameters<typeof buildAskAiContext>[0];
}

describe("buildAskAiContext (SCHOLARDOCX-0179)", () => {
  it("exposes sorted selected row indices, not just a count", () => {
    const ctx = buildAskAiContext(baseArgs({ selectedRows: new Set([3, 0, 1]) }));
    expect(ctx.selectedRowIndices).toEqual([0, 1, 3]);
    expect(ctx.selectionCount).toBe(3);
  });

  it("excludes group columns from the data column list", () => {
    const ctx = buildAskAiContext(
      baseArgs({ columns: [{ name: "University name", type: "text" }, { name: "Applications", type: "group" }] as any })
    );
    expect(ctx.columns.map((c) => c.name)).toEqual(["University name"]);
  });
});

describe("visiblePrompts (SCHOLARDOCX-0179 row/column/compare/deadlines scope)", () => {
  it("shows only 'deadlines' prompts with no focus or selection", () => {
    const ctx = buildAskAiContext(baseArgs());
    const groups = new Set(visiblePrompts(ctx).map((p) => p.group));
    expect(groups).toEqual(new Set(["deadlines"]));
  });

  it("shows row + column prompts once a cell is focused", () => {
    const ctx = buildAskAiContext(baseArgs({ focusedCell: { rowIndex: 1, colName: "Status" } }));
    const groups = new Set(visiblePrompts(ctx).map((p) => p.group));
    expect(groups.has("row")).toBe(true);
    expect(groups.has("column")).toBe(true);
    expect(groups.has("compare")).toBe(false);
  });

  it("shows the compare prompt only with 2+ selected rows", () => {
    const oneSelected = buildAskAiContext(baseArgs({ selectedRows: new Set([0]) }));
    expect(visiblePrompts(oneSelected).some((p) => p.group === "compare")).toBe(false);

    const twoSelected = buildAskAiContext(baseArgs({ selectedRows: new Set([0, 2]) }));
    expect(visiblePrompts(twoSelected).some((p) => p.group === "compare")).toBe(true);
  });

  it("every prompt id in the catalog is unique", () => {
    const ids = ASK_AI_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("row/column targeting markers (SCHOLARDOCX-0179)", () => {
  it("rowTarget embeds a structured row_index marker the backend can parse", () => {
    const ctx: AskAiContext = buildAskAiContext(
      baseArgs({ focusedCell: { rowIndex: 4, colName: "Status" } })
    );
    expect(rowTarget(ctx)).toContain("(row_index: 4)");
    expect(rowTarget(ctx)).toContain(target(ctx));
  });

  it("rowTarget falls back to plain target() with no focused cell", () => {
    const ctx = buildAskAiContext(baseArgs());
    expect(rowTarget(ctx)).toBe(target(ctx));
  });

  it("selectedRowsTarget embeds all selected row indices", () => {
    const ctx = buildAskAiContext(baseArgs({ selectedRows: new Set([2, 5, 9]) }));
    expect(selectedRowsTarget(ctx)).toContain("(row_indices: [2, 5, 9])");
  });
});

describe("every prompt tells the model to admit insufficient data (SCHOLARDOCX-0179)", () => {
  const focusedCtx = buildAskAiContext(
    baseArgs({ focusedCell: { rowIndex: 0, colName: "Status" }, selectedRows: new Set([0, 1]) })
  );

  it.each(ASK_AI_PROMPTS.map((p) => p.id))("prompt '%s' has an explicit no-data instruction", (id) => {
    const prompt = ASK_AI_PROMPTS.find((p) => p.id === id)!;
    const message = prompt.build(focusedCtx).toLowerCase();
    const admitsGap =
      message.includes("say so") ||
      message.includes("tell me that") ||
      message.includes("tell me directly") ||
      message.includes("instead of guessing") ||
      message.includes("instead of inventing");
    expect(admitsGap).toBe(true);
  });
});

describe("compare-selected build output (SCHOLARDOCX-0179)", () => {
  it("names the actual 1-based selected row numbers", () => {
    const ctx = buildAskAiContext(baseArgs({ selectedRows: new Set([1, 4]) }));
    const prompt = ASK_AI_PROMPTS.find((p) => p.id === "compare-selected")!;
    const message = prompt.build(ctx);
    expect(message).toContain("rows 2, 5");
  });
});
