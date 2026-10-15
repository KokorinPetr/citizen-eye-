import httpx
import pytest

from app.integrations.routing import OsrmRouter, RoutingError
from app.shared.geo import GeoPoint

START = GeoPoint(lat=7.0086, lng=100.4747)
END = GeoPoint(lat=7.0200, lng=100.4700)


def make_router(handler) -> OsrmRouter:
    return OsrmRouter("https://osrm.test", "driving", 5, transport=httpx.MockTransport(handler))


async def test_route_is_parsed_and_path_is_lat_lng() -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "routes": [
                    {
                        "distance": 1760.2,
                        "duration": 181.1,
                        "geometry": {"coordinates": [[100.4747, 7.0086], [100.47, 7.02]]},
                    }
                ],
            },
        )

    route = await make_router(handler).get_route(START, END)

    assert "/route/v1/driving/100.4747,7.0086;100.47,7.02" in seen["url"]
    assert (route.distance_m, route.duration_s) == (1760, 181)
    assert route.path == [(7.0086, 100.4747), (7.02, 100.47)]


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"code": "NoRoute", "message": "Impossible route"}),
        httpx.Response(429, json={"code": "TooBig"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"code": "Ok", "routes": [{"distance": 1}]}),
    ],
)
async def test_failures_raise_routing_error(response: httpx.Response) -> None:
    with pytest.raises(RoutingError):
        await make_router(lambda request: response).get_route(START, END)


async def test_network_error_raises_routing_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    with pytest.raises(RoutingError):
        await make_router(handler).get_route(START, END)
