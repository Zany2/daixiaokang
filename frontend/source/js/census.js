// 网站统计请求、默认值与图表共用一个页面生命周期。
;(function () {
if (typeof window.__disposeCensus === 'function') window.__disposeCensus()
var metricsName = '访问次数'
var summaryTask = new Promise(function (resolve, reject) {
  var attempts = 0
  function ready() {
    if (window.SiteAnalytics) { window.SiteAnalytics.summary().then(resolve, reject); return }
    if (++attempts > 100) { reject(new Error('统计未启用')); return }
    setTimeout(ready, 50)
  }
  ready()
})
// —— 主题色读取与派生 ——
// 主题色由主题运行时写进 <style id="themeColor">，内容是 :root{--theme-color:rgb(57, 197, 187)}
// 取值来自 source/js/fomal.js 的 setColor()（默认 green），所以只能在运行时读取、不能写死。
function censusThemeRgb() {
  var v = ''
  try {
    v = getComputedStyle(document.documentElement).getPropertyValue('--theme-color') || ''
  } catch (err) { }
  v = v.trim()
  var m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v)
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  var hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    var n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return [57, 197, 187] // 主题默认色 green，取不到变量时兜底
}

function censusCss(rgb) {
  return 'rgb(' + rgb.join(', ') + ')'
}

// 与白色混合（ratio 越大越浅），生成同色系的浅色调
function censusTint(rgb, ratio) {
  return rgb.map(function (c) { return Math.round(c + (255 - c) * ratio) })
}

// 与黑色混合（ratio 越大越深），生成同色系的深色调
function censusShade(rgb, ratio) {
  return rgb.map(function (c) { return Math.round(c * (1 - ratio)) })
}

// 按背景亮度挑一个读得清的文字颜色
function censusReadable(rgb) {
  var l = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  return l > 0.6 ? '#2d2d2d' : '#ffffff'
}

// 当前是深色模式吗（主题把明/暗写在 <html data-theme> 上）
function censusIsDark() {
  return document.documentElement.getAttribute('data-theme') !== 'light'
}

// rgb -> hsl，用来围绕主题色相生成同色系序列
function censusRgbToHsl(rgb) {
  var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255
  var max = Math.max(r, g, b), min = Math.min(r, g, b)
  var l = (max + min) / 2
  var d = max - min
  var h = 0, s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s * 100, l * 100]
}

function censusHsl(h, s, l) {
  return 'hsl(' + Math.round(((h % 360) + 360) % 360) + ', ' +
    Math.round(Math.min(92, Math.max(30, s))) + '%, ' +
    Math.round(Math.min(78, Math.max(30, l))) + '%)'
}

// 地图配色：主色 / 浅色调（低值） / 深色调（悬浮高亮） / 无数据省份底色
function censusMapPalette() {
  var rgb = censusThemeRgb()
  var hover = censusShade(rgb, 0.25)
  var dark = censusIsDark()
  return {
    strong: censusCss(rgb),
    pale: censusCss(censusTint(rgb, 0.65)),
    hover: censusCss(hover),
    hoverText: censusReadable(hover),
    // 没有数据的省份 / 省份描边，跟着明暗模式走（原来写死成浅灰，深色模式下会发白）
    none: dark ? '#1e1e1e' : 'rgb(230, 232, 234)',
    border: dark ? '#2b2b2b' : 'rgb(255, 255, 255)'
  }
}

// 卡片底色（环形图扇区间隙 / 描边用），读主题变量，读不到再按明暗兜底
function censusCardBg() {
  var v = ''
  try {
    v = (getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || '').trim()
  } catch (e) { }
  return v || (censusIsDark() ? '#121212' : '#ffffff')
}

// 折线图 / 饼图统一用的主题色系
// 面积渐变：顶端用主题色本身（透明度 .34），底端收干净，比原来写死的绿→青更跟主题
function censusAreaGradient() {
  var rgb = censusThemeRgb()
  return {
    color: censusCss(rgb),
    top: 'rgba(' + rgb.join(',') + ', 0.34)',
    bottom: 'rgba(' + rgb.join(',') + ', 0.02)'
  }
}

