from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class VisitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    visitor_id: UUID
    path: str = Field(min_length=1, max_length=1024)
    referrer: str = Field(default="", max_length=2048)
    utm_source: str = Field(default="", max_length=100)

    @field_validator("path")
    @classmethod
    def page_path(cls, value):
        if not value.startswith("/") or value.startswith("//") or any(c in value for c in "?#\\") or any(ord(c) < 32 for c in value):
            raise ValueError("Invalid page path")
        return value


class ChartRow(BaseModel):
    name: str
    value: int


class Overview(BaseModel):
    total_pv: int
    month_pv: int
    today_uv: int
    today_pv: int
    yesterday_uv: int
    yesterday_pv: int


class AnalyticsSummary(BaseModel):
    overview: Overview
    regions: list[ChartRow]
    trends: list[ChartRow]
    sources: list[ChartRow]
    region_unknown: int
    geo_available: bool
    updated_at: str
