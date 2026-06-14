import requests

url = "http://127.0.0.1:8000/api/news/search"
payload = {
    "filters": {},
    "preview_feedback_id": 0,
    "approved_query": "test query length over 3 chars",
    "query_approved": True
}
# We need auth. Wait, I can just use the TestClient in python!
