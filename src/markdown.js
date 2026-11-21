// src/markdown.js — a small, safe Markdown renderer for blog articles.
// All text is HTML-escaped first; only the formatting below is turned into
// tags, and links/images may only point to http(s), mailto:, tel: or
// site-relative URLs. Supported:
//   ## Heading / ### Subheading   (# is treated as ##; the page title is the h1)
//   **bold**  *italic*  `code`  [link text](https://…)  ![alt text](/api/media/…)
//   - bullet / * bullet,  1. numbered,  > quote,  --- divider,  blank line = new paragraph

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeUrl(raw) {
  const u = String(raw || '').trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
  // Site pages written as "book.html" or "/book.html?x" → clean URL "/book?x"
  const page = /^\/?([a-z0-9-]+)\.html([?#].*)?$/i.exec(u);
  if (page) return (page[1].toLowerCase() === 'index' ? '/' : '/' + page[1]) + (page[2] || '');
  if (/^assets\//i.test(u)) return '/' + u;
  if (/^(\/(?!\/)|#)/.test(u)) return u; // site-relative
  return '';
}

function slugify(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section';
}

// Inline formatting on already-escaped text.
function inline(text) {
  let s = esc(text);
  // Images first, then links (both use the escaped text; URLs are unescaped back for checking).
  const unesc = v => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const u = safeUrl(unesc(url));
    return u ? `<img src="${esc(u)}" alt="${alt}" loading="lazy">` : '';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(unesc(url));
    if (!u) return label;
    const external = /^https?:\/\//i.test(u);
    return `<a href="${esc(u)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

// Returns { html, headings: [{ level, text, id }], words }
function render(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const out = [];
  const headings = [];
  const used = new Set();
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  let quote = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.type}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { flushAll(); continue; }
    if ((m = /^(#{1,4})\s+(.+)$/.exec(line))) {
      flushAll();
      const level = Math.min(4, Math.max(2, m[1].length + (m[1].length === 1 ? 1 : 0)));
      const text = m[2].replace(/#+\s*$/, '').trim();
      let id = slugify(text); let n = 2;
      while (used.has(id)) id = `${slugify(text)}-${n++}`;
      used.add(id);
      headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushAll(); out.push('<hr>'); continue; }
    if ((m = /^\s*>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = /^\s*[-*•]\s+(.+)$/.exec(line))) {
      flushPara(); flushQuote();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = /^\s*\d+[.)]\s+(.+)$/.exec(line))) {
      flushPara(); flushQuote();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.exec(line))) { flushAll(); out.push(`<figure>${inline(line.trim())}</figure>`); continue; }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushAll();
  const words = String(markdown || '').replace(/[#>*`_\-[\]()!]/g, ' ').split(/\s+/).filter(Boolean).length;
  return { html: out.join('\n'), headings, words };
}

// Plain text (for meta descriptions / excerpts).
function plainText(markdown, max = 160) {
  const t = String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_]/g, '')
    .replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

module.exports = { render, plainText, slugify, esc };
