import json

import httpx
import pytest
from pydantic import BaseModel

from app.integrations.ai.connector import AIConnectorError
from app.integrations.ai.providers.openai_compatible import OpenAICompatibleConnector


class Answer(BaseModel):
    need_type: str
    people: int


def make_connector(handler, api_key: str | None = "test-key") -> OpenAICompatibleConnector:
    return OpenAICompatibleConnector(
        provider_name="deepseek",
        base_url="https://api.deepseek.test",
        api_key=api_key,
        model_name="deepseek-flash",
        timeout_seconds=5,
        transport=httpx.MockTransport(handler),
    )


def completion(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


async def test_sends_json_mode_request_and_parses_answer() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return completion('{"need_type": "food", "people": 3}')

    answer = await make_connector(handler).generate_structured("system", "user text", Answer)

    assert answer == Answer(need_type="food", people=3)
    assert seen["url"] == "https://api.deepseek.test/chat/completions"
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"]["model"] == "deepseek-flash"
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert seen["body"]["max_tokens"] == 1500
    assert [m["role"] for m in seen["body"]["messages"]] == ["system", "user"]


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="server error"),
        httpx.Response(401, json={"error": "bad key"}),
        completion("not json"),
        completion('{"need_type": "food"}'),  # missing field
        completion(""),  # DeepSeek JSON mode can return empty content
        httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
        httpx.Response(200, json={"unexpected": True}),
    ],
)
async def test_failures_raise_connector_error(response: httpx.Response) -> None:
    with pytest.raises(AIConnectorError):
        await make_connector(lambda request: response).generate_structured("s", "u", Answer)


async def test_network_error_raises_connector_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no network")

    with pytest.raises(AIConnectorError):
        await make_connector(handler).generate_structured("s", "u", Answer)


async def test_missing_api_key_raises_without_calling() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("must not be called")

    with pytest.raises(AIConnectorError, match="AI_API_KEY"):
        await make_connector(handler, api_key="").generate_structured("s", "u", Answer)


async def test_json_wrapped_in_code_fences_is_accepted() -> None:
    fenced = '```json\n{"need_type": "water", "people": 2}\n```'

    answer = await make_connector(lambda request: completion(fenced)).generate_structured(
        "s", "u", Answer
    )

    assert answer == Answer(need_type="water", people=2)
