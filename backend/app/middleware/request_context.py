import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import bind_request_id, get_logger, reset_request_id

logger = get_logger(__name__)


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = headers.get("X-Request-ID") or uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        token = bind_request_id(request_id)
        started_at = time.perf_counter()
        status_code = 500
        client = scope.get("client")
        client_host = client[0] if client else None

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            logger.exception(
                "request.failed",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status_code": status_code,
                    "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                    "client": client_host,
                },
            )
            raise
        else:
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            logger.info(
                "request.completed",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "client": client_host,
                },
            )
        finally:
            reset_request_id(token)
