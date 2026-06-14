from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
from app.auth.dependencies import get_current_user
app.dependency_overrides[get_current_user] = lambda: {"id": 1, "email": "test@example.com"}

try:
    response = client.post("/api/news/saved-queries", json={"name": "test", "query_string": "test", "filters_json": "{}"})
    print("STATUS POST:", response.status_code)
    print("RESPONSE:", response.json())
except Exception as e:
    import traceback
    traceback.print_exc()
