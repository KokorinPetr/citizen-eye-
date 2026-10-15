from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.database import DbSession
from app.integrations.ai.connector import AIConnector
from app.integrations.ai.factory import get_ai_connector
from app.modules.auth.dependencies import OptionalUser
from app.modules.reports import service
from app.modules.reports.schemas import (
    ParsedReport,
    ReportCreate,
    ReportPreviewRequest,
    ReportResult,
)

router = APIRouter(prefix="/reports", tags=["reports"])

AIConnectorDep = Annotated[AIConnector, Depends(get_ai_connector)]


@router.post("/preview")
async def preview_report(data: ReportPreviewRequest, connector: AIConnectorDep) -> ParsedReport:
    """AI parses the text without saving. Show it to the reporter to confirm or edit."""
    return await service.preview_report(connector, data.text)


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_report(
    data: ReportCreate, session: DbSession, connector: AIConnectorDep, reporter: OptionalUser
) -> ReportResult:
    """Public (login optional): free text + pin → incident on the map."""
    return await service.submit_report(session, connector, data, reporter)
