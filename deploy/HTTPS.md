# 容器内 HTTPS 申请与自动续期

适用服务器目录：`/daixk/project/daixiaokang`。证书服务 `daixiaokang_acme` 使用 acme.sh、Let's Encrypt 和腾讯云 DNSPod DNS 验证，为 `daixiaokang.com`、`api.daixiaokang.com` 申请同一张证书。首次启动立即检查/申请，以后每天北京时间 **03:15** 检查续期，进入续期窗口才重新签发。

宿主机只需要 Docker 和 Compose，不需要安装 Git、OpenSSL、cron 或配置 systemd 定时任务。容器通过 Supercronic 调度，日志可用 `docker compose logs` 查看。后端内部继续使用 HTTP。

## 1. 上传并准备配置

首次从公开仓库部署时，先将根目录 `docker-compose.example.yaml` 复制为本地 `docker-compose.yaml`，将 `nginx.conf.example` 复制为本地 `nginx.conf`；后端使用 `backend/.env.docker.example` 创建 `.env.docker` 并填写自己的连接信息。实际配置均被 Git 忽略，完整对应关系见 [CONFIGURATION.md](CONFIGURATION.md)。已有配置时不要覆盖。

上传整个 `deploy/`（包含隐藏文件 `.dockerignore`）和最新根目录 `docker-compose.yaml`。后端源码及 `backend/.env.docker` 放在 `backend/`，前端构建产物放在 `frontend/html/`。

本地根目录的 `nginx.conf` 上传到服务器的 `frontend/nginx.conf`；Compose 从 `./frontend/nginx.conf` 挂载到容器的 `/etc/nginx/nginx.conf`。本地 `frontend/public/` 内的构建文件上传到服务器 `frontend/html/`，不需要上传整个本地 `frontend/` 源码目录。

```bash
cd /daixk/project/daixiaokang
mkdir -p deploy/acme frontend/ssl frontend/logs backend/logs
chmod 700 deploy/acme frontend/ssl
cp -n deploy/https.env.example deploy/https.env
chmod 600 deploy/https.env
nano deploy/https.env
```

填写：

```dotenv
ACME_EMAIL='你的邮箱'
Tencent_SecretId='你的腾讯云 SecretId'
Tencent_SecretKey='你的腾讯云 SecretKey'
HTTPS_CRON='15 3 * * *'
```

密钥需有对应 DNSPod 域名的查询及 TXT 记录创建、删除权限，使用单独授权的子账号即可。这不是旧版 DNSPod ID/Token。配置中的单引号会由 Compose 正确解析；密钥包含 `$` 时保留单引号，避免插值。

证书容器挂载 `/var/run/docker.sock`，以便通过 Docker CLI 检查并重载 Nginx，因此具有控制宿主机 Docker 的权限。凭据保存在服务器配置及 `deploy/acme/` 账户目录中，均不可公开或放入 `frontend/html/`。

## 2. 启动证书容器

```bash
docker compose config --quiet
docker compose up -d --build daixiaokang_acme
docker compose logs -f daixiaokang_acme
```

按 `Ctrl+C` 只退出日志查看，容器继续运行。构建使用官方 `neilpang/acme.sh` 镜像，另外安装 Docker CLI、文件锁和调度工具。服务器需要能拉取镜像和 Alpine 软件包；运行时需能访问 Let's Encrypt、腾讯云 DNSPod API 和 DNS 验证查询服务。如果域名设置了 CAA，需要允许 Let's Encrypt 签发。

DNS 验证不依赖 EdgeOne、80/443 端口或 Nginx 已运行。没有证书时会先申请；首次失败时保留错误日志，并按每日计划重试。修复配置后可手动执行 `renew` 立即重试。

成功后，以下数据保存在宿主机，重建容器不会丢失：

```text
deploy/acme/              # ACME 账户、域名配置、续期状态（不要删除）
frontend/ssl/
├── fullchain.pem
└── privkey.pem
```

查看签发结果：

```bash
docker compose run --rm --no-deps daixiaokang_acme status
```

## 3. 签发成功后启用 HTTPS

本地根目录 `nginx.conf` 是统一维护的配置文件，上传到服务器 `frontend/nginx.conf`；覆盖前可先备份服务器原配置。确认已上传最新配置，并且 `frontend/ssl/fullchain.pem` 和 `privkey.pem` 已生成，再检查配置和启动服务：

```bash
# 临时容器检查实际配置和证书；检查失败时先修复，不停止原前端。
docker compose run --rm --no-deps daixiaokang_frontend nginx -t
docker compose up -d
```

Compose 将整个证书目录只读挂载给 Nginx，并开放 80、443 端口。Nginx 模板提供主站页面、主站 `/api/` 兼容入口和 API 子域名转发，API 流式响应关闭代理缓冲。容器通过同一个 `mynetwork` 通信。

主站 `location /` 中配置 `error_page 404 = @homepage;`，由命名 location 明确执行 `return 302 /;`，保证响应包含 `Location`，浏览器地址回到 `/`。常见静态资源（图片、脚本、样式、视频、字体、JSON、XML 等）单独处理，缺失时仍返回 404，避免把首页 HTML 当作资源加载。以点开头的文件和目录禁止访问。`/api/` 使用 `^~` 前缀优先匹配，即使接口路径以 `.js` 等扩展名结尾，也仍转发给后端。

缓存策略统一由 Nginx 返回：页面、`search.xml`、站点地图及 Service Worker 使用 `Cache-Control: no-cache`，允许存储但每次使用前校验；成功的图片、视频、字体、CSS、JS 等静态资源缓存一天。当前文件名并非全部带版本号，因此不使用 `immutable`。错误响应不设置一天的缓存；`/api` 和 `/api/` 响应统一为 `no-store`。覆盖同名静态文件后，如需立即生效，应刷新浏览器及 CDN 缓存或更新资源 URL。视频保留 Nginx 默认的 Range 分段响应支持。

