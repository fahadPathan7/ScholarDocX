/**
 * Minesweeper (SCHOLARDOCX-0198).
 *
 * Mines are laid *after* the first click, not before. Generating up front means
 * a player can lose on move one with no information and nothing they could have
 * done — which is not difficulty, it is a coin toss. Deferring the layout lets
 * the first click and its neighbours be guaranteed safe, so every game opens
 * with something to reason from.
 */

export type Level = "beginner" | "intermediate" | "expert";

export type Config = { rows: number; cols: number; mines: number };

export const LEVELS: Record<Level, Config> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

export type Cell = {
  mine: boolean;
  /** Mines in the eight surrounding cells. */
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
};

export type Board = Cell[][];
export type Status = "ready" | "playing" | "won" | "lost";

const cell = (): Cell => ({ mine: false, adjacent: 0, revealed: false, flagged: false });

export const createBoard = ({ rows, cols }: Config): Board =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, cell));

export function neighbours(board: Board, r: number, c: number): [number, number][] {
  const found: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) {
        found.push([nr, nc]);
      }
    }
  }
  return found;
}

/**
 * Lay mines, keeping the first click and everything touching it clear.
 *
 * The safe zone is the clicked cell *and its neighbours* so the opening click
 * always reveals a zero and cascades — a first move that uncovers a bare "4"
 * is technically survivable and practically a guess.
 */
export function layMines(
  board: Board,
  config: Config,
  safeR: number,
  safeC: number,
  random: () => number = Math.random,
): Board {
  const next = board.map((row) => row.map((item) => ({ ...item })));
  const banned = new Set<string>([`${safeR},${safeC}`]);
  neighbours(next, safeR, safeC).forEach(([r, c]) => banned.add(`${r},${c}`));

  const candidates: [number, number][] = [];
  for (let r = 0; r < config.rows; r += 1) {
    for (let c = 0; c < config.cols; c += 1) {
      if (!banned.has(`${r},${c}`)) candidates.push([r, c]);
    }
  }

  // Never ask for more mines than there are legal cells — on a 9x9 the safe
  // zone removes 9 of 81, so this only bites on a hand-made config, but a
  // silent infinite loop is a bad way to find that out.
  const total = Math.min(config.mines, candidates.length);
  for (let placed = 0; placed < total; placed += 1) {
    const index = placed + Math.floor(random() * (candidates.length - placed));
    [candidates[placed], candidates[index]] = [candidates[index], candidates[placed]];
    const [r, c] = candidates[placed];
    next[r][c].mine = true;
  }

  for (let r = 0; r < config.rows; r += 1) {
    for (let c = 0; c < config.cols; c += 1) {
      next[r][c].adjacent = neighbours(next, r, c).filter(([nr, nc]) => next[nr][nc].mine).length;
    }
  }
  return next;
}

/**
 * Reveal a cell, flooding outward through zeros.
 *
 * Iterative rather than recursive: an expert board's opening click can cascade
 * through hundreds of cells, and a recursive flood is an avoidable way to blow
 * the stack.
 */
export function reveal(board: Board, r: number, c: number): Board {
  if (board[r][c].revealed || board[r][c].flagged) return board;
  const next = board.map((row) => row.map((item) => ({ ...item })));
  const queue: [number, number][] = [[r, c]];

  while (queue.length) {
    const [cr, cc] = queue.pop()!;
    const current = next[cr][cc];
    if (current.revealed || current.flagged) continue;
    current.revealed = true;
    if (current.mine) continue;
    if (current.adjacent === 0) {
      neighbours(next, cr, cc).forEach(([nr, nc]) => {
        if (!next[nr][nc].revealed && !next[nr][nc].flagged) queue.push([nr, nc]);
      });
    }
  }
  return next;
}

export function toggleFlag(board: Board, r: number, c: number): Board {
  if (board[r][c].revealed) return board;
  const next = board.map((row) => row.map((item) => ({ ...item })));
  next[r][c].flagged = !next[r][c].flagged;
  return next;
}

/** Won when every cell that is not a mine has been revealed. Flags are irrelevant. */
export const hasWon = (board: Board): boolean =>
  board.every((row) => row.every((item) => item.mine || item.revealed));

export const hitMine = (board: Board): boolean =>
  board.some((row) => row.some((item) => item.mine && item.revealed));

export const flagCount = (board: Board): number =>
  board.flat().filter((item) => item.flagged).length;

/** Uncover every mine — used when the game is lost. */
export function revealAllMines(board: Board): Board {
  return board.map((row) =>
    row.map((item) => (item.mine ? { ...item, revealed: true } : item)),
  );
}
