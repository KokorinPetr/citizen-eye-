import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceUnavailableError
from app.integrations.ai.connector import AIConnector, AIConnectorError
from app.modules.auth.models import User
from app.modules.incidents import service as incidents_service
from app.modules.incidents.enums import ReportSource, ReportStatus
from app.modules.incidents.schemas import IncidentCreate, IncidentRead, ReportMeta, TaskCreate
from app.modules.reports.prompts import REPORT_PARSING_SYSTEM_PROMPT, build_report_prompt
from app.modules.reports.schemas import ParsedReport, ReportCreate, ReportResult
from app.shared.geo import ensure_in_service_area

logger = logging.getLogger(__name__)

FALLBACK_TITLE_LENGTH = 80
RESULT_MESSAGES = {
    ReportStatus.PARSED: "Your report is on the map. Volunteers can now see it.",
    ReportStatus.FAILED: "Your report is on the map. Details will be checked by a coordinator.",
    ReportStatus.REJECTED: "This doesn't look like a request for help, so it is not on the map.",
}


async def parse_report_text(connector: AIConnector, text: str) -> ParsedReport:
    return await connector.generate_structured(
        REPORT_PARSING_SYSTEM_PROMPT, build_report_prompt(text), ParsedReport
    )


async def preview_report(connector: AIConnector, text: str) -> ParsedReport:
    """Parse without saving, so the reporter can check and edit before submitting."""
    try:
        return await parse_report_text(connector, text)
    except AIConnectorError as exc:
        logger.warning("AI preview failed: %s", exc)
        raise ServiceUnavailableError(
            "AI is unavailable, please fill in the details manually"
        ) from exc


async def submit_report(
    session: AsyncSession, connector: AIConnector, data: ReportCreate, reporter: User | None
) -> ReportResult:
    """Free text + pin → incident. If the AI fails, the incident is still created with defaults."""
    ensure_in_service_area(data.location)  # before the AI call, so bad pins cost nothing

    meta = ReportMeta(source=ReportSource.AI, raw_text=data.text)
    parsed = data.parsed
    if parsed is None:
        try:
            parsed = await parse_report_text(connector, data.text)
            meta.ai_provider, meta.ai_model = connector.provider_name, connector.model_name
        except AIConnectorError as exc:
            logger.warning("AI report parsing failed, using fallback: %s", exc)
            parsed = build_fallback_report(data.text)
            meta.status = ReportStatus.FAILED
    meta.language = parsed.language
    meta.parsed_data = parsed.model_dump(mode="json")

    if not parsed.is_request_for_help:
        await incidents_service.save_rejected_report(
            session, meta, data.location, parsed.urgency, reporter
        )
        return build_result(ReportStatus.REJECTED, parsed, incident=None)

    incident, was_merged = await incidents_service.create_or_merge_incident(
        session, to_incident_create(parsed, data), reporter, meta
    )
    return build_result(meta.status, parsed, IncidentRead.model_validate(incident), was_merged)


def to_incident_create(parsed: ParsedReport, data: ReportCreate) -> IncidentCreate:
    return IncidentCreate(
        title=parsed.title,
        summary=parsed.summary,
        need_type=parsed.need_type,
        urgency=parsed.urgency,
        people_affected=parsed.people_affected,
        location=data.location,
        location_text=parsed.location_text,
        contact_phone=data.contact_phone,
        tasks=[TaskCreate(**task.model_dump()) for task in parsed.tasks],
    )


def build_fallback_report(text: str) -> ParsedReport:
    """Used when the AI is down: keep the request on the map instead of losing it."""
    text = " ".join(text.split())
    title = text if len(text) <= FALLBACK_TITLE_LENGTH else text[: FALLBACK_TITLE_LENGTH - 1] + "…"
    return ParsedReport(title=title, summary=text)


def build_result(
    status: ReportStatus,
    parsed: ParsedReport,
    incident: IncidentRead | None,
    was_merged: bool = False,
) -> ReportResult:
    message = RESULT_MESSAGES[status]
    if was_merged and incident is not None:
        message = (
            f"Someone already reported this nearby. Your report was added to it "
            f"({incident.report_count} reports from {incident.source_count} people)."
        )
    return ReportResult(
        status=status, was_merged=was_merged, message=message, parsed=parsed, incident=incident
    )
