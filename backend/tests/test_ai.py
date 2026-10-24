"""Run from backend: .venv/Scripts/python.exe -m unittest discover -s tests -v.

Uses the configured PostgreSQL server in a temporary schema; never uses business tables
or a real model API. Each test drops only its own randomly named schema.
"""
import asyncio
import gzip
import json
import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import httpx
import anyio
from fastapi import FastAPI, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.config import Settings
from db.base import Base
from models import AIConversation, AIMessage
from schemas.ai import AIMessageCreate
from services import ai


class Chunks(httpx.AsyncByteStream):
    def __init__(self, *chunks):
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk


def frame(content=None, finish=None):
    return ai.sse_event({"choices": [{
        "delta": {"content": content} if content is not None else {},
        "finish_reason": finish,
    }]})


class AIConversationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = "test_ai_" + uuid4().hex
        self.settings = Settings(_env_file=".env", ai_api_key="test-only-key", ai_max_history_turns=6)
        self.admin = create_async_engine(self.settings.database_url)
        try:
            async with self.admin.begin() as conn:
                await conn.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        except Exception:
            await self.admin.dispose()
            raise
        self.addAsyncCleanup(self.cleanup_database)
        self.engine = create_async_engine(self.settings.database_url, connect_args={
            "server_settings": {"search_path": f"{self.schema},public"},
        })
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda sync: Base.metadata.create_all(
                sync, tables=[AIConversation.__table__, AIMessage.__table__], checkfirst=False,
            ))
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        self.session_patch = patch.object(ai, "AsyncSessionFactory", self.sessions)
        self.session_patch.start()
        self.addCleanup(self.session_patch.stop)
        self.runtime = AsyncMock()
        self.runtime.acquire_conversation_lock.return_value = "lock-token"

    async def cleanup_database(self):
        if hasattr(self, "engine"):
            await self.engine.dispose()
        async with self.admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        await self.admin.dispose()

    def payload(self, content="你好"):
        return AIMessageCreate(turn_id=uuid4(), content=content)

    async def new(self, payload=None):
        async with self.sessions() as db:
            return await ai.create_conversation(
                db, self.settings, uuid4(), payload or self.payload(),
                client_ip="127.0.0.1", user_agent="test",
            )

    async def complete(self, credentials, message_id, content="回答", status=ai.MESSAGE_COMPLETED):
        capture = ai.StreamCapture()
        capture.feed(frame(content, "stop"))
        await ai.finalize_message(message_id, credentials.conversation_id, self.settings, capture,
                                  status=status, error_code=None)

    async def read(self, credentials, limit=80, before=None):
        async with self.sessions() as db:
            return await ai.list_messages(db, credentials.conversation_id,
                                          credentials.conversation_token, limit, before)

    async def test_first_question_is_atomic_and_no_empty_conversation_api(self):
        with patch.object(ai, "history_context", new=AsyncMock(side_effect=RuntimeError("rollback"))):
            with self.assertRaises(RuntimeError):
                await self.new()
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(AIConversation)), 0)
            self.assertEqual(await db.scalar(select(func.count()).select_from(AIMessage)), 0)
        credentials, message_id, context = await self.new()
        history = await self.read(credentials)
        self.assertEqual([item.role for item in history.items], ["user", "assistant"])
        self.assertEqual(history.items[1].status, ai.MESSAGE_GENERATING)
        self.assertEqual(context[-1], {"role": "user", "content": "你好"})
        async with self.sessions() as db:
            conversation = await db.get(AIConversation, credentials.conversation_id)
            self.assertEqual(conversation.access_token_hash, ai.token_hash(credentials.conversation_token))
        from controller.ai import router
        app = FastAPI()
        app.include_router(router)
        self.assertTrue(app.openapi()["paths"]["/api/ai/conversations"]["post"]["requestBody"]["required"])

    async def test_context_contains_six_complete_pairs_and_current_question(self):
        credentials, message_id, _ = await self.new(self.payload("Q0"))
        await self.complete(credentials, message_id, "A0")
        for index in range(1, 10):
            message_id, _ = await ai.prepare_turn(credentials.conversation_id,
                credentials.conversation_token, self.payload(f"Q{index}"), self.settings)
            status = {4: ai.MESSAGE_STOPPED, 7: ai.MESSAGE_FAILED}.get(index, ai.MESSAGE_COMPLETED)
            await self.complete(credentials, message_id, f"A{index}", status)
        async with self.sessions() as db:
            deleted = (await db.execute(select(AIMessage).where(
                AIMessage.conversation_id == credentials.conversation_id,
                AIMessage.content == "A8",
            ))).scalar_one()
            deleted.deleted_at = ai.now_local()
            await db.commit()
        _, context = await ai.prepare_turn(credentials.conversation_id, credentials.conversation_token,
                                            self.payload("current"), self.settings)
        indices = [1, 2, 3, 5, 6, 9]
        expected = [{"role": "system", "content": self.settings.ai_system_prompt}]
        for index in indices:
            expected.extend([{"role": "user", "content": f"Q{index}"},
                             {"role": "assistant", "content": f"A{index}"}])
        expected.append({"role": "user", "content": "current"})
        self.assertEqual(context, expected)
        # Context selection never removes history.
        history = await self.read(credentials)
        self.assertEqual(len(history.items), 21)

    async def test_history_pagination_expiration_close_and_invalid_token(self):
        credentials, message_id, _ = await self.new()
        await self.complete(credentials, message_id)
        payload = self.payload("第二条")
        second_id, _ = await ai.prepare_turn(credentials.conversation_id,
            credentials.conversation_token, payload, self.settings)
        await self.complete(credentials, second_id)
        page = await self.read(credentials, limit=2)
        self.assertTrue(page.has_more)
        earlier = await self.read(credentials, limit=2, before=page.next_before_sequence)
        self.assertFalse(earlier.has_more)
        self.assertEqual([item.sequence_no for item in earlier.items + page.items], [1, 2, 3, 4])
        with self.assertRaises(HTTPException) as error:
            await ai.prepare_turn(credentials.conversation_id, credentials.conversation_token,
                                  payload, self.settings)
        self.assertEqual(error.exception.status_code, 409)
        async with self.sessions() as db:
            conversation = await db.get(AIConversation, credentials.conversation_id)
            past = ai.now_local() - timedelta(days=2)
            conversation.created_at = past
            conversation.last_message_at = past
            conversation.expires_at = past + timedelta(hours=24)
            await db.commit()
        self.assertFalse((await self.read(credentials)).can_continue)
        with self.assertRaises(HTTPException) as error:
            await ai.prepare_turn(credentials.conversation_id, credentials.conversation_token,
                                  self.payload(), self.settings)
        self.assertEqual(error.exception.status_code, 410)
        self.assertEqual(len((await self.read(credentials)).items), 4)
        async with self.sessions() as db:
            await ai.close_conversation(db, credentials.conversation_id, credentials.conversation_token)
            await ai.close_conversation(db, credentials.conversation_id, credentials.conversation_token)
        with self.assertRaises(HTTPException) as error:
            async with self.sessions() as db:
                await ai.list_messages(db, credentials.conversation_id, "invalid-token", 80, None)
        self.assertEqual(error.exception.status_code, 404)

    async def test_stream_completion_is_sent_only_after_commit(self):
        client = httpx.AsyncClient()
        response = httpx.Response(200, stream=Chunks(frame("你"), frame("好", "stop"), b"data: [DONE]\n\n"))
        with patch.object(ai, "open_upstream", new=AsyncMock(return_value=(client, response))):
            stream = await ai.create_chat_stream(None, None, self.payload(), self.settings, self.runtime)
            first = json.loads((await anext(stream.body_iterator)).decode()[6:])
            credentials = ai.AIConversationCreated(**{k: first[k] for k in
                ("conversation_id", "conversation_token", "expires_at")})
            self.assertEqual((await self.read(credentials)).items[-1].status, ai.MESSAGE_GENERATING)
            output = []
            async for chunk in stream.body_iterator:
                output.append(chunk)
                if b'"type": "complete"' in chunk:
                    history = await self.read(credentials)
                    self.assertEqual(history.items[-1].content, "你好")
                    self.assertEqual(history.items[-1].status, ai.MESSAGE_COMPLETED)
            self.assertEqual(b"".join(output).count(b"[DONE]"), 1)
            self.runtime.release_conversation_lock.assert_awaited_once()

    async def test_upstream_failure_preserves_question_and_issues_credentials(self):
        with patch.object(ai, "open_upstream", new=AsyncMock(side_effect=HTTPException(503, "测试失败"))):
            stream = await ai.create_chat_stream(None, None, self.payload(), self.settings, self.runtime)
            frames = [chunk async for chunk in stream.body_iterator]
        first = json.loads(frames[0].decode()[6:])
        credentials = ai.AIConversationCreated(**{k: first[k] for k in
            ("conversation_id", "conversation_token", "expires_at")})
        history = await self.read(credentials)
        self.assertEqual(history.items[0].content, "你好")
        self.assertEqual(history.items[1].status, ai.MESSAGE_FAILED)
        self.assertIn(b'"type": "error"', b"".join(frames))

    async def test_disconnect_saves_partial_answer_and_releases_lock(self):
        credentials, message_id, _ = await self.new()
        await self.complete(credentials, message_id)
        client = httpx.AsyncClient()
        class Interrupted(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield frame("部分回答")
                raise asyncio.CancelledError
        response = httpx.Response(200, stream=Interrupted())
        with patch.object(ai, "open_upstream", new=AsyncMock(return_value=(client, response))):
            stream = await ai.create_chat_stream(credentials.conversation_id, credentials.conversation_token,
                                                 self.payload("下一题"), self.settings, self.runtime)
            with self.assertRaises(asyncio.CancelledError):
                async for _ in stream.body_iterator:
                    pass
        history = await self.read(credentials)
        self.assertEqual(history.items[-1].content, "部分回答")
        self.assertEqual(history.items[-1].status, ai.MESSAGE_STOPPED)
        self.runtime.release_conversation_lock.assert_awaited_once()

    async def test_http_contract_create_continue_restore_close(self):
        from controller import ai as controller
        from db.session import get_db
        from services.ai_runtime import get_ai_runtime
        app = FastAPI()
        app.include_router(controller.router)
        async def db_dependency():
            async with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = db_dependency
        app.dependency_overrides[get_ai_runtime] = lambda: self.runtime
        async def upstream(*args):
            return httpx.AsyncClient(), httpx.Response(200, stream=Chunks(frame("回答", "stop"), b"data: [DONE]\n\n"))
        with patch.object(controller, "get_settings", return_value=self.settings), \
             patch.object(ai, "open_upstream", side_effect=upstream):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                empty = await client.post("/api/ai/conversations", json={})
                self.assertEqual(empty.status_code, 422)
                status = await client.get("/api/ai/status")
                self.assertEqual(status.json()["max_history_turns"], 6)
                initial_payload = self.payload()
                creation_token = uuid4().hex + uuid4().hex
                first = await client.post("/api/ai/conversations", json={
                    **initial_payload.model_dump(mode="json"), "creation_token": creation_token,
                })
                self.assertEqual(first.status_code, 201)
                self.assertIn("no-store", first.headers["cache-control"])
                credentials = json.loads(first.text.splitlines()[0][6:])
                self.assertEqual(credentials["conversation_id"], str(initial_payload.turn_id))
                self.assertEqual(credentials["conversation_token"], creation_token)
                url = "/api/ai/conversations/" + credentials["conversation_id"]
                headers = {"X-Conversation-Token": credentials["conversation_token"]}
                second = await client.post(url + "/messages", headers=headers,
                                           json=self.payload("后续").model_dump(mode="json"))
                self.assertEqual(second.status_code, 200)
                history = await client.get(url + "/messages", headers=headers)
                self.assertEqual(len(history.json()["items"]), 4)
                self.assertTrue(history.json()["can_continue"])
                self.assertEqual(history.headers["cache-control"], "no-store")
                closed = await client.post(url + "/close", headers=headers)
                self.assertEqual(closed.status_code, 204)
                history = await client.get(url + "/messages", headers=headers)
                self.assertEqual(len(history.json()["items"]), 4)
                self.assertFalse(history.json()["can_continue"])
                rejected = await client.post(url + "/messages", headers=headers,
                                             json=self.payload().model_dump(mode="json"))
                self.assertEqual(rejected.status_code, 410)

    async def test_starlette_disconnect_cancellation_shields_database_save(self):
        credentials, message_id, _ = await self.new()
        await self.complete(credentials, message_id)
        received_piece = anyio.Event()
        class Waiting(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield frame("断流前的内容")
                await anyio.sleep_forever()
        client = httpx.AsyncClient()
        response = httpx.Response(200, stream=Waiting())
        async def send(message):
            if message["type"] == "http.response.body" and message.get("body"):
                received_piece.set()
        async def receive():
            await received_piece.wait()
            return {"type": "http.disconnect"}
        with patch.object(ai, "open_upstream", new=AsyncMock(return_value=(client, response))):
            stream = await ai.create_chat_stream(credentials.conversation_id, credentials.conversation_token,
                self.payload("模拟刷新"), self.settings, self.runtime)
            await stream({"type": "http", "asgi": {"spec_version": "2.3"}}, receive, send)
        history = await self.read(credentials)
        self.assertEqual(history.items[-1].status, ai.MESSAGE_STOPPED)
        self.assertEqual(history.items[-1].content, "断流前的内容")
        self.runtime.release_conversation_lock.assert_awaited_once()

    async def test_asgi24_send_failure_closes_stream_and_saves_partial_answer(self):
        from starlette.requests import ClientDisconnect
        credentials, message_id, _ = await self.new()
        await self.complete(credentials, message_id)
        response = httpx.Response(200, stream=Chunks(frame("发送中断的内容")))
        async def send(message):
            if message["type"] == "http.response.body" and message.get("body"):
                raise OSError("client closed")
        with patch.object(ai, "open_upstream", new=AsyncMock(return_value=(httpx.AsyncClient(), response))):
            stream = await ai.create_chat_stream(credentials.conversation_id, credentials.conversation_token,
                self.payload("断开连接"), self.settings, self.runtime)
            with self.assertRaises(ClientDisconnect):
                await stream({"type": "http", "asgi": {"spec_version": "2.4"}}, AsyncMock(), send)
        history = await self.read(credentials)
        self.assertEqual(history.items[-1].status, ai.MESSAGE_STOPPED)
        self.assertEqual(history.items[-1].content, "发送中断的内容")
        self.runtime.release_conversation_lock.assert_awaited_once()

    async def test_disconnect_before_response_headers_finalizes_first_turn(self):
        from starlette.requests import ClientDisconnect
        async def send(message):
            raise OSError("closed before headers")
        stream = await ai.create_chat_stream(None, None, self.payload(), self.settings, self.runtime)
        with self.assertRaises(ClientDisconnect):
            await stream({"type": "http", "asgi": {"spec_version": "2.4"}}, AsyncMock(), send)
        async with self.sessions() as db:
            messages = (await db.scalars(select(AIMessage).order_by(AIMessage.sequence_no))).all()
        self.assertEqual(messages[-1].status, ai.MESSAGE_STOPPED)
        self.assertIsNotNone(messages[-1].completed_at)
        self.runtime.release_conversation_lock.assert_awaited_once()

    async def test_compressed_upstream_is_decoded_before_sse_capture(self):
        content = frame("压缩后的回答", "stop") + b"data: [DONE]\n\n"
        response = httpx.Response(200, headers={"Content-Encoding": "gzip"},
                                  stream=Chunks(gzip.compress(content)))
        with patch.object(ai, "open_upstream", new=AsyncMock(return_value=(httpx.AsyncClient(), response))):
            stream = await ai.create_chat_stream(None, None, self.payload(), self.settings, self.runtime)
            frames = [chunk async for chunk in stream.body_iterator]
        first = json.loads(frames[0].decode()[6:])
        credentials = ai.AIConversationCreated(**{k: first[k] for k in
            ("conversation_id", "conversation_token", "expires_at")})
        history = await self.read(credentials)
        self.assertEqual(history.items[-1].content, "压缩后的回答")
        self.assertEqual(history.items[-1].status, ai.MESSAGE_COMPLETED)

    async def test_initial_creation_retry_uses_same_identity_and_authenticates_token(self):
        payload = self.payload("创建过程中刷新")
        creation_token = uuid4().hex + uuid4().hex
        response = httpx.Response(200, stream=Chunks(frame("恢复的回答", "stop"), b"data: [DONE]\n\n"))
        with patch.object(ai, "open_upstream", new=AsyncMock(return_value=(httpx.AsyncClient(), response))):
            stream = await ai.create_chat_stream(None, creation_token, payload, self.settings, self.runtime)
            frames = [chunk async for chunk in stream.body_iterator]
        first = json.loads(frames[0].decode()[6:])
        self.assertEqual(first["conversation_id"], str(payload.turn_id))
        self.assertEqual(first["conversation_token"], creation_token)
        # The browser can restore using credentials saved before receiving any response.
        async with self.sessions() as db:
            history = await ai.list_messages(db, payload.turn_id, creation_token, 80, None)
        self.assertEqual(history.items[-1].content, "恢复的回答")
        with self.assertRaises(HTTPException) as error:
            await ai.create_chat_stream(None, creation_token, payload, self.settings, self.runtime)
        self.assertEqual(error.exception.status_code, 409)
        with self.assertRaises(HTTPException) as error:
            await ai.create_chat_stream(None, "0" * 64, payload, self.settings, self.runtime)
        self.assertEqual(error.exception.status_code, 404)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(AIConversation)), 1)
            self.assertEqual(await db.scalar(select(func.count()).select_from(AIMessage)), 2)


class UpstreamResourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_while_waiting_headers_closes_upstream_client(self):
        client = AsyncMock()
        client.build_request = lambda *args, **kwargs: httpx.Request("POST", "http://test")
        client.send.side_effect = asyncio.CancelledError
        with patch.object(ai.httpx, "AsyncClient", return_value=client):
            with self.assertRaises(asyncio.CancelledError):
                await ai.open_upstream([], Settings(_env_file=None))
        client.aclose.assert_awaited_once()

    async def test_error_body_read_failure_closes_response_and_client(self):
        client = AsyncMock()
        client.build_request = lambda *args, **kwargs: httpx.Request("POST", "http://test")
        response = AsyncMock(status_code=502)
        response.aread.side_effect = httpx.ReadError("connection reset")
        client.send.return_value = response
        with patch.object(ai.httpx, "AsyncClient", return_value=client):
            with self.assertRaises(httpx.ReadError):
                await ai.open_upstream([], Settings(_env_file=None))
        response.aclose.assert_awaited_once()
        client.aclose.assert_awaited_once()


class StreamCaptureTests(unittest.TestCase):
    def test_utf8_chunk_boundaries_usage_and_final_unterminated_line(self):
        capture = ai.StreamCapture()
        data = frame("你好", "stop") + ai.sse_event({"usage": {"prompt_tokens": 12, "completion_tokens": 3}})
        data += b"data: [DONE]"
        for byte in data:
            capture.feed(bytes([byte]))
        capture.feed(b"", final=True)
        self.assertTrue(capture.done)
        self.assertEqual(capture.text(), "你好")
        self.assertEqual((capture.prompt_tokens, capture.completion_tokens), (12, 3))


if __name__ == "__main__":
    unittest.main()
