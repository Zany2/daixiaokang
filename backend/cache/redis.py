from typing import Annotated

from fastapi import Depends, FastAPI, Request
from redis.asyncio import Redis

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


async def init_redis(app: FastAPI) -> None:
    settings = get_settings()
    app.state.redis = Redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        health_check_interval=30,
        socket_connect_timeout=settings.redis_operation_timeout_seconds,
        socket_timeout=settings.redis_operation_timeout_seconds,
    )


async def close_redis(app: FastAPI) -> None:
    client: Redis | None = getattr(app.state, "redis", None)
    if client is not None:
        await client.aclose()


async def redis_is_ready(client: Redis) -> bool:
    try:
        return bool(await client.ping())
    except Exception as exc:
        logger.warning("redis.unavailable", extra={"error_code": type(exc).__name__})
        return False


async def get_redis(request: Request) -> Redis:
    return request.app.state.redis


RedisDependency = Annotated[Redis, Depends(get_redis)]
