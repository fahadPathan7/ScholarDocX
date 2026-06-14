import { useEffect, useId, useState } from "react";
import { Sparkles, X, Wand2 } from "lucide-react";
import "./QueryReviewDialog.css"; // Reuse similar styles

interface CustomPromptDialogProps {
  isRefining: boolean;
  onCancel: () => void;
  onConfirm: (prompt: string) => void;
}

export function CustomPromptDialog({
  isRefining,
  onCancel,
  onConfirm,
}: CustomPromptDialogProps) {
  const [prompt, setPrompt] = useState("");
  const promptId = useId();
  const normalizedPrompt = prompt.trim();
  const canSubmit = normalizedPrompt.length >= 3 && !isRefining;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRefining) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRefining, onCancel]);

  return (
    <div className="query-review-backdrop" role="presentation" onMouseDown={isRefining ? undefined : onCancel}>
      <form
        className="query-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-prompt-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onConfirm(normalizedPrompt);
        }}
      >
        <header className="query-review-header">
          <div className="query-review-heading">
            <span className="query-review-icon" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <div>
              <span className="query-review-kicker">Custom AI Search</span>
              <h2 id="custom-prompt-title">What are you looking for?</h2>
            </div>
          </div>
          <button
            type="button"
            className="query-review-close"
            onClick={onCancel}
            disabled={isRefining}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </header>

        <div className="query-review-body">
          <p style={{ color: "var(--color-text-dim)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "1rem" }}>
            Describe the scholarship you want to find. Our AI will transform your description into an optimized web search query.
          </p>

          <div className="query-review-tips" aria-label="Prompt tips">
            <span>Example: "Full ride scholarships for undergraduate computer science in the USA for international students"</span>
          </div>

          <div className="query-review-field" style={{ marginTop: "1.5rem" }}>
            <div className="query-review-label-row">
              <label htmlFor={promptId}>Your prompt</label>
            </div>
            <textarea
              id={promptId}
              value={prompt}
              placeholder="E.g., Engineering scholarships in Germany..."
              rows={4}
              autoFocus
              disabled={isRefining}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
        </div>

        <footer className="query-review-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isRefining}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!canSubmit}>
            <Wand2 size={16} aria-hidden="true" />
            {isRefining ? "Refining..." : "Refine with AI"}
          </button>
        </footer>
      </form>
    </div>
  );
}
