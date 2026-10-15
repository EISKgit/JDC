"""The one place where business errors become HTTP responses."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.domain.errors import (
    Conflict,
    DomainError,
    InvalidInput,
    NotConfigured,
    NotFound,
    TooManyRequests,
    Unauthorized,
)

STATUS_CODES: dict[type[DomainError], int] = {
    InvalidInput: 400,
    Unauthorized: 401,
    NotFound: 404,
    Conflict: 409,
    TooManyRequests: 429,
    NotConfigured: 501,
}


def status_code_for(error: DomainError) -> int:
    for error_type in type(error).__mro__:
        if error_type in STATUS_CODES:
            return STATUS_CODES[error_type]
    return 400


async def handle_domain_error(_: Request, error: DomainError) -> JSONResponse:
    headers = {"Retry-After": str(error.retry_after)} if isinstance(error, TooManyRequests) else None
    if isinstance(error, Unauthorized):
        headers = {"WWW-Authenticate": "Bearer"}
    return JSONResponse({"detail": error.message}, status_code=status_code_for(error), headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, handle_domain_error)  # type: ignore[arg-type]
