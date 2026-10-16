import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.feed.enums import FeedSort, ReactionKind
from app.modules.feed.models import FeedComment, FeedPost, FeedReaction
from app.modules.feed.schemas import FeedFilters

ReactionTarget = FeedPost | FeedComment


def reaction_target(target: ReactionTarget) -> ColumnElement[bool]:
    """WHERE clause for the reactions on one post or one comment."""
    if isinstance(target, FeedPost):
        return FeedReaction.post_id == target.id
    return FeedReaction.comment_id == target.id


async def get_post(session: AsyncSession, post_id: uuid.UUID) -> FeedPost | None:
    return await session.get(FeedPost, post_id)


async def get_comment(session: AsyncSession, comment_id: uuid.UUID) -> FeedComment | None:
    return await session.get(FeedComment, comment_id)


async def list_posts(
    session: AsyncSession, filters: FeedFilters, top_since: datetime, include_hidden: bool = False
) -> Sequence[FeedPost]:
    query = select(FeedPost)
    if not include_hidden:
        query = query.where(FeedPost.is_hidden.is_(False))
    if filters.author_id is not None:
        query = query.where(FeedPost.author_id == filters.author_id)
    if filters.topics:
        query = query.where(FeedPost.topic.in_(filters.topics))
    if filters.sort == FeedSort.TOP:
        score = FeedPost.like_count + FeedPost.comment_count
        query = query.where(FeedPost.created_at >= top_since).order_by(
            score.desc(), FeedPost.created_at.desc()
        )
    else:
        query = query.order_by(FeedPost.created_at.desc())
    query = query.limit(filters.limit).offset(filters.offset)
    return (await session.execute(query)).scalars().all()


async def list_comments(session: AsyncSession, post_id: uuid.UUID) -> Sequence[FeedComment]:
    query = (
        select(FeedComment)
        .where(FeedComment.post_id == post_id, FeedComment.is_hidden.is_(False))
        .order_by(FeedComment.created_at)
    )
    return (await session.execute(query)).scalars().all()


async def count_visible_comments(session: AsyncSession, post_id: uuid.UUID) -> int:
    query = select(func.count()).where(
        FeedComment.post_id == post_id, FeedComment.is_hidden.is_(False)
    )
    return (await session.execute(query)).scalar_one()


async def add(session: AsyncSession, item: FeedPost | FeedComment | FeedReaction) -> None:
    session.add(item)
    await session.flush()


async def delete(session: AsyncSession, item: FeedPost | FeedComment | FeedReaction) -> None:
    await session.delete(item)
    await session.flush()


async def get_reaction(
    session: AsyncSession, target: ReactionTarget, user_id: uuid.UUID, kind: ReactionKind
) -> FeedReaction | None:
    query = select(FeedReaction).where(
        reaction_target(target), FeedReaction.user_id == user_id, FeedReaction.kind == kind
    )
    return (await session.execute(query)).scalar_one_or_none()


async def count_reactions(session: AsyncSession, target: ReactionTarget, kind: ReactionKind) -> int:
    query = select(func.count()).where(reaction_target(target), FeedReaction.kind == kind)
    return (await session.execute(query)).scalar_one()


async def liked_post_ids(
    session: AsyncSession, user_id: uuid.UUID, post_ids: Sequence[uuid.UUID]
) -> set[uuid.UUID]:
    if not post_ids:
        return set()
    query = select(FeedReaction.post_id).where(
        FeedReaction.user_id == user_id,
        FeedReaction.kind == ReactionKind.LIKE,
        FeedReaction.post_id.in_(post_ids),
    )
    return {post_id for post_id in (await session.execute(query)).scalars() if post_id}


async def liked_comment_ids(
    session: AsyncSession, user_id: uuid.UUID, comment_ids: Sequence[uuid.UUID]
) -> set[uuid.UUID]:
    if not comment_ids:
        return set()
    query = select(FeedReaction.comment_id).where(
        FeedReaction.user_id == user_id,
        FeedReaction.kind == ReactionKind.LIKE,
        FeedReaction.comment_id.in_(comment_ids),
    )
    return {comment_id for comment_id in (await session.execute(query)).scalars() if comment_id}
