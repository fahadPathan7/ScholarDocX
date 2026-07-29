import { describe, it, expect } from "vitest";
import {
  canChord,
  chord,
  createBoard,
  flagCount,
  hasWon,
  hitMine,
  layMines,
  LEVELS,
  neighbours,
  reveal,
  revealAllMines,
  toggleFlag,
  type Level,
} from "../minesweeper";

const LEVEL_KEYS = Object.keys(LEVELS) as Level[];

describe("neighbours", () => {
  const board = createBoard(LEVELS.beginner);

  it("clamps at the edges", () => {
    expect(neighbours(board, 0, 0)).toHaveLength(3);
    expect(neighbours(board, 0, 4)).toHaveLength(5);
    expect(neighbours(board, 4, 4)).toHaveLength(8);
  });

  it("never includes the cell itself", () => {
    expect(neighbours(board, 4, 4)).not.toContainEqual([4, 4]);
  });
});

describe("layMines", () => {
  it.each(LEVEL_KEYS)("places exactly the configured number for %s", (level) => {
    const config = LEVELS[level];
    const board = layMines(createBoard(config), config, 0, 0);
    expect(board.flat().filter((cell) => cell.mine)).toHaveLength(config.mines);
  });

  it.each(LEVEL_KEYS)("keeps the first click and its neighbours clear on %s", (level) => {
    // Laying mines before the first click means a player can lose on move one
    // with no information. Deferring the layout is what prevents that.
    const config = LEVELS[level];
    const board = layMines(createBoard(config), config, 3, 3);
    expect(board[3][3].mine).toBe(false);
    neighbours(board, 3, 3).forEach(([r, c]) => expect(board[r][c].mine).toBe(false));
  });

  it.each(LEVEL_KEYS)("opens %s on a zero so the first click cascades", (level) => {
    const config = LEVELS[level];
    expect(layMines(createBoard(config), config, 3, 3)[3][3].adjacent).toBe(0);
  });

  it("counts adjacency correctly everywhere", () => {
    const config = LEVELS.beginner;
    const board = layMines(createBoard(config), config, 0, 0);
    board.forEach((row, r) =>
      row.forEach((cell, c) => {
        const actual = neighbours(board, r, c).filter(([nr, nc]) => board[nr][nc].mine).length;
        expect(cell.adjacent).toBe(actual);
      }),
    );
  });

  it("cannot be asked for more mines than there are legal cells", () => {
    // A 3x3 with a safe zone in the middle leaves nowhere legal at all.
    // Without a cap this loops forever looking for a free cell.
    const silly = { rows: 3, cols: 3, mines: 99 };
    const board = layMines(createBoard(silly), silly, 1, 1);
    expect(board.flat().filter((cell) => cell.mine)).toHaveLength(0);
  });
});

describe("reveal", () => {
  const config = LEVELS.beginner;
  const board = layMines(createBoard(config), config, 4, 4);

  it("floods outward through zeros", () => {
    expect(reveal(board, 4, 4).flat().filter((cell) => cell.revealed).length).toBeGreaterThan(9);
  });

  it("never uncovers a mine while flooding", () => {
    reveal(board, 4, 4).flat().forEach((cell) => {
      expect(cell.mine && cell.revealed).toBe(false);
    });
  });

  it("leaves the original board untouched", () => {
    reveal(board, 4, 4);
    expect(board.flat().some((cell) => cell.revealed)).toBe(false);
  });

  it("refuses to open a flagged cell", () => {
    const flagged = toggleFlag(board, 0, 0);
    expect(reveal(flagged, 0, 0)[0][0].revealed).toBe(false);
  });
});

