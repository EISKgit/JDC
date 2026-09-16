from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import Category, Sentiment


class Event(Base):
    """A structured fact extracted (by AI or manual entry) from one Update.

    `update_id` is the evidence link: every event traces back to the exact
    raw text it came from, so any downstream insight can point back to it.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    update_id: Mapped[int] = mapped_column(ForeignKey("updates.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    category: Mapped[Category] = mapped_column(Enum(Category), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    sentiment: Mapped[Sentiment | None] = mapped_column(Enum(Sentiment), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Free-form extra numeric fields the extractor found (amount, currency,
    # duration_minutes, ...). Kept as JSON rather than dedicated columns since
    # which fields apply depends on the event type.
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    is_corrected: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    update: Mapped["Update"] = relationship(back_populates="events")  # noqa: F821
