from httpx import AsyncClient

from app.modules.auth.enums import UserRole
from tests.helpers import INCIDENTS_URL, auth_headers, bearer, create_incident, register_user

TWO_TASKS = [
    {"title": "Drive to clinic", "role": "driver", "needed_count": 1},
    {"title": "Carry to the car", "role": "carrier", "needed_count": 2},
]


async def sign_up(client: AsyncClient, incident_id: str, headers: dict, task_id: str | None = None):
    return await client.post(
        f"{INCIDENTS_URL}/{incident_id}/volunteers", json={"task_id": task_id}, headers=headers
    )


async def get_incident(client: AsyncClient, incident_id: str) -> dict:
    return (await client.get(f"{INCIDENTS_URL}/{incident_id}")).json()


async def test_sign_up_picks_first_free_task_and_updates_counters(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client), tasks=TWO_TASKS)
    driver_task, carrier_task = incident["tasks"]

    first = await sign_up(client, incident["id"], await auth_headers(client))
    second = await sign_up(client, incident["id"], await auth_headers(client))
    card = await get_incident(client, incident["id"])

    assert first.status_code == 201
    assert first.json()["task"]["id"] == driver_task["id"]
    assert second.json()["task"]["id"] == carrier_task["id"]
    assert card["status"] == "in_progress"
    assert card["helpers_needed"] == 3
    assert card["helpers_signed_up"] == 2
    assert [(t["status"], t["signed_up_count"], t["spots_left"]) for t in card["tasks"]] == [
        ("filled", 1, 0),
        ("open", 1, 1),
    ]


async def test_cannot_take_a_full_task_or_sign_up_twice(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client), tasks=TWO_TASKS)
    driver_task_id = incident["tasks"][0]["id"]
    volunteer = await auth_headers(client)

    await sign_up(client, incident["id"], volunteer, driver_task_id)
    twice = await sign_up(client, incident["id"], volunteer)
    full = await sign_up(client, incident["id"], await auth_headers(client), driver_task_id)

    assert twice.status_code == 409
    assert full.status_code == 409


async def test_all_tasks_covered(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client))  # 1 general helper
    await sign_up(client, incident["id"], await auth_headers(client))

    response = await sign_up(client, incident["id"], await auth_headers(client))

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "All tasks are already covered"


async def test_max_two_active_signups(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    volunteer = await auth_headers(client)
    incidents = [await create_incident(client, owner) for _ in range(3)]

    results = [await sign_up(client, incident["id"], volunteer) for incident in incidents]

    assert [r.status_code for r in results] == [201, 201, 409]


async def test_resolved_incidents_do_not_count_toward_limit(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    volunteer = await auth_headers(client)
    first, second, third = [await create_incident(client, owner) for _ in range(3)]
    await sign_up(client, first["id"], volunteer)
    await sign_up(client, second["id"], volunteer)

    await client.post(f"{INCIDENTS_URL}/{first['id']}/resolve", headers=owner)

    assert (await sign_up(client, third["id"], volunteer)).status_code == 201


async def test_cancel_signup(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client))
    volunteer = await auth_headers(client)
    signup = (await sign_up(client, incident["id"], volunteer)).json()
    url = f"{INCIDENTS_URL}/{incident['id']}/volunteers/{signup['id']}"

    by_stranger = await client.delete(url, headers=await auth_headers(client))
    by_volunteer = await client.delete(url, headers=volunteer)
    again = await client.delete(url, headers=volunteer)
    card = await get_incident(client, incident["id"])

    assert by_stranger.status_code == 403
    assert by_volunteer.status_code == 204
    assert again.status_code == 409
    assert card["status"] == "open"
    assert card["helpers_signed_up"] == 0
    assert card["tasks"][0]["status"] == "open"


async def test_coordinator_can_cancel_any_signup(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client))
    signup = (await sign_up(client, incident["id"], await auth_headers(client))).json()
    coordinator = await auth_headers(client, role=UserRole.COORDINATOR)

    response = await client.delete(
        f"{INCIDENTS_URL}/{incident['id']}/volunteers/{signup['id']}", headers=coordinator
    )

    assert response.status_code == 204


