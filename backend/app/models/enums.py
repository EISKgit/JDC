import enum


class Category(str, enum.Enum):
    health = "health"
    career = "career"
    finance = "finance"
    relationships = "relationships"
    learning = "learning"
    personal_growth = "personal_growth"
    lifestyle = "lifestyle"


class GoalStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    archived = "archived"


class Sentiment(str, enum.Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"
