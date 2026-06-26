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
  onConfirm: (approvedQuery: string, saveAsName?: string) => void;
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");
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
          if (canSubmit) {
            onConfirm(
              normalizedQuery, 
              isSaving ? (saveQueryName.trim() || "Saved Query") : undefined
            );
          }
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
                  : `${generationNotice || "OpenRouter was unavailable."} Using ScholarDocX's local template.`}
              </span>
            </div>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            <div className="query-review-save-query">
              <label 
                className="query-approval-check" 
                htmlFor={`${approvalId}-save`} 
                style={{ 
                  margin: 0, 
                  ...(isSaving ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' } : {}) 
                }}
              >
                <input
                  id={`${approvalId}-save`}
                  type="checkbox"
                  checked={isSaving}
                  disabled={isSearching || normalizedQuery.length < 3}
                  onChange={(event) => setIsSaving(event.target.checked)}
                />
                <span style={{ fontWeight: 600, color: "#1f4f5a" }}>
                  Save this query for later use
                </span>
              </label>
              {isSaving && (
                <div style={{ 
                  padding: "0 12px 14px 12px", 
                  backgroundColor: "#edf8f3", 
                  border: "1px solid rgba(56, 163, 127, 0.28)", 
                  borderTop: "none", 
                  borderBottomLeftRadius: "12px", 
                  borderBottomRightRadius: "12px" 
                }}>
                  <input 
                    type="text" 
                    placeholder="Query name (e.g. Master's in USA)" 
                    value={saveQueryName}
                    onChange={(e) => setSaveQueryName(e.target.value)}
                    disabled={isSearching}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid rgba(47, 109, 122, 0.2)",
                      fontSize: "0.95rem",
                      color: "#1f4f5a",
                      marginTop: "4px"
                    }}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <label className="query-approval-check" htmlFor={approvalId} style={{ margin: 0 }}>
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
          </div>
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
