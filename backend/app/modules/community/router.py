import uuid

from fastapi import APIRouter, status

from app.core.database import DbSession
from app.integrations.ai.factory import AIConnectorDep
from app.modules.auth.dependencies import CurrentUser, OptionalUser
from app.modules.community import service
from app.modules.community.dependencies import PostFiltersDep
from app.modules.community.models import CommunityPost
from app.modules.community.schemas import (
    ParsedPost,
    PostCreate,
    PostPreviewRequest,
    PostRead,
    PostUpdate,
    ResponseCreate,
    ResponseRead,
)

router = APIRouter(prefix="/community", tags=["community"])


def to_post_read(post: CommunityPost, viewer: OptionalUser) -> PostRead:
    """The contact phone is only shown to logged-in users."""
    read = PostRead.model_validate(post)
    return read if viewer is not None else read.model_copy(update={"contact_phone": None})


@router.get("/posts")
async def list_posts(
    session: DbSession, filters: PostFiltersDep, viewer: OptionalUser
) -> list[PostRead]:
    """Public board: `?bbox=&category=lost_pet&category=found_pet&has_reward=true`."""
    return [to_post_read(post, viewer) for post in await service.list_posts(session, filters)]


@router.post("/posts/preview")
async def preview_post(
    data: PostPreviewRequest, connector: AIConnectorDep, user: CurrentUser
) -> ParsedPost:
    """AI draft from free text (nothing saved). Edit it, then POST /community/posts."""
    return await service.preview_post(connector, data.text)


@router.post("/posts", status_code=status.HTTP_201_CREATED)
async def create_post(data: PostCreate, session: DbSession, user: CurrentUser) -> PostRead:
    return to_post_read(await service.create_post(session, data, user), user)


@router.get("/posts/{post_id}")
async def get_post(post_id: uuid.UUID, session: DbSession, viewer: OptionalUser) -> PostRead:
    return to_post_read(await service.get_post_or_raise(session, post_id), viewer)


@router.patch("/posts/{post_id}")
async def update_post(
    post_id: uuid.UUID, data: PostUpdate, session: DbSession, user: CurrentUser
) -> PostRead:
    return to_post_read(await service.update_post(session, post_id, data, user), user)


@router.post("/posts/{post_id}/close")
async def close_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> PostRead:
    """Solved (pet found, job done) or withdrawn."""
    return to_post_read(await service.close_post(session, post_id, user), user)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await service.delete_post(session, post_id, user)


@router.post("/posts/{post_id}/responses", status_code=status.HTTP_201_CREATED)
async def respond_to_post(
    post_id: uuid.UUID, data: ResponseCreate, session: DbSession, user: CurrentUser
) -> ResponseRead:
    """ "I found it" / "I can help" with a message to the author."""
    return ResponseRead.model_validate(await service.respond_to_post(session, post_id, data, user))


@router.get("/posts/{post_id}/responses")
async def list_responses(
    post_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> list[ResponseRead]:
    """Author / coordinators: all responses. Anyone else: only their own."""
    responses = await service.list_responses(session, post_id, user)
    return [ResponseRead.model_validate(response) for response in responses]


@router.post("/posts/{post_id}/responses/{response_id}/accept")
async def accept_response(
    post_id: uuid.UUID, response_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> ResponseRead:
    """Author picks a helper/finder: post becomes `matched`, other pending responses declined."""
    response = await service.accept_response(session, post_id, response_id, user)
    return ResponseRead.model_validate(response)


@router.delete("/posts/{post_id}/responses/{response_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_response(
    post_id: uuid.UUID, response_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> None:
    await service.withdraw_response(session, post_id, response_id, user)
