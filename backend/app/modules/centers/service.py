import json
import uuid
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager
from app.modules.centers import repository
from app.modules.centers.enums import CenterSource, CenterStatus, CenterType
from app.modules.centers.models import Center
from app.modules.centers.schemas import (
    CenterCreate,
    CenterImport,
    CenterNearby,
    CenterRead,
    CenterUpdate,
    Hotline,
)
from app.modules.incidents.enums import NeedType
from app.shared.geo import BBox, GeoPoint, ensure_in_service_area, to_db_point

HOTLINES_FILE = Path(__file__).resolve().parents[3] / "data" / "hotlines.json"
MAX_NEAREST = 20


async def get_center_or_raise(session: AsyncSession, center_id: uuid.UUID) -> Center:
    center = await repository.get_center(session, center_id)
    if center is None:
        raise NotFoundError("Center not found")
    return center


async def list_centers(
    session: AsyncSession,
    bbox: BBox | None,
    center_types: Sequence[CenterType] | None,
    status: CenterStatus | None,
    supply: NeedType | None,
) -> Sequence[Center]:
    return await repository.list_centers(session, bbox, center_types, status, supply)


async def create_center(session: AsyncSession, data: CenterCreate, owner: User) -> Center:
    ensure_in_service_area(data.location)
    center = await repository.add_center(
        session,
        Center(
            **data.model_dump(exclude={"location", "supplies"}),
            supplies=[supply.value for supply in data.supplies],
            location=to_db_point(data.location),
            source=CenterSource.USER,
            owner_id=owner.id,
        ),
    )
    await session.commit()
    return center


async def update_center(
    session: AsyncSession, center_id: uuid.UUID, data: CenterUpdate, user: User
) -> Center:
    center = await get_center_or_raise(session, center_id)
    ensure_can_manage_center(user, center)

    changes = data.model_dump(exclude_unset=True, exclude={"location", "supplies"})
    for field, value in changes.items():
        setattr(center, field, value)
    if data.location is not None:
        ensure_in_service_area(data.location)
        center.location = to_db_point(data.location)
    if data.supplies is not None:
        center.supplies = [supply.value for supply in data.supplies]

    await session.commit()
    return center


async def delete_center(session: AsyncSession, center_id: uuid.UUID, user: User) -> None:
    center = await get_center_or_raise(session, center_id)
    ensure_can_manage_center(user, center)
    await repository.delete_center(session, center)
    await session.commit()


def ensure_can_manage_center(user: User, center: Center) -> None:
    """Owner manages their own place. Official (imported) centers: coordinators/admins only."""
    ensure_owner_or_manager(
        user, center.owner_id, "Only the owner or a coordinator can manage this place"
    )


async def list_nearest_centers(
    session: AsyncSession, point: GeoPoint, center_types: Sequence[CenterType] | None, limit: int
) -> list[CenterNearby]:
    """E.g. nearest open shelter / hospital for an incident card."""
    rows = await repository.list_nearest_centers(
        session, point, center_types, min(limit, MAX_NEAREST)
    )
    return [
        CenterNearby(**CenterRead.model_validate(center).model_dump(), distance_m=round(distance))
        for center, distance in rows
    ]


async def replace_official_centers(
    session: AsyncSession, source: CenterSource, items: Sequence[CenterImport]
) -> int:
    centers = [
        Center(
            **item.model_dump(exclude={"location", "supplies"}),
            supplies=[supply.value for supply in item.supplies],
            location=to_db_point(item.location),
        )
        for item in items
        if item.source == source
    ]
    await repository.replace_centers_from_source(session, source, centers)
    await session.commit()
    return len(centers)


async def export_official_centers(
    session: AsyncSession, source: CenterSource
) -> list[CenterImport]:
    """Current DB rows of an import source, including coordinator edits (status, phone, ...)."""
    centers = await repository.list_centers_by_source(session, source)
    return [
        CenterImport.model_validate(
            CenterRead.model_validate(center).model_dump(include=set(CenterImport.model_fields))
        )
        for center in centers
    ]


@lru_cache
def list_hotlines() -> list[Hotline]:
    return [
        Hotline.model_validate(item) for item in json.loads(HOTLINES_FILE.read_text())["hotlines"]
    ]
