/* global hexo */
'use strict';

// 从旧配置迁移：脚本曾被记录为 Page；skip_render 改为静态资源后移除该旧记录。
// 只删除此脚本对应的页面缓存，不改动源文件、加密内容或其他页面。
hexo.extend.filter.register('before_generate', async function () {
  const cachedPage = hexo.model('Page').findOne({ source: 'js/encrypted-page.js' });
  if (!cachedPage) return;
  await cachedPage.remove();
  hexo.locals.invalidate();
}, 5);

function updateEncryptedScript(data) {
  if (!data.encrypt || typeof data.content !== 'string') return data;
  const root = hexo.config.root || '/';
  const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const script = new RegExp(`<script data-pjax src="${escapedRoot}(?:lib/hbe\\.js|js/encrypted-page\\.js(?:\\?[^\"]*)?)"><\\/script>`, 'g');
  const replacement = `<script data-pjax src="${root}js/encrypted-page.js?v=20261013-unlock3"></script>`;
  data.content = data.content.replace(script, replacement);
  return data;
}

// 保留插件的构建期加密和表单样式，浏览器交互使用本站脚本。
// 优先级高于 hexo-blog-encrypt 的 1000，避免直接修改 node_modules。
hexo.extend.filter.register('after_post_render', updateEncryptedScript, 1100);

// Hexo 会跳过未改动的 Markdown；缓存内容也要更新脚本引用，无需用户手动清理缓存。
// 在默认的 render_post（优先级 10）之后处理，不重复加密已有正文。
hexo.extend.filter.register('before_generate', async function () {
  let changed = false;
  for (const modelName of ['Page', 'Post']) {
    for (const page of hexo.model(modelName).toArray()) {
      const previous = page.content;
      updateEncryptedScript(page);
      if (page.content === previous) continue;
      await page.save();
      changed = true;
    }
  }
  if (changed) hexo.locals.invalidate();
}, 20);
