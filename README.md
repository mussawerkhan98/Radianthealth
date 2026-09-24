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
