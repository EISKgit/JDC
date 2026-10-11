"""'Ask JDC': answers questions about the user's own journal (agentic RAG).

A small LangGraph agent with three read-only tools over the user's data:

    START -> agent --(tool calls?)--> tools -> agent -> ...
                   +--(final answer)--> END

- search_journal  : BM25 retrieval over entries (services.journal_search)
- entries_on_date : everything logged on one local day
- area_stats      : deterministic per-area numbers (the same formulas as the dashboard)

The model only *reads* through these tools and must cite entries as [#id];
cited ids are turned into source cards. Every tool queries the live database,
so answers always reflect edits and deletions. Without an LLM (AI_PROVIDER
isn't groq, no key, or the call fails) the endpoints fall back to plain
retrieval / rule-based summaries instead of failing.
"""

import hashlib
import json
import logging
import re
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.enums import Category, Sentiment
from app.models.user import User
from app.services.forecasting import compute_trend
from app.services.journal_search import (
    JournalHit,
    load_entries,
    local_now,
    search_journal,
    to_local,
)
from app.services.metrics import compute_category_score, events_by_category, get_events_in_range

logger = logging.getLogger(__name__)

# Models don't always write [#12] exactly: gpt-oss also uses full-width brackets
# (\u3010#12\u3011) or slips in zero-width spaces before the #. Accept those and rewrite
# them to the canonical [#12] the frontend links up.
_CITATION_RE = re.compile("[\\[\u3010]\\s*[\u200b\u200c\u200d\u2060\ufeff]*\\s*#\\s*(\\d+)\\s*[\\]\u3011]")
# Typographic characters some models emit that render oddly or not at all.
_TYPOGRAPHY = str.maketrans({"\u2011": "-", "\u2010": "-", "\u00a0": " ", "\u202f": " "})
_MAX_AGENT_STEPS = 10  # LangGraph recursion limit: ~4 tool rounds before it must answer
_MAX_HISTORY_MESSAGES = 6

_AREA_NAMES = ", ".join(c.value for c in Category)

_SYSTEM_PROMPT = """You are JDC, a private journal companion. You answer the user's questions about their own \
life using ONLY their journal, which you can read through the tools.

Today is {today} ({weekday}) in the user's timezone.{name_line}
Life areas: {areas}.

How to work:
- Always look things up with the tools before answering; never guess or use outside knowledge about the user.
- Convert relative dates ("yesterday", "last week", "this month") into YYYY-MM-DD for the tools.
- Use area_stats for "how am I doing" / score / trend questions, search_journal for topics, \
entries_on_date for a specific day.
- Cite every entry you rely on as [#id] right after the sentence it supports, e.g. "You went to the gym twice [#12][#15]."
- If the journal has nothing relevant, say so plainly and suggest logging it.
- Speak to the user as "you". Be concise: 2-6 sentences, or a short list. Plain text only: no emoji, no headings, \
no tables."""

_DAY_SUMMARY_PROMPT = """Summarise this person's day from their journal entries, speaking to them as "you".
2-3 sentences: what they did, how it went (mood), and one gentle, specific observation. Only use what the \
entries say. Plain text, no emoji, no lists."""


@dataclass
class AssistantReply:
    answer: str
    source_ids: list[int]
    used_ai: bool


@lru_cache
def get_assistant_llm() -> BaseChatModel | None:
    """The chat model for the assistant, or None when no LLM is configured."""
    settings = get_settings()
    if settings.ai_provider != "groq" or not settings.groq_api_key:
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(
        model=settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=0.2,
        timeout=30,
        max_retries=1,
        # gpt-oss "thinks" first; low effort keeps answers fast without hurting tool use.
        reasoning_effort="low" if "gpt-oss" in settings.groq_model else None,
    )


# ---------------------------------------------------------------- tools


def _format_hit(hit: JournalHit, tz_offset_minutes: int) -> str:
    when = to_local(hit.created_at, tz_offset_minutes).strftime("%Y-%m-%d %a %H:%M")
    areas = ", ".join(hit.categories) or "uncategorised"
    return f"[#{hit.update_id}] {when} ({areas}): {hit.content}"


