# 正式域名配置

主站地址为 `https://daixiaokang.com`。当前 Nginx 模板和证书覆盖主站及 `api.daixiaokang.com`。如果需要 `www.daixiaokang.com` 兼容入口，需先扩展证书和 Nginx 配置，再将其永久跳转到主站并保留原路径和查询参数。

本文描述代码配置与部署要求，不代表 DNS、证书或线上服务已经按此配置。前端路径以 `frontend/` 为基准，后端路径以仓库的 `backend/` 为基准。

## Docker HTTPS 与自动续期

服务器使用根目录 Compose、`frontend/html/` 和挂载后端源码的部署方式时，参见 [HTTPS 部署步骤](../../deploy/HTTPS.md)。独立证书容器通过腾讯云 DNSPod API 申请 Let's Encrypt 证书，首次启动时申请，并在每天北京时间 03:15 检查续期；宿主机不需要 cron。首次签发成功后再启用 Nginx HTTPS 模板。脚本覆盖主站和 API 域名，EdgeOne 与媒体域名后续单独接入。

## 已配置的代码

- `_config.yml`：站点 URL、百度主动推送域名和 `Asia/Shanghai` 时区。站点 URL 用于生成 canonical、Open Graph、RSS、站点地图等绝对地址。
- `source/robots.txt`：两个站点地图地址。
- `_config.fomalhaut.yml`：页脚本站链接；AI、评论和留言正式环境走 `/api`，本地访问走各自的 `local_api_base`。
- 后端 `core/config.py` 和 `.env.example`：包含本地前端、正式站和 www 的允许来源与 Host。实际 `.env` 需要在部署环境单独核对。

图片和视频继续从本站 `/assets/` 读取，`site_media.base_url` 保持为空。网站 URL 不会自动变成媒体 CDN 地址。

## 服务器上线前需要配置

1. 在 DNS 中将主域名和 `api` 指向实际部署入口。
2. 为主域名和 `api` 配置有效证书，开启 HTTPS，并将 HTTP 跳转到 HTTPS。当前不包含 www 兼容入口；如需启用，先扩展证书和跳转配置。代码修改不会配置 DNS、证书或服务器跳转。
3. 在 `frontend/` 运行 `npm.cmd run build`，将生成的 `public/` 作为静态网站发布。评论与留言的 `/api/` 请求保留路径转发至 FastAPI，例如 `http://127.0.0.1:8000/api/comments`。反向代理保留原 Host 时，后端已允许正式域名。
4. AI 助手使用 FastAPI 的 `/api/ai/status`、`/api/ai/conversations` 及会话消息和关闭接口。在后端 `.env` 配置 `AI_API_KEY`，让 Nginx 将同源 `/api` 统一转发到 FastAPI；SSE 必须关闭代理缓冲，读取超时需覆盖模型生成等待时间。
5. 服务器的后端 `.env` 需要同步 CORS 和可信 Host；本机 `.env` 的修改不会自动传到服务器。数据库、Redis 的主机地址按部署方式切换为本机地址或容器服务名。

更改域名配置后重新生成前端；更改后端环境变量后重启后端。本地仍可通过 `npm.cmd run server` 和 `http://localhost:4000` 开发。

## Nginx API 转发示例

当前 Docker 部署统一维护仓库根目录 `nginx.conf`，上传到服务器 `frontend/nginx.conf`。配置包含静态资源缓存、页面 404 跳转、静态资源真实 404、API 禁止缓存及 AI 流式转发，CDN 接入要求参见 [HTTPS 部署步骤](../../deploy/HTTPS.md)。

下面只展示直接在宿主机部署后端时的 API 转发片段，Docker 部署使用完整模板中的容器服务名和 Docker DNS 配置：

```nginx
location ^~ /api/ {
    # 此处不带末尾斜杠，保留原始 /api/... 路径
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 180s;
}
```

后端通过 ASGI 客户端地址识别 IP，不直接采信应用层读取的转发头。若代理和后端不在同机回环网络，需按实际代理地址配置 Uvicorn 的可信代理范围，确保限流记录真实访客 IP。

## AI 服务部署

AI 助手依赖 FastAPI 的会话存储、历史恢复与凭证校验。静态托管平台上的前端需要将 `/api/` 路由到实际后端，模型密钥配置在后端 `AI_API_KEY`，前端构建无需模型密钥。后端还需要可访问的 PostgreSQL 和 Redis。

## 暂未启用的服务

- 百度主动推送仍需要自己的 `token`，仅填写域名不会开通收录推送。
- 51LA、灵雀、百度统计等仍需在对应平台创建站点并填写真实标识，占位配置不代表服务已经开通。
- 朋友圈暂为空页面，保留菜单入口；后续补充自建前端样式与后端接口。
- Algolia 仅保留依赖和占位配置，当前使用本站 `search.xml` 本地搜索，无需开通 Algolia 服务。
- Hexo Git 部署仓库仍是模板地址。使用自己的服务器部署时，无需运行 `hexo deploy`；如果要使用 Git 部署，先配置真实仓库。
