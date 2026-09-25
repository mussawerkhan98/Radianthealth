// src/app.js — Radiant Health Alliance API (Express + Prisma + Turso/libSQL).
// Same API paths and response shapes as the original JSON-file version, so
// the existing frontend in /public works unchanged — plus the admin/staff
// endpoints the frontend already called but the old server never had.
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const prisma = require('./db');
const settings = require('./settings');
const mailer = require('./mailer');
const brevo = require('./brevo');
const video = require('./video');
const marketing = require('./marketing');
const audience = require('./audience');
const clinicLocation = require('./location');
const { newId } = require('./ids');
const { normalizePhone, displayPatientId } = require('./phone');
const { PERMISSIONS, VALID: VALID_PERMS, parsePerms, permsForRole } = require('./permissions');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set (32+ random characters) in production.');
  }
  console.warn('\n*** WARNING: JWT_SECRET is missing/short. Set a long random JWT_SECRET before going live. ***\n');
}
const SECRET = JWT_SECRET || 'dev-only-insecure-secret-change-me-please-0000';
const CLINIC_TZ = process.env.CLINIC_TZ || 'Asia/Dubai';
const PRIMARY_ADMIN_EMAIL = 'admin@radianthealthalliance.com';

const app = express();
app.set('trust proxy', 1); // behind Hostinger / Vercel / nginx proxy
app.disable('x-powered-by');
// CSP disabled because the existing pages use inline scripts + Google Fonts.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',') }));
// Photos are sent as base64 data URLs inside JSON, hence the raised limit.
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' })); // for plain HTML form posts (/api/book)

// Strip < and > from text inputs so names/notes can't inject HTML into the
// pages (the frontend renders with innerHTML). Passwords/photos untouched.
const RAW_FIELDS = new Set(['password', 'currentPassword', 'newPassword', 'photo', 'pass']);
function sanitize(value, key) {
  if (typeof value === 'string') return RAW_FIELDS.has(key) ? value : value.replace(/[<>]/g, '');
  if (Array.isArray(value)) return value.map(v => sanitize(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k);
    return out;
  }
  return value;
}
app.use((req, res, next) => { if (req.body) req.body = sanitize(req.body); next(); });

// Static frontend (on Vercel the CDN serves /public directly instead).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  // Emails show the logo, so other sites (mail apps) may load images.
  setHeaders: (res, file) => { if (/[\\/]assets[\\/][^\\/]+\.(png|jpe?g|gif|webp|svg)$/i.test(file)) res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); }
}));

// ---------- helpers ----------

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
// Public booking-request endpoint sends email to any address, so keep it tight.
const bookLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many booking requests from this device. Please try again later or call us.' } });
const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' } });

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

async function findAccount(role, id) {
  if (role === 'patient') {
    const p = await prisma.patient.findUnique({ where: { id } });
    return p && !p.isGuest ? p : null; // guest bookers have no login
  }
  if (role === 'doctor') {
    const d = await prisma.doctor.findUnique({ where: { id } });
    return d && d.active ? d : null;
  }
  return prisma.staff.findUnique({ where: { id } });
}

// auth(['admin']) etc. Also re-checks the account still exists, so removed
// staff/doctors lose access immediately instead of when their token expires.
function auth(requiredRoles) {
  return wrap(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });
    let decoded;
    try {
      decoded = jwt.verify(token, SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    const account = await findAccount(decoded.role, decoded.sub);
    if (!account) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    const isStaff = decoded.role === 'admin' || decoded.role === 'staff';
    // Staff: "admin" role = admin; any other role = "staff" with its own permissions.
    const role = isStaff ? (account.role === 'admin' ? 'admin' : 'staff') : decoded.role;
    if (requiredRoles && !requiredRoles.includes(role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    req.user = { ...decoded, role, roleId: isStaff ? account.role : role };
    req.perms = isStaff ? await permsForRole(prisma, account.role) : new Set();
    req.account = account;
    next();
  });
}

// perm('patients.view') — any staff login whose role has that permission.
function perm(key) {
  return [auth(['admin', 'staff']), (req, res, next) => {
    if (req.perms.has(key)) return next();
    const p = PERMISSIONS.find(x => x.key === key);
    res.status(403).json({ error: `Your role doesn't allow this (${p ? p.label.toLowerCase() : key}). Ask an admin to change your permissions.` });
  }];
}
const staffCan = (req, key) => !!(req.perms && req.perms.has(key));

function isValidPhoto(photo) {
  if (photo === null || photo === undefined || photo === '') return true;
  return typeof photo === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(photo);
}

const normEmail = e => String(e || '').toLowerCase().trim();
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function emailTaken(email) {
  const [p, d, s] = await Promise.all([
    prisma.patient.findUnique({ where: { email } }),
    prisma.doctor.findUnique({ where: { email } }),
    prisma.staff.findUnique({ where: { email } })
  ]);
  return !!(p || d || s);
}

const parseDays = v => String(v || '').split(',').filter(x => x !== '').map(Number);

function doctorOut(d, { includeEmail = true } = {}) {
  const out = {
    id: d.id, name: d.name, departmentId: d.departmentId, specialty: d.specialty, bio: d.bio,
    photo: d.photo, mustChangePassword: d.mustChangePassword,
    workingHours: { start: d.workStart, end: d.workEnd, slotMinutes: d.slotMinutes },
    workingDays: parseDays(d.workingDays),
    offersVideo: !!d.offersVideo
  };
  if (includeEmail) out.email = d.email;
  return out;
}

const apptOut = a => ({
  id: a.id, patientId: a.patientId, doctorId: a.doctorId, date: a.date, time: a.time,
  reason: a.reason, status: a.status, visitType: a.visitType || 'in_person', createdAt: a.createdAt
});

// Personal join links for a video appointment (open /video.html).
const SITE_URL = () => (process.env.SITE_URL || 'https://www.radianthealthalliance.com').replace(/\/$/, '');
function videoLinks(a) {
  if (!a || a.visitType !== 'video' || !a.videoPatientKey) return null;
  const base = `${SITE_URL()}/video.html?a=${encodeURIComponent(a.id)}&k=`;
  return { patient: base + a.videoPatientKey, doctor: base + a.videoDoctorKey };
}

const recordOut = r => ({
  id: r.id, patientId: r.patientId, doctorId: r.doctorId, date: r.date, diagnosis: r.diagnosis,
  notes: r.notes, prescription: r.prescription, createdAt: r.createdAt,
  ...(r.doctor ? { doctorName: r.doctor.name } : {}),
  ...(r.files ? { files: r.files.map(fileOut) } : {}),
  ...(r.enteredByName ? { enteredByName: r.enteredByName } : {})
});

// ---------- record file attachments ----------
// Metadata only — never select the file bytes when listing records.
const FILE_META = { select: { id: true, filename: true, mimeType: true, size: true, uploadedById: true, createdAt: true }, orderBy: { createdAt: 'asc' } };
const fileOut = f => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, size: f.size, uploadedById: f.uploadedById, createdAt: f.createdAt });
const MAX_FILE_BYTES = 3 * 1024 * 1024; // Vercel limits a request to 4.5 MB; base64 adds ~33%
const MAX_FILES_PER_RECORD = 20;
// Allowed types, checked against the file's real first bytes (not just its name).
const FILE_TYPES = {
  pdf:  { mime: 'application/pdf', magic: b => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  jpg:  { mime: 'image/jpeg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png:  { mime: 'image/png', magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  gif:  { mime: 'image/gif', magic: b => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  webp: { mime: 'image/webp', magic: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: b => b[0] === 0x50 && b[1] === 0x4b },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: b => b[0] === 0x50 && b[1] === 0x4b },
  doc:  { mime: 'application/msword', magic: b => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) }
};
function cleanFilename(name) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"<>|:*?]/g, '').trim();
  return base.slice(-150) || 'file';
}


// "Now" in the clinic's timezone, as YYYY-MM-DD and HH:MM.
function clinicNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Every slot in a doctor's working day (including past ones) — for calendars.
function daySlots(doctor, dateStr) {
  const dayOfWeek = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  if (!parseDays(doctor.workingDays).includes(dayOfWeek)) return [];
  const [sh, sm] = doctor.workStart.split(':').map(Number);
  const [eh, em] = doctor.workEnd.split(':').map(Number);
  const step = doctor.slotMinutes || 30;
  const out = [];
  for (let c = sh * 60 + sm; c + step <= eh * 60 + em; c += step) {
    out.push(`${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`);
  }
  return out;
}

