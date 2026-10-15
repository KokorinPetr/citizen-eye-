import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_model import utc_now
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager
from app.modules.incidents import repository
from app.modules.incidents.enums import (
    ACTIVE_STATUSES,
    IncidentStatus,
    NeedType,
    ReportSource,
    TaskRole,
    TaskStatus,
)
from app.modules.incidents.magnitude import calculate_incident_magnitude, calculate_report_magnitude
from app.modules.incidents.models import Incident, IncidentReport, IncidentTask
from app.modules.incidents.schemas import IncidentCreate, IncidentUpdate, TaskCreate
from app.shared.geo import BBox, ensure_in_service_area, to_db_point

DEFAULT_TASK = TaskCreate(title="Help on site", role=TaskRole.GENERAL, needed_count=1)


async def get_incident_or_raise(session: AsyncSession, incident_id: uuid.UUID) -> Incident:
    incident = await repository.get_incident(session, incident_id)
    if incident is None:
        raise NotFoundError("Incident not found")
    return incident


async def list_incidents(
    session: AsyncSession,
    bbox: BBox | None,
    statuses: Sequence[IncidentStatus] | None,
    need_type: NeedType | None,
) -> Sequence[Incident]:
    """Map listing. Without a status filter, resolved incidents are hidden."""
    return await repository.list_incidents(
        session, statuses=statuses or ACTIVE_STATUSES, bbox=bbox, need_type=need_type
    )


async def create_incident(
    session: AsyncSession,
    data: IncidentCreate,
    owner: User,
    source: ReportSource = ReportSource.MANUAL,
) -> Incident:
    """Manual creation. Also stored as a report, so magnitude works the same for every incident."""
    ensure_in_service_area(data.location)
    location = to_db_point(data.location)
    incident = await repository.add_incident(
        session,
        Incident(
            title=data.title,
            summary=data.summary,
            need_type=data.need_type,
            urgency=data.urgency,
            location=location,
            location_text=data.location_text,
            people_affected=data.people_affected,
            contact_phone=data.contact_phone,
            owner_id=owner.id,
            tasks=[IncidentTask(**task.model_dump()) for task in data.tasks or [DEFAULT_TASK]],
        ),
    )
    await repository.add_report(
        session,
        IncidentReport(
            incident_id=incident.id,
            reporter_id=owner.id,
            source=source,
            raw_text=data.summary or data.title,
            urgency=data.urgency,
            people_affected=data.people_affected,
            magnitude=calculate_report_magnitude(data.urgency, data.people_affected),
            location=location,
        ),
    )
    await recalculate_magnitude(session, incident)
    await session.commit()
    return incident


async def update_incident(
    session: AsyncSession, incident_id: uuid.UUID, data: IncidentUpdate, user: User
) -> Incident:
    incident = await get_incident_or_raise(session, incident_id)
    ensure_can_manage_incident(user, incident)

    changes = data.model_dump(exclude_unset=True, exclude={"location"})
    for field, value in changes.items():
        setattr(incident, field, value)
    if data.location is not None:
        ensure_in_service_area(data.location)
        incident.location = to_db_point(data.location)

    await session.commit()
    return incident


async def resolve_incident(session: AsyncSession, incident_id: uuid.UUID, user: User) -> Incident:
    incident = await get_incident_or_raise(session, incident_id)
    ensure_can_manage_incident(user, incident)
    if incident.status == IncidentStatus.RESOLVED:
        raise ConflictError("Incident is already resolved")

    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = utc_now()
    await session.commit()
    return incident


async def reopen_incident(session: AsyncSession, incident_id: uuid.UUID, user: User) -> Incident:
    incident = await get_incident_or_raise(session, incident_id)
    ensure_can_manage_incident(user, incident)
    if incident.status != IncidentStatus.RESOLVED:
        raise ConflictError("Only resolved incidents can be reopened")

    incident.status = IncidentStatus.OPEN
    incident.resolved_at = None
    for task in incident.tasks:
        if task.status == TaskStatus.DONE:
            task.status = TaskStatus.OPEN
    sync_incident_status(incident)
    await session.commit()
    return incident


async def add_task(
    session: AsyncSession, incident_id: uuid.UUID, data: TaskCreate, user: User
) -> Incident:
    incident = await get_incident_or_raise(session, incident_id)
    ensure_can_manage_incident(user, incident)
    ensure_incident_active(incident)
    incident.tasks.append(IncidentTask(**data.model_dump()))
    await session.flush()
    sync_incident_status(incident)
    await session.commit()
    return incident


# Building blocks for the volunteers module. They don't commit; the caller does.


def ensure_incident_active(incident: Incident) -> None:
    if incident.status not in ACTIVE_STATUSES:
        raise ConflictError("Incident is resolved")


async def get_task_for_update(
    session: AsyncSession, incident: Incident, task_id: uuid.UUID
) -> IncidentTask:
    task = await repository.get_task_for_update(session, task_id)
    if task is None or task.incident_id != incident.id:
        raise NotFoundError("Task not found")
    return task


def set_task_signups(task: IncidentTask, signed_up_count: int) -> None:
    """Store the recounted signups and flip the task between open and filled."""
    task.signed_up_count = signed_up_count
    if task.status != TaskStatus.DONE:
        task.status = TaskStatus.FILLED if signed_up_count >= task.needed_count else TaskStatus.OPEN


def mark_task_done(task: IncidentTask) -> None:
    task.status = TaskStatus.DONE
    task.signed_up_count = 0


def sync_incident_status(incident: Incident) -> None:
    """All tasks done → resolved; anyone going or any task done → in_progress; else open."""
    if incident.status == IncidentStatus.RESOLVED:
        return
    if incident.tasks and all(task.status == TaskStatus.DONE for task in incident.tasks):
        incident.status = IncidentStatus.RESOLVED
        incident.resolved_at = utc_now()
    elif any(task.signed_up_count or task.status == TaskStatus.DONE for task in incident.tasks):
        incident.status = IncidentStatus.IN_PROGRESS
    else:
        incident.status = IncidentStatus.OPEN


async def delete_incident(session: AsyncSession, incident_id: uuid.UUID, user: User) -> None:
    incident = await get_incident_or_raise(session, incident_id)
    ensure_can_manage_incident(user, incident)
    await repository.delete_incident(session, incident)
    await session.commit()


async def recalculate_magnitude(session: AsyncSession, incident: Incident) -> None:
    average, report_count = await repository.get_report_stats(session, incident.id)
    incident.report_count = max(report_count, 1)
    incident.magnitude = calculate_incident_magnitude(
        average, incident.report_count, incident.is_verified
    )


def ensure_can_manage_incident(user: User, incident: Incident) -> None:
    """Owner, coordinators and admins can edit, resolve, reopen and delete."""
    ensure_owner_or_manager(
        user, incident.owner_id, "Only the owner or a coordinator can manage this incident"
    )
