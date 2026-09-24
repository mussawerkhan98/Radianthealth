# Radiant Health Alliance — Medical Center Website

Public site (departments, doctors, about, contact), online booking, patient portal, doctor portal, front-desk staff portal, and admin panel.

## Stack (v2)

| Layer | Tech |
|---|---|
| Backend | Node.js 18+ · Express 4 |
| Database | **PostgreSQL** via **Prisma ORM** (replaces the old `data/db.json` file) |
| Frontend | Plain HTML/CSS/JS in `public/` (unchanged look) |
| Email | Nodemailer (SMTP) — booking/cancellation notifications |
| Hosting | Works as-is on **Hostinger Node.js**, **Vercel**, or any **VPS** |

### What changed from v1
- **Real database.** All data lives in Postgres with relations, indexes and a unique constraint that makes double-booking impossible. Nothing is written to the server's disk, which is what makes Vercel/serverless possible.
- **Admin features that were broken now work.** The admin panel already had screens for appointments, patient reports, staff logins, site settings/SMTP, and deleting departments/doctors, but the old server had no API behind them (404s). All of those endpoints now exist.
- **Security hardening:** login/register rate-limiting, security headers (helmet), HTML-injection stripping on inputs, removed/deactivated accounts lose access immediately, doctors can only see patients who booked with them, no booking in the past or outside working hours (clinic timezone), SMTP password encrypted in the DB, and production refuses to start without a real `JWT_SECRET`.
- **Deleting a doctor** deactivates them: their login stops, future bookings are cancelled, past appointments and medical records are kept.
- Stray duplicate `.html` files from the repo root were removed (the real pages are in `public/`).

## Project structure

```
server.js              entry for Hostinger / VPS / local (app.listen)
api/index.js           entry for Vercel (serverless)
src/app.js             all API routes
src/db.js              Prisma client
src/settings.js        site settings (contact info, notify emails, SMTP)
src/mailer.js          appointment emails
prisma/schema.prisma   database schema
prisma/migrations/     SQL migrations (applied with `npm run db:migrate`)
scripts/seed.js        starter departments/doctors/admin for an EMPTY db
scripts/import-json.js copy data from the old data/db.json into Postgres
scripts/smoke-test.js  end-to-end API test (run against a TEST db)
public/                the website
vercel.json            Vercel config
docker-compose.yml     local/VPS Postgres
ecosystem.config.js    PM2 config for VPS
```

## 1. Create the database (once)

Use a hosted Postgres so the **same database follows you** from Hostinger → Vercel → VPS with no data migration.

1. Sign up at **neon.tech** (free tier) → create a project in a region close to your users (e.g. `AWS Asia Pacific (Singapore)` or `Europe (Frankfurt)`).
2. Copy two connection strings from *Connect*:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** (no `-pooler`) → `DIRECT_URL`

(Supabase works the same way. On a VPS you can instead run your own Postgres — see section 5.)

## 2. Run locally

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, DIRECT_URL, JWT_SECRET
npm run db:migrate            # creates the tables
npm run seed                  # ONLY for a brand-new empty database
npm run dev                   # http://localhost:3000
```

### Moving your live data from the old site
Your current live site keeps everything in `data/db.json` on Hostinger (team members, doctors, changed passwords, any patients). **Download that file first** (hPanel → File Manager → your Node app folder → `data/db.json`), then:

```bash
npm run db:migrate
npm run import:json -- path/to/downloaded/db.json
```

IDs and password hashes are kept, so every existing login keeps working. Don't run `seed` if you import. Re-running the import is safe (existing rows are skipped).

## 3. Deploy on Hostinger (Business plan — Node.js app)

1. hPanel → **Websites → Add website → Node.js Apps** (or on the existing site: *Advanced → Node.js*). Connect this GitHub repo, or upload a zip without `node_modules`.
2. Settings: **Node 20 or 22**, entry/startup file `server.js`, build command `npm run build` (if asked), start command `npm start`.
3. **Environment variables:** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `NODE_ENV=production`, `CLINIC_TZ=Asia/Dubai`.
4. Run the migration once — via Hostinger's terminal/SSH in the app folder: `npx prisma migrate deploy` (or run it from your own computer with the same `.env`; it targets the same database).
5. Import the old data (section 2) or run `npm run seed`.
6. Deploy / restart. Check `https://radianthealthalliance.com/api/health` → `{"ok":true}`.

## 4. Deploy on Vercel (later)

1. Import the GitHub repo in Vercel → Framework preset **Other**. `vercel.json` already sets build (`prisma generate && prisma migrate deploy`), output (`public`) and routes `/api/*` to the serverless API.
2. Add env vars: `DATABASE_URL` (pooled), `DIRECT_URL`, `JWT_SECRET`, `NODE_ENV=production`, `CLINIC_TZ`.
3. Deploy, then move the domain from Hostinger to Vercel (Vercel → Domains shows the DNS records to set).

Same database, so no data move. Note: Vercel limits request bodies to 4.5 MB, so photo uploads are capped at 3 MB.

## 5. Deploy on a VPS (later)

```bash
# Ubuntu: Node 22, PM2, nginx, (optional) Docker for Postgres
git clone <repo> && cd <repo>
npm ci
cp .env.example .env    # keep using Neon, or run your own Postgres:
docker compose up -d    # then DATABASE_URL=DIRECT_URL=postgresql://rha:rha_password@localhost:5432/rha
npx prisma migrate deploy
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```
Put nginx in front (`proxy_pass http://127.0.0.1:3000;`) and get SSL with `certbot --nginx`. To move data off Neon: `pg_dump "$DIRECT_URL" | psql "postgresql://…local…"`.

## First login (seeded database only)

All seeded accounts use temporary password `ChangeMe123!` and must change it on first login.
- Admin: `admin@radianthealthalliance.com`
- Doctors: `firstname.lastname@radianthealthalliance.com` (see `scripts/seed.js`)

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm run db:migrate` | Apply migrations (production-safe) |
| `npm run db:migrate:dev -- --name add_x` | After editing `schema.prisma`, create a new migration |
| `npm run db:studio` | Browse/edit the database in a web UI |
| `npm test` | API smoke test (against a **test** database — it creates test records) |

## Before real patients use it

- Set a strong `JWT_SECRET`; change every default password.
- HTTPS only (Hostinger/Vercel provide free SSL).
- Turn on **backups** (Neon has point-in-time restore; on a VPS schedule `pg_dump`).
- This stores medical information. Depending on where your patients are, UAE PDPL / DHA / DOH health-data rules may apply (e.g. data residency, access logging, retention). Get a professional compliance review before going live.

## Next steps this setup makes easy
- Move photos from base64-in-database to object storage (Cloudflare R2 / S3 / Vercel Blob) once you have many.
- SMS/WhatsApp reminders, doctor-editable working hours and time off, lab result uploads, audit log of who viewed which record.
