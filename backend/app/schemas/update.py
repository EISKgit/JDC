from datetime import datetime

from pydantic import BaseModel

from app.schemas.event import EventOut


class UpdateCreate(BaseModel):
    content: str


class UpdateOut(BaseModel):
    id: int
    content: str
    created_at: datetime
    events: list[EventOut] = []

    model_config = {"from_attributes": True}
