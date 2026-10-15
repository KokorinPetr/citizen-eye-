import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager
from app.modules.centers import repository
from app.modules.centers.enums import CenterSource, CenterStatus, CenterType
from app.modules.centers.models import Center
from app.modules.centers.schemas import CenterCreate, CenterUpdate
from app.modules.incidents.enums import NeedType
from app.shared.geo import BBox, ensure_in_service_area, to_db_point


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