function generateSlots(doctor, dateStr) {
  if (!DATE_RE.test(dateStr)) return [];
  const dayOfWeek = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  if (Number.isNaN(dayOfWeek) || !parseDays(doctor.workingDays).includes(dayOfWeek)) return [];
  const [sh, sm] = doctor.workStart.split(':').map(Number);
  const [eh, em] = doctor.workEnd.split(':').map(Number);
  const step = doctor.slotMinutes || 30;
  const now = clinicNow();
  if (dateStr < now.date) return [];
  const slots = [];
  for (let c = sh * 60 + sm; c + step <= eh * 60 + em; c += step) {
    const t = `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
    if (dateStr === now.date && t <= now.time) continue; // no past slots today
    slots.push(t);
  }
  return slots;
}

// ---------- AUTH ----------

app.post('/api/register', authLimiter, wrap(async (req, res) => {
  const { name, phone, dob, gender, password } = req.body || {};
  const email = normEmail(req.body && req.body.email);
  if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const phoneKey = normalizePhone(phone);
  if (!phoneKey) throw new HttpError(400, 'Please enter a valid mobile number — it becomes your Patient ID.');
  if (String(password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const [byPhone, byEmail] = await Promise.all([
    prisma.patient.findUnique({ where: { phoneKey }, include: { _count: { select: { records: true } } } }),
    prisma.patient.findUnique({ where: { email }, include: { _count: { select: { records: true } } } })
  ]);
  if (byPhone && !byPhone.isGuest) throw new HttpError(409, 'An account with this phone number already exists. Please log in instead.');
  if (byEmail && !byEmail.isGuest) throw new HttpError(409, 'An account with this email already exists.');
  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    throw new HttpError(409, 'This phone number and email belong to two different bookings. Please contact the clinic to join them.');
  }
  if (!byPhone && !byEmail && await emailTaken(email)) throw new HttpError(409, 'An account with this email already exists.');
  const guest = byPhone || byEmail;
  let patient;
  if (guest) {
    // Someone who booked as a guest is now creating an account: their past
    // bookings move into it. If a doctor has already written medical notes,
    // we don't hand those over without the clinic checking first.
    if (guest._count.records > 0) {
      throw new HttpError(409, 'We already have records for you. Please contact the clinic to activate your account.');
    }
    if (guest.phoneKey && guest.phoneKey !== phoneKey) {
      throw new HttpError(409, 'This email was used before with a different phone number. Please use that number, or contact the clinic.');
    }
    patient = await prisma.patient.update({
      where: { id: guest.id },
      data: {
        name: String(name).trim(), email, phone: String(phone).trim(), phoneKey, dob: dob || '', gender: gender || '',
        passwordHash: await bcrypt.hash(password, 10), isGuest: false
      }
    });
  } else {
    patient = await prisma.patient.create({
      data: {
        id: newId('pt'), name: String(name).trim(), email, phone: String(phone).trim(), phoneKey, dob: dob || '', gender: gender || '',
        passwordHash: await bcrypt.hash(password, 10)
      }
    });
  }
  const token = signToken({ sub: patient.id, role: 'patient', name: patient.name });
  res.json({ token, user: { id: patient.id, name: patient.name, email: patient.email, role: 'patient', patientId: displayPatientId(patient.phoneKey) } });
}));

// Who am I + what may I do (the admin panel uses this to show the right tabs).
app.get('/api/me', auth(), wrap(async (req, res) => {
  const a = req.account;
  const out = { id: a.id, name: a.name, email: a.email, role: req.user.role };
  if (req.user.role === 'admin' || req.user.role === 'staff') {
    const r = await prisma.role.findUnique({ where: { id: req.user.roleId } });
    Object.assign(out, { roleId: req.user.roleId, roleName: r ? r.name : req.user.roleId, permissions: [...req.perms] });
  }
  if (req.user.role === 'patient') Object.assign(out, { phone: a.phone, patientId: displayPatientId(a.phoneKey) });
  res.json(out);
}));

app.post('/api/login', authLimiter, wrap(async (req, res) => {
  const { password } = req.body || {};
  const email = normEmail(req.body && req.body.email);
  if (!email || !password) throw new HttpError(400, 'Email and password are required.');

  const [patient, doctor, staff] = await Promise.all([
    prisma.patient.findFirst({ where: { email, isGuest: false } }),
    prisma.doctor.findFirst({ where: { email, active: true } }),
    prisma.staff.findUnique({ where: { email } })
  ]);
  const candidates = [[patient, 'patient'], [doctor, 'doctor'], [staff, staff && (staff.role === 'admin' ? 'admin' : 'staff')]];
  for (const [user, role] of candidates) {
    if (!user) continue;
    if (await bcrypt.compare(password, user.passwordHash)) {
      const extra = {};
      if (user === staff) {
        const r = await prisma.role.findUnique({ where: { id: staff.role } });
        extra.roleId = staff.role;
        extra.roleName = r ? r.name : staff.role;
        extra.permissions = [...(await permsForRole(prisma, staff.role))];
      }
      if (user === patient) extra.patientId = displayPatientId(patient.phoneKey);
      return res.json({
        token: signToken({ sub: user.id, role, name: user.name }),
        user: { id: user.id, name: user.name, email: user.email, role, mustChangePassword: !!user.mustChangePassword, ...extra }
      });
    }
  }
  throw new HttpError(401, 'Incorrect email or password.');
}));

app.post('/api/change-password', auth(), wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    throw new HttpError(400, 'New password must be at least 8 characters, and current password is required.');
  }
  const user = req.account;
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(401, 'Current password is incorrect.');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const model = req.user.role === 'patient' ? prisma.patient : req.user.role === 'doctor' ? prisma.doctor : prisma.staff;
  const data = req.user.role === 'patient' ? { passwordHash } : { passwordHash, mustChangePassword: false };
  await model.update({ where: { id: user.id }, data });
  res.json({ ok: true });
}));

// ---------- PUBLIC SETTINGS ----------

app.get('/api/settings', wrap(async (req, res) => {
  const s = await settings.getAll();
  res.json({ phone: s.phone, whatsapp: s.whatsapp, contactEmail: s.contactEmail, videoEnabled: video.isConfigured(),
    location: clinicLocation.publicLocation(s.location) });
}));

// ---------- DEPARTMENTS ----------

app.get('/api/departments', wrap(async (req, res) => {
  const depts = await prisma.department.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { doctors: { where: { active: true } } } } }
  });
  res.json(depts.map(d => ({ id: d.id, name: d.name, description: d.description, icon: d.icon, doctorCount: d._count.doctors })));
}));

app.post('/api/admin/departments', perm('directory.manage'), wrap(async (req, res) => {
  const { name, description, icon } = req.body || {};
  if (!name) throw new HttpError(400, 'Department name is required.');
  const count = await prisma.department.count();
  const d = await prisma.department.create({
    data: { id: newId('dept'), name, description: description || '', icon: icon || 'stethoscope', sortOrder: count }
  });
  res.json({ id: d.id, name: d.name, description: d.description, icon: d.icon });
}));

app.delete('/api/admin/departments/:id', perm('directory.manage'), wrap(async (req, res) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept || !dept.active) throw new HttpError(404, 'Department not found.');
  const activeDoctors = await prisma.doctor.count({ where: { departmentId: dept.id, active: true } });
  if (activeDoctors > 0) {
    throw new HttpError(409, `This department still has ${activeDoctors} doctor${activeDoctors === 1 ? '' : 's'}. Move or delete them first.`);
  }
  await prisma.department.update({ where: { id: dept.id }, data: { active: false } });
  res.json({ ok: true });
}));

// ---------- DOCTORS ----------

app.get('/api/doctors', wrap(async (req, res) => {
  const where = { active: true };
  if (req.query.department) where.departmentId = String(req.query.department);
  const doctors = await prisma.doctor.findMany({ where, orderBy: { createdAt: 'asc' } });
  res.json(doctors.map(d => doctorOut(d)));
}));

// NB: /api/doctors/me/* routes are registered before /api/doctors/:id below.
app.get('/api/doctors/me/appointments', auth(['doctor']), wrap(async (req, res) => {
  const appts = await prisma.appointment.findMany({
    where: { doctorId: req.user.sub, status: { not: 'cancelled' } },
    include: { patient: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }]
  });
  res.json(appts.map(a => {
    const links = videoLinks(a);
    return { ...apptOut(a), patientName: a.patient ? a.patient.name : 'Unknown patient', ...(links ? { videoLink: links.doctor } : {}) };
  }));
}));

// My patients (booked with me). With ?q= and the "search all patients" rule
// on, searches every patient in the clinic instead.
app.get('/api/doctors/me/patients', auth(['doctor']), wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const rules = await doctorRules();
  const mine = await prisma.patient.findMany({
    where: { appointments: { some: { doctorId: req.user.sub } } },
    orderBy: { name: 'asc' }
  });
  const mineIds = new Set(mine.map(p => p.id));
  if (!q || !rules.searchAllPatients) {
    res.set('X-Search-All', rules.searchAllPatients ? '1' : '0');
    return res.json(mine.map(p => ({ ...patientOut(p), mine: true })));
  }
  if (q.length < 2) throw new HttpError(400, 'Type at least 2 characters to search.');
  const digits = q.replace(/\D/g, '');
  const or = [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }];
  if (digits.length >= 3) or.push({ phoneKey: { contains: digits.replace(/^0+/, '') } });
  const found = await prisma.patient.findMany({ where: { OR: or }, orderBy: { name: 'asc' }, take: 50 });
  res.set('X-Search-All', '1');
  res.json(found.map(p => ({ ...patientOut(p), mine: mineIds.has(p.id) })));
}));

// A doctor may only see/add records for patients who have booked with them.
async function doctorRules() {
  const s = await settings.getAll();
  return { searchAllPatients: !!(s.doctorRules && s.doctorRules.searchAllPatients) };
}
async function assertDoctorPatient(doctorId, patientId) {
  const link = await prisma.appointment.findFirst({ where: { doctorId, patientId }, select: { id: true } });
  if (link) return;
  // Rule (Admin → Roles & Permissions): doctors may open any patient.
  if ((await doctorRules()).searchAllPatients && await prisma.patient.findUnique({ where: { id: String(patientId) }, select: { id: true } })) return;
  throw new HttpError(404, 'Patient not found.');
}

app.get('/api/doctors/me/patients/:patientId/records', auth(['doctor']), wrap(async (req, res) => {
  await assertDoctorPatient(req.user.sub, req.params.patientId);
  const records = await prisma.medicalRecord.findMany({
    where: { patientId: req.params.patientId },
    include: { doctor: { select: { name: true } }, files: FILE_META },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });
  res.json(records.map(recordOut));
}));

app.post('/api/doctors/me/patients/:patientId/records', auth(['doctor']), wrap(async (req, res) => {
  const { diagnosis, notes, prescription } = req.body || {};
  if (!notes) throw new HttpError(400, 'Notes are required.');
  await assertDoctorPatient(req.user.sub, req.params.patientId);
  const r = await prisma.medicalRecord.create({
    data: {
      id: newId('rec'), patientId: req.params.patientId, doctorId: req.user.sub, date: clinicNow().date,
      diagnosis: diagnosis || '', notes, prescription: prescription || ''
    }
  });
  res.json({ ...recordOut(r), files: [] });
}));

// Attach one file to a record (one request per file so each can be up to 3 MB).
// Body: { filename, data } where data is a base64 data URL or plain base64.
// Validates and stores one uploaded file on a record.
async function saveRecordFile(record, uploaderId, body) {
  const { filename, data } = body || {};
  const name = cleanFilename(filename);
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  const type = ext && FILE_TYPES[ext.toLowerCase()];
  if (!type) throw new HttpError(400, `"${name}": only PDF, JPG, PNG, WEBP, GIF, Word (DOC/DOCX) and Excel (XLSX) files are allowed.`);
  const b64 = String(data || '').replace(/^data:[^;,]*;base64,/, '');
  if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new HttpError(400, `"${name}" could not be read. Please try again.`);
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new HttpError(400, `"${name}" is empty.`);
  if (buf.length > MAX_FILE_BYTES) throw new HttpError(413, `"${name}" is larger than 3 MB. Please compress it or split it into smaller files.`);
  if (!type.magic(buf)) throw new HttpError(400, `"${name}" doesn't look like a real .${ext.toLowerCase()} file.`);
  if ((await prisma.recordFile.count({ where: { recordId: record.id } })) >= MAX_FILES_PER_RECORD) {
    throw new HttpError(400, `A note can have at most ${MAX_FILES_PER_RECORD} files. Add a new note for more.`);
  }
  const f = await prisma.recordFile.create({
    data: { id: newId('file'), recordId: record.id, patientId: record.patientId, uploadedById: uploaderId,
      filename: name, mimeType: type.mime, size: buf.length, data: buf }
  });
  return fileOut(f);
}

// Attach one file to a record (one request per file so each can be up to 3 MB).
// Body: { filename, data } where data is a base64 data URL or plain base64.
app.post('/api/doctors/me/records/:recordId/files', auth(['doctor']), wrap(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({ where: { id: req.params.recordId } });
  if (!record || record.doctorId !== req.user.sub) throw new HttpError(404, 'Record not found.');
  res.json(await saveRecordFile(record, req.user.sub, req.body));
}));

// Remove a file you uploaded by mistake.
app.delete('/api/doctors/me/files/:id', auth(['doctor']), wrap(async (req, res) => {
  const f = await prisma.recordFile.findUnique({ where: { id: req.params.id }, select: { id: true, uploadedById: true } });
  if (!f || f.uploadedById !== req.user.sub) throw new HttpError(404, 'File not found.');
  await prisma.recordFile.delete({ where: { id: f.id } });
  res.json({ ok: true });
}));

