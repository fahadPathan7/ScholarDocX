import { describe, it, expect } from "vitest";
import {
  canMove,
  emptyBoard,
  emptyCells,
  hasWon,
  highestTile,
  move,
  newGame,
  slideRow,
  spawn,
  type Board,
} from "../game2048";

const LOCKED: Board = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];

describe("slideRow", () => {
  it("packs tiles toward the front", () => {
    expect(slideRow([0, 2, 0, 2]).row).toEqual([4, 0, 0, 0]);
    expect(slideRow([0, 0, 0, 8]).row).toEqual([8, 0, 0, 0]);
  });

  it("scores the value of each merge", () => {
    expect(slideRow([2, 2, 0, 0]).gained).toBe(4);
    expect(slideRow([4, 4, 8, 8]).gained).toBe(24);
  });

  it("merges each tile at most once", () => {
    // [2,2,2,2] must give [4,4], never [8]. This is the rule a naive
    // re-scanning implementation breaks.
    expect(slideRow([2, 2, 2, 2]).row).toEqual([4, 4, 0, 0]);
    expect(slideRow([2, 2, 2, 2]).gained).toBe(8);
  });

  it("merges the leading pair, not the trailing one", () => {
    expect(slideRow([2, 2, 4, 0]).row).toEqual([4, 4, 0, 0]);
  });

  it("leaves unequal neighbours alone", () => {
    expect(slideRow([2, 4, 2, 4]).row).toEqual([2, 4, 2, 4]);
    expect(slideRow([4, 2, 0, 0]).gained).toBe(0);
  });
});

describe("move", () => {
  const board: Board = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [4, 0, 0, 4],
  ];

  it("handles all four directions", () => {
    expect(move(board, "left").board[0]).toEqual([4, 0, 0, 0]);
    expect(move(board, "right").board[0]).toEqual([0, 0, 0, 4]);
    const column: Board = [[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]];
    expect(move(column, "up").board.map((row) => row[0])).toEqual([4, 4, 0, 0]);
    expect(move(column, "down").board.map((row) => row[0])).toEqual([0, 0, 4, 4]);
  });

  it("reports whether anything actually shifted", () => {
    // The caller spawns a tile only when this is true — otherwise pressing
    // into a wall would fill the board for free.
    expect(move(board, "left").moved).toBe(true);
    expect(move(LOCKED, "left").moved).toBe(false);
  });

  it("does not mutate the board it was given", () => {
    const original = JSON.stringify(board);
    move(board, "left");
    expect(JSON.stringify(board)).toBe(original);
  });
});

describe("canMove", () => {
  it("is true while an empty cell remains", () => {
    expect(canMove(emptyBoard())).toBe(true);
  });

  it("is true on a full board that still has a matching pair", () => {
    expect(canMove([
      [2, 2, 4, 8],
      [4, 8, 16, 32],
      [2, 4, 8, 16],
      [32, 64, 128, 256],
    ])).toBe(true);
  });

  it("is false only when nothing can shift or merge", () => {
    expect(canMove(LOCKED)).toBe(false);
  });
});

describe("spawn and newGame", () => {
  it("opens with exactly two tiles", () => {
    expect(newGame().flat().filter(Boolean)).toHaveLength(2);
  });

  it("spawns a 2 nine times in ten, otherwise a 4", () => {
    expect(spawn(emptyBoard(), () => 0.5).flat().find(Boolean)).toBe(2);
    expect(spawn(emptyBoard(), () => 0.95).flat().find(Boolean)).toBe(4);
  });

  it("does nothing when there is no room", () => {
    expect(spawn(LOCKED)).toBe(LOCKED);
  });
});

describe("scoring helpers", () => {
  it("reads the highest tile", () => {
    expect(highestTile(LOCKED)).toBe(4);
  });

  it("counts empty cells", () => {
    expect(emptyCells(emptyBoard())).toHaveLength(16);
    expect(emptyCells(LOCKED)).toHaveLength(0);
  });

  it("recognises reaching the target", () => {
    const won: Board = [[2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    expect(hasWon(won)).toBe(true);
    expect(hasWon(LOCKED)).toBe(false);
  });
});
