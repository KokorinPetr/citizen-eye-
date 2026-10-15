import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from functools import lru_cache

import jwt
from pwdlib import PasswordHash

from app.core.base_model import utc_now
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError

password_hasher = PasswordHash.recommended()


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


@dataclass(frozen=True)
class TokenPayload:
    subject: uuid.UUID
    token_type: TokenType
    token_id: str
    expires_at: datetime


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


@lru_cache
def get_dummy_password_hash() -> str:
    """Used to verify against when the user does not exist, so login timing does not leak emails."""
    return hash_password("dummy-password-for-timing")


def hash_token_id(token_id: str) -> str:
    """Only hashes of refresh token ids are stored, so a DB leak does not leak usable tokens."""
    return hashlib.sha256(token_id.encode()).hexdigest()


def create_token(
    subject: uuid.UUID, token_type: TokenType, ttl: timedelta
) -> tuple[str, TokenPayload]:
    settings = get_settings()
    issued_at = utc_now()
    payload = TokenPayload(
        subject=subject,
        token_type=token_type,
        token_id=uuid.uuid4().hex,
        expires_at=issued_at + ttl,
    )
    claims = {
        "sub": str(subject),
        "type": token_type.value,
        "jti": payload.token_id,
        "iat": issued_at,
        "exp": payload.expires_at,
    }
    token = jwt.encode(
        claims, settings.jwt_secret_key.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return token, payload


def decode_token(token: str, expected_type: TokenType) -> TokenPayload:
    settings = get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "type", "jti", "exp"]},
        )
        subject = uuid.UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise AuthenticationError("Invalid or expired token") from exc

    if claims["type"] != expected_type.value:
        raise AuthenticationError("Invalid token type")

    return TokenPayload(
        subject=subject,
        token_type=expected_type,
        token_id=claims["jti"],
        expires_at=datetime.fromtimestamp(claims["exp"], tz=utc_now().tzinfo),
    )