// Download: admins, or a doctor who has seen this patient. Never patients/staff.
app.get('/api/files/:id', auth(['doctor', 'admin', 'staff']), wrap(async (req, res) => {
  const f = await prisma.recordFile.findUnique({ where: { id: req.params.id } });
  if (!f) throw new HttpError(404, 'File not found.');
  if (req.user.role === 'doctor') await assertDoctorPatient(req.user.sub, f.patientId);
  else if (!staffCan(req, 'records.view')) throw new HttpError(403, "Your role doesn't allow opening medical files.");
  res.set({
    'Content-Type': f.mimeType,
    'Content-Length': String(f.data.length),
    'Content-Disposition': `attachment; filename="${f.filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(Buffer.from(f.data));
}));

app.get('/api/doctors/:id', wrap(async (req, res) => {
  const d = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!d || !d.active) throw new HttpError(404, 'Doctor not found.');
  res.json(doctorOut(d));
}));

app.get('/api/doctors/:id/slots', wrap(async (req, res) => {
  const date = String(req.query.date || '');
  if (!DATE_RE.test(date)) throw new HttpError(400, 'A date is required (YYYY-MM-DD).');
  const d = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!d || !d.active) throw new HttpError(404, 'Doctor not found.');
  const taken = await prisma.appointment.findMany({
    where: { doctorId: d.id, date, status: { not: 'cancelled' } }, select: { time: true }
  });
  const takenSet = new Set(taken.map(t => t.time));
  res.json({ date, available: generateSlots(d, date).filter(s => !takenSet.has(s)) });
}));

app.post('/api/admin/doctors', perm('doctors.manage'), wrap(async (req, res) => {
  const { name, departmentId, specialty, bio, password, photo } = req.body || {};
  const email = normEmail(req.body && req.body.email);
  if (!name || !departmentId || !email || !password) throw new HttpError(400, 'Name, department, email and password are required.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (String(password).length < 8) throw new HttpError(400, 'Temporary password must be at least 8 characters.');
  if (!isValidPhoto(photo)) throw new HttpError(400, 'Photo must be a JPG, PNG, WEBP, or GIF image.');
  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept || !dept.active) throw new HttpError(400, 'Please choose a valid department.');
  if (await emailTaken(email)) throw new HttpError(409, 'An account with this email already exists.');
  const d = await prisma.doctor.create({
    data: {
      id: newId('doc'), name, departmentId, specialty: specialty || '', bio: bio || '', photo: photo || null,
      email, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true
    }
  });
  res.json(doctorOut(d));
}));

app.patch('/api/admin/doctors/:id', perm('doctors.manage'), wrap(async (req, res) => {
  const { name, specialty, bio, photo, departmentId, workingHours, workingDays } = req.body || {};
  if (photo !== undefined && !isValidPhoto(photo)) throw new HttpError(400, 'Photo must be a JPG, PNG, WEBP, or GIF image.');
  const existing = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!existing || !existing.active) throw new HttpError(404, 'Doctor not found.');
  const data = {};
  if (name !== undefined) data.name = name;
  if (specialty !== undefined) data.specialty = specialty;
  if (bio !== undefined) data.bio = bio;
  if (photo !== undefined) data.photo = photo || null;
  if (departmentId !== undefined) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept || !dept.active) throw new HttpError(400, 'Please choose a valid department.');
    data.departmentId = departmentId;
  }
  if (workingHours) {
    if (workingHours.start && TIME_RE.test(workingHours.start)) data.workStart = workingHours.start;
    if (workingHours.end && TIME_RE.test(workingHours.end)) data.workEnd = workingHours.end;
    if (workingHours.slotMinutes) data.slotMinutes = Math.max(5, Math.min(240, Number(workingHours.slotMinutes) || 30));
  }
  if (Array.isArray(workingDays)) data.workingDays = [...new Set(workingDays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort().join(',');
  if (req.body && req.body.offersVideo !== undefined) data.offersVideo = !!req.body.offersVideo;
  const start = data.workStart || existing.workStart, end = data.workEnd || existing.workEnd;
  if (start >= end) throw new HttpError(400, 'Finishing time must be after the starting time.');
  if (req.body && req.body.email !== undefined) {
    const email = normEmail(req.body.email);
    if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (email !== existing.email) {
      if (await emailTaken(email)) throw new HttpError(409, 'Another account already uses this email.');
      data.email = email;
    }
  }
  const d = await prisma.doctor.update({ where: { id: existing.id }, data });
  res.json(doctorOut(d));
}));

// Set a new temporary password; the doctor must change it at next login.
app.post('/api/admin/doctors/:id/reset-password', perm('doctors.manage'), wrap(async (req, res) => {
  const d = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!d || !d.active) throw new HttpError(404, 'Doctor not found.');
  const password = String((req.body && req.body.password) || '');
  if (password.length < 8) throw new HttpError(400, 'Temporary password must be at least 8 characters.');
  await prisma.doctor.update({ where: { id: d.id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
  res.json({ ok: true });
}));

// Doctor profile + quick stats for the admin "manage doctor" page.
app.get('/api/admin/doctors/:id', perm('doctors.view'), wrap(async (req, res) => {
  const d = await prisma.doctor.findUnique({ where: { id: req.params.id }, include: { department: true } });
  if (!d || !d.active) throw new HttpError(404, 'Doctor not found.');
  const today = clinicNow().date;
  const [upcoming, patients, records] = await Promise.all([
    prisma.appointment.count({ where: { doctorId: d.id, status: 'confirmed', date: { gte: today } } }),
    prisma.appointment.findMany({ where: { doctorId: d.id }, distinct: ['patientId'], select: { patientId: true } }),
    prisma.medicalRecord.count({ where: { doctorId: d.id } })
  ]);
  res.json({
    ...doctorOut(d), departmentName: d.department ? d.department.name : '',
    stats: { upcoming, patients: patients.length, records }
  });
}));

// Week (or any range up to 31 days) of a doctor's calendar: every working slot
// marked free / booked / past, plus bookings that fall outside current hours.
app.get('/api/admin/doctors/:id/calendar', perm('doctors.view'), wrap(async (req, res) => {
  const d = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!d || !d.active) throw new HttpError(404, 'Doctor not found.');
  const start = DATE_RE.test(String(req.query.start || '')) ? String(req.query.start) : clinicNow().date;
  const n = Math.max(1, Math.min(31, Number(req.query.days) || 7));
  const dates = [];
  for (let i = 0; i < n; i++) dates.push(new Date(Date.parse(start + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
  const appts = await prisma.appointment.findMany({
    where: { doctorId: d.id, date: { gte: dates[0], lte: dates[dates.length - 1] } },
    include: { patient: { select: { id: true, name: true, phone: true, email: true, isGuest: true, phoneKey: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }]
  });
  const now = clinicNow();
  const canLinks = staffCan(req, 'appointments.book');
  const apptView = a => ({
    id: a.id, time: a.time, status: a.status, reason: a.reason, visitType: a.visitType || 'in_person',
    ...(canLinks && a.status !== 'cancelled' && videoLinks(a) ? { videoPatientLink: videoLinks(a).patient, videoDoctorLink: videoLinks(a).doctor } : {}),
    patient: a.patient ? { id: a.patient.id, patientId: displayPatientId(a.patient.phoneKey), name: a.patient.name, phone: a.patient.phone, email: hasRealEmail(a.patient.email) ? a.patient.email : '', isGuest: a.patient.isGuest } : null
  });
  const days = dates.map(date => {
    const slots = daySlots(d, date);
    const active = appts.filter(a => a.date === date && a.status !== 'cancelled');
    const byTime = new Map(active.map(a => [a.time, a]));
    const isPast = t => date < now.date || (date === now.date && t <= now.time);
    return {
      date,
      working: slots.length > 0,
      slots: slots.map(t => byTime.has(t)
        ? { time: t, status: 'booked', appointment: apptView(byTime.get(t)) }
        : { time: t, status: isPast(t) ? 'past' : 'free' }),
      // bookings made before hours changed, so they don't fit today's grid
      outside: active.filter(a => !slots.includes(a.time)).map(apptView),
      cancelled: appts.filter(a => a.date === date && a.status === 'cancelled').map(apptView)
    };
  });
  res.json({ doctor: { id: d.id, name: d.name }, today: now.date, days });
}));

// "Delete" = deactivate: login stops working, past appointments/records are kept.
app.delete('/api/admin/doctors/:id', perm('doctors.manage'), wrap(async (req, res) => {
  const d = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!d || !d.active) throw new HttpError(404, 'Doctor not found.');
  await prisma.$transaction([
    prisma.doctor.update({
      where: { id: d.id },
      // Free the email so it can be reused for a new account later.
      data: { active: false, email: `deleted+${d.id}+${d.email}` }
    }),
    prisma.appointment.updateMany({
      where: { doctorId: d.id, status: 'confirmed', date: { gte: clinicNow().date } },
      data: { status: 'cancelled' }
    })
  ]);
  res.json({ ok: true });
}));

// ---------- APPOINTMENTS ----------

// Shared by logged-in and guest bookings. Saves the appointment, then sends
// the Brevo emails (and SMTP doctor notification, if configured).
async function createBooking({ patient, doctorId, date, time, reason, honeypot, visitType }) {
  if (!doctorId || !date || !time) throw new HttpError(400, 'Doctor, date and time are required.');
  const doctor = await prisma.doctor.findUnique({ where: { id: String(doctorId) }, include: { department: true } });
  if (!doctor || !doctor.active) throw new HttpError(404, 'Doctor not found.');
  const isVideo = visitType === 'video';
  if (isVideo && !video.isConfigured()) throw new HttpError(400, 'Video appointments are not available yet. Please book an in-clinic visit.');
  if (isVideo && !doctor.offersVideo) throw new HttpError(400, `${doctor.name} doesn't offer video appointments. Please choose an in-clinic visit or another doctor.`);
  if (!generateSlots(doctor, date).includes(time)) throw new HttpError(400, 'That time is not available. Please pick another slot.');
  let appt;
  try {
    appt = await prisma.appointment.create({
      data: {
        id: newId('appt'), patientId: patient.id, doctorId: doctor.id, date, time, reason: String(reason || '').slice(0, 2000), status: 'confirmed',
        visitType: isVideo ? 'video' : 'in_person',
        ...(isVideo ? { videoPatientKey: video.newKey(), videoDoctorKey: video.newKey() } : {})
      }
    });
  } catch (e) {
    if (e.code === 'P2002') throw new HttpError(409, 'That slot was just booked by someone else. Please pick another.');
    throw e;
  }
  const departmentName = doctor.department && doctor.department.name;
  const links = videoLinks(appt);
  // In-clinic visits: tell the patient where we are.
  const loc = isVideo ? null : clinicLocation.publicLocation((await settings.getAll()).location);
  let emailSent = false;
  if (brevo.isConfigured() && !honeypot) {
    // Brevo: template auto-reply to the patient + notification to the clinic.
    const r = await brevo.sendBookingEmails({
      name: patient.name, email: patient.email, phone: patient.phone,
      date: formatWhen(date, time),
      service: [departmentName, doctor.name].filter(Boolean).join(' — ') + (links ? ' (video call)' : ''),
      message: reason || '',
      videoLink: links && links.patient, doctorName: doctor.name, location: loc
    });
    emailSent = r.autoReply;
  }
  // Doctor gets a calendar invite (.ics) for the appointment.
  const doctorInvited = await brevo.sendDoctorInvite({ kind: 'booked', appointment: appt, doctor, patient, departmentName, videoLink: links && links.doctor, location: loc })
    .catch(err => { console.error('doctor invite:', err.message); return false; });
  // SMTP (if configured in Admin → Settings) notifies extra addresses; the
  // patient/doctor are skipped when Brevo already emailed them.
  await mailer.notifyBooking({ appointment: appt, doctor, patient, departmentName, skipPatient: emailSent, skipDoctor: doctorInvited })
    .catch(err => console.error('notifyBooking:', err.message));
  return { ...apptOut(appt), emailSent, ...(links ? { videoLink: links.patient } : {}), ...(loc ? { location: loc } : {}) };
}

app.post('/api/appointments', auth(['patient']), formLimiter, wrap(async (req, res) => {
  const { doctorId, date, time, reason, website, visitType } = req.body || {};
  res.json(await createBooking({ patient: req.account, doctorId, date, time, reason, honeypot: website, visitType }));
}));

// Book without an account: name + email + phone. Re-uses the patient record
// if this email has booked before, otherwise creates a "guest" patient (no
// password). They can create a full account later with the same email.
const guestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many bookings from this device. Please try again later or call us.' } });

// Placeholder address for patients without email (reception bookings).
// Nothing is ever sent to *.invalid addresses.
const NO_EMAIL_DOMAIN = 'no-email.invalid';
const hasRealEmail = e => !!e && !String(e).toLowerCase().endsWith('.invalid');

// Patient summary used everywhere staff/doctors see patients.
const patientOut = p => ({
  id: p.id, patientId: displayPatientId(p.phoneKey), name: p.name,
  email: hasRealEmail(p.email) ? p.email : '', phone: p.phone, dob: p.dob, gender: p.gender,
  isGuest: p.isGuest, createdAt: p.createdAt, marketingOptOut: !!p.marketingOptOut,
  country: p.country || '', region: p.region || '', countryGuess: audience.countryFromPhoneKey(p.phoneKey)
});

// Find the patient by phone (the Patient ID); otherwise by email; otherwise
// create a guest patient. Returns the patient record.
async function findOrCreatePatient({ name, email, phone, allowNoEmail = false, updateGuest = true }) {
  const phoneKey = normalizePhone(phone);
  if (!phoneKey) throw new HttpError(400, 'Please enter a valid mobile number (it is used as the Patient ID).');
  if (email && !isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!email && !allowNoEmail) throw new HttpError(400, 'Please enter a valid email address so we can send your confirmation.');
  let patient = await prisma.patient.findUnique({ where: { phoneKey } });
  if (patient) {
    if (patient.isGuest && updateGuest) {
      const data = { name, phone };
      // Take the new email if we had none (or a placeholder) and it's free.
      if (email && email !== patient.email && (!hasRealEmail(patient.email) || patient.isGuest)) {
        const clash = await prisma.patient.findUnique({ where: { email } });
        if (!clash && !(await emailTaken(email))) data.email = email;
      }
      patient = await prisma.patient.update({ where: { id: patient.id }, data });
    }
    return patient;
  }
  if (email) {
    const byEmail = await prisma.patient.findUnique({ where: { email } });
    if (byEmail) {
      if (byEmail.phoneKey && byEmail.phoneKey !== phoneKey) {
        throw new HttpError(409, 'This email is already registered with a different phone number. Please use that number, or contact the clinic.');
      }
      return prisma.patient.update({ where: { id: byEmail.id }, data: { phoneKey, phone, ...(byEmail.isGuest && updateGuest ? { name } : {}) } });
    }
    const [doc, staff] = await Promise.all([
      prisma.doctor.findUnique({ where: { email } }), prisma.staff.findUnique({ where: { email } })
    ]);
    if (doc || staff) throw new HttpError(409, 'This email belongs to a clinic account. Please use a personal email.');
  }
  try {
    return await prisma.patient.create({
      data: { id: newId('pt'), name, email: email || `${phoneKey}@${NO_EMAIL_DOMAIN}`, phone, phoneKey, isGuest: true, passwordHash: '!guest-no-password' }
    });
  } catch (e) {
    if (e.code === 'P2002') return prisma.patient.findUnique({ where: { phoneKey } }); // created a moment ago
    throw e;
  }
}

app.post('/api/appointments/guest', guestLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  if (str(b.website, 200)) return res.json({ ok: true, emailSent: true }); // honeypot: pretend success
  const name = str(b.name, 120).replace(/[\r\n]+/g, ' ');
  const email = normEmail(b.email);
  const phone = str(b.phone, 40);
  if (!name) throw new HttpError(400, 'Please enter your full name.');
  if (!isEmail(email) || email.length > 254) throw new HttpError(400, 'Please enter a valid email address so we can send your confirmation.');
  if (!normalizePhone(phone)) throw new HttpError(400, 'Please enter a valid mobile number so the clinic can reach you.');
  const patient = await findOrCreatePatient({ name, email, phone });
  const out = await createBooking({ patient, doctorId: b.doctorId, date: str(b.date, 10), time: str(b.time, 5), reason: str(b.reason, 2000), visitType: b.visitType });
  res.json({ ...out, patientId: displayPatientId(patient.phoneKey) });
}));

// Reception / staff book on behalf of a patient (phone or walk-in).
// Body: { phone, name, email?, doctorId, date, time, reason? }
app.post('/api/admin/appointments', perm('appointments.book'), wrap(async (req, res) => {
  const b = req.body || {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const name = str(b.name, 120).replace(/[\r\n]+/g, ' ');
  const email = normEmail(b.email);
  if (!name) throw new HttpError(400, "Please enter the patient's full name.");
  const patient = await findOrCreatePatient({ name, email: email || '', phone: str(b.phone, 40), allowNoEmail: true, updateGuest: true });
  const out = await createBooking({ patient, doctorId: b.doctorId, date: str(b.date, 10), time: str(b.time, 5), reason: str(b.reason, 2000), visitType: b.visitType });
  res.json({ ...out, patient: patientOut(patient), bookedBy: req.account.name });
}));

// Look up one patient by phone (reception's "find patient" box).
app.get('/api/admin/patients/lookup', perm('patients.view'), wrap(async (req, res) => {
  const phoneKey = normalizePhone(req.query.phone);
  if (!phoneKey) throw new HttpError(400, 'Enter a valid mobile number.');
  const p = await prisma.patient.findUnique({ where: { phoneKey } });
  res.json({ patientId: displayPatientId(phoneKey), patient: p ? patientOut(p) : null });
}));

// "Thursday, 1 October 2026 at 10:30 AM" for emails.
function formatWhen(date, time) {
  if (!DATE_RE.test(String(date || ''))) return String(date || '');
  const d = new Date(date + 'T00:00:00Z');
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (!TIME_RE.test(String(time || ''))) return day;
  const [h, m] = time.split(':').map(Number);
  return `${day} at ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Public appointment-request endpoint (JSON or form-urlencoded):
// name, email, phone, date, service, message (+ hidden honeypot "website").
// Sends the Brevo auto-reply to the requester and a notification to the clinic.
app.post('/api/book', bookLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  if (str(b.website, 200)) return res.json({ ok: true }); // bot filled the honeypot: pretend success
  const name = str(b.name, 120).replace(/[\r\n]+/g, ' ');
  const email = normEmail(b.email);
  if (!name) throw new HttpError(400, 'Please tell us your name.');
  if (!isEmail(email) || email.length > 254) throw new HttpError(400, 'Please enter a valid email address so we can send your confirmation.');
  const date = str(b.date, 60);
  const fields = {
    name, email,
    phone: str(b.phone, 40),
    date: DATE_RE.test(date) ? formatWhen(date, str(b.time, 5)) : date,
    service: str(b.service, 120),
    message: str(b.message, 2000)
  };
  const r = await brevo.sendBookingEmails(fields);
  if (!r.autoReply) {
    throw new HttpError(502, "Sorry, we couldn't send your confirmation right now. Please try again in a few minutes, or call us.");
  }
  res.json({ ok: true, message: "Thanks! We've emailed you a confirmation." });
}));

app.get('/api/patients/me', auth(['patient']), wrap(async (req, res) => {
  res.json(patientOut(req.account));
}));

app.get('/api/patients/me/appointments', auth(['patient']), wrap(async (req, res) => {
  const appts = await prisma.appointment.findMany({
    where: { patientId: req.user.sub },
    include: { doctor: { include: { department: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }]
  });
  res.json(appts.map(a => {
    const links = a.status !== 'cancelled' && videoLinks(a);
    return {
      ...apptOut(a),
      doctorName: a.doctor ? a.doctor.name : 'Unknown',
      departmentName: a.doctor && a.doctor.department ? a.doctor.department.name : '',
      ...(links ? { videoLink: links.patient } : {})
    };
  }));
}));

async function cancelAppointment(where, by, { notifyPatient = true } = {}) {
  const appt = await prisma.appointment.findFirst({ where, include: { doctor: { include: { department: true } }, patient: true } });
  if (!appt) throw new HttpError(404, 'Appointment not found.');
  if (appt.status === 'cancelled') return appt;
  const updated = await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'cancelled' } });
  if (appt.videoRoom) await video.deleteRoom(appt.videoRoom); // link stops working
  // Removes the event from the doctor's calendar.
  const doctorNotified = await brevo.sendDoctorInvite({
    kind: 'cancelled', appointment: appt, doctor: appt.doctor, patient: appt.patient,
    departmentName: appt.doctor.department && appt.doctor.department.name
  }).catch(err => { console.error('doctor cancellation:', err.message); return false; });
  await mailer.notifyCancellation({ appointment: appt, doctor: appt.doctor, patient: appt.patient, by, skipDoctor: doctorNotified, skipPatient: !notifyPatient })
    .catch(err => console.error('notifyCancellation:', err.message));
  return updated;
}

app.post('/api/patients/me/appointments/:id/cancel', auth(['patient']), wrap(async (req, res) => {
  const a = await cancelAppointment({ id: req.params.id, patientId: req.user.sub }, 'the patient');
  res.json(apptOut(a));
}));

// Admin + front-desk staff: every booking.
app.get('/api/admin/appointments', perm('appointments.view'), wrap(async (req, res) => {
  const appts = await prisma.appointment.findMany({
    include: { doctor: { select: { name: true } }, patient: { select: { name: true, phone: true, email: true, phoneKey: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }]
  });
  res.json(appts.map(a => ({
    ...apptOut(a),
    doctorName: a.doctor ? a.doctor.name : 'Unknown',
    patientName: a.patient ? a.patient.name : 'Unknown patient',
    patientId: a.patient ? displayPatientId(a.patient.phoneKey) : '',
    patientPhone: a.patient ? a.patient.phone : '',
    patientEmail: a.patient && hasRealEmail(a.patient.email) ? a.patient.email : '',
    ...(staffCan(req, 'appointments.book') && a.status !== 'cancelled' && videoLinks(a)
      ? { videoPatientLink: videoLinks(a).patient, videoDoctorLink: videoLinks(a).doctor } : {})
  })));
}));

// Re-send the calendar invite to the doctor (e.g. after fixing their email).
app.post('/api/admin/appointments/:id/send-invite', perm('appointments.book'), wrap(async (req, res) => {
  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.id }, include: { doctor: { include: { department: true } }, patient: true }
  });
  if (!appt) throw new HttpError(404, 'Appointment not found.');
  if (!brevo.isConfigured()) throw new HttpError(400, 'Email sending (Brevo) is not set up.');
  const links = videoLinks(appt);
  const ok = await brevo.sendDoctorInvite({
    kind: appt.status === 'cancelled' ? 'cancelled' : 'booked', appointment: appt, doctor: appt.doctor, patient: appt.patient,
    departmentName: appt.doctor.department && appt.doctor.department.name, videoLink: links && links.doctor
  });
  if (!ok) throw new HttpError(502, `Could not send to ${appt.doctor.email}. Check the address is a real mailbox, and that it isn't blocked in Brevo.`);
  res.json({ ok: true, to: appt.doctor.email });
}));

app.post('/api/admin/appointments/:id/cancel', perm('appointments.cancel'), wrap(async (req, res) => {
  const a = await cancelAppointment({ id: req.params.id }, 'the clinic');
  res.json(apptOut(a));
}));

// ---------- VIDEO CALLS ----------
// Public (no login): the secret key in the link is the permission. Returns
// the call status and, when the window is open, a personal join link.
const videoLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes.' } });
const sameKey = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

app.get('/api/video/:id', videoLimiter, wrap(async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: String(req.params.id) }, include: { doctor: true, patient: true } });
  const key = String(req.query.k || '');
  const role = a && a.visitType === 'video' ? (sameKey(key, a.videoDoctorKey) ? 'doctor' : sameKey(key, a.videoPatientKey) ? 'patient' : null) : null;
  if (!role) throw new HttpError(404, 'This video link is not valid. Please check the link in your email.');
  const start = brevo.clinicTimeToDate(a.date, a.time);
  const { opens, closes } = video.joinWindow(start, a.doctor.slotMinutes);
  const base = {
    role, doctorName: a.doctor.name, patientFirstName: String(a.patient.name || '').split(' ')[0],
    date: a.date, time: a.time, startsAt: start.toISOString(), opensAt: opens.toISOString(), closesAt: closes.toISOString(),
    earlyMinutes: video.EARLY_MIN, provider: video.provider()
  };
  if (a.status === 'cancelled') return res.json({ ...base, status: 'cancelled' });
  const now = Date.now();
  if (now < opens.getTime()) return res.json({ ...base, status: 'early' });
  if (now > closes.getTime()) return res.json({ ...base, status: 'ended' });
  if (!video.isConfigured()) throw new HttpError(503, 'Video calls are not set up yet. Please call the clinic.');
  // Create the private room the first time anyone joins.
  let roomName = a.videoRoom, roomUrl = a.videoRoomUrl;
  if (!roomName) {
    const room = await video.createRoom({ appointmentId: a.id, opens, closes });
    const upd = await prisma.appointment.updateMany({ where: { id: a.id, videoRoom: '' }, data: { videoRoom: room.name, videoRoomUrl: room.url } });
    if (upd.count === 0) { // someone else created it at the same moment
      await video.deleteRoom(room.name);
      const fresh = await prisma.appointment.findUnique({ where: { id: a.id } });
      roomName = fresh.videoRoom; roomUrl = fresh.videoRoomUrl;
    } else { roomName = room.name; roomUrl = room.url; }
  }
  const joinUrl = await video.joinLink({
    roomName, roomUrl, closes, isOwner: role === 'doctor',
    userName: role === 'doctor' ? a.doctor.name : a.patient.name
  });
  res.json({ ...base, status: 'open', joinUrl });
}));

