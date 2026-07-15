import asyncio
from app.db.connection import get_engine
from sqlalchemy import text
from app.services.admin import AdminService

async def main():
    try:
        engine = await get_engine()
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT feature FROM role_limits WHERE role = 'general_admin'"))
            print("Features in DB:", [r[0] for r in result.fetchall()])
    except Exception as e:
        print("Error with DB:", e)
        print("Expected in code:")
        for r in AdminService.DEFAULT_ROLE_LIMITS.get('general_admin', []):
            print(r[0])

asyncio.run(main())
