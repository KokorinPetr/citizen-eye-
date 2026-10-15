import logging
import uuid
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_model import utc_now
from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ServiceUnavailableError,
)
from app.integrations.ai.connector import AIConnector, AIConnectorError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager, is_manager
from app.modules.community import repository
from app.modules.community.enums import VISIBLE_POST_STATUSES, PostStatus, ResponseStatus
from app.modules.community.models import CommunityPost, CommunityResponse
from app.modules.community.prompts import POST_PARSING_SYSTEM_PROMPT, build_post_prompt
from app.modules.community.schemas import (
    ParsedPost,
    PostCreate,
    PostFilters,
    PostUpdate,
    ResponseCreate,
)
from app.shared.geo import ensure_in_service_area, to_db_point

logger = logging.getLogger(__name__)


async def get_post_or_raise(session: AsyncSession, post_id: uuid.UUID) -> CommunityPost:
    post = await repository.get_post(session, post_id)
    if post is None:
        raise NotFoundError("Post not found")
    return post


async def list_posts(session: AsyncSession, filters: PostFilters) -> Sequence[CommunityPost]:
    """Board / map listing. Without a status filter, closed posts are hidden."""
    if not filters.statuses:
        filters = filters.model_copy(update={"statuses": list(VISIBLE_POST_STATUSES)})
    return await repository.list_posts(session, filters)


async def create_post(session: AsyncSession, data: PostCreate, owner: User) -> CommunityPost:
    ensure_in_service_area(data.location)
    post = await repository.add_post(
        session,
        CommunityPost(
            **data.model_dump(exclude={"location"}),
            location=to_db_point(data.location),
            owner=owner,
            expires_at=utc_now() + timedelta(days=get_settings().community_post_ttl_days),
        ),
    )
    await session.commit()
    return post


async def update_post(
    session: AsyncSession, post_id: uuid.UUID, data: PostUpdate, user: User
) -> CommunityPost:
    post = await get_post_or_raise(session, post_id)
    ensure_can_manage_post(user, post)

    for field, value in data.model_dump(exclude_unset=True, exclude={"location"}).items():
        setattr(post, field, value)
    if data.location is not None:
        ensure_in_service_area(data.location)
        post.location = to_db_point(data.location)

    await session.commit()
    return post


async def close_post(session: AsyncSession, post_id: uuid.UUID, user: User) -> CommunityPost:
    """Owner marks it solved (pet found, job done) or withdraws it."""
    post = await get_post_or_raise(session, post_id)
    ensure_can_manage_post(user, post)
    if post.status == PostStatus.CLOSED:
        raise ConflictError("Post is already closed")

    post.status = PostStatus.CLOSED
    post.closed_at = utc_now()
    await repository.decline_other_responses(session, post.id)
    await refresh_response_count(session, post)
    await session.commit()
    return post


async def delete_post(session: AsyncSession, post_id: uuid.UUID, user: User) -> None:
    post = await get_post_or_raise(session, post_id)
    ensure_can_manage_post(user, post)
    await repository.delete_post(session, post)
    await session.commit()


async def respond_to_post(
    session: AsyncSession, post_id: uuid.UUID, data: ResponseCreate, user: User
) -> CommunityResponse:
    """ "I found your cat" / "I can help". One active response per user per post."""
    post = await get_post_or_raise(session, post_id)
    if post.status != PostStatus.OPEN or post.expires_at <= utc_now():
        raise ConflictError("This post is not open for responses")
    if post.owner_id == user.id:
        raise ConflictError("You can't respond to your own post")
    if await repository.get_active_response(session, post.id, user.id):
        raise ConflictError("You already responded to this post")

    response = await repository.add_response(
        session, CommunityResponse(post_id=post.id, user=user, message=data.message)
    )
    await refresh_response_count(session, post)
    await session.commit()
    return response


async def list_responses(
    session: AsyncSession, post_id: uuid.UUID, user: User
) -> Sequence[CommunityResponse]:
    """Owner / coordinators see all responses; anyone else only their own."""
    post = await get_post_or_raise(session, post_id)
    can_see_all = post.owner_id == user.id or is_manager(user)
    return await repository.list_responses(session, post.id, None if can_see_all else user.id)


async def accept_response(
    session: AsyncSession, post_id: uuid.UUID, response_id: uuid.UUID, user: User
) -> CommunityResponse:
    """Owner picks one response: the post becomes `matched`, other pending ones are declined."""
    post = await get_post_or_raise(session, post_id)
    ensure_can_manage_post(user, post)
    response = await get_response_or_raise(session, post, response_id)
    if post.status != PostStatus.OPEN:
        raise ConflictError("Only open posts can accept a response")
    if response.status != ResponseStatus.PENDING:
        raise ConflictError("Only pending responses can be accepted")

    response.status = ResponseStatus.ACCEPTED
    post.status = PostStatus.MATCHED
    await repository.decline_other_responses(session, post.id, except_id=response.id)
    await refresh_response_count(session, post)
    await session.commit()
    return response


async def withdraw_response(
    session: AsyncSession, post_id: uuid.UUID, response_id: uuid.UUID, user: User
) -> None:
    post = await get_post_or_raise(session, post_id)
    response = await get_response_or_raise(session, post, response_id)
    if response.user_id != user.id and not is_manager(user):
        raise PermissionDeniedError("You can only withdraw your own response")
    if response.status not in (ResponseStatus.PENDING, ResponseStatus.ACCEPTED):
        raise ConflictError("Response is not active")

    if response.status == ResponseStatus.ACCEPTED and post.status == PostStatus.MATCHED:
        post.status = PostStatus.OPEN  # the helper dropped out: the post is open again
    response.status = ResponseStatus.WITHDRAWN
    await session.flush()
    await refresh_response_count(session, post)
    await session.commit()


async def preview_post(connector: AIConnector, text: str) -> ParsedPost:
    """AI draft from free text, nothing saved. The author edits it, then creates the post."""
    try:
        return await connector.generate_structured(
            POST_PARSING_SYSTEM_PROMPT, build_post_prompt(text), ParsedPost
        )
    except AIConnectorError as exc:
        logger.warning("AI post preview failed: %s", exc)
        raise ServiceUnavailableError(
            "AI is unavailable, please fill in the post manually"
        ) from exc


async def get_response_or_raise(
    session: AsyncSession, post: CommunityPost, response_id: uuid.UUID
) -> CommunityResponse:
    response = await repository.get_response(session, response_id)
    if response is None or response.post_id != post.id:
        raise NotFoundError("Response not found")
    return response


async def refresh_response_count(session: AsyncSession, post: CommunityPost) -> None:
    await session.flush()
    post.response_count = await repository.count_active_responses(session, post.id)


def ensure_can_manage_post(user: User, post: CommunityPost) -> None:
    ensure_owner_or_manager(user, post.owner_id, "Only the author or a coordinator can do this")
