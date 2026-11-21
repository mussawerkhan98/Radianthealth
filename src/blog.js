// src/blog.js — Health Insights (blog) + SEO routes.
//
// Public pages are rendered on the server so search engines get the full
// article, title, description, canonical URL, Open Graph tags and JSON-LD:
//   /blog                  list (filters: ?category=, ?q=, ?page=)
//   /blog/<slug>           article
//   /sitemap.xml, /robots.txt
// On Vercel these paths are rewritten to the API function (see vercel.json).
// The /api/seo/* aliases exist for the same handlers.
//
// Admin API (permission "blog.manage"): /api/admin/blog …

const md = require('./markdown');
const slugs = require('./slugs');

const PAGE_SIZE = 9;
const STATUSES = new Set(['draft', 'published']);
const { esc } = md;

module.exports = function registerBlog(app, { prisma, wrap, perm, HttpError, newId, siteContent }) {

  // ---------- helpers ----------

  const now = () => new Date();
  const isLive = p => p.status === 'published' && p.publishedAt && p.publishedAt <= now();
  const liveWhere = () => ({ status: 'published', publishedAt: { lte: now() } });
  const readMinutes = p => Math.max(1, Math.round(md.render(p.markdown).words / 200));
  const tagList = p => String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean);

  function siteUrl(req) {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
    return `${proto}://${host}`;
  }
  const abs = (base, url) => !url ? '' : /^https?:\/\//i.test(url) ? url : `${base}/${String(url).replace(/^\/+/, '')}`;

  // "Dr. Yusuf Al Mansoori" → "YM"
  const initials = name => {
    const w = String(name || '').split(/\s+/).filter(x => x && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(x));
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  };

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

  function listOut(p) {
    return {
      id: p.id, slug: p.slug, title: p.title, excerpt: p.excerpt || md.plainText(p.markdown, 180),
      coverUrl: p.coverUrl, coverAlt: p.coverAlt, category: p.category, tags: tagList(p),
      authorName: p.authorName, featured: p.featured, publishedAt: p.publishedAt, readMinutes: readMinutes(p)
    };
  }

  async function uniqueSlug(base, exceptId) {
    let slug = md.slugify(base).slice(0, 90) || 'article';
    let n = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await prisma.blogPost.findFirst({ where: { slug, NOT: exceptId ? { id: exceptId } : undefined }, select: { id: true } })) {
      slug = `${md.slugify(base).slice(0, 85)}-${n++}`;
    }
    return slug;
  }

  // Validate + normalise admin input into BlogPost fields.
  async function postData(b, existing) {
    const data = {};
    const str = (k, max) => { if (b[k] !== undefined) data[k] = String(b[k] == null ? '' : b[k]).replace(/\r/g, '').trim().slice(0, max); };
    str('title', 200); str('excerpt', 400); str('coverAlt', 200); str('category', 60); str('authorName', 120);
    str('metaTitle', 120); str('metaDescription', 320); str('authorDoctorId', 60);
    if (b.markdown !== undefined) data.markdown = String(b.markdown || '').replace(/\r/g, '').slice(0, 100000);
    if (b.tags !== undefined) data.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(','))
      .map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12).join(', ');
    if (b.coverUrl !== undefined) {
      const u = String(b.coverUrl || '').trim();
      if (u && !/^(\/api\/media\/[A-Za-z0-9_-]+|\/?assets\/[\w./-]+|https:\/\/[^\s"'<>]+)$/.test(u)) throw new HttpError(400, 'Cover image must be an uploaded image.');
      data.coverUrl = u;
    }
    if (b.featured !== undefined) data.featured = !!b.featured;
    if (b.status !== undefined) {
      if (!STATUSES.has(b.status)) throw new HttpError(400, 'Status must be draft or published.');
      data.status = b.status;
    }
    if (b.publishedAt !== undefined) {
      if (!b.publishedAt) data.publishedAt = null;
      else {
        const d = new Date(b.publishedAt);
        if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Please enter a valid publish date.');
        data.publishedAt = d;
      }
    }
    const title = data.title !== undefined ? data.title : existing && existing.title;
    if (!title) throw new HttpError(400, 'Please give the article a title.');
    if (b.slug !== undefined || !existing) {
      const wanted = String(b.slug || '').trim() || title;
      data.slug = await uniqueSlug(wanted, existing && existing.id);
    }
    // Publishing without a date publishes now.
    const status = data.status || (existing && existing.status);
    const pub = data.publishedAt !== undefined ? data.publishedAt : existing && existing.publishedAt;
    if (status === 'published' && !pub) data.publishedAt = now();
    if (data.authorDoctorId) {
      const d = await prisma.doctor.findUnique({ where: { id: data.authorDoctorId }, select: { id: true } });
      if (!d) data.authorDoctorId = '';
    }
    return data;
  }

  const adminOut = p => ({ ...listOut(p), markdown: p.markdown, status: p.status, slug: p.slug, metaTitle: p.metaTitle,
    metaDescription: p.metaDescription, authorDoctorId: p.authorDoctorId, createdAt: p.createdAt, updatedAt: p.updatedAt,
    live: isLive(p) });

  // ---------- public JSON (home page "latest insights") ----------

  app.get('/api/blog', wrap(async (req, res) => {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || PAGE_SIZE));
    const where = liveWhere();
    if (req.query.category) where.category = String(req.query.category);
    const posts = await prisma.blogPost.findMany({ where, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take: limit });
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(posts.map(listOut));
  }));

  // ---------- admin API ----------

  app.get('/api/admin/blog', perm('blog.manage'), wrap(async (req, res) => {
    const posts = await prisma.blogPost.findMany({ orderBy: { updatedAt: 'desc' } });
    res.json(posts.map(p => { const o = adminOut(p); delete o.markdown; return o; }));
  }));

  app.get('/api/admin/blog/:id', perm('blog.manage'), wrap(async (req, res) => {
    const p = await prisma.blogPost.findUnique({ where: { id: String(req.params.id) } });
    if (!p) throw new HttpError(404, 'Article not found.');
    res.json(adminOut(p));
  }));

  app.post('/api/admin/blog', perm('blog.manage'), wrap(async (req, res) => {
    const data = await postData(req.body || {}, null);
    const p = await prisma.blogPost.create({ data: { id: newId('post'), ...data } });
    res.json(adminOut(p));
  }));

  app.patch('/api/admin/blog/:id', perm('blog.manage'), wrap(async (req, res) => {
    const existing = await prisma.blogPost.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, 'Article not found.');
    const data = await postData(req.body || {}, existing);
    const p = await prisma.blogPost.update({ where: { id: existing.id }, data });
    res.json(adminOut(p));
  }));

  app.delete('/api/admin/blog/:id', perm('blog.manage'), wrap(async (req, res) => {
    const existing = await prisma.blogPost.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
    if (!existing) throw new HttpError(404, 'Article not found.');
    await prisma.blogPost.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }));

  // Live preview for the admin editor (same renderer as the public page).
  app.post('/api/admin/blog/preview', perm('blog.manage'), wrap(async (req, res) => {
    const r = md.render(String((req.body && req.body.markdown) || '').slice(0, 100000));
    res.json({ html: r.html, words: r.words, readMinutes: Math.max(1, Math.round(r.words / 200)) });
  }));

  // ---------- server-rendered pages ----------

  const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="b-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="b-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
  <symbol id="b-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/></symbol>
  <symbol id="b-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
  <symbol id="b-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/></symbol>
  <symbol id="b-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></symbol>
  <symbol id="b-leaf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/></symbol>
