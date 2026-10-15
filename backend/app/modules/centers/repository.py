import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.centers.enums import CenterStatus, CenterType
from app.modules.centers.models import Center
from app.modules.incidents.enums import NeedType
from app.shared.geo import BBox, within_bbox

MAP_ITEMS_LIMIT = 500


async def get_center(session: AsyncSession, center_id: uuid.UUID) -> Center | None:
    return await session.get(Center, center_id)


async def list_centers(
    session: AsyncSession,
    bbox: BBox | None = None,
    center_types: Sequence[CenterType] | None = None,
    status: CenterStatus | None = None,
    supply: NeedType | None = None,
) -> Sequence[Center]:
    query = select(Center)
    if bbox is not None:
        query = query.where(within_bbox(Center.location, bbox))
    if center_types:
        query = query.where(Center.center_type.in_(center_types))
    if status is not None:
        query = query.where(Center.status == status)
    if supply is not None:
        query = query.where(Center.supplies.contains([supply.value]))
    result = await session.execute(query.order_by(Center.name).limit(MAP_ITEMS_LIMIT))
    return result.scalars().all()


async def add_center(session: AsyncSession, center: Center) -> Center:
    session.add(center)
    await session.flush()
    return center


async def delete_center(session: AsyncSession, center: Center) -> None:
    await session.delete(center)
