// src/audience.js — who a promotion goes to.
// Everyone on the list (patients + imported contacts) has an email, name,
// country, region and groups. A promotion's audience picks some of them:
//   { source: 'all' | 'patients' | 'contacts', countries: [], regions: [], groups: [] }
// Empty list = any. Within a list it's "any of"; across lists it's "and".
// Unsubscribing is per email: opted out anywhere = never sent.
const crypto = require('crypto');

// Country from the phone's country code (used when a patient has no country set).
const CALLING_CODES = [
  ['971', 'United Arab Emirates'], ['966', 'Saudi Arabia'], ['968', 'Oman'], ['974', 'Qatar'], ['973', 'Bahrain'],
  ['965', 'Kuwait'], ['962', 'Jordan'], ['961', 'Lebanon'], ['964', 'Iraq'], ['963', 'Syria'], ['970', 'Palestine'],
  ['967', 'Yemen'], ['98', 'Iran'], ['90', 'Turkey'], ['20', 'Egypt'], ['212', 'Morocco'], ['213', 'Algeria'],
  ['216', 'Tunisia'], ['249', 'Sudan'], ['91', 'India'], ['92', 'Pakistan'], ['880', 'Bangladesh'], ['94', 'Sri Lanka'],
  ['977', 'Nepal'], ['93', 'Afghanistan'], ['63', 'Philippines'], ['62', 'Indonesia'], ['60', 'Malaysia'], ['86', 'China'],
  ['7', 'Russia'], ['44', 'United Kingdom'], ['33', 'France'], ['49', 'Germany'], ['39', 'Italy'], ['34', 'Spain'],
  ['31', 'Netherlands'], ['1', 'USA / Canada'], ['61', 'Australia'], ['27', 'South Africa'], ['234', 'Nigeria'],
  ['254', 'Kenya'], ['251', 'Ethiopia']
].sort((a, b) => b[0].length - a[0].length);
function countryFromPhoneKey(key) {
  const d = String(key || '');
  const hit = CALLING_CODES.find(([code]) => d.startsWith(code));
  return hit ? hit[1] : '';
}

const clean = (v, max = 80) => String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// "vip, Corporate;  vip" -> ["vip", "Corporate"] (case-insensitive de-dupe, keeps first spelling)
function parseGroups(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[,;|]/);
  const seen = new Set(), out = [];
  for (const g of list.map(x => clean(x, 40)).filter(Boolean)) {
    const k = g.toLowerCase();
    if (!seen.has(k) && k !== 'patients') { seen.add(k); out.push(g); }
    if (out.length >= 20) break;
  }
  return out;
}
const joinGroups = arr => parseGroups(arr).join(',');

function normAudience(a) {
  a = a && typeof a === 'object' ? a : {};
  const list = v => (Array.isArray(v) ? v : []).map(x => clean(x, 80)).filter(Boolean).slice(0, 100);
  return {
    source: ['patients', 'contacts'].includes(a.source) ? a.source : 'all',
    countries: list(a.countries), regions: list(a.regions), groups: list(a.groups)
  };
}
function parseAudience(json) {
  try { return normAudience(JSON.parse(json || '{}')); } catch (e) { return normAudience({}); }
}

const realEmail = e => !!e && /@/.test(e) && !/\.invalid$/i.test(e) && !/^deleted\+/i.test(e);

