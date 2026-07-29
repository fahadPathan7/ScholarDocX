import { describe, it, expect } from "vitest";
import {
  createPatternGame,
  generatePattern,
  getLevelConfig,
  handleTileClick,
} from "../patternMemory";

describe("getLevelConfig", () => {
  it("returns 3x3 for level 1", () => {
    const config = getLevelConfig(1);
    expect(config.gridSize).toBe(3);
    expect(config.targetCount).toBe(3);
  });

  it("scales to 4x4 at level 4", () => {
    const config = getLevelConfig(4);
    expect(config.gridSize).toBe(4);
    expect(config.targetCount).toBeGreaterThanOrEqual(5);
  });

  it("scales to 5x5 at level 8", () => {
    const config = getLevelConfig(8);
    expect(config.gridSize).toBe(5);
    expect(config.targetCount).toBeGreaterThanOrEqual(8);
  });
});

describe("generatePattern", () => {
  it("generates unique cell indices within bounds", () => {
    const gridSize = 4;
    const targetCount = 5;
    const pattern = generatePattern(gridSize, targetCount);

    expect(pattern).toHaveLength(targetCount);
    const unique = new Set(pattern);
    expect(unique.size).toBe(targetCount);

    pattern.forEach((idx) => {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(gridSize * gridSize);
    });
  });
});

describe("createPatternGame", () => {
  it("initializes game state in MEMORIZE phase", () => {
    const game = createPatternGame(1);
    expect(game.level).toBe(1);
    expect(game.phase).toBe("MEMORIZE");
    expect(game.userSelected).toHaveLength(0);
    expect(game.wrongSelected).toHaveLength(0);
    expect(game.lives).toBe(3);
  });
});

describe("handleTileClick", () => {
  it("ignores clicks when not in RECALL phase", () => {
    const game = createPatternGame(1);
    expect(game.phase).toBe("MEMORIZE");
    const updated = handleTileClick(game, game.pattern[0]);
    expect(updated).toBe(game);
  });

  it("handles correct tile click", () => {
    let game = createPatternGame(1);
    game = { ...game, phase: "RECALL" };
    const targetCell = game.pattern[0];

    const updated = handleTileClick(game, targetCell);
    expect(updated.userSelected).toContain(targetCell);
    expect(updated.score).toBeGreaterThan(0);
  });

  it("detects level completion when all target tiles are selected", () => {
    let game = createPatternGame(1);
    game = { ...game, phase: "RECALL" };

    // Select all targets
    game.pattern.forEach((cellIdx) => {
      game = handleTileClick(game, cellIdx);
    });

    expect(game.phase).toBe("SUCCESS");
    expect(game.userSelected).toHaveLength(game.pattern.length);
  });

  it("deducts a life on incorrect tile click", () => {
    let game = createPatternGame(1);
    game = { ...game, phase: "RECALL" };

    // Find a non-target cell
    const nonTargetCell = Array.from({ length: 9 })
      .map((_, i) => i)
      .find((idx) => !game.pattern.includes(idx))!;

    const updated = handleTileClick(game, nonTargetCell);
    expect(updated.wrongSelected).toContain(nonTargetCell);
    expect(updated.lives).toBe(2);
    expect(updated.phase).toBe("RECALL");
  });

  it("triggers GAMEOVER when lives reach zero", () => {
    let game = createPatternGame(1, 0, 1); // 1 life left
    game = { ...game, phase: "RECALL" };

    const nonTargetCell = Array.from({ length: 9 })
      .map((_, i) => i)
      .find((idx) => !game.pattern.includes(idx))!;

    const updated = handleTileClick(game, nonTargetCell);
    expect(updated.lives).toBe(0);
    expect(updated.phase).toBe("GAMEOVER");
  });
});
