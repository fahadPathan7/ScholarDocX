import { useCallback, useEffect, useMemo, useState } from "react";
import { Eraser, Lightbulb, Pencil, RotateCcw } from "lucide-react";
import {
  boxOf,
  colOf,
  conflicts,
  deserializeGrid,
  findHint,
  generatePuzzle,
  isComplete,
  rowOf,
  serializeGrid,
  SIZE,
  type Difficulty,
  type Grid,
} from "../../lib/games/sudoku";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

const STORAGE_KEY = "scholardocx.sudoku.v1";

type Saved = {
  puzzle: string;
  solution: string;
  current: string;
  difficulty: Difficulty;
  hints: number;
  seconds: number;
};

function loadSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    // Validate rather than trust: a half-written or hand-edited entry should
    // start a fresh puzzle, not crash the tab.
    if (
      deserializeGrid(parsed.puzzle) &&
      deserializeGrid(parsed.solution) &&
      deserializeGrid(parsed.current)
    ) {
      return parsed;
    }
  } catch {
    // Ignore — unreadable state is the same as no state.
  }
  return null;
}

export function SudokuGame() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [puzzle, setPuzzle] = useState<Grid | null>(null);
  const [solution, setSolution] = useState<Grid | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [building, setBuilding] = useState(false);

  const start = useCallback((level: Difficulty) => {
    setBuilding(true);
    // Yield a frame so the "Dealing a new grid" state paints before the
    // generator blocks the thread — expert takes a few hundred milliseconds.
    window.setTimeout(() => {
      const made = generatePuzzle(level);
      setPuzzle(made.puzzle);
      setSolution(made.solution);
      setGrid([...made.puzzle]);
      setDifficulty(level);
      setSelected(null);
      setHints(0);
      setSeconds(0);
      setBuilding(false);
    }, 0);
  }, []);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setPuzzle(deserializeGrid(saved.puzzle));
      setSolution(deserializeGrid(saved.solution));
      setGrid(deserializeGrid(saved.current));
      setDifficulty(saved.difficulty);
      setHints(saved.hints ?? 0);
      setSeconds(saved.seconds ?? 0);
      return;
    }
    start("easy");
  }, [start]);

  const solved = grid ? isComplete(grid) : false;

  useEffect(() => {
    if (!grid || solved || building) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [grid, solved, building]);

  useEffect(() => {
    if (!puzzle || !solution || !grid) return;
    const payload: Saved = {
      puzzle: serializeGrid(puzzle),
      solution: serializeGrid(solution),
      current: serializeGrid(grid),
      difficulty,
      hints,
      seconds,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or blocked: the game still plays, it just will not resume.
    }
  }, [puzzle, solution, grid, difficulty, hints, seconds]);

  const wrong = useMemo(() => (grid ? conflicts(grid) : new Set<number>()), [grid]);

  const setValue = (value: number) => {
    if (selected === null || !grid || !puzzle || solved) return;
    if (puzzle[selected] !== 0) return;
    setGrid(grid.map((cell, index) => (index === selected ? value : cell)));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (selected === null || !grid) return;
      if (/^[1-9]$/.test(event.key)) setValue(Number(event.key));
      if (["Backspace", "Delete", "0"].includes(event.key)) setValue(0);
      const moves: Record<string, number> = {
        ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE,
      };
      if (event.key in moves) {
        event.preventDefault();
        const next = selected + moves[event.key];
        if (next >= 0 && next < grid.length) setSelected(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const useHint = () => {
    if (!grid || !solution || solved) return;
    const hint = findHint(grid, solution);
    if (!hint) return;
    setGrid(grid.map((cell, index) => (index === hint.index ? hint.value : cell)));
    setSelected(hint.index);
    setHints((count) => count + 1);
  };

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="game-panel">
      <div className="game-toolbar">
        <div className="game-difficulty" role="group" aria-label="Difficulty">
          {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((level) => (
            <button
              key={level}
              className={difficulty === level ? "active" : ""}
              onClick={() => start(level)}
              disabled={building}
            >
              {DIFFICULTY_LABELS[level]}
            </button>
          ))}
        </div>
        <div className="game-actions">
          <button onClick={useHint} disabled={building || solved || !grid}>
            <Lightbulb size={14} /> Hint
          </button>
          <button className="game-reset" onClick={() => start(difficulty)} disabled={building}>
            <RotateCcw size={14} /> New grid
          </button>
        </div>
      </div>

      <div className="sudoku-meta">
        <span>{clock}</span>
        {hints > 0 && <span>{hints} hint{hints === 1 ? "" : "s"} used</span>}
        {wrong.size > 0 && <span className="bad">{wrong.size} conflicting</span>}
        {solved && <span className="good">Solved</span>}
      </div>

      {building || !grid || !puzzle ? (
        <div className="sudoku-building">
          <Pencil size={22} />
          <p>Dealing a new grid…</p>
        </div>
      ) : (
        <>
          <div className="sudoku-board" role="grid" aria-label="Sudoku grid">
            {grid.map((value, index) => {
              const given = puzzle[index] !== 0;
              const peer =
                selected !== null &&
                (rowOf(index) === rowOf(selected) ||
                  colOf(index) === colOf(selected) ||
                  boxOf(index) === boxOf(selected));
              const sameValue = selected !== null && value !== 0 && value === grid[selected];
              return (
                <button
                  key={index}
                  className={[
                    "sudoku-cell",
                    given ? "given" : "",
                    selected === index ? "selected" : "",
                    peer && selected !== index ? "peer" : "",
                    sameValue && selected !== index ? "same" : "",
                    wrong.has(index) ? "wrong" : "",
                    colOf(index) % 3 === 2 && colOf(index) !== 8 ? "edge-right" : "",
                    rowOf(index) % 3 === 2 && rowOf(index) !== 8 ? "edge-bottom" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setSelected(index)}
                  aria-label={`Row ${rowOf(index) + 1} column ${colOf(index) + 1}${
                    value ? `, ${value}` : ", empty"
                  }${given ? ", given" : ""}`}
                >
                  {value || ""}
                </button>
              );
            })}
          </div>

          <div className="sudoku-keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
              <button
                key={value}
                onClick={() => setValue(value)}
                disabled={selected === null || solved || puzzle[selected] !== 0}
              >
                {value}
              </button>
            ))}
            <button
              className="erase"
              onClick={() => setValue(0)}
              disabled={selected === null || solved || puzzle[selected] !== 0}
              aria-label="Clear square"
            >
              <Eraser size={15} />
            </button>
          </div>

          <p className="game-footnote">
            Click a square, then type a number or use the keypad. Arrow keys move.
            Conflicts are marked as you go — the grid never blocks a move.
          </p>
        </>
      )}
    </div>
  );
}
