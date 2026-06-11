import { api, listRecords, createRecord, deleteRecord } from "./api";

export interface NewsSearchParams {
  levels?: string[];
  countries?: string[];
  seasons?: string[];
  years?: string[];
  funding_types?: string[];
  fields_of_study?: string[];
  popular_scholarships?: string[];
  language?: string;
  sort_by?: string;
  page?: string;
}

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

export interface NewsQueryPreview {
  preview_feedback_id: number;
  initial_query: string;
  max_length: number;
  generation_source: "openrouter" | "fallback";
  generation_model: string;
  generation_notice: string;
}

const cleanSearchParams = (params: NewsSearchParams): NewsSearchParams => {
  const { page: _page, ...filters } = params;
  return filters;
};

export const previewNewsQuery = async (
  params: NewsSearchParams,
): Promise<NewsQueryPreview> => {
  return api.post<NewsQueryPreview>("/news/query-preview", {
    filters: cleanSearchParams(params),
  });
};

export const searchNews = async (
  params: NewsSearchParams,
  previewFeedbackId: number,
  approvedQuery: string,
): Promise<NewsResponse> => {
  return api.post<NewsResponse>("/news/search", {
    filters: cleanSearchParams(params),
    preview_feedback_id: previewFeedbackId,
    approved_query: approvedQuery,
    query_approved: true,
  });
};

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
