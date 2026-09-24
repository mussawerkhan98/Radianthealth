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

  let portalLink = '<a href="login.html">Log In</a>';
  if (user) {
    if (user.role === 'patient') portalLink = '<a href="patient-dashboard.html">My Account</a>';
    else if (user.role === 'doctor') portalLink = '<a href="doctor-dashboard.html">Doctor Portal</a>';
    else if (user.role === 'staff') portalLink = '<a href="admin.html">Staff Portal</a>';
    else portalLink = '<a href="admin.html">Admin</a>';
  }

  el.innerHTML = `
    <div class="container nav-row">
      <a href="index.html" class="brand">
        <img src="assets/logo.png" alt="Radiant Health Alliance">
        <span>Radiant Health Alliance</span>
      </a>
      <button class="hamburger" id="hamburgerBtn" aria-label="Toggle menu">&#9776;</button>
      <nav class="main-nav" id="mainNav">
        <a href="index.html" ${activePage === 'home' ? 'class="active"' : ''}>Home</a>
        <a href="departments.html" ${activePage === 'departments' ? 'class="active"' : ''}>Departments</a>
        <a href="doctors.html" ${activePage === 'doctors' ? 'class="active"' : ''}>Doctors</a>
        <a href="about.html" ${activePage === 'about' ? 'class="active"' : ''}>About</a>
        <a href="contact.html" ${activePage === 'contact' ? 'class="active"' : ''}>Contact</a>
        ${portalLink}
        <a href="book.html" class="nav-cta">Book Appointment</a>
      </nav>
    </div>
  `;

  const hamburger = document.getElementById('hamburgerBtn');
  const nav = document.getElementById('mainNav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => nav.classList.toggle('open'));
  }
}

async function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;

  let phone = '+971543397906', whatsapp = '971543397906', contactEmail = 'hello@radianthealthalliance.com';
  try {
    const settings = await API.get('/api/settings');
    if (settings.phone) phone = settings.phone;
    if (settings.whatsapp) whatsapp = settings.whatsapp;
    if (settings.contactEmail) contactEmail = settings.contactEmail;
  } catch (e) { /* fall back to defaults above if settings can't be loaded */ }

  el.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <h4>Radiant Health Alliance</h4>
          <p style="color:#C6D2D8; opacity:0.85;">Compassionate care, redefining health, stronger together. A multi-department medical center for the whole family.</p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <div class="footer-contact-links">
            <a href="departments.html">Departments</a>
            <a href="doctors.html">Our Doctors</a>
            <a href="book.html">Book an Appointment</a>
            <a href="about.html">About Us</a>
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
}

// requireRole('doctor') or requireRole(['admin', 'staff'])
function requireRole(role) {
  const user = API.user();
  const allowed = Array.isArray(role) ? role : [role];
  if (!user || !allowed.includes(user.role)) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page') || '';
  renderHeader(page);
  renderFooter();
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
