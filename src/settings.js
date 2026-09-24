// src/settings.js — site settings stored in the `Setting` table.
// SMTP password is encrypted at rest (AES-256-GCM) with SETTINGS_KEY
// (falls back to JWT_SECRET). If you change that key, re-enter the SMTP
// password in the admin panel.
const crypto = require('crypto');
const prisma = require('./db');

const DEFAULTS = {
  phone: '+971543397906',
  whatsapp: '971543397906',
  contactEmail: 'hello@radianthealthalliance.com',
  notifyEmails: [],
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
};

function key() {
  const secret = process.env.SETTINGS_KEY || process.env.JWT_SECRET || 'dev-only-key';
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return 'enc:' + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (!String(value).startsWith('enc:')) return value; // legacy plain value
  try {
    const buf = Buffer.from(value.slice(4), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('Could not decrypt SMTP password (was SETTINGS_KEY/JWT_SECRET changed?)');
    return '';
  }
}

async function getAll() {
  const rows = await prisma.setting.findMany();
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of rows) {
    if (r.key === 'smtp') out.smtp = { ...out.smtp, ...(r.value || {}) };
    else out[r.key] = r.value;
  }
  // Environment variables override DB SMTP settings when present.
  if (process.env.SMTP_HOST) {
    out.smtp = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS ? encrypt(process.env.SMTP_PASS) : '',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
    };
  }
  return out;
}

async function setKey(k, value) {
  await prisma.setting.upsert({ where: { key: k }, update: { value }, create: { key: k, value } });
}

module.exports = { DEFAULTS, getAll, setKey, encrypt, decrypt };
