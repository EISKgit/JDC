"""HTTP hardening applied to every response/request (plain ASGI, no extra dependencies).

SecurityHeadersMiddleware
    Tells browsers to be strict with our responses: no MIME sniffing, no framing
    (clickjacking), no referrer leaks, no caching of private API data, and - outside
    development - HTTPS only (HSTS). API responses get a deny-everything CSP, since
    they're JSON and never need to load anything.

BodySizeLimitMiddleware
    Rejects request bodies over MAX_REQUEST_BYTES with 413, before the app reads
    them, so one huge request can't exhaust memory.
"""

from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

# Swagger UI / ReDoc load scripts and styles from a CDN, so they can't use the strict API CSP.
_DOCS_PATHS = ("/docs", "/redoc")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, https_only: bool) -> None:
        self.app = app
        self.headers: list[tuple[bytes, bytes]] = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
            (b"cross-origin-opener-policy", b"same-origin"),
        ]
        if https_only:
            self.headers.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        is_docs = path.startswith(_DOCS_PATHS)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                extra = list(self.headers)
                if not is_docs:
                    extra.append((b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"))
                if path.startswith("/api/"):
                    # Journal data is private: never store it in browser or proxy caches.
                    extra.append((b"cache-control", b"no-store"))
                headers.extend((k, v) for k, v in extra if k not in present)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope.get("headers", [])).get(b"content-length")
        if declared is not None:
            # The server already guarantees the body matches a declared length.
            if not declared.isdigit() or int(declared) > self.max_bytes:
                await self._reject(send)
                return
            await self.app(scope, receive, send)
            return

        # No declared length (chunked upload): read the body here, at most max_bytes,
        # then hand it to the app. (Raising mid-read wouldn't work: FastAPI turns any
        # error while reading a body into a generic 400.)
        messages: list[Message] = []
        size = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                break  # client disconnected
            size += len(message.get("body", b""))
            if size > self.max_bytes:
                await self._reject(send)
                return
            if not message.get("more_body", False):
                break

        async def replay() -> Message:
            return messages.pop(0) if messages else await receive()

        await self.app(scope, replay, send)

    async def _reject(self, send: Send) -> None:
        body = b'{"detail":"Request is too large"}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})
