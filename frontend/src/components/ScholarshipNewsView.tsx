import React, { useState, useEffect } from "react";
import { Filter, Bookmark } from "lucide-react";
import { FilterPanel } from "./news/FilterPanel";
import { NewsFeed } from "./news/NewsFeed";
import { QueryReviewDialog } from "./news/QueryReviewDialog";
import {
  searchNews,
  previewNewsQuery,
  getBookmarkedNews,
  addBookmark,
  removeBookmark,
  NewsArticle,
  NewsSearchParams,
} from "../lib/newsApi";
import { useUsage } from "../contexts/UsageContext";
import "./news/news.css";

interface ScholarshipNewsViewProps {
  onToast: (msg: string) => void;
}

type SearchFlowState = "idle" | "preparing" | "review" | "searching";

export function ScholarshipNewsView({ onToast }: ScholarshipNewsViewProps) {
  const { usageData, refreshUsage } = useUsage();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = React.useRef(false);
  const [isFilterOpen, setIsFilterOpen] = useState(window.innerWidth > 768);
  const [filters, setFilters] = useState<NewsSearchParams>({});
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [isPreparingQuery, setIsPreparingQuery] = useState(false);
  const [searchFlow, setSearchFlow] = useState<SearchFlowState>("idle");
  const [pendingFilters, setPendingFilters] = useState<NewsSearchParams | null>(null);
  const [latestSearch, setLatestSearch] = useState<{
    approvedQuery: string;
    resultCount: number;
    searchedAt: string;
  } | null>(null);
  const [queryPreview, setQueryPreview] = useState<{
    previewFeedbackId: number;
    initialQuery: string;
    maxLength: number;
    generationSource: "openrouter" | "fallback";
    generationModel: string;
    generationNotice: string;
  } | null>(null);

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

  const fetchNews = async (
    currentFilters: NewsSearchParams,
    previewFeedbackId: number,
    approvedQuery: string,
    append = false,
  ) => {
    if (showBookmarksOnly) return; // Don't fetch from API when viewing bookmarks
    if (!hasAnyFilter(currentFilters)) {
      setArticles([]);
      return;
    }
    
    if (isLoadingRef.current) return;
    
    setIsLoading(true);
    isLoadingRef.current = true;
    try {
      const response = await searchNews(currentFilters, previewFeedbackId, approvedQuery);
      
      if (append) {
        setArticles(prev => [...prev, ...response.results]);
      } else {
        setArticles(response.results || []);
        setLatestSearch({
          approvedQuery,
          resultCount: response.results?.length || 0,
          searchedAt: new Date().toISOString(),
        });
      }
      
      await refreshUsage();
    } catch (error: any) {
      console.error("News search error:", error);
      if (error.message?.includes("429") || error.message?.includes("Limit exceeded")) {
        onToast("Rate limit exceeded. Upgrade your plan for more searches.");
      } else {
        onToast("Failed to find scholarship opportunities.");
      }
      if (!append) setArticles([]);
    } finally {
      setIsLoading(false);
      setSearchFlow("idle");
      isLoadingRef.current = false;
    }
  };

  // Initial load
  useEffect(() => {
    fetchBookmarks();
    const handleResize = () => {
      if (window.innerWidth > 768 && !isFilterOpen) setIsFilterOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleApplyFilters = async (newFilters: NewsSearchParams) => {
    if (!hasAnyFilter(newFilters)) {
      setFilters({});
      setPendingFilters(null);
      setQueryPreview(null);
      setArticles([]);
      setLatestSearch(null);
      setSearchFlow("idle");
      return;
    }

    setSearchFlow("preparing");
    setIsPreparingQuery(true);
    try {
      const preview = await previewNewsQuery(newFilters);
      setPendingFilters(newFilters);
      setQueryPreview({
        previewFeedbackId: preview.preview_feedback_id,
        initialQuery: preview.initial_query,
        maxLength: preview.max_length,
        generationSource: preview.generation_source,
        generationModel: preview.generation_model,
        generationNotice: preview.generation_notice,
      });
      setSearchFlow("review");
      await refreshUsage();
    } catch (error) {
      console.error("Failed to prepare Scholarship Hunt query:", error);
      if ((error as Error)?.message?.includes("429") || (error as Error)?.message?.includes("Limit exceeded")) {
        onToast("Rate limit exceeded. Upgrade your plan for more searches.");
      } else {
        onToast("Could not prepare the scholarship search query.");
      }
      setSearchFlow("idle");
    } finally {
      setIsPreparingQuery(false);
    }
  };

  const handleConfirmQuery = async (approvedQuery: string) => {
    if (!pendingFilters || !queryPreview) return;
    const confirmedFilters = pendingFilters;
    const previewFeedbackId = queryPreview.previewFeedbackId;
    setFilters(confirmedFilters);
    setShowBookmarksOnly(false);
    setSearchFlow("searching");
    setQueryPreview(null);
    await fetchNews(confirmedFilters, previewFeedbackId, approvedQuery, false);
  };

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
  const latestQueryPreview = latestSearch?.approvedQuery
    ? latestSearch.approvedQuery.length > 150
      ? `${latestSearch.approvedQuery.slice(0, 150).trim()}...`
      : latestSearch.approvedQuery
    : "";
  const latestSearchTime = latestSearch
    ? new Date(latestSearch.searchedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const searchStatus = (() => {
    if (isPreparingQuery) {
      return {
        tone: "busy",
        label: "Preparing next search",
        detail: "Building a fresh Scholarship Hunt query from your new filter choices while the current cards stay visible.",
      };
    }
    if (queryPreview) {
      return {
        tone: "review",
        label: "Query ready for review",
        detail: "A Scholarship Hunt credit has already been used for this run. Review, refine, or cancel before Tavily is called.",
      };
    }
    if (isLoading || searchFlow === "searching") {
      return {
        tone: "busy",
        label: "Searching the web",
        detail: "Tavily is running the approved query now. Fresh results will replace the previous set when the request completes.",
      };
    }
    if (latestSearch) {
      return {
        tone: "idle",
        label: `Latest run: ${latestSearch.resultCount} results`,
        detail: latestQueryPreview
          ? `${latestQueryPreview}${latestSearchTime ? ` • Updated ${latestSearchTime}` : ""}`
          : latestSearchTime
            ? `Updated ${latestSearchTime}`
            : "",
      };
    }
    return null;
  })();

  return (
    <div className="scholarship-news-view">
      <div className="news-toolbar">
        <h1>{showBookmarksOnly ? "Saved Scholarships" : "Scholarship Hunt"}</h1>
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
              <span className="hidden sm:inline">Query</span>
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
            isPreparingQuery={isPreparingQuery}
          />
        )}
        
        <main className="news-main">
          {!showBookmarksOnly && searchStatus && (
            <section className={`news-search-status news-search-status--${searchStatus.tone}`} aria-live="polite">
              <p className="news-search-status-label">{searchStatus.label}</p>
              {searchStatus.detail && (
                <p className="news-search-status-detail">{searchStatus.detail}</p>
              )}
            </section>
          )}
          <NewsFeed 
            articles={displayedArticles} 
            bookmarks={bookmarks}
            isLoading={isLoading} 
            isRefreshing={isPreparingQuery || isLoading}
            refreshMessage={isPreparingQuery
              ? "Preparing a fresh Scholarship Hunt query..."
              : "Running your approved Scholarship Hunt query..."}
            hasMore={false}
            hasFilters={showBookmarksOnly || hasFiltersSelected}
            onLoadMore={() => undefined}
            onToggleBookmark={handleToggleBookmark}
          />
        </main>
      </div>
      {queryPreview && (
        <QueryReviewDialog
          initialQuery={queryPreview.initialQuery}
          maxLength={queryPreview.maxLength}
          generationSource={queryPreview.generationSource}
          generationModel={queryPreview.generationModel}
          generationNotice={queryPreview.generationNotice}
          isSearching={isLoading}
          onCancel={() => {
            if (!isLoading) {
              setQueryPreview(null);
              setPendingFilters(null);
              setSearchFlow("idle");
            }
          }}
          onConfirm={handleConfirmQuery}
        />
      )}
    </div>
  );
}
