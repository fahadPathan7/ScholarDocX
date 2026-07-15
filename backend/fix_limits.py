import asyncio
from app.core.config import settings
from app.db.connection import get_engine
from sqlalchemy import text
from app.services.admin import AdminService

async def main():
    engine = await get_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for role, limits in AdminService.DEFAULT_ROLE_LIMITS.items():
            for feature, count, period in limits:
                # Use UPSERT or similar if needed. Actually, let's just use the built-in seeder!
                pass
    
    await AdminService.seed_default_role_limits(engine)
    print("Seed complete")

asyncio.run(main())
