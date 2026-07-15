import asyncio
from app.db.connection import get_engine
from sqlalchemy import text

async def main():
    engine = await get_engine()
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT feature FROM role_limits WHERE role = 'general_admin'"))
        features = [r[0] for r in result.fetchall()]
        print("Features for general_admin:")
        for f in features:
            print(f)

asyncio.run(main())
