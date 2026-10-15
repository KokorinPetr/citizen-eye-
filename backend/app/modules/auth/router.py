from fastapi import APIRouter, status

from app.core.database import DbSession
from app.modules.auth import service
from app.modules.auth.dependencies import CurrentUser
from app.modules.auth.schemas import (
    AuthResponse,
    RefreshRequest,
    TokenPair,
    UserLogin,
    UserRead,
    UserRegister,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, session: DbSession) -> AuthResponse:
    user, tokens = await service.register_user(session, data)
    return AuthResponse(user=UserRead.model_validate(user), tokens=tokens)


@router.post("/login")
async def login(data: UserLogin, session: DbSession) -> AuthResponse:
    user, tokens = await service.login_user(session, data.email, data.password)
    return AuthResponse(user=UserRead.model_validate(user), tokens=tokens)


@router.post("/refresh")
async def refresh(data: RefreshRequest, session: DbSession) -> TokenPair:
    return await service.rotate_refresh_token(session, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshRequest, session: DbSession) -> None:
    await service.logout_user(session, data.refresh_token)


@router.get("/me")
async def read_current_user(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
