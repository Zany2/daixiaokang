# 配置示例与迁移

当前 CDN、COS、DNS、容器网络、证书、数据备份和迁移顺序统一记录在 [当前线上配置与迁移手册](MIGRATION.md)。本文件侧重实际配置与公开示例的对应关系。

公开仓库仅保存配置示例。实际运行配置、证书、账户数据和日志留在本地或服务器，由 `.gitignore` 排除。示例保留当前功能开关、域名及目录关系；公开域名不是凭据。密码使用占位符，模型和腾讯云 API 密钥留空。

## 文件对应关系

| 仓库内的示例 | 本地实际配置 | 服务器位置 |
| --- | --- | --- |
| `docker-compose.example.yaml` | 根目录 `docker-compose.yaml` | 项目根目录 `docker-compose.yaml` |
| `nginx/nginx.conf.example` | `nginx/nginx.conf` | `nginx/nginx.conf` |
| `nginx/conf.d/daixiaokang.conf.example` | `nginx/conf.d/daixiaokang.conf` | `nginx/conf.d/daixiaokang.conf` |
| `frontend/_config.example.yml` | `frontend/_config.yml` | 留在构建电脑，不直接上传 |
| `frontend/_config.fomalhaut.example.yml` | `frontend/_config.fomalhaut.yml` | 留在构建电脑，不直接上传 |
| `frontend/themes/fomalhaut/_config.example.yml` | `frontend/themes/fomalhaut/_config.yml` | 留在构建电脑，不直接上传 |
| `backend/.env.example` | `backend/.env` | 本地开发使用 |
| `backend/.env.docker.example` | `backend/.env.docker` | `backend/.env.docker` |
| `deploy/https.env.example` | `deploy/https.env` | `deploy/https.env` |
| `config-examples/love-page.md.example` | `frontend/source/personal/love/index.md` | 只上传构建后的页面 |

## 克隆后恢复本地配置

以下命令从仓库根目录执行，只创建不存在的配置，避免覆盖自己的密码和站点设置：

```powershell
if (!(Test-Path -LiteralPath frontend/_config.yml)) { Copy-Item frontend/_config.example.yml frontend/_config.yml }
if (!(Test-Path -LiteralPath frontend/_config.fomalhaut.yml)) { Copy-Item frontend/_config.fomalhaut.example.yml frontend/_config.fomalhaut.yml }
if (!(Test-Path -LiteralPath frontend/themes/fomalhaut/_config.yml)) { Copy-Item frontend/themes/fomalhaut/_config.example.yml frontend/themes/fomalhaut/_config.yml }
if (!(Test-Path -LiteralPath backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path -LiteralPath backend/.env.docker)) { Copy-Item backend/.env.docker.example backend/.env.docker }
if (!(Test-Path -LiteralPath deploy/https.env)) { Copy-Item deploy/https.env.example deploy/https.env }
if (!(Test-Path -LiteralPath docker-compose.yaml)) { Copy-Item docker-compose.example.yaml docker-compose.yaml }
if (!(Test-Path -LiteralPath nginx/nginx.conf)) { Copy-Item nginx/nginx.conf.example nginx/nginx.conf }
if (!(Test-Path -LiteralPath nginx/conf.d/daixiaokang.conf)) { Copy-Item nginx/conf.d/daixiaokang.conf.example nginx/conf.d/daixiaokang.conf }
```

按实际环境填写数据库、Redis 密码、AI 密钥、腾讯云密钥和邮箱。`backend/.env.docker.example` 中的 `CHANGE_ME` 必须替换；Redis 没有启用密码时，移除 URL 中的 `:CHANGE_ME@`。密码写入 URL 时需进行 URL 编码。

如需启用加密页面，手动将页面示例复制到对应位置，设置自己的密码并补充内容。真实页面和密码不会随 Git 迁移，应另行私下备份。页面密码曾经进入 Git 历史时，取消跟踪不能清除旧提交中的密码，应更换密码；曾提交过的 API 密钥也应在对应平台撤销并重建。

后端依赖镜像按 `backend/requirements.txt` 构建。前端在本地构建，只将 `frontend/public/` 内的内容上传到服务器 `frontend/html/`。迁移时不要用示例覆盖已有的生产配置。证书服务及 HTTPS 启动步骤见 [HTTPS.md](HTTPS.md)。

## 日常上传范围

| 本地内容 | 服务器目录 | 更新方式 |
| --- | --- | --- |
| `backend/` 源码及运行所需数据 | `backend/` | 上传时排除 `.venv/`，服务器依赖来自后端依赖镜像；使用生产 `.env.docker` |
| `deploy/` 脚本、Dockerfile、文档 | `deploy/` | 上传包含隐藏文件 `.dockerignore`；保留服务器正式 `https.env` 及 `acme/` 账户状态 |
| `frontend/public/` 中的全部内容 | `frontend/html/` | 构建后上传目录内的内容，入口为 `frontend/html/index.html` |
| `nginx/nginx.conf`、`nginx/conf.d/` | `nginx/` | 目录对应上传，站点以 `.conf` 结尾才会被加载 |

服务器运行产生的 `backend/logs/`、`nginx/logs/`、`deploy/acme/` 和 `frontend/ssl/` 需要保留。同步工具应保留这些目录中的现有数据。生产 `.env.docker` 与本地开发 `.env` 分别维护，Compose 将 `.env.docker` 注入后端进程，进程环境变量优先于代码读取的 `.env`。依赖有变化时根据 `backend/requirements.txt` 重建后端依赖镜像。

`nginx/nginx.conf` 放公共 HTTP、TLS、gzip 和 Docker DNS 设置，通过 `include /etc/nginx/conf.d/*.conf` 加载站点。`nginx/conf.d/daixiaokang.conf` 包含个人网站、API、站点缓存和证书路径。后续项目在 `conf.d/` 增加自己的配置文件，并配置服务地址、Docker 网络、DNS 及对应证书。

现有服务器改目录的操作见 [迁移手册的目录调整步骤](MIGRATION.md#31-现有服务器调整目录)。

## 提交前检查

修改真实配置不会出现在 Git 变更中。需要共享功能配置变化时，手动更新对应示例，检查密钥、密码及连接 URL 后再提交。不要从真实环境配置自动覆盖示例。

源码中的默认配置类、前端组件配置代码、语言文件及不含凭据的页面布局数据继续保留。依赖、构建产物、缓存等仍遵循原有忽略规则。
