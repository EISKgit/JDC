from pydantic import BaseModel, Field

from app.models.enums import Category
from app.schemas.common import UTCDateTime


class LifeProfileIn(BaseModel):
    # Bounded: this text is sent to the AI to write the profile summary.
    about: str | None = Field(default=None, max_length=2000)
    goals_text: str | None = Field(default=None, max_length=2000)
    challenges: str | None = Field(default=None, max_length=2000)
    focus_categories: list[Category] = Field(default_factory=list, max_length=len(Category))


class LifeProfileOut(BaseModel):
    id: int
    about: str | None
    goals_text: str | None
    challenges: str | None
    focus_categories: list[Category]
    ai_summary: str | None
    created_at: UTCDateTime
    updated_at: UTCDateTime

    model_config = {"from_attributes": True}
