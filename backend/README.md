# Zany Backend

Zany 个人网站的 FastAPI 异步后端，为 AI 助手、文章评论和留言板提供接口。整体启动和部署入口见[根 README](../README.md)。包含：

- FastAPI 生命周期管理
- SQLAlchemy 2 异步 PostgreSQL 连接
- 启动时自动创建数据库中缺失的表
- Redis 异步连接
- AI 会话与消息持久化、历史分页、流式输出、生成锁与按 IP 限流
- 文章评论、楼中楼回复和留言的创建与分页查询
- 请求 ID 与访问日志
- 控制台与 UTF-8 文件日志，按日期或大小滚动并自动清理旧备份
- CORS、可信 Host、安全响应头中间件

## 本地启动（Windows PowerShell）

仓库仅保存 `.env.example` 和 `.env.docker.example`，真实 `.env`、`.env.docker` 均由 Git 忽略。Docker 部署时从 `.env.docker.example` 创建 `.env.docker`，替换 `CHANGE_ME` 并填写 AI 密钥；完整配置迁移关系见 [配置示例与迁移](../deploy/CONFIGURATION.md)。

需要 Python 3.11 或以上（AI 服务使用 `asyncio.timeout`）、PostgreSQL 和 Redis。以下命令在 `backend/` 目录执行；先创建 `.env` 指定的数据库并启动 Redis。

```powershell
python -m venv .venv
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe .\main.py
```

已经激活虚拟环境时可直接执行 `python .\main.py`，监听地址和端口读取 `.env` 的 `HOST` / `PORT`，保留应用统一日志格式。需要修改代码自动重启时，可使用 `.\.venv\Scripts\python.exe -m uvicorn main:app --reload --no-access-log --host 0.0.0.0 --port 8000`；此方式监听地址和端口由命令参数指定。

服务地址：

- API：<http://localhost:8000>
- Swagger：<http://localhost:8000/docs>
- ReDoc：<http://localhost:8000/redoc>

Swagger / ReDoc 仅在 `DOCS_ENABLED=true` 时开放，`/` 根路径当前没有首页接口，访问根路径返回 404 不代表服务未启动。

配置从环境变量与工作目录下的 `.env` 读取，环境变量优先。开发环境可复制 `.env.example` 为 `.env`；已有配置不应覆盖。模板中 API 文档默认关闭、模型密钥为空，按需设置 `DOCS_ENABLED=true` 与 `AI_API_KEY`。生产环境请替换数据库密码、可信域名和 CORS 来源，并启用 `LOG_JSON=true` 与 `STARTUP_CHECK_DEPENDENCIES=true`。

`DATABASE_AUTO_CREATE=true` 时，启动会连接 PostgreSQL 并检查、创建缺失表，因此需要先创建配置中指定的数据库。表结构由继承 `db.base.Base` 的模型定义，并在 `models/__init__.py` 中导入注册。也可以在 PostgreSQL 中手动执行 `sql/create_tables.sql` 创建评论、留言和 AI 会话/消息共四张表，以及约束、索引和中文注释。自动建表和建表脚本都不会迁移已有旧表结构。

## 评论与留言表

- `article_comments`：文章评论及楼中楼回复。`article_key` 保存不含域名的文章固定标识（现有 abbrlink）；`parent_id` 指向直接回复的评论，`root_id` 指向所属顶层评论。顶层评论两个关联均为空，回复两个关联均必填。
- `guestbook_messages`：独立留言记录，无回复或文章关联，按创建时间和 ID 分页。

主键均为 PostgreSQL `BIGINT GENERATED ALWAYS AS IDENTITY`，由数据库自增生成；Python 类型为 `int`，插入时不传 ID。评论的 `parent_id`、`root_id` 同样使用 `BIGINT`，复合外键保证父评论、顶层评论与回复属于同一文章，并禁止直接删除被引用的评论。两张表各自使用独立的自增序列，ID 不保证连续无缺号。

若此前已创建 UUID 主键表，启动自动建表不会改为 BIGINT。已有数据需要建立旧 UUID 与新 ID 的映射，并同步迁移评论的 `parent_id`、`root_id` 及外键，不能直接把 UUID 强制转换成整数。当前代码未连接数据库执行此类迁移。

两张表及全部 23 个字段（包含继承的创建/更新时间）已配置中文数据库注释。通过 SQLAlchemy 自动创建或执行完整建表脚本时都会写入注释；`create_all` 不会更新已有表的注释。

两表包含必填昵称（最多 50 字）、必填纯文本内容（最多 2000 字）、选填邮箱（最多 254 字）、审核状态、创建/更新时间和软删除时间。状态为 `0` 待审核、`1` 已通过、`2` 已拒绝，默认 `1` 已通过。数据库拒绝空白昵称/内容、无效状态、不完整回复关联和自我回复。

两表包含 `client_ip`（`VARCHAR(45)`，支持 IPv4/IPv6）及 `user_agent`（`VARCHAR(1024)`，保存原始浏览器/操作系统请求头），均允许为空。创建接口从 ASGI 请求的客户端地址获取并规范化 IP，读取 `User-Agent` 并截取前 1024 字符，不使用表单中的同名值。反向代理的真实客户端地址由 Uvicorn 可信代理设置解析，应用不直接读取 `X-Forwarded-For`。User-Agent 可由客户端修改，不作为身份或权限依据；尚未进行浏览器分类解析。

