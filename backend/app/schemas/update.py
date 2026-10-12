from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime
from app.schemas.event import EventOut


class UpdateCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class UpdateOut(BaseModel):
    id: int
    content: str
    created_at: UTCDateTime
    events: list[EventOut] = []

    model_config = {"from_attributes": True}
