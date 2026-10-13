from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import Category, Sentiment
from app.schemas.common import UTCDateTime


class EventOut(BaseModel):
    id: int
    update_id: int
    category: Category
    type: str
    description: str
    sentiment: Sentiment | None
    confidence: float | None
    details: dict[str, Any]
    is_corrected: bool
    created_at: UTCDateTime

    model_config = {"from_attributes": True}


class EventCorrection(BaseModel):
    """Manual correction of an AI-extracted event. Any field left out is unchanged."""

    category: Category | None = None
    type: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    sentiment: Sentiment | None = None