// Everyone who could receive offers, one entry per email.
async function everyone(prisma) {
  const [patients, contacts] = await Promise.all([
    prisma.patient.findMany({ select: { id: true, name: true, email: true, phone: true, phoneKey: true, country: true, region: true, marketingOptOut: true, marketingKey: true } }),
    prisma.marketingContact.findMany()
  ]);
  const optedOut = new Set();
  patients.forEach(p => { if (p.marketingOptOut && realEmail(p.email)) optedOut.add(p.email.toLowerCase()); });
  contacts.forEach(c => { if (c.optOut) optedOut.add(c.email.toLowerCase()); });
  const byEmail = new Map();
  for (const p of patients) {
    if (!realEmail(p.email)) continue;
    byEmail.set(p.email.toLowerCase(), {
      kind: 'patient', id: p.id, email: p.email, name: p.name, phone: p.phone,
      country: p.country || countryFromPhoneKey(p.phoneKey), region: p.region, groups: ['Patients'],
      key: p.marketingKey, optOut: optedOut.has(p.email.toLowerCase())
    });
  }
  for (const c of contacts) {
    const k = c.email.toLowerCase();
    const existing = byEmail.get(k);
    const groups = parseGroups(c.groups);
    if (existing) { // same person: patient record wins, but add their contact groups/details
      existing.groups = [...existing.groups, ...groups.filter(g => !existing.groups.some(x => x.toLowerCase() === g.toLowerCase()))];
      existing.country = existing.country || c.country; existing.region = existing.region || c.region;
      existing.alsoContactId = c.id;
      continue;
    }
    byEmail.set(k, {
      kind: 'contact', id: c.id, email: c.email, name: c.name, phone: c.phone, country: c.country, region: c.region,
      groups, key: c.unsubKey, optOut: optedOut.has(k), source: c.source, createdAt: c.createdAt
    });
  }
  return [...byEmail.values()];
}

const inList = (value, list) => !list.length || list.some(x => x.toLowerCase() === String(value || '').toLowerCase());
function matches(person, a) {
  if (a.source === 'patients' && person.kind !== 'patient') return false;
  if (a.source === 'contacts' && person.kind !== 'contact' && !person.alsoContactId) return false;
  if (!inList(person.country, a.countries)) return false;
  if (!inList(person.region, a.regions)) return false;
  if (a.groups.length && !person.groups.some(g => inList(g, a.groups))) return false;
  return true;
}

async function resolveAudience(prisma, audience) {
  const a = normAudience(audience);
  return (await everyone(prisma)).filter(p => !p.optOut && matches(p, a));
}

// Choices for the "who receives it" picker, with how many people each has.
async function segmentOptions(prisma) {
  const all = (await everyone(prisma)).filter(p => !p.optOut);
  const tally = key => {
    const m = new Map();
    for (const p of all) for (const v of (Array.isArray(p[key]) ? p[key] : [p[key]])) {
      if (!v) continue;
      const k = v.toLowerCase();
      const cur = m.get(k) || { name: v, count: 0 };
      cur.count++; m.set(k, cur);
    }
    return [...m.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  };
  return {
    total: all.length,
    patients: all.filter(p => p.kind === 'patient').length,
    contacts: all.filter(p => p.kind === 'contact' || p.alsoContactId).length,
    countries: tally('country'), regions: tally('region'), groups: tally('groups')
  };
}

// Make sure everyone we send to has an unsubscribe secret.
async function ensureKeys(prisma, people) {
  for (const p of people.filter(x => !x.key)) {
    p.key = crypto.randomBytes(18).toString('base64url');
    if (p.kind === 'patient') await prisma.patient.update({ where: { id: p.id }, data: { marketingKey: p.key } });
    else await prisma.marketingContact.update({ where: { id: p.id }, data: { unsubKey: p.key } });
  }
}

// Opt an email in or out everywhere it appears.
async function setOptOut(prisma, email, optOut) {
  const e = String(email || '').toLowerCase();
  if (!e) return;
  await Promise.all([
    prisma.patient.updateMany({ where: { email: e }, data: { marketingOptOut: optOut } }),
    prisma.marketingContact.updateMany({ where: { email: e }, data: { optOut } })
  ]);
}

// CSV helpers (Excel-friendly: BOM + CRLF, formula-injection safe).
function csvCell(v) {
  let s = String(v == null ? '' : v);
  // Stop Excel running cell text as a formula — but leave phone numbers like +971 50… alone.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]{6,}$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

function describeAudience(a) {
  a = normAudience(a);
  const parts = [a.source === 'patients' ? 'Patients' : a.source === 'contacts' ? 'Imported contacts' : 'Everyone'];
  if (a.countries.length) parts.push(a.countries.join(' / '));
  if (a.regions.length) parts.push(a.regions.join(' / '));
  if (a.groups.length) parts.push('groups: ' + a.groups.join(', '));
  return parts.join(' · ');
}

module.exports = {
  countryFromPhoneKey, parseGroups, joinGroups, normAudience, parseAudience, realEmail, clean,
  everyone, resolveAudience, segmentOptions, ensureKeys, setOptOut, toCsv, describeAudience
};
