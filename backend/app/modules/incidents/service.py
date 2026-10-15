import uuid
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_model import utc_now
from app.core.config import get_settings
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager
from app.modules.incidents import repository
from app.modules.incidents.enums import (
    ACTIVE_STATUSES,
    IncidentStatus,
    ReportStatus,
    TaskRole,
    TaskStatus,
    Urgency,
)
from app.modules.incidents.magnitude import calculate_incident_magnitude, calculate_report_magnitude
from app.modules.incidents.merge_rules import matching_need_types, max_optional, max_urgency
from app.modules.incidents.models import Incident, IncidentReport, IncidentTask
from app.modules.incidents.schemas import (
    AreaAlert,
    IncidentCreate,
    IncidentFilters,
    IncidentMapItem,
    IncidentReportRead,
    IncidentUpdate,
    NearbyIncident,
    ReportMeta,
    TaskCreate,
)
from app.shared.geo import GeoPoint, ensure_in_service_area, to_db_point

DEFAULT_TASK = TaskCreate(title="Help on site", role=TaskRole.GENERAL, needed_count=1)


async def get_incident_or_raise(session: AsyncSession, incident_id: uuid.UUID) -> Incident:
    incident = await repository.get_incident(session, incident_id)
    if incident is None:
        raise NotFoundError("Incident not found")
    return incident


async def list_incidents(session: AsyncSession, filters: IncidentFilters) -> Sequence[Incident]:
    """Map listing. Without a status filter, resolved incidents are hidden."""
    if not filters.statuses:
        filters = filters.model_copy(update={"statuses": list(ACTIVE_STATUSES)})
    return await repository.list_incidents(session, filters)


async def create_incident(
    session: AsyncSession,
    data: IncidentCreate,
    owner: User | None,
    meta: ReportMeta | None = None,
) -> Incident:
    """Create an incident and its first report (so magnitude works the same for every incident).

    `owner` is None for anonymous reports: then only coordinators can manage the incident.
    """
    ensure_in_service_area(data.location)
    meta = meta or ReportMeta()
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
            owner_id=owner.id if owner else None,
            tasks=[IncidentTask(**task.model_dump()) for task in data.tasks or [DEFAULT_TASK]],
        ),
    )
    await add_report(
        session,
        meta.model_copy(update={"raw_text": meta.raw_text or data.summary or data.title}),
        data.location,
        data.urgency,
        data.people_affected,
        reporter=owner,
        incident=incident,
    )
    await recalculate_incident_stats(session, incident)
    await session.commit()
    return incident


async def create_or_merge_incident(
    session: AsyncSession, data: IncidentCreate, reporter: User | None, meta: ReportMeta
) -> tuple[Incident, bool]:
    """Join a matching incident nearby, or create a new one. Returns (incident, was_merged)."""
    ensure_in_service_area(data.location)
    target = await find_merge_target(session, data)
    if target is None:
        return await create_incident(session, data, reporter, meta), False
    await merge_into_incident(session, target, data, reporter, meta)
    return target, True


async def find_merge_target(session: AsyncSession, data: IncidentCreate) -> Incident | None:
    settings = get_settings()
    return await repository.find_merge_candidate(
        session,
        data.location,
        matching_need_types(data.need_type),
        radius_m=settings.dedup_radius_m,
        resolved_since=utc_now() - timedelta(hours=settings.reopen_window_hours),
    )


async def merge_into_incident(
    session: AsyncSession,
    incident: Incident,
    data: IncidentCreate,
    reporter: User | None,
    meta: ReportMeta,
) -> None:
    """Add a report to an existing incident: reopen it if needed and combine the details."""
    if incident.status == IncidentStatus.RESOLVED:
        reset_to_open(incident)
    incident.urgency = max_urgency(incident.urgency, data.urgency)
    incident.people_affected = max_optional(incident.people_affected, data.people_affected)
    incident.contact_phone = incident.contact_phone or data.contact_phone
    incident.location_text = incident.location_text or data.location_text
    incident.last_report_at = utc_now()
    add_missing_tasks(incident, data.tasks)

    await add_report(
        session,
        meta.model_copy(update={"raw_text": meta.raw_text or data.summary or data.title}),
        data.location,
        data.urgency,
        data.people_affected,
        reporter=reporter,
        incident=incident,
    )
    await session.flush()
    await recalculate_incident_stats(session, incident)
    sync_incident_status(incident)
    await session.commit()


