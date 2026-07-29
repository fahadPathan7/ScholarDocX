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
  spawnAt,
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

describe("merge reporting", () => {
  // The four directions are one implementation applied to a transformed
  // board, so merge coordinates come back in the oriented frame and have to
  // be mapped home. That mapping is the part that is easy to get wrong, so
  // every direction is pinned separately.
  const PAIRS: Board = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  it("reports nothing when a move only slides", () => {
    const board: Board = [
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(move(board, "left").merged).toEqual([]);
  });

  it("puts a left merge at the left edge", () => {
    expect(move(PAIRS, "left").merged).toEqual([[0, 0]]);
  });

  it("puts a right merge at the right edge", () => {
    expect(move(PAIRS, "right").merged).toEqual([[0, 3]]);
  });

  it("maps a vertical merge back through the transpose", () => {
    const column: Board = [
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(move(column, "up").merged).toEqual([[0, 0]]);
    expect(move(column, "down").merged).toEqual([[3, 0]]);
  });

  it("reports both merges of a four-in-a-row, in order", () => {
    const board: Board = [
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const result = move(board, "left");
    expect(result.board[0]).toEqual([4, 4, 0, 0]);
    expect(result.merged).toEqual([[0, 0], [0, 1]]);
  });

  it("names the merged cell in every row that merged", () => {
    const board: Board = [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [4, 4, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(move(board, "left").merged).toEqual([[0, 0], [2, 0]]);
  });
});

describe("spawnAt", () => {
  it("reports a cell that was empty and is now filled", () => {
    const board = emptyBoard();
    board[1][1] = 2;
    const result = spawnAt(board, () => 0);
    expect(result.at).not.toBeNull();
    const [r, c] = result.at!;
    expect(board[r][c]).toBe(0);
    expect(result.board[r][c]).toBeGreaterThan(0);
  });

  it("reports nothing on a full board", () => {
    expect(spawnAt(LOCKED).at).toBeNull();
  });

  it("agrees with the board spawn() returns", () => {
    const seeded = () => 0.5;
    expect(spawnAt(emptyBoard(), seeded).board).toEqual(spawn(emptyBoard(), seeded));
  });
});
