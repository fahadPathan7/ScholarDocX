import { describe, it, expect } from "vitest";
import {
  canPlace,
  CELLS,
  conflicts,
  countSolutions,
  deserializeGrid,
  emptyGrid,
  findHint,
  generatePuzzle,
  generateSolved,
  hasUniqueSolution,
  isComplete,
  peersOf,
  REMOVAL_TARGET,
  serializeGrid,
  SIZE,
  type Difficulty,
} from "../sudoku";

const rows = (grid: number[]) =>
  [...Array(SIZE).keys()].map((r) => grid.slice(r * SIZE, r * SIZE + SIZE));

const cols = (grid: number[]) =>
  [...Array(SIZE).keys()].map((c) => [...Array(SIZE).keys()].map((r) => grid[r * SIZE + c]));

const boxes = (grid: number[]) =>
  [...Array(SIZE).keys()].map((b) => {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    const cells: number[] = [];
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push(grid[(r0 + r) * SIZE + c0 + c]);
    return cells;
  });

describe("geometry", () => {
  it("gives every cell 20 peers", () => {
    // 8 in the row + 8 in the column + 4 more in the box.
    expect(peersOf(0)).toHaveLength(20);
    expect(peersOf(40)).toHaveLength(20);
  });

  it("never counts a cell as its own peer", () => {
    expect(peersOf(35)).not.toContain(35);
  });
});

describe("generateSolved", () => {
  const grid = generateSolved();

  it("produces a legal complete grid", () => {
    expect(isComplete(grid)).toBe(true);
    expect(conflicts(grid).size).toBe(0);
  });

  it("has 1-9 exactly once in every row, column and box", () => {
    rows(grid).forEach((line) => expect(new Set(line).size).toBe(SIZE));
    cols(grid).forEach((line) => expect(new Set(line).size).toBe(SIZE));
    boxes(grid).forEach((line) => expect(new Set(line).size).toBe(SIZE));
  });

  it("does not produce the same grid twice", () => {
    expect(serializeGrid(grid)).not.toBe(serializeGrid(generateSolved()));
  });
});

describe("countSolutions", () => {
  it("counts a finished grid as one", () => {
    expect(countSolutions(generateSolved())).toBe(1);
  });

  it("stops at the limit instead of enumerating everything", () => {
    // An empty grid has ~6.7e21 solutions. Returning 2 here is the point.
    expect(countSolutions(emptyGrid(), 2)).toBe(2);
  });

  it("rejects an already-illegal grid immediately", () => {
    // Two 5s in the top row. The search only reasons about EMPTY cells, so a
    // contradiction among the filled ones is invisible to it — without an
    // up-front legality check this explored the whole tree and took seconds.
    const grid = emptyGrid();
    grid[0] = 5;
    grid[1] = 5;
    const started = Date.now();
    expect(countSolutions(grid)).toBe(0);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe("generatePuzzle", () => {
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert"];

  it.each(difficulties)("gives %s exactly one solution", (difficulty) => {
    // The requirement the whole module exists for. Blind cell removal breaks
    // this past ~30 removals, and a player who solves such a grid correctly
    // gets told they are wrong.
    expect(hasUniqueSolution(generatePuzzle(difficulty).puzzle)).toBe(true);
  });

  it.each(difficulties)("keeps %s consistent with its own solution", (difficulty) => {
    const { puzzle, solution, givens } = generatePuzzle(difficulty);
    puzzle.forEach((value, index) => {
      if (value !== 0) expect(value).toBe(solution[index]);
    });
    expect(givens.filter(Boolean)).toHaveLength(puzzle.filter((v) => v !== 0).length);
    expect(isComplete(solution)).toBe(true);
  });

  it("removes more cells as difficulty rises", () => {
    const clues = (difficulty: Difficulty) =>
      generatePuzzle(difficulty).puzzle.filter((value) => value !== 0).length;
    expect(clues("easy")).toBeGreaterThan(clues("expert"));
  });

  it("never claims to have removed more than it did", () => {
    // The target is a ceiling, not a promise: removal stops when no further
    // cell can go without admitting a second solution.
    const result = generatePuzzle("expert");
    expect(result.removed).toBeLessThanOrEqual(REMOVAL_TARGET.expert);
    expect(result.puzzle.filter((v) => v === 0)).toHaveLength(result.removed);
  });
});

describe("conflicts", () => {
  it("marks both cells of a clash, and nothing else", () => {
    const grid = emptyGrid();
    grid[0] = 7;
    grid[8] = 7;
    grid[40] = 3;
    expect(conflicts(grid)).toEqual(new Set([0, 8]));
  });

  it("ignores empty cells", () => {
    expect(conflicts(emptyGrid()).size).toBe(0);
  });
});

describe("canPlace", () => {
  it("refuses a value already in the row, column or box", () => {
    const grid = emptyGrid();
    grid[0] = 4;
    expect(canPlace(grid, 1, 4)).toBe(false);
    expect(canPlace(grid, 9, 4)).toBe(false);
    expect(canPlace(grid, 10, 4)).toBe(false);
    expect(canPlace(grid, 80, 4)).toBe(true);
  });
});

describe("findHint", () => {
  it("names an empty cell and its correct value", () => {
    const { puzzle, solution } = generatePuzzle("easy");
    const hint = findHint(puzzle, solution);
    expect(hint).not.toBeNull();
    expect(puzzle[hint!.index]).toBe(0);
    expect(hint!.value).toBe(solution[hint!.index]);
  });

  it("returns nothing when the grid is full", () => {
    const solved = generateSolved();
    expect(findHint(solved, solved)).toBeNull();
  });
});

describe("persistence", () => {
  it("round-trips a grid", () => {
    const { puzzle } = generatePuzzle("easy");
    expect(deserializeGrid(serializeGrid(puzzle))).toEqual(puzzle);
  });

  it("rejects anything that is not 81 digits", () => {
    expect(deserializeGrid("123")).toBeNull();
    expect(deserializeGrid("x".repeat(CELLS))).toBeNull();
    expect(deserializeGrid("")).toBeNull();
  });
});
