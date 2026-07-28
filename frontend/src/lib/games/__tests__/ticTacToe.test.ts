import { describe, it, expect } from "vitest";
import {
  availableMoves,
  bestMoves,
  chooseMove,
  EMPTY_BOARD,
  evaluate,
  OPTIMAL_PLAY_RATE,
  type Board,
} from "../ticTacToe";

/** Board from a 9-character sketch: "XX.OO...." — dot is empty. */
const board = (sketch: string): Board =>
  sketch.split("").map((cell) => (cell === "." ? null : (cell as "X" | "O")));

describe("evaluate", () => {
  it("finds a row, a column and both diagonals", () => {
    expect(evaluate(board("XXX.O.O..."))).toMatchObject({ winner: "X" });
    expect(evaluate(board("O.XO.XO.."))).toMatchObject({ winner: "O" });
    expect(evaluate(board("X...X...X"))).toMatchObject({ winner: "X" });
    expect(evaluate(board("..X.X.X.."))).toMatchObject({ winner: "X" });
  });

  it("reports the winning line so the board can highlight it", () => {
    const outcome = evaluate(board("XXX.O.O.."));
    expect(outcome.status === "won" && outcome.line).toEqual([0, 1, 2]);
  });

  it("separates a draw from a game still running", () => {
    expect(evaluate(board("XXOOOXXOX")).status).toBe("draw");
    expect(evaluate(board("X........")).status).toBe("playing");
    expect(evaluate(EMPTY_BOARD).status).toBe("playing");
  });
});

describe("availableMoves", () => {
  it("lists empty squares only", () => {
    expect(availableMoves(board("XX.OO...."))).toEqual([2, 5, 6, 7, 8]);
    expect(availableMoves(board("XXOOOXXOX"))).toEqual([]);
  });
});

describe("bestMoves", () => {
  it("takes an available win", () => {
    expect(bestMoves(board("XX.OO...."), "X")).toContain(2);
  });

  it("prefers winning over blocking", () => {
    // X threatens 3-4-5 and O threatens 0-1-2. Playing 4 wins now, which
    // beats denying a threat that never gets to fire.
    expect(bestMoves(board("OO.X.X..."), "X")).toEqual([4]);
  });

  it("blocks when there is nothing better", () => {
    expect(bestMoves(board("OO.X....."), "X")).toEqual([2]);
  });

  it("rates every opening equally, because it is", () => {
    // Tic-tac-toe is solved: with perfect play from both sides the first move
    // cannot change the result. All nine scoring the same is correct — and it
    // is what gives 'hard' a varied opening instead of always the same corner.
    expect(bestMoves(EMPTY_BOARD, "X")).toHaveLength(9);
  });

  it("returns nothing on a full board", () => {
    expect(bestMoves(board("XXOOOXXOX"), "X")).toEqual([]);
  });
});

describe("chooseMove", () => {
  it("returns null when there is nowhere to play", () => {
    expect(chooseMove(board("XXOOOXXOX"), "X", "hard")).toBeNull();
  });

  it("plays optimally on hard", () => {
    expect(OPTIMAL_PLAY_RATE.hard).toBe(1);
    expect(chooseMove(board("XX.OO...."), "X", "hard", () => 0)).toBe(2);
  });

  it("can be dragged off the best move on easy", () => {
    // random() = 0.99 clears every difficulty's optimal-play threshold except
    // hard's, so easy picks from all empty squares instead.
    const move = chooseMove(board("OO.X....."), "X", "easy", () => 0.99);
    expect(availableMoves(board("OO.X....."))).toContain(move as number);
  });

  it("still blocks on easy when the roll says play well", () => {
    expect(chooseMove(board("OO.X....."), "X", "easy", () => 0)).toBe(2);
  });
});

describe("the game as a whole", () => {
  it("always draws when both sides play perfectly", () => {
    // The defining property of tic-tac-toe. If this ever fails, the engine is
    // not actually solving the game.
    for (let game = 0; game < 30; game += 1) {
      let current: Board = [...EMPTY_BOARD];
      let player: "X" | "O" = "X";
      while (evaluate(current).status === "playing") {
        const move = chooseMove(current, player, "hard");
        current = current.map((cell, index) => (index === move ? player : cell));
        player = player === "X" ? "O" : "X";
      }
      expect(evaluate(current).status).toBe("draw");
    }
  });
});