公开列表及审核列表已配置索引。接口响应不返回邮箱、IP、User-Agent、审核状态或软删除时间。创建接口校验邮箱基本格式、处理首尾 Unicode 空白，并根据父评论自动确定顶层评论。公开列表仅查询已通过、未删除的数据，顶层评论不可访问时其回复列表也不可访问。

评论表不包含管理员身份标记。

已实现评论和留言的创建、分页查询接口，前端文章评论区和留言板已接入，暂未提供删除、审批接口。两种页码列表在同一条 SQL 中读取总数与记录，避免并发新增使分页信息不一致。`created_at`、`updated_at` 由数据库提供初值，`updated_at` 在 SQLAlchemy 更新记录时自动更新；直接执行 SQL 修改时需自行更新该字段。

两张表均保留 `created_at`、`updated_at`、`deleted_at`，类型统一为 `TIMESTAMP WITHOUT TIME ZONE`（即不带时区的 `TIMESTAMP`）。Python 读取为不带时区的 datetime，接口时间值不附带 `Z` 或时区偏移。时间默认按 PostgreSQL 连接的会话时区记录，部署时应保持各连接的时区一致。

## 限流

三个发表入口（根评论、回复、留言）共享同一 IP 的 10 秒窗口，Redis Lua 保证并发请求只通过一个，超限返回 `429` 和 `Retry-After`。请求体校验通过后占用窗口，后续业务失败也不自动返还额度。三个 GET 接口共享同一 IP 任意连续 60 秒内最多 120 次查询。IP 取规范化后的 ASGI 客户端地址，不直接采信 `X-Forwarded-For`。

所有评论、回复和留言查询都会直接读取数据库，不读取或写入 Redis 响应缓存。接口统一返回 `Cache-Control: no-store`，避免浏览器或代理缓存列表响应。

Redis 故障时，发表返回 `503`；查询使用进程内临时限流后继续读取数据库。Redis 限流可跨 worker 共享，临时限流只在单个 worker 内生效。查询通过限流后直接交给 SQLAlchemy 连接池和 PostgreSQL 处理。

限流配置位于 `.env.example` 的“评论 / 留言限流”一节，实际配置从本地 `.env` 读取。Redis 单次操作超时由 `REDIS_OPERATION_TIMEOUT_SECONDS` 控制：代码缺省值为 0.5 秒，当前配置模板为 1 秒。告警日志按运行时合并，避免故障期间每条请求重复写日志。

## AI 助手

- `GET /api/ai/status`：查询启用状态、模型及输入/输出/历史轮次限制，不返回密钥。
- `POST /api/ai/conversations`：接收 `{ "turn_id": "UUID", "content": "问题", "creation_token": "64位随机十六进制凭证" }`，在同一数据库事务中创建会话、用户问题和助手待生成记录，然后返回 SSE 流，状态码 201。不支持不含问题的空会话创建。
- `POST /api/ai/conversations/{id}/messages`：在原会话内追加问题，返回 SSE 流，状态码 200。
- `GET /api/ai/conversations/{id}/messages?limit=80&before_sequence=序号`：分页读取消息，按序号正序返回，并提供 `has_more`、`next_before_sequence`、`conversation_status`、`can_continue`、`expires_at`。已结束或过期的会话仍可读取历史，但不能继续提问。
- `POST /api/ai/conversations/{id}/close`：结束旧会话，保留消息，重复关闭返回 204。

创建后的接口必须携带 `X-Conversation-Token`。浏览器首次发送前通过 `crypto.getRandomValues` 生成 32 字节随机凭证，保存首轮 `turn_id`、凭证和待提交问题；后端将首轮 `turn_id` 作为会话 ID，数据库只保存凭证的 SHA-256 摘要。首个 SSE `type=conversation` 事件确认创建，浏览器随后删除本地待提交问题。`creation_token` 可省略以兼容由后端生成会话 ID 和凭证的客户端，但这类客户端无法保证首个响应到达前刷新的恢复能力。

首次提交期间刷新时，前端使用已经保存的凭证查询原会话；若原请求尚未提交到数据库，则用相同 `turn_id` 和 `creation_token` 重试。后端会话锁和主键保证不会重复创建；对已存在会话验证凭证后返回 409，前端转为恢复历史，不重复生成首轮回答。错误凭证不能读取会话。后续流输出兼容 Chat Completions 的 `choices` 数据；后端完成消息入库并释放生成锁后，才发出 `type=complete` 和 `[DONE]`。上游失败用 `type=error` 通知前端，问题和失败的助手记录仍保留。

前端仅在用户发送首条消息时创建会话，页面加载和打开面板不创建。当前页签的会话 ID 和凭证保存在 `sessionStorage`，刷新、站内导航和切换到其他标签再切回时延续原会话；普通关闭页签后重新打开网站则等待首条消息创建新会话。浏览器“恢复已关闭标签”可能恢复 `sessionStorage`，属于浏览器恢复行为，不保证开启新会话。独立新页签各自对话，不使用 `localStorage` 共享凭证。消息正文统一从数据库恢复，超过 80 条可继续分页加载。

