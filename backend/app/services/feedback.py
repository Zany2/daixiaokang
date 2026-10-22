from collections import defaultdict
from ipaddress import ip_address

from fastapi import HTTPException, Request
from sqlalchemy import and_, func, select, true, tuple_, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import ArticleComment, GuestbookMessage
from app.schemas.feedback import (
    CommentCreate, CommentPage, CommentPublic, CommentThread, CursorPage,
    MessageCreate, MessagePage, MessagePublic,
)
from app.services.feedback_pagination import decode_cursor, encode_cursor

REPLY_PREVIEW_SIZE = 3


def request_metadata(request: Request) -> dict[str, str | None]:
    client_ip = None
    if request.client:
        try:
            client_ip = str(ip_address(request.client.host.split("%", 1)[0]))
        except ValueError:
            pass
    # 转发 IP 由 ASGI 服务器的可信代理配置处理，不直接相信客户端传入的 X-Forwarded-For。
    user_agent = request.headers.get("user-agent")
    return {"client_ip": client_ip, "user_agent": user_agent[:1024] if user_agent else None}


def public_comment(comment: ArticleComment, reply_to_nickname: str | None = None) -> CommentPublic:
    return CommentPublic.model_validate(comment).model_copy(update={"reply_to_nickname": reply_to_nickname})


def visible_comments():
    return (ArticleComment.status == 1, ArticleComment.deleted_at.is_(None))


async def read_counted_page(db: AsyncSession, model, visible, page_query):
    """同一条 SQL 读取总数和分页记录，避免并发新增导致两个结果不一致。"""
    totals = select(func.count().label("total")).select_from(model).where(*visible).subquery()
    page_rows = page_query.subquery()
    record = aliased(model, page_rows)
    rows = (await db.execute(
        select(record, totals.c.total)
        .select_from(totals.outerjoin(page_rows, true()))
        .order_by(record.created_at.desc(), record.id.desc())
    )).all()
    # COUNT 聚合始终返回一行；空页通过 LEFT JOIN 保留总数，实体部分为 None。
    return [item for item, _ in rows if item is not None], rows[0][1]


def reply_query():
    parent = aliased(ArticleComment)
    return select(ArticleComment, parent.nickname).outerjoin(
        parent,
        and_(
            parent.id == ArticleComment.parent_id,
            parent.article_key == ArticleComment.article_key,
            parent.status == 1,
            parent.deleted_at.is_(None),
        ),
    )


async def get_visible_root(db: AsyncSession, root_id: int, *, lock: bool = False) -> ArticleComment:
    query = select(ArticleComment).where(
        ArticleComment.id == root_id,
        ArticleComment.parent_id.is_(None),
        ArticleComment.root_id.is_(None),
        *visible_comments(),
    )
    if lock:
        query = query.with_for_update(read=True)
    root = (await db.execute(query)).scalar_one_or_none()
    if root is None:
        raise HTTPException(status_code=404, detail="评论楼层不存在或不可访问")
    return root


async def create_comment(db: AsyncSession, payload: CommentCreate, metadata: dict) -> CommentPublic:
    root_id = None
    reply_to_nickname = None
    if payload.parent_id is not None:
        parent = (await db.execute(
            select(ArticleComment).where(
                ArticleComment.id == payload.parent_id,
                ArticleComment.article_key == payload.article_key,
                *visible_comments(),
            ).with_for_update(read=True)
        )).scalar_one_or_none()
        if parent is None:
            raise HTTPException(status_code=404, detail="被回复的评论不存在或不属于当前文章")
        if parent.parent_id is None:
            if parent.root_id is not None:
                raise HTTPException(status_code=409, detail="评论回复关联异常")
            root = parent
        else:
            if parent.root_id is None:
                raise HTTPException(status_code=409, detail="评论回复关联异常")
            root = await get_visible_root(db, parent.root_id, lock=True)
        if root.article_key != payload.article_key:
            raise HTTPException(status_code=409, detail="评论回复关联异常")
        root_id = root.id
        reply_to_nickname = parent.nickname
    comment = ArticleComment(**payload.model_dump(), root_id=root_id, **metadata)
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    response = public_comment(comment, reply_to_nickname)
    await db.commit()
    return response


