import json
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.modules.auth.schemas import UserPublic
from app.modules.community.enums import PostCategory, PostStatus, ResponseStatus
from app.shared.geo import BBox, DbPoint, GeoPoint
from app.shared.types import PhoneNumber

MAX_DETAILS_JSON_LENGTH = 2000
MAX_REWARD_THB = 1_000_000
PLATFORM_FEE_RATE = 0.05  # pitch only: shown, never charged (no payments in the MVP)


def check_details_size(details: dict[str, Any]) -> dict[str, Any]:
    if len(json.dumps(details, ensure_ascii=False)) > MAX_DETAILS_JSON_LENGTH:
        raise ValueError(f"details must be at most {MAX_DETAILS_JSON_LENGTH} characters as JSON")
    return details


class PostCreate(BaseModel):
    category: PostCategory
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=2000)
    details: dict[str, Any] = Field(
        default_factory=dict,
        description='Free-form, e.g. {"species": "cat", "colour": "white", "name": "Mali"}',
    )
    location: GeoPoint = Field(description="Pin on the map")
    location_text: str | None = Field(default=None, max_length=300)
    reward_amount: int | None = Field(default=None, ge=0, le=MAX_REWARD_THB, description="THB")
    reward_note: str | None = Field(default=None, max_length=200)
    contact_phone: PhoneNumber | None = Field(
        default=None, description="Shown only to logged-in users"
    )

    @field_validator("details")
    @classmethod
    def check_details(cls, value: dict[str, Any]) -> dict[str, Any]:
        return check_details_size(value)


class PostUpdate(BaseModel):
    category: PostCategory | None = None
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    details: dict[str, Any] | None = None
    location: GeoPoint | None = None
    location_text: str | None = Field(default=None, max_length=300)
    reward_amount: int | None = Field(default=None, ge=0, le=MAX_REWARD_THB)
    reward_note: str | None = Field(default=None, max_length=200)
    contact_phone: PhoneNumber | None = None

    @field_validator("details")
    @classmethod
    def check_details(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return check_details_size(value) if value is not None else None


class PostFilters(BaseModel):
    """Map / list filters. Lists mean "any of"; empty means no filter."""

    bbox: BBox | None = None
    categories: list[PostCategory] = Field(default_factory=list)
    statuses: list[PostStatus] = Field(default_factory=list)
    has_reward: bool | None = None
    owner_id: uuid.UUID | None = None
    include_expired: bool = False


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: PostCategory
    status: PostStatus
    title: str
    description: str
    details: dict[str, Any]
    location: DbPoint
    location_text: str | None
    reward_amount: int | None
    reward_note: str | None
    contact_phone: str | None = Field(description="null for anonymous viewers")
    owner: UserPublic
    response_count: int
    expires_at: datetime
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field(description="Pitch only: what a 5% commission would be. Never charged.")
    @property
    def platform_fee_preview(self) -> int | None:
        if not self.reward_amount:
            return None
        return round(self.reward_amount * PLATFORM_FEE_RATE)


class ResponseCreate(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class ResponseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    post_id: uuid.UUID
    user: UserPublic
    message: str
    status: ResponseStatus
    created_at: datetime


class PostPreviewRequest(BaseModel):
    text: str = Field(min_length=5, max_length=2000)


PARSED_POST_EXAMPLE: dict[str, Any] = {
    "category": "lost_pet",
    "title": "Lost white cat Mali",
    "description": "White cat with a blue collar, ran away near Soi 12 yesterday evening. Shy.",
    "details": {"species": "cat", "colour": "white", "name": "Mali", "collar": "blue"},
    "location_text": "ซอย 12 ลาดพร้าว",
    "reward_amount": 2000,
    "reward_note": None,
    "language": "th",
}


class ParsedPost(BaseModel):
    """AI draft of a community post, shown to the author to confirm or edit."""

    model_config = ConfigDict(json_schema_extra={"examples": [PARSED_POST_EXAMPLE]})

    category: PostCategory = PostCategory.OTHER
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=2000)
    details: dict[str, Any] = Field(default_factory=dict)
    location_text: str | None = Field(default=None, max_length=300)
    reward_amount: int | None = None
    reward_note: str | None = Field(default=None, max_length=200)
    language: str | None = Field(default=None, max_length=8)

    @field_validator("category", mode="before")
    @classmethod
    def coerce_category(cls, value: Any) -> Any:
        normalized = str(value or "").strip().lower()
        return normalized if normalized in PostCategory._value2member_map_ else PostCategory.OTHER

    @field_validator("reward_amount", mode="before")
    @classmethod
    def coerce_reward(cls, value: Any) -> int | None:
        try:
            amount = int(value)
        except (TypeError, ValueError):
            return None
        return amount if 0 < amount <= MAX_REWARD_THB else None

    @field_validator("details", mode="before")
    @classmethod
    def coerce_details(cls, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}
