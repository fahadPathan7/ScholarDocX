import { useCallback, useEffect, useMemo, useState } from "react";
import { Delete, CornerDownLeft } from "lucide-react";
import {
  dayNumber,
  isWellFormed,
  keyboardState,
  MAX_GUESSES,
  progressOf,
  scoreGuess,
  WORD_LENGTH,
  wordForDay,
} from "../../lib/games/wordPuzzle";

const STORAGE_KEY = "scholardocx.wordpuzzle.v1";
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

type Saved = { day: number; guesses: string[] };

export function WordPuzzleGame() {
  const today = useMemo(() => dayNumber(), []);
  const answer = useMemo(() => wordForDay(today), [today]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      // Yesterday's progress must not carry into today's word.
      if (saved.day === today && Array.isArray(saved.guesses)) setGuesses(saved.guesses);
    } catch {
      // Unreadable state is the same as none.
    }
  }, [today]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: today, guesses }));
    } catch {
      // Storage blocked: the puzzle still plays, it just will not resume.
    }
  }, [today, guesses]);

  const progress = progressOf(guesses, answer);
  const done = progress !== "playing";
  const keys = useMemo(() => keyboardState(guesses, answer), [guesses, answer]);

  const submit = useCallback(() => {
    if (done) return;
    // Length only — no dictionary check. A break puzzle that argues with you
    // about whether a word counts is worse than one that lets a bad guess
    // burn a row.
    if (!isWellFormed(draft)) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      return;
    }
    setGuesses((current) => [...current, draft.toLowerCase()]);
    setDraft("");
  }, [done, draft]);

  const type = useCallback((letter: string) => {
    if (done) return;
    setDraft((current) => (current.length < WORD_LENGTH ? current + letter : current));
  }, [done]);

  const backspace = useCallback(() => setDraft((current) => current.slice(0, -1)), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") submit();
      else if (event.key === "Backspace") backspace();
      else if (/^[a-zA-Z]$/.test(event.key)) type(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, backspace, type]);

  const rows = [...Array(MAX_GUESSES).keys()].map((index) => {
    if (index < guesses.length) {
      const guess = guesses[index];
      return { letters: guess.split(""), marks: scoreGuess(guess, answer), live: false };
    }
    if (index === guesses.length && !done) {
      return {
        letters: draft.padEnd(WORD_LENGTH, " ").split(""),
        marks: null,
        live: true,
      };
    }
    return { letters: Array(WORD_LENGTH).fill(" "), marks: null, live: false };
  });

  return (
    <div className="game-panel">
      <div className="game-toolbar">
        <span className="word-day">Puzzle #{today}</span>
        <span className="word-remaining">
          {done ? "" : `${MAX_GUESSES - guesses.length} guess${MAX_GUESSES - guesses.length === 1 ? "" : "es"} left`}
        </span>
      </div>

      <p className={`game-status${done ? " finished" : ""}`} role="status">
        {progress === "won"
          ? `Got it in ${guesses.length}`
          : progress === "lost"
            ? `Out of guesses — it was ${answer.toUpperCase()}`
            : "Five letters"}
      </p>

      <div className={`word-grid${shake ? " shake" : ""}`} role="grid" aria-label="Guesses">
        {rows.map((row, r) => (
          <div className="word-row" key={r}>
            {row.letters.map((letter, c) => (
              <div
                key={c}
                className={[
                  "word-tile",
                  row.marks ? row.marks[c] : "",
                  row.live && letter !== " " ? "typed" : "",
                ].filter(Boolean).join(" ")}
              >
                {letter.trim().toUpperCase()}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="word-keyboard">
        {KEY_ROWS.map((row, index) => (
          <div className="word-key-row" key={row}>
            {index === 2 && (
              <button className="wide" onClick={submit} aria-label="Submit guess">
                <CornerDownLeft size={14} />
              </button>
            )}
            {row.split("").map((letter) => (
              <button
                key={letter}
                className={keys[letter] || ""}
                onClick={() => type(letter)}
              >
                {letter.toUpperCase()}
              </button>
            ))}
            {index === 2 && (
              <button className="wide" onClick={backspace} aria-label="Delete letter">
                <Delete size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="game-footnote">
        One puzzle a day, the same for everyone. Any five letters are accepted —
        it will not argue with you about whether a word counts.
      </p>
    </div>
  );
}
