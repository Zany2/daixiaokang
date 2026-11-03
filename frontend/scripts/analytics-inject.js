/* global hexo */
'use strict';
const fs = require('fs');
const path = require('path');
hexo.extend.filter.register('after_render:html', function (html) {
  if (!html.includes('</body>') || html.includes('id="site-analytics-boot"')) return html;
  const theme = hexo.theme.config || {};
  const cfg = Object.assign({ enable: true, api_base: '/api', local_api_base: 'http://localhost:8000/api' }, theme.site_analytics, hexo.config.site_analytics);
  if (!cfg.enable) return html;
  const stat = fs.statSync(path.join(hexo.base_dir, 'source/js/site-analytics.js'));
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return html.replace('</body>', '<script id="site-analytics-boot">window.SITE_ANALYTICS_CONFIG=' + json + ';</script>' +
    '<script defer src="/js/site-analytics.js?v=' + Math.floor(stat.mtimeMs).toString(36) + '"></script></body>');
}, 100);
