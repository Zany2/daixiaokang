# Zany 网站主题源码

> [hexo-theme-fomalhaut](https://github.com/fomalhaut1998/hexo-theme-fomalhaut) 的主题本体 · **v1.0.2**
> 基于 [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly) 4.3.1 的二次开发，沿用 Apache-2.0 协议。

本目录已在上游主题基础上继续定制，包含本站首页推荐、评论与留言模板、本地搜索及导航等修改。上面的版本号标识来源版本，不代表本目录与上游版本完全一致。升级时应比较并合并差异，直接覆盖会丢失站点改动。

## 这个目录里有什么

| 目录 / 文件 | 作用 |
| --- | --- |
| `_config.yml` | 主题默认配置（**会被站点根目录的 `_config.fomalhaut.yml` 覆盖**，平时不用改这份） |
| `layout/` | Pug 模板：`index` / `post` / `page` / `archive` / `category` / `tag` + `includes/` 组件 |
| `source/css/` | 主题 Stylus 样式；站点独立样式在 `frontend/source/css/`，主题内部也保留自定义样式 |
| `source/js/` | 主题脚本（`main.js` 等） |
| `scripts/tag/` | 外挂标签：`note` `tabs` `timeline` `btn` `label` `gallery` `mermaid` `flink` `hideToggle` `inlineImg` |
| `scripts/filters/` | 构建期过滤器（图片懒加载、随机封面） |
| `scripts/helpers/` | 模板助手函数（归档、分类、相关文章、echarts…） |
| `scripts/events/` | 启动事件（版本横幅、CDN 预解析、404、评论初始化） |
| `languages/` | 多语言文案 |
| `LICENSE` | 上游 Apache-2.0 许可证 |

## 本仓库开发

本主题由仓库的 `frontend/` 加载，不在此目录单独安装或启动。在仓库根目录执行：

```powershell
cd frontend
npm.cmd ci
npm.cmd run server
```

网站整体说明见[根 README](../../../README.md)，前端配置与测试见[前端 README](../../README.md)。

## 主题配置

站点开关统一在 `frontend/_config.fomalhaut.yml` 维护（Hexo 的 `_config.[theme].yml` 机制）。本目录 `_config.yml` 提供默认值，站点配置的同名项优先；站点未覆盖的字段沿用主题默认值。

## 本站主要改动入口

- `layout/includes/home-discovery.pug`：首页最近文章轮播与分类入口，由 `layout/index.pug` 引用。
- `layout/includes/feedback.pug`：自建文章评论与留言面板。
- `source/js/search/local-search.js`：本站 `search.xml` 搜索运行时。
- `scripts/filters/post_lazyload.js`：图片懒加载及相关页面处理。

AI 助手注入器、评论交互、首页轮播交互、导航收纳和独立样式主要位于 `frontend/scripts/` 与 `frontend/source/`，维护时需要一起查看。

## 授权

Apache License 2.0 —— 见 [LICENSE](LICENSE)。本项目派生自 hexo-theme-butterfly（Copyright Jerry），保留其许可证与署名。
