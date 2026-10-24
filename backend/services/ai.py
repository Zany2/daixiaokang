import asyncio
import codecs
import hashlib
import hmac
import json
import secrets
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import httpx
import anyio
from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from starlette.responses import StreamingResponse

from core.config import Settings
from core.logging import get_logger
from db.session import AsyncSessionFactory
from models import AIConversation, AIMessage
from schemas.ai import (
    AIConversationCreated,
    AIMessageCreate,
    AIMessagePage,
    AIMessagePublic,
)
from services.ai_runtime import AIRuntime

logger = get_logger(__name__)

CONVERSATION_ACTIVE = 1
CONVERSATION_CLOSED = 2
MESSAGE_GENERATING = 1
MESSAGE_COMPLETED = 2
MESSAGE_STOPPED = 3
MESSAGE_FAILED = 4


def now_local() -> datetime:
    """项目数据库统一使用不带时区的服务器本地时间。"""
    return datetime.now()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def ensure_ai_configured(settings: Settings) -> None:
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI 服务当前未启用")
    if not settings.ai_api_key.get_secret_value().strip():
        raise HTTPException(status_code=503, detail="AI 服务尚未完成配置")


async def find_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    conversation_token: str,
    *,
    require_active: bool,
    for_update: bool = False,
) -> AIConversation:
    statement = select(AIConversation).where(
        AIConversation.id == conversation_id,
        AIConversation.deleted_at.is_(None),
    )
    if for_update:
        statement = statement.with_for_update()
    conversation = (await db.execute(statement)).scalar_one_or_none()
    supplied_hash = token_hash(conversation_token)
    if conversation is None or not hmac.compare_digest(
        conversation.access_token_hash,
        supplied_hash,
    ):
        raise HTTPException(status_code=404, detail="对话不存在或访问凭证无效")

    if require_active:
        if conversation.status != CONVERSATION_ACTIVE:
            raise HTTPException(status_code=410, detail="当前对话已经结束，请开始新对话")
        if conversation.expires_at <= now_local():
            ended_at = now_local()
            conversation.status = CONVERSATION_CLOSED
            conversation.closed_at = ended_at
            conversation.updated_at = ended_at
            await db.commit()
            raise HTTPException(status_code=410, detail="当前对话已经过期，请开始新对话")
    return conversation


async def create_conversation(
    db: AsyncSession,
    settings: Settings,
    conversation_id: UUID,
    payload: AIMessageCreate,
    *,
    client_ip: str | None,
    user_agent: str | None,
    creation_token: str | None = None,
) -> tuple[AIConversationCreated, int, list[dict[str, str]]]:
    ensure_ai_configured(settings)
    created_at = now_local()
    token = creation_token or secrets.token_urlsafe(32)
    conversation = AIConversation(
        id=conversation_id,
        access_token_hash=token_hash(token),
        model=settings.ai_model,
        system_prompt_version=settings.ai_system_prompt_version,
        status=CONVERSATION_ACTIVE,
        client_ip=client_ip,
        user_agent=user_agent[:1024] if user_agent else None,
        last_message_at=created_at,
        expires_at=created_at + timedelta(hours=settings.ai_conversation_ttl_hours),
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(conversation)
    await db.flush()
    assistant_message_id, context = await append_turn(db, conversation, payload, settings)
    await db.commit()
    credentials = AIConversationCreated(
        conversation_id=conversation.id,
        conversation_token=token,
        expires_at=conversation.expires_at,
    )
    return credentials, assistant_message_id, context


async def list_messages(
    db: AsyncSession,
    conversation_id: UUID,
    conversation_token: str,
    limit: int,
    before_sequence: int | None,
) -> AIMessagePage:
    conversation = await find_conversation(
        db,
        conversation_id,
        conversation_token,
        require_active=False,
    )
    statement = select(AIMessage).where(
        AIMessage.conversation_id == conversation_id,
        AIMessage.deleted_at.is_(None),
    )
    if before_sequence is not None:
        statement = statement.where(AIMessage.sequence_no < before_sequence)
    rows = list((await db.execute(
        statement.order_by(AIMessage.sequence_no.desc()).limit(limit + 1)
    )).scalars())
    has_more = len(rows) > limit
    selected = list(reversed(rows[:limit]))
    return AIMessagePage(
        items=[AIMessagePublic.model_validate(message) for message in selected],
        has_more=has_more,
        next_before_sequence=selected[0].sequence_no if has_more and selected else None,
        conversation_status=conversation.status,
        can_continue=(
            conversation.status == CONVERSATION_ACTIVE
            and conversation.expires_at > now_local()
        ),
        expires_at=conversation.expires_at,
    )


async def close_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    conversation_token: str,
) -> None:
    conversation = await find_conversation(
        db,
        conversation_id,
        conversation_token,
        require_active=False,
        for_update=True,
    )
    if conversation.status == CONVERSATION_CLOSED:
        return
    closed_at = now_local()
    conversation.status = CONVERSATION_CLOSED
    conversation.closed_at = closed_at
    conversation.updated_at = closed_at
    await db.commit()


