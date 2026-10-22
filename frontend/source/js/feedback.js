/* 自建评论与留言板。只在含 data-feedback 的页面挂载，支持 PJAX。 */
(function () {
  'use strict';
  if (window.__zanyFeedbackBooted) return;
  window.__zanyFeedbackBooted = true;

  const active = new Set();
  const drafts = new Map();
  let writeUntil = 0;
  let readUntil = 0;
  let cooldownTimer = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function button(label, action, className) {
    const element = node('button', className || 'zf-text-button', label);
    element.type = 'button';
    element.dataset.feedbackAction = action;
    element.dataset.idleLabel = label;
    return element;
  }

  function remaining(deadline) {
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  function startCooldown(seconds, writing) {
    const deadline = Date.now() + Math.max(1, seconds) * 1000;
    if (writing) writeUntil = Math.max(writeUntil, deadline);
    else readUntil = Math.max(readUntil, deadline);
    updateCooldown();
    if (!cooldownTimer && active.size) cooldownTimer = window.setInterval(updateCooldown, 500);
    return deadline;
  }

  function updateCooldown() {
    active.forEach(controller => controller.updateControls());
    if ((!remaining(writeUntil) && !remaining(readUntil)) || !active.size) {
      window.clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }

  function row(value) {
    if (!value || !Number.isSafeInteger(value.id) || value.id < 1 ||
        typeof value.nickname !== 'string' || typeof value.content !== 'string' ||
        typeof value.created_at !== 'string') {
      throw new Error('返回的内容暂时无法显示，请刷新列表重试。');
    }
    return {
      id: value.id, nickname: value.nickname, content: value.content,
      created_at: value.created_at, updated_at: value.updated_at,
      article_key: value.article_key,
      parent_id: value.parent_id == null ? null : value.parent_id,
      root_id: value.root_id == null ? null : value.root_id,
      reply_to_nickname: typeof value.reply_to_nickname === 'string' ? value.reply_to_nickname : null
    };
  }

  function timestamp(value) {
    const parts = String(value || '').split('.');
    return parts[0] + '.' + (parts[1] || '').padEnd(6, '0');
  }

  function mergeRows(first, second, descending) {
    const records = new Map();
    first.concat(second).forEach(record => records.set(String(record.id), record));
    return Array.from(records.values()).sort(function (a, b) {
      const order = timestamp(a.created_at).localeCompare(timestamp(b.created_at)) || a.id - b.id;
      return descending ? -order : order;
    });
  }

  function remember(map, record) {
    map.set(String(record.id), { record: record, until: Date.now() + 60000 });
    if (map.size > 50) map.delete(map.keys().next().value);
  }

  function remembered(map) {
    const records = [];
    map.forEach(function (entry, key) {
      if (entry.until <= Date.now()) map.delete(key);
      else records.push(entry.record);
    });
    return records;
  }

  function dateLabel(value) {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/);
    return match ? match[1] + ' ' + match[2] + ':' + (match[3] || '00') : value;
  }

  function readableError(status, body, writing) {
    if (status === 422) {
      const detail = Array.isArray(body && body.detail) ? body.detail : [];
      if (detail.some(item => Array.isArray(item.loc) && item.loc.includes('email'))) return '请填写正确的邮箱地址，或将邮箱留空。';
      return '请检查昵称和内容是否填写完整，内容最多 2000 字。';
    }
    if (status === 404 && writing) return '这条评论暂时无法回复，内容已保留。你可以取消回复后重新发表。';
    if (status === 404) return '这条讨论暂时无法加载，请刷新列表。';
    if (status === 429) return writing ? '发表得有点快，请等待倒计时结束后再试。' : '加载得有点快，请稍后重试。';
    if (status === 503) return writing ? '暂时无法发表，填写的内容已保留，请稍后重试。' : '暂时无法加载，请稍后重试。';
    return writing ? '暂时无法发表，填写的内容已保留。' : '暂时无法加载，请稍后重试。';
  }

  class Feedback {
    constructor(root) {
      this.root = root;
      this.isMessage = root.dataset.feedback === 'messages';
      this.articleKey = root.dataset.articleKey || '';
      const localDevelopment = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
      const localApiBase = root.dataset.localApiBase;
      this.apiBase = (localDevelopment && localApiBase ? localApiBase : root.dataset.apiBase || '/api').replace(/\/+$/, '');
      this.timeout = Number(root.dataset.requestTimeout) || 12000;
      this.form = root.querySelector('[data-feedback-form]');
      this.nickname = this.form.elements.nickname;
      this.email = this.form.elements.email;
      this.content = this.form.elements.content;
      this.submitButton = root.querySelector('[data-feedback-submit]');
      this.formStatus = root.querySelector('[data-feedback-form-status]');
      this.list = root.querySelector('[data-feedback-list]');
      this.listStatus = root.querySelector('[data-feedback-list-status]');
      this.count = root.querySelector('[data-feedback-count]');
      this.announcement = root.querySelector('[data-feedback-announcement]');
      this.replyContext = root.querySelector('[data-feedback-reply-context]');
      this.pagination = root.querySelector('[data-feedback-pagination]');
      this.records = [];
      this.page = 1;
      this.total = 0;
      this.totalPages = 0;
      this.replyTarget = null;
      this.replyLoading = new Map();
      this.pending = new Map();
      this.pendingReplies = new Map();
      this.own = new Map();
      this.requests = new Map();
      this.listVersion = 0;
      this.loadingList = false;
      this.submitting = false;
      this.disposed = false;
      this.draftKey = this.isMessage ? 'messages' : 'comments:' + this.articleKey;
      this.handleClick = this.onClick.bind(this);
      this.handleSubmit = this.onSubmit.bind(this);
      this.handleInput = this.onInput.bind(this);
    }

    start() {
      const draft = drafts.get(this.draftKey);
      if (draft) {
        this.nickname.value = draft.nickname;
        this.email.value = draft.email;
        this.content.value = draft.content;
        this.replyTarget = draft.replyTarget;
      }
      this.root.addEventListener('click', this.handleClick);
      this.form.addEventListener('submit', this.handleSubmit);
      this.form.addEventListener('input', this.handleInput);
      this.updateReplyContext();
      this.onInput();
      this.updateControls();
      if (!this.isMessage && !this.articleKey) {
        this.unavailable = true;
        this.showFormStatus('暂时无法发表评论，请刷新页面重试。', 'error');
        this.showListStatus('error', '暂时无法加载评论，请刷新页面。');
        this.updateControls();
        return;
      }
      this.loadList({ reset: true, page: 1 });
    }

    saveDraft() {
      drafts.set(this.draftKey, {
        nickname: this.nickname.value, email: this.email.value,
        content: this.content.value, replyTarget: this.replyTarget
      });
      if (drafts.size > 20) drafts.delete(drafts.keys().next().value);
    }

    destroy() {
      this.saveDraft();
      this.disposed = true;
      if (this.validationNotice) this.validationNotice.close();
      this.requests.forEach(entry => entry.controller.abort());
      this.requests.clear();
      this.root.removeEventListener('click', this.handleClick);
      this.form.removeEventListener('submit', this.handleSubmit);
      this.form.removeEventListener('input', this.handleInput);
      delete this.root.dataset.feedbackMounted;
      active.delete(this);
    }

    onInput(event) {
      if (event) event.target.removeAttribute('aria-invalid');
      else [this.nickname, this.email, this.content].forEach(input => input.removeAttribute('aria-invalid'));
      // 与后端 Unicode 字符计数保持一致，emoji 不按两个 UTF-16 单元计算。
      const length = Array.from(this.content.value).length;
      const counter = this.root.querySelector('[data-feedback-counter]');
      counter.textContent = length + ' / 2000';
      counter.classList.toggle('is-over-limit', length > 2000);
      this.saveDraft();
    }

    showValidation(message, input) {
      if (this.validationNotice) this.validationNotice.close();
      input.setAttribute('aria-invalid', 'true');
      if (typeof window.fomalToast === 'function') {
        this.validationNotice = window.fomalToast(message, 'warning', { title: '填写提示' });
      } else this.showFormStatus(message, 'error');
      input.focus();
    }

    showFormStatus(message, tone) {
      this.formStatus.textContent = message;
      this.formStatus.dataset.tone = tone || 'success';
      this.formStatus.hidden = !message;
      this.formStatus.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    }

    updateReplyContext() {
      this.replyContext.hidden = !this.replyTarget;
      this.root.querySelector('[data-feedback-reply-label]').textContent = this.replyTarget ? '正在回复 ' + this.replyTarget.nickname : '';
      this.saveDraft();
      this.updateControls();
    }

    updateControls() {
      if (this.disposed) return;
      const writingWait = remaining(writeUntil);
      this.submitButton.disabled = Boolean(this.submitting || writingWait || this.unavailable);
      this.submitButton.textContent = this.submitting ? '正在发表…' : writingWait ? '请等待 ' + writingWait + ' 秒' :
        this.isMessage ? '发表留言' : this.replyTarget ? '发表回复' : '发表评论';
      this.form.setAttribute('aria-busy', String(this.submitting));
      [this.nickname, this.email, this.content].forEach(input => { input.disabled = this.submitting; });
      const readingWait = remaining(readUntil);
      this.root.querySelectorAll('button[data-feedback-action]').forEach(element => {
        const action = element.dataset.feedbackAction;
        if (action === 'reply' || action === 'cancel-reply') {
          element.disabled = this.submitting;
          return;
        }
        if (action === 'focus-form') return;
        const busy = this.loadingList || (action === 'more-replies' && this.replyLoading.has(element.dataset.rootId));
        const isPagination = action === 'page' || action === 'jump-page';
        const waiting = readingWait && !isPagination;
        element.disabled = Boolean(busy || readingWait || element.dataset.unavailable === 'true');
        element.textContent = isPagination ? element.dataset.idleLabel : busy ? '正在加载…' : waiting ? readingWait + ' 秒后重试' : element.dataset.idleLabel;
        if (readingWait) element.title = readingWait + ' 秒后可继续加载';
        else element.removeAttribute('title');
      });
      if (this.pagination) {
        this.pagination.setAttribute('aria-busy', String(this.loadingList));
        const pageInput = this.pagination.querySelector('.zf-page-input');
        if (pageInput) pageInput.disabled = Boolean(this.loadingList || readingWait);
      }
    }

    async request(path, options, channel) {
      const previous = this.requests.get(channel);
      if (previous) previous.controller.abort();
      const entry = { controller: new AbortController(), timedOut: false };
      this.requests.set(channel, entry);
      const timer = window.setTimeout(() => { entry.timedOut = true; entry.controller.abort(); }, this.timeout);
      const writing = options && options.method === 'POST';
      try {
        const response = await fetch(this.apiBase + path, Object.assign({
          method: 'GET', credentials: 'omit', cache: 'no-store', signal: entry.controller.signal,
          headers: { Accept: 'application/json' }
        }, options || {}));
        let data = null;
        try {
          data = await response.json();
        } catch (error) {
          if (entry.controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
          if (error.name === 'AbortError') throw error;
          // 非 JSON 错误页使用统一提示，不吞掉主动取消请求的信号。
        }
        if (this.disposed || entry.controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        if (!response.ok) {
          const error = new Error(readableError(response.status, data, writing));
          error.status = response.status;
          if (response.status === 429 || response.status === 503) {
            const seconds = Math.min(3600, Math.max(1, Number(response.headers.get('Retry-After')) || (writing ? 10 : 5)));
            error.retryAfter = seconds;
            startCooldown(seconds, writing);
          }
          throw error;
        }
        if (!data || typeof data !== 'object') throw new Error('返回的内容暂时无法显示，请刷新列表重试。');
        return data;
      } catch (error) {
        if (entry.timedOut) throw new Error(writing ? '暂时未收到发表结果，内容已保留。请先刷新列表确认，再尝试提交。' : '加载超时，请稍后重试。');
        if (error.name === 'AbortError' || error.status) throw error;
        if (error instanceof TypeError) throw new Error(writing ? '暂时未收到发表结果，内容已保留。可刷新列表后再试。' : '暂时无法连接，请稍后重试。');
        throw error;
      } finally {
        window.clearTimeout(timer);
        if (this.requests.get(channel) === entry) this.requests.delete(channel);
      }
    }

    showListStatus(type, message) {
      this.listStatus.replaceChildren();
      this.listStatus.hidden = false;
      if (type === 'loading') {
        const skeleton = node('div', 'zf-skeleton');
        skeleton.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < 3; index++) skeleton.append(node('span'));
        this.listStatus.append(skeleton);
      } else {
        const mark = node('span', 'zf-empty-mark', type === 'error' ? '…' : '✎');
        mark.setAttribute('aria-hidden', 'true');
        this.listStatus.append(mark);
      }
      const emptyPage = type === 'empty' && this.total > 0;
      const title = type === 'loading' ? '正在加载…' : type === 'error' ? '暂时无法加载' : emptyPage ? (this.isMessage ? '这一页暂无留言' : '这一页暂无评论') : this.isMessage ? '这里还没有留言' : '还没有评论';
      this.listStatus.append(node('p', 'zf-state-title', title));
      if (type !== 'loading') {
        this.listStatus.append(node('p', 'zf-state-description', message || (emptyPage ? '列表可能已更新，可以返回第一页查看。' : this.isMessage ? '留下一个问候，或分享你的建议。' : '写下你的想法，开启这篇文章的第一条讨论。')));
        const action = button(type === 'error' ? '重新加载' : emptyPage ? '返回第一页' : this.isMessage ? '写下第一条留言' : '写下第一条评论', type === 'error' ? 'retry-list' : emptyPage ? 'page' : 'focus-form', 'zf-button zf-button--soft');
        if (emptyPage) action.dataset.page = '1';
        this.listStatus.append(action);
      }
      this.updateControls();
    }

    async loadList(args) {
      if (this.disposed || this.unavailable) return;
      args = args || { reset: true, page: this.page };
      if (remaining(readUntil)) {
        this.retryArgs = args;
        this.showListStatus('error', '加载得有点快，请在倒计时结束后重试。');
        return;
      }
      const version = ++this.listVersion;
      this.retryArgs = args;
      this.loadingList = true;
      if (args.reset) {
        this.requests.forEach((entry, key) => { if (key.indexOf('replies:') === 0) entry.controller.abort(); });
        this.replyLoading.clear();
      }
      this.showListStatus('loading');
      const params = new URLSearchParams();
      params.set('page_size', '30');
      params.set('page', String(args.page || 1));
      if (!this.isMessage) params.set('article_key', this.articleKey);
      try {
        const data = await this.request((this.isMessage ? '/messages?' : '/comments?') + params.toString(), null, 'list');
        if (this.disposed || version !== this.listVersion) return;
        if (!Array.isArray(data.items)) throw new Error('返回的列表暂时无法显示，请稍后重试。');
        const incoming = data.items.map(value => {
          const item = row(value);
          if (!this.isMessage) {
            item.replies = mergeRows((Array.isArray(value.replies) ? value.replies : []).map(row), this.localReplies(item.id), false);
            item.has_more_replies = Boolean(value.has_more_replies && value.next_reply_cursor);
            item.next_reply_cursor = value.next_reply_cursor || null;
          }
          return item;
        });
        const responsePage = Number(data.page);
        const serverTotal = Number(data.total);
        if (!Number.isSafeInteger(responsePage) || responsePage < 1 ||
            !Number.isSafeInteger(serverTotal) || serverTotal < 0) {
          throw new Error('返回的列表暂时无法显示，请稍后重试。');
        }
        incoming.forEach(item => this.pending.delete(String(item.id)));
        const pendingRecords = remembered(this.pending);
        const total = pendingRecords.length ? Math.max(serverTotal, this.total) : serverTotal;
        const lastPage = Math.max(1, Math.ceil(total / 30));
        if (responsePage > lastPage) {
          this.loadList({ reset: true, page: lastPage, scrollToList: Boolean(args.scrollToList) });
          return;
        }
        this.page = responsePage;
        const pending = this.page === 1 ? pendingRecords.map(item => this.isMessage ? item : Object.assign({}, item, {
            replies: this.localReplies(item.id), has_more_replies: false, next_reply_cursor: null
        })) : [];
        const combined = new Map(pending.map(item => [String(item.id), item]));
        incoming.forEach(item => combined.set(String(item.id), item));
        this.records = mergeRows([], Array.from(combined.values()), true).slice(0, 30);
        this.total = total;
        this.totalPages = Math.ceil(this.total / 30);
        this.renderList();
        this.listStatus.hidden = this.records.length > 0;
        if (!this.records.length) this.showListStatus('empty');
        this.announcement.textContent = '已加载第 ' + this.page + ' 页' + (this.isMessage ? '留言。' : '评论。');
        if (args.scrollToList) {
          this.root.querySelector('.zf-discussion').scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'
          });
          this.root.querySelector('[data-feedback-list-heading]').focus({ preventScroll: true });
        }
      } catch (error) {
        if (!this.disposed && version === this.listVersion && error.name !== 'AbortError') this.showListStatus('error', error.message);
      } finally {
        if (!this.disposed && version === this.listVersion) {
          this.loadingList = false;
          this.updateControls();
        }
      }
    }

    localReplies(rootId) {
      const pending = this.pendingReplies.get(String(rootId));
      return pending ? remembered(pending) : [];
    }

    renderItem(record, reply, rootId) {
      const item = node('article', 'zf-item');
      item.dataset.recordId = String(record.id);
      if (reply) item.setAttribute('role', 'listitem');
      const body = node('div', 'zf-item-body');
      const meta = node('div', 'zf-meta');
      meta.append(node('span', 'zf-nickname', record.nickname));
      if (reply && record.reply_to_nickname) meta.append(node('span', 'zf-reply-to', '回复 ' + record.reply_to_nickname));
      const time = node('time', 'zf-time', dateLabel(record.created_at));
      time.dateTime = record.created_at;
      meta.append(time);
      if ((this.own.get(String(record.id)) || 0) > Date.now()) meta.append(node('span', 'zf-own', '刚刚发表'));
      body.append(meta, node('p', 'zf-item-content', record.content));
      if (!this.isMessage) {
        const footer = node('div', 'zf-item-footer');
        const replyButton = button('回复', 'reply');
        replyButton.dataset.commentId = String(record.id);
        replyButton.dataset.rootId = String(rootId || record.id);
        replyButton.setAttribute('aria-label', '回复 ' + record.nickname);
        footer.append(replyButton);
        body.append(footer);
      }
      item.append(body);
      return item;
    }

    renderList() {
      const elements = this.records.map(record => {
        const wrapper = node('div', this.isMessage ? 'zf-message' : 'zf-thread');
        wrapper.setAttribute('role', 'listitem');
        wrapper.append(this.renderItem(record, false, record.id));
        if (!this.isMessage && (record.replies.length || record.has_more_replies || record.reply_error)) {
          const replies = node('div', 'zf-replies');
          replies.setAttribute('role', 'list');
          replies.setAttribute('aria-label', record.nickname + ' 的评论回复');
          record.replies.forEach(reply => replies.append(this.renderItem(reply, true, record.id)));
          if (record.reply_error) replies.append(node('p', 'zf-inline-error', record.reply_error));
          if (record.has_more_replies) {
            const more = node('div', 'zf-reply-more');
            const moreButton = button(record.reply_error ? '重新加载回复' : '查看更多回复', 'more-replies');
            moreButton.dataset.rootId = String(record.id);
            more.append(moreButton);
            replies.append(more);
          }
          wrapper.append(replies);
        }
        return wrapper;
      });
      this.list.replaceChildren.apply(this.list, elements);
      this.count.hidden = false;
      this.count.textContent = '共 ' + this.total + ' 条';
      if (this.pagination) this.renderPagination();
      this.updateControls();
    }

    renderPagination() {
      const existingJump = this.pagination.querySelector('.zf-page-jump');
      this.pagination.replaceChildren();
      this.pagination.hidden = this.totalPages < 1;
      if (this.totalPages < 1) return;
      const addPage = (label, page, unavailable, current) => {
        const item = button(label, 'page', 'zf-button');
        item.dataset.page = String(page);
        item.dataset.unavailable = String(Boolean(unavailable || current));
        item.setAttribute('aria-label', label === String(page) ? '第 ' + page + ' 页' : label);
        if (current) item.setAttribute('aria-current', 'page');
        this.pagination.append(item);
      };
      addPage('上一页', this.page - 1, this.page <= 1, false);
      const pages = new Set([1, this.totalPages]);
      let start = 1;
      let end = this.totalPages;
      if (this.totalPages > 7) {
        if (this.page <= 4) end = 5;
        else if (this.page >= this.totalPages - 3) start = this.totalPages - 4;
        else { start = this.page - 1; end = this.page + 1; }
      }
      for (let page = start; page <= end; page++) pages.add(page);
      let previous = 0;
      Array.from(pages).sort((a, b) => a - b).forEach(page => {
        if (previous && page - previous === 2) addPage(String(previous + 1), previous + 1, false, false);
        else if (previous && page - previous > 2) {
          const gap = node('span', 'zf-page-gap', '…');
          gap.setAttribute('aria-hidden', 'true');
          this.pagination.append(gap);
        }
        addPage(String(page), page, false, page === this.page);
        previous = page;
      });
      addPage('下一页', this.page + 1, this.page >= this.totalPages, false);
      if (this.totalPages > 1) {
        const jump = existingJump || this.createPageJump();
        const input = jump.querySelector('input');
        input.max = String(Math.min(this.totalPages, 1000000));
        // 加载楼中楼也会重新渲染列表，保留用户尚未提交的跳页输入。
        if (jump.dataset.currentPage !== String(this.page)) {
          input.value = String(this.page);
          input.removeAttribute('aria-invalid');
          jump.dataset.currentPage = String(this.page);
        }
        this.pagination.append(jump);
      }
      this.pagination.append(node('span', 'zf-page-summary', '共 ' + this.total + ' 条' + (this.isMessage ? '留言' : '主评论') + ' · 每页 30 条 · 第 ' + this.page + ' / ' + this.totalPages + ' 页'));
    }

    createPageJump() {
      const form = node('form', 'zf-page-jump');
      form.noValidate = true;
      const label = node('label', 'zf-page-jump-label');
      const input = node('input', 'zf-page-input');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '1';
      input.step = '1';
      input.required = true;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', this.isMessage ? '留言目标页码' : '评论目标页码');
      label.append(node('span', '', '跳至'), input, node('span', '', '页'));
      const submit = button('跳转', 'jump-page', 'zf-button');
      submit.type = 'submit';
      form.append(label, submit);
      input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (this.disposed || this.loadingList || remaining(readUntil)) return;
        const value = input.value.trim();
        const page = Number(value);
        const maxPage = Math.min(this.totalPages, 1000000);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(page) || page < 1 || page > maxPage) {
          this.showValidation('请输入 1 至 ' + maxPage + ' 之间的整数页码。', input);
          return;
        }
        input.removeAttribute('aria-invalid');
        if (page === this.page) return;
        this.loadList({ reset: true, page: page, scrollToList: true });
      });
      return form;
    }

    async loadReplies(rootId) {
      const thread = this.records.find(item => String(item.id) === rootId);
      if (!thread || !thread.has_more_replies || this.loadingList || this.replyLoading.has(rootId) || remaining(readUntil)) return;
      const marker = {};
      this.replyLoading.set(rootId, marker);
      thread.reply_error = '';
      this.renderList();
      const params = new URLSearchParams({ page_size: '10', cursor: thread.next_reply_cursor });
      try {
        const data = await this.request('/comments/' + encodeURIComponent(rootId) + '/replies?' + params.toString(), null, 'replies:' + rootId);
        if (this.disposed || !this.records.includes(thread) || this.replyLoading.get(rootId) !== marker) return;
        if (!Array.isArray(data.items)) throw new Error('返回的回复暂时无法显示，请稍后重试。');
        const incoming = data.items.map(row);
        thread.replies = mergeRows(thread.replies, incoming.concat(this.localReplies(thread.id)), false);
        thread.next_reply_cursor = data.next_cursor || null;
        thread.has_more_replies = Boolean(data.has_more && thread.next_reply_cursor);
        this.announcement.textContent = '已加载 ' + incoming.length + ' 条回复。';
      } catch (error) {
        if (!this.disposed && this.records.includes(thread) && this.replyLoading.get(rootId) === marker && error.name !== 'AbortError') thread.reply_error = error.message;
      } finally {
        // 旧请求不能解除同一楼层后续请求的加载标记。
        if (this.replyLoading.get(rootId) === marker) {
          this.replyLoading.delete(rootId);
          if (!this.disposed && this.records.includes(thread)) this.renderList();
        }
      }
    }

    focusForm() {
      this.form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      this.content.focus({ preventScroll: true });
    }

    onClick(event) {
      const target = event.target.closest('button[data-feedback-action]');
      if (!target || !this.root.contains(target) || target.disabled) return;
      const action = target.dataset.feedbackAction;
      if (action === 'focus-form') this.focusForm();
      else if (action === 'cancel-reply') { this.replyTarget = null; this.updateReplyContext(); }
      else if (action === 'refresh') this.loadList({ reset: true, page: this.page });
      else if (action === 'retry-list') this.loadList(this.retryArgs);
      else if (action === 'more-replies') this.loadReplies(target.dataset.rootId);
      else if (action === 'page') this.loadList({ reset: true, page: Number(target.dataset.page), scrollToList: true });
      else if (action === 'reply') {
        const root = this.records.find(item => String(item.id) === target.dataset.rootId);
        const selected = root && [root].concat(root.replies).find(item => String(item.id) === target.dataset.commentId);
        if (!selected) return;
        this.replyTarget = {
          id: selected.id, root_id: root.id, nickname: selected.nickname
        };
        this.updateReplyContext();
        this.focusForm();
      }
    }

    async onSubmit(event) {
      event.preventDefault();
      if (this.submitting || remaining(writeUntil) || this.unavailable) return;
      this.nickname.value = this.nickname.value.trim();
      this.email.value = this.email.value.trim();
      this.content.value = this.content.value.trim();
      this.onInput();
      if (!this.nickname.value) { this.showValidation('请填写昵称。', this.nickname); return; }
      if (Array.from(this.nickname.value).length > 50) { this.showValidation('昵称最多 50 个字符。', this.nickname); return; }
      if (this.email.validity.typeMismatch || this.email.value.length > 254) {
        this.showValidation('请填写正确的邮箱地址，或将邮箱留空。', this.email); return;
      }
      if (!this.content.value) { this.showValidation('请填写内容。', this.content); return; }
      if (Array.from(this.content.value).length > 2000) { this.showValidation('内容最多 2000 个字符。', this.content); return; }
      const target = this.replyTarget;
      const payload = { nickname: this.nickname.value, email: this.email.value || null, content: this.content.value };
      if (!this.isMessage) {
        payload.article_key = this.articleKey;
        if (target) payload.parent_id = target.id;
      }
      this.submitting = true;
      this.showFormStatus('');
      const reservation = startCooldown(10, true);
      this.updateControls();
      try {
        const created = row(await this.request(this.isMessage ? '/messages' : '/comments', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        }, 'submit'));
        if (this.disposed) return;
        // 新根评论/留言需要回到第一页；回复继续使用当前列表请求，并合并临时回复。
        if (this.isMessage || !target) {
          this.listVersion++;
          const oldList = this.requests.get('list');
          if (oldList) oldList.controller.abort();
          this.loadingList = false;
        }
        this.own.set(String(created.id), Date.now() + 60000);
        this.content.value = '';
        this.replyTarget = null;
        this.updateReplyContext();
        this.onInput();
        this.showFormStatus(this.isMessage ? '留言已发表。' : target ? '回复已发表。' : '评论已发表。');
        if (!this.isMessage && target) {
          const key = String(created.root_id || target.root_id);
          if (!this.pendingReplies.has(key)) this.pendingReplies.set(key, new Map());
          remember(this.pendingReplies.get(key), created);
          const thread = this.records.find(item => String(item.id) === key);
          if (thread) thread.replies = mergeRows(thread.replies, [created], false);
          else {
            // 回复目标不在当前页时，不将其他页的楼层混入当前 30 条根评论。
            this.showFormStatus('回复已发表，已保存到对应评论下。可切换页码查看。');
            this.formStatus.append(node('p', 'zf-own-preview', created.content));
          }
          this.listStatus.hidden = this.records.length > 0 && !this.loadingList;
          this.renderList();
          if (!this.loadingList && !this.records.length) this.loadList({ reset: true, page: this.page });
        } else {
          remember(this.pending, created);
          const record = this.isMessage ? created : Object.assign({}, created, { replies: [], has_more_replies: false, next_reply_cursor: null });
          this.records = mergeRows(this.page === 1 ? this.records : [], [record], true).slice(0, 30);
          this.page = 1;
          this.total++;
          this.totalPages = Math.ceil(this.total / 30);
          this.renderList();
          // 查询失败也不把已成功的发表当作失败；临时保留新记录，避免旧缓存覆盖自己的内容。
          this.loadList({ reset: true, page: 1 });
        }
      } catch (error) {
        // 后端 422 发生在创建限流之前，不消耗额度；只撤销本次预留，保留其他请求的倒计时。
        if (error.status === 422 && writeUntil === reservation) {
          writeUntil = 0;
          updateCooldown();
        } else if (error.status === 503 && writeUntil === reservation) {
          // 发表服务暂不可用时，按后端的等待时间恢复，不沿用预留的 10 秒额度。
          writeUntil = 0;
          startCooldown(error.retryAfter || 5, true);
        }
        if (!this.disposed && error.name !== 'AbortError') this.showFormStatus(error.message, 'error');
      } finally {
        if (!this.disposed) { this.submitting = false; this.updateControls(); }
      }
    }
  }

  function initialize() {
    document.querySelectorAll('[data-feedback]').forEach(root => {
      if (root.dataset.feedbackMounted === '1') return;
      root.dataset.feedbackMounted = '1';
      const controller = new Feedback(root);
      active.add(controller);
      controller.start();
    });
    if ((remaining(writeUntil) || remaining(readUntil)) && !cooldownTimer && active.size) cooldownTimer = window.setInterval(updateCooldown, 500);
  }

  function destroyAll() {
    Array.from(active).forEach(controller => controller.destroy());
    updateCooldown();
  }

  document.addEventListener('pjax:send', destroyAll);
  document.addEventListener('pjax:complete', initialize);
  document.addEventListener('pjax:error', initialize);
  window.addEventListener('pagehide', destroyAll);
  window.addEventListener('pageshow', initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
