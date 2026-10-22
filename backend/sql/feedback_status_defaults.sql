-- 已存在表的默认值补丁，不修改历史记录的审核状态。
BEGIN;

ALTER TABLE article_comments ALTER COLUMN status SET DEFAULT 1;
ALTER TABLE guestbook_messages ALTER COLUMN status SET DEFAULT 1;

COMMENT ON COLUMN article_comments.status IS '审核状态：0 待审核、1 已通过、2 已拒绝；默认 1，公开列表仅展示已通过记录';
COMMENT ON COLUMN guestbook_messages.status IS '审核状态：0 待审核、1 已通过、2 已拒绝；默认 1，公开列表仅展示已通过记录';

COMMIT;
