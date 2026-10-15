import uuid
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_model import utc_now
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    TokenType,
    create_token,
    decode_token,
    get_dummy_password_hash,
    hash_password,
    hash_token_id,
    verify_password,
)
from app.modules.auth import repository
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.schemas import TokenPair, UserRegister


async def register_user(session: AsyncSession, data: UserRegister) -> tuple[User, TokenPair]:
    if await repository.get_user_by_email(session, data.email):
        raise ConflictError("Email is already registered")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        has_vehicle=data.has_vehicle,
    )
    try:
        await repository.add_user(session, user)
    except IntegrityError as exc:  # two parallel registrations with the same email
        await session.rollback()
        raise ConflictError("Email is already registered") from exc

    tokens, _ = await issue_token_pair(session, user)
    await session.commit()
    return user, tokens


async def login_user(session: AsyncSession, email: str, password: str) -> tuple[User, TokenPair]:
    user = await authenticate_user(session, email, password)
    tokens, _ = await issue_token_pair(session, user)
    await session.commit()
    return user, tokens


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User:
    user = await repository.get_user_by_email(session, email)
    if user is None:
        verify_password(password, get_dummy_password_hash())
        raise AuthenticationError("Incorrect email or password")
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise AuthenticationError("Incorrect email or password")
    return user


async def rotate_refresh_token(session: AsyncSession, refresh_token: str) -> TokenPair:
    """Exchange a refresh token for a new pair. Reusing a revoked token revokes every session."""
    stored_token = await get_stored_refresh_token(session, refresh_token)

    if stored_token.is_revoked:
        await repository.revoke_all_user_refresh_tokens(session, stored_token.user_id, utc_now())
        await session.commit()
        raise AuthenticationError("Refresh token has already been used")

    user = await get_active_user(session, stored_token.user_id)
    tokens, new_stored_token = await issue_token_pair(session, user)
    stored_token.revoked_at = utc_now()
    stored_token.replaced_by_id = new_stored_token.id
    await session.commit()
    return tokens


async def logout_user(session: AsyncSession, refresh_token: str) -> None:
    stored_token = await get_stored_refresh_token(session, refresh_token)
    if not stored_token.is_revoked:
        stored_token.revoked_at = utc_now()
        await session.commit()


async def get_active_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await repository.get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User not found or inactive")
    return user


async def get_stored_refresh_token(session: AsyncSession, refresh_token: str) -> RefreshToken:
    payload = decode_token(refresh_token, TokenType.REFRESH)
    stored_token = await repository.get_refresh_token_by_jti_hash(
        session, hash_token_id(payload.token_id)
    )
    if stored_token is None:
        raise AuthenticationError("Unknown refresh token")
    return stored_token


async def issue_token_pair(session: AsyncSession, user: User) -> tuple[TokenPair, RefreshToken]:
    settings = get_settings()
    access_ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    refresh_ttl = timedelta(days=settings.refresh_token_ttl_days)

    access_token, _ = create_token(user.id, TokenType.ACCESS, access_ttl)
    refresh_token, refresh_payload = create_token(user.id, TokenType.REFRESH, refresh_ttl)
    stored_token = await repository.add_refresh_token(
        session,
        RefreshToken(
            user_id=user.id,
            jti_hash=hash_token_id(refresh_payload.token_id),
            expires_at=refresh_payload.expires_at,
        ),
    )
    tokens = TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        access_token_expires_in=int(access_ttl.total_seconds()),
    )
    return tokens, stored_token
