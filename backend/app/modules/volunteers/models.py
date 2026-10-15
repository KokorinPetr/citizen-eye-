import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.modules.volunteers.enums import SignupStatus

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.incidents.models import Incident, IncidentTask


class VolunteerSignup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A user's "I'm going" for one task of an incident."""

    __tablename__ = "volunteer_signups"
    __table_args__ = (
        # One active signup per user per incident.
        Index(
            "uq_volunteer_signups_active_user_incident",
            "user_id",
            "incident_id",
            unique=True,
            postgresql_where=text("status = 'going'"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incident_tasks.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[SignupStatus] = mapped_column(
        pg_enum(SignupStatus, "signup_status"),
        default=SignupStatus.GOING,
        server_default=SignupStatus.GOING.value,
    )

    user: Mapped["User"] = relationship(lazy="selectin")
    incident: Mapped["Incident"] = relationship(lazy="selectin")
    task: Mapped["IncidentTask"] = relationship(lazy="selectin")
