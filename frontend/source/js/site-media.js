/* Shared owned-media catalog. Keep emergency images on the website origin. */
(function () {
  'use strict';
  var config = window.__SITE_MEDIA__ || { desktop: [], mobile: [], defaults: {}, fallback: '/assets/fallback/image.webp', avatar: '/assets/fallback/avatar.png' };
  var all = config.desktop.concat(config.mobile);
  // Pick once per document; scrolling and PJAX keep the same decoration.
  var cats = config.cats || [];
  if (cats.length) config.cat = cats[Math.floor(Math.random() * cats.length)];
  function cssUrl(value) { return 'url(' + JSON.stringify(value) + ')'; }
  function background(value) { return cssUrl(value || config.fallback) + ', ' + cssUrl(config.fallback); }
  function defaultCss() {
    var d = config.defaults;
    return ':root{--default-bg:' + background(d.desktop) + ';--darkmode-bg:' + background(d.desktopDark) + ';--mobileday-bg:' + background(d.mobile) + ';--mobilenight-bg:' + background(d.mobileDark) + ';}';
  }
  function resolve(value) {
    if (typeof value !== 'string') return value;
    // Migrate old absolute/local owned-image URLs to stable IDs after an origin change.
    var owned = value.match(/\/assets\/home\/(?:optimized\/)?(pc_\d+|home_mobile_\d+)(?:-(?:background|cover|thumb)\.webp|\.png)(?:[?#][^"')\s]*)?/);
    if (owned) value = 'media:' + owned[1];
    // Previously shipped wallpaper providers must not be requested on local startup.
    if (/https?:\/\/(?:[^/]+\.)?(?:picsum\.photos|bing\.biturl\.top|loliapi\.com|jitsu\.top|mwm\.moe|ixiaowai\.cn|btstu\.cn|eees\.cc|dujin\.org)(?:[/:]|$)/i.test(value)) return 'default';
    if (value.indexOf('media:') !== 0) return value;
    var group = all.find(function (item) { return item.id === value.slice(6); });
    return group ? cssUrl(group.poster) : 'default';
  }
  function withFallback(value) {
    if (typeof value === 'string' && value.indexOf('media:') === 0) value = resolve(value);
    if (/^https?:\/\//i.test(value)) value = cssUrl(value);
    return /^url\(/i.test(value) ? value + ', ' + cssUrl(config.fallback) : value;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function buttons(variant) {
    return config[variant].map(function (group, index) {
      return '<button type="button" class="' + (variant === 'mobile' ? 'pimgbox' : 'imgbox') + '" title="背景 ' + (index + 1) + '" aria-label="选择背景 ' + (index + 1) + '" onclick="changeBg(\'media:' + group.id + '\')" style="padding:0;border:0;overflow:hidden;cursor:pointer"><img src="' + escapeHtml(group.thumbnail) + '" alt="背景 ' + (index + 1) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></button>';
    }).join('');
  }
  window.SiteMedia = { config: config, resolve: resolve, withFallback: withFallback, defaultCss: defaultCss, buttons: buttons };
  var style = document.createElement('style');
  style.id = 'site-media-defaults';
  style.textContent = defaultCss();
  document.head.appendChild(style);
  // Capture handles ordinary content images, including images inserted by PJAX/plugins.
  document.addEventListener('error', function (event) {
    var img = event.target;
    if (!img || img.tagName !== 'IMG' || img.hasAttribute('data-home-still')) return;
    var avatar = img.closest('.avatar-img, .flink-item-icon, .flink .info, .link-card .left') || img.classList.contains('card-friend-avatar');
    var target = avatar ? config.avatar : config.fallback;
    img.onerror = null;
    if (img.dataset.siteMediaFailed || img.src === new URL(target, location.href).href) return;
    img.dataset.siteMediaFailed = '1';
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('data-lazy-src');
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
    var picture = img.closest('picture');
    if (picture && typeof picture.querySelectorAll === 'function') {
      picture.querySelectorAll('source').forEach(function (source) { source.removeAttribute('srcset'); source.removeAttribute('data-srcset'); });
    }
    img.loading = 'eager';
    img.src = target;
  }, true);
})();
