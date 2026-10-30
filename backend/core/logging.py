import json
import logging
import logging.config
from contextvars import ContextVar, Token
from datetime import datetime
from pathlib import Path
from typing import Any

from core.config import Settings
from core.log_handlers import DailySizeRotatingFileHandler

request_id_context: ContextVar[str] = ContextVar("request_id", default="")
LOG_EXTRA_FIELDS = (
    "environment",
    "method",
    "path",
    "status_code",
    "duration_ms",
    "client",
    "error_code",
)


def bind_request_id(request_id: str) -> Token[str]:
    return request_id_context.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    request_id_context.reset(token)


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_context.get()
        record.request_id_field = (
            f"request_id={record.request_id} | "
            if record.request_id and record.request_id != "-"
            else ""
        )
        record.context = "".join(
            f" | {field}={getattr(record, field)!r}"
            for field in LOG_EXTRA_FIELDS
            if hasattr(record, field)
        )
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created).astimezone()
        payload: dict[str, Any] = {
            "timestamp": timestamp.isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "filename": record.filename,
            "function": record.funcName,
            "line": record.lineno,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", "")
        if request_id and request_id != "-":
            payload["request_id"] = request_id
        for field in LOG_EXTRA_FIELDS:
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(settings: Settings) -> None:
    formatter = "json" if settings.log_json else "standard"
    handlers: dict[str, Any] = {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["request_id"],
            "formatter": formatter,
            "stream": "ext://sys.stdout",
        }
    }
    if settings.log_file_enabled:
        # 相对目录固定以 backend 为基准，避免启动目录不同导致日志位置变化。
        log_dir = settings.log_dir
        if not log_dir.is_absolute():
            log_dir = Path(__file__).resolve().parents[1] / log_dir
        log_dir.mkdir(parents=True, exist_ok=True)
        handlers["file"] = {
            "()": DailySizeRotatingFileHandler,
            "filters": ["request_id"],
            "formatter": formatter,
            "filename": str(log_dir / "app.log"),
            "max_bytes": settings.log_max_size_mb * 1024 * 1024,
            "backup_count": settings.log_backup_count,
        }
    handler_names = list(handlers)
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {"request_id": {"()": RequestIdFilter}},
            "formatters": {
                "standard": {
                    "format": (
                        "%(asctime)s | %(levelname)s | "
                        "%(filename)s(%(funcName)s:%(lineno)d) | "
                        "%(request_id_field)s%(message)s%(context)s"
                    ),
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
                "json": {"()": JsonFormatter},
            },
            "handlers": handlers,
            "root": {"handlers": handler_names, "level": settings.log_level},
            "loggers": {
                "uvicorn": {
                    "handlers": [],
                    "level": settings.log_level,
                    "propagate": True,
                },
                "uvicorn.error": {
                    "handlers": [],
                    "level": settings.log_level,
                    "propagate": True,
                },
                "uvicorn.access": {"handlers": [], "propagate": False},
                "sqlalchemy.engine": {
                    "handlers": handler_names,
                    "level": "INFO" if settings.database_echo else "WARNING",
                    "propagate": False,
                },
            },
        }
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
