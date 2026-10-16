import uuid

from fastapi import APIRouter, status

from app.core.database import DbSession
from app.modules.auth.dependencies import CurrentUser, OptionalUser
from app.modules.feed import service
from app.modules.feed.dependencies import FeedFiltersDep
from app.modules.feed.schemas import (
    FeedCommentCreate,
    FeedCommentRead,
    FeedPostCreate,
    FeedPostRead,
    LikeState,
)

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("/posts")
async def list_posts(
    session: DbSession, filters: FeedFiltersDep, viewer: OptionalUser
) -> list[FeedPostRead]:
    """Public. `?sort=new|top&topic=complaint&author_id=&limit=20&offset=0`.

    Next page: `offset += limit`. `author_id` = "My posts" (authors also see their hidden ones).
    """
    return await service.list_posts(session, filters, viewer)


@router.post("/posts", status_code=status.HTTP_201_CREATED)
async def create_post(data: FeedPostCreate, session: DbSession, user: CurrentUser) -> FeedPostRead:
    return await service.create_post(session, data, user)


@router.get("/posts/{post_id}")
async def get_post(post_id: uuid.UUID, session: DbSession, viewer: OptionalUser) -> FeedPostRead:
    return await service.get_post(session, post_id, viewer)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await service.delete_post(session, post_id, user)


@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: uuid.UUID, session: DbSession, viewer: OptionalUser
) -> list[FeedCommentRead]:
    """Public, oldest first. Replies have `parent_id` (one level deep)."""
    return await service.list_comments(session, post_id, viewer)


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    post_id: uuid.UUID, data: FeedCommentCreate, session: DbSession, user: CurrentUser
) -> FeedCommentRead:
    return await service.add_comment(session, post_id, data, user)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await service.delete_comment(session, comment_id, user)


@router.post("/posts/{post_id}/like")
async def like_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> LikeState:
    post = await service.get_post_or_raise(session, post_id, user)
    return await service.set_like(session, post, user, liked=True)


@router.delete("/posts/{post_id}/like")
async def unlike_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> LikeState:
    post = await service.get_post_or_raise(session, post_id, user)
    return await service.set_like(session, post, user, liked=False)


@router.post("/comments/{comment_id}/like")
async def like_comment(comment_id: uuid.UUID, session: DbSession, user: CurrentUser) -> LikeState:
    comment = await service.get_comment_or_raise(session, comment_id)
    return await service.set_like(session, comment, user, liked=True)


@router.delete("/comments/{comment_id}/like")
async def unlike_comment(comment_id: uuid.UUID, session: DbSession, user: CurrentUser) -> LikeState:
    comment = await service.get_comment_or_raise(session, comment_id)
    return await service.set_like(session, comment, user, liked=False)


@router.post("/posts/{post_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    """Hidden after `feed_hide_after_reports` different people report it."""
    await service.report(session, await service.get_post_or_raise(session, post_id, user), user)


@router.post("/comments/{comment_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_comment(comment_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await service.report(session, await service.get_comment_or_raise(session, comment_id), user)
