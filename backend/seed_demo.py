"""seed_demo.py -- Create demo user (email=demo, password=demo)"""
import asyncio
import importlib
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from app.core.db import Base

# Import all models so SQLAlchemy relationship resolution works
for _f in Path("app/models").glob("*.py"):
    if _f.name not in {"__init__.py"}:
        importlib.import_module(f"app.models.{_f.stem}")

from app.models.user import User
from app.core.security import hash_password

DB_URL = "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc"


async def seed():
    engine = create_async_engine(DB_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        res = await session.execute(select(User).where(User.email == "demo"))
        existing = res.scalars().first()
        if not existing:
            user = User(
                email="demo",
                hashed_password=hash_password("demo"),
                is_active=True,
            )
            session.add(user)
            await session.commit()
            print("Demo user created  ->  username: demo  /  password: demo")
        else:
            print("Demo user already exists.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
