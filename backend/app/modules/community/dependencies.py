import uuid
from typing import Annotated

from fastapi import Depends, Query

from app.modules.community.enums import PostCategory, PostStatus
from app.modules.community.schemas import PostFilters
from app.shared.geo import BBox, parse_bbox


def get_post_filters(
    bbox: Annotated[BBox | None, Depends(parse_bbox)],
    category: Annotated[list[PostCategory] | None, Query(description="Repeatable (any of)")] = None,
    status: Annotated[
        list[PostStatus] | None, Query(description="Repeatable. Default: open + matched")
    ] = None,
    has_reward: Annotated[bool | None, Query(description="true = with a reward only")] = None,
    owner_id: Annotated[
        uuid.UUID | None, Query(description='"My posts": pass your user id')
    ] = None,
    include_expired: bool = False,
) -> PostFilters:
    return PostFilters(
        bbox=bbox,
        categories=category or [],
        statuses=status or [],
        has_reward=has_reward,
        owner_id=owner_id,
        include_expired=include_expired,
    )


PostFiltersDep = Annotated[PostFilters, Depends(get_post_filters)]
