import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  canMove,
  highestTile,
  move,
  newGame,
  spawn,
  type Board,
  type Direction,
} from "../../lib/games/game2048";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
};

export function Game2048() {
  const [board, setBoard] = useState<Board>(() => newGame());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const stuck = !canMove(board);
  const reached = highestTile(board);

  const push = useCallback((direction: Direction) => {
    setBoard((current) => {
      const result = move(current, direction);
      // A move that changes nothing must not spawn a tile — otherwise pressing
      // into a wall slowly fills the board for free.
      if (!result.moved) return current;
      setScore((value) => {
        const next = value + result.gained;
        setBest((high) => Math.max(high, next));
        return next;
      });
      return spawn(result.board);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) return;
      event.preventDefault();
      push(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [push]);

  const reset = () => {
    setBoard(newGame());
    setScore(0);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0];
    touch.current = { x: point.clientX, y: point.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (!touch.current) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.current.x;
    const dy = point.clientY - touch.current.y;
    touch.current = null;
    // Ignore anything too small to be a deliberate swipe.
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    push(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? "right" : "left"
        : dy > 0 ? "down" : "up",
    );
  };

  return (
    <div className="game-panel">
      <div className="game-toolbar">
        <div className="game-score inline">
          <span><strong>{score}</strong>Score</span>
          <span><strong>{best}</strong>Best</span>
        </div>
        <button className="game-reset" onClick={reset}>
          <RotateCcw size={14} /> New game
        </button>
      </div>

      <p className={`game-status${stuck ? " finished" : ""}`} role="status">
        {stuck
          ? `No moves left — you reached ${reached}`
          : reached >= 2048
            ? `You made ${reached}. Keep going.`
            : "Combine matching tiles"}
      </p>

      <div
        className="g2048-board"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="grid"
        aria-label="2048 board"
      >
        {board.flat().map((value, index) => (
          <div
            key={index}
            className={`g2048-tile${value ? ` v${Math.min(value, 2048)}` : " empty"}`}
          >
            {value || ""}
          </div>
        ))}
      </div>

      <p className="game-footnote">
        Arrow keys or WASD, or swipe. Tiles of the same number merge — each tile
        can only merge once per move.
      </p>
    </div>
  );
}
