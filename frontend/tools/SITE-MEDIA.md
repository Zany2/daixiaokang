# 自有图片与视频

当前阶段使用项目内的静态图片和视频，不需要域名、OSS 或图床账号。保持 `site_media.base_url: ""`，执行 `npm run server` 后从本地开发服务器加载素材。

配置入口：`_config.fomalhaut.yml` 的 `site_media.base_url`。

当前素材共 35 组：PC `pc_01`～`pc_30`，手机 `home_mobile_01`～`home_mobile_05`。首页、文章封面、美化设置、壁纸相册及装饰封面统一使用目录扫描得到的素材池，不维护单独的编号清单。

- 留空：从本站 `/assets/` 加载。
- 示例：`https://cdn.example.com/assets`，表示该地址对应 `source/assets/` 目录。
- 如果 assets 的内容直接上传到域名根目录，则填写 `https://cdn.example.com`。
- 保持目录结构：`home/pc_01.mp4`、`home/optimized/pc_01-background.webp` 等。
- 外部明确填写的图片链接不改写；`assets/fallback/` 保留本站，不走 CDN。
- 本地保留 home 原素材及优化图，构建时从本地扫描素材清单；不要上传后删除本地文件。

## 新增或替换素材

1. 在 `source/assets/home/` 放置同名 MP4 + PNG：PC 为 `pc_XX`，手机为 `home_mobile_XX`。
2. 运行 `npm run media:prepare`（需要 FFmpeg，可通过 `FFMPEG_PATH` 指定路径）。
3. 运行 `npm run build`；开发服务器修改配置或主题脚本后需重启。
4. 本地开发直接预览；接入 OSS/CDN 后，再上传新增/变更素材和 `home/optimized/` 下对应文件。

优化工具只处理新图或修改过的原图，生成 thumb（最大宽 320）、cover（960）、background（1920）三个 WebP 版本，不放大小图。原始 PNG/视频不改动。替换相同文件名的资源后，须刷新 CDN 缓存，或使用新的文件名。

## 使用规则

- 首页仍按端随机选视频及同组末帧，保留刷新避免连续重复、站内返回/重播保持选择的规则。
- 未设置文章封面时按文章 source/slug 固定分配横向素材。已有封面和 `cover: false` 保留。
- 美化设置显示全部横屏和竖屏缩略图；保存 `media:素材ID`，域名变更后会使用新地址。
- `cover.default_cover` 在生成页面前自动填充全部横屏封面，主题组件也会使用新增素材。
- 壁纸相册通过 `gallery_media: all` 自动展示全部素材，沿用 `gallery_per_page` 分页；只展示横屏或竖屏时可填写 `desktop` 或 `mobile`。
- 游戏和相册入口不填写封面时，按入口链接从全部横屏素材中固定分配；友链缺少截图也使用同一素材池。
- `galleryGroup` 可用 `auto blank` 作为最后两个参数：自动分配封面，点击后在新窗口打开。
- 默认背景、个人卡片、相册和游戏入口封面使用自有素材；背景面板仅展示自有横屏/竖屏图片，仍可手动填写图片路径或链接。
- 曾经保存的第三方壁纸 API 地址恢复为本地默认背景；历史自有素材 URL 自动映射到素材 ID。自定义图片背景也带本站应急图兜底。
- 友链缺少截图使用自有封面，缺少头像使用本站独立头像，不自动调用网站截图服务。
- 普通图片加载失败回落到本站 `assets/fallback/image.webp`；头像回落到 `assets/fallback/avatar.png`。失败不循环重试。
- 首页视频加载失败、自动播放被拦截或主动跳过时显示该组图片；优化末帧图片失败先尝试同组本地 PNG，再尝试本站应急图片。全部失败仍会恢复正文和原背景。
- 响应式图片兜底时同时清理 `srcset`、`picture/source` 与懒加载地址，防止浏览器或插件重新选择失效图片。
- 404 页面保留 `assets/404_1.jpg`，不会把业务插图替换成普通封面。

## 滚动小猫挂件

当前固定使用：`source/assets/decorations/cat-original.png`。滚动和 PJAX 换页始终保持该图案，不再随机切换。

## 后续接入 OSS/CDN

域名和存储就绪后，将 `source/assets/` 上传并保留目录结构，设置 `site_media.base_url`，再重新构建、发布页面。站点域名单独配置在 `_config.yml` 的 `url` 中。网站本地仍保留原图和 `assets/fallback/`，供故障回退使用。

OSS/CDN 需允许公开 GET/HEAD、正确 MIME 类型及视频 Range 请求；本实现不依赖某家 OSS 特有的图片处理参数。该入口只控制自有媒体；现有字体、脚本等第三方依赖继续使用各自配置。

验证：`npm run test:media`。

浏览器回归：先启动 `npm run server`，再运行 `npm run test:media:browser`。需要 Playwright 和本地 Edge；如 Playwright 不在项目依赖目录，可用 `PLAYWRIGHT_MODULE_PATH` 指定安装路径。通过 `MEDIA_TEST_URL` 指定其他本地服务地址，或用 `MEDIA_TEST_BROWSER` 指定 Chromium 通道。
