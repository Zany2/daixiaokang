// 网站统计请求、默认值与图表共用一个页面生命周期。
;(function () {
if (typeof window.__disposeCensus === 'function') window.__disposeCensus()
var start_date = '20200101' // 开始日期
var date = new Date();
var end_date = '' + date.getFullYear() + (date.getMonth() > 8 ? (date.getMonth() + 1) : ("0" + (date.getMonth() + 1))) + (date.getDate() > 9 ? date.getDate() : ("0" + date.getDate())); // 结束日期
// 更新链接 https://openapi.baidu.com/oauth/2.0/token?grant_type=refresh_token&refresh_token=<你的refresh_token>&client_id=<你的client_id>&client_secret=<你的client_secret>
// API Key：{ CLIENT_ID }
// Secret Key：{ CLIENT_SECRET }
// 要看API Key与Secret Key见 http://developer.baidu.com/console#app/27508680
// 如果前面的refresh token不行就用这个
// refresh_token: <你的 refresh_token>
var access_token = 'YOUR_BAIDU_ACCESS_TOKEN' // 未配置时直接显示默认值；后续接入再填写。
var site_id = 'YOUR_BAIDU_SITE_ID' // 网址 id
var dataUrl = 'https://baidu-tongji.example.com/api?access_token=' + access_token + '&site_id=' + site_id
// var dataUrl = 'https://baidu-tongji.example.com/api?site_id=' + site_id
var metrics = 'pv_count' // 统计访问次数 PV 填写 'pv_count'，统计访客数 UV 填写 'visitor_count'，二选一
var metricsName = (metrics === 'pv_count' ? '访问次数' : (metrics === 'visitor_count' ? '访客数' : ''))

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
function requestCensus(url, type) {
  var controller = new AbortController()
  controllers.push(controller)
  var timer = setTimeout(function () { controller.abort() }, 10000)
  return fetch(url, { signal: controller.signal }).then(function (response) {
    if (!response.ok) throw new Error('统计接口 HTTP ' + response.status)
    return type === 'text' ? response.text() : response.json()
  }).finally(function () {
    clearTimeout(timer)
    controllers = controllers.filter(function (item) { return item !== controller })
  })
}
// 默认值固定为 0，明确标识，避免把未接入或失败的统计当作真实数据。
function setStatus(id, fallback) {
  var el = page.querySelector('[data-census-status="' + id + '"]')
  if (el) el.textContent = fallback ? '默认数据 · 暂无可用统计' : '统计数据已更新'
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
function resultRows(data) {
  if (!data || data.error_code || !data.result || !Array.isArray(data.result.items)) throw new Error('百度统计返回数据异常')
  var items = data.result.items
  if (!Array.isArray(items[0]) || !Array.isArray(items[1]) || items[0].length !== items[1].length) throw new Error('百度统计列表异常')
  return items[0].map(function (item, index) {
    var name = Array.isArray(item) ? item[0] : null
    name = name && typeof name === 'object' ? name.name : name
    if (typeof name !== 'string' || !name.trim() || !Array.isArray(items[1][index])) throw new Error('百度统计记录异常')
    return { name: name, value: numericValue(items[1][index][0]) }
  })
}
var statistic = page.querySelector('#statistic'), updated = page.querySelector('#census-updated')
function renderKpis(values, fallback) {
  if (!isCurrent() || !statistic) return
  statistic.querySelectorAll('[data-census-field]').forEach(function (el) {
    el.textContent = values[Number(el.getAttribute('data-census-field'))].toLocaleString('en-US')
  })
  statistic.setAttribute('data-state', fallback ? 'fallback' : 'ready')
  if (updated) updated.textContent = fallback ? '默认数据 · 暂无可用统计' : '统计数据已更新'
}
function loadKpis() {
  var defaults = [0, 0, 0, 0, 0, 0, 0]
  renderKpis(defaults, true)
  var widgetId = 'YOUR_51LA_ID'
  if (widgetId.indexOf('YOUR_') === 0) return
  requestCensus('https://v6-widget.51.la/v6/' + encodeURIComponent(widgetId) + '/quote.js', 'text')
    .then(function (text) {
      var values = [], matches = text.matchAll(/<\/span><span>(.*?)<\/span><\/p>/g)
      for (var match of matches) values.push(numericValue(match[1]))
      if (values.length < 7) throw new Error('51LA 返回数据异常')
      renderKpis(values, false)
    }).catch(function (error) {
      if (!isCurrent()) return
      console.warn('51LA:', error)
      renderKpis(defaults, true)
    })
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
  return ['直接访问', '搜索引擎', '外部链接', '其他来源'].map(function (name) { return { name: name, value: 0 } })
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
  tip.textContent = '0 · 默认数据，暂无可用统计'
  el.replaceChildren(tip)
}
function loadChart(id, method) {
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
  if (access_token.indexOf('YOUR_') === 0 || site_id.indexOf('YOUR_') === 0 || dataUrl.indexOf('.example.com') !== -1) return
  var params = '&start_date=' + start_date + '&end_date=' + end_date + '&metrics=' + metrics + '&method=' + method
  requestCensus(dataUrl + params).then(function (data) {
    var values = resultRows(data)
    if (!values.length) throw new Error('暂无统计记录')
    if (id === 'trends-chart') {
      values.forEach(function (row) {
        row.name = row.name.slice(0, 7).replace('/', '-')
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.name)) throw new Error('趋势日期异常')
      })
      values.sort(function (a, b) { return a.name.localeCompare(b.name) })
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
loadChart('map-chart', 'overview/getDistrictRpt')
loadChart('trends-chart', 'trend/time/a&gran=month')
loadChart('sources-chart', 'source/all/a')
ensureChartLibrary().then(function () {
  // 地图资源失败时折线与来源图仍可正常显示。
  refreshTheme()
  return ensureChinaMap()
}).then(refreshTheme).catch(function (error) {
  if (isCurrent()) console.warn('Census resources:', error)
})
})()
