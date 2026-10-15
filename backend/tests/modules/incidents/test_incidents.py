from httpx import AsyncClient

from app.modules.auth.enums import UserRole
from tests.helpers import (
    INCIDENTS_URL,
    INSIDE_BBOX,
    MAP_BBOX,
    OUTSIDE_BBOX,
    auth_headers,
    create_incident,
    incident_data,
)


async def test_create_incident_requires_auth(client: AsyncClient) -> None:
    response = await client.post(INCIDENTS_URL, json=incident_data())
    assert response.status_code == 401


async def test_create_incident(client: AsyncClient) -> None:
    headers = await auth_headers(client)

    incident = await create_incident(client, headers)

    assert incident["location"] == INSIDE_BBOX
    assert incident["status"] == "open"
    assert incident["magnitude"] == 48  # high (45) + 3 people
    assert incident["magnitude_level"] == 3
    assert incident["report_count"] == 1
    assert incident["helpers_needed"] == 1
    assert [task["role"] for task in incident["tasks"]] == ["general"]
    assert incident["owner_id"] is not None


async def test_create_incident_with_tasks(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    tasks = [
        {"title": "Drive to clinic", "role": "driver", "needed_count": 1},
        {"title": "Carry to the car", "role": "carrier", "needed_count": 2},
    ]

    incident = await create_incident(client, headers, tasks=tasks)

    assert incident["helpers_needed"] == 3
    assert [task["role"] for task in incident["tasks"]] == ["driver", "carrier"]


async def test_create_incident_outside_service_area(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    response = await client.post(
        INCIDENTS_URL, json=incident_data(location={"lat": 51.5, "lng": -0.12}), headers=headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_input"


async def test_list_filters_by_bbox_status_and_need_type(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    inside = await create_incident(client, headers, urgency="critical")
    await create_incident(client, headers, location=OUTSIDE_BBOX)
    food = await create_incident(client, headers, need_type="food", urgency="low")
    resolved = await create_incident(client, headers)
    await client.post(f"{INCIDENTS_URL}/{resolved['id']}/resolve", headers=headers)

    in_view = (await client.get(INCIDENTS_URL, params={"bbox": MAP_BBOX})).json()
    only_food = (await client.get(INCIDENTS_URL, params={"need_type": "food"})).json()
    only_resolved = (await client.get(INCIDENTS_URL, params={"status": "resolved"})).json()

    assert [item["id"] for item in in_view] == [inside["id"], food["id"]]  # biggest first
    assert [item["id"] for item in only_food] == [food["id"]]
    assert [item["id"] for item in only_resolved] == [resolved["id"]]


async def test_list_is_public_and_validates_bbox(client: AsyncClient) -> None:
    assert (await client.get(INCIDENTS_URL)).status_code == 200
    assert (await client.get(INCIDENTS_URL, params={"bbox": "1,2,3"})).status_code == 422


async def test_get_incident(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client))

    found = await client.get(f"{INCIDENTS_URL}/{incident['id']}")
    missing = await client.get(f"{INCIDENTS_URL}/00000000-0000-0000-0000-000000000000")

    assert found.status_code == 200
    assert found.json()["tasks"] == incident["tasks"]
    assert missing.status_code == 404


async def test_contact_phone_only_for_logged_in_users(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    incident = await create_incident(client, headers, contact_phone="+66 81 234 5678")
    url = f"{INCIDENTS_URL}/{incident['id']}"

    anonymous = (await client.get(url)).json()
    logged_in = (await client.get(url, headers=await auth_headers(client))).json()
    map_items = (await client.get(INCIDENTS_URL)).json()

    assert anonymous["contact_phone"] is None
    assert logged_in["contact_phone"] == "+66 81 234 5678"
    assert "contact_phone" not in map_items[0]


async def test_invalid_contact_phone(client: AsyncClient) -> None:
    response = await client.post(
        INCIDENTS_URL,
        json=incident_data(contact_phone="call me maybe"),
        headers=await auth_headers(client),
    )
    assert response.status_code == 422


async def test_owner_can_move_pin_but_others_cannot(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    stranger = await auth_headers(client)
    incident = await create_incident(client, owner)
    url = f"{INCIDENTS_URL}/{incident['id']}"
    new_location = {"lat": 13.8200, "lng": 100.5650}

    by_stranger = await client.patch(url, json={"location": new_location}, headers=stranger)
    by_owner = await client.patch(url, json={"location": new_location}, headers=owner)

    assert by_stranger.status_code == 403
    assert by_owner.status_code == 200
    assert by_owner.json()["location"] == new_location
    assert by_owner.json()["title"] == incident["title"]


async def test_coordinator_can_manage_any_incident(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client))
    coordinator = await auth_headers(client, role=UserRole.COORDINATOR)

    response = await client.patch(
        f"{INCIDENTS_URL}/{incident['id']}", json={"title": "Updated title"}, headers=coordinator
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated title"


async def test_resolve_and_reopen(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    incident = await create_incident(client, owner)
    url = f"{INCIDENTS_URL}/{incident['id']}"

    resolved = await client.post(f"{url}/resolve", headers=owner)
    resolved_again = await client.post(f"{url}/resolve", headers=owner)
    reopened = await client.post(f"{url}/reopen", headers=owner)
    reopen_open = await client.post(f"{url}/reopen", headers=owner)

    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None
    assert resolved_again.status_code == 409
    assert reopened.json()["status"] == "open"
    assert reopened.json()["resolved_at"] is None
    assert reopen_open.status_code == 409


async def test_delete_incident(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    stranger = await auth_headers(client)
    incident = await create_incident(client, owner)
    url = f"{INCIDENTS_URL}/{incident['id']}"

    assert (await client.delete(url, headers=stranger)).status_code == 403
    assert (await client.delete(url, headers=owner)).status_code == 204
    assert (await client.get(url)).status_code == 404
