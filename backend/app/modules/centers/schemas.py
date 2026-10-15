import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.modules.centers.enums import OFFICIAL_SOURCES, CenterSource, CenterStatus, CenterType
from app.modules.incidents.enums import NeedType
from app.shared.geo import BBox, DbPoint, GeoPoint
from app.shared.types import PhoneNumber


class CenterCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    center_type: CenterType = CenterType.SHELTER
    location: GeoPoint
    address: str | None = Field(default=None, max_length=300)
    phone: PhoneNumber | None = Field(default=None, description="Public contact for this place")
    capacity: int | None = Field(default=None, ge=0, le=100_000)
    supplies: list[NeedType] = Field(
        default_factory=list, description="What this place can provide"
    )


class CenterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    center_type: CenterType | None = None
    status: CenterStatus | None = None
    location: GeoPoint | None = None
    address: str | None = Field(default=None, max_length=300)
    phone: PhoneNumber | None = None
    capacity: int | None = Field(default=None, ge=0, le=100_000)
    supplies: list[NeedType] | None = None


class CenterFilters(BaseModel):
    """Map filters. Lists mean "any of"; empty means no filter."""

    bbox: BBox | None = None
    center_types: list[CenterType] = Field(default_factory=list)
    statuses: list[CenterStatus] = Field(default_factory=list)
    supplies: list[NeedType] = Field(default_factory=list)
    official: bool | None = None


class CenterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str
    center_type: CenterType
    status: CenterStatus
    source: CenterSource
    location: DbPoint
    address: str | None
    phone: str | None
    capacity: int | None
    supplies: list[NeedType]
    owner_id: uuid.UUID | None
    source_url: str | None
    retrieved_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def is_official(self) -> bool:
        return self.source in OFFICIAL_SOURCES


class CenterNearby(CenterRead):
    distance_m: int = Field(description="Straight-line distance in meters")


class CenterImport(BaseModel):
    """An official place from an import (OSM, BMA, ...). No owner; phone is free text."""

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    center_type: CenterType
    status: CenterStatus = CenterStatus.UNKNOWN
    location: GeoPoint
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=32)
    capacity: int | None = None
    supplies: list[NeedType] = Field(default_factory=list)
    source: CenterSource
    source_url: str = Field(max_length=500)
    retrieved_at: datetime


class Hotline(BaseModel):
    number: str
    name: str
    name_local: str | None = None
    category: str
    area: str = Field(description='"nationwide" or a region, e.g. "Bangkok"')


class RouteKind(StrEnum):
    ROAD = "road"  # real road route from the routing service
    STRAIGHT_LINE = "straight_line"  # routing unavailable: direct line, distance as the crow flies


class RouteRead(BaseModel):
    kind: RouteKind
    distance_m: int
    duration_s: int | None = Field(description="null for straight lines")
    path: list[tuple[float, float]] = Field(description="[[lat, lng], ...], draw as a polyline")


class CenterWithRoute(BaseModel):
    center: CenterNearby
    route: RouteRead


class NearestRoutes(BaseModel):
    warning: str
    routes: list[CenterWithRoute]
