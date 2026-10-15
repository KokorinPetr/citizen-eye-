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

    # Points outside this box are rejected: (min_lng, min_lat, max_lng, max_lat), all of Thailand.
    service_area_bbox: tuple[float, float, float, float] = (97.3, 5.6, 105.7, 20.5)

    # Magnitude weights, see DATA_MODEL.md.
    magnitude_urgency_points: dict[str, int] = {"low": 10, "medium": 25, "high": 45, "critical": 60}
    magnitude_people_max: int = 15
    magnitude_report_bonus: int = 8
    magnitude_report_bonus_max: int = 20
    magnitude_verified_bonus: int = 5

    # Volunteers
    max_active_signups: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
