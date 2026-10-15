import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import RefreshToken, User


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def add_user(session: AsyncSession, user: User) -> User:
    session.add(user)
    await session.flush()
    return user


async def add_refresh_token(session: AsyncSession, refresh_token: RefreshToken) -> RefreshToken:
    session.add(refresh_token)
    await session.flush()
    return refresh_token


async def get_refresh_token_by_jti_hash(
    session: AsyncSession, jti_hash: str
) -> RefreshToken | None:
    result = await session.execute(select(RefreshToken).where(RefreshToken.jti_hash == jti_hash))
    return result.scalar_one_or_none()


async def revoke_all_user_refresh_tokens(
    session: AsyncSession, user_id: uuid.UUID, revoked_at: datetime
) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=revoked_at)
    )
