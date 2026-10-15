from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base domain error. Services raise these; they are mapped to HTTP responses in one place."""

    status_code: int = 400
    code: str = "bad_request"
    default_message: str = "Bad request"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    default_message = "Resource not found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"
    default_message = "Resource already exists"


class AuthenticationError(AppError):
    status_code = 401
    code = "not_authenticated"
    default_message = "Could not validate credentials"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"
    default_message = "Not enough permissions"


async def handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    headers = {"WWW-Authenticate": "Bearer"} if isinstance(exc, AuthenticationError) else None
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, handle_app_error)
