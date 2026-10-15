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

    # Merging reports (Phase 5)
    dedup_radius_m: int = 200
    reopen_window_hours: int = 24  # a new report reopens an incident resolved this recently
    verified_min_sources: int = 2  # independent sources needed for `is_verified`

    # Volunteers
    max_active_signups: int = 2

    # AI (see app/integrations/ai). Empty AI_API_KEY → AI calls fail and reports use the fallback.
    ai_provider: Literal["deepseek", "openai", "fake"] = "fake"
    ai_model: str = "deepseek-flash"  # DeepSeek: deepseek-flash (fast) or deepseek-v4-pro
    ai_api_key: SecretStr | None = None
    deepseek_api_key: SecretStr | None = None  # accepted too, same as in other projects
    ai_base_url: str | None = None  # override the provider's default URL
    ai_timeout_seconds: float = 30.0
    ai_max_tokens: int = 1500  # DeepSeek JSON mode: too low cuts the JSON off

    @property
    def resolved_ai_api_key(self) -> str | None:
        """First non-empty of AI_API_KEY, DEEPSEEK_API_KEY."""
        for key in (self.ai_api_key, self.deepseek_api_key):
            if key and key.get_secret_value().strip():
                return key.get_secret_value().strip()
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
