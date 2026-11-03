# 地图依赖资源

此目录通过 `scripts/tag-map-local.js` 为文章中的地图提供站内 Leaflet 依赖。

`images/` 内的 `layers.png`、`layers-2x.png`、`marker-icon.png`、`marker-icon-2x.png` 和 `marker-shadow.png` 来自 Leaflet 官方 v1.7.1 的 `dist/images/`。图层按钮由 CSS 相对路径引用，标记及阴影由 Leaflet 使用，需与 CSS、JS 一起发布。官方许可证见 `LICENSE-Leaflet.txt`。

源文件位置：`https://github.com/Leaflet/Leaflet/tree/v1.7.1/dist/images`。

Hexo 构建后应在 `public/js/tag-map/images/` 保留同名文件；服务器部署位置为 `frontend/html/js/tag-map/images/`。这些运行时图标不需要上传到媒体 COS。
