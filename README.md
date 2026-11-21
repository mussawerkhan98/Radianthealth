# Radiant Health Alliance — Medical Center Website

Public site (departments, doctors, about, contact), online booking, patient portal, doctor portal, front-desk staff portal, and admin panel.

## Stack

| Layer | Tech |
|---|---|
| Hosting | **Vercel** (static pages from `public/` + one serverless API function) |
| Backend | Node.js 18+ · Express 4 |
| Database | **Turso** (libSQL / SQLite in the cloud) via **Prisma ORM** |
| Frontend | Plain HTML/CSS/JS in `public/` |
| Email | Nodemailer (SMTP) — booking/cancellation notifications |

The same code also runs on any Node server or VPS (`npm start`).

### What changed from v1
- **Real database** instead of `data/db.json`: relations, indexes, and a unique index that makes double-booking impossible. Nothing is written to the server's disk, so it runs on Vercel.
- **Admin features that were broken now work** — appointments, patient reports, staff logins, site settings/SMTP, and deleting departments/doctors all had screens but no API before.
- **Security:** login/register rate-limiting, security headers, HTML-injection stripping, removed accounts lose access immediately, doctors only see their own patients, no booking in the past or outside working hours (clinic timezone), SMTP password encrypted at rest, and production refuses to start without a real `JWT_SECRET`.
- **Deleting a doctor** deactivates them (login stops, future bookings cancelled, history kept).

## Project structure

```
api/index.js              Vercel serverless entry
server.js                 entry for a normal Node server / local dev
src/app.js                all API routes
src/db.js                 Prisma client + Turso (libSQL) adapter
src/settings.js           site settings (contact info, notify emails, SMTP)
src/mailer.js             appointment emails
prisma/schema.prisma      database schema
prisma/migrations/        SQL migrations
scripts/migrate.js        applies migrations to Turso (runs on every Vercel build)
scripts/new-migration.js  generates SQL after you edit schema.prisma
scripts/seed.js           starter data for an EMPTY database (runs on build, skips if data exists)
scripts/import-json.js    copies data from an old data/db.json
scripts/smoke-test.js     end-to-end API test (use a TEST database)
public/                   the website
vercel.json               Vercel config
```

## Deploy (Turso + Vercel)

1. **Turso** → create database `radiant-health` → *Connect*: copy the **URL** (`libsql://…`) and **create a token** (read & write, no expiry).
2. **Vercel** → *Add New → Project* → import this GitHub repo. Framework preset: **Other** (`vercel.json` handles the rest).
3. **Environment variables** (Project → Settings → Environment Variables, all environments):

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | the `libsql://…` URL |
   | `TURSO_AUTH_TOKEN` | the Turso token |
   | `JWT_SECRET` | 64+ random characters |
   | `CLINIC_TZ` | `Asia/Dubai` |

4. **Deploy.** The build creates the tables and the starter data automatically. Check `https://<project>.vercel.app/api/health` → `{"ok":true}`.
5. **Domain:** Vercel → Project → Settings → Domains → add `radianthealthalliance.com` and `www.radianthealthalliance.com`. In **Hostinger → Domains → DNS**, set the records Vercel shows (usually `A @ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com`), and remove the old A/CNAME records for `@` and `www`. SSL is automatic.

## First login

Admin: `admin@radianthealthalliance.com` / `ChangeMe123!` — you'll be forced to set a new password. The seed also adds 13 placeholder doctors (same temporary password): delete them in Admin → Doctors once your real team is added.

## Managing the website (Admin panel)

- **Website Content** — every text, photo, FAQ, testimonial and insurer on the public pages, plus the Google title and description of each page. Headings accept `*asterisks*` around the highlighted italic words. Saved changes show on the site within about a minute.
- **Health Insights (Blog)** — write articles with the formatting toolbar, upload a cover photo, pick a category, tags and a doctor as the author, then save as a draft, publish, or schedule with a future date. Drafts can be previewed privately.
- **Main service: physiotherapy at home and in clinic.** The home page hero, the "Physiotherapy at home" section (conditions treated, how a home session works) and the SEO titles lead with it — all editable in Website Content. Migration `0015_physiotherapy_focus` lists Physiotherapy first, lets its doctors take home visits and fills its department page (only fields that were empty). Booking links like `/book?department=physiotherapy&visit=home` open the form ready to book.
- **Content defaults:** Website Content saves only the fields you change, so untouched texts follow the site's defaults when they are improved.
- **Types of visit** — patients choose a **Clinic visit**, **Home visit** (they enter their address) or **Video call**. Tick "Does home visits" / "Offers video appointments" per doctor (Doctors → a doctor → Working Hours); a type only appears when at least one doctor offers it.
- **Rush hours** — Admin → Appointments → *Booking options right now*: pause any type for 30 min / 1 h / 2 h / the rest of today (it reopens by itself), or switch it off until you switch it back on, plus an optional message to patients. Paused types show greyed out on the booking page with Call / WhatsApp links. Staff can still book any type from "Book for a Patient".
- **Floating Call / WhatsApp buttons** — bottom-right on every public page; each can be switched off in Site Settings → Contact Info (they use the phone and WhatsApp numbers there).
- Departments, doctors, the team page and contact details are managed in their own tabs as before.
- Staff roles need the new permissions **content.manage**, **blog.manage** and **visits.manage** (pause visit types) — Admin → Roles & Permissions. The admin role has them automatically.

### SEO

- Blog pages are rendered on the server at `/blog` and `/blog/<slug>` with the full article, canonical URL, Open Graph tags and structured data (BlogPosting + breadcrumbs), so Google sees everything without running JavaScript.
- `/sitemap.xml` (pages, departments, doctor profiles, articles), `/robots.txt` and `/blog/rss.xml` are generated automatically.
- **Clean URLs:** pages have no `.html` (`/contact`, `/book`) and detail pages use names: `/departments/cardiology`, `/doctors/dr-amina-farouk`, `/team/<name>`, `/blog/<article>`. Slugs come from the name, so renaming in Admin updates the address. Old links (`/contact.html`, `/department.html?id=…`, `/profile.html?doctor=…`) redirect to the new ones. Vercel: `cleanUrls` + rewrites in `vercel.json`; local/VPS: the same rules in `src/app.js`.
- Optional env var `SITE_URL` (e.g. `https://radianthealthalliance.com`) fixes the domain used in canonical links and the sitemap; otherwise the request's domain is used.
- After going live, add the site in **Google Search Console** and submit `https://<your-domain>/sitemap.xml`.

## Local development

```bash
npm install
cp .env.example .env     # TURSO_DATABASE_URL=file:./local.db works offline
npm run db:migrate
npm run seed
npm run dev              # http://localhost:3000
```

## Changing the database schema

1. Edit `prisma/schema.prisma`.
2. `npm run db:new-migration -- short_name` → review the new SQL file in `prisma/migrations/`.
3. `npm run db:migrate` (or just push — Vercel applies it on the next build).

## Before real patients use it

- Change every default password; keep `JWT_SECRET` and the Turso token secret.
- Turso keeps point-in-time backups on paid plans; on the free plan, export regularly (`turso db shell radiant-health .dump > backup.sql`).
- This stores medical information. UAE PDPL / DHA / DOH health-data rules may apply (data residency, access logging, retention). Get a professional compliance review.

## Next steps this setup makes easy
- Move photos from base64-in-database to Vercel Blob / Cloudflare R2.
- SMS/WhatsApp reminders, doctor-editable hours and time off, lab result uploads, audit log.
