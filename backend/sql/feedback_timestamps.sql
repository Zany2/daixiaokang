-- 仅用于已经创建的评论表和留言表；新表会按模型自动使用 TIMESTAMP。
-- 转换为 TIMESTAMP WITHOUT TIME ZONE，保留创建时间、更新时间和软删除时间。
-- 原字段带时区时，转换后的日期时间取决于当前 PostgreSQL 连接的 TimeZone。
-- 执行前请确认 SHOW TimeZone 的结果与后端连接一致；原字段已不带时区时值不变。
-- 本脚本不会更新字段注释，请随后执行 feedback_comments.sql。

BEGIN;

ALTER TABLE article_comments
    ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING created_at::TIMESTAMP WITHOUT TIME ZONE,
    ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING updated_at::TIMESTAMP WITHOUT TIME ZONE,
    ALTER COLUMN deleted_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING deleted_at::TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE guestbook_messages
    ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING created_at::TIMESTAMP WITHOUT TIME ZONE,
    ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING updated_at::TIMESTAMP WITHOUT TIME ZONE,
    ALTER COLUMN deleted_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING deleted_at::TIMESTAMP WITHOUT TIME ZONE;

COMMIT;
