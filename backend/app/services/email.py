import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email via SMTP. Without SMTP_HOST configured, the message
    is written to the server log instead (local development). Returns True if sent."""
    settings = get_settings()
    if not settings.smtp_host:
        if settings.is_development:
            # Local use: print the message (e.g. a reset link) so it can still be used.
            logger.warning("SMTP not configured, email not sent. To: %s | Subject: %s\n%s", to, subject, body)
        else:
            # Never write reset links to production logs: anyone who can read the logs
            # could use them to take over accounts.
            logger.error("SMTP not configured, could not send %r to %s", subject, to)
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        logger.exception("Sending email to %s failed", to)
        return False
    return True
