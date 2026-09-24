// scripts/backfill-phone-keys.js — gives existing patients their Patient ID
// (normalized phone). Runs on every build; only touches patients without one.
// If two patients share a phone, the older keeps it and the other is listed
// so the clinic can fix it in Admin → Patients.
require('dotenv').config();
const prisma = require('../src/db');
const { normalizePhone } = require('../src/phone');

(async () => {
  const todo = await prisma.patient.findMany({ where: { phoneKey: null }, orderBy: { createdAt: 'asc' } });
  let set = 0; const clashes = [];
  for (const p of todo) {
    const key = normalizePhone(p.phone);
    if (!key) continue;
    const taken = await prisma.patient.findUnique({ where: { phoneKey: key } });
    if (taken) { clashes.push(`${p.name} <${p.email}> shares ${key} with ${taken.name}`); continue; }
    await prisma.patient.update({ where: { id: p.id }, data: { phoneKey: key } });
    set++;
  }
  console.log(`Patient IDs: ${set} filled in${todo.length - set ? `, ${todo.length - set} without a usable/unique phone` : ''}.`);
  clashes.forEach(c => console.log('  needs attention:', c));
  await prisma.$disconnect();
})().catch(e => { console.error('Backfill failed:', e.message); process.exit(1); });
