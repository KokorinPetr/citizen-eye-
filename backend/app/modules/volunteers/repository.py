import uuid
from collections.abc import Sequence

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.incidents.enums import ACTIVE_STATUSES
from app.modules.incidents.models import Incident
from app.modules.volunteers.enums import SignupStatus
from app.modules.volunteers.models import VolunteerSignup

VISIBLE_STATUSES = (SignupStatus.GOING, SignupStatus.COMPLETED)


async def add_signup(session: AsyncSession, signup: VolunteerSignup) -> VolunteerSignup:
    session.add(signup)
    await session.flush()
    return signup


async def get_signup(session: AsyncSession, signup_id: uuid.UUID) -> VolunteerSignup | None:
    return await session.get(VolunteerSignup, signup_id)


async def get_active_signup(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    incident_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
) -> VolunteerSignup | None:
    query = select(VolunteerSignup).where(
        VolunteerSignup.user_id == user_id, VolunteerSignup.status == SignupStatus.GOING
    )
    if incident_id is not None:
        query = query.where(VolunteerSignup.incident_id == incident_id)
    if task_id is not None:
        query = query.where(VolunteerSignup.task_id == task_id)
    return (await session.execute(query.limit(1))).scalar_one_or_none()


async def count_user_active_signups(session: AsyncSession, user_id: uuid.UUID) -> int:
    """Only signups on incidents that are still active count toward the limit."""
    query = (
        select(func.count())
        .select_from(VolunteerSignup)
        .join(Incident, Incident.id == VolunteerSignup.incident_id)
        .where(
            VolunteerSignup.user_id == user_id,
            VolunteerSignup.status == SignupStatus.GOING,
            Incident.status.in_(ACTIVE_STATUSES),
        )
    )
    return (await session.execute(query)).scalar_one()


async def count_task_active_signups(session: AsyncSession, task_id: uuid.UUID) -> int:
    query = select(func.count()).where(
        VolunteerSignup.task_id == task_id, VolunteerSignup.status == SignupStatus.GOING
    )
    return (await session.execute(query)).scalar_one()


async def complete_task_signups(session: AsyncSession, task_id: uuid.UUID) -> None:
    await session.execute(
        update(VolunteerSignup)
        .where(VolunteerSignup.task_id == task_id, VolunteerSignup.status == SignupStatus.GOING)
        .values(status=SignupStatus.COMPLETED)
        .execution_options(synchronize_session="fetch")
    )


async def list_incident_signups(
    session: AsyncSession, incident_id: uuid.UUID
) -> Sequence[VolunteerSignup]:
    query = (
        select(VolunteerSignup)
        .where(
            VolunteerSignup.incident_id == incident_id,
            VolunteerSignup.status.in_(VISIBLE_STATUSES),
        )
        .order_by(VolunteerSignup.created_at)
    )
    return (await session.execute(query)).scalars().all()


async def list_user_signups(session: AsyncSession, user_id: uuid.UUID) -> Sequence[VolunteerSignup]:
    query = (
        select(VolunteerSignup)
        .where(VolunteerSignup.user_id == user_id, VolunteerSignup.status.in_(VISIBLE_STATUSES))
        .order_by(VolunteerSignup.created_at.desc())
    )
    return (await session.execute(query)).scalars().all()
