from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Update(Base):
    """A raw, free-form natural-language update from the user.

    This is the single source of truth users write. Everything downstream
    (events, evidence, intelligence) traces back to one of these rows.
    """

    __tablename__ = "updates"
    # Every list/search/history query is "this user's updates, by date".
    __table_args__ = (Index("ix_updates_user_id_created_at", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    content: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), index=True
    )

    user: Mapped["User"] = relationship(back_populates="updates")  # noqa: F821
    # Updates are almost always shown with their events: "selectin" loads the events of
    # a whole list of updates in one extra query, instead of one query per update (N+1).
    events: Mapped[list["Event"]] = relationship(  # noqa: F821
        back_populates="update", cascade="all, delete-orphan", order_by="Event.id", lazy="selectin"
    )
