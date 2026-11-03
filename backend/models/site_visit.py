from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, String, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from db.base import Base


class SiteVisit(Base):
    __tablename__ = "site_visits"

    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    visitor: Mapped[str] = mapped_column(String(64), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    province: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


Index("ix_site_visits_time_visitor", SiteVisit.created_at, SiteVisit.visitor)