async def prepare_turn(
    conversation_id: UUID,
    conversation_token: str,
    payload: AIMessageCreate,
    settings: Settings,
) -> tuple[int, list[dict[str, str]]]:
    async with AsyncSessionFactory() as db:
        conversation = await find_conversation(
            db,
            conversation_id,
            conversation_token,
            require_active=True,
            for_update=True,
        )
        result = await append_turn(db, conversation, payload, settings)
        await db.commit()
        return result


async def history_context(
    db: AsyncSession,
    conversation_id: UUID,
    payload: AIMessageCreate,
    settings: Settings,
) -> list[dict[str, str]]:
    # 按 turn_id 配对后再截取轮次，失败、停止、生成中或软删除的问答不作为完整上下文。
    question, answer = aliased(AIMessage), aliased(AIMessage)
    rows = (await db.execute(select(question.content, answer.content).join(
        answer,
        and_(
            answer.conversation_id == question.conversation_id,
            answer.turn_id == question.turn_id,
            answer.role == "assistant",
        ),
    ).where(
        question.conversation_id == conversation_id,
        question.turn_id != payload.turn_id,
        question.role == "user",
        question.status == MESSAGE_COMPLETED,
        answer.status == MESSAGE_COMPLETED,
        question.deleted_at.is_(None),
        answer.deleted_at.is_(None),
        question.content != "",
        answer.content != "",
    ).order_by(question.sequence_no.desc()).limit(settings.ai_max_history_turns))).all()
    context = [{"role": "system", "content": settings.ai_system_prompt}]
    for user_content, assistant_content in reversed(rows):
        context.extend([
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": assistant_content},
        ])
    context.append({"role": "user", "content": payload.content})
    return context


async def append_turn(
    db: AsyncSession,
    conversation: AIConversation,
    payload: AIMessageCreate,
    settings: Settings,
) -> tuple[int, list[dict[str, str]]]:
    conversation_id = conversation.id
    duplicate = (await db.execute(select(AIMessage.id).where(
        AIMessage.conversation_id == conversation_id,
        AIMessage.turn_id == payload.turn_id,
    ).limit(1))).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="这条问题已经提交，请勿重复发送")
    generating = (await db.execute(select(AIMessage.id).where(
        AIMessage.conversation_id == conversation_id,
        AIMessage.status == MESSAGE_GENERATING,
    ).limit(1))).scalar_one_or_none()
    if generating is not None:
        raise HTTPException(status_code=409, detail="上一条回答正在保存，请稍后再试")
    last_sequence = (await db.execute(select(func.max(AIMessage.sequence_no)).where(
        AIMessage.conversation_id == conversation_id,
    ))).scalar_one() or 0
    timestamp = now_local()
    user_message = AIMessage(
        conversation_id=conversation_id, turn_id=payload.turn_id,
        sequence_no=last_sequence + 1, role="user", content=payload.content,
        status=MESSAGE_COMPLETED, completed_at=timestamp,
        created_at=timestamp, updated_at=timestamp,
    )
    assistant_message = AIMessage(
        conversation_id=conversation_id, turn_id=payload.turn_id,
        sequence_no=last_sequence + 2, role="assistant", content="",
        status=MESSAGE_GENERATING, model=settings.ai_model,
        created_at=timestamp, updated_at=timestamp,
    )
    db.add_all([user_message, assistant_message])
    if conversation.title is None:
        conversation.title = payload.content[:200]
    conversation.last_message_at = timestamp
    conversation.expires_at = timestamp + timedelta(hours=settings.ai_conversation_ttl_hours)
    conversation.updated_at = timestamp
    await db.flush()
    context = await history_context(db, conversation_id, payload, settings)
    return assistant_message.id, context


