from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai import assistant
from app.api.deps import get_current_user
from app.api.rate_limits import limit_by_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.updates import UpdateRepository
from app.schemas.assistant import AskRequest, AskResponse, DaySummaryRequest, DaySummaryResponse

router = APIRouter(prefix="/assistant", tags=["assistant"], dependencies=[Depends(limit_by_user("ai"))])


@router.post("/ask", response_model=AskResponse)
def ask(
    payload: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AskResponse:
    """Answer a question about the user's journal, citing the entries it used."""
    reply = assistant.ask(
        db,
        current_user,
        payload.question,
        history=[turn.model_dump() for turn in payload.history],
        tz_offset_minutes=payload.tz_offset_minutes,
    )
    return AskResponse(
        answer=reply.answer,
        sources=UpdateRepository(db).get_many_owned(current_user.id, reply.source_ids),
        used_ai=reply.used_ai,
    )


@router.post("/day-summary", response_model=DaySummaryResponse)
def day_summary(
    payload: DaySummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DaySummaryResponse:
    """A short AI summary of everything logged on one local day."""
    result = assistant.summarize_day(db, current_user, payload.day, tz_offset_minutes=payload.tz_offset_minutes)
    return DaySummaryResponse(
        day=payload.day, summary=result.summary, entry_count=result.entry_count, used_ai=result.used_ai
    )
