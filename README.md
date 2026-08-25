# Zany Blog

这是一个基于 `Hexo` + `Butterfly` 二次开发的个人博客项目，当前仓库主要用于我自己的站点维护和定制。

## 项目说明

- 框架：`Hexo 6.x`
- 主题：`Butterfly`
- 风格：个人博客、页面较多、自定义脚本和样式较重
- 适合：已经接触过 `Hexo`，想继续做页面、样式和交互魔改的人

## 本地运行

先安装依赖：

```bash
npm install
```

本地启动：

```bash
npx hexo clean
npx hexo generate
npx hexo server
```

启动后默认访问：

```text
http://localhost:4000
```

## 部署说明

这个项目是静态站点，部署时只需要生成 `public` 目录，然后交给 `nginx` 托管。

生成静态文件：

```bash
npx hexo clean
npx hexo generate
```

如果部署到 `nginx`，把 `public` 目录中的内容复制到站点目录即可，例如：

```bash
cp -r public/* /usr/share/nginx/html/
```

如果你和我一样是放在 `nginx` 容器里，记得确认：

- `_config.yml` 中的 `url` 是实际访问地址
- `_config.yml` 中的 `root` 为 `/`
- `nginx` 的静态目录指向生成后的站点文件

## 目录结构

```text
.
├─ source/                   站点内容、页面、文章、静态资源
│  ├─ _posts/                博客文章
│  ├─ _drafts/               草稿
│  ├─ _data/                 结构化数据，如友链、挂件配置
│  ├─ css/                   站点额外样式
│  ├─ js/                    站点额外脚本
│  └─ personal、life...      各类自定义页面
├─ themes/butterfly/         Butterfly 主题及其模板、样式、脚本
├─ scaffolds/                Hexo 新建文章/页面时使用的模板
├─ _config.yml               站点总配置
├─ _config.butterfly.yml     主题配置
├─ gulpfile.js               对生成后的 public 做压缩
└─ package.json              项目依赖与命令脚本
```

## 常改文件

- `_config.yml`
  站点标题、作者、访问地址、部署方式等

- `_config.butterfly.yml`
  菜单、侧边栏、评论、封面、页脚、搜索等主题配置

- `source/js/fomal.js`
  项目最核心的自定义交互脚本，大部分效果都在这里

- `themes/butterfly/source/css/_custom/custom.css`
  主题层的主要自定义样式

- `source/css/custom.css`
  站点层的补充样式

- `themes/butterfly/layout/includes/footer.pug`
  自定义页脚布局

## 常用修改片段

### 1. 美化模块

这部分主要在 `source/js/fomal.js` 中，适合调整背景、开关项和自定义面板内容。

```js
/* 美化模块 start */
...
// 雪花开关(这里就是默认关雪花，如果你想默认开就将none改为block)
if (localStorage.getItem("snow") == undefined) {
  localStorage.setItem("snow", "none");
}
...
// 背景图 下面链接换成你自己的图片链接
document.getElementById("defineBg").innerText = `:root{
  --default-bg: url(https://your-image.example/default.webp);
  --darkmode-bg:url(https://your-image.example/dark.webp);
  --mobileday-bg: url(https://your-image.example/mobile-day.webp);
  --mobilenight-bg: url(https://your-image.example/mobile-night.webp);
}`;
...
/* 美化模块 end */
```

### 2. 页脚计时器

如果要修改建站时间或页脚文案，可以搜索这段逻辑：

```js
/* 页脚计时器 start */
var now = new Date();
function createtime() {
  now.setTime(now.getTime() + 1000);
  var start = new Date("08/01/2022 00:00:00");
  var dis = Math.trunc(23400000000 + ((now - start) / 1000) * 17);
  var unit = (dis / 149600000).toFixed(6);
  var grt = new Date("08/09/2022 00:00:00");
  ...
}
/*页脚计时器 end */
```

### 3. 控制台欢迎信息

如果要调整控制台字符画、欢迎文案或建站时间，可以搜索这段：

```js
/* 控制台输出字符画 start */
var now1 = new Date();

function createtime1() {
  var grt = new Date("08/09/2022 00:00:00");
  now1.setTime(now1.getTime() + 250);
  var days = (now1 - grt) / 1000 / 60 / 60 / 24;
  var dnum = Math.floor(days);

  var ascll = [
    `欢迎来到 Zany 的小站!`,
    `Future is now`,
    `...`,
    "小站已经运行",
    dnum,
    "天啦!",
    "©2022 By Zany",
  ];
  ...
}
/* 控制台输出字符画 end */
```

### 4. 加载头像

如果想换 loading 图，可以在主题自定义样式里搜索：

```css
.loading-img {
  background: url(https://your-image.example/avatar.webp)
    no-repeat center center;
  background-size: cover;
}
```

## 说明

- 这个仓库保留了较多个人化内容，使用时建议按自己的信息、图片、外链资源逐项替换
- 如果页面效果异常，优先检查 `_config.yml`、`_config.butterfly.yml` 和 `source/js/fomal.js`
- 如果是静态资源 404，优先检查 `url`、`root` 和 `nginx` 的站点目录配置
- 项目里部分效果依赖外链资源，迁移时请注意替换成自己的资源地址
