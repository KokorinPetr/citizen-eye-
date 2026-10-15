from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
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


class InvalidInputError(AppError):
    status_code = 422
    code = "invalid_input"
    default_message = "Invalid input"


class AuthenticationError(AppError):
    status_code = 401
    code = "not_authenticated"
    default_message = "Could not validate credentials"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"
    default_message = "Not enough permissions"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "service_unavailable"
    default_message = "Service temporarily unavailable"


async def handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    headers = {"WWW-Authenticate": "Bearer"} if isinstance(exc, AuthenticationError) else None
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
        headers=headers,
    )


async def handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    """Same error shape as AppError, with FastAPI's field errors in `details`."""
    assert isinstance(exc, RequestValidationError)
    details = [
        {"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(
            {
                "error": {
                    "code": "validation_error",
                    "message": "Invalid request",
                    "details": details,
                }
            }
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, handle_app_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
