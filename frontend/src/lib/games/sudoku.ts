/**
 * Sudoku generation and solving (SCHOLARDOCX-0198).
 *
 * The whole difficulty of this file is one requirement: **a puzzle must have
 * exactly one solution.** Shuffling a completed grid and deleting cells is the
 * obvious approach and it is wrong — past roughly 30 removals it starts
 * producing grids with several valid answers, so a player can fill every cell
 * correctly by their own reasoning and still be told they are wrong.
 *
 * So removal is verified: after each candidate removal the grid is re-solved
 * counting solutions, and the removal is undone the moment a second one
 * appears. `countSolutions` stops at 2 — "more than one" is all we need, and
 * enumerating the rest is expensive.
 */

export const SIZE = 9;
export const BOX = 3;
export const CELLS = SIZE * SIZE;

/** 0 means empty. */
export type Grid = number[];
export type Difficulty = "easy" | "medium" | "hard" | "expert";

/** How many cells to try to remove. More removed = harder. */
export const REMOVAL_TARGET: Record<Difficulty, number> = {
  easy: 40,
  medium: 48,
  hard: 54,
  expert: 58,
};

export const emptyGrid = (): Grid => Array(CELLS).fill(0);

export const rowOf = (index: number) => Math.floor(index / SIZE);
export const colOf = (index: number) => index % SIZE;
export const boxOf = (index: number) =>
  Math.floor(rowOf(index) / BOX) * BOX + Math.floor(colOf(index) / BOX);

/** Indices sharing a row, column or box with `index` — excluding itself. */
export function peersOf(index: number): number[] {
  const peers = new Set<number>();
  for (let i = 0; i < CELLS; i += 1) {
    if (i === index) continue;
    if (rowOf(i) === rowOf(index) || colOf(i) === colOf(index) || boxOf(i) === boxOf(index)) {
      peers.add(i);
    }
  }
  return [...peers];
}

export function canPlace(grid: Grid, index: number, value: number): boolean {
  if (value === 0) return true;
  return !peersOf(index).some((peer) => grid[peer] === value);
}

/** Every index whose value breaks a rule. Used to mark mistakes, not to block them. */
export function conflicts(grid: Grid): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < CELLS; i += 1) {
    const value = grid[i];
    if (!value) continue;
    if (peersOf(i).some((peer) => grid[peer] === value)) bad.add(i);
  }
  return bad;
}

export const isComplete = (grid: Grid): boolean =>
  grid.every((value) => value !== 0) && conflicts(grid).size === 0;

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Fill an empty grid with a random complete solution. */
export function generateSolved(random: () => number = Math.random): Grid {
  const grid = emptyGrid();
  const fill = (position: number): boolean => {
    if (position === CELLS) return true;
    if (grid[position] !== 0) return fill(position + 1);
    for (const value of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random)) {
      if (canPlace(grid, position, value)) {
        grid[position] = value;
        if (fill(position + 1)) return true;
        grid[position] = 0;
      }
    }
    return false;
  };
  fill(0);
  return grid;
}

/**
 * How many solutions this grid admits, counting no further than `limit`.
 *
 * Stops early because the only question that matters is "exactly one, or more
 * than one?" — counting every solution of a sparse grid is enormously slower
 * and tells us nothing extra.
 */
export function countSolutions(grid: Grid, limit = 2): number {
  // The search only ever reasons about EMPTY cells, so a contradiction already
  // present among the filled ones is invisible to it: given two 5s in one row
  // it explores the whole tree before concluding nothing fits. Rejecting an
  // illegal grid up front turns a multi-second hang into an instant 0.
  if (conflicts(grid).size > 0) return 0;

  const work = [...grid];
  let found = 0;

  const search = (): void => {
    if (found >= limit) return;
    // Solve the most constrained cell first: it prunes the tree far harder
    // than scanning left-to-right, which is the difference between this
    // finishing instantly and visibly hanging the tab.
    let target = -1;
    let targetOptions: number[] = [];
    for (let i = 0; i < CELLS; i += 1) {
      if (work[i] !== 0) continue;
      const options: number[] = [];
      for (let value = 1; value <= SIZE; value += 1) {
        if (canPlace(work, i, value)) options.push(value);
      }
      if (options.length === 0) return;
      if (target === -1 || options.length < targetOptions.length) {
        target = i;
        targetOptions = options;
        if (options.length === 1) break;
      }
    }
    if (target === -1) {
      found += 1;
      return;
    }
    for (const value of targetOptions) {
      work[target] = value;
      search();
      work[target] = 0;
      if (found >= limit) return;
    }
  };

  search();
  return found;
}

export const hasUniqueSolution = (grid: Grid): boolean => countSolutions(grid, 2) === 1;

export type Puzzle = {
  puzzle: Grid;
  solution: Grid;
  difficulty: Difficulty;
  /** Cells fixed by the puzzle — the player may not change these. */
  givens: boolean[];
  /** How many cells removal actually managed to clear. */
  removed: number;
};

/**
 * Build a puzzle with exactly one solution.
 *
 * `REMOVAL_TARGET` is a target, not a promise: removal stops early when no
 * further cell can be cleared without admitting a second solution. The result
 * reports what was actually removed rather than claiming the target.
 */
export function generatePuzzle(
  difficulty: Difficulty = "easy",
  random: () => number = Math.random,
): Puzzle {
  const solution = generateSolved(random);
  const puzzle = [...solution];
  let removed = 0;

  for (const index of shuffled([...Array(CELLS).keys()], random)) {
    if (removed >= REMOVAL_TARGET[difficulty]) break;
    const backup = puzzle[index];
    puzzle[index] = 0;
    if (hasUniqueSolution(puzzle)) {
      removed += 1;
    } else {
      puzzle[index] = backup;
    }
  }

  return {
    puzzle,
    solution,
    difficulty,
    givens: puzzle.map((value) => value !== 0),
    removed,
  };
}

/** A cell the player can fill from the rules alone, or null if none is obvious. */
export function findHint(
  grid: Grid,
  solution: Grid,
): { index: number; value: number } | null {
  let best: { index: number; value: number; options: number } | null = null;
  for (let i = 0; i < CELLS; i += 1) {
    if (grid[i] !== 0) continue;
    let options = 0;
    for (let value = 1; value <= SIZE; value += 1) {
      if (canPlace(grid, i, value)) options += 1;
    }
    if (!best || options < best.options) {
      best = { index: i, value: solution[i], options };
    }
  }
  return best ? { index: best.index, value: best.value } : null;
}

/** Compact form for localStorage: 81 digits. */
export const serializeGrid = (grid: Grid): string => grid.join("");

export function deserializeGrid(text: string): Grid | null {
  if (!/^\d{81}$/.test(text)) return null;
  return text.split("").map(Number);
}
