from ipaddress import ip_address
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from db.session import get_db
from schemas.ai import (
    AIConversationStart,
    AIMessageCreate,
    AIMessagePage,
    AIServiceStatus,
)
from services import ai
from services.ai_runtime import AIRuntime, get_ai_runtime


async def disable_http_cache(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/api/ai",
    tags=["AI 助手"],
    dependencies=[Depends(disable_http_cache)],
)
Database = Annotated[AsyncSession, Depends(get_db)]
Runtime = Annotated[AIRuntime, Depends(get_ai_runtime)]
ConversationToken = Annotated[
    str,
    Header(alias="X-Conversation-Token", min_length=20, max_length=256),
]


def request_metadata(request: Request) -> tuple[str | None, str | None]:
    client_ip = None
    if request.client:
        try:
            client_ip = str(ip_address(request.client.host.split("%", 1)[0]))
        except ValueError:
            pass
    user_agent = request.headers.get("user-agent")
    return client_ip, user_agent


@router.get("/status", response_model=AIServiceStatus, summary="查看 AI 服务状态及前端限制")
async def get_ai_status() -> AIServiceStatus:
    settings = get_settings()
    configured = bool(settings.ai_api_key.get_secret_value().strip())
    return AIServiceStatus(
        ok=settings.ai_enabled and configured,
        enabled=settings.ai_enabled,
        configured=configured,
        model=settings.ai_model,
        max_input_chars=settings.ai_max_input_chars,
        max_output_tokens=settings.ai_max_tokens,
        max_history_turns=settings.ai_max_history_turns,
        requests_per_hour=settings.ai_requests_per_hour,
        conversation_ttl_hours=settings.ai_conversation_ttl_hours,
    )


@router.post(
    "/conversations",
    status_code=status.HTTP_201_CREATED,
    summary="首次提问时创建会话、保存首轮消息并流式回答",
)
async def create_conversation(
    payload: AIConversationStart,
    request: Request,
    runtime: Runtime,
):
    settings = get_settings()
    client_ip, user_agent = request_metadata(request)
    await runtime.check_conversation_limit(client_ip)
    await runtime.check_message_limit(client_ip)
    return await ai.create_chat_stream(
        None,
        payload.creation_token,
        payload,
        settings,
        runtime,
        client_ip=client_ip,
        user_agent=user_agent,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=AIMessagePage,
    summary="分页恢复一批 AI 对话记录",
)
async def list_messages(
    conversation_id: UUID,
    conversation_token: ConversationToken,
    db: Database,
    limit: Annotated[int, Query(ge=1, le=80)] = 30,
    before_sequence: Annotated[int | None, Query(ge=1)] = None,
) -> AIMessagePage:
    return await ai.list_messages(
        db,
        conversation_id,
        conversation_token,
        limit,
        before_sequence,
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    summary="发送问题并流式生成、保存 AI 回答",
)
async def create_message(
    conversation_id: UUID,
    payload: AIMessageCreate,
    conversation_token: ConversationToken,
    request: Request,
    runtime: Runtime,
):
    settings = get_settings()
    client_ip, _ = request_metadata(request)
    await runtime.check_message_limit(client_ip)
    return await ai.create_chat_stream(
        conversation_id,
        conversation_token,
        payload,
        settings,
        runtime,
    )


@router.post(
    "/conversations/{conversation_id}/close",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="结束当前会话并准备开启新对话",
)
async def close_conversation(
    conversation_id: UUID,
    conversation_token: ConversationToken,
    db: Database,
) -> Response:
    await ai.close_conversation(db, conversation_id, conversation_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})
