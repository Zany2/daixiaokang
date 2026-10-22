---
title: 网站统计
date: 2022-09-15 21:30:00
comments: false
description: 网站访客统计看板：51LA 实时访客数据、GitHub 贡献日历，以及百度统计的访客地域分布、访问趋势与来源构成。
---

<script defer data-pjax src="/js/census.js?v=20261013-fallback2"></script>
<link rel="stylesheet" href="/css/census.css?v=20261013-fallback1">

<div class="census">
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">📈</span>
<div class="census-sec__text">
<div class="census-sec__title">网站访客统计</div>
<div class="census-sec__desc">51LA · <span id="census-updated">默认数据 · 暂无可用统计</span></div>
</div>
<a class="census-sec__link" href="https://v6.51.la/" target="_blank" rel="noopener">51LA<i>↗</i></a>
</div>
<div id="statistic" class="census-kpis" data-state="fallback">
<div class="content">
<div class="census-kpi"><span class="census-kpi__icon">🔢</span><span class="census-kpi__label">总访问量</span><span class="census-kpi__num" data-census-field="6">0</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🗓</span><span class="census-kpi__label">本月访问</span><span class="census-kpi__num" data-census-field="5">0</span></div>
<div class="census-kpi"><span class="census-kpi__icon">👥</span><span class="census-kpi__label">今日人数</span><span class="census-kpi__num" data-census-field="1">0</span></div>
<div class="census-kpi"><span class="census-kpi__icon">👣</span><span class="census-kpi__label">今日访问</span><span class="census-kpi__num" data-census-field="2">0</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🧍</span><span class="census-kpi__label">昨日人数</span><span class="census-kpi__num" data-census-field="3">0</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🕘</span><span class="census-kpi__label">昨日访问</span><span class="census-kpi__num" data-census-field="4">0</span></div>
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
<div class="census-sec__desc">按省份统计，颜色越深代表访问次数越多 · <span data-census-status="map-chart">默认数据 · 暂无可用统计</span></div>
</div>
</div>
<div class="census-card">
<div id="map-chart" class="census-chart census-chart--map"><div class="census-fallback">0 · 默认数据，暂无可用统计</div></div>
</div>
</section>
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">📅</span>
<div class="census-sec__text">
<div class="census-sec__title">访客访问趋势</div>
<div class="census-sec__desc">按月汇总，虚线为历史平均值 · <span data-census-status="trends-chart">默认数据 · 暂无可用统计</span></div>
</div>
</div>
<div class="census-card">
<div id="trends-chart" class="census-chart census-chart--trends"><div class="census-fallback">0 · 默认数据，暂无可用统计</div></div>
</div>
</section>
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">🎨</span>
<div class="census-sec__text">
<div class="census-sec__title">访客来源构成</div>
<div class="census-sec__desc">按来源渠道拆分，扇形面积代表占比 · <span data-census-status="sources-chart">默认数据 · 暂无可用统计</span></div>
</div>
</div>
<div class="census-card">
<div id="sources-chart" class="census-chart census-chart--sources"><div class="census-fallback">0 · 默认数据，暂无可用统计</div></div>
</div>
</section>
<div class="census-note">
<span>📈 访客数据：<a href="https://v6.51.la/" target="_blank" rel="noopener">51LA</a></span>
<span>🌏 地域 / 趋势 / 来源：<a href="https://tongji.baidu.com/" target="_blank" rel="noopener">百度统计</a></span>
<span>📊 贡献日历：<a href="https://github.com/Zany2" target="_blank" rel="noopener noreferrer">GitHub · Zany2</a></span>
</div>
</div>
