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
  const rows = [
    ['Name', name], ['Email', email], ['Phone', phone], ['Date', date], ['Service', service], ['Message', message]
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:bold;vertical-align:top">${k}</td>` +
    `<td style="padding:6px 12px;white-space:pre-wrap">${esc(v) || '—'}</td></tr>`).join('');

  const [autoReply, clinic] = await Promise.all([
    brevoSend({
      templateId: AUTO_REPLY_TEMPLATE_ID,
      to: [{ email, name }],
      replyTo: CLINIC,
      params: { NAME: name, DATE: date || '', SERVICE: service || '' }
    }, 'auto-reply'),
    brevoSend({
      sender: { email: CLINIC.email, name: 'Website Booking' },
      to: [{ email: CLINIC.email, name: CLINIC.name }],
      replyTo: { email, name },
      subject: `New appointment request – ${name}`,
      htmlContent: `<p>A new appointment request came in from the website:</p><table style="border-collapse:collapse">${rows}</table>`
    }, 'clinic notification')
  ]);
  return { autoReply, clinic };
}

module.exports = { sendBookingEmails, isConfigured, esc };
