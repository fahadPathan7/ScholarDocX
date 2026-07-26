import React, { useEffect, useMemo, useState } from "react";
import { CalendarSearch, ExternalLink, Loader2 } from "lucide-react";
import {
  CatalogEntry,
  ScholarshipOpportunity,
  analyzeScholarshipOpportunity,
  checkScholarshipCycle,
  getScholarshipCatalog,
} from "../../lib/scholarshipOpportunitiesApi";
import { NewsArticle } from "../../lib/newsApi";
import { HuntProfile } from "../../lib/huntProfile";
import { OpportunityCard } from "./OpportunityCard";

interface ScholarshipCatalogProps {
  onToast: (msg: string) => void;
  onAddToTracker: (opportunity: ScholarshipOpportunity) => void;
  onRefreshUsage: () => void;
  huntProfile?: HuntProfile | null;
}

export function ScholarshipCatalog({ onToast, onAddToTracker, onRefreshUsage, huntProfile }: ScholarshipCatalogProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);
  const [cycleResults, setCycleResults] = useState<Record<string, NewsArticle[]>>({});
  const [opportunitiesByUrl, setOpportunitiesByUrl] = useState<Record<string, ScholarshipOpportunity>>({});

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await getScholarshipCatalog();
      setEntries(data);
    } catch (error) {
      onToast("Failed to load the scholarship catalog.");
    } finally {
      setIsLoading(false);
    }
  };

  const levels = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.levels.forEach((lv) => set.add(lv)));
    return Array.from(set).sort();
  }, [entries]);

  const visibleEntries = levelFilter
    ? entries.filter((e) => e.levels.includes(levelFilter))
    : entries;

  const handleCheckCycle = async (entry: CatalogEntry) => {
    setCheckingId(entry.id);
    try {
      const response = await checkScholarshipCycle(entry.id);
      setCycleResults((prev) => ({ ...prev, [entry.id]: response.results || [] }));
      await onRefreshUsage();
    } catch (error) {
      onToast("Failed to check the current cycle.");
    } finally {
      setCheckingId(null);
    }
  };

  const handleAnalyze = async (article: NewsArticle) => {
    setAnalyzingUrl(article.link);
    try {
      const opportunity = await analyzeScholarshipOpportunity({
        source_url: article.link,
        source_title: article.title,
        source_snippet: article.description || "",
      });
      setOpportunitiesByUrl((prev) => ({ ...prev, [article.link]: opportunity }));
      onToast("Analyzed. Structured details are ready below.");
    } catch (error) {
      onToast("Could not analyze this page.");
    } finally {
      setAnalyzingUrl(null);
    }
  };

  if (isLoading) {
    return (
      <div className="news-loading">
        <Loader2 className="icon-spin" size={24} />
        <span>Loading the scholarship catalog...</span>
      </div>
    );
  }

  return (
    <div className="scholarship-catalog">
      <div className="scholarship-catalog-toolbar">
        <p className="scholarship-catalog-hint">
          {entries.length} curated scholarships. Browsing is free — "Check current cycle" uses one
          Scholarship Hunt credit.
        </p>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">All levels</option>
          {levels.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>
      </div>

      <div className="scholarship-catalog-grid">
        {visibleEntries.map((entry) => (
          <div key={entry.id} className="scholarship-catalog-card">
            <div className="scholarship-catalog-card-header">
              <h4>{entry.canonical_name}</h4>
              {entry.in_library && <span className="opportunity-in-library-badge">In library</span>}
            </div>
            <p className="scholarship-catalog-sponsor">{entry.sponsor}</p>
            <p className="scholarship-catalog-blurb">{entry.blurb}</p>
            <div className="opportunity-badges">
              <span className={`opportunity-funding-badge coverage-${entry.funding.coverage}`}>
                {entry.funding.coverage === "full" ? "Full funding" : "Partial funding"}
              </span>
              {entry.levels.map((lv) => (
                <span key={lv} className="scholarship-catalog-level-chip">
                  {lv}
                </span>
              ))}
            </div>
            {entry.cycle_months.length > 0 && (
              <p className="scholarship-catalog-cycle">
                Typical cycle: {entry.cycle_months.join(", ")} — confirm the current deadline below.
              </p>
            )}
            <div className="scholarship-catalog-card-actions">
              <a
                href={entry.portal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="catalog-btn-outline"
              >
                Official page <ExternalLink size={14} />
              </a>
              <button
                type="button"
                className="catalog-btn-solid"
                onClick={() => handleCheckCycle(entry)}
                disabled={checkingId === entry.id}
              >
                {checkingId === entry.id ? (
                  <Loader2 size={14} className="icon-spin" />
                ) : (
                  <CalendarSearch size={14} />
                )}
                Check cycle
              </button>
            </div>

            {cycleResults[entry.id] && (
              <div className="scholarship-catalog-cycle-results">
                {cycleResults[entry.id].length === 0 ? (
                  <p className="opportunity-empty-note">No current pages found for this cycle.</p>
                ) : (
                  cycleResults[entry.id].map((article) => (
                    <div key={article.article_id} className="scholarship-catalog-cycle-result">
                      <a href={article.link} target="_blank" rel="noopener noreferrer">
                        {article.title}
                      </a>
                      {opportunitiesByUrl[article.link] ? (
                        <OpportunityCard
                          opportunity={opportunitiesByUrl[article.link]}
                          onAddToTracker={onAddToTracker}
                          huntProfile={huntProfile}
                        />
                      ) : (
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => handleAnalyze(article)}
                          disabled={analyzingUrl === article.link}
                        >
                          {analyzingUrl === article.link ? "Analyzing..." : "Analyze"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
