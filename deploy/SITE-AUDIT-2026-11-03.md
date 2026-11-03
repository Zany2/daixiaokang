# 网站线上环境复检：2026-11-03

## 统计功能部署后复检（北京时间 13:57–14:09）

本节为本轮最新结果，下方早先检测记录保留作对照。全站批量请求完成于 13:58，统计接口、跨域及线上构建版本于 14:09 再次核对。

- DNS 仍为主站、www、static 走 EdgeOne，api 直接解析至服务器；四个 HTTPS 域名证书验证通过，源站 HTTPS 可用。
- 28 项核心接口、重定向、跨域与错误响应检查全部通过；44 个页面、300 个站内资源无访问错误。
- 35 个首页视频均正确返回 206 Range；CSS、JS 和静态头像重复访问命中 HIT，条件请求返回 304。
- 两个 API 末尾斜杠重定向继续保持 HTTPS，5 张地图图标正常。
- 新的 GET /api/analytics/summary 返回 200、no-store；geo_available=true，地域库已经加载。
- 14:09 快照：累计 PV=4、今日 PV=4、今日 UV=2。省份与未知地域之和、来源类别之和均等于累计 PV。当前记录的省份为山东，来源为直接访问 / 未知；这些数字会随访问继续变化。
- 最近 12 个月数据结构、34 个省级地域条目均正常；主站和 www 的采集 POST 预检返回 200，未知来源返回 400。
- 首页、统计页以及 site-analytics.js、census.js 的响应内容均与本地最新构建一致；页面仅包含一份采集引导配置。
- 本轮未手动写入测试访问、评论或留言，未调用 AI 模型；浏览器常规页面访问可能按实际访问计数。仅从已存在统计数据和公开接口验证采集已在工作，没有向线上灌入来源、地域或重复事件测试数据。
- 浏览器验收工具创建了统计页标签，但读取页面状态持续超时，未完成实际图表绘制和 PJAX 交互验收。不能将接口与构建一致性等同于完整浏览器交互测试。采集去重、重试和图表数据渲染的本地自动测试此前已通过。
- 已知第三方封面和示例卡片问题未纳入本站部署故障，也未在本轮重复检测。

本轮检测时间：北京时间 12:18–12:22，另对异常第三方资源和统计脚本进行复测。方式为从本地网络进行只读 HTTP、DNS、TLS 检查，并对照本地构建文件。用户已更新 Compose、重建容器，并重新构建上传前端。

结论：当前可从公网验证的核心部署、接口、CDN 及媒体访问正常。此前的 API HTTPS 重定向和地图图标缺失均已修复。用户随后提供服务器日志，确认直连 API 的 ASGI 客户端地址记录为公网客户端地址，未采用伪造的转发 IP。另发现游戏页外链封面失效、示例文章的第三方 GitHub 卡片访问超时。

## 访问路线

| 域名 | 复检结果 |
| --- | --- |
| daixiaokang.com | CNAME 为 daixiaokang.com.eo.dnse2.com；页面与资源返回 EdgeOne 响应头 |
| www.daixiaokang.com | CNAME 为 www.daixiaokang.com.eo.dnse2.com；HTTP、HTTPS 均 301 到 HTTPS 主域名，保留路径及查询参数 |
| static.daixiaokang.com | CNAME 为 static.daixiaokang.com.eo.dnse2.com；媒体通过 EdgeOne 访问 COS，本轮引用的 145 个资源均命中 HIT |
| api.daixiaokang.com | A 记录为 134.175.50.80；Nginx 直连代理后端，接口响应为 no-store |

四个域名的 HTTPS 证书链和主机名验证均通过，协商 TLS 1.3；证书到期日在 2027 年 1 月 30–31 日。直接连接源站 IP，使用主站域名作为 SNI 和 Host，也通过证书验证并返回 200。EdgeOne 控制台实际开启的回源证书校验和缓存时长不能仅由这些响应证实。

www 跳转地址显式带有默认端口 :443，例如 `https://daixiaokang.com:443/archives/?audit=final`，功能正常。

## 已通过项目

