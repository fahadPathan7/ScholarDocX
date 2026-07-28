import { useCallback, useEffect, useState } from "react";
import { Flag, RotateCcw } from "lucide-react";
import {
  createBoard,
  flagCount,
  hasWon,
  hitMine,
  layMines,
  LEVELS,
  reveal,
  revealAllMines,
  toggleFlag,
  type Board,
  type Level,
} from "../../lib/games/minesweeper";

const LEVEL_LABELS: Record<Level, string> = {
  beginner: "9×9",
  intermediate: "16×16",
  expert: "16×30",
};

export function MinesweeperGame() {
  const [level, setLevel] = useState<Level>("beginner");
  const [board, setBoard] = useState<Board>(() => createBoard(LEVELS.beginner));
  const [started, setStarted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Touch devices have no right-click, so flagging needs its own mode.
  const [flagMode, setFlagMode] = useState(false);

  const lost = hitMine(board);
  const won = !lost && started && hasWon(board);
  const over = lost || won;

  const reset = useCallback((next: Level) => {
    setLevel(next);
    setBoard(createBoard(LEVELS[next]));
    setStarted(false);
    setSeconds(0);
  }, []);

  useEffect(() => {
    if (!started || over) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [started, over]);

  const open = (r: number, c: number) => {
    if (over) return;
    if (flagMode) {
      setBoard((current) => toggleFlag(current, r, c));
      return;
    }
    if (!started) {
      // Mines are laid now, around this click — see minesweeper.ts.
      const laid = layMines(board, LEVELS[level], r, c);
      setBoard(reveal(laid, r, c));
      setStarted(true);
      return;
    }
    setBoard((current) => {
      const next = reveal(current, r, c);
      return hitMine(next) ? revealAllMines(next) : next;
    });
  };

  const flag = (event: React.MouseEvent, r: number, c: number) => {
    event.preventDefault();
    if (over || !started) return;
    setBoard((current) => toggleFlag(current, r, c));
  };

  const remaining = LEVELS[level].mines - flagCount(board);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="game-panel">
      <div className="game-toolbar">
        <div className="game-difficulty" role="group" aria-label="Board size">
          {(Object.keys(LEVEL_LABELS) as Level[]).map((key) => (
            <button
              key={key}
              className={level === key ? "active" : ""}
              onClick={() => reset(key)}
            >
              {LEVEL_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="game-actions">
          <button
            className={flagMode ? "active" : ""}
            onClick={() => setFlagMode((value) => !value)}
            aria-pressed={flagMode}
            title="Tap cells to flag them instead of opening them"
          >
            <Flag size={14} /> {flagMode ? "Flagging" : "Flag mode"}
          </button>
          <button className="game-reset" onClick={() => reset(level)}>
            <RotateCcw size={14} /> New board
          </button>
        </div>
      </div>

      <div className="sudoku-meta">
        <span>{clock}</span>
        <span>{remaining} mine{remaining === 1 ? "" : "s"} left</span>
        {lost && <span className="bad">Hit a mine</span>}
        {won && <span className="good">Cleared</span>}
      </div>

      <div className="mine-scroll">
        <div
          className="mine-board"
          style={{ gridTemplateColumns: `repeat(${LEVELS[level].cols}, 26px)` }}
          role="grid"
          aria-label="Minesweeper board"
        >
          {board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                className={[
                  "mine-cell",
                  cell.revealed ? "open" : "",
                  cell.revealed && cell.mine ? "mine" : "",
                  cell.flagged ? "flagged" : "",
                  cell.revealed && !cell.mine && cell.adjacent ? `n${cell.adjacent}` : "",
                ].filter(Boolean).join(" ")}
                onClick={() => open(r, c)}
                onContextMenu={(event) => flag(event, r, c)}
                aria-label={`Row ${r + 1} column ${c + 1}${
                  cell.flagged ? ", flagged" : cell.revealed ? `, ${cell.mine ? "mine" : cell.adjacent}` : ", hidden"
                }`}
              >
                {cell.flagged && !cell.revealed
                  ? "⚑"
                  : cell.revealed
                    ? cell.mine ? "✳" : cell.adjacent || ""
                    : ""}
              </button>
            )),
          )}
        </div>
      </div>

      <p className="game-footnote">
        Click to open, right-click to flag — or turn on Flag mode on a touch
        screen. Your first click is always safe.
      </p>
    </div>
  );
}