def upstream_error_message(raw: bytes) -> str:
    try:
        payload = json.loads(raw)
        message = payload.get("error", {}).get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()[:300]
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        pass
    return "上游模型服务返回错误"


async def open_upstream(
    messages: list[dict[str, str]],
    settings: Settings,
) -> tuple[httpx.AsyncClient, httpx.Response]:
    timeout = httpx.Timeout(
        settings.ai_request_timeout_seconds,
        connect=min(10.0, settings.ai_request_timeout_seconds),
    )
    client = httpx.AsyncClient(timeout=timeout)
    request = client.build_request(
        "POST",
        f"{settings.ai_api_base}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.ai_api_key.get_secret_value().strip()}",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.ai_model,
            "messages": messages,
            "stream": True,
            "temperature": settings.ai_temperature,
            "max_tokens": settings.ai_max_tokens,
        },
    )
    try:
        response = await client.send(request, stream=True)
    except httpx.TimeoutException as exc:
        await client.aclose()
        raise HTTPException(status_code=504, detail="模型响应超时，请稍后重试") from exc
    except httpx.HTTPError as exc:
        await client.aclose()
        logger.warning("ai.upstream_unavailable", extra={"error_code": type(exc).__name__})
        raise HTTPException(status_code=502, detail="暂时无法连接模型服务") from exc
    except BaseException:
        # 等待响应头期间断流时，调用方尚未取得 client，必须在这里关闭。
        with anyio.CancelScope(shield=True):
            await client.aclose()
        raise

    if response.status_code >= 400:
        try:
            raw = await response.aread()
        finally:
            with anyio.CancelScope(shield=True):
                try:
                    await response.aclose()
                finally:
                    await client.aclose()
        logger.warning("ai.upstream_error", extra={"status_code": response.status_code})
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="模型服务繁忙，请稍后重试")
        if response.status_code in {401, 402, 403}:
            raise HTTPException(status_code=503, detail="AI 服务配置暂时不可用")
        raise HTTPException(status_code=502, detail=upstream_error_message(raw))
    return client, response


class StreamCapture:
    def __init__(self):
        self.decoder = codecs.getincrementaldecoder("utf-8")()
        self.buffer = ""
        self.content: list[str] = []
        self.finish_reason: str | None = None
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.done = False

    def feed(self, chunk: bytes, *, final: bool = False) -> list[dict]:
        self.buffer += self.decoder.decode(chunk, final=final)
        lines = self.buffer.split("\n")
        self.buffer = "" if final else lines.pop()
        events = []
        for line in lines:
            line = line.strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                self.done = True
                continue
            if not data:
                continue
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            if payload.get("error"):
                raise HTTPException(status_code=502, detail="模型生成回答时发生错误")
            choice = (payload.get("choices") or [{}])[0]
            delta = choice.get("delta") or choice.get("message") or {}
            piece = delta.get("content")
            if isinstance(piece, str) and piece:
                self.content.append(piece)
            finish_reason = choice.get("finish_reason")
            if finish_reason:
                self.finish_reason = str(finish_reason)[:50]
            usage = payload.get("usage") or {}
            self.prompt_tokens = max(self.prompt_tokens, int(usage.get("prompt_tokens") or 0))
            self.completion_tokens = max(
                self.completion_tokens,
                int(usage.get("completion_tokens") or 0),
            )
            # 仅转发模型输出；会话、完成和错误事件由本站后端产生。
            events.append({key: payload[key] for key in ("choices", "usage") if key in payload})
        return events

    def text(self) -> str:
        return "".join(self.content)


