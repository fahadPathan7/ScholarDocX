import React, { useState, useEffect } from "react";
import { Filter, Bookmark, ChevronRight } from "lucide-react";
import { FilterPanel } from "./news/FilterPanel";
import { NewsFeed } from "./news/NewsFeed";
import { QueryReviewDialog } from "./news/QueryReviewDialog";
import { CustomPromptDialog } from "./news/CustomPromptDialog";
import {
  addBookmark,
  getBookmarkedNews,
  NewsArticle,
  NewsQueryPreview,
  NewsSearchParams,
  previewNewsQuery,
  removeBookmark,
  searchNews,
  saveQuery,
} from "../lib/newsApi";
import { useUsage } from "../contexts/UsageContext";
import "./news/news.css";

interface ScholarshipNewsViewProps {
  onToast: (msg: string) => void;
  refreshTrigger?: number;
}

type SearchFlowState = "idle" | "preparing" | "review" | "searching";

export function ScholarshipNewsView({ onToast, refreshTrigger }: ScholarshipNewsViewProps) {
  const { refreshUsage } = useUsage();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = React.useRef(false);
  const [isFilterOpen, setIsFilterOpen] = useState(() => {
    const saved = localStorage.getItem("scholarshipHunt_isFilterOpen");
    if (saved !== null) return JSON.parse(saved);
    return window.innerWidth > 768;
  });

  useEffect(() => {
    localStorage.setItem("scholarshipHunt_isFilterOpen", JSON.stringify(isFilterOpen));
  }, [isFilterOpen]);

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
  const [showCustomPromptDialog, setShowCustomPromptDialog] = useState(false);

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
    if (!hasAnyFilter(currentFilters) && !approvedQuery) {
      setArticles([]);
      setSearchFlow("idle");
      setIsLoading(false);
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

  useEffect(() => {
    fetchBookmarks();
    const handleResize = () => {
      if (window.innerWidth > 768 && !isFilterOpen) setIsFilterOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      if (showBookmarksOnly) {
        fetchBookmarks();
      } else if (latestSearch?.approvedQuery) {
        fetchNews(filters, 0, latestSearch.approvedQuery, false);
      }
    }
  }, [refreshTrigger]);

  const handleApplyFilters = async (newFilters: any) => {
    if (newFilters.isCustomPrompt) {
      setShowCustomPromptDialog(true);
      return;
    }

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

  const handleRefineCustomPrompt = async (promptText: string) => {
    setSearchFlow("preparing");
    setIsPreparingQuery(true);
    try {
      const payload: NewsSearchParams = { custom_prompt: promptText };
      const preview = await previewNewsQuery(payload);
      setPendingFilters(payload);
      setQueryPreview({
        previewFeedbackId: preview.preview_feedback_id,
        initialQuery: preview.initial_query,
        maxLength: preview.max_length,
        generationSource: preview.generation_source,
        generationModel: preview.generation_model,
        generationNotice: preview.generation_notice,
      });
      setSearchFlow("review");
      setShowCustomPromptDialog(false);
      await refreshUsage();
    } catch (error) {
      console.error("Failed to prepare Scholarship Hunt custom query:", error);
      if ((error as Error)?.message?.includes("429") || (error as Error)?.message?.includes("Limit exceeded")) {
        onToast("Rate limit exceeded. Upgrade your plan for more searches.");
      } else {
        onToast("Could not refine your custom prompt.");
      }
      setSearchFlow("idle");
    } finally {
      setIsPreparingQuery(false);
    }
  };

  const handleConfirmQuery = async (approvedQuery: string, saveAsName?: string) => {
    if (!pendingFilters || !queryPreview) return;
    const confirmedFilters = pendingFilters;
    const previewFeedbackId = queryPreview.previewFeedbackId;
    setFilters(confirmedFilters);
    setShowBookmarksOnly(false);
    setSearchFlow("searching");
    setQueryPreview(null);
    
    if (saveAsName) {
      try {
        await saveQuery(saveAsName, approvedQuery, JSON.stringify(confirmedFilters));
        onToast("Query saved successfully");
      } catch (e) {
        onToast("Failed to save query");
      }
    }
    
    await fetchNews(confirmedFilters, previewFeedbackId, approvedQuery, false);
  };

  const handleRunSavedQuery = async (queryString: string, filtersJson: string) => {
    let parsedFilters = {};
    try {
      parsedFilters = JSON.parse(filtersJson);
    } catch(e) {}
    
    setFilters(parsedFilters);
    setPendingFilters(parsedFilters);
    setShowBookmarksOnly(false);
    setSearchFlow("searching");
    
    // Use 0 or null equivalent for preview feedback since it's pre-approved
    await fetchNews(parsedFilters, 0, queryString, false);
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

          <button 
            className={`button-secondary ${showBookmarksOnly ? 'active' : ''}`} 
            onClick={toggleBookmarksView}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Bookmark size={18} className={showBookmarksOnly ? "fill-current" : ""} />
            <span className="hidden sm:inline">{showBookmarksOnly ? "Feed" : "Saved"}</span>
          </button>
        </div>
      </div>
      
      <div className="news-layout">
        {!showBookmarksOnly && !isFilterOpen && (
          <button
            className="filter-panel-expand-button"
            onClick={() => setIsFilterOpen(true)}
            aria-label="Expand query builder"
            title="Expand query builder"
          >
            <ChevronRight size={20} />
          </button>
        )}
        {!showBookmarksOnly && (
          <FilterPanel 
            isOpen={isFilterOpen} 
            onClose={() => setIsFilterOpen(false)} 
            onApplyFilters={handleApplyFilters}
            isPreparingQuery={isPreparingQuery}
            onRunSavedQuery={handleRunSavedQuery}
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
            hasFilters={showBookmarksOnly || hasFiltersSelected || !!latestSearch}
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
      {showCustomPromptDialog && (
        <CustomPromptDialog
          isRefining={isPreparingQuery}
          onCancel={() => {
            if (!isPreparingQuery) setShowCustomPromptDialog(false);
          }}
          onConfirm={handleRefineCustomPrompt}
        />
      )}
    </div>
  );
}
