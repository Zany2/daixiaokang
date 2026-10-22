"""离线 ASGI 接口测试：内存数据库，无服务监听、PostgreSQL 或 Redis 连接。"""

import asyncio
import base64
import json
import unittest
from datetime import datetime

from fastapi import FastAPI
from sqlalchemy import create_engine, event
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.api.feedback import router
from app.db.base import Base
from app.db.session import get_db
from app.core.config import Settings
from app.models import ArticleComment, GuestbookMessage
from app.services.feedback_runtime import FeedbackRuntime


class OfflineSession:
    """保留真实 SQL/事务，仅将异步会话操作适配到内存 SQLite。"""

    def __init__(self, session):
        self.session = session
        self.statements = []

    def add(self, record):
        self.session.add(record)

    async def execute(self, query):
        self.statements.append(query)
        return self.session.execute(query)

    async def flush(self):
        self.session.flush()

    async def refresh(self, record):
        self.session.refresh(record)

    async def commit(self):
        self.session.commit()

    async def rollback(self):
        self.session.rollback()


class FeedbackApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")

        @event.listens_for(self.engine, "connect")
        def configure(connection, _):
            connection.execute("PRAGMA foreign_keys = ON")
            connection.create_function("char_length", 1, lambda value: len(value))
            connection.create_function("btrim", 2, lambda value, chars: value.strip(chars))

        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)
        self.db = OfflineSession(self.session)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.session.close)
        self.app = FastAPI()
        self.app.include_router(router)
        # 本文件验证接口业务；限流与缓存由专门的运行时测试启用验证。
        self.app.state.feedback_runtime = FeedbackRuntime(None, Settings(
            _env_file=None, feedback_rate_limit_enabled=False, feedback_cache_enabled=False,
        ))

        async def offline_db():
            try:
                yield self.db
            except Exception:
                await self.db.rollback()
                raise

        self.app.dependency_overrides[get_db] = offline_db

    def request(self, method, path, body=None, headers=None, client_ip="192.0.2.8"):
        return asyncio.run(self.async_request(method, path, body, headers, client_ip))

    async def async_request(self, method, path, body=None, headers=None, client_ip="192.0.2.8"):
        route, _, query = path.partition("?")
        payload = json.dumps(body).encode() if body is not None else b""
        supplied_headers = {"content-type": "application/json", **(headers or {})}
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": method, "scheme": "http", "path": route, "raw_path": route.encode(),
            "query_string": query.encode(), "root_path": "",
            "headers": [(key.lower().encode(), value.encode()) for key, value in supplied_headers.items()],
            "client": (client_ip, 1234), "server": ("localhost", 8000),
        }
        received = False
        events = []

        async def receive():
            nonlocal received
            if received:
                return {"type": "http.disconnect"}
            received = True
            return {"type": "http.request", "body": payload, "more_body": False}

        async def send(message):
            events.append(message)

        await self.app(scope, receive, send)
        start = next(item for item in events if item["type"] == "http.response.start")
        self.last_response_headers = {key.decode(): value.decode() for key, value in start.get("headers", [])}
        content = b"".join(item.get("body", b"") for item in events if item["type"] == "http.response.body")
        return start["status"], json.loads(content)

    def seed_comment(self, **overrides):
        values = {
            "article_key": "article-a", "nickname": "访客", "content": "正文",
            "created_at": datetime(2026, 10, 13, 12, 0, 0),
        }
        values.update(overrides)
        record = ArticleComment(**values)
        self.session.add(record)
        self.session.flush()
        return record

    def assert_private_fields_absent(self, response):
        private = {"email", "client_ip", "user_agent", "status", "deleted_at"}
        if isinstance(response, dict):
            self.assertFalse(private.intersection(response))
            for value in response.values():
                self.assert_private_fields_absent(value)
        elif isinstance(response, list):
            for value in response:
                self.assert_private_fields_absent(value)

    def test_create_root_nested_reply_and_capture_request_metadata(self):
        status, root = self.request("POST", "/api/comments", {
            "article_key": " article-a ", "nickname": " A ", "email": " a@example.com ", "content": " hello ",
        }, headers={"user-agent": "Browser" * 200, "x-forwarded-for": "203.0.113.99"}, client_ip="2001:db8::1")
        self.assertEqual(status, 201)
        self.assertEqual((root["nickname"], root["content"], root["article_key"]), ("A", "hello", "article-a"))
        self.assertIsNone(root["root_id"])
        saved = self.session.get(ArticleComment, root["id"])
        self.assertEqual(saved.status, 1)
        self.assertEqual(saved.email, "a@example.com")
        self.assertEqual(saved.client_ip, "2001:db8::1")
        self.assertEqual(len(saved.user_agent), 1024)
        self.assertNotIn("Z", root["created_at"])
        self.assertIsNone(datetime.fromisoformat(root["created_at"]).tzinfo)
        parent = root
        for nickname in ("B", "C"):
            status, reply = self.request("POST", "/api/comments", {
                "article_key": "article-a", "nickname": nickname, "content": "reply", "parent_id": parent["id"],
            })
            self.assertEqual(status, 201)
            self.assertEqual(reply["root_id"], root["id"])
            self.assertEqual(reply["parent_id"], parent["id"])
            self.assertEqual(reply["reply_to_nickname"], parent["nickname"])
            self.assert_private_fields_absent(reply)
            parent = reply
        self.assert_private_fields_absent(root)

    def test_root_page_has_30_roots_and_only_three_reply_previews(self):
        roots = []
        for index in range(32):
            root = self.seed_comment(nickname=f"root-{index}")
            roots.append(root)
            for _ in range(8):
                self.seed_comment(parent_id=root.id, root_id=root.id)
        self.seed_comment(article_key="other")
        self.seed_comment(status=0)
        self.seed_comment(deleted_at=datetime(2026, 10, 13))
        self.session.commit()
        self.db.statements.clear()
        status, first = self.request("GET", "/api/comments?article_key=article-a")
        self.assertEqual(status, 200)
        self.assertEqual(len(first["items"]), 30)
        self.assertEqual([item["id"] for item in first["items"]], [root.id for root in reversed(roots[2:])])
        self.assertTrue(first["has_more"])
        self.assertEqual((first["page"], first["total"], first["total_pages"]), (1, 32, 2))
        self.assertEqual(len(self.db.statements), 2)
        # PostgreSQL 查询中的每个回复子查询均包含 LIMIT 4，根查询 LIMIT 31。
        sql = str(self.db.statements[1].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        self.assertEqual(sql.count("LIMIT 4"), 30)
        root_sql = str(self.db.statements[0].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        self.assertIn("LIMIT 31", root_sql)
        self.assertIn("count(*)", root_sql)
        self.assertIn("LEFT OUTER JOIN", root_sql)
        for item in first["items"]:
            self.assertEqual(len(item["replies"]), 3)
            self.assertTrue(item["has_more_replies"])
            self.assertTrue(item["next_reply_cursor"])
        status, second = self.request("GET", '/api/comments?article_key=article-a&page=2')
        self.assertEqual(status, 200)
        self.assertEqual(len(second["items"]), 2)
        self.assertFalse(second["has_more"])
        self.assertIsNone(second["next_cursor"])
        self.assertEqual((second["page"], second["total"], second["total_pages"]), (2, 32, 2))
        status, legacy = self.request("GET", f'/api/comments?article_key=article-a&cursor={first["next_cursor"]}')
        self.assertEqual(status, 200)
        self.assertEqual(legacy["items"], second["items"])
        self.assertIsNone(legacy["page"])
        self.assert_private_fields_absent(first)

    def test_reply_cursor_continues_preview_without_duplicates(self):
        root = self.seed_comment(nickname="root")
        children = []
        for _ in range(9):
            children.append(self.seed_comment(parent_id=root.id, root_id=root.id))
        self.seed_comment(parent_id=root.id, root_id=root.id, status=2)
        self.seed_comment(parent_id=root.id, root_id=root.id, deleted_at=datetime(2026, 10, 13))
        self.session.commit()
        status, first = self.request("GET", "/api/comments?article_key=article-a")
        self.assertEqual(status, 200)
        thread = first["items"][0]
        seen = [item["id"] for item in thread["replies"]]
        cursor = thread["next_reply_cursor"]
        while cursor:
            status, page = self.request("GET", f'/api/comments/{root.id}/replies?page_size=2&cursor={cursor}')
            self.assertEqual(status, 200)
            self.assertLessEqual(len(page["items"]), 2)
            seen.extend(item["id"] for item in page["items"])
            cursor = page["next_cursor"]
            self.assertEqual(page["has_more"], cursor is not None)
            self.assert_private_fields_absent(page)
        self.assertEqual(seen, [record.id for record in children])

    def test_exactly_three_replies_do_not_offer_more(self):
        root = self.seed_comment()
        for _ in range(3):
            self.seed_comment(parent_id=root.id, root_id=root.id)
        self.session.commit()
        status, page = self.request("GET", "/api/comments?article_key=article-a")
        self.assertEqual(status, 200)
        self.assertFalse(page["items"][0]["has_more_replies"])
        self.assertIsNone(page["items"][0]["next_reply_cursor"])

    def test_reply_rejects_cross_article_hidden_and_invalid_roots(self):
        other = self.seed_comment(article_key="other")
        hidden = self.seed_comment(status=0)
        deleted = self.seed_comment(deleted_at=datetime(2026, 10, 13))
        public = self.seed_comment()
        reply = self.seed_comment(parent_id=public.id, root_id=public.id)
        hidden_child = self.seed_comment(parent_id=hidden.id, root_id=hidden.id)
        self.session.commit()
        for parent_id in (other.id, hidden.id, deleted.id, hidden_child.id, 999999):
            status, _ = self.request("POST", "/api/comments", {
                "article_key": "article-a", "nickname": "A", "content": "reply", "parent_id": parent_id,
            })
            self.assertEqual(status, 404)
        for root_id in (hidden.id, deleted.id, reply.id, 999999):
            status, _ = self.request("GET", f"/api/comments/{root_id}/replies")
            self.assertEqual(status, 404)

    def test_invalid_cursors_and_pagination_parameters(self):
        root = self.seed_comment()
        other = self.seed_comment()
        for _ in range(4):
            self.seed_comment(parent_id=root.id, root_id=root.id)
        self.session.commit()
        _, listing = self.request("GET", "/api/comments?article_key=article-a")
        cursor = next(item for item in listing["items"] if item["id"] == root.id)["next_reply_cursor"]
        for url in (
            "/api/comments?article_key=article-a&cursor=broken",
            f"/api/comments?article_key=article-a&cursor={cursor}",
            f"/api/comments/{other.id}/replies?cursor={cursor}",
        ):
            status, _ = self.request("GET", url)
            self.assertEqual(status, 400)
        payload = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        payload["time"] = "2026-10-13T12:00:00Z"
        bad = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        self.assertEqual(self.request("GET", f"/api/comments/{root.id}/replies?cursor={bad}")[0], 400)
        for url in (
            "/api/comments?article_key=article-a&page_size=31", "/api/comments?article_key=",
            "/api/comments?article_key=article-a&page=0",
            f"/api/comments/{root.id}/replies?page_size=31", "/api/comments/0/replies",
            "/api/messages?page=0", "/api/messages?page_size=101",
        ):
            self.assertEqual(self.request("GET", url)[0], 422)
        self.assertEqual(self.request("GET", f"/api/comments?article_key=article-a&page=2&cursor={cursor}")[0], 400)

    def test_message_create_pagination_and_private_fields(self):
        ids = []
        for index in range(5):
            status, record = self.request("POST", "/api/messages", {
                "nickname": "visitor", "email": " ", "content": f"message-{index}",
            }, headers={"user-agent": "Browser"})
            self.assertEqual(status, 201)
            ids.append(record["id"])
            self.assert_private_fields_absent(record)
        self.session.add(GuestbookMessage(nickname="hidden", content="hidden", status=0))
        self.session.add(GuestbookMessage(nickname="deleted", content="deleted", deleted_at=datetime(2026, 10, 13)))
        self.session.commit()
        status, page = self.request("GET", "/api/messages?page_size=2&page=2")
        self.assertEqual(status, 200)
        self.assertEqual((page["total"], page["total_pages"], page["has_more"]), (5, 3, True))
        self.assertEqual([item["id"] for item in page["items"]], list(reversed(ids))[2:4])
        self.assert_private_fields_absent(page)
        status, empty = self.request("GET", "/api/messages?page=99")
        self.assertEqual(status, 200)
        self.assertEqual(empty["items"], [])
        self.assertEqual(empty["total"], 5)
        self.assertFalse(empty["has_more"])

    def test_creation_validation_and_protected_fields(self):
        for endpoint in ("/api/comments", "/api/messages"):
            base = {"nickname": "A", "content": "hello"}
            if endpoint.endswith("comments"):
                base["article_key"] = "article-a"
            for extra in (
                {"nickname": "\u3000"}, {"content": "\u3000"}, {"content": "a" * 2001},
                {"nickname": "a" * 51}, {"email": "bad"}, {"email": "Name <a@example.com>"},
                {"email": "a@@example.com"}, {"email": "a@"}, {"email": "a@example..com"},
                {"email": "a@example.com(comment)"},
                {"id": 1}, {"root_id": 1}, {"status": 0}, {"client_ip": "203.0.113.9"}, {"user_agent": "fake"},
            ):
                with self.subTest(endpoint=endpoint, extra=extra):
                    self.assertEqual(self.request("POST", endpoint, {**base, **extra})[0], 422)

    def test_empty_lists_and_no_delete_or_approval_routes(self):
        status, empty = self.request("GET", "/api/comments?article_key=article-a")
        self.assertEqual(status, 200)
        self.assertEqual(empty["items"], [])
        self.assertFalse(empty["has_more"])
        self.assertEqual(len(self.db.statements), 1)
        self.assertEqual(self.request("DELETE", "/api/messages")[0], 405)
        self.assertEqual(self.request("POST", "/api/comments/1/approve")[0], 404)


if __name__ == "__main__":
    unittest.main()
