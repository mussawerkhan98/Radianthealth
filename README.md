# Radiant Health Alliance — Medical Center Website

A full website for the clinic: public pages (departments, doctors, about,
contact), online appointment booking, a patient portal (appointments +
medical history), a doctor portal (schedule + patient notes), and a small
admin panel for managing departments and doctor accounts.

## What this is built with

- **Backend:** Node.js + Express
- **Database:** a simple JSON file (`data/db.json`) — no external database
  server to install or pay for. Good for a single clinic's traffic. If you
  outgrow it later, this can be migrated to MySQL/Postgres.
- **Frontend:** plain HTML/CSS/JS (no build step, no framework) — served
  directly by the same Express server.

## Before you go live — please read

This gives you real accounts, real logins, and a real booking system. A few
things to do before real patients use it:

1. **Change every default password immediately** (see "First login" below).
2. **Set a real `JWT_SECRET`** in your `.env` file (instructions below) —
   this is what keeps login sessions secure.
3. **Use HTTPS** — make sure your domain has an SSL certificate (Hostinger
   provides free ones) so passwords and health data aren't sent in plain text.
4. **Data protection compliance** — this stores real medical information.
   Depending on where your patients are, that may fall under data protection
   or health-data regulations (e.g. UAE's PDPL, or HIPAA-equivalent rules
   elsewhere). I'm not able to certify legal compliance — it's worth a
   professional review before real patient data goes in, covering things
   like data backups, encryption at rest, and access logging.
5. **Back up `data/db.json` regularly** — it's the only copy of your data.

## Local setup (to test before deploying)

```bash
npm install
cp .env.example .env
# then edit .env and set a real JWT_SECRET
npm run seed      # creates starting departments, doctors, and an admin account
npm start
```

Visit `http://localhost:3000`.

## First login

The seed script creates these accounts, all with the temporary password
`ChangeMe123!` — you'll be forced to set a new password the first time you
log in with any of them:

- **Admin:** `admin@radianthealthalliance.com`
- **Doctors:** `firstname.lastname@radianthealthalliance.com`
  (e.g. `amina.farouk@radianthealthalliance.com`) — see `seed.js` for the
  full list of seeded doctors, or check the Admin panel once logged in.

Log in at `/login.html`. As admin, you can add real departments and doctors
(with their own login) from `/admin.html` — remove the seeded placeholder
doctors once you've added your real team.

## Deploying to Hostinger

This needs **Node.js hosting**, not a plain static file upload (unlike your
earlier coming-soon page). In hPanel:

1. Go to **Websites → your domain → Advanced → Node.js** (on some Hostinger
   plans this is under **Hosting → Manage → Node.js**).
2. Create a new Node.js app, pointing it at this project. Set:
   - **Startup file:** `server.js`
   - **Node version:** 18 or later
3. Upload the project files (excluding `node_modules` — Hostinger will run
   `npm install` for you) via File Manager or Git.
4. In the Node.js app's environment variables section, set:
   - `JWT_SECRET` = a long random string (see `.env.example` for how to
     generate one)
5. Run the seed command once, either via Hostinger's "Run npm command"
   option if available, or via SSH: `npm run seed`
6. Start/restart the app from the Node.js panel.
7. Point your domain to this app (Hostinger usually does this automatically
   when you create the Node.js app under that domain).

If your current Hostinger plan doesn't show a Node.js option, you may need
to upgrade to a plan that includes it (Business/Cloud tiers typically do) —
your account manager or Hostinger support can confirm which plan you're on.

## Project structure

```
server.js          — the whole backend API + static file serving
db.js               — tiny JSON-file database helper
seed.js             — creates starting departments/doctors/admin
data/db.json        — your actual data (created after first run/seed)
public/             — the whole frontend (plain HTML/CSS/JS)
  index.html, departments.html, doctors.html, book.html,
  login.html, register.html, change-password.html,
  patient-dashboard.html, doctor-dashboard.html, admin.html,
  about.html, contact.html
```

## Extending this later

Reasonable next steps as the clinic grows:
- Email/SMS appointment reminders (needs an email/SMS provider — not
  included here since it requires your own account with one)
- File uploads for lab results/scans attached to a patient's record
- A real database (MySQL/Postgres) if traffic grows significantly
- Doctor-editable working hours/time off from within the doctor portal
- Admin ability to edit/deactivate doctor accounts (currently add-only)
