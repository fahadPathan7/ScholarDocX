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

export const searchNews = async (params: NewsSearchParams): Promise<NewsResponse> => {
  const query = new URLSearchParams();
  
  if (params.levels) params.levels.forEach(v => query.append("levels", v));
  if (params.countries) params.countries.forEach(v => query.append("countries", v));
  if (params.seasons) params.seasons.forEach(v => query.append("seasons", v));
  if (params.years) params.years.forEach(v => query.append("years", v));
  if (params.funding_types) params.funding_types.forEach(v => query.append("funding_types", v));
  if (params.fields_of_study) params.fields_of_study.forEach(v => query.append("fields_of_study", v));
  if (params.popular_scholarships) {
    params.popular_scholarships.forEach(v => query.append("popular_scholarships", v));
  }
  
  if (params.language) query.append("language", params.language);
  if (params.sort_by) query.append("sort_by", params.sort_by);
  if (params.page) query.append("page", params.page);

  return api.get<NewsResponse>(`/news/search?${query.toString()}`);
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
