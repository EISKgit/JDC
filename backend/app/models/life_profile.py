from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LifeProfile(Base):
    """The user's onboarding answers plus an AI-generated summary.

    One-to-one with User. Created/updated by the onboarding flow; the
    `ai_summary` field is filled in later by the AI layer (see events/
    extraction work), not during onboarding itself.
    """

    __tablename__ = "life_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    goals_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    challenges: Mapped[str | None] = mapped_column(Text, nullable=True)
    focus_categories: Mapped[list[str]] = mapped_column(JSON, default=list)

    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped["User"] = relationship(back_populates="profile")  # noqa: F821
