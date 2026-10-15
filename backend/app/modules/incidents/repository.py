import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.incidents.enums import IncidentStatus, NeedType
from app.modules.incidents.models import Incident, IncidentReport, IncidentTask
from app.shared.geo import BBox, within_bbox

MAP_ITEMS_LIMIT = 500


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


async def get_report_stats(session: AsyncSession, incident_id: uuid.UUID) -> tuple[float, int]:
    """(average report magnitude, number of reports) for one incident."""
    result = await session.execute(
        select(func.coalesce(func.avg(IncidentReport.magnitude), 0), func.count()).where(
            IncidentReport.incident_id == incident_id
        )
    )
    average, count = result.one()
    return float(average), count
