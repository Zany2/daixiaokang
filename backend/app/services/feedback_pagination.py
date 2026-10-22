import base64
import binascii
import json
from datetime import datetime

from fastapi import HTTPException

from app.schemas.feedback import MAX_ID


def encode_cursor(kind: str, scope: str, created_at: datetime, record_id: int) -> str:
    payload = {"v": 1, "kind": kind, "scope": scope, "time": created_at.isoformat(), "id": record_id}
    return base64.urlsafe_b64encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None, kind: str, scope: str) -> tuple[datetime, int] | None:
    if cursor is None:
        return None
    try:
        if not cursor or len(cursor) > 2048:
            raise ValueError("Invalid cursor size")
        raw = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        payload = json.loads(raw)
        if not isinstance(payload, dict) or set(payload) != {"v", "kind", "scope", "time", "id"}:
            raise ValueError("Invalid cursor fields")
        if type(payload["v"]) is not int or payload["v"] != 1:
            raise ValueError("Invalid cursor version")
        if payload["kind"] != kind or payload["scope"] != scope:
            raise ValueError("Cursor belongs to another list")
        if type(payload["id"]) is not int or not 1 <= payload["id"] <= MAX_ID:
            raise ValueError("Invalid cursor ID")
        if not isinstance(payload["time"], str) or len(payload["time"]) > 26:
            raise ValueError("Invalid cursor timestamp")
        timestamp = datetime.fromisoformat(payload["time"])
        if timestamp.tzinfo is not None:
            raise ValueError("Timestamp must not contain a timezone")
        return timestamp, payload["id"]
    except (ValueError, TypeError, KeyError, UnicodeError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="分页游标无效或不属于当前列表") from exc
