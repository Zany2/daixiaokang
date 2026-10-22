/* GitHub 贡献日历的调色板：跟随站点主题色 --theme-color，不再写死一套绿色。
   [0] 是「没有提交」的格子（中性灰 + 透明度，白天/夜间都自动合适），
   [1]~[9] 是主题色由浅到深（用透明度叠加，不依赖 color-mix，老浏览器也能用）。
   读不到 --theme-color（或值不是 rgb/#hex）时返回 null，调用方继续用配置里那套颜色兜底。 */
function git_theme_palette() {
  try {
    var raw = (getComputedStyle(document.documentElement).getPropertyValue('--theme-color') || '').trim();
    var r, g, b, m = raw.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i);
    if (m) {
      r = Math.round(+m[1]); g = Math.round(+m[2]); b = Math.round(+m[3]);
    } else {
      var h = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (!h) return null;
      var v = h[1];
      if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
      r = parseInt(v.slice(0, 2), 16); g = parseInt(v.slice(2, 4), 16); b = parseInt(v.slice(4, 6), 16);
    }
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null;
    var base = r + ',' + g + ',' + b;
    var ramp = [0, .16, .28, .4, .52, .64, .76, .86, .94, 1];
    var out = ['rgba(128,134,140,.22)'];
    for (var i = 1; i < ramp.length; i++) out.push('rgba(' + base + ',' + ramp[i] + ')');
    out.push('rgba(' + base + ',1)');
    return out;
  } catch (e) { return null; }
}

/* 主题色变化后重画日历（美化面板里的 setColor 会调它）。
   调色板在 init 里实时推导，所以这里重新 init 一次即可拿到新颜色；
   但只有「主题色真的和画布上那份不一样」才动手，否则原地跳过。 */
function GitCalendarRefresh() {
  if (!window.__gitCalendarArgs) return false;
  var box = document.getElementById('git_container');
  if (!box) return false;
  var git_now = (getComputedStyle(document.documentElement).getPropertyValue('--theme-color') || '').trim();
  if (!git_now || git_now === git_painted_theme) return false;
  box.innerHTML = '';
  box.removeAttribute('data-gitcalendar-fallback');
  GitCalendarInit(window.__gitCalendarArgs[0], window.__gitCalendarArgs[1], window.__gitCalendarArgs[2]);
  return true;
}

/* 每次初始化都会领一个递增的编号；旧的那次 fetch 回来时发现自己已经不是最新，就整段丢弃。
   这样「页面刚打开就切主题色」「连点两下颜色」这类并发都不会叠出两份画布。 */
var git_init_seq = window.__gitCalendarSequence || 0;

/* 画布当前（或正在路上）这一份所依据的主题色值。用它来判断「要不要重画」：
   和现在一样就什么都不做 —— 页面加载时那次 setColor 正是这种情况，插手会和首次渲染撞车；
   不一样才清空重画（换主题色、「恢复默认设置」都走这条路）。 */
var git_painted_theme = '';

// 同时兼容公开接口的逐日记录与原插件的按周 JSON；不依赖固定的 53 周。
function git_calendar_data(data) {
  if (!data || !Array.isArray(data.contributions) || !data.contributions.length) throw new Error('贡献数据为空');
  var records = Array.isArray(data.contributions[0]) ? [].concat.apply([], data.contributions) : data.contributions;
  var byDate = new Map();
  records.forEach(function (record) {
    var date = record && record.date;
    var count = record && record.count;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isSafeInteger(count) || count < 0) throw new Error('贡献数据格式异常');
    var time = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) throw new Error('贡献日期异常');
    if (record.level != null && (!Number.isInteger(record.level) || record.level < 0 || record.level > 4)) {
      throw new Error('贡献颜色分级异常');
    }
    byDate.set(date, { date: date, count: count, level: record.level });
  });
  var days = Array.from(byDate.values()).sort(function (a, b) { return a.date.localeCompare(b.date); });
  if (!days.length) throw new Error('贡献数据为空');
  var weeks = [];
  var previousWeek = null;
  days.forEach(function (day) {
    var time = Date.parse(day.date + 'T00:00:00Z');
    var week = time - new Date(time).getUTCDay() * 86400000;
    if (week !== previousWeek) { weeks.push([]); previousWeek = week; }
    weeks[weeks.length - 1].push(day);
  });
  return { days: days, contributions: weeks, total: days.reduce(function (sum, day) { return sum + day.count; }, 0) };
}