// ---------- MARKETING (promotion emails) ----------
const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_CAMPAIGN_IMAGE = 1.5 * 1024 * 1024;
const CAMPAIGN_META = { id: true, subject: true, headline: true, body: true, buttonText: true, buttonUrl: true, imageMime: true, status: true, sentAt: true, sentCount: true, failedCount: true, audience: true, createdAt: true, updatedAt: true };
const campaignImageUrl = c => c.imageMime ? `${SITE_URL()}/api/campaigns/${c.id}/image?v=${new Date(c.updatedAt).getTime()}` : '';
const campaignOut = c => {
  const a = audience.parseAudience(c.audience);
  return { ...c, audience: a, audienceText: audience.describeAudience(a), imageUrl: campaignImageUrl(c) };
};

function campaignData(b, { partial = false } = {}) {
  const data = {};
  const str = (k, max) => { if (b[k] !== undefined) data[k] = marketing.plain(b[k]).trim().slice(0, max); };
  str('subject', 150); str('headline', 200); str('body', 5000); str('buttonText', 40);
  if (b.audience !== undefined) data.audience = JSON.stringify(audience.normAudience(b.audience));
  if (b.buttonUrl !== undefined) {
    const u = String(b.buttonUrl || '').trim();
    if (u) {
      let ok = false;
      try { const x = new URL(u); ok = x.protocol === 'https:' || x.protocol === 'http:'; } catch (e) { /* invalid */ }
      if (!ok) throw new HttpError(400, 'The button link must be a full web address starting with https://');
    }
    data.buttonUrl = u.slice(0, 1000);
  }
  if (!partial && !data.subject) throw new HttpError(400, 'Please enter an email subject.');
  if (data.subject === '') throw new HttpError(400, 'Please enter an email subject.');
  if (b.image !== undefined) {
    if (!b.image) { data.imageData = null; data.imageMime = ''; }
    else {
      const m = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(b.image));
      if (!m) throw new HttpError(400, 'The image must be a JPG, PNG, GIF or WEBP file.');
      const buf = Buffer.from(m[2], 'base64');
      const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
      if (!buf.length || !FILE_TYPES[ext].magic(buf)) throw new HttpError(400, "That image file doesn't look right. Please try another.");
      if (buf.length > MAX_CAMPAIGN_IMAGE) throw new HttpError(413, 'The image is larger than 1.5 MB. Please use a smaller one (emails load faster).');
      data.imageData = buf; data.imageMime = FILE_TYPES[ext].mime;
    }
  }
  return data;
}

