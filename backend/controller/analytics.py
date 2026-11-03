from typing import Annotated
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.config import get_settings
from db.session import get_db
from schemas.analytics import VisitCreate, AnalyticsSummary
from services import analytics
from services.feedback_runtime import get_feedback_runtime, FeedbackRuntime

router = APIRouter(prefix="/api/analytics", tags=["网站统计"])
Database = Annotated[AsyncSession, Depends(get_db)]
Runtime = Annotated[FeedbackRuntime, Depends(get_feedback_runtime)]


def enabled(request):
    settings = get_settings()
    if not settings.analytics_enabled:
        raise HTTPException(404, "统计未启用")
    return settings


@router.post("/visits", status_code=204)
async def visit(payload: VisitCreate, request: Request, db: Database, runtime: Runtime):
    settings = enabled(request)
    # Unlike CORS, an explicit Origin check also prevents simple cross-site writes.
    if request.headers.get("origin") not in settings.cors_origins:
        raise HTTPException(403, "来源不允许")
    client = request.client.host if request.client else None
    await runtime.check_read(client)
    if not analytics.BOT.search(request.headers.get("user-agent", "")):
        await analytics.record_visit(db, payload, settings, request.app.state.analytics_geo, client)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/summary", response_model=AnalyticsSummary)
async def overview(request: Request, response: Response, db: Database, runtime: Runtime):
    enabled(request)
    await runtime.check_read(request.client.host if request.client else None)
    response.headers["Cache-Control"] = "no-store"
    return await analytics.summary(db, request.app.state.analytics_geo)
