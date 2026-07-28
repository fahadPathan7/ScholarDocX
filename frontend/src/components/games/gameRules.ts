// How-to-play text for each brain game. Pure data (no React) so the game
// components and the rules modal can import it without dragging in JSX.
//
// Copy follows the project rule: describe the outcome, not the mechanism —
// no provider names, algorithm jargon, or internal detail leaks to the user.

export type GameId = "sudoku" | "word" | "2048" | "minesweeper" | "tictactoe";

export type GameRules = {
  id: GameId;
  /** Shown after "How to play: …" in the modal header. */
  title: string;
  /** One sentence: what a finished/won state looks like. */
  goal: string;
  /** Ordered steps — controls and the core rule, in plain language. */
  steps: string[];
  /** A short nudge or gotcha. Shown set apart from the steps. */
  tip: string;
};

export const GAME_RULES: Record<GameId, GameRules> = {
  sudoku: {
    id: "sudoku",
    title: "Sudoku",
    goal: "Fill the 9×9 grid so each row, column, and 3×3 box holds 1–9 exactly once.",
    steps: [
      "Click a square, then type a digit or tap one on the keypad.",
      "Arrow keys move between squares; Backspace clears a number.",
      "Given numbers (darker) can't be changed — work around them.",
      "A repeated number in the same row, column, or box is marked as a conflict. The grid never blocks a move.",
    ],
    tip: "Stuck? Use a Hint — it fills one square correctly, but counts toward your total.",
  },
  word: {
    id: "word",
    title: "Word of the day",
    goal: "Guess the five-letter word in six tries.",
    steps: [
      "Type five letters, then press Enter.",
      "Green: right letter, right place. Amber: right letter, elsewhere. Grey: not in the word.",
      "There's one puzzle a day — the same one for everyone — and it resets at midnight.",
    ],
    tip: "There's no word list. Any five letters are accepted, so a non-word guess still costs you a try.",
  },
  "2048": {
    id: "2048",
    title: "2048",
    goal: "Combine matching tiles to build your way to 2048 — and beyond.",
    steps: [
      "Arrow keys, WASD, or a swipe slides every tile in that direction.",
      "Two tiles showing the same number merge into one — but each tile can only merge once per move.",
      "After a move that changes the board, a new tile appears in an empty space.",
      "The game ends when no tile can move or merge.",
    ],
    tip: "Keep your biggest tile pinned to a corner to avoid trapping it.",
  },
  minesweeper: {
    id: "minesweeper",
    title: "Minesweeper",
    goal: "Open every safe square without hitting a mine.",
    steps: [
      "Click a square to open it. A number tells you how many mines touch it.",
      "Right-click (or turn on Flag mode on a touch screen) to mark a square you suspect is a mine.",
      "Your first click is always safe — mines are placed only after you've made it.",
      "Open the right square and a large area can clear at once.",
    ],
    tip: "Use the numbers to reason it out: if a square says “2” and exactly two flags touch it, the other neighbours are safe.",
  },
  tictactoe: {
    id: "tictactoe",
    title: "Tic-tac-toe",
    goal: "Get three of your marks in a row — across, down, or diagonally.",
    steps: [
      "You are X and always move first.",
      "Click any open square to place your mark.",
      "The round ends when someone makes three in a row or the board fills up.",
    ],
    tip: "On Unbeatable the opponent plays perfectly, so the best anyone can force is a draw — that's the game, not a bug.",
  },
};
