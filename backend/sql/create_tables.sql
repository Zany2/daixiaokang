-- Zany 后端全部业务表的完整建表脚本（PostgreSQL 16）。
-- 作为业务表结构定义基准，backend/models 中的 SQLAlchemy 模型应与本文件保持一致。
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

COMMENT ON INDEX ix_article_comments_public_roots IS '按文章、创建时间和 ID 倒序查询已通过且未删除的顶层评论';
COMMENT ON INDEX ix_article_comments_public_replies IS '按顶层评论、创建时间和 ID 正序查询已通过且未删除的楼中楼回复';
COMMENT ON INDEX ix_article_comments_parent_id IS '按直接父评论 ID 查询回复并支持父评论外键检查';
COMMENT ON INDEX ix_article_comments_root_id IS '按顶层评论 ID 聚合回复并支持顶层评论外键检查';
COMMENT ON INDEX ix_article_comments_moderation IS '按审核状态和创建时间查询未删除评论，供后台审核列表使用';

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

COMMENT ON INDEX ix_guestbook_messages_public_list IS '按创建时间和 ID 倒序查询已通过且未删除的公开留言';
COMMENT ON INDEX ix_guestbook_messages_moderation IS '按审核状态和创建时间查询未删除留言，供后台审核列表使用';

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    access_token_hash VARCHAR(64) NOT NULL,
    title VARCHAR(200),
    model VARCHAR(100) NOT NULL,
    system_prompt_version VARCHAR(50) DEFAULT 'v1' NOT NULL,
    status SMALLINT DEFAULT 1 NOT NULL,
    client_ip VARCHAR(45),
    user_agent VARCHAR(1024),
    last_message_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() + INTERVAL '24 hours') NOT NULL,
    closed_at TIMESTAMP WITHOUT TIME ZONE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_ai_conversations PRIMARY KEY (id),
    CONSTRAINT uq_ai_conversations_access_token_hash UNIQUE (access_token_hash),
    CONSTRAINT ck_ai_conversations_access_token_hash_valid
        CHECK (
            char_length(access_token_hash) = 64
            AND access_token_hash ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT ck_ai_conversations_title_not_blank
        CHECK (
            title IS NULL
            OR char_length(btrim(title, E' \t\n\r')) > 0
        ),
    CONSTRAINT ck_ai_conversations_model_not_blank
        CHECK (char_length(btrim(model, E' \t\n\r')) > 0),
    CONSTRAINT ck_ai_conversations_system_prompt_version_not_blank
        CHECK (char_length(btrim(system_prompt_version, E' \t\n\r')) > 0),
    CONSTRAINT ck_ai_conversations_status_valid
        CHECK (status IN (1, 2)),
    CONSTRAINT ck_ai_conversations_status_closed_at
        CHECK (
            (status = 1 AND closed_at IS NULL)
            OR (status = 2 AND closed_at IS NOT NULL)
        ),
    CONSTRAINT ck_ai_conversations_time_order
        CHECK (
            updated_at >= created_at
            AND last_message_at >= created_at
            AND expires_at >= last_message_at
            AND (closed_at IS NULL OR closed_at >= created_at)
            AND (deleted_at IS NULL OR deleted_at >= created_at)
        )
);

CREATE INDEX IF NOT EXISTS ix_ai_conversations_active_last_message
    ON ai_conversations (last_message_at DESC, id)
    WHERE status = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_ai_conversations_active_expiration
    ON ai_conversations (expires_at, id)
    WHERE status = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_ai_conversations_created_at
    ON ai_conversations (created_at DESC, id);

CREATE INDEX IF NOT EXISTS ix_ai_conversations_client_ip_created_at
    ON ai_conversations (client_ip, created_at DESC, id)
    WHERE client_ip IS NOT NULL;

