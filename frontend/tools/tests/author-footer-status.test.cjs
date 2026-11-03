'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function fixture() {
  let instant = new Date('2026-11-03T12:00:00').getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const emoji = { textContent: '' }, text = { textContent: '' }, attributes = {};
  const avatar = { querySelector: selector => selector === '.g-emoji' ? emoji : text,
    parentElement: { setAttribute: (key, value) => { attributes[key] = value; } } };
  let board = { innerHTML: '' }, showAvatar = true;
  const handlers = {};
  const document = { readyState: 'complete', querySelector: () => showAvatar ? avatar : null,
    getElementById: id => id === 'workboard' ? board : null,
    addEventListener: (name, fn) => (handlers[name] ||= []).push(fn) };
  const context = vm.createContext({ window: {}, document, Date: Clock, setInterval() {},
    vgDist: () => 1000, vgFmt: value => String(value), vgAU: 149597870.7, vgLight: () => '0秒' });
  for (const file of ['js/author-status.js', 'js/modules/footer-time.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'source', file), 'utf8'), context);
  }
  return { context, text, attributes, get board() { return board; },
    at: time => { instant = new Date(time).getTime(); context.createtime(); },
    navigate() { board = { innerHTML: '' }; for (const fn of handlers['pjax:complete']) fn(); },
    hideAvatar() { showAvatar = false; } };
}

test('footer and avatar share all four states at exact time boundaries', () => {
  const h = fixture();
  for (const [time, label, file] of [
    ['06:59:59', '睡觉中zzz', 'sleep'], ['07:00:00', '上班摸鱼中', 'work'],
    ['17:59:59', '上班摸鱼中', 'work'], ['18:00:00', '下班玩耍中', 'play'],
    ['22:59:59', '下班玩耍中', 'play'], ['23:00:00', '睡觉中zzz', 'sleep']
  ]) {
    h.at('2026-11-03T' + time);
    assert.equal(h.text.textContent, label);
    assert.equal(h.attributes['aria-label'], label);
    assert.ok(h.board.innerHTML.includes(`Fomalhaut-${file}.svg`));
    assert.ok(h.board.innerHTML.includes(`alt='${label}`));
    const svg = fs.readFileSync(path.join(root, `source/assets/badge/Fomalhaut-${file}.svg`), 'utf8');
    assert.ok(svg.includes(label), 'badge image text must match the computed state');
  }
});

test('holidays, ordinary weekends and makeup workdays match the avatar, with sleep first', () => {
  const h = fixture();
  for (const [time, label] of [
    ['2026-10-01T10:00:00', '放假摸鱼中'],
    ['2026-11-07T18:00:00', '放假摸鱼中'],
    ['2026-10-10T10:00:00', '上班摸鱼中'],
    ['2026-10-10T18:00:00', '下班玩耍中'],
    ['2026-10-01T23:00:00', '睡觉中zzz']
  ]) {
    h.at(time); assert.equal(h.text.textContent, label);
    assert.ok(h.board.innerHTML.includes(label));
  }
});

test('PJAX replaces footer immediately and pages without an avatar still render', () => {
  const h = fixture();
  h.at('2026-11-03T18:00:00'); h.hideAvatar(); h.navigate();
  assert.ok(h.board.innerHTML.includes('Fomalhaut-play.svg'));
  assert.ok(h.board.innerHTML.includes('本站运行了'));
  assert.ok(h.board.innerHTML.includes('旅行者 1 号'));
});
