"""Logging setup and the last-resort error handler.

- configure_logging: timestamped, levelled app logs (they were silently dropped
  below WARNING before, because nothing configured a handler), with chatty
  libraries turned down so real messages stand out.
- UnhandledErrorMiddleware: an unexpected crash returns JSON with a short reference
  id and logs the full traceback under the same id, so a user's report ("it said
  reference 3f9a1c") can be matched to the exact log entry. It sits *inside* the
  CORS middleware: FastAPI's own catch-all runs outside the middleware stack, so its
  500s lack CORS headers and browsers report them as a vague network failure.
"""

import json
import logging
import uuid

from app.core.middleware import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("app.errors")

_NOISY_LOGGERS = {
    "httpx": logging.WARNING,  # one INFO line per outgoing HTTP call (Groq, Google)
    "alembic.runtime.plugins": logging.WARNING,
}


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if not root.handlers:  # don't fight a host (pytest, gunicorn) that set up logging already
        logging.basicConfig(format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    logging.getLogger("app").setLevel(level.upper())
    for name, noisy_level in _NOISY_LOGGERS.items():
        logging.getLogger(name).setLevel(noisy_level)


class UnhandledErrorMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            reference = uuid.uuid4().hex[:8]
            logger.exception("Unhandled error %s on %s %s", reference, scope.get("method"), scope.get("path"))
            if started:
                raise  # too late to send a clean error response
            body = json.dumps({"detail": f"Something went wrong on our side. Reference: {reference}"}).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})
