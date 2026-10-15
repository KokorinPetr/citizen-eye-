import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.modules.centers.enums import CenterSource, CenterStatus, CenterType
from app.shared.geo import point_column


class Center(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Shelters, supply points, hospitals, ... User-created and official ones share this table."""

    __tablename__ = "centers"
    __table_args__ = (Index("ix_centers_type_status", "center_type", "status"),)

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    center_type: Mapped[CenterType] = mapped_column(pg_enum(CenterType, "center_type"))
    status: Mapped[CenterStatus] = mapped_column(
        pg_enum(CenterStatus, "center_status"),
        default=CenterStatus.OPEN,
        server_default=CenterStatus.OPEN.value,
    )
    source: Mapped[CenterSource] = mapped_column(
        pg_enum(CenterSource, "center_source"),
        default=CenterSource.USER,
        server_default=CenterSource.USER.value,
    )
    location: Mapped[Any] = point_column()
    address: Mapped[str | None] = mapped_column(String(300))
    phone: Mapped[str | None] = mapped_column(String(32))
    capacity: Mapped[int | None] = mapped_column(Integer)
    # NeedType values this place can provide (food, water, medicine, ...)
    supplies: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)), default=list, server_default="{}"
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    source_url: Mapped[str | None] = mapped_column(String(500))
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
