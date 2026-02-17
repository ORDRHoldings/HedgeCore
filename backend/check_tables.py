import asyncio
from app.core.db import async_engine

async def check():
    async with async_engine.begin() as conn:
        result = await conn.run_sync(
            lambda c: c.exec_driver_sql(
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
            )
        )
        print("\nCurrent tables:\n", [r[0] for r in result])
    await async_engine.dispose()

asyncio.run(check())
