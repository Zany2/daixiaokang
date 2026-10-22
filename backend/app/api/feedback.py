from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.feedback import (
    MAX_ID, ArticleKey, CommentCreate, CommentPage, CommentPublic, CursorPage,
    MessageCreate, MessagePage, MessagePublic,
)
from app.services import feedback
from app.services.feedback_runtime import FeedbackRuntime, comments_namespace, get_feedback_runtime

async def disable_http_cache(response: Response):
    # 缓存仅由后端 Redis 管理，避免浏览器或代理在发表后继续返回旧响应。
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/api", tags=["评论与留言"], dependencies=[Depends(disable_http_cache)],
    responses={
        429: {
            "description": "同一 IP 操作过于频繁",
            "headers": {"Retry-After": {"description": "剩余等待秒数", "schema": {"type": "integer"}}},
        },
        503: {
            "description": "发表限流不可用或数据库查询并发已满",
            "headers": {"Retry-After": {"description": "建议等待秒数", "schema": {"type": "integer"}}},
        },
    },
)
Database = Annotated[AsyncSession, Depends(get_db)]
Runtime = Annotated[FeedbackRuntime, Depends(get_feedback_runtime)]
Cursor = Annotated[str | None, Query(max_length=2048)]


@router.post("/comments", response_model=CommentPublic, status_code=status.HTTP_201_CREATED, summary="发表评论或回复")
async def create_comment(payload: CommentCreate, request: Request, db: Database, runtime: Runtime):
    metadata = feedback.request_metadata(request)
    await runtime.check_write(metadata["client_ip"])
    response = await feedback.create_comment(db, payload, metadata)
    await runtime.invalidate(comments_namespace(payload.article_key))
    return response


@router.get("/comments", response_model=CommentPage, summary="根评论页码列表及每层前 3 条回复")
async def list_comments(
    article_key: Annotated[ArticleKey, Query()], request: Request, db: Database, runtime: Runtime,
    page: Annotated[int, Query(ge=1, le=1000000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=30)] = 30, cursor: Cursor = None,
):
    if cursor is not None and page != 1:
        raise HTTPException(status_code=400, detail="页码和评论游标不能同时使用")
    healthy = await runtime.check_read(feedback.request_metadata(request)["client_ip"])
    namespace = comments_namespace(article_key) if page == 1 and page_size == 30 and cursor is None else None
    return await runtime.query(
        namespace, "numbered-v3:first:30", CommentPage,
        lambda: feedback.list_comments(db, article_key, page_size, cursor, page),
        cache_allowed=healthy, cache_empty=False,
    )


@router.get("/comments/{root_id}/replies", response_model=CursorPage[CommentPublic], summary="分页加载楼中楼回复")
async def list_replies(
    root_id: Annotated[int, Path(ge=1, le=MAX_ID)], request: Request, db: Database, runtime: Runtime,
    page_size: Annotated[int, Query(ge=1, le=30)] = 10, cursor: Cursor = None,
):
    healthy = await runtime.check_read(feedback.request_metadata(request)["client_ip"])
    return await runtime.query(
        None, "", CursorPage[CommentPublic], lambda: feedback.list_replies(db, root_id, page_size, cursor),
        cache_allowed=healthy,
    )


@router.post("/messages", response_model=MessagePublic, status_code=status.HTTP_201_CREATED, summary="发表留言")
async def create_message(payload: MessageCreate, request: Request, db: Database, runtime: Runtime):
    metadata = feedback.request_metadata(request)
    await runtime.check_write(metadata["client_ip"])
    response = await feedback.create_message(db, payload, metadata)
    await runtime.invalidate("messages")
    return response


@router.get("/messages", response_model=MessagePage, summary="留言分页列表")
async def list_messages(
    request: Request, db: Database, runtime: Runtime, page: Annotated[int, Query(ge=1, le=1000000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 30,
):
    healthy = await runtime.check_read(feedback.request_metadata(request)["client_ip"])
    namespace = "messages" if page <= 3 and page_size == 30 else None
    return await runtime.query(
        namespace, f"numbered-v2:page:{page}:size:{page_size}", MessagePage,
        lambda: feedback.list_messages(db, page, page_size), cache_allowed=healthy,
    )