COMMENT ON TABLE ai_conversations IS 'AI 对话会话表：每条记录标识一批连续对话，保存匿名会话访问凭证、模型、状态、客户端信息和生命周期时间';
COMMENT ON COLUMN ai_conversations.id IS 'AI 会话主键，UUID；使用首轮随机问答 ID 或由后端生成，用于关联同一批完整对话并恢复创建请求，避免连续整数被遍历';
COMMENT ON COLUMN ai_conversations.access_token_hash IS '会话访问凭证明文的 SHA-256 小写十六进制摘要，固定 64 字符；仅保存摘要，不得保存或返回凭证明文';
COMMENT ON COLUMN ai_conversations.title IS '会话标题，选填，最多 200 字符；可由第一条用户问题截取或后续生成，仅用于后台识别';
COMMENT ON COLUMN ai_conversations.model IS '本会话默认使用的模型名称，最多 100 字符；由后端配置决定，前端不得覆盖';
COMMENT ON COLUMN ai_conversations.system_prompt_version IS '系统提示词版本，默认 v1；用于追溯该会话使用的后端提示词规则，不保存前端传入的 system 消息';
COMMENT ON COLUMN ai_conversations.status IS '会话状态：1 活跃、2 已结束；默认 1，已结束会话不能继续追加消息';
COMMENT ON COLUMN ai_conversations.client_ip IS '创建会话时的客户端 IP，支持 IPv4/IPv6，最多 45 字符；由后端从可信代理处理后的请求地址获取，仅后台可见';
COMMENT ON COLUMN ai_conversations.user_agent IS '创建会话时的 User-Agent，最多 1024 字符；用于识别浏览器和操作系统，仅后台可见且不作为身份凭证';
COMMENT ON COLUMN ai_conversations.last_message_at IS '最后一条用户或助手消息的时间，TIMESTAMP 不带时区；创建时默认当前时间，新增消息后由后端更新';
COMMENT ON COLUMN ai_conversations.expires_at IS '会话过期时间，TIMESTAMP 不带时区；默认创建后 24 小时，每次有效对话后由后端顺延，过期会话不得继续';
COMMENT ON COLUMN ai_conversations.closed_at IS '会话结束时间，TIMESTAMP 不带时区；活跃会话为空，点击新对话或会话过期后写入';
COMMENT ON COLUMN ai_conversations.deleted_at IS '软删除时间，TIMESTAMP 不带时区；当前前端不提供清空功能，保留给后台清理或后续数据管理';
COMMENT ON COLUMN ai_conversations.created_at IS '会话创建时间，TIMESTAMP 不带时区；在用户首次发送问题时由数据库生成';
COMMENT ON COLUMN ai_conversations.updated_at IS '会话最后修改时间，TIMESTAMP 不带时区；插入时默认当前时间，状态或最后消息发生变化时由后端更新';

COMMENT ON CONSTRAINT pk_ai_conversations ON ai_conversations IS 'AI 会话表 UUID 主键约束';
COMMENT ON CONSTRAINT uq_ai_conversations_access_token_hash ON ai_conversations IS '保证每个会话访问凭证摘要唯一';
COMMENT ON CONSTRAINT ck_ai_conversations_access_token_hash_valid ON ai_conversations IS '访问凭证摘要必须是 64 位小写十六进制 SHA-256 字符串';
COMMENT ON CONSTRAINT ck_ai_conversations_title_not_blank ON ai_conversations IS '会话标题允许为空，但填写后不能仅包含空白';
COMMENT ON CONSTRAINT ck_ai_conversations_model_not_blank ON ai_conversations IS '模型名称不能仅包含空白';
COMMENT ON CONSTRAINT ck_ai_conversations_system_prompt_version_not_blank ON ai_conversations IS '系统提示词版本不能仅包含空白';
COMMENT ON CONSTRAINT ck_ai_conversations_status_valid ON ai_conversations IS '会话状态只允许活跃或已结束';
COMMENT ON CONSTRAINT ck_ai_conversations_status_closed_at ON ai_conversations IS '活跃状态不得填写结束时间，结束状态必须填写结束时间';
COMMENT ON CONSTRAINT ck_ai_conversations_time_order ON ai_conversations IS '保证会话更新时间、最后消息时间、过期时间、结束时间和删除时间不早于其前置时间';

COMMENT ON INDEX ix_ai_conversations_active_last_message IS '按最后消息时间倒序查询未删除的活跃 AI 会话';
COMMENT ON INDEX ix_ai_conversations_active_expiration IS '扫描已到期且尚未关闭的 AI 会话';
COMMENT ON INDEX ix_ai_conversations_created_at IS '按创建时间倒序查询全部 AI 会话';
COMMENT ON INDEX ix_ai_conversations_client_ip_created_at IS '按客户端 IP 和创建时间查询会话，用于后台审计及用量分析';

