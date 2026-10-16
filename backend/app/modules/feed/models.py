import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.modules.feed.enums import FeedTopic, ReactionKind

if TYPE_CHECKING:
    from app.modules.auth.models import User


class FeedPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Neighbourhood talk: complaints, questions, news, chat. No map pin, only an area name."""

    __tablename__ = "feed_posts"
    __table_args__ = (Index("ix_feed_posts_hidden_created", "is_hidden", "created_at"),)

    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[FeedTopic] = mapped_column(pg_enum(FeedTopic, "feed_topic"))
    body: Mapped[str] = mapped_column(Text)
    area_text: Mapped[str | None] = mapped_column(String(100))
    like_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    comment_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    report_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    author: Mapped["User"] = relationship(lazy="selectin")


class FeedComment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Comment on a post, or a reply to one. One level: a reply to a reply joins its thread."""

    __tablename__ = "feed_comments"

    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("feed_posts.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("feed_comments.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(Text)
    like_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    report_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    author: Mapped["User"] = relationship(lazy="selectin")


class FeedReaction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A like or a report by one user on one post or comment (at most one of each kind)."""

    __tablename__ = "feed_reactions"
    __table_args__ = (
        CheckConstraint("(post_id IS NULL) <> (comment_id IS NULL)", name="exactly_one_target"),
        Index(
            "uq_feed_reactions_user_kind_post",
            "user_id",
            "kind",
            "post_id",
            unique=True,
            postgresql_where=text("post_id IS NOT NULL"),
        ),
        Index(
            "uq_feed_reactions_user_kind_comment",
            "user_id",
            "kind",
            "comment_id",
            unique=True,
            postgresql_where=text("comment_id IS NOT NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[ReactionKind] = mapped_column(pg_enum(ReactionKind, "feed_reaction_kind"))
    post_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("feed_posts.id", ondelete="CASCADE"), index=True
    )
    comment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("feed_comments.id", ondelete="CASCADE"), index=True
    )