describe("flagging", () => {
  const config = LEVELS.beginner;
  const board = layMines(createBoard(config), config, 4, 4);

  it("toggles on and off, and counts", () => {
    const on = toggleFlag(board, 0, 0);
    expect(on[0][0].flagged).toBe(true);
    expect(flagCount(on)).toBe(1);
    expect(toggleFlag(on, 0, 0)[0][0].flagged).toBe(false);
  });

  it("will not flag a cell that is already open", () => {
    const opened = reveal(board, 4, 4);
    expect(toggleFlag(opened, 4, 4)[4][4].flagged).toBe(false);
  });
});

describe("end states", () => {
  const config = LEVELS.beginner;
  const board = layMines(createBoard(config), config, 4, 4);

  it("wins when every non-mine is open, regardless of flags", () => {
    const cleared = board.map((row) => row.map((cell) => ({ ...cell, revealed: !cell.mine })));
    expect(hasWon(cleared)).toBe(true);
    expect(hitMine(cleared)).toBe(false);
  });

  it("has not won while a safe cell is still hidden", () => {
    expect(hasWon(board)).toBe(false);
  });

  it("detects an opened mine", () => {
    const exploded = board.map((row) => row.map((cell) => ({ ...cell })));
    const index = exploded.flat().findIndex((cell) => cell.mine);
    exploded[Math.floor(index / config.cols)][index % config.cols].revealed = true;
    expect(hitMine(exploded)).toBe(true);
  });

  it("can uncover every mine at the end", () => {
    revealAllMines(board).flat().filter((cell) => cell.mine)
      .forEach((cell) => expect(cell.revealed).toBe(true));
  });
});

describe("chording", () => {
  // A hand-built 3x3 with a single mine at (0,0), so every claim below is
  // about a board whose contents are known rather than a generated one.
  const build = () => {
    const board = createBoard({ rows: 3, cols: 3, mines: 1 });
    board[0][0].mine = true;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        board[r][c].adjacent = neighbours(board, r, c)
          .filter(([nr, nc]) => board[nr][nc].mine).length;
      }
    }
    board[1][1].revealed = true; // the "1" touching the mine
    return board;
  };

  it("does nothing on a square that is not revealed", () => {
    const board = build();
    expect(canChord(board, 0, 1)).toBe(false);
    expect(chord(board, 0, 1)).toBe(board);
  });

  it("does nothing while the flags do not match the number", () => {
    const board = build();
    expect(canChord(board, 1, 1)).toBe(false);
    expect(chord(board, 1, 1)).toBe(board);
  });

  it("opens the remaining neighbours once the flags match", () => {
    const flagged = toggleFlag(build(), 0, 0);
    expect(canChord(flagged, 1, 1)).toBe(true);
    const opened = chord(flagged, 1, 1);
    neighbours(opened, 1, 1).forEach(([r, c]) => {
      if (r === 0 && c === 0) return;
      expect(opened[r][c].revealed).toBe(true);
    });
  });

  it("leaves the flagged neighbour alone", () => {
    const opened = chord(toggleFlag(build(), 0, 0), 1, 1);
    expect(opened[0][0].revealed).toBe(false);
    expect(opened[0][0].flagged).toBe(true);
    expect(hitMine(opened)).toBe(false);
  });

  it("detonates when a flag is in the wrong place", () => {
    // The flag count is satisfied, but by the wrong square — chording is a
    // shortcut for clicks the player chose to make, not a safety net.
    const misflagged = toggleFlag(build(), 2, 2);
    expect(canChord(misflagged, 1, 1)).toBe(true);
    expect(hitMine(chord(misflagged, 1, 1))).toBe(true);
  });

  it("does nothing on a zero, which has already cascaded", () => {
    const board = createBoard({ rows: 3, cols: 3, mines: 0 });
    board[1][1].revealed = true;
    expect(canChord(board, 1, 1)).toBe(false);
  });

  it("does nothing on an over-flagged number", () => {
    let board = toggleFlag(build(), 0, 0);
    board = toggleFlag(board, 0, 1);
    expect(canChord(board, 1, 1)).toBe(false);
  });
});
