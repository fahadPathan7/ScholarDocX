/**
 * 2048 (SCHOLARDOCX-0198).
 *
 * All four directions reduce to one operation: slide a single row left. Up,
 * down and right are that same function applied to a transformed board, which
 * is why there is one merge implementation to get right rather than four.
 */

export const SIZE = 4;
export type Board = number[][];
export type Direction = "left" | "right" | "up" | "down";
/** A board coordinate, `[row, column]`. */
export type Cell = [number, number];

export const emptyBoard = (): Board =>
  Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

export const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

export function emptyCells(board: Board): [number, number][] {
  const cells: [number, number][] = [];
  board.forEach((row, r) => row.forEach((value, c) => {
    if (value === 0) cells.push([r, c]);
  }));
  return cells;
}

/**
 * Slide and merge one row toward index 0.
 *
 * A tile may merge only once per move: `[2,2,4]` gives `[4,4]`, never `[8]`.
 * Skipping the merged tile — rather than re-scanning — is what enforces that.
 */
export function slideRow(row: number[]): {
  row: number[];
  gained: number;
  /** Indices *in the returned row* that are the product of a merge. */
  mergedAt: number[];
} {
  const packed = row.filter((value) => value !== 0);
  const result: number[] = [];
  const mergedAt: number[] = [];
  let gained = 0;
  for (let i = 0; i < packed.length; i += 1) {
    if (packed[i] === packed[i + 1]) {
      const merged = packed[i] * 2;
      mergedAt.push(result.length);
      result.push(merged);
      gained += merged;
      i += 1;
    } else {
      result.push(packed[i]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { row: result, gained, mergedAt };
}

const reverse = (board: Board): Board => board.map((row) => [...row].reverse());

const transpose = (board: Board): Board =>
  board[0].map((_, c) => board.map((row) => row[c]));

/**
 * Where an oriented cell ends up on the real board.
 *
 * The inverse of the `toLeft` transform for each direction, kept beside it —
 * `up` orients by transposing, so oriented (r,c) is board (c,r); `down`
 * transposes *and* reverses each row, so it is board (SIZE-1-c, r).
 */
const fromOriented: Record<Direction, (r: number, c: number) => Cell> = {
  left: (r, c) => [r, c],
  right: (r, c) => [r, SIZE - 1 - c],
  up: (r, c) => [c, r],
  down: (r, c) => [SIZE - 1 - c, r],
};

export function move(board: Board, direction: Direction): {
  board: Board;
  gained: number;
  moved: boolean;
  /** Board coordinates of every tile produced by a merge this move. */
  merged: Cell[];
} {
  // Re-orient so the move is always "left", then put it back.
  const toLeft: Record<Direction, (b: Board) => Board> = {
    left: (b) => b,
    right: reverse,
    up: transpose,
    down: (b) => reverse(transpose(b)),
  };
  const fromLeft: Record<Direction, (b: Board) => Board> = {
    left: (b) => b,
    right: reverse,
    up: transpose,
    down: (b) => transpose(reverse(b)),
  };

  const oriented = toLeft[direction](board);
  let gained = 0;
  const merged: Cell[] = [];
  const slid = oriented.map((row, r) => {
    const result = slideRow(row);
    gained += result.gained;
    result.mergedAt.forEach((c) => merged.push(fromOriented[direction](r, c)));
    return result.row;
  });
  const next = fromLeft[direction](slid);
  const moved = JSON.stringify(next) !== JSON.stringify(board);
  return { board: next, gained, moved, merged };
}

/**
 * Add a tile to a random empty cell, reporting where. 2 nine times out of
 * ten, else 4. `at` is null only when the board was already full.
 */
export function spawnAt(
  board: Board,
  random: () => number = Math.random,
): { board: Board; at: Cell | null } {
  const cells = emptyCells(board);
  if (!cells.length) return { board, at: null };
  const [r, c] = cells[Math.floor(random() * cells.length)];
  const next = cloneBoard(board);
  next[r][c] = random() < 0.9 ? 2 : 4;
  return { board: next, at: [r, c] };
}

/** Add a tile to a random empty cell. 2 nine times out of ten, else 4. */
export const spawn = (board: Board, random: () => number = Math.random): Board =>
  spawnAt(board, random).board;

export function newGame(random: () => number = Math.random): Board {
  return spawn(spawn(emptyBoard(), random), random);
}

/** Any move left? A full board is not necessarily a finished one. */
export function canMove(board: Board): boolean {
  if (emptyCells(board).length) return true;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return true;
      if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
}

export const highestTile = (board: Board): number =>
  Math.max(...board.flat());

export const hasWon = (board: Board, target = 2048): boolean =>
  highestTile(board) >= target;
