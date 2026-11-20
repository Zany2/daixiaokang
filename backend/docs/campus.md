# Campus multiplayer backend (protocol 1)

The backend extends the existing FastAPI application at `WS /api/campus/ws`.
It does not serve campus assets or render avatars. The `homecraft` client must
still implement networking, remote avatars, interpolation and chat UI.

## Deployment and configuration

Reuse the existing backend start command and `REDIS_URL`. No new PostgreSQL
tables, migrations, Node.js process or service ports are required. WebSocket
support is supplied by the existing `uvicorn[standard]` runtime dependency.

The example environment files include these optional settings:

| Setting | Default | Meaning |
| --- | --- | --- |
| `CAMPUS_ENABLED` | `true` | Enable the endpoint |
| `CAMPUS_ROOMS` | `["bjut"]` | 1–16 allowed room names; lowercase letters, digits, hyphens |
| `CAMPUS_ALLOWED_ORIGINS` | Main website + localhost/127.0.0.1 port 4175 | Exact browser origins, with scheme and optional port, without a path or trailing slash |
| `CAMPUS_ROOM_CAPACITY` | `1024` | Admission limit per room (2-1024), across all workers; not a tested performance capacity |
| `CAMPUS_CONNECTIONS_PER_IP` | `4` | Maximum live guest connections per IP across rooms and workers |
| `CAMPUS_HEARTBEAT_SECONDS` | `15` | Snapshot and application ping interval |
| `CAMPUS_IDLE_SECONDS` | `45` | Close connections with no valid incoming messages |
| `CAMPUS_LEASE_SECONDS` | `90` | Presence lease after a worker or network failure |

Idle timeout must cover at least two heartbeat intervals. Lease duration must
exceed idle timeout plus heartbeat interval. All workers must use matching
configuration, map bounds and the same Redis database. The Lua scripts require
a standalone Redis instance (or a compatible single-primary service), not
Redis Cluster: global IP and per-room keys are used together atomically.

Production origins should only list the deployed site's origins, as shown in
`.env.docker.example`. Add the actual localhost preview port for local testing.
HTTP CORS middleware does not enforce WebSocket Origin; the endpoint explicitly
rejects missing, `null`, wildcard and unlisted origins before accepting. Origin
is a browser access restriction, not authentication; non-browser clients can
forge it. Nicknames are unverified guest labels and need not be unique.

Keep `TRUSTED_HOSTS` aligned with the backend hostname. Forward trusted client
addresses through the existing Uvicorn proxy settings; the endpoint uses the
ASGI client address and does not trust raw `X-Forwarded-For`. If the proxy is
misconfigured, all visitors may share the proxy's IP connection quota.

For public access, the existing gateway must proxy the new WebSocket path to
this backend, explicitly forwarding Upgrade/Connection and preserving the
`/api/campus/ws` path. An example to adapt to the current gateway:

```nginx
# Inside the existing HTTPS server; replace the upstream name/port as needed.
location = /api/campus/ws {
    proxy_pass http://YOUR_BACKEND:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
}
```

Use `wss://` from an HTTPS campus. Static assets can still use COS/CDN. The
WebSocket route must reach a WebSocket-capable proxy and is not a cached HTTP
response. Actual gateway files and production environment files were not changed.

Application messages are limited to 4,096 UTF-8 bytes. For public deployment,
also set Uvicorn's transport limit (for example `--ws-max-size 4096 --ws-max-queue 16`
with its `websockets` backend) so oversized frames are bounded before ASGI
delivery. The application size check alone cannot cap pre-delivery buffering.

## Connecting

Send this within ten seconds of acceptance:

```json
{"type":"join","room":"bjut","nickname":"访客小康"}
```

On successful admission, the server chooses the player id and spawn point.
`welcome` is the first application message:

```json
{
  "type":"welcome",
  "protocol":1,
  "room":"bjut",
  "self":{
    "id":"SERVER_GENERATED_ID","nickname":"访客小康",
    "position":{"x":-235.25,"y":0,"z":412},
    "heading":3.141592653589793,"action":"idle","seq":0,
    "updated_at":1790000000000
  },
  "players":[],
  "capacity":1024,
  "heartbeat_seconds":15,
  "idle_seconds":45,
  "at":1790000000000
}
```

`players` in welcome excludes self. Spawn coordinates match the current south
gate. Positions use scene meters: x east, y up, z south. `at` / `updated_at` are
Unix milliseconds. Subsequent online counts can be derived from the player map.

If the room is full, the first message is instead:

```json
{"type":"fallback","protocol":1,"mode":"single","reason":"room_full","room":"bjut","capacity":1024}
```

The server then closes normally with code `1000` and reason `room_full`.
No player or room/IP presence lease is created for this visitor. Existing
players remain connected. The client should keep the current map and position,
stop networking and clear remote avatars, state updates, heartbeat and reconnect
timers. Show a nonblocking notice such as "校园人数已满，已进入单人漫游".
Continue local navigation and place cards without multiplayer chat or avatars;
do not automatically retry until the user requests multiplayer again. An
explicit new join can succeed after a player leaves or their lease expires.
The `homecraft` frontend implements this fallback and offers a manual retry.

