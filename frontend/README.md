# Zany 网站前端

基于 Hexo 6.3.0 与定制 Fomalhaut 主题。网站整体介绍、前后端启动和部署入口见[根 README](../README.md)。本文件中的路径和命令以 `frontend/` 为基准。

## 运行与构建

需要 Node.js 18 或以上。

```powershell
if (!(Test-Path -LiteralPath _config.yml)) { Copy-Item _config.example.yml _config.yml }
if (!(Test-Path -LiteralPath _config.fomalhaut.yml)) { Copy-Item _config.fomalhaut.example.yml _config.fomalhaut.yml }
if (!(Test-Path -LiteralPath themes/fomalhaut/_config.yml)) { Copy-Item themes/fomalhaut/_config.example.yml themes/fomalhaut/_config.yml }
npm.cmd ci
npm.cmd run server
```

访问 `http://localhost:4000`。构建使用 `npm.cmd run build`；清理生成目录和 Hexo 缓存使用 `npm.cmd run clean`。构建结果位于 `public/`。

开发服务读取配置和插件后会驻留，修改 `_config*.yml`、`scripts/` 或主题构建逻辑后应重启服务。正式发布需重新生成页面。站点级资源中手工配置了 `?v=` 的文件，修改后同步版本号；AI 注入器会根据脚本和样式文件的修改时间及大小生成版本号。

## 配置与源码

实际 `_config.yml`、`_config.fomalhaut.yml` 和主题 `_config.yml` 均留在本地并由 Git 忽略，仓库保存对应的 `*.example.yml`。首次克隆需按上方命令复制后再运行。修改功能配置时，应同步维护不含真实凭据的示例。完整部署配置和加密页面的迁移关系见 [配置示例与迁移](../deploy/CONFIGURATION.md)。

- `_config.yml`：站点域名、标题、作者、文章链接、搜索索引和部署插件。
- `_config.fomalhaut.yml`：实际生效的站点主题配置；同名项覆盖 `themes/fomalhaut/_config.yml`。
- `source/_posts/`：文章；`source/` 其他目录为独立页面、图片、视频、CSS 和 JavaScript。
- `scripts/`：站点构建插件；`themes/fomalhaut/`：已修改的主题模板、样式、脚本和插件。
- `lib/site-media.js`：本地素材扫描、地址生成与封面分配工具，由构建插件和素材测试共同使用。

两处源码都包含站点定制，不能通过整体覆盖主题完成升级。

### 备案信息

`_config.fomalhaut.yml` 的 `footer.icp` 配置正式 ICP 备案号，当前为 `鲁ICP备2026066398号-1`。共用页脚在所有使用主题布局的页面底部将版权信息与备案号并排展示，窄屏空间不足时自动换行；备案号链接至 `https://beian.miit.gov.cn/`。修改后需重新构建并发布。

