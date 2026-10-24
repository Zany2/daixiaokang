/* 雪花、星空与流星：参数由美化面板共用，按秒推进动画，隐藏时停止绘制。 */
(function (global) {
  'use strict';
  if (global.FomalEffects) return;

  var storageKey = 'fomal:effect-options:v1';
  var groups = [
    { key: 'snow', title: '白天雪花' },
    { key: 'stars', title: '夜间星空' },
    { key: 'meteor', title: '夜间流星' }
  ];
  // default/min/max/step 同时用于存储校验、绘制和面板，避免出现两套参数。
  var schema = {
    snow: {
      count: { label: '雪花数量', default: 50, min: 10, max: 200, step: 10, unit: '颗' },
      size: { label: '雪花大小', default: 3, min: 1, max: 8, step: 0.5, unit: 'px' },
      speed: { label: '下落速度', default: 1, min: 0.2, max: 3, step: 0.1, unit: '倍' },
      opacity: { label: '雪花亮度', default: 80, min: 10, max: 100, step: 5, unit: '%' },
      sway: { label: '左右飘动', default: 1, min: 0, max: 3, step: 0.1, unit: '倍' },
      repel: { label: '鼠标避让范围', default: 150, min: 0, max: 250, step: 10, unit: 'px' },
      color: { label: '雪花颜色', default: '#ffffff', type: 'color' }
    },
    stars: {
      density: { label: '星星密度', default: 100, min: 20, max: 150, step: 10, unit: '%' },
      size: { label: '星星大小', default: 1.8, min: 0.5, max: 4, step: 0.1, unit: 'px' },
      speed: { label: '漂移速度', default: 1, min: 0, max: 3, step: 0.1, unit: '倍' },
      twinkle: { label: '闪烁速度', default: 1, min: 0, max: 3, step: 0.1, unit: '倍' },
      opacity: { label: '星星亮度', default: 100, min: 10, max: 100, step: 5, unit: '%' },
      color: { label: '星星颜色', default: '#e2e18e', type: 'color' }
    },
    meteor: {
      frequency: { label: '出现频率', default: 10, min: 0, max: 30, step: 1, unit: '次/分钟' },
      speed: { label: '飞行速度', default: 1, min: 0.2, max: 3, step: 0.1, unit: '倍' },
      size: { label: '头部大小', default: 1.5, min: 0.5, max: 4, step: 0.5, unit: 'px' },
      trail: { label: '拖尾长度', default: 120, min: 30, max: 240, step: 10, unit: 'px' },
      opacity: { label: '流星亮度', default: 100, min: 10, max: 100, step: 5, unit: '%' },
      angle: { label: '飞行方向', default: 315, min: 0, max: 355, step: 5, unit: '°' },
      color: { label: '流星颜色', default: '#e2e1e0', type: 'color' }
    }
  };
  var values = {}, listeners = [];
  var saved;
  try { saved = JSON.parse(global.localStorage.getItem(storageKey)); } catch (error) { saved = null; }

  function normalize(rule, value) {
    if (rule.type === 'color') return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : rule.default;
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return rule.default;
    var number = Number(value);
    if (!Number.isFinite(number)) return rule.default;
    number = Math.max(rule.min, Math.min(rule.max, number));
    return Number((rule.min + Math.round((number - rule.min) / rule.step) * rule.step).toFixed(3));
  }
  function loadDefaults(source) {
    groups.forEach(function (group) {
      values[group.key] = {};
      Object.keys(schema[group.key]).forEach(function (key) {
        var candidate = source && source[group.key] && source[group.key][key];
        values[group.key][key] = normalize(schema[group.key][key], candidate);
      });
    });
  }
  function publish(group) {
    try { global.localStorage.setItem(storageKey, JSON.stringify(values)); } catch (error) { /* 禁用存储时仍可实时调节。 */ }
    listeners.forEach(function (listener) { listener(group); });
  }
  loadDefaults(saved);
  global.FomalEffects = {
    groups: groups,
    schema: schema,
    get: function (group) { return Object.assign({}, values[group]); },
    set: function (group, key, value) {
      if (!Object.prototype.hasOwnProperty.call(schema, group) ||
          !Object.prototype.hasOwnProperty.call(schema[group], key)) return;
      var next = normalize(schema[group][key], value);
      if (next === values[group][key]) return;
      values[group][key] = next;
      publish(group);
    },
    reset: function () { loadDefaults(null); publish('all'); },
    subscribe: function (listener) { listeners.push(listener); }
  };

  var requestFrame = global.requestAnimationFrame ? global.requestAnimationFrame.bind(global) : function (fn) {
    return global.setTimeout(function () { fn(Date.now()); }, 1000 / 60);
  };
  var cancelFrame = global.cancelAnimationFrame ? global.cancelAnimationFrame.bind(global) : global.clearTimeout.bind(global);

  // 根节点与 canvas 保留在 PJAX 容器外，只注册一次监听；开关和主题变化不创建新循环。
  function createLoop(canvas, theme, draw, resize, fps) {
    var context = canvas.getContext('2d');
    if (!context) return null;
    var frame = null, lastTime = null, visible = false;
    var interval = 1000 / fps;
    function tick(now) {
      frame = null;
      if (!visible) return;
      if (lastTime === null || now - lastTime >= interval - 0.5) {
        var delta = lastTime === null ? 1 / fps : Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        context.clearRect(0, 0, canvas.width, canvas.height);
        draw(context, delta);
      }
      frame = requestFrame(tick);
    }
    function refresh() {
      visible = !document.hidden && global.innerWidth > 768 &&
        document.documentElement.getAttribute('data-theme') === theme &&
        global.getComputedStyle(canvas).display !== 'none';
      if (!visible) {
        if (frame !== null) cancelFrame(frame);
        frame = null;
        lastTime = null;
        context.clearRect(0, 0, canvas.width, canvas.height);
      } else if (frame === null) {
        lastTime = null;
        frame = requestFrame(tick);
      }
    }
    function fit() {
      canvas.width = Math.max(1, global.innerWidth);
      canvas.height = Math.max(1, global.innerHeight);
      resize();
      refresh();
    }
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    new MutationObserver(refresh).observe(canvas, { attributes: true, attributeFilter: ['style', 'class'] });
    global.addEventListener('resize', fit);
    global.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    document.addEventListener('pjax:complete', refresh);
    fit();
    return { refresh: refresh };
  }
  function random(min, max) { return min + Math.random() * (max - min); }
  function rgb(hex) {
    return [1, 3, 5].map(function (offset) { return parseInt(hex.slice(offset, offset + 2), 16); }).join(',');
  }

  function initSnow() {
    var canvas = document.getElementById('snow');
    if (!canvas || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return;
    var options = values.snow, flakes = [], mouse = { x: -1000, y: -1000 };
    function resetFlake(flake, scatter) {
      flake.x = random(0, canvas.width);
      flake.y = scatter ? random(0, canvas.height) : -options.size * 2;
      flake.radius = random(0.6, 1.4);
      flake.speed = random(0.6, 1.4);
      flake.alpha = random(0.55, 1);
      flake.phase = random(0, Math.PI * 2);
      flake.vx = 0;
      flake.vy = 60 * flake.speed * options.speed;
      return flake;
    }
    function syncCount() {
      flakes.length = Math.min(flakes.length, options.count);
      while (flakes.length < options.count) flakes.push(resetFlake({}, true));
    }
    function draw(context, delta) {
      context.fillStyle = options.color;
      flakes.forEach(function (flake) {
        flake.phase += delta * 2;
        var target = 60 * flake.speed * options.speed;
        flake.vy += (target - flake.vy) * Math.min(1, delta * 8);
        flake.vx *= Math.pow(0.96, delta * 60);
        var dx = flake.x - mouse.x, dy = flake.y - mouse.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (options.repel > 0 && distance > 0.5 && distance < options.repel) {
          var force = (1 - distance / options.repel) * 500 * delta;
          flake.vx += dx / distance * force;
          flake.vy += dy / distance * force;
        }
        flake.x += (flake.vx + Math.sin(flake.phase) * 12 * options.sway) * delta;
        flake.y += flake.vy * delta;
        if (flake.y > canvas.height + 20 || flake.y < -40 || flake.x < -20 || flake.x > canvas.width + 20) resetFlake(flake, false);
        context.globalAlpha = flake.alpha * options.opacity / 100;
        context.beginPath();
        context.arc(flake.x, flake.y, flake.radius * options.size, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
    }
    var loop = createLoop(canvas, 'light', draw, function () {
      syncCount();
      flakes.forEach(function (flake) { resetFlake(flake, true); });
    }, 60);
    if (!loop) return;
    document.addEventListener('mousemove', function (event) { mouse.x = event.clientX; mouse.y = event.clientY; });
    document.addEventListener('mouseout', function (event) {
      if (!event.relatedTarget) { mouse.x = -1000; mouse.y = -1000; }
    });
    global.FomalEffects.subscribe(function (group) {
      if (group !== 'snow' && group !== 'all') return;
      options = values.snow;
      syncCount();
      loop.refresh();
    });
  }

  var universeStarted = false;
  function initUniverse() {
    if (universeStarted) return;
    var canvas = document.getElementById('universe');
    if (!canvas) return;
    universeStarted = true;
    var stars = [], meteors = [], starOptions = values.stars, meteorOptions = values.meteor;
    var elapsed = 0, nextMeteor = 1;
    function makeStar() {
      return { x: random(0, canvas.width), y: random(0, canvas.height), radius: random(0.65, 1.35), phase: random(0, Math.PI * 2), drift: random(0.5, 1.5) };
    }
    function syncStars() {
      var count = Math.min(600, Math.round(canvas.width * 0.216 * starOptions.density / 100));
      stars.length = Math.min(stars.length, count);
      while (stars.length < count) stars.push(makeStar());
    }
    function spawnMeteor(preview) {
      if (!meteorOptions.frequency || meteors.length >= 6) return;
      var angle = meteorOptions.angle * Math.PI / 180;
      var dx = Math.cos(angle), dy = Math.sin(angle), x, y;
      if (preview) {
        x = random(canvas.width * 0.2, canvas.width * 0.8);
        y = random(canvas.height * 0.2, canvas.height * 0.8);
      } else if (Math.random() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy))) {
        x = dx >= 0 ? -10 : canvas.width + 10;
        y = random(0, canvas.height);
      } else {
        x = random(0, canvas.width);
        y = dy >= 0 ? -10 : canvas.height + 10;
      }
      meteors.push({ x: x, y: y, age: 0 });
    }
    function draw(context, delta) {
      context.fillStyle = starOptions.color;
      stars.forEach(function (star) {
        star.phase += delta * starOptions.twinkle;
        star.x += delta * 8 * starOptions.speed * star.drift;
        star.y -= delta * 4 * starOptions.speed * star.drift;
        if (star.x > canvas.width + 5) star.x = -5;
        if (star.y < -5) star.y = canvas.height + 5;
        context.globalAlpha = (0.5 + Math.sin(star.phase) * 0.35) * starOptions.opacity / 100;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * starOptions.size, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      if (meteorOptions.frequency > 0) {
        elapsed += delta;
        if (elapsed >= nextMeteor) {
          spawnMeteor(false);
          elapsed = 0;
          nextMeteor = 60 / meteorOptions.frequency * random(0.7, 1.3);
        }
      }
      var angle = meteorOptions.angle * Math.PI / 180;
      var dx = Math.cos(angle), dy = Math.sin(angle), color = rgb(meteorOptions.color);
      meteors = meteors.filter(function (meteor) {
        meteor.age += delta;
        meteor.x += dx * 240 * meteorOptions.speed * delta;
        meteor.y += dy * 240 * meteorOptions.speed * delta;
        var alpha = Math.min(1, meteor.age * 3) * meteorOptions.opacity / 100;
        var tailX = meteor.x - dx * meteorOptions.trail;
        var tailY = meteor.y - dy * meteorOptions.trail;
        var gradient = context.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        gradient.addColorStop(0, 'rgba(' + color + ',0)');
        gradient.addColorStop(1, 'rgba(' + color + ',' + alpha + ')');
        context.strokeStyle = gradient;
        context.lineWidth = meteorOptions.size;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(meteor.x, meteor.y);
        context.stroke();
        context.fillStyle = 'rgba(' + color + ',' + alpha + ')';
        context.beginPath();
        context.arc(meteor.x, meteor.y, meteorOptions.size, 0, Math.PI * 2);
        context.fill();
        var margin = meteorOptions.trail + 30;
        return meteor.x >= -margin && meteor.x <= canvas.width + margin && meteor.y >= -margin && meteor.y <= canvas.height + margin;
      });
    }
    var loop = createLoop(canvas, 'dark', draw, function () {
      stars = [];
      meteors = [];
      syncStars();
    }, 30);
    if (!loop) return;
    global.FomalEffects.subscribe(function (group) {
      starOptions = values.stars;
      meteorOptions = values.meteor;
      if (group === 'stars' || group === 'all') syncStars();
      if (group === 'meteor' || group === 'all') {
        elapsed = 0;
        nextMeteor = meteorOptions.frequency > 0 ? 60 / meteorOptions.frequency : Infinity;
        meteors = [];
        spawnMeteor(true);
      }
      loop.refresh();
    });
  }
  global.FomalEffects.startUniverse = initUniverse;
  initSnow();
  initUniverse();
})(window);

// 保留原先的入口；重复调用也不会叠加画布循环。
function dark() {
  if (window.FomalEffects) window.FomalEffects.startUniverse();
}
