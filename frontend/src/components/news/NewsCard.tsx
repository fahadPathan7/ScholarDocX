import React from "react";
import { ExternalLink, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { NewsArticle } from "../../lib/newsApi";

interface NewsCardProps {
  article: NewsArticle;
  isBookmarked: boolean;
  onToggleBookmark: (article: NewsArticle) => void;
}

export function NewsCard({ article, isBookmarked, onToggleBookmark }: NewsCardProps) {
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
          <button 
            className={`icon-button bookmark-btn ${isBookmarked ? "bookmarked" : ""}`} 
            onClick={() => onToggleBookmark(article)}
            title={isBookmarked ? "Remove bookmark" : "Bookmark article"}
          >
            {isBookmarked ? <BookmarkCheck size={20} className="fill-current" /> : <BookmarkPlus size={20} />}
          </button>
        </div>
      </div>
    </article>
  );
}
