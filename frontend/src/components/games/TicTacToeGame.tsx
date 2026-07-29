import { useCallback, useEffect, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";
import {
  availableMoves,
  chooseMove,
  EMPTY_BOARD,
  evaluate,
  type Board,
  type Difficulty,
} from "../../lib/games/ticTacToe";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Unbeatable",
};

type Score = { wins: number; losses: number; draws: number };
const EMPTY_SCORE: Score = { wins: 0, losses: 0, draws: 0 };

export function TicTacToeGame() {
  const [board, setBoard] = useState<Board>([...EMPTY_BOARD]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [score, setScore] = useState<Score>(EMPTY_SCORE);
  const [scored, setScored] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const outcome = evaluate(board);
  const finished = outcome.status !== "playing";
  // You are always X and always move first — a break game should not ask you
  // to decide anything before it starts.
  const yourTurn = availableMoves(board).length % 2 === 1;

  useEffect(() => {
    if (finished || yourTurn) return;
    // A beat of delay: an instant reply reads as a glitch rather than a move.
    const timer = window.setTimeout(() => {
      setBoard((current) => {
        if (evaluate(current).status !== "playing") return current;
        const move = chooseMove(current, "O", difficulty);
        if (move === null) return current;
        return current.map((cell, index) => (index === move ? "O" : cell));
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [board, finished, yourTurn, difficulty]);

  useEffect(() => {
    if (!finished || scored) return;
    setScored(true);
    setScore((current) => ({
      wins: current.wins + (outcome.status === "won" && outcome.winner === "X" ? 1 : 0),
      losses: current.losses + (outcome.status === "won" && outcome.winner === "O" ? 1 : 0),
      draws: current.draws + (outcome.status === "draw" ? 1 : 0),
    }));
  }, [finished, scored, outcome]);

  const reset = useCallback(() => {
    setBoard([...EMPTY_BOARD]);
    setScored(false);
  }, []);

  const play = (index: number) => {
    if (finished || board[index] || !yourTurn) return;
    setBoard((current) => current.map((cell, i) => (i === index ? "X" : cell)));
  };

  const winningLine = outcome.status === "won" ? outcome.line : [];
  const status = !finished
    ? yourTurn
      ? "Your move"
      : "Thinking…"
    : outcome.status === "draw"
      ? "A draw"
      : outcome.winner === "X"
        ? "You win"
        : "You lose";

  return (
    <div className="game-panel">
      <div className="game-toolbar">
        <div className="game-difficulty" role="group" aria-label="Difficulty">
          {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((level) => (
            <button
              key={level}
              className={difficulty === level ? "active" : ""}
              onClick={() => {
                setDifficulty(level);
                reset();
              }}
            >
              {DIFFICULTY_LABELS[level]}
            </button>
          ))}
        </div>
        <div className="game-actions">
          <button onClick={() => setShowRules(true)} title="How to play">
            <BookOpen size={14} /> How to play
          </button>
          <button className="game-reset" onClick={reset}>
            <RotateCcw size={14} /> New round
          </button>
        </div>
      </div>

      <p className={`game-status${finished ? " finished" : ""}`} role="status">
        {status}
      </p>

      <div className="ttt-board" role="grid" aria-label="Tic-tac-toe board">
        {board.map((cell, index) => (
          <button
            key={index}
            className={`ttt-cell${cell ? ` filled ${cell.toLowerCase()}` : ""}${
              winningLine.includes(index) ? " winning" : ""
            }`}
            onClick={() => play(index)}
            disabled={Boolean(cell) || finished || !yourTurn}
            aria-label={`Square ${index + 1}${cell ? `, ${cell}` : ", empty"}`}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className="game-score">
        <span><strong>{score.wins}</strong>Won</span>
        <span><strong>{score.draws}</strong>Drawn</span>
        <span><strong>{score.losses}</strong>Lost</span>
      </div>

      {difficulty === "hard" && (
        <p className="game-footnote">
          Unbeatable plays perfectly. Tic-tac-toe is a solved game, so the best
          you can force is a draw — that is the game, not a bug.
        </p>
      )}

      {showRules && <GameRulesModal id="tictactoe" onClose={() => setShowRules(false)} />}
    </div>
  );
}
