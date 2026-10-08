import pytest

from app.ai.providers.mock import MockProvider


def categories(text: str) -> list[str]:
    return [e["category"] for e in MockProvider().extract_events(text)]


@pytest.mark.parametrize(
    ("sentence", "expected"),
    [
        # punctuation right after a keyword used to break the match
        ("Went for a run, felt great", "health"),
        ("Walked to the park", "health"),
        # inflections the old exact keywords missed
        ("Studied Python", "learning"),
        # "spent" is about time here, not money
        ("Spent 2 hours studying Python", "learning"),
        ("Spent $800 eating outside", "finance"),
        ("Spent ₹500 on groceries", "finance"),
        ("Bought new shoes", "finance"),
        # substring false positives the old matcher made
        ("I'm ready for tomorrow", "lifestyle"),  # "read" in "ready"
        ("Finished my homework", "lifestyle"),  # "work" in "homework"
    ],
)
def test_sentence_category(sentence, expected):
    assert categories(sentence) == [expected]


def test_readme_example_update():
    text = (
        "Worked on my backend project for 4 hours. Skipped the gym because I was tired. "
        "Spent $800 eating outside. Had an argument with my friend."
    )
    assert categories(text) == ["career", "health", "finance", "relationships"]


def test_sentiment_matches_whole_words():
    events = MockProvider().extract_events("Played badminton with a friend. Had fun at the party.")
    assert [e["sentiment"] for e in events] == ["neutral", "positive"]  # "bad" in "badminton" no longer negative
