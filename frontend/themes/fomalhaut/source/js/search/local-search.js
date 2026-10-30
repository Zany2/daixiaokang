/* 本地全文检索：按需读取 search.xml，不调用外部搜索服务。 */
;(() => {
const initializeLocalSearch = () => {
  'use strict'

  const config = GLOBAL_CONFIG.localSearch
  if (!config) return

  const mask = document.getElementById('search-mask')
  const dialog = document.querySelector('#local-search .search-dialog')
  const input = document.querySelector('#local-search-input input')
  const results = document.getElementById('local-search-results')
  const loading = document.getElementById('loading-database')
  const loadingStatus = document.getElementById('loading-status')
  if (!mask || !dialog || !input || !results) return

  let indexPromise = null
  let searchVersion = 0
  const boundButtons = new WeakSet()
  let isOpen = false
  let closeTimer = null
  let focusTimer = null
  let previousBodyStyle = null

  const normalize = value => String(value || '').trim().toLowerCase()

  const readIndex = () => {
    if (indexPromise) return indexPromise
    indexPromise = fetch(config.path, { credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.text()
      })
      .then(source => {
        const documentXml = new DOMParser().parseFromString(source, 'text/xml')
        if (documentXml.querySelector('parsererror')) throw new Error('invalid search.xml')
        const entries = Array.from(documentXml.querySelectorAll('entry')).map(entry => ({
          title: (entry.querySelector('title')?.textContent || '').trim(),
          content: (entry.querySelector('content')?.textContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          url: (entry.querySelector('url')?.textContent || '').trim()
        })).filter(entry => entry.title && entry.url)
        loading?.remove()
        dialog.querySelector('.search-wrap')?.style.setProperty('display', 'block')
        loadingStatus.textContent = ''
        return entries
      })
      .catch(error => {
        indexPromise = null
        loadingStatus.textContent = '搜索索引加载失败，请稍后重试'
        throw error
      })
    return indexPromise
  }

  const appendHighlighted = (parent, text, keywords) => {
    let cursor = 0
    const lower = text.toLowerCase()
    while (cursor < text.length) {
      let nextPosition = -1
      let nextKeyword = ''
      keywords.forEach(keyword => {
        const position = lower.indexOf(keyword, cursor)
        if (position >= 0 && (nextPosition < 0 || position < nextPosition || (position === nextPosition && keyword.length > nextKeyword.length))) {
          nextPosition = position
          nextKeyword = keyword
        }
      })
      if (nextPosition < 0) {
        parent.append(document.createTextNode(text.slice(cursor)))
        break
      }
      if (nextPosition > cursor) parent.append(document.createTextNode(text.slice(cursor, nextPosition)))
      const mark = document.createElement('span')
      mark.className = 'search-keyword'
      mark.textContent = text.slice(nextPosition, nextPosition + nextKeyword.length)
      parent.append(mark)
      cursor = nextPosition + nextKeyword.length
    }
  }

  const excerpt = (content, keywords) => {
    const lower = content.toLowerCase()
    const positions = keywords.map(keyword => lower.indexOf(keyword)).filter(position => position >= 0)
    const first = positions.length ? Math.min(...positions) : 0
    const start = Math.max(0, first - 30)
    const end = Math.min(content.length, first + 100)
    return { text: content.slice(start, end), prefix: start > 0 ? '…' : '', suffix: end < content.length ? '…' : '' }
  }

  const render = (entries, rawQuery) => {
    const keywords = normalize(rawQuery).split(/[-\s]+/).filter(Boolean)
    results.replaceChildren()
    if (!keywords.length) return

    const matches = entries.filter(entry => {
      const haystack = `${entry.title}\n${entry.content}`.toLowerCase()
      return keywords.every(keyword => haystack.includes(keyword))
    })
    const list = document.createElement('div')
    list.className = 'search-result-list'

    matches.forEach(entry => {
      const item = document.createElement('div')
      item.className = 'local-search__hit-item'
      const link = document.createElement('a')
      const destination = new URL(entry.url, location.origin)
      destination.searchParams.set('highlight', keywords.join(' '))
      link.href = destination.href
      link.className = 'search-result-title'
      appendHighlighted(link, entry.title, keywords)
      item.append(link)
      if (entry.content) {
        const part = excerpt(entry.content, keywords)
        const description = document.createElement('p')
        description.className = 'search-result'
        description.append(document.createTextNode(part.prefix))
        appendHighlighted(description, part.text, keywords)
        description.append(document.createTextNode(part.suffix))
        item.append(description)
      }
      list.append(item)
    })

    if (!matches.length) {
      const empty = document.createElement('div')
      empty.id = 'local-search__hits-empty'
      empty.textContent = config.languages.hits_empty.replace(/\$\{query}/, () => rawQuery.trim())
      list.append(empty)
    }
    results.append(list)
    window.pjax?.refresh(results)
  }

  const runSearch = () => {
    const version = ++searchVersion
    const query = input.value
    if (!query.trim()) {
      results.replaceChildren()
      loadingStatus.textContent = ''
      return
    }
    loadingStatus.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>'
    readIndex().then(entries => {
      if (version === searchVersion) render(entries, query)
    }).catch(() => {}).finally(() => {
      if (version === searchVersion && indexPromise) loadingStatus.textContent = ''
    })
  }

  const closeSearch = () => {
    if (!isOpen) return
    isOpen = false
    window.clearTimeout(focusTimer)
    document.body.style.width = previousBodyStyle.width
    document.body.style.overflow = previousBodyStyle.overflow
    dialog.style.animation = 'search_close .5s'
    mask.style.animation = 'to_hide .5s'
    const finishClose = () => {
      for (const element of [dialog, mask]) {
        element.style.display = 'none'
        element.style.animation = ''
      }
      closeTimer = null
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishClose()
    else closeTimer = window.setTimeout(finishClose, 500)
  }

  const openSearch = () => {
    window.clearTimeout(closeTimer)
    closeTimer = null
    if (!isOpen) previousBodyStyle = { width: document.body.style.width, overflow: document.body.style.overflow }
    isOpen = true
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    btf.animateIn(mask, 'to_show 0.5s')
    btf.animateIn(dialog, 'titleScale 0.5s')
    window.clearTimeout(focusTimer)
    focusTimer = window.setTimeout(() => { if (isOpen) input.focus() }, 100)
    readIndex().then(() => {
      if (input.value.trim()) runSearch()
    }).catch(() => {})
  }

  const bindSearchButton = () => {
    const button = document.querySelector('#search-button > .search')
    if (!button || boundButtons.has(button)) return
    boundButtons.add(button)
    button.dataset.localSearchBound = 'true'
    button.addEventListener('click', openSearch)
  }

  input.addEventListener('input', runSearch)
  mask.addEventListener('click', closeSearch)
  document.querySelector('#local-search .search-close-button')?.addEventListener('click', closeSearch)
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') closeSearch()
  })
  document.addEventListener('pjax:complete', () => {
    closeSearch()
    bindSearchButton()
  })

  bindSearchButton()
  if (config.preload) readIndex().catch(() => {})
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeLocalSearch, { once: true })
else initializeLocalSearch()
})()