async def finalize_message(
    assistant_message_id: int,
    conversation_id: UUID,
    settings: Settings,
    capture: StreamCapture,
    *,
    status: int,
    error_code: str | None,
) -> None:
    completed_at = now_local()
    async with AsyncSessionFactory() as db:
        # 与结束会话、追加问题使用相同的会话行锁，避免生命周期时间被并发覆盖。
        conversation = (await db.execute(select(AIConversation).where(
            AIConversation.id == conversation_id,
        ).with_for_update())).scalar_one_or_none()
        message = await db.get(AIMessage, assistant_message_id)
        if message is not None and message.status == MESSAGE_GENERATING:
            message.content = capture.text()
            message.status = status
            message.finish_reason = capture.finish_reason
            message.prompt_tokens = capture.prompt_tokens
            message.completion_tokens = capture.completion_tokens
            message.error_code = error_code[:100] if error_code else None
            message.completed_at = completed_at
            message.updated_at = completed_at
        if conversation is not None:
            conversation.last_message_at = max(conversation.last_message_at, completed_at)
            conversation.expires_at = max(conversation.expires_at, completed_at + timedelta(
                hours=settings.ai_conversation_ttl_hours
            ))
            conversation.updated_at = max(conversation.updated_at, completed_at)
        await db.commit()


def sse_event(payload: dict) -> bytes:
    return ("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n").encode()


_cleanup_tasks: set[asyncio.Task] = set()


class PersistedStreamingResponse(StreamingResponse):
    def __init__(self, content, *, close_unstarted, **kwargs):
        super().__init__(content, **kwargs)
        self.close_unstarted = close_unstarted

    async def stream_response(self, send) -> None:
        try:
            await super().stream_response(send)
        finally:
            # ASGI 2.4 的 send 失败不会自动关闭迭代器；主动关闭以立即触发断流落库。
            with anyio.CancelScope(shield=True):
                try:
                    await self.body_iterator.aclose()
                finally:
                    # 发送响应头失败时，未启动的异步生成器不会执行 finally。
                    await self.close_unstarted()


