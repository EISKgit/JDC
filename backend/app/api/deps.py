"""Composition root: the one place that decides which concrete parts make up each service.

Routes ask for a ready-made service (`Depends(get_auth_service)`); they never build
one or reach for a database session to run queries. To swap a part (a different
email provider, a fake password hasher in a test), override the provider function
here with FastAPI's `app.dependency_overrides`: no module patching needed.
"""

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.providers.base import AIProvider
from app.core.config import Settings, get_settings
from app.core.rate_limit import limiter
from app.core.security import ACCESS, PasswordHasher, is_token_current, password_hasher, read_token
from app.db.session import get_db
from app.domain.errors import Unauthorized
from app.models.user import User
from app.repositories import EventRepository, GoalRepository, ProfileRepository, UpdateRepository, UserRepository
from app.services.account_service import AccountService
from app.services.auth_service import AuthService
from app.services.event_service import EventService
from app.services.goal_service import GoalService
from app.services.google_oauth import GoogleOAuthClient, OAuthProvider
from app.services.intelligence import IntelligenceService
from app.services.login_throttle import LoginThrottle
from app.services.notifications import EmailSender, email_sender_from_settings
from app.services.profile_service import ProfileService
from app.services.update_service import UpdateService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

# ------------------------------------------------------------ infrastructure


def get_password_hasher() -> PasswordHasher:
    return password_hasher


def get_email_sender() -> EmailSender:
    return email_sender_from_settings()


def get_oauth_provider(settings: Settings = Depends(get_settings)) -> OAuthProvider:
    return GoogleOAuthClient(settings)


def get_login_throttle(settings: Settings = Depends(get_settings)) -> LoginThrottle:
    return LoginThrottle(limiter, settings)


# ------------------------------------------------------------ who is calling


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    claims = read_token(token, ACCESS)
    user = UserRepository(db).get(int(claims["sub"]))
    if user is None or not is_token_current(claims, user):
        raise Unauthorized("Session expired, please log in again")
    return user


# ------------------------------------------------------------ services


def get_auth_service(
    db: Session = Depends(get_db),
    hasher: PasswordHasher = Depends(get_password_hasher),
    throttle: LoginThrottle = Depends(get_login_throttle),
    email: EmailSender = Depends(get_email_sender),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(db, UserRepository(db), hasher, throttle, email, settings)


def get_account_service(
    db: Session = Depends(get_db), hasher: PasswordHasher = Depends(get_password_hasher)
) -> AccountService:
    return AccountService(db, UpdateRepository(db), hasher)


def get_update_service(db: Session = Depends(get_db), ai: AIProvider = Depends(get_ai_provider)) -> UpdateService:
    return UpdateService(db, UpdateRepository(db), ai)


def get_goal_service(db: Session = Depends(get_db)) -> GoalService:
    return GoalService(db, GoalRepository(db))


def get_event_service(db: Session = Depends(get_db)) -> EventService:
    return EventService(db, EventRepository(db))


def get_profile_service(db: Session = Depends(get_db), ai: AIProvider = Depends(get_ai_provider)) -> ProfileService:
    return ProfileService(db, ProfileRepository(db), ai)


def get_intelligence_service(
    db: Session = Depends(get_db), ai: AIProvider = Depends(get_ai_provider)
) -> IntelligenceService:
    return IntelligenceService(EventRepository(db), ai)