app.get('/api/admin/campaigns', perm('marketing.send'), wrap(async (req, res) => {
  const [campaigns, people] = await Promise.all([
    prisma.campaign.findMany({ select: CAMPAIGN_META, orderBy: { createdAt: 'desc' }, take: 200 }),
    audience.everyone(prisma)
  ]);
  const active = people.filter(p => !p.optOut);
  res.json({
    campaigns: campaigns.map(campaignOut), audience: active.length, unsubscribed: people.length - active.length,
    patients: active.filter(p => p.kind === 'patient').length, contacts: active.filter(p => p.kind === 'contact').length,
    emailReady: brevo.isConfigured()
  });
}));

app.post('/api/admin/campaigns', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.campaign.create({ data: { id: newId('cmp'), ...campaignData(req.body || {}), createdById: req.user.sub }, select: CAMPAIGN_META });
  res.json(campaignOut(c));
}));

app.patch('/api/admin/campaigns/:id', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, select: { status: true } });
  if (!c) throw new HttpError(404, 'Promotion not found.');
  if (c.status !== 'draft') throw new HttpError(400, 'This promotion was already sent. Use "Copy" to make a new one.');
  const u = await prisma.campaign.update({ where: { id: req.params.id }, data: campaignData(req.body || {}, { partial: true }), select: CAMPAIGN_META });
  res.json(campaignOut(u));
}));

app.delete('/api/admin/campaigns/:id', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, select: { status: true } });
  if (!c) throw new HttpError(404, 'Promotion not found.');
  if (c.status === 'sending') throw new HttpError(400, 'This promotion is being sent right now.');
  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Copy (e.g. to re-send an old offer).
app.post('/api/admin/campaigns/:id/copy', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!c) throw new HttpError(404, 'Promotion not found.');
  const n = await prisma.campaign.create({ data: {
    id: newId('cmp'), subject: c.subject, headline: c.headline, body: c.body, buttonText: c.buttonText, buttonUrl: c.buttonUrl,
    imageData: c.imageData, imageMime: c.imageMime, audience: c.audience, createdById: req.user.sub
  }, select: CAMPAIGN_META });
  res.json(campaignOut(n));
}));

// How many people a chosen audience reaches (live count in the editor).
app.post('/api/admin/campaigns/audience-count', perm('marketing.send'), wrap(async (req, res) => {
  const people = await audience.resolveAudience(prisma, (req.body || {}).audience);
  res.json({ count: people.length });
}));

// Countries / regions / groups that exist, with counts, for the picker.
app.get('/api/admin/marketing/segments', perm('marketing.send'), wrap(async (req, res) => {
  res.json(await audience.segmentOptions(prisma));
}));

// ---------- MARKETING CONTACTS (people who aren't patients, imports) ----------
const contactOut = c => ({ id: c.id, email: c.email, name: c.name, phone: c.phone, country: c.country, region: c.region,
  groups: audience.parseGroups(c.groups), subscribed: !c.optOut, source: c.source, createdAt: c.createdAt });

function contactData(b) {
  const data = {};
  if (b.name !== undefined) data.name = audience.clean(b.name, 120);
  if (b.phone !== undefined) data.phone = audience.clean(b.phone, 40);
  if (b.country !== undefined) data.country = audience.clean(b.country, 80);
  if (b.region !== undefined) data.region = audience.clean(b.region, 80);
  if (b.groups !== undefined) data.groups = audience.joinGroups(b.groups);
  return data;
}

// Everyone on the list (patients + contacts), filterable.
app.get('/api/admin/contacts', perm('marketing.send'), wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const group = String(req.query.group || '').toLowerCase();
  const kind = String(req.query.kind || '');
  let people = await audience.everyone(prisma);
  if (!staffCan(req, 'patients.view')) people = people.filter(p => p.kind === 'contact');
  if (kind === 'patient' || kind === 'contact') people = people.filter(p => p.kind === kind);
  if (group) people = people.filter(p => p.groups.some(g => g.toLowerCase() === group));
  if (q) people = people.filter(p => [p.name, p.email, p.phone, p.country, p.region, ...p.groups].some(v => String(v || '').toLowerCase().includes(q)));
  const total = people.length;
  people.sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
  res.json({ total, people: people.slice(0, 500).map(p => ({
    kind: p.kind, id: p.id, email: p.email, name: p.name, phone: p.phone, country: p.country, region: p.region,
    groups: p.groups, subscribed: !p.optOut, contactId: p.kind === 'contact' ? p.id : (p.alsoContactId || null)
  })) });
}));

app.post('/api/admin/contacts', perm('marketing.send'), wrap(async (req, res) => {
  const b = req.body || {};
  const email = normEmail(b.email);
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (await prisma.marketingContact.findUnique({ where: { email } })) throw new HttpError(409, 'That email is already on the list.');
  const c = await prisma.marketingContact.create({ data: { id: newId('mc'), email, source: 'manual', ...contactData(b) } });
  res.json(contactOut(c));
}));

app.patch('/api/admin/contacts/:id', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.marketingContact.findUnique({ where: { id: req.params.id } });
  if (!c) throw new HttpError(404, 'Contact not found.');
  const b = req.body || {};
  const data = contactData(b);
  if (b.email !== undefined) {
    const email = normEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (email !== c.email && await prisma.marketingContact.findUnique({ where: { email } })) throw new HttpError(409, 'That email is already on the list.');
    data.email = email;
  }
  const u = await prisma.marketingContact.update({ where: { id: c.id }, data });
  if (b.subscribed !== undefined) await audience.setOptOut(prisma, u.email, !b.subscribed);
  res.json(contactOut(await prisma.marketingContact.findUnique({ where: { id: c.id } })));
}));

app.delete('/api/admin/contacts/:id', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.marketingContact.findUnique({ where: { id: req.params.id } });
  if (!c) throw new HttpError(404, 'Contact not found.');
  await prisma.marketingContact.delete({ where: { id: c.id } });
  res.json({ ok: true });
}));

// Import rows parsed from a CSV in the browser. Same email = update (add
// groups, fill blanks). Never re-subscribes someone who unsubscribed.
app.post('/api/admin/contacts/import', perm('marketing.send'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.consent) throw new HttpError(400, 'Please confirm these people agreed to receive offers from the clinic.');
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) throw new HttpError(400, 'The file has no rows.');
  if (rows.length > 5000) throw new HttpError(400, 'Please import at most 5,000 rows at a time (split the file).');
  const extraGroups = audience.parseGroups(b.addGroups);
  const existing = new Map((await prisma.marketingContact.findMany()).map(c => [c.email, c]));
  const patientEmails = new Set((await prisma.patient.findMany({ select: { email: true } })).map(p => p.email.toLowerCase()));
  let added = 0, updated = 0, invalid = 0, duplicates = 0, patients = 0;
  const invalidRows = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const email = normEmail(r.email);
    if (!isEmail(email)) { invalid++; if (invalidRows.length < 10) invalidRows.push(i + 2); continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    if (patientEmails.has(email)) patients++;
    const groups = audience.parseGroups([...audience.parseGroups(r.groups), ...extraGroups]);
    const cur = existing.get(email);
    if (cur) {
      const data = { groups: audience.joinGroups([...audience.parseGroups(cur.groups), ...groups]) };
      for (const k of ['name', 'phone', 'country', 'region']) { const v = audience.clean(r[k], k === 'name' ? 120 : 80); if (v && !cur[k]) data[k] = v; }
      await prisma.marketingContact.update({ where: { id: cur.id }, data });
      updated++;
    } else {
      await prisma.marketingContact.create({ data: {
        id: newId('mc'), email, source: 'import', groups: audience.joinGroups(groups),
        name: audience.clean(r.name, 120), phone: audience.clean(r.phone, 40), country: audience.clean(r.country, 80), region: audience.clean(r.region, 80)
      } });
      added++;
    }
  }
  console.log(`Contacts import by ${req.user.sub}: ${added} added, ${updated} updated, ${invalid} invalid`);
  res.json({ added, updated, invalid, invalidRows, duplicates, alreadyPatients: patients });
}));

