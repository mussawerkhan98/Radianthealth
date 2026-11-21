// src/visits.js — which kinds of visit patients can book right now.
// Admin → Appointments → "Booking options right now" switches each type on or
// off, or pauses it for a while (e.g. at rush hours); a pause ends by itself.
// Stored in the Setting table under `visitOptions`:
//   { in_person: { on, pausedUntil }, home: {…}, video: {…}, message }
// Clinic staff booking for a patient are not blocked by these switches.

const TYPES = [
  { key: 'in_person', label: 'Clinic visit', short: 'clinic visits' },
  { key: 'home', label: 'Home visit', short: 'home visits' },
  { key: 'video', label: 'Video call', short: 'video calls' }
];
const KEYS = TYPES.map(t => t.key);
const SETTING_KEY = 'visitOptions';
const MAX_PAUSE_MIN = 7 * 24 * 60;

const typeOf = v => (KEYS.includes(v) ? v : 'in_person');
const labelOf = k => (TYPES.find(t => t.key === k) || TYPES[0]).label;

function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { message: typeof src.message === 'string' ? src.message.trim().slice(0, 300) : '' };
  for (const k of KEYS) {
    const v = src[k] && typeof src[k] === 'object' ? src[k] : {};
    const until = v.pausedUntil && !isNaN(Date.parse(v.pausedUntil)) ? new Date(v.pausedUntil).toISOString() : null;
    out[k] = { on: v.on !== false, pausedUntil: until };
  }
  return out;
}

// What patients see: available now, or switched off / paused (and until when).
function status(raw, now = Date.now()) {
  const cfg = normalize(raw);
  const out = { message: cfg.message };
  for (const k of KEYS) {
    const { on, pausedUntil } = cfg[k];
    const paused = !!(pausedUntil && Date.parse(pausedUntil) > now);
    out[k] = { available: on && !paused, off: !on, pausedUntil: on && paused ? pausedUntil : null };
  }
  return out;
}

async function load(prisma) {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return normalize(row && row.value);
}

async function save(prisma, cfg) {
  const value = normalize(cfg);
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, update: { value }, create: { key: SETTING_KEY, value } });
  return value;
}

module.exports = { TYPES, KEYS, MAX_PAUSE_MIN, typeOf, labelOf, normalize, status, load, save };
