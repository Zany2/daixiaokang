"""SQLAlchemy model registry."""

from app.models.article_comment import ArticleComment
from app.models.guestbook_message import GuestbookMessage

__all__ = ["ArticleComment", "GuestbookMessage"]
