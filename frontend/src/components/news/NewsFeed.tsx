import React from "react";
import { NewsArticle } from "../../lib/newsApi";
import { NewsCard } from "./NewsCard";
import { Loader2 } from "lucide-react";

interface NewsFeedProps {
  articles: NewsArticle[];
  bookmarks: any[];
  isLoading: boolean;
  isRefreshing?: boolean;
  refreshMessage?: string;
  hasMore: boolean;
  hasFilters?: boolean;
  onLoadMore: () => void;
  onToggleBookmark: (article: NewsArticle) => void;
}

export function NewsFeed({
  articles,
  bookmarks,
  isLoading,
  isRefreshing = false,
  refreshMessage,
  hasMore,
  hasFilters = true,
  onLoadMore,
  onToggleBookmark,
}: NewsFeedProps) {
  const isArticleBookmarked = (articleId: string) => {
    return bookmarks.some(b => b.article_id === articleId);
  };

  if (articles.length === 0 && !isLoading) {
    if (!hasFilters) {
      return (
        <div className="news-empty-state">
          <p>Select at least one query input.</p>
          <p className="news-empty-subtext">ScholarDock will turn your choices into an editable scholarship search query before using a credit.</p>
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
            const isBookmarked = isArticleBookmarked(article.article_id);
            return (
              <NewsCard
                key={article.article_id || index}
                article={article}
                isBookmarked={isBookmarked}
                onToggleBookmark={onToggleBookmark}
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
