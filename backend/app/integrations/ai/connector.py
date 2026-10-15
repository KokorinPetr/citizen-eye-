"""Provider-agnostic AI interface. The app only talks to `AIConnector`, never to a vendor API."""

from typing import Protocol, TypeVar

from pydantic import BaseModel

OutputT = TypeVar("OutputT", bound=BaseModel)


class AIConnectorError(Exception):
    """Any provider failure: network, HTTP error, bad JSON, schema mismatch, missing API key."""


class AIConnector(Protocol):
    provider_name: str
    model_name: str

    async def generate_structured(
        self, system_prompt: str, user_prompt: str, output_schema: type[OutputT]
    ) -> OutputT:
        """Return the model's answer parsed and validated as `output_schema`."""
        ...
