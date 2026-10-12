(() => {
  'use strict';
  const config = window.EVENT_CONFIG || {};
  const feed = document.querySelector('#events');
  const status = document.querySelector('#status');
  const refresh = document.querySelector('#refresh');
  const count = document.querySelector('#event-count');
  let busy = false;
  let hasContent = false;
  let lastContent = '';

  function message(text, kind = '') {
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function render(events) {
    if (!Array.isArray(events)) throw new Error('讀取端傳回的格式不正確。');
    const sorted = [...events].sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime) || String(a.id).localeCompare(String(b.id)));
    const signature = JSON.stringify(sorted);
    if (signature === lastContent) return;
    const fragment = document.createDocumentFragment();
    sorted.forEach(event => {
      if (typeof event.markdown !== 'string' || typeof event.coverUrl !== 'string' || !Number.isFinite(Date.parse(event.createdTime))) throw new Error('活動資料不完整。');
      if (!/^(data:image\/(png|jpeg|webp|gif);base64,|https:\/\/|event-assets\/)/i.test(event.coverUrl)) throw new Error('圖片網址格式不正確。');
      const article = document.createElement('article');
      article.className = 'event';
      const header = document.createElement('header');
      header.className = 'event-header';
      const meta = document.createElement('p');
      meta.className = 'event-meta';
      const label = document.createElement('span');
      label.textContent = '活動紀錄';
      const date = document.createElement('time');
      date.dateTime = event.createdTime;
      date.textContent = '資料夾建立於 ' + new Intl.DateTimeFormat('zh-TW', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(event.createdTime));
      meta.append(label, date);
      const heading = document.createElement('h2');
      const tokens = marked.lexer(event.markdown.replace(/^\uFEFF/, ''));
      const firstHeading = tokens.findIndex(token => token.type === 'heading' && token.depth === 1);
      if (firstHeading >= 0) {
        const title = document.createElement('div');
        title.innerHTML = DOMPurify.sanitize(marked.parseInline(tokens[firstHeading].text));
        heading.textContent = title.textContent;
        tokens.splice(firstHeading, 1);
      } else heading.textContent = event.name;
      header.append(meta, heading);
      const figure = document.createElement('figure');
      figure.className = 'cover-wrap';
      const image = document.createElement('img');
      image.className = 'cover';
      image.src = event.coverUrl;
      image.alt = heading.textContent + ' 活動封面';
      image.loading = fragment.childElementCount ? 'lazy' : 'eager';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        const note = document.createElement('p');
        note.className = 'cover-error';
        note.textContent = '封面暫時無法顯示，請稍後重新整理。';
        figure.replaceChildren(note);
      });
      figure.append(image);
      const report = document.createElement('div');
      report.className = 'report';
      report.innerHTML = DOMPurify.sanitize(marked.parser(tokens), {FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'], FORBID_ATTR: ['style']});
      report.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
      article.append(header, figure, report);
      fragment.append(article);
    });
    if (!sorted.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '目前沒有活動報導。活動資料夾第一層須同時有「封面圖片.png」與「活動報導.md」。';
      fragment.append(empty);
    }
    feed.replaceChildren(fragment);
    count.textContent = sorted.length + ' 篇活動紀錄 · 最新在前';
    lastContent = signature;
    hasContent = true;
  }

  function loadLive() {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(config.endpoint);
        if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw new Error();
      } catch (_) { reject(new Error('請設定有效的 Google Apps Script /exec 網址。')); return; }
      const callback = 'airEvents_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const cleanup = () => {
        clearTimeout(timeout);
        script.remove();
        // 延遲的回應在逾時後仍可能執行；留下空回呼避免未捕捉例外。
        window[callback] = () => {};
        setTimeout(() => { delete window[callback]; }, 60000);
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Google Drive 連線逾時，請稍後重試。')); }, 45000);
      window[callback] = payload => {
        cleanup();
        if (!payload || payload.ok !== true) reject(new Error(payload?.error || 'Google Drive 讀取失敗。'));
        else resolve(payload);
      };
      script.onerror = () => { cleanup(); reject(new Error('無法連線讀取端，請確認已部署為「所有人」可存取。')); };
      url.searchParams.set('callback', callback);
      url.searchParams.set('_', String(Date.now()));
      script.src = url.href;
      document.head.append(script);
    });
  }

  async function update() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    feed.setAttribute('aria-busy', 'true');
    try {
      if (!config.endpoint) {
        if (!hasContent) {
          const response = await fetch('event-assets/initial-events.json', {cache: 'no-store'});
          if (!response.ok) throw new Error('初始活動資料載入失敗。');
          render((await response.json()).events);
        }
        message('目前顯示 2026/10/13 的活動快照；Google Drive 即時連線尚未啟用。', 'setup');
        return;
      }
      message('正在同步 Google Drive…');
      const payload = await loadLive();
      render(payload.events);
      message('已連線 Google Drive · 更新於 ' + new Intl.DateTimeFormat('zh-TW', {timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}).format(new Date()) + ' · 每分鐘自動更新');
    } catch (error) {
      message(error.message + (hasContent ? ' 目前保留上次成功載入的內容。' : ' 請點擊重新整理重試。'), 'error');
    } finally {
      busy = false;
      refresh.disabled = false;
      feed.setAttribute('aria-busy', 'false');
    }
  }
  refresh.addEventListener('click', update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && config.endpoint) update(); });
  setInterval(() => { if (!document.hidden && config.endpoint) update(); }, Math.max(60000, Number(config.refreshIntervalMs) || 60000));
  update();
})();