async def create_chat_stream(
    conversation_id: UUID | None,
    conversation_token: str | None,
    payload: AIMessageCreate,
    settings: Settings,
    runtime: AIRuntime,
    *,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> StreamingResponse:
    ensure_ai_configured(settings)
    if len(payload.content) > settings.ai_max_input_chars:
        raise HTTPException(
            status_code=422, detail=f"问题内容不能超过 {settings.ai_max_input_chars} 个字符",
        )
    is_new = conversation_id is None
    # 首次创建的稳定标识及随机凭证由浏览器预先保存，刷新后可识别同一个请求。
    conversation_id = conversation_id or (payload.turn_id if conversation_token else uuid4())
    lock_token = await runtime.acquire_conversation_lock(conversation_id)
    credentials = None
    try:
        if is_new:
            async with AsyncSessionFactory() as db:
                if conversation_token and await db.get(AIConversation, conversation_id) is not None:
                    await find_conversation(db, conversation_id, conversation_token, require_active=False)
                    raise HTTPException(status_code=409, detail="首条问题已提交，请恢复当前对话")
                credentials, assistant_message_id, messages = await create_conversation(
                    db, settings, conversation_id, payload,
                    client_ip=client_ip, user_agent=user_agent,
                    creation_token=conversation_token,
                )
        else:
            assistant_message_id, messages = await prepare_turn(
                conversation_id, conversation_token or "", payload, settings,
            )
    except BaseException:
        with anyio.CancelScope(shield=True):
            await runtime.release_conversation_lock(conversation_id, lock_token)
        raise

    capture = StreamCapture()
    stream_started = False

    async def close_unstarted() -> None:
        if stream_started:
            return
        try:
            await finalize_message(
                assistant_message_id, conversation_id, settings, capture,
                status=MESSAGE_STOPPED, error_code="client_disconnected",
            )
        finally:
            await runtime.release_conversation_lock(conversation_id, lock_token)

    async def stream_body() -> AsyncIterator[bytes]:
        nonlocal stream_started
        stream_started = True
        status = MESSAGE_FAILED
        error_code: str | None = "stream_incomplete"
        cancelled = False
        client = response = None
        error_message = "模型回答未正常结束，请重新提问"
        try:
            # 先把已提交的会话凭证交给浏览器，再等待模型首字；首轮失败也能恢复问题。
            if credentials is not None:
                yield sse_event({"type": "conversation", **credentials.model_dump(mode="json")})
            # 整轮耗时小于锁租期，防止长流式回答在 Redis 锁过期后与下一轮重叠。
            async with asyncio.timeout(settings.ai_conversation_lock_seconds - 2):
                client, response = await open_upstream(messages, settings)
                async for chunk in response.aiter_bytes():
                    for event in capture.feed(chunk):
                        yield sse_event(event)
                    if capture.done:
                        break
                for event in capture.feed(b"", final=True):
                    yield sse_event(event)
            if capture.text().strip() and (capture.done or capture.finish_reason):
                status = MESSAGE_COMPLETED
                error_code = None
            elif not capture.text().strip():
                error_code = "empty_response"
                error_message = "模型未返回回答内容，请重新提问"
        except asyncio.CancelledError:
            status = MESSAGE_STOPPED
            error_code = "client_disconnected"
            cancelled = True
        except GeneratorExit:
            status = MESSAGE_STOPPED
            error_code = "client_disconnected"
            raise
        except HTTPException as exc:
            error_code = f"upstream_http_{exc.status_code}"
            error_message = str(exc.detail)
        except TimeoutError:
            error_code = "generation_timeout"
            error_message = "模型回答超时，已保存收到的内容"
        except httpx.HTTPError as exc:
            error_code = type(exc).__name__
            logger.warning("ai.stream_failed", extra={"error_code": error_code})
        except Exception as exc:
            error_code = "invalid_stream"
            logger.warning("ai.stream_invalid", extra={"error_code": type(exc).__name__})
        finally:
            async def cleanup() -> None:
                try:
                    try:
                        if response is not None:
                            await response.aclose()
                    finally:
                        if client is not None:
                            await client.aclose()
                finally:
                    try:
                        await finalize_message(
                            assistant_message_id, conversation_id, settings, capture,
                            status=status, error_code=error_code,
                        )
                    finally:
                        await runtime.release_conversation_lock(conversation_id, lock_token)

            task = asyncio.create_task(cleanup())
            _cleanup_tasks.add(task)
            task.add_done_callback(_cleanup_tasks.discard)
            try:
                # Starlette 断流通过 AnyIO 取消作用域通知；清理及落库不能随请求一起取消。
                with anyio.CancelScope(shield=True):
                    await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
        if cancelled:
            raise asyncio.CancelledError
        if status == MESSAGE_FAILED:
            yield sse_event({"type": "error", "message": error_message})
        # 完成事件只在数据库事务成功提交之后发送，刷新不会读到旧的生成状态。
        yield sse_event({
            "type": "complete", "status": status, "finish_reason": capture.finish_reason,
        })
        yield b"data: [DONE]\n\n"

    return PersistedStreamingResponse(
        stream_body(),
        close_unstarted=close_unstarted,
        status_code=201 if is_new else 200,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
