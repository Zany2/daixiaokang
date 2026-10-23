-- 评论与留言表完整建表脚本（PostgreSQL）。
-- 与 backend/models 中的当前 SQLAlchemy 模型保持一致。
-- 仅用于创建缺失的表、索引和注释，不负责迁移已有旧表结构。

BEGIN;

CREATE TABLE IF NOT EXISTS article_comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    article_key VARCHAR(128) NOT NULL,
    parent_id BIGINT,
    root_id BIGINT,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(254),
    client_ip VARCHAR(45),
    user_agent VARCHAR(1024),
    content TEXT NOT NULL,
    status SMALLINT DEFAULT 1 NOT NULL,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_article_comments PRIMARY KEY (id),
    CONSTRAINT uq_article_comments_id_article_key UNIQUE (id, article_key),
    CONSTRAINT fk_article_comments_parent_article
        FOREIGN KEY (parent_id, article_key)
        REFERENCES article_comments (id, article_key)
        ON DELETE RESTRICT,
    CONSTRAINT fk_article_comments_root_article
        FOREIGN KEY (root_id, article_key)
        REFERENCES article_comments (id, article_key)
        ON DELETE RESTRICT,
    CONSTRAINT ck_article_comments_status_valid
        CHECK (status IN (0, 1, 2)),
    CONSTRAINT ck_article_comments_article_key_not_blank
        CHECK (char_length(btrim(article_key, E' \t\n\r')) > 0),
    CONSTRAINT ck_article_comments_nickname_not_blank
        CHECK (char_length(btrim(nickname, E' \t\n\r')) > 0),
    CONSTRAINT ck_article_comments_content_length
        CHECK (
            char_length(content) <= 2000
            AND char_length(btrim(content, E' \t\n\r')) > 0
        ),
    CONSTRAINT ck_article_comments_reply_links_paired
        CHECK (
            (parent_id IS NULL AND root_id IS NULL)
            OR (parent_id IS NOT NULL AND root_id IS NOT NULL)
        ),
    CONSTRAINT ck_article_comments_parent_not_self
        CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT ck_article_comments_root_not_self
        CHECK (root_id IS NULL OR root_id <> id)
);

CREATE INDEX IF NOT EXISTS ix_article_comments_public_roots
    ON article_comments (article_key, created_at DESC, id DESC)
    WHERE status = 1 AND deleted_at IS NULL AND parent_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_article_comments_public_replies
    ON article_comments (root_id, created_at, id)
    WHERE status = 1 AND deleted_at IS NULL AND root_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_article_comments_parent_id
    ON article_comments (parent_id);

CREATE INDEX IF NOT EXISTS ix_article_comments_root_id
    ON article_comments (root_id);

CREATE INDEX IF NOT EXISTS ix_article_comments_moderation
    ON article_comments (status, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

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

CREATE TABLE IF NOT EXISTS guestbook_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(254),
    client_ip VARCHAR(45),
    user_agent VARCHAR(1024),
    content TEXT NOT NULL,
    status SMALLINT DEFAULT 1 NOT NULL,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_guestbook_messages PRIMARY KEY (id),
    CONSTRAINT ck_guestbook_messages_status_valid
        CHECK (status IN (0, 1, 2)),
    CONSTRAINT ck_guestbook_messages_nickname_not_blank
        CHECK (char_length(btrim(nickname, E' \t\n\r')) > 0),
    CONSTRAINT ck_guestbook_messages_content_length
        CHECK (
            char_length(content) <= 2000
            AND char_length(btrim(content, E' \t\n\r')) > 0
        )
);

CREATE INDEX IF NOT EXISTS ix_guestbook_messages_public_list
    ON guestbook_messages (created_at DESC, id DESC)
    WHERE status = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_guestbook_messages_moderation
    ON guestbook_messages (status, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

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
