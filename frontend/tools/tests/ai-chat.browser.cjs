'use strict';
// Real browser lifecycle tests with an isolated local API; no real model calls.
// PLAYWRIGHT_MODULE_PATH may point to the bundled Playwright package.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../..');
const conversations = new Map();
const requests = [];
let deferAnswer = false;
let releaseAnswer;
let failHistory = false;
let deferCredentials = false;
let releaseCredentials;
let deferCreation = false;
let releaseCreation;
let initialFailure = null;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="rightside"><div id="rightside-config-show"></div></div>
<script>window.AI_CHAT_CONFIG={api_base:'/api',local_api_base:'',timeout_ms:5000};
window.fomalConfirm=()=>Promise.resolve(true);</script><script defer src="/js/ai-chat.js"></script>
</body></html>`;
const data = payload => 'data: ' + JSON.stringify(payload) + '\n\n';

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/js/ai-chat.js' || url.pathname === '/css/ai-chat.css') {
    res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(fs.readFileSync(path.join(root, 'source', url.pathname)));
    return;
  }
  if (!url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
  }
  requests.push(req.method + ' ' + url.pathname);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
  const match = /^\/api\/ai\/conversations(?:\/([^/]+)\/(messages|close))?$/.exec(url.pathname);
  if (!match) { res.writeHead(404); res.end(); return; }
  let conversation = match[1] && conversations.get(match[1]);
  if (match[1] && (!conversation || req.headers['x-conversation-token'] !== conversation.token)) {
    res.writeHead(404); res.end(); return;
  }
  if (req.method === 'GET') {
    if (failHistory) { res.writeHead(503); res.end(); return; }
    const before = Number(url.searchParams.get('before_sequence') || Infinity);
    const limit = Number(url.searchParams.get('limit') || 80);
    const all = conversation.messages.filter(item => item.sequence_no < before);
    const items = all.slice(-limit);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ items, has_more: all.length > limit,
      next_before_sequence: items[0]?.sequence_no, conversation_status: conversation.closed ? 2 : 1,
      can_continue: !conversation.closed, expires_at: new Date(Date.now() + 86400000).toISOString() }));
    return;
  }
  if (match[2] === 'close') {
    conversation.closed = true; res.writeHead(204); res.end(); return;
  }
  assert.equal(typeof body.content, 'string', 'first request includes the actual question');
  assert.ok(body.turn_id);
  const isNew = !conversation;
  if (isNew && initialFailure && !initialFailure.afterCommit) {
    res.writeHead(initialFailure.status); res.end(); return;
  }
  if (isNew) {
    if (deferCreation) await new Promise(resolve => { releaseCreation = resolve; });
    if (res.destroyed) return;
    if (conversations.has(body.turn_id)) { res.writeHead(409); res.end(); return; }
    conversation = { id: body.turn_id, token: body.creation_token, messages: [], closed: false };
    conversations.set(conversation.id, conversation);
  }
  const timestamp = new Date().toISOString();
  conversation.messages.push({ id: conversation.messages.length + 1, turn_id: body.turn_id,
    sequence_no: conversation.messages.length + 1, role: 'user', content: body.content, status: 2,
    finish_reason: null, created_at: timestamp, completed_at: timestamp });
  const answer = { id: conversation.messages.length + 1, turn_id: body.turn_id,
    sequence_no: conversation.messages.length + 1, role: 'assistant', content: '部分回答', status: 1,
    finish_reason: null, created_at: timestamp, completed_at: null };
  conversation.messages.push(answer);
  res.on('close', () => {
    if (answer.status === 1) { answer.status = 3; answer.completed_at = new Date().toISOString(); }
  });
  if (isNew && initialFailure) {
    res.writeHead(initialFailure.status); res.end(); return;
  }
  if (deferCredentials && isNew) await new Promise(resolve => { releaseCredentials = resolve; });
  if (res.destroyed) return;
  res.writeHead(isNew ? 201 : 200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  if (isNew) res.write(data({ type: 'conversation', conversation_id: conversation.id,
    conversation_token: conversation.token, expires_at: timestamp }));
  res.write(data({ choices: [{ delta: { content: answer.content } }] }));
  if (deferAnswer) await new Promise(resolve => { releaseAnswer = resolve; });
  if (res.destroyed) return;
  answer.content += '，完整回答'; answer.status = 2; answer.completed_at = new Date().toISOString();
  res.write(data({ choices: [{ delta: { content: '，完整回答' }, finish_reason: 'stop' }] }));
  res.write(data({ type: 'complete', status: 2, finish_reason: 'stop' }));
  res.end('data: [DONE]\n\n');
}

async function main() {
  const server = http.createServer((req, res) => handle(req, res).catch(error => {
    console.error(error); if (!res.headersSent) res.writeHead(500); res.end();
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = async () => {
      await page.locator('#ai-chat-btn').click();
      await page.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-open'));
    };
    const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1') || 'null'));
    const send = async text => {
      await page.locator('.ai-input').fill(text);
      await page.locator('.ai-send').click();
      await page.waitForFunction(() => !document.querySelector('#ai-chat-panel').classList.contains('ai-busy')
        && !document.querySelector('.ai-status').textContent.includes('恢复'));
    };
    const newChat = async () => {
      await page.locator('.ai-new').click();
      await page.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-empty'));
    };
    await page.goto(base); await open();
    await newChat(); await newChat();
    assert.equal(conversations.size, 0, 'opening/resetting empty panel creates no conversation');
    await send('第一条问题');
    const first = await session();
    assert.equal(conversations.size, 1);
    assert.equal(requests.filter(item => item.startsWith('POST')).length, 1, 'first turn uses one API request');
    assert.equal(conversations.get(first.id).messages.length, 2);
    await send('第二条问题');
    assert.equal((await session()).id, first.id);
    assert.equal(conversations.get(first.id).messages.length, 4);
    await page.reload(); await open();
    await page.locator('.ai-row').nth(3).waitFor();
    assert.equal((await session()).id, first.id);
    assert.match(await page.locator('.ai-bd').innerText(), /第一条问题/);
    await page.goto(base + '/another-page'); await open();
    await page.locator('.ai-row').nth(3).waitFor();
    assert.equal((await session()).id, first.id, 'full navigation keeps session');
    const other = await context.newPage(); await other.goto(base); await other.bringToFront();
    assert.equal(await other.evaluate(() => sessionStorage.getItem('ai_chat_session_v1')), null,
      'independent new tab has no inherited conversation');
    await page.bringToFront();
    assert.equal((await session()).id, first.id);
    await other.close();
    // Backgrounding a tab must not stop generation.
    deferAnswer = true;
    await page.locator('.ai-input').fill('切换标签时继续'); await page.locator('.ai-send').click();
    await page.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-busy'));
    while (!releaseAnswer) await new Promise(resolve => setTimeout(resolve, 10));
    const background = await context.newPage(); await background.goto(base); await background.bringToFront();
    deferAnswer = false; releaseAnswer(); releaseAnswer = null;
    await page.bringToFront(); await background.close();
    await page.waitForFunction(() => !document.querySelector('#ai-chat-panel').classList.contains('ai-busy'));
    assert.equal(conversations.get(first.id).messages.at(-1).status, 2);
    // Refresh during a stream keeps credentials and restores partial persisted output.
    deferAnswer = true;
    await page.locator('.ai-input').fill('刷新中的问题'); await page.locator('.ai-send').click();
    await page.waitForFunction(() => document.querySelector('.ai-bd').textContent.includes('部分回答'));
    while (!releaseAnswer) await new Promise(resolve => setTimeout(resolve, 10));
    await page.reload(); deferAnswer = false; releaseAnswer(); releaseAnswer = null; await open();
    await page.waitForFunction(() => document.querySelector('.ai-bd').textContent.includes('刷新中的问题'));
    assert.equal((await session()).id, first.id);
    assert.equal(conversations.get(first.id).messages.at(-1).status, 3);
    // Restore failures keep credentials and block sending until a retry succeeds.
    failHistory = true; await page.reload(); await open();
    await page.waitForFunction(() => document.querySelector('.ai-status').textContent.includes('恢复失败'));
    await page.locator('.ai-input').fill('不能误发'); assert.equal(await page.locator('.ai-send').isDisabled(), true);
    assert.equal((await session()).id, first.id);
    failHistory = false;
    await page.locator('.ai-close').click(); await open();
    await page.waitForFunction(() => !document.querySelector('.ai-status').textContent.includes('恢复'));
    // All records remain reachable even when a conversation exceeds one page.
    const stored = conversations.get(first.id);
    for (let index = 0; index < 40; index++) {
      const turn = randomUUID();
      for (const role of ['user', 'assistant']) stored.messages.push({
        id: stored.messages.length + 1, sequence_no: stored.messages.length + 1,
        turn_id: turn, role, content: role + index, status: 2, finish_reason: 'stop',
        created_at: new Date().toISOString(), completed_at: new Date().toISOString()
      });
    }
    await page.reload(); await open();
    await page.locator('.ai-history-more').waitFor();
    assert.equal(await page.locator('.ai-row').count(), 80);
    await page.locator('.ai-history-more').click();
    await page.waitForFunction(count => document.querySelectorAll('.ai-row').length === count, stored.messages.length);
    assert.match(await page.locator('.ai-row').first().innerText(), /第一条问题/);
    stored.closed = true;
    await page.reload(); await open();
    await page.waitForFunction(() => document.querySelector('.ai-status').textContent.includes('已结束或过期'));
    await page.locator('.ai-input').fill('历史仍可查看');
    assert.equal(await page.locator('.ai-send').isDisabled(), true);
    assert.equal((await session()).id, first.id);
    // New chat keeps old data, creates nothing until the next send.
    const count = conversations.size;
    await newChat(); assert.equal(await session(), null); assert.equal(conversations.size, count);
    assert.equal(conversations.get(first.id).closed, true);
    await send('全新问题'); const second = await session();
    assert.notEqual(second.id, first.id); assert.equal(conversations.size, count + 1);
    // Explicit new chat during generation must ignore callbacks from the old stream.
    deferAnswer = true;
    await page.locator('.ai-input').fill('旧流'); await page.locator('.ai-send').click();
    while (!releaseAnswer) await new Promise(resolve => setTimeout(resolve, 10));
    await newChat(); deferAnswer = false; releaseAnswer(); releaseAnswer = null;
    await send('新流'); const third = await session();
    assert.notEqual(third.id, second.id);
    assert.equal(conversations.get(second.id).closed, true);
    assert.doesNotMatch(await page.locator('.ai-bd').innerText(), /旧流/);
    // Normal tab closure followed by a fresh tab starts empty.
    await page.close(); const reopened = await context.newPage(); await reopened.goto(base);
    reopened.on('pageerror', error => errors.push(error.message));
    await reopened.locator('#ai-chat-btn').click();
    assert.equal(await reopened.evaluate(() => sessionStorage.getItem('ai_chat_session_v1')), null);
    assert.equal(conversations.size, count + 2);
    // Refresh after DB creation but before any credentials reach the browser.
    deferCredentials = true;
    await reopened.locator('.ai-input').fill('凭证返回前刷新'); await reopened.locator('.ai-send').click();
    while (!releaseCredentials) await new Promise(resolve => setTimeout(resolve, 10));
    const pendingRefresh = await reopened.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1')));
    const beforeRefreshCount = conversations.size;
    await reopened.reload(); deferCredentials = false; releaseCredentials(); releaseCredentials = null;
    await reopened.locator('#ai-chat-btn').click();
    await reopened.waitForFunction(() => document.querySelector('.ai-bd').textContent.includes('凭证返回前刷新'));
    assert.equal(await reopened.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1')).id), pendingRefresh.id);
    assert.equal(conversations.size, beforeRefreshCount, 'pre-credentials refresh must not create a second conversation');
    // Refresh before the initial transaction even starts; retry the exact same first turn.
    await reopened.locator('.ai-new').click();
    await reopened.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-empty'));
    deferCreation = true;
    await reopened.locator('.ai-input').fill('事务提交前刷新'); await reopened.locator('.ai-send').click();
    while (!releaseCreation) await new Promise(resolve => setTimeout(resolve, 10));
    const uncommitted = await reopened.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1')));
    assert.equal(conversations.has(uncommitted.id), false);
    await reopened.reload(); deferCreation = false; releaseCreation(); releaseCreation = null;
    await reopened.locator('#ai-chat-btn').click();
    await reopened.waitForFunction(() => document.querySelector('.ai-bd').textContent.includes('完整回答'));
    assert.equal(await reopened.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1')).id), uncommitted.id);
    assert.equal(conversations.get(uncommitted.id).messages.length, 2);
    await reopened.locator('.ai-new').click();
    await reopened.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-empty'));
    // Stop before first credentials must retain the newly created conversation.
    deferCredentials = true;
    await reopened.locator('.ai-input').fill('凭证返回前停止');
    await reopened.locator('.ai-send').click();
    while (!releaseCredentials) await new Promise(resolve => setTimeout(resolve, 10));
    const stoppedId = [...conversations.keys()].at(-1);
    await reopened.locator('.ai-send').click();
    deferCredentials = false; releaseCredentials(); releaseCredentials = null;
    await reopened.waitForFunction(() => !document.querySelector('#ai-chat-panel').classList.contains('ai-busy'));
    assert.equal(await reopened.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1') || 'null')?.id),
      stoppedId, 'early stop must keep the first conversation credentials');
    // New chat during first creation must wait for credentials and close that exact conversation.
    await reopened.locator('.ai-new').click();
    await reopened.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-empty'));
    deferCredentials = true;
    await reopened.locator('.ai-input').fill('凭证返回前新对话');
    await reopened.locator('.ai-send').click();
    while (!releaseCredentials) await new Promise(resolve => setTimeout(resolve, 10));
    const pendingId = [...conversations.keys()].at(-1);
    await reopened.locator('.ai-new').click();
    deferCredentials = false; releaseCredentials(); releaseCredentials = null;
    await reopened.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-empty'));
    assert.equal(conversations.get(pendingId).closed, true, 'new chat closes the pending first conversation');
    assert.equal(await reopened.evaluate(() => sessionStorage.getItem('ai_chat_session_v1')), null);
    // Gateway errors can arrive after the transaction commits but before credentials reach the client.
    for (const status of [500, 502, 503, 504]) {
      initialFailure = { status, afterCommit: true };
      await reopened.locator('.ai-input').fill('网关异常 ' + status);
      await reopened.locator('.ai-send').click();
      await reopened.waitForFunction(() => !document.querySelector('#ai-chat-panel').classList.contains('ai-busy'));
      const committedId = [...conversations.keys()].at(-1);
      assert.equal(await reopened.evaluate(() => JSON.parse(sessionStorage.getItem('ai_chat_session_v1') || 'null')?.id),
        committedId, 'HTTP ' + status + ' must retain credentials for a potentially committed first turn');
      await reopened.locator('.ai-input').fill('恢复前不能误发');
      assert.equal(await reopened.locator('.ai-send').isDisabled(), true, 'ambiguous creation must block unrelated sends');
      const sizeBeforeRecovery = conversations.size;
      initialFailure = null;
      await reopened.locator('.ai-close').click(); await reopened.locator('#ai-chat-btn').click();
      await reopened.waitForFunction(() => document.querySelector('.ai-bd').textContent.includes('网关异常'));
      assert.equal(conversations.size, sizeBeforeRecovery, 'recovery must not create a duplicate conversation');
      assert.equal(conversations.get(committedId).messages.length, 2);
      await reopened.locator('.ai-new').click();
      await reopened.waitForFunction(() => document.querySelector('#ai-chat-panel').classList.contains('ai-empty'));
    }
    // A rejected first create has no established conversation to mark read-only.
    initialFailure = { status: 404, afterCommit: false };
    await reopened.locator('.ai-input').fill('首次请求被拒绝'); await reopened.locator('.ai-send').click();
    await reopened.waitForFunction(() => !document.querySelector('#ai-chat-panel').classList.contains('ai-busy'));
    assert.equal(await reopened.evaluate(() => sessionStorage.getItem('ai_chat_session_v1')), null);
    await reopened.locator('.ai-input').fill('恢复后重发');
    assert.equal(await reopened.locator('.ai-send').isDisabled(), false, 'first-create rejection must allow another submission');
    initialFailure = null;
    await reopened.locator('.ai-send').click();
    await reopened.waitForFunction(() => document.querySelector('.ai-bd').textContent.includes('完整回答'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log('AI browser tests passed: lazy creation, refresh before/after first commit and credentials, early stop/new-chat races, navigation, tab switching/closure, interruption, restore retry, full-history pagination, read-only history, first-create rejection and gateway error recovery.');
  } finally {
    if (releaseCreation) releaseCreation();
    if (releaseCredentials) releaseCredentials();
    if (releaseAnswer) releaseAnswer();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
