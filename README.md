# Zany 个人网站

个人博客与网站源码，基于 Hexo 和 Fomalhaut 主题持续定制，配套 FastAPI 后端，提供文章阅读、本地搜索、AI 对话、评论和留言板。

- 网站：[daixiaokang.com](https://daixiaokang.com)
- GitHub：[Zany2](https://github.com/Zany2)
- 站点名称：Zany🥝；时区：Asia/Shanghai；页脚版权起始年份：2023。

本仓库已包含站点内容和多处主题源码改动，不再是原主题的开箱示例。更新上游主题时需要比较、合并差异，不能直接替换整个主题目录。

## 当前功能

| 模块 | 当前实现 |
| --- | --- |
| 首页 | 按设备选择本地视频和同组图片，失败时回退图片；最近 6 篇非加密文章轮播、分类入口和文章列表 |
| 文章 | Markdown、代码高亮、目录、归档、标签、分类和统计 |
| 全局搜索 | 首次打开时加载本站 `search.xml`，在浏览器内检索文章标题和正文；Algolia 保留依赖与配置，当前关闭 |
| AI 助手 | FastAPI 代理模型流式输出，会话与消息入库，支持恢复历史、停止生成和新对话 |
| 评论与留言 | 自建 PostgreSQL 存储、文章楼中楼回复、分页、Redis 限流 |
| 外观与导航 | 明暗模式、主题色与背景设置、界面收纳；收纳后可在顶部唤出导航 |
| 其他页面 | 开源项目、关于我、音乐、游戏、画廊、天文馆、网址导航等；朋友圈目前保留空页面入口 |

本地搜索不调用第三方检索 API，也不需要后端搜索接口。当前搜索范围为文章标题和正文，不包含评论、留言、AI 对话及全部独立页面。字体、部分脚本与部分页面服务仍可能使用第三方资源。

## 架构与目录

```text
浏览器
  ├─ 静态页面、素材、search.xml ──► frontend/public/
  └─ /api/ai/*、评论与留言请求 ──► FastAPI
                                     ├─ PostgreSQL：评论、留言、AI 会话和消息
                                     ├─ Redis：限流与 AI 生成锁
                                     └─ 兼容 Chat Completions 的模型服务
```

本地前端运行在 4000 端口，API 直连 8000 端口；正式站通过同源 `/api` 反向代理到后端。

```text
daixiaokang/
├─ README.md
├─ LICENSE
├─ frontend/
│  ├─ README.md                  前端开发、配置与验证
│  ├─ _config.example.yml        站点配置示例，复制为 _config.yml 使用
│  ├─ _config.fomalhaut.example.yml  本站主题配置示例
│  ├─ source/                    文章、页面、站点样式、脚本和素材
│  ├─ scripts/                   Hexo 构建插件与注入器
│  ├─ lib/site-media.js          素材扫描、地址与封面分配工具
│  ├─ themes/fomalhaut/           已定制的主题源码
│  ├─ tools/                     素材工具、开发文档和回归脚本
│  └─ public/                    生成目录，不手工修改
└─ backend/
   ├─ README.md                  API、数据库、会话与日志说明
   ├─ .env.example               后端配置模板
   ├─ main.py                    FastAPI 入口
   ├─ controller/、schemas/      HTTP 接口与数据校验
   ├─ services/、models/         业务逻辑与数据库模型
   ├─ db/、cache/                PostgreSQL 与 Redis 连接
   ├─ core/、middleware/         配置、日志与中间件
   ├─ sql/create_tables.sql      手工建表脚本
   └─ tests/                     AI 会话回归测试
```

## 本地运行

需要 Node.js 18 或以上、Python 3.11 或以上、PostgreSQL 和 Redis。AI 生成超时使用 Python 3.11 的 `asyncio.timeout`。重新处理图片时还需要 FFmpeg；已有素材可直接构建。

以下命令从仓库根目录开始，在两个 PowerShell 终端分别执行。

公开仓库只保留配置示例。实际前端配置、Compose、Nginx、环境变量文件及加密页面密码不纳入 Git；复制和迁移关系见 [配置示例与迁移](deploy/CONFIGURATION.md)。已有本地配置无需重新复制。

### 前端

```powershell
cd frontend
if (!(Test-Path -LiteralPath _config.yml)) { Copy-Item _config.example.yml _config.yml }
if (!(Test-Path -LiteralPath _config.fomalhaut.yml)) { Copy-Item _config.fomalhaut.example.yml _config.fomalhaut.yml }
if (!(Test-Path -LiteralPath themes/fomalhaut/_config.yml)) { Copy-Item themes/fomalhaut/_config.example.yml themes/fomalhaut/_config.yml }
npm.cmd ci
npm.cmd run server
```

访问 `http://localhost:4000`。只预览静态页面可以不启动后端，AI、评论和留言需要后端服务。

### 后端

先在 PostgreSQL 中创建 `.env` 对应的数据库（模板名称为 `zany`），并启动 Redis。

```powershell
cd backend
python -m venv .venv
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# 按本机环境修改 .env 中的数据库、Redis 与 AI 配置后启动
.\.venv\Scripts\python.exe .\main.py
```

API 默认监听 `http://localhost:8000`。从 `backend` 目录启动以读取该目录下的 `.env`；日志默认写入 `backend/logs/`。自动建表仅补建缺失表，不创建数据库，也不迁移已有表结构。

`.env.example` 中的 `AI_API_KEY` 为空，配置真实密钥后才可调用模型；密钥只放后端。模板默认关闭 API 文档，需要时设置 `DOCS_ENABLED=true` 后访问 `/docs` 或 `/redoc`。后端根路径 `/` 返回 404 属于当前接口设计。

## 常用修改入口

| 需要修改 | 入口 |
| --- | --- |
| 标题、域名、作者、文章链接 | `frontend/_config.yml` |
| 菜单、社交链接、页脚、侧栏 | `frontend/_config.fomalhaut.yml` |
| 首页最新文章与分类 | `home_discovery` 配置、主题 `layout/includes/home-discovery.pug`、`source/js/home-discovery.js`、`source/css/home-discovery.css` |
| 搜索方式 | `local_search` / `algolia_search` 配置、主题 `source/js/search/local-search.js` |
| AI 面板、API 地址 | `ai_chat` 配置、`source/js/ai-chat.js`、`source/css/ai-chat.css`、`scripts/ai-chat-inject.js` |
| 模型、上下文、回复上限、限流 | `backend/.env`，字段说明见 `.env.example` |
| 评论和留言 | `feedback` 配置、`source/js/feedback.js`、`source/css/feedback.css`、后端 `controller/feedback.py` |
| 导航收纳与唤出 | `source/js/inject/site-ui-toggle.js`、`source/css/site-ui-toggle.css`、`source/js/modules/nav.js` |
| 本地图片和视频 | `source/assets/`、`site_media` 配置、`scripts/site-media.js` |
| 文章与独立页面 | `frontend/source/_posts/` 及 `frontend/source/` 下各页面目录 |

以上前端路径除特别说明外均相对 `frontend/`。主题默认配置在 `themes/fomalhaut/_config.yml`，站点 `_config.fomalhaut.yml` 的同名项优先。

### AI 会话规则

打开页面或面板不创建会话，发送第一条消息时才创建。当前页签凭证保存在 `sessionStorage`，刷新、站内导航或切换浏览器标签后返回可恢复对话。普通关闭页签后重新打开，发送消息时创建新会话；浏览器“恢复已关闭标签”可能同时恢复原凭证。

点击“新对话”结束旧会话，下一次发送时创建新会话。消息完整保存，默认提供最近 6 轮成功完整问答，加上当前问题和系统提示词作为模型上下文。`AI_CONVERSATION_TTL_HOURS` 默认 24 小时，控制闲置会话能否继续发送，不会定时删除历史。详细接口和恢复逻辑见[后端说明](backend/README.md#ai-助手)。

### 写文章与更新素材

在 `frontend` 目录运行 `npx.cmd hexo new post "文章标题"`，编辑生成的 Markdown。现有文章使用 `posts/:abbrlink.html`，修改固定标识会影响已有链接及评论关联。

素材沿用同名 MP4 与 PNG 组合，新增后运行 `npm.cmd run media:prepare`，再构建。完整规则见[素材说明](frontend/tools/SITE-MEDIA.md)。文章标签写法可参考[语法与外挂标签写法汇总](frontend/source/_posts/语法与外挂标签写法汇总.md)。

## 构建与部署

在 `frontend` 目录执行：

```powershell
npm.cmd run clean
npm.cmd run build
```

将 `frontend/public/` 发布到静态站点目录，单独部署 FastAPI、PostgreSQL 和 Redis。服务器需要将同源 `/api/` 保留路径代理到 FastAPI，并为 AI SSE 关闭响应缓冲，配置足够的读取超时。正式域名使用 HTTPS，`www.daixiaokang.com` 应由服务器跳转到主域名。

`frontend/_config.yml` 的 Git 部署仓库仍为占位地址，使用 Git 部署前需要替换为实际仓库。当前 AI、评论和留言均依赖 FastAPI，发布静态页面后需同时接通 `/api`。详细配置见[域名与部署说明](frontend/tools/DOMAIN.md)。

配置或构建插件修改后，重新构建或重启 Hexo 开发服务；后端环境变量修改后重启后端。不要手工修改 `public/`，也不要将 `.env`、模型密钥、日志或虚拟环境提交到仓库。

## 验证与更多文档

前端测试命令和浏览器依赖见[前端说明](frontend/README.md#验证)。后端 AI 测试使用配置的 PostgreSQL，在随机临时 schema 内建表，不调用真实模型；运行条件见[后端说明](backend/README.md#验证)。

- [评论与留言前端](frontend/tools/FEEDBACK.md)
- [本地素材与 CDN 配置](frontend/tools/SITE-MEDIA.md)
- [域名与反向代理](frontend/tools/DOMAIN.md)
- [主题目录与维护说明](frontend/themes/fomalhaut/README.md)

## 来源与授权

本站基于 [hexo-theme-fomalhaut](https://github.com/fomalhaut1998/hexo-theme-fomalhaut) v1.0.2，主题源自 [Butterfly](https://github.com/jerryc127/hexo-theme-butterfly) 4.3.1，使用 [Hexo](https://hexo.io/) 构建。保留上游许可证与署名，仓库许可证见 [LICENSE](LICENSE)，主题许可证见[主题 LICENSE](frontend/themes/fomalhaut/LICENSE)。第三方依赖及素材遵循各自授权。
