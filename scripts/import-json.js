// scripts/import-json.js — copies everything from the OLD site's
// data/db.json into the Turso database. Keeps the same ids and password hashes,
// so every existing login keeps working. Safe to re-run (skips rows that
// already exist).
//
//   npm run import:json                 (reads ./data/db.json)
//   npm run import:json -- path/to/db.json
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/db');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'db.json'));
const toDate = v => (v ? new Date(v) : undefined);

async function main() {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = k => (Array.isArray(db[k]) ? db[k] : []);
  const result = {};
  const run = async (label, model, rows) => {
    if (!rows.length) { result[label] = 0; return; }
    let n = 0;
    for (const data of rows) {
      try { await model.create({ data }); n++; }
      catch (e) { if (e.code !== 'P2002') throw e; } // already imported
    }
    result[label] = n;
  };

  await run('departments', prisma.department, arr('departments').map((d, i) => ({
    id: d.id, name: d.name, description: d.description || '', icon: d.icon || 'stethoscope', sortOrder: i
  })));

  await run('doctors', prisma.doctor, arr('doctors').map(d => ({
    id: d.id, name: d.name, departmentId: d.departmentId, specialty: d.specialty || '', bio: d.bio || '',
    photo: d.photo || null, email: String(d.email).toLowerCase(), passwordHash: d.passwordHash,
    mustChangePassword: !!d.mustChangePassword,
    workStart: (d.workingHours && d.workingHours.start) || '09:00',
    workEnd: (d.workingHours && d.workingHours.end) || '17:00',
    slotMinutes: (d.workingHours && d.workingHours.slotMinutes) || 30,
    workingDays: (Array.isArray(d.workingDays) ? d.workingDays : [1, 2, 3, 4, 5]).join(',')
  })));

  await run('staff', prisma.staff, arr('staff').map(s => ({
    id: s.id, role: s.role === 'staff' ? 'staff' : 'admin', name: s.name, email: String(s.email).toLowerCase(),
    passwordHash: s.passwordHash, mustChangePassword: !!s.mustChangePassword
  })));

  await run('patients', prisma.patient, arr('patients').map(p => ({
    id: p.id, name: p.name, email: String(p.email).toLowerCase(), phone: p.phone || '', dob: p.dob || '',
    gender: p.gender || '', passwordHash: p.passwordHash, createdAt: toDate(p.createdAt)
  })));

  // Only one active booking per slot is allowed now; older duplicates are
  // imported as cancelled so nothing is lost.
  const seen = new Set();
  const appts = arr('appointments').map(a => {
    let status = a.status || 'confirmed';
    const k = `${a.doctorId}|${a.date}|${a.time}`;
    if (status !== 'cancelled') { if (seen.has(k)) status = 'cancelled'; else seen.add(k); }
    return { id: a.id, patientId: a.patientId, doctorId: a.doctorId, date: a.date, time: a.time,
      reason: a.reason || '', status, createdAt: toDate(a.createdAt) };
  });
  await run('appointments', prisma.appointment, appts);

  await run('records', prisma.medicalRecord, arr('records').map(r => ({
    id: r.id, patientId: r.patientId, doctorId: r.doctorId, date: r.date, diagnosis: r.diagnosis || '',
    notes: r.notes || '', prescription: r.prescription || '', createdAt: toDate(r.createdAt)
  })));

  await run('contactMessages', prisma.contactMessage, arr('contactMessages').map(m => ({
    id: m.id, name: m.name, email: m.email, message: m.message, createdAt: toDate(m.createdAt)
  })));

  await run('teamMembers', prisma.teamMember, arr('teamMembers').map((m, i) => ({
    id: m.id, name: m.name, role: m.role, bio: m.bio || '', photo: m.photo || null, sortOrder: i, createdAt: toDate(m.createdAt)
  })));

  console.log(`Imported from ${file}:`);
  console.table(result);
  console.log('Rows that already existed were skipped.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
