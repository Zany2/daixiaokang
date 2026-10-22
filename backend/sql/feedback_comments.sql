-- 已存在表的注释补丁，仅更新注释，不修改字段或数据。
-- 请在两张表及以下引用的字段已存在的目标 PostgreSQL 数据库中手动执行。
-- 如果尚未添加来源字段，请先执行 feedback_request_metadata.sql。
-- 新建表时，SQLAlchemy 会根据模型自动写入同样的注释。

BEGIN;

COMMENT ON TABLE article_comments IS '文章评论表：保存文章详情页的顶层评论及楼中楼回复，支持审核与软删除';

COMMENT ON COLUMN article_comments.id IS '评论主键，BIGINT 自增；由数据库自动生成，不接受访客自行指定';

COMMENT ON COLUMN article_comments.article_key IS '文章固定标识，使用现有 abbrlink，不含域名；必填，最多 128 字符';

COMMENT ON COLUMN article_comments.parent_id IS '直接回复的评论 ID，BIGINT；顶层评论为空，回复必填，必须属于同一篇文章';

COMMENT ON COLUMN article_comments.root_id IS '所属顶层评论 ID，BIGINT，用于聚合楼中楼回复；顶层评论为空，回复必填，由后端确定';

COMMENT ON COLUMN article_comments.nickname IS '评论者昵称，公开展示；必填，不可仅包含空白，最多 50 字符';

COMMENT ON COLUMN article_comments.email IS '评论者邮箱，选填，最多 254 字符；仅后台可见，公开接口不得返回';

COMMENT ON COLUMN article_comments.client_ip IS '评论提交者 IP，支持 IPv4/IPv6，最多 45 字符；由后端从请求获取，仅后台可见';

COMMENT ON COLUMN article_comments.user_agent IS '提交请求的 User-Agent，包含浏览器、操作系统等客户端信息，最多 1024 字符；由后端读取请求头，仅后台可见';

COMMENT ON COLUMN article_comments.content IS '评论纯文本内容，保留换行；必填，不可仅包含空白，最多 2000 字符，展示时需转义';

COMMENT ON COLUMN article_comments.status IS '审核状态：0 待审核、1 已通过、2 已拒绝；默认 1，公开列表仅展示已通过记录';

COMMENT ON COLUMN article_comments.deleted_at IS '软删除时间，TIMESTAMP 不带时区；为空表示未删除，非空时不公开展示；删除顶层评论后应隐藏其回复';

COMMENT ON COLUMN article_comments.created_at IS '创建时间，TIMESTAMP 不带时区；插入时默认由数据库生成当前时间';

COMMENT ON COLUMN article_comments.updated_at IS '最后修改时间，TIMESTAMP 不带时区；插入时默认当前时间，SQLAlchemy 更新记录时自动更新';

COMMENT ON TABLE guestbook_messages IS '社交留言板表：保存独立留言，采用普通分页列表，不包含文章关联或楼中楼回复';

COMMENT ON COLUMN guestbook_messages.id IS '留言主键，BIGINT 自增；由数据库自动生成，不接受访客自行指定';

COMMENT ON COLUMN guestbook_messages.nickname IS '留言者昵称，公开展示；必填，不可仅包含空白，最多 50 字符';

COMMENT ON COLUMN guestbook_messages.email IS '留言者邮箱，选填，最多 254 字符；仅后台可见，公开接口不得返回';

COMMENT ON COLUMN guestbook_messages.client_ip IS '留言提交者 IP，支持 IPv4/IPv6，最多 45 字符；由后端从请求获取，仅后台可见';

COMMENT ON COLUMN guestbook_messages.user_agent IS '提交请求的 User-Agent，包含浏览器、操作系统等客户端信息，最多 1024 字符；由后端读取请求头，仅后台可见';

COMMENT ON COLUMN guestbook_messages.content IS '留言纯文本内容，保留换行；必填，不可仅包含空白，最多 2000 字符，展示时需转义';

COMMENT ON COLUMN guestbook_messages.status IS '审核状态：0 待审核、1 已通过、2 已拒绝；默认 1，公开列表仅展示已通过记录';

COMMENT ON COLUMN guestbook_messages.deleted_at IS '软删除时间，TIMESTAMP 不带时区；为空表示未删除，非空时不公开展示，保留记录供后台恢复';

COMMENT ON COLUMN guestbook_messages.created_at IS '创建时间，TIMESTAMP 不带时区；插入时默认由数据库生成当前时间';

COMMENT ON COLUMN guestbook_messages.updated_at IS '最后修改时间，TIMESTAMP 不带时区；插入时默认当前时间，SQLAlchemy 更新记录时自动更新';

COMMIT;
