import React from "react";
import { NewsArticle } from "../../lib/newsApi";
import { ScholarshipOpportunity } from "../../lib/scholarshipOpportunitiesApi";
import { HuntProfile } from "../../lib/huntProfile";
import { NewsCard } from "./NewsCard";
import { Loader2 } from "lucide-react";

interface NewsFeedProps {
  articles: NewsArticle[];
  isLoading: boolean;
  isRefreshing?: boolean;
  refreshMessage?: string;
  hasMore: boolean;
  hasFilters?: boolean;
  onLoadMore: () => void;
  onAnalyze?: (article: NewsArticle) => void;
  analyzingUrl?: string | null;
  opportunitiesByUrl?: Record<string, ScholarshipOpportunity>;
  huntProfile?: HuntProfile | null;
  newArticleIds?: Set<string>;
}

export function NewsFeed({
  articles,
  isLoading,
  isRefreshing = false,
  refreshMessage,
  hasMore,
  hasFilters = true,
  onLoadMore,
  onAnalyze,
  analyzingUrl,
  opportunitiesByUrl,
  huntProfile,
  newArticleIds,
}: NewsFeedProps) {

  if (articles.length === 0 && !isLoading) {
    if (!hasFilters) {
      return (
        <div className="news-empty-state">
          <p>Select at least one query input, or start a Custom AI Search.</p>
          <p className="news-empty-subtext">ScholarDocX will translate your selections or custom prompt into an editable query before performing the search.</p>
        </div>
      );
    }
    
    return (
      <div className="news-empty-state">
        <p>No pages returned for this search query.</p>
        <p className="news-empty-subtext">Try editing the query with broader wording, fewer exact terms, or a different destination.</p>
      </div>
    );
  }

  return (
    <div className="news-feed">
      <div className={`news-grid-shell ${isRefreshing && articles.length > 0 ? "refreshing" : ""}`}>
        {isRefreshing && articles.length > 0 && (
          <div className="news-refresh-banner" role="status" aria-live="polite">
            <Loader2 className="icon-spin" size={18} />
            <span>{refreshMessage || "Refreshing scholarship results..."}</span>
          </div>
        )}
        <div className={`news-grid ${isRefreshing && articles.length > 0 ? "news-grid--refreshing" : ""}`}>
          {articles.map((article, index) => {
            return (
              <NewsCard
                key={article.article_id || index}
                article={article}
                onAnalyze={onAnalyze}
                isAnalyzing={analyzingUrl === article.link}
                analyzedOpportunity={opportunitiesByUrl?.[article.link]}
                huntProfile={huntProfile}
                isNew={!!newArticleIds?.has(article.article_id)}
              />
            );
          })}
        </div>
      </div>
      
      {isLoading && (
        <div className="news-loading">
          <Loader2 className="icon-spin" size={24} />
          <span>Finding current scholarship opportunities...</span>
        </div>
      )}
      {!isLoading && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button 
            className="load-more-btn" 
            onClick={onLoadMore}
          >
            <span>Find More Opportunities</span>
            <span className="credit-badge">1 Credit</span>
          </button>
        </div>
      )}
      <div style={{ minHeight: '100px', display: 'block', width: '100%' }} />
    </div>
  );
}
