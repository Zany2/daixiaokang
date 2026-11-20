"""Offline ASGI/WebSocket integration tests running the actual Redis Lua scripts."""

import asyncio
import json
import math
import unittest
from contextlib import suppress
from unittest.mock import AsyncMock, patch

import fakeredis
import fakeredis.aioredis
from fastapi import FastAPI
from pydantic import ValidationError
from redis.exceptions import ConnectionError
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff
from starlette.middleware.trustedhost import TrustedHostMiddleware

from controller.campus import router
from core.config import Settings
from schemas.campus import CLIENT_MESSAGE
from services.campus import CampusClose, CampusRuntime, new_player

ORIGIN = "https://daixiaokang.com"


class Closed(Exception):
    def __init__(self, event):
        self.code, self.reason = event["code"], event.get("reason")


class Socket:
    """Drive the actual ASGI endpoint without a database or a network socket."""

    def __init__(self, app, origin=ORIGIN, ip="127.0.0.1"):
        self.incoming, self.outgoing = asyncio.Queue(), asyncio.Queue()
        self.block_sends = False
        self.send_gate = asyncio.Event()
        headers = [(b"host", b"testserver")]
        if origin is not None:
            headers.append((b"origin", origin.encode()))
        scope = dict(type="websocket", asgi={"version": "3.0"}, scheme="ws",
                     path="/api/campus/ws", raw_path=b"/api/campus/ws",
                     query_string=b"", root_path="", headers=headers,
                     client=(ip, 1234), server=("testserver", 80), subprotocols=[])

        async def send(event):
            if self.block_sends and event["type"] == "websocket.send":
                await self.send_gate.wait()
            await self.outgoing.put(event)

        self.task = asyncio.create_task(app(scope, self.incoming.get, send))

    async def connect(self):
        await self.incoming.put({"type": "websocket.connect"})
        return await self.event()

    async def event(self, timeout=2):
        event = await asyncio.wait_for(self.outgoing.get(), timeout)
        if event["type"] == "websocket.close":
            raise Closed(event)
        return event

    async def send(self, value):
        await self.incoming.put({"type": "websocket.receive", "text": json.dumps(value)})

    async def receive(self, kind, timeout=2):
        async with asyncio.timeout(timeout):
            while True:
                event = await self.event(timeout)
                payload = json.loads(event["text"])
                if payload["type"] == kind:
                    return payload

    async def join(self, nickname="访客", room="bjut"):
        await self.connect()
        await self.send(dict(type="join", nickname=nickname, room=room))
        return await self.receive("welcome")

    async def close(self):
        self.send_gate.set()
        if not self.task.done():
            await self.incoming.put({"type": "websocket.disconnect", "code": 1000})
        with suppress(asyncio.CancelledError):
            await asyncio.wait_for(self.task, 3)


class CampusTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.server = fakeredis.FakeServer()
        self.runtimes, self.clients, self.sockets = [], [], []

    async def asyncTearDown(self):
        for socket in self.sockets:
            await socket.close()
        for runtime in self.runtimes:
            await runtime.close()
        for client in self.clients:
            await client.aclose()

    def worker(self, **options):
        settings = Settings(_env_file=None, campus_rooms=["bjut", "friends"], **options)
        client = fakeredis.aioredis.FakeRedis(server=self.server, decode_responses=True)
        runtime = CampusRuntime(client, settings)
        app = FastAPI()
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=["testserver"])
        app.state.campus_runtime = runtime
        app.include_router(router)
        self.runtimes.append(runtime)
        self.clients.append(client)
        return app, runtime

    def socket(self, app, **options):
        socket = Socket(app, **options)
        self.sockets.append(socket)
        return socket

    async def test_two_workers_exchange_state_chat_and_disconnect(self):
        app_a, _ = self.worker()
        app_b, _ = self.worker()
        a, b = self.socket(app_a), self.socket(app_b)
        first = await a.join("甲")
        second = await b.join("乙")
        self.assertEqual(first["players"], [])
        self.assertEqual(second["players"][0]["id"], first["self"]["id"])
        self.assertEqual((await a.receive("player_joined"))["player"]["id"], second["self"]["id"])
        await b.send(dict(type="state", seq=1, position=dict(x=-230, y=2, z=410),
                          heading=math.tau + 1, action="jump"))
        update = (await a.receive("player_state"))["player"]
        self.assertEqual(update["id"], second["self"]["id"])
        self.assertEqual(update["nickname"], "乙")
        self.assertAlmostEqual(update["heading"], 1)
        self.assertEqual(update["position"], dict(x=-230, y=2, z=410))
        await b.send(dict(type="state", seq=1, position=dict(x=0, y=0, z=0), heading=0))
        self.assertEqual((await b.receive("error"))["code"], "stale_sequence")
        await b.send(dict(type="chat", text="你好，校园！"))
        chat = await a.receive("chat")
        self.assertEqual(chat["text"], "你好，校园！")
        self.assertEqual(chat["player_id"], second["self"]["id"])
        self.assertEqual((await b.receive("chat"))["message_id"], chat["message_id"])
        self.assertNotIn("127.0.0.1", json.dumps(chat))
        await b.close()
        self.assertEqual((await a.receive("player_left"))["player_id"], second["self"]["id"])

    async def test_rooms_are_isolated(self):
        app, runtime = self.worker()
        a, b = self.socket(app), self.socket(app)
        one = await a.join(room="bjut")
        two = await b.join(room="friends")
        self.assertEqual(two["players"], [])
        snap = await runtime.presence(runtime.keys("bjut", "127.0.0.1"), "touch", one["self"])
        self.assertEqual(set(snap["players"]), {one["self"]["id"]})

    async def test_capacity_is_atomic_under_concurrent_admission(self):
        _, runtime = self.worker(campus_room_capacity=2)
        async def join(i):
            try:
                await runtime.presence(runtime.keys("bjut", str(i)), "join", new_player(str(i)))
                return "ok"
            except CampusClose as exc:
                return exc.reason
        results = await asyncio.gather(*(join(i) for i in range(10)))
        self.assertEqual(results.count("ok"), 2)
        self.assertEqual(results.count("room_full"), 8)

    async def test_full_room_falls_back_to_single_without_presence_and_can_rejoin(self):
        app_a, runtime = self.worker(campus_room_capacity=2)
        app_b, other = self.worker(campus_room_capacity=2)
        a, b = self.socket(app_a), self.socket(app_b)
        first = await a.join("甲")
        second = await b.join("乙")
        await a.receive("player_joined")
        visitor = self.socket(app_b, ip="192.0.2.10")
        await visitor.connect()
        await visitor.send(dict(type="join", room="bjut", nickname="单人访客"))
        fallback = await visitor.receive("fallback")
        self.assertEqual(fallback, dict(type="fallback", protocol=1, mode="single",
                                       reason="room_full", room="bjut", capacity=2))
        with self.assertRaises(Closed) as caught:
            await visitor.event()
        self.assertEqual(caught.exception.code, 1000)
        self.assertEqual(caught.exception.reason, "room_full")
        await visitor.close()
        self.assertFalse(other.active.keys() - {b.task})
        keys = runtime.keys("bjut", "192.0.2.10")
        self.assertEqual(await runtime.redis.zcard(keys[1]), 2)
        self.assertEqual(await runtime.redis.zcard(keys[2]), 0)
        self.assertEqual(set(await runtime.redis.hkeys(keys[0])),
                         {first["self"]["id"], second["self"]["id"]})
        self.assertTrue(a.outgoing.empty())
        self.assertTrue(b.outgoing.empty())
        # Existing visitors can still communicate while the new visitor is solo.
        await a.send(dict(type="chat", text="继续漫游"))
        self.assertEqual((await b.receive("chat"))["text"], "继续漫游")
        await b.close()
        await a.receive("player_left")
        retry = self.socket(app_b, ip="192.0.2.10")
        self.assertEqual(len((await retry.join())["players"]), 1)

    async def test_1024th_player_is_admitted_and_1025th_falls_back(self):
        app, runtime = self.worker()
        keys = runtime.keys("bjut", "127.0.0.1")
        seconds, micros = await runtime.redis.time()
        now = seconds * 1000 + micros // 1000
        # Seed existing presence to verify the actual boundary, not throughput.
        players = [dict(new_player(f"visitor-{i}"), updated_at=now) for i in range(1023)]
        await runtime.redis.hset(keys[0], mapping={p["id"]: json.dumps(p) for p in players})
        await runtime.redis.zadd(keys[1], {p["id"]: now + 90000 for p in players})
        last = self.socket(app)
        welcome = await last.join()
        self.assertEqual(welcome["capacity"], 1024)
        self.assertEqual(len(welcome["players"]), 1023)
        extra = self.socket(app, ip="192.0.2.11")
        await extra.connect()
        await extra.send(dict(type="join", nickname="solo", room="bjut"))
        fallback = await extra.receive("fallback")
        self.assertEqual((fallback["mode"], fallback["capacity"]), ("single", 1024))
        with self.assertRaises(Closed) as caught:
            await extra.event()
        self.assertEqual(caught.exception.code, 1000)
        self.assertEqual(await runtime.redis.zcard(keys[1]), 1024)

    async def test_per_ip_limit_spans_rooms_and_workers(self):
        app_a, _ = self.worker(campus_connections_per_ip=1)
        app_b, _ = self.worker(campus_connections_per_ip=1)
        a, b = self.socket(app_a), self.socket(app_b)
        await a.join()
        with self.assertRaises(Closed) as caught:
            await b.join(room="friends")
        self.assertEqual(caught.exception.reason, "connection_limit")
        await a.close()
        c = self.socket(app_b)
        self.assertEqual((await c.join(room="friends"))["players"], [])

    async def test_missing_or_spoofed_origins_and_disabled_feature_are_denied(self):
        app, _ = self.worker()
        for origin in [None, "null", ORIGIN + ".evil.example", ORIGIN + "/"]:
            with self.subTest(origin=origin):
                with self.assertRaises(Closed) as caught:
                    await self.socket(app, origin=origin).connect()
                self.assertEqual(caught.exception.code, 1008)
        disabled, _ = self.worker(campus_enabled=False)
        with self.assertRaises(Closed):
            await self.socket(disabled).connect()

    async def test_invalid_messages_close_instead_of_mutating_player(self):
        app, _ = self.worker()
        for payload, expected in [
            ({"type": "join", "nickname": "x", "room": "unknown"}, "invalid_room_or_join"),
            ({"type": "state", "player_id": "spoofed"}, "invalid_message"),
            ({"type": "join", "nickname": "x" * 25}, "invalid_message"),
            ({"type": "chat", "text": "x" * 5000}, "message_too_large"),
        ]:
            with self.subTest(payload_type=payload["type"], expected=expected):
                s = self.socket(app)
                await s.connect()
                await s.send(payload)
                with self.assertRaises(Closed) as caught:
                    await s.receive("welcome")
                self.assertEqual(caught.exception.reason, expected)
        binary = self.socket(app)
        await binary.connect()
        await binary.incoming.put({"type": "websocket.receive", "bytes": b"binary"})
        with self.assertRaises(Closed) as caught:
            await binary.event()
        self.assertEqual(caught.exception.code, 1003)

    async def test_chat_flood_is_limited_and_presence_is_removed(self):
        app, runtime = self.worker()
        socket = self.socket(app)
        welcome = await socket.join()
        for i in range(3):
            await socket.send(dict(type="chat", text=f"message {i}"))
        with self.assertRaises(Closed) as caught:
            while True:
                await socket.event()
        self.assertEqual(caught.exception.reason, "chat_rate_limit")
        self.assertFalse(await runtime.redis.hget(runtime.keys("bjut", "127.0.0.1")[0], welcome["self"]["id"]))

    async def test_expired_worker_presence_is_reaped_and_cannot_reappear(self):
        _, runtime = self.worker()
        keys = runtime.keys("bjut", "127.0.0.1")
        old, live = new_player("old"), new_player("live")
        await runtime.presence(keys, "join", old)
        await runtime.redis.zadd(keys[1], {old["id"]: 1})
        snapshot = await runtime.presence(keys, "join", live)
        self.assertEqual(set(snapshot["players"]), {live["id"]})
        with self.assertRaises(CampusClose) as caught:
            await runtime.presence(keys, "state", old)
        self.assertEqual(caught.exception.reason, "lease_lost")

    async def test_redis_failure_does_not_fall_back_to_split_local_rooms(self):
        app, runtime = self.worker()
        runtime.redis.eval = AsyncMock(side_effect=ConnectionError("offline"))
        with self.assertRaises(Closed) as caught:
            await self.socket(app).connect()
        self.assertEqual(caught.exception.reason, "service_unavailable")
        self.assertFalse(runtime.active)

    async def test_quiet_pubsub_survives_real_client_socket_timeout(self):
        # A small RESP endpoint exercises redis-py's actual socket handling;
        # fakeredis alone does not reproduce production idle read timeouts.
        connections = []

        async def respond(reader, writer):
            connections.append(writer)
            try:
                while line := await reader.readline():
                    args = []
                    for _ in range(int(line[1:])):
                        size = int((await reader.readline())[1:])
                        args.append((await reader.readexactly(size + 2))[:-2])
                    if args[0].upper() == b"SUBSCRIBE":
                        channel = args[1]
                        writer.write(b"*3\r\n$9\r\nsubscribe\r\n$" +
                                     str(len(channel)).encode() + b"\r\n" + channel + b"\r\n:1\r\n")
                    else:
                        writer.write(b"+OK\r\n")
                    await writer.drain()
            except (asyncio.IncompleteReadError, OSError):
                pass
            finally:
                writer.close()
                await writer.wait_closed()

        server = await asyncio.start_server(respond, "127.0.0.1", 0)
        wire = Redis(host="127.0.0.1", port=server.sockets[0].getsockname()[1],
                     socket_timeout=.05, decode_responses=True,
                     lib_name=None, lib_version=None, retry=Retry(NoBackoff(), 0))
        app, runtime = self.worker(campus_heartbeat_seconds=1)
        socket = self.socket(app)
        try:
            with patch.object(runtime.redis, "pubsub", side_effect=wire.pubsub):
                welcome = await socket.join()
                snapshot = await socket.receive("snapshot")
                self.assertEqual(snapshot["players"][0]["id"], welcome["self"]["id"])
                self.assertFalse(socket.task.done())
                self.assertEqual(len(connections), 1)
                await socket.send(dict(type="pong"))
        finally:
            await socket.close()
            await wire.aclose()
            server.close()
            await server.wait_closed()
            for writer in connections:
                writer.close()
            await asyncio.gather(*(writer.wait_closed() for writer in connections))

    async def test_heartbeat_snapshot_pong_and_idle_cleanup(self):
        app, _ = self.worker(campus_heartbeat_seconds=1, campus_idle_seconds=5, campus_lease_seconds=30)
        socket = self.socket(app)
        welcome = await socket.join()
        snap = await socket.receive("snapshot")
        self.assertEqual(snap["players"][0]["id"], welcome["self"]["id"])
        await socket.receive("ping")
        await socket.send(dict(type="pong"))
        await socket.receive("ping")
        with self.assertRaises(Closed) as caught:
            async with asyncio.timeout(8):
                while True:
                    await socket.event()
        self.assertEqual(caught.exception.reason, "heartbeat_timeout")

    async def test_slow_consumer_is_disconnected_without_blocking_room(self):
        app, runtime = self.worker()
        socket = self.socket(app)
        await socket.join()
        socket.block_sends = True
        for i in range(90):
            await runtime.redis.publish(runtime.keys("bjut", "127.0.0.1")[3],
                                        json.dumps({"type": "chat", "text": str(i)}))
            await asyncio.sleep(0)
        with self.assertRaises(Closed) as caught:
            await socket.event(timeout=4)
        self.assertEqual(caught.exception.reason, "slow_consumer")
        self.assertEqual(caught.exception.code, 1013)

    async def test_shutdown_closes_sockets_and_releases_capacity(self):
        app, runtime = self.worker()
        socket = self.socket(app)
        await socket.join()
        await runtime.close()
        self.assertFalse(runtime.active)
        self.assertEqual(await runtime.redis.zcard(runtime.keys("bjut", "127.0.0.1")[1]), 0)


