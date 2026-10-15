import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.incidents.enums import ACTIVE_STATUSES, IncidentStatus, NeedType
from app.modules.incidents.models import Incident, IncidentReport, IncidentTask
from app.shared.geo import BBox, GeoPoint, distance_meters, within_bbox, within_distance

MAP_ITEMS_LIMIT = 500


@dataclass(frozen=True)
class ReportStats:
    average_magnitude: float
    report_count: int
    source_count: int


async def get_incident(session: AsyncSession, incident_id: uuid.UUID) -> Incident | None:
    return await session.get(Incident, incident_id)


async def list_incidents(
    session: AsyncSession,
    statuses: Sequence[IncidentStatus],
    bbox: BBox | None = None,
    need_type: NeedType | None = None,
) -> Sequence[Incident]:
    query = select(Incident).where(Incident.status.in_(statuses))
    if bbox is not None:
        query = query.where(within_bbox(Incident.location, bbox))
    if need_type is not None:
        query = query.where(Incident.need_type == need_type)
    query = query.order_by(Incident.magnitude.desc(), Incident.created_at.desc()).limit(
        MAP_ITEMS_LIMIT
    )
    result = await session.execute(query)
    return result.scalars().all()


async def get_task_for_update(session: AsyncSession, task_id: uuid.UUID) -> IncidentTask | None:
    """Locks the task row so two volunteers can't take the last spot at the same time."""
    return await session.get(IncidentTask, task_id, with_for_update=True, populate_existing=True)


async def add_incident(session: AsyncSession, incident: Incident) -> Incident:
    session.add(incident)
    await session.flush()
    return incident


async def delete_incident(session: AsyncSession, incident: Incident) -> None:
    await session.delete(incident)


async def add_report(session: AsyncSession, report: IncidentReport) -> IncidentReport:
    session.add(report)
    await session.flush()
    return report


async def get_report_stats(session: AsyncSession, incident_id: uuid.UUID) -> ReportStats:
    result = await session.execute(
        select(
            func.coalesce(func.avg(IncidentReport.magnitude), 0),
            func.count(),
            func.count(distinct(IncidentReport.reporter_id)),
            func.coalesce(func.bool_or(IncidentReport.reporter_id.is_(None)), False),
        ).where(IncidentReport.incident_id == incident_id)
    )
    average, count, distinct_users, has_anonymous = result.one()
    return ReportStats(float(average), count, distinct_users + int(has_anonymous))


async def find_merge_candidate(
    session: AsyncSession,
    point: GeoPoint,
    need_types: set[NeedType],
    radius_m: float,
    resolved_since: datetime,
) -> Incident | None:
    """Closest active (or recently resolved) incident with a matching need. Row is locked."""
    query = (
        select(Incident)
        .where(
            within_distance(Incident.location, point, radius_m),
            Incident.need_type.in_(need_types),
            or_(
                Incident.status.in_(ACTIVE_STATUSES),
                and_(
                    Incident.status == IncidentStatus.RESOLVED,
                    Incident.resolved_at >= resolved_since,
                ),
            ),
        )
        .order_by(distance_meters(Incident.location, point))
        .limit(1)
        .with_for_update()
    )
    return (await session.execute(query)).scalar_one_or_none()


async def list_incident_reports(
    session: AsyncSession, incident_id: uuid.UUID
) -> Sequence[IncidentReport]:
    query = (
        select(IncidentReport)
        .where(IncidentReport.incident_id == incident_id)
        .order_by(IncidentReport.created_at)
    )
    return (await session.execute(query)).scalars().all()
