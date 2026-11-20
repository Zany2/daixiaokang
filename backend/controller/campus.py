"""Guest multiplayer endpoint; HTTP CORS alone does not protect WebSockets."""

from fastapi import APIRouter, WebSocket

router = APIRouter(prefix="/api/campus", tags=["校园联机"])


@router.websocket("/ws")
async def multiplayer(websocket: WebSocket):
    runtime = websocket.app.state.campus_runtime
    settings = runtime.settings
    if (not settings.campus_enabled
            or websocket.headers.get("origin") not in settings.campus_allowed_origins):
        await websocket.close(code=1008)
        return
    await runtime.serve(websocket)