function GitCalendarInit(git_gitapiurl, git_color, git_user) {
  if (typeof window.__disposeGitCalendar === 'function') window.__disposeGitCalendar();
  var git_container = document.getElementById('git_container');
  if (git_container) {
    // 插件把加载动画放在容器旁边；动画内的 style 会隐藏所有 #git_container。
    var git_mount = git_container.closest('#gitZone') || git_container.parentElement;
    /* 记住原始参数，主题色变了才好在原地重画（见 GitCalendarRefresh） */
    window.__gitCalendarArgs = [git_gitapiurl, git_color, git_user];
    var git_themecolor = git_theme_palette();
    if (git_themecolor) git_color = git_themecolor;
    git_painted_theme = (getComputedStyle(document.documentElement).getPropertyValue('--theme-color') || '').trim();
    var git_seq = ++git_init_seq;
    window.__gitCalendarSequence = git_seq;
    var git_active = true;
    function git_is_current() {
      return git_active && git_seq === window.__gitCalendarSequence && git_container.isConnected;
    }
    var git_canlendar = (git_user, git_gitapiurl, git_color) => {
      var git_fixed = 'fixed';
      var git_px = 'px';
      var git_month = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
      var git_oneyearbeforeday = '';
      var git_thisday = '';
      var git_amonthago = '';
      var git_aweekago = '';
      var git_weekdatacore = 0;
      var git_datacore = 0;
      var git_total = 0;
      var git_datadate = '';
      var git_git_data = [];
      var git_positionplusdata = [];
      var git_data = [];
      var git_thisweekdatacore = 0;
      var git_mounthbeforeday = 0;
      var git_mounthfirstindex = 0;
      var git_crispedges = 'crispedges';
      var git_amonthagoindex = 0;
      var git_amonthagoweek = [];

      var retinaCanvas = (canvas, context, ratio) => {
        if (ratio > 1) {
          var canvasWidth = canvas.width;
          var canvasHeight = canvas.height;
          canvas.width = canvasWidth * ratio;
          canvas.height = canvasHeight * ratio;
          canvas.style.width = '100%';
          canvas.style.height = canvasHeight + 'px';
          context.scale(ratio, ratio);
        }
      }

      // 圆角矩形填充（arcTo 手写路径，兼容不支持 ctx.roundRect 的浏览器）
      var git_fillroundrect = (ctx, x, y, w, h, r) => {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
      }

      var responsiveChart = () => {
        if (!git_is_current() || !git_data.length) return;
        if (git_container.querySelector('#gitcanvas')) {
          var git_tooltip_container = git_container.querySelector('#git_tooltip_container');
          var ratio = window.devicePixelRatio || 1
          var git_x = '';
          var git_y = '';
          var git_span1 = '';
          var git_span2 = '';
          var git_calendar_c = git_container.querySelector('#gitcanvas');
          git_calendar_c.style.width = '100%';
          git_calendar_c.style.height = '';
          var git_calendar_ctx = git_calendar_c.getContext("2d");
          if (!git_calendar_ctx) throw new Error('贡献日历画布不可用');
          var width = git_calendar_c.width = git_container.querySelector('#gitcalendarcanvasbox').offsetWidth;
          if (!width) return;
          var height = git_calendar_c.height = 9 * 0.96 * git_calendar_c.width / git_data.length;
          retinaCanvas(git_calendar_c, git_calendar_ctx, ratio)
          var linemaxwitdh = height / 9;
          var lineminwitdh = 0.8 * linemaxwitdh;
          var setposition = {
            x: 0.02 * width,
            y: 0.025 * width
          };
          git_positionplusdata = [];
          var monthLabels = [];
          var lastMonth = '';
          for (var week in git_data) {
            var weekdata = git_data[week];
            for (var day in weekdata) {
              var dataitem = {
                date: "",
                count: "",
                x: 0,
                y: 0
              };
              git_positionplusdata.push(dataitem);
              var month = weekdata[day].date.slice(0, 7);
              if (month !== lastMonth) {
                monthLabels.push({ x: setposition.x, text: git_month[Number(month.slice(5)) - 1] });
                lastMonth = month;
              }
              git_calendar_ctx.fillStyle = git_thiscolor(git_color, weekdata[day].count, weekdata[day].level);
              // 首周可能从周中开始，按真实星期落格，避免首列错位。
              setposition.y = 0.025 * width + new Date(weekdata[day].date + 'T00:00:00Z').getUTCDay() * linemaxwitdh;
              setposition.y = Math.round(setposition.y * 100) / 100;
              dataitem.date = weekdata[day].date;
              dataitem.count = weekdata[day].count;
              dataitem.x = setposition.x;
              dataitem.y = setposition.y;
              // 圆角小方块：半径 = 边长 30%（上限半边长），小方块自动退化
              git_fillroundrect(git_calendar_ctx, setposition.x, setposition.y, lineminwitdh, lineminwitdh, lineminwitdh * 0.3);
            }
            setposition.y = 0.025 * width;
            setposition.x = setposition.x + linemaxwitdh;
          }
          if (document.body.clientWidth > 700) {
            git_calendar_ctx.font = "11px Arial";
            git_calendar_ctx.fillStyle = '#aaa';
            git_calendar_ctx.fillText("日", 0, 1.9 * linemaxwitdh);
            git_calendar_ctx.fillText("二", 0, 3.9 * linemaxwitdh);
            git_calendar_ctx.fillText("四", 0, 5.9 * linemaxwitdh);
            git_calendar_ctx.fillText("六", 0, 7.9 * linemaxwitdh);
            // 按月份首个实际日期所在周定位；坐标使用 CSS 尺寸，避免高 DPI 屏幕错位。
            monthLabels.forEach(function (label, index) {
              var textWidth = git_calendar_ctx.measureText(label.text).width;
              var x = Math.min(label.x, width - textWidth);
              if (index < monthLabels.length - 1 && x + textWidth + 4 > monthLabels[index + 1].x) return;
              git_calendar_ctx.fillText(label.text, x, 0.7 * linemaxwitdh);
            });
          }
          git_calendar_c.onmousemove = function(event) {
            if (document.querySelector('.gitmessage')) {
              git_tooltip_container.innerHTML = ""
            }
            getMousePos(git_calendar_c, event)
          };
          git_tooltip_container.onmousemove = function(event) {
            if (document.querySelector('.gitmessage')) {
              git_tooltip_container.innerHTML = ""
            }
          };

          var getMousePos = (canvas, event) => {
            var rect = canvas.getBoundingClientRect();
            var x = (event.clientX - rect.left) * width / rect.width;
            var y = (event.clientY - rect.top) * height / rect.height;
            for (var item of git_positionplusdata) {
              var lenthx = x - item.x;
              var lenthy = y - item.y;
              if (0 < lenthx && lenthx < lineminwitdh) {
                if (0 < lenthy && lenthy < lineminwitdh) {
                  git_span1 = item.date;
                  git_span2 = item.count;
                  git_x = event.clientX - 100;
                  git_y = event.clientY - 60;
                  var html = tooltip_html(git_x, git_y, git_span1, git_span2);
                  append_div_gitcalendar(git_tooltip_container, html)
                }
              }
            }
          }
        }
      }

      var git_abort = new AbortController();
      var git_timeout = setTimeout(function () { git_abort.abort() }, 10000);
      function disposeCalendar() {
        if (!git_active) return;
        git_active = false;
        git_abort.abort();
        clearTimeout(git_timeout);
        window.removeEventListener('resize', responsiveChart);
        window.removeEventListener('scroll', hideCalendarTooltip);
        document.removeEventListener('pjax:complete', disposeAfterNavigation);
        document.removeEventListener('pjax:error', disposeAfterNavigation);
      }
      function disposeAfterNavigation() { if (!git_container.isConnected) disposeCalendar() }
      function hideCalendarTooltip() {
        var tooltip = git_container.querySelector('#git_tooltip_container');
        if (tooltip) tooltip.textContent = '';
      }
      window.__disposeGitCalendar = disposeCalendar;
      window.addEventListener('resize', responsiveChart);
      window.addEventListener('scroll', hideCalendarTooltip, { passive: true });
      document.addEventListener('pjax:complete', disposeAfterNavigation);
      document.addEventListener('pjax:error', disposeAfterNavigation);
      fetch(git_gitapiurl, { signal: git_abort.signal }).then(function (response) {
        if (!response.ok) throw new Error('贡献数据请求失败');
        return response.json();
      }).then(git_calendar_data).then(data => {
        renderCalendar(data, false);
      }).catch(function(error) {
        if (!git_is_current()) { return }
        console.warn('GitCalendar:', error);
        // 请求失败时生成最近一年的零贡献日历，标识默认值，不伪造活跃记录。
        var today = new Date();
        var end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        var days = [];
        for (var time = end - 364 * 86400000; time <= end; time += 86400000) {
          days.push({ date: new Date(time).toISOString().slice(0, 10), count: 0, level: 0 });
        }
        try {
          renderCalendar(git_calendar_data({ contributions: days }), true);
        } catch (renderError) {
          // 绘图也失败时仍保留默认数值，避免产生未处理的 Promise 异常。
          git_container.setAttribute('data-gitcalendar-fallback', '1');
          git_container.textContent = '默认数据 · 过去一年贡献：0 · 最近 30 天贡献：0 · 最近 7 天贡献：0';
          console.warn('GitCalendar render:', renderError);
        }
      }).finally(function () { clearTimeout(git_timeout) });

      function renderCalendar(data, fallback) {
        if (!git_is_current()) { return }
        git_mount.querySelectorAll('#git_loading').forEach(function (loading) { loading.remove() });
        git_data = data.contributions;
        git_total = data.total;
        git_weekdatacore = 0;
        git_thisweekdatacore = 0;
        git_thisday = data.days[data.days.length - 1].date;
        git_oneyearbeforeday = data.days[0].date;
        var latest = Date.parse(git_thisday + 'T00:00:00Z');
        git_aweekago = new Date(latest - 6 * 86400000).toISOString().slice(0, 10);
        git_amonthago = new Date(latest - 29 * 86400000).toISOString().slice(0, 10);
        data.days.forEach(function (day) {
          if (day.date >= git_aweekago) git_weekdatacore += day.count;
          if (day.date >= git_amonthago) git_thisweekdatacore += day.count;
        });
        var html = git_main_box(git_data, git_user, git_color, git_total, git_thisweekdatacore, git_weekdatacore, git_oneyearbeforeday, git_thisday, git_aweekago, git_amonthago);
        git_container.innerHTML = '';  // 只保留这一份渲染结果，重复初始化时不会叠出两份画布
        append_div_gitcalendar(git_container, html);
        if (fallback) {
          git_container.setAttribute('data-gitcalendar-fallback', '1');
          var notice = document.createElement('div');
          notice.className = 'text-muted';
          notice.style.textAlign = 'center';
          notice.style.width = '100%';
          notice.textContent = '默认数据 · 暂无可用贡献记录，贡献数均为 0';
          git_container.prepend(notice);
        } else {
          git_container.removeAttribute('data-gitcalendar-fallback');
        }
        responsiveChart()
      }
      var git_thiscolor = (color, x, level) => {
        // 新接口提供 GitHub 的 0～4 级深浅，使用原始分级并映射到本站主题色。
        if (Number.isInteger(level) && level >= 0 && level <= 4) {
          return color[[0, 2, 4, 6, 9][x === 0 ? 0 : level]];
        }
        // 兼容没有 level 字段的旧版按周 JSON。
        if (x === 0) {
          var i = parseInt(x / 2);
          return color[0]
        } else if (x < 2) {
          return color[1]
        } else if (x < 20) {
          var i = parseInt(x / 2);
          return color[i]
        } else {
          return color[9]
        }
      };
      var tooltip_html = (x, y, span1, span2) => {
        var html = '';
        html += `<div class="gitmessage" style="top:${y}px;left: ${x}px;position: fixed;z-index:9999">
                          <div class="angle-wrapper" style="display:block;">
                            <span>${span1}&nbsp;</span>
                            <span>${span2} 次贡献</span>
                          </div>
                        </div>`;
        return html
      };
      var git_canvas_box = () => {
        var html = `<div id="gitcalendarcanvasbox">
                              <canvas id="gitcanvas" style="animation: none;">
                              </canvas>
                            </div>`;
        return html
      };
      var git_info_box = (user, color) => {
        var html = '';
        html += `<div id="git_tooltip_container"></div>
                        <div class="contrib-footer clearfix mt-1 mx-3 px-3 pb-1">
                          <div class="float-left text-gray">数据来源
                            <a href="https://github.com/${user}" target="_blank" rel="noopener noreferrer">@${user}</a>
                          </div>
                          <div class="contrib-legend text-gray">Less
                            <ul class="legend">
                            <li style="background-color:${color[0]}"></li>
                            <li style="background-color:${color[2]}"></li>
                            <li style="background-color:${color[4]}"></li>
                            <li style="background-color:${color[6]}"></li>
                            <li style="background-color:${color[9]}"></li>
                            </ul>More
                          </div>
                        </div>`;
        return html
      };
      var git_main_box = (git_data, user, color, total, thisweekdatacore, weekdatacore, oneyearbeforeday, thisday, aweekago, amonthago) => {
        var html = '';
        var canvasbox = git_canvas_box();
        var infobox = git_info_box(user, color);
        html += `<div class="position-relative">
                          <div class="border py-2 graph-before-activity-overview">
                            <div class="js-gitcalendar-graph mx-md-2 mx-3 d-flex flex-column flex-items-end flex-xl-items-center overflow-hidden pt-1 is-graph-loading graph-canvas gitcalendar-graph height-full text-center">
                              ${canvasbox}
                            </div>
                            ${infobox}
                          </div>
                        </div>`;

        html += `<div style="display:flex;width:100%">
                          <div class="contrib-column contrib-column-first table-column">
                            <span class="text-muted">过去一年贡献</span>
                            <span class="contrib-number">${total}</span>
                            <span class="text-muted">${oneyearbeforeday}&nbsp;-&nbsp;${thisday}</span>
                          </div>
                          <div class="contrib-column table-column">
                            <span class="text-muted">最近 30 天贡献</span>
                            <span class="contrib-number">${thisweekdatacore}</span>
                            <span class="text-muted">${amonthago}&nbsp;-&nbsp;${thisday}</span>
                          </div>
                          <div class="contrib-column table-column">
                            <span class="text-muted">最近 7 天贡献</span>
                            <span class="contrib-number">${weekdatacore}</span>
                            <span class="text-muted">${aweekago}&nbsp;-&nbsp;${thisday}</span>
                          </div>
                        </div>`;
        return html
      };
    };
    var append_div_gitcalendar = (parent, text) => {
      if (typeof text === 'string') {
        var temp = document.createElement('div');
        temp.innerHTML = text;
        var frag = document.createDocumentFragment();
        while (temp.firstChild) {
          frag.appendChild(temp.firstChild)
        }
        parent.appendChild(frag)
      } else {
        parent.appendChild(text)
      }
    };
    git_canlendar(git_user, git_gitapiurl, git_color)
  }
}
