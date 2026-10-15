"""Credentials and sessions: sign-up, login, passwords, sign-out-everywhere, Google.

Everything it needs is passed in (dependency inversion): where users are stored,
how passwords are hashed, how lockouts are counted, how email is sent. It knows
nothing about HTTP; failures are domain errors that the API layer turns into
status codes. That makes it usable from routes, scripts or tests alike, and
testable with plain fakes.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.passwords import password_problem
from app.core.security import (
    PASSWORD_RESET,
    PasswordHasher,
    create_access_token,
    create_token,
    password_fingerprint,
    read_token,
)
from app.domain.errors import Conflict, InvalidInput, Unauthorized
from app.models.user import User
from app.repositories.users import UserRepository
from app.services.google_oauth import GoogleProfile
from app.services.login_throttle import LoginThrottle
from app.services.notifications import EmailSender

RESET_SUBJECT = "Reset your JDC password"


class UnverifiedGoogleEmail(InvalidInput):
    def __init__(self) -> None:
        super().__init__("Your Google email address isn't verified")


@dataclass
class AuthService:
    session: Session
    users: UserRepository
    hasher: PasswordHasher
    throttle: LoginThrottle
    email: EmailSender
    settings: Settings

    # ------------------------------------------------------------ sign-up / login

    def register(self, email: str, password: str, full_name: str | None) -> str:
        if self.users.get_by_email(email):
            raise Conflict("Email already registered")
        self._require_strong(password, email)
        user = self.users.add(User(email=email, full_name=full_name, hashed_password=self.hasher.hash(password)))
        self._commit(user)
        return create_access_token(user)

    def login(self, email: str, password: str) -> str:
        self.throttle.ensure_allowed(email)
        user = self.users.get_by_email(email)
        if user and user.hashed_password:
            valid = self.hasher.verify(password, user.hashed_password)
        else:
            self.hasher.burn(password)  # same response time as a wrong password
            valid = False
        if not valid or user is None:
            self.throttle.record_failure(email)
            raise Unauthorized("Incorrect email or password")
        self.throttle.reset(email)
        return create_access_token(user)

    # ------------------------------------------------------------ passwords

    def change_password(self, user: User, current_password: str | None, new_password: str) -> str:
        """Change (or, for Google-only accounts, set) the password. Other sessions are
        signed out; the returned token keeps this one signed in."""
        if user.hashed_password and not (
            current_password and self.hasher.verify(current_password, user.hashed_password)
        ):
            raise InvalidInput("Current password is incorrect")
        self._set_password(user, new_password)
        self._commit(user)
        return create_access_token(user)

    def request_password_reset(self, email: str) -> None:
        """Email a single-use reset link. Silent when the email isn't registered, so the
        endpoint can't be used to find out which emails have accounts."""
        user = self.users.get_by_email(email)
        if user is None:
            return
        minutes = self.settings.password_reset_expire_minutes
        token = create_token(PASSWORD_RESET, str(user.id), minutes, pv=password_fingerprint(user))
        link = f"{self.settings.frontend_url}/reset-password?token={token}"
        self.email.send(
            user.email,
            RESET_SUBJECT,
            f"Someone asked to reset the password for your JDC account.\n\n"
            f"Choose a new password here (valid for {minutes} minutes):\n{link}\n\n"
            f"If this wasn't you, ignore this email; your password stays the same.",
        )

    def reset_password(self, token: str, new_password: str) -> str:
        claims = read_token(token, PASSWORD_RESET)
        user = self.users.get(int(claims["sub"]))
        # The link carries the old password's fingerprint: once used (or once the
        # password changes any other way) it stops working.
        if user is None or claims.get("pv") != password_fingerprint(user):
            raise Unauthorized("This reset link has already been used")
        self._set_password(user, new_password)
        self.throttle.reset(user.email)  # a successful reset lifts a lockout
        self._commit(user)
        return create_access_token(user)

    def sign_out_everywhere(self, user: User) -> str:
        """Invalidate every existing token; returns a fresh one for the caller's session."""
        user.token_version += 1
        self._commit(user)
        return create_access_token(user)

    # ------------------------------------------------------------ Google

    def google_sign_in(self, profile: GoogleProfile) -> str:
        """Find the account for a verified Google identity (by Google id, then by
        email, linking it), or create one."""
        if not profile.email_verified or not profile.email:
            raise UnverifiedGoogleEmail()
        user = self.users.get_by_google_id(profile.google_id) or self.users.get_by_email(profile.email)
        if user is None:
            user = self.users.add(User(email=profile.email, full_name=profile.name, google_id=profile.google_id))
        elif not user.google_id:
            user.google_id = profile.google_id
        self._commit(user)
        return create_access_token(user)

    # ------------------------------------------------------------ helpers

    def _set_password(self, user: User, password: str) -> None:
        self._require_strong(password, user.email)
        user.hashed_password = self.hasher.hash(password)

    @staticmethod
    def _require_strong(password: str, email: str | None) -> None:
        problem = password_problem(password, email)
        if problem:
            raise InvalidInput(problem)

    def _commit(self, user: User) -> None:
        self.session.commit()
        self.session.refresh(user)
