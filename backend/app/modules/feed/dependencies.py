import uuid
from typing import Annotated

from fastapi import Depends, Query

from app.modules.feed.enums import FeedSort, FeedTopic
from app.modules.feed.schemas import FEED_PAGE_SIZE, FEED_PAGE_SIZE_MAX, FeedFilters


def get_feed_filters(
    topic: Annotated[list[FeedTopic] | None, Query(description="Repeatable (any of)")] = None,
    sort: FeedSort = FeedSort.NEW,
    limit: Annotated[int, Query(ge=1, le=FEED_PAGE_SIZE_MAX)] = FEED_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
    author_id: Annotated[
        uuid.UUID | None, Query(description='"My posts": pass your user id')
    ] = None,
) -> FeedFilters:
    return FeedFilters(
        topics=topic or [], sort=sort, limit=limit, offset=offset, author_id=author_id
    )


FeedFiltersDep = Annotated[FeedFilters, Depends(get_feed_filters)]
