// scripts/smoke-test.js — end-to-end check of the API against a running server.
//   BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm test
// Creates a throwaway patient/booking, so run it against a TEST database.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@radianthealthalliance.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || ADMIN_PASSWORD;

let pass = 0, fail = 0;
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}

(async () => {
  const r0 = await call('GET', '/api/health'); check('health', r0.status === 200, r0);
  const depts = await call('GET', '/api/departments'); check('departments list', depts.status === 200 && depts.data.length > 0, depts);
  const settings = await call('GET', '/api/settings'); check('public settings', settings.data && settings.data.phone, settings);
  const docs = await call('GET', '/api/doctors'); check('doctors list, no hashes', docs.data.length > 0 && !('passwordHash' in docs.data[0]), docs.data[0]);
  const team = await call('GET', '/api/team'); check('team', Array.isArray(team.data.staffMembers) && !('email' in team.data.doctors[0]), team.data);

  const admin = await call('POST', '/api/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check('admin login', admin.status === 200 && admin.data.user.role === 'admin', admin);
  const A = admin.data && admin.data.token;

  const newDept = await call('POST', '/api/admin/departments', { name: 'Test Dept', description: 'tmp' }, A);
  check('create department', newDept.status === 200, newDept);
  const stamp = Date.now();
  const docEmail = `test.doc.${stamp}@example.com`;
  const newDoc = await call('POST', '/api/admin/doctors', { name: 'Dr. Test <b>', departmentId: newDept.data.id, specialty: 'Testing', email: docEmail, password: DOCTOR_PASSWORD }, A);
  check('create doctor (html stripped)', newDoc.status === 200 && newDoc.data.name === 'Dr. Test b', newDoc);
  const patchDoc = await call('PATCH', `/api/admin/doctors/${newDoc.data.id}`, { workingDays: [0, 1, 2, 3, 4, 5, 6], workingHours: { start: '00:00', end: '23:30', slotMinutes: 30 } }, A);
  check('patch doctor hours', patchDoc.status === 200 && patchDoc.data.workingDays.length === 7, patchDoc);
  const delDeptBlocked = await call('DELETE', `/api/admin/departments/${newDept.data.id}`, null, A);
  check('delete dept with doctors blocked', delDeptBlocked.status === 409, delDeptBlocked);

  const email = `patient.${stamp}@example.com`;
  const reg = await call('POST', '/api/register', { name: 'Test Patient', email, phone: '0500000000', password: 'Patient123!' });
  check('register', reg.status === 200, reg);
  const dup = await call('POST', '/api/register', { name: 'X', email: email.toUpperCase(), password: 'Patient123!' });
  check('duplicate email rejected', dup.status === 409, dup);
  const P = reg.data.token;

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const slots = await call('GET', `/api/doctors/${newDoc.data.id}/slots?date=${tomorrow}`);
  check('slots', slots.status === 200 && slots.data.available.length > 0, slots);
  const slot = slots.data.available[0];
  const book = await call('POST', '/api/appointments', { doctorId: newDoc.data.id, date: tomorrow, time: slot, reason: 'Checkup' }, P);
  check('book appointment', book.status === 200 && book.data.status === 'confirmed', book);
  const again = await call('POST', '/api/appointments', { doctorId: newDoc.data.id, date: tomorrow, time: slot }, P);
  check('double booking rejected', again.status === 409 || again.status === 400, again);
  const badSlot = await call('POST', '/api/appointments', { doctorId: newDoc.data.id, date: '2000-01-01', time: '09:00' }, P);
  check('past date rejected', badSlot.status === 400, badSlot);
  const slots2 = await call('GET', `/api/doctors/${newDoc.data.id}/slots?date=${tomorrow}`);
  check('booked slot hidden', !slots2.data.available.includes(slot), slots2.data);
  const mine = await call('GET', '/api/patients/me/appointments', null, P);
  check('patient appointments', mine.data.length === 1 && mine.data[0].doctorName, mine);
  const forbidden = await call('GET', '/api/admin/patients', null, P);
  check('patient blocked from admin', forbidden.status === 403, forbidden);

  const doc = await call('POST', '/api/login', { email: docEmail, password: DOCTOR_PASSWORD });
  check('doctor login + mustChangePassword', doc.status === 200 && doc.data.user.mustChangePassword === true, doc);
  const D = doc.data.token;
  const cp = await call('POST', '/api/change-password', { currentPassword: DOCTOR_PASSWORD, newPassword: 'NewDoctor123!' }, D);
  check('change password', cp.status === 200, cp);
  const dAppts = await call('GET', '/api/doctors/me/appointments', null, D);
  check('doctor appointments', dAppts.data.length === 1 && dAppts.data[0].patientName === 'Test Patient', dAppts);
  const dPatients = await call('GET', '/api/doctors/me/patients', null, D);
  check('doctor patients', dPatients.data.length === 1, dPatients);
  const pid = dPatients.data[0].id;
  const rec = await call('POST', `/api/doctors/me/patients/${pid}/records`, { diagnosis: 'Fine', notes: 'All good', prescription: 'Water' }, D);
  check('add record', rec.status === 200, rec);
  const recs = await call('GET', `/api/doctors/me/patients/${pid}/records`, null, D);
  check('doctor reads records', recs.data.length === 1, recs);
  const precs = await call('GET', '/api/patients/me/records', null, P);
  check('patient reads records', precs.data.length === 1 && precs.data[0].doctorName, precs);

  const adminAppts = await call('GET', '/api/admin/appointments', null, A);
  check('admin appointments', adminAppts.data.some(a => a.patientEmail === email), adminAppts.data.slice(0, 1));
  const pts = await call('GET', '/api/admin/patients', null, A);
  const me = pts.data.find(p => p.email === email);
  check('admin patients list', me && me.appointmentCount === 1 && me.recordCount === 1, me);
  const report = await call('GET', `/api/admin/patients/${me.id}`, null, A);
  check('admin patient report', report.data.appointments.length === 1 && report.data.records.length === 1, report);

  const staffEmail = `desk.${stamp}@example.com`;
  const st = await call('POST', '/api/admin/staff-accounts', { name: 'Desk', email: staffEmail, role: 'staff', password: 'Desk12345!' }, A);
  check('create staff account', st.status === 200, st);
  const sl = await call('POST', '/api/login', { email: staffEmail, password: 'Desk12345!' });
  check('staff login role=staff', sl.data.user.role === 'staff', sl);
  const S = sl.data.token;
  const sAppts = await call('GET', '/api/admin/appointments', null, S);
  check('staff sees appointments', sAppts.status === 200, sAppts);
  const sBlocked = await call('GET', '/api/admin/patients', null, S);
  check('staff blocked from patient records', sBlocked.status === 403, sBlocked);
  // ---- record file attachments ----
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const up = await call('POST', `/api/doctors/me/records/${rec.data.id}/files`, { filename: 'lab-report.pdf', data: 'data:application/pdf;base64,' + pdf.toString('base64') }, D);
  check('doctor uploads PDF', up.status === 200 && up.data.size === pdf.length, up);
  const fake = await call('POST', `/api/doctors/me/records/${rec.data.id}/files`, { filename: 'virus.pdf', data: Buffer.from('MZ not a pdf').toString('base64') }, D);
  check('fake PDF rejected', fake.status === 400, fake);
  const exe = await call('POST', `/api/doctors/me/records/${rec.data.id}/files`, { filename: 'run.exe', data: pdf.toString('base64') }, D);
  check('disallowed type rejected', exe.status === 400, exe);
  const big = await call('POST', `/api/doctors/me/records/${rec.data.id}/files`, { filename: 'big.pdf', data: Buffer.concat([pdf, Buffer.alloc(3.2 * 1024 * 1024)]).toString('base64') }, D);
  check('file over 3 MB rejected', big.status === 413, { status: big.status });
  const listed = await call('GET', `/api/doctors/me/patients/${pid}/records`, null, D);
  check('record lists file (no bytes)', listed.data[0].files.length === 1 && !('data' in listed.data[0].files[0]), listed.data[0].files);
  const dl = await fetch(`${BASE}/api/files/${up.data.id}`, { headers: { Authorization: 'Bearer ' + D } });
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  check('doctor downloads same bytes', dl.status === 200 && dlBuf.equals(pdf) && /attachment/.test(dl.headers.get('content-disposition')), dl.status);
  const pDl = await fetch(`${BASE}/api/files/${up.data.id}`, { headers: { Authorization: 'Bearer ' + P } });
  check('patient cannot download', pDl.status === 403, pDl.status);
  const sDl = await fetch(`${BASE}/api/files/${up.data.id}`, { headers: { Authorization: 'Bearer ' + S } });
  check('front-desk staff cannot download', sDl.status === 403, sDl.status);
  const aDl = await fetch(`${BASE}/api/files/${up.data.id}`, { headers: { Authorization: 'Bearer ' + A } });
  check('admin can download', aDl.status === 200, aDl.status);
  const noAuth = await fetch(`${BASE}/api/files/${up.data.id}`);
  check('anonymous cannot download', noAuth.status === 401, noAuth.status);
  const pRecs = await call('GET', '/api/patients/me/records', null, P);
  check('patient view has no files', pRecs.data.length === 1 && !pRecs.data[0].files, pRecs.data[0]);
  const aRep = await call('GET', `/api/admin/patients/${pid}`, null, A);
  check('admin report lists file', aRep.data.records[0].files.length === 1, aRep.data.records[0]);
  const other = await call('POST', '/api/login', { email: 'amina.farouk@radianthealthalliance.com', password: DOCTOR_PASSWORD });
  if (other.status === 200) {
    const oDl = await fetch(`${BASE}/api/files/${up.data.id}`, { headers: { Authorization: 'Bearer ' + other.data.token } });
    check("other doctor can't download", oDl.status === 404, oDl.status);
    const oUp = await call('POST', `/api/doctors/me/records/${rec.data.id}/files`, { filename: 'x.pdf', data: pdf.toString('base64') }, other.data.token);
    check("other doctor can't attach to this record", oUp.status === 404, oUp);
  }
  const rm = await call('DELETE', `/api/doctors/me/files/${up.data.id}`, null, D);
  check('uploader removes file', rm.status === 200, rm);

  const cancel = await call('POST', `/api/admin/appointments/${book.data.id}/cancel`, {}, S);
  check('staff cancels appointment', cancel.data.status === 'cancelled', cancel);
  const rebook = await call('POST', '/api/appointments', { doctorId: newDoc.data.id, date: tomorrow, time: slot }, P);
  check('cancelled slot can be rebooked', rebook.status === 200, rebook);
  const pcancel = await call('POST', `/api/patients/me/appointments/${rebook.data.id}/cancel`, {}, P);
  check('patient cancels', pcancel.data.status === 'cancelled', pcancel);
  const stList = await call('GET', '/api/admin/staff-accounts', null, A);
  check('list staff accounts', stList.data.some(s => s.email === staffEmail), stList);
  const stDel = await call('DELETE', `/api/admin/staff-accounts/${st.data.id}`, null, A);
  check('remove staff', stDel.status === 200, stDel);
  const sAfter = await call('GET', '/api/admin/appointments', null, S);
  check('removed staff token rejected', sAfter.status === 401, sAfter);

  const setP = await call('PATCH', '/api/admin/settings', { phone: '+971500000001', notifyEmails: ['ops@example.com'], smtp: { host: 'smtp.example.com', port: 587, user: 'u', pass: 'secret', from: 'u@example.com' } }, A);
  check('save settings', setP.status === 200, setP);
  const getS = await call('GET', '/api/admin/settings', null, A);
  check('settings hide smtp pass', getS.data.smtp.pass === true && getS.data.notifyEmails[0] === 'ops@example.com', getS);
  const pubS = await call('GET', '/api/settings');
  check('public settings updated, no smtp', pubS.data.phone === '+971500000001' && !pubS.data.smtp, pubS);
  // reset so later runs & the live footer aren't affected
  await call('PATCH', '/api/admin/settings', { phone: settings.data.phone, notifyEmails: [], smtp: { host: '', port: 587, user: '', pass: '', from: '' } }, A);

  const tm = await call('POST', '/api/admin/team-members', { name: 'Tmp', role: 'Nurse' }, A);
  check('add team member', tm.status === 200, tm);
  const tmp = await call('PATCH', `/api/admin/team-members/${tm.data.id}`, { bio: 'hello' }, A);
  check('edit team member', tmp.data.bio === 'hello', tmp);
  const tmd = await call('DELETE', `/api/admin/team-members/${tm.data.id}`, null, A);
  check('delete team member', tmd.status === 200, tmd);

  const contact = await call('POST', '/api/contact', { name: 'Visitor', email: 'v@example.com', message: 'Hi' });
  check('contact form', contact.status === 200, contact);

  const delDoc = await call('DELETE', `/api/admin/doctors/${newDoc.data.id}`, null, A);
  check('delete doctor', delDoc.status === 200, delDoc);
  const docGone = await call('POST', '/api/login', { email: docEmail, password: 'NewDoctor123!' });
  check('deleted doctor cannot log in', docGone.status === 401, docGone);
  const histKept = await call('GET', `/api/admin/patients/${me.id}`, null, A);
  check('history kept after doctor delete', histKept.data.records.length === 1, histKept);
  const delDept = await call('DELETE', `/api/admin/departments/${newDept.data.id}`, null, A);
  check('delete empty department', delDept.status === 200, delDept);

  const notFound = await call('GET', '/api/nope');
  check('unknown api → 404 json', notFound.status === 404 && notFound.data.error, notFound);
  const page = await fetch(BASE + '/doctors.html'); check('static page served', page.status === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