// Download everyone as CSV (opens in Excel). Patients only for roles that may see them.
app.get('/api/admin/contacts/export', perm('marketing.send'), wrap(async (req, res) => {
  let people = await audience.everyone(prisma);
  if (!staffCan(req, 'patients.view')) people = people.filter(p => p.kind === 'contact');
  const kind = String(req.query.kind || '');
  if (kind === 'patient' || kind === 'contact') people = people.filter(p => p.kind === kind);
  people.sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
  const csv = audience.toCsv([
    ['name', 'email', 'phone', 'country', 'region', 'groups', 'type', 'subscribed'],
    ...people.map(p => [p.name, p.email, p.phone, p.country, p.region, p.groups.filter(g => g !== 'Patients').join(', '), p.kind, p.optOut ? 'no' : 'yes'])
  ]);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="radiant-contacts-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' });
  res.send(csv);
}));

// Public: the offer image (emails load it from here).
app.get('/api/campaigns/:id/image', wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, select: { imageData: true, imageMime: true } });
  if (!c || !c.imageData || !c.imageMime) throw new HttpError(404, 'Not found.');
  res.set({ 'Content-Type': c.imageMime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin' }); // mail apps load it from their own sites
  res.send(Buffer.from(c.imageData));
}));

async function campaignEmailOpts(c) {
  const s = await settings.getAll();
  return { siteUrl: SITE_URL(), imageUrl: campaignImageUrl(c), phone: s.phone };
}

// Preview exactly what patients will get (shown in Admin).
app.get('/api/admin/campaigns/:id/preview', perm('marketing.send'), wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, select: CAMPAIGN_META });
  if (!c) throw new HttpError(404, 'Promotion not found.');
  const { html } = marketing.buildEmail(c, { ...(await campaignEmailOpts(c)), values: { NAME: 'Aisha', UNSUB: '#' } });
  res.json({ html });
}));

app.post('/api/admin/campaigns/:id/test', perm('marketing.send'), wrap(async (req, res) => {
  if (!brevo.isConfigured()) throw new HttpError(400, 'Email sending (Brevo) is not set up.');
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, select: CAMPAIGN_META });
  if (!c) throw new HttpError(404, 'Promotion not found.');
  const email = normEmail((req.body && req.body.email) || req.account.email);
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address for the test.');
  try { await marketing.sendTest(c, { email, name: req.account.name }, await campaignEmailOpts(c)); }
  catch (e) { throw new HttpError(502, 'The test email could not be sent: ' + e.message); }
  res.json({ ok: true, email });
}));

// One click: send to every patient who hasn't unsubscribed.
app.post('/api/admin/campaigns/:id/send', perm('marketing.send'), wrap(async (req, res) => {
  if (!brevo.isConfigured()) throw new HttpError(400, 'Email sending (Brevo) is not set up.');
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, select: CAMPAIGN_META });
  if (!c) throw new HttpError(404, 'Promotion not found.');
  // Lock so a double click can't send twice.
  const lock = await prisma.campaign.updateMany({ where: { id: c.id, status: 'draft' }, data: { status: 'sending' } });
  if (lock.count === 0) throw new HttpError(409, 'This promotion was already sent.');
  let result;
  try {
    const people = await audience.resolveAudience(prisma, audience.parseAudience(c.audience));
    await audience.ensureKeys(prisma, people); // unsubscribe secret, made once per person
    const recipients = people.map(p => ({
      email: p.email, name: p.name,
      unsubUrl: `${SITE_URL()}/unsubscribe.html?p=${encodeURIComponent(p.id)}&k=${encodeURIComponent(p.key)}`,
      oneClickUrl: `${SITE_URL()}/api/unsubscribe/one-click?p=${encodeURIComponent(p.id)}&k=${encodeURIComponent(p.key)}`
    }));
    result = await marketing.sendCampaign(c, recipients, await campaignEmailOpts(c));
  } catch (e) {
    await prisma.campaign.update({ where: { id: c.id }, data: { status: 'draft' } });
    throw e;
  }
  if (result.sent === 0) {
    await prisma.campaign.update({ where: { id: c.id }, data: { status: 'draft', failedCount: result.failed } });
    throw new HttpError(502, 'Nothing was sent: ' + (result.error || 'nobody matches the groups you chose.'));
  }
  const u = await prisma.campaign.update({ where: { id: c.id }, data: { status: 'sent', sentAt: new Date(), sentCount: result.sent, failedCount: result.failed }, select: CAMPAIGN_META });
  res.json({ ...campaignOut(u), error: result.error });
}));

// The person behind an unsubscribe link (patient "pt_…" or contact "mc_…"), if the key matches.
async function unsubscriber(id, key) {
  id = String(id || ''); key = String(key || '');
  if (!id || !key) return null;
  const rec = id.startsWith('mc_')
    ? await prisma.marketingContact.findUnique({ where: { id }, select: { email: true, unsubKey: true } }).then(c => c && { email: c.email, key: c.unsubKey })
    : await prisma.patient.findUnique({ where: { id }, select: { email: true, marketingKey: true } }).then(p => p && { email: p.email, key: p.marketingKey });
  return rec && rec.key && sameKey(key, rec.key) ? rec : null;
}
const unsubLimiterOneClick = rateLimit({ windowMs: 10 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
// Public: one-click unsubscribe, called by Gmail/Yahoo/Outlook's own
// "Unsubscribe" button (RFC 8058: POST with body List-Unsubscribe=One-Click).
app.post('/api/unsubscribe/one-click', unsubLimiterOneClick, express.urlencoded({ extended: false, limit: '2kb' }), wrap(async (req, res) => {
  const who = await unsubscriber(req.query.p, req.query.k);
  if (who) await audience.setOptOut(prisma, who.email, true);
  res.json({ ok: true }); // same answer either way
}));

// Public: unsubscribe / re-subscribe from the link in the email.
const unsubLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes.' } });
app.post('/api/unsubscribe', unsubLimiter, wrap(async (req, res) => {
  const { p, k, resubscribe } = req.body || {};
  const who = await unsubscriber(p, k);
  if (!who) throw new HttpError(404, 'This unsubscribe link is not valid. Please contact the clinic and we will remove you.');
  await audience.setOptOut(prisma, who.email, !resubscribe);
  res.json({ ok: true, subscribed: !!resubscribe });
}));

// ---------- MEDICAL RECORDS ----------

app.get('/api/patients/me/records', auth(['patient']), wrap(async (req, res) => {
  const records = await prisma.medicalRecord.findMany({
    where: { patientId: req.user.sub },
    include: { doctor: { select: { name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });
  res.json(records.map(r => ({ ...recordOut(r), doctorName: r.doctor ? r.doctor.name : 'Unknown' })));
}));

// ---------- ADMIN: PATIENTS ----------

// ?q= searches Patient ID / phone, name and email.
app.get('/api/admin/patients', perm('patients.view'), wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  let where;
  if (q) {
    const digits = q.replace(/\D/g, '');
    const key = normalizePhone(q);
    const or = [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }];
    if (digits.length >= 3) {
      or.push({ phoneKey: { contains: digits.replace(/^0+/, '') } });
      if (key) or.push({ phoneKey: key });
    }
    where = { OR: or };
  }
  const patients = await prisma.patient.findMany({
    where, orderBy: { createdAt: 'desc' }, take: q ? 50 : 500,
    include: { _count: { select: { appointments: true, records: true } } }
  });
  res.json(patients.map(p => ({ ...patientOut(p), appointmentCount: p._count.appointments, recordCount: p._count.records })));
}));

// Edit a patient's contact details. Changing the phone changes the Patient ID.
app.patch('/api/admin/patients/:id', perm('patients.edit'), wrap(async (req, res) => {
  const p = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'Patient not found.');
  const b = req.body || {};
  const data = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 120);
    if (!name) throw new HttpError(400, 'Name cannot be empty.');
    data.name = name;
  }
  if (b.phone !== undefined) {
    const phoneKey = normalizePhone(b.phone);
    if (!phoneKey) throw new HttpError(400, 'Please enter a valid mobile number.');
    if (phoneKey !== p.phoneKey) {
      const other = await prisma.patient.findUnique({ where: { phoneKey } });
      if (other) throw new HttpError(409, `That number is already the Patient ID of ${other.name}.`);
    }
    data.phone = String(b.phone).trim().slice(0, 40);
    data.phoneKey = phoneKey;
  }
  if (b.email !== undefined) {
    const email = normEmail(b.email);
    if (email) {
      if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
      if (email !== p.email && ((await prisma.patient.findUnique({ where: { email } })) || (await emailTaken(email)))) {
        throw new HttpError(409, 'Another account already uses this email.');
      }
      data.email = email;
    } else if (p.isGuest) {
      data.email = `${data.phoneKey || p.phoneKey || p.id}@${NO_EMAIL_DOMAIN}`;
    } else {
      throw new HttpError(400, 'This patient has an online account, so they need an email address.');
    }
  }
  if (b.dob !== undefined) data.dob = String(b.dob).slice(0, 20);
  if (b.gender !== undefined) data.gender = String(b.gender).slice(0, 30);
  if (b.country !== undefined) data.country = audience.clean(b.country, 80);
  if (b.region !== undefined) data.region = audience.clean(b.region, 80);
  const updated = await prisma.patient.update({ where: { id: p.id }, data });
  if (b.marketingOptOut !== undefined) { await audience.setOptOut(prisma, updated.email, !!b.marketingOptOut); updated.marketingOptOut = !!b.marketingOptOut; }
  res.json(patientOut(updated));
}));

// Delete a patient for good: their appointments, reports and files too.
// Upcoming appointments are cancelled first so they leave the doctor's calendar.
app.delete('/api/admin/patients/:id', perm('patients.delete'), wrap(async (req, res) => {
  const p = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'Patient not found.');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await prisma.appointment.findMany({ where: { patientId: p.id, status: { not: 'cancelled' }, date: { gte: today } } });
  for (const a of upcoming) {
    await cancelAppointment({ id: a.id }, 'the clinic', { notifyPatient: false }).catch(err => console.error('cancel before delete:', err.message));
  }
  const [files, records, appts] = await prisma.$transaction([
    prisma.recordFile.deleteMany({ where: { OR: [{ patientId: p.id }, { record: { patientId: p.id } }] } }),
    prisma.medicalRecord.deleteMany({ where: { patientId: p.id } }),
    prisma.appointment.deleteMany({ where: { patientId: p.id } }),
    prisma.patient.delete({ where: { id: p.id } })
  ]);
  console.log(`Patient ${p.id} deleted by ${req.user.sub}: ${appts.count} appointments, ${records.count} records, ${files.count} files`);
  res.json({ ok: true, deleted: { appointments: appts.count, records: records.count, files: files.count, upcomingCancelled: upcoming.length } });
}));

