-- 评论与留言展示用模拟数据（PostgreSQL）。请在 daixiaokang_website 中执行整个文件。
-- 前提：已创建当前版本的 article_comments、guestbook_messages 表。
-- 新增 240 条留言、240 条根评论、38 条回复，全部已通过，评论关联 be17033b。
-- 每页 30 条时有 8 页，可查看页码省略号；前 5 条根评论分别有 0/1/3/8/26 条回复。
-- 只插入缺失的模拟记录，可重复执行；不修改已有记录，不在应用启动时自动导入。
-- 直接写库不会主动失效 Redis 缓存，导入后请等待缓存 TTL（默认 30 秒）再刷新。

BEGIN;

-- 防止同一脚本同时执行产生重复模拟记录；事务结束自动释放。
SELECT pg_advisory_xact_lock(170330013, 1);

DO $seed$
DECLARE
    v_article_key CONSTANT text := 'be17033b';
    v_prefix CONSTANT text := 'ZanyFeedbackMock/1';
    v_now timestamp := LOCALTIMESTAMP(0);
    v_time timestamp;
    v_root_id bigint;
    v_first_reply_id bigint;
    v_reply_id bigint;
    v_parent_id bigint;
    v_tag text;
    v_content text;
    v_reply_count integer;
    i integer;
    j integer;
    v_names text[] := ARRAY['山间清风', '小橘同学', '路过的开发者', '星河', '一只团子', '晚风与代码', '拾光', '南方来信'];
    v_messages text[] := ARRAY[
        '路过这里，留下一个脚印。祝今天也有好心情！',
        E'页面很舒服，收藏啦。\n希望以后能看到更多日常分享。',
        '手机上来逛一逛，看看留言列表和分页按钮的显示效果 📱✨',
        '喜欢这里的背景和配色，期待下一次更新。',
        E'一个小建议：\n可以分享一下建站过程，以及你最喜欢的开发工具。\n谢谢分享！',
        '周末快乐，愿每一次打开编辑器都有新的收获 ☕',
        '这是一条稍长的留言。' || repeat('从设计到实现，每一个细节都值得慢慢打磨。希望这里能记录学习中的收获，也记录生活中那些轻松的小事。', 8),
        '纯文本显示示例：<b>你好 Zany</b> & keep learning，标点与标签应按原文展示。'
    ];
    v_comments text[] := ARRAY[
        '这篇文章整理得很清楚，先收藏，再跟着实践一遍。',
        E'记录一下我的阅读笔记：\n1. 先理解整体流程。\n2. 再拆分具体步骤。\n3. 最后对照自己的项目尝试。',
        '有一个问题：如果放到自己的项目里，这个方案需要注意哪些边界情况？',
        '实践之后回来反馈，整体思路很有帮助，感谢分享 👍',
        '想听听大家的不同做法，欢迎在这条评论下面交流。',
        '从手机端读完了，段落和代码说明都很清晰。',
        '补充一点个人理解：' || repeat('方案选择可以结合实际需求，先把基础流程跑通，再逐步完善异常处理和交互细节。', 10),
        E'短评：学到了！🎉\n继续期待后续内容。'
    ];
BEGIN
    FOR i IN 1..240 LOOP
        v_time := v_now - i * interval '10 minutes';
        v_tag := v_prefix || '/message/' || i;
        v_content := '[模拟留言 ' || lpad(i::text, 3, '0') || '] ' || v_messages[1 + (i - 1) % array_length(v_messages, 1)];

        INSERT INTO guestbook_messages (
            nickname, email, client_ip, user_agent, content, status, created_at, updated_at
        )
        SELECT
            v_names[1 + (i - 1) % array_length(v_names, 1)],
            CASE WHEN i % 3 = 0 THEN NULL ELSE 'mock' || i || '@example.com' END,
            '192.0.2.20', v_tag, v_content, 1, v_time, v_time
        WHERE NOT EXISTS (
            SELECT 1 FROM guestbook_messages WHERE user_agent = v_tag
        );

        v_tag := v_prefix || '/' || v_article_key || '/root/' || i;
        SELECT id, created_at INTO v_root_id, v_time
        FROM article_comments
        WHERE article_key = v_article_key AND user_agent = v_tag
        ORDER BY id LIMIT 1;

        IF v_root_id IS NULL THEN
            v_time := v_now - i * interval '10 minutes';
            v_content := '[模拟评论 ' || lpad(i::text, 3, '0') || '] ' || v_comments[1 + (i - 1) % array_length(v_comments, 1)];
            INSERT INTO article_comments (
                article_key, nickname, email, client_ip, user_agent,
                content, status, created_at, updated_at
            ) VALUES (
                v_article_key, v_names[1 + (i - 1) % array_length(v_names, 1)],
                NULL, '2001:db8::20', v_tag, v_content, 1, v_time, v_time
            ) RETURNING id INTO v_root_id;
        END IF;

        v_reply_count := CASE i WHEN 2 THEN 1 WHEN 3 THEN 3 WHEN 4 THEN 8 WHEN 5 THEN 26 ELSE 0 END;
        v_first_reply_id := NULL;
        FOR j IN 1..v_reply_count LOOP
            v_tag := v_prefix || '/' || v_article_key || '/root/' || i || '/reply/' || j;
            SELECT id INTO v_reply_id FROM article_comments
            WHERE article_key = v_article_key AND user_agent = v_tag
            ORDER BY id LIMIT 1;

            IF v_reply_id IS NULL THEN
                -- 每第三条回复指向本楼第一条回复，用于查看“回复某人”；其余直接回复根评论。
                v_parent_id := CASE WHEN j % 3 = 0 THEN v_first_reply_id ELSE v_root_id END;
                v_content := '[模拟回复 ' || i || '-' || j || '] ' || CASE j % 4
                    WHEN 0 THEN E'我也试了一下，补充一个想法。\n可以把这个步骤单独拆出来，会更容易理解。'
                    WHEN 1 THEN '同感，感谢分享，交流之后思路更清楚了。'
                    WHEN 2 THEN '这个问题我也遇到过，期待更多经验分享 🙂'
                    ELSE '回复上面的朋友：可以先从最简单的场景开始尝试。'
                END;
                INSERT INTO article_comments (
                    article_key, parent_id, root_id, nickname, email, client_ip,
                    user_agent, content, status, created_at, updated_at
                ) VALUES (
                    v_article_key, v_parent_id, v_root_id,
                    v_names[1 + (i + j - 1) % array_length(v_names, 1)],
                    NULL, '192.0.2.21', v_tag, v_content, 1,
                    v_time + j * interval '10 seconds', v_time + j * interval '10 seconds'
                ) RETURNING id INTO v_reply_id;
            END IF;
            IF j = 1 THEN
                v_first_reply_id := v_reply_id;
            END IF;
        END LOOP;
    END LOOP;
END;
$seed$;

COMMIT;

-- 导入结果：仅统计本脚本的记录，不包含已有真实留言与评论。
SELECT '模拟留言' AS kind, count(*) AS total FROM guestbook_messages
WHERE user_agent LIKE 'ZanyFeedbackMock/1/message/%'
UNION ALL
SELECT '模拟根评论', count(*) FROM article_comments
WHERE article_key = 'be17033b' AND parent_id IS NULL
    AND user_agent LIKE 'ZanyFeedbackMock/1/be17033b/root/%'
UNION ALL
SELECT '模拟回复', count(*) FROM article_comments
WHERE article_key = 'be17033b' AND parent_id IS NOT NULL
    AND user_agent LIKE 'ZanyFeedbackMock/1/be17033b/root/%';
