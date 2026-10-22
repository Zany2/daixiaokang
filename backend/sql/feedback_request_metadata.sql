-- 已存在表的请求来源字段补丁；允许历史记录的字段值为空。
-- 仅增加 client_ip 和 user_agent，不采集或回填历史来源信息。

BEGIN;

ALTER TABLE article_comments
    ADD COLUMN IF NOT EXISTS client_ip VARCHAR(45),
    ADD COLUMN IF NOT EXISTS user_agent VARCHAR(1024);

ALTER TABLE guestbook_messages
    ADD COLUMN IF NOT EXISTS client_ip VARCHAR(45),
    ADD COLUMN IF NOT EXISTS user_agent VARCHAR(1024);

COMMENT ON COLUMN article_comments.client_ip IS '评论提交者 IP，支持 IPv4/IPv6，最多 45 字符；由后端从请求获取，仅后台可见';
COMMENT ON COLUMN article_comments.user_agent IS '提交请求的 User-Agent，包含浏览器、操作系统等客户端信息，最多 1024 字符；由后端读取请求头，仅后台可见';
COMMENT ON COLUMN guestbook_messages.client_ip IS '留言提交者 IP，支持 IPv4/IPv6，最多 45 字符；由后端从请求获取，仅后台可见';
COMMENT ON COLUMN guestbook_messages.user_agent IS '提交请求的 User-Agent，包含浏览器、操作系统等客户端信息，最多 1024 字符；由后端读取请求头，仅后台可见';

COMMIT;
