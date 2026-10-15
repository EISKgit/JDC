from typing import Any, ClassVar

from sqlalchemy.orm import Session

from app.domain.errors import NotFound


class Repository[Model]:
    """Shared plumbing: add / delete / get by id for one model class.

    Repositories never commit: the service doing the work decides where the
    transaction ends (one commit for a whole use case).
    """

    model: ClassVar[type[Any]]

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, id_: int) -> Model | None:
        return self.session.get(self.model, id_)

    def add(self, entity: Model) -> Model:
        self.session.add(entity)
        return entity

    def delete(self, entity: Model) -> None:
        self.session.delete(entity)


class OwnedRepository[Model](Repository[Model]):
    """For data that belongs to one user (updates, events, goals).

    `get_owned` is the single place that enforces "you can only touch your own
    things". Someone else's item and a missing item both raise NotFound, so ids
    can't be probed to discover other users' data.
    """

    label: ClassVar[str] = "Item"

    def get_owned(self, id_: int, user_id: int) -> Model:
        entity = self.get(id_)
        if entity is None or entity.user_id != user_id:  # type: ignore[attr-defined]
            raise NotFound(f"{self.label} not found")
        return entity
