from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()

# Tests run on several event loops, so pooled connections must not be shared between them.
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    poolclass=NullPool if settings.environment == "test" else None,
)
session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """One session per request. Services commit explicitly; uncommitted work is rolled back."""
    async with session_factory() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db_session)]
