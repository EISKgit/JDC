"""Retrieval over one user's journal — the "R" in the assistant's RAG.

Deliberately index-free: every search reads the user's current updates and
events straight from the database and ranks them in memory with BM25. A
journal is small (hundreds of entries, not millions), so this is fast, and it
means edits and deletions are reflected immediately — there is no separate
vector store or index that could go stale.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from rank_bm25 import BM25Okapi
from sqlalchemy.orm import Session, selectinload

from app.models.enums import Category
from app.models.update import Update

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "a", "about", "after", "all", "am", "an", "and", "any", "are", "as", "at", "be", "been", "before", "but",
    "by", "can", "did", "do", "does", "for", "from", "had", "has", "have", "how", "i", "if", "in", "into", "is",
    "it", "its", "last", "me", "much", "my", "of", "on", "or", "so", "than", "that", "the", "their", "them",
    "then", "there", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who", "why", "will",
    "with", "you", "your",
}


@dataclass
class JournalHit:
    update_id: int
    created_at: datetime  # UTC
    content: str
    categories: list[str]
    statements: list[str]


def tokenize(text: str) -> list[str]:
    tokens = [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]
    # Crude stemming so "studied"/"studying"/"study" and "runs"/"run" meet in the middle.
    return [_stem(t) for t in tokens]


def _stem(token: str) -> str:
    for suffix in ("ing", "ied", "ies", "ed", "es", "s"):
        if len(token) > len(suffix) + 2 and token.endswith(suffix):
            return token[: -len(suffix)] + ("y" if suffix in ("ied", "ies") else "")
    return token


def local_now(tz_offset_minutes: int) -> datetime:
    """The user's wall-clock time. `tz_offset_minutes` follows JavaScript's
    Date.getTimezoneOffset(): UTC minus local, so India (UTC+5:30) is -330."""
    return datetime.now(timezone.utc) - timedelta(minutes=tz_offset_minutes)


def to_local(utc: datetime, tz_offset_minutes: int) -> datetime:
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    return utc - timedelta(minutes=tz_offset_minutes)


def local_day_bounds_utc(day: date, tz_offset_minutes: int) -> tuple[datetime, datetime]:
    """[start, end) in naive UTC (how the DB stores timestamps) for a local calendar day."""
    start = datetime(day.year, day.month, day.day) + timedelta(minutes=tz_offset_minutes)
    return start, start + timedelta(days=1)


def load_entries(
    db: Session,
    user_id: int,
    *,
    start_day: date | None = None,
    end_day: date | None = None,
    category: str | None = None,
    tz_offset_minutes: int = 0,
) -> list[JournalHit]:
    """The user's updates (newest first), optionally limited to local days [start_day, end_day] and an area."""
    query = (
        db.query(Update)
        .options(selectinload(Update.events))
        .filter(Update.user_id == user_id)
        .order_by(Update.created_at.desc())
    )
    if start_day:
        query = query.filter(Update.created_at >= local_day_bounds_utc(start_day, tz_offset_minutes)[0])
    if end_day:
        query = query.filter(Update.created_at < local_day_bounds_utc(end_day, tz_offset_minutes)[1])

    wanted = _parse_category(category)
    hits = []
    for update in query.all():
        categories = list(dict.fromkeys(e.category.value for e in update.events))
        if wanted and wanted not in categories:
            continue
        hits.append(
            JournalHit(
                update_id=update.id,
                created_at=update.created_at,
                content=update.content,
                categories=categories,
                statements=[e.description for e in update.events],
            )
        )
    return hits


def search_journal(
    db: Session,
    user_id: int,
    query: str,
    *,
    start_day: date | None = None,
    end_day: date | None = None,
    category: str | None = None,
    tz_offset_minutes: int = 0,
    limit: int = 8,
) -> list[JournalHit]:
    """Best-matching entries for `query` (BM25 over text, statements and area names).

    With filters but no meaningful query words ("summarise last week"), returns the
    most recent entries in range instead — the filters already say what's wanted.
    """
    entries = load_entries(
        db, user_id, start_day=start_day, end_day=end_day, category=category, tz_offset_minutes=tz_offset_minutes
    )
    query_tokens = tokenize(query)
    if not entries:
        return []
    if not query_tokens:
        return entries[:limit]

    corpus = [tokenize(" ".join([e.content, *e.statements, *e.categories])) for e in entries]
    scores = BM25Okapi(corpus).get_scores(query_tokens)
    # BM25's IDF goes to ~0 for words that appear in every entry of a tiny journal,
    # so also count plain term overlap; ties fall back to newest first (stable sort).
    overlap = [len(set(query_tokens) & set(doc)) for doc in corpus]
    ranked = sorted(range(len(entries)), key=lambda i: (overlap[i], scores[i]), reverse=True)
    matches = [entries[i] for i in ranked if overlap[i] > 0]
    if not matches and (start_day or end_day or category):
        return entries[:limit]
    return matches[:limit]


def _parse_category(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower().replace(" ", "_")
    return normalized if normalized in Category._value2member_map_ else None
