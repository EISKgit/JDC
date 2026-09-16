from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.enums import Category, Sentiment


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
    created_at: datetime

    model_config = {"from_attributes": True}


class EventCorrection(BaseModel):
    """Manual correction of an AI-extracted event. Any field left out is unchanged."""

    category: Category | None = None
    type: str | None = None
    description: str | None = None
    sentiment: Sentiment | None = None
