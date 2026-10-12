import re
from collections.abc import Callable
from datetime import date, datetime, timezone
from typing import Any

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

from app.ai import assistant
from app.db.session import SessionLocal
from app.models.update import Update
from app.models.user import User
from app.services.journal_search import load_entries, search_journal, tokenize


class ScriptedModel(BaseChatModel):
    """Stands in for Groq: each call returns the next scripted message, built from what it was sent."""

    script: list[Callable[[list[BaseMessage]], AIMessage]]
    calls: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedModel":
        return self

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **kwargs: Any):
        step = self.script[len(self.calls)]
        self.calls.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=step(messages))])


def call_tool(name: str, **args: Any) -> Callable[[list[BaseMessage]], AIMessage]:
    return lambda _messages: AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"call-{name}"}])


def auth_headers(client, email="ask@example.com") -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse"})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def post(client, headers, content: str) -> dict:
    return client.post("/api/v1/updates", headers=headers, json={"content": content}).json()


def set_created_at(update_id: int, when: datetime) -> None:
    with SessionLocal() as db:
        update = db.get(Update, update_id)
        update.created_at = when
        for event in update.events:
            event.created_at = when
        db.commit()


@pytest.fixture
def journal(client):
    headers = auth_headers(client)
    gym = post(client, headers, "Went to the gym this morning, felt great.")
    food = post(client, headers, "Spent $40 on groceries.")
    study = post(client, headers, "Studying Python for 2 hours.")
    with SessionLocal() as db:
        user_id = db.query(User).filter(User.email == "ask@example.com").one().id
    return {"headers": headers, "user_id": user_id, "gym": gym, "food": food, "study": study}


# ------------------------------------------------------------ retrieval


def test_tokenize_stems_common_endings():
    assert tokenize("Studied studying runs running the gym") == ["study", "study", "run", "runn", "gym"]


def test_search_ranks_by_relevance(client, journal):
    with SessionLocal() as db:
        hits = search_journal(db, journal["user_id"], "when did I last go to the gym?")
        assert hits[0].update_id == journal["gym"]["id"]
        assert journal["food"]["id"] not in [h.update_id for h in hits]

        studied = search_journal(db, journal["user_id"], "studied")
        assert [h.update_id for h in studied] == [journal["study"]["id"]]


def test_search_filters_by_area(client, journal):
    with SessionLocal() as db:
        hits = search_journal(db, journal["user_id"], "", category="finance")
        assert [h.update_id for h in hits] == [journal["food"]["id"]]


def test_local_day_filter_uses_the_users_timezone(client, journal):
    # 20:00 UTC on 9 Oct is 01:30 on 10 Oct in India (offset -330).
    set_created_at(journal["gym"]["id"], datetime(2026, 10, 9, 20, 0))
    with SessionLocal() as db:
        ist = load_entries(db, journal["user_id"], start_day=date(2026, 10, 10), end_day=date(2026, 10, 10),
                           tz_offset_minutes=-330)
        utc = load_entries(db, journal["user_id"], start_day=date(2026, 10, 10), end_day=date(2026, 10, 10))
    assert [h.update_id for h in ist] == [journal["gym"]["id"]]
    assert utc == []


def test_deleted_and_edited_entries_are_reflected_immediately(client, journal):
    headers = journal["headers"]
    client.delete(f"/api/v1/updates/{journal['gym']['id']}", headers=headers)
    client.patch(f"/api/v1/updates/{journal['food']['id']}", headers=headers, json={"content": "Went jogging"})
    with SessionLocal() as db:
        all_ids = [h.update_id for h in search_journal(db, journal["user_id"], "", start_day=date(2000, 1, 1))]
        assert journal["gym"]["id"] not in all_ids  # the deleted entry is gone everywhere
        # "gym" now only finds the edited jogging entry (same Health area), not the deleted one
        assert [h.update_id for h in search_journal(db, journal["user_id"], "gym")] == [journal["food"]["id"]]
        assert search_journal(db, journal["user_id"], "groceries") == []
        assert [h.update_id for h in search_journal(db, journal["user_id"], "jogging")] == [journal["food"]["id"]]


# ------------------------------------------------------------ /assistant/ask without an LLM


