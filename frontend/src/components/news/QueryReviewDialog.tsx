import { useEffect, useId, useState } from "react";
import { CheckCircle2, CircleAlert, FlaskConical, RotateCcw, Search, Sparkles, X } from "lucide-react";
import "./QueryReviewDialog.css";

interface QueryReviewDialogProps {
  initialQuery: string;
  maxLength: number;
  generationSource: "openrouter" | "fallback";
  generationModel: string;
  generationNotice: string;
  isSearching: boolean;
  onCancel: () => void;
  onConfirm: (approvedQuery: string) => void;
}

export function QueryReviewDialog({
  initialQuery,
  maxLength,
  generationSource,
  generationModel,
  generationNotice,
  isSearching,
  onCancel,
  onConfirm,
}: QueryReviewDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isApproved, setIsApproved] = useState(false);
  const queryId = useId();
  const approvalId = useId();
  const normalizedQuery = query.trim();
  const wasEdited = normalizedQuery !== initialQuery.trim();
  const canSubmit = isApproved
    && normalizedQuery.length >= 3
    && normalizedQuery.length <= maxLength
    && !isSearching;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSearching) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearching, onCancel]);

  const resetQuery = () => {
    setQuery(initialQuery);
    setIsApproved(false);
  };

  return (
    <div className="query-review-backdrop" role="presentation" onMouseDown={isSearching ? undefined : onCancel}>
      <form
        className="query-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="query-review-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onConfirm(normalizedQuery);
        }}
      >
        <header className="query-review-header">
          <div className="query-review-heading">
            <span className="query-review-icon" aria-hidden="true">
              <FlaskConical size={20} />
            </span>
            <div>
              <span className="query-review-kicker">Beta query review</span>
              <h2 id="query-review-title">Check what Scholarship Hunt will search</h2>
            </div>
          </div>
          <button
            type="button"
            className="query-review-close"
            onClick={onCancel}
            disabled={isSearching}
            aria-label="Close query review"
          >
            <X size={19} />
          </button>
        </header>

        <div className="query-review-body">
          <div className={`query-generation-status ${generationSource}`}>
            <Sparkles size={16} aria-hidden="true" />
            <div>
              <strong>
                {generationSource === "openrouter"
                  ? "AI query ready"
                  : "Safe query ready"}
              </strong>
              <span>
                {generationSource === "openrouter"
                  ? `Generated from your choices${generationModel ? ` via ${generationModel}` : ""}.`
                  : `${generationNotice || "OpenRouter was unavailable."} Using ScholarDock's local template.`}
              </span>
            </div>
          </div>
          <div className="query-review-note">
            <CheckCircle2 size={17} aria-hidden="true" />
            <p>
              This Search click already used one Scholarship Hunt credit to
              prepare the run. You can still refine or cancel this query before
              Tavily is called, and all returned pages for the final confirmed
              query will be shown.
            </p>
          </div>
          <div className="query-review-tips" aria-label="Query tuning tips">
            <span>Try adding `official` for university or scholarship portals.</span>
            <span>Use `deadline`, `application`, or `eligibility` to tighten intent.</span>
            <span>Keep destination, degree, and named scholarship phrases explicit.</span>
          </div>

          <div className="query-review-field">
            <div className="query-review-label-row">
              <label htmlFor={queryId}>Search query</label>
              <span className={query.length > maxLength ? "query-count invalid" : "query-count"}>
                {query.length} / {maxLength}
              </span>
            </div>
            <textarea
              id={queryId}
              value={query}
              maxLength={maxLength}
              rows={6}
              autoFocus
              disabled={isSearching}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsApproved(false);
              }}
            />
            <div className="query-review-field-footer">
              <span>
              {wasEdited
                  ? "User-refined query"
                  : generationSource === "openrouter"
                    ? "AI-generated from your filters"
                    : "Generated from the safe local template"}
              </span>
              {wasEdited && (
                <button type="button" onClick={resetQuery} disabled={isSearching}>
                  <RotateCcw size={14} aria-hidden="true" />
                  Restore generated query
                </button>
              )}
            </div>
          </div>

          <label className="query-approval-check" htmlFor={approvalId}>
            <input
              id={approvalId}
              type="checkbox"
              checked={isApproved}
              disabled={isSearching || normalizedQuery.length < 3}
              onChange={(event) => setIsApproved(event.target.checked)}
            />
            <span>
              I reviewed this query and want to search the web with it.
            </span>
          </label>

          <p className="query-review-privacy">
            The generated and approved versions are stored only in your local
            ScholarDock database to improve this beta feature later.
          </p>
          <p className="query-review-warning">
            <CircleAlert size={15} aria-hidden="true" />
            Closing this dialog stops the Tavily call, but the credit from this
            Search click stays consumed.
          </p>
        </div>

        <footer className="query-review-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSearching}>
            Back to filters
          </button>
          <button type="submit" className="button-primary" disabled={!canSubmit}>
            <Search size={16} aria-hidden="true" />
            {isSearching ? "Searching..." : "Confirm & search"}
          </button>
        </footer>
      </form>
    </div>
  );
}
