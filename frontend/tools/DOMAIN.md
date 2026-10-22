# 正式域名配置

主站地址为 `https://daixiaokang.com`。`www.daixiaokang.com` 作为兼容入口，由服务器永久跳转到主站，并保留原路径和查询参数。

## 已配置的代码

- `_config.yml`：站点 URL、百度主动推送域名和 `Asia/Shanghai` 时区。站点 URL 用于生成 canonical、Open Graph、RSS、站点地图等绝对地址。
- `source/robots.txt`：两个站点地图地址。
- `_config.fomalhaut.yml`：页脚本站链接；评论和留言正式环境走 `/api`，本地访问走 `local_api_base`。
- `source/social/link/index.md`：本站友链资料使用完整域名、实际头像和封面地址，供其他站点复制。
- Vercel / Cloudflare Pages 的 AI 代理：默认允许正式域名及其子域。
- 后端默认配置和 `.env.example`：保留本地来源，补充正式站和 www 的允许来源与 Host。本地已有 `.env` 也已同步这两项，不改数据库和 Redis 连接。

图片和视频继续从本站 `/assets/` 读取，`site_media.base_url` 保持为空。网站 URL 不会自动变成媒体 CDN 地址。

## 服务器上线前需要配置

1. 在 DNS 中将主域名和 www 指向实际部署入口。
2. 为两个域名配置有效证书，开启 HTTPS，并将 HTTP 跳转到 HTTPS、www 跳转到主域名。代码修改不会配置 DNS、证书或服务器跳转。
3. 将前端构建产物 `public/` 作为静态网站发布，评论与留言的 `/api/` 请求保留路径转发至 FastAPI，例如 `http://127.0.0.1:8000/api/comments`。反向代理保留原 Host 时，后端已允许正式域名。
4. 如果在服务器上继续使用 AI 助手，需要单独部署 AI 代理并配置服务端密钥。现有 Vercel / Cloudflare 函数不会随静态文件自动在普通服务器上运行。`/api/chat/completions` 应路由到 AI 代理，其余评论、留言 API 路由到 FastAPI。
5. 服务器的后端 `.env` 需要同步 CORS 和可信 Host；本机 `.env` 的修改不会自动传到服务器。数据库、Redis 的主机地址按部署方式切换为本机地址或容器服务名。

更改域名配置后重新生成前端；更改后端环境变量后重启后端。本地仍可通过 `npm.cmd run server` 和 `http://localhost:4000` 开发。

## 暂未启用的服务

- 百度主动推送仍需要自己的 `token`，仅填写域名不会开通收录推送。
- 51LA、灵雀、百度统计等仍需在对应平台创建站点并填写真实标识；本次不填写占位密钥。
- 朋友圈的数据仓库和示例友链仍待后续完善；它们不应简单替换成本站域名。
- Hexo Git 部署仓库仍是模板地址。使用自己的服务器部署时，无需运行 `hexo deploy`；如果要使用 Git 部署，先配置真实仓库。