def test_ask_without_ai_returns_matching_entries(client, journal):
    response = client.post(
        "/api/v1/assistant/ask", headers=journal["headers"], json={"question": "How often did I go to the gym?"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["used_ai"] is False
    assert "switched off" in data["answer"]
    assert data["sources"][0]["id"] == journal["gym"]["id"]


def test_ask_only_sees_your_own_journal(client, journal):
    other = auth_headers(client, "someone@example.com")
    data = client.post("/api/v1/assistant/ask", headers=other, json={"question": "gym"}).json()
    assert data["sources"] == []


def test_ask_validates_input(client, journal):
    assert client.post("/api/v1/assistant/ask", headers=journal["headers"], json={"question": ""}).status_code == 422


# ------------------------------------------------------------ LangGraph agent (scripted model)


def test_agent_calls_tools_and_cites_real_entries(client, journal):
    def answer_from_tool_result(messages: list[BaseMessage]) -> AIMessage:
        tool_output = next(m for m in reversed(messages) if isinstance(m, ToolMessage)).content
        first_id = re.search(r"\[#(\d+)\]", tool_output).group(1)
        # [#99999] is a made-up citation that must be dropped from the sources.
        return AIMessage(content=f"You went to the gym this morning [#{first_id}][#99999].")

    model = ScriptedModel(script=[call_tool("search_journal", query="gym"), answer_from_tool_result])
    with SessionLocal() as db:
        user = db.get(User, journal["user_id"])
        reply = assistant.ask(db, user, "When did I go to the gym?", llm=model)

    assert reply.used_ai is True
    assert reply.source_ids == [journal["gym"]["id"]]
    # The tool really ran against the database: its output reached the model's second call.
    tool_messages = [m for m in model.calls[1] if isinstance(m, ToolMessage)]
    assert "Went to the gym this morning" in tool_messages[0].content
    # System prompt carries today's date so relative dates can be resolved.
    assert "Today is" in model.calls[0][0].content


def test_agent_area_stats_tool_uses_dashboard_numbers(client, journal):
    model = ScriptedModel(
        script=[call_tool("area_stats", days=7), lambda messages: AIMessage(content="Health looks good.")]
    )
    with SessionLocal() as db:
        assistant.ask(db, db.get(User, journal["user_id"]), "How is my health?", llm=model)
    stats = next(m for m in model.calls[1] if isinstance(m, ToolMessage)).content
    assert "- health: 1 events (1 positive, 0 negative)" in stats
    assert "- career: 0 events" in stats and "n/a (no data)" in stats


def test_agent_failure_falls_back_to_retrieval(client, journal):
    def boom(_messages):
        raise RuntimeError("rate limited")

    with SessionLocal() as db:
        reply = assistant.ask(db, db.get(User, journal["user_id"]), "gym", llm=ScriptedModel(script=[boom]))
    assert reply.used_ai is False
    assert "couldn't be reached" in reply.answer
    assert reply.source_ids == [journal["gym"]["id"]]


# ------------------------------------------------------------ day summary


def test_day_summary_without_ai(client, journal):
    today = datetime.now(timezone.utc).date().isoformat()  # tz_offset 0 = UTC days
    data = client.post(
        "/api/v1/assistant/day-summary",
        headers=journal["headers"],
        json={"day": today, "tz_offset_minutes": 0},
    ).json()
    assert data["entry_count"] == 3
    assert data["used_ai"] is False
    assert data["summary"].startswith("3 entries logged, touching")


def test_day_summary_is_cached_until_the_day_changes(client, journal):
    reply = lambda _messages: AIMessage(content="You trained, shopped and studied.")  # noqa: E731
    model = ScriptedModel(script=[reply, reply])
    today = datetime.now(timezone.utc).date()
    with SessionLocal() as db:
        user = db.get(User, journal["user_id"])
        first = assistant.summarize_day(db, user, today, llm=model)
        again = assistant.summarize_day(db, user, today, llm=model)
    assert first.used_ai and again.summary == first.summary
    assert len(model.calls) == 1  # second call served from cache

    client.patch(f"/api/v1/updates/{journal['food']['id']}", headers=journal["headers"], json={"content": "Read a book"})
    with SessionLocal() as db:
        assistant.summarize_day(db, db.get(User, journal["user_id"]), today, llm=model)
    assert len(model.calls) == 2  # the edit changed the entries, so it was summarised again
    assert "Read a book" in model.calls[1][1].content


def test_citations_in_odd_formats_are_normalized(client, journal):
    gym_id = journal["gym"]["id"]
    odd = f"You went on 2026‑10‑11 [​#{gym_id}] and 【#{gym_id}】."
    assert assistant.normalize_answer(odd) == f"You went on 2026-10-11 [#{gym_id}] and [#{gym_id}]."

    model = ScriptedModel(script=[lambda _m: AIMessage(content=odd)])
    with SessionLocal() as db:
        reply = assistant.ask(db, db.get(User, journal["user_id"]), "gym?", llm=model)
    assert reply.source_ids == [gym_id]
