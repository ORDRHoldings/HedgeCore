"""
rebuild_db.py
Force-rebuild HedgeCalc database schema (main + test).
Ensures all ORM models are loaded and synchronized.
"""

import asyncio
import importlib
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.db import Base

# ? Dynamically import all models so SQLAlchemy registers them
models_path = Path(__file__).parent / "app" / "models"
for file in models_path.glob("*.py"):
    if file.name not in {"__init__.py"}:
        module_name = f"app.models.{file.stem}"
        importlib.import_module(module_name)
        print(f"? Imported model module: {module_name}")

# ? Define BOTH URLs -- main & test
MAIN_DB_URL = "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc"
TEST_DB_URL = "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc_test"


async def rebuild(url: str):
    print(f"\n? Rebuilding schema for {url}")
    engine = create_async_engine(url, echo=True)
    async with engine.begin() as conn:
        print("Dropping all tables...")
        await conn.run_sync(Base.metadata.drop_all)
        print("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print(f"? Schema rebuild complete for {url}")


async def main():
    await rebuild(MAIN_DB_URL)
    await rebuild(TEST_DB_URL)
    print("\n? HedgeCalc databases fully rebuilt.")


if __name__ == "__main__":
    asyncio.run(main())
