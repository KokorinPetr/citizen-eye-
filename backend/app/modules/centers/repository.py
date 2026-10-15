import uuid
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.centers.enums import OFFICIAL_SOURCES, CenterSource, CenterStatus, CenterType
from app.modules.centers.models import Center
from app.modules.centers.schemas import CenterFilters
from app.shared.geo import GeoPoint, distance_meters, order_by_nearest, within_bbox

MAP_ITEMS_LIMIT = 500


async def get_center(session: AsyncSession, center_id: uuid.UUID) -> Center | None:
    return await session.get(Center, center_id)


async def list_centers(session: AsyncSession, filters: CenterFilters) -> Sequence[Center]:
    query = select(Center)
    if filters.bbox is not None:
        query = query.where(within_bbox(Center.location, filters.bbox))
    if filters.center_types:
        query = query.where(Center.center_type.in_(filters.center_types))
    if filters.statuses:
        query = query.where(Center.status.in_(filters.statuses))
    if filters.supplies:
        query = query.where(Center.supplies.overlap([supply.value for supply in filters.supplies]))
    if filters.official is not None:
        is_official = Center.source.in_(OFFICIAL_SOURCES)
        query = query.where(is_official if filters.official else ~is_official)
    result = await session.execute(query.order_by(Center.name).limit(MAP_ITEMS_LIMIT))
    return result.scalars().all()


async def add_center(session: AsyncSession, center: Center) -> Center:
    session.add(center)
    await session.flush()
    return center


async def delete_center(session: AsyncSession, center: Center) -> None:
    await session.delete(center)


async def list_nearest_centers(
    session: AsyncSession,
    point: GeoPoint,
    center_types: Sequence[CenterType] | None,
    limit: int,
) -> list[tuple[Center, float]]:
    """Closest places that are not closed, with distance in meters."""
    query = select(Center, distance_meters(Center.location, point)).where(
        Center.status != CenterStatus.CLOSED
    )
    if center_types:
        query = query.where(Center.center_type.in_(center_types))
    query = query.order_by(order_by_nearest(Center.location, point)).limit(limit)
    return [(center, float(distance)) for center, distance in (await session.execute(query)).all()]


async def list_centers_by_source(session: AsyncSession, source: CenterSource) -> Sequence[Center]:
    query = select(Center).where(Center.source == source).order_by(Center.center_type, Center.name)
    return (await session.execute(query)).scalars().all()


async def replace_centers_from_source(
    session: AsyncSession, source: CenterSource, centers: Sequence[Center]
) -> None:
    """Imported official data is replaced as a whole on every import."""
    await session.execute(delete(Center).where(Center.source == source))
    session.add_all(centers)
    await session.flush()
