"""Data access. Every SQL query in the app lives in this package.

Services ask repositories for data in business terms ("this user's updates in a
date range") and never build queries themselves; routes never touch the
database at all. Swapping SQLite for Postgres, adding caching, or changing a
query's shape happens here without touching business logic.
"""

from app.repositories.events import EventRepository
from app.repositories.goals import GoalRepository
from app.repositories.profiles import ProfileRepository
from app.repositories.updates import UpdateRepository
from app.repositories.users import UserRepository

__all__ = ["EventRepository", "GoalRepository", "ProfileRepository", "UpdateRepository", "UserRepository"]
