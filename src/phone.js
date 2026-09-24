// src/phone.js — Patient ID = phone number in one standard form.
// "050 123 4567", "+971 50 123 4567", "00971501234567" and "501234567"
// all become "971501234567". Shown to people as "+971501234567".
const CC = () => String(process.env.DEFAULT_COUNTRY_CODE || '971').replace(/\D/g, '');

function normalizePhone(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (!hasPlus) {
    if (d.startsWith('00')) d = d.slice(2);            // 00971… international prefix
    else if (d.startsWith('0')) d = CC() + d.slice(1); // 050… local with trunk 0
    else if (d.length <= 9) d = CC() + d;              // 50… local without 0
  }
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

const displayPatientId = key => (key ? '+' + key : '');

module.exports = { normalizePhone, displayPatientId };
