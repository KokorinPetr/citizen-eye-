"""All PostGIS handling lives here. Points are `geography(Point, 4326)`; the API only sees lat/lng.

PostGIS uses (lng, lat) order. Never build or read points outside this module.
"""

from typing import Annotated, Any

from fastapi import Query
from geoalchemy2 import Geography, WKTElement
from geoalchemy2.elements import _SpatialElement
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, BeforeValidator, Field, model_validator
from sqlalchemy import ColumnElement, cast, func
from sqlalchemy.orm import MappedColumn, mapped_column

from app.core.config import get_settings
from app.core.exceptions import InvalidInputError

SRID = 4326  # WGS 84, plain GPS lat/lng (same as Leaflet)


class GeoPoint(BaseModel):
    lat: float = Field(ge=-90, le=90, examples=[13.7563])
    lng: float = Field(ge=-180, le=180, examples=[100.5018])


class BBox(BaseModel):
    min_lng: float = Field(ge=-180, le=180)
    min_lat: float = Field(ge=-90, le=90)
    max_lng: float = Field(ge=-180, le=180)
    max_lat: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def check_order(self) -> "BBox":
        if self.min_lng >= self.max_lng or self.min_lat >= self.max_lat:
            raise ValueError("bbox must be min_lng,min_lat,max_lng,max_lat with min < max")
        return self

    def contains(self, point: GeoPoint) -> bool:
        return (
            self.min_lng <= point.lng <= self.max_lng and self.min_lat <= point.lat <= self.max_lat
        )


def point_column(*, nullable: bool = False) -> MappedColumn[Any]:
    """Geography point column with a GiST index. Use for every location column."""
    return mapped_column(
        Geography(geometry_type="POINT", srid=SRID, spatial_index=True), nullable=nullable
    )


def to_db_point(point: GeoPoint) -> WKTElement:
    return WKTElement(f"POINT({point.lng} {point.lat})", srid=SRID)


def from_db_point(value: Any) -> Any:
    """DB value (WKB/WKT element) → GeoPoint. Anything else is passed through for validation."""
    if isinstance(value, _SpatialElement):
        shape = to_shape(value)
        return GeoPoint(lat=shape.y, lng=shape.x)
    return value


# Use in response schemas: reads an ORM geography value as {"lat": .., "lng": ..}.
DbPoint = Annotated[GeoPoint, BeforeValidator(from_db_point)]


def _as_geography(point: GeoPoint) -> ColumnElement[Any]:
    return cast(to_db_point(point), Geography)


def within_bbox(column: Any, bbox: BBox) -> ColumnElement[bool]:
    envelope = func.ST_MakeEnvelope(bbox.min_lng, bbox.min_lat, bbox.max_lng, bbox.max_lat, SRID)
    return func.ST_Intersects(column, cast(envelope, Geography))


def within_distance(column: Any, point: GeoPoint, meters: float) -> ColumnElement[bool]:
    return func.ST_DWithin(column, _as_geography(point), meters)


def distance_meters(column: Any, point: GeoPoint) -> ColumnElement[float]:
    return func.ST_Distance(column, _as_geography(point))


def ensure_in_service_area(point: GeoPoint) -> None:
    min_lng, min_lat, max_lng, max_lat = get_settings().service_area_bbox
    service_area = BBox(min_lng=min_lng, min_lat=min_lat, max_lng=max_lng, max_lat=max_lat)
    if not service_area.contains(point):
        raise InvalidInputError("Location is outside the service area")


def parse_bbox(
    bbox: Annotated[
        str | None,
        Query(
            description="Visible map area: min_lng,min_lat,max_lng,max_lat",
            examples=["100.45,13.65,100.65,13.85"],
        ),
    ] = None,
) -> BBox | None:
    """FastAPI dependency for the `?bbox=` query parameter."""
    if bbox is None:
        return None
    try:
        min_lng, min_lat, max_lng, max_lat = (float(part) for part in bbox.split(","))
        return BBox(min_lng=min_lng, min_lat=min_lat, max_lng=max_lng, max_lat=max_lat)
    except ValueError as exc:
        raise InvalidInputError(
            "bbox must be 4 numbers: min_lng,min_lat,max_lng,max_lat with min < max"
        ) from exc