// 把上面的渐变端点包成 echarts 的线性渐变对象（主题色变化时要重建）
function censusGradient(line) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: line.top },
    { offset: 1, color: line.bottom }
  ])
}

// 来源饼图配色：围绕主题色相左右摆动 + 明度分层，保证相邻扇形能区分又同属一个色系
function censusSeriesPalette() {
  var hsl = censusRgbToHsl(censusThemeRgb())
  var dark = censusIsDark()
  var steps = [
    [0, 0], [-20, -11], [16, 9], [-34, 15], [30, -6], [8, -17], [-46, 5], [46, 19]
  ]
  return steps.map(function (st) {
    var l = dark ? hsl[2] + st[1] + 8 : hsl[2] + st[1]
    return censusHsl(hsl[0] + st[0], hsl[1] * 0.95, l)
  })
}


var page = document.querySelector('.census')
if (!page) return
var active = true, charts = [], controllers = [], observers = [], themeRenderers = []
function isCurrent() { return active && page.isConnected }
function disposeCensus() {
  if (!active) return
  active = false
  controllers.forEach(function (controller) { controller.abort() })
  charts.forEach(function (chart) { chart.dispose() })
  observers.forEach(function (observer) { observer.disconnect() })
  window.removeEventListener('resize', resizeCharts)
  document.removeEventListener('pjax:complete', disposeAfterNavigation)
  document.removeEventListener('pjax:error', disposeAfterNavigation)
}
function disposeAfterNavigation() { if (!page.isConnected) disposeCensus() }
window.__disposeCensus = disposeCensus
// 目标页成功替换后再释放，导航失败仍停留本页时保留图表。
document.addEventListener('pjax:complete', disposeAfterNavigation)
document.addEventListener('pjax:error', disposeAfterNavigation)
function resizeCharts() {
  if (isCurrent()) charts.forEach(function (chart) { chart.resize() })
}
window.addEventListener('resize', resizeCharts)

