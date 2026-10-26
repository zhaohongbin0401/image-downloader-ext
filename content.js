// content.js — 扫描当前页面所有图片并回传给 popup

(function () {
  if (window.__imgHelperInjected) return;
  window.__imgHelperInjected = true;

  function resolve(url, base) {
    if (!url) return '';
    try {
      return new URL(url, base || location.href).href;
    } catch {
      return url;
    }
  }

  function collectFromAttrs(node, base) {
    const urls = new Set();
    const attrs = ['src', 'data-src', 'data-original', 'data-lazy', 'data-srcset', 'data-actualsrc', 'data-image'];
    attrs.forEach(a => {
      const v = node.getAttribute(a);
      if (v) {
        v.split(',').forEach(s => {
          const u = s.trim().split(' ')[0]; // srcset 取第一段
          if (u) urls.add(resolve(u, base));
        });
      }
    });
    return [...urls];
  }

  function collectBackground(node, base) {
    try {
      const bg = getComputedStyle(node).backgroundImage || '';
      const matches = bg.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];
      return matches.map(m => {
        const u = m.slice(4, -1).replace(/^['"]|['"]$/g, '');
        return resolve(u, base);
      });
    } catch { return []; }
  }

  function scan() {
    const seen = new Set();
    const out = [];
    const nodes = document.querySelectorAll('img, source, [style*="background-image"]');
    nodes.forEach(n => {
      let arr = [];
      if (n.tagName === 'IMG') {
        arr = [...new Set([...collectFromAttrs(n), n.currentSrc, n.src].filter(Boolean))];
      } else if (n.tagName === 'SOURCE') {
        arr = collectFromAttrs(n);
      } else {
        arr = collectBackground(n);
      }
      arr.forEach(u => {
        if (!u || seen.has(u)) return;
        if (!/^https?:/i.test(u)) return; // 过滤 data: blob: 等
        seen.add(u);
        out.push({ url: u, width: n.naturalWidth || 0, height: n.naturalHeight || 0 });
      });
    });
    return out;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'scanImages') {
      try {
        const list = scan();
        sendResponse({ ok: true, count: list.length, images: list });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    }
    return true;
  });
})();
