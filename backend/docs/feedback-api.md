# 评论与留言接口

接口前缀为 `/api`，创建请求使用 `Content-Type: application/json`。

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| POST | `/api/comments` | 创建根评论或楼中楼回复 |
| GET | `/api/comments` | 查询根评论，附带每层前 3 条回复 |
| GET | `/api/comments/{root_id}/replies` | 分页加载指定楼层的回复 |
| POST | `/api/messages` | 创建独立留言 |
| GET | `/api/messages` | 普通分页查询留言 |

目前无删除、审批接口。列表仅展示 `status=1` 且未软删除的记录，创建记录使用数据库默认状态 `1`（已通过）。

## 创建评论与回复

`POST /api/comments`：

```json
{
  "article_key": "be17033b",
  "nickname": "访客",
  "email": "visitor@example.com",
  "content": "这篇文章很有帮助"
}
```

- `article_key`：必填，1～128 字符，使用文章固定 abbrlink，不含域名。
- `nickname`：必填，1～50 字符。
- `email`：选填，最多 254 字符，空字符串等同于未填写；检查基本格式，不查询邮箱是否存在。
- `content`：必填，1～2000 字符，纯文本，保留内部换行。前端展示时应转义文本。
- `parent_id`：选填，正 BIGINT；不传或传 `null` 时创建根评论，回复时传被回复评论的 ID。

字符串去除首尾空白后校验。`root_id` 由后端从父评论推导，支持回复其他回复。父评论必须属于当前文章且公开可访问，所属根评论也必须可访问。

不接受 `id`、`root_id`、`status`、`client_ip`、`user_agent` 等额外字段。IP 和 User-Agent 从请求中获取；ID 由数据库生成。

成功返回 `201`：

```json
{
  "id": 100,
  "nickname": "访客",
  "content": "这篇文章很有帮助",
  "created_at": "2026-10-13T12:00:00",
  "updated_at": "2026-10-13T12:00:00",
  "article_key": "be17033b",
  "parent_id": null,
  "root_id": null,
  "reply_to_nickname": null
}
```

回复时 `parent_id`、`root_id` 有值，`reply_to_nickname` 是被回复者的昵称。若查询时父评论已不可公开访问，该昵称返回 `null`。

## 根评论列表

`GET /api/comments?article_key=be17033b&page=1&page_size=30`

- `article_key` 必填。
- `page` 默认 1，范围 1～1000000，前端使用页码、上一页和下一页查询。
- `page_size` 默认 30，范围 1～30。
- `total`、`total_pages` 统计公开根评论，不将楼中楼回复计入根列表页数。
- 保留 `cursor` 兼容旧调用；使用游标时 `page` 保持默认 1，响应的 `page` 为 `null`。不能同时指定游标与大于 1 的页码。

根评论按 `created_at DESC, id DESC` 排列；每条根评论附带最多 3 条公开回复，回复按 `created_at ASC, id ASC` 排列。

```json
{
  "items": [
    {
      "id": 100,
      "nickname": "访客",
      "content": "根评论",
      "created_at": "2026-10-13T12:00:00",
      "updated_at": "2026-10-13T12:00:00",
      "article_key": "be17033b",
      "parent_id": null,
      "root_id": null,
      "reply_to_nickname": null,
      "replies": [],
      "has_more_replies": false,
      "next_reply_cursor": null
    }
  ],
  "page": 1,
  "page_size": 30,
  "total": 1,
  "total_pages": 1,
  "has_more": false,
  "next_cursor": null
}
```

根评论按 `page` 查询，通过 `total_pages` 展示页码及省略号。`has_more` 与 `next_cursor` 保留给旧调用。每层的 `has_more_replies` 为 true 时展示“查看更多回复”；点击后请求回复接口，使用该楼层的 `next_reply_cursor` 从已展示的第 3 条之后继续。

数据库回源时，在同一条 SQL 中读取根评论总数及最多 31 条根记录，避免并发新增造成总数与列表不一致，空页也会返回总数。回复预览通过另一次 UNION ALL 查询，为本页每个楼层分别在数据库中 LIMIT 4，再返回前 3 条。非空根评论页共执行两次查询，不将全部回复拉回 Python 后截断，也不计算全部回复总数。默认参数第一页命中 Redis 缓存时不查询数据库。首次最多返回 30 条根评论加 90 条回复。

## 点击加载更多回复

`GET /api/comments/100/replies?page_size=10&cursor=<next_reply_cursor>`

- `root_id`：路径中的顶层评论 ID，正 BIGINT。
- `page_size`：默认 10，范围 1～30。
- `cursor`：从回复预览或上一次回复查询返回的游标。省略时从该楼层第一条回复开始。

返回 `items`、`page_size`、`has_more`、`next_cursor`，其中 `items` 为评论对象列表。按 `root_id` 查询全部层级的回复，`parent_id` 用于显示“回复某某”。每次仅取 `page_size + 1` 条，利用额外一条判断是否还有下一页。

收到 `has_more=false` 时隐藏“查看更多”按钮。根评论已删除、未通过，或传入的是回复 ID 而非根评论 ID 时返回 `404`。