- 43 个站点地图地址，加首页，共 44 个页面均返回 200。
- 检查 299 个站内资源地址（含页面嵌入和 CSS 依赖），均返回 200 或 206；无本站资源访问错误。
- 线上评论、留言和 AI 的正式接口地址为 `https://api.daixiaokang.com/api`。配置中保留的 localhost 地址仅用于本地开发条件分支。
- 本轮提取的实际页面资源引用中未发现 HTTP 混合内容。
- AI 状态、评论列表、留言列表均返回 JSON 200、no-store，并允许主站跨域读取。
- 主站和 www 的三个 POST 预检均通过，允许 Content-Type、X-Conversation-Token；未知来源的预检返回 400。Retry-After 可跨域读取。
- 主站旧 `/api/ai/status` 兼容入口正常且禁止缓存。
- HTML、搜索索引、站点地图、robots.txt、Service Worker 使用 no-cache；CSS、JS 的缓存为 public, max-age=86400。页面的 MISS 符合每次校验策略。
- CSS、JS 及头像重复 GET 命中 EdgeOne，If-None-Match 条件请求返回 304。静态域名头像的浏览器缓存为 3600 秒；边缘 15 天配置仍以控制台为准。
- 35 个首页视频的 Range 请求均返回 206、正确 Content-Range，并命中 EdgeOne。
- 页面与 JS 的 gzip 正常；API 状态接口保持不压缩。
- 不存在的普通页面 302 回首页；缺失静态图片返回 404；不存在的 API 返回 JSON 404、no-store。
- `/.env`、`/.git/config`、`/backend/.env` 返回 404。此抽查不等同于完整安全审计。
- 本轮对照 69 个 CSS/JS 构建文件。68 个首次内容一致；census.js 首次存在差异，随后使用相同 URL 和请求头复测，并与源站对照，三者已一致，未复现持续旧版本。覆盖同名资源后仍应按发布流程刷新 CDN 缓存。
- 当前 Service Worker 的目标主机仍为 example.com、www.example.com，不介入本站域名请求。

## 本次修复验证

### API 代理识别 HTTPS：已生效

此前这两个请求重定向到 HTTP，本轮均返回正确的 HTTPS Location：

```text
GET https://api.daixiaokang.com/api/ai/status/
307 Location: https://api.daixiaokang.com/api/ai/status

GET https://api.daixiaokang.com/api/messages/
307 Location: https://api.daixiaokang.com/api/messages
```

外部请求分别携带伪造的 X-Forwarded-Proto=http、https，重定向均仍为 HTTPS，符合 Nginx 覆盖转发头的配置。HTTPS 协议信任已从外部证实；实际 request.client 已由用户提供的服务器日志核实。

为便于核对，已发送两次带唯一请求 ID 的只读探测。在服务器项目目录执行：

```bash
docker compose logs --since=1h daixiaokang_backend | grep 'site-recheck-1f7bbc3ef4c3'
```

用户返回的日志中，两次探测分别于 2026-11-03 12:18:47 和 12:18:48 完成，状态码均为 307，client 为同一个公网客户端地址，而非 Docker 容器地址或本次伪造的 198.51.100.99。代理协议识别及客户端 IP 转发验证通过。该核验针对直连 API 域名；主域名旧 /api 经过 EdgeOne，仍可能记录边缘节点地址。

### 地图插件图标：已修复

layers.png、layers-2x.png、marker-icon.png、marker-icon-2x.png、marker-shadow.png 均返回 200，响应内容与本地官方 Leaflet v1.7.1 图片逐字节一致。

## 剩余第三方资源问题

### 游戏页的三张外链封面

页面：`https://daixiaokang.com/life/games/`。使用浏览器 User-Agent 和本站 Referer 进行 GET，复测结果一致：

| 游戏 | 外链图片结果 |
| --- | --- |
| 虫子迷宫 | haiyong.site 下的 e0e087c8c4a54c6daa9165681cc7aa51.png 返回 404 |
| 植物大战僵尸 | code.haiyong.site 下的 pvz1-1.png 返回 403 |
| 盖楼游戏 | code.haiyong.site 下的 20230412215827.png 返回 403 |

源文件为 `frontend/source/life/games/index.md`。建议更换为可用的自有封面，或沿用该页已有的渐变背景卡片。本项仅验证图片，未验证外部游戏链接的完整交互。

### 示例文章中的 GitHub 统计卡片

页面：`https://daixiaokang.com/posts/2013454d.html`。16 个懒加载图片请求使用 github-readme-stats.vercel.app，内容为示例用户及仓库的多种主题。该域名在本次网络下多次访问超时，无法确认其他地区的可用性。

其余被引用的外部脚本、样式、字体及媒体共 36 个请求返回 200。建议按需要保留示例，或替换这些依赖外部动态服务的卡片。

## 覆盖边界

- 未登录服务器，未读取线上私有配置。用户已确认重建容器，并提供本轮探测的服务器日志，验证了客户端 IP；未直接检查全部网络挂载及环境变量。
- 未提交评论、留言，未创建 AI 会话或调用付费模型，未验证完整 SSE、会话恢复或浏览器布局交互。
- 只验证现有证书可用；未触发真实续期，未验证定时续期任务执行记录。
- 本轮只更新此检测记录，未修改线上配置或业务数据。
