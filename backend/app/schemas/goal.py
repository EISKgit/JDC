from pydantic import BaseModel, Field

from app.models.enums import Category, GoalStatus
from app.schemas.common import UTCDateTime


class GoalCreate(BaseModel):
    category: Category
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    status: GoalStatus | None = None


class GoalOut(BaseModel):
    id: int
    category: Category
    title: str
    description: str | None
    status: GoalStatus
    created_at: UTCDateTime

    model_config = {"from_attributes": True}
