"""评论/留言共享的 Redis 限流、热点缓存与数据库查询并发保护。"""

import asyncio
import hashlib
import math
import time
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable
from threading import Lock
from typing import TypeVar
from uuid import uuid4

from fastapi import HTTPException, Request
from pydantic import BaseModel, ValidationError
from redis.exceptions import RedisError

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
Model = TypeVar("Model", bound=BaseModel)
REDIS_FAILURES = (RedisError, OSError, asyncio.TimeoutError)
MAX_CACHE_BYTES = 1024 * 1024

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

VERSION_SCRIPT = """
-- feedback:cache-version
local version = redis.call('GET', KEYS[1])
if version then return version end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return ARGV[1]
"""

COMPARE_DELETE_SCRIPT = """
-- feedback:compare-delete
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""


def comments_namespace(article_key: str) -> str:
    return "comments:" + hashlib.sha256(article_key.encode("utf-8")).hexdigest()


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
        self.read_slots = asyncio.Semaphore(settings.feedback_database_read_concurrency)
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

    async def check_read(self, client_ip: str | None) -> bool:
        """返回本次 Redis 是否可用；降级时跳过缓存，避免再次等待 Redis 超时。"""
        if not self.settings.feedback_rate_limit_enabled:
            return self.redis is not None
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
            return False
        if remaining_ms:
            self.reject_rate(math.ceil(remaining_ms / 1000))
        return True

    async def database_query(self, loader: Callable[[], Awaitable[Model]]) -> Model:
        try:
            await asyncio.wait_for(
                self.read_slots.acquire(), timeout=self.settings.feedback_database_read_wait_seconds,
            )
        except asyncio.TimeoutError as exc:
            raise HTTPException(status_code=503, detail="查询服务繁忙，请稍后重试", headers={
                "Retry-After": "1", "Cache-Control": "no-store",
            }) from exc
        try:
            return await loader()
        finally:
            self.read_slots.release()

    def version_key(self, namespace: str) -> str:
        return f"feedback:version:{namespace}"

    @property
    def version_ttl(self) -> int:
        return max(3600, self.settings.feedback_cache_ttl_seconds + self.settings.feedback_cache_lock_seconds + 1)

    async def invalidate(self, namespace: str):
        if not self.settings.feedback_cache_enabled:
            return
        try:
            if self.redis is None:
                raise RedisError("Redis is not initialized")
            # 数据已提交；切换随机版本，使旧查询回写的缓存也不可被新请求命中。
            await self.redis_call(self.redis.set(self.version_key(namespace), uuid4().hex, ex=self.version_ttl))
        except REDIS_FAILURES as exc:
            # 不能将已成功保存的数据报告成失败，防止访客再次提交。
            self.warn_redis("cache_invalidation_after_commit", exc)

    async def read_cached(self, key: str, response_type: type[Model]) -> Model | None:
        payload = await self.redis_call(self.redis.get(key))
        if payload is None:
            return None
        try:
            return response_type.model_validate_json(payload)
        except ValidationError:
            await self.redis_call(self.redis.delete(key))
            return None

    async def compare_delete(self, key: str, value: str):
        try:
            await self.redis_call(self.redis.eval(COMPARE_DELETE_SCRIPT, 1, key, value))
        except REDIS_FAILURES as exc:
            self.warn_redis("cache_lock_release", exc)

    async def query(
        self, namespace: str | None, variant: str, response_type: type[Model],
        loader: Callable[[], Awaitable[Model]], *, cache_allowed: bool, cache_empty: bool = True,
    ) -> Model:
        if not namespace or not cache_allowed or not self.settings.feedback_cache_enabled or self.redis is None:
            return await self.database_query(loader)
        version_key = self.version_key(namespace)
        try:
            version = await self.redis_call(self.redis.eval(VERSION_SCRIPT, 1, version_key, uuid4().hex, self.version_ttl))
            cache_key = f"feedback:cache:{namespace}:{version}:{variant}"
            cached = await self.read_cached(cache_key, response_type)
            if cached is not None:
                return cached
            token = uuid4().hex
            lock_key = cache_key + ":lock"
            owner = await self.redis_call(self.redis.set(lock_key, token, nx=True, ex=self.settings.feedback_cache_lock_seconds))
            if not owner:
                loop = asyncio.get_running_loop()
                deadline = loop.time() + self.settings.feedback_cache_wait_ms / 1000
                while loop.time() < deadline:
                    await asyncio.sleep(min(0.05, max(0, deadline - loop.time())))
                    cached = await self.read_cached(cache_key, response_type)
                    if cached is not None:
                        return cached
        except REDIS_FAILURES as exc:
            self.warn_redis("cache_read", exc)
            return await self.database_query(loader)
        if not owner:
            return await self.database_query(loader)
        try:
            response = await self.database_query(loader)
            try:
                if not cache_empty and not response.items:
                    # 未知/空文章不保留响应或版本键；比较版本后删除，避免误删发表后的新版本。
                    await self.compare_delete(version_key, version)
                else:
                    payload = response.model_dump_json()
                    if len(payload.encode("utf-8")) <= MAX_CACHE_BYTES:
                        # 始终写查询开始时的版本，不能将旧查询结果写入最新版本。
                        await self.redis_call(self.redis.set(cache_key, payload, ex=self.settings.feedback_cache_ttl_seconds))
            except REDIS_FAILURES as exc:
                self.warn_redis("cache_write", exc)
            return response
        finally:
            await self.compare_delete(lock_key, token)


async def get_feedback_runtime(request: Request) -> FeedbackRuntime:
    runtime = getattr(request.app.state, "feedback_runtime", None)
    if runtime is None:
        runtime = FeedbackRuntime(getattr(request.app.state, "redis", None), get_settings())
        request.app.state.feedback_runtime = runtime
    return runtime
