import React, { useState, useEffect } from "react";
import { ChevronRight, Compass, Info, Layers, Library, Search, UserCog } from "lucide-react";
import { FilterPanel } from "./news/FilterPanel";
import { NewsFeed } from "./news/NewsFeed";
import { QueryReviewDialog } from "./news/QueryReviewDialog";
import { CustomPromptDialog } from "./news/CustomPromptDialog";
import { ScholarshipCatalog } from "./news/ScholarshipCatalog";
import { OpportunityLibrary } from "./news/OpportunityLibrary";
import { DeepHuntView } from "./news/DeepHuntView";
import { AddToTrackerModal } from "./news/AddToTrackerModal";
import { HuntProfileModal } from "./news/HuntProfileModal";
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
  updateSavedQuery,
} from "../lib/newsApi";
import { ScholarshipOpportunity, analyzeScholarshipOpportunity } from "../lib/scholarshipOpportunitiesApi";
import { HuntProfile, getHuntProfile, isHuntProfileComplete } from "../lib/huntProfile";
import { useUsage } from "../contexts/UsageContext";
import "./news/news.css";

type ScholarshipHuntSubTab = "hunt" | "catalog" | "library" | "deep-hunt";

interface ScholarshipNewsViewProps {
  onToast: (msg: string) => void;
  refreshTrigger?: number;
}

type SearchFlowState = "idle" | "preparing" | "review" | "searching";

