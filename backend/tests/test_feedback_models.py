"""离线验证模型约束；不连接 PostgreSQL、Redis 或启动应用。"""

import unittest

from sqlalchemy import create_engine, delete, event, insert, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateIndex, CreateTable

from app.db.base import Base
from app.models import ArticleComment, GuestbookMessage


class FeedbackModelTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")

        @event.listens_for(self.engine, "connect")
        def configure(connection, _):
            connection.execute("PRAGMA foreign_keys = ON")
            connection.create_function("char_length", 1, lambda value: len(value))
            connection.create_function("btrim", 2, lambda value, chars: value.strip(chars))

        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)

    def comment(self, **overrides):
        values = {"article_key": "be17033b", "nickname": "访客", "content": "评论内容"}
        values.update(overrides)
        with self.engine.begin() as connection:
            result = connection.execute(insert(ArticleComment).values(**values))
            return result.inserted_primary_key[0]

    def message(self, **overrides):
        values = {"nickname": "访客", "content": "留言内容"}
        values.update(overrides)
        with self.engine.begin() as connection:
            result = connection.execute(insert(GuestbookMessage).values(**values))
            return result.inserted_primary_key[0]

    def test_auto_increment_ids_and_nested_replies(self):
        root = self.comment()
        reply = self.comment(parent_id=root, root_id=root)
        nested = self.comment(parent_id=reply, root_id=root)
        message = self.message()
        for value in (root, reply, nested, message):
            self.assertIsInstance(value, int)
            self.assertGreater(value, 0)
        self.assertLess(root, reply)
        self.assertLess(reply, nested)
        self.assertLess(message, self.message())

    def test_request_metadata_is_optional_and_preserved(self):
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"
        for model, create in ((ArticleComment, self.comment), (GuestbookMessage, self.message)):
            for client_ip in (None, "192.0.2.1", "2001:db8::1", "::ffff:192.0.2.1"):
                with self.subTest(table=model.__tablename__, client_ip=client_ip):
                    values = {} if client_ip is None else {"client_ip": client_ip, "user_agent": user_agent}
                    record_id = create(**values)
                    with self.engine.connect() as connection:
                        row = connection.execute(
                            select(model.client_ip, model.user_agent).where(model.id == record_id)
                        ).one()
                    self.assertEqual(row.client_ip, client_ip)
                    self.assertEqual(row.user_agent, None if client_ip is None else user_agent)

    def test_blank_content_length_and_status_constraints(self):
        for create in (self.comment, self.message):
            create(content="文" * 2000)
            for values in (
                {"nickname": " \t\n\r"},
                {"content": " \t\n\r"},
                {"content": "文" * 2001},
                {"status": 3},
                {"content": None},
            ):
                with self.subTest(create=create.__name__, values=values):
                    with self.assertRaises(IntegrityError):
                        create(**values)

    def test_reply_requires_both_links_and_existing_comments(self):
        root = self.comment()
        for values in (
            {"parent_id": root},
            {"root_id": root},
            {"parent_id": 999999, "root_id": root},
            {"parent_id": root, "root_id": 999999},
            {"article_key": " \t\n"},
        ):
            with self.subTest(values=values), self.assertRaises(IntegrityError):
                self.comment(**values)

    def test_reply_cannot_cross_articles_or_reference_itself(self):
        root = self.comment()
        other_root = self.comment(article_key="other")
        with self.assertRaises(IntegrityError):
            self.comment(article_key="other", parent_id=root, root_id=other_root)
        with self.assertRaises(IntegrityError):
            self.comment(parent_id=root, root_id=other_root)
        own_id = 999999
        with self.assertRaises(IntegrityError):
            self.comment(id=own_id, parent_id=own_id, root_id=own_id)

    def test_referenced_comment_cannot_be_physically_deleted(self):
        root = self.comment()
        self.comment(parent_id=root, root_id=root)
        with self.assertRaises(IntegrityError), self.engine.begin() as connection:
            connection.execute(delete(ArticleComment).where(ArticleComment.id == root))

    def test_postgresql_schema_compiles_and_is_registered(self):
        self.assertIn("article_comments", Base.metadata.tables)
        self.assertIn("guestbook_messages", Base.metadata.tables)
        dialect = postgresql.dialect()
        for model in (ArticleComment, GuestbookMessage):
            ddl = str(CreateTable(model.__table__).compile(dialect=dialect))
            self.assertIn("id BIGINT GENERATED ALWAYS AS IDENTITY", ddl)
            self.assertNotIn("UUID", ddl)
            for name in ("created_at", "updated_at", "deleted_at"):
                self.assertIn(f"{name} TIMESTAMP WITHOUT TIME ZONE", ddl)
                self.assertFalse(model.__table__.c[name].type.timezone)
            self.assertNotIn("TIMESTAMP WITH TIME ZONE", ddl)
            self.assertIn("status SMALLINT DEFAULT 1", ddl)
            self.assertIn("nickname VARCHAR(50)", ddl)
            self.assertIn("client_ip VARCHAR(45)", ddl)
            self.assertIn("user_agent VARCHAR(1024)", ddl)
            self.assertTrue(model.__table__.c.client_ip.nullable)
            self.assertTrue(model.__table__.c.user_agent.nullable)
            for index in model.__table__.indexes:
                sql = str(CreateIndex(index).compile(dialect=dialect))
                if "public" in index.name:
                    self.assertIn("WHERE status = 1 AND deleted_at IS NULL", sql)
        self.assertNotIn("parent_id", GuestbookMessage.__table__.columns)
        self.assertNotIn("root_id", GuestbookMessage.__table__.columns)
        comment_ddl = str(CreateTable(ArticleComment.__table__).compile(dialect=dialect))
        self.assertIn("parent_id BIGINT", comment_ddl)
        self.assertIn("root_id BIGINT", comment_ddl)


if __name__ == "__main__":
    unittest.main()
