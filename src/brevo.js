// src/brevo.js — appointment emails through Brevo's transactional API.
// Needs the BREVO_API_KEY environment variable (never sent to the browser).
// Uses built-in fetch (Node 18+); no extra dependencies.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const CLINIC = { email: 'info@radianthealthalliance.com', name: 'Radiant Health Alliance' };
const AUTO_REPLY_TEMPLATE_ID = 1; // "Appointment Request Auto-Reply"

const isConfigured = () => !!process.env.BREVO_API_KEY;

const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function brevoSend(payload, label) {
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Brevo ${label} failed: HTTP ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Brevo ${label} failed:`, e.message);
    return false;
  }
}

// Sends (a) the template auto-reply to the patient and (b) a notification to
// the clinic. Returns { autoReply: boolean, clinic: boolean }.
async function sendBookingEmails({ name, email, phone, date, service, message }) {
  if (!isConfigured()) {
    console.error('Brevo: BREVO_API_KEY is not set — booking emails not sent.');
    return { autoReply: false, clinic: false };
  }
  const realEmail = !!email && !String(email).toLowerCase().endsWith('.invalid');
  const rows = [
    ['Name', name], ['Email', realEmail ? email : '(no email)'], ['Phone', phone], ['Date', date], ['Service', service], ['Message', message]
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:bold;vertical-align:top">${k}</td>` +
    `<td style="padding:6px 12px;white-space:pre-wrap">${esc(v) || '—'}</td></tr>`).join('');

  const [autoReply, clinic] = await Promise.all([
    !realEmail ? Promise.resolve(false) : brevoSend({
      templateId: AUTO_REPLY_TEMPLATE_ID,
      to: [{ email, name }],
      replyTo: CLINIC,
      params: { NAME: name, DATE: date || '', SERVICE: service || '' }
    }, 'auto-reply'),
    brevoSend({
      sender: { email: CLINIC.email, name: 'Website Booking' },
      to: [{ email: CLINIC.email, name: CLINIC.name }],
      replyTo: realEmail ? { email, name } : CLINIC,
      subject: `New appointment request – ${name}`,
      htmlContent: `<p>A new appointment request came in from the website:</p><table style="border-collapse:collapse">${rows}</table>`
    }, 'clinic notification')
  ]);
  return { autoReply, clinic };
}

// ---------- Doctor calendar invites (.ics) ----------
// Every booking emails the doctor an invite; Gmail/Outlook/Apple Mail show it
// as a calendar event. Cancelling sends a CANCEL for the same event (same UID),
// which removes it from the doctor's calendar.

const CLINIC_TZ = () => process.env.CLINIC_TZ || 'Asia/Dubai';
const SITE_URL = () => process.env.SITE_URL || 'https://www.radianthealthalliance.com';

// Minutes the timezone is ahead of UTC on a given date (e.g. Dubai = 240).
function tzOffsetMinutes(tz, utcDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(utcDate);
  const g = t => Number(parts.find(p => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUtc - utcDate.getTime()) / 60000);
}

// Clinic-local "2026-10-01" + "10:30" -> Date (the real instant).
function clinicTimeToDate(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - tzOffsetMinutes(CLINIC_TZ(), guess) * 60000);
}

const icsDate = dt => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Escape text per RFC 5545 and fold long lines to 75 octets.
const icsParam = v => `"${String(v == null ? '' : v).replace(/["\r\n]/g, '')}"`; // quoted parameter value
const icsText = v => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let buf = Buffer.from(line, 'utf8');
  while (buf.length > 75) {
    let cut = 75;
    while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--; // don't split a UTF-8 character
    out.push(buf.subarray(0, cut).toString('utf8'));
    buf = Buffer.concat([Buffer.from(' '), buf.subarray(cut)]);
  }
  out.push(buf.toString('utf8'));
  return out.join('\r\n');
}

function buildIcs({ method, uid, sequence, start, end, summary, description, doctor }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Radiant Health Alliance//Appointments//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(summary)}`,
    `DESCRIPTION:${icsText(description)}`,
    `LOCATION:${icsText('Radiant Health Alliance')}`,
    `ORGANIZER;CN=${icsParam(CLINIC.name)}:mailto:${CLINIC.email}`,
    `ATTENDEE;CN=${icsParam(doctor.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${doctor.email}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE'
  ];
  if (method !== 'CANCEL') {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, 'TRIGGER:-PT15M', 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// kind: 'booked' | 'cancelled'
async function sendDoctorInvite({ kind, appointment, doctor, patient, departmentName }) {
  if (!isConfigured() || !doctor || !doctor.email || !/@/.test(doctor.email) || doctor.email.startsWith('deleted+')) return false;
  const start = clinicTimeToDate(appointment.date, appointment.time);
  const end = new Date(start.getTime() + (doctor.slotMinutes || 30) * 60000);
  const whenText = new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ(), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(start);
  const cancelled = kind === 'cancelled';
  const summary = `${cancelled ? 'Cancelled: ' : ''}Appointment – ${patient.name}`;
  const description = [
    `Patient: ${patient.name}`,
    patient.phone ? `Phone: ${patient.phone}` : '',
    patient.email && !/\.invalid$/i.test(patient.email) ? `Email: ${patient.email}` : '',
    departmentName ? `Department: ${departmentName}` : '',
    appointment.reason ? `Reason: ${appointment.reason}` : '',
    '',
    `Doctor portal: ${SITE_URL()}/doctor-dashboard.html`
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
  const ics = buildIcs({
    method: cancelled ? 'CANCEL' : 'REQUEST',
    uid: `${appointment.id}@radianthealthalliance.com`,
    sequence: cancelled ? 1 : 0,
    start, end, summary, description, doctor
  });
  const rows = [
    ['Patient', patient.name], ['Phone', patient.phone], ['Email', /\.invalid$/i.test(patient.email || '') ? '' : patient.email],
    ['When', whenText], ['Department', departmentName], ['Reason', appointment.reason]
  ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:bold;vertical-align:top">${k}</td><td style="padding:6px 12px;white-space:pre-wrap">${esc(v)}</td></tr>`).join('');
  return brevoSend({
    sender: { email: CLINIC.email, name: CLINIC.name },
    to: [{ email: doctor.email, name: doctor.name }],
    replyTo: CLINIC,
    subject: cancelled ? `Cancelled: ${patient.name} – ${whenText}` : `New appointment: ${patient.name} – ${whenText}`,
    htmlContent: `<p>Dear ${esc(doctor.name)},</p><p>${cancelled ? 'This appointment has been <strong>cancelled</strong> and removed from your calendar.' : 'A new appointment has been booked with you. The attached invite adds it to your calendar.'}</p>` +
      `<table style="border-collapse:collapse">${rows}</table>` +
      `<p><a href="${SITE_URL()}/doctor-dashboard.html">Open the doctor portal</a></p>`,
    attachment: [{ name: cancelled ? 'cancel.ics' : 'invite.ics', content: Buffer.from(ics, 'utf8').toString('base64') }]
  }, cancelled ? 'doctor cancellation' : 'doctor invite');
}

module.exports = { sendBookingEmails, sendDoctorInvite, buildIcs, clinicTimeToDate, isConfigured, esc };
