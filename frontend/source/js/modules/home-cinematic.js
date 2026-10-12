/* 首页动态背景：立即启动视频、按需开启声音，结束后只保留清晰末帧。 */
(function () {
  "use strict";

  // PC 使用这条移动端规则的反面，避免缩放产生的小数宽度落在断点间隙。
  const mobile = window.matchMedia("(max-width: 900px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = null;
  // PJAX 共用当前文档；刷新/新打开会重置，不写入持久化存储。
  let hasEnteredHome = false;

  function clearBootState() {
    window.clearTimeout(window.__homeIntroBootTimer);
    document.documentElement.classList.remove("home-intro-pending");
  }

  function retainSiteBackground(media) {
    if (!media || !media.poster) return;
    let background = document.getElementById("site-cinematic-background");
    if (!background) {
      background = document.createElement("div");
      background.id = "site-cinematic-background";
      background.setAttribute("aria-hidden", "true");
      // 独立于 #body-wrap 和 #web_bg，PJAX 换页时保留同一张已解码的图片。
      document.body.prepend(background);
    }
    const image = "url(" + JSON.stringify(media.poster) + ")";
    background.style.backgroundImage = window.SiteMedia ? window.SiteMedia.withFallback(image) : image;
    background.style.backgroundPosition = media.position || "center";
    background.dataset.mediaGroup = media.id;
    // 标记保存在 html 上，不写入本地存储；刷新仍会重新随机。
    document.documentElement.classList.add("cinematic-site-background");
  }

  function createIntro(wrap, background, variant, autoPlay, manualReplay) {
    const video = background.querySelector("video");
    const poster = background.querySelector("img");
    // 控制按钮位于 #body-wrap 外的工具栏；PJAX 会同步替换其独立首页按钮组。
    const skip = document.getElementById("home-intro-skip");
    const sound = document.getElementById("home-intro-sound");
    const replay = document.getElementById("home-intro-replay");
    const soundIcon = sound.querySelector("i");
    const media = typeof window.__selectHomeCinematicMedia__ === "function"
      ? window.__selectHomeCinematicMedia__(variant)
      : (window.__HOME_CINEMATIC_MEDIA__ || {})[variant];
    const videoUrl = media ? media.video : "";
    const posterUrl = media ? media.poster : "";
    const removers = [];
    const content = Array.from(wrap.querySelectorAll(
      "#site-info, #scroll-down, #content-inner, #footer"
    ));
    const originalInert = content.map(function (element) {
      return element.inert;
    });
    let finished = false;
    let disposed = false;
    let loadTimer = null;
    let releaseTimer = null;
    let videoFrame = null;
    let animationFrame = null;
    let videoVisible = false;
    let pausedForBackground = document.hidden;
    let playbackAttempt = 0;
    let posterReady = false;
    let posterUnavailable = false;
    let posterWaitTimer = null;
    let stillShown = false;
    const posterCandidates = [posterUrl, media && media.posterFallback, window.SiteMedia && window.SiteMedia.config.fallback]
      .filter(function (url, index, urls) { return url && urls.indexOf(url) === index; });
    let posterAttempt = 0;

    background.hidden = false;
    wrap.classList.toggle("home-replaying", Boolean(manualReplay));

    function listen(target, name, handler, options) {
      // 手动清理，兼容不支持 addEventListener(signal) 的手机浏览器。
      target.addEventListener(name, handler, options);
      removers.push(function () { target.removeEventListener(name, handler, options); });
    }

    function restoreContent() {
      content.forEach(function (element, index) { element.inert = originalInert[index]; });
    }

    function releaseVideo() {
      video.pause();
      video.hidden = true;
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    }

    function cancelFrame() {
      if (videoFrame !== null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(videoFrame);
      }
      window.cancelAnimationFrame(animationFrame);
      videoFrame = null;
      animationFrame = null;
    }

    function syncSound() {
      const enabled = !video.muted && video.volume > 0;
      const label = enabled ? "关闭视频声音" : "开启视频声音";
      if (soundIcon) {
        soundIcon.classList.toggle("fa-volume-high", enabled);
        soundIcon.classList.toggle("fa-volume-xmark", !enabled);
      }
      sound.title = label;
      sound.setAttribute("aria-pressed", String(enabled));
      sound.setAttribute("aria-label", label);
    }

    function showStill() {
      if (disposed || !finished || stillShown) return;
      stillShown = true;
      window.clearTimeout(posterWaitTimer);
      // 超时只临时隐藏背景；迟到的真实末帧解码成功后可以恢复。
      if (posterReady && !posterUnavailable) {
        background.hidden = false;
        retainSiteBackground(Object.assign({}, media, { poster: poster.src }));
      }
      wrap.dataset.homeIntro = "still";
      video.classList.remove("is-frame-ready");
      replay.hidden = false;
      // 视频淡出完成后再移除视频源，背景只留下已解码的末帧图片。
      releaseTimer = window.setTimeout(releaseVideo, 1400);
    }

    function finish() {
      if (finished || disposed) return;
      finished = true;
      window.clearTimeout(loadTimer);
      cancelFrame();
      wrap.dataset.homeIntro = "settling";
      skip.hidden = true;
      sound.hidden = true;
      video.pause();
      // 提前滚动或跳过时若没有有效画面，先露出原背景，避免深色等待层顶到导航下方。
      // 不取消图片加载；真实末帧解码成功后仍由 showStill 恢复本组背景。
      if (!videoVisible && !posterReady && !posterUnavailable) background.hidden = true;
      restoreContent();
      clearBootState();
      if (posterReady || posterUnavailable) showStill();
      else posterWaitTimer = window.setTimeout(posterTimedOut, 8000);
    }

    function posterTimedOut() {
      if (disposed || posterReady || posterUnavailable) return;
      // 慢请求不等于失败：释放暂停的视频，但保留图片 load/decode 的恢复机会。
      background.hidden = true;
      wrap.dataset.homeIntro = "still";
      video.classList.remove("is-frame-ready");
      replay.hidden = false;
      releaseVideo();
      // 不设置 posterUnavailable / stillShown，图片晚到时仍由 showStill 正常接管。
    }

    function posterFailed() {
      if (disposed) return;
      if (media && posterUrl && posterAttempt < posterCandidates.length) {
        // 优先回退本组本地原图，再用本站应急图片，有限次尝试避免错误循环。
        posterReady = false;
        poster.src = posterCandidates[posterAttempt++];
        preparePoster();
        return;
      }
      posterUnavailable = true;
      // 图片也不可用时露出原站点背景，不能留下黑色背景或隐藏内容。
      background.hidden = true;
      finish();
      showStill();
    }

    function watchLoading() {
      window.clearTimeout(loadTimer);
      if (!finished && !disposed && !document.hidden) {
        loadTimer = window.setTimeout(finish, 8000);
      }
    }

    function play() {
      if (finished || disposed || document.hidden || pausedForBackground) return;
      const attempt = ++playbackAttempt;
      watchLoading();
      try {
        const playback = video.play();
        if (playback && typeof playback.catch === "function") {
          playback.catch(function (error) {
            playbackFailed(error, attempt);
          });
        }
      } catch (error) {
        playbackFailed(error, attempt);
      }
    }

    function playbackFailed(error, attempt) {
      // 旧请求的拒绝不能结束新播放；有声自动播放被拦截时继续静音播放动画。
      if (finished || disposed || attempt !== playbackAttempt || document.hidden || pausedForBackground) return;
      if (error && error.name === "NotAllowedError" && !video.muted) {
        video.muted = true;
        syncSound();
        play();
      } else {
        finish();
      }
    }

    function begin() {
      if (finished || disposed) return;
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
      video.loop = false;
      video.playsInline = true;
      video.hidden = false;
      video.preload = "auto";
      video.src = videoUrl;
      syncSound();
      play();
    }

    function posterDecoded() {
      if (disposed || posterUnavailable) return;
      // 透明占位图不能被当成真实末帧；只接受当前选中图片的解码结果。
      if (!isPosterLoaded()) return;
      posterReady = true;
      if (finished) showStill();
    }

    function isPosterLoaded() {
      return poster.complete && poster.naturalWidth > 1 && poster.currentSrc === poster.src;
    }

    function preparePoster() {
      if (disposed || posterUnavailable || posterReady) return;
      const attempt = posterAttempt;
      if (typeof poster.decode === "function") {
        poster.decode().then(function () {
          if (attempt === posterAttempt) posterDecoded();
        }).catch(function () {
          if (disposed || posterUnavailable || attempt !== posterAttempt) return;
          if (isPosterLoaded()) posterDecoded();
          else if (poster.complete && !poster.naturalWidth) posterFailed();
        });
      } else {
        if (isPosterLoaded()) posterDecoded();
      }
    }

    function revealVideo() {
      videoFrame = null;
      animationFrame = null;
      if (finished || disposed) return;
      videoVisible = true;
      video.classList.add("is-frame-ready");
      window.clearTimeout(loadTimer);
      wrap.dataset.homeIntro = "playing";
    }

    function onPlaying() {
      if (finished || disposed) return;
      if (videoVisible) {
        window.clearTimeout(loadTimer);
        return;
      }
      if (videoFrame !== null || animationFrame !== null) return;
      watchLoading();
      // 手机端在 playing 事件之后仍可能没有画面，等有效首帧再显示视频层。
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrame = video.requestVideoFrameCallback(revealVideo);
      } else {
        animationFrame = window.requestAnimationFrame(function () {
          animationFrame = window.requestAnimationFrame(revealVideo);
        });
      }
    }

    const controller = {
      wrap: wrap,
      variant: variant,
      finish: finish,
      dispose: function () {
        disposed = true;
        removers.splice(0).forEach(function (remove) { remove(); });
        window.clearTimeout(loadTimer);
        window.clearTimeout(releaseTimer);
        window.clearTimeout(posterWaitTimer);
        cancelFrame();
        releaseVideo();
        restoreContent();
        skip.hidden = true;
        sound.hidden = true;
        replay.hidden = true;
        wrap.classList.remove("home-replaying");
        video.classList.remove("is-frame-ready");
        delete wrap.dataset.homeIntro;
      }
    };

    // 静态模式也保留重播入口，不能把监听放在自动播放分支之后。
    listen(replay, "click", replayHome);
    if (!media || !posterUrl) {
      posterFailed();
      return controller;
    }

    background.dataset.mediaGroup = media.id;
    background.style.setProperty("--home-media-position", media.position || "center");
    listen(poster, "error", posterFailed);
    listen(poster, "load", preparePoster);
    // 使用本次随机对象里的成对 URL；图片预取不阻塞视频开场。
    poster.src = posterCandidates[posterAttempt++];
    if (typeof poster.decode === "function" || isPosterLoaded()) preparePoster();

    if (
      !autoPlay || !videoUrl ||
      (!manualReplay && (reducedMotion.matches ||
        document.documentElement.classList.contains("custom-site-background") ||
        (navigator.connection && navigator.connection.saveData) || window.scrollY > 64))
    ) {
      finish();
      return controller;
    }

    wrap.dataset.homeIntro = "loading";
    content.forEach(function (element) {
      // 标题区在重播时也禁用；只有正文保留重播期间的阅读与交互。
      if (!manualReplay || element.id === "site-info") element.inert = true;
    });
    skip.hidden = false;
    sound.hidden = false;
    replay.hidden = true;
    watchLoading();

    listen(video, "playing", onPlaying);
    listen(video, "ended", finish);
    listen(video, "error", finish);
    listen(video, "waiting", watchLoading);
    listen(video, "stalled", watchLoading);
    listen(video, "timeupdate", function () {
      if (videoVisible && !video.paused && video.readyState >= 3) window.clearTimeout(loadTimer);
    });
    listen(video, "pause", function () {
      // 后台暂停与正常异常暂停分开；恢复后到达的旧 pause 事件也不能结束播放。
      if (finished || disposed || document.hidden || pausedForBackground || !video.paused) return;
      finish();
    });
    listen(skip, "click", finish);
    listen(video, "volumechange", syncSound);
    listen(sound, "click", function () {
      if (finished || disposed) return;
      const enableSound = video.muted || video.volume === 0;
      video.muted = !enableSound;
      if (enableSound) video.volume = 1;
      syncSound();
      // 在用户点击的同一调用中 play，满足浏览器的有声播放授权要求。
      play();
    });
    listen(window, "scroll", function () {
      if (!manualReplay && window.scrollY > 64) finish();
    }, { passive: true });
    listen(document, "keydown", function (event) {
      if (event.key === "Escape") finish();
    });
    listen(document, "visibilitychange", function () {
      if (finished || disposed) return;
      if (document.hidden) {
        pausedForBackground = true;
        playbackAttempt += 1;
        window.clearTimeout(loadTimer);
        cancelFrame();
        video.pause();
      } else {
        pausedForBackground = false;
        if (video.hasAttribute("src")) play();
        else watchLoading();
      }
    });
    begin();
    return controller;
  }

  function replayHome() {
    document.documentElement.classList.remove("custom-site-background");
    if (!current || !current.wrap.isConnected) return;
    const wrap = current.wrap;
    const background = wrap.querySelector("#home-background");
    if (!background) return;
    const variant = mobile.matches ? "mobile" : "desktop";
    current.dispose();
    hasEnteredHome = true;
    // 同步在点击调用内创建播放，保留用户操作所赋予的有声播放授权。
    current = createIntro(wrap, background, variant, true, true);
    clearBootState();
  }

  function init() {
    const wrap = document.querySelector("#body-wrap.home-cinematic");
    const background = wrap && wrap.querySelector("#home-background");
    const variant = mobile.matches ? "mobile" : "desktop";
    // 首屏已因脚本迟到而恢复阅读后，只显示本组图片，不突然再次进入开场。
    let autoPlay = !hasEnteredHome && !window.__homeIntroBootExpired;
    if (current && (current.wrap !== wrap || current.variant !== variant)) {
      // 同一页跨断点时直接显示对应末帧，避免重新开场或同时加载两段视频。
      if (current.wrap === wrap) autoPlay = false;
      current.dispose();
      current = null;
    }
    if (background && !current) {
      // 首次开场即使被跳过或播放失败，站内返回也不再次触发。
      hasEnteredHome = true;
      current = createIntro(wrap, background, variant, autoPlay, false);
    }
    clearBootState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
  document.addEventListener("pjax:complete", init);
  document.addEventListener("pjax:send", function () {
    // 开始离开首页就停止声音，不等目标页面下载完成。
    if (current) current.finish();
  });
  document.addEventListener("site:background-change", function () {
    if (current) current.finish();
  });
  function listenMedia(query, handler) {
    if (typeof query.addEventListener === "function") query.addEventListener("change", handler);
    else query.addListener(handler);
  }
  listenMedia(mobile, init);
  listenMedia(reducedMotion, function () {
    if (reducedMotion.matches && current) current.finish();
  });
  window.addEventListener("pagehide", function () {
    if (current) current.finish();
  });
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) init();
  });
})();
