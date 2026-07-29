import { BookOpen } from "lucide-react";
import { Modal } from "../Modal";
import { GAME_RULES, type GameId } from "./gameRules";

/**
 * In-game rules for a brain game. Shown from a "How to play" button in the
 * game's toolbar, so the rules stay reachable while a round is in progress
 * (the start screen only shows them before play begins).
 *
 * Uses the sanctioned `<Modal scope="main">`: it portals into `.main-content`,
 * blurring the work surface while keeping the TopBar and Sidebar crisp. No
 * bespoke backdrop div here.
 */
export function GameRulesModal({ id, onClose }: { id: GameId; onClose: () => void }) {
  const rules = GAME_RULES[id];
  if (!rules) return null;

  return (
    <Modal onClose={onClose}>
      <div className="modal-panel game-rules-panel" onClick={(e) => e.stopPropagation()}>
        <header className="game-rules-head">
          <span className="game-rules-mark" aria-hidden="true">
            <BookOpen size={18} />
          </span>
          <div>
            <span className="game-rules-eyebrow">How to play</span>
            <h3>{rules.title}</h3>
          </div>
        </header>

        <div className="game-rules-body">
          <p className="game-rules-goal">
            <strong>Goal.</strong> {rules.goal}
          </p>

          <ol className="game-rules-steps">
            {rules.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>

          <p className="game-rules-tip">
            <strong>Tip.</strong> {rules.tip}
          </p>
        </div>

        <footer className="game-rules-foot">
          <button className="game-rules-close" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </Modal>
  );
}
