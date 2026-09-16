from datetime import datetime

from pydantic import BaseModel


class UpdateCreate(BaseModel):
    content: str


class UpdateOut(BaseModel):
    id: int
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
