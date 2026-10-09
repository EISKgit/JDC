from pydantic import BaseModel

from app.models.enums import Category
from app.schemas.common import UTCDateTime


class LifeProfileIn(BaseModel):
    about: str | None = None
    goals_text: str | None = None
    challenges: str | None = None
    focus_categories: list[Category] = []


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
