from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator


def _as_utc(value: datetime) -> datetime:
    # SQLite hands timestamps back without tzinfo even though they were stored
    # as UTC. Without an explicit offset, browsers parse "2026-10-09T16:47:52"
    # as *local* time — shifting every timestamp and putting late-evening
    # updates on the wrong day in the history view.
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]