## Client messages

Only text JSON objects are accepted. Extra fields, invalid types, non-finite
numbers, control characters and unknown message types are rejected. Nicknames
are trimmed and must contain 1–24 characters. Client ids/roles are never trusted
or accepted in state/chat payloads.

```json
{"type":"state","seq":1,"position":{"x":-234,"y":0,"z":410},"heading":0.5,"action":"walk"}
{"type":"chat","text":"一起逛校园吧！"}
{"type":"pong"}
{"type":"leave"}
```

- `state`: send at most 20 times/second, preferably 10–15. `seq` must strictly
  increase on that connection (maximum `2^53-1`). An old sequence returns
  `{"type":"error","code":"stale_sequence"}` without changing state.
- Position bounds: x `[-600,640]`, y `[0,160]`, z `[-480,480]`. Heading is radians,
  bounded on input and normalized to `[0,2π)`. Actions: `idle`, `walk`, `run`,
  `jump`, `fly`. Default action is `idle`. These bounds are not a physics or
  anti-cheat simulation; movement speed, walls and teleport destinations are
  not authoritative on the server.
- `chat`: trimmed plain text, 1–200 Unicode code points. Maximum two initial messages,
  then one token replenished every two seconds. No history or database writes.
  Render names and chat using `textContent`, never as HTML.
- `pong`: answer every server `ping`, including when the player is standing
  still. Any valid incoming message also resets the idle timeout.
- `leave`: close the connection cleanly and release presence.

The aggregate per-connection token bucket allows 30 messages/second with an
initial burst of 40. State has a separate 20-token bucket. More than 30 connection
attempts per IP per minute are refused. These limits are abuse controls, not
guarantees of a particular server capacity. Shared campus room/IP leases use
Redis; per-socket message buckets stay local to the owning connection.

## Server events and client reconciliation

| Type | Payload | Handling |
| --- | --- | --- |
| `fallback` | `protocol`, `mode=single`, `reason=room_full`, `room`, `capacity` | Keep local roaming and stop networking; sent instead of welcome for a full room |
| `player_joined` | `player`, `at` | Upsert by server player id |
| `player_state` | `player`, `at` | Update remote position/action, interpolate locally |
| `player_left` | `player_id`, `reason`, `at` | Remove the remote avatar |
| `chat` | `message_id`, `player_id`, `nickname`, `text`, `at` | Append a plain-text message |
| `snapshot` | `players`, `at` | Replace membership using this authoritative full list, including self |
| `ping` | No extra fields | Reply with `pong` |
| `error` | `code` | Recoverable stale-sequence notice |

Own join/state messages are not echoed. Own chat messages are echoed, so append
the server event rather than inserting a duplicate optimistic copy. Snapshots
include current state for every connected player. Derive online count from
unique ids, not event counts. Queueing around admission or Redis resubscription
can produce duplicate/replayed join/state events. Upsert by id, ignore older
`seq` / `updated_at`, and reconcile periodic full snapshots. Pub/Sub is not a
durable chat log; missed chat messages are not replayed.

Reconnect with backoff and send a new `join`. Reconnection gets a new player id;
it does not take over an old socket. Normal disconnect removes the player
immediately. If a worker crashes, another room member's next join, state update
or heartbeat reaps expired leases and broadcasts `player_left`. With default
settings, a crashed worker's state can remain visible for about 90–105 seconds.
Do not assume a returning guest is the same person based on nickname.

The outbox is bounded to 64 messages per connection. Slow clients are closed
rather than blocking the room. Welcome and queued sends have a three-second
timeout. Pub/Sub uses bounded polling so an idle room does not trigger the
shared Redis client's short socket timeout. Shutdown closes sockets and releases
leases before closing Redis.
Redis failure closes/refuses multiplayer; no per-worker fallback room is created.

Close codes after acceptance:

| Code | Meaning / examples |
| --- | --- |
| `1000` | Normal leave, or full-room single-player fallback after the `fallback` event |
| `1001` | Server shutdown |
| `1003` | Binary frame instead of text JSON |
| `1008` | Invalid join/message/origin, connection/message/chat limits, heartbeat timeout |
| `1009` | Oversized application message |
| `1011` | Unexpected internal failure |
| `1013` | Redis unavailable, lost lease, slow client |

Denials before WebSocket acceptance normally appear as an HTTP handshake
failure, so the browser may report an abnormal close instead of the supplied
close code. Do not retry policy failures in a tight loop.

## Files and verification

- `controller/campus.py`: Origin/feature gate and WebSocket route.
- `schemas/campus.py`: Discriminated input schemas.
- `services/campus.py`: Atomic Redis presence, Pub/Sub, quotas, queues and cleanup.
- `main.py`: Route registration and lifecycle integration.
- `tests/test_campus.py`: Offline ASGI tests using shared fakeredis + actual Lua.

Run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest tests.test_campus -v
```

These tests do not access business databases or production Redis. They verify
separate runtime instances sharing a Redis emulator, not a live gateway/TLS or
production performance. Before deployment, test against the actual Redis and
gateway and measure the number of visible avatars the mobile client can render.
