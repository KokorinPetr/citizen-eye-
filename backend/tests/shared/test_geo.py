import pytest
from geoalchemy2 import Geography
from sqlalchemy import cast, select

from app.core.database import session_factory
from app.core.exceptions import InvalidInputError
from app.shared.geo import (
    GeoPoint,
    distance_meters,
    ensure_in_service_area,
    parse_bbox,
    to_db_point,
    within_distance,
)

VICTORY_MONUMENT = GeoPoint(lat=13.7649, lng=100.5383)
SIAM_PARAGON = GeoPoint(lat=13.7462, lng=100.5347)  # ~2.1 km south


async def test_distance_and_within_distance_in_meters() -> None:
    column = cast(to_db_point(VICTORY_MONUMENT), Geography)
    async with session_factory() as session:
        distance, near_3km, near_1km = (
            await session.execute(
                select(
                    distance_meters(column, SIAM_PARAGON),
                    within_distance(column, SIAM_PARAGON, 3000),
                    within_distance(column, SIAM_PARAGON, 1000),
                )
            )
        ).one()

    assert 2000 < distance < 2200
    assert near_3km is True
    assert near_1km is False


def test_parse_bbox() -> None:
    bbox = parse_bbox("100.45,13.65,100.65,13.85")
    assert bbox is not None and bbox.contains(VICTORY_MONUMENT)
    assert parse_bbox(None) is None
    for bad in ("1,2,3", "a,b,c,d", "100.65,13.65,100.45,13.85"):
        with pytest.raises(InvalidInputError):
            parse_bbox(bad)


def test_service_area_is_all_of_thailand() -> None:
    for city in (
        VICTORY_MONUMENT,
        GeoPoint(lat=18.7883, lng=98.9853),  # Chiang Mai
        GeoPoint(lat=20.4280, lng=99.8830),  # Mae Sai
        GeoPoint(lat=7.0086, lng=100.4747),  # Hat Yai
    ):
        ensure_in_service_area(city)
    with pytest.raises(InvalidInputError):
        ensure_in_service_area(GeoPoint(lat=51.5, lng=-0.12))  # London
