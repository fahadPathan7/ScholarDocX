/**
 * Pattern Memory (Memory Matrix) game logic engine.
 * SCHOLARDOCX-0199
 *
 * Pure rules and state transformations — runs 100% client-side with no React dependencies.
 */

export type GamePhase = "MEMORIZE" | "RECALL" | "SUCCESS" | "GAMEOVER";

export interface PatternGameState {
  level: number;
  score: number;
  highScore: number;
  bestLevel: number;
  gridSize: number;
  targetCount: number;
  pattern: number[];
  userSelected: number[];
  wrongSelected: number[];
  lives: number;
  phase: GamePhase;
  memorizeTimeMs: number;
}

export const HIGH_SCORE_KEY = "scholardocx_pattern_memory_highscore";
export const BEST_LEVEL_KEY = "scholardocx_pattern_memory_best_level";
export const MAX_LIVES = 3;

/**
 * Get grid dimension and target tile count for a given level.
 */
export function getLevelConfig(level: number): {
  gridSize: number;
  targetCount: number;
  memorizeTimeMs: number;
} {
  const safeLevel = Math.max(1, level);
  let gridSize = 3;
  if (safeLevel >= 8) {
    gridSize = 5;
  } else if (safeLevel >= 4) {
    gridSize = 4;
  }

  // Target tiles count scales with level
  const targetCount = Math.min(
    gridSize * gridSize - 2,
    3 + Math.floor((safeLevel - 1) * 0.8)
  );

  // Memorization time gives a tiny bit more time for larger grids
  const memorizeTimeMs = Math.max(1200, 1500 + (gridSize - 3) * 300);

  return { gridSize, targetCount, memorizeTimeMs };
}

/**
 * Generate N unique random cell indices for a grid of size gridSize x gridSize.
 */
export function generatePattern(
  gridSize: number,
  targetCount: number,
  randomFn = Math.random
): number[] {
  const totalCells = gridSize * gridSize;
  const clampedTarget = Math.min(totalCells, Math.max(1, targetCount));
  const indices: number[] = [];

  while (indices.length < clampedTarget) {
    const candidate = Math.floor(randomFn() * totalCells);
    if (!indices.includes(candidate)) {
      indices.push(candidate);
    }
  }

  return indices;
}

export function getStoredHighScore(): number {
  try {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    return stored ? parseInt(stored, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function getStoredBestLevel(): number {
  try {
    const stored = localStorage.getItem(BEST_LEVEL_KEY);
    return stored ? parseInt(stored, 10) || 1 : 1;
  } catch {
    return 1;
  }
}

export function saveHighScore(score: number): void {
  try {
    const current = getStoredHighScore();
    if (score > current) {
      localStorage.setItem(HIGH_SCORE_KEY, score.toString());
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

export function saveBestLevel(level: number): void {
  try {
    const current = getStoredBestLevel();
    if (level > current) {
      localStorage.setItem(BEST_LEVEL_KEY, level.toString());
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Initialize a new game or level.
 */
export function createPatternGame(
  level = 1,
  score = 0,
  lives = MAX_LIVES,
  highScore = 0,
  bestLevel = 1,
  randomFn = Math.random
): PatternGameState {
  const { gridSize, targetCount, memorizeTimeMs } = getLevelConfig(level);
  const pattern = generatePattern(gridSize, targetCount, randomFn);

  return {
    level,
    score,
    highScore: Math.max(highScore, score, getStoredHighScore()),
    bestLevel: Math.max(bestLevel, level, getStoredBestLevel()),
    gridSize,
    targetCount,
    pattern,
    userSelected: [],
    wrongSelected: [],
    lives,
    phase: "MEMORIZE",
    memorizeTimeMs,
  };
}

/**
 * Handle user clicking a tile during the RECALL phase.
 */
export function handleTileClick(
  state: PatternGameState,
  cellIndex: number
): PatternGameState {
  if (state.phase !== "RECALL") return state;
  if (
    state.userSelected.includes(cellIndex) ||
    state.wrongSelected.includes(cellIndex)
  ) {
    return state;
  }

  const isTarget = state.pattern.includes(cellIndex);

  if (isTarget) {
    const newUserSelected = [...state.userSelected, cellIndex];
    const isLevelComplete = newUserSelected.length === state.pattern.length;
    const addedPoints = 100 * state.level;
    const newScore = state.score + addedPoints;
    const newHighScore = Math.max(state.highScore, newScore);

    if (isLevelComplete) {
      const newBestLevel = Math.max(state.bestLevel, state.level);
      saveHighScore(newHighScore);
      saveBestLevel(newBestLevel);

      return {
        ...state,
        score: newScore,
        highScore: newHighScore,
        bestLevel: newBestLevel,
        userSelected: newUserSelected,
        phase: "SUCCESS",
      };
    }

    return {
      ...state,
      score: newScore,
      highScore: newHighScore,
      userSelected: newUserSelected,
    };
  } else {
    const newWrongSelected = [...state.wrongSelected, cellIndex];
    const newLives = state.lives - 1;

    if (newLives <= 0) {
      saveHighScore(state.highScore);
      saveBestLevel(state.bestLevel);
      return {
        ...state,
        wrongSelected: newWrongSelected,
        lives: 0,
        phase: "GAMEOVER",
      };
    }

    return {
      ...state,
      wrongSelected: newWrongSelected,
      lives: newLives,
    };
  }
}
