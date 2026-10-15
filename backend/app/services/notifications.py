"""Sending email, behind one small interface.

Services that need to email someone depend on `EmailSender` (the abstraction),
never on SMTP (a detail). Adding a provider (SendGrid, SES, ...) means writing one
more class with a `send` method; nothing that sends email has to change. Tests
pass an in-memory sender instead of monkeypatching modules.
"""

import logging
import smtplib
from email.message import EmailMessage
from typing import Protocol

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class EmailSender(Protocol):
    def send(self, to: str, subject: str, body: str) -> bool:
        """Deliver a plain-text email. Returns True if it was handed to a mail server."""


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def send(self, to: str, subject: str, body: str) -> bool:
        s = self._settings
        message = EmailMessage()
        message["From"] = s.smtp_from
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        try:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
                smtp.starttls()
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException):
            logger.exception("Sending email to %s failed", to)
            return False
        return True


class LogEmailSender:
    """Used when SMTP isn't configured. In development the message (e.g. a reset link)
    is printed so it can still be used; otherwise only the fact that it couldn't be
    sent is logged: reset links in production logs would let anyone who reads the
    logs take over accounts."""

    def __init__(self, *, show_body: bool) -> None:
        self._show_body = show_body

    def send(self, to: str, subject: str, body: str) -> bool:
        if self._show_body:
            logger.warning("SMTP not configured, email not sent. To: %s | Subject: %s\n%s", to, subject, body)
        else:
            logger.error("SMTP not configured, could not send %r to %s", subject, to)
        return False


def email_sender_from_settings(settings: Settings | None = None) -> EmailSender:
    settings = settings or get_settings()
    if settings.smtp_host:
        return SmtpEmailSender(settings)
    return LogEmailSender(show_body=settings.is_development)
