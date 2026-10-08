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
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --no-access-log
```

服务地址：

- API：<http://localhost:8000>
- Swagger：<http://localhost:8000/docs>
- ReDoc：<http://localhost:8000/redoc>

所有配置均从环境变量读取，开发环境可复制 `.env.example` 为 `.env`。生产环境请替换数据库密码、可信域名和 CORS 来源，并启用 `LOG_JSON=true` 与 `STARTUP_CHECK_DEPENDENCIES=true`。

`DATABASE_AUTO_CREATE=true` 时，启动会连接 PostgreSQL 并创建缺失表，因此需要先创建配置中指定的数据库。表结构由继承 `app.db.base.Base` 的模型定义，并在 `app/models/__init__.py` 中导入注册；当前没有业务模型，暂不会创建业务表。此逻辑不会修改已有表的字段。

## 日志

默认同时输出到控制台和 `backend/logs/app.log`。按照服务器本地日期每天午夜滚动，在跨日后的第一条日志写入时切分；同一天预计写入后达到 `LOG_MAX_SIZE_MB=20`（20 × 1024 × 1024 字节）时也会先切分再写入。单条日志保持完整，极大的单条日志可能超过大小限制。

备份按切分时刻命名，例如 `app.log.2026-10-08_12-30-00_123456`，同一天可以产生多份。日期与大小切分的备份合计最多保留 `LOG_BACKUP_COUNT=15` 份，超出时自动删除最旧的备份；当前 `app.log` 不计入。原来生成的 `app.log.日期` 备份也纳入保留数量。这是按备份数量保留，不代表保留 15 天。

文本日志各部分使用 ` | ` 分隔，包含时间、级别、文件名、函数名、行号及请求 ID；请求日志还展示请求方法、路径、状态码、耗时（毫秒）与客户端 IP，异常日志附带完整堆栈。例如：

```text
2026-10-08 12:30:00 | INFO | request_context.py(__call__:68) | request_id=abc123 | request.completed | method='GET' | path='/docs' | status_code=200 | duration_ms=2.5 | client='127.0.0.1'
```

`LOG_JSON=true` 将控制台和文件同时切换为单行 JSON，保留上述定位及请求字段，时间采用服务器本地时区并带时区偏移。`LOG_FILE_ENABLED=false` 可关闭文件输出，`LOG_DIR` 可调整目录（相对路径以 `backend` 为基准）。Uvicorn 运行日志使用同一套格式，访问日志由请求中间件统一记录。

当前文件滚动适用于单工作进程。运行多个 worker 或多个实例时，应分别写入不同目录或关闭文件输出，交由日志采集系统处理，避免多个进程同时滚动同一个文件。
