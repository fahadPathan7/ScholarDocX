from app.services import ai_tokens
from app.db.connection import connect

from tests.helpers import get_balance, make_settings, make_user


def test_openrouter_charge(tmp_path, monkeypatch):
    # Shared helpers live in tests/helpers.py so they resolve from any subfolder.
    
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    from sqlalchemy.orm import Session
    from app.db.connection import get_engine
    
    with Session(get_engine(settings.database_target)) as db:
        ai_tokens.refresh_balance(user, db)
        ai_tokens.grant_purchased(user["id"], 10000, session=db, source="test")
        # Drain the subscription bucket (pinning the current period so
        # refresh_balance does not refill it) so the charge must hit the
        # purchased bucket.
        from sqlalchemy import text
        db.execute(
            text(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "subscription_period = :period WHERE user_id = :uid"
            ),
            {"uid": user["id"], "period": ai_tokens._current_period(user)},
        )
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
        assert balance_after["purchased_remaining"] < balance_before["purchased_remaining"]
