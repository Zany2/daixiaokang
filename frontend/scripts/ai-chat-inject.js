/* global hexo */
/**
 * ai-chat-inject —— 博客 AI 助手（站点级注入器，不改主题源码）
 * ---------------------------------------------------------------------------
 * 作用：在页面头部注入对话框样式，在 </body> 前注入两样东西——
 *   1) <script id="ai-chat-boot">window.AI_CHAT_CONFIG = {...}</script>
 *      配置来自 _config.fomalhaut.yml 的 ai_chat: 段（也支持站点 _config.yml）。
 *      模型密钥只保存在 FastAPI 后端，页面仅获得后端接口地址。
 *   2) <script defer src="/js/ai-chat.js"></script>   —— 前端本体。
 *
 * 为什么用注入器而不是主题 pug：右侧部件由主题模板渲染，改它要动 themes/ 下的源码；
 * 本文件在站点根 scripts/ 里，hexo.load() 阶段执行，不参与渲染，属于站点侧改动。
 *
 * 关闭方式：_config.fomalhaut.yml → ai_chat.enable: false（或删掉整个 ai_chat 段）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MARK = 'ai-chat-boot';
const SCRIPT_SRC = '/js/ai-chat.js';

/** 脚本和独立样式使用源文件 mtime + 字节数生成版本号。 */
function assetVer(file) {
  try {
    const st = fs.statSync(path.join(hexo.base_dir || process.cwd(), 'source', file));
    return '?v=' + Math.floor(st.mtimeMs).toString(36) + '-' + st.size.toString(36);
  } catch (e) { return ''; }
}

const DEFAULTS = {
  enable: true,
  api_base: '/api',
  local_api_base: 'http://localhost:8000/api',
  welcome: '你好，我是你的 AI 助手。学习、写作、编程，或是日常灵感，都可以和我聊聊。',
  max_input_chars: 1000,
  session_key: 'ai_chat_session_v1',
  panel_width: 460,
  panel_height: 640,
  panel_right: 88,
  timeout_ms: 65000
};

hexo.extend.filter.register('after_render:html', function (html) {
  try {
    if (typeof html !== 'string' || html.indexOf('</body>') === -1) return html;
    if (html.indexOf(MARK) !== -1) return html;
    // 只有带右侧部件的页面才注入（没有 #rightside 就没有挂载点）
    if (!/id\s*=\s*["']?rightside["'\s>]/.test(html)) return html;

    const themeCfg = (hexo.theme && hexo.theme.config) || {};
    const siteCfg = (hexo.config && hexo.config.ai_chat) || {};
    const userCfg = themeCfg.ai_chat || {};
    const cfg = Object.assign({}, DEFAULTS, userCfg, siteCfg);
    if (cfg.enable === false) return html;
    cfg.proxied = true;
    cfg.has_key = true;
    cfg.stylesheet_url = '/css/ai-chat.css' + assetVer('css/ai-chat.css');

    const json = JSON.stringify(cfg)
      .replace(/</g, '\\u003c')          // 防止 </script> 提前闭合
      .replace(/\u2028|\u2029/g, '');   // 行分隔符会让整个脚本语法错误
    const boot = '<script id="' + MARK + '">window.AI_CHAT_CONFIG=' + json + ';</script>'
      + '<script defer src="' + SCRIPT_SRC + assetVer('js/ai-chat.js') + '"></script>';
    // 提前加载样式；前端 ensureStyle 仍为无 head 的自定义页面保留兜底。
    const styledHtml = html.replace(/<\/head>/i,
      '<link id="ai-chat-style" rel="stylesheet" href="' + cfg.stylesheet_url + '"></head>');
    return styledHtml.replace(/<\/body>/i, boot + '</body>');
  } catch (err) {
    try { hexo.log.warn('[ai-chat] 注入失败：' + (err && err.message)); } catch (e) {}
    return html;
  }
}, 99);