</svg>`;

  // *highlight* → <em> for admin-managed headings
  const rich = t => esc(t).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  const plain = t => String(t || '').replace(/\*/g, '');

  function layout({ base, title, description, canonical, image, ogType, jsonLd, body, robots }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<base href="/">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${robots || 'index, follow, max-image-preview:large'}">
<meta property="og:site_name" content="Radiant Health Alliance">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="alternate" type="application/rss+xml" title="Radiant Health Alliance — Health Insights" href="${esc(base)}/blog/rss.xml">
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
${(jsonLd || []).map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body data-page="blog">
${ICONS}
<header class="site-header" id="site-header"></header>
<main class="sx">
${body}
</main>
<footer class="site-footer" id="site-footer"></footer>
<script src="/js/app.js"></script>
</body>
</html>`;
  }

  function card(p, { big } = {}) {
    const href = `/blog/${encodeURIComponent(p.slug)}`;
    return `<article class="bl-card${big ? ' bl-card-big' : ''}">
  <a class="bl-card-img" href="${href}" tabindex="-1" aria-hidden="true">${p.coverUrl
    ? `<img src="${esc(p.coverUrl)}" alt="" loading="lazy">`
    : '<span class="bl-card-ph"><svg width="34" height="34"><use href="#b-leaf"/></svg></span>'}</a>
  <div class="bl-card-body">
    <div class="bl-meta">${p.category ? `<span class="bl-cat">${esc(p.category)}</span>` : ''}<span><svg width="14" height="14"><use href="#b-clock"/></svg>${p.readMinutes} min read</span></div>
    <h${big ? 2 : 3} class="bl-card-title"><a href="${href}">${esc(p.title)}</a></h${big ? 2 : 3}>
    <p>${esc(p.excerpt)}</p>
    <div class="bl-card-foot"><span>${esc(fmtDate(p.publishedAt))}</span><a href="${href}" class="sx-link">Read article <svg width="16" height="16"><use href="#b-arrow"/></svg></a></div>
  </div>
</article>`;
  }

  const ctaBlock = `<section class="sx-section sx-tight"><div class="container"><div class="sx-cta">
  <h2>Have a question about your health?</h2>
  <p>Book a consultation with one of our specialists — online booking takes under two minutes.</p>
  <div class="sx-cta-actions"><a href="/book" class="sx-btn sx-btn-bronze"><svg width="18" height="18"><use href="#b-calendar"/></svg>Book an Appointment</a>
  <a href="/contact" class="sx-btn sx-btn-glass"><svg width="18" height="18"><use href="#b-chat"/></svg>Ask our front desk</a></div>
</div></div></section>`;

  const orgLd = base => ({
    '@type': 'MedicalOrganization', name: 'Radiant Health Alliance', url: base + '/',
    logo: { '@type': 'ImageObject', url: base + '/assets/logo.png' }
  });

  // ----- /blog -----
  async function blogIndex(req, res) {
    const base = siteUrl(req);
    const content = await siteContent.get(prisma);
    const category = String(req.query.category || '').slice(0, 60);
    const q = String(req.query.q || '').trim().slice(0, 80);
    const page = Math.max(1, Math.min(500, parseInt(req.query.page, 10) || 1));
    const where = liveWhere();
    if (category) where.category = category;
    if (q) where.OR = [{ title: { contains: q } }, { excerpt: { contains: q } }, { markdown: { contains: q } }, { tags: { contains: q } }];

    const [total, posts, catRows] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({ where, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      prisma.blogPost.findMany({ where: liveWhere(), select: { category: true } })
    ]);
    const categories = [...new Set(catRows.map(r => r.category).filter(Boolean))].sort();
    const items = posts.map(listOut);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const qs = o => { const p = new URLSearchParams(); if (o.category) p.set('category', o.category); if (o.q) p.set('q', o.q); if (o.page > 1) p.set('page', o.page); const s = p.toString(); return '/blog' + (s ? '?' + s : ''); };

    const seo = content.seo.blog;
    const filtered = !!(category || q || page > 1);
    const title = category ? `${category} — ${plain(seo.title)}` : page > 1 ? `${plain(seo.title)} — Page ${page}` : plain(seo.title);
    const canonical = base + qs({ category, page });
    const showFeatured = !filtered && items.length > 0;
    const featured = showFeatured ? items[0] : null;
    const rest = showFeatured ? items.slice(1) : items;

    const body = `
<section class="bl-hero">
  <div class="container">
    <nav class="bl-crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Health Insights</span></nav>
    <span class="sx-eyebrow">Health insights</span>
    <h1>${rich(content.blog.heroTitle)}</h1>
    <p class="sx-lead">${esc(content.blog.heroLead)}</p>
    <form class="bl-search" action="/blog" method="get" role="search">
      ${category ? `<input type="hidden" name="category" value="${esc(category)}">` : ''}
      <svg width="18" height="18"><use href="#b-search"/></svg>
      <input type="search" name="q" value="${esc(q)}" placeholder="Search articles…" aria-label="Search articles">
      <button type="submit" class="sx-btn sx-btn-blue">Search</button>
    </form>
    ${categories.length ? `<div class="bl-cats" role="list">
      <a role="listitem" href="${qs({ q })}" class="${!category ? 'active' : ''}">All</a>
      ${categories.map(c => `<a role="listitem" href="${qs({ category: c, q })}" class="${c === category ? 'active' : ''}">${esc(c)}</a>`).join('')}
    </div>` : ''}
  </div>
</section>
<section class="sx-section bl-list">
  <div class="container">
    ${q ? `<p class="bl-result">${total} ${total === 1 ? 'result' : 'results'} for “${esc(q)}” · <a href="${qs({ category })}">Clear search</a></p>` : ''}
    ${!items.length ? `<div class="bl-empty"><svg width="40" height="40"><use href="#b-leaf"/></svg><h2>${q || category ? 'No articles found' : 'Articles are on the way'}</h2><p>${q || category ? 'Try another search or category.' : 'Our doctors are preparing health insights. Please check back soon.'}</p>${q || category ? '<a class="sx-btn sx-btn-white" href="/blog">See all articles</a>' : ''}</div>` : ''}
    ${featured ? card(featured, { big: true }) : ''}
    ${rest.length ? `<div class="bl-grid">${rest.map(p => card(p)).join('')}</div>` : ''}
    ${pages > 1 ? `<nav class="bl-pages" aria-label="Pagination">
      ${page > 1 ? `<a href="${qs({ category, q, page: page - 1 })}" rel="prev">← Newer</a>` : '<span></span>'}
      <span>Page ${page} of ${pages}</span>
      ${page < pages ? `<a href="${qs({ category, q, page: page + 1 })}" rel="next">Older →</a>` : '<span></span>'}
    </nav>` : ''}
  </div>
</section>
${ctaBlock}`;

    const jsonLd = [
      { '@context': 'https://schema.org', '@type': 'Blog', name: plain(seo.title), description: seo.description, url: base + '/blog', publisher: orgLd(base),
        blogPost: items.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${base}/blog/${p.slug}`, datePublished: p.publishedAt })) },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: base + '/' },
        { '@type': 'ListItem', position: 2, name: 'Health Insights', item: base + '/blog' }] }
    ];
    res.set('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    res.type('html').send(layout({
      base, title, description: seo.description, canonical, image: featured && featured.coverUrl ? abs(base, featured.coverUrl) : '',
      jsonLd, body, robots: q ? 'noindex, follow' : undefined
    }));
  }

  // ----- /blog/:slug -----
  async function blogPost(req, res, next) {
    const slug = String(req.params.slug || '');
    if (slug === 'rss.xml') return rss(req, res);
    const p = await prisma.blogPost.findUnique({ where: { slug } });
    // Logged-in staff can preview drafts with ?preview=<post id>.
    const previewOk = p && req.query.preview && req.query.preview === p.id;
    if (!p || (!isLive(p) && !previewOk)) return notFound(req, res);
    const base = siteUrl(req);
    const r = md.render(p.markdown);
    const item = listOut(p);
    const canonical = `${base}/blog/${encodeURIComponent(p.slug)}`;
    const title = p.metaTitle || `${p.title} — Radiant Health Alliance`;
    const description = p.metaDescription || p.excerpt || md.plainText(p.markdown, 158);
    const image = p.coverUrl ? abs(base, p.coverUrl) : '';
    const tags = tagList(p);

    let doctor = null;
    if (p.authorDoctorId) {
      doctor = await prisma.doctor.findFirst({ where: { id: p.authorDoctorId, active: true }, select: { id: true, name: true, specialty: true, photo: true } });
    }
    const authorName = doctor ? doctor.name : p.authorName || 'Radiant Health Alliance';
    const doctorPath = doctor ? `/doctors/${encodeURIComponent((await slugs.mapFor(prisma, 'doctor')).get(doctor.id) || doctor.id)}` : '';
    const related = await prisma.blogPost.findMany({
      where: { ...liveWhere(), id: { not: p.id }, ...(p.category ? { category: p.category } : {}) },
      orderBy: { publishedAt: 'desc' }, take: 3
    });
    const relatedFill = related.length < 3 ? await prisma.blogPost.findMany({
      where: { ...liveWhere(), id: { notIn: [p.id, ...related.map(x => x.id)] } }, orderBy: { publishedAt: 'desc' }, take: 3 - related.length
    }) : [];
    const more = [...related, ...relatedFill].map(listOut);

    const toc = r.headings.filter(h => h.level === 2);
    const share = encodeURIComponent(canonical);
    const shareText = encodeURIComponent(p.title);
    const avatar = doctor && doctor.photo && doctor.photo.length < 400000
      ? `<img src="${esc(doctor.photo)}" alt="">`
      : `<span>${esc(initials(authorName))}</span>`;

    const body = `
<article class="bl-article">
<header class="bl-hero bl-post-hero">
  <div class="container bl-narrow">
    <nav class="bl-crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/blog">Health Insights</a>${p.category ? `<span>/</span><a href="/blog?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a>` : ''}</nav>
    ${!isLive(p) ? '<p class="bl-draft">Preview — this article is not published yet.</p>' : ''}
    ${p.category ? `<a class="bl-cat" href="/blog?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a>` : ''}
    <h1>${esc(p.title)}</h1>
    ${p.excerpt ? `<p class="sx-lead">${esc(p.excerpt)}</p>` : ''}
    <div class="bl-byline">
      <span class="bl-avatar">${avatar}</span>
      <span><b>${doctor ? `<a href="${doctorPath}">${esc(authorName)}</a>` : esc(authorName)}</b>
      <small>${doctor && doctor.specialty ? esc(doctor.specialty) + ' · ' : ''}<time datetime="${p.publishedAt ? p.publishedAt.toISOString() : ''}">${esc(fmtDate(p.publishedAt))}</time> · ${item.readMinutes} min read</small></span>
    </div>
  </div>
</header>
${p.coverUrl ? `<div class="container bl-cover-wrap"><img class="bl-cover" src="${esc(p.coverUrl)}" alt="${esc(p.coverAlt || p.title)}" fetchpriority="high"></div>` : ''}
<div class="container bl-layout">
  <div class="bl-body">
    ${r.html}
    ${tags.length ? `<div class="bl-tags">${tags.map(t => `<a href="/blog?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
    <p class="bl-disclaimer">This article is for general information and does not replace advice from your doctor. If you have symptoms or concerns, please book a consultation.</p>
  </div>
  <aside class="bl-side">
    ${toc.length >= 2 ? `<nav class="bl-toc" aria-label="On this page"><b>On this page</b>${toc.map(h => `<a href="/blog/${encodeURIComponent(p.slug)}#${h.id}">${esc(plain(h.text))}</a>`).join('')}</nav>` : ''}
    <div class="bl-side-card">
      <b>Talk to a specialist</b>
      <p>Book a consultation online — it takes under two minutes.</p>
      <a href="/book" class="sx-btn sx-btn-bronze"><svg width="18" height="18"><use href="#b-calendar"/></svg>Book a visit</a>
    </div>
    <div class="bl-share"><b>Share</b>
      <a href="https://wa.me/?text=${shareText}%20${share}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a href="https://twitter.com/intent/tweet?url=${share}&text=${shareText}" target="_blank" rel="noopener">X</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener">Facebook</a>
    </div>
  </aside>
</div>
</article>
${more.length ? `<section class="sx-section sx-alt"><div class="container">
  <div class="sx-head"><div><span class="sx-eyebrow">Keep reading</span><h2 class="sx-h2">More health <em>insights</em></h2></div><a class="sx-link" href="/blog">All articles <svg width="16" height="16"><use href="#b-arrow"/></svg></a></div>
  <div class="bl-grid">${more.map(x => card(x)).join('')}</div>
</div></section>` : ''}
${ctaBlock}`;

    const author = doctor
      ? { '@type': 'Person', name: doctor.name, jobTitle: doctor.specialty || undefined, url: base + doctorPath }
      : p.authorName ? { '@type': 'Person', name: p.authorName } : orgLd(base);
    const jsonLd = [
      { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title.slice(0, 110), description,
        image: image ? [image] : undefined, datePublished: p.publishedAt, dateModified: p.updatedAt,
        author, publisher: orgLd(base), mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        articleSection: p.category || undefined, keywords: tags.join(', ') || undefined, wordCount: r.words },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: base + '/' },
        { '@type': 'ListItem', position: 2, name: 'Health Insights', item: base + '/blog' },
        { '@type': 'ListItem', position: 3, name: p.title, item: canonical }] }
    ];
    res.set('Cache-Control', previewOk && !isLive(p) ? 'no-store' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    res.type('html').send(layout({ base, title, description, canonical, image, ogType: 'article', jsonLd, body,
      robots: isLive(p) ? undefined : 'noindex, nofollow' }));
  }

  function notFound(req, res) {
    const base = siteUrl(req);
    res.status(404).set('Cache-Control', 'no-store').type('html').send(layout({
      base, title: 'Article not found — Radiant Health Alliance', description: 'This article could not be found.', canonical: base + '/blog', robots: 'noindex, follow',
      body: `<section class="bl-hero"><div class="container bl-narrow"><span class="sx-eyebrow">Health insights</span><h1>We couldn't find that <em>article</em></h1>
      <p class="sx-lead">It may have been moved or unpublished.</p><a class="sx-btn sx-btn-blue" href="/blog">Browse all articles</a></div></section>`
    }));
  }

  // ----- RSS -----
  async function rss(req, res) {
    const base = siteUrl(req);
    const posts = await prisma.blogPost.findMany({ where: liveWhere(), orderBy: { publishedAt: 'desc' }, take: 30 });
    const x = s => esc(s);
    res.set('Cache-Control', 'public, max-age=0, s-maxage=600');
    res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Radiant Health Alliance — Health Insights</title><link>${x(base)}/blog</link>
<description>Health advice and clinic news from Radiant Health Alliance.</description>
${posts.map(p => `<item><title>${x(p.title)}</title><link>${x(base)}/blog/${x(p.slug)}</link><guid>${x(base)}/blog/${x(p.slug)}</guid>
<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${x(p.excerpt || md.plainText(p.markdown, 240))}</description>${p.category ? `<category>${x(p.category)}</category>` : ''}</item>`).join('\n')}
</channel></rss>`);
  }

  // ----- sitemap.xml / robots.txt -----
  async function sitemap(req, res) {
    const base = siteUrl(req);
    const [posts, depts, doctors] = await Promise.all([
      prisma.blogPost.findMany({ where: liveWhere(), select: { slug: true, updatedAt: true }, orderBy: { publishedAt: 'desc' } }),
      slugs.mapFor(prisma, 'department'),
      slugs.mapFor(prisma, 'doctor')
    ]);
    const url = (loc, extra = '') => `<url><loc>${esc(loc)}</loc>${extra}</url>`;
    const pages = ['/', '/about', '/departments', '/doctors', '/book', '/contact', '/blog'];
    res.set('Cache-Control', 'public, max-age=0, s-maxage=3600');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(pg => url(base + pg)).join('\n')}
${[...depts.values()].map(s => url(`${base}/departments/${encodeURIComponent(s)}`)).join('\n')}
${[...doctors.values()].map(s => url(`${base}/doctors/${encodeURIComponent(s)}`)).join('\n')}
${posts.map(p => url(`${base}/blog/${encodeURIComponent(p.slug)}`, `<lastmod>${p.updatedAt.toISOString()}</lastmod>`)).join('\n')}
</urlset>`);
  }

  function robots(req, res) {
    const base = siteUrl(req);
    res.set('Cache-Control', 'public, max-age=0, s-maxage=86400');
    res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /doctor-dashboard
Disallow: /patient-dashboard
Disallow: /staff-dashboard
Disallow: /change-password
Disallow: /video
Disallow: /unsubscribe
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`);
  }

  for (const prefix of ['', '/api/seo']) {
    app.get(prefix + '/blog', wrap(blogIndex));
    app.get(prefix + '/blog/rss.xml', wrap(rss));
    app.get(prefix + '/blog/:slug', wrap(blogPost));
    app.get(prefix + '/sitemap.xml', wrap(sitemap));
    app.get(prefix + '/robots.txt', robots);
  }
};
