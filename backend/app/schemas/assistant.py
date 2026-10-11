from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.update import UpdateOut

# JavaScript's Date.getTimezoneOffset(): UTC minus local time, in minutes (India is -330).
TzOffset = Field(default=0, ge=-14 * 60, le=14 * 60)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    tz_offset_minutes: int = TzOffset


class AskResponse(BaseModel):
    answer: str
    sources: list[UpdateOut]
    used_ai: bool


class DaySummaryRequest(BaseModel):
    day: date
    tz_offset_minutes: int = TzOffset


class DaySummaryResponse(BaseModel):
    day: date
    summary: str
    entry_count: int
    used_ai: bool
