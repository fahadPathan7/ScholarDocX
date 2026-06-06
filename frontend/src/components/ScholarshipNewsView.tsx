import React, { useState, useEffect, useCallback } from "react";
import { Filter, Bookmark } from "lucide-react";
import { FilterPanel } from "./news/FilterPanel";
import { NewsFeed } from "./news/NewsFeed";
import { searchNews, getBookmarkedNews, addBookmark, removeBookmark, NewsArticle, NewsSearchParams } from "../lib/newsApi";
import { useAuth } from "../contexts/AuthContext";
import { useUsage } from "../contexts/UsageContext";
import "./news/news.css";

interface ScholarshipNewsViewProps {
  onToast: (msg: string) => void;
}

export function ScholarshipNewsView({ onToast }: ScholarshipNewsViewProps) {
  const { user } = useAuth();
  const { usageData } = useUsage();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = React.useRef(false);
  const [isFilterOpen, setIsFilterOpen] = useState(window.innerWidth > 768);
  const [filters, setFilters] = useState<NewsSearchParams>({});
  const [page, setPage] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const hasAnyFilter = (params: NewsSearchParams) => {
    return Object.values(params).some(val => Array.isArray(val) ? val.length > 0 : !!val);
  };

  const hasFiltersSelected = hasAnyFilter(filters);

  const fetchBookmarks = async () => {
    try {
      const data = await getBookmarkedNews();
      setBookmarks(data);
    } catch (error) {
      console.error("Failed to fetch bookmarks:", error);
    }
  };

  const fetchNews = async (currentFilters: NewsSearchParams, pageToken?: string, append = false) => {
    if (showBookmarksOnly) return; // Don't fetch from API when viewing bookmarks
    if (!hasAnyFilter(currentFilters)) {
      setArticles([]);
      setHasMore(false);
      return;
    }
    
    if (isLoadingRef.current) return;
    
    setIsLoading(true);
    isLoadingRef.current = true;
    try {
      const response = await searchNews({ ...currentFilters, page: pageToken });
      
      if (append) {
        setArticles(prev => [...prev, ...response.results]);
      } else {
        setArticles(response.results || []);
      }
      
      setPage(response.nextPage);
      setHasMore(!!response.nextPage && (response.results?.length > 0));
    } catch (error: any) {
      console.error("News search error:", error);
      if (error.message?.includes("429") || error.message?.includes("Limit exceeded")) {
        onToast("Rate limit exceeded. Upgrade your plan for more searches.");
      } else {
        onToast("Failed to fetch scholarship news.");
      }
      if (!append) setArticles([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // Initial load
  useEffect(() => {
    fetchBookmarks();
    fetchNews(filters);
    
    const handleResize = () => {
      if (window.innerWidth > 768 && !isFilterOpen) setIsFilterOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleApplyFilters = (newFilters: any) => {
    setFilters(newFilters);
    setShowBookmarksOnly(false); // Switch back to search results if applying filters
    fetchNews(newFilters, undefined, false);
  };

  const handleLoadMore = useCallback(() => {
    if (!isLoadingRef.current && hasMore && page && !showBookmarksOnly) {
      fetchNews(filters, page, true);
    }
  }, [hasMore, page, filters, showBookmarksOnly]);

  const handleToggleBookmark = async (article: NewsArticle) => {
    const isBookmarked = bookmarks.some(b => b.article_id === article.article_id);
    try {
      if (isBookmarked) {
        await removeBookmark(article.article_id);
        onToast("Bookmark removed");
        if (showBookmarksOnly) {
           setBookmarks(prev => prev.filter(b => b.article_id !== article.article_id));
        } else {
           fetchBookmarks();
        }
      } else {
        await addBookmark(article);
        onToast("Article bookmarked");
        fetchBookmarks();
      }
    } catch (error) {
      onToast("Failed to update bookmark");
    }
  };

  const toggleBookmarksView = () => {
    setShowBookmarksOnly(!showBookmarksOnly);
    if (window.innerWidth <= 768 && isFilterOpen) {
       setIsFilterOpen(false);
    }
  };

  // When switching back from bookmarks view to feed, ensure we have data
  useEffect(() => {
    if (!showBookmarksOnly && articles.length === 0 && !isLoading) {
      fetchNews(filters);
    }
  }, [showBookmarksOnly]);

  const displayedArticles = showBookmarksOnly 
    ? bookmarks.map(b => ({
        article_id: b.article_id,
        title: b.title,
        link: b.link,
        source_name: b.source_name,
        pubDate: b.pub_date,
        image_url: b.image_url,
        description: b.description,
        country: b.country ? [b.country] : undefined
      }))
    : articles;

  const dailyUsage = usageData?.usage?.["news_searches_per_day"] ?? 0;
  const dailyLimit = usageData?.limits?.["news_searches_per_day"] ?? 0;
  const monthlyUsage = usageData?.usage?.["news_searches_per_month"] ?? 0;
  const monthlyLimit = usageData?.limits?.["news_searches_per_month"] ?? 0;

  return (
    <div className="scholarship-news-view">
      <div className="news-toolbar">
        <h1>{showBookmarksOnly ? "Saved Scholarships" : "Scholarship News"}</h1>
        <div className="news-toolbar-actions" style={{ alignItems: 'center' }}>
          {!showBookmarksOnly && (
            <div style={{ display: 'flex', gap: '16px', marginRight: '8px', fontSize: '0.8rem', color: '#65756d', fontWeight: 600, background: 'rgba(47, 109, 122, 0.05)', padding: '6px 12px', borderRadius: '8px' }}>
              <div>Daily: {dailyUsage} / {dailyLimit === -1 ? '∞' : dailyLimit}</div>
              <div style={{ width: '1px', background: 'rgba(47, 109, 122, 0.2)' }} />
              <div>Monthly: {monthlyUsage} / {monthlyLimit === -1 ? '∞' : monthlyLimit}</div>
            </div>
          )}
          <button 
            className={`button-secondary ${showBookmarksOnly ? 'active' : ''}`} 
            onClick={toggleBookmarksView}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Bookmark size={18} className={showBookmarksOnly ? "fill-current" : ""} />
            <span className="hidden sm:inline">{showBookmarksOnly ? "Feed" : "Saved"}</span>
          </button>
          {!showBookmarksOnly && (
            <button 
              className={`button-secondary ${isFilterOpen ? 'active' : ''}`} 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Filter size={18} className={isFilterOpen ? "fill-current" : ""} />
              <span className="hidden sm:inline">Filters</span>
            </button>
          )}
        </div>
      </div>
      
      <div className="news-layout">
        {!showBookmarksOnly && (
          <FilterPanel 
            isOpen={isFilterOpen} 
            onClose={() => setIsFilterOpen(false)} 
            onApplyFilters={handleApplyFilters} 
          />
        )}
        
        <main className="news-main">
          <NewsFeed 
            articles={displayedArticles} 
            bookmarks={bookmarks}
            isLoading={isLoading} 
            hasMore={!showBookmarksOnly && hasMore} 
            hasFilters={showBookmarksOnly || hasFiltersSelected}
            onLoadMore={handleLoadMore} 
            onToggleBookmark={handleToggleBookmark}
          />
        </main>
      </div>
    </div>
  );
}
