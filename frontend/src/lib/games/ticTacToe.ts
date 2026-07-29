/**
 * Tic-tac-toe rules and opponent (SCHOLARDOCX-0198).
 *
 * Tic-tac-toe is a solved game: with perfect play from both sides every game
 * is a draw. An opponent that always plays perfectly is therefore not a game,
 * it is a wall — so the three difficulties differ in how often the opponent
 * is allowed to play the best move, not in how well it can calculate.
 */

export type Cell = "X" | "O" | null;
export type Board = Cell[];
export type Player = "X" | "O";
export type Difficulty = "easy" | "medium" | "hard";

export const EMPTY_BOARD: Board = Array(9).fill(null);

/** Index triples that win. Rows, columns, then both diagonals. */
export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export type Outcome =
  | { status: "won"; winner: Player; line: readonly number[] }
  | { status: "draw" }
  | { status: "playing" };

export function evaluate(board: Board): Outcome {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { status: "won", winner: board[a] as Player, line };
    }
  }
  return board.every(Boolean) ? { status: "draw" } : { status: "playing" };
}

export function availableMoves(board: Board): number[] {
  return board.reduce<number[]>((moves, cell, index) => {
    if (!cell) moves.push(index);
    return moves;
  }, []);
}

const other = (player: Player): Player => (player === "X" ? "O" : "X");

/**
 * Minimax score for `player` to move, from `player`'s point of view.
 *
 * Depth is subtracted from a win and added to a loss so the opponent prefers
 * to win *sooner* and lose *later*. Without it the engine plays technically
 * correct but maddening moves — dawdling on a forced win, since every winning
 * line scores the same.
 */
function minimax(board: Board, player: Player, forPlayer: Player, depth = 0): number {
  const outcome = evaluate(board);
  if (outcome.status === "won") {
    return outcome.winner === forPlayer ? 10 - depth : depth - 10;
  }
  if (outcome.status === "draw") return 0;

  const scores = availableMoves(board).map((move) => {
    const next = [...board];
    next[move] = player;
    return minimax(next, other(player), forPlayer, depth + 1);
  });
  return player === forPlayer ? Math.max(...scores) : Math.min(...scores);
}

/** The set of moves that are optimal for `player` on this board. */
export function bestMoves(board: Board, player: Player): number[] {
  const moves = availableMoves(board);
  if (!moves.length) return [];
  const scored = moves.map((move) => {
    const next = [...board];
    next[move] = player;
    return { move, score: minimax(next, other(player), player, 1) };
  });
  const best = Math.max(...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score === best).map((entry) => entry.move);
}

/** How often each difficulty plays a best move rather than a random one. */
export const OPTIMAL_PLAY_RATE: Record<Difficulty, number> = {
  easy: 0.25,
  medium: 0.75,
  hard: 1,
};

/**
 * Choose the opponent's move.
 *
 * `random` is injected so tests can pin the choice — an opponent whose
 * behaviour cannot be reproduced cannot be verified.
 */
export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty,
  random: () => number = Math.random,
): number | null {
  const moves = availableMoves(board);
  if (!moves.length) return null;
  const playOptimally = random() < OPTIMAL_PLAY_RATE[difficulty];
  const pool = playOptimally ? bestMoves(board, player) : moves;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}
