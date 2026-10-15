import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.modules.community.enums import PostCategory, PostStatus, ResponseStatus
from app.shared.geo import point_column

if TYPE_CHECKING:
    from app.modules.auth.models import User


class CommunityPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Everyday post: lost/found pets and items, help wanted/offered. Reward is optional."""

    __tablename__ = "community_posts"
    __table_args__ = (Index("ix_community_posts_status_category", "status", "category"),)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[PostCategory] = mapped_column(pg_enum(PostCategory, "post_category"))
    status: Mapped[PostStatus] = mapped_column(
        pg_enum(PostStatus, "post_status"),
        default=PostStatus.OPEN,
        server_default=PostStatus.OPEN.value,
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Category-specific fields (species, colour, breed, item type, ...): no migration per field.
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    location: Mapped[Any] = point_column()
    location_text: Mapped[str | None] = mapped_column(String(300))
    reward_amount: Mapped[int | None] = mapped_column(Integer)  # THB, optional, display only
    reward_note: Mapped[str | None] = mapped_column(String(200))  # e.g. "PromptPay QR when found"
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    response_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped["User"] = relationship(lazy="selectin")


class CommunityResponse(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """ "I found it" / "I can help" on a post. Visible to the post owner and the responder only."""

    __tablename__ = "community_responses"
    __table_args__ = (
        Index(
            "uq_community_responses_active_user_post",
            "user_id",
            "post_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'accepted')"),
        ),
    )

    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("community_posts.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[ResponseStatus] = mapped_column(
        pg_enum(ResponseStatus, "response_status"),
        default=ResponseStatus.PENDING,
        server_default=ResponseStatus.PENDING.value,
    )

    user: Mapped["User"] = relationship(lazy="selectin")
