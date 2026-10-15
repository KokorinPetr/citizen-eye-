from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from app.integrations.routing import Route, RoutingError, get_router
from app.main import app
from app.modules.auth.enums import UserRole
from app.shared.geo import GeoPoint
from tests.helpers import INCIDENTS_URL, auth_headers, create_incident, load_official, official

HAT_YAI = {"lat": 7.0086, "lng": 100.4747}


class FakeRouter:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls = 0

    async def get_route(self, start: GeoPoint, end: GeoPoint) -> Route:
        self.calls += 1
        if self.fail:
            raise RoutingError("down")
        return Route(
            distance_m=1500, duration_s=240, path=[(start.lat, start.lng), (end.lat, end.lng)]
        )


@pytest.fixture
def use_router() -> Iterator:
    def install(router: FakeRouter) -> FakeRouter:
        app.dependency_overrides[get_router] = lambda: router
        return router

    yield install
    app.dependency_overrides.pop(get_router, None)


async def create_shelter(client: AsyncClient, name: str, lat: float, **extra) -> dict:
    response = await client.post(
        "/centers",
        json={"name": name, "location": {"lat": lat, "lng": 100.4747}, **extra},
        headers=await auth_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_routes_to_nearest_shelters(client: AsyncClient, use_router) -> None:
    router = use_router(FakeRouter())
    await create_shelter(client, "Far shelter", 7.04)
    await create_shelter(client, "Near shelter", 7.012)

    response = await client.get(
        "/centers/nearest/routes", params={**HAT_YAI, "center_type": "shelter", "limit": 2}
    )

    body = response.json()
    assert response.status_code == 200
    assert "flooded" in body["warning"]
    assert [r["center"]["name"] for r in body["routes"]] == ["Near shelter", "Far shelter"]
    assert body["routes"][0]["route"] == {
        "kind": "road",
        "distance_m": 1500,
        "duration_s": 240,
        "path": [[7.0086, 100.4747], [7.012, 100.4747]],
    }
    assert router.calls == 2


async def test_routing_down_falls_back_to_straight_lines(client: AsyncClient, use_router) -> None:
    use_router(FakeRouter(fail=True))
    shelter = await create_shelter(client, "Near shelter", 7.012)

    route = (await client.get("/centers/nearest/routes", params=HAT_YAI)).json()["routes"][0][
        "route"
    ]

    assert route["kind"] == "straight_line"
    assert route["duration_s"] is None
    assert 350 < route["distance_m"] < 450  # ~0.0034° of latitude
    assert route["path"] == [[7.0086, 100.4747], [shelter["location"]["lat"], 100.4747]]


async def test_route_limit_is_capped(client: AsyncClient, use_router) -> None:
    use_router(FakeRouter())
    assert (
        await client.get("/centers/nearest/routes", params={**HAT_YAI, "limit": 10})
    ).status_code == 422


async def test_center_filters(client: AsyncClient) -> None:
    await load_official([official("Hatyai Hospital", 7.01)])
    await create_shelter(client, "Kitchen", 7.011, center_type="supply_point", supplies=["food"])
    await create_shelter(
        client, "Clinic point", 7.012, center_type="supply_point", supplies=["medicine"]
    )
    full = await create_shelter(client, "Full shelter", 7.013, center_type="shelter")
    coordinator = await auth_headers(client, role=UserRole.COORDINATOR)
    await client.patch(f"/centers/{full['id']}", json={"status": "full"}, headers=coordinator)

    async def names(**params) -> list[str]:
        return sorted(c["name"] for c in (await client.get("/centers", params=params)).json())

    assert await names(official="true") == ["Hatyai Hospital"]
    assert await names(official="false") == ["Clinic point", "Full shelter", "Kitchen"]
    assert await names(supply=["food", "medicine"]) == ["Clinic point", "Kitchen"]
    assert await names(status=["full"]) == ["Full shelter"]
    assert await names(center_type=["hospital", "shelter"]) == ["Full shelter", "Hatyai Hospital"]


async def test_incident_filters(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    boat = await create_incident(client, headers, need_type="boat", urgency="critical")
    food = await create_incident(client, headers, need_type="food", urgency="low")
    await create_incident(client, headers, need_type="medicine", urgency="medium")

    async def ids(**params) -> set[str]:
        return {i["id"] for i in (await client.get(INCIDENTS_URL, params=params)).json()}

    assert await ids(need_type=["boat", "food"]) == {boat["id"], food["id"]}
    assert await ids(urgency=["critical"]) == {boat["id"]}
    assert await ids(verified="true") == set()
    assert len(await ids(verified="false")) == 3
