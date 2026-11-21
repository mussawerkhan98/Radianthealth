// admin-cms.js — Admin → Website Content and Admin → Health Insights (Blog).
// Loaded by /admin. Uses the shared helpers from app.js (API, showAlert…).
// The content editor is generated from the SECTIONS list below — to make a new
// piece of text editable, add its key to src/content.js and a field here.

const AdminCMS = (() => {
  const HL = 'Wrap words in *asterisks* to show them in the highlighted italic style.';

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => (x[k] = x[k] || {}), o)[last] = v; }

  async function uploadImage(file) {
    if (!file) return null;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error('Please choose a JPG, PNG, WEBP or GIF image.');
    if (file.size > 2 * 1024 * 1024) throw new Error('That image is larger than 2 MB. Please use a smaller one (or compress it first).');
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(file); });
    return API.post('/api/admin/media', { image: dataUrl, name: file.name });
  }

  // ================= WEBSITE CONTENT =================

  const t = (k, label, extra) => ({ k, label, type: 'text', ...extra });
  const ta = (k, label, extra) => ({ k, label, type: 'textarea', ...extra });
  const img = (k, label, extra) => ({ k, label, type: 'image', ...extra });
  const tog = (k, label, extra) => ({ k, label, type: 'toggle', ...extra });

  const SEO_PAGES = [['home', 'Home page'], ['about', 'About'], ['departments', 'Departments'], ['doctors', 'Doctors'], ['contact', 'Contact'], ['book', 'Book an appointment'], ['blog', 'Health Insights (blog)']];

  const SECTIONS = [
    { id: 'home', label: 'Home page', view: '/', groups: [
      { title: 'Hero', fields: [
        t('home.status', 'Status pill', { hint: 'Short line next to the green dot. The page adds "Slots open today" automatically when there are.' }),
        t('home.heroTitle', 'Headline', { hint: HL }),
        ta('home.heroLead', 'Intro paragraph'),
        img('home.heroImage', 'Hero photo', { hint: 'Portrait or square photo, about 1200 × 1100 px.' }),
        t('home.heroImageAlt', 'Photo description', { hint: 'Describe the photo for screen readers and Google.' }),
        t('home.heroBtnHome', 'Main button (home physiotherapy visit)'),
        t('home.heroBtnClinic', 'Second button (physiotherapy at the clinic)'),
        { k: 'home.chips', label: 'Highlight chips', type: 'strings', max: 3, hint: 'Up to three short points under the buttons.' }
      ] },
      { title: 'Physiotherapy at home', note: 'The main service section, right under the quick-access cards.', fields: [
        t('home.physioEyebrow', 'Small label above the title'),
        t('home.physioTitle', 'Title', { hint: HL }),
        ta('home.physioLead', 'Intro'),
        { k: 'home.physioConditions', label: 'What we treat', type: 'strings', max: 12, hint: 'One condition per line — shown as a ticked list.' },
        t('home.physioStepsTitle', 'Title of the "how it works" card'),
        { k: 'home.physioSteps', label: 'Home visit steps', type: 'list', max: 4, item: { title: '', text: '' }, itemLabel: 'Step', fields: [t('title', 'Title'), ta('text', 'Text')] },
        ta('home.physioNote', 'Note above the WhatsApp button')
      ] },
      { title: 'Our spaces gallery', fields: [
        tog('home.showGallery', 'Show the gallery on the home page'),
        t('home.galleryEyebrow', 'Small label above the title'),
        t('home.galleryTitle', 'Title'),
        { k: 'home.gallery', label: 'Photos', type: 'list', max: 3, item: { image: '', caption: '', alt: '' }, itemLabel: 'Photo',
          fields: [img('image', 'Photo', { hint: 'Use real photos of your clinic.' }), t('caption', 'Caption'), t('alt', 'Photo description')] }
      ] },
      { title: 'About section', fields: [t('home.aboutTitle', 'Title', { hint: HL }), ta('home.aboutText', 'Text')] },
      { title: 'Why choose us', fields: [
        t('home.whyTitle', 'Title', { hint: HL }), ta('home.whyLead', 'Intro'),
        { k: 'home.why', label: 'Reasons', type: 'list', max: 6, item: { title: '', text: '' }, itemLabel: 'Reason', fields: [t('title', 'Title'), ta('text', 'Text')] }
      ] },
      { title: 'How it works', fields: [
        t('home.stepsTitle', 'Title', { hint: HL }),
        { k: 'home.steps', label: 'Steps', type: 'list', max: 4, min: 4, item: { title: '', text: '' }, itemLabel: 'Step', fields: [t('title', 'Title'), ta('text', 'Text')] }
      ] },
      { title: 'Patient portal panel', fields: [t('home.vaultTitle', 'Title', { hint: HL }), ta('home.vaultLead', 'Text'), img('home.vaultImage', 'Photo')] },
      { title: 'Insurance section', fields: [t('home.insuranceTitle', 'Title', { hint: HL }), ta('home.insuranceText', 'Text', { hint: 'The insurer names are edited under Insurers.' })] },
      { title: 'Closing banner', fields: [t('home.ctaTitle', 'Title'), ta('home.ctaText', 'Text')] }
    ] },
    { id: 'about', label: 'About page', view: '/about', groups: [
      { title: 'Page header', fields: [t('about.heroTitle', 'Headline', { hint: HL }), ta('about.heroLead', 'Intro'), img('about.heroImage', 'Header photo')] },
      { title: 'Our story', fields: [t('about.storyTitle', 'Title', { hint: HL }), ta('about.storyText', 'Story', { rows: 8, hint: 'Leave a blank line between paragraphs.' }), img('about.storyImage', 'Photo')] },
      { title: 'Team section', fields: [t('about.teamTitle', 'Title', { hint: HL }), ta('about.teamLead', 'Intro')] },
      { title: 'Mission, approach & promise', note: 'Shown on the About page and the home page.', fields: [
        { k: 'values', label: 'Values', type: 'list', max: 3, min: 3, item: { title: '', text: '' }, itemLabel: 'Value', fields: [t('title', 'Title'), ta('text', 'Text')] }
      ] }
    ] },
    { id: 'pages', label: 'Page headers & footer', groups: [
      { title: 'Departments page', view: '/departments', fields: [t('departments.heroTitle', 'Headline', { hint: HL }), ta('departments.heroLead', 'Intro')] },
      { title: 'Doctors page', view: '/doctors', fields: [t('doctors.heroTitle', 'Headline', { hint: HL }), ta('doctors.heroLead', 'Intro')] },
      { title: 'Contact page', view: '/contact', fields: [t('contact.heroTitle', 'Headline', { hint: HL }), ta('contact.heroLead', 'Intro'),
        ta('contact.hours', 'Opening hours', { rows: 4, hint: 'One line per day range, e.g. "Mon – Fri: 8:00 AM – 8:00 PM". Leave empty to hide.' })] },
      { title: 'Book an appointment page', view: '/book', fields: [t('book.heroTitle', 'Headline', { hint: HL }), ta('book.heroLead', 'Intro')] },
      { title: 'Health Insights (blog) page', view: '/blog', fields: [t('blog.heroTitle', 'Headline', { hint: HL }), ta('blog.heroLead', 'Intro')] },
      { title: 'Footer', fields: [ta('footer.tagline', 'Footer text')] }
    ] },
    { id: 'faqs', label: 'FAQs', view: '/contact', groups: [
      { title: 'Frequently asked questions', note: 'Shown on the home page and the contact page.', fields: [
        { k: 'faqs', label: 'Questions', type: 'list', max: 30, item: { q: '', a: '' }, itemLabel: 'Question', fields: [t('q', 'Question'), ta('a', 'Answer')] }
      ] }
    ] },
    { id: 'testimonials', label: 'Testimonials', view: '/', groups: [
      { title: 'Patient testimonials', note: 'Only publish real reviews, with the patient’s permission. The section stays hidden until you switch it on and add at least one.', fields: [
        tog('home.showTestimonials', 'Show testimonials on the home page'),
        { k: 'testimonials', label: 'Reviews', type: 'list', max: 12, item: { quote: '', name: '', detail: '' }, itemLabel: 'Review',
          fields: [ta('quote', 'What they said'), t('name', 'Name (as they agreed to be shown, e.g. "Amina M.")'), t('detail', 'Detail, e.g. department visited')] }
      ] }
    ] },
    { id: 'insurers', label: 'Insurers', view: '/', groups: [
      { title: 'Accepted insurers', note: 'Only list insurers you have an agreement with. They appear as chips in the Insurance section of the home page.', fields: [
        { k: 'insurers', label: 'Insurer names', type: 'strings', max: 40 }
      ] }
    ] },
    { id: 'seo', label: 'SEO', groups: SEO_PAGES.map(([key, label]) => ({
      title: label, seo: key, fields: [
        t(`seo.${key}.title`, 'Page title', { counter: 60, hint: 'Shown in the browser tab and as the Google headline. Aim for 50–60 characters.' }),
        ta(`seo.${key}.description`, 'Meta description', { counter: 160, rows: 3, hint: 'The short summary under the Google headline. Aim for 120–160 characters.' })
      ] })) }
  ];

  const C = { content: null, defaults: null, section: 'home', dirty: false, root: null, alert: null };

  async function openContent() {
    C.root = document.getElementById('tab-content');
    if (!C.content) {
      C.root.innerHTML = '<div class="empty-state">Loading…</div>';
      try {
        const r = await API.get('/api/admin/content');
        C.content = r.content; C.defaults = r.defaults;
      } catch (e) { C.root.innerHTML = `<div class="alert alert-error show">${esc(e.message)}</div>`; return; }
    }
    renderContent();
  }

  function markDirty() {
    C.dirty = true;
    const s = document.getElementById('cmsSaveState');
    if (s) { s.textContent = 'Unsaved changes'; s.className = 'cms-state dirty'; }
  }

  function renderContent() {
    const sec = SECTIONS.find(s => s.id === C.section) || SECTIONS[0];
    C.alert = h('div', { class: 'alert', id: 'cmsAlert' });
    const nav = h('div', { class: 'cms-pills', role: 'tablist' }, SECTIONS.map(s =>
      h('button', { type: 'button', class: s.id === sec.id ? 'active' : '', role: 'tab', 'aria-selected': s.id === sec.id ? 'true' : 'false',
        onclick: () => { C.section = s.id; renderContent(); } }, s.label)));

    const groups = sec.groups.map(g => {
      const card = h('div', { class: 'card cms-group' },
        h('div', { class: 'cms-group-head' }, h('h4', { text: g.title }),
          (g.view || (sec.view && sec.groups.length === 1)) ? h('a', { class: 'cms-view', href: g.view || sec.view, target: '_blank', rel: 'noopener' }, 'View page ↗') : null),
        g.note ? h('p', { class: 'cms-note', text: g.note }) : null,
        g.fields.map(f => renderField(f, C.content, f.k)),
        g.seo ? seoPreview(g.seo) : null);
      return card;
    });

    const bar = h('div', { class: 'cms-savebar' },
      h('span', { id: 'cmsSaveState', class: 'cms-state' + (C.dirty ? ' dirty' : ''), text: C.dirty ? 'Unsaved changes' : 'All changes saved' }),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'cmsSave', onclick: saveContent }, 'Save changes'));

    C.root.replaceChildren(
      h('h2', { text: 'Website Content' }),
      h('p', { text: 'Edit the texts, photos, FAQs, testimonials and SEO titles shown on the public website. Changes go live within about a minute of saving.' }),
      nav, C.alert, ...groups, bar);
  }

  function hintEl(f) { return f.hint ? h('small', { class: 'cms-hint', text: f.hint }) : null; }

  function renderField(f, obj, path) {
    const val = getPath(obj, path);
    const id = 'cf_' + path.replace(/[^a-z0-9]/gi, '_') + '_' + Math.random().toString(36).slice(2, 6);
    const set = v => { setPath(obj, path, v); markDirty(); };

    if (f.type === 'text' || f.type === 'textarea') {
      const input = f.type === 'text'
        ? h('input', { type: 'text', id, value: val || '', maxlength: 4000 })
        : h('textarea', { id, rows: f.rows || 3, maxlength: 4000 }, val || '');
      const counter = f.counter ? h('small', { class: 'cms-counter' }) : null;
      const upd = () => { if (counter) { const n = input.value.length; counter.textContent = `${n} / ${f.counter}`; counter.classList.toggle('over', n > f.counter); } };
      input.addEventListener('input', () => { set(input.value); upd(); if (f.k.startsWith('seo.')) refreshSeo(); });
      upd();
      return h('div', { class: 'form-group' }, h('label', { for: id }, f.label, counter), input, hintEl(f));
    }

    if (f.type === 'toggle') {
      const box = h('input', { type: 'checkbox', id, checked: !!val, onchange: e => set(e.target.checked) });
      return h('div', { class: 'form-group cms-toggle' }, h('label', { for: id }, box, h('span', { text: f.label })), hintEl(f));
    }

    if (f.type === 'image') {
      const preview = h('img', { class: 'cms-img', alt: '' });
      const empty = h('div', { class: 'cms-img-empty', text: 'No image' });
      const show = () => { const v = getPath(obj, path); preview.style.display = v ? 'block' : 'none'; empty.style.display = v ? 'none' : 'flex'; if (v) preview.src = v; };
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', id, class: 'cms-file' });
      const status = h('small', { class: 'cms-hint' });
      file.addEventListener('change', async () => {
        const fl = file.files[0]; if (!fl) return;
        status.textContent = 'Uploading…';
        try { const r = await uploadImage(fl); set(r.url); show(); status.textContent = 'Uploaded — remember to save.'; }
        catch (e) { status.textContent = e.message; }
        file.value = '';
      });
      const defVal = getPath(C.defaults, f.k.includes('.') && !path.includes('.') ? f.k : path);
      const reset = defVal && typeof defVal === 'string'
        ? h('button', { type: 'button', class: 'btn btn-outline cms-mini', onclick: () => { set(defVal); show(); } }, 'Use default photo') : null;
      const wrap = h('div', { class: 'form-group' }, h('label', { for: id, text: f.label }),
        h('div', { class: 'cms-img-row' }, h('div', { class: 'cms-img-box' }, preview, empty),
          h('div', { class: 'cms-img-actions' },
            h('label', { class: 'btn btn-outline cms-mini', for: id }, 'Upload new photo'), file, reset, status, hintEl(f))));
      show();
      return wrap;
    }

    if (f.type === 'strings') {
      const list = Array.isArray(val) ? val : [];
      setPath(obj, path, list);
      const box = h('div', { class: 'cms-strings' });
      const draw = () => {
        box.replaceChildren(...list.map((s, i) => h('div', { class: 'cms-string' },
          h('input', { type: 'text', value: s, 'aria-label': `${f.label} ${i + 1}`, oninput: e => { list[i] = e.target.value; markDirty(); } }),
          h('button', { type: 'button', class: 'cms-icon-btn', title: 'Remove', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); markDirty(); draw(); } }, '✕'))),
        list.length < (f.max || 40) ? h('button', { type: 'button', class: 'btn btn-outline cms-mini', onclick: () => { list.push(''); markDirty(); draw(); box.querySelector('.cms-string:last-of-type input').focus(); } }, '+ Add') : null);
      };
      draw();
      return h('div', { class: 'form-group' }, h('label', { text: f.label }), hintEl(f), box);
    }

    if (f.type === 'list') {
      const list = Array.isArray(val) ? val : [];
      setPath(obj, path, list);
      const box = h('div', { class: 'cms-list' });
      const draw = () => {
        box.replaceChildren(...list.map((item, i) => h('div', { class: 'cms-item' },
          h('div', { class: 'cms-item-head' }, h('b', { text: `${f.itemLabel || 'Item'} ${i + 1}` }),
            h('span', { class: 'cms-item-tools' },
              i > 0 ? h('button', { type: 'button', class: 'cms-icon-btn', title: 'Move up', 'aria-label': 'Move up', onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; markDirty(); draw(); } }, '↑') : null,
              i < list.length - 1 ? h('button', { type: 'button', class: 'cms-icon-btn', title: 'Move down', 'aria-label': 'Move down', onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; markDirty(); draw(); } }, '↓') : null,
              list.length > (f.min || 0) ? h('button', { type: 'button', class: 'cms-icon-btn danger', title: 'Remove', 'aria-label': 'Remove', onclick: () => { if (confirm('Remove this item?')) { list.splice(i, 1); markDirty(); draw(); } } }, '✕') : null)),
          f.fields.map(sub => renderField(sub, item, sub.k)))),
        list.length < (f.max || 40) ? h('button', { type: 'button', class: 'btn btn-outline cms-mini', onclick: () => { list.push(JSON.parse(JSON.stringify(f.item))); markDirty(); draw(); } }, `+ Add ${(f.itemLabel || 'item').toLowerCase()}`) : null);
      };
      draw();
      return h('div', { class: 'form-group' }, h('label', { text: f.label }), hintEl(f), box);
    }
    return null;
  }

  function seoPreview(key) {
    const box = h('div', { class: 'cms-serp', 'data-seo-key': key });
    fillSeo(box, key);
    return h('div', { class: 'form-group' }, h('label', { text: 'Google preview' }), box);
  }
  function fillSeo(box, key) {
    const s = (C.content.seo || {})[key] || {};
    const path = key === 'home' ? '' : key === 'blog' ? 'blog' : `${key}.html`;
    box.innerHTML = `<span class="u">${esc(location.host)}${path ? ' › ' + esc(path) : ''}</span><span class="t">${esc(s.title || '')}</span><span class="d">${esc(s.description || '')}</span>`;
  }
  function refreshSeo() { document.querySelectorAll('[data-seo-key]').forEach(b => fillSeo(b, b.dataset.seoKey)); }

  async function saveContent() {
    const btn = document.getElementById('cmsSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    hideAlert(C.alert);
    try {
      const r = await API.request('/api/admin/content', { method: 'PUT', body: JSON.stringify({ content: C.content }) });
      C.content = r.content; C.dirty = false;
      renderContent();
      showAlert(document.getElementById('cmsAlert'), 'Saved. The website shows your changes within about a minute.', 'success');
    } catch (e) {
      showAlert(C.alert, e.message, 'error');
      btn.disabled = false; btn.textContent = 'Save changes';
    }
  }

  window.addEventListener('beforeunload', e => { if (C.dirty || B.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ================= BLOG =================

  const B = { posts: [], doctors: [], filter: 'all', q: '', current: null, dirty: false, root: null };

  async function openBlog() {
    B.root = document.getElementById('tab-blog');
    if (B.current) return renderEditor();
    await loadPosts();
  }

  async function loadPosts() {
    B.root.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const [posts, team] = await Promise.all([API.get('/api/admin/blog'), B.doctors.length ? null : API.get('/api/team').catch(() => ({ doctors: [] }))]);
      B.posts = posts;
      if (team) B.doctors = team.doctors || [];
    } catch (e) { B.root.innerHTML = `<div class="alert alert-error show">${esc(e.message)}</div>`; return; }
    renderList();
  }

  const statusOf = p => p.status !== 'published' ? 'draft' : p.live ? 'published' : 'scheduled';
  const STATUS_LABEL = { draft: 'Draft', published: 'Published', scheduled: 'Scheduled' };
  const fmt = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  function renderList() {
    const counts = { all: B.posts.length, published: 0, scheduled: 0, draft: 0 };
    B.posts.forEach(p => counts[statusOf(p)]++);
    const q = B.q.toLowerCase();
    const rows = B.posts.filter(p => (B.filter === 'all' || statusOf(p) === B.filter) && (!q || (p.title + ' ' + p.category + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q)));

    const head = h('div', { class: 'cms-blog-head' },
      h('div', {}, h('h2', { text: 'Health Insights (Blog)' }),
        h('p', {}, 'Articles appear at ', h('a', { href: '/blog', target: '_blank', rel: 'noopener', text: '/blog' }), ' and in Google once published. Each article gets its own page, search-engine tags and a place in the sitemap.')),
      h('button', { type: 'button', class: 'btn btn-amber', onclick: () => editPost(null) }, '+ New article'));

    const tools = h('div', { class: 'cms-blog-tools' },
      h('div', { class: 'cms-pills' }, ['all', 'published', 'scheduled', 'draft'].map(k =>
        h('button', { type: 'button', class: B.filter === k ? 'active' : '', onclick: () => { B.filter = k; renderList(); } },
          `${k === 'all' ? 'All' : STATUS_LABEL[k]} (${counts[k]})`))),
      h('input', { type: 'search', placeholder: 'Search articles…', value: B.q, 'aria-label': 'Search articles',
        oninput: e => { B.q = e.target.value; const pos = e.target.selectionStart; renderList(); const s = B.root.querySelector('.cms-blog-tools input'); s.focus(); s.setSelectionRange(pos, pos); } }));

    const list = rows.length ? h('div', { class: 'cms-posts' }, rows.map(p => {
      const st = statusOf(p);
      return h('div', { class: 'cms-post' },
        h('div', { class: 'cms-post-img' }, p.coverUrl ? h('img', { src: p.coverUrl, alt: '' }) : h('span', { text: '✎' })),
        h('div', { class: 'cms-post-main' },
          h('div', { class: 'cms-post-meta' }, h('span', { class: `cms-badge ${st}`, text: STATUS_LABEL[st] }),
            p.featured ? h('span', { class: 'cms-badge featured', text: 'Featured' }) : null,
            p.category ? h('span', { text: p.category }) : null,
            h('span', { text: st === 'draft' ? `Edited ${fmt(p.updatedAt)}` : `${st === 'scheduled' ? 'Goes live' : 'Published'} ${fmt(p.publishedAt)}` })),
          h('b', { text: p.title }),
          h('small', { text: p.excerpt || '' })),
        h('div', { class: 'cms-post-actions' },
          h('button', { type: 'button', class: 'btn btn-primary cms-mini', onclick: () => editPost(p.id) }, 'Edit'),
          h('a', { class: 'btn btn-outline cms-mini', target: '_blank', rel: 'noopener', href: p.live ? `/blog/${encodeURIComponent(p.slug)}` : `/blog/${encodeURIComponent(p.slug)}?preview=${encodeURIComponent(p.id)}` }, p.live ? 'View' : 'Preview')));
    })) : h('div', { class: 'empty-state' }, B.posts.length ? 'No articles match.' : 'No articles yet. Click “New article” to write your first one.');

    B.root.replaceChildren(head, tools, list);
  }

  async function editPost(id) {
    if (id) {
      B.root.innerHTML = '<div class="empty-state">Loading…</div>';
      try { B.current = await API.get(`/api/admin/blog/${encodeURIComponent(id)}`); }
      catch (e) { B.root.innerHTML = `<div class="alert alert-error show">${esc(e.message)}</div>`; return; }
    } else {
      B.current = { id: null, title: '', slug: '', excerpt: '', markdown: '', coverUrl: '', coverAlt: '', category: '', tags: [], authorName: '', authorDoctorId: '',
        metaTitle: '', metaDescription: '', status: 'draft', featured: false, publishedAt: null };
    }
    B.dirty = false;
    renderEditor();
    window.scrollTo(0, 0);
  }

  function toLocalInput(d) {
    if (!d) return '';
    const x = new Date(d); const pad = n => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  }

  function renderEditor() {
    const p = B.current;
    const dirty = () => { B.dirty = true; stateEl.textContent = 'Unsaved changes'; stateEl.className = 'cms-state dirty'; };
    const alert = h('div', { class: 'alert' });
    const stateEl = h('span', { class: 'cms-state', text: p.id ? 'All changes saved' : 'New article' });

    // --- main column ---
    const title = h('input', { type: 'text', id: 'bpTitle', value: p.title, maxlength: 200, placeholder: 'e.g. 7 simple ways to look after your heart', class: 'cms-title-input',
      oninput: () => { p.title = title.value; dirty(); if (!slugTouched) { slug.value = slugify(title.value); } updateSerp(); } });
    let slugTouched = !!p.id;
    const slug = h('input', { type: 'text', id: 'bpSlug', value: p.slug || '', maxlength: 100, oninput: () => { slugTouched = true; dirty(); updateSerp(); } });
    const excerpt = h('textarea', { id: 'bpExcerpt', rows: 2, maxlength: 400, oninput: () => { p.excerpt = excerpt.value; dirty(); updateSerp(); } }, p.excerpt);

    const body = h('textarea', { id: 'bpBody', class: 'cms-md', rows: 22, oninput: () => { p.markdown = body.value; dirty(); countWords(); } }, p.markdown);
    const preview = h('div', { class: 'cms-md-preview bl-body', hidden: true });
    const words = h('small', { class: 'cms-hint' });
    const countWords = () => { const n = body.value.split(/\s+/).filter(Boolean).length; words.textContent = `${n} words · about ${Math.max(1, Math.round(n / 200))} min read`; };
    countWords();

    const wrapSel = (before, after, placeholder) => {
      const s = body.selectionStart, e = body.selectionEnd; const sel = body.value.slice(s, e) || placeholder;
      body.setRangeText(before + sel + after, s, e, 'end');
      body.selectionStart = s + before.length; body.selectionEnd = s + before.length + sel.length;
      body.focus(); body.dispatchEvent(new Event('input'));
    };
    const linePrefix = prefix => {
      const s = body.selectionStart; const start = body.value.lastIndexOf('\n', s - 1) + 1;
      body.setRangeText(prefix, start, start, 'end'); body.focus(); body.dispatchEvent(new Event('input'));
    };
    const imgInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'cms-file' });
    imgInput.addEventListener('change', async () => {
      const f = imgInput.files[0]; if (!f) return;
      try {
        showAlert(alert, 'Uploading image…', 'success');
        const r = await uploadImage(f);
        const alt = (prompt('Describe the image (for screen readers and Google):', f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')) || '').replace(/[\[\]]/g, '');
        wrapSel(`\n![${alt}](${r.url})\n`, '', '');
        hideAlert(alert);
      } catch (e) { showAlert(alert, e.message, 'error'); }
      imgInput.value = '';
    });
    const tb = (label, title, fn) => h('button', { type: 'button', title, 'aria-label': title, onclick: fn }, label);
    const toolbar = h('div', { class: 'cms-md-toolbar' },
      tb('H2', 'Section heading', () => linePrefix('## ')),
      tb('H3', 'Sub-heading', () => linePrefix('### ')),
      tb('B', 'Bold', () => wrapSel('**', '**', 'bold text')),
      tb('I', 'Italic', () => wrapSel('*', '*', 'italic text')),
      tb('Link', 'Link', () => { const url = prompt('Link address (https://… or a page like /book):', 'https://'); if (url) wrapSel('[', `](${url.trim()})`, 'link text'); }),
      tb('• List', 'Bullet list', () => linePrefix('- ')),
      tb('1. List', 'Numbered list', () => linePrefix('1. ')),
      tb('“ Quote', 'Quote', () => linePrefix('> ')),
      tb('―', 'Divider', () => wrapSel('\n---\n', '', '')),
      h('label', { class: 'cms-md-imgbtn', title: 'Insert image' }, 'Image', imgInput),
      h('span', { class: 'cms-md-spacer' }),
      h('div', { class: 'cms-md-mode' },
        h('button', { type: 'button', class: 'active', onclick: e => setMode(e, false) }, 'Write'),
        h('button', { type: 'button', onclick: e => setMode(e, true) }, 'Preview')));
    async function setMode(e, prev) {
      toolbar.querySelectorAll('.cms-md-mode button').forEach(b => b.classList.toggle('active', b === e.target));
      body.hidden = prev; preview.hidden = !prev;
      if (prev) {
        preview.innerHTML = '<p>Loading preview…</p>';
        try { const r = await API.post('/api/admin/blog/preview', { markdown: body.value }); preview.innerHTML = r.html || '<p><em>Nothing written yet.</em></p>'; }
        catch (err) { preview.textContent = err.message; }
      }
    }
    const mdHelp = h('details', { class: 'cms-md-help' }, h('summary', { text: 'Formatting help' }),
      h('div', { html: '<code>## Heading</code> · <code>### Sub-heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>[link text](https://…)</code> · <code>- bullet</code> · <code>1. numbered</code> · <code>&gt; quote</code> · <code>---</code> divider · leave a blank line between paragraphs. Use ## headings to break the article into sections — they also build the “On this page” menu and help Google understand the article.' }));

    const main = h('div', { class: 'cms-ed-main' },
      h('div', { class: 'form-group' }, h('label', { for: 'bpTitle', text: 'Title' }), title),
      h('div', { class: 'form-group' }, h('label', { for: 'bpExcerpt', text: 'Summary' }), excerpt, h('small', { class: 'cms-hint', text: 'One or two sentences shown on the blog list and under the title.' })),
      h('div', { class: 'form-group' }, h('label', { for: 'bpBody', text: 'Article' }), toolbar, body, preview, h('div', { class: 'cms-md-foot' }, words, mdHelp)));

    // --- side column ---
    const statusSel = h('select', { id: 'bpStatus', onchange: () => { p.status = statusSel.value; dirty(); syncPublishBtn(); } },
      h('option', { value: 'draft', text: 'Draft (not visible)' }), h('option', { value: 'published', text: 'Published' }));
    statusSel.value = p.status;
    const date = h('input', { type: 'datetime-local', id: 'bpDate', value: toLocalInput(p.publishedAt), onchange: () => { p.publishedAt = date.value ? new Date(date.value).toISOString() : null; dirty(); } });
    const featured = h('input', { type: 'checkbox', id: 'bpFeatured', checked: p.featured, onchange: () => { p.featured = featured.checked; dirty(); } });

    const cats = [...new Set(B.posts.map(x => x.category).filter(Boolean))];
    const catList = h('datalist', { id: 'bpCatList' }, cats.map(c => h('option', { value: c })));
    const category = h('input', { type: 'text', id: 'bpCategory', list: 'bpCatList', value: p.category, maxlength: 60, placeholder: 'e.g. Heart health', oninput: () => { p.category = category.value; dirty(); } });
    const tags = h('input', { type: 'text', id: 'bpTags', value: (p.tags || []).join(', '), maxlength: 400, placeholder: 'e.g. sleep, prevention', oninput: () => { p.tags = tags.value; dirty(); } });

    const authorSel = h('select', { id: 'bpAuthorDoc', onchange: () => { p.authorDoctorId = authorSel.value; authorName.parentElement.style.display = authorSel.value ? 'none' : ''; dirty(); } },
      h('option', { value: '', text: '— Not a doctor / clinic team —' }), B.doctors.map(d => h('option', { value: d.id, text: `${d.name}${d.specialty ? ' — ' + d.specialty : ''}` })));
    authorSel.value = p.authorDoctorId || '';
    const authorName = h('input', { type: 'text', id: 'bpAuthor', value: p.authorName, maxlength: 120, placeholder: 'e.g. Radiant Health editorial team', oninput: () => { p.authorName = authorName.value; dirty(); } });

    const coverImg = h('img', { alt: '' });
    const coverEmpty = h('div', { class: 'cms-img-empty', text: 'No cover photo' });
    const showCover = () => { coverImg.style.display = p.coverUrl ? 'block' : 'none'; coverEmpty.style.display = p.coverUrl ? 'none' : 'flex'; if (p.coverUrl) coverImg.src = p.coverUrl; removeCover.style.display = p.coverUrl ? '' : 'none'; };
    const coverFile = h('input', { type: 'file', id: 'bpCover', accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'cms-file' });
    const coverStatus = h('small', { class: 'cms-hint', text: 'Wide photo, about 1600 × 900 px, under 2 MB.' });
    coverFile.addEventListener('change', async () => {
      const f = coverFile.files[0]; if (!f) return;
      coverStatus.textContent = 'Uploading…';
      try { const r = await uploadImage(f); p.coverUrl = r.url; dirty(); showCover(); coverStatus.textContent = 'Uploaded.'; }
      catch (e) { coverStatus.textContent = e.message; }
      coverFile.value = '';
    });
    const removeCover = h('button', { type: 'button', class: 'btn btn-outline cms-mini', onclick: () => { p.coverUrl = ''; dirty(); showCover(); } }, 'Remove');
    const coverAlt = h('input', { type: 'text', id: 'bpCoverAlt', value: p.coverAlt, maxlength: 200, placeholder: 'Describe the photo', oninput: () => { p.coverAlt = coverAlt.value; dirty(); } });

    const metaTitle = h('input', { type: 'text', id: 'bpMetaTitle', value: p.metaTitle, maxlength: 120, placeholder: 'Defaults to the article title', oninput: () => { p.metaTitle = metaTitle.value; dirty(); updateSerp(); } });
    const metaDesc = h('textarea', { id: 'bpMetaDesc', rows: 3, maxlength: 320, placeholder: 'Defaults to the summary', oninput: () => { p.metaDescription = metaDesc.value; dirty(); updateSerp(); } }, p.metaDescription);
    const mtCount = h('small', { class: 'cms-counter' }); const mdCount = h('small', { class: 'cms-counter' });
    const serp = h('div', { class: 'cms-serp' });
    function updateSerp() {
      const ttl = metaTitle.value || (title.value ? `${title.value} — Radiant Health Alliance` : 'Article title');
      const desc = metaDesc.value || excerpt.value || 'Your summary appears here.';
      serp.innerHTML = `<span class="u">${esc(location.host)} › blog › ${esc(slug.value || slugify(title.value) || 'article')}</span><span class="t">${esc(ttl)}</span><span class="d">${esc(desc)}</span>`;
      mtCount.textContent = `${ttl.length} / 60`; mtCount.classList.toggle('over', ttl.length > 60);
      mdCount.textContent = `${desc.length} / 160`; mdCount.classList.toggle('over', desc.length > 160);
    }

    const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => save() }, 'Save');
    const publishBtn = h('button', { type: 'button', class: 'btn btn-amber', onclick: () => save(p.status === 'published' ? undefined : 'published') });
    function syncPublishBtn() { publishBtn.textContent = p.status === 'published' ? 'Update' : 'Publish'; saveBtn.textContent = p.status === 'published' ? 'Save' : 'Save draft'; }
    syncPublishBtn();
    const previewLink = h('a', { class: 'btn btn-outline', target: '_blank', rel: 'noopener', style: p.id ? '' : 'display:none' }, p.live ? 'View live' : 'Preview');
    const setPreviewHref = () => { if (!p.id) return; previewLink.style.display = ''; previewLink.textContent = p.live ? 'View live' : 'Preview'; previewLink.href = `/blog/${encodeURIComponent(p.slug)}${p.live ? '' : `?preview=${encodeURIComponent(p.id)}`}`; };
    setPreviewHref();

    const side = h('div', { class: 'cms-ed-side' },
      h('div', { class: 'card cms-group' }, h('h4', { text: 'Publishing' }),
        h('div', { class: 'form-group' }, h('label', { for: 'bpStatus', text: 'Status' }), statusSel),
        h('div', { class: 'form-group' }, h('label', { for: 'bpDate', text: 'Publish date' }), date, h('small', { class: 'cms-hint', text: 'Leave empty to publish now. A future date schedules the article.' })),
        h('div', { class: 'form-group cms-toggle' }, h('label', { for: 'bpFeatured' }, featured, h('span', { text: 'Feature at the top of the blog' }))),
        h('div', { class: 'cms-ed-actions' }, saveBtn, publishBtn, previewLink)),
      h('div', { class: 'card cms-group' }, h('h4', { text: 'Cover photo' }),
        h('div', { class: 'cms-img-box wide' }, coverImg, coverEmpty),
        h('div', { class: 'cms-img-actions row' }, h('label', { class: 'btn btn-outline cms-mini', for: 'bpCover' }, 'Upload'), coverFile, removeCover), coverStatus,
        h('div', { class: 'form-group' }, h('label', { for: 'bpCoverAlt', text: 'Photo description' }), coverAlt)),
      h('div', { class: 'card cms-group' }, h('h4', { text: 'Organise' }),
        h('div', { class: 'form-group' }, h('label', { for: 'bpCategory', text: 'Category' }), category, catList),
        h('div', { class: 'form-group' }, h('label', { for: 'bpTags', text: 'Tags' }), tags, h('small', { class: 'cms-hint', text: 'Separate with commas.' })),
        h('div', { class: 'form-group' }, h('label', { for: 'bpAuthorDoc', text: 'Written by (doctor)' }), authorSel, h('small', { class: 'cms-hint', text: 'Links the article to the doctor’s profile — good for trust and SEO.' })),
        h('div', { class: 'form-group', style: p.authorDoctorId ? 'display:none' : '' }, h('label', { for: 'bpAuthor', text: 'Author name' }), authorName)),
      h('div', { class: 'card cms-group' }, h('h4', { text: 'Search engines (SEO)' }),
        h('div', { class: 'form-group' }, h('label', { for: 'bpSlug', text: 'Web address' }), h('div', { class: 'cms-slug' }, h('span', { text: '/blog/' }), slug)),
        h('div', { class: 'form-group' }, h('label', { for: 'bpMetaTitle' }, 'SEO title', mtCount), metaTitle),
        h('div', { class: 'form-group' }, h('label', { for: 'bpMetaDesc' }, 'Meta description', mdCount), metaDesc),
        h('div', { class: 'form-group' }, h('label', { text: 'Google preview' }), serp)),
      p.id ? h('button', { type: 'button', class: 'btn btn-danger', onclick: del }, 'Delete article') : null);
    showCover(); updateSerp();

    async function save(forceStatus) {
      if (!title.value.trim()) { showAlert(alert, 'Please give the article a title.', 'error'); title.focus(); return; }
      if (forceStatus === 'published' && !body.value.trim()) { showAlert(alert, 'Please write the article before publishing.', 'error'); return; }
      const payload = {
        title: title.value, slug: slug.value || title.value, excerpt: excerpt.value, markdown: body.value,
        coverUrl: p.coverUrl, coverAlt: coverAlt.value, category: category.value, tags: tags.value,
        authorDoctorId: authorSel.value, authorName: authorName.value, metaTitle: metaTitle.value, metaDescription: metaDesc.value,
        status: forceStatus || statusSel.value, featured: featured.checked, publishedAt: date.value ? new Date(date.value).toISOString() : null
      };
      [saveBtn, publishBtn].forEach(b => { b.disabled = true; });
      try {
        const r = p.id ? await API.patch(`/api/admin/blog/${encodeURIComponent(p.id)}`, payload) : await API.post('/api/admin/blog', payload);
        B.current = r; B.dirty = false;
        const idx = B.posts.findIndex(x => x.id === r.id);
        if (idx >= 0) B.posts[idx] = r; else B.posts.unshift(r);
        renderEditor();
        const msg = r.status !== 'published' ? 'Draft saved.' : r.live ? 'Published — the article is live.' : 'Scheduled — it goes live on the publish date.';
        showAlert(B.root.querySelector('.alert'), msg, 'success');
      } catch (e) {
        showAlert(alert, e.message, 'error');
        [saveBtn, publishBtn].forEach(b => { b.disabled = false; });
      }
    }

    async function del() {
      if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
      try {
        await API.del(`/api/admin/blog/${encodeURIComponent(p.id)}`);
        B.current = null; B.dirty = false;
        await loadPosts();
      } catch (e) { showAlert(alert, e.message, 'error'); }
    }

    const back = h('button', { type: 'button', class: 'btn btn-outline cms-mini', onclick: async () => {
      if (B.dirty && !confirm('Leave without saving your changes?')) return;
      B.current = null; B.dirty = false; await loadPosts();
    } }, '← All articles');

    B.root.replaceChildren(
      h('div', { class: 'cms-ed-top' }, back, stateEl),
      h('h2', { text: p.id ? 'Edit article' : 'New article' }),
      alert,
      h('div', { class: 'cms-ed' }, main, side));
  }

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  }

  return { openContent, openBlog };
})();