页脚的“萌ICP备”是独立的兴趣站点徽章，不替代正式 ICP 备案。公安联网备案需另行办理，取得号码和官方查询链接后再添加；相关要求见[腾讯云备案号悬挂说明](https://cloud.tencent.com/document/product/243/61412)。

### 头像与页脚状态

头像旁和页脚徽章共用 `source/js/author-status.js` 的判断：每天 23:00～次日 07:00 为睡觉；休息日白天为放假；工作日 07:00～18:00 为上班，18:00～23:00 为下班。仍按访客设备的本地时间判断，沿用头像内置的节假日和调休数据。页脚每秒同步两处状态，PJAX 换页后立即更新。

`author-status.js` 必须先于 `modules/footer-time.js` 加载，实际配置和公开示例已同步。页脚四张 SVG 使用相同尺寸和样式。

### 页脚站点标识

`_config.fomalhaut.yml` 的 `footer.badges.items` 控制页脚底部的双段式徽章。当前托管平台为腾讯云，对象存储为腾讯云 COS，站点加速为 EdgeOne；对应徽章链接至平台或产品官网。GitHub 徽章链接至个人主页 `https://github.com/Zany2`。

徽章由本地 CSS 和现有图标绘制，无需请求外部徽章图片。更换部署平台时同步修改 `value`、`link` 及公开配置示例，重新构建发布后生效。

### 网站统计

`/site/census/` 的访问概览、地域地图、近 12 个月趋势和来源图已接入自建后端。部署、离线地域库和统计口径见 [ANALYTICS.md](tools/ANALYTICS.md)。

### 本地搜索

当前配置：

```yaml
algolia_search:
  enable: false
local_search:
  enable: true
  preload: false
```

`hexo-generator-search` 根据 `_config.yml` 的 `search` 段生成 `search.xml`，范围为文章标题和正文。主题脚本 `themes/fomalhaut/source/js/search/local-search.js` 首次打开搜索时读取索引，在浏览器内缓存并匹配关键词，支持高亮和失败重试。

打开弹窗时会锁定背景滚动，关闭后恢复，因此当前桌面浏览器滚动条会暂时隐藏。Algolia 依赖和占位配置仍保留；若将来切回 Algolia，需要配置自己的服务并关闭本地搜索。

### AI、评论与留言

`ai_chat` 与 `feedback` 均使用以下 API 地址规则：

| 前端访问地址 | 请求目标 |
| --- | --- |
| `localhost` / `127.0.0.1` 本地开发 | `http://localhost:8000/api` |
| 正式域名 | `https://api.daixiaokang.com/api`，API 子域名直连服务器 |

AI 使用 `/api/ai/conversations` 创建会话，后续使用会话消息与关闭接口。模型密钥和模型参数仅配置在后端 `.env`。评论与留言接口、交互规则见 [FEEDBACK.md](tools/FEEDBACK.md)。

主站网页可通过 EdgeOne 加速；API 子域名保持直接解析到服务器。后端 `CORS_ORIGINS` 需允许前端来源 `https://daixiaokang.com`，`TRUSTED_HOSTS` 需包含 `api.daixiaokang.com`。修改 API 地址后重新构建并上传 `public/` 的内容。

局域网手机调试需将相应 `api_base` 配为电脑可访问的后端地址，同时更新后端 CORS 来源与可信 Host。前端可访问不代表 API 已连通。

### 首页与素材

`home_discovery` 控制最近文章轮播与分类入口。默认展示最近 6 篇非加密文章，每 5 秒切换；鼠标悬停、键盘聚焦或页面不可见时暂停，减少动态效果偏好下不自动播放。不提供开始/停止按钮。

首页视频与各类封面使用 `source/assets/` 下的自有素材，当前通过 `https://static.daixiaokang.com/assets` 加载；`site_media.base_url` 留空可恢复本站加载。新增素材、优化图生成及 CDN 规则见 [SITE-MEDIA.md](tools/SITE-MEDIA.md)。

## 验证

在此目录执行：

```powershell
# Node 内置测试：素材、缓存、指针和滚动等
$testFiles = Get-ChildItem -Path tools/tests/*.test.js, tools/tests/*.test.cjs
node --test $testFiles.FullName

# 浏览器测试前先生成页面
npm.cmd run build
npm.cmd run test:search:browser
npm.cmd run test:home:browser
npm.cmd run test:ui:browser
npm.cmd run test:ai:browser
```

浏览器测试需要 Playwright 和本地 Edge。Playwright 不在本项目依赖中，可通过 `PLAYWRIGHT_MODULE_PATH` 指向已有安装，或在独立测试环境安装。搜索、首页和导航测试使用构建产物及隔离测试页面，AI 浏览器测试使用模拟接口，不验证真实模型连通性。

`npm.cmd run test:media:browser` 需要先在另一个终端启动 `npm.cmd run server`，具体地址与浏览器选项见 [SITE-MEDIA.md](tools/SITE-MEDIA.md)。仅修改文档时无需运行完整浏览器回归。

## 发布

正式站发布 `public/` 静态文件，API 后端另行运行。域名、HTTPS、CORS 和 SSE 代理要求见 [DOMAIN.md](tools/DOMAIN.md)。

AI 会话使用 FastAPI `/api/ai/*`，模型密钥配置在后端，不需要前端构建密钥。仅发布静态文件无法提供 AI、评论和留言服务。Git 部署配置仍含模板仓库地址，发布前需按实际环境设置。
