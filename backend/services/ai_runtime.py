"""AI 接口的 Redis 配额限制和会话生成锁。"""

import asyncio
import hashlib
import math
from uuid import UUID, uuid4

from fastapi import HTTPException, Request
from redis.exceptions import RedisError

from core.config import Settings, get_settings
from core.logging import get_logger

logger = get_logger(__name__)
REDIS_FAILURES = (RedisError, OSError, asyncio.TimeoutError)

AI_RATE_LIMIT_SCRIPT = """
-- ai:hour-limit
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
"""

AI_LOCK_RELEASE_SCRIPT = """
-- ai:conversation-lock-release
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""


class AIRuntime:
    def __init__(self, redis, settings: Settings):
        self.redis = redis
        self.settings = settings

    @staticmethod
    def identity(client_ip: str | None) -> str:
        return hashlib.sha256((client_ip or "unknown").encode()).hexdigest()

    async def redis_call(self, operation):
        return await asyncio.wait_for(
            operation,
            timeout=self.settings.redis_operation_timeout_seconds,
        )

    async def check_hour_limit(
        self,
        action: str,
        client_ip: str | None,
        limit: int,
    ) -> None:
        if not self.settings.ai_rate_limit_enabled:
            return
        try:
            if self.redis is None:
                raise RedisError("Redis is not initialized")
            result = await self.redis_call(self.redis.eval(
                AI_RATE_LIMIT_SCRIPT,
                1,
                f"ai:rate:{action}:{self.identity(client_ip)}",
                3600,
            ))
        except REDIS_FAILURES as exc:
            logger.warning("ai.redis_unavailable", extra={
                "operation": f"{action}_limit",
                "error_code": type(exc).__name__,
            })
            raise HTTPException(
                status_code=503,
                detail="AI 服务暂时不可用，请稍后重试",
                headers={"Retry-After": "5", "Cache-Control": "no-store"},
            ) from exc

        count, ttl = int(result[0]), int(result[1])
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail="AI 请求过于频繁，请稍后重试",
                headers={
                    "Retry-After": str(max(1, math.ceil(ttl))),
                    "Cache-Control": "no-store",
                },
            )

    async def check_message_limit(self, client_ip: str | None) -> None:
        await self.check_hour_limit(
            "message",
            client_ip,
            self.settings.ai_requests_per_hour,
        )

    async def check_conversation_limit(self, client_ip: str | None) -> None:
        await self.check_hour_limit(
            "conversation",
            client_ip,
            self.settings.ai_conversations_per_hour,
        )

    async def acquire_conversation_lock(self, conversation_id: UUID) -> str:
        token = uuid4().hex
        key = f"ai:lock:conversation:{conversation_id}"
        try:
            if self.redis is None:
                raise RedisError("Redis is not initialized")
            acquired = await self.redis_call(self.redis.set(
                key,
                token,
                ex=self.settings.ai_conversation_lock_seconds,
                nx=True,
            ))
        except REDIS_FAILURES as exc:
            logger.warning("ai.redis_unavailable", extra={
                "operation": "conversation_lock",
                "error_code": type(exc).__name__,
            })
            raise HTTPException(
                status_code=503,
                detail="AI 服务暂时不可用，请稍后重试",
                headers={"Retry-After": "5", "Cache-Control": "no-store"},
            ) from exc
        if not acquired:
            raise HTTPException(status_code=409, detail="当前对话正在生成回答，请稍后再试")
        return token

    async def release_conversation_lock(self, conversation_id: UUID, token: str) -> None:
        try:
            if self.redis is None:
                return
            await self.redis_call(self.redis.eval(
                AI_LOCK_RELEASE_SCRIPT,
                1,
                f"ai:lock:conversation:{conversation_id}",
                token,
            ))
        except REDIS_FAILURES as exc:
            logger.warning("ai.redis_unavailable", extra={
                "operation": "conversation_unlock",
                "error_code": type(exc).__name__,
            })


async def get_ai_runtime(request: Request) -> AIRuntime:
    runtime = getattr(request.app.state, "ai_runtime", None)
    if runtime is None:
        runtime = AIRuntime(getattr(request.app.state, "redis", None), get_settings())
        request.app.state.ai_runtime = runtime
    return runtime