app.get('/api/admin/patients/:id', perm('patients.view'), wrap(async (req, res) => {
  const p = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'Patient not found.');
  const canRecords = staffCan(req, 'records.view');
  const [appointments, records] = await Promise.all([
    prisma.appointment.findMany({ where: { patientId: p.id }, include: { doctor: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { time: 'desc' }] }),
    canRecords
      ? prisma.medicalRecord.findMany({ where: { patientId: p.id }, include: { doctor: { select: { name: true } }, files: FILE_META }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] })
      : Promise.resolve([])
  ]);
  res.json({
    patient: patientOut(p),
    canViewRecords: canRecords,
    appointments: appointments.map(a => ({ ...apptOut(a), doctorName: a.doctor ? a.doctor.name : 'Unknown' })),
    records: records.map(r => ({ ...recordOut(r), doctorName: r.doctor ? r.doctor.name : 'Unknown' }))
  });
}));

// Admin adds a report to a patient's history on behalf of a doctor (e.g. a
// walk-in, or results that came in by email). The record shows who entered it.
app.post('/api/admin/patients/:id/records', perm('records.write'), wrap(async (req, res) => {
  const p = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'Patient not found.');
  const { doctorId, diagnosis, notes, prescription, date } = req.body || {};
  if (!notes || !String(notes).trim()) throw new HttpError(400, 'Notes are required.');
  const doctor = doctorId && await prisma.doctor.findUnique({ where: { id: String(doctorId) } });
  if (!doctor || !doctor.active) throw new HttpError(400, 'Please choose the doctor this report belongs to.');
  const day = DATE_RE.test(String(date || '')) && String(date) <= clinicNow().date ? String(date) : clinicNow().date;
  const r = await prisma.medicalRecord.create({
    data: {
      id: newId('rec'), patientId: p.id, doctorId: doctor.id, date: day,
      diagnosis: String(diagnosis || '').slice(0, 500), notes: String(notes).slice(0, 10000), prescription: String(prescription || '').slice(0, 2000),
      enteredById: req.user.sub, enteredByName: req.account.name
    }
  });
  res.json({ ...recordOut(r), doctorName: doctor.name, files: [] });
}));

app.post('/api/admin/records/:recordId/files', perm('records.write'), wrap(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({ where: { id: req.params.recordId } });
  if (!record) throw new HttpError(404, 'Record not found.');
  res.json(await saveRecordFile(record, req.user.sub, req.body));
}));

app.delete('/api/admin/files/:id', perm('records.write'), wrap(async (req, res) => {
  const f = await prisma.recordFile.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!f) throw new HttpError(404, 'File not found.');
  await prisma.recordFile.delete({ where: { id: f.id } });
  res.json({ ok: true });
}));

// ---------- ADMIN: STAFF ACCOUNTS ----------

const staffOut = (s, roles) => {
  const r = roles.find(x => x.id === s.role);
  return { id: s.id, name: s.name, email: s.email, role: s.role, roleName: r ? r.name : s.role, mustChangePassword: s.mustChangePassword, createdAt: s.createdAt };
};

// Only an admin may create admins or change an admin's account.
async function assertCanAssignRole(req, roleId) {
  const role = await prisma.role.findUnique({ where: { id: String(roleId || '') } });
  if (!role) throw new HttpError(400, 'Please choose a valid role.');
  if (role.id === 'admin' && req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can give someone the Admin role.');
  return role;
}

app.get('/api/admin/staff-accounts', perm('staff.manage'), wrap(async (req, res) => {
  const [staff, roles] = await Promise.all([prisma.staff.findMany({ orderBy: { createdAt: 'asc' } }), prisma.role.findMany()]);
  res.json(staff.map(s => staffOut(s, roles)));
}));

app.post('/api/admin/staff-accounts', perm('staff.manage'), wrap(async (req, res) => {
  const { name, password } = req.body || {};
  const roleId = (req.body && req.body.role) === 'staff' ? 'reception' : req.body && req.body.role; // old form value
  const email = normEmail(req.body && req.body.email);
  if (!name || !email || !password) throw new HttpError(400, 'Name, email and temporary password are required.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const role = await assertCanAssignRole(req, roleId);
  if (String(password).length < 8) throw new HttpError(400, 'Temporary password must be at least 8 characters.');
  if (await emailTaken(email)) throw new HttpError(409, 'An account with this email already exists.');
  const s = await prisma.staff.create({
    data: { id: newId('staff'), name, email, role: role.id, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true }
  });
  res.json(staffOut(s, [role]));
}));

// Change a staff member's role, name or email.
app.patch('/api/admin/staff-accounts/:id', perm('staff.manage'), wrap(async (req, res) => {
  const s = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!s) throw new HttpError(404, 'Account not found.');
  if (s.role === 'admin' && req.user.role !== 'admin') throw new HttpError(403, "Only an admin can change an admin's account.");
  const b = req.body || {};
  const data = {};
  if (b.role !== undefined && b.role !== s.role) {
    await assertCanAssignRole(req, b.role);
    if (s.id === req.user.sub) throw new HttpError(400, "You can't change your own role.");
    if (s.email === PRIMARY_ADMIN_EMAIL) throw new HttpError(400, 'The main admin account must stay Admin.');
    if (s.role === 'admin' && (await prisma.staff.count({ where: { role: 'admin' } })) <= 1) throw new HttpError(400, 'At least one admin account must remain.');
    data.role = b.role;
  }
  if (b.name !== undefined) { const n = String(b.name).trim(); if (!n) throw new HttpError(400, 'Name cannot be empty.'); data.name = n; }
  if (b.email !== undefined) {
    const email = normEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (email !== s.email) {
      if (s.email === PRIMARY_ADMIN_EMAIL) throw new HttpError(400, "The main admin account's email can't be changed.");
      if (await emailTaken(email)) throw new HttpError(409, 'Another account already uses this email.');
      data.email = email;
    }
  }
  const updated = await prisma.staff.update({ where: { id: s.id }, data });
  res.json(staffOut(updated, await prisma.role.findMany()));
}));

app.post('/api/admin/staff-accounts/:id/reset-password', perm('staff.manage'), wrap(async (req, res) => {
  const s = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!s) throw new HttpError(404, 'Account not found.');
  if (s.role === 'admin' && req.user.role !== 'admin') throw new HttpError(403, "Only an admin can reset an admin's password.");
  const password = String((req.body && req.body.password) || '');
  if (password.length < 8) throw new HttpError(400, 'Temporary password must be at least 8 characters.');
  await prisma.staff.update({ where: { id: s.id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
  res.json({ ok: true });
}));

app.delete('/api/admin/staff-accounts/:id', perm('staff.manage'), wrap(async (req, res) => {
  const s = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!s) throw new HttpError(404, 'Account not found.');
  if (s.id === req.user.sub) throw new HttpError(400, "You can't remove your own account while logged in.");
  if (s.email === PRIMARY_ADMIN_EMAIL) throw new HttpError(400, 'The main admin account cannot be removed.');
  if (s.role === 'admin' && req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can remove an admin.');
  if (s.role === 'admin' && (await prisma.staff.count({ where: { role: 'admin' } })) <= 1) {
    throw new HttpError(400, 'At least one admin account must remain.');
  }
  await prisma.staff.delete({ where: { id: s.id } });
  res.json({ ok: true });
}));

// ---------- ADMIN: ROLES & PERMISSIONS ----------

const roleOut = (r, counts) => ({
  id: r.id, name: r.name, builtIn: r.builtIn, locked: r.id === 'admin',
  permissions: [...parsePerms(r.permissions)], staffCount: counts[r.id] || 0
});

app.get('/api/admin/roles', perm('staff.manage'), wrap(async (req, res) => {
  const [roles, staff] = await Promise.all([prisma.role.findMany({ orderBy: { createdAt: 'asc' } }), prisma.staff.findMany({ select: { role: true } })]);
  const counts = staff.reduce((m, x) => ((m[x.role] = (m[x.role] || 0) + 1), m), {});
  const order = ['admin', 'reception', 'nurse', 'manager'];
  roles.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  res.json({ permissions: PERMISSIONS, roles: roles.map(r => roleOut(r, counts)) });
}));

const cleanPerms = list => [...new Set((Array.isArray(list) ? list : []).filter(k => VALID_PERMS.has(k)))].join(',');

app.post('/api/admin/roles', perm('staff.manage'), wrap(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'Please give the role a name, e.g. "Lab technician".');
  const all = await prisma.role.findMany();
  if (all.some(r => r.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'A role with this name already exists.');
  const r = await prisma.role.create({ data: { id: newId('role'), name, permissions: cleanPerms(req.body.permissions) } });
  res.json(roleOut(r, {}));
}));

app.patch('/api/admin/roles/:id', perm('staff.manage'), wrap(async (req, res) => {
  const r = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!r) throw new HttpError(404, 'Role not found.');
  if (r.id === 'admin') throw new HttpError(400, 'The Admin role always has every permission and cannot be changed.');
  const data = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'Role name cannot be empty.');
    data.name = name;
  }
  if (req.body.permissions !== undefined) {
    const next = cleanPerms(req.body.permissions);
    // Don't let someone remove "manage staff" from their own role and lock themselves out.
    if (req.user.roleId === r.id && !next.split(',').includes('staff.manage')) {
      throw new HttpError(400, "You can't remove 'Manage staff' from your own role.");
    }
    data.permissions = next;
  }
  const updated = await prisma.role.update({ where: { id: r.id }, data });
  const count = await prisma.staff.count({ where: { role: r.id } });
  res.json(roleOut(updated, { [r.id]: count }));
}));

app.delete('/api/admin/roles/:id', perm('staff.manage'), wrap(async (req, res) => {
  const r = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!r) throw new HttpError(404, 'Role not found.');
  if (r.builtIn) throw new HttpError(400, 'Built-in roles can be edited but not deleted.');
  const count = await prisma.staff.count({ where: { role: r.id } });
  if (count) throw new HttpError(409, `${count} staff login${count === 1 ? '' : 's'} still use this role. Move them to another role first.`);
  await prisma.role.delete({ where: { id: r.id } });
  res.json({ ok: true });
}));

// ---------- ADMIN: SETTINGS ----------

app.get('/api/admin/settings', perm('settings.manage'), wrap(async (req, res) => {
  const s = await settings.getAll();
  // Never send the SMTP password back — just whether one is set.
  res.json({ ...s, smtp: { ...s.smtp, pass: s.smtp.pass ? true : '' } });
}));

app.patch('/api/admin/settings', perm('settings.manage'), wrap(async (req, res) => {
  const body = req.body || {};
  for (const k of ['phone', 'whatsapp', 'contactEmail']) {
    if (body[k] !== undefined) await settings.setKey(k, String(body[k]).trim());
  }
  if (body.location !== undefined) {
    let loc;
    try { loc = clinicLocation.normalize(body.location); } catch (e) { throw new HttpError(e.status || 400, e.message); }
    await settings.setKey('location', loc);
  }
  if (body.notifyEmails !== undefined) {
    if (!Array.isArray(body.notifyEmails)) throw new HttpError(400, 'notifyEmails must be a list.');
    const list = [...new Set(body.notifyEmails.map(normEmail))];
    const bad = list.find(e => !isEmail(e));
    if (bad) throw new HttpError(400, `"${bad}" is not a valid email address.`);
    await settings.setKey('notifyEmails', list);
  }
  if (body.smtp) {
    const current = (await prisma.setting.findUnique({ where: { key: 'smtp' } }))?.value || {};
    const next = {
      host: String(body.smtp.host || '').trim(),
      port: Number(body.smtp.port) || 587,
      secure: !!body.smtp.secure,
      user: String(body.smtp.user || '').trim(),
      from: String(body.smtp.from || '').trim(),
      pass: body.smtp.pass ? settings.encrypt(body.smtp.pass) : (current.pass || '')
    };
    await settings.setKey('smtp', next);
  }
  res.json({ ok: true });
}));

