"""Business-level errors, independent of HTTP.

Services and repositories raise these; they never import FastAPI or know about
status codes. The API layer translates each one into an HTTP response in exactly
one place (app/api/errors.py), so changing how an error is presented never means
touching business code, and the business code can be reused outside HTTP
(scripts, workers, tests) unchanged.
"""


class DomainError(Exception):
    """Base class: a rule of the application was violated. `message` is safe to show users."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidInput(DomainError):
    """The request is well-formed but breaks a rule (weak password, wrong confirmation...)."""


class Unauthorized(DomainError):
    """Who you are couldn't be confirmed (bad credentials, expired or revoked token)."""


class NotFound(DomainError):
    """The thing doesn't exist, or belongs to someone else (deliberately indistinguishable)."""


class Conflict(DomainError):
    """The request clashes with existing data (e.g. email already registered)."""


class TooManyRequests(DomainError):
    """A rate limit or lockout applies; try again after `retry_after` seconds."""

    def __init__(self, message: str, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class NotConfigured(DomainError):
    """An optional feature is switched off in this deployment (e.g. Google sign-in)."""
