import asyncio
from pathlib import Path
from sqlalchemy import text
from app.db.connection import get_engine, initialize_database
from sqlalchemy.orm import Session
from app.services.ai_tokens import charge

def run_test():
    db_path = Path("test_db.sqlite")
    if db_path.exists():
        db_path.unlink()
    
    engine = get_engine(db_path)
    initialize_database(db_path)
    
    with Session(engine) as session:
        # Create a test user with a large token balance
        session.execute(
            text("INSERT INTO users (id, email, subscription_ai_tokens) VALUES (1, 'test@test.com', 100000)")
        )
        session.commit()
        
        user = {"id": 1, "roles": ["pro_user"]}
        
        # Openrouter pricing: (0.08 input / 0.20 output)
        result = charge(
            user=user,
            model_id="openrouter",
            provider="openrouter",
            input_tokens=1000000,
            output_tokens=1000000,
            source="test_script",
            session=session
        )
        
        print("Charge Result:", result)
        
        # Verify the user's remaining balance
        row = session.execute(text("SELECT subscription_ai_tokens FROM users WHERE id = 1")).fetchone()
        print(f"Original tokens: 100000")
        print(f"Remaining tokens: {row[0]}")
        print(f"Tokens charged: {100000 - row[0]}")
        
    if db_path.exists():
        db_path.unlink()

if __name__ == "__main__":
    run_test()
