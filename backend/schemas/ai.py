from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


QuestionContent = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
]


class AIMessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    turn_id: UUID = Field(description="前端为本轮问答生成的 UUID，用于幂等防重")
    content: QuestionContent = Field(description="用户问题，去除首尾空白后为 1～1000 字符")


class AIConversationStart(AIMessageCreate):
    creation_token: str | None = Field(
        default=None, min_length=64, max_length=64, pattern="^[0-9a-f]{64}$",
        description="浏览器首次发送前生成的随机凭证；配合 turn_id 恢复未收到响应的创建请求",
    )


class AIConversationCreated(BaseModel):
    conversation_id: UUID
    conversation_token: str
    expires_at: datetime


class AIMessagePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    turn_id: UUID
    sequence_no: int
    role: Literal["user", "assistant"]
    content: str
    status: int
    finish_reason: str | None
    created_at: datetime
    completed_at: datetime | None


class AIMessagePage(BaseModel):
    items: list[AIMessagePublic]
    has_more: bool
    next_before_sequence: int | None
    conversation_status: Literal[1, 2]
    can_continue: bool
    expires_at: datetime


class AIServiceStatus(BaseModel):
    ok: bool
    enabled: bool
    configured: bool
    model: str
    max_input_chars: int
    max_output_tokens: int
    max_history_turns: int
    requests_per_hour: int
    conversation_ttl_hours: int
