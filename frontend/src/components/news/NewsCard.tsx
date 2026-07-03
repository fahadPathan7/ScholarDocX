import React from "react";
import { ExternalLink, BookmarkPlus, BookmarkCheck, Sparkles, Loader2 } from "lucide-react";
import { NewsArticle } from "../../lib/newsApi";
import { ScholarshipOpportunity } from "../../lib/scholarshipOpportunitiesApi";
import { HuntProfile } from "../../lib/huntProfile";
import { OpportunityCard } from "./OpportunityCard";

interface NewsCardProps {
  article: NewsArticle;
  isBookmarked: boolean;
  onToggleBookmark: (article: NewsArticle) => void;
  onAnalyze?: (article: NewsArticle) => void;
  isAnalyzing?: boolean;
  analyzedOpportunity?: ScholarshipOpportunity;
  onAddToTracker?: (opportunity: ScholarshipOpportunity) => void;
  huntProfile?: HuntProfile | null;
  isNew?: boolean;
}

export function NewsCard({
  article,
  isBookmarked,
  onToggleBookmark,
  onAnalyze,
  isAnalyzing = false,
  analyzedOpportunity,
  onAddToTracker,
  huntProfile,
  isNew = false,
}: NewsCardProps) {
  const description = article.description?.trim();
  const descriptionPreview = description && description.length > 180
    ? `${description.substring(0, 177).trimEnd()}...`
    : description;

  return (
    <article className="news-card">
      {article.image_url && (
        <div className="news-card-image" style={{ backgroundImage: `url(${article.image_url})` }} />
      )}
      <div className="news-card-content">
        <div className="news-card-header">
          <span className="news-source">{article.source_name || "Source"}</span>
          {isNew && <span className="news-new-badge">New</span>}
          {article.pubDate && (
            <span className="news-date">Updated {new Date(article.pubDate).toLocaleDateString()}</span>
          )}
        </div>
        <h3 className="news-title">{article.title}</h3>
        {descriptionPreview && (
          <p className="news-description">{descriptionPreview}</p>
        )}
        <div className="news-card-actions">
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="news-link-btn button-secondary">
            View Details <ExternalLink size={14} />
          </a>
          {onAnalyze && !analyzedOpportunity && (
            <button
              type="button"
              className="button-secondary news-analyze-btn"
              onClick={() => onAnalyze(article)}
              disabled={isAnalyzing}
              title="Extract structured scholarship details with AI"
            >
              {isAnalyzing ? <Loader2 size={14} className="icon-spin" /> : <Sparkles size={14} />}
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </button>
          )}
          <button
            className={`icon-button bookmark-btn ${isBookmarked ? "bookmarked" : ""}`}
            onClick={() => onToggleBookmark(article)}
            title={isBookmarked ? "Remove bookmark" : "Bookmark article"}
          >
            {isBookmarked ? <BookmarkCheck size={20} className="fill-current" /> : <BookmarkPlus size={20} />}
          </button>
        </div>
        {analyzedOpportunity && (
          <OpportunityCard
            opportunity={analyzedOpportunity}
            onAddToTracker={onAddToTracker}
            huntProfile={huntProfile}
          />
        )}
      </div>
    </article>
  );
}
