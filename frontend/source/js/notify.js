/*!
 * notify.js — 轻量通知组件（替代 Vue 2.6.14 + Element-UI 2.15.7）
 * ------------------------------------------------------------------
 * 背景：本站在 fomal.js 中有 14 处 \`new Vue({ data: function () { this.$notify({...}) } })\`，
 *       只为调用 Element-UI 的 $notify 弹出右下角提示。为此原先需要加载
 *       Vue(92KB) + Element-UI JS(577KB) + Element-UI CSS(236KB) = 905KB。
 *       通知与确认框共用本站配色，支持暗色模式、移动端和键盘操作。
 * 用法：fomalNotify({ title, message, type, position, offset, duration, showClose })
 *       type: success | warning | info | error（默认 info）
 *       position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'fomal-notify-style';

  var CSS = [
    '.fomal-notify-wrap{position:fixed;z-index:2147483000;display:flex;flex-direction:column;gap:12px;pointer-events:none;max-width:calc(100vw - 32px);max-width:calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right));max-height:calc(100vh - 80px);max-height:calc(100dvh - 80px);overflow-y:auto}',
    '.fomal-notify-wrap.top-left{top:0;left:16px;left:max(16px,env(safe-area-inset-left))}',
    '.fomal-notify-wrap.top-right{top:0;right:16px;right:max(16px,env(safe-area-inset-right))}',
    '.fomal-notify-wrap.bottom-left{bottom:0;left:16px;left:max(16px,env(safe-area-inset-left));flex-direction:column-reverse}',
    '.fomal-notify-wrap.bottom-right{bottom:0;right:16px;right:max(16px,env(safe-area-inset-right));flex-direction:column-reverse}',
    '.fomal-notify{position:relative;display:flex;width:330px;padding:14px 26px 14px 13px;box-sizing:border-box;',
    'max-width:100%;flex-shrink:0;border:1px solid rgba(40,73,86,.12);border-radius:14px;background:var(--card-bg,#fff);box-shadow:0 8px 28px rgba(23,62,70,.16);font-family:var(--global-font,inherit);',
    'overflow:hidden;pointer-events:auto;transition:opacity .3s,transform .3s}',
    '.fomal-notify.is-enter{opacity:0;transform:translateX(-100%)}',
    '.fomal-notify-wrap.top-right .fomal-notify.is-enter,.fomal-notify-wrap.bottom-right .fomal-notify.is-enter{transform:translateX(100%)}',
    '.fomal-notify.is-leave{opacity:0;transform:translateX(-100%)}',
    '.fomal-notify-wrap.top-right .fomal-notify.is-leave,.fomal-notify-wrap.bottom-right .fomal-notify.is-leave{transform:translateX(100%)}',
    '.fomal-notify__icon{flex:0 0 24px;width:24px;height:24px;line-height:0}',
    '.fomal-notify__icon svg{width:24px;height:24px;display:block}',
    '.fomal-notify--success .fomal-notify__icon{color:#67c23a}',
    '.fomal-notify--warning .fomal-notify__icon{color:#e6a23c}',
    '.fomal-notify--error .fomal-notify__icon{color:#f56c6c}',
    '.fomal-notify--info .fomal-notify__icon{color:#909399}',
    '.fomal-notify__group{margin-left:13px;margin-right:8px;flex:1 1 auto;min-width:0}',
    '.fomal-notify__title{margin:0;font-size:16px;font-weight:700;color:var(--font-color,#303133);line-height:1.4;word-break:break-word}',
    '.fomal-notify__content{margin:6px 0 0;font-size:14px;line-height:21px;color:var(--font-color,#606266);word-break:break-word;white-space:pre-line}',
    '.fomal-notify__close{position:absolute;top:12px;right:12px;padding:4px;border:0;background:transparent;cursor:pointer;color:#909399;line-height:0;font-size:0}',
    '.fomal-notify__close:hover{color:var(--theme-color,#39c5bb)}',
    '.fomal-notify__close svg{width:14px;height:14px;display:block}',
    '[data-theme="dark"] .fomal-notify{background:var(--card-bg,#17232a);border-color:rgba(206,231,239,.15);box-shadow:0 8px 28px rgba(0,0,0,.35)}',
    '.fomal-confirm-overlay{position:fixed;inset:0;z-index:2147483100;display:grid;place-items:center;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;padding:20px;background:rgba(10,24,30,.4)}',
    '.fomal-confirm{box-sizing:border-box;width:380px;max-width:100%;padding:24px;border:1px solid rgba(40,73,86,.12);border-radius:20px;background:var(--card-bg,#fff);color:var(--font-color,#263f49);box-shadow:0 16px 48px rgba(0,0,0,.22);font-family:var(--global-font,inherit)}',
    '.fomal-confirm h2{margin:0 0 12px;font-size:18px;color:inherit}.fomal-confirm p{margin:0;font-size:14px;line-height:1.8;white-space:pre-line;overflow-wrap:anywhere}',
    '.fomal-confirm__actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}',
    '.fomal-confirm button{padding:9px 18px;border:1px solid rgba(40,73,86,.18);border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}',
    '.fomal-confirm .fomal-confirm__accept{border-color:transparent;background:var(--theme-color,#39c5bb);color:#fff}',
    '.fomal-confirm button:focus-visible,.fomal-notify__close:focus-visible{outline:2px solid var(--theme-color,#39c5bb);outline-offset:3px}',
    '[data-theme="dark"] .fomal-confirm{background:var(--card-bg,#17232a);border-color:rgba(206,231,239,.15)}',
    '[data-theme="dark"] .fomal-confirm button{border-color:rgba(206,231,239,.2)}',
    '@media(prefers-reduced-motion:reduce){.fomal-notify{transition:none}}'
  ].join('');

  var ICONS = {
    success: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.2 12.4l3.1 3.1 6.4-6.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    warning: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 6.6v7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.35" fill="#fff"/>',
    error:   '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
    info:    '<circle cx="12" cy="12" r="10" fill="currentColor"/><circle cx="12" cy="7.4" r="1.35" fill="#fff"/><path d="M12 10.6v7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'
  };
  var CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4L4 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  var wraps = {};
  var notices = new Set();

  function closeNotices() {
    notices.forEach(function (notice) { notice.close(true); });
  }
  if (typeof document !== 'undefined') document.addEventListener('pjax:send', closeNotices);
  if (typeof global.addEventListener === 'function') global.addEventListener('pagehide', closeNotices);

  function getWrap(position, offset) {
    var key = position + '|' + offset;
    var wrap = wraps[key];
    if (wrap && wrap.isConnected) return wrap;
    wrap = document.createElement('div');
    wrap.className = 'fomal-notify-wrap ' + position;
    if (position === 'bottom-left' || position === 'bottom-right') wrap.style.bottom = offset + 'px';
    else wrap.style.top = offset + 'px';
    document.body.appendChild(wrap);
    wraps[key] = wrap;
    return wrap;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * 与 Element-UI Notification 的 $notify 参数一一对应。
   * @param {Object} opt 选项对象
   *        字段: title / message / type(success|warning|info|error) / position / offset / duration / showClose
   */
  function fomalNotify(opt) {
    opt = opt || {};
    ensureStyle();

    var type = ICONS[opt.type] ? opt.type : 'info';
    var position = /^(top|bottom)-(left|right)$/.test(opt.position) ? opt.position : 'top-left';
    var offset = typeof opt.offset === 'number' && Number.isFinite(opt.offset) ? Math.max(0, opt.offset) : 50;
    var duration = typeof opt.duration === 'number' ? opt.duration : 4500;
    var showClose = opt.showClose !== false;

    var wrap = getWrap(position, offset);
    var box = document.createElement('div');
    box.className = 'fomal-notify fomal-notify--' + type + ' is-enter';
    box.setAttribute('role', 'alert');

    var html = '<div class="fomal-notify__icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[type] + '</svg></div>' +
      '<div class="fomal-notify__group">';
    if (opt.title) html += '<h2 class="fomal-notify__title">' + esc(opt.title) + '</h2>';
    if (opt.message) html += '<div class="fomal-notify__content">' + esc(opt.message) + '</div>';
    html += '</div>';
    if (showClose) html += '<button type="button" class="fomal-notify__close" aria-label="关闭">' + CLOSE_ICON + '</button>';
    box.innerHTML = html;
    wrap.appendChild(box);

    requestAnimationFrame(function () { box.classList.remove('is-enter'); });

    var timer = null, closed = false, hovered = false;
    var handle = { close: close };
    function remove() {
      notices.delete(handle);
      if (box.parentNode) box.parentNode.removeChild(box);
      if (wrap && wrap.childNodes.length === 0 && wrap.parentNode) {
        wrap.parentNode.removeChild(wrap);
        delete wraps[position + '|' + offset];
      }
    }
    function close(immediate) {
      if (closed) {
        if (immediate === true) remove();
        return;
      }
      closed = true;
      if (timer) clearTimeout(timer);
      box.classList.add('is-leave');
      if (immediate === true) remove();
      else setTimeout(remove, 320);
    }
    function start() {
      stop();
      if (!closed && !hovered && !box.contains(document.activeElement) && duration > 0) timer = setTimeout(close, duration);
    }
    function stop() { if (timer) { clearTimeout(timer); timer = null; } }

    if (showClose) {
      var btn = box.querySelector('.fomal-notify__close');
      if (btn) btn.addEventListener('click', close);
    }
    box.addEventListener('mouseenter', function () { hovered = true; stop(); });
    box.addEventListener('mouseleave', function () { hovered = false; start(); });
    box.addEventListener('focusin', stop);
    box.addEventListener('focusout', function (event) {
      if (!box.contains(event.relatedTarget)) setTimeout(start, 0);
    });
    notices.add(handle);
    start();

    return handle;
  }

  global.fomalNotify = fomalNotify;
  global.fomalToast = function (message, type, options) {
    return fomalNotify(Object.assign({ title: '提示', position: 'top-left', offset: 50, duration: 3500 }, options, {
      message: message, type: type || 'info'
    }));
  };

  var activeConfirm = null;
  global.fomalConfirm = function (message, options) {
    if (activeConfirm) return Promise.resolve(false);
    options = options || {};
    ensureStyle();
    return new Promise(function (resolve) {
      var previousFocus = document.activeElement;
      var overlay = document.createElement('div');
      overlay.className = 'fomal-confirm-overlay';
      var dialog = document.createElement('div');
      dialog.className = 'fomal-confirm';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'fomal-confirm-title');
      dialog.setAttribute('aria-describedby', 'fomal-confirm-message');
      var title = document.createElement('h2');
      title.id = 'fomal-confirm-title';
      title.textContent = options.title || '操作确认';
      var content = document.createElement('p');
      content.id = 'fomal-confirm-message';
      content.textContent = message;
      var actions = document.createElement('div');
      actions.className = 'fomal-confirm__actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = options.cancelText || '取消';
      var accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'fomal-confirm__accept';
      accept.textContent = options.confirmText || '确定';
      actions.append(cancel, accept);
      dialog.append(title, content, actions);
      overlay.append(dialog);
      document.body.append(overlay);
      var background = Array.from(document.body.children).filter(function (element) { return element !== overlay; });
      var originalInert = background.map(function (element) { return element.inert; });
      background.forEach(function (element) { element.inert = true; });
      var closed = false;
      function finish(confirmed) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pjax:send', onNavigation);
        global.removeEventListener('pagehide', onNavigation);
        overlay.remove();
        background.forEach(function (element, index) { element.inert = originalInert[index]; });
        activeConfirm = null;
        if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
        resolve(confirmed);
      }
      function onNavigation() { finish(false); }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(false);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          event.stopImmediatePropagation();
          (document.activeElement === cancel ? accept : cancel).focus();
        }
      }
      cancel.addEventListener('click', function () { finish(false); });
      accept.addEventListener('click', function () { finish(true); });
      overlay.addEventListener('click', function (event) {
        event.stopPropagation();
        if (event.target === overlay) finish(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pjax:send', onNavigation);
      global.addEventListener('pagehide', onNavigation);
      activeConfirm = finish;
      cancel.focus();
    });
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = fomalNotify;
})(typeof window !== 'undefined' ? window : this);
