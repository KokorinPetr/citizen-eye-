import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.auth.schemas import UserPublic
from app.modules.feed.enums import FeedSort, FeedTopic

FEED_PAGE_SIZE = 20
FEED_PAGE_SIZE_MAX = 50


class FeedPostCreate(BaseModel):
    topic: FeedTopic
    body: str = Field(min_length=3, max_length=2000)
    area_text: str | None = Field(
        default=None,
        max_length=100,
        description='Area name only, e.g. "Lat Phrao". No exact address.',
    )


class FeedCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_id: uuid.UUID | None = Field(default=None, description="Reply to this comment")


class FeedFilters(BaseModel):
    topics: list[FeedTopic] = Field(default_factory=list)
    author_id: uuid.UUID | None = None
    sort: FeedSort = FeedSort.NEW
    limit: int = Field(default=FEED_PAGE_SIZE, ge=1, le=FEED_PAGE_SIZE_MAX)
    offset: int = Field(default=0, ge=0)


class FeedPostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    topic: FeedTopic
    body: str
    area_text: str | None
    author: UserPublic
    like_count: int
    comment_count: int
    liked_by_me: bool = Field(default=False, description="false for anonymous viewers")
    created_at: datetime


class FeedCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    post_id: uuid.UUID
    parent_id: uuid.UUID | None
    body: str
    author: UserPublic
    like_count: int
    liked_by_me: bool = False
    created_at: datetime


class LikeState(BaseModel):
    liked: bool
    like_count: int
