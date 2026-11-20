// Protocol 1 client. Chat history belongs to the current page, not storage.
export function campusSocketURL(endpoint = '', location = globalThis.location) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const url = new URL(endpoint || (local ? 'http://127.0.0.1:8000/api/campus/ws' : '/api/campus/ws'), location.href);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (!['ws:', 'wss:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) throw Error('Invalid campus WebSocket URL');
  return url.href;
}

export function createCampusConnection({ url, room = 'bjut', nickname, onChange = () => {}, onChat = () => {}, Socket = globalThis.WebSocket }) {
  const state = { mode: 'single', reason: 'initial', self: null, capacity: 0, players: new Map() };
  let socket, retry, helloTimer, stopped = true, attempts = 0, seq = 0, lastChat = -Infinity;
  let lastFrame = '';
  const seen = new Set();
  const change = () => onChange(state);
  function clearTimers() { clearTimeout(retry); clearTimeout(helloTimer); }
  function clearPresence(mode, reason) {
    state.mode = mode; state.reason = reason; state.self = null; state.players.clear(); change();
  }
  function send(message) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 65536) return false;
    try { socket.send(JSON.stringify(message)); return true; }
    catch { return false; }
  }
  function upsert(player) {
    if (!player || player.id === state.self?.id || typeof player.id !== 'string' || !player.position) return;
    const old = state.players.get(player.id);
    if (old && (player.seq < old.seq || (player.seq === old.seq && player.updated_at < old.updated_at))) return;
    if (old) Object.assign(old, player);
    else if (state.players.size < 1024) { state.players.set(player.id, player); return true; }
  }
  function open() {
    clearTimers();
    if (stopped) return;
    clearPresence('connecting', 'connecting');
    let current;
    try { current = socket = new Socket(url); }
    catch { stopped = true; clearPresence('single', 'unavailable'); return; }
    helloTimer = setTimeout(() => { if (current === socket && state.mode !== 'online') current.close(4000, 'join_timeout'); }, 10000);
    current.onopen = () => { if (current === socket && !stopped) send({ type: 'join', room, nickname }); };
    current.onmessage = ({ data }) => {
      if (current !== socket || stopped) return;
      let event;
      try { event = JSON.parse(data); } catch { return; }
      if (!event || typeof event !== 'object' || Array.isArray(event)) return;
      if (event.type === 'fallback' && event.mode === 'single') {
        stopped = true; clearTimers(); clearPresence('single', event.reason);
        current.close(1000, 'room_full'); return;
      }
      if (event.type === 'welcome' && event.protocol === 1 && event.self) {
        clearTimeout(helloTimer); attempts = seq = 0; lastFrame = '';
        state.mode = 'online'; state.reason = ''; state.self = event.self; state.capacity = event.capacity;
        state.players.clear(); for (const peer of event.players || []) upsert(peer);
        change(); return;
      }
      if (state.mode !== 'online') return;
      switch (event.type) {
        case 'ping': send({ type: 'pong' }); break;
        case 'player_joined': upsert(event.player); change(); break;
        case 'player_state': if (upsert(event.player)) change(); break;
        case 'player_left': state.players.delete(event.player_id); change(); break;
        case 'snapshot': {
          const ids = new Set();
          for (const peer of event.players || []) { ids.add(peer.id); upsert(peer); }
          for (const id of state.players.keys()) if (!ids.has(id)) state.players.delete(id);
          change(); break;
        }
        case 'chat':
          if (!seen.has(event.message_id) && typeof event.text === 'string') {
            seen.add(event.message_id); if (seen.size > 100) seen.delete(seen.values().next().value);
            onChat(event);
          }
          break;
      }
    };
    current.onclose = event => {
      if (current !== socket) return;
      clearTimers();
      if (stopped) return;
      if (event.reason === 'room_full') { stopped = true; clearPresence('single', 'room_full'); return; }
      const recoverable = ![1000, 1003, 1008, 1009].includes(event.code);
      clearPresence('single', event.reason || 'disconnected');
      if (recoverable && attempts < 5) retry = setTimeout(open, Math.min(30000, 1000 * 2 ** attempts++) + Math.random() * 500);
    };
    current.onerror = () => {}; // Browsers deliver the close event after an error.
  }
  function stop(reason = 'manual') {
    stopped = true; clearTimers();
    const previous = socket; socket = null;
    previous?.close(1000, 'left'); clearPresence('single', reason);
  }
  return {
    state,
    connect() { stop(); stopped = false; attempts = 0; lastChat = -Infinity; open(); },
    stop,
    update(position, heading, action) {
      if (state.mode !== 'online') return;
      const frame = JSON.stringify([position, heading, action]);
      if (frame === lastFrame) return;
      if (send({ type: 'state', seq: seq + 1, position, heading, action })) { seq++; lastFrame = frame; }
    },
    chat(text, now = Date.now()) {
      text = text.trim();
      if (state.mode !== 'online') return 'offline';
      if (!text || Array.from(text).length > 200 || /\p{C}/u.test(text.replace(/\n/g, ''))) return 'invalid';
      if (now - lastChat < 2100) return 'rate_limit';
      if (!send({ type: 'chat', text })) return 'offline';
      lastChat = now; return null;
    },
  };
}
