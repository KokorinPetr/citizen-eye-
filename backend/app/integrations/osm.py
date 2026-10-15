"""OpenStreetMap Overpass API: official places (hospitals, fire stations, police) in Thailand."""

from datetime import datetime
from typing import Any

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT_SECONDS = 180
USER_AGENT = "CivicEye-hackathon/0.1 (flood response demo)"

# OSM amenity tag → our CenterType value
AMENITY_TYPES = {"hospital": "hospital", "fire_station": "fire_station", "police": "police"}

THAILAND_QUERY = f"""
[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];
area["ISO3166-1"="TH"][admin_level=2]->.th;
(
{"".join(f'  nwr["amenity"="{amenity}"](area.th);' + chr(10) for amenity in AMENITY_TYPES)});
out center tags;
"""


async def fetch_overpass(query: str = THAILAND_QUERY) -> list[dict[str, Any]]:
    """One request (Overpass asks for low request rates). Returns the raw elements."""
    async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT_SECONDS + 30) as client:
        response = await client.post(
            OVERPASS_URL, data={"data": query}, headers={"User-Agent": USER_AGENT}
        )
        response.raise_for_status()
        return response.json()["elements"]


def element_to_center(element: dict[str, Any], retrieved_at: datetime) -> dict[str, Any] | None:
    """OSM element → CenterImport fields. None for unnamed or unsupported elements."""
    tags = element.get("tags", {})
    center_type = AMENITY_TYPES.get(tags.get("amenity", ""))
    name_local = tags.get("name")
    name = tags.get("name:en") or name_local
    point = element if "lat" in element else element.get("center")
    if not center_type or not name or not point:
        return None

    phone = (tags.get("phone") or tags.get("contact:phone") or "").split(";")[0].strip()
    address = tags.get("addr:full") or ", ".join(
        tags[key]
        for key in ("addr:housenumber", "addr:street", "addr:subdistrict", "addr:district")
        if tags.get(key)
    )
    return {
        "name": name[:200],
        "description": name_local if name_local and name_local != name else "",
        "center_type": center_type,
        "location": {"lat": point["lat"], "lng": point["lon"]},
        "address": address[:300] or None,
        "phone": phone[:32] or None,
        "source": "osm",
        "source_url": f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
        "retrieved_at": retrieved_at.isoformat(),
    }


def deduplicate_centers(centers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """OSM often maps one hospital twice (a point and a building outline): same type + name
    within ~1 km counts as one place. The first one (usually with more details) is kept."""
    seen: set[tuple[str, str, float, float]] = set()
    unique = []
    for center in sorted(centers, key=lambda c: (c["phone"] is None, c["address"] is None)):
        location = center["location"]
        key = (
            center["center_type"],
            center["name"].casefold(),
            round(location["lat"], 2),
            round(location["lng"], 2),
        )
        if key not in seen:
            seen.add(key)
            unique.append(center)
    return unique
