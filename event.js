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

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
        row = []; cell = '';
      } else cell += char;
    }
    if (quoted) throw new Error('試算表資料格式不完整，請稍後重試。');
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
  }

  function parseDate(value) {
    const match = value.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/) || value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.toISOString();
  }

  function photoUrl(value) {
    if (!value) return '';
    let url;
    try { url = new URL(value); } catch (_) { return ''; }
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (url.hostname === 'drive.google.com') {
      const id = url.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get('id');
      if (id && /^[\w-]+$/.test(id)) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600';
      return '';
    }
    return url.href;
  }

  function readEvents(text) {
    const rows = parseCsv(text.replace(/^\uFEFF/, ''));
    const normalize = value => value.trim().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
    const headers = (rows.shift() || []).map(normalize);
    const indices = ['日期', '標題', '文字(markdown)', '照片'].map(name => headers.indexOf(name));
    if (indices.some(index => index < 0)) throw new Error('無法讀取四個必要欄位，請確認試算表分享權限與欄位名稱。');
    const events = [];
    let skipped = 0;
    rows.forEach((row, index) => {
      const [date, title, markdown, photo] = indices.map(column => (row[column] || '').trim());
      if (![date, title, markdown, photo].some(Boolean)) return;
      const createdTime = parseDate(date);
      if (!createdTime || !title || !markdown) { skipped += 1; return; }
      events.push({id: String(index + 2).padStart(10, '0'), title, createdTime, markdown, coverUrl: photoUrl(photo)});
    });
    return {events, skipped};
  }

  function render(events) {
    const sorted = [...events].sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime) || a.id.localeCompare(b.id));
    const signature = JSON.stringify(sorted);
    if (signature === lastContent) return;
    const fragment = document.createDocumentFragment();
    sorted.forEach(event => {
      const article = document.createElement('article');
      article.className = 'event';
      const header = document.createElement('header');
      header.className = 'event-header';
      const meta = document.createElement('p');
      meta.className = 'event-meta';
      const label = document.createElement('span');
      label.textContent = '活動紀錄';
      const date = document.createElement('time');
      date.dateTime = event.createdTime.slice(0, 10);
      date.textContent = new Intl.DateTimeFormat('zh-TW', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(event.createdTime));
      meta.append(label, date);
      const heading = document.createElement('h2');
      heading.textContent = event.title;
      header.append(meta, heading);
      const figure = document.createElement('figure');
      figure.className = 'cover-wrap';
      if (event.coverUrl) {
        const image = document.createElement('img');
        image.className = 'cover';
        image.src = event.coverUrl;
        image.alt = event.title + ' 活動封面';
        image.loading = fragment.childElementCount ? 'lazy' : 'eager';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => {
          const note = document.createElement('p');
          note.className = 'cover-error';
          note.textContent = '照片暫時無法顯示，請稍後重新整理。';
          figure.replaceChildren(note);
          // 下一次同步即使文字未變也會重新嘗試載入圖片。
          lastContent = '';
        });
        figure.append(image);
      } else {
        const note = document.createElement('p');
        note.className = 'cover-error';
        note.textContent = '尚未提供活動照片';
        figure.append(note);
      }
      const report = document.createElement('div');
      report.className = 'report';
      report.innerHTML = DOMPurify.sanitize(marked.parse(event.markdown.replace(/^\uFEFF/, '')), {FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'], FORBID_ATTR: ['style']});
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
      empty.textContent = '目前沒有活動報導。';
      fragment.append(empty);
    }
    feed.replaceChildren(fragment);
    count.textContent = sorted.length + ' 篇活動紀錄 · 最新在前';
    lastContent = signature;
    hasContent = true;
  }

  async function loadLive() {
    if (!/^[\w-]+$/.test(config.sheetId || '')) throw new Error('活動試算表設定不正確。');
    const url = new URL('https://docs.google.com/spreadsheets/d/' + config.sheetId + '/gviz/tq');
    url.searchParams.set('tqx', 'out:csv');
    url.searchParams.set('headers', '1');
    url.searchParams.set('_', String(Date.now()));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {cache: 'no-store', credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw new Error('無法讀取試算表，請確認已開放所有人查看。');
      return readEvents(await response.text());
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('試算表連線逾時，請稍後重試。');
      if (error instanceof TypeError) throw new Error('無法連線 Google Sheets，請確認網路與試算表分享權限。');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function update() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    feed.setAttribute('aria-busy', 'true');
    try {
      message('正在同步 Google Sheets…');
      const payload = await loadLive();
      render(payload.events);
      message('已連線 Google Sheets · 更新於 ' + new Intl.DateTimeFormat('zh-TW', {timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}).format(new Date()) + ' · 每分鐘自動更新' + (payload.skipped ? ' · 已略過 ' + payload.skipped + ' 列日期、標題或文字不完整的資料' : ''));
    } catch (error) {
      message(error.message + (hasContent ? ' 目前保留上次成功載入的內容。' : ' 請點擊重新整理重試。'), 'error');
    } finally {
      busy = false;
      refresh.disabled = false;
      feed.setAttribute('aria-busy', 'false');
    }
  }
  refresh.addEventListener('click', update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  setInterval(() => { if (!document.hidden) update(); }, Math.max(60000, Number(config.refreshIntervalMs) || 60000));
  update();
})();
