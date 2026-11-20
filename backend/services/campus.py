"""Redis-backed rooms with expiring presence and bounded WebSocket fan-out."""

import asyncio
import hashlib
import json
import math
import time
from contextlib import suppress
from dataclasses import dataclass
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from redis.exceptions import RedisError

from core.config import Settings
from core.logging import get_logger
from schemas.campus import CLIENT_MESSAGE, Chat, Join, Leave, Pong, State

logger = get_logger(__name__)
REDIS_FAILURES = (RedisError, OSError, TimeoutError)
MAX_MESSAGE_BYTES = 4096
OUTBOX_SIZE = 64
ADMISSION_SCRIPT = """
-- campus:admission-v1
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return count
"""

# All membership, capacity and expiry changes are atomic across workers. Redis
# time avoids leases depending on host clock skew. Room names are allowlisted.
PRESENCE_SCRIPT = """
-- campus:presence-v1
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local op, id, ttl = ARGV[1], ARGV[2], tonumber(ARGV[3])
local function publish(event)
    redis.call('PUBLISH', KEYS[4], cjson.encode(event))
end
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now)
for _, stale in ipairs(expired) do
    redis.call('ZREM', KEYS[2], stale)
    if redis.call('HDEL', KEYS[1], stale) == 1 then
        publish({type='player_left', player_id=stale, reason='expired', at=now})
    end
end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if op == 'leave' then
    redis.call('ZREM', KEYS[2], id)
    redis.call('ZREM', KEYS[3], id)
    if redis.call('HDEL', KEYS[1], id) == 1 then
        publish({type='player_left', player_id=id, reason='disconnected', at=now})
    end
    return {'ok', '{}'}
end
if op == 'join' then
    if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then return {'room_full', '{}'} end
    if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[6]) then return {'connection_limit', '{}'} end
else
    if not redis.call('HGET', KEYS[1], id) then return {'lease_lost', '{}'} end
end
local player
if op == 'join' or op == 'state' then
    player = cjson.decode(ARGV[4])
    player.updated_at = now
    redis.call('HSET', KEYS[1], id, cjson.encode(player))
else
    player = cjson.decode(redis.call('HGET', KEYS[1], id))
end
redis.call('ZADD', KEYS[2], now + ttl, id)
redis.call('ZADD', KEYS[3], now + ttl, id)
for i=1,3 do redis.call('PEXPIRE', KEYS[i], ttl * 2) end
if op == 'join' then publish({type='player_joined', player=player, at=now}) end
if op == 'state' then publish({type='player_state', player=player, at=now}) end
-- Movement broadcasts need no full roster round-trip on every update.
if op == 'state' then return {'ok', '{}'} end
local snapshot = {players={}, at=now}
-- Return a map (including for an empty room); the wire protocol uses arrays.
for _, value in ipairs(redis.call('HVALS', KEYS[1])) do
    local item = cjson.decode(value)
    snapshot.players[item.id] = item
end
return {'ok', cjson.encode(snapshot)}
"""


class CampusClose(Exception):
    def __init__(self, reason: str, code: int = 1008):
        self.reason, self.code = reason, code


@dataclass
class Bucket:
    rate: float
    capacity: float
    tokens: float
    updated: float

    def take(self, now: float) -> bool:
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


def new_player(nickname: str) -> dict:
    return {
        "id": uuid4().hex, "nickname": nickname,
        "position": {"x": -235.25, "y": 0, "z": 412},
        "heading": math.pi, "action": "idle", "seq": 0,
    }


