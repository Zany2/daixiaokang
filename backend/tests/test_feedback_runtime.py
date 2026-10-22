"""内存 Redis 执行实际 Lua，覆盖限流原子性、缓存竞争与故障降级。"""

import asyncio
import unittest
from datetime import datetime
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
from fastapi import HTTPException
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import select

from app.core.config import Settings
from app.models import GuestbookMessage
from app.schemas.feedback import CommentThread, CursorPage, MessagePage, MessagePublic
from app.services.feedback_runtime import FeedbackRuntime, comments_namespace
import test_feedback_api


class FeedbackRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 1000000000.0
        self.time_patch = patch("time.time", lambda: self.now)
        self.time_patch.start()
        self.addCleanup(self.time_patch.stop)
        self.server = fakeredis.FakeServer()
        self.redis = fakeredis.aioredis.FakeRedis(server=self.server, decode_responses=True)
        self.addAsyncCleanup(self.redis.aclose)
        self.settings = Settings(_env_file=None, feedback_cache_wait_ms=200)
        self.runtime = FeedbackRuntime(self.redis, self.settings, clock=lambda: self.now)

    def make_runtime(self, **settings):
        return FeedbackRuntime(
            self.redis, self.settings.model_copy(update=settings), clock=lambda: self.now,
        )

    def attach_api(self, runtime=None):
        fixture = test_feedback_api.FeedbackApiTests("test_empty_lists_and_no_delete_or_approval_routes")
        fixture.setUp()
        fixture.app.state.feedback_runtime = runtime or self.runtime
        self.addCleanup(fixture.doCleanups)
        return fixture

    @staticmethod
    def page(content="hello"):
        return MessagePage(
            items=[MessagePublic(
                id=1, nickname="visitor", content=content,
                created_at=datetime(2026, 10, 13), updated_at=datetime(2026, 10, 13),
            )], page=1, page_size=30, total=1, total_pages=1, has_more=False,
        )

    async def test_concurrent_writes_share_one_atomic_ten_second_slot(self):
        other_worker = self.make_runtime()
        attempts = [
            (self.runtime if index % 2 else other_worker).check_write("192.0.2.1")
            for index in range(12)
        ]
        results = await asyncio.gather(*attempts, return_exceptions=True)
        self.assertEqual(sum(result is None for result in results), 1)
        rejected = [result for result in results if isinstance(result, HTTPException)]
        self.assertEqual(len(rejected), 11)
        self.assertTrue(all(result.status_code == 429 and result.headers["Retry-After"] == "10" for result in rejected))
        await self.runtime.check_write("192.0.2.2")
        self.now += 9.4
        with self.assertRaises(HTTPException) as failure:
            await self.runtime.check_write("192.0.2.1")
        self.assertEqual(failure.exception.headers["Retry-After"], "1")
        self.now += 0.7
        await other_worker.check_write("192.0.2.1")

    async def test_read_window_does_not_reset_at_minute_boundaries(self):
        runtime = self.make_runtime(feedback_read_requests_per_minute=3)
        for _ in range(3):
            self.assertTrue(await runtime.check_read("192.0.2.1"))
        self.now += 30
        with self.assertRaises(HTTPException) as failure:
            await runtime.check_read("192.0.2.1")
        self.assertEqual(failure.exception.status_code, 429)
        self.assertEqual(failure.exception.headers["Retry-After"], "30")
        self.now += 30.1
        self.assertTrue(await runtime.check_read("192.0.2.1"))

    async def test_cache_hit_expiry_and_invalid_payload_rebuild(self):
        loader = AsyncMock(return_value=self.page())
        async def query():
            return await self.runtime.query("messages", "page:1:size:30", MessagePage, loader, cache_allowed=True)
        first = await query()
        second = await query()
        self.assertEqual(first, second)
        self.assertEqual(loader.await_count, 1)
        keys = await self.redis.keys("feedback:cache:messages:*")
        self.assertEqual(len(keys), 1)
        self.assertGreater(await self.redis.ttl(keys[0]), 0)
        self.assertLessEqual(await self.redis.ttl(keys[0]), 30)
        self.now += 30.1
        await query()
        self.assertEqual(loader.await_count, 2)
        key = (await self.redis.keys("feedback:cache:messages:*"))[0]
        await self.redis.set(key, "invalid-json", ex=30)
        await query()
        self.assertEqual(loader.await_count, 3)

    async def test_cache_lock_coalesces_concurrent_misses(self):
        count = 0
        async def loader():
            nonlocal count
            count += 1
            await asyncio.sleep(0.03)
            return self.page()
        responses = await asyncio.gather(*[
            self.runtime.query("messages", "first", MessagePage, loader, cache_allowed=True)
            for _ in range(10)
        ])
        self.assertEqual(count, 1)
        self.assertEqual(len(responses), 10)
        self.assertEqual(await self.redis.keys("*:lock"), [])

    async def test_old_query_cannot_write_stale_data_into_new_version(self):
        started = asyncio.Event()
        release = asyncio.Event()
        async def old_loader():
            started.set()
            await release.wait()
            return self.page("old")
        old_query = asyncio.create_task(self.runtime.query("messages", "first", MessagePage, old_loader, cache_allowed=True))
        await started.wait()
        old_version = await self.redis.get(self.runtime.version_key("messages"))
        await self.runtime.invalidate("messages")
        new_loader = AsyncMock(return_value=self.page("new"))
        await self.runtime.query("messages", "first", MessagePage, new_loader, cache_allowed=True)
        release.set()
        await old_query
        final = await self.runtime.query("messages", "first", MessagePage, new_loader, cache_allowed=True)
        self.assertEqual(final.items[0].content, "new")
        self.assertEqual(new_loader.await_count, 1)
        self.assertNotEqual(await self.redis.get(self.runtime.version_key("messages")), old_version)

    async def test_version_key_loss_never_reuses_old_cache_version(self):
        loader = AsyncMock(return_value=self.page("old"))
        await self.runtime.query("messages", "first", MessagePage, loader, cache_allowed=True)
        old_version = await self.redis.get(self.runtime.version_key("messages"))
        await self.redis.delete(self.runtime.version_key("messages"))
        loader.return_value = self.page("new")
        result = await self.runtime.query("messages", "first", MessagePage, loader, cache_allowed=True)
        self.assertEqual(result.items[0].content, "new")
        self.assertNotEqual(await self.redis.get(self.runtime.version_key("messages")), old_version)

    async def test_empty_unknown_articles_leave_no_cache_keys(self):
        loader = AsyncMock(return_value=CursorPage[CommentThread](items=[], page_size=30, has_more=False, next_cursor=None))
        for _ in range(2):
            await self.runtime.query(
                comments_namespace("unknown"), "first:30", CursorPage[CommentThread], loader,
                cache_allowed=True, cache_empty=False,
            )
        self.assertEqual(loader.await_count, 2)
        self.assertEqual(await self.redis.keys("feedback:*"), [])

    async def test_expired_owner_cannot_release_someone_elses_lock(self):
        await self.redis.set("lock", "old", ex=3)
        self.now += 4
        await self.redis.set("lock", "new", ex=3)
        await self.runtime.compare_delete("lock", "old")
        self.assertEqual(await self.redis.get("lock"), "new")

    async def test_redis_outage_blocks_writes_and_locally_limits_reads(self):
        runtime = self.make_runtime(feedback_read_requests_per_minute=2)
        self.server.connected = False
        with self.assertLogs("app.services.feedback_runtime", level="WARNING"):
            with self.assertRaises(HTTPException) as failure:
                await runtime.check_write("192.0.2.1")
        self.assertEqual(failure.exception.status_code, 503)
        self.assertFalse(await runtime.check_read("192.0.2.1"))
        self.assertFalse(await runtime.check_read("192.0.2.1"))
        with self.assertRaises(HTTPException) as failure:
            await runtime.check_read("192.0.2.1")
        self.assertEqual(failure.exception.status_code, 429)
        loader = AsyncMock(return_value=self.page())
        await runtime.query("messages", "first", MessagePage, loader, cache_allowed=False)
        self.assertEqual(loader.await_count, 1)
        self.now += 60.1
        with self.assertLogs("app.services.feedback_runtime", level="WARNING"):
            self.assertFalse(await runtime.check_read("192.0.2.1"))

    async def test_redis_timeout_cancels_operation_and_blocks_write(self):
        runtime = self.make_runtime(redis_operation_timeout_seconds=0.05)
        cancelled = asyncio.Event()
        async def stalled(*args, **kwargs):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with patch.object(self.redis, "eval", AsyncMock(side_effect=stalled)):
            with self.assertLogs("app.services.feedback_runtime", level="WARNING"):
                with self.assertRaises(HTTPException) as failure:
                    await runtime.check_write("192.0.2.1")
            self.assertEqual(failure.exception.status_code, 503)
            self.assertTrue(cancelled.is_set())
            self.assertFalse(await runtime.check_read("192.0.2.1"))

    async def test_api_redis_outage_reads_database_without_accepting_writes(self):
        api = self.attach_api()
        self.server.connected = False
        with self.assertLogs("app.services.feedback_runtime", level="WARNING"):
            status, _ = await api.async_request("POST", "/api/messages", {"nickname": "A", "content": "not saved"})
        self.assertEqual(status, 503)
        self.assertEqual(api.session.execute(select(GuestbookMessage)).scalars().all(), [])
        with patch.object(self.redis, "get", AsyncMock(side_effect=AssertionError("Cache should be bypassed"))):
            self.assertEqual((await api.async_request("GET", "/api/messages"))[0], 200)
        self.assertEqual(len(api.db.statements), 1)

    async def test_database_concurrency_timeout_releases_slot(self):
        runtime = self.make_runtime(feedback_database_read_concurrency=1, feedback_database_read_wait_seconds=0.05)
        started = asyncio.Event()
        release = asyncio.Event()
        async def loader():
            started.set()
            await release.wait()
            return self.page()
        first = asyncio.create_task(runtime.database_query(loader))
        await started.wait()
        with self.assertRaises(HTTPException) as failure:
            await runtime.database_query(AsyncMock(return_value=self.page()))
        self.assertEqual(failure.exception.status_code, 503)
        release.set()
        await first
        await runtime.database_query(AsyncMock(return_value=self.page()))

    async def test_api_write_limit_is_shared_across_comments_and_messages(self):
        api = self.attach_api()
        status, root = await api.async_request("POST", "/api/comments", {
            "article_key": "article-a", "nickname": "A", "content": "root",
        })
        self.assertEqual(status, 201)
        for endpoint, payload in (
            ("/api/messages", {"nickname": "B", "content": "message"}),
            ("/api/comments", {"article_key": "article-a", "nickname": "B", "content": "reply", "parent_id": root["id"]}),
        ):
            status, _ = await api.async_request("POST", endpoint, payload)
            self.assertEqual(status, 429)
            self.assertEqual(api.last_response_headers["retry-after"], "10")
        self.now += 10.1
        self.assertEqual((await api.async_request("POST", "/api/messages", {"nickname": "B", "content": "message"}))[0], 201)

    async def test_api_cached_reads_still_share_query_limit(self):
        runtime = self.make_runtime(feedback_read_requests_per_minute=3)
        api = self.attach_api(runtime)
        root = api.seed_comment(created_at=datetime(2000, 1, 1))
        api.session.commit()
        self.assertEqual((await api.async_request("GET", "/api/comments?article_key=article-a"))[0], 200)
        api.db.statements.clear()
        self.assertEqual((await api.async_request("GET", "/api/comments?article_key=article-a"))[0], 200)
        self.assertEqual(api.db.statements, [])
        self.assertEqual(api.last_response_headers["cache-control"], "no-store")
        self.assertEqual((await api.async_request("GET", f"/api/comments/{root.id}/replies"))[0], 200)
        self.assertEqual((await api.async_request("GET", "/api/messages"))[0], 429)
        self.assertEqual(api.last_response_headers["retry-after"], "60")
        self.assertEqual((await api.async_request("GET", "/api/messages", client_ip="192.0.2.9"))[0], 200)

    async def test_comment_and_reply_creation_immediately_invalidate_article_preview(self):
        api = self.attach_api()
        seeded = api.seed_comment(created_at=datetime(2000, 1, 1))
        api.session.commit()
        await api.async_request("GET", "/api/comments?article_key=article-a")
        status, created = await api.async_request("POST", "/api/comments", {
            "article_key": "article-a", "nickname": "A", "content": "new-root",
        })
        self.assertEqual(status, 201)
        _, listing = await api.async_request("GET", "/api/comments?article_key=article-a")
        self.assertEqual(listing["items"][0]["id"], created["id"])
        self.now += 10.1
        status, reply = await api.async_request("POST", "/api/comments", {
            "article_key": "article-a", "nickname": "B", "content": "new-reply", "parent_id": seeded.id,
        })
        self.assertEqual(status, 201)
        _, listing = await api.async_request("GET", "/api/comments?article_key=article-a")
        thread = next(item for item in listing["items"] if item["id"] == seeded.id)
        self.assertEqual(thread["replies"][0]["id"], reply["id"])
        api.assert_private_fields_absent(listing)

    async def test_message_creation_invalidates_all_three_cached_pages(self):
        api = self.attach_api()
        api.session.add_all([
            GuestbookMessage(nickname="A", content=f"message-{index}", created_at=datetime(2000, 1, 1))
            for index in range(61)
        ])
        api.session.commit()
        old_pages = []
        for page in (1, 2, 3):
            _, result = await api.async_request("GET", f"/api/messages?page={page}")
            old_pages.append(result)
        status, created = await api.async_request("POST", "/api/messages", {"nickname": "B", "content": "new-message"})
        self.assertEqual(status, 201)
        for page in (1, 2, 3):
            _, result = await api.async_request("GET", f"/api/messages?page={page}")
            self.assertEqual(result["total"], 62)
            self.assertNotEqual(result["items"], old_pages[page - 1]["items"])
            if page == 1:
                self.assertEqual(result["items"][0]["id"], created["id"])

    async def test_post_commit_cache_failure_preserves_creation_success(self):
        api = self.attach_api()
        with patch.object(self.redis, "set", AsyncMock(side_effect=RedisConnectionError("offline"))):
            with self.assertLogs("app.services.feedback_runtime", level="WARNING"):
                status, created = await api.async_request("POST", "/api/messages", {"nickname": "A", "content": "saved"})
        self.assertEqual(status, 201)
        self.assertEqual(api.session.get(GuestbookMessage, created["id"]).content, "saved")

    async def test_custom_pages_and_more_replies_are_not_cached(self):
        api = self.attach_api()
        root = api.seed_comment()
        api.seed_comment(parent_id=root.id, root_id=root.id)
        api.session.commit()
        for url in (
            "/api/comments?article_key=article-a&page_size=1",
            "/api/comments?article_key=article-a&page=2",
            f"/api/comments/{root.id}/replies", "/api/messages?page=4", "/api/messages?page_size=10",
        ):
            self.assertEqual((await api.async_request("GET", url))[0], 200)
        self.assertEqual(await self.redis.keys("feedback:cache:*"), [])


if __name__ == "__main__":
    unittest.main()
