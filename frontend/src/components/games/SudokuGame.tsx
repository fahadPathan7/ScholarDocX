import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Eraser, Lightbulb, Pencil, RotateCcw, Undo2 } from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";
import {
  applyValueToNotes,
  boxOf,
  colOf,
  conflicts,
  deserializeGrid,
  deserializeNotes,
  emptyNotes,
  findHint,
  generatePuzzle,
  isComplete,
  rowOf,
  serializeGrid,
  serializeNotes,
  SIZE,
  toggleNote,
  type Difficulty,
  type Grid,
  type Notes,
} from "../../lib/games/sudoku";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

const STORAGE_KEY = "scholardocx.sudoku.v1";

/** Deep enough to unpick a bad line of reasoning, shallow enough that the
 *  history is not a second save file. */
const UNDO_LIMIT = 60;

type Saved = {
  puzzle: string;
  solution: string;
  current: string;
  difficulty: Difficulty;
  hints: number;
  seconds: number;
  /** Absent on entries written before notes existed — treated as none. */
  notes?: string;
};

/** One reversible edit. Notes and values share a stack so Undo always means
 *  "the last thing I did", whichever kind of thing it was. */
type Step = { grid: Grid; notes: Notes; selected: number | null };

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
  const [notes, setNotes] = useState<Notes>(emptyNotes);
  const [noteMode, setNoteMode] = useState(false);
  const [history, setHistory] = useState<Step[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [building, setBuilding] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const start = useCallback((level: Difficulty) => {
    setBuilding(true);
    // Yield a frame so the "Dealing a new grid" state paints before the
    // generator blocks the thread — expert takes a few hundred milliseconds.
    window.setTimeout(() => {
      const made = generatePuzzle(level);
      setPuzzle(made.puzzle);
      setSolution(made.solution);
      setGrid([...made.puzzle]);
      setNotes(emptyNotes());
      setHistory([]);
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
      // A save from before notes existed, or a corrupt notes blob, resumes
      // with a clean margin rather than refusing to load the grid.
      setNotes((saved.notes && deserializeNotes(saved.notes)) || emptyNotes());
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
      notes: serializeNotes(notes),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or blocked: the game still plays, it just will not resume.
    }
  }, [puzzle, solution, grid, difficulty, hints, seconds, notes]);

  const wrong = useMemo(() => (grid ? conflicts(grid) : new Set<number>()), [grid]);

  /** Push the pre-edit state so Undo has something to go back to. Oldest step
   *  falls off at the cap rather than the newest being refused. */
  const remember = useCallback((step: Step) => {
    setHistory((stack) => [...stack, step].slice(-UNDO_LIMIT));
  }, []);

  /** Write a real digit: clears this square's candidates and strikes the digit
   *  from every square that can see it. */
  const setValue = (value: number) => {
    if (selected === null || !grid || !puzzle || solved) return;
    if (puzzle[selected] !== 0) return;
    remember({ grid, notes, selected });
    setGrid(grid.map((cell, index) => (index === selected ? value : cell)));
    setNotes(applyValueToNotes(notes, selected, value));
  };

  /** Pencil a candidate in or out. Never touches the placed value — a square
   *  that already holds a digit is not a place for candidates. */
  const setNote = (value: number) => {
    if (selected === null || !grid || !puzzle || solved) return;
    if (puzzle[selected] !== 0 || grid[selected] !== 0 || value === 0) return;
    remember({ grid, notes, selected });
    setNotes(toggleNote(notes, selected, value));
  };

  /** In notes mode digits pencil; a digit is only placed with notes off.
   *  Erasing is the same action either way. */
  const enter = (value: number) => {
    if (noteMode && value !== 0) setNote(value);
    else setValue(value);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last || solved) return;
    setGrid(last.grid);
    setNotes(last.notes);
    setSelected(last.selected);
    setHistory((stack) => stack.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The listener is on the window, so it would otherwise eat keystrokes
      // meant for a focused field elsewhere on the page — and "N" for notes
      // is a plain letter, which makes that a real collision rather than a
      // theoretical one.
      const target = event.target as HTMLElement | null;
      if (
        showRules ||
        (target &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      ) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey) {
        setNoteMode((on) => !on);
        return;
      }
      if (selected === null || !grid) return;
      if (/^[1-9]$/.test(event.key)) enter(Number(event.key));
      if (["Backspace", "Delete", "0"].includes(event.key)) enter(0);
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
    remember({ grid, notes, selected });
    setGrid(grid.map((cell, index) => (index === hint.index ? hint.value : cell)));
    setNotes(applyValueToNotes(notes, hint.index, hint.value));
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
          <button onClick={() => setShowRules(true)} title="How to play">
            <BookOpen size={14} /> How to play
          </button>
          <button
            className={noteMode ? "active" : ""}
            onClick={() => setNoteMode((on) => !on)}
            aria-pressed={noteMode}
            disabled={building || solved || !grid}
            title="Write small candidate numbers instead of filling the square (N)"
          >
            <Pencil size={14} /> {noteMode ? "Notes on" : "Notes"}
          </button>
          <button
            onClick={undo}
            disabled={building || solved || !history.length}
            title="Undo the last change (Ctrl+Z)"
          >
            <Undo2 size={14} /> Undo
          </button>
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
                  }${given ? ", given" : ""}${
                    !value && notes[index].size
                      ? `, notes ${[...notes[index]].sort().join(" ")}`
                      : ""
                  }`}
                >
                  {value ? (
                    value
                  ) : notes[index].size ? (
                    <span className="sudoku-notes" aria-hidden="true">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((candidate) => (
                        <i key={candidate}>
                          {notes[index].has(candidate) ? candidate : ""}
                        </i>
                      ))}
                    </span>
                  ) : (
                    ""
                  )}
                </button>
              );
            })}
          </div>

          <div className={`sudoku-keypad${noteMode ? " noting" : ""}`}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
              <button
                key={value}
                onClick={() => enter(value)}
                disabled={
                  selected === null ||
                  solved ||
                  puzzle[selected] !== 0 ||
                  // Nothing to pencil into a square that already holds a digit.
                  (noteMode && grid[selected] !== 0)
                }
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
            Notes (N) writes small candidates instead of filling the square, and
            placing a number rubs itself out of the notes around it. Ctrl+Z
            undoes. Conflicts are marked as you go — the grid never blocks a move.
          </p>
        </>
      )}

      {showRules && <GameRulesModal id="sudoku" onClose={() => setShowRules(false)} />}
    </div>
  );
}
