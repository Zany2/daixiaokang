from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger, CheckConstraint, DateTime, ForeignKeyConstraint, Identity,
    Index, Integer, SmallInteger, String, Text, UniqueConstraint, Uuid, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base, TimestampMixin


class AIMessage(TimestampMixin, Base):
    """AI 会话中的一条用户提问或助手回答。"""

    __tablename__ = "ai_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"],
            name="fk_ai_messages_conversation", ondelete="CASCADE",
        ),
        UniqueConstraint(
            "conversation_id", "sequence_no",
            name="uq_ai_messages_conversation_sequence",
        ),
        UniqueConstraint(
            "conversation_id", "turn_id", "role",
            name="uq_ai_messages_conversation_turn_role",
        ),
        CheckConstraint("sequence_no > 0", name="sequence_positive"),
        CheckConstraint("role IN ('user', 'assistant')", name="role_valid"),
        CheckConstraint("status IN (1, 2, 3, 4)", name="status_valid"),
        CheckConstraint("role <> 'user' OR status = 2", name="user_state_valid"),
        CheckConstraint(
            "role <> 'user' OR (char_length(content) <= 1000 "
            "AND char_length(btrim(content, ' \t\n\r')) > 0)",
            name="user_content_valid",
        ),
        CheckConstraint(
            "role <> 'assistant' OR status <> 2 "
            "OR char_length(btrim(content, ' \t\n\r')) > 0",
            name="assistant_content_valid",
        ),
        CheckConstraint(
            "(role = 'user' AND model IS NULL) OR "
            "(role = 'assistant' AND model IS NOT NULL "
            "AND char_length(btrim(model, ' \t\n\r')) > 0)",
            name="model_role_valid",
        ),
        CheckConstraint(
            "prompt_tokens >= 0 AND completion_tokens >= 0 "
            "AND (role <> 'user' OR (prompt_tokens = 0 AND completion_tokens = 0))",
            name="token_counts_valid",
        ),
        CheckConstraint(
            "(status = 1 AND completed_at IS NULL) "
            "OR (status IN (2, 3, 4) AND completed_at IS NOT NULL)",
            name="completion_time_valid",
        ),
        CheckConstraint(
            "updated_at >= created_at "
            "AND (completed_at IS NULL OR completed_at >= created_at) "
            "AND (deleted_at IS NULL OR deleted_at >= created_at)",
            name="time_order",
        ),
        {"comment": "AI 对话消息表：按会话和顺序保存用户提问及大模型回答，可完整还原每批对话并记录生成状态和 Token 用量"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(always=True),
        primary_key=True, autoincrement=True,
        comment="AI 消息主键，BIGINT 自增；由数据库自动生成，仅供后端内部关联和分页",
    )
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid, nullable=False,
        comment="所属 AI 会话 UUID，关联 ai_conversations.id；同一值下的消息组成一批完整对话",
    )
    turn_id: Mapped[UUID] = mapped_column(
        Uuid, nullable=False,
        comment="单轮问答 UUID，由前端每次发送时生成；同一问题和对应回答使用相同值，同时用于请求幂等防重",
    )
    sequence_no: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="消息在会话内的顺序号，从 1 开始严格递增；按此字段升序即可还原完整对话",
    )
    role: Mapped[str] = mapped_column(
        String(16), nullable=False,
        comment="消息角色：user 用户提问、assistant 大模型回答；系统提示词由后端运行时加入且不作为普通消息保存",
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("''"),
        comment="消息正文；用户提问必填且最多 1000 字符，助手正常完成的回答不能为空，生成中或失败时允许为空",
    )
    status: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("2"),
        comment="消息状态：1 生成中、2 已完成、3 已停止、4 失败；用户消息固定为 2，助手消息按生成过程更新",
    )
    model: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="生成助手回答所使用的模型名称，最多 100 字符；用户消息必须为空，助手消息必须填写",
    )
    finish_reason: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="上游模型结束原因，最多 50 字符，例如 stop、length；生成中或请求失败时可以为空",
    )
    prompt_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"),
        comment="本轮模型请求消耗的输入 Token 数；记录在助手消息上，用户消息固定为 0，未知时为 0",
    )
    completion_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"),
        comment="本轮模型回答消耗的输出 Token 数；记录在助手消息上，用户消息固定为 0，未知时为 0",
    )
    error_code: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="生成失败时的内部错误代码，最多 100 字符；不得保存 API Key、异常堆栈或其他敏感信息",
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
        comment="消息结束处理时间，TIMESTAMP 不带时区；生成中为空，完成、停止或失败时必须填写",
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
        comment="消息软删除时间，TIMESTAMP 不带时区；当前前端不提供清空功能，保留给后台清理或后续数据管理",
    )


Index(
    "ix_ai_messages_visible_history",
    AIMessage.conversation_id, AIMessage.sequence_no,
    postgresql_where=text("deleted_at IS NULL"),
)
Index(
    "ix_ai_messages_generating",
    AIMessage.created_at, AIMessage.id,
    postgresql_where=text("status = 1 AND deleted_at IS NULL"),
)
Index("ix_ai_messages_created_at", AIMessage.created_at.desc(), AIMessage.id.desc())