class CampusRuntime:
    def __init__(self, redis, settings: Settings):
        self.redis, self.settings = redis, settings
        self.active: dict[asyncio.Task, WebSocket] = {}
        self.closing = False

    async def redis_call(self, operation):
        return await asyncio.wait_for(operation, self.settings.redis_operation_timeout_seconds)

    @staticmethod
    def keys(room: str, client_ip: str) -> list[str]:
        identity = hashlib.sha256(client_ip.encode()).hexdigest()
        return [f"campus:v1:room:{room}:players", f"campus:v1:room:{room}:leases",
                f"campus:v1:ip:{identity}", f"campus:v1:room:{room}:events"]

    async def presence(self, keys: list[str], op: str, player: dict) -> dict:
        result = await self.redis_call(self.redis.eval(
            PRESENCE_SCRIPT, len(keys), *keys, op, player["id"],
            self.settings.campus_lease_seconds * 1000,
            json.dumps(player, ensure_ascii=False, allow_nan=False),
            self.settings.campus_room_capacity, self.settings.campus_connections_per_ip,
        ))
        status, payload = result
        if status != "ok":
            raise CampusClose(status, 1013 if status in {"room_full", "lease_lost"} else 1008)
        return json.loads(payload)

    async def read(self, websocket: WebSocket):
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            raise WebSocketDisconnect(message.get("code", 1000))
        raw = message.get("text")
        if raw is None:
            raise CampusClose("text_json_required", 1003)
        if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
            raise CampusClose("message_too_large", 1009)
        try:
            return CLIENT_MESSAGE.validate_json(raw)
        except (ValidationError, ValueError):
            raise CampusClose("invalid_message") from None

    async def serve(self, websocket: WebSocket):
        task = asyncio.current_task()
        if self.closing:
            await websocket.close(code=1013)
            return
        self.active[task] = websocket
        player = keys = pubsub = None
        joined = False
        code, reason = 1000, "left"
        try:
            client_ip = websocket.client.host if websocket.client else "unknown"
            keys_for_ip = self.keys("bjut", client_ip)
            attempts = await self.redis_call(self.redis.eval(
                ADMISSION_SCRIPT, 1, keys_for_ip[2] + ":attempts",
            ))
            if attempts > 30:
                raise CampusClose("connection_rate_limit")
            await websocket.accept()
            try:
                hello = await asyncio.wait_for(self.read(websocket), 10)
            except TimeoutError:
                raise CampusClose("join_timeout") from None
            if not isinstance(hello, Join) or hello.room not in self.settings.campus_rooms:
                raise CampusClose("invalid_room_or_join")
            player = new_player(hello.nickname)
            keys = self.keys(hello.room, client_ip)
            pubsub = self.redis.pubsub()
            # Subscribe before the atomic join/snapshot, then acknowledge welcome
            # before delivering broadcasts. Periodic snapshots reconcile Pub/Sub
            # reconnect gaps and duplicate queued join/state events by id + seq.
            await self.redis_call(pubsub.subscribe(keys[3]))
            confirmation = await self.redis_call(pubsub.get_message(timeout=None))
            if not confirmation or confirmation["type"] != "subscribe":
                raise CampusClose("subscription_unavailable", 1013)
            try:
                snapshot = await self.presence(keys, "join", player)
            except CampusClose as exc:
                if exc.reason != "room_full":
                    raise
                # Solo visitors keep the local world and never acquire room/IP
                # presence. End normally so clients do not auto-retry a full room.
                await asyncio.wait_for(websocket.send_json({
                    "type": "fallback", "protocol": 1, "mode": "single",
                    "reason": "room_full", "room": hello.room,
                    "capacity": self.settings.campus_room_capacity,
                }), 3)
                reason = "room_full"
                return
            joined = True
            await asyncio.wait_for(websocket.send_json({
                "type": "welcome", "protocol": 1, "room": hello.room,
                "self": snapshot["players"][player["id"]],
                "players": [p for p in snapshot["players"].values() if p["id"] != player["id"]],
                "capacity": self.settings.campus_room_capacity,
                "heartbeat_seconds": self.settings.campus_heartbeat_seconds,
                "idle_seconds": self.settings.campus_idle_seconds, "at": snapshot["at"],
            }), 3)
            await self.session(websocket, pubsub, keys, player)
        except WebSocketDisconnect:
            pass
        except CampusClose as exc:
            code, reason = exc.code, exc.reason
        except REDIS_FAILURES as exc:
            code, reason = 1013, "service_unavailable"
            logger.warning("campus.redis_unavailable", extra={"error_code": type(exc).__name__})
        except asyncio.CancelledError:
            code, reason = 1001, "server_shutdown"
            raise
        except Exception:
            code, reason = 1011, "internal_error"
            logger.exception("campus.session_failed")
        finally:
            if joined:
                with suppress(*REDIS_FAILURES, CampusClose):
                    await self.presence(keys, "leave", player)
            if pubsub is not None:
                with suppress(*REDIS_FAILURES):
                    await self.redis_call(pubsub.aclose())
            with suppress(RuntimeError, OSError, WebSocketDisconnect, TimeoutError):
                await asyncio.wait_for(websocket.close(code=code, reason=reason), 2)
            self.active.pop(task, None)

    async def session(self, websocket, pubsub, keys, player):
        outbox = asyncio.Queue(maxsize=OUTBOX_SIZE)
        now = time.monotonic()
        last_seen = now
        messages = Bucket(30, 40, 40, now)
        states = Bucket(20, 20, 20, now)
        chats = Bucket(.5, 2, 2, now)

        def enqueue(event):
            try:
                outbox.put_nowait(event)
            except asyncio.QueueFull:
                raise CampusClose("slow_consumer", 1013) from None

        async def send():
            while True:
                try:
                    await asyncio.wait_for(websocket.send_json(await outbox.get()), 3)
                except TimeoutError:
                    raise CampusClose("slow_consumer", 1013) from None

        async def receive():
            nonlocal last_seen
            while True:
                payload = await self.read(websocket)
                now = time.monotonic()
                if not messages.take(now):
                    raise CampusClose("message_rate_limit")
                last_seen = now
                if isinstance(payload, Leave):
                    return
                if isinstance(payload, Pong):
                    continue
                if isinstance(payload, State):
                    if not states.take(now):
                        raise CampusClose("state_rate_limit")
                    if payload.seq <= player["seq"]:
                        enqueue({"type": "error", "code": "stale_sequence"})
                        continue
                    player.update(position=payload.position.model_dump(),
                                  heading=payload.heading % math.tau,
                                  action=payload.action, seq=payload.seq)
                    await self.presence(keys, "state", player)
                elif isinstance(payload, Chat):
                    if not chats.take(now):
                        raise CampusClose("chat_rate_limit")
                    await self.redis_call(self.redis.publish(keys[3], json.dumps({
                        "type": "chat", "message_id": uuid4().hex,
                        "player_id": player["id"], "nickname": player["nickname"],
                        "text": payload.text, "at": int(time.time() * 1000),
                    }, ensure_ascii=False)))
                else:
                    raise CampusClose("already_joined")

        async def broadcast():
            # listen() uses the shared client's socket_timeout and raises when
            # a quiet room has no messages. An explicit polling timeout returns
            # None instead, while redis_call still bounds connection failures.
            poll_seconds = min(.25, self.settings.redis_operation_timeout_seconds / 2)
            while True:
                message = await self.redis_call(pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=poll_seconds,
                ))
                if message is None or message["type"] != "message":
                    continue
                event = json.loads(message["data"])
                # The client already owns its movement; do not echo join/state.
                if event.get("player", {}).get("id") == player["id"]:
                    continue
                enqueue(event)

        async def heartbeat():
            while True:
                await asyncio.sleep(self.settings.campus_heartbeat_seconds)
                if time.monotonic() - last_seen > self.settings.campus_idle_seconds:
                    raise CampusClose("heartbeat_timeout")
                snapshot = await self.presence(keys, "touch", player)
                enqueue({"type": "snapshot", "players": list(snapshot["players"].values()), "at": snapshot["at"]})
                enqueue({"type": "ping"})

        tasks = [asyncio.create_task(fn()) for fn in (send, receive, broadcast, heartbeat)]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def close(self):
        self.closing = True
        tasks = list(self.active)
        await asyncio.gather(*(self._close_socket(ws) for ws in list(self.active.values())))
        if tasks:
            _, pending = await asyncio.wait(tasks, timeout=5)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

    @staticmethod
    async def _close_socket(websocket):
        with suppress(RuntimeError, OSError, WebSocketDisconnect, TimeoutError):
            await asyncio.wait_for(websocket.close(code=1001, reason="server_shutdown"), 2)
