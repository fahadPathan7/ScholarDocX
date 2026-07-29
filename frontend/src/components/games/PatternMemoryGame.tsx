import { useEffect, useState } from "react";
import { BookOpen, Heart, RotateCcw } from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";
import {
  createPatternGame,
  handleTileClick,
  PatternGameState,
} from "../../lib/games/patternMemory";

export function PatternMemoryGame() {
  const [game, setGame] = useState<PatternGameState>(() => createPatternGame(1));
  const [showRules, setShowRules] = useState(false);

  // Memorization phase timer effect
  useEffect(() => {
    if (game.phase !== "MEMORIZE") return;

    const timer = setTimeout(() => {
      setGame((current) =>
        current.phase === "MEMORIZE" ? { ...current, phase: "RECALL" } : current
      );
    }, game.memorizeTimeMs);

    return () => clearTimeout(timer);
  }, [game.phase, game.memorizeTimeMs, game.level]);

  const onCellClick = (index: number) => {
    setGame((current) => handleTileClick(current, index));
  };

  const nextLevel = () => {
    setGame((current) =>
      createPatternGame(
        current.level + 1,
        current.score,
        current.lives,
        current.highScore,
        current.bestLevel
      )
    );
  };

  const restartGame = () => {
    setGame(createPatternGame(1, 0, 3, game.highScore, game.bestLevel));
  };

  const totalCells = game.gridSize * game.gridSize;

  const formattedScore = game.score.toLocaleString();
  const formattedBestScore = game.highScore.toLocaleString();

  return (
    <div className="game-panel pattern-memory-game">
      {/* Game Header Bar */}
      <div className="game-toolbar">
        <div className="game-actions">
          <button type="button" onClick={() => setShowRules(true)} title="How to play">
            <BookOpen size={14} /> How to play
          </button>
          <button type="button" className="game-reset" onClick={restartGame} title="New game">
            <RotateCcw size={14} /> New game
          </button>
        </div>

        <div className="pattern-meta">
          <span>Level {game.level}</span>
          <span>Score: {formattedScore}</span>
          <span>
            Best: Level {game.bestLevel} ({formattedBestScore} pts)
          </span>
          <span className="pattern-lives" title={`${game.lives} lives remaining`}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                size={14}
                className={i < game.lives ? "heart-active" : "heart-lost"}
              />
            ))}
          </span>
        </div>
      </div>

      {/* Game Status Message */}
      <div className="pattern-memory-status">
        {game.phase === "MEMORIZE" && (
          <span className="status-memorize">
            Memorize the pattern! ({game.pattern.length} tiles)
          </span>
        )}
        {game.phase === "RECALL" && (
          <span className="status-recall">
            Recall & tap the target tiles ({game.userSelected.length} / {game.pattern.length})
          </span>
        )}
        {game.phase === "SUCCESS" && (
          <div className="status-success-banner">
            <span>Great job! Level {game.level} completed!</span>
            <button type="button" className="pattern-btn-next" onClick={nextLevel}>
              Next Level →
            </button>
          </div>
        )}
        {game.phase === "GAMEOVER" && (
          <div className="status-gameover-banner">
            <span>Game Over! You reached Level {game.level}.</span>
            <button type="button" className="pattern-btn-restart" onClick={restartGame}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Matrix Grid */}
      <div
        className="pattern-memory-board"
        style={
          {
            "--grid-size": game.gridSize,
          } as React.CSSProperties
        }
      >
        {Array.from({ length: totalCells }).map((_, index) => {
          const isTarget = game.pattern.includes(index);
          const isSelected = game.userSelected.includes(index);
          const isWrong = game.wrongSelected.includes(index);

          let cellClass = "pattern-memory-cell";
          if (game.phase === "MEMORIZE" && isTarget) {
            cellClass += " cell-memorize";
          } else if (isSelected) {
            cellClass += " cell-correct";
          } else if (isWrong) {
            cellClass += " cell-wrong";
          } else if (game.phase === "GAMEOVER" && isTarget) {
            cellClass += " cell-revealed";
          }

          return (
            <button
              key={index}
              type="button"
              className={cellClass}
              disabled={game.phase !== "RECALL" || isSelected || isWrong}
              onClick={() => onCellClick(index)}
              aria-label={`Cell ${index + 1}`}
            />
          );
        })}
      </div>

      {showRules && (
        <GameRulesModal
          id="patternMemory"
          onClose={() => setShowRules(false)}
        />
      )}
    </div>
  );
}
