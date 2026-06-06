import React, { useEffect, useRef, useCallback } from "react";
import { NewsArticle } from "../../lib/newsApi";
import { NewsCard } from "./NewsCard";
import { Loader2 } from "lucide-react";

interface NewsFeedProps {
  articles: NewsArticle[];
  bookmarks: any[];
  isLoading: boolean;
  hasMore: boolean;
  hasFilters?: boolean;
  onLoadMore: () => void;
  onToggleBookmark: (article: NewsArticle) => void;
}

export function NewsFeed({ articles, bookmarks, isLoading, hasMore, hasFilters = true, onLoadMore, onToggleBookmark }: NewsFeedProps) {
  // Removed IntersectionObserver to prevent automatic token consumption

  const isArticleBookmarked = (articleId: string) => {
    return bookmarks.some(b => b.article_id === articleId);
  };

  if (articles.length === 0 && !isLoading) {
    if (!hasFilters) {
      return (
        <div className="news-empty-state">
          <p>Please select at least one filter.</p>
          <p className="news-empty-subtext">Choose your preferences and click "Search" to view scholarship news. Each search consumes 1 credit.</p>
        </div>
      );
    }
    
    return (
      <div className="news-empty-state">
        <p>No scholarship news found matching your criteria.</p>
        <p className="news-empty-subtext">Try adjusting your filters to see more results.</p>
      </div>
    );
  }

  return (
    <div className="news-feed">
      <div className="news-grid">
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
      
      {isLoading && (
        <div className="news-loading">
          <Loader2 className="icon-spin" size={24} />
          <span>Loading more news...</span>
        </div>
      )}
      {!isLoading && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button 
            className="load-more-btn" 
            onClick={onLoadMore}
          >
            <span>Load More News</span>
            <span className="credit-badge">1 Credit</span>
          </button>
        </div>
      )}
      <div style={{ minHeight: '100px', display: 'block', width: '100%' }} />
    </div>
  );
}
