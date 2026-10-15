from typing import Any

from httpx import AsyncClient

from app.modules.auth.enums import UserRole
from tests.helpers import auth_headers

CENTERS_URL = "/centers"
HAT_YAI = {"lat": 7.0086, "lng": 100.4747}
CHIANG_MAI = {"lat": 18.7883, "lng": 98.9853}
HAT_YAI_BBOX = "100.3,6.9,100.6,7.1"


def center_data(**overrides: Any) -> dict[str, Any]:
    return {
        "name": "Wat Hat Yai Nai shelter",
        "description": "Temple hall, dry floor",
        "center_type": "shelter",
        "location": HAT_YAI,
        "phone": "+66 74 123 456",
        "capacity": 120,
        "supplies": ["food", "water"],
        **overrides,
    }


async def create_center(client: AsyncClient, headers: dict[str, str], **overrides: Any) -> dict:
    response = await client.post(CENTERS_URL, json=center_data(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_center_requires_auth(client: AsyncClient) -> None:
    assert (await client.post(CENTERS_URL, json=center_data())).status_code == 401


async def test_user_creates_shelter(client: AsyncClient) -> None:
    center = await create_center(client, await auth_headers(client))

    assert center["location"] == HAT_YAI
    assert center["source"] == "user"
    assert center["is_official"] is False
    assert center["status"] == "open"
    assert center["supplies"] == ["food", "water"]
    assert center["phone"] == "+66 74 123 456"


async def test_list_filters(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    shelter = await create_center(client, headers)
    supply = await create_center(
        client, headers, name="Medicine point", center_type="supply_point", supplies=["medicine"]
    )
    await create_center(client, headers, name="Chiang Mai shelter", location=CHIANG_MAI)

    in_hat_yai = (await client.get(CENTERS_URL, params={"bbox": HAT_YAI_BBOX})).json()
    supply_points = (await client.get(CENTERS_URL, params={"center_type": "supply_point"})).json()
    with_medicine = (await client.get(CENTERS_URL, params={"supply": "medicine"})).json()

    assert {item["id"] for item in in_hat_yai} == {shelter["id"], supply["id"]}
    assert [item["id"] for item in supply_points] == [supply["id"]]
    assert [item["id"] for item in with_medicine] == [supply["id"]]


async def test_owner_updates_status_and_supplies(client: AsyncClient) -> None:
    owner = await auth_headers(client)
    stranger = await auth_headers(client)
    center = await create_center(client, owner)
    url = f"{CENTERS_URL}/{center['id']}"
    changes = {"status": "full", "supplies": ["water", "medicine"]}

    assert (await client.patch(url, json=changes, headers=stranger)).status_code == 403
    response = await client.patch(url, json=changes, headers=owner)

    assert response.status_code == 200
    assert response.json()["status"] == "full"
    assert response.json()["supplies"] == ["water", "medicine"]
    assert response.json()["name"] == center["name"]


async def test_coordinator_can_delete_any_center(client: AsyncClient) -> None:
    center = await create_center(client, await auth_headers(client))
    coordinator = await auth_headers(client, role=UserRole.COORDINATOR)
    url = f"{CENTERS_URL}/{center['id']}"

    assert (await client.delete(url, headers=coordinator)).status_code == 204
    assert (await client.get(url)).status_code == 404


async def test_center_validation(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    london = await client.post(
        CENTERS_URL, json=center_data(location={"lat": 51.5, "lng": -0.12}), headers=headers
    )
    bad_supply = await client.post(
        CENTERS_URL, json=center_data(supplies=["gold"]), headers=headers
    )

    assert london.status_code == 422
    assert bad_supply.status_code == 422