async def test_volunteer_completes_tasks_and_incident_resolves(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    incident = await create_incident(client, owner, tasks=TWO_TASKS)
    driver_task, carrier_task = incident["tasks"]
    driver = await auth_headers(client)
    await sign_up(client, incident["id"], driver, driver_task["id"])
    done_url = f"{INCIDENTS_URL}/{incident['id']}/tasks/{{}}/done"

    by_stranger = await client.post(
        done_url.format(driver_task["id"]), headers=await auth_headers(client)
    )
    other_task = await client.post(done_url.format(carrier_task["id"]), headers=driver)
    driver_done = await client.post(done_url.format(driver_task["id"]), headers=driver)
    owner_done = await client.post(done_url.format(carrier_task["id"]), headers=owner)

    assert by_stranger.status_code == 403
    assert other_task.status_code == 403
    assert driver_done.status_code == 200
    assert driver_done.json()["status"] == "in_progress"
    assert driver_done.json()["helpers_needed"] == 2  # only the carrier task is left
    assert owner_done.json()["status"] == "resolved"
    assert owner_done.json()["resolved_at"] is not None


async def test_completed_signup_frees_the_limit(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    volunteer = await auth_headers(client)
    first, second, third = [await create_incident(client, owner) for _ in range(3)]
    task_id = (await sign_up(client, first["id"], volunteer)).json()["task"]["id"]
    await sign_up(client, second["id"], volunteer)

    await client.post(f"{INCIDENTS_URL}/{first['id']}/tasks/{task_id}/done", headers=volunteer)

    assert (await sign_up(client, third["id"], volunteer)).status_code == 201


async def test_cannot_sign_up_for_resolved_incident(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    incident = await create_incident(client, owner)
    await client.post(f"{INCIDENTS_URL}/{incident['id']}/resolve", headers=owner)

    response = await sign_up(client, incident["id"], await auth_headers(client))

    assert response.status_code == 409


async def test_reopen_resets_done_tasks(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    incident = await create_incident(client, owner)
    task_id = incident["tasks"][0]["id"]
    await client.post(f"{INCIDENTS_URL}/{incident['id']}/tasks/{task_id}/done", headers=owner)

    reopened = await client.post(f"{INCIDENTS_URL}/{incident['id']}/reopen", headers=owner)

    assert reopened.json()["status"] == "open"
    assert reopened.json()["tasks"][0]["status"] == "open"


async def test_owner_adds_task(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    incident = await create_incident(client, owner)
    task = {"title": "Bring dry clothes", "role": "general", "needed_count": 2}
    url = f"{INCIDENTS_URL}/{incident['id']}/tasks"

    by_stranger = await client.post(url, json=task, headers=await auth_headers(client))
    by_owner = await client.post(url, json=task, headers=owner)

    assert by_stranger.status_code == 403
    assert by_owner.status_code == 201
    assert [t["title"] for t in by_owner.json()["tasks"]][-1] == "Bring dry clothes"
    assert by_owner.json()["helpers_needed"] == 3


async def test_public_volunteer_lists(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client), tasks=TWO_TASKS)
    volunteer = await register_user(client, full_name="Somchai", has_vehicle=True)
    await sign_up(client, incident["id"], bearer(volunteer["tokens"]["access_token"]))

    on_incident = (await client.get(f"{INCIDENTS_URL}/{incident['id']}/volunteers")).json()
    user_signups = (await client.get(f"/users/{volunteer['user']['id']}/signups")).json()

    assert on_incident[0]["user"] == {
        "id": volunteer["user"]["id"],
        "full_name": "Somchai",
        "has_vehicle": True,
    }
    assert on_incident[0]["task"]["role"] == "driver"
    assert on_incident[0]["status"] == "going"
    assert user_signups[0]["incident"]["id"] == incident["id"]
    assert user_signups[0]["incident"]["status"] == "in_progress"


async def test_map_list_shows_helper_counter(client: AsyncClient) -> None:
    incident = await create_incident(client, await auth_headers(client), tasks=TWO_TASKS)
    await sign_up(client, incident["id"], await auth_headers(client))

    item = (await client.get(INCIDENTS_URL)).json()[0]

    assert (item["helpers_signed_up"], item["helpers_needed"]) == (1, 3)
