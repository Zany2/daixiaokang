import * as THREE from 'three';
import { createAvatar } from '@engine/world/avatar.js';
import { campusSocketURL, createCampusConnection } from './network.js';

const MAX_VISIBLE = 48;
export function playerColor(id) {
  let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 65% 55%)`;
}
function guestName() {
  try {
    let name = sessionStorage.getItem('campus-guest-name');
    if (!name) { name = `访客${Math.random().toString(36).slice(2, 6)}`; sessionStorage.setItem('campus-guest-name', name); }
    return name;
  } catch { return `访客${Math.random().toString(36).slice(2, 6)}`; }
}

export function mountMultiplayer({ stage, player, avatar, rig, config }, root) {
  const options = config.multiplayer || {};
  const ui = document.createElement('section'); ui.className = 'campus-chat'; ui.setAttribute('aria-label', '校园聊天');
  ui.innerHTML = `<button type="button" class="campus-chat-toggle" aria-expanded="true" aria-controls="campus-chat-body"><span>校园聊天</span><small class="campus-online" role="status">单人漫游</small><b aria-hidden="true">⌃</b></button>
    <p class="campus-room-announcement" role="status" hidden></p>
    <div id="campus-chat-body"><p class="campus-identity"></p><div class="campus-chat-log" role="log" aria-live="polite" aria-label="本次会话的校园聊天"></div>
    <p class="campus-chat-notice" role="status">本页保留最近 100 条，刷新清空 · 气泡显示 3 秒</p>
    <form class="campus-chat-form"><input type="text" maxlength="400" aria-label="聊天内容" placeholder="按 Enter 输入，最多 200 字" autocomplete="off" enterkeyhint="send" disabled><button type="submit" disabled>发送</button></form>
    <div class="campus-chat-actions"><button type="button" data-network="join">重试联机</button><button type="button" data-network="solo" hidden>单人漫游</button><span>彩色圆点：其他玩家 · 白色箭头：自己</span></div></div>`;
  root.append(ui);
  const toggle = ui.querySelector('.campus-chat-toggle'), body = ui.querySelector('#campus-chat-body');
  const online = ui.querySelector('.campus-online'), identity = ui.querySelector('.campus-identity');
  const announcement = ui.querySelector('.campus-room-announcement');
  const log = ui.querySelector('.campus-chat-log'), notice = ui.querySelector('.campus-chat-notice');
  const input = ui.querySelector('input'), form = ui.querySelector('form'), submit = form.querySelector('button');
  const join = ui.querySelector('[data-network=join]'), solo = ui.querySelector('[data-network=solo]');
  const overlays = document.createElement('div'); overlays.className = 'campus-player-overlays'; root.append(overlays);
  const bubbles = new Map(), mapPeers = [], slots = [], batches = [], candidates = [];
  const group = new THREE.Group(); group.name = 'campus-remote-players'; stage.scene.add(group);
  const projected = new THREE.Vector3();
  let tick = 0, labelsTick = 0, started = false, count = 0, ownTag, wasOnline = false, announcementTimer;
  let followChat = true, historyAnchor = null, historyOffset = 0;
  function expand(open) {
    if (!open && !body.hidden) {
      followChat = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
      const top = log.getBoundingClientRect().top;
      historyAnchor = followChat ? null : [...log.children].find(row => row.getBoundingClientRect().bottom > top);
      historyOffset = historyAnchor ? historyAnchor.getBoundingClientRect().top - top : 0;
    }
    body.hidden = !open; ui.classList.toggle('expanded', open); toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      if (followChat) log.scrollTop = log.scrollHeight;
      else if (historyAnchor?.parentElement === log) log.scrollTop += historyAnchor.getBoundingClientRect().top - log.getBoundingClientRect().top - historyOffset;
      else log.scrollTop = 0;
    }
  }
  expand(innerWidth > 900);
  toggle.addEventListener('click', () => expand(body.hidden));
  log.addEventListener('scroll', () => {
    if (!body.hidden) followChat = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
  }, { passive: true });
  const logResize = new ResizeObserver(() => {
    if (!body.hidden && followChat) log.scrollTop = log.scrollHeight;
  });
  logResize.observe(log);

  function makeTag() {
    const element = document.createElement('div'); element.className = 'campus-player-tag'; element.hidden = true;
    const bubble = document.createElement('div'); bubble.className = 'campus-speech'; bubble.hidden = true;
    const label = document.createElement('span'); label.className = 'campus-player-name'; element.append(bubble, label); overlays.append(element);
    return { element, label, bubble };
  }
  function changed(state) {
    const connected = state.mode === 'online';
    if (connected && !wasOnline) {
      announcement.hidden = false; clearTimeout(announcementTimer);
      announcementTimer = setTimeout(() => { announcement.hidden = true; }, 6000);
    }
    if (connected) announcement.textContent = `加入房间成功，当前共 ${state.players.size + 1} 名在线用户`;
    else { announcement.hidden = true; clearTimeout(announcementTimer); }
    wasOnline = connected;
    ui.dataset.mode = state.mode;
    online.textContent = connected ? `${state.players.size + 1} 人在线` : state.mode === 'connecting' ? '连接中…' : '单人漫游';
    identity.textContent = state.self ? `我的昵称：${state.self.nickname}` : '进入房间后自动分配随机昵称';
    identity.title = state.self?.id || '';
    input.disabled = submit.disabled = !connected;
    join.hidden = connected || state.mode === 'connecting'; solo.hidden = !connected;
    notice.textContent = connected ? '本页保留最近 100 条，刷新清空 · 气泡显示 3 秒' : state.reason === 'room_full' ? '校园人数已满，已进入单人漫游；可手动重试' : state.mode === 'connecting' ? '正在加入校园房间，地图可以继续浏览' : '当前为单人漫游，地图与地点介绍可正常使用';
    mapPeers.length = 0;
    for (const peer of state.players.values()) { peer.color = playerColor(peer.id); mapPeers.push(peer); }
    if (!connected) { count = 0; bubbles.clear(); for (const batch of batches) batch.count = 0; for (const slot of slots) slot.tag.element.hidden = true; if (ownTag) ownTag.element.hidden = true; }
  }
  function chat(event) {
    const visible = !body.hidden;
    const nearBottom = visible ? log.scrollHeight - log.scrollTop - log.clientHeight < 50 : followChat;
    const previousTop = log.scrollTop;
    const removedHeight = log.children.length >= 100 ? log.children[1].offsetTop - log.children[0].offsetTop : 0;
    const row = document.createElement('p'), author = document.createElement('strong'), text = document.createElement('span');
    author.textContent = `${event.nickname}：`;
    author.style.color = playerColor(event.player_id); text.textContent = event.text;
    row.append(author, text); log.append(row); if (log.children.length > 100) log.firstElementChild.remove();
    if (visible) log.scrollTop = nearBottom ? log.scrollHeight : Math.max(0, previousTop - removedHeight);
    bubbles.set(event.player_id, { text: event.text, until: performance.now() + 3000 });
    if (bubbles.size > 100) bubbles.delete(bubbles.keys().next().value);
  }
  let endpoint;
  try { endpoint = campusSocketURL(options.endpoint); } catch { endpoint = null; }
  const connection = createCampusConnection({ url: endpoint, room: options.room || 'bjut', nickname: guestName(), onChange: changed, onChat: chat });
  const enabled = options.enabled !== false && endpoint !== null;
  changed(connection.state);
  join.disabled = !enabled;
  join.addEventListener('click', () => connection.connect());
  solo.addEventListener('click', () => connection.stop());
  input.addEventListener('focus', () => { player.cancel(); dispatchEvent(new Event('blur')); });
  const trimInput = () => { input.value = Array.from(input.value).slice(0, 200).join(''); };
  input.addEventListener('input', event => { if (!event.isComposing) trimInput(); });
  input.addEventListener('compositionend', trimInput);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const error = connection.chat(input.value);
    if (error) { notice.textContent = error === 'rate_limit' ? '发送太快，请稍等两秒' : error === 'invalid' ? '请输入 1～200 字，避免特殊控制字符' : '当前未联机，请先连接房间'; return; }
    input.value = ''; notice.textContent = '本页保留最近 100 条，刷新清空 · 气泡显示 3 秒';
  });
  addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.target === input) {
      if (event.key === 'Escape') { input.blur(); event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (event.key !== 'Enter' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || connection.state.mode !== 'online') return;
    if (event.target?.matches?.('input,textarea,select,[contenteditable=true],button,a') || document.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); expand(true); input.focus();
  }, true);
  addEventListener('pagehide', () => connection.stop());
  addEventListener('pageshow', event => { if (event.persisted && enabled) connection.connect(); });

  function slotAt(index) {
    if (slots[index]) return slots[index];
    const model = createAvatar(''), meshes = [];
    model.root.traverseVisible(object => { if (object.isMesh && !Array.isArray(object.material)) meshes.push(object); });
    if (!batches.length) for (const part of meshes) {
      const batch = new THREE.InstancedMesh(part.geometry, part.material, MAX_VISIBLE);
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.frustumCulled = false; batch.count = 0; batch.receiveShadow = true;
      group.add(batch); batches.push(batch);
    }
    const slot = { model, meshes, tag: makeTag(), id: '', x: 0, y: 0, z: 0, heading: 0 }; slots.push(slot); return slot;
  }
  function placeTag(tag, data, x, y, z, isSelf, now) {
    const distance = Math.hypot(x - stage.camera.position.x, y - stage.camera.position.y, z - stage.camera.position.z);
    projected.set(x, y + 2.12, z).project(stage.camera);
    const visible = !rig.showcaseActive && (!isSelf || avatar.root.visible) && distance < 160 && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98;
    tag.element.hidden = !visible;
    if (!visible) return;
    tag.element.style.transform = `translate(${(projected.x + 1) * innerWidth / 2}px,${(1 - projected.y) * innerHeight / 2}px) translate(-50%,-100%)`;
    tag.element.dataset.playerId = data.id;
    tag.label.textContent = `${data.nickname}${isSelf ? '（我）' : ''}`;
    tag.label.style.borderColor = playerColor(data.id);
    const bubble = bubbles.get(data.id);
    tag.bubble.hidden = !bubble || bubble.until < now;
    if (!tag.bubble.hidden) tag.bubble.textContent = bubble.text;
  }
  return {
    connection, mapPeers,
    get visibleCount() { return count; },
    update(dt) {
      if (!started && window.__home) { started = true; if (enabled) connection.connect(); }
      tick += dt;
      if (tick >= .1) {
        tick = 0;
        connection.update({ x: Math.max(-600, Math.min(640, player.pos.x)), y: Math.max(0, Math.min(160, player.y)), z: Math.max(-480, Math.min(480, player.pos.z)) }, player.heading, player.flying ? 'fly' : player.mode === 'air' ? 'jump' : player.moving ? 'walk' : 'idle');
      }
      if (connection.state.mode !== 'online') return;
      candidates.length = 0;
      for (const data of mapPeers) {
        data.distance = (data.position.x - player.pos.x) ** 2 + (data.position.z - player.pos.z) ** 2;
        if (data.distance < 180 ** 2) candidates.push(data);
      }
      candidates.sort((a, b) => a.distance - b.distance);
      count = Math.min(MAX_VISIBLE, candidates.length);
      labelsTick += dt; const refreshLabels = labelsTick >= .1, now = performance.now();
      if (refreshLabels) { labelsTick = 0; stage.camera.updateMatrixWorld(); }
      for (let i = 0; i < count; i++) {
        const data = candidates[i], slot = slotAt(i), p = data.position;
        if (slot.id !== data.id) { slot.id = data.id; slot.x = p.x; slot.y = p.y; slot.z = p.z; slot.heading = data.heading; }
        const ease = Math.min(1, dt * 12);
        slot.x += (p.x - slot.x) * ease; slot.y += (p.y - slot.y) * ease; slot.z += (p.z - slot.z) * ease;
        const turn = data.heading - slot.heading;
        slot.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * ease;
        slot.model.root.position.set(slot.x, slot.y, slot.z); slot.model.root.rotation.y = slot.heading;
        slot.model.update(dt, { speed: data.action === 'walk' ? .45 : data.action === 'run' ? .8 : 0, run: data.action === 'run', fly: data.action === 'fly' ? .3 : -1, air: data.action === 'jump' });
        slot.model.root.updateMatrixWorld(true);
        for (let j = 0; j < batches.length; j++) batches[j].setMatrixAt(i, slot.meshes[j].matrixWorld);
        if (refreshLabels) placeTag(slot.tag, data, slot.x, slot.y, slot.z, false, now);
      }
      for (const batch of batches) { batch.count = count; batch.instanceMatrix.needsUpdate = true; }
      for (let i = count; i < slots.length; i++) slots[i].tag.element.hidden = true;
      if (refreshLabels && connection.state.self) {
        ownTag ||= makeTag(); placeTag(ownTag, connection.state.self, player.pos.x, player.y, player.pos.z, true, now);
      }
    },
  };
}
