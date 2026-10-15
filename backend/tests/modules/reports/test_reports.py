from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from app.integrations.ai.connector import AIConnectorError
from app.integrations.ai.factory import get_ai_connector
from app.integrations.ai.providers.fake import FakeConnector
from app.main import app
from app.modules.reports.schemas import ParsedReport
from tests.helpers import INCIDENTS_URL, INSIDE_BBOX, auth_headers

REPORTS_URL = "/reports"
THAI_TEXT = "น้ำท่วมถึงหน้าอก ซอย 5 มีคนติดอยู่ 4 คน ต้องการเรือด่วน"

PARSED_BOAT = {
    "is_request_for_help": True,
    "title": "Four people trapped, need a boat",
    "summary": "Chest-deep water on Soi 5, four people trapped.",
    "need_type": "boat",
    "urgency": "critical",
    "people_affected": 4,
    "location_text": "ซอย 5",
    "language": "th",
    "tasks": [
        {"title": "Boat rescue", "role": "boat_operator", "needed_count": 2},
        {"title": "Help people into the boat", "role": "carrier", "needed_count": 2},
    ],
}


class FailingConnector:
    provider_name = "failing"
    model_name = "failing"

    async def generate_structured(self, system_prompt, user_prompt, output_schema):
        raise AIConnectorError("provider down")


@pytest.fixture
def use_ai() -> Iterator:
    """Install a connector for the request: `use_ai(FakeConnector(...))`."""

    def install(connector) -> object:
        app.dependency_overrides[get_ai_connector] = lambda: connector
        return connector

    yield install
    app.dependency_overrides.pop(get_ai_connector, None)


def boat_ai() -> FakeConnector:
    return FakeConnector({ParsedReport: lambda prompt: PARSED_BOAT})


async def test_anonymous_report_creates_incident_from_ai(client: AsyncClient, use_ai) -> None:
    ai = use_ai(boat_ai())

    response = await client.post(
        REPORTS_URL,
        json={"text": THAI_TEXT, "location": INSIDE_BBOX, "contact_phone": "+66 81 111 2222"},
    )

    assert response.status_code == 201
    body = response.json()
    incident = body["incident"]
    assert body["status"] == "parsed"
    assert incident["title"] == "Four people trapped, need a boat"
    assert incident["need_type"] == "boat"
    assert incident["urgency"] == "critical"
    assert incident["magnitude"] == 64  # critical 60 + 4 people
    assert incident["location"] == INSIDE_BBOX
    assert incident["owner_id"] is None
    assert incident["helpers_needed"] == 4
    assert [t["role"] for t in incident["tasks"]] == ["boat_operator", "carrier"]
    assert THAI_TEXT in ai.calls[0]  # the raw text reached the AI


async def test_logged_in_reporter_owns_the_incident(client: AsyncClient, use_ai) -> None:
    use_ai(boat_ai())
    headers = await auth_headers(client)
    me = (await client.get("/auth/me", headers=headers)).json()

    response = await client.post(
        REPORTS_URL, json={"text": THAI_TEXT, "location": INSIDE_BBOX}, headers=headers
    )

    assert response.json()["incident"]["owner_id"] == me["id"]


async def test_ai_failure_still_puts_report_on_map(client: AsyncClient, use_ai) -> None:
    use_ai(FailingConnector())

    response = await client.post(REPORTS_URL, json={"text": THAI_TEXT, "location": INSIDE_BBOX})

    body = response.json()
    assert response.status_code == 201
    assert body["status"] == "failed"
    assert body["incident"]["title"] == THAI_TEXT
    assert body["incident"]["need_type"] == "other"
    assert body["incident"]["urgency"] == "medium"
    map_ids = [item["id"] for item in (await client.get(INCIDENTS_URL)).json()]
    assert body["incident"]["id"] in map_ids


async def test_not_a_request_for_help_is_rejected(client: AsyncClient, use_ai) -> None:
    use_ai(FakeConnector({ParsedReport: lambda p: {**PARSED_BOAT, "is_request_for_help": False}}))

    response = await client.post(
        REPORTS_URL, json={"text": "Buy cheap phones now!!!", "location": INSIDE_BBOX}
    )

    assert response.status_code == 201
    assert response.json()["status"] == "rejected"
    assert response.json()["incident"] is None
    assert (await client.get(INCIDENTS_URL)).json() == []


async def test_preview_then_submit_confirmed_without_second_ai_call(
    client: AsyncClient, use_ai
) -> None:
    ai = use_ai(boat_ai())

    preview = (await client.post(f"{REPORTS_URL}/preview", json={"text": THAI_TEXT})).json()
    edited = {**preview, "urgency": "high", "people_affected": 6}
    submitted = await client.post(
        REPORTS_URL, json={"text": THAI_TEXT, "location": INSIDE_BBOX, "parsed": edited}
    )

    assert preview["need_type"] == "boat"
    assert len(ai.calls) == 1  # only the preview called the AI
    assert submitted.json()["incident"]["urgency"] == "high"
    assert submitted.json()["incident"]["people_affected"] == 6


async def test_preview_returns_503_when_ai_is_down(client: AsyncClient, use_ai) -> None:
    use_ai(FailingConnector())

    response = await client.post(f"{REPORTS_URL}/preview", json={"text": THAI_TEXT})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


async def test_location_is_checked_before_calling_ai(client: AsyncClient, use_ai) -> None:
    ai = use_ai(boat_ai())

    response = await client.post(
        REPORTS_URL, json={"text": THAI_TEXT, "location": {"lat": 51.5, "lng": -0.12}}
    )

    assert response.status_code == 422
    assert ai.calls == []


async def test_default_fake_provider_works_without_overrides(client: AsyncClient) -> None:
    response = await client.post(REPORTS_URL, json={"text": THAI_TEXT, "location": INSIDE_BBOX})

    assert response.status_code == 201
    assert response.json()["incident"]["need_type"] == "medicine"  # schema example
