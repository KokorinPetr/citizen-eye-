from datetime import UTC, datetime

from app.integrations.osm import deduplicate_centers, element_to_center

NOW = datetime(2026, 10, 15, tzinfo=UTC)


def test_node_with_english_and_thai_name() -> None:
    element = {
        "type": "node",
        "id": 42,
        "lat": 7.0123,
        "lon": 100.4711,
        "tags": {
            "amenity": "hospital",
            "name": "โรงพยาบาลหาดใหญ่",
            "name:en": "Hatyai Hospital",
            "phone": "+66 74 273 100;+66 74 273 200",
            "addr:street": "Rattakarn Rd",
            "addr:district": "Hat Yai",
        },
    }

    center = element_to_center(element, NOW)

    assert center == {
        "name": "Hatyai Hospital",
        "description": "โรงพยาบาลหาดใหญ่",
        "center_type": "hospital",
        "location": {"lat": 7.0123, "lng": 100.4711},
        "address": "Rattakarn Rd, Hat Yai",
        "phone": "+66 74 273 100",
        "source": "osm",
        "source_url": "https://www.openstreetmap.org/node/42",
        "retrieved_at": NOW.isoformat(),
    }


def test_way_uses_center_point() -> None:
    element = {
        "type": "way",
        "id": 7,
        "center": {"lat": 18.79, "lon": 98.98},
        "tags": {"amenity": "fire_station", "name": "Chiang Mai Fire Station"},
    }

    center = element_to_center(element, NOW)

    assert center is not None
    assert center["location"] == {"lat": 18.79, "lng": 98.98}
    assert center["source_url"] == "https://www.openstreetmap.org/way/7"


def test_unnamed_or_unsupported_elements_are_skipped() -> None:
    unnamed = {"type": "node", "id": 1, "lat": 1, "lon": 1, "tags": {"amenity": "police"}}
    school = {
        "type": "node",
        "id": 2,
        "lat": 1,
        "lon": 1,
        "tags": {"amenity": "school", "name": "X"},
    }

    assert element_to_center(unnamed, NOW) is None
    assert element_to_center(school, NOW) is None


def test_duplicates_keep_the_one_with_details() -> None:
    def center(lat: float, phone: str | None, center_type: str = "hospital") -> dict:
        return {
            "name": "Hatyai Hospital",
            "center_type": center_type,
            "location": {"lat": lat, "lng": 100.47},
            "phone": phone,
            "address": None,
        }

    unique = deduplicate_centers(
        [
            center(7.0101, None),
            center(7.0102, "074"),
            center(7.30, None),
            center(7.0101, None, "police"),
        ]
    )

    assert len(unique) == 3  # the two nearby hospitals become one; far one and police stay
    assert any(c["phone"] == "074" for c in unique)