启用文本资源 gzip、TLS 1.2/1.3、TLS 会话缓存和 HTTP/2。`http2 on` 要求 Nginx 1.25.1 或更新版本，当前 Compose 的 `nginx:latest` 支持。API 关闭响应缓冲、gzip 和代理缓存，连接超时为 5 秒、相邻两次读取之间的超时为 180 秒，以支持 AI SSE。API 的错误响应直接返回，不跳转首页；`/api` 以 308 跳转 `/api/` 并保留查询参数和请求方法。

更新配置后，已运行的前端容器需先检查再重载：

```bash
docker compose exec daixiaokang_frontend nginx -t
# 上一步通过后执行
docker compose exec daixiaokang_frontend nginx -s reload
```

主站和 `api` 的 DNS 指向服务器，并在安全组、防火墙允许 TCP 80、443 后验证：

```bash
curl -I https://daixiaokang.com/
curl https://api.daixiaokang.com/api/ai/status
```

模板和证书暂不包含 `www.daixiaokang.com`。`static.daixiaokang.com` 的 EdgeOne 边缘证书后续单独配置。

### CDN 接入范围

当前规划为 `static.daixiaokang.com → EdgeOne → COS`，静态域名不经过这台 Nginx，无需在此添加对应 `server`。在 EdgeOne 配置 COS 源站、域名 HTTPS 和缓存规则，在前端设置媒体域名即可；Nginx 的缓存响应头不会影响 COS 源站。

如果以后主站或 API 也接入 EdgeOne：

- 回源使用 HTTPS、443 端口，并正确设置回源 Host 和 TLS SNI：主站使用 `daixiaokang.com`，API 使用 `api.daixiaokang.com`，启用回源证书校验。边缘证书与服务器证书分别管理。
- 在 EdgeOne 明确设置 `/api`、`/api/*` 不缓存；API 子域名整站不缓存。AI 流式接口关闭边缘缓冲或合并响应，并核对平台的流式传输能力及超时。不要使用覆盖全站的强制缓存规则。
- HTML、搜索索引及 Service Worker 遵循源站的校验策略；普通静态资源可遵循源站一天的缓存。修改同名文件后刷新 EdgeOne 缓存。
- 获得 EdgeOne 官方回源 IP 段及对应真实 IP 请求头的配置要求后，再配置 Nginx 的 `set_real_ip_from` 和 `real_ip_header`，仅信任这些回源网段。当前没有启用对外部转发头的信任，日志中的 IP 在接入 CDN 后会暂时是边缘节点 IP。

Nginx 使用 `$remote_addr` 覆盖客户端传入的 `X-Forwarded-For`，避免直连时伪造转发链。后端按 ASGI 客户端地址进行限流，Docker 网络中的 Uvicorn 还需要通过 `FORWARDED_ALLOW_IPS` 信任实际 Nginx 代理地址，才能使用转发后的访客 IP；需结合实际 Docker 网络单独配置，不要无条件信任所有地址。

## 4. 日常检查与维护

证书容器启动时先检查一次，之后每天 03:15（`Asia/Shanghai`）检查。未到续期时间直接跳过；续期成功后安装证书，先执行 `nginx -t`，通过后执行 `nginx -s reload`。Nginx 未启动时保留证书，待启用 HTTPS 后正常读取。检查失败或 Docker 不可用时记录错误并保留待重载状态，下次检查重试；不会主动停止或重启 Nginx。

```bash
# 查看状态及最近日志
docker compose ps
docker compose logs --tail=100 daixiaokang_acme

# 手动检查续期（不会强制申请；首次申请失败时也可用它重试）
docker compose run --rm --no-deps daixiaokang_acme renew

# 修复 Nginx 配置后重试检查和重载
docker compose run --rm --no-deps daixiaokang_acme reload
```

也可以继续用宿主机便捷脚本：

```bash
bash deploy/https.sh start
bash deploy/https.sh status
bash deploy/https.sh renew
bash deploy/https.sh reload
bash deploy/https.sh logs
```

这些命令只调用 Compose，真正操作在容器内执行。并发的申请/续期通过文件锁互斥，容器异常退出时锁自动释放。修改 DNSPod 密钥或检查时间后需重建证书容器以载入新环境：

```bash
docker compose up -d --force-recreate daixiaokang_acme
```

更新脚本或 acme.sh 版本时执行 `docker compose up -d --build daixiaokang_acme`。镜像内自动升级关闭，版本通过重新构建更新。

如果此前运行过旧版宿主机申请脚本，先用 `crontab -l` 查看、`crontab -e` 删除包含 `/root/.acme.sh-daixiaokang` 的旧续期任务，避免两套任务同时管理证书；保留其他定时任务。不要使用 `crontab -r`。旧证书可保留，容器成功签发和安装后会更新部署目录。

`deploy/https.env`、`deploy/acme/`、`frontend/ssl/` 已加入 Git 忽略规则。镜像构建上下文只包含 Dockerfile 和脚本，不会把密钥、证书或账户数据打包进镜像。

本地流程验证（仅模拟 DNS/ACME/Docker，不申请真实证书）：

```bash
python -m unittest discover -s deploy/tests -v
```

参考：[acme.sh](https://github.com/acmesh-official/acme.sh)、[官方容器构建](https://github.com/acmesh-official/acme.sh/blob/master/Dockerfile)、[腾讯云 DNS API 实现](https://github.com/acmesh-official/acme.sh/blob/master/dnsapi/dns_tencent.sh)。
