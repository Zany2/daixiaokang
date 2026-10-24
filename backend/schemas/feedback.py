import re
from datetime import datetime
from email.errors import HeaderParseError
from email.headerregistry import Address
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

MAX_ID = 9223372036854775807
ArticleKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
Nickname = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: Nickname = Field(description="昵称，必填，去除首尾空白后为 1～50 字符")
    email: str | None = Field(default=None, max_length=254, description="选填邮箱，不公开展示；空字符串按未填写处理")
    content: Content = Field(description="纯文本内容，必填，去除首尾空白后为 1～2000 字符")

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if any(character.isspace() for character in value):
            raise ValueError("邮箱格式不正确")
        try:
            address = Address(addr_spec=value)
            domain = address.domain.encode("idna").decode("ascii")
            labels = domain.split(".")
            if address.addr_spec != value or not address.username or len(labels) < 2 or not all(
                re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
                for label in labels
            ):
                raise ValueError("Invalid address")
        except (ValueError, HeaderParseError, IndexError, UnicodeError) as exc:
            raise ValueError("邮箱格式不正确") from exc
        return value


class CommentCreate(FeedbackCreate):
    article_key: ArticleKey = Field(description="当前文章的固定 abbrlink，不含域名")
    parent_id: int | None = Field(default=None, ge=1, le=MAX_ID, description="被回复的评论 ID；发表根评论时不传")


class MessageCreate(FeedbackCreate):
    pass


class FeedbackPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nickname: str
    content: str
    created_at: datetime
    updated_at: datetime


class CommentPublic(FeedbackPublic):
    article_key: str
    parent_id: int | None
    root_id: int | None
    reply_to_nickname: str | None = None


class CommentThread(CommentPublic):
    replies: list[CommentPublic] = Field(default_factory=list)
    has_more_replies: bool = False
    next_reply_cursor: str | None = None


class MessagePublic(FeedbackPublic):
    pass


Item = TypeVar("Item")


class CursorPage(BaseModel, Generic[Item]):
    items: list[Item]
    page_size: int
    has_more: bool
    next_cursor: str | None


class CommentPage(CursorPage[CommentThread]):
    # 页码用于根评论列表；兼容旧游标调用时为 None。
    page: int | None
    total: int
    total_pages: int


class MessagePage(BaseModel):
    items: list[MessagePublic]
    page: int
    page_size: int
    total: int
    total_pages: int
    has_more: bool
