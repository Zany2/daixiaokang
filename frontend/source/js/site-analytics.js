/* Whole-document singleton: PJAX replaces page content, not the collector. */
;(function () {
  if (window.SiteAnalytics) return
  var cfg = window.SITE_ANALYTICS_CONFIG || {}
  var local = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname)
  var base = String(local ? cfg.local_api_base : cfg.api_base || '/api').replace(/\/+$/, '')
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (c) { return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16) }) }
  function read(store, key) { try { return window[store].getItem(key) } catch (e) { return null } }
  function write(store, key, value) { try { window[store].setItem(key, value) } catch (e) {} }
  var visitor = read('localStorage', 'site_visitor_v1')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitor || '')) visitor = uuid()
  write('localStorage', 'site_visitor_v1', visitor)
  var entry
  try { entry = JSON.parse(read('sessionStorage', 'site_entry_v1')) } catch (e) {}
  if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.at) || typeof entry.referrer !== 'string' || typeof entry.utm_source !== 'string' || Date.now() - entry.at > 30 * 60 * 1000) {
    entry = { referrer: document.referrer.slice(0, 2048), utm_source: (new URL(location.href).searchParams.get('utm_source') || '').slice(0, 100), at: Date.now() }
  }
  var lastPath = null, pending = Promise.resolve()
  function deliver(payload, retry) {
    var controller = new AbortController()
    var timer = setTimeout(function () { controller.abort() }, 8000)
    return fetch(base + '/analytics/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'omit', keepalive: true, signal: controller.signal })
      .then(function (response) {
        if (response.ok) return true
        if (response.status < 500) return false
        throw new Error('visit unavailable')
      }).catch(function () { return retry ? deliver(payload, false) : false })
      .finally(function () { clearTimeout(timer) })
  }
  function send() {
    var path = location.pathname
    if (path === lastPath || document.visibilityState === 'hidden') return
    lastPath = path
    if (Date.now() - entry.at > 30 * 60 * 1000) {
      entry = { referrer: '', utm_source: (new URL(location.href).searchParams.get('utm_source') || '').slice(0, 100), at: Date.now() }
    }
    entry.at = Date.now()
    write('sessionStorage', 'site_entry_v1', JSON.stringify(entry))
    var payload = { event_id: uuid(), visitor_id: visitor, path: path, referrer: entry.referrer || '', utm_source: entry.utm_source || '' }
    // Serial submission lets a dashboard wait for all earlier page visits.
    pending = pending.then(function () { return deliver(payload, true) })
      .then(function () {})
  }
  function fetchSummary() {
    var controller = new AbortController()
    var timer = setTimeout(function () { controller.abort() }, 10000)
    return fetch(base + '/analytics/summary', { cache: 'no-store', credentials: 'omit', signal: controller.signal })
      .then(function (r) { if (!r.ok) throw new Error('统计暂不可用'); return r.json() })
      .finally(function () { clearTimeout(timer) })
  }
  window.SiteAnalytics = {
    summary: function () {
      send()
      return pending.then(fetchSummary)
    }
  }
  document.addEventListener('pjax:complete', send)
  document.addEventListener('visibilitychange', send)
  send()
})()
