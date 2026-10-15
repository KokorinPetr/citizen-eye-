"""Road routes between two points via an OSRM-compatible server (public OSM data).

OSRM does not know which roads are flooded: callers must show that to users.
"""

from functools import lru_cache
from typing import Protocol

import httpx
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.shared.geo import GeoPoint


class RoutingError(Exception):
    """Routing service unavailable, no route found, or unexpected answer."""


class Route(BaseModel):
    distance_m: int
    duration_s: int
    path: list[tuple[float, float]] = Field(description="[[lat, lng], ...], ready for Leaflet")


class Router(Protocol):
    async def get_route(self, start: GeoPoint, end: GeoPoint) -> Route: ...


class OsrmRouter:
    def __init__(
        self,
        base_url: str,
        profile: str,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,  # injected in tests
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._profile = profile
        self._timeout_seconds = timeout_seconds
        self._transport = transport

    async def get_route(self, start: GeoPoint, end: GeoPoint) -> Route:
        coordinates = f"{start.lng},{start.lat};{end.lng},{end.lat}"  # OSRM uses lng,lat
        url = f"{self._base_url}/route/v1/{self._profile}/{coordinates}"
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds, transport=self._transport
            ) as client:
                response = await client.get(
                    url, params={"overview": "full", "geometries": "geojson"}
                )
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RoutingError(f"Routing request failed: {exc!r}") from exc

        if response.status_code != 200 or data.get("code") != "Ok" or not data.get("routes"):
            raise RoutingError(f"No route: {data.get('code')} {data.get('message', '')}".strip())
        try:
            route = data["routes"][0]
            return Route(
                distance_m=round(route["distance"]),
                duration_s=round(route["duration"]),
                path=[(lat, lng) for lng, lat in route["geometry"]["coordinates"]],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RoutingError("Unexpected routing response format") from exc


@lru_cache
def get_router() -> Router:
    """FastAPI dependency (override in tests)."""
    settings = get_settings()
    return OsrmRouter(
        settings.routing_base_url, settings.routing_profile, settings.routing_timeout_seconds
    )
