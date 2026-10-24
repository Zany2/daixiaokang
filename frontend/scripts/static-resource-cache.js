/* global hexo */
'use strict';

// 从旧配置迁移：这些静态资源曾被记录为 Page，生成时会与同路径文件冲突。
// skip_render 已负责原样复制；这里只清理历史 Page 缓存，不改动源文件或其他页面。
const staticPageSources = [
  'css/site-ui-toggle.css',
  'js/inject/site-ui-toggle.js'
];

hexo.extend.filter.register('before_generate', async function () {
  let changed = false;

  for (const source of staticPageSources) {
    const cachedPage = hexo.model('Page').findOne({ source });
    if (!cachedPage) continue;

    await cachedPage.remove();
    changed = true;
  }

  if (changed) hexo.locals.invalidate();
}, 5);
