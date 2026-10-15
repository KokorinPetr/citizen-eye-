from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.core.config import get_settings
from app.integrations.ai.connector import AIConnector
from app.integrations.ai.providers.fake import FakeConnector
from app.integrations.ai.providers.openai_compatible import OpenAICompatibleConnector

PROVIDER_BASE_URLS = {
    "deepseek": "https://api.deepseek.com",
    "openai": "https://api.openai.com/v1",
}


@lru_cache
def get_ai_connector() -> AIConnector:
    """Connector chosen by AI_PROVIDER. Also a FastAPI dependency (override it in tests)."""
    settings = get_settings()
    if settings.ai_provider == "fake":
        return FakeConnector()
    return OpenAICompatibleConnector(
        provider_name=settings.ai_provider,
        base_url=settings.ai_base_url or PROVIDER_BASE_URLS[settings.ai_provider],
        api_key=settings.resolved_ai_api_key,
        model_name=settings.ai_model,
        timeout_seconds=settings.ai_timeout_seconds,
        max_tokens=settings.ai_max_tokens,
    )


AIConnectorDep = Annotated[AIConnector, Depends(get_ai_connector)]
