import pytest
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import os

# Set dummy env variable so app starts without warning
os.environ["POLAR_WEBHOOK_SECRET"] = "whsec_test"
from app.main import app

client = TestClient(app)

@patch("app.api.webhooks.Webhook")
def test_polar_webhook_subscription_created(mock_webhook):
    # Mock the svix webhook verification
    mock_wh_instance = MagicMock()
    mock_wh_instance.verify.return_value = {
        "type": "subscription.created",
        "data": {
            "id": "sub_123",
            "customer_id": "cus_123",
            "product_id": "prod_pro",
            "customer": {
                "email": "testpolar@example.com"
            }
        }
    }
    mock_webhook.return_value = mock_wh_instance

    # Mock get_app_setting
    with patch("app.api.webhooks.get_app_setting", side_effect=lambda store, key, default="": "prod_pro" if key == "polar_product_id_pro" else default):
        response = client.post(
            "/api/webhooks/polar",
            json={"mock": "payload"},
            headers={"svix-id": "msg_123", "svix-timestamp": "123", "svix-signature": "v1,sig"}
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
