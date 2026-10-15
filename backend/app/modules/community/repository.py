import uuid
from collections.abc import Sequence

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_model import utc_now
from app.modules.community.enums import ACTIVE_RESPONSE_STATUSES, ResponseStatus
from app.modules.community.models import CommunityPost, CommunityResponse
from app.modules.community.schemas import PostFilters
from app.shared.geo import within_bbox

MAP_ITEMS_LIMIT = 500


async def get_post(session: AsyncSession, post_id: uuid.UUID) -> CommunityPost | None:
    return await session.get(CommunityPost, post_id)


async def list_posts(session: AsyncSession, filters: PostFilters) -> Sequence[CommunityPost]:
    query = select(CommunityPost)
    if filters.bbox is not None:
        query = query.where(within_bbox(CommunityPost.location, filters.bbox))
    if filters.categories:
        query = query.where(CommunityPost.category.in_(filters.categories))
    if filters.statuses:
        query = query.where(CommunityPost.status.in_(filters.statuses))
    if filters.has_reward is not None:
        no_reward = or_(CommunityPost.reward_amount.is_(None), CommunityPost.reward_amount == 0)
        query = query.where(~no_reward if filters.has_reward else no_reward)
    if filters.owner_id is not None:
        query = query.where(CommunityPost.owner_id == filters.owner_id)
    if not filters.include_expired:
        query = query.where(CommunityPost.expires_at > utc_now())
    query = query.order_by(CommunityPost.created_at.desc()).limit(MAP_ITEMS_LIMIT)
    return (await session.execute(query)).scalars().all()


async def add_post(session: AsyncSession, post: CommunityPost) -> CommunityPost:
    session.add(post)
    await session.flush()
    return post


async def delete_post(session: AsyncSession, post: CommunityPost) -> None:
    await session.delete(post)


async def add_response(session: AsyncSession, response: CommunityResponse) -> CommunityResponse:
    session.add(response)
    await session.flush()
    return response


async def get_response(session: AsyncSession, response_id: uuid.UUID) -> CommunityResponse | None:
    return await session.get(CommunityResponse, response_id)


async def get_active_response(
    session: AsyncSession, post_id: uuid.UUID, user_id: uuid.UUID
) -> CommunityResponse | None:
    query = select(CommunityResponse).where(
        CommunityResponse.post_id == post_id,
        CommunityResponse.user_id == user_id,
        CommunityResponse.status.in_(ACTIVE_RESPONSE_STATUSES),
    )
    return (await session.execute(query)).scalar_one_or_none()


async def list_responses(
    session: AsyncSession, post_id: uuid.UUID, user_id: uuid.UUID | None = None
) -> Sequence[CommunityResponse]:
    """All responses of a post, or only one user's."""
    query = select(CommunityResponse).where(CommunityResponse.post_id == post_id)
    if user_id is not None:
        query = query.where(CommunityResponse.user_id == user_id)
    return (await session.execute(query.order_by(CommunityResponse.created_at))).scalars().all()


async def count_active_responses(session: AsyncSession, post_id: uuid.UUID) -> int:
    query = select(func.count()).where(
        CommunityResponse.post_id == post_id,
        CommunityResponse.status.in_(ACTIVE_RESPONSE_STATUSES),
    )
    return (await session.execute(query)).scalar_one()


async def decline_other_responses(
    session: AsyncSession, post_id: uuid.UUID, except_id: uuid.UUID | None = None
) -> None:
    query = update(CommunityResponse).where(
        CommunityResponse.post_id == post_id,
        CommunityResponse.status == ResponseStatus.PENDING,
    )
    if except_id is not None:
        query = query.where(CommunityResponse.id != except_id)
    await session.execute(
        query.values(status=ResponseStatus.DECLINED).execution_options(synchronize_session="fetch")
    )
