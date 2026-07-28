import { useState } from "react";
import { Bomb, BrainCircuit, Grid3x3, Hash, Lock, Play, Spade, Type } from "lucide-react";
import { Game2048 } from "./Game2048";
import { MinesweeperGame } from "./MinesweeperGame";
import { PatternMemoryGame } from "./PatternMemoryGame";
import { SudokuGame } from "./SudokuGame";
import { TicTacToeGame } from "./TicTacToeGame";
import { WordPuzzleGame } from "./WordPuzzleGame";
import "./brain-games.css";

type GameKey = "sudoku" | "word" | "2048" | "minesweeper" | "tictactoe" | "patternMemory";

const GAMES: {
  key: GameKey;
  name: string;
  blurb: string;
  /** Read on the start screen, before you need it rather than after. */
  howTo: string;
  icon: typeof Hash;
  Component: React.ComponentType;
}[] = [
  {
    key: "sudoku",
    name: "Sudoku",
    blurb: "A full 9×9 grid with exactly one solution. Four difficulties.",
    howTo:
      "Click a square, then type a digit or use the keypad. Arrow keys move. "
      + "Conflicts are marked as you go, and an unfinished grid is waiting when you come back.",
    icon: Hash,
    Component: SudokuGame,
  },
  {
    key: "word",
    name: "Word of the day",
    blurb: "One five-letter puzzle a day. Six guesses, then it is done.",
    howTo:
      "Six guesses at a five-letter word. Green is the right letter in the right place, "
      + "amber is the right letter elsewhere. One puzzle a day — the same one for everyone.",
    icon: Type,
    Component: WordPuzzleGame,
  },
  {
    key: "2048",
    name: "2048",
    blurb: "Slide and merge tiles. Arrow keys, WASD or swipe.",
    howTo:
      "Arrow keys, WASD, or swipe. Tiles showing the same number merge into one — "
      + "each tile can only merge once per move.",
    icon: Spade,
    Component: Game2048,
  },
  {
    key: "minesweeper",
    name: "Minesweeper",
    blurb: "Three board sizes. The first click is always safe.",
    howTo:
      "Click to open a square, right-click to flag one — or switch on Flag mode on a "
      + "touch screen. Your first click is always safe, so you never lose on move one.",
    icon: Bomb,
    Component: MinesweeperGame,
  },
  {
    key: "tictactoe",
    name: "Tic-tac-toe",
    blurb: "Three difficulties, up to an opponent that cannot be beaten.",
    howTo:
      "You are X and go first. On Unbeatable the opponent plays perfectly, and a draw "
      + "is the best result anyone can force — that is the game, not a bug.",
    icon: Grid3x3,
    Component: TicTacToeGame,
  },
  {
    key: "patternMemory",
    name: "Pattern Memory",
    blurb: "Memorize target grid tiles before they fade, then tap to recall.",
    howTo:
      "Target tiles flash teal for ~1.5 seconds. Memorize their layout, then tap "
      + "them all from memory. Advance to higher levels with larger grids and target counts.",
    icon: BrainCircuit,
    Component: PatternMemoryGame,
  },
];

/**
 * Brain Games (SCHOLARDOCX-0198).
 *
 * A break from the application grind, deliberately kept small: both games run
 * entirely in the browser — no AI credits, no external calls, nothing about
 * them reaches the server. Puzzle state lives in `localStorage`, following
 * Sticky Notes rather than adding tables for a diversion.
 */
export function BrainGamesView({ canUse }: { canUse: boolean }) {
  const [active, setActive] = useState<GameKey>("sudoku");
  // Nothing runs until this is true. Choosing a game should not commit you to
  // playing it — and sudoku in particular starts by generating a grid, which
  // is real work to trigger just by browsing the list.
  const [playing, setPlaying] = useState(false);

  if (!canUse) {
    return (
      <div className="brain-games">
        <div className="brain-games-locked">
          <Lock size={28} />
          <h3>Brain Games is turned off for your account.</h3>
          <p>
            It is available on every plan, so this is an account setting rather
            than an upgrade — ask an administrator to switch it back on.
          </p>
        </div>
      </div>
    );
  }

  const game = GAMES.find((entry) => entry.key === active) ?? GAMES[0];
  const ActiveGame = game.Component;
  const ActiveIcon = game.icon;

  return (
    <div className="brain-games">
      <header className="brain-games-header">
        <div>
          <span className="brain-games-eyebrow">Take a break</span>
          <h2>Brain Games</h2>
          <p>
            Something to do while a search runs, or between drafts. Nothing here
            uses credits.
          </p>
        </div>
      </header>

      <div className="brain-games-picker" role="tablist" aria-label="Choose a game">
        {GAMES.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              role="tab"
              aria-selected={active === entry.key}
              className={active === entry.key ? "active" : ""}
              onClick={() => {
                // Re-clicking the game you are already playing must not throw
                // the board away — only a genuine switch returns to the start
                // screen.
                if (entry.key === active) return;
                setActive(entry.key);
                setPlaying(false);
              }}
            >
              <Icon size={18} />
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.blurb}</small>
              </span>
            </button>
          );
        })}
      </div>

      {playing ? (
        <ActiveGame />
      ) : (
        <div className="game-start">
          <span className="game-start-mark" aria-hidden="true">
            <ActiveIcon size={26} />
          </span>
          <h3>{game.name}</h3>
          <p>{game.howTo}</p>
          <button className="game-start-btn" onClick={() => setPlaying(true)}>
            <Play size={16} /> Start {game.name.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}
