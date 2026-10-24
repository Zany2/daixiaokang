from datetime import datetime

from sqlalchemy import (
    BigInteger, CheckConstraint, DateTime, Identity, Index, Integer,
    SmallInteger, String, Text, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base, TimestampMixin


class GuestbookMessage(TimestampMixin, Base):
    """独立留言板记录，不包含楼中楼关联。"""

    __tablename__ = "guestbook_messages"
    __table_args__ = (
        CheckConstraint("status IN (0, 1, 2)", name="status_valid"),
        CheckConstraint(
            "char_length(btrim(nickname, ' \t\n\r')) > 0", name="nickname_not_blank"
        ),
        CheckConstraint(
            "char_length(content) <= 2000 AND "
            "char_length(btrim(content, ' \t\n\r')) > 0",
            name="content_length",
        ),
        {"comment": "社交留言板表：保存独立留言，采用普通分页列表，不包含文章关联或楼中楼回复"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(always=True),
        primary_key=True, autoincrement=True,
        comment="留言主键，BIGINT 自增；由数据库自动生成，不接受访客自行指定",
    )
    nickname: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="留言者昵称，公开展示；必填，不可仅包含空白，最多 50 字符",
    )
    email: Mapped[str | None] = mapped_column(
        String(254), nullable=True,
        comment="留言者邮箱，选填，最多 254 字符；仅后台可见，公开接口不得返回",
    )
    client_ip: Mapped[str | None] = mapped_column(
        String(45), nullable=True,
        comment="留言提交者 IP，支持 IPv4/IPv6，最多 45 字符；由后端从请求获取，仅后台可见",
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(1024), nullable=True,
        comment="提交请求的 User-Agent，包含浏览器、操作系统等客户端信息，最多 1024 字符；由后端读取请求头，仅后台可见",
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="留言纯文本内容，保留换行；必填，不可仅包含空白，最多 2000 字符，展示时需转义",
    )
    status: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("1"),
        comment="审核状态：0 待审核、1 已通过、2 已拒绝；默认 1，公开列表仅展示已通过记录",
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
        comment="软删除时间，TIMESTAMP 不带时区；为空表示未删除，非空时不公开展示，保留记录供后台恢复",
    )


Index(
    "ix_guestbook_messages_public_list",
    GuestbookMessage.created_at.desc(),
    GuestbookMessage.id.desc(),
    postgresql_where=text("status = 1 AND deleted_at IS NULL"),
)
Index(
    "ix_guestbook_messages_moderation",
    GuestbookMessage.status,
    GuestbookMessage.created_at.desc(),
    GuestbookMessage.id.desc(),
    postgresql_where=text("deleted_at IS NULL"),
)
