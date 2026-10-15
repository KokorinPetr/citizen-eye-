"""Offline connector for tests and demos without an API key. No network calls."""

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from app.integrations.ai.connector import AIConnectorError, OutputT

FakeResponder = Callable[[str], BaseModel | dict[str, Any]]


class FakeConnector:
    """Answers with the responder registered for a schema, else the schema's first example."""

    provider_name = "fake"
    model_name = "fake"

    def __init__(self, responders: dict[type[BaseModel], FakeResponder] | None = None) -> None:
        self._responders = responders or {}
        self.calls: list[str] = []  # user prompts, for assertions in tests

    async def generate_structured(
        self, system_prompt: str, user_prompt: str, output_schema: type[OutputT]
    ) -> OutputT:
        self.calls.append(user_prompt)
        responder = self._responders.get(output_schema)
        if responder is not None:
            return output_schema.model_validate(responder(user_prompt))

        examples = output_schema.model_json_schema().get("examples")
        if not examples:
            raise AIConnectorError(f"FakeConnector has no answer for {output_schema.__name__}")
        return output_schema.model_validate(examples[0])
