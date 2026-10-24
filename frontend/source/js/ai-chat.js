/* 博客 AI 助手（前端本体）—— 站点侧文件：source/js/ai-chat.js
 * ---------------------------------------------------------------------------
 * 由 scripts/ai-chat-inject.js 注入：<script defer src="/js/ai-chat.js"></script>
 * 配置来自 _config.fomalhaut.yml 的 ai_chat: 段（window.AI_CHAT_CONFIG）。
 * 面板由本文件创建，独立样式位于 source/css/ai-chat.css。
 * 依赖：无（不依赖 jQuery / Vue / 任何组件库）。
 */
(function () {
  'use strict';

  var DEFAULTS = {
    enable: true,
    api_base: '/api',
    local_api_base: 'http://localhost:8000/api',
    has_key: false,
    welcome: '你好，我是你的 AI 助手。学习、写作、编程，或是日常灵感，都可以和我聊聊。',
    max_input_chars: 1000,
    session_key: 'ai_chat_session_v1',
    panel_width: 460,
    panel_height: 640,
    panel_right: 88,
    timeout_ms: 65000
  };

  var CFG = {}, k;
  for (k in DEFAULTS) { if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) CFG[k] = DEFAULTS[k]; }
  var _src = window.AI_CHAT_CONFIG || {};
  for (k in _src) { if (Object.prototype.hasOwnProperty.call(_src, k)) CFG[k] = _src[k]; }
  // 本地开发直连 8000 端口；正式部署使用同源 /api，由 Nginx 转发到 FastAPI。
  if (/^(localhost|127\.0\.0\.1|::1)$/.test(window.location.hostname) && String(CFG.local_api_base || '').trim()) {
    CFG.api_base = String(CFG.local_api_base).replace(/\/+$/, '');
  }
  CFG.has_key = true;
  CFG.proxied = true;
  if (CFG.enable === false) return;

  var BTN_ID = 'ai-chat-btn', PANEL_ID = 'ai-chat-panel', STYLE_ID = 'ai-chat-style';

  function qs(sel, r) { return (r || document).querySelector(sel); }
  function mk(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function px(v, d) { var n = parseInt(v, 10); return (isNaN(n) || n <= 0) ? d : n; }

  // 纸飞机（发送）/ 圆角方块（停止生成）：内联 SVG，跟着 currentColor
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<rect x="6" y="6" width="12" height="12" rx="2.4"/></svg>';

  // 助手小鲸鱼图标：内联 SVG，跟着 currentColor，按钮 / 面板标题 / 消息头像共用
  var WHALE = '<svg class="ai-whale" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<path fill-rule="evenodd" d="M9.7 8.2c3.3-1.1 6.7-.1 8.6 2.6.5.8 1.4 1.2 2.3 1.2h.9c.8 0 1.3.5 1.3 1.3 0 .7-.5 1.3-1.3 1.3h-1c-.9 0-1.7.4-2.2 1.2-2.1 3.1-6.3 4.2-9.7 2.8-3.2-1.3-5-4.6-4.1-7.8.6-2.1 2.7-3.4 5.2-2.6Zm-.7 4.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"/>' +
    '<path d="M17.9 6.4c1.2-1 2.6-1.5 3.8-1.4.4 0 .6.4.4.7-.7 1.4-1.9 2.5-3.3 3-.8.2-1.5-.6-1.2-1.3l.3-1Z"/>' +
    '<path d="M7.2 4.6c.7-.5 1.6-.6 2.3-.3.5.3.6.9.2 1.3-.5.5-1.3.7-2 .4-.5-.2-.7-.8-.5-1.4Z"/>' +
    '<path d="M10.6 2.1c.8-.4 1.8-.3 2.4.2.4.4.2 1-.3 1.4-.7.4-1.6.4-2.2 0-.5-.3-.4-.9.1-1.3Z"/>' +
    '</svg>';

  // 「恢复默认大小」图标（四角向外）
  var RESET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M4 4l6 6"/><path d="M20 20l-6-6"/></svg>';
  var NEW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12c0-4.4 4-8 9-8 1.2 0 2.3.2 3.3.6"/><path d="M19 3v6M16 6h6"/></svg>';
  var CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  var PAGE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7l-4-4Z"/><path d="M14 3v5h4M9 12h6M9 16h4"/></svg>';
  var ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
  var SUGGESTIONS = [
    { title: '认识一下', description: '从一句问候开始', question: '你好，介绍一下你自己吧。', icon: WHALE },
    { title: '随便聊聊', description: '找一个有趣的话题', question: '来聊点有趣的，你先起个话题。', icon: PAGE_ICON },
    { title: '今日灵感', description: '给日常添一点新鲜感', question: '推荐一件今天值得尝试的小事。', icon: ARROW_ICON }
  ];
  var QUICK_ACTIONS = [
    { title: '举个例子', description: '用例子理解刚才的内容', question: '请针对刚才的内容举个具体的例子。' },
    { title: '说简单点', description: '用更通俗的话解释', question: '请把刚才的回答说得更简单、通俗一些。' },
    { title: '换个话题', description: '聊点别的', question: '我们换个话题吧，你来推荐一个有趣的话题。' }
  ];

  function createSuggestions(cards) {
    var group = mk('div', cards ? 'ai-suggestions' : 'ai-quick-actions');
    group.setAttribute('aria-label', '快捷提问');
    (cards ? SUGGESTIONS : QUICK_ACTIONS).forEach(function (item) {
      var button = mk('button', 'ai-chip');
      button.type = 'button';
      button.setAttribute('data-q', item.question);
      button.setAttribute('aria-label', item.title + '：' + item.description);
      if (cards) {
        button.appendChild(mk('span', 'ai-suggestion-icon', item.icon));
        var label = mk('span', 'ai-suggestion-copy');
        label.appendChild(mk('strong', null, esc(item.title)));
        label.appendChild(mk('small', null, esc(item.description)));
        button.appendChild(label);
        button.appendChild(mk('span', 'ai-suggestion-arrow', ARROW_ICON));
      } else {
        button.textContent = item.title;
      }
      group.appendChild(button);
    });
    return group;
  }

  // 把「不成对的代理项」换成 U+FFFD。
  // 网页里被劈开的 emoji（主题的逐字打字机、substring 截断、slice 截断）会留下孤立的
  // 高/低代理项，JSON.stringify 把它转义成 \ud83d 这种不成对转义，
  // DeepSeek 的 JSON 解析器直接返回 400：unexpected end of hex escape。
  // —— 选中配色：按当前日夜模式与主题色算成纯 rgb，写进面板的 CSS 变量
  function themeRGB() {
    var v = '';
    try { v = String(getComputedStyle(document.documentElement).getPropertyValue('--theme-color') || '').trim(); } catch (e) {}
    var m = /#([0-9a-f]{6})/i.exec(v) || /#([0-9a-f]{3})/i.exec(v);
    var hex = m ? m[1] : '39c5bb';
    if (hex.length === 3) hex = hex.replace(/./g, function (c) { return c + c; });
    return [parseInt(hex.slice(0, 2), 16) || 57, parseInt(hex.slice(2, 4), 16) || 197, parseInt(hex.slice(4, 6), 16) || 187];
  }
  function mixc(rgb, pct, base) {
    return 'rgb(' + rgb.map(function (c, i) { return Math.round(c * pct + base[i] * (1 - pct)); }).join(',') + ')';
  }
  // 浏览器支持 color-mix 时，选中色由 CSS 实时算（换主题色立刻跟着变），不再需要写死变量
  function selLive() {
    try { return !!(window.CSS && window.CSS.supports && window.CSS.supports('background', 'color-mix(in srgb,red 10%,#fff)')); } catch (e) { return false; }
  }
  function paintSel(p) {
    if (!p || !p.style) return;
    if (selLive()) {
      // 支持 color-mix 时选中色由 CSS 实时算（换主题色立即跟随），清掉可能残留的旧内联值
      ['--ai-sel-bg', '--ai-sel-fg', '--ai-sel-bg-u', '--ai-sel-fg-u'].forEach(function (k) { try { p.style.removeProperty(k); } catch (e) {} });
      return;
    }
    var t = themeRGB();
    var dark = false;
    try { dark = document.documentElement.getAttribute('data-theme') === 'dark'; } catch (e) {}
    p.style.setProperty('--ai-sel-bg', dark ? mixc(t, .38, [4, 18, 15]) : mixc(t, .26, [255, 255, 255]));
    p.style.setProperty('--ai-sel-fg', dark ? '#eafaf7' : '#12303a');
    p.style.setProperty('--ai-sel-bg-u', dark ? mixc(t, .26, [4, 18, 15]) : 'rgb(255,255,255)');
    p.style.setProperty('--ai-sel-fg-u', dark ? '#fff' : '#0f2e2c');
  }
  function cleanSurrogates(s) {
    s = String(s == null ? '' : s);
    var res = '', i, c, d;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { res += s.charAt(i) + s.charAt(i + 1); i++; }
        else res += '\uFFFD';
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        res += '\uFFFD';
      } else {
        res += s.charAt(i);
      }
    }
    return res;
  }

  /* ------------------------------------------------------------------ 样式 / 按钮 / 面板 */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = CFG.stylesheet_url || '/css/ai-chat.css';
    document.head.appendChild(link);
  }

  // 按钮挂在右侧竖排的「常显」组 #rightside-config-show 里，紧跟设置齿轮之后，
  // 这样它和齿轮同属一组：右侧部件整体隐藏时它自动跟着消失，不需要额外处理。
  function ensureButton() {
    ensureStyle();
    if (document.getElementById(BTN_ID)) return;
    var host = qs('#rightside-config-show') || qs('#rightside');
    if (!host) return;
    var btn = mk('button', null, 'AI');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.title = 'AI 助手（点击展开或收起）';
    btn.setAttribute('aria-label', 'AI 助手');
    btn.setAttribute('aria-controls', PANEL_ID);
    btn.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
    var gear = qs('#rightside_config', host);
    if (gear && gear.parentNode === host) host.insertBefore(btn, gear.nextSibling);
    else host.insertBefore(btn, host.firstChild);
    // 鼠标刚靠近按钮就把面板建好：把冷启动成本挪到这一下，点开就不卡了
    btn.addEventListener('pointerenter', prewarm, { passive: true });
    if (isOpen()) btn.classList.add('ai-on');
  }

  function buildPanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) return p;
    p = mk('div');
    p.id = PANEL_ID;
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-labelledby', 'ai-chat-heading');
    p.style.width = px(CFG.panel_width, 460) + 'px';
    p.style.height = px(CFG.panel_height, 640) + 'px';
    p.style.right = px(CFG.panel_right, 88) + 'px';

    var hd = mk('div', PANEL_ID + '-hd');
    hd.appendChild(mk('span', 'ai-logo', WHALE));
    var tt = mk('div', 'ai-tt');
    var heading = mk('b', null, 'Zany 的 AI 助手');
    heading.id = 'ai-chat-heading';
    tt.appendChild(heading);
    tt.appendChild(mk('span', 'ai-sub', '有问题，随时聊聊'));
    hd.appendChild(tt);
    var bNew = mk('button', 'ai-new', NEW_ICON);
    bNew.type = 'button';
    bNew.title = '新对话';
    bNew.setAttribute('aria-label', bNew.title);
    var bReset = mk('button', 'ai-reset', RESET_ICON);
    bReset.type = 'button';
    bReset.title = '恢复默认大小';
    bReset.setAttribute('aria-label', bReset.title);
    bReset.style.display = 'none';
    var bClose = mk('button', 'ai-close', CLOSE_ICON);
    bClose.type = 'button';
    bClose.title = '收起（Esc）';
    bClose.setAttribute('aria-label', '收起 AI 助手');
    hd.appendChild(bNew);
    hd.appendChild(bReset);
    hd.appendChild(bClose);

    var bd = mk('div', 'ai-bd');
    bd.setAttribute('role', 'region');
    bd.setAttribute('aria-label', '对话内容');
    bd.tabIndex = 0;
    watchScroll(bd);

    var ft = mk('div', PANEL_ID + '-ft');
    ft.appendChild(createSuggestions(false));
    var status = mk('div', 'ai-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    ft.appendChild(status);
    var inbar = mk('div', 'ai-inbar');
    var ta = mk('textarea', 'ai-input');
    ta.rows = 1;
    ta.setAttribute('aria-label', '输入你的问题');
    ta.setAttribute('aria-describedby', 'ai-chat-counter');
    ta.title = 'Enter 发送，Shift + Enter 换行';
    ta.placeholder = '输入你的问题…';
    var send = mk('button', 'ai-send', ICON_SEND);
    send.type = 'button';
    send.title = '发送（Enter）';
    send.setAttribute('aria-label', '发送');
    send.disabled = true;
    inbar.appendChild(ta);
    inbar.appendChild(send);
    var hint = mk('div', 'ai-hint');
    hint.appendChild(mk('span', 'ai-ctx', 'AI 对话体验'));
    hint.appendChild(mk('span', 'ai-enter', '<kbd>Enter</kbd> 发送 · <kbd>Shift + Enter</kbd> 换行'));
    var counter = mk('span', 'ai-counter', '0 / ' + px(CFG.max_input_chars, 1000));
    counter.id = 'ai-chat-counter';
    hint.appendChild(counter);
    ft.appendChild(inbar);
    ft.appendChild(hint);

    p.appendChild(hd);
    p.appendChild(bd);
    p.appendChild(ft);
    p.appendChild(mk('div', 'ai-grip ai-grip-bl'));
    p.appendChild(mk('div', 'ai-grip ai-grip-br'));
    document.body.appendChild(p);
    p.addEventListener('pointerdown', startResize, false);
    applyBox(loadBox());
    return p;
  }

  // 冷启动摊平：点开那一刻的长帧主要来自「面板 DOM 构建 + 该子树首次样式/布局」（实测 180-290ms）。
  // 这份活跟面板可不可见无关（没有 .ai-open 时它就是 opacity:0;visibility:hidden，人看不见但不是 display:none），
  // 所以趁页面空闲先把 DOM 建好、再强制算一次样式和布局，点开时就只剩翻转 class 了。
  var prewarmed = false;
  function prewarm() {
    if (prewarmed) return;
    prewarmed = true;
    var p = buildPanel();
    try { void p.offsetHeight; } catch (e) {}
  }

  function isOpen() {
    var p = document.getElementById(PANEL_ID);
    return !!(p && p.classList.contains('ai-open'));
  }

  function openPanel() {
    var p = buildPanel();
    paintSel(p);
    p.classList.add('ai-open');
    var b = document.getElementById(BTN_ID);
    if (b) { b.classList.add('ai-on'); b.setAttribute('aria-expanded', 'true'); }
    restore();
    refreshPanel();
    autoGrow(qs('.ai-input', p));
    setTimeout(function () { var ta = qs('.ai-input', p); if (ta && isOpen() && !isTouch()) ta.focus(); }, 280);
  }

  function closePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.classList.remove('ai-open');
    var b = document.getElementById(BTN_ID);
    if (b) { b.classList.remove('ai-on'); b.setAttribute('aria-expanded', 'false'); }
  }

  function togglePanel() { if (isOpen()) closePanel(); else openPanel(); }
  function isTouch() { return 'ontouchstart' in window && window.innerWidth <= 768; }

  /* ------------------------------------------------------------------ 轻量 Markdown（代码块 / 行内代码 / 粗斜体 / 链接 / 标题 / 列表 / 引用 / 分隔线） */
  function md(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    var blocks = [], inlines = [];
    text = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, function (m, lang, code) {
      blocks.push('<pre><code>' + esc(String(code).replace(/\n$/, '')) + '</code></pre>');
      return '@@AIB' + (blocks.length - 1) + '@@';
    });
    text = text.replace(/`([^`\n]+)`/g, function (m, code) {
      inlines.push('<code>' + esc(code) + '</code>');
      return '@@AII' + (inlines.length - 1) + '@@';
    });
    var html = esc(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/&lt;(https?:[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

    var lines = html.split('\n'), out = [], list = null, i, m, t;
    function closeList() { if (list) { out.push('</' + list + '>'); list = null; } }
    for (i = 0; i < lines.length; i++) {
      t = lines[i].trim();
      if (!t) { closeList(); continue; }
      if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { closeList(); out.push('<h' + m[1].length + '>' + m[2] + '</h' + m[1].length + '>'); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); out.push('<hr>'); continue; }
      if ((m = t.match(/^[-*+]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + m[1] + '</li>'); continue; }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + m[1] + '</li>'); continue; }
      if ((m = t.match(/^&gt;\s?(.*)$/))) { closeList(); out.push('<blockquote>' + m[1] + '</blockquote>'); continue; }
      closeList();
      out.push('<p>' + t + '</p>');
    }
    closeList();
    var res = out.join('');
    res = res.replace(/<p>\s*@@AIB(\d+)@@\s*<\/p>/g, function (mm, n) { return blocks[+n]; });
    res = res.replace(/@@AIB(\d+)@@/g, function (mm, n) { return blocks[+n] || ''; });
    res = res.replace(/@@AII(\d+)@@/g, function (mm, n) { return inlines[+n] || ''; });
    return res;
  }
  /* 流式渲染用：返回 s 里可以「定稿」的长度（从 from 往后扫，只认中性行边界）。
     md() 是逐行解析的，只要切点满足：① 不在代码围栏里 ② 不在列表项中间 ③ ** 与 [ ] 都成对，
     就有 md(a) + md(b) === md(a+b)（<ul> 项目之间例外，只会多一段 6px 间隙，收尾时整块重渲染回一段），
     于是写完的行可以只渲染一次、之后每帧只重渲染最后一小段。 */
  function tailCut(s, from) {
    var cut = from, inFence = false, block = false, stars = 0, br = 0, i = from, n = s.length;
    while (i < n) {
      var nl = s.indexOf('\n', i);
      var raw = nl < 0 ? s.slice(i) : s.slice(i, nl), t = raw.trim();
      if (inFence) { if (t.indexOf('```') === 0) inFence = false; }
      else if (t.indexOf('```') === 0) { inFence = true; block = false; }
      else {
        // <ul> 项目之间可以切：两段列表只是中间多 6px 间隙（结束时 finish() 会整块重渲染回一段）。
        // <ol> 不行：切成两段列表，编号会从 1 重来。标题 / 引用 / 分隔线 / 普通段落都算中性。
        block = !!(t && /^\d+[.)]\s/.test(t));
        for (var k = raw.indexOf('**'); k >= 0; k = raw.indexOf('**', k + 2)) stars++;
        for (var q = raw.indexOf('['); q >= 0; q = raw.indexOf('[', q + 1)) br++;
        for (var w = raw.indexOf(']'); w >= 0; w = raw.indexOf(']', w + 1)) br--;
      }
      if (nl < 0) break;
      i = nl + 1;
      if (!inFence && !block && stars % 2 === 0 && br === 0) cut = i;
    }
    return cut;
  }

  /* ------------------------------------------------------------------ 当前页签的会话凭证；消息正文统一从数据库恢复 */
  var SESSION_KEY = CFG.session_key || 'ai_chat_session_v1';
  var MAX_MSGS = 80;
  var memorySession = null;

  // 会话凭证只在当前浏览器页签内保存：刷新和站内切页继续同一批对话，
  // 关闭页签后不再恢复；完整消息由后端数据库保存。
  function sessionGet() {
    if (memorySession) return memorySession;
    try {
      var item = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!item || item.v !== 1 || !item.id || !item.token) return null;
      memorySession = item;
      return memorySession;
    } catch (e) { return null; }
  }
  function sessionSet(item) {
    memorySession = item;
    try {
      if (!item) sessionStorage.removeItem(SESSION_KEY);
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify({ v: 1, id: item.id, token: item.token, pending: item.pending }));
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ 面板显示与尺寸 */
  function refreshPanel() {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    paintSel(p);
    fitHint();
  }

  // 窄面板优先保留内容提示，键盘快捷键放在输入框的 title 中作为兜底。
  function fitHint() {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    var h = qs('.ai-hint', p);
    if (!h) return;
    var ctx = qs('.ai-ctx', p), en = qs('.ai-enter', p);
    if (!ctx || !en) return;
    h.classList.remove('ai-narrow');
    if (ctx.scrollWidth > ctx.clientWidth + 1) h.classList.add('ai-narrow');
  }

  // 面板缩放：右下 / 左下角手柄拖动，尺寸记在 localStorage，复位按钮一键回到默认
  var BOX_KEY = 'ai_chat_panel_box_v1';
  var MIN_W = 300, MIN_H = 380;
  function loadBox() {
    try { var b = JSON.parse(localStorage.getItem(BOX_KEY) || 'null'); if (b && b.w >= MIN_W && b.h >= MIN_H) return b; } catch (e) {}
    return null;
  }
  function saveBox(b) { try { if (b) localStorage.setItem(BOX_KEY, JSON.stringify(b)); else localStorage.removeItem(BOX_KEY); } catch (e) {} }
  function boxOf(p) {
    var r = p.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), r: Math.round(window.innerWidth - r.right), t: Math.round(r.top) };
  }
  function applyBox(box) {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    var rb = qs('.ai-reset', p);
    if (!box) {
      p.classList.remove('ai-free');
      p.style.top = '';
      p.style.width = px(CFG.panel_width, 460) + 'px';
      p.style.height = px(CFG.panel_height, 640) + 'px';
      p.style.right = px(CFG.panel_right, 88) + 'px';
      if (rb) rb.style.display = 'none';
      fitHint();
      return;
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = Math.min(Math.max(MIN_W, box.w), Math.max(MIN_W, vw - 24));
    var h = Math.min(Math.max(MIN_H, box.h), Math.max(MIN_H, vh - 24));
    var r = Math.min(Math.max(8, box.r), Math.max(8, vw - w - 8));
    var tp = Math.min(Math.max(8, box.t), Math.max(8, vh - h - 8));
    p.classList.add('ai-free');
    p.style.width = w + 'px';
    p.style.height = h + 'px';
    p.style.right = r + 'px';
    p.style.top = tp + 'px';
    if (rb) rb.style.display = '';
    fitHint();
  }
  function resetBox() {
    saveBox(null);
    applyBox(null);
    var p = document.getElementById(PANEL_ID);
    if (p) autoGrow(qs('.ai-input', p));
  }
  function startResize(e) {
    var grip = e.target && e.target.closest ? e.target.closest('.ai-grip') : null;
    if (!grip) return;
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    if (!p.classList.contains('ai-free')) applyBox(boxOf(p));
    var isBR = String(grip.className).indexOf('ai-grip-br') >= 0;
    var sx = e.clientX, sy = e.clientY;
    var r1 = p.getBoundingClientRect();
    var w0 = r1.width, h0 = r1.height, top0 = r1.top, left0 = r1.left;
    var right = Math.max(8, window.innerWidth - r1.right);
    var live = true;
    var pid = (e.pointerId == null ? null : e.pointerId);
    function move(ev) {
      if (!live) return;
      var dw = isBR ? (ev.clientX - sx) : (sx - ev.clientX);
      var maxW = Math.max(MIN_W, window.innerWidth - (isBR ? left0 : right) - 16);
      var maxH = Math.max(1, Math.min(window.innerHeight - top0 - 16, window.innerHeight - 32));
      var width = Math.round(Math.min(Math.max(MIN_W, w0 + dw), maxW));
      p.style.width = width + 'px';
      // 右侧手柄固定左边缘，左侧手柄固定右边缘，让窗口跟随拖拽方向缩放。
      p.style.right = (isBR ? Math.max(8, window.innerWidth - left0 - width) : right) + 'px';
      p.style.height = Math.round(Math.min(Math.max(Math.min(MIN_H, maxH), h0 + (ev.clientY - sy)), maxH)) + 'px';
      autoGrow(qs('.ai-input', p));
      fitHint();
    }
    function up() {
      if (!live) return;
      live = false;
      window.removeEventListener('pointermove', move, false);
      window.removeEventListener('pointerup', up, false);
      window.removeEventListener('pointercancel', up, false);
      window.removeEventListener('blur', up, false);
      document.removeEventListener('pointerup', up, false);
      try { if (pid != null && grip.releasePointerCapture) grip.releasePointerCapture(pid); } catch (e1) {}
      saveBox(boxOf(p));
      var rb = qs('.ai-reset', p);
      if (rb) rb.style.display = '';
    }
    /* 指针捕获 + pointercancel/blur 兜底：在窗口外松手、切窗口、触屏手势被系统接管时也能收尾。
       否则 move 一直挂在 window 上 —— 面板会黏着鼠标乱缩，下一次拖拽也会跟这个残留监听打架，看着像拖不动。 */
    try { if (pid != null && grip.setPointerCapture) grip.setPointerCapture(pid); } catch (e2) {}
    window.addEventListener('pointermove', move, false);
    window.addEventListener('pointerup', up, false);
    window.addEventListener('pointercancel', up, false);
    window.addEventListener('blur', up, false);
    document.addEventListener('pointerup', up, false);
  }
  function clampBox() {
    var p = document.getElementById(PANEL_ID);
    // 手机端由 CSS 定位，不能把底部面板的尺寸回写成桌面端的窗口尺寸。
    if (!p || !p.classList.contains('ai-free') || window.innerWidth <= 768) return;
    applyBox(loadBox() || boxOf(p));
  }

  /* ------------------------------------------------------------------ 消息渲染 */
  var state = { busy: false, restoring: false, readOnly: false, restoreFailed: false, ctrl: null, cancel: null };

  // 同步结束状态再中断网络，防止旧请求的异步回调影响下一次对话。
  function stopRequest(discard, force) {
    var ctrl = state.ctrl;
    var ready = state.creationReady || Promise.resolve();
    var stopNow = state.cancel ? state.cancel(discard, force) : true;
    if (ctrl && stopNow !== false) ctrl.abort();
    return ready;
  }

  function bd() { var p = document.getElementById(PANEL_ID); return p ? qs('.ai-bd', p) : null; }
  /* 滚动与流式渲染的性能约定（实测：改造前同场景强制同步布局 7015ms / 63fps，改造后 17ms / 90fps）
       ① 是否贴底用一个 stick 标记（由 scroll 事件异步维护），不在每个分片里读布局属性；
       ② 写滚动位置用 scrollTop = 1e9（越界浏览器会自动夹到最大值），省掉读 scrollHeight 造成的强制布局。 */
  var stick = true;
  function atBottom(b) { return b.scrollHeight - b.scrollTop - b.clientHeight < 90; }
  function scrollBottom(force) {
    var b = bd();
    if (!b) return;
    if (force) stick = true;
    if (stick) b.scrollTop = 1e9;
  }
  function watchScroll(b) {
    if (!b) return;
    stick = true;
    b.addEventListener('scroll', function () { stick = atBottom(b); }, { passive: true });
  }
  /* 流式渲染调度：分片只累积文本，真正的 DOM 提交合并成「每帧最多一次」（再兜一个 100ms 上限）。
     原来是每收到一个分片就 bub.innerHTML = md(acc) 再马上 scrollBottom()，而 scrollBottom 要读
     scrollHeight/scrollTop/clientHeight —— 刚写完 DOM 就读布局属性会强制同步布局（每次约 2ms）。
     SSE 成批到达时一个任务里能连做十几次，攒出 60ms+ 的长任务，这就是长回答吐字时掉帧的来源。 */
  var FLUSH_MAX = 100;
  var pendJob = null, pendRaf = 0, pendTimer = 0;
  function clearPend() {
    if (pendRaf) { cancelAnimationFrame(pendRaf); pendRaf = 0; }
    if (pendTimer) { clearTimeout(pendTimer); pendTimer = 0; }
  }
  function runPend() { var job = pendJob; clearPend(); pendJob = null; if (job) job(); }
  function dropPend() { clearPend(); pendJob = null; }
  function scheduleRender(job) {
    pendJob = job;                                                  // 只保留最新一次，旧的直接丢弃
    if (!pendRaf) pendRaf = requestAnimationFrame(function () { pendRaf = 0; runPend(); });
    if (!pendTimer) pendTimer = setTimeout(function () { pendTimer = 0; runPend(); }, FLUSH_MAX);
  }
  function addRow(role, content) {
    var b = bd();
    if (!b) return null;
    var p = document.getElementById(PANEL_ID);
    if (p.classList.contains('ai-empty')) {
      b.innerHTML = '';
      p.classList.remove('ai-empty');
    }
    var row = mk('div', 'ai-row ' + (role === 'user' ? 'user' : (role === 'err' ? 'err' : 'ai')));
    if (role !== 'user') row.appendChild(mk('span', 'ai-av', role === 'err' ? '!' : WHALE));
    var bub = mk('div', 'ai-bub');
    if (role === 'user') bub.textContent = content;
    else if (content) bub.innerHTML = md(content);
    row.appendChild(bub);
    b.appendChild(row);
    scrollBottom(true);
    return bub;
  }
  function addTyping() {
    var bub = addRow('ai', '');
    if (bub) bub.innerHTML = '<span class="ai-wait">正在思考<span class="ai-ell"><i>.</i><i>.</i><i>.</i></span></span>';
    return bub;
  }
  function setSendState(busy) {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    var s = qs('.ai-send', p);
    if (!s) return;
    var input = qs('.ai-input', p);
    var length = input ? charCount(input.value) : 0;
    var overLimit = length > px(CFG.max_input_chars, 1000);
    s.disabled = !busy && (state.restoring || state.readOnly || state.restoreFailed || !(input && input.value.trim()) || overLimit);
    qs('.ai-bd', p).setAttribute('aria-busy', busy ? 'true' : 'false');
    p.classList.toggle('ai-busy', busy);
    p.querySelectorAll('.ai-chip').forEach(function (chip) { chip.disabled = busy || state.restoring || state.readOnly || state.restoreFailed; });
    var status = qs('.ai-status', p);
    var statusText = state.restoring ? '正在恢复对话…' :
      (state.restoreFailed ? '对话恢复失败，重新打开面板可重试' :
        (state.readOnly ? '当前对话已结束或过期，点击右上角开始新对话' :
          (busy ? '正在整理回答，可点击右下方停止' : '')));
    if (status && status.textContent !== statusText) status.textContent = statusText;
    if (busy) {
      s.classList.add('ai-stop'); s.innerHTML = ICON_STOP;
      s.title = '停止生成'; s.setAttribute('aria-label', '停止生成');
    } else {
      s.classList.remove('ai-stop'); s.innerHTML = ICON_SEND;
      s.title = '发送（Enter）'; s.setAttribute('aria-label', '发送');
    }
    updateInputMeta(input);
  }
  var TA_CAP = 132;
  function autoGrow(ta) {
    if (!ta) return;
    var p = document.getElementById(PANEL_ID);
    // 缩小面板或弹出软键盘时为消息区留出空间，长草稿在输入框内部滚动。
    var cap = Math.min(TA_CAP, Math.max(42, Math.floor((p ? p.clientHeight : 640) * 0.18)));
    ta.style.height = 'auto';
    var full = ta.scrollHeight + 2;              // border-box：scrollHeight 不含上下边框，+2 免得差 2px 就冒出滚动条
    ta.style.height = Math.min(full, cap) + 'px';
    ta.style.overflowY = full > cap ? 'auto' : 'hidden';
  }
  function charCount(value) { return Array.from(cleanSurrogates(value)).length; }
  function updateInputMeta(input) {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    var counter = qs('.ai-counter', p);
    if (!counter) return;
    var length = input ? charCount(input.value) : 0;
    var max = px(CFG.max_input_chars, 1000);
    counter.textContent = length + ' / ' + max;
    counter.classList.toggle('ai-limit', length > max);
  }
  function apiPath(path) {
    return String(CFG.api_base || '/api').replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
  }
  function newTurnId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function newCreationToken() {
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (value) { return ('0' + value.toString(16)).slice(-2); }).join('');
  }
  function responseError(resp) {
    return resp.text().then(function (text) {
      var detail = '';
      try {
        var body = JSON.parse(text);
        detail = (body.error || {}).message || body.detail || '';
      } catch (e) { detail = text; }
      var err = new Error('HTTP ' + resp.status + (detail ? '：' + String(detail) : ''));
      err.status = resp.status;
      throw err;
    });
  }
  function friendly(msg) {
    var m = String(msg || '').match(/^HTTP (\d+)(?:[:：])?(.*)$/);
    if (m) {
      var code = m[1];
      if (code === '401' || code === '402') return 'AI 暂时无法使用，请稍后再试。';
      if (code === '409') return '当前对话已有回答正在生成，请稍后再试。';
      if (code === '410') return '当前对话已经结束，请点击右上角的新对话按钮。';
      if (code === '422') return '问题内容不符合要求，请检查字数后重试。';
      if (code === '429') return '请求太频繁了，请稍后再发。';
      if (code === '502' || code === '504') return '暂时无法回答，过一会儿再试。';
      if (code === '500' || code === '503') return 'AI 暂时无法使用，请稍后重试。';
      if (code === '404') return '当前对话不可用，请点击右上角的新对话按钮。';
      return '请求失败，请稍后重试。';
    }
    if (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(String(msg))) {
      return '连接失败，请检查网络后重试。';
    }
    return '暂时出了点问题，请稍后重试。';
  }
  /* ------------------------------------------------------------------ 发送 / 流式接收 */
  function send(text) {
    var p = document.getElementById(PANEL_ID);
    if (!p || state.busy || state.restoring || state.readOnly || state.restoreFailed || newPending) return;
    text = String(text == null ? '' : text).trim();
    if (!text) { setSendState(false); return; }
    var maxInput = px(CFG.max_input_chars, 1000);
    if (charCount(text) > maxInput) {
      if (typeof window.fomalNotify === 'function') {
        window.fomalNotify({ title: '问题过长', message: '单次问题最多输入 ' + maxInput + ' 个字符。', type: 'warning', position: 'top-left' });
      }
      setSendState(false);
      return;
    }

    addRow('user', text);
    var bub = addTyping();
    refreshPanel();

    state.busy = true;
    setSendState(true);
    state.ctrl = ('AbortController' in window) ? new AbortController() : null;
    var signal = state.ctrl ? state.ctrl.signal : undefined;
    var acc = '', done = false, gotFirst = false, gotThink = false, lastFinish = '';
    var saved = false, streamError = '', conversation = sessionGet();
    var initial = !conversation || !!conversation.pending;
    var turnId = conversation && conversation.pending ? conversation.pending.turn_id : newTurnId();
    if (!conversation) {
      conversation = { id: turnId, token: newCreationToken(), pending: { turn_id: turnId, content: cleanSurrogates(text) } };
      sessionSet(conversation);
    }
    var awaitingCredentials = initial;
    var deferredStop = null, resolveCreation;
    state.creationReady = new Promise(function (resolve) { resolveCreation = resolve; });
    if (!initial) resolveCreation();
    state.cancel = function (discard, force) {
      // 首条问题已提交但凭证尚未到达时，先接收凭证再停止，避免丢失当前会话。
      if (awaitingCredentials && !force) {
        deferredStop = discard ? '__discard__' : '__stop__';
        return false;
      }
      finish(discard ? '__discard__' : '__stop__');
      return true;
    };
    var headers = { 'Content-Type': 'application/json' };
    var endpoint = '/ai/conversations';
    if (!initial) {
      endpoint += '/' + encodeURIComponent(conversation.id) + '/messages';
      headers['X-Conversation-Token'] = conversation.token;
    }
    // 流式渲染分两块：已经写完的行只追加一次（不再重渲染），每帧只重渲染最后那段「正在写的尾巴」。
    // 合并渲染：一次提交里同时更新气泡与滚动位置（原来这两件事是每个分片各做一遍）
    var tailEl = null, settled = 0;
    function streamCommit() {
      if (done || !bub || !bub.parentNode) return;  // 气泡已被清空（换页 / 重开面板）就别再写了
      if (!tailEl || tailEl.parentNode !== bub) {   // 第一个分片：清掉「深度求索中…」，建一个尾块
        bub.innerHTML = '';
        tailEl = mk('div', 'ai-tail');
        bub.appendChild(tailEl);
        settled = 0;
      }
      var cut = tailCut(acc, settled);
      if (cut > settled) {                          // 尾巴里出现了新的完整行 → 定稿，追加一次后就不再动它
        tailEl.insertAdjacentHTML('beforebegin', md(acc.slice(settled, cut)));
        settled = cut;
      }
      tailEl.innerHTML = md(acc.slice(settled)) + '<span class="ai-cursor"></span>';
      scrollBottom(false);
    }
    var timeoutMs = px(CFG.timeout_ms, 65000);
    // 超时保护：首字迟迟不来、或中途卡住不再吐字，都算超时（每收到一段就重新计时）
    var to = null;
    function armTo() {
      if (done) return;
      if (to) clearTimeout(to);
      to = setTimeout(function () {
        if (done) return;
        if (state.ctrl) state.ctrl.abort();
        finish(acc ? '__stall__' : '请求超时：' + Math.round(timeoutMs / 1000) + ' 秒没收到回复，稍后重试。');
      }, timeoutMs);
    }
    armTo();

    function finish(errText) {
      if (done) return;
      done = true;
      dropPend();               // 丢掉还没提交的那次流式渲染，最终状态由下面这段自己写
      if (to) clearTimeout(to);
      state.busy = false;
      state.ctrl = null;
      state.cancel = null;
      resolveCreation();
      state.creationReady = null;
      if (errText !== '__discard__' && !saved && sessionGet() && !state.restoreFailed) {
        // 断流后查询数据库，等后端完成保存再允许下一轮；刷新也走同一恢复流程。
        state.restoring = true;
        recoveryTimer = setTimeout(function () { p.removeAttribute('data-restored'); restore(); }, 250);
      }
      setSendState(false);
      if (errText === '__discard__') return;
      if (!bub) return;
      if (errText === '__stop__') {
        if (acc) { bub.innerHTML = md(acc); refreshPanel(); }
        else { bub.parentNode.className = 'ai-row err'; bub.innerHTML = '（已停止）'; }
        scrollBottom(false);
        return;
      }
      if (errText === '__stall__') {
        // 已经吐了一半就卡住：保留已收到的内容，只在后面补一句说明
        bub.innerHTML = md(acc) + '<div class="ai-note">（' + Math.round(timeoutMs / 1000) + ' 秒没有新内容，已停止接收，可以再问一次。）</div>';
        refreshPanel();
        scrollBottom(false);
        return;
      }
      if (errText) {
        if (acc) bub.innerHTML = md(acc) + '<div class="ai-note">' + errText + '</div>';
        else { bub.parentNode.className = 'ai-row err'; bub.innerHTML = errText; }
        scrollBottom(false);
        return;
      }
      if (!acc) {
        bub.parentNode.className = 'ai-row err';
        // 思考型模型会先吐 reasoning_content；额度耗尽时可能没有正文。
        bub.innerHTML = gotThink
          ? '模型没能在本次回复额度内生成正文，可以把问题问得更具体一些再试。'
          : '模型没有返回内容，稍后再试一次。';
        scrollBottom(false);
        return;
      }
      bub.innerHTML = md(acc) + (lastFinish === 'length' ? '<div class="ai-note">（回答较长，你可以继续追问。）</div>' : '');
      scrollBottom(false);
      refreshPanel();
    }

    function consumeLine(line) {
      if (done || line.indexOf('data:') !== 0) return;
      var payload = line.slice(5).trim();
      if (!payload) return;
      if (payload === '[DONE]') {
        finish(saved ? streamError || null : '连接中断，正在恢复对话。');
        return;
      }
      var item;
      try { item = JSON.parse(payload); } catch (e) { return; }
      armTo();
      if (item.type === 'conversation') {
        if (!item.conversation_id || !item.conversation_token) throw new Error('AI 后端没有返回完整的会话凭证');
        conversation = { id: item.conversation_id, token: item.conversation_token };
        sessionSet(conversation);
        awaitingCredentials = false;
        resolveCreation();
        if (deferredStop) {
          var ctrl = state.ctrl;
          finish(deferredStop);
          if (ctrl) ctrl.abort();
        }
        return;
      }
      if (item.type === 'error') { streamError = esc(String(item.message || '回答失败，请重新提问')); return; }
      if (item.type === 'complete') {
        saved = true;
        if (item.finish_reason) lastFinish = String(item.finish_reason);
        if (item.status === 4 && !streamError) streamError = '回答未正常完成，可重新提问';
        finish(streamError || null);
        return;
      }
      var choice = item.choices && item.choices[0];
      var delta = choice && (choice.delta || choice.message);
      if (choice && choice.finish_reason) lastFinish = String(choice.finish_reason);
      if (delta && delta.reasoning_content) gotThink = true;
      if (delta && delta.content) {
        gotFirst = true;
        acc += delta.content;
        if (bub) scheduleRender(streamCommit);
      }
    }
    fetch(apiPath(endpoint), {
      method: 'POST', headers: headers,
      body: JSON.stringify(initial ? {
        turn_id: turnId, content: conversation.pending.content, creation_token: conversation.token
      } : { turn_id: turnId, content: cleanSurrogates(text) }), signal: signal
    }).then(function (resp) {
      if (done) return;
      if (!resp.ok) return responseError(resp);
      if (!resp.body || !resp.body.getReader) {
        return resp.text().then(function (body) {
          body.split(/\r?\n/).forEach(consumeLine);
          if (!done) finish('连接中断，正在恢复对话。');
        });
      }
      var reader = resp.body.getReader(), dec = new TextDecoder('utf-8'), buf = '';
      // 首字到达前保留「正在思考…」，避免等待过程中出现空白气泡。
      // 第一个 content 分片会用 md(acc) 把它覆盖掉（见下面的 piece 分支）。
      function pump() {
        return reader.read().then(function (r) {
          if (done) return reader.cancel();
          if (r.done) {
            buf += dec.decode();
            buf.split(/\r?\n/).forEach(consumeLine);
            if (!done) finish('连接中断，正在恢复对话。');
            return;
          }
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split('\n');
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            consumeLine(parts[i].trim());
          }
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      if (done) return;
      if (err && (err.name === 'AbortError' || /aborted/i.test(String(err.message)))) { finish('__stop__'); return; }
      if (initial && awaitingCredentials && err && err.status && err.status !== 409) {
        // 网关的 5xx 也可能出现在事务提交后；保留凭证，重新打开面板时先查询再重试。
        if (err.status >= 500 && err.status < 600) {
          state.restoreFailed = true;
          p.removeAttribute('data-restored');
        } else sessionSet(null);
      }
      if (!initial && err && (err.status === 404 || err.status === 410)) state.readOnly = true;
      finish(friendly(err && err.message ? err.message : err));
    });
  }

  /* ------------------------------------------------------------------ 打开面板时的历史恢复 */
  var recoveryTimer = 0, restoreVersion = 0;
  function cancelRecovery() {
    restoreVersion++;
    if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = 0; }
  }
  function renderWelcome() {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    var body = qs('.ai-bd', p);
    body.innerHTML = '';
    p.setAttribute('data-restored', 'true');
    p.classList.add('ai-empty');
    var welcome = mk('div', 'ai-welcome');
    welcome.appendChild(mk('span', 'ai-welcome-logo', WHALE));
    welcome.appendChild(mk('h3', null, '今天想聊点什么？'));
    var description = mk('p');
    description.textContent = CFG.welcome;
    welcome.appendChild(description);
    welcome.appendChild(createSuggestions(true));
    body.appendChild(welcome);
    body.scrollTop = 0;
    stick = true;
    state.readOnly = false;
    state.restoreFailed = false;
    setSendState(false);
    refreshPanel();
  }
  function restore() {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    if (p.hasAttribute('data-restored')) return;
    cancelRecovery();
    var version = restoreVersion;
    p.setAttribute('data-restored', 'true');
    qs('.ai-bd', p).innerHTML = '';
    var conversation = sessionGet();
    if (!conversation) {
      state.restoring = false;
      renderWelcome();
      return;
    }
    state.restoring = true;
    state.restoreFailed = false;
    setSendState(false);
    function current() { return version === restoreVersion && p.isConnected; }
    function load() {
      fetch(apiPath('/ai/conversations/' + encodeURIComponent(conversation.id) + '/messages?limit=' + MAX_MSGS), {
        headers: { 'X-Conversation-Token': conversation.token }, cache: 'no-store'
      }).then(function (resp) {
        if (!resp.ok) return responseError(resp);
        return resp.json();
      }).then(function (page) {
        if (!current()) return;
        var items = page.items || [];
        if (conversation.pending) {
          conversation = { id: conversation.id, token: conversation.token };
          sessionSet(conversation);
        }
        qs('.ai-bd', p).innerHTML = '';
        if (!items.length) renderWelcome();
        else {
          p.classList.remove('ai-empty');
          items.forEach(renderStoredMessage);
        }
        state.readOnly = page.can_continue === false;
        var generating = items.some(function (item) { return item.status === 1; });
        state.restoring = generating;
        if (generating) recoveryTimer = setTimeout(load, 1000);
        else if (page.has_more) addHistoryButton(conversation, page.next_before_sequence);
        scrollBottom(true);
        setSendState(false);
      }).catch(function (err) {
        if (!current()) return;
        state.restoring = false;
        if (err.status === 404 && conversation.pending) {
          // 首次提交可能在刷新时尚未落库，使用相同标识和凭证重试，后端不会重复创建。
          var pending = conversation.pending;
          renderWelcome();
          send(pending.content);
          return;
        }
        if (err.status === 404) {
          state.readOnly = true;
          addRow('err', '当前对话已不可用，请点击右上角开始新对话。');
        } else {
          state.restoreFailed = true;
          p.removeAttribute('data-restored');
          addRow('err', '恢复对话失败。重新打开面板可重试。');
        }
        setSendState(false);
      });
    }
    load();
  }
  function renderStoredMessage(message) {
    var content = message.content || '';
    var bubble = addRow(message.role === 'user' ? 'user' : 'ai', content);
    if (!bubble || message.role === 'user') return bubble;
    var note = '';
    if (message.status === 1) note = '（正在生成回答，将自动更新）';
    if (message.status === 3) note = '（已停止）';
    if (message.status === 4) note = '（回答失败，可重新提问）';
    if (message.finish_reason === 'length') note = '（回答达到本次长度上限）';
    if (note) bubble.appendChild(mk('div', 'ai-note', esc(note)));
    return bubble;
  }
  function addHistoryButton(conversation, beforeSequence) {
    var version = restoreVersion;
    var body = bd();
    var button = mk('button', 'ai-history-more', '加载更早的对话');
    button.type = 'button';
    body.insertBefore(button, body.firstChild);
    button.addEventListener('click', function () {
      button.disabled = true;
      fetch(apiPath('/ai/conversations/' + encodeURIComponent(conversation.id) + '/messages?limit=' + MAX_MSGS + '&before_sequence=' + beforeSequence), {
        headers: { 'X-Conversation-Token': conversation.token }, cache: 'no-store'
      }).then(function (resp) {
        if (!resp.ok) return responseError(resp);
        return resp.json();
      }).then(function (page) {
        if (!button.isConnected || version !== restoreVersion) return;
        var previousHeight = body.scrollHeight;
        var anchor = button.nextSibling;
        button.remove();
        (page.items || []).forEach(function (message) {
          var bubble = renderStoredMessage(message);
          if (bubble) body.insertBefore(bubble.parentNode, anchor);
        });
        if (page.has_more) addHistoryButton(conversation, page.next_before_sequence);
        body.scrollTop = body.scrollHeight - previousHeight;
        stick = atBottom(body);
      }).catch(function () {
        button.disabled = false;
        button.textContent = '加载失败，点击重试';
      });
    });
  }

  /* ------------------------------------------------------------------ 事件（全部走事件委托，pjax 换掉按钮也不用重新绑定） */
  // 连点两下页面空白处 = 收起面板（点在链接 / 按钮 / 输入框这些「非空白」目标上不算）
  var lastBlank = 0;
  function blankClick(t) {
    if (!isOpen()) { lastBlank = 0; return; }
    if (t.closest && t.closest('a,button,input,textarea,select,label,summary,img,video,audio,[role="button"],[contenteditable="true"]')) { lastBlank = 0; return; }
    var now = Date.now();
    if (now - lastBlank < 700) { lastBlank = 0; closePanel(); return; }
    lastBlank = now;
  }
  var newPending = false;
  function onDocClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#' + BTN_ID)) { e.preventDefault(); lastBlank = 0; togglePanel(); return; }
    var p = document.getElementById(PANEL_ID);
    if (!p || !p.contains(t)) { blankClick(t); return; }
    // 点了日夜模式按钮后，等主题把 data-theme 改完，再把选中配色跟着换一遍
    if (t.closest('#nightmode-button,[title*="浅色和深色"],[title*="夜间模式"]')) {
      var pn = document.getElementById(PANEL_ID);
      if (pn) setTimeout(function () { paintSel(pn); }, 450);
      return;
    }
    if (t.closest('.ai-reset')) { resetBox(); return; }
    if (t.closest('.ai-close')) { closePanel(); return; }
    if (t.closest('.ai-new')) {
      if (newPending) return;
      newPending = true;
      var panel = p;
      var confirmation = typeof window.fomalConfirm === 'function' ? window.fomalConfirm('开始一段新的对话吗？', {
        title: '新对话', confirmText: '开始新对话'
      }) : Promise.resolve(true);
      confirmation.then(function (confirmed) {
        if (!confirmed || !panel.isConnected) { newPending = false; return; }
        var ready = stopRequest(true);
        cancelRecovery();
        state.restoring = true;
        setSendState(false);
        var close = ready.then(function () {
          var conversation = sessionGet();
          return conversation ? fetch(apiPath('/ai/conversations/' + encodeURIComponent(conversation.id) + '/close'), {
            method: 'POST', headers: { 'X-Conversation-Token': conversation.token }
          }).then(function (resp) {
            if (!resp.ok && resp.status !== 404 && resp.status !== 410) return responseError(resp);
          }) : undefined;
        });
        close.then(function () {
          sessionSet(null);
          var input = qs('.ai-input', panel);
          if (input) { input.value = ''; autoGrow(input); }
          renderWelcome();
        }).catch(function () {
          addRow('err', '暂时无法开始新对话，请稍后重试。');
        }).then(function () {
          newPending = false;
          state.restoring = false;
          setSendState(false);
        });
      });
      return;
    }
    var chip = t.closest('.ai-chip');
    if (chip) { send(chip.getAttribute('data-q')); return; }
    if (t.closest('.ai-send')) {
      if (state.busy) { stopRequest(false); return; }
      var ta = qs('.ai-input', p);
      if (ta) submitInput(ta);
    }
  }
  function onDocKey(e) {
    if (e.key === 'Escape' && isOpen()) { closePanel(); return; }
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('ai-input')) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitInput(t);
    }
  }
  function submitInput(input) {
    if (state.busy || state.restoring || state.readOnly || state.restoreFailed || newPending) return;
    var value = input.value;
    if (charCount(value) <= px(CFG.max_input_chars, 1000)) input.value = '';
    autoGrow(input);
    send(value);
  }
  function watchRightside() {
    var host = qs('#rightside');
    if (!host || !window.MutationObserver || host.__aiWatched) return;
    host.__aiWatched = true;
    new MutationObserver(function () { if (!document.getElementById(BTN_ID)) ensureButton(); })
      .observe(host, { childList: true, subtree: true });
  }

  function init() {
    ensureStyle();
    ensureButton();
    watchRightside();
    // 空闲时（或按钮被碰到时）提前把面板建好，见 prewarm() 的注释
    if (window.requestIdleCallback) window.requestIdleCallback(function () { prewarm(); }, { timeout: 2500 });
    else setTimeout(prewarm, 1500);
    document.addEventListener('click', onDocClick, false);
    document.addEventListener('keydown', onDocKey, false);
    document.addEventListener('input', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('ai-input')) {
        autoGrow(e.target);
        setSendState(state.busy);
      }
    }, false);
    window.addEventListener('resize', function () {
      clampBox();
      fitHint();
      var p = document.getElementById(PANEL_ID);
      if (p) autoGrow(qs('.ai-input', p));
    }, false);
    // 刷新/关闭只停止网络，不清除页签凭证。sessionStorage 自身负责普通关闭后的清理。
    window.addEventListener('pagehide', function () { stopRequest(true, true); cancelRecovery(); });
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      var p = document.getElementById(PANEL_ID);
      if (p) { p.removeAttribute('data-restored'); if (isOpen()) restore(); }
    });
    // 主题色/日夜模式都是运行时改的（主题把 --theme-color 写在 <html> 的 style 上）：
    // 盯住它，任何变化都重算一次面板里的主题色派生值（旧浏览器没有 color-mix 时靠这里兜底）
    try {
      new MutationObserver(function () {
        var pn = document.getElementById(PANEL_ID);
        if (pn) paintSel(pn);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'class'] });
    } catch (e) {}
    // PJAX 仅重挂工具栏按钮，面板与当前对话保留，正在生成的回答继续接收。
    document.addEventListener('pjax:send', closePanel);
    document.addEventListener('pjax:complete', function () {
      closePanel();
      ensureButton();
      watchRightside();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
