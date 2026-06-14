from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
try:
    # Overwrite the dependency to bypass auth
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "email": "test@example.com"}
    response = client.get("/api/news/saved-queries")
    print("STATUS:", response.status_code)
    print("RESPONSE:", response.json())
except Exception as e:
    import traceback
    traceback.print_exc()
