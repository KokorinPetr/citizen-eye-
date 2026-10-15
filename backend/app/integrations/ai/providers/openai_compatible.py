"""Any provider with an OpenAI-style `/chat/completions` API (DeepSeek, OpenAI, ...)."""

import json
import re

import httpx
from pydantic import ValidationError

from app.integrations.ai.connector import AIConnectorError, OutputT

CODE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


class OpenAICompatibleConnector:
    def __init__(
        self,
        *,
        provider_name: str,
        base_url: str,
        api_key: str | None,
        model_name: str,
        timeout_seconds: float,
        max_tokens: int = 1500,
        transport: httpx.AsyncBaseTransport | None = None,  # injected in tests
    ) -> None:
        self.provider_name = provider_name
        self.model_name = model_name
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._max_tokens = max_tokens
        self._transport = transport

    async def generate_structured(
        self, system_prompt: str, user_prompt: str, output_schema: type[OutputT]
    ) -> OutputT:
        if not self._api_key:
            raise AIConnectorError(
                f"No API key for '{self.provider_name}': set AI_API_KEY or DEEPSEEK_API_KEY"
            )

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": self._max_tokens,
            "temperature": 0,
        }
        content = clean_json_content(await self._post_chat_completion(payload))
        if not content:  # DeepSeek docs: JSON mode may occasionally return empty content
            raise AIConnectorError(f"{self.provider_name} returned an empty answer")
        try:
            return output_schema.model_validate(json.loads(content))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise AIConnectorError(f"AI returned invalid {output_schema.__name__}: {exc}") from exc

    async def _post_chat_completion(self, payload: dict) -> str:
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds, transport=self._transport
            ) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
        except httpx.HTTPError as exc:
            raise AIConnectorError(f"{self.provider_name} request failed: {exc!r}") from exc

        if response.status_code != 200:
            raise AIConnectorError(
                f"{self.provider_name} returned {response.status_code}: {response.text[:300]}"
            )
        try:
            return response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AIConnectorError(f"Unexpected {self.provider_name} response format") from exc


def clean_json_content(content: str | None) -> str:
    """Some models wrap JSON in ```json fences even in JSON mode."""
    return CODE_FENCE.sub("", (content or "").strip())
