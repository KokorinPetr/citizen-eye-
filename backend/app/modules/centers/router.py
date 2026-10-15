import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.database import DbSession
from app.integrations.routing import Router, get_router
from app.modules.auth.dependencies import CurrentUser
from app.modules.centers import service
from app.modules.centers.dependencies import CenterFiltersDep
from app.modules.centers.enums import CenterType
from app.modules.centers.schemas import (
    CenterCreate,
    CenterNearby,
    CenterRead,
    CenterUpdate,
    Hotline,
    NearestRoutes,
)
from app.shared.geo import GeoPoint

router = APIRouter(prefix="/centers", tags=["centers"])

RouterDep = Annotated[Router, Depends(get_router)]


@router.get("")
async def list_centers(session: DbSession, filters: CenterFiltersDep) -> list[CenterRead]:
    """Map layer: `?bbox=&center_type=hospital&center_type=shelter&status=open&official=true`."""
    centers = await service.list_centers(session, filters)
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


@router.get("/nearest/routes")
async def list_routes_to_nearest(
    session: DbSession,
    router_: RouterDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    center_type: Annotated[list[CenterType] | None, Query(description="Repeatable")] = None,
    limit: Annotated[int, Query(ge=1, le=3)] = 3,
) -> NearestRoutes:
    """Road routes from a point (e.g. an incident) to the nearest places. Call on a button press
    only (it queries an external routing service). Falls back to straight lines if it is down."""
    start = GeoPoint(lat=lat, lng=lng)
    return await service.list_routes_to_nearest(session, router_, start, center_type, limit)


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
