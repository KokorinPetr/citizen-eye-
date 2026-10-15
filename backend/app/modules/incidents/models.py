import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum, utc_now
from app.modules.incidents.enums import (
    IncidentStatus,
    NeedType,
    ReportSource,
    TaskRole,
    TaskStatus,
    Urgency,
)
from app.shared.geo import point_column


class Incident(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (Index("ix_incidents_status_need_type", "status", "need_type"),)

    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    need_type: Mapped[NeedType] = mapped_column(pg_enum(NeedType, "need_type"))
    urgency: Mapped[Urgency] = mapped_column(pg_enum(Urgency, "urgency"))
    status: Mapped[IncidentStatus] = mapped_column(
        pg_enum(IncidentStatus, "incident_status"),
        default=IncidentStatus.OPEN,
        server_default=IncidentStatus.OPEN.value,
    )
    magnitude: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0", index=True)
    location: Mapped[Any] = point_column()
    location_text: Mapped[str | None] = mapped_column(String(300))
    people_affected: Mapped[int | None] = mapped_column(Integer)
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    report_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    last_report_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tasks: Mapped[list["IncidentTask"]] = relationship(
        back_populates="incident",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="IncidentTask.created_at",
    )

    @property
    def open_tasks(self) -> list["IncidentTask"]:
        return [task for task in self.tasks if task.status != TaskStatus.DONE]

    @property
    def helpers_needed(self) -> int:
        """Helpers needed for tasks that are not done yet."""
        return sum(task.needed_count for task in self.open_tasks)

    @property
    def helpers_signed_up(self) -> int:
        return sum(task.signed_up_count for task in self.open_tasks)


class IncidentTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "incident_tasks"

    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    role: Mapped[TaskRole] = mapped_column(pg_enum(TaskRole, "task_role"))
    needed_count: Mapped[int] = mapped_column(SmallInteger, default=1)
    # Active ("going") signups. Always recounted from volunteer_signups, never incremented.
    signed_up_count: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    status: Mapped[TaskStatus] = mapped_column(
        pg_enum(TaskStatus, "task_status"),
        default=TaskStatus.OPEN,
        server_default=TaskStatus.OPEN.value,
    )

    incident: Mapped[Incident] = relationship(back_populates="tasks")


class IncidentReport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Every incoming report is kept, also after it was merged into an incident."""

    __tablename__ = "reports"

    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    source: Mapped[ReportSource] = mapped_column(pg_enum(ReportSource, "report_source"))
    raw_text: Mapped[str] = mapped_column(Text)
    urgency: Mapped[Urgency] = mapped_column(pg_enum(Urgency, "urgency"))
    people_affected: Mapped[int | None] = mapped_column(Integer)
    magnitude: Mapped[int] = mapped_column(SmallInteger)
    location: Mapped[Any] = point_column()
    parsed_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