游标按列表类型及文章/楼层绑定，使用创建时间和 ID 定位；跨文章、跨楼层或损坏的游标返回 `400`。游标不提供跳到指定页号的功能。不要将新发表的回复同时无条件插入分页数组和再次通过游标追加，前端可按 ID 去重。

## 创建留言

`POST /api/messages`：

```json
{
  "nickname": "访客",
  "email": "visitor@example.com",
  "content": "网站很棒，期待更多文章"
}
```

填写项和校验与评论相同，但不接受 `article_key`、`parent_id` 或 `root_id`。成功返回 `201`，包含 `id`、`nickname`、`content`、`created_at`、`updated_at`。

## 留言分页列表

`GET /api/messages?page=1&page_size=30`

- `page` 默认 1，范围 1～1000000。
- `page_size` 默认 30，范围 1～100。
- 按 `created_at DESC, id DESC` 排列。

```json
{
  "items": [],
  "page": 1,
  "page_size": 30,
  "total": 0,
  "total_pages": 0,
  "has_more": false
}
```

留言不包含回复列表。`total` 为公开留言数量，总数和分页记录由同一条 SQL 读取；超出末页时仍返回实际总数和空列表。页号分页在有新留言插入时可能发生位置变化，前端刷新后从第一页重新读取。

## 响应与部署

- 创建成功为 `201`，查询成功为 `200`。
- `400`：分页游标无效或属于其他列表。
- `404`：被回复评论、顶层评论不存在或不可公开访问。
- `409`：既有评论的回复关联异常。
- `422`：参数缺失、越界、格式错误或包含禁止提交的字段。
- `429`：同一 IP 操作频率超限，`Retry-After` 为剩余等待秒数。
- `503`：发表限流暂不可用或数据库查询并发已满，`Retry-After` 为建议等待秒数。
- 公开响应均不含邮箱、IP、User-Agent、审核状态和软删除时间。
- 时间格式不附带 `Z` 或时区偏移。
- 通过 Nginx 等代理部署时，为 Uvicorn 配置可信代理，使 ASGI 客户端地址能反映真实访客；应用不直接采信用户传入的转发请求头。

## 限流与缓存规则

| 范围 | 默认规则 |
| --- | --- |
| 根评论、回复、留言创建 | 同一 IP 任意连续 10 秒内只接受一次创建请求，三个入口共享额度 |
| 根评论、回复、留言查询 | 同一 IP 任意连续 60 秒内最多 120 次查询，三个入口共享额度，缓存命中也计数 |
| 文章评论第一页 | 仅 `page=1`、`page_size=30` 且不传 cursor 时缓存 30 秒，包含根评论总数和每层 3 条回复预览 |
| 留言分页 | 仅 `page_size=30` 且 page 为 1、2、3 时缓存 30 秒 |
| 更多回复、评论后续页、兼容游标、自定义页大小 | 不缓存，按数据库索引和限定条数查询 |

请求体格式错误时返回 `422`，不会占用创建额度。进入业务处理后，额度在 10 秒过期前不返还，即使被回复评论不存在等业务校验失败。`Retry-After` 已通过 CORS 暴露，前端可读取后显示倒计时。

发表成功后，后端先提交数据库事务，再切换相关缓存版本。创建评论或回复只影响对应文章；创建留言使前 3 页同时失效。下一次查询使用新版本，避免较早的查询将旧结果回写到新缓存。响应设置 `Cache-Control: no-store`，浏览器不额外缓存列表。

前端可用创建成功返回的对象立即展示自己的内容，并按 ID 去重。根评论及留言按最新在前；新回复按时间正序，可能不在该楼层的前 3 条预览中，这与缓存失效无关。

Redis 不可用时暂停发表，返回 `503`；查询使用进程内临时限流并跳过缓存。每个 worker 的数据库读取并发默认上限为 10，等待超过 1 秒返回 `503`。如果事务已经提交、仅缓存失效失败，仍返回发表成功，记录日志并由缓存 TTL 兜底。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `FEEDBACK_RATE_LIMIT_ENABLED` | true | 开启共享限流 |
| `FEEDBACK_WRITE_INTERVAL_SECONDS` | 10 | 同一 IP 创建间隔 |
| `FEEDBACK_READ_REQUESTS_PER_MINUTE` | 120 | 连续 60 秒查询额度 |
| `FEEDBACK_CACHE_ENABLED` | true | 开启热点缓存 |
| `FEEDBACK_CACHE_TTL_SECONDS` | 30 | 缓存有效秒数 |
| `FEEDBACK_CACHE_LOCK_SECONDS` | 3 | 重建锁有效秒数 |
| `FEEDBACK_CACHE_WAIT_MS` | 200 | 其他请求等待重建结果的最长毫秒数 |
| `FEEDBACK_DATABASE_READ_CONCURRENCY` | 10 | 每个 worker 的回源读取并发上限 |
| `FEEDBACK_DATABASE_READ_WAIT_SECONDS` | 1 | 等待并发槽位的最长秒数 |
| `REDIS_OPERATION_TIMEOUT_SECONDS` | 0.5 | Redis 单次操作超时秒数 |

启动仍由现有数据库/Redis 生命周期管理负责。已有表需要先迁移到当前模型结构，自动建表只补缺失表。前端文章评论区和留言板已接入这些接口；修改分页接口后需要同时重启前后端。
