// server.js — Radiant Health Alliance backend.
// Express + a JSON file database (see db.js). Serves the static
// frontend from /public and exposes a small REST API under /api.
//
// Photos (doctor and team) are stored as base64 data URLs directly in
// the database record — deliberately avoids adding a file-upload
// dependency, so this stays a zero-native-dependency, easy-to-redeploy app.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { readDb, writeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_BEFORE_GOING_LIVE';

if (JWT_SECRET === 'CHANGE_THIS_SECRET_BEFORE_GOING_LIVE') {
  console.warn('\n*** WARNING: Using the default JWT_SECRET. Set a real JWT_SECRET in your .env file before real patients use this site. ***\n');
}

app.use(cors());
// Raised limit (default is 100kb) so a base64-encoded photo can fit in
// a normal JSON request body.
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

function auth(requiredRoles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredRoles && !requiredRoles.includes(decoded.role)) {
        return res.status(403).json({ error: 'You do not have permission to do that.' });
      }
      req.user = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
  };
}

function isValidPhoto(photo) {
  if (photo === null || photo === undefined || photo === '') return true;
  return typeof photo === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(photo);
}

// ---------- AUTH ----------

app.post('/api/register', async (req, res) => {
  const { name, email, phone, dob, gender, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  const db = readDb();
  const emailLower = String(email).toLowerCase().trim();
  const existing = db.patients.find(p => p.email.toLowerCase() === emailLower) ||
                    db.doctors.find(d => d.email.toLowerCase() === emailLower) ||
                    db.staff.find(s => s.email.toLowerCase() === emailLower);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const patient = {
    id: newId('pt'),
    name, email: emailLower, phone: phone || '', dob: dob || '', gender: gender || '',
    passwordHash,
    createdAt: new Date().toISOString()
  };
  db.patients.push(patient);
  await writeDb(db);
  const token = signToken({ sub: patient.id, role: 'patient', name: patient.name });
  res.json({ token, user: { id: patient.id, name: patient.name, email: patient.email, role: 'patient' } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const db = readDb();
  const emailLower = String(email).toLowerCase().trim();

  const tryUser = async (user, role) => {
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return { token: signToken({ sub: user.id, role, name: user.name }),
             user: { id: user.id, name: user.name, email: user.email, role, mustChangePassword: !!user.mustChangePassword } };
  };

  const patient = db.patients.find(p => p.email.toLowerCase() === emailLower);
  const doctor = db.doctors.find(d => d.email.toLowerCase() === emailLower);
  const staff = db.staff.find(s => s.email.toLowerCase() === emailLower);

  const result = (await tryUser(patient, 'patient')) ||
                 (await tryUser(doctor, 'doctor')) ||
                 (await tryUser(staff, staff ? staff.role : 'admin'));

  if (!result) return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json(result);
});

app.post('/api/change-password', auth(), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters, and current password is required.' });
  }
  const db = readDb();
  const collection = req.user.role === 'patient' ? db.patients : (req.user.role === 'doctor' ? db.doctors : db.staff);
  const user = collection.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await writeDb(db);
  res.json({ ok: true });
});

// ---------- DEPARTMENTS ----------

app.get('/api/departments', (req, res) => {
  const db = readDb();
  const withCounts = db.departments.map(d => ({
    ...d,
    doctorCount: db.doctors.filter(doc => doc.departmentId === d.id).length
  }));
  res.json(withCounts);
});

app.post('/api/admin/departments', auth(['admin']), async (req, res) => {
  const { name, description, icon } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required.' });
  const db = readDb();
  const dept = { id: newId('dept'), name, description: description || '', icon: icon || 'stethoscope' };
  db.departments.push(dept);
  await writeDb(db);
  res.json(dept);
});

// ---------- DOCTORS ----------

app.get('/api/doctors', (req, res) => {
  const db = readDb();
  let doctors = db.doctors;
  if (req.query.department) {
    doctors = doctors.filter(d => d.departmentId === req.query.department);
  }
  const safe = doctors.map(({ passwordHash, ...rest }) => rest);
  res.json(safe);
});

app.get('/api/doctors/:id', (req, res) => {
  const db = readDb();
  const doc = db.doctors.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Doctor not found.' });
  const { passwordHash, ...safe } = doc;
  res.json(safe);
});

app.post('/api/admin/doctors', auth(['admin']), async (req, res) => {
  const { name, departmentId, specialty, bio, email, password, photo } = req.body || {};
  if (!name || !departmentId || !email || !password) {
    return res.status(400).json({ error: 'Name, department, email and password are required.' });
  }
  if (!isValidPhoto(photo)) return res.status(400).json({ error: 'Photo must be a JPG, PNG, WEBP, or GIF image.' });
  const db = readDb();
  const passwordHash = await bcrypt.hash(password, 10);
  const doctor = {
    id: newId('doc'), name, departmentId, specialty: specialty || '', bio: bio || '',
    photo: photo || null,
    email: email.toLowerCase(), passwordHash, mustChangePassword: true,
    workingHours: { start: '09:00', end: '17:00', slotMinutes: 30 },
    workingDays: [1, 2, 3, 4, 5]
  };
  db.doctors.push(doctor);
  await writeDb(db);
  const { passwordHash: _drop, ...safe } = doctor;
  res.json(safe);
});

// Update an existing doctor's profile (name, specialty, bio, department, photo).
app.patch('/api/admin/doctors/:id', auth(['admin']), async (req, res) => {
  const { name, specialty, bio, photo, departmentId } = req.body || {};
  if (photo !== undefined && !isValidPhoto(photo)) {
    return res.status(400).json({ error: 'Photo must be a JPG, PNG, WEBP, or GIF image.' });
  }
  const db = readDb();
  const doctor = db.doctors.find(d => d.id === req.params.id);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  if (name !== undefined) doctor.name = name;
  if (specialty !== undefined) doctor.specialty = specialty;
  if (bio !== undefined) doctor.bio = bio;
  if (photo !== undefined) doctor.photo = photo || null;
  if (departmentId !== undefined) doctor.departmentId = departmentId;
  await writeDb(db);
  const { passwordHash, ...safe } = doctor;
  res.json(safe);
});

// ---------- AVAILABILITY & APPOINTMENTS ----------

function generateSlots(doctor, dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = date.getDay();
  if (!doctor.workingDays.includes(dayOfWeek)) return [];
  const [startH, startM] = doctor.workingHours.start.split(':').map(Number);
  const [endH, endM] = doctor.workingHours.end.split(':').map(Number);
  const slotMinutes = doctor.workingHours.slotMinutes || 30;
  const slots = [];
  let cursor = startH * 60 + startM;
  const end = endH * 60 + endM;
  while (cursor + slotMinutes <= end) {
    const h = Math.floor(cursor / 60).toString().padStart(2, '0');
    const m = (cursor % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    cursor += slotMinutes;
  }
  return slots;
}

app.get('/api/doctors/:id/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'A date is required (YYYY-MM-DD).' });
  const db = readDb();
  const doctor = db.doctors.find(d => d.id === req.params.id);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const allSlots = generateSlots(doctor, date);
  const taken = db.appointments
    .filter(a => a.doctorId === doctor.id && a.date === date && a.status !== 'cancelled')
    .map(a => a.time);
  const available = allSlots.filter(s => !taken.includes(s));
  res.json({ date, available });
});

app.post('/api/appointments', auth(['patient']), async (req, res) => {
  const { doctorId, date, time, reason } = req.body || {};
  if (!doctorId || !date || !time) return res.status(400).json({ error: 'Doctor, date and time are required.' });
  const db = readDb();
  const doctor = db.doctors.find(d => d.id === doctorId);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const clash = db.appointments.find(a => a.doctorId === doctorId && a.date === date && a.time === time && a.status !== 'cancelled');
  if (clash) return res.status(409).json({ error: 'That slot was just booked by someone else. Please pick another.' });
  const appointment = {
    id: newId('appt'), patientId: req.user.sub, doctorId, date, time,
    reason: reason || '', status: 'confirmed', createdAt: new Date().toISOString()
  };
  db.appointments.push(appointment);
  await writeDb(db);
  res.json(appointment);
});

app.get('/api/patients/me/appointments', auth(['patient']), (req, res) => {
  const db = readDb();
  const mine = db.appointments
    .filter(a => a.patientId === req.user.sub)
    .map(a => {
      const doctor = db.doctors.find(d => d.id === a.doctorId);
      const dept = doctor ? db.departments.find(x => x.id === doctor.departmentId) : null;
      return { ...a, doctorName: doctor ? doctor.name : 'Unknown', departmentName: dept ? dept.name : '' };
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json(mine);
});

app.post('/api/patients/me/appointments/:id/cancel', auth(['patient']), async (req, res) => {
  const db = readDb();
  const appt = db.appointments.find(a => a.id === req.params.id && a.patientId === req.user.sub);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  appt.status = 'cancelled';
  await writeDb(db);
  res.json(appt);
});

app.get('/api/doctors/me/appointments', auth(['doctor']), (req, res) => {
  const db = readDb();
  const mine = db.appointments
    .filter(a => a.doctorId === req.user.sub && a.status !== 'cancelled')
    .map(a => {
      const patient = db.patients.find(p => p.id === a.patientId);
      return { ...a, patientName: patient ? patient.name : 'Unknown patient' };
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json(mine);
});

// ---------- MEDICAL RECORDS ----------

app.get('/api/patients/me/records', auth(['patient']), (req, res) => {
  const db = readDb();
  const mine = db.records
    .filter(r => r.patientId === req.user.sub)
    .map(r => {
      const doctor = db.doctors.find(d => d.id === r.doctorId);
      return { ...r, doctorName: doctor ? doctor.name : 'Unknown' };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(mine);
});

app.get('/api/doctors/me/patients', auth(['doctor']), (req, res) => {
  const db = readDb();
  const patientIds = [...new Set(db.appointments.filter(a => a.doctorId === req.user.sub).map(a => a.patientId))];
  const patients = patientIds.map(pid => {
    const p = db.patients.find(x => x.id === pid);
    return p ? { id: p.id, name: p.name, email: p.email, phone: p.phone, dob: p.dob, gender: p.gender } : null;
  }).filter(Boolean);
  res.json(patients);
});

app.get('/api/doctors/me/patients/:patientId/records', auth(['doctor']), (req, res) => {
  const db = readDb();
  const records = db.records
    .filter(r => r.patientId === req.params.patientId)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(records);
});

app.post('/api/doctors/me/patients/:patientId/records', auth(['doctor']), async (req, res) => {
  const { diagnosis, notes, prescription } = req.body || {};
  if (!notes) return res.status(400).json({ error: 'Notes are required.' });
  const db = readDb();
  const patient = db.patients.find(p => p.id === req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  const record = {
    id: newId('rec'), patientId: req.params.patientId, doctorId: req.user.sub,
    date: new Date().toISOString().slice(0, 10),
    diagnosis: diagnosis || '', notes, prescription: prescription || '',
    createdAt: new Date().toISOString()
  };
  db.records.push(record);
  await writeDb(db);
  res.json(record);
});

// ---------- TEAM / STAFF (doctors + non-doctor staff, public read) ----------

app.get('/api/team', (req, res) => {
  const db = readDb();
  const doctors = db.doctors.map(({ passwordHash, email, ...rest }) => rest);
  res.json({ doctors, staffMembers: db.teamMembers || [] });
});

app.get('/api/team-members', (req, res) => {
  const db = readDb();
  res.json(db.teamMembers || []);
});

app.post('/api/admin/team-members', auth(['admin']), async (req, res) => {
  const { name, role, bio, photo } = req.body || {};
  if (!name || !role) return res.status(400).json({ error: 'Name and role are required.' });
  if (!isValidPhoto(photo)) return res.status(400).json({ error: 'Photo must be a JPG, PNG, WEBP, or GIF image.' });
  const db = readDb();
  const member = { id: newId('team'), name, role, bio: bio || '', photo: photo || null, createdAt: new Date().toISOString() };
  db.teamMembers = db.teamMembers || [];
  db.teamMembers.push(member);
  await writeDb(db);
  res.json(member);
});

app.patch('/api/admin/team-members/:id', auth(['admin']), async (req, res) => {
  const { name, role, bio, photo } = req.body || {};
  if (photo !== undefined && !isValidPhoto(photo)) {
    return res.status(400).json({ error: 'Photo must be a JPG, PNG, WEBP, or GIF image.' });
  }
  const db = readDb();
  db.teamMembers = db.teamMembers || [];
  const member = db.teamMembers.find(m => m.id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Team member not found.' });
  if (name !== undefined) member.name = name;
  if (role !== undefined) member.role = role;
  if (bio !== undefined) member.bio = bio;
  if (photo !== undefined) member.photo = photo || null;
  await writeDb(db);
  res.json(member);
});

app.delete('/api/admin/team-members/:id', auth(['admin']), async (req, res) => {
  const db = readDb();
  db.teamMembers = db.teamMembers || [];
  const idx = db.teamMembers.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Team member not found.' });
  db.teamMembers.splice(idx, 1);
  await writeDb(db);
  res.json({ ok: true });
});

// ---------- CONTACT ----------

app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required.' });
  const db = readDb();
  db.contactMessages.push({ id: newId('msg'), name, email, message, createdAt: new Date().toISOString() });
  await writeDb(db);
  res.json({ ok: true });
});

// Fallback to index.html for unknown non-API GET routes (nice for direct links)
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) next();
  });
});

// Returns clean JSON instead of an HTML error page for oversized/malformed bodies.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That photo is too large. Please use an image under 4MB.' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Radiant Health Alliance server running on port ${PORT}`);
});