CREATE TABLE IF NOT EXISTS ai_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    conversation_id UUID NOT NULL,
    turn_id UUID NOT NULL,
    sequence_no INTEGER NOT NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT DEFAULT '' NOT NULL,
    status SMALLINT DEFAULT 2 NOT NULL,
    model VARCHAR(100),
    finish_reason VARCHAR(50),
    prompt_tokens INTEGER DEFAULT 0 NOT NULL,
    completion_tokens INTEGER DEFAULT 0 NOT NULL,
    error_code VARCHAR(100),
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_ai_messages PRIMARY KEY (id),
    CONSTRAINT fk_ai_messages_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES ai_conversations (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_ai_messages_conversation_sequence
        UNIQUE (conversation_id, sequence_no),
    CONSTRAINT uq_ai_messages_conversation_turn_role
        UNIQUE (conversation_id, turn_id, role),
    CONSTRAINT ck_ai_messages_sequence_positive
        CHECK (sequence_no > 0),
    CONSTRAINT ck_ai_messages_role_valid
        CHECK (role IN ('user', 'assistant')),
    CONSTRAINT ck_ai_messages_status_valid
        CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT ck_ai_messages_user_state_valid
        CHECK (role <> 'user' OR status = 2),
    CONSTRAINT ck_ai_messages_user_content_valid
        CHECK (
            role <> 'user'
            OR (
                char_length(content) <= 1000
                AND char_length(btrim(content, E' \t\n\r')) > 0
            )
        ),
    CONSTRAINT ck_ai_messages_assistant_content_valid
        CHECK (
            role <> 'assistant'
            OR status <> 2
            OR char_length(btrim(content, E' \t\n\r')) > 0
        ),
    CONSTRAINT ck_ai_messages_model_role_valid
        CHECK (
            (role = 'user' AND model IS NULL)
            OR (
                role = 'assistant'
                AND model IS NOT NULL
                AND char_length(btrim(model, E' \t\n\r')) > 0
            )
        ),
    CONSTRAINT ck_ai_messages_token_counts_valid
        CHECK (
            prompt_tokens >= 0
            AND completion_tokens >= 0
            AND (
                role <> 'user'
                OR (prompt_tokens = 0 AND completion_tokens = 0)
            )
        ),
    CONSTRAINT ck_ai_messages_completion_time_valid
        CHECK (
            (status = 1 AND completed_at IS NULL)
            OR (status IN (2, 3, 4) AND completed_at IS NOT NULL)
        ),
    CONSTRAINT ck_ai_messages_time_order
        CHECK (
            updated_at >= created_at
            AND (completed_at IS NULL OR completed_at >= created_at)
            AND (deleted_at IS NULL OR deleted_at >= created_at)
        )
);

CREATE INDEX IF NOT EXISTS ix_ai_messages_visible_history
    ON ai_messages (conversation_id, sequence_no)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_ai_messages_generating
    ON ai_messages (created_at, id)
    WHERE status = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_ai_messages_created_at
    ON ai_messages (created_at DESC, id DESC);

COMMENT ON TABLE ai_messages IS 'AI 对话消息表：按会话和顺序保存用户提问及大模型回答，可完整还原每批对话并记录生成状态和 Token 用量';
COMMENT ON COLUMN ai_messages.id IS 'AI 消息主键，BIGINT 自增；由数据库自动生成，仅供后端内部关联和分页';
COMMENT ON COLUMN ai_messages.conversation_id IS '所属 AI 会话 UUID，关联 ai_conversations.id；同一值下的消息组成一批完整对话';
COMMENT ON COLUMN ai_messages.turn_id IS '单轮问答 UUID，由前端每次发送时生成；同一问题和对应回答使用相同值，同时用于请求幂等防重';
COMMENT ON COLUMN ai_messages.sequence_no IS '消息在会话内的顺序号，从 1 开始严格递增；按此字段升序即可还原完整对话';
COMMENT ON COLUMN ai_messages.role IS '消息角色：user 用户提问、assistant 大模型回答；系统提示词由后端运行时加入且不作为普通消息保存';
COMMENT ON COLUMN ai_messages.content IS '消息正文；用户提问必填且最多 1000 字符，助手正常完成的回答不能为空，生成中或失败时允许为空';
COMMENT ON COLUMN ai_messages.status IS '消息状态：1 生成中、2 已完成、3 已停止、4 失败；用户消息固定为 2，助手消息按生成过程更新';
COMMENT ON COLUMN ai_messages.model IS '生成助手回答所使用的模型名称，最多 100 字符；用户消息必须为空，助手消息必须填写';
COMMENT ON COLUMN ai_messages.finish_reason IS '上游模型结束原因，最多 50 字符，例如 stop、length；生成中或请求失败时可以为空';
COMMENT ON COLUMN ai_messages.prompt_tokens IS '本轮模型请求消耗的输入 Token 数；记录在助手消息上，用户消息固定为 0，未知时为 0';
COMMENT ON COLUMN ai_messages.completion_tokens IS '本轮模型回答消耗的输出 Token 数；记录在助手消息上，用户消息固定为 0，未知时为 0';
COMMENT ON COLUMN ai_messages.error_code IS '生成失败时的内部错误代码，最多 100 字符；不得保存 API Key、异常堆栈或其他敏感信息';
COMMENT ON COLUMN ai_messages.completed_at IS '消息结束处理时间，TIMESTAMP 不带时区；生成中为空，完成、停止或失败时必须填写';
COMMENT ON COLUMN ai_messages.deleted_at IS '消息软删除时间，TIMESTAMP 不带时区；当前前端不提供清空功能，保留给后台清理或后续数据管理';
COMMENT ON COLUMN ai_messages.created_at IS '消息创建时间，TIMESTAMP 不带时区；插入时默认由数据库生成当前时间';
COMMENT ON COLUMN ai_messages.updated_at IS '消息最后修改时间，TIMESTAMP 不带时区；流式回答结束、停止或失败后由后端更新';

