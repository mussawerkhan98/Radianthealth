// scripts/new-migration.js — after editing prisma/schema.prisma, generates the
// SQL for the change by comparing against the current Turso database.
//   npm run db:new-migration -- add_doctor_phone
// Review the generated file, then run `npm run db:migrate`.
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createClient } = require('@libsql/client');
const { dbConfig } = require('../src/db');

(async () => {
  const name = (process.argv[2] || 'change').replace(/[^a-z0-9_]/gi, '_');
  // Snapshot the live schema into a temp SQLite file so Prisma can diff it.
  const db = createClient(dbConfig());
  const rows = (await db.execute(`SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_rha_%'`)).rows;
  const tmp = path.join(os.tmpdir(), `rha-shadow-${Date.now()}.db`);
  const local = createClient({ url: 'file:' + tmp });
  for (const r of rows) await local.execute(r.sql);
  local.close(); db.close();
  const sql = execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-url', 'file:' + tmp, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (!sql.trim() || /empty migration/i.test(sql)) return console.log('No schema changes found.');
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const next = String(fs.readdirSync(dir).filter(n => /^\d{4}_/.test(n)).length + 1).padStart(4, '0');
  const out = path.join(dir, `${next}_${name}`);
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'migration.sql'), sql);
  console.log('Created', path.relative(process.cwd(), out) + '/migration.sql — review it, then run: npm run db:migrate');
})().catch(e => { console.error(e.message); process.exit(1); });
