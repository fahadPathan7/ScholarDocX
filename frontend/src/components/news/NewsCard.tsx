import React from "react";
import { ExternalLink, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { NewsArticle } from "../../lib/newsApi";

interface NewsCardProps {
  article: NewsArticle;
  isBookmarked: boolean;
  onToggleBookmark: (article: NewsArticle) => void;
}

export function NewsCard({ article, isBookmarked, onToggleBookmark }: NewsCardProps) {
  return (
    <article className="news-card">
      {article.image_url && (
        <div className="news-card-image" style={{ backgroundImage: `url(${article.image_url})` }} />
      )}
      <div className="news-card-content">
        <div className="news-card-header">
          <span className="news-source">{article.source_name || "News"}</span>
          {article.pubDate && (
            <span className="news-date">{new Date(article.pubDate).toLocaleDateString()}</span>
          )}
        </div>
        <h3 className="news-title">{article.title}</h3>
        {article.description && (
          <p className="news-description">{article.description.substring(0, 150)}...</p>
        )}
        <div className="news-card-actions">
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="news-link-btn button-secondary">
            Read More <ExternalLink size={14} />
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