export function ScholarshipNewsView({ onToast, refreshTrigger }: ScholarshipNewsViewProps) {
  const { refreshUsage, usageData } = useUsage();
  // Deep Hunt now shares the single Scholarship Hunt permission (SCHOLARDOCX-0136).
  const canUseDeepHunt = (usageData?.limits?.can_use_scholarship_hunt ?? 0) === 1;
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

  const [subTab, setSubTab] = useState<ScholarshipHuntSubTab>("hunt");
  const [reviewQueryBeforeSearch, setReviewQueryBeforeSearch] = useState(() => {
    return localStorage.getItem("scholarshipHunt_reviewQueryBeforeSearch") === "true";
  });
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);
  const [opportunitiesByUrl, setOpportunitiesByUrl] = useState<Record<string, ScholarshipOpportunity>>({});
  const [trackerModalOpportunity, setTrackerModalOpportunity] = useState<ScholarshipOpportunity | null>(null);
  const [huntProfile, setHuntProfile] = useState<HuntProfile | null>(null);
  const [isHuntProfileModalOpen, setIsHuntProfileModalOpen] = useState(false);
  const [newArticleIds, setNewArticleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem("scholarshipHunt_reviewQueryBeforeSearch", String(reviewQueryBeforeSearch));
  }, [reviewQueryBeforeSearch]);

  useEffect(() => {
    getHuntProfile()
      .then(({ profile }) => setHuntProfile(profile))
      .catch(() => undefined);
  }, []);

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
      await refreshUsage();
    } catch (error) {
      onToast("Could not analyze this page.");
    } finally {
      setAnalyzingUrl(null);
    }
  };

  const handleAddToTracker = (opportunity: ScholarshipOpportunity) => {
    setTrackerModalOpportunity(opportunity);
  };

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
  ): Promise<NewsArticle[]> => {
    if (showBookmarksOnly) return []; // Don't fetch from API when viewing bookmarks
    if (!hasAnyFilter(currentFilters) && !approvedQuery) {
      setArticles([]);
      setSearchFlow("idle");
      setIsLoading(false);
      return [];
    }

    if (isLoadingRef.current) return [];

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
      return response.results || [];
    } catch (error: any) {
      console.error("News search error:", error);
      if (error.message?.includes("429") || error.message?.includes("Limit exceeded")) {
        onToast("Rate limit exceeded. Upgrade your plan for more searches.");
      } else {
        onToast("Failed to find scholarship opportunities.");
      }
      if (!append) setArticles([]);
      return [];
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
    if (!isHuntProfileComplete(huntProfile)) {
      setIsHuntProfileModalOpen(true);
      return;
    }

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
      await refreshUsage();
      if (reviewQueryBeforeSearch) {
        setQueryPreview({
          previewFeedbackId: preview.preview_feedback_id,
          initialQuery: preview.initial_query,
          maxLength: preview.max_length,
          generationSource: preview.generation_source,
          generationModel: preview.generation_model,
          generationNotice: preview.generation_notice,
        });
        setSearchFlow("review");
      } else {
        setFilters(newFilters);
        setShowBookmarksOnly(false);
        setSearchFlow("searching");
        await fetchNews(newFilters, preview.preview_feedback_id, preview.initial_query, false);
      }
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
      setShowCustomPromptDialog(false);
      await refreshUsage();
      if (reviewQueryBeforeSearch) {
        setQueryPreview({
          previewFeedbackId: preview.preview_feedback_id,
          initialQuery: preview.initial_query,
          maxLength: preview.max_length,
          generationSource: preview.generation_source,
          generationModel: preview.generation_model,
          generationNotice: preview.generation_notice,
        });
        setSearchFlow("review");
      } else {
        setFilters(payload);
        setShowBookmarksOnly(false);
        setSearchFlow("searching");
        await fetchNews(payload, preview.preview_feedback_id, preview.initial_query, false);
      }
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

  const handleRunSavedQuery = async (
    queryString: string,
    filtersJson: string,
    savedQuery?: { id: number; seen_article_ids_json?: string },
  ) => {
    let parsedFilters = {};
    try {
      parsedFilters = JSON.parse(filtersJson);
    } catch(e) {}

    setFilters(parsedFilters);
    setPendingFilters(parsedFilters);
    setShowBookmarksOnly(false);
    setSearchFlow("searching");
    setNewArticleIds(new Set());

    // Use 0 or null equivalent for preview feedback since it's pre-approved
    const results = await fetchNews(parsedFilters, 0, queryString, false);

    // Watchlist diff (FR-8.41): mark results not seen on the previous run,
    // then persist the full current set as "seen" for next time.
    if (savedQuery) {
      try {
        let previouslySeen: string[] = [];
        try {
          previouslySeen = JSON.parse(savedQuery.seen_article_ids_json || "[]");
        } catch (e) {}
        const seenSet = new Set(previouslySeen);
        const currentIds = results.map((a) => a.article_id).filter(Boolean);
        const freshIds = new Set(currentIds.filter((id) => !seenSet.has(id)));
        setNewArticleIds(freshIds);
        await updateSavedQuery(savedQuery.id, JSON.stringify(Array.from(new Set(currentIds))));
      } catch (error) {
        console.error("Failed to diff/update watchlist seen IDs:", error);
      }
    }
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
        <h1>Scholarship Hunt</h1>
        <div className="news-toolbar-actions">
          {subTab === "hunt" && (
            <div className="news-toolbar-group">
              <label className="review-query-toggle" title="Show the editable query before every search">
                <input
                  type="checkbox"
                  checked={reviewQueryBeforeSearch}
                  onChange={(e) => setReviewQueryBeforeSearch(e.target.checked)}
                />
                Review query before search
              </label>
              <button
                className={`button-secondary ${showBookmarksOnly ? 'active' : ''}`}
                onClick={toggleBookmarksView}
              >
                <span className="hidden sm:inline">{showBookmarksOnly ? "Feed" : "Saved"}</span>
              </button>
            </div>
          )}
          <button
            className="button-secondary news-toolbar-profile-btn"
            onClick={() => setIsHuntProfileModalOpen(true)}
            title="Set your degree, destinations, field, and intake for local fit scoring"
          >
            <UserCog size={16} />
            <span className="hidden sm:inline">Hunt Profile</span>
          </button>
        </div>
      </div>

      <div className="news-subnav" role="tablist">
        <div className="news-subnav-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "hunt"}
            className={`news-subnav-tab ${subTab === "hunt" ? "active" : ""}`}
            onClick={() => setSubTab("hunt")}
          >
            <Search size={15} />
            <span>Hunt</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "deep-hunt"}
            className={`news-subnav-tab ${subTab === "deep-hunt" ? "active" : ""}`}
            onClick={() => setSubTab("deep-hunt")}
          >
            <Library size={15} />
            <span>Deep Hunt</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "catalog"}
            className={`news-subnav-tab ${subTab === "catalog" ? "active" : ""}`}
            onClick={() => setSubTab("catalog")}
          >
            <Compass size={15} />
            <span>Catalog</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "library"}
            className={`news-subnav-tab ${subTab === "library" ? "active" : ""}`}
            onClick={() => setSubTab("library")}
          >
            <Layers size={15} />
            <span>Library</span>
          </button>
        </div>
        <div className="news-subnav-info">
          <button
            type="button"
            className="news-subnav-info-trigger"
            aria-label="What does each tab do?"
          >
            <Info size={16} />
          </button>
          <div className="news-subnav-info-popover" role="tooltip">
            <p className="news-subnav-info-title">Scholarship Hunt tabs</p>
            <dl className="news-subnav-info-list">
              <div>
                <dt><Search size={13} /> Hunt</dt>
                <dd>Run a live news + web search from your filters and analyze each result into a structured opportunity. Uses Scholarship Hunt credits.</dd>
              </div>
              <div>
                <dt><Library size={13} /> Deep Hunt</dt>
                <dd>Hands one funding goal to an agent that runs multiple search passes, crawls pages, and extracts evidence-backed opportunities. Gated by your Scholarship Hunt plan access.</dd>
              </div>
              <div>
                <dt><Compass size={13} /> Catalog</dt>
                <dd>Browse a curated list of well-known scholarships for free. Pay one credit per program to check its current application cycle.</dd>
              </div>
              <div>
                <dt><Layers size={13} /> Library</dt>
                <dd>Your saved, structured opportunities. Track status, see fit scores, and watch approaching deadlines.</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {subTab === "deep-hunt" && (
        <DeepHuntView
          onToast={onToast}
          onAddToTracker={handleAddToTracker}
          huntProfile={huntProfile}
          canUseDeepHunt={canUseDeepHunt}
          onRequireHuntProfile={() => setIsHuntProfileModalOpen(true)}
        />
      )}

      {subTab === "catalog" && (
        <ScholarshipCatalog
          onToast={onToast}
          onAddToTracker={handleAddToTracker}
          onRefreshUsage={refreshUsage}
          huntProfile={huntProfile}
        />
      )}

      {subTab === "library" && (
        <OpportunityLibrary
          onToast={onToast}
          onAddToTracker={handleAddToTracker}
          refreshTrigger={refreshTrigger}
          huntProfile={huntProfile}
        />
      )}

      {subTab === "hunt" && (
        <>
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
                onAnalyze={handleAnalyze}
                analyzingUrl={analyzingUrl}
                opportunitiesByUrl={opportunitiesByUrl}
                onAddToTracker={handleAddToTracker}
                huntProfile={huntProfile}
                newArticleIds={newArticleIds}
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
        </>
      )}

      {trackerModalOpportunity && (
        <AddToTrackerModal
          opportunity={trackerModalOpportunity}
          onClose={() => setTrackerModalOpportunity(null)}
          onDone={() => setTrackerModalOpportunity(null)}
          onToast={onToast}
        />
      )}

      {isHuntProfileModalOpen && (
        <HuntProfileModal
          onClose={() => setIsHuntProfileModalOpen(false)}
          onSaved={(profile) => setHuntProfile(profile)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
