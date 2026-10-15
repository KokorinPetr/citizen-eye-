from httpx import AsyncClient

from app.core.database import session_factory
from app.modules.auth.enums import UserRole
from app.modules.centers import service as centers_service
from app.modules.centers.enums import CenterSource
from tests.helpers import auth_headers, load_official, official

HAT_YAI = {"lat": 7.0086, "lng": 100.4747}


async def test_nearest_sorted_by_distance_with_meters(client: AsyncClient) -> None:
    await load_official(
        [
            official("Far Hospital", 7.05),  # ~4.6 km
            official("Near Hospital", 7.0176),  # ~1 km
            official("Police box", 7.0090, "police"),
        ]
    )

    response = await client.get(
        "/centers/nearest", params={**HAT_YAI, "center_type": "hospital", "limit": 5}
    )

    hospitals = response.json()
    assert [c["name"] for c in hospitals] == ["Near Hospital", "Far Hospital"]
    assert 950 < hospitals[0]["distance_m"] < 1050
    assert hospitals[0]["is_official"] is True


async def test_nearest_skips_closed_places_and_mixes_community(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    shelter = (
        await client.post(
            "/centers",
            json={"name": "Temple shelter", "center_type": "shelter", "location": HAT_YAI},
            headers=headers,
        )
    ).json()
    await client.patch(f"/centers/{shelter['id']}", json={"status": "closed"}, headers=headers)
    await client.post(
        "/centers",
        json={"name": "School shelter", "center_type": "shelter", "location": HAT_YAI},
        headers=headers,
    )

    names = [c["name"] for c in (await client.get("/centers/nearest", params=HAT_YAI)).json()]

    assert names == ["School shelter"]


async def test_nearest_validates_input(client: AsyncClient) -> None:
    assert (await client.get("/centers/nearest", params={"lat": 7})).status_code == 422
    too_many = {**HAT_YAI, "limit": 100}
    assert (await client.get("/centers/nearest", params=too_many)).status_code == 422


async def test_import_replaces_previous_import_but_keeps_user_places(client: AsyncClient) -> None:
    await client.post(
        "/centers",
        json={"name": "Community kitchen", "center_type": "supply_point", "location": HAT_YAI},
        headers=await auth_headers(client),
    )

    assert await load_official([official("A", 7.01), official("B", 7.02)]) == 2
    assert await load_official([official("A", 7.01)]) == 1

    names = sorted(c["name"] for c in (await client.get("/centers")).json())
    assert names == ["A", "Community kitchen"]


async def test_official_centers_cannot_be_edited_by_users(client: AsyncClient) -> None:
    await load_official([official("Hatyai Hospital", 7.01)])
    center = (await client.get("/centers")).json()[0]

    response = await client.patch(
        f"/centers/{center['id']}", json={"status": "full"}, headers=await auth_headers(client)
    )

    assert response.status_code == 403


async def test_hotlines(client: AsyncClient) -> None:
    hotlines = (await client.get("/hotlines")).json()

    numbers = {h["number"]: h for h in hotlines}
    assert {"191", "199", "1669"} <= numbers.keys()
    assert numbers["1669"]["category"] == "medical"


async def test_export_keeps_coordinator_edits(client: AsyncClient) -> None:
    await load_official([official("Hatyai Hospital", 7.01)])
    center = (await client.get("/centers")).json()[0]
    coordinator = await auth_headers(client, role=UserRole.COORDINATOR)
    await client.patch(
        f"/centers/{center['id']}",
        json={"status": "full", "phone": "074 200 000"},
        headers=coordinator,
    )

    async with session_factory() as session:
        exported = await centers_service.export_official_centers(session, CenterSource.OSM)
    await load_official(exported)  # export → load round trip

    reloaded = (await client.get("/centers")).json()[0]
    assert (reloaded["status"], reloaded["phone"]) == ("full", "074 200 000")
    assert reloaded["source_url"] == center["source_url"]
