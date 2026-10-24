/* 收起顶栏、首页打字文字、看板娘、FPS 与右侧工具按钮，并保留最下方按钮用于恢复。 */
(function () {
  'use strict';

  var STORAGE_KEY = 'site-ui-collapsed';
  var root = document.documentElement;
  var closeTimer = null;
  var previousTitle = false;
  var suppressHover = false;
  var navHeight = 60;
  var navObserver = null;

  function cancelClose() {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  function syncNavHeight() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    navHeight = nav.getBoundingClientRect().height || 60;
    root.style.setProperty('--site-nav-height', navHeight + 'px');
  }

  function inNavArea(event) {
    if (event.clientY >= 0 && event.clientY < navHeight && event.clientX >= 0 && event.clientX < window.innerWidth) return true;
    var target = event.type === 'pointerleave' ? event.relatedTarget : event.target;
    return !!(target && target.closest && target.closest('#nav'));
  }

  function isCollapsed() { return root.classList.contains('site-ui-collapsed'); }

  function closeDrawer() {
    if (!isCollapsed() || !document.querySelector('#sidebar-menus.open')) return;
    var mask = document.getElementById('menu-mask');
    // 复用主题的关闭入口，同时恢复其滚动锁与内部开关状态。
    if (mask) mask.click();
  }

  function revealNav(open) {
    cancelClose();
    open = open && isCollapsed();
    var nav = document.getElementById('nav');
    var wasOpen = root.classList.contains('site-nav-peek');
    if (open && !wasOpen) previousTitle = nav && nav.classList.contains('nav-title-visible');
    root.classList.toggle('site-nav-peek', open);
    if (nav) {
      nav.inert = isCollapsed() && !open;
      if (nav.inert) nav.setAttribute('aria-hidden', 'true');
      else nav.removeAttribute('aria-hidden');
    }
    if (typeof window.setNavTitleVisible === 'function' && (open || wasOpen)) {
      var requestedTitle = nav && typeof nav.__siteNavTitleRequested === 'boolean'
        ? nav.__siteNavTitleRequested : previousTitle;
      window.setNavTitleVisible(open ? false : requestedTitle, true);
    }
    var trigger = document.getElementById('site-nav-reveal');
    if (trigger) {
      trigger.hidden = !isCollapsed();
      trigger.setAttribute('aria-expanded', String(open));
      trigger.setAttribute('aria-label', open ? '收起顶部菜单' : '展开顶部菜单');
    }
  }

  function initReveal() {
    var trigger = document.getElementById('site-nav-reveal');
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.id = 'site-nav-reveal';
      trigger.type = 'button';
      trigger.setAttribute('aria-controls', 'nav');
      document.body.appendChild(trigger);
      trigger.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'mouse' && !suppressHover) revealNav(true);
      });
      trigger.addEventListener('pointerleave', scheduleClose);
      trigger.addEventListener('click', function (event) {
        // 鼠标悬停已展开；触屏点击和键盘激活则切换。
        if (event.detail && window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        var open = !root.classList.contains('site-nav-peek');
        revealNav(open);
        if (open && event.detail === 0) {
          var first = document.querySelector('#nav a[href], #nav button');
          if (first) first.focus();
        }
      });
    }
    var nav = document.getElementById('nav');
    syncNavHeight();
    if (navObserver) navObserver.disconnect();
    if (nav && typeof window.ResizeObserver === 'function') {
      navObserver = new ResizeObserver(syncNavHeight);
      navObserver.observe(nav);
    }
    if (nav && !nav.__sitePeekBound) {
      nav.__sitePeekBound = true;
      nav.addEventListener('pointerenter', cancelClose);
      nav.addEventListener('pointerleave', scheduleClose);
      nav.addEventListener('focusout', function () {
        window.setTimeout(function () {
          if (!nav.isConnected || nav !== document.getElementById('nav')) return;
          if (!nav.contains(document.activeElement) && !nav.matches(':hover')) revealNav(false);
        }, 0);
      });
    }
    revealNav(false);
  }

  function scheduleClose(event) {
    if (event.pointerType !== 'mouse') return;
    // 导航滑入期间感应区会让出点击，鼠标仍在整条菜单高度内时保持展开。
    if (inNavArea(event)) { cancelClose(); return; }
    if (closeTimer !== null) return;
    closeTimer = window.setTimeout(function () {
      closeTimer = null;
      if (!document.querySelector('#sidebar-menus.open')) revealNav(false);
    }, 0);
  }

  function readState() {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch (error) { return false; }
  }

  function writeState(collapsed) {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (error) { /* 存储不可用时仍允许本次切换。 */ }
  }

  function syncButton() {
    var button = document.getElementById('site-ui-toggle');
    if (!button) return;
    var collapsed = root.classList.contains('site-ui-collapsed');
    var label = collapsed ? '展开页面菜单、文字与悬浮部件' : '收起页面菜单、文字与悬浮部件';
    button.setAttribute('aria-pressed', String(collapsed));
    button.setAttribute('aria-label', label);
    button.title = label;
    var icon = button.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-eye', collapsed);
      icon.classList.toggle('fa-eye-slash', !collapsed);
    }
  }

  function applyState(collapsed, save) {
    root.classList.toggle('site-ui-collapsed', collapsed);
    revealNav(false);
    if (save) writeState(collapsed);
    syncButton();
  }

  // 脚本在 head 中同步执行，先恢复类名，避免刷新时先显示再收起。
  applyState(readState(), false);

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('#site-ui-toggle') : null;
    if (!target) {
      if (event.target && event.target.closest && !event.target.closest('#nav, #site-nav-reveal, #sidebar-menus')) revealNav(false);
      return;
    }
    applyState(!root.classList.contains('site-ui-collapsed'), true);
  });
  function syncPage() { syncButton(); initReveal(); }
  document.addEventListener('DOMContentLoaded', syncPage);
  document.addEventListener('pjax:send', function () { closeDrawer(); revealNav(false); });
  document.addEventListener('pjax:complete', syncPage);
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      suppressHover = true;
      closeDrawer();
      syncPage();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      // 鼠标仍在顶部时，收起后新露出的触发区不能马上重新展开。
      suppressHover = true;
      closeDrawer();
      revealNav(false);
    }
  });
  document.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse') return;
    if (event.clientY >= navHeight) suppressHover = false;
    if (!isCollapsed()) return;
    if (inNavArea(event)) {
      cancelClose();
      if (!suppressHover && !root.classList.contains('site-nav-peek')) revealNav(true);
    } else if (root.classList.contains('site-nav-peek')) scheduleClose(event);
  }, { passive: true });
  window.addEventListener('scroll', function () {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches && !document.querySelector('#sidebar-menus.open')) revealNav(false);
  }, { passive: true });
  window.addEventListener('resize', function () { syncNavHeight(); revealNav(false); });
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) applyState(event.newValue === '1', false);
  });
})();
