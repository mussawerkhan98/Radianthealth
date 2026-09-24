// src/mailer.js — appointment emails via SMTP (configured in Admin → Settings,
// or with SMTP_* environment variables). If SMTP isn't configured, emails are
// silently skipped so booking still works.
const nodemailer = require('nodemailer');
const settings = require('./settings');

async function transport() {
  const s = await settings.getAll();
  const smtp = s.smtp || {};
  if (!smtp.host) return null;
  const t = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: settings.decrypt(smtp.pass) } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  return { t, from: smtp.from || smtp.user, notifyEmails: s.notifyEmails || [] };
}

async function send({ to, subject, text }, { throwOnError = false } = {}) {
  try {
    const cfg = await transport();
    if (!cfg) {
      if (throwOnError) throw new Error('SMTP is not configured yet. Fill in and save the SMTP settings first.');
      return false;
    }
    const recipients = [].concat(to).filter(r => r && !String(r).toLowerCase().endsWith('.invalid'));
    if (!recipients.length) return false;
    await cfg.t.sendMail({ from: cfg.from, to: recipients.join(', '), subject, text });
    return true;
  } catch (e) {
    if (throwOnError) throw e;
    console.error('Email send failed:', e.message);
    return false;
  }
}

async function notifyBooking({ appointment, doctor, patient, departmentName, skipPatient = false, skipDoctor = false }) {
  const cfg = await transport().catch(() => null);
  if (!cfg) return;
  const when = `${appointment.date} at ${appointment.time}`;
  const staffText =
    `New appointment booked\n\n` +
    `Patient: ${patient.name} (${patient.email}${patient.phone ? ', ' + patient.phone : ''})\n` +
    `Doctor: ${doctor.name}${departmentName ? ' — ' + departmentName : ''}\n` +
    `When: ${when}\n` +
    (appointment.reason ? `Reason: ${appointment.reason}\n` : '');
  await Promise.all([
    send({ to: [skipDoctor ? null : doctor.email, ...cfg.notifyEmails], subject: `New appointment: ${patient.name} — ${when}`, text: staffText }),
    skipPatient ? Promise.resolve() : send({
      to: patient.email,
      subject: 'Your appointment at Radiant Health Alliance is confirmed',
      text: `Hello ${patient.name},\n\nYour appointment with ${doctor.name} is confirmed for ${when}.\n\nIf you need to cancel, log in to your account at radianthealthalliance.com.\n\nRadiant Health Alliance`
    })
  ]);
}

async function notifyCancellation({ appointment, doctor, patient, by, skipDoctor = false }) {
  const cfg = await transport().catch(() => null);
  if (!cfg) return;
  const when = `${appointment.date} at ${appointment.time}`;
  await Promise.all([
    send({ to: [skipDoctor ? null : doctor.email, ...cfg.notifyEmails], subject: `Cancelled: ${patient.name} — ${when}`, text: `The appointment for ${patient.name} with ${doctor.name} on ${when} was cancelled by ${by}.` }),
    by !== 'the patient'
      ? send({ to: patient.email, subject: 'Your appointment was cancelled', text: `Hello ${patient.name},\n\nYour appointment with ${doctor.name} on ${when} has been cancelled by the clinic. Please book a new time or contact us.\n\nRadiant Health Alliance` })
      : Promise.resolve()
  ]);
}

module.exports = { send, notifyBooking, notifyCancellation };
