import React, { useEffect, useState } from "react";
import { X, Bookmark, Eye, EyeOff } from "lucide-react";
import "./QueryReviewDialog.css";

interface SavedQueriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRunSavedQuery?: (
    queryString: string,
    filtersJson: string,
    savedQuery?: { id: number; seen_article_ids_json?: string },
  ) => void;
  isPreparingQuery?: boolean;
}

export function SavedQueriesDialog({
  isOpen,
  onClose,
  onRunSavedQuery,
  isPreparingQuery,
}: SavedQueriesDialogProps) {
  const [savedQueries, setSavedQueries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedQueryId, setExpandedQueryId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchSavedQueries = async () => {
        setIsLoading(true);
        try {
          const { getSavedQueries } = await import("../../lib/newsApi");
          const queries = await getSavedQueries();
          setSavedQueries(queries.reverse());
        } catch (e) {
          console.error("Failed to load saved queries", e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchSavedQueries();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleDeleteSavedQuery = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const { deleteSavedQuery } = await import("../../lib/newsApi");
      await deleteSavedQuery(id);
      setSavedQueries(prev => prev.filter(q => q.id !== id));
    } catch (e) {
      console.error("Failed to delete saved query", e);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + " at " + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="query-review-backdrop" role="presentation" onMouseDown={onClose} style={{ zIndex: 100 }}>
      <div
        className="query-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-queries-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "min(500px, 100%)" }}
      >
        <header className="query-review-header">
          <div className="query-review-heading">
            <span className="query-review-icon" aria-hidden="true" style={{ background: "#f0f4f8", color: "#2f6d7a", borderColor: "rgba(47, 109, 122, 0.2)" }}>
              <Bookmark size={20} />
            </span>
            <div>
              <h2 id="saved-queries-title">Saved Queries</h2>
              <span className="query-review-kicker" style={{ color: "#61716b", marginTop: "4px", textTransform: "none", letterSpacing: "normal" }}>Run your previously saved searches</span>
            </div>
          </div>
          <button
            type="button"
            className="query-review-close"
            onClick={onClose}
            aria-label="Close saved queries"
          >
            <X size={19} />
          </button>
        </header>

        <div className="query-review-body" style={{ maxHeight: "400px", overflowY: "auto" }}>
          {isLoading ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#61716b" }}>Loading saved queries...</div>
          ) : savedQueries.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#61716b" }}>No saved queries found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {savedQueries.map(sq => (
                <div 
                  key={sq.id} 
                  style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    padding: "12px 16px",
                    backgroundColor: "#f4f7f6",
                    border: "1px solid rgba(47, 109, 122, 0.1)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "background-color 0.2s"
                  }}
                  onClick={() => {
                    if (onRunSavedQuery && !isPreparingQuery) {
                      onRunSavedQuery(sq.query_string, sq.filters_json, {
                        id: sq.id,
                        seen_article_ids_json: sq.seen_article_ids_json,
                      });
                      onClose();
                    }
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#edf2f0"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f4f7f6"}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '4px', paddingRight: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#1f4f5a", wordBreak: "break-word" }}>
                        {sq.name}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "#61716b", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {formatDate(sq.created_at || sq.updated_at || sq.last_used_at)}
                      </span>
                    </div>
                    {expandedQueryId === sq.id && (
                      <div style={{ fontSize: "0.8rem", color: "#4a5d56", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", wordBreak: "break-word", lineHeight: 1.4, marginTop: "4px" }}>
                        {sq.query_string}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedQueryId(expandedQueryId === sq.id ? null : sq.id);
                      }}
                      style={{ background: "transparent", border: "none", color: expandedQueryId === sq.id ? "#1f4f5a" : "#a0b0a8", cursor: "pointer", padding: "4px" }}
                      aria-label={expandedQueryId === sq.id ? "Hide query" : "View query"}
                      title={expandedQueryId === sq.id ? "Hide query" : "View query"}
                    >
                      {expandedQueryId === sq.id ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button 
                      onClick={(e) => handleDeleteSavedQuery(e, sq.id)}
                      style={{ background: "transparent", border: "none", color: "#a0b0a8", cursor: "pointer", padding: "4px" }}
                      aria-label="Delete saved query"
                      title="Delete saved query"
                      disabled={isPreparingQuery}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