点击“新对话”停止当前流、结束旧会话、清除当前凭证并回到欢迎页；再次发送时才创建新会话。首次创建尚未确认时点击停止或新对话，会先等待创建确认，再停止并按需关闭原会话。手动停止、刷新或关闭导致断流时，后端在取消保护中保存已收到的文本和停止状态，包括响应头尚未发送成功的情况；恢复期间前端自动轮询生成状态，保存结束后才能继续发送。上游压缩响应先解码再解析 SSE。生成任务设有不超过会话锁租期的总超时。进程被强制终止不属于正常断流保护范围。

模型密钥通过 `.env` 的 `AI_API_KEY` 配置，仅后端持有。模型名称、系统提示词、温度、回复上限均由后端决定。上下文从数据库按 `turn_id` 配对，默认取最近 **6 轮完整成功问答 + 当前问题 + 系统提示词**；失败、手动停止、生成中或已软删除的轮次不参与上下文。`AI_MAX_HISTORY_TURNS=6` 替代旧配置 `AI_MAX_HISTORY_MESSAGES`。该限制不影响完整历史存储。目前不包含工具调用、知识库或 Agent 任务编排。

默认每 IP 每小时最多发送 30 次问题、创建 10 个会话，Redis 计数可跨 worker 共享。Redis 不可用时写接口返回 503；`AI_RATE_LIMIT_ENABLED=false` 仅关闭配额，生成锁仍需要 Redis。会话默认闲置 24 小时后不可继续发送，历史仍可查看。调整参数见 `.env.example`。

本地前端请求 `http://localhost:8000/api/ai/...`。正式前端请求 `https://api.daixiaokang.com/api/ai/...`，API 子域名直连 Nginx 并转发到 FastAPI，关闭响应缓冲；主站网页可独立接入 CDN。`CORS_ORIGINS` 需允许主站来源，`TRUSTED_HOSTS` 需包含 API 子域名。SSE 返回 `X-Accel-Buffering: no` 和 `Cache-Control: no-store, no-transform`。前端无数据超时默认为 65 秒，部署时应大于后端模型读取超时。

## 日志

默认同时输出到控制台和 `backend/logs/app.log`。按照服务器本地日期每天午夜滚动，在跨日后的第一条日志写入时切分；同一天预计写入后达到 `LOG_MAX_SIZE_MB` 时也会先切分再写入。代码缺省阈值为 20 MiB，当前 `.env.example` 设置为 10 MiB（10 × 1024 × 1024 字节），实际以环境配置为准。单条日志保持完整，极大的单条日志可能超过大小限制。

备份按切分时刻命名，例如 `app.log.2026-10-08_12-30-00_123456`，同一天可以产生多份。日期与大小切分的备份合计最多保留 `LOG_BACKUP_COUNT=15` 份，超出时自动删除最旧的备份；当前 `app.log` 不计入。原来生成的 `app.log.日期` 备份也纳入保留数量。这是按备份数量保留，不代表保留 15 天。

文本日志各部分使用 ` | ` 分隔，包含时间、级别、文件名、函数名、行号及请求 ID；没有请求 ID 时省略该字段，JSON 日志同样省略。请求日志还展示请求方法、路径、状态码、耗时（毫秒）与客户端 IP，异常日志附带完整堆栈。例如：

```text
2026-10-08 12:30:00 | INFO | request_context.py(__call__:68) | request_id=abc123 | request.completed | method='GET' | path='/docs' | status_code=200 | duration_ms=2.5 | client='127.0.0.1'
```

`LOG_JSON=true` 将控制台和文件同时切换为单行 JSON，保留上述定位及请求字段，时间采用服务器本地时区并带时区偏移。`LOG_FILE_ENABLED=false` 可关闭文件输出，`LOG_DIR` 可调整目录（相对路径以 `backend` 为基准）。Uvicorn 运行日志使用同一套格式，访问日志由请求中间件统一记录。

当前文件滚动适用于单工作进程。运行多个 worker 或多个实例时，应分别写入不同目录或关闭文件输出，交由日志采集系统处理，避免多个进程同时滚动同一个文件。

## 验证

在 `backend/` 目录执行：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

当前测试覆盖 AI 会话服务。需要配置可访问的 PostgreSQL，并允许测试用户创建和删除 schema；每个测试使用随机命名的临时 schema，清理自己的测试数据，不使用业务表。模型调用与生成锁等通过模拟验证，不调用真实模型服务，不代表生产环境的数据库、Redis 和模型链路已通过联调。

## 网站统计

新增 `POST /api/analytics/visits` 采集匿名访问、`GET /api/analytics/summary` 提供公开汇总。`site_visits` 表由自动建表或 SQL 脚本创建；新增 `py-ip2region==3.0.6` 依赖。离线地域库、本地测试及发布步骤见 [统计说明](../frontend/tools/ANALYTICS.md)。
