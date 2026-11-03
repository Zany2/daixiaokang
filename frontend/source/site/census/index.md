---
title: 网站统计
date: 2022-09-15 21:30:00
comments: false
description: 网站访客统计看板：访问概览、GitHub 贡献日历、访客地域分布、月度趋势与来源构成。
---

<script defer data-pjax src="/js/census.js?v=20261103-selfhost1"></script>
<link rel="stylesheet" href="/css/census.css?v=20261013-fallback1">

<div class="census">
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">📈</span>
<div class="census-sec__text">
<div class="census-sec__title">网站访客统计</div>
<div class="census-sec__desc">北京时间 · <span id="census-updated">正在加载</span></div>
</div>
</div>
<div id="statistic" class="census-kpis" data-state="loading">
<div class="content">
<div class="census-kpi"><span class="census-kpi__icon">🔢</span><span class="census-kpi__label">总访问量</span><span class="census-kpi__num" data-census-field="6">—</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🗓</span><span class="census-kpi__label">本月访问</span><span class="census-kpi__num" data-census-field="5">—</span></div>
<div class="census-kpi"><span class="census-kpi__icon">👥</span><span class="census-kpi__label">今日人数</span><span class="census-kpi__num" data-census-field="1">—</span></div>
<div class="census-kpi"><span class="census-kpi__icon">👣</span><span class="census-kpi__label">今日访问</span><span class="census-kpi__num" data-census-field="2">—</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🧍</span><span class="census-kpi__label">昨日人数</span><span class="census-kpi__num" data-census-field="3">—</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🕘</span><span class="census-kpi__label">昨日访问</span><span class="census-kpi__num" data-census-field="4">—</span></div>
</div>
</div>
</section>
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">📊</span>
<div class="census-sec__text">
<div class="census-sec__title">Github 贡献日历</div>
<div class="census-sec__desc"><a href="https://github.com/Zany2" target="_blank" rel="noopener noreferrer">@Zany2</a> · 近一年的贡献活跃度</div>
</div>
</div>
<div class="census-card census-card--git">
<div id="gitZone"></div>
</div>
</section>
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">🌏</span>
<div class="census-sec__text">
<div class="census-sec__title">访客地域分布</div>
<div class="census-sec__desc">累计省份访问量，颜色越深代表访问次数越多 · <span data-census-status="map-chart">正在加载</span></div>
</div>
</div>
<div class="census-card">
<div id="map-chart" class="census-chart census-chart--map"><div class="census-fallback">正在加载图表</div></div>
</div>
<div class="census-sec__desc" data-region-note></div>
</section>
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">📅</span>
<div class="census-sec__text">
<div class="census-sec__title">访客访问趋势</div>
<div class="census-sec__desc">近 12 个月，虚线为区间平均值 · <span data-census-status="trends-chart">正在加载</span></div>
</div>
</div>
<div class="census-card">
<div id="trends-chart" class="census-chart census-chart--trends"><div class="census-fallback">正在加载图表</div></div>
</div>
</section>
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">🎨</span>
<div class="census-sec__text">
<div class="census-sec__title">访客来源构成</div>
<div class="census-sec__desc">累计来源分布，扇形面积代表访问量占比 · <span data-census-status="sources-chart">正在加载</span></div>
</div>
</div>
<div class="census-card">
<div id="sources-chart" class="census-chart census-chart--sources"><div class="census-fallback">正在加载图表</div></div>
</div>
</section>
<div class="census-note">
<span>📈 访问量按页面浏览统计，人数按匿名浏览器估算</span>
<span>🌏 地域按网络出口估算；无来源信息归为直接访问 / 未知</span>
<span>📊 贡献日历：<a href="https://github.com/Zany2" target="_blank" rel="noopener noreferrer">GitHub · Zany2</a></span>
</div>
</div>
