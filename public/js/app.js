// app.js — shared helpers used across every page.

const API = {
  base: '',
  token() { return localStorage.getItem('rha_token'); },
  user() {
    try { return JSON.parse(localStorage.getItem('rha_user') || 'null'); }
    catch (e) { return null; }
  },
  setSession(token, user) {
    localStorage.setItem('rha_token', token);
    localStorage.setItem('rha_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('rha_token');
    localStorage.removeItem('rha_user');
  },
  async request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = API.token();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(path, Object.assign({}, options, { headers }));
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const message = (data && data.error) || 'Something went wrong. Please try again.';
      throw new Error(message);
    }
    return data;
  },
  get(path) { return API.request(path); },
  post(path, body) { return API.request(path, { method: 'POST', body: JSON.stringify(body) }); },
  patch(path, body) { return API.request(path, { method: 'PATCH', body: JSON.stringify(body) }); },
  del(path) { return API.request(path, { method: 'DELETE' }); }
};

// Reads a <input type="file"> selection and resolves to a base64 data URL,
// or null if no file was selected. Used for doctor/team photo uploads —
// keeps the whole app dependency-free (no server-side upload library needed).
function fileToDataUrl(fileInput) {
  return new Promise((resolve, reject) => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return resolve(null);
    if (file.size > 3 * 1024 * 1024) {
      return reject(new Error('Please choose an image under 3MB.'));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Readable links to detail pages: /departments/cardiology, /doctors/dr-amina-farouk,
// /team/<name>. Falls back to the ID when no slug is known (the page still works
// and tidies the address bar once loaded).
const LINKS = {
  department: d => '/departments/' + encodeURIComponent(d.slug || d.id),
  doctor: d => '/doctors/' + encodeURIComponent(d.slug || d.id),
  team: m => '/team/' + encodeURIComponent(m.slug || m.id)
};

// Show the readable address in the browser bar (e.g. after an old
// /department?id=… link) and tell search engines it is the main URL.
function setCanonicalPath(pathname) {
  if (location.pathname !== pathname || location.search) history.replaceState(null, '', pathname + location.hash);
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = location.origin + pathname;
}

// ---------- Website content (Admin → Website Content) ----------
// Markup hooks, filled in automatically on every page:
//   data-c="about.heroTitle"        → text (supports *highlight* → <em>)
//   data-c-paras="about.storyText"  → paragraphs (blank line = new paragraph)
//   data-c-src="home.heroImage"     → <img src>
//   data-c-alt="home.heroImageAlt"  → <img alt>
//   <body data-seo="about">         → page <title> + meta description
// The HTML keeps sensible default text, so pages still read well if the API is down.
const CMS = {
  _p: null,
  load() { return this._p || (this._p = API.get('/api/content').catch(() => null)); },
  esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  rich(text) { return this.esc(text).replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>'); },
  paras(text) { return String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${this.rich(p)}</p>`).join(''); },
  get(c, path) { return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), c); },
  async apply(root) {
    const c = await this.load();
    if (!c) return null;
    root = root || document;
    root.querySelectorAll('[data-c]').forEach(el => { const v = this.get(c, el.dataset.c); if (typeof v === 'string' && v.trim()) el.innerHTML = this.rich(v); });
    root.querySelectorAll('[data-c-paras]').forEach(el => { const v = this.get(c, el.dataset.cParas); if (typeof v === 'string' && v.trim()) el.innerHTML = this.paras(v); });
    root.querySelectorAll('[data-c-src]').forEach(el => { const v = this.get(c, el.dataset.cSrc); if (typeof v === 'string' && v.trim()) el.src = v; });
    root.querySelectorAll('[data-c-alt]').forEach(el => { const v = this.get(c, el.dataset.cAlt); if (typeof v === 'string') el.alt = v; });
    const seoKey = document.body && document.body.dataset.seo;
    const seo = seoKey && c.seo && c.seo[seoKey];
    if (seo) {
      if (seo.title) document.title = seo.title;
      if (seo.description) {
        let m = document.querySelector('meta[name="description"]');
        if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
        m.content = seo.description;
      }
    }
    return c;
  }
};

function initialsOf(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Renders either a photo (if present) or an initials circle, for a
// doctor or team member object with { name, photo }.
function avatarHtml(person, extraClass) {
  const cls = 'doctor-avatar' + (extraClass ? ' ' + extraClass : '');
  if (person.photo) {
    return `<div class="${cls}" style="background:none; padding:0; overflow:hidden;"><img src="${person.photo}" alt="${person.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"></div>`;
  }
  return `<div class="${cls}">${initialsOf(person.name)}</div>`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function showAlert(el, message, type) {
  el.textContent = message;
  el.className = 'alert show ' + (type === 'error' ? 'alert-error' : 'alert-success');
}

function hideAlert(el) {
  el.classList.remove('show');
}

// Renders the header nav, adjusting login/portal links based on session.
function renderHeader(activePage) {
  const user = API.user();
  const el = document.getElementById('site-header');
  if (!el) return;

  let portalLink = '<a href="/login">Log In</a>';
  if (user) {
    if (user.role === 'patient') portalLink = '<a href="/patient-dashboard">My Account</a>';
    else if (user.role === 'doctor') portalLink = '<a href="/doctor-dashboard">Doctor Portal</a>';
    else if (user.role === 'staff') portalLink = '<a href="/admin">Staff Portal</a>';
    else portalLink = '<a href="/admin">Admin</a>';
  }

  el.innerHTML = `
    <div class="container nav-row">
      <a href="/" class="brand" aria-label="Radiant Health Alliance — home">
        <span class="brand-mark"><img src="/assets/logo.png" alt=""></span>
        <span class="brand-text"><span class="brand-name">Radiant Health</span><span class="brand-sub">Alliance Medical Center</span></span>
      </a>
      <button class="hamburger" id="hamburgerBtn" aria-label="Toggle menu">&#9776;</button>
      <nav class="main-nav" id="mainNav">
        <a href="/" ${activePage === 'home' ? 'class="active"' : ''}>Home</a>
        <a href="/departments/physiotherapy" ${/^\/departments\/physio/.test(location.pathname) ? 'class="active"' : ''}>Physiotherapy</a>
        <a href="/departments" ${activePage === 'departments' && !/^\/departments\/physio/.test(location.pathname) ? 'class="active"' : ''}>Departments</a>
        <a href="/doctors" ${activePage === 'doctors' ? 'class="active"' : ''}>Doctors</a>
        <a href="/about" ${activePage === 'about' ? 'class="active"' : ''}>About</a>
        <a href="/blog" ${activePage === 'blog' ? 'class="active"' : ''}>Insights</a>
        <a href="/contact" ${activePage === 'contact' ? 'class="active"' : ''}>Contact</a>
        ${portalLink}
        <a href="/book" class="nav-cta">Book a Session</a>
      </nav>
    </div>
  `;

  const hamburger = document.getElementById('hamburgerBtn');
  const nav = document.getElementById('mainNav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => nav.classList.toggle('open'));
  }
  renderMobileDock(activePage, portalLink);
}

// Phone-only bottom bar on public pages: WhatsApp + Book Visit, then tab links.
const DOCK_PAGES = ['home', 'departments', 'doctors', 'about', 'contact'];
function renderMobileDock(activePage, portalLink) {
  if (!DOCK_PAGES.includes(activePage) || document.getElementById('mDock')) return;
  const portalHref = (portalLink.match(/href="([^"]+)"/) || [])[1] || '/login';
  const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const tab = (page, href, label, path) =>
    `<a href="${href}"${activePage === page ? ' class="active" aria-current="page"' : ''}>${icon(path)}${label}</a>`;
  const dock = document.createElement('nav');
  dock.className = 'm-dock';
  dock.id = 'mDock';
  dock.setAttribute('aria-label', 'Quick actions');
  dock.innerHTML = `
    <div class="m-dock-actions">
      <a class="wa" href="https://wa.me/971543397906" target="_blank" rel="noopener" data-dock-wa>${icon('<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>')}WhatsApp</a>
      <a class="book" href="/book">${icon('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/>')}Book Visit</a>
    </div>
    <div class="m-dock-tabs">
      ${tab('home', '/', 'Home', '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>')}
      ${tab(/^\/departments\/physio/.test(location.pathname) ? activePage : 'physio', '/departments/physiotherapy', 'Physio', '<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>')}
      ${tab('doctors', '/doctors', 'Doctors', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>')}
      ${tab('portal', portalHref, 'Portal', '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h4"/>')}
    </div>`;
  document.body.appendChild(dock);
  document.body.classList.add('has-dock');
}

// Public site settings (phone, WhatsApp, visit types…), fetched once per page.
let _siteSettings = null;
function getSiteSettings() {
  if (!_siteSettings) _siteSettings = API.get('/api/settings').catch(() => ({}));
  return _siteSettings;
}

// Round Call + WhatsApp buttons, bottom-right of public pages.
// Admin → Site Settings → Contact Info switches each one on or off.
const FLOAT_PAGES = ['home', 'departments', 'doctors', 'about', 'contact', 'book', 'blog'];
async function renderFloatingContact(activePage) {
  if (!FLOAT_PAGES.includes(activePage) || document.getElementById('fabContact')) return;
  const s = await getSiteSettings();
  const fb = s.floatingButtons || { call: true, whatsapp: true };
  const phone = String(s.phone || '+971543397906').replace(/[^\d+]/g, '');
  const wa = String(s.whatsapp || '971543397906').replace(/\D/g, '');
  const buttons = [];
  if (fb.whatsapp !== false && wa) {
    const text = encodeURIComponent("Hello Radiant Health Alliance, I'd like to book a physiotherapy session (home or clinic).");
    buttons.push(`<a class="fab fab-wa" href="https://wa.me/${wa}?text=${text}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41"/></svg>
      <span class="fab-label">WhatsApp</span></a>`);
  }
  if (fb.call !== false && phone) {
    buttons.push(`<a class="fab fab-call" href="tel:${phone}" aria-label="Call us on ${phone}">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      <span class="fab-label">Call us</span></a>`);
  }
  if (!buttons.length) return;
  const wrap = document.createElement('div');
  wrap.id = 'fabContact';
  wrap.className = 'fab-stack';
  wrap.innerHTML = buttons.join('');
  document.body.appendChild(wrap);
}

async function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;

  let phone = '+971543397906', whatsapp = '971543397906', contactEmail = 'hello@radianthealthalliance.com';
  try {
    const settings = await getSiteSettings();
    if (settings.phone) phone = settings.phone;
    if (settings.whatsapp) whatsapp = settings.whatsapp;
    if (settings.contactEmail) contactEmail = settings.contactEmail;
  } catch (e) { /* fall back to defaults above if settings can't be loaded */ }

  el.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand"><span class="brand-mark"><img src="/assets/logo.png" alt=""></span><b>Radiant Health Alliance</b></div>
          <p data-c="footer.tagline">Compassionate care, redefining health, stronger together. A multi-specialty medical center for the whole family.</p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <div class="footer-contact-links">
            <a href="/departments">Departments</a>
            <a href="/doctors">Our Doctors</a>
            <a href="/book">Book an Appointment</a>
            <a href="/about">About Us</a>
            <a href="/blog">Health Insights</a>
          </div>
        </div>
        <div>
          <h4>Contact</h4>
          <div class="footer-contact-links">
            <a href="tel:${phone}">${phone}</a>
            <a href="https://wa.me/${whatsapp}" target="_blank" rel="noopener">WhatsApp Us</a>
            <a href="mailto:${contactEmail}">${contactEmail}</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        &copy; <span id="footerYear"></span> Radiant Health Alliance. All rights reserved.
        &nbsp;·&nbsp;
        Powered by <a href="https://www.byteflow.ae" target="_blank" rel="noopener" style="font-weight:700;">ByteFlow Technology</a>
      </div>
    </div>
  `;
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  const dockWa = document.querySelector('[data-dock-wa]');
  if (dockWa) dockWa.href = `https://wa.me/${whatsapp}`;
  CMS.apply(el);
}

// requireRole('doctor') or requireRole(['admin', 'staff'])
function requireRole(role) {
  const user = API.user();
  const allowed = Array.isArray(role) ? role : [role];
  if (!user || !allowed.includes(user.role)) {
    window.location.href = '/login';
    return null;
  }
  return user;
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page') || '';
  renderHeader(page);
  renderFooter();
  renderFloatingContact(page);
  CMS.apply();
});

// ---------- Private file viewer (doctor portal + admin) ----------
// Files need the login token, so they're fetched with it and shown from a
// temporary in-browser copy. PDFs and images preview on the page; other
// types (Word, Excel) offer a download.
async function fetchPrivateFile(id) {
  const res = await fetch(`/api/files/${id}`, { headers: { Authorization: 'Bearer ' + API.token() } });
  if (!res.ok) {
    let m = 'Could not open this file.';
    try { m = (await res.json()).error || m; } catch (e) { /* not JSON */ }
    throw new Error(m);
  }
  return res.blob();
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'file';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadPrivateFile(id, filename) {
  saveBlob(await fetchPrivateFile(id), filename);
}

async function openFileViewer(id, filename, mimeType) {
  const old = document.getElementById('fileViewer');
  if (old) old.remove();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wrap = document.createElement('div');
  wrap.id = 'fileViewer';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', filename || 'File');
  wrap.style.cssText = 'position:fixed; inset:0; z-index:1000; background:rgba(15,23,30,0.72); display:flex; align-items:center; justify-content:center; padding:16px;';
  wrap.innerHTML = `
    <div style="background:#fff; border-radius:14px; width:min(1000px,100%); height:min(90vh,100%); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.35);">
      <div style="display:flex; align-items:center; gap:0.6rem; padding:0.7rem 1rem; border-bottom:1px solid #e3e8ea;">
        <strong style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(filename)}</strong>
        <button type="button" class="btn btn-outline" data-fv-download style="padding:0.4rem 0.9rem; font-size:0.8rem;">Download</button>
        <button type="button" class="btn btn-outline" data-fv-close style="padding:0.4rem 0.9rem; font-size:0.8rem;" aria-label="Close">Close</button>
      </div>
      <div data-fv-body style="flex:1; min-height:0; background:#f3f5f6; display:flex; align-items:center; justify-content:center; overflow:auto;">
        <div style="color:#5b6b73;">Loading…</div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  let blob = null, url = null;
  const close = () => {
    wrap.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-fv-close]').addEventListener('click', close);
  wrap.querySelector('[data-fv-download]').addEventListener('click', async () => {
    try { saveBlob(blob || await fetchPrivateFile(id), filename); } catch (err) { alert(err.message); }
  });

  const body = wrap.querySelector('[data-fv-body]');
  try {
    blob = await fetchPrivateFile(id);
    const type = mimeType || blob.type || '';
    if (type === 'application/pdf' || type.startsWith('image/')) {
      url = URL.createObjectURL(new Blob([blob], { type }));
      body.innerHTML = type === 'application/pdf'
        ? `<iframe title="${esc(filename)}" src="${url}" style="width:100%; height:100%; border:0; background:#fff;"></iframe>`
        : `<img src="${url}" alt="${esc(filename)}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;">`;
    } else {
      body.innerHTML = `<div style="text-align:center; padding:2rem; color:#5b6b73;">
        <p style="margin-bottom:1rem;">This file type (${esc((filename.split('.').pop() || '').toUpperCase())}) can't be previewed in the browser.</p>
        <button type="button" class="btn btn-primary" data-fv-download2>Download to open it</button></div>`;
      body.querySelector('[data-fv-download2]').addEventListener('click', () => saveBlob(blob, filename));
    }
  } catch (err) {
    body.innerHTML = `<div style="color:#b3261e; padding:2rem; text-align:center;">${esc(err.message)}</div>`;
  }
}

// "📍 City, Country" line for a doctor (empty when not set).
function doctorLocationHtml(d) {
  const text = [d.city, d.country].filter(Boolean).join(', ');
  if (!text) return '';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<span class="doctor-location"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>${esc(text)}</span>`;
}

// ---------------------------------------------------------------------------
// Google Analytics 4 (G-DJH7NJWLTB) + conversion tracking.
// Loaded on public pages only — never on portals that show patient data.
// Events: whatsapp_click, phone_call_click, email_click, book_appointment_click,
// and book_appointment (fired from book.html after a booking succeeds).
(function () {
  var GA_ID = 'G-DJH7NJWLTB';
  var PRIVATE = /^\/(admin|doctor-dashboard|patient-dashboard|staff-dashboard|change-password|video|login|register|unsubscribe)(\.html)?(\/|$)/i;
  var path = location.pathname;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.rhaTrack = function (name, params) {
    try { if (!PRIVATE.test(location.pathname)) window.gtag('event', name, params || {}); } catch (e) { /* ignore */ }
  };
  if (PRIVATE.test(path) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);

  // One listener catches every link, including buttons added later (floating Call/WhatsApp).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var params = {
      link_url: href.split('?')[0],
      link_text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 100),
      page_path: path
    };
    if (/wa\.me|whatsapp\.com|^whatsapp:/i.test(href)) window.rhaTrack('whatsapp_click', params);
    else if (/^tel:/i.test(href)) window.rhaTrack('phone_call_click', params);
    else if (/^mailto:/i.test(href)) window.rhaTrack('email_click', params);
    else if (/^(https?:\/\/[^/]*radianthealthalliance\.com)?\/book(\.html)?(\?|#|$)/i.test(href)) window.rhaTrack('book_appointment_click', params);
  }, true);
})();
