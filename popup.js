// popup.js — 弹窗逻辑：扫描 → 渲染缩略图 → 批量下载

const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const selAllEl = document.getElementById('selAll');
const filterEl = document.getElementById('filter');
const refreshBtn = document.getElementById('refresh');
const downloadBtn = document.getElementById('download');

let allImages = [];
let selected = new Set();

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function fileExt(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/\.([a-z0-9]{2,5})(?:\?|$)/);
    return m ? m[1] : 'jpg';
  } catch { return 'jpg'; }
}

function suggestName(url, idx) {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').filter(Boolean);
    const last = path[path.length - 1] || ('img' + idx);
    const safe = last.replace(/[^\w.\-]/g, '_').slice(0, 80);
    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(safe)) return safe;
    return safe + '.' + fileExt(url);
  } catch { return 'img' + idx + '.' + fileExt(url); }
}

function render() {
  const kw = filterEl.value.trim().toLowerCase();
  const filtered = kw ? allImages.filter(x => x.url.toLowerCase().includes(kw)) : allImages;
  countEl.textContent = filtered.length + ' / ' + allImages.length;

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty">' + (allImages.length ? '没有匹配的图片' : '当前页面未扫描到图片') + '</div>';
    refreshBtn.disabled = false;
    downloadBtn.disabled = !selected.size;
    return;
  }

  listEl.innerHTML = filtered.map((item, i) => {
    const sel = selected.has(item.url) ? ' selected' : '';
    return '<div class="item' + sel + '" data-url="' + item.url + '">' +
      '<img loading="lazy" src="' + item.url + '" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'err\',textContent:\'加载失败\'}))" />' +
    '</div>';
  }).join('');

  document.querySelectorAll('.item').forEach(d => {
    d.addEventListener('click', () => {
      const u = d.dataset.url;
      if (selected.has(u)) { selected.delete(u); d.classList.remove('selected'); }
      else { selected.add(u); d.classList.add('selected'); }
      selAllEl.checked = filtered.every(x => selected.has(x.url));
      downloadBtn.disabled = !selected.size;
    });
  });

  selAllEl.checked = filtered.length > 0 && filtered.every(x => selected.has(x.url));
  downloadBtn.disabled = !selected.size;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function scan() {
  listEl.innerHTML = '<div class="loading">正在扫描</div>';
  refreshBtn.disabled = true;
  selected.clear();
  selAllEl.checked = false;
  downloadBtn.disabled = true;

  const tab = await getActiveTab();
  if (!tab) { toast('没有活动标签页'); refreshBtn.disabled = false; return; }
  if (!/^https?:/.test(tab.url)) { toast('当前页面不支持扫描'); listEl.innerHTML = '<div class="empty">浏览器内部页面无法扫描</div>'; refreshBtn.disabled = false; return; }

  // 确保 content.js 已注入
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {}

  try {
    const res = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'scanImages' }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(resp);
      });
    });
    if (!res || !res.ok) throw new Error((res && res.error) || '扫描失败');
    allImages = res.images;
    if (!allImages.length) {
      toast('未发现图片（可能是懒加载，滚动页面后再点重新扫描）');
    }
  } catch (e) {
    allImages = [];
    toast('扫描失败：' + e.message);
  }
  render();
  refreshBtn.disabled = false;
}

async function downloadSelected() {
  const urls = [...selected];
  if (!urls.length) return;
  downloadBtn.disabled = true;
  downloadBtn.textContent = '下载中 0/' + urls.length;
  let ok = 0, idx = 0;

  for (const u of urls) {
    idx++;
    try {
      await new Promise((resolve) => {
        chrome.downloads.download(
          { url: u, filename: 'imgs/' + suggestName(u, idx), conflictAction: 'uniquify', saveAs: false },
          () => { ok++; resolve(); }
        );
      });
    } catch {}
    downloadBtn.textContent = '下载中 ' + idx + '/' + urls.length;
    await new Promise(r => setTimeout(r, 180));
  }

  downloadBtn.textContent = '批量下载';
  toast('完成：' + ok + ' / ' + urls.length);
}

selAllEl.addEventListener('change', () => {
  const kw = filterEl.value.trim().toLowerCase();
  const filtered = kw ? allImages.filter(x => x.url.toLowerCase().includes(kw)) : allImages;
  filtered.forEach(x => {
    if (selAllEl.checked) selected.add(x.url);
    else selected.delete(x.url);
  });
  render();
});
filterEl.addEventListener('input', render);
refreshBtn.addEventListener('click', scan);
downloadBtn.addEventListener('click', downloadSelected);

scan();
