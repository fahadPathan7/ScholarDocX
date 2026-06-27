from app.services import ai_tokens
from app.db.connection import connect

def test_openrouter_charge(tmp_path, monkeypatch):
    # We can import test helpers directly since we are in tests/
    from test_ai_tokens import make_settings, make_user, get_balance
    
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    from sqlalchemy.orm import Session
    from app.db.connection import get_engine
    
    with Session(get_engine(settings.database_path)) as db:
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
        print("Balance before:", balance_before)
        print("Balance after:", balance_after)
        print("Charge result:", res)
        print("Cost USD: $0.28")
        
        assert res["charged"] > 0
        assert balance_after["purchased_balance"] < balance_before["purchased_balance"]