app.post('/api/admin/settings/test-email', perm('settings.manage'), wrap(async (req, res) => {
  const to = normEmail(req.body && req.body.to);
  if (!isEmail(to)) throw new HttpError(400, 'Enter a valid email address to test with.');
  try {
    await mailer.send({ to, subject: 'Radiant Health Alliance — test email', text: 'SMTP is working. Appointment notifications will be sent from this address.' }, { throwOnError: true });
  } catch (e) {
    throw new HttpError(400, 'Could not send test email: ' + e.message);
  }
  res.json({ ok: true });
}));

// ---------- TEAM ----------

const teamOut = m => ({ id: m.id, name: m.name, role: m.role, bio: m.bio, photo: m.photo, createdAt: m.createdAt });
const teamOrder = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

app.get('/api/team', wrap(async (req, res) => {
  const [doctors, members] = await Promise.all([
    prisma.doctor.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } }),
    prisma.teamMember.findMany({ orderBy: teamOrder })
  ]);
  res.json({ doctors: doctors.map(d => doctorOut(d, { includeEmail: false })), staffMembers: members.map(teamOut) });
}));

app.get('/api/team-members', wrap(async (req, res) => {
  res.json((await prisma.teamMember.findMany({ orderBy: teamOrder })).map(teamOut));
}));

app.post('/api/admin/team-members', perm('directory.manage'), wrap(async (req, res) => {
  const { name, role, bio, photo } = req.body || {};
  if (!name || !role) throw new HttpError(400, 'Name and role are required.');
  if (!isValidPhoto(photo)) throw new HttpError(400, 'Photo must be a JPG, PNG, WEBP, or GIF image.');
  const count = await prisma.teamMember.count();
  const m = await prisma.teamMember.create({ data: { id: newId('team'), name, role, bio: bio || '', photo: photo || null, sortOrder: count } });
  res.json(teamOut(m));
}));

app.patch('/api/admin/team-members/:id', perm('directory.manage'), wrap(async (req, res) => {
  const { name, role, bio, photo } = req.body || {};
  if (photo !== undefined && !isValidPhoto(photo)) throw new HttpError(400, 'Photo must be a JPG, PNG, WEBP, or GIF image.');
  const existing = await prisma.teamMember.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Team member not found.');
  const data = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (bio !== undefined) data.bio = bio;
  if (photo !== undefined) data.photo = photo || null;
  res.json(teamOut(await prisma.teamMember.update({ where: { id: existing.id }, data })));
}));

app.delete('/api/admin/team-members/:id', perm('directory.manage'), wrap(async (req, res) => {
  const existing = await prisma.teamMember.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Team member not found.');
  await prisma.profileCertificate.deleteMany({ where: { ownerType: 'team', ownerId: existing.id } });
  await prisma.teamMember.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ---------- PUBLIC PROFILES (doctors + team) ----------
const lines = v => String(v || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const list = v => String(v || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const PROFILE_MODELS = { doctor: 'doctor', team: 'teamMember' };
const CERT_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const certOut = c => ({
  id: c.id, title: c.title, issuer: c.issuer, year: c.year, filename: c.filename, mimeType: c.mimeType, size: c.size,
  isImage: /^image\//.test(c.mimeType), fileUrl: c.size ? `/api/certificates/${c.id}/file` : ''
});
async function findProfileOwner(type, id, { publicOnly = false } = {}) {
  const model = PROFILE_MODELS[type];
  if (!model) throw new HttpError(404, 'Profile not found.');
  const o = await prisma[model].findUnique({ where: { id: String(id) }, include: type === 'doctor' ? { department: true } : undefined });
  if (!o || (type === 'doctor' && publicOnly && !o.active)) throw new HttpError(404, 'Profile not found.');
  return o;
}
async function profileOut(type, o) {
  const certs = await prisma.profileCertificate.findMany({ where: { ownerType: type, ownerId: o.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, issuer: true, year: true, filename: true, mimeType: true, size: true } });
  const base = {
    type, id: o.id, name: o.name, photo: o.photo, bio: o.bio, about: o.about,
    qualifications: lines(o.qualifications), education: lines(o.education), expertise: list(o.expertise), languages: list(o.languages),
    experienceYears: o.experienceYears || 0, certificates: certs.map(certOut)
  };
  if (type === 'doctor') return { ...base, title: o.specialty, specialty: o.specialty, department: o.department ? { id: o.department.id, name: o.department.name } : null,
    offersVideo: !!o.offersVideo, workingDays: parseDays(o.workingDays), workingHours: { start: o.workStart, end: o.workEnd } };
  return { ...base, title: o.role, role: o.role };
}

app.get('/api/profiles/:type/:id', wrap(async (req, res) => {
  const o = await findProfileOwner(req.params.type, req.params.id, { publicOnly: true });
  res.json(await profileOut(req.params.type, o));
}));

// Public: a certificate file (image or PDF) shown on a profile.
app.get('/api/certificates/:id/file', wrap(async (req, res) => {
  const c = await prisma.profileCertificate.findUnique({ where: { id: req.params.id } });
  if (!c || !c.data) throw new HttpError(404, 'Not found.');
  if (c.ownerType === 'doctor') {
    const d = await prisma.doctor.findUnique({ where: { id: c.ownerId }, select: { active: true } });
    if (!d || !d.active) throw new HttpError(404, 'Not found.');
  }
  res.set({ 'Content-Type': c.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400',
    'Content-Disposition': `inline; filename="${encodeURIComponent(c.filename || 'certificate')}"` });
  res.send(Buffer.from(c.data));
}));

app.get('/api/admin/profiles/:type/:id', perm('profiles.manage'), wrap(async (req, res) => {
  const o = await findProfileOwner(req.params.type, req.params.id);
  res.json({ ...(await profileOut(req.params.type, o)), raw: {
    qualifications: o.qualifications, education: o.education, expertise: o.expertise, languages: o.languages
  } });
}));

app.patch('/api/admin/profiles/:type/:id', perm('profiles.manage'), wrap(async (req, res) => {
  const type = req.params.type;
  const o = await findProfileOwner(type, req.params.id);
  const b = req.body || {};
  const str = (k, max) => { if (b[k] !== undefined) data[k] = String(b[k] == null ? '' : b[k]).replace(/\r/g, '').trim().slice(0, max); };
  const data = {};
  str('bio', 1000); str('about', 5000); str('qualifications', 3000); str('education', 3000); str('expertise', 1000); str('languages', 300);
  if (b.experienceYears !== undefined) {
    const n = Number(b.experienceYears);
    if (!Number.isInteger(n) || n < 0 || n > 70) throw new HttpError(400, 'Years of experience must be a whole number between 0 and 70.');
    data.experienceYears = n;
  }
  if (type === 'team') {
    if (b.name !== undefined) { const v = String(b.name).trim().slice(0, 120); if (!v) throw new HttpError(400, 'Name cannot be empty.'); data.name = v; }
    if (b.role !== undefined) { const v = String(b.role).trim().slice(0, 120); if (!v) throw new HttpError(400, 'Role cannot be empty.'); data.role = v; }
  }
  if (type === 'doctor' && b.specialty !== undefined) data.specialty = String(b.specialty).trim().slice(0, 120);
  if (b.photo !== undefined) {
    if (!isValidPhoto(b.photo)) throw new HttpError(400, 'Photo must be a JPG, PNG, WEBP, or GIF image.');
    data.photo = b.photo || null;
  }
  const u = await prisma[PROFILE_MODELS[type]].update({ where: { id: o.id }, data, include: type === 'doctor' ? { department: true } : undefined });
  res.json(await profileOut(type, u));
}));

app.post('/api/admin/profiles/:type/:id/certificates', perm('profiles.manage'), wrap(async (req, res) => {
  const type = req.params.type;
  const o = await findProfileOwner(type, req.params.id);
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) throw new HttpError(400, 'Please give the certificate a name (e.g. "DHA Licence").');
  if ((await prisma.profileCertificate.count({ where: { ownerType: type, ownerId: o.id } })) >= 30) throw new HttpError(400, 'A profile can have at most 30 certificates.');
  const data = { id: newId('cert'), ownerType: type, ownerId: o.id, title, issuer: String(b.issuer || '').trim().slice(0, 200), year: String(b.year || '').trim().slice(0, 20) };
  if (b.data) {
    const name = cleanFilename(b.filename);
    const ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    if (!CERT_TYPES.includes(ext)) throw new HttpError(400, 'Certificates can be PDF, JPG, PNG or WEBP files.');
    const buf = Buffer.from(String(b.data).replace(/^data:[^;,]*;base64,/, ''), 'base64');
    if (!buf.length || !FILE_TYPES[ext].magic(buf)) throw new HttpError(400, `"${name}" doesn't look like a real .${ext} file.`);
    if (buf.length > MAX_FILE_BYTES) throw new HttpError(413, `"${name}" is larger than 3 MB. Please use a smaller file.`);
    Object.assign(data, { filename: name, mimeType: FILE_TYPES[ext].mime, size: buf.length, data: buf });
  }
  data.sortOrder = await prisma.profileCertificate.count({ where: { ownerType: type, ownerId: o.id } });
  const c = await prisma.profileCertificate.create({ data, select: { id: true, title: true, issuer: true, year: true, filename: true, mimeType: true, size: true } });
  res.json(certOut(c));
}));

app.delete('/api/admin/certificates/:id', perm('profiles.manage'), wrap(async (req, res) => {
  const c = await prisma.profileCertificate.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!c) throw new HttpError(404, 'Certificate not found.');
  await prisma.profileCertificate.delete({ where: { id: c.id } });
  res.json({ ok: true });
}));

// Rules for what doctors can do in the Doctor Portal.
app.get('/api/admin/doctor-rules', perm('staff.manage'), wrap(async (req, res) => { res.json(await doctorRules()); }));
app.patch('/api/admin/doctor-rules', perm('staff.manage'), wrap(async (req, res) => {
  const b = req.body || {};
  const next = { ...(await doctorRules()) };
  if (b.searchAllPatients !== undefined) next.searchAllPatients = !!b.searchAllPatients;
  await settings.setKey('doctorRules', next);
  res.json(next);
}));

// ---------- CONTACT ----------

app.post('/api/contact', formLimiter, wrap(async (req, res) => {
  const { name, message } = req.body || {};
  const email = normEmail(req.body && req.body.email);
  if (!name || !email || !message) throw new HttpError(400, 'Name, email and message are required.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  await prisma.contactMessage.create({ data: { id: newId('msg'), name, email, message: String(message).slice(0, 5000) } });
  const s = await settings.getAll().catch(() => null);
  if (s) {
    await mailer.send({
      to: [s.contactEmail, ...(s.notifyEmails || [])],
      subject: `Website message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`
    }).catch(() => {});
  }
  res.json({ ok: true });
}));

app.get('/api/admin/contact-messages', perm('settings.manage'), wrap(async (req, res) => {
  res.json(await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }));
}));

// ---------- health check ----------

app.get('/api/health', wrap(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
}));

// Unknown API routes → JSON 404.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Unknown page → home page (nice for old/direct links).
app.get('*', (req, res, next) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), err => { if (err) next(); });
});

// Errors → clean JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That photo is too large. Please use an image under 3MB.' });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

module.exports = app;
