from enum import StrEnum


class FeedTopic(StrEnum):
    COMPLAINT = "complaint"  # "The drain on Soi 5 has been blocked for a week"
    QUESTION = "question"
    NEWS = "news"
    CHAT = "chat"


class FeedSort(StrEnum):
    NEW = "new"
    TOP = "top"  # most liked + commented in the last `feed_top_window_days`


class ReactionKind(StrEnum):
    LIKE = "like"
    REPORT = "report"  # enough reports hide the item until a coordinator looks at it
