// src/marketing.js — promotion emails (Admin → Marketing) through Brevo.
// Each patient gets their own copy (their name, their unsubscribe link and a
// one-click unsubscribe header, which inbox providers look for).
const { esc } = require('./brevo');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER = { email: 'info@radianthealthalliance.com', name: 'Radiant Health Alliance' };
const CONCURRENCY = 5; // emails sent in parallel

// Brevo treats {{ }} and {% %} as template code — keep them out of staff text.
const plain = v => String(v == null ? '' : v).replace(/\{\{|\}\}|\{%|%\}/g, '');
const paragraphs = text => plain(text).trim().split(/\n{2,}/).filter(Boolean)
  .map(p => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#33414a;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

// NAME and UNSUB are filled in by Brevo for each recipient ({{params.X}}).
// For previews/tests pass them directly with `values`.
function buildEmail(c, { siteUrl, imageUrl, phone, values } = {}) {
  const name = values ? esc(values.NAME) : '{{params.NAME}}';
  const unsub = values ? esc(values.UNSUB) : '{{params.UNSUB}}';
  // Tracked link for this person (counts clicks, then goes to the button link).
  const link = (values && values.CLICK) || c.buttonUrl;
  const button = c.buttonText && c.buttonUrl
    ? `<tr><td align="center" style="padding:8px 32px 28px;">
         <a href="${esc(link)}" target="_blank" style="display:inline-block;background:#e39a3b;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:999px;">${esc(plain(c.buttonText))}</a>
       </td></tr>` : '';
  const image = imageUrl
    ? `<tr><td style="padding:0;">${c.buttonUrl ? `<a href="${esc(link)}" target="_blank">` : ''}<img src="${esc(imageUrl)}" width="600" alt="${esc(plain(c.headline || c.subject))}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">${c.buttonUrl ? '</a>' : ''}</td></tr>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(plain(c.subject))}</title></head>
<body style="margin:0;padding:0;background:#f2f5f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f6;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:20px 32px;border-bottom:1px solid #e6ecee;">
      <a href="${esc(siteUrl)}" target="_blank" style="text-decoration:none;"><img src="${esc(siteUrl)}/assets/logo.png" height="40" alt="Radiant Health Alliance" style="display:inline-block;height:40px;border:0;vertical-align:middle;"><span style="font-family:Georgia,serif;font-size:18px;color:#1d2b33;vertical-align:middle;margin-left:10px;">Radiant Health Alliance</span></a>
    </td></tr>
    ${image}
    <tr><td style="padding:28px 32px 8px;">
      <p style="margin:0 0 10px;font-size:15px;color:#5b6a73;">Dear ${name},</p>
      ${c.headline ? `<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;line-height:1.25;color:#1d2b33;font-weight:600;">${esc(plain(c.headline))}</h1>` : ''}
      ${paragraphs(c.body)}
    </td></tr>
    ${button}
    <tr><td style="padding:20px 32px;background:#f7f9fa;border-top:1px solid #e6ecee;font-size:12px;line-height:1.6;color:#7a8890;">
      Radiant Health Alliance${phone ? ` · ${esc(phone)}` : ''} · <a href="${esc(siteUrl)}" style="color:#3d7db7;">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a><br>
      You're receiving this because you're a patient of Radiant Health Alliance.
      <a href="${unsub}" style="color:#7a8890;">Unsubscribe from offers</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const text = [
    `Dear ${values ? values.NAME : '{{params.NAME}}'},`, '',
    plain(c.headline), '', plain(c.body), '',
    c.buttonText && c.buttonUrl ? `${plain(c.buttonText)}: ${link}` : '', '',
    `Unsubscribe from offers: ${values ? values.UNSUB : '{{params.UNSUB}}'}`
  ].join('\n');
  return { html, text };
}

async function post(payload) {
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Brevo campaign send failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    let msg = '';
    try { msg = JSON.parse(body).message || ''; } catch (e) { /* not JSON */ }
    const err = new Error(msg || `Brevo refused the send (HTTP ${res.status}).`);
    err.status = res.status;
    throw err;
  }
}

// Gmail/Yahoo/Outlook expect a one-click unsubscribe header on promotions
// (RFC 8058); without it, mail is more likely to land in spam.
function unsubHeaders(oneClickUrl) {
  if (!oneClickUrl) return undefined;
  return {
    'List-Unsubscribe': `<${oneClickUrl}>, <mailto:${SENDER.email}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

// recipients: [{ email, name, unsubUrl, oneClickUrl, clickUrl }].
// Returns { sent, failed, error, failedEmails }.
// One personal email per patient (so each gets their own unsubscribe header),
// a few at a time.
async function sendCampaign(c, recipients, opts) {
  let sent = 0, failed = 0, error = '', stop = false, next = 0;
  const done = new Set(), failedEmails = [];
  const one = async (r) => {
    const first = plain(r.name).split(' ')[0] || 'Patient';
    const { html, text } = buildEmail(c, { ...opts, values: { NAME: first, UNSUB: r.unsubUrl, CLICK: r.clickUrl } });
    const payload = {
      sender: SENDER, replyTo: SENDER, to: [{ email: r.email, name: plain(r.name).slice(0, 70) }],
      subject: plain(c.subject), htmlContent: html, textContent: text, tags: ['promotion'], headers: unsubHeaders(r.oneClickUrl)
    };
    for (let attempt = 0; ; attempt++) {
      try { await post(payload); sent++; done.add(r.email); return; }
      catch (e) {
        if (e.status === 429 && attempt < 2) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
        failed++; error = error || e.message;
        if (e.status === 401 || e.status === 403) stop = true; // key/account problem
        return;
      }
    }
  };
  const worker = async () => {
    while (!stop && next < recipients.length) await one(recipients[next++]);
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  failed += recipients.length - sent - failed; // not attempted after a stop
  for (const r of recipients) if (!done.has(r.email)) failedEmails.push(r.email);
  return { sent, failed, error, failedEmails };
}

// One test email to a staff member (same headers as the real thing).
async function sendTest(c, to, opts) {
  const unsub = opts.siteUrl + '/unsubscribe.html';
  const { html, text } = buildEmail(c, { ...opts, values: { NAME: to.name || 'there', UNSUB: unsub } });
  await post({ sender: SENDER, replyTo: SENDER, to: [{ email: to.email, name: plain(to.name).slice(0, 70) }], subject: plain(c.subject), htmlContent: html, textContent: text, tags: ['promotion-test'], headers: unsubHeaders(opts.siteUrl + '/api/unsubscribe/one-click?test=1') });
}

module.exports = { buildEmail, sendCampaign, sendTest, plain };
