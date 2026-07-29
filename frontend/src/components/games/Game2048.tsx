import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, RotateCcw, Undo2 } from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";
import {
  canMove,
  highestTile,
  move,
  newGame,
  SIZE,
  spawnAt,
  type Board,
  type Cell,
  type Direction,
} from "../../lib/games/game2048";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
};

/** Flat cell index, so highlight lookups are a Set membership test. */
const flatten = (cells: Cell[]): Set<number> =>
  new Set(cells.map(([r, c]) => r * SIZE + c));

/** Board and score move together — an undo that restored one but not the
 *  other would hand back free points. */
type Snapshot = { board: Board; score: number };

export function Game2048() {
  const [{ board, score }, setGame] = useState<Snapshot>(() => ({
    board: newGame(),
    score: 0,
  }));
  const [best, setBest] = useState(0);
  const [showRules, setShowRules] = useState(false);
  // One step only. A freely rewindable 2048 is a different game — the whole
  // tension is that a bad swipe costs you something.
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  // Which tiles just merged, and where the new one appeared. Cleared on a
  // timer so the animation runs once rather than on every unrelated re-render.
  const [merged, setMerged] = useState<Set<number>>(new Set());
  const [fresh, setFresh] = useState<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const stuck = !canMove(board);
  const reached = highestTile(board);

  // Reads state directly rather than through a functional update: a move has
  // to snapshot the board *and* score together and set four other things, and
  // an updater is not the place for that. Re-binding the key listener each
  // move is the price, and it is nothing.
  const push = useCallback((direction: Direction) => {
    const result = move(board, direction);
    // A move that changes nothing must not spawn a tile — otherwise pressing
    // into a wall slowly fills the board for free.
    if (!result.moved) return;
    const spawned = spawnAt(result.board);
    const next = { board: spawned.board, score: score + result.gained };
    setPrevious({ board, score });
    setGame(next);
    setBest((high) => Math.max(high, next.score));
    setMerged(flatten(result.merged));
    setFresh(spawned.at ? spawned.at[0] * SIZE + spawned.at[1] : null);
  }, [board, score]);

  // Strip the one-shot classes once they have played, so a later render of the
  // same board does not re-trigger them.
  useEffect(() => {
    if (!merged.size && fresh === null) return;
    const timer = window.setTimeout(() => {
      setMerged(new Set());
      setFresh(null);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [merged, fresh]);

  const undo = () => {
    if (!previous) return;
    setGame(previous);
    setMerged(new Set());
    setFresh(null);
    // Spent once used: undo takes back the last move, not the game.
    setPrevious(null);
  };

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
    setGame({ board: newGame(), score: 0 });
    setPrevious(null);
    setMerged(new Set());
    setFresh(null);
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
        <div className="game-actions">
          <button onClick={() => setShowRules(true)} title="How to play">
            <BookOpen size={14} /> How to play
          </button>
          <button
            onClick={undo}
            disabled={!previous}
            title="Take back the last move"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button className="game-reset" onClick={reset}>
            <RotateCcw size={14} /> New game
          </button>
        </div>
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
            className={[
              "g2048-tile",
              value ? `v${Math.min(value, 2048)}` : "empty",
              merged.has(index) ? "merged" : "",
              fresh === index ? "fresh" : "",
            ].filter(Boolean).join(" ")}
          >
            {value || ""}
          </div>
        ))}
      </div>

      <p className="game-footnote">
        Arrow keys or WASD, or swipe. Tiles of the same number merge — each tile
        can only merge once per move. Undo takes back one move.
      </p>

      {showRules && <GameRulesModal id="2048" onClose={() => setShowRules(false)} />}
    </div>
  );
}
