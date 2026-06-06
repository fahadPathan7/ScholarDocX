import httpx
from typing import List, Optional, Dict, Any
from fastapi import HTTPException
import urllib.parse
from app.core.config import get_settings

class NewsService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.newsdata_api_key
        self.base_url = "https://newsdata.io/api/1/news"

    async def search_scholarships(
        self,
        levels: Optional[List[str]] = None,
        countries: Optional[List[str]] = None,
        seasons: Optional[List[str]] = None,
        years: Optional[List[str]] = None,
        funding_types: Optional[List[str]] = None,
        fields_of_study: Optional[List[str]] = None,
        popular_scholarships: Optional[List[str]] = None,
        language: str = "en",
        sort_by: str = "latest",
        page: Optional[str] = None,
    ) -> Dict[str, Any]:
        
        q_parts = []
        
        if popular_scholarships:
            formatted_popular = [f'"{p}"' if ' ' in p else p for p in popular_scholarships]
            q_parts.append(f"({' OR '.join(formatted_popular)})")
        else:
            q_parts.append('(scholarship OR fellowship OR grant)')
            
        if levels:
            q_parts.append(f"({' OR '.join(levels)})")
        if seasons:
            q_parts.append(f"({' OR '.join(seasons)})")
        if years:
            q_parts.append(f"({' OR '.join(years)})")
        if funding_types:
            formatted_funding = [f'"{f}"' if ' ' in f else f for f in funding_types]
            q_parts.append(f"({' OR '.join(formatted_funding)})")
        if fields_of_study:
            formatted_fields = [f'"{f}"' if ' ' in f else f for f in fields_of_study]
            q_parts.append(f"({' OR '.join(formatted_fields)})")
        if countries:
            formatted_countries = [f'"{c}"' if ' ' in c else c for c in countries]
            q_parts.append(f"({' OR '.join(formatted_countries)})")
            
        q_string = " AND ".join(q_parts)
        
        params = {
            "apikey": self.api_key,
            "category": "education",
            "q": q_string,
            "language": language,
            "size": 10
        }
            
        if sort_by == "popularity":
            params["prioritydomain"] = "top"
        
        if page:
            params["page"] = page

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(self.base_url, params=params, timeout=10.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                # Provide a more generic error for the frontend
                raise HTTPException(status_code=e.response.status_code, detail=f"NewsData API error: {e.response.text}")
            except httpx.RequestError as e:
                raise HTTPException(status_code=500, detail="Failed to connect to NewsData API.")

news_service = NewsService()
