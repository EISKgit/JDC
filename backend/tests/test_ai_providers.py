import json

import httpx
import pytest

from app.ai.providers.base import AIProvider, AIProviderError
from app.ai.providers.fallback import FallbackProvider
from app.ai.providers.mock import MockProvider
from app.ai.providers.openai_provider import GROQ_BASE_URL, OpenAIProvider


class FlakyProvider(AIProvider):
    def __init__(self, fail: bool) -> None:
        self.fail = fail
        self.narrative_calls = 0

    def extract_events(self, update_text):
        if self.fail:
            raise AIProviderError("rate limited")
        return [{"category": "health", "description": "From the LLM."}]

    def generate_narrative(self, *, kind, context):
        self.narrative_calls += 1
        if self.fail:
            raise AIProviderError("rate limited")
        return f"LLM says {kind}"


def test_extraction_falls_back_to_rules_when_the_llm_fails():
    provider = FallbackProvider(FlakyProvider(fail=True), MockProvider())
    events = provider.extract_events("Went to the gym")
    assert [e["category"] for e in events] == ["health"]


def test_narratives_are_cached_but_failures_are_not():
    llm = FlakyProvider(fail=False)
    provider = FallbackProvider(llm, MockProvider())
    context = {"category": "health", "score": 70, "trend": "up"}
    assert provider.generate_narrative(kind="recommendation", context=context) == "LLM says recommendation"
    provider.generate_narrative(kind="recommendation", context=dict(reversed(context.items())))
    assert llm.narrative_calls == 1

    llm.fail = True
    fallback_text = provider.generate_narrative(kind="recommendation", context={"category": "career"})
    assert fallback_text.startswith("Your career score")
    llm.fail = False
    assert provider.generate_narrative(kind="recommendation", context={"category": "career"}) == "LLM says recommendation"


def _fake_post(content: str, status: int = 200):
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        body = {"choices": [{"message": {"content": content}}]}
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))

    return post, calls


def test_groq_extraction_request_and_parsing(monkeypatch):
    content = json.dumps({"events": [{"category": "learning", "description": "I studied Python."}, "junk"]})
    post, calls = _fake_post(content)
    monkeypatch.setattr(httpx, "post", post)

    provider = OpenAIProvider(api_key="k", model="openai/gpt-oss-120b", base_url=GROQ_BASE_URL)
    events = provider.extract_events("studyed python")

    assert events == [{"category": "learning", "description": "I studied Python."}]
    url, kwargs = calls[0]
    assert url == "https://api.groq.com/openai/v1/chat/completions"
    assert kwargs["json"]["model"] == "openai/gpt-oss-120b"
    assert kwargs["json"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize(("content", "status"), [("not json", 200), ('{"oops": 1}', 200), ("{}", 429)])
def test_bad_llm_responses_raise_provider_error(monkeypatch, content, status):
    post, _ = _fake_post(content, status)
    monkeypatch.setattr(httpx, "post", post)
    with pytest.raises(AIProviderError):
        OpenAIProvider(api_key="k", model="m").extract_events("hi")


def test_missing_key_is_reported_by_name():
    with pytest.raises(AIProviderError, match="GROQ_API_KEY"):
        OpenAIProvider(api_key="", model="m", key_name="GROQ_API_KEY")


def test_formulaic_narratives_skip_the_llm():
    llm = FlakyProvider(fail=False)
    provider = FallbackProvider(llm, MockProvider())
    text = provider.generate_narrative(kind="forecast", context={"category": "health", "direction": "stable"})
    assert text.startswith("Health activity is stable")
    assert llm.narrative_calls == 0


def test_reasoning_effort_is_sent_only_when_set(monkeypatch):
    post, calls = _fake_post('{"events": []}')
    monkeypatch.setattr(httpx, "post", post)
    OpenAIProvider(api_key="k", model="m", reasoning_effort="low").extract_events("hi")
    OpenAIProvider(api_key="k", model="m").extract_events("hi")
    assert calls[0][1]["json"]["reasoning_effort"] == "low"
    assert "reasoning_effort" not in calls[1][1]["json"]
