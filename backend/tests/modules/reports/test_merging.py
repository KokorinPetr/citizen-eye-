from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.core.base_model import utc_now
from app.core.database import session_factory
from app.integrations.ai.factory import get_ai_connector
from app.integrations.ai.providers.fake import FakeConnector
from app.main import app
from app.modules.auth.enums import UserRole
from app.modules.incidents.models import Incident
from tests.helpers import INCIDENTS_URL, auth_headers

REPORTS_URL = "/reports"
SOI_5 = {"lat": 13.8167, "lng": 100.5612}
SOI_5_100M_AWAY = {"lat": 13.8176, "lng": 100.5612}  # ~100 m north
SOI_5_500M_AWAY = {"lat": 13.8212, "lng": 100.5612}  # ~500 m north


def parsed(**overrides: Any) -> dict[str, Any]:
    return {
        "title": "People trapped, need a boat",
        "summary": "Chest-deep water, people on the second floor.",
        "need_type": "boat",
        "urgency": "high",
        "people_affected": 3,
        "language": "th",
        "tasks": [{"title": "Boat rescue", "role": "boat_operator", "needed_count": 1}],
        **overrides,
    }


@pytest.fixture(autouse=True)
def fake_ai() -> Iterator[None]:
    """The AI is not under test here: every report sends its own `parsed`."""
    app.dependency_overrides[get_ai_connector] = lambda: FakeConnector()
    yield
    app.dependency_overrides.pop(get_ai_connector, None)


@pytest.fixture
def send_report(client: AsyncClient) -> Callable:
    async def send(location: dict, headers: dict | None = None, **parsed_overrides: Any) -> dict:
        response = await client.post(
            REPORTS_URL,
            json={
                "text": "flood report text",
                "location": location,
                "parsed": parsed(**parsed_overrides),
            },
            headers=headers or {},
        )
        assert response.status_code == 201, response.text
        return response.json()

    return send


async def test_second_report_nearby_is_merged(send_report, client: AsyncClient) -> None:
    first = await send_report(SOI_5, await auth_headers(client))
    second = await send_report(
        SOI_5_100M_AWAY, await auth_headers(client), urgency="critical", people_affected=2
    )

    incident = second["incident"]
    assert second["was_merged"] is True
    assert incident["id"] == first["incident"]["id"]
    assert "2 reports from 2 people" in second["message"]
    assert incident["report_count"] == 2
    assert incident["source_count"] == 2
    assert incident["is_verified"] is True
    assert incident["urgency"] == "critical"  # higher one wins
    assert incident["people_affected"] == 3  # max, not sum
    assert incident["magnitude"] > first["incident"]["magnitude"]  # bigger marker
    assert len((await client.get(INCIDENTS_URL)).json()) == 1


async def test_same_person_reporting_twice_does_not_inflate(send_report, client) -> None:
    headers = await auth_headers(client)
    first = await send_report(SOI_5, headers)
    second = await send_report(SOI_5, headers)

    incident = second["incident"]
    assert incident["report_count"] == 2
    assert incident["source_count"] == 1
    assert incident["is_verified"] is False
    assert incident["magnitude"] == first["incident"]["magnitude"]


async def test_anonymous_reports_count_as_one_source(send_report, client) -> None:
    await send_report(SOI_5)
    await send_report(SOI_5)
    third = await send_report(SOI_5, await auth_headers(client))

    assert third["incident"]["report_count"] == 3
    assert third["incident"]["source_count"] == 2  # all anonymous = 1 + the user


async def test_related_need_is_merged(send_report) -> None:
    first = await send_report(SOI_5, need_type="boat")
    second = await send_report(SOI_5_100M_AWAY, need_type="evacuation")

    assert second["was_merged"] is True
    assert second["incident"]["id"] == first["incident"]["id"]


async def test_different_problem_at_same_place_is_separate(send_report, client) -> None:
    await send_report(SOI_5, need_type="boat")
    second = await send_report(SOI_5, need_type="food")

    assert second["was_merged"] is False
    assert len((await client.get(INCIDENTS_URL)).json()) == 2


async def test_far_away_report_is_separate(send_report) -> None:
    await send_report(SOI_5)
    second = await send_report(SOI_5_500M_AWAY)

    assert second["was_merged"] is False


async def test_new_task_roles_are_added_without_duplicates(send_report) -> None:
    await send_report(SOI_5)
    second = await send_report(
        SOI_5,
        tasks=[
            {"title": "Boat rescue", "role": "boat_operator", "needed_count": 1},
            {"title": "First aid", "role": "medic", "needed_count": 1},
        ],
    )

    roles = [task["role"] for task in second["incident"]["tasks"]]
    assert roles == ["boat_operator", "medic"]


async def test_report_reopens_recently_resolved_incident(send_report, client) -> None:
    coordinator_headers = await auth_headers(client, role=UserRole.COORDINATOR)
    first = await send_report(SOI_5)
    incident_id = first["incident"]["id"]
    task_id = first["incident"]["tasks"][0]["id"]
    await client.post(
        f"{INCIDENTS_URL}/{incident_id}/tasks/{task_id}/done", headers=coordinator_headers
    )

    second = await send_report(SOI_5)

    assert second["was_merged"] is True
    assert second["incident"]["status"] == "open"
    assert second["incident"]["tasks"][0]["status"] == "open"


async def test_long_resolved_incident_is_not_reopened(send_report, client) -> None:
    coordinator_headers = await auth_headers(client, role=UserRole.COORDINATOR)
    first = await send_report(SOI_5)
    incident_id = first["incident"]["id"]
    await client.post(f"{INCIDENTS_URL}/{incident_id}/resolve", headers=coordinator_headers)
    async with session_factory() as session:
        await session.execute(
            update(Incident)
            .where(Incident.id == incident_id)
            .values(resolved_at=utc_now() - timedelta(hours=30))
        )
        await session.commit()

    second = await send_report(SOI_5)

    assert second["was_merged"] is False
    assert second["incident"]["id"] != incident_id


async def test_report_history_is_public_and_hides_raw_text(send_report, client) -> None:
    first = await send_report(SOI_5, summary="Two elderly people trapped.")
    await send_report(SOI_5, language="ru", summary="Water still rising.")

    history = (await client.get(f"{INCIDENTS_URL}/{first['incident']['id']}/reports")).json()

    assert [r["summary"] for r in history] == ["Two elderly people trapped.", "Water still rising."]
    assert [r["language"] for r in history] == ["th", "ru"]
    assert all("raw_text" not in r and "flood report text" not in str(r) for r in history)


async def test_failed_ai_report_hides_summary_in_history(client: AsyncClient) -> None:
    class FailingConnector(FakeConnector):
        async def generate_structured(self, *args: Any) -> Any:
            from app.integrations.ai.connector import AIConnectorError

            raise AIConnectorError("down")

    app.dependency_overrides[get_ai_connector] = lambda: FailingConnector()
    response = await client.post(
        REPORTS_URL, json={"text": "call me at 081 234 5678 please", "location": SOI_5}
    )
    incident_id = response.json()["incident"]["id"]

    history = (await client.get(f"{INCIDENTS_URL}/{incident_id}/reports")).json()

    assert history[0]["status"] == "failed"
    assert history[0]["summary"] is None
