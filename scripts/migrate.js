// scripts/migrate.js — applies prisma/migrations/*/migration.sql to Turso.
// (`prisma migrate deploy` can't talk to Turso directly, so we do it here.)
// Tracks applied migrations in the "_rha_migrations" table; safe to re-run.
// Runs automatically on every Vercel build (see vercel.json).
//
//   npm run db:migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { dbConfig } = require('../src/db');

async function main() {
  const db = createClient(dbConfig());
  await db.execute('CREATE TABLE IF NOT EXISTS "_rha_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)');
  const applied = new Set((await db.execute('SELECT name FROM "_rha_migrations"')).rows.map(r => r.name));
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const names = fs.readdirSync(dir).filter(n => fs.existsSync(path.join(dir, n, 'migration.sql'))).sort();
  let count = 0;
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
    console.log('Applying migration', name);
    await db.executeMultiple(`BEGIN;\n${sql}\nINSERT INTO "_rha_migrations" (name, appliedAt) VALUES ('${name}', '${new Date().toISOString()}');\nCOMMIT;`);
    count++;
  }
  console.log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
  db.close();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
