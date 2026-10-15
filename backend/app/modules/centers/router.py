import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.database import DbSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.centers import service
from app.modules.centers.enums import CenterStatus, CenterType
from app.modules.centers.schemas import (
    CenterCreate,
    CenterNearby,
    CenterRead,
    CenterUpdate,
    Hotline,
)
from app.modules.incidents.enums import NeedType
from app.shared.geo import BBox, GeoPoint, parse_bbox

router = APIRouter(prefix="/centers", tags=["centers"])


@router.get("")
async def list_centers(
    session: DbSession,
    bbox: Annotated[BBox | None, Depends(parse_bbox)],
    center_type: Annotated[list[CenterType] | None, Query(description="Repeatable")] = None,
    status: CenterStatus | None = None,
    supply: Annotated[NeedType | None, Query(description="Places that provide this")] = None,
) -> list[CenterRead]:
    centers = await service.list_centers(session, bbox, center_type, status, supply)
    return [CenterRead.model_validate(center) for center in centers]


@router.get("/nearest")
async def list_nearest_centers(
    session: DbSession,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    center_type: Annotated[list[CenterType] | None, Query(description="Repeatable")] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 3,
) -> list[CenterNearby]:
    """Closest places (not closed) to a point, e.g. an incident: `?center_type=hospital`."""
    point = GeoPoint(lat=lat, lng=lng)
    return await service.list_nearest_centers(session, point, center_type, limit)


@router.get("/{center_id}")
async def get_center(center_id: uuid.UUID, session: DbSession) -> CenterRead:
    return CenterRead.model_validate(await service.get_center_or_raise(session, center_id))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_center(data: CenterCreate, session: DbSession, user: CurrentUser) -> CenterRead:
    return CenterRead.model_validate(await service.create_center(session, data, user))


@router.patch("/{center_id}")
async def update_center(
    center_id: uuid.UUID, data: CenterUpdate, session: DbSession, user: CurrentUser
) -> CenterRead:
    return CenterRead.model_validate(await service.update_center(session, center_id, data, user))


@router.delete("/{center_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_center(center_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await service.delete_center(session, center_id, user)


hotlines_router = APIRouter(prefix="/hotlines", tags=["centers"])


@hotlines_router.get("")
async def list_hotlines() -> list[Hotline]:
    """Emergency phone numbers in Thailand (static, from data/hotlines.json)."""
    return service.list_hotlines()
