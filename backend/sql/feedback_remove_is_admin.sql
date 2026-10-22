-- 从已存在的评论表移除管理员身份标记，保留其他字段及评论内容。
BEGIN;

ALTER TABLE article_comments DROP COLUMN IF EXISTS is_admin;

COMMIT;
