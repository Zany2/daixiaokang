/* hexo-blog-encrypt 兼容交互：每次进入先输入密码，错误使用左侧站内通知，解锁后不提供重新加密按钮。 */
(function () {
  'use strict';

  var main = document.getElementById('hexo-blog-encrypt');
  if (!main || main.__encryptedPageController) return;
  var data = main.querySelector('#hbeData');
  if (!data) return;
  var crypto = window.crypto;
  var storage = null;
  try { storage = window.localStorage; } catch (error) { /* 禁用存储时仍允许解锁。 */ }
  var storageName = 'hexo-blog-encrypt:#' + location.pathname;
  var encryptedData = data.textContent.trim();
  var digest = data.getAttribute('data-hmacdigest');
  var wrongPass = main.getAttribute('data-wpm') || '密码不正确，请重新输入。';
  var wrongHash = '内容校验失败，请刷新页面后重试。';
  var active = true, busy = false, generation = 0, notice = null;
  var toc = Array.from(document.querySelectorAll('#toc-div, .toc-div-class'));

  function current(token) { return active && main.isConnected && token === generation; }
  function clearNotice() {
    if (notice && typeof notice.close === 'function') notice.close();
    notice = null;
    var inline = main.querySelector('.encrypted-page-notice');
    if (inline) inline.remove();
  }
  function showNotice(message) {
    if (!active || !main.isConnected) return;
    clearNotice();
    if (typeof window.fomalNotify === 'function') {
      notice = window.fomalNotify({
        title: '访问提示', message: message, type: 'warning',
        position: 'top-left', offset: 50, duration: 3500, showClose: true
      });
    } else {
      var tip = document.createElement('p');
      tip.className = 'encrypted-page-notice';
      tip.setAttribute('role', 'alert');
      tip.textContent = message;
      main.appendChild(tip);
    }
  }
  function removeSavedKeys() {
    try { if (storage) storage.removeItem(storageName); } catch (error) { /* 不影响继续输入密码。 */ }
  }
  function updateInputState() {
    var input = main.querySelector('#hbePass');
    if (!input) return;
    var field = input.closest('.hbe-input');
    if (field) {
      field.classList.toggle('input--filled', Boolean(input.value));
      field.classList.toggle('hbe-input--filled', Boolean(input.value));
    }
  }
  function onInput(event) {
    if (event.target.id !== 'hbePass') return;
    event.target.removeAttribute('aria-invalid');
    updateInputState();
  }
  function inputBusy(value) {
    var input = main.querySelector('#hbePass');
    // disabled 会让密码框失焦，导致 Xray 提示文字回落到已输入的密码上。
    if (input) input.readOnly = value;
    updateInputState();
    main.setAttribute('aria-busy', String(value));
  }
  function fromHex(value) {
    if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('加密数据异常');
    return new Uint8Array(value.match(/../g).map(function (part) { return parseInt(part, 16); }));
  }
  async function keysForPassword(password) {
    var encoder = new TextEncoder();
    var material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
    // 参数与构建期插件一致，继续兼容现有密文。
    var params = { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode('hexo-blog-encrypt的作者们都是大帅比!'), iterations: 1024 };
    var dk = await crypto.subtle.deriveKey(params, material, { name: 'AES-CBC', length: 256 }, true, ['decrypt']);
    var hmk = await crypto.subtle.deriveKey(params, material, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['verify']);
    var iv = await crypto.subtle.deriveBits({
      name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode('hexo-blog-encrypt是地表最强Hexo加密插件!'), iterations: 512
    }, material, 128);
    return { dk: dk, hmk: hmk, iv: iv };
  }
  function reveal(decoded, token) {
    if (!current(token)) return;
    var content = document.createElement('div');
    var body = decoded.slice('<hbe-prefix></hbe-prefix>'.length);
    content.innerHTML = body;
    var scripts = Array.from(content.querySelectorAll('script'));
    // 恋爱小屋当前没有正文，成功解锁后隐藏整个密码区，不添加按钮或成功提示。
    main.style.display = body.trim() ? 'block' : 'none';
    main.replaceChildren(content);
    // 保留插件对解密正文中脚本、图片和目录的支持，校验通过后才挂载。
    scripts.forEach(function (old) {
      if (!current(token) || !old.isConnected) return;
      var script = document.createElement('script');
      Array.from(old.attributes).forEach(function (attribute) { script.setAttribute(attribute.name, attribute.value); });
      if (old.src) script.async = false;
      script.textContent = old.textContent;
      old.replaceWith(script);
    });
    content.querySelectorAll('img[data-src]').forEach(function (image) {
      if (!image.getAttribute('src')) image.src = image.getAttribute('data-src');
    });
    toc.forEach(function (element) { element.style.display = 'block'; });
    if (window.NexT && window.NexT.boot && typeof window.NexT.boot.refresh === 'function') window.NexT.boot.refresh();
  }
  async function unlock(password) {
    if (!active || !main.isConnected || busy || !main.querySelector('#hbePass')) return;
    if (!crypto || !crypto.subtle) {
      showNotice('当前环境不支持解密，请使用 localhost 本地地址或 HTTPS 访问。');
      return;
    }
    busy = true;
    var token = ++generation;
    var retry = false;
    clearNotice();
    inputBusy(true);
    try {
      var keys = await keysForPassword(password);
      if (!current(token)) return;
      var bytes = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: keys.iv }, keys.dk, fromHex(encryptedData));
      var decoded = new TextDecoder().decode(bytes);
      if (!decoded.startsWith('<hbe-prefix></hbe-prefix>')) throw new Error('密码错误');
      var verified = await crypto.subtle.verify('HMAC', keys.hmk, fromHex(digest), new TextEncoder().encode(decoded));
      if (!current(token)) return;
      if (!verified) {
        removeSavedKeys();
        retry = true;
        showNotice(wrongHash);
        return;
      }
      reveal(decoded, token);
    } catch (error) {
      if (!current(token)) return;
      retry = true;
      showNotice(wrongPass);
    } finally {
      if (current(token)) {
        busy = false;
        inputBusy(false);
        var input = main.querySelector('#hbePass');
        if (retry && input) {
          input.setAttribute('aria-invalid', 'true');
          input.focus({ preventScroll: true });
          input.select();
        }
      }
    }
  }
  function onKeydown(event) {
    if (event.isComposing || event.key !== 'Enter' || event.target.id !== 'hbePass') return;
    event.preventDefault();
    var input = event.target;
    if (!input.value) { showNotice('请先输入密码。'); return; }
    unlock(input.value);
  }
  function disposeAfterNavigation() {
    if (main.isConnected) return;
    active = false;
    generation++;
    clearNotice();
    main.removeEventListener('keydown', onKeydown);
    main.removeEventListener('input', onInput);
    main.removeEventListener('change', onInput);
    document.removeEventListener('pjax:complete', disposeAfterNavigation);
    document.removeEventListener('pjax:error', disposeAfterNavigation);
  }
  main.__encryptedPageController = true;
  // 插件的填写状态选择器使用 graphic-xray，补齐 SVG 的兼容类名。
  var graphic = main.querySelector('.hbe-graphic-xray');
  if (graphic) graphic.classList.add('graphic-xray');
  updateInputState();
  main.addEventListener('keydown', onKeydown);
  main.addEventListener('input', onInput);
  main.addEventListener('change', onInput);
  document.addEventListener('pjax:complete', disposeAfterNavigation);
  document.addEventListener('pjax:error', disposeAfterNavigation);
  // 清理旧版记住的密钥，刷新或重新进入仍显示原来的密码输入框。
  removeSavedKeys();
})();
