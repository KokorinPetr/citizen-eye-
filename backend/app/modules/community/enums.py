from enum import StrEnum


class PostCategory(StrEnum):
    LOST_PET = "lost_pet"
    FOUND_PET = "found_pet"
    LOST_ITEM = "lost_item"
    FOUND_ITEM = "found_item"
    HELP_WANTED = "help_wanted"  # "need someone to carry groceries", with or without a reward
    HELP_OFFERED = "help_offered"  # "I have a pickup truck, can help move things"
    OTHER = "other"


class PostStatus(StrEnum):
    OPEN = "open"
    MATCHED = "matched"  # the owner accepted a response
    CLOSED = "closed"  # solved or withdrawn by the owner


VISIBLE_POST_STATUSES = (PostStatus.OPEN, PostStatus.MATCHED)


class ResponseStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"  # another response was accepted, or the post was closed
    WITHDRAWN = "withdrawn"  # the responder took it back


ACTIVE_RESPONSE_STATUSES = (ResponseStatus.PENDING, ResponseStatus.ACCEPTED)
