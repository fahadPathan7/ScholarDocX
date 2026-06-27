import pytest
from app.services import ai_tokens
from tests.test_ai_tokens import make_settings, make_user, get_balance
from app.db.connection import connect

def test_openrouter_charge(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    
    with connect(settings.database_path) as db:
        ai_tokens.refresh_balance(user, db)
        ai_tokens.grant_purchased(user["id"], 10000, session=db, source="test")
        db.commit()
        
        balance_before = get_balance(settings, user["id"])
        
        # Charge openrouter
        res = ai_tokens.charge(
            user=user,
            model_id="openrouter",
            provider="openrouter",
            input_tokens=1000000,  # 1M input tokens ($0.08)
            output_tokens=1000000, # 1M output tokens ($0.20)
            source="test",
            session=db
        )
        db.commit()
        
        balance_after = get_balance(settings, user["id"])
        
        print("\n=== OpenRouter Charge Test ===")
        print("Balance before:", balance_before["purchased_balance"])
        print("Balance after:", balance_after["purchased_balance"])
        print("Charge result:", res)
        print("Tokens charged:", res["charged"])
        print("Cost USD: $0.28")
        
        assert res["charged"] > 0
        assert balance_after["purchased_balance"] < balance_before["purchased_balance"]

if __name__ == "__main__":
    pytest.main(["-s", "test_openrouter.py"])
