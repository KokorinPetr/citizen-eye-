import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.database import DbSession
from app.modules.auth.dependencies import CurrentUser, OptionalUser
from app.modules.incidents import service
from app.modules.incidents.enums import IncidentStatus, NeedType
from app.modules.incidents.schemas import (
    IncidentCreate,
    IncidentMapItem,
    IncidentRead,
    IncidentReportRead,
    IncidentUpdate,
    TaskCreate,
)
from app.shared.geo import BBox, parse_bbox

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("")
async def list_incidents(
    session: DbSession,
    bbox: Annotated[BBox | None, Depends(parse_bbox)],
    status: Annotated[
        list[IncidentStatus] | None,
        Query(description="Repeatable. Default: open + in_progress"),
    ] = None,
    need_type: NeedType | None = None,
) -> list[IncidentMapItem]:
    incidents = await service.list_incidents(session, bbox, status, need_type)
    return [IncidentMapItem.model_validate(incident) for incident in incidents]


@router.get("/{incident_id}")
async def get_incident(
    incident_id: uuid.UUID, session: DbSession, viewer: OptionalUser
) -> IncidentRead:
    """Public card. The contact phone is only included for logged-in users."""
    incident = IncidentRead.model_validate(
        await service.get_incident_or_raise(session, incident_id)
    )
    if viewer is None:
        incident = incident.model_copy(update={"contact_phone": None})
    return incident


@router.get("/{incident_id}/reports")
async def list_incident_reports(
    incident_id: uuid.UUID, session: DbSession
) -> list[IncidentReportRead]:
    """Public report history: when, which language, AI summary. Never the raw text."""
    return await service.list_report_history(session, incident_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_incident(
    data: IncidentCreate, session: DbSession, user: CurrentUser
) -> IncidentRead:
    return IncidentRead.model_validate(await service.create_incident(session, data, user))


@router.patch("/{incident_id}")
async def update_incident(
    incident_id: uuid.UUID, data: IncidentUpdate, session: DbSession, user: CurrentUser
) -> IncidentRead:
    incident = await service.update_incident(session, incident_id, data, user)
    return IncidentRead.model_validate(incident)


@router.post("/{incident_id}/resolve")
async def resolve_incident(
    incident_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> IncidentRead:
    return IncidentRead.model_validate(await service.resolve_incident(session, incident_id, user))


@router.post("/{incident_id}/reopen")
async def reopen_incident(
    incident_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> IncidentRead:
    return IncidentRead.model_validate(await service.reopen_incident(session, incident_id, user))


@router.post("/{incident_id}/tasks", status_code=status.HTTP_201_CREATED)
async def add_task(
    incident_id: uuid.UUID, data: TaskCreate, session: DbSession, user: CurrentUser
) -> IncidentRead:
    """Owner / coordinator adds another thing people can help with."""
    return IncidentRead.model_validate(await service.add_task(session, incident_id, data, user))


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(incident_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await service.delete_incident(session, incident_id, user)
