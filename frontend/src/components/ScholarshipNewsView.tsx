import React, { useState } from "react";
import { Compass, Info, Layers, Search } from "lucide-react";
import { ScholarshipCatalog } from "./news/ScholarshipCatalog";
import { OpportunityLibrary } from "./news/OpportunityLibrary";
import { DeepHuntView } from "./news/DeepHuntView";
import { AddToTrackerModal } from "./news/AddToTrackerModal";
import { ScholarshipOpportunity } from "../lib/scholarshipOpportunitiesApi";
import { useUsage } from "../contexts/UsageContext";
import "./news/news.css";

// SCHOLARDOCX-0175: the filter-based "Hunt" tab and its query-building
// machinery (FilterPanel, QueryReviewDialog, CustomPromptDialog,
// SavedQueriesDialog, NewsCard, NewsFeed) are deleted. Scholarship Hunt now
// has a single deep search (the former Deep Hunt) that runs the full
// plan -> search -> filter -> crawl -> extract -> persist pipeline, plus
// the Catalog and Library tabs.
type ScholarshipHuntSubTab = "search" | "catalog" | "library";

interface ScholarshipNewsViewProps {
  onToast: (msg: string) => void;
  refreshTrigger?: number;
}

export function ScholarshipNewsView({ onToast, refreshTrigger }: ScholarshipNewsViewProps) {
  const { refreshUsage, usageData } = useUsage();
  // The single deep search shares the Scholarship Hunt plan permission.
  const canUseDeepHunt = (usageData?.limits?.can_use_scholarship_hunt ?? 0) === 1;

  const [subTab, setSubTab] = useState<ScholarshipHuntSubTab>("search");
  const [trackerModalOpportunity, setTrackerModalOpportunity] = useState<ScholarshipOpportunity | null>(null);

  const handleAddToTracker = (opportunity: ScholarshipOpportunity) => {
    setTrackerModalOpportunity(opportunity);
  };

  return (
    <div className="scholarship-news-view">
      <div className="news-toolbar">
        <h1>Scholarship Hunt</h1>
      </div>

      <div className="news-subnav" role="tablist">
        <div className="news-subnav-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "search"}
            className={`news-subnav-tab ${subTab === "search" ? "active" : ""}`}
            onClick={() => setSubTab("search")}
          >
            <Search size={15} />
            <span>Search</span>
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
                <dt><Search size={13} /> Search</dt>
                <dd>Describe a funding goal and the search agent runs multiple passes, vets each source, and shows structured results with deadlines and funding — pick which ones to save.</dd>
              </div>
              <div>
                <dt><Compass size={13} /> Catalog</dt>
                <dd>Browse a curated, free reference of well-known scholarships across two categories — program/central and university-specific — with official links, funding details, and typical application windows.</dd>
              </div>
              <div>
                <dt><Layers size={13} /> Library</dt>
                <dd>Your saved, structured opportunities (up to 100). Track status and watch approaching deadlines.</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {subTab === "search" && (
        <DeepHuntView onToast={onToast} canUseDeepHunt={canUseDeepHunt} />
      )}

      {subTab === "catalog" && (
        <ScholarshipCatalog onToast={onToast} />
      )}

      {subTab === "library" && (
        <OpportunityLibrary
          onToast={onToast}
          onAddToTracker={handleAddToTracker}
          refreshTrigger={refreshTrigger}
        />
      )}

      {trackerModalOpportunity && (
        <AddToTrackerModal
          opportunity={trackerModalOpportunity}
          onClose={() => setTrackerModalOpportunity(null)}
          onDone={() => setTrackerModalOpportunity(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
