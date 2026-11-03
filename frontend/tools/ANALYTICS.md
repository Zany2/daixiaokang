# 自建网站统计

现有 `/site/census/` 页面使用自建 API 展示 6 个访问指标、累计中国省份地图、近 12 个月 PV 趋势和累计来源饼图。GitHub 贡献日历沿用原有实现。

## 部署

1. 将后端 `requirements.txt` 同步到依赖镜像构建目录并重新构建镜像，新增依赖 `py-ip2region==3.0.6`。
2. 同步后端代码。默认 `DATABASE_AUTO_CREATE=true` 时启动自动创建 `site_visits` 表；关闭时执行 `backend/sql/create_tables.sql` 创建缺失表，不会重建原表。
3. 在本地 backend 目录执行 `.venv/Scripts/python.exe tools/download_geo.py --ipv6`，下载官方离线地域库。将 `backend/data/geo/` 下两个 `.xdb` 文件同步到服务器同名位置，再重新创建后端容器。下载需要访问 GitHub；也可从官方仓库 data 目录手动取得 ip2region_v4.xdb 和 ip2region_v6.xdb。文件不进入 Git；重新下载更新后需重启后端以载入。来源及许可证：<https://github.com/lionsoul2014/ip2region>（Apache-2.0）。
4. 实际后端配置可选 `ANALYTICS_ENABLED=true`、`ANALYTICS_GEO_DIR=data/geo`，均有默认值。相对目录以 backend 为基准。未加载地域库仍可记录访问，地域归为未知，页面显示说明。
5. 前端 `site_analytics` 配置正式 API 和本地 API 地址。重新构建上传 `public/` 内容至服务器 `frontend/html/`，刷新主站 CDN 缓存。

无需调整 Nginx：现有 `/api/` 代理覆盖新接口，继续禁止缓存。API 域名直连且必须正确配置可信代理，才能获取真实客户端 IP。

## 统计口径

- `POST /api/analytics/visits`：JSON 包含随机 event_id、visitor_id、页面 path、入口 referrer、utm_source。每次完整加载和 PJAX 路径切换上报一次；同路径重复完成事件不重复上报，不统计锚点与查询参数变化。隐藏页签首次可见时再上报。
- 同一个 event_id 重复提交只写入一条记录。前端串行上报；网络失败或 5xx 时使用同一 event_id 最多重试一次，429 和其他 4xx 不自动重试。统计页查询前确保当前页面已加入采集队列，并等待此前上报结束。已知机器人 UA 不记录；同 IP 的采集及查询复用后端读取限流，不保证完全防刷。
- 日/月范围采用北京时间；UV 按匿名浏览器标识去重，清除浏览器存储或更换设备会产生新访客。客户端时间不参与计数分组。
- 首次入口来源在当前页签沿用，闲置超过 30 分钟后重新识别；站内 PJAX 恢复活动时开启新来源周期，不继承过期的外部入口。带 utm_source 为推广渠道，否则根据入口 referrer 区分搜索引擎、外部链接、直接访问 / 未知。浏览器限制导致的来源缺失无法恢复。
- 地图使用本地 ip2region v3 数据库，依据规范化后的 ASGI 客户端 IP 识别省份。IPv4、IPv6 分别查询；海外、内网和未识别地址单独计数，不填充地图。
- 数据库仅存事件 ID、匿名浏览器 SHA-256 摘要、页面路径、来源类别、省份及时间；不保存此采集接口的原始 IP、完整来源 URL、UTM 内容及页面查询参数。普通后端请求日志仍按全站日志配置记录客户端 IP。
- `GET /api/analytics/summary` 在单条 PostgreSQL 语句的同一个快照中计算全部指标，仅返回聚合数据，响应禁止缓存。不公开原始事件或浏览器标识。采集启用前的历史访问不会自动补回。
- 此次范围只覆盖现有统计页；原侧栏和文章阅读量继续使用 Vercount，两者从不同起点独立统计，不应直接比较总数。原 51LA / 灵雀占位配置保留，本页不再依赖其数据。

## 验证

后端在 backend 执行 `python -m unittest discover -s tests -p test_analytics.py -v`，使用配置的 PostgreSQL 创建随机临时 schema，测试后只清理该 schema。前端执行 `node --test tools/tests/analytics.test.cjs`。数据库不可达时后端集成测试不能完成。
