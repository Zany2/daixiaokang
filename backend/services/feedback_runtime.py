"""评论与留言共享的 Redis 限流。"""

import asyncio
import hashlib
import math
import time
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable
from threading import Lock
from uuid import uuid4

from fastapi import HTTPException, Request
from redis.exceptions import RedisError

from core.config import Settings, get_settings
from core.logging import get_logger

logger = get_logger(__name__)
REDIS_FAILURES = (RedisError, OSError, asyncio.TimeoutError)

WRITE_LIMIT_SCRIPT = """
-- feedback:write-limit
if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then
    return 0
end
local remaining = redis.call('PTTL', KEYS[1])
if remaining < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    return tonumber(ARGV[1])
end
return math.max(1, remaining)
"""

READ_LIMIT_SCRIPT = """
-- feedback:read-limit
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    return math.max(1, tonumber(oldest[2]) + window - now)
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window + 1000)
return 0
"""


class LocalReadLimiter:
    """Redis 故障期间使用的进程内滑动窗口，限制键数量防止内存持续增长。"""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self.clock = clock
        self.records = OrderedDict()
        self.lock = Lock()

    def check(self, identity: str, limit: int) -> int:
        with self.lock:
            now = self.clock()
            records = self.records.pop(identity, deque())
            while records and records[0] <= now - 60:
                records.popleft()
            retry = math.ceil(records[0] + 60 - now) if len(records) >= limit else 0
            if not retry:
                records.append(now)
            self.records[identity] = records
            if len(self.records) > 10000:
                self.records.popitem(last=False)
            return max(0, retry)


class FeedbackRuntime:
    def __init__(self, redis, settings: Settings, *, clock: Callable[[], float] = time.monotonic):
        self.redis = redis
        self.settings = settings
        self.clock = clock
        self.local_reads = LocalReadLimiter(clock)
        self.last_redis_warning = None

    async def redis_call(self, operation: Awaitable):
        return await asyncio.wait_for(operation, timeout=self.settings.redis_operation_timeout_seconds)

    def warn_redis(self, operation: str, error: Exception):
        now = self.clock()
        # Redis 故障时合并日志，避免每条请求重复写入相同告警。
        if self.last_redis_warning is None or now - self.last_redis_warning >= 30:
            self.last_redis_warning = now
            logger.warning("feedback.redis_unavailable", extra={
                "operation": operation, "error_code": type(error).__name__,
            })

    @staticmethod
    def rate_key(action: str, client_ip: str | None) -> str:
        identity = hashlib.sha256((client_ip or "unknown").encode()).hexdigest()
        return f"feedback:rate:{action}:{identity}"

    @staticmethod
    def reject_rate(retry_seconds: int):
        raise HTTPException(status_code=429, detail="操作过于频繁，请稍后重试", headers={
            "Retry-After": str(max(1, retry_seconds)), "Cache-Control": "no-store",
        })

    async def check_write(self, client_ip: str | None):
        if not self.settings.feedback_rate_limit_enabled:
            return
        try:
            if self.redis is None:
                raise RedisError("Redis is not initialized")
            remaining_ms = await self.redis_call(self.redis.eval(
                WRITE_LIMIT_SCRIPT, 1, self.rate_key("write", client_ip),
                self.settings.feedback_write_interval_seconds * 1000,
            ))
        except REDIS_FAILURES as exc:
            self.warn_redis("write_limit", exc)
            raise HTTPException(status_code=503, detail="发表服务暂时不可用，请稍后重试", headers={
                "Retry-After": "5", "Cache-Control": "no-store",
            }) from exc
        if remaining_ms:
            self.reject_rate(math.ceil(remaining_ms / 1000))

    async def check_read(self, client_ip: str | None) -> None:
        """限制查询频率；Redis 故障时使用进程内滑动窗口降级。"""
        if not self.settings.feedback_rate_limit_enabled:
            return
        try:
            if self.redis is None:
                raise RedisError("Redis is not initialized")
            remaining_ms = await self.redis_call(self.redis.eval(
                READ_LIMIT_SCRIPT, 1, self.rate_key("read", client_ip), 60000,
                self.settings.feedback_read_requests_per_minute, uuid4().hex,
            ))
        except REDIS_FAILURES as exc:
            self.warn_redis("read_limit", exc)
            retry = self.local_reads.check(client_ip or "unknown", self.settings.feedback_read_requests_per_minute)
            if retry:
                self.reject_rate(retry)
            return
        if remaining_ms:
            self.reject_rate(math.ceil(remaining_ms / 1000))


async def get_feedback_runtime(request: Request) -> FeedbackRuntime:
    runtime = getattr(request.app.state, "feedback_runtime", None)
    if runtime is None:
        runtime = FeedbackRuntime(getattr(request.app.state, "redis", None), get_settings())
        request.app.state.feedback_runtime = runtime
    return runtime
