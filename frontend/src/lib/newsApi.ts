import { api, listRecords } from "./api";

// SCHOLARDOCX-0175: the filter-based search endpoints (/news/search,
// /news/query-preview) are deleted. Scholarship Hunt now has a single deep
// search surface at /scholarship-deep-hunt/runs (see scholarshipDeepHuntApi).
// This module retains only the shared types (NewsArticle / NewsResponse,
// used by the catalog + opportunity APIs) and the bookmark / saved-query
// (watchlist) CRUD that the Opportunity Library depends on.

export interface NewsArticle {
  article_id: string;
  title: string;
  link: string;
  source_name?: string;
  pubDate?: string;
  image_url?: string;
  description?: string;
  country?: string[];
}

export interface NewsResponse {
  status: string;
  totalResults: number;
  results: NewsArticle[];
  nextPage?: string;
}

export const getBookmarkedNews = async (): Promise<any[]> => {
  return listRecords("news/bookmarks");
};

export const addBookmark = async (article: NewsArticle): Promise<any> => {
  return api.post("/news/bookmarks", {
    article_id: article.article_id,
    title: article.title,
    link: article.link,
    source_name: article.source_name,
    pub_date: article.pubDate,
    image_url: article.image_url,
    description: article.description,
    country: article.country ? article.country[0] : null,
  });
};

export const removeBookmark = async (articleId: string): Promise<any> => {
  return api.delete(`/news/bookmarks/${articleId}`);
};

export interface SavedNewsQuery {
  id: string;
  name: string;
  query_string: string;
  filters_json: string;
  created_at: string;
  seen_article_ids_json?: string;
}

export const getSavedQueries = async (): Promise<SavedNewsQuery[]> => {
  return listRecords("news/saved-queries");
};

export const saveQuery = async (name: string, query_string: string, filters_json: string): Promise<SavedNewsQuery> => {
  return api.post("/news/saved-queries", {
    name,
    query_string,
    filters_json,
  });
};

export const deleteSavedQuery = async (id: string): Promise<any> => {
  return api.delete(`/news/saved-queries/${id}`);
};

// Watchlist diff (FR-8.41): persists the seen-article-ID set after a re-run
// so the next run can badge genuinely new results. Uses the bespoke
// saved-queries endpoint contract (raw body, not the generic {data} wrapper).
export const updateSavedQuery = async (id: string, seen_article_ids_json: string): Promise<SavedNewsQuery> => {
  return api.patch(`/news/saved-queries/${id}`, { seen_article_ids_json });
};
