from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ArticleComment(TimestampMixin, Base):
    """文章评论及楼中楼回复；顶层评论的 parent_id、root_id 均为空。"""

    __tablename__ = "article_comments"
    __table_args__ = (
        UniqueConstraint("id", "article_key", name="uq_article_comments_id_article_key"),
        ForeignKeyConstraint(
            ["parent_id", "article_key"],
            ["article_comments.id", "article_comments.article_key"],
            name="fk_article_comments_parent_article",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["root_id", "article_key"],
            ["article_comments.id", "article_comments.article_key"],
            name="fk_article_comments_root_article",
            ondelete="RESTRICT",
        ),
        CheckConstraint("status IN (0, 1, 2)", name="status_valid"),
        CheckConstraint(
            "char_length(btrim(article_key, ' \t\n\r')) > 0", name="article_key_not_blank"
        ),
        CheckConstraint(
            "char_length(btrim(nickname, ' \t\n\r')) > 0", name="nickname_not_blank"
        ),
        CheckConstraint(
            "char_length(content) <= 2000 AND "
            "char_length(btrim(content, ' \t\n\r')) > 0",
            name="content_length",
        ),
        CheckConstraint(
            "(parent_id IS NULL AND root_id IS NULL) OR "
            "(parent_id IS NOT NULL AND root_id IS NOT NULL)",
            name="reply_links_paired",
        ),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="parent_not_self"),
        CheckConstraint("root_id IS NULL OR root_id <> id", name="root_not_self"),
        {"comment": "文章评论表：保存文章详情页的顶层评论及楼中楼回复，支持审核与软删除"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(always=True),
        primary_key=True, autoincrement=True,
        comment="评论主键，BIGINT 自增；由数据库自动生成，不接受访客自行指定",
    )
    article_key: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="文章固定标识，使用现有 abbrlink，不含域名；必填，最多 128 字符",
    )
    parent_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
        comment="直接回复的评论 ID，BIGINT；顶层评论为空，回复必填，必须属于同一篇文章",
    )
    root_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
        comment="所属顶层评论 ID，BIGINT，用于聚合楼中楼回复；顶层评论为空，回复必填，由后端确定",
    )
    nickname: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="评论者昵称，公开展示；必填，不可仅包含空白，最多 50 字符",
    )
    email: Mapped[str | None] = mapped_column(
        String(254), nullable=True,
        comment="评论者邮箱，选填，最多 254 字符；仅后台可见，公开接口不得返回",
    )
    client_ip: Mapped[str | None] = mapped_column(
        String(45), nullable=True,
        comment="评论提交者 IP，支持 IPv4/IPv6，最多 45 字符；由后端从请求获取，仅后台可见",
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(1024), nullable=True,
        comment="提交请求的 User-Agent，包含浏览器、操作系统等客户端信息，最多 1024 字符；由后端读取请求头，仅后台可见",
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="评论纯文本内容，保留换行；必填，不可仅包含空白，最多 2000 字符，展示时需转义",
    )
    status: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("1"),
        comment="审核状态：0 待审核、1 已通过、2 已拒绝；默认 1，公开列表仅展示已通过记录",
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
        comment="软删除时间，TIMESTAMP 不带时区；为空表示未删除，非空时不公开展示；删除顶层评论后应隐藏其回复",
    )


Index(
    "ix_article_comments_public_roots",
    ArticleComment.article_key,
    ArticleComment.created_at.desc(),
    ArticleComment.id.desc(),
    postgresql_where=text("status = 1 AND deleted_at IS NULL AND parent_id IS NULL"),
)
Index(
    "ix_article_comments_public_replies",
    ArticleComment.root_id,
    ArticleComment.created_at,
    ArticleComment.id,
    postgresql_where=text("status = 1 AND deleted_at IS NULL AND root_id IS NOT NULL"),
)
Index("ix_article_comments_parent_id", ArticleComment.parent_id)
Index("ix_article_comments_root_id", ArticleComment.root_id)
Index(
    "ix_article_comments_moderation",
    ArticleComment.status,
    ArticleComment.created_at.desc(),
    ArticleComment.id.desc(),
    postgresql_where=text("deleted_at IS NULL"),
)
