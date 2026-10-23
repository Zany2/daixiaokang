"""SQLAlchemy model registry."""

from models.article_comment import ArticleComment
from models.guestbook_message import GuestbookMessage

__all__ = ["ArticleComment", "GuestbookMessage"]
