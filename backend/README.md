# Zany Backend

基于 FastAPI 的异步后端骨架，包含：

- FastAPI 生命周期管理
- SQLAlchemy 2 异步 PostgreSQL 连接
- 启动时自动创建数据库中缺失的表
- Redis 异步连接
- 请求 ID 与访问日志
- 控制台与 UTF-8 文件日志，按日期或大小滚动并自动清理旧备份
- CORS、可信 Host、安全响应头中间件

## 本地启动（Windows PowerShell）

```powershell
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

所有配置均从环境变量读取，开发环境可复制 `.env.example` 为 `.env`。生产环境请替换数据库密码、可信域名和 CORS 来源，并启用 `LOG_JSON=true` 与 `STARTUP_CHECK_DEPENDENCIES=true`。

`DATABASE_AUTO_CREATE=true` 时，启动会连接 PostgreSQL 并检查、创建缺失表，因此需要先创建配置中指定的数据库。表结构由继承 `app.db.base.Base` 的模型定义，并在 `app/models/__init__.py` 中导入注册。此逻辑不会修改已有表的字段、约束或索引；已有表后续变更需要数据库迁移。

## 评论与留言表

- `article_comments`：文章评论及楼中楼回复。`article_key` 保存不含域名的文章固定标识（现有 abbrlink）；`parent_id` 指向直接回复的评论，`root_id` 指向所属顶层评论。顶层评论两个关联均为空，回复两个关联均必填。
- `guestbook_messages`：独立留言记录，无回复或文章关联，按创建时间和 ID 分页。

主键均为 PostgreSQL `BIGINT GENERATED ALWAYS AS IDENTITY`，由数据库自增生成；Python 类型为 `int`，插入时不传 ID。评论的 `parent_id`、`root_id` 同样使用 `BIGINT`，复合外键保证父评论、顶层评论与回复属于同一文章，并禁止直接删除被引用的评论。两张表各自使用独立的自增序列，ID 不保证连续无缺号。

若此前已创建 UUID 主键表，启动自动建表不会改为 BIGINT。已有数据需要建立旧 UUID 与新 ID 的映射，并同步迁移评论的 `parent_id`、`root_id` 及外键，不能直接把 UUID 强制转换成整数。当前代码未连接数据库执行此类迁移。

两张表及全部 23 个字段（包含继承的创建/更新时间）已配置中文数据库注释。新表在自动创建时会写入注释；`create_all` 不会更新已有表的注释。如果表已经创建，可在目标 PostgreSQL 数据库中手动执行 `sql/feedback_comments.sql`，只更新注释，不修改表结构或业务数据。该脚本使用当前连接的 schema 搜索路径，两张表及注释所引用的字段必须已经存在。

两表包含必填昵称（最多 50 字）、必填纯文本内容（最多 2000 字）、选填邮箱（最多 254 字）、审核状态、创建/更新时间和软删除时间。状态为 `0` 待审核、`1` 已通过、`2` 已拒绝，默认 `1` 已通过。已存在表可手动执行 `sql/feedback_status_defaults.sql` 更新默认值和状态注释，不改变历史记录的审核状态。数据库拒绝空白昵称/内容、无效状态、不完整回复关联和自我回复。

两表包含 `client_ip`（`VARCHAR(45)`，支持 IPv4/IPv6）及 `user_agent`（`VARCHAR(1024)`，保存原始浏览器/操作系统请求头），均允许为空。创建接口从 ASGI 请求的客户端地址获取并规范化 IP，读取 `User-Agent` 并截取前 1024 字符，不使用表单中的同名值。反向代理的真实客户端地址由 Uvicorn 可信代理设置解析，应用不直接读取 `X-Forwarded-For`。User-Agent 可由客户端修改，不作为身份或权限依据；尚未进行浏览器分类解析。

若两表已经创建，可先执行 `sql/feedback_request_metadata.sql` 增加字段，再执行完整注释脚本；新增字段允许为空，不要求补齐历史数据。公开列表及审核列表已配置索引。接口响应不返回邮箱、IP、User-Agent、审核状态或软删除时间。创建接口校验邮箱基本格式、处理首尾 Unicode 空白，并根据父评论自动确定顶层评论。公开列表仅查询已通过、未删除的数据，顶层评论不可访问时其回复列表也不可访问。

评论表已移除管理员身份标记。若表已存在该字段，可手动执行 `sql/feedback_remove_is_admin.sql` 删除它；启动自动建表不会删除已有字段。

已实现评论和留言的创建、分页查询接口，前端文章评论区和留言板已接入，暂未提供删除、审批接口。两种页码列表在同一条 SQL 中读取总数与记录，避免并发新增使分页信息不一致。调用方式见 [接口文档](docs/feedback-api.md)。`created_at`、`updated_at` 由数据库提供初值，`updated_at` 在 SQLAlchemy 更新记录时自动更新；直接执行 SQL 修改时需自行更新该字段。

两张表均保留 `created_at`、`updated_at`、`deleted_at`，类型统一为 `TIMESTAMP WITHOUT TIME ZONE`（即不带时区的 `TIMESTAMP`）。Python 读取为不带时区的 datetime，接口时间值不附带 `Z` 或时区偏移。时间默认按 PostgreSQL 连接的会话时区记录，部署时应保持各连接的时区一致。

若此前已创建带时区字段，可手动执行 `sql/feedback_timestamps.sql`，再执行 `sql/feedback_comments.sql` 更新注释。转换已有带时区时间时，会使用执行连接的 `TimeZone`，请确认它与后端一致；启动自动建表不会转换已有字段。脚本尚未连接数据库执行。

## 限流与缓存

三个发表入口（根评论、回复、留言）共享同一 IP 的 10 秒窗口，Redis Lua 保证并发请求只通过一个，超限返回 `429` 和 `Retry-After`。请求体校验通过后占用窗口，后续业务失败也不自动返还额度。三个 GET 接口共享同一 IP 任意连续 60 秒内最多 120 次查询，缓存命中也计数。IP 取规范化后的 ASGI 客户端地址，不直接采信 `X-Forwarded-For`。

根评论现支持 `page` 页码查询，返回根评论 `total`、`total_pages`，回复仍使用独立游标。只缓存默认参数的文章评论第一页（30 条根评论及每层 3 条回复）和留言前 3 页（每页 30 条），TTL 默认 30 秒。回复查看更多、评论后续页、兼容的旧游标、自定义分页参数直接查询数据库。根评论页码响应采用独立缓存标识，避免命中缺少页码或总数的旧响应。缓存内容仅为公开响应；未知/空文章不保留响应与版本键，单个缓存响应超过 1 MiB 时直接返回而不写缓存。

创建事务提交后切换文章或留言的随机版本标识，后续查询立即使用新版本。旧查询始终写入原版本，旧缓存等待过期；版本键过期或丢失时生成新的随机标识，不复用旧缓存。缓存重建使用短期 Redis 锁，释放前比较锁持有者。成功响应设置 `Cache-Control: no-store`，缓存只由 Redis 管理，CORS 允许前端读取 `Retry-After`。

Redis 故障时，发表返回 `503`；查询跳过缓存，使用进程内临时限流后回源数据库。所有回源读取均受每个 worker 默认 10 个并发槽位限制，等候超过 1 秒返回 `503`。Redis 限流与缓存可跨 worker 共享，临时限流和并发槽位只在单个 worker 内生效。数据已提交但缓存失效失败时记录日志，仍返回 `201`，避免访客重复提交；列表新鲜度此时依靠短期 TTL 恢复。

配置在 `.env.example` 的“评论 / 留言限流与缓存”一节，默认全部开启，实际连接配置从本地 `.env` 读取。Redis 单次操作默认最多等待 0.5 秒，告警日志按运行时合并，避免故障期间每条请求重复写日志。

## 界面模拟数据

在数据库客户端连接 `daixiaokang_website` 后，完整执行 [sql/feedback_mock_data.sql](sql/feedback_mock_data.sql)。需要先由后端创建当前版本的两张表；脚本不会随应用启动自动执行。

脚本生成 240 条留言、文章 `be17033b` 的 240 条根评论与 38 条回复。每页 30 条时各有 8 页，方便查看首页、末页和省略页码。前 5 条模拟根评论分别有 0、1、3、8、26 条回复，可查看预览 3 条、查看更多及回复其他回复的效果；还包含长文本、换行、表情和纯文本标签。

模拟内容带有可见标识，并使用独立 User-Agent 标记避免重复导入；整个插入过程在同一事务中完成，不修改已有数据。导入直接写入数据库，需等待查询缓存过期（默认 30 秒）后刷新页面。本脚本只准备数据，不启动服务。

## 离线测试

在 `backend` 目录执行：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

测试使用内存 SQLite 验证约束、接口创建和分页，通过内存 ASGI 调用验证 HTTP 参数与响应，并编译 PostgreSQL 建表、索引及查询语句。限流及缓存测试使用 fakeredis + Lua 执行实际脚本，覆盖并发、过期、发表后的版本切换、缓存重建竞争和 Redis 故障降级，不启动监听服务或连接业务数据库。实际 PostgreSQL / Redis 部署运行仍需在运行环境验证。生产安装继续使用 `requirements.txt`，不需要 fakeredis。

## 日志

默认同时输出到控制台和 `backend/logs/app.log`。按照服务器本地日期每天午夜滚动，在跨日后的第一条日志写入时切分；同一天预计写入后达到 `LOG_MAX_SIZE_MB=20`（20 × 1024 × 1024 字节）时也会先切分再写入。单条日志保持完整，极大的单条日志可能超过大小限制。

备份按切分时刻命名，例如 `app.log.2026-10-08_12-30-00_123456`，同一天可以产生多份。日期与大小切分的备份合计最多保留 `LOG_BACKUP_COUNT=15` 份，超出时自动删除最旧的备份；当前 `app.log` 不计入。原来生成的 `app.log.日期` 备份也纳入保留数量。这是按备份数量保留，不代表保留 15 天。

文本日志各部分使用 ` | ` 分隔，包含时间、级别、文件名、函数名、行号及请求 ID；请求日志还展示请求方法、路径、状态码、耗时（毫秒）与客户端 IP，异常日志附带完整堆栈。例如：

```text
2026-10-08 12:30:00 | INFO | request_context.py(__call__:68) | request_id=abc123 | request.completed | method='GET' | path='/docs' | status_code=200 | duration_ms=2.5 | client='127.0.0.1'
```

`LOG_JSON=true` 将控制台和文件同时切换为单行 JSON，保留上述定位及请求字段，时间采用服务器本地时区并带时区偏移。`LOG_FILE_ENABLED=false` 可关闭文件输出，`LOG_DIR` 可调整目录（相对路径以 `backend` 为基准）。Uvicorn 运行日志使用同一套格式，访问日志由请求中间件统一记录。

当前文件滚动适用于单工作进程。运行多个 worker 或多个实例时，应分别写入不同目录或关闭文件输出，交由日志采集系统处理，避免多个进程同时滚动同一个文件。
