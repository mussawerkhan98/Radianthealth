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
    if (file.size > 4 * 1024 * 1024) {
      return reject(new Error('Please choose an image under 4MB.'));
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
    else if (user.role === 'staff') portalLink = '<a href="staff-dashboard.html">Staff Portal</a>';
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

function requireRole(role) {
  const user = API.user();
  if (!user || user.role !== role) {
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
