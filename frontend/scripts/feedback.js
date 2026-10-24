/* global hexo */
'use strict';

// 评论使用文章固定标识，换域名后仍能查询到同一组评论。
hexo.extend.helper.register('feedback_article_key', function (post) {
  if (post.abbrlink !== undefined && post.abbrlink !== null) {
    const key = String(post.abbrlink).trim();
    return Array.from(key).length <= 128 ? key : '';
  }
  const match = String(post.path || '').match(/(?:^|\/)posts\/([^/]+)\.html$/);
  const key = match ? match[1] : String(post.slug || '').trim();
  // 不截断长标识，避免不同文章共用同一组评论。
  return Array.from(key).length <= 128 ? key : '';
});
