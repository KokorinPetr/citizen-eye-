import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from app.modules.auth.enums import UserRole

NormalizedEmail = Annotated[EmailStr, AfterValidator(str.lower)]


class UserRegister(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)
    has_vehicle: bool = False


class UserLogin(BaseModel):
    email: NormalizedEmail
    password: str = Field(max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    has_vehicle: bool
    role: UserRole
    created_at: datetime


class UserPublic(BaseModel):
    """What other people may see about a user. Never email or phone."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    has_vehicle: bool


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    access_token_expires_in: int = Field(description="Access token lifetime in seconds")


class AuthResponse(BaseModel):
    user: UserRead
    tokens: TokenPair