def _parse_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def build_tools(db: Session, user: User, tz_offset_minutes: int) -> list[BaseTool]:
    """Read-only tools bound to one user's data (closures, so the model can't pick another user)."""

    @tool("search_journal")
    def search_journal_tool(
        query: str, start_date: str | None = None, end_date: str | None = None, area: str | None = None
    ) -> str:
        """Search the user's journal entries by topic or keywords (e.g. "gym", "spent money", "friend").
        Optional filters: start_date / end_date as YYYY-MM-DD (inclusive, user's local days) and area
        (one of the life areas). Returns matching entries, newest-relevant first, each with its [#id]."""
        hits = search_journal(
            db,
            user.id,
            query,
            start_day=_parse_day(start_date),
            end_day=_parse_day(end_date),
            category=area,
            tz_offset_minutes=tz_offset_minutes,
        )
        if not hits:
            return "No matching entries."
        return "\n".join(_format_hit(h, tz_offset_minutes) for h in hits)

    @tool
    def entries_on_date(day: str) -> str:
        """All journal entries the user wrote on one local day, given as YYYY-MM-DD."""
        parsed = _parse_day(day)
        if parsed is None:
            return "Invalid date; use YYYY-MM-DD."
        hits = load_entries(db, user.id, start_day=parsed, end_day=parsed, tz_offset_minutes=tz_offset_minutes)
        if not hits:
            return f"No entries on {parsed.isoformat()}."
        return "\n".join(_format_hit(h, tz_offset_minutes) for h in reversed(hits))

    @tool
    def area_stats(days: int = 7) -> str:
        """Per-life-area numbers for the last `days` days (1-90): event count, positive/negative counts,
        0-100 score (same formula as the dashboard; 50 = neutral baseline with no data) and the trend vs. the
        previous period of the same length."""
        days = max(1, min(int(days), 90))
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # DB stores naive UTC
        current = events_by_category(get_events_in_range(db, user.id, now - timedelta(days=days), now))
        previous = events_by_category(
            get_events_in_range(db, user.id, now - timedelta(days=2 * days), now - timedelta(days=days))
        )
        lines = [f"Last {days} days:"]
        for category in Category:
            events = current[category]
            trend = compute_trend(len(events), len(previous[category]), len(events) + len(previous[category]))
            positive = sum(1 for e in events if e.sentiment == Sentiment.positive)
            negative = sum(1 for e in events if e.sentiment == Sentiment.negative)
            score = compute_category_score(events, days) if events else None
            lines.append(
                f"- {category.value}: {len(events)} events ({positive} positive, {negative} negative), "
                f"score {score if score is not None else 'n/a (no data)'}, trend {trend.direction}"
            )
        return "\n".join(lines)

    return [search_journal_tool, entries_on_date, area_stats]


# ---------------------------------------------------------------- graph