async def list_comments(
    db: AsyncSession, article_key: str, page_size: int, cursor: str | None, page: int = 1,
) -> CommentPage:
    if cursor is not None and page != 1:
        raise HTTPException(status_code=400, detail="页码和评论游标不能同时使用")
    position = decode_cursor(cursor, "comments", article_key)
    visible_roots = (
        ArticleComment.article_key == article_key,
        ArticleComment.parent_id.is_(None),
        ArticleComment.root_id.is_(None),
        *visible_comments(),
    )
    query = select(ArticleComment).where(*visible_roots)
    if position:
        query = query.where(tuple_(ArticleComment.created_at, ArticleComment.id) < position)
    else:
        query = query.offset((page - 1) * page_size)
    roots, total = await read_counted_page(
        db, ArticleComment, visible_roots,
        query.order_by(ArticleComment.created_at.desc(), ArticleComment.id.desc()).limit(page_size + 1),
    )
    has_more = len(roots) > page_size
    roots = roots[:page_size]
    replies = defaultdict(list)
    if roots:
        # 每个子查询独立 LIMIT 4，最多读取 30 * 4 条回复；不扫描全部回复后再截取。
        # UNION ALL 合并为一次查询，避免每个楼层发起一次数据库请求。
        preview_ids = []
        for root in roots:
            limited = select(ArticleComment.id).where(
                ArticleComment.article_key == article_key,
                ArticleComment.root_id == root.id,
                *visible_comments(),
            ).order_by(ArticleComment.created_at, ArticleComment.id).limit(REPLY_PREVIEW_SIZE + 1).subquery()
            preview_ids.append(select(limited.c.id))
        rows = (await db.execute(
            reply_query().where(ArticleComment.id.in_(union_all(*preview_ids))).order_by(
                ArticleComment.root_id, ArticleComment.created_at, ArticleComment.id,
            )
        )).all()
        for comment, parent_nickname in rows:
            replies[comment.root_id].append(public_comment(comment, parent_nickname))
    items = []
    for root in roots:
        children = replies[root.id]
        more_replies = len(children) > REPLY_PREVIEW_SIZE
        children = children[:REPLY_PREVIEW_SIZE]
        items.append(CommentThread(
            **public_comment(root).model_dump(),
            replies=children,
            has_more_replies=more_replies,
            next_reply_cursor=encode_cursor(
                "replies", str(root.id), children[-1].created_at, children[-1].id,
            ) if more_replies else None,
        ))
    return CommentPage(
        items=items, page_size=page_size, has_more=has_more,
        page=None if cursor is not None else page,
        total=total, total_pages=(total + page_size - 1) // page_size,
        next_cursor=encode_cursor(
            "comments", article_key, roots[-1].created_at, roots[-1].id,
        ) if has_more else None,
    )


async def list_replies(
    db: AsyncSession, root_id: int, page_size: int, cursor: str | None,
) -> CursorPage[CommentPublic]:
    position = decode_cursor(cursor, "replies", str(root_id))
    root = await get_visible_root(db, root_id)
    query = reply_query().where(
        ArticleComment.root_id == root.id,
        ArticleComment.article_key == root.article_key,
        *visible_comments(),
    )
    if position:
        query = query.where(tuple_(ArticleComment.created_at, ArticleComment.id) > position)
    rows = (await db.execute(
        query.order_by(ArticleComment.created_at, ArticleComment.id).limit(page_size + 1)
    )).all()
    has_more = len(rows) > page_size
    items = [public_comment(comment, nickname) for comment, nickname in rows[:page_size]]
    return CursorPage[CommentPublic](
        items=items, page_size=page_size, has_more=has_more,
        next_cursor=encode_cursor(
            "replies", str(root.id), items[-1].created_at, items[-1].id,
        ) if has_more else None,
    )


async def create_message(db: AsyncSession, payload: MessageCreate, metadata: dict) -> MessagePublic:
    message = GuestbookMessage(**payload.model_dump(), **metadata)
    db.add(message)
    await db.flush()
    await db.refresh(message)
    response = MessagePublic.model_validate(message)
    await db.commit()
    return response


async def list_messages(db: AsyncSession, page: int, page_size: int) -> MessagePage:
    visible = (GuestbookMessage.status == 1, GuestbookMessage.deleted_at.is_(None))
    records, total = await read_counted_page(
        db, GuestbookMessage, visible,
        select(GuestbookMessage).where(*visible).order_by(
            GuestbookMessage.created_at.desc(), GuestbookMessage.id.desc(),
        ).offset((page - 1) * page_size).limit(page_size),
    )
    return MessagePage(
        items=[MessagePublic.model_validate(record) for record in records],
        page=page, page_size=page_size, total=total,
        total_pages=(total + page_size - 1) // page_size,
        has_more=page * page_size < total,
    )
