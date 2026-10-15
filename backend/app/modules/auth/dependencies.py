from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import DbSession
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import TokenType, decode_token
from app.modules.auth.enums import UserRole
from app.modules.auth.models import User
from app.modules.auth.service import get_active_user

bearer_scheme = HTTPBearer(auto_error=False)
BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


async def get_optional_user(session: DbSession, credentials: BearerCredentials) -> User | None:
    """Current user if a valid access token is sent, otherwise None (for public routes)."""
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials, TokenType.ACCESS)
    return await get_active_user(session, payload.subject)


async def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise AuthenticationError("Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_roles(*roles: UserRole) -> Callable[[User], Awaitable[User]]:
    """Dependency factory: `Depends(require_roles(UserRole.ADMIN))`."""

    async def check_role(user: CurrentUser) -> User:
        if user.role not in roles:
            raise PermissionDeniedError()
        return user

    return check_role
