from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.incidents.enums import NeedType, ReportStatus, TaskRole, Urgency
from app.modules.incidents.schemas import IncidentRead
from app.shared.geo import GeoPoint
from app.shared.types import PhoneNumber

MAX_PEOPLE = 10_000
MAX_TASK_HELPERS = 50

PARSED_REPORT_EXAMPLE: dict[str, Any] = {
    "is_request_for_help": True,
    "title": "Elderly woman needs diabetes medicine",
    "summary": "Water is knee-deep on Soi 12. An 80-year-old woman has run out of diabetes "
    "medicine and cannot leave the house.",
    "need_type": "medicine",
    "urgency": "high",
    "people_affected": 1,
    "location_text": "ซอย 12 ลาดพร้าว",
    "language": "th",
    "tasks": [{"title": "Deliver diabetes medicine", "role": "driver", "needed_count": 1}],
}


def coerce_enum(value: Any, enum_class: type, default: Any) -> Any:
    """LLMs sometimes invent values; fall back to a safe default instead of failing."""
    normalized = str(value).strip().lower() if value is not None else ""
    return normalized if normalized in enum_class._value2member_map_ else default


def clamp_int(value: Any, minimum: int, maximum: int) -> int | None:
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return None


class ParsedTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    role: TaskRole = TaskRole.GENERAL
    needed_count: int = 1

    @field_validator("role", mode="before")
    @classmethod
    def coerce_role(cls, value: Any) -> Any:
        return coerce_enum(value, TaskRole, TaskRole.GENERAL)

    @field_validator("needed_count", mode="before")
    @classmethod
    def coerce_needed_count(cls, value: Any) -> int:
        return clamp_int(value, 1, MAX_TASK_HELPERS) or 1


class ParsedReport(BaseModel):
    """What the AI extracts from a free-text report. Also the editable preview for the reporter."""

    model_config = ConfigDict(json_schema_extra={"examples": [PARSED_REPORT_EXAMPLE]})

    is_request_for_help: bool = True
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(default="", max_length=2000)
    need_type: NeedType = NeedType.OTHER
    urgency: Urgency = Urgency.MEDIUM
    people_affected: int | None = None
    location_text: str | None = Field(default=None, max_length=300)
    language: str | None = Field(default=None, max_length=8)
    tasks: list[ParsedTask] = Field(default_factory=list, max_length=10)

    @field_validator("need_type", mode="before")
    @classmethod
    def coerce_need_type(cls, value: Any) -> Any:
        return coerce_enum(value, NeedType, NeedType.OTHER)

    @field_validator("urgency", mode="before")
    @classmethod
    def coerce_urgency(cls, value: Any) -> Any:
        return coerce_enum(value, Urgency, Urgency.MEDIUM)

    @field_validator("people_affected", mode="before")
    @classmethod
    def coerce_people(cls, value: Any) -> int | None:
        return clamp_int(value, 0, MAX_PEOPLE)


class ReportCreate(BaseModel):
    text: str = Field(
        min_length=5, max_length=2000, description="Free text: Thai, English, Russian"
    )
    location: GeoPoint = Field(description="Pin on the map (GPS to locate, then adjusted by user)")
    contact_phone: PhoneNumber | None = None
    parsed: ParsedReport | None = Field(
        default=None,
        description="The preview from /reports/preview, confirmed or edited by the reporter. "
        "If given, the AI is not called again.",
    )


class ReportPreviewRequest(BaseModel):
    text: str = Field(min_length=5, max_length=2000)


class ReportResult(BaseModel):
    status: ReportStatus
    was_merged: bool = Field(
        default=False, description="Added to an existing incident nearby instead of a new one"
    )
    message: str
    parsed: ParsedReport
    incident: IncidentRead | None