def build_agent(llm: BaseChatModel, tools: list[BaseTool]):
    """The LangGraph state machine: the model either calls tools or answers."""
    model = llm.bind_tools(tools)

    def agent(state: MessagesState) -> dict[str, list[BaseMessage]]:
        return {"messages": [model.invoke(state["messages"])]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()


def _system_prompt(user: User, tz_offset_minutes: int) -> str:
    today = local_now(tz_offset_minutes)
    name_line = f" The user's name is {user.full_name}." if user.full_name else ""
    return _SYSTEM_PROMPT.format(
        today=today.date().isoformat(), weekday=today.strftime("%A"), name_line=name_line, areas=_AREA_NAMES
    )


def _history_messages(history: list[dict[str, str]]) -> list[BaseMessage]:
    messages: list[BaseMessage] = []
    for turn in history[-_MAX_HISTORY_MESSAGES:]:
        text = str(turn.get("content", ""))[:2000]
        if turn.get("role") == "user":
            messages.append(HumanMessage(text))
        elif turn.get("role") == "assistant":
            messages.append(AIMessage(text))
    return messages


def _text_of(message: BaseMessage) -> str:
    content = message.content
    if not isinstance(content, str):
        # Some models return a list of content blocks.
        content = " ".join(str(b.get("text", "")) for b in content if isinstance(b, dict))
    return normalize_answer(content)


def normalize_answer(text: str) -> str:
    text = _CITATION_RE.sub(lambda m: f"[#{m.group(1)}]", text.translate(_TYPOGRAPHY))
    return text.strip()


def _cited_ids(answer: str, db: Session, user: User) -> list[int]:
    """Ids cited as [#id] that really are this user's entries (drops any the model made up)."""
    cited = list(dict.fromkeys(int(m) for m in _CITATION_RE.findall(answer)))
    if not cited:
        return []
    owned = {h.update_id for h in load_entries(db, user.id)}
    return [i for i in cited if i in owned]


def ask(
    db: Session,
    user: User,
    question: str,
    *,
    history: list[dict[str, str]] | None = None,
    tz_offset_minutes: int = 0,
    llm: BaseChatModel | None = None,
) -> AssistantReply:
    llm = llm if llm is not None else get_assistant_llm()
    if llm is None:
        return _retrieval_only_answer(db, user, question, tz_offset_minutes, reason="no_ai")

    agent = build_agent(llm, build_tools(db, user, tz_offset_minutes))
    messages: list[BaseMessage] = [
        SystemMessage(_system_prompt(user, tz_offset_minutes)),
        *_history_messages(history or []),
        HumanMessage(question),
    ]
    try:
        result = agent.invoke({"messages": messages}, {"recursion_limit": _MAX_AGENT_STEPS})
        answer = _text_of(result["messages"][-1])
    except Exception:  # network, rate limit, tool-call format, recursion limit...
        logger.warning("Assistant agent failed, using retrieval-only answer", exc_info=True)
        return _retrieval_only_answer(db, user, question, tz_offset_minutes, reason="ai_failed")
    if not answer:
        return _retrieval_only_answer(db, user, question, tz_offset_minutes, reason="ai_failed")
    return AssistantReply(answer=answer, source_ids=_cited_ids(answer, db, user), used_ai=True)


def _retrieval_only_answer(
    db: Session, user: User, question: str, tz_offset_minutes: int, *, reason: str
) -> AssistantReply:
    hits = search_journal(db, user.id, question, tz_offset_minutes=tz_offset_minutes, limit=5)
    lead = (
        "AI answers are switched off (set AI_PROVIDER=groq with a GROQ_API_KEY)."
        if reason == "no_ai"
        else "The AI couldn't be reached just now."
    )
    if not hits:
        return AssistantReply(
            answer=f"{lead} I also couldn't find entries matching your question.", source_ids=[], used_ai=False
        )
    return AssistantReply(
        answer=f"{lead} These are the entries that best match your question:",
        source_ids=[h.update_id for h in hits],
        used_ai=False,
    )


# ---------------------------------------------------------------- day summary

_DAY_SUMMARY_CACHE_SIZE = 256
_day_summaries: OrderedDict[str, str] = OrderedDict()


@dataclass
class DaySummary:
    summary: str
    entry_count: int
    used_ai: bool


def summarize_day(
    db: Session, user: User, day: date, *, tz_offset_minutes: int = 0, llm: BaseChatModel | None = None
) -> DaySummary:
    hits = list(
        reversed(load_entries(db, user.id, start_day=day, end_day=day, tz_offset_minutes=tz_offset_minutes))
    )
    if not hits:
        return DaySummary(summary="Nothing was logged on this day.", entry_count=0, used_ai=False)

    llm = llm if llm is not None else get_assistant_llm()
    if llm is None:
        return DaySummary(summary=_rule_day_summary(hits), entry_count=len(hits), used_ai=False)

    entries_text = "\n".join(_format_hit(h, tz_offset_minutes) for h in hits)
    # Keyed by the entries' current text + areas: an edit or deletion changes the key,
    # so a stale summary is never served.
    key = hashlib.sha256(
        json.dumps([user.id, day.isoformat(), [(h.content, h.categories) for h in hits]]).encode()
    ).hexdigest()
    if key in _day_summaries:
        _day_summaries.move_to_end(key)
        return DaySummary(summary=_day_summaries[key], entry_count=len(hits), used_ai=True)

    try:
        reply = llm.invoke([SystemMessage(_DAY_SUMMARY_PROMPT), HumanMessage(entries_text)])
        text = _CITATION_RE.sub("", _text_of(reply)).strip()
    except Exception:
        logger.warning("Day summary via AI failed, using rule-based summary", exc_info=True)
        text = ""
    if not text:
        return DaySummary(summary=_rule_day_summary(hits), entry_count=len(hits), used_ai=False)

    _day_summaries[key] = text
    if len(_day_summaries) > _DAY_SUMMARY_CACHE_SIZE:
        _day_summaries.popitem(last=False)
    return DaySummary(summary=text, entry_count=len(hits), used_ai=True)


def _rule_day_summary(hits: list[JournalHit]) -> str:
    areas: list[str] = list(dict.fromkeys(c.replace("_", " ") for h in hits for c in h.categories))
    entries = f"{len(hits)} {'entry' if len(hits) == 1 else 'entries'}"
    if not areas:
        return f"{entries} logged."
    return f"{entries} logged, touching {', '.join(areas)}."