COMMENT ON CONSTRAINT pk_ai_messages ON ai_messages IS 'AI 消息表 BIGINT 自增主键约束';
COMMENT ON CONSTRAINT fk_ai_messages_conversation ON ai_messages IS '消息必须属于有效会话；物理清理会话时级联清理其消息，普通业务使用软删除';
COMMENT ON CONSTRAINT uq_ai_messages_conversation_sequence ON ai_messages IS '同一会话内的消息顺序号必须唯一';
COMMENT ON CONSTRAINT uq_ai_messages_conversation_turn_role ON ai_messages IS '同一轮问答中每种角色最多一条消息，防止重复请求写入重复问题或回答';
COMMENT ON CONSTRAINT ck_ai_messages_sequence_positive ON ai_messages IS '会话内消息顺序号必须为正整数';
COMMENT ON CONSTRAINT ck_ai_messages_role_valid ON ai_messages IS '消息角色只允许用户或助手';
COMMENT ON CONSTRAINT ck_ai_messages_status_valid ON ai_messages IS '消息状态只允许生成中、已完成、已停止或失败';
COMMENT ON CONSTRAINT ck_ai_messages_user_state_valid ON ai_messages IS '用户提问写入后即为已完成状态';
COMMENT ON CONSTRAINT ck_ai_messages_user_content_valid ON ai_messages IS '用户提问不能仅包含空白且最多 1000 字符';
COMMENT ON CONSTRAINT ck_ai_messages_assistant_content_valid ON ai_messages IS '助手正常完成的回答不能为空，生成中、停止或失败记录允许没有正文';
COMMENT ON CONSTRAINT ck_ai_messages_model_role_valid ON ai_messages IS '用户消息不记录模型，助手消息必须记录非空模型名称';
COMMENT ON CONSTRAINT ck_ai_messages_token_counts_valid ON ai_messages IS 'Token 数不能为负数，用户消息不单独记录 Token 用量';
COMMENT ON CONSTRAINT ck_ai_messages_completion_time_valid ON ai_messages IS '生成中消息不能填写结束时间，其他状态必须填写结束时间';
COMMENT ON CONSTRAINT ck_ai_messages_time_order ON ai_messages IS '保证消息更新时间、结束时间和删除时间不早于创建时间';

COMMENT ON INDEX ix_ai_messages_visible_history IS '按顺序读取指定会话未删除的完整消息历史，用于恢复界面和组装模型上下文';
COMMENT ON INDEX ix_ai_messages_generating IS '扫描长时间停留在生成中状态的助手消息，便于异常恢复任务将其标记为失败';
COMMENT ON INDEX ix_ai_messages_created_at IS '按创建时间倒序查询全部 AI 消息，用于后台审计和用量统计';

-- 自建网站统计：匿名浏览器摘要，不保存原始 IP、完整来源 URL 或查询参数。
CREATE TABLE IF NOT EXISTS site_visits (
    event_id UUID NOT NULL,
    visitor VARCHAR(64) NOT NULL,
    path VARCHAR(1024) NOT NULL,
    source VARCHAR(32) NOT NULL,
    province VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT pk_site_visits PRIMARY KEY (event_id)
);
CREATE INDEX IF NOT EXISTS ix_site_visits_time_visitor ON site_visits (created_at, visitor);

COMMIT;
