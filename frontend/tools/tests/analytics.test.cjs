const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../source/js/site-analytics.js'), 'utf8');

function harness(blocked = false, hidden = false, responder) {
  const listeners = {}, calls = [], data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const window = { SITE_ANALYTICS_CONFIG: { api_base: 'https://api.example/api', local_api_base: 'http://localhost:8000/api' } };
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { if (blocked) throw Error('denied'); return storage; } });
  const document = { visibilityState: hidden ? 'hidden' : 'visible', referrer: 'https://www.baidu.com/s?wd=example', addEventListener: (key, fn) => { listeners[key] = fn; }, dispatchEvent() {} };
  const location = { hostname: 'example.com', pathname: '/', href: 'https://example.com/?utm_source=wechat' };
  const fetch = async (url, opts) => { calls.push({ url, opts }); return responder ? responder(url, opts) : { ok: true, json: async () => ({ overview: {} }) }; };
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ window, document, location, fetch, crypto: webcrypto, URL, Event, AbortController, setTimeout, clearTimeout, Date: Clock });
  vm.runInContext(source, context);
  return { window, document, location, listeners, calls, advance: ms => { now += ms; }, repeat: () => vm.runInContext(source, context) };
}
test('one initial event, PJAX dedup, stable visitor and original attribution', async () => {
  const h = harness();
  await h.window.SiteAnalytics.summary();
  h.repeat(); h.listeners['pjax:complete']();
  assert.equal(h.calls.filter(c => c.opts.method === 'POST').length, 1);
  h.location.pathname = '/posts/abc.html';
  h.listeners['pjax:complete']();
  await h.window.SiteAnalytics.summary();
  const visits = h.calls.filter(c => c.opts.method === 'POST').map(c => JSON.parse(c.opts.body));
  assert.equal(visits.length, 2);
  assert.equal(visits[0].visitor_id, visits[1].visitor_id);
  assert.notEqual(visits[0].event_id, visits[1].event_id);
  assert.equal(visits[1].utm_source, 'wechat');
  assert.equal(visits[1].referrer, 'https://www.baidu.com/s?wd=example');
  assert.equal(visits[1].path, '/posts/abc.html');
  assert.equal(h.calls.at(-1).opts.cache, 'no-store');
});
test('blocked storage still collects and hidden tabs wait until visible', async () => {
  const h = harness(true, true);
  assert.equal(h.calls.length, 0);
  h.document.visibilityState = 'visible'; h.listeners.visibilitychange();
  await h.window.SiteAnalytics.summary();
  assert.equal(h.calls.filter(c => c.opts.method === 'POST').length, 1);
});

test('dashboard queries wait for rapid previous navigation and the current visit before PJAX complete', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let posts = 0;
  const h = harness(false, false, async (url, opts) => {
    if (opts.method === 'POST' && ++posts === 1) await gate;
    return { ok: true, json: async () => ({}) };
  });
  h.location.pathname = '/article/'; h.listeners['pjax:complete']();
  h.location.pathname = '/site/census/';
  const summary = h.window.SiteAnalytics.summary();
  h.listeners['pjax:complete']();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1, 'all later writes and summary wait for first write');
  release(); await summary;
  assert.deepEqual(h.calls.filter(c => c.opts.method === 'POST').map(c => JSON.parse(c.opts.body).path), ['/', '/article/', '/site/census/']);
  assert.ok(h.calls.at(-1).url.endsWith('/summary'));
});

test('a lost response retries the identical event and never retries 429', async () => {
  let attempts = 0;
  const events = new Set();
  const h = harness(false, false, async (url, opts) => {
    if (opts.method === 'POST') {
      events.add(JSON.parse(opts.body).event_id);
      if (++attempts === 1) throw new Error('lost response after commit');
    }
    return { ok: true, json: async () => ({}) };
  });
  await h.window.SiteAnalytics.summary();
  assert.equal(attempts, 2); assert.equal(events.size, 1);
  const limited = harness(false, false, async (_, opts) => ({ ok: opts.method !== 'POST', status: 429, json: async () => ({}) }));
  await limited.window.SiteAnalytics.summary();
  assert.equal(limited.calls.filter(c => c.opts.method === 'POST').length, 1);
});

test('a long idle period ends the original referral attribution', async () => {
  const h = harness(); await h.window.SiteAnalytics.summary();
  h.advance(31 * 60 * 1000);
  h.location.pathname = '/next/'; h.location.href = 'https://example.com/next/';
  h.listeners['pjax:complete'](); await h.window.SiteAnalytics.summary();
  const event = JSON.parse(h.calls.filter(c => c.opts.method === 'POST').at(-1).opts.body);
  assert.equal(event.utm_source, ''); assert.equal(event.referrer, '');
});

test('existing dashboard renders backend KPIs and all chart series, and disposes after PJAX', async () => {
  const fields = Array.from({ length: 6 }, (_, i) => ({ textContent: '', getAttribute: () => String(i + 1) }));
  const statuses = {}, options = {}, chartNodes = {}, handlers = {};
  let disposed = 0;
  const kpi = { querySelectorAll: () => fields, setAttribute() {} };
  const page = { isConnected: true, querySelector(selector) {
    if (selector === '#statistic') return kpi;
    if (selector.startsWith('[data-census-status=')) return statuses[selector] ||= {};
    if (selector === '#census-updated' || selector === '[data-region-note]') return statuses[selector] ||= {};
    if (selector.startsWith('#')) return chartNodes[selector] ||= { id: selector.slice(1), replaceChildren() {} };
  } };
  const document = { querySelector: () => page, getElementById: () => null,
    documentElement: { getAttribute: () => 'light' },
    addEventListener: (name, cb) => { handlers[name] = cb; }, removeEventListener() {}, createElement: () => ({}) };
  const data = { overview: { today_uv: 3, today_pv: 5, yesterday_uv: 2, yesterday_pv: 4, month_pv: 20, total_pv: 40 },
    regions: [{ name: '山东', value: 8 }], trends: [{ name: '2026-11', value: 20 }],
    sources: [{ name: '搜索引擎', value: 12 }], geo_available: true, region_unknown: 2 };
  const window = { SiteAnalytics: { summary: async () => data }, addEventListener() {}, removeEventListener() {} };
  const echarts = { getMap: () => ({ geoJSON: { features: [] } }), graphic: { LinearGradient: function () {} },
    init: node => ({ setOption: value => { options[node.id] = value; }, dispose: () => { disposed++; }, resize() {} }) };
  window.echarts = echarts;
  const ctx = vm.createContext({ window, document, echarts, console, getComputedStyle: () => ({ getPropertyValue: () => '' }), setTimeout });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../source/js/census.js'), 'utf8'), ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fields.map(f => f.textContent), ['3', '5', '2', '4', '20', '40']);
  assert.equal(options['map-chart'].series[0].data[0].name, '山东');
  assert.equal(options['trends-chart'].series[0].data[0], 20);
  assert.equal(options['sources-chart'].series[0].data[0].value, 12);
  page.isConnected = false; handlers['pjax:complete']();
  assert.equal(disposed, 3);
});
