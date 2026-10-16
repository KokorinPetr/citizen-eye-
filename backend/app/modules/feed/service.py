"""Feed: neighbourhood talk. Anyone reads; logged-in users post, comment, like and report."""

import uuid
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_model import utc_now
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager, is_manager
from app.modules.feed import repository
from app.modules.feed.enums import ReactionKind
from app.modules.feed.models import FeedComment, FeedPost, FeedReaction
from app.modules.feed.repository import ReactionTarget
from app.modules.feed.schemas import (
    FeedCommentCreate,
    FeedCommentRead,
    FeedFilters,
    FeedPostCreate,
    FeedPostRead,
    LikeState,
)


def can_see(item: FeedPost | FeedComment, viewer: User | None) -> bool:
    """Hidden (reported) items stay visible only to their author and coordinators."""
    if not item.is_hidden:
        return True
    return viewer is not None and (viewer.id == item.author_id or is_manager(viewer))


async def get_post_or_raise(
    session: AsyncSession, post_id: uuid.UUID, viewer: User | None
) -> FeedPost:
    post = await repository.get_post(session, post_id)
    if post is None or not can_see(post, viewer):
        raise NotFoundError("Post not found")
    return post


async def get_comment_or_raise(session: AsyncSession, comment_id: uuid.UUID) -> FeedComment:
    comment = await repository.get_comment(session, comment_id)
    if comment is None or comment.is_hidden:
        raise NotFoundError("Comment not found")
    return comment


# Posts


async def list_posts(
    session: AsyncSession, filters: FeedFilters, viewer: User | None
) -> list[FeedPostRead]:
    top_since = utc_now() - timedelta(days=get_settings().feed_top_window_days)
    # Authors see their own hidden posts in "Mine", so they know what happened to them.
    own_posts = viewer is not None and filters.author_id == viewer.id
    posts = await repository.list_posts(session, filters, top_since, include_hidden=own_posts)
    return await to_post_reads(session, posts, viewer)


async def get_post(session: AsyncSession, post_id: uuid.UUID, viewer: User | None) -> FeedPostRead:
    post = await get_post_or_raise(session, post_id, viewer)
    return (await to_post_reads(session, [post], viewer))[0]


async def create_post(session: AsyncSession, data: FeedPostCreate, author: User) -> FeedPostRead:
    post = FeedPost(**data.model_dump(), author=author)
    await repository.add(session, post)
    await session.commit()
    return FeedPostRead.model_validate(post)


async def delete_post(session: AsyncSession, post_id: uuid.UUID, user: User) -> None:
    post = await get_post_or_raise(session, post_id, user)
    ensure_owner_or_manager(user, post.author_id, "Only the author or a coordinator can do this")
    await repository.delete(session, post)
    await session.commit()


async def to_post_reads(
    session: AsyncSession, posts: Sequence[FeedPost], viewer: User | None
) -> list[FeedPostRead]:
    liked = (
        await repository.liked_post_ids(session, viewer.id, [post.id for post in posts])
        if viewer
        else set()
    )
    return [
        FeedPostRead.model_validate(post).model_copy(update={"liked_by_me": post.id in liked})
        for post in posts
    ]


# Comments


async def list_comments(
    session: AsyncSession, post_id: uuid.UUID, viewer: User | None
) -> list[FeedCommentRead]:
    """Oldest first. Replies whose parent was hidden are left out too."""
    await get_post_or_raise(session, post_id, viewer)
    comments = await repository.list_comments(session, post_id)
    visible_ids = {comment.id for comment in comments}
    comments = [c for c in comments if c.parent_id is None or c.parent_id in visible_ids]
    liked = (
        await repository.liked_comment_ids(session, viewer.id, [c.id for c in comments])
        if viewer
        else set()
    )
    return [
        FeedCommentRead.model_validate(c).model_copy(update={"liked_by_me": c.id in liked})
        for c in comments
    ]


async def add_comment(
    session: AsyncSession, post_id: uuid.UUID, data: FeedCommentCreate, author: User
) -> FeedCommentRead:
    post = await get_post_or_raise(session, post_id, author)
    parent_id = None
    if data.parent_id is not None:
        parent = await get_comment_or_raise(session, data.parent_id)
        if parent.post_id != post.id:
            raise NotFoundError("Comment not found")
        # One level of replies: a reply to a reply joins the same thread.
        parent_id = parent.parent_id or parent.id

    comment = FeedComment(post_id=post.id, parent_id=parent_id, body=data.body, author=author)
    await repository.add(session, comment)
    post.comment_count = await repository.count_visible_comments(session, post.id)
    await session.commit()
    return FeedCommentRead.model_validate(comment)


async def delete_comment(session: AsyncSession, comment_id: uuid.UUID, user: User) -> None:
    """Deleting a comment also deletes its replies."""
    comment = await get_comment_or_raise(session, comment_id)
    ensure_owner_or_manager(user, comment.author_id, "Only the author or a coordinator can do this")
    post = await get_post_or_raise(session, comment.post_id, user)
    await repository.delete(session, comment)
    post.comment_count = await repository.count_visible_comments(session, post.id)
    await session.commit()


# Likes and reports (same rules for posts and comments)


async def set_like(
    session: AsyncSession, target: ReactionTarget, user: User, liked: bool
) -> LikeState:
    """Idempotent: liking twice keeps one like, unliking without a like does nothing."""
    existing = await repository.get_reaction(session, target, user.id, ReactionKind.LIKE)
    if liked and existing is None:
        await repository.add(session, new_reaction(target, user, ReactionKind.LIKE))
    elif not liked and existing is not None:
        await repository.delete(session, existing)
    target.like_count = await repository.count_reactions(session, target, ReactionKind.LIKE)
    await session.commit()
    return LikeState(liked=liked, like_count=target.like_count)


async def report(session: AsyncSession, target: ReactionTarget, user: User) -> None:
    """One report per user. Enough reports hide the item until a coordinator looks at it."""
    if await repository.get_reaction(session, target, user.id, ReactionKind.REPORT) is None:
        await repository.add(session, new_reaction(target, user, ReactionKind.REPORT))
    target.report_count = await repository.count_reactions(session, target, ReactionKind.REPORT)
    if target.report_count >= get_settings().feed_hide_after_reports and not target.is_hidden:
        target.is_hidden = True
        if isinstance(target, FeedComment):
            post = await repository.get_post(session, target.post_id)
            if post is not None:
                await session.flush()
                post.comment_count = await repository.count_visible_comments(session, post.id)
    await session.commit()


def new_reaction(target: ReactionTarget, user: User, kind: ReactionKind) -> FeedReaction:
    if isinstance(target, FeedPost):
        return FeedReaction(user_id=user.id, kind=kind, post_id=target.id)
    return FeedReaction(user_id=user.id, kind=kind, comment_id=target.id)
