from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Index, SmallInteger, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base, TimestampMixin


class AIConversation(TimestampMixin, Base):
    """一批连续的匿名 AI 对话。"""

    __tablename__ = "ai_conversations"
    __table_args__ = (
        CheckConstraint(
            "char_length(access_token_hash) = 64 "
            "AND access_token_hash ~ '^[0-9a-f]{64}$'",
            name="access_token_hash_valid",
        ),
        CheckConstraint(
            "title IS NULL OR char_length(btrim(title, ' \t\n\r')) > 0",
            name="title_not_blank",
        ),
        CheckConstraint(
            "char_length(btrim(model, ' \t\n\r')) > 0",
            name="model_not_blank",
        ),
        CheckConstraint(
            "char_length(btrim(system_prompt_version, ' \t\n\r')) > 0",
            name="system_prompt_version_not_blank",
        ),
        CheckConstraint("status IN (1, 2)", name="status_valid"),
        CheckConstraint(
            "(status = 1 AND closed_at IS NULL) "
            "OR (status = 2 AND closed_at IS NOT NULL)",
            name="status_closed_at",
        ),
        CheckConstraint(
            "updated_at >= created_at "
            "AND last_message_at >= created_at "
            "AND expires_at >= last_message_at "
            "AND (closed_at IS NULL OR closed_at >= created_at) "
            "AND (deleted_at IS NULL OR deleted_at >= created_at)",
            name="time_order",
        ),
        {"comment": "AI 对话会话表：每条记录标识一批连续对话，保存匿名会话访问凭证、模型、状态、客户端信息和生命周期时间"},
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()"),
        comment="AI 会话主键，UUID；使用首轮随机问答 ID 或由后端生成，用于关联同一批完整对话并恢复创建请求，避免连续整数被遍历",
    )
    access_token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True,
        comment="会话访问凭证明文的 SHA-256 小写十六进制摘要，固定 64 字符；仅保存摘要，不得保存或返回凭证明文",
    )
    title: Mapped[str | None] = mapped_column(
        String(200), nullable=True,
        comment="会话标题，选填，最多 200 字符；可由第一条用户问题截取或后续生成，仅用于后台识别",
    )
    model: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="本会话默认使用的模型名称，最多 100 字符；由后端配置决定，前端不得覆盖",
    )
    system_prompt_version: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'v1'"),
        comment="系统提示词版本，默认 v1；用于追溯该会话使用的后端提示词规则，不保存前端传入的 system 消息",
    )
    status: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("1"),
        comment="会话状态：1 活跃、2 已结束；默认 1，已结束会话不能继续追加消息",
    )
    client_ip: Mapped[str | None] = mapped_column(
        String(45), nullable=True,
        comment="创建会话时的客户端 IP，支持 IPv4/IPv6，最多 45 字符；由后端从可信代理处理后的请求地址获取，仅后台可见",
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(1024), nullable=True,
        comment="创建会话时的 User-Agent，最多 1024 字符；用于识别浏览器和操作系统，仅后台可见且不作为身份凭证",
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=text("now()"),
        comment="最后一条用户或助手消息的时间，TIMESTAMP 不带时区；创建时默认当前时间，新增消息后由后端更新",
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False,
        server_default=text("(now() + INTERVAL '24 hours')"),
        comment="会话过期时间，TIMESTAMP 不带时区；默认创建后 24 小时，每次有效对话后由后端顺延，过期会话不得继续",
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
        comment="会话结束时间，TIMESTAMP 不带时区；活跃会话为空，点击新对话或会话过期后写入",
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
        comment="软删除时间，TIMESTAMP 不带时区；当前前端不提供清空功能，保留给后台清理或后续数据管理",
    )


Index(
    "ix_ai_conversations_active_last_message",
    AIConversation.last_message_at.desc(), AIConversation.id,
    postgresql_where=text("status = 1 AND deleted_at IS NULL"),
)
Index(
    "ix_ai_conversations_active_expiration",
    AIConversation.expires_at, AIConversation.id,
    postgresql_where=text("status = 1 AND deleted_at IS NULL"),
)
Index("ix_ai_conversations_created_at", AIConversation.created_at.desc(), AIConversation.id)
Index(
    "ix_ai_conversations_client_ip_created_at",
    AIConversation.client_ip, AIConversation.created_at.desc(), AIConversation.id,
    postgresql_where=text("client_ip IS NOT NULL"),
)
