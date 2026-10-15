from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from environment variables and `.env`."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Civic Eye API"
    environment: Literal["local", "test", "production"] = "local"

    database_url: str
    cors_origins: list[str] = ["http://localhost:5173"]

    jwt_secret_key: SecretStr
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7


@lru_cache
def get_settings() -> Settings:
    return Settings()
