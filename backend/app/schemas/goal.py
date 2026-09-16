from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Category, GoalStatus


class GoalCreate(BaseModel):
    category: Category
    title: str
    description: str | None = None


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: GoalStatus | None = None


class GoalOut(BaseModel):
    id: int
    category: Category
    title: str
    description: str | None
    status: GoalStatus
    created_at: datetime

    model_config = {"from_attributes": True}
