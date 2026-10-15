"""Use cases for journal updates: write, edit, delete, read."""

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.ai.providers.base import AIProvider, AIProviderError
from app.models.update import Update
from app.models.user import User
from app.repositories.updates import UpdateRepository
from app.services.event_extraction import extract_and_store_events, reextract_events

logger = logging.getLogger(__name__)


@dataclass
class UpdateService:
    session: Session
    updates: UpdateRepository
    ai: AIProvider

    def create(self, user: User, content: str) -> Update:
        # The user's raw words are the source of truth and are saved first; AI
        # extraction is best-effort on top and must never risk losing the update.
        update = self.updates.add(Update(user_id=user.id, content=content))
        self.session.commit()
        self.session.refresh(update)
        try:
            extract_and_store_events(self.session, update, self.ai)
            self.session.refresh(update)
        except AIProviderError:
            logger.warning("Event extraction failed for update %s", update.id, exc_info=True)
        return update

    def edit(self, user: User, update_id: int, content: str) -> Update:
        """Replace the text and re-extract its events from the new wording. Categories the
        user fixed by hand are kept for sentences that are still there."""
        update = self.updates.get_owned(update_id, user.id)
        update.content = content
        self.session.commit()
        try:
            reextract_events(self.session, update, self.ai)
        except AIProviderError:
            logger.warning("Event extraction failed for edited update %s", update.id, exc_info=True)
        return update

    def delete(self, user: User, update_id: int) -> None:
        """Delete an update and its events. Nothing derived is stored elsewhere (scores,
        trends, history and Ask JDC are computed from events on request), so everything
        re-estimates as soon as this commits."""
        self.updates.delete(self.updates.get_owned(update_id, user.id))  # events cascade
        self.session.commit()

    def list(self, user: User) -> list[Update]:
        return self.updates.list_for_user(user.id)

    def get(self, user: User, update_id: int) -> Update:
        return self.updates.get_owned(update_id, user.id)