// 同一文档共享加载任务，按图表库 → 地图的顺序加载，避免 PJAX 重复执行覆盖已注册的地图。
function loadChartScript(url, ready) {
  if (ready()) return Promise.resolve()
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script')
    var timer = setTimeout(function () { finish(new Error('图表资源加载超时')) }, 10000)
    function finish(error) {
      clearTimeout(timer)
      script.onload = script.onerror = null
      if (error) { script.remove(); reject(error) }
      else resolve()
    }
    script.src = url
    script.onload = function () { finish(ready() ? null : new Error('图表资源不可用')) }
    script.onerror = function () { finish(new Error('图表资源加载失败')) }
    document.head.appendChild(script)
  })
}
function hasChartLibrary() { return !!(window.echarts && typeof window.echarts.init === 'function') }
function hasChinaMap() { return hasChartLibrary() && !!window.echarts.getMap('china') }
function ensureChartLibrary() {
  if (hasChartLibrary()) return Promise.resolve()
  if (!window.__censusChartLibrary) {
    window.__censusChartLibrary = loadChartScript('https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js', hasChartLibrary)
      .catch(function (error) { window.__censusChartLibrary = null; throw error })
  }
  return window.__censusChartLibrary
}
function ensureChinaMap() {
  if (hasChinaMap()) return Promise.resolve()
  if (!window.__censusChinaMap) {
    window.__censusChinaMap = loadChartScript('https://npm.elemecdn.com/echarts@4.9.0/map/js/china.js', hasChinaMap)
      .catch(function (error) { window.__censusChinaMap = null; throw error })
  }
  return window.__censusChinaMap
}
// 请求失败显示缺省状态，真实的零访问仍由后端返回。
function setStatus(id, fallback) {
  var el = page.querySelector('[data-census-status="' + id + '"]')
  if (el) el.textContent = fallback ? '暂未获取统计' : '统计数据已更新'
}
function numericValue(value) {
  if (value === '--') return 0
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('统计数值异常')
  var text = String(value).replace(/,/g, '').trim()
  if (!/^\d+$/.test(text)) throw new Error('统计数值异常')
  var number = Number(text)
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('统计数值异常')
  return number
}
var statistic = page.querySelector('#statistic'), updated = page.querySelector('#census-updated')
function renderKpis(values, fallback) {
  if (!isCurrent() || !statistic) return
  statistic.querySelectorAll('[data-census-field]').forEach(function (el) {
    el.textContent = fallback ? '—' : values[Number(el.getAttribute('data-census-field'))].toLocaleString('en-US')
  })
  statistic.setAttribute('data-state', fallback ? 'fallback' : 'ready')
  if (updated) updated.textContent = fallback ? '暂未获取统计' : '统计数据已更新'
}
function loadKpis() {
  var defaults = [0, 0, 0, 0, 0, 0, 0]
  renderKpis(defaults, true)
  summaryTask.then(function (data) {
    var o = data.overview
    renderKpis([0, o.today_uv, o.today_pv, o.yesterday_uv, o.yesterday_pv, o.month_pv, o.total_pv].map(numericValue), false)
  }).catch(function () { renderKpis(defaults, true) })
}
function defaultMonths() {
  var current = new Date(), rows = []
  for (var i = 11; i >= 0; i--) {
    var month = new Date(current.getFullYear(), current.getMonth() - i, 1)
    rows.push({ name: month.getFullYear() + '-' + String(month.getMonth() + 1).padStart(2, '0'), value: 0 })
  }
  return rows
}
function chartDefaults(id) {
  if (id === 'map-chart') {
    var map = typeof echarts !== 'undefined' && echarts.getMap('china')
    var geo = map && (map.geoJSON || map.geoJson)
    return geo && Array.isArray(geo.features) ? geo.features.map(function (feature) {
      return { name: feature.properties.name, value: 0 }
    }) : []
  }
  if (id === 'trends-chart') return defaultMonths()
  return ['直接访问 / 未知', '搜索引擎', '外部链接', '推广渠道'].map(function (name) { return { name: name, value: 0 } })
}
function chartOption(id, rows) {
  var textColor = censusIsDark() ? 'rgba(255,255,255,0.7)' : '#4c4948'
  if (id === 'map-chart') {
    var p = censusMapPalette()
    return {
      tooltip: { trigger: 'item', formatter: function (item) {
        // 省份名称来自地图资源，数值缺失时显示 0。
        return item.name + '：' + (Number.isFinite(item.value) ? item.value : 0)
      } },
      visualMap: {
        min: 0, max: Math.max(1, ...rows.map(function (row) { return row.value })),
        left: 'left', bottom: 0, text: ['多', '少'], inRange: { color: [p.pale, p.strong] },
        textStyle: { color: textColor }, calculable: true
      },
      series: [{
        name: metricsName, type: 'map', map: 'china',
        label: { show: false }, emphasis: { label: { color: p.hoverText }, itemStyle: { areaColor: p.hover } },
        itemStyle: { areaColor: p.none, borderColor: p.border, borderWidth: 1 }, data: rows
      }]
    }
  }
  if (id === 'trends-chart') {
    var line = censusAreaGradient()
    return {
      grid: { top: 36, left: 8, right: 36, bottom: 6, containLabel: true }, tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category', boundaryGap: false, data: rows.map(function (row) { return row.name }),
        axisLabel: { color: textColor }, axisLine: { lineStyle: { color: textColor } }, axisTick: { show: false }
      },
      yAxis: {
        name: metricsName, type: 'value', minInterval: 1, nameTextStyle: { color: textColor },
        axisLabel: { color: textColor }, splitLine: { show: false }
      },
      series: [{
        name: metricsName, type: 'line', smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: line.color }, itemStyle: { color: line.color },
        areaStyle: { color: censusGradient(line) }, data: rows.map(function (row) { return row.value }),
        markLine: { data: [{ name: '平均值', type: 'average', label: { color: textColor } }] }
      }]
    }
  }
  var hasSources = rows.some(function (row) { return row.value > 0 })
  return {
    color: censusSeriesPalette(), legend: { bottom: 0, textStyle: { color: textColor } }, tooltip: { trigger: 'item' },
    graphic: hasSources ? [] : [{
      type: 'text', left: 'center', top: '44%',
      style: { text: '0', fill: textColor, fontSize: 28, fontWeight: 'bold' }
    }],
    series: [{
      name: metricsName, type: 'pie', radius: ['52%', '80%'], center: ['50%', '47%'],
      stillShowZeroSum: false, showEmptyCircle: true, emptyCircleStyle: { color: censusIsDark() ? '#2b2b2b' : '#ebedf0' },
      minAngle: hasSources ? 6 : 0,
      label: { show: hasSources, color: textColor, formatter: '{b} : {c} ({d}%)' },
      labelLine: { lineStyle: { color: textColor } },
      data: hasSources ? rows : [], itemStyle: { borderColor: censusCardBg(), borderWidth: 2 }
    }]
  }
}
function chartTextFallback(el) {
  var tip = document.createElement('div')
  tip.className = 'census-fallback'
  tip.textContent = '图表暂不可用'
  el.replaceChildren(tip)
}
function loadChart(id) {
  var el = page.querySelector('#' + id)
  if (!el) return
  var chart = null, rows = chartDefaults(id), fallbackState = true
  function render(fallback) {
    if (!isCurrent()) return
    fallbackState = fallback
    if (fallback) rows = chartDefaults(id)
    setStatus(id, fallback)
    try {
      if (typeof echarts === 'undefined' || (id === 'map-chart' && !echarts.getMap('china'))) throw new Error('图表资源未加载')
      if (!chart) {
        el.replaceChildren()
        chart = echarts.init(el)
        charts.push(chart)
      }
      chart.setOption(chartOption(id, rows), true)
    } catch (error) {
      console.warn('Census chart:', error)
      if (chart) {
        chart.dispose()
        charts = charts.filter(function (item) { return item !== chart })
        chart = null
      }
      setStatus(id, true)
      chartTextFallback(el)
    }
  }
  render(true)
  themeRenderers.push(function () { render(fallbackState) })
  summaryTask.then(function (data) {
    var key = { 'map-chart': 'regions', 'trends-chart': 'trends', 'sources-chart': 'sources' }[id]
    var values = data[key].map(function (row) { return { name: String(row.name), value: numericValue(row.value) } })
    if (id === 'map-chart') {
      var note = page.querySelector('[data-region-note]')
      if (note) note.textContent = data.geo_available ? '海外及未识别访问：' + numericValue(data.region_unknown).toLocaleString('en-US') : '暂无法识别地域'
    }
    rows = values
    render(false)
  }).catch(function (error) {
    if (!isCurrent()) return
    console.warn('Census:', error)
    rows = chartDefaults(id)
    render(true)
  })
}
function refreshTheme() {
  if (isCurrent()) themeRenderers.forEach(function (render) { render() })
}
if (window.MutationObserver) {
  var observer = new MutationObserver(refreshTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] })
  var theme = document.getElementById('themeColor')
  if (theme) observer.observe(theme, { childList: true, characterData: true, subtree: true })
  observers.push(observer)
}
loadKpis()
loadChart('map-chart')
loadChart('trends-chart')
loadChart('sources-chart')
ensureChartLibrary().then(function () {
  // 地图资源失败时折线与来源图仍可正常显示。
  refreshTheme()
  return ensureChinaMap()
}).then(refreshTheme).catch(function (error) {
  if (isCurrent()) console.warn('Census resources:', error)
})
})()
