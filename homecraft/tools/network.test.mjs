import assert from 'node:assert/strict';
import test from 'node:test';
import { campusSocketURL, createCampusConnection } from '../world/network.js';

class Socket {
  static all = [];
  readyState = 0; bufferedAmount = 0; sent = [];
  constructor(url) { this.url = url; Socket.all.push(this); }
  open() { this.readyState = 1; this.onopen(); }
  send(value) { this.sent.push(JSON.parse(value)); }
  event(value) { this.onmessage({ data: JSON.stringify(value) }); }
  close(code, reason) { this.readyState = 3; this.closed = { code, reason }; this.onclose?.({ code, reason }); }
}
const player = (id, seq = 0) => ({ id, nickname: id, position: { x: 0, y: 0, z: 0 }, heading: 0, action: 'idle', seq, updated_at: 100 + seq });
function setup(onChat) {
  const client = createCampusConnection({ url: 'ws://localhost/ws', nickname: 'visitor', Socket, onChat });
  client.connect(); const socket = Socket.all.at(-1); socket.open(); return { client, socket };
}

test('deployment under /campus/ uses the root API and secure same-origin WebSocket', () => {
  assert.equal(campusSocketURL('', new URL('https://daixiaokang.com/campus/')), 'wss://daixiaokang.com/api/campus/ws');
  assert.equal(campusSocketURL('', new URL('http://localhost:4175/')), 'ws://127.0.0.1:8000/api/campus/ws');
  assert.throws(() => campusSocketURL('ws://example.test/ws', new URL('https://example.test/')));
});

test('welcome, state sequencing, snapshots, heartbeat and departure reconcile peers', () => {
  const { client, socket } = setup();
  try {
    assert.deepEqual(socket.sent[0], { type: 'join', room: 'bjut', nickname: 'visitor' });
    socket.event({ type: 'welcome', protocol: 1, self: player('self'), players: [player('peer', 2)], capacity: 1024 });
    socket.event({ type: 'player_state', player: player('peer', 1) });
    assert.equal(client.state.players.get('peer').seq, 2);
    socket.event({ type: 'ping' }); assert.equal(socket.sent.at(-1).type, 'pong');
    client.update({ x: 1, y: 0, z: 0 }, 0, 'walk');
    client.update({ x: 1, y: 0, z: 0 }, 0, 'walk');
    assert.equal(socket.sent.filter(e => e.type === 'state').length, 1);
    assert.equal(socket.sent.at(-1).seq, 1);
    socket.event({ type: 'snapshot', players: [player('self'), player('other')] });
    assert.deepEqual([...client.state.players.keys()], ['other']);
    socket.event({ type: 'player_left', player_id: 'other' }); assert.equal(client.state.players.size, 0);
  } finally { client.stop(); }
});

test('full-room fallback preserves single mode without sending state or reconnecting', () => {
  const { client, socket } = setup();
  try {
    socket.event({ type: 'fallback', mode: 'single', reason: 'room_full', capacity: 1024 });
    assert.equal(client.state.mode, 'single'); assert.equal(client.state.reason, 'room_full');
    assert.deepEqual(socket.closed, { code: 1000, reason: 'room_full' });
    client.update({ x: 0, y: 0, z: 0 }, 0, 'idle'); assert.equal(socket.sent.length, 1);
    assert.equal(client.chat('hello'), 'offline');
  } finally { client.stop(); }
});

test('chat is echoed once, validates text and throttles before the server disconnects', () => {
  const chats = [], { client, socket } = setup(event => chats.push(event));
  try {
    socket.event({ type: 'welcome', protocol: 1, self: player('self'), players: [], capacity: 1024 });
    assert.equal(client.chat('你好', 0), null);
    assert.equal(client.chat('too fast', 1), 'rate_limit');
    assert.equal(client.chat('next', 2100), null);
    assert.equal(client.chat('bad\u202ename', 5000), 'invalid');
    assert.equal(client.chat('你'.repeat(201), 5000), 'invalid');
    assert.equal(client.chat('😀'.repeat(201), 5000), 'invalid');
    assert.equal(client.chat('😀'.repeat(200), 5000), null);
    assert.equal(socket.sent.at(-1).text, '😀'.repeat(200));
    const message = { type: 'chat', message_id: 'one', player_id: 'self', nickname: 'visitor', text: '<script>plain text</script>' };
    socket.event(message); socket.event(message); assert.equal(chats.length, 1);
  } finally { client.stop(); }
});

test('late packets from replaced sockets cannot restore old identities', () => {
  const { client, socket } = setup();
  try {
    client.connect(); socket.event({ type: 'welcome', protocol: 1, self: player('old'), players: [] });
    assert.equal(client.state.self, null);
  } finally { client.stop(); }
});

test('an unknown moving peer immediately refreshes membership and malformed events are ignored', () => {
  const memberships = [];
  const client = createCampusConnection({ url: 'ws://localhost/ws', nickname: 'visitor', Socket, onChange: state => memberships.push([...state.players.keys()]) });
  client.connect(); const socket = Socket.all.at(-1); socket.open();
  try {
    for (const value of [null, [], 42, 'unexpected']) assert.doesNotThrow(() => socket.event(value));
    socket.event({ type: 'welcome', protocol: 1, self: player('self'), players: [], capacity: 1024 });
    socket.event({ type: 'player_state', player: player('new-peer', 3) });
    assert.deepEqual(memberships.at(-1), ['new-peer']);
    const count = memberships.length;
    socket.event({ type: 'player_state', player: player('new-peer', 4) });
    assert.equal(memberships.length, count);
    assert.equal(client.state.players.get('new-peer').seq, 4);
  } finally { client.stop(); }
});

test('network loss clears stale presence and retries, while policy rejection stops retrying', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0);
  const { client, socket } = setup();
  try {
    socket.event({ type: 'welcome', protocol: 1, self: player('old-self'), players: [player('peer')], capacity: 1024 });
    socket.close(1006, '');
    assert.equal(client.state.mode, 'single');
    assert.equal(client.state.self, null);
    assert.equal(client.state.players.size, 0);
    t.mock.timers.tick(1000);
    const replacement = Socket.all.at(-1); assert.notEqual(replacement, socket);
    replacement.open(); assert.equal(replacement.sent[0].nickname, 'visitor');
    replacement.event({ type: 'welcome', protocol: 1, self: player('new-self'), players: [], capacity: 1024 });
    assert.equal(client.state.mode, 'online'); assert.equal(client.state.self.id, 'new-self');
    replacement.close(1008, 'connection_limit');
    const count = Socket.all.length; t.mock.timers.tick(60000);
    assert.equal(Socket.all.length, count); assert.equal(client.state.mode, 'single');
  } finally { client.stop(); }
});

test('repeated connection failures stop after five retries', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0);
  const { client } = setup();
  try {
    for (let i = 0; i < 5; i++) { Socket.all.at(-1).close(1006, ''); t.mock.timers.tick(1000 * 2 ** i); }
    Socket.all.at(-1).close(1006, '');
    const count = Socket.all.length; t.mock.timers.tick(120000);
    assert.equal(Socket.all.length, count); assert.equal(client.state.mode, 'single');
  } finally { client.stop(); }
});