def add_missing_tasks(incident: Incident, tasks: list[TaskCreate]) -> None:
    """Add tasks whose role is not already needed, so merged reports don't duplicate work."""
    active_roles = {task.role for task in incident.tasks if task.status != TaskStatus.DONE}
    for task in tasks:
        if task.role not in active_roles:
            incident.tasks.append(IncidentTask(**task.model_dump()))
            active_roles.add(task.role)


async def list_report_history(
    session: AsyncSession, incident_id: uuid.UUID
) -> list[IncidentReportRead]:
    await get_incident_or_raise(session, incident_id)
    reports = await repository.list_incident_reports(session, incident_id)
    return [IncidentReportRead.from_report(report) for report in reports]


async def save_rejected_report(
    session: AsyncSession,
    meta: ReportMeta,
    location: GeoPoint,
    urgency: Urgency,
    reporter: User | None,
) -> None:
    """Keep reports that are not requests for help (for review), without an incident."""
    rejected = meta.model_copy(update={"status": ReportStatus.REJECTED})
    await add_report(session, rejected, location, urgency, None, reporter=reporter, incident=None)
    await session.commit()


async def add_report(
    session: AsyncSession,
    meta: ReportMeta,
    location: GeoPoint,
    urgency: Urgency,
    people_affected: int | None,
    *,
    reporter: User | None,
    incident: Incident | None,
) -> IncidentReport:
    return await repository.add_report(
        session,
        IncidentReport(
            incident_id=incident.id if incident else None,
            reporter_id=reporter.id if reporter else None,
            urgency=urgency,
            people_affected=people_affected,
            magnitude=calculate_report_magnitude(urgency, people_affected),
            location=to_db_point(location),
            **meta.model_dump(),
        ),
    )


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

    reset_to_open(incident)
    sync_incident_status(incident)
    await session.commit()
    return incident


def reset_to_open(incident: Incident) -> None:
    """Reopen a resolved incident: done tasks become open again."""
    incident.status = IncidentStatus.OPEN
    incident.resolved_at = None
    for task in incident.tasks:
        if task.status == TaskStatus.DONE:
            task.status = TaskStatus.OPEN


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


async def recalculate_incident_stats(session: AsyncSession, incident: Incident) -> None:
    """Report count, independent sources, verified flag and magnitude, from the reports table."""
    stats = await repository.get_report_stats(session, incident.id)
    incident.report_count = max(stats.report_count, 1)
    incident.source_count = max(stats.source_count, 1)
    incident.is_verified = (
        incident.is_verified or incident.source_count >= get_settings().verified_min_sources
    )
    incident.magnitude = calculate_incident_magnitude(
        stats.average_magnitude, incident.source_count, incident.is_verified
    )


def ensure_can_manage_incident(user: User, incident: Incident) -> None:
    """Owner, coordinators and admins can edit, resolve, reopen and delete."""
    ensure_owner_or_manager(
        user, incident.owner_id, "Only the owner or a coordinator can manage this incident"
    )


ALERT_URGENCIES = (Urgency.HIGH, Urgency.CRITICAL)
ALERT_MAX_INCIDENTS = 5


async def get_area_alert(session: AsyncSession, point: GeoPoint) -> AreaAlert:
    """Active high/critical incidents within ALERT_RADIUS_M of the point."""
    radius_m = get_settings().alert_radius_m
    rows = await repository.list_nearby_incidents(
        session, point, radius_m, ALERT_URGENCIES, ALERT_MAX_INCIDENTS
    )
    incidents = [
        NearbyIncident(
            **IncidentMapItem.model_validate(incident).model_dump(exclude={"magnitude_level"}),
            distance_m=round(distance),
        )
        for incident, distance in rows
    ]
    message = None
    if incidents:
        closest = incidents[0]
        message = (
            f"Emergency nearby: {closest.title} ({closest.distance_m} m away). "
            "Open Emergency mode to see what is needed."
        )
    return AreaAlert(
        active=bool(incidents), radius_m=radius_m, message=message, incidents=incidents
    )