class MessageTests(unittest.TestCase):
    def test_chat_limit_counts_unicode_characters(self):
        for character in ["你", "😀"]:
            with self.subTest(character=character):
                text = character * 200
                self.assertEqual(CLIENT_MESSAGE.validate_python(dict(type="chat", text=text)).text, text)
                with self.assertRaises(ValidationError):
                    CLIENT_MESSAGE.validate_python(dict(type="chat", text=character * 201))

    def test_capacity_default_and_validation_limits(self):
        self.assertEqual(Settings(_env_file=None).campus_room_capacity, 1024)
        self.assertEqual(Settings(_env_file=None, campus_room_capacity=1024).campus_room_capacity, 1024)
        for capacity in [1, 1025]:
            with self.subTest(capacity=capacity), self.assertRaises(ValidationError):
                Settings(_env_file=None, campus_room_capacity=capacity)

    def test_untrusted_state_values_are_rejected(self):
        base = dict(type="state", seq=1, position=dict(x=0, y=0, z=0), heading=0)
        for patch in [dict(seq=True), dict(seq=0), dict(id="spoof"), dict(action="admin"),
                      dict(heading=float("nan")), dict(position=dict(x=9999, y=0, z=0)),
                      dict(position=dict(x=0, y=-100, z=0)), dict(heading="0")]:
            with self.subTest(patch=patch), self.assertRaises(ValidationError):
                CLIENT_MESSAGE.validate_python({**base, **patch})
        for name in [" ", "bad\u202ename", "bad\x00name"]:
            with self.assertRaises(ValidationError):
                CLIENT_MESSAGE.validate_python(dict(type="join", nickname=name))

    def test_invalid_room_origin_and_timing_configuration_are_rejected(self):
        for options in [dict(campus_rooms=[]), dict(campus_rooms=["../escape"]),
                        dict(campus_allowed_origins=["*"]),
                        dict(campus_heartbeat_seconds=30, campus_idle_seconds=5),
                        dict(campus_lease_seconds=30)]:
            with self.subTest(options=options), self.assertRaises(ValidationError):
                Settings(_env_file=None, **options)


if __name__ == "__main__":
    unittest.main()
