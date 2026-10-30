/* 首页轮播：静态内容先渲染，交互增强兼容 PJAX 与减少动态效果偏好。 */
(function () {
  'use strict';
  if (window.__homeDiscoveryBound) return;
  window.__homeDiscoveryBound = true;
  var dispose = function () {};

  function init() {
    dispose();
    var feature = document.querySelector('[data-home-feature]');
    if (!feature) return;
    var slides = Array.from(feature.querySelectorAll('.home-feature-slide'));
    var controls = feature.querySelector('.home-feature-controls');
    if (!controls || slides.length < 2) return;
    var dots = Array.from(controls.querySelectorAll('[data-slide]'));
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var controller = new AbortController();
    var timer, active = 0, hovered = false;
    var interval = Math.max(3000, Number(feature.dataset.interval) || 5000);
    var disposed = false;
    function listen(target, name, callback) { target.addEventListener(name, callback, { signal: controller.signal }); }
    function schedule() {
      clearTimeout(timer);
      if (disposed || motion.matches || hovered || document.hidden || feature.contains(document.activeElement)) return;
      timer = setTimeout(function () { show((active + 1) % slides.length); schedule(); }, interval);
    }
    function show(index) {
      active = index;
      slides.forEach(function (slide, i) {
        var current = i === index;
        slide.classList.toggle('is-active', current);
        slide.inert = !current;
        slide.setAttribute('aria-hidden', String(!current));
        slide.querySelectorAll('a').forEach(function (link) {
          if (current) link.removeAttribute('tabindex');
          else link.setAttribute('tabindex', '-1');
        });
        if (current) dots[i].setAttribute('aria-current', 'true');
        else dots[i].removeAttribute('aria-current');
      });
    }
    listen(controls, 'click', function (event) {
      var dot = event.target.closest('[data-slide]');
      if (dot) show(Number(dot.dataset.slide));
      schedule();
    });
    listen(controls, 'keydown', function (event) {
      if (!event.target.matches('[data-slide]')) return;
      var index = Number(event.target.dataset.slide);
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % slides.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (index + slides.length - 1) % slides.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = slides.length - 1;
      else return;
      event.preventDefault();
      show(index); dots[index].focus(); schedule();
    });
    listen(feature, 'pointerenter', function (event) { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
    listen(feature, 'pointerleave', function (event) { if (event.pointerType === 'mouse') { hovered = false; schedule(); } });
    listen(feature, 'focusin', schedule);
    listen(feature, 'focusout', function () { setTimeout(schedule, 0); });
    listen(document, 'visibilitychange', schedule);
    listen(motion, 'change', schedule);
    controls.hidden = false;
    show(0); schedule();
    dispose = function () { disposed = true; clearTimeout(timer); controller.abort(); };
  }
  document.addEventListener('pjax:send', function () { dispose(); });
  document.addEventListener('pjax:complete', init);
  window.addEventListener('pageshow', function (event) { if (event.persisted) init(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
