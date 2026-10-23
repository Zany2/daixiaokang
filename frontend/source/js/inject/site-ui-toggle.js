/* 收起顶栏、首页打字文字、看板娘、FPS 与右侧工具按钮，并保留最下方按钮用于恢复。 */
(function () {
  'use strict';

  var STORAGE_KEY = 'site-ui-collapsed';
  var root = document.documentElement;

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
    if (save) writeState(collapsed);
    syncButton();
  }

  // 脚本在 head 中同步执行，先恢复类名，避免刷新时先显示再收起。
  applyState(readState(), false);

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('#site-ui-toggle') : null;
    if (!target) return;
    applyState(!root.classList.contains('site-ui-collapsed'), true);
  });
  document.addEventListener('DOMContentLoaded', syncButton);
  document.addEventListener('pjax:complete', syncButton);
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) applyState(event.newValue === '1', false);
  });
})();
