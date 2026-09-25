// src/permissions.js — what staff roles are allowed to do.
// Roles live in the Role table and are editable in Admin → Roles & Permissions.
// The built-in "admin" role always has everything.

const PERMISSIONS = [
  { key: 'appointments.view',   group: 'Appointments', label: 'See all appointments' },
  { key: 'appointments.book',   group: 'Appointments', label: 'Book appointments for patients and re-send doctor invites' },
  { key: 'appointments.cancel', group: 'Appointments', label: 'Cancel appointments' },
  { key: 'patients.view',       group: 'Patients',     label: 'Search patients and see contact details and visit history' },
  { key: 'patients.edit',       group: 'Patients',     label: 'Edit patient details (name, phone, email, date of birth, gender)' },
  { key: 'patients.delete',     group: 'Patients',     label: 'Delete patients permanently (with their appointments, reports and files)' },
  { key: 'records.view',        group: 'Medical records', label: 'See medical history, reports and files' },
  { key: 'records.write',       group: 'Medical records', label: 'Add reports and upload files' },
  { key: 'doctors.view',        group: 'Doctors',      label: "See doctors and their calendars" },
  { key: 'doctors.manage',      group: 'Doctors',      label: 'Add and edit doctors, working hours and doctor logins' },
  { key: 'directory.manage',    group: 'Website',      label: 'Edit departments and the Team page' },
  { key: 'profiles.manage',     group: 'Website',      label: 'Edit public profiles of doctors and team — bio, qualifications, certificates' },
  { key: 'settings.manage',     group: 'Website',      label: 'Site settings and email settings' },
  { key: 'marketing.send',      group: 'Marketing',    label: 'Create and send promotion emails to patients' },
  { key: 'staff.manage',        group: 'Staff',        label: 'Manage staff logins, roles and permissions' }
];
const ALL = PERMISSIONS.map(p => p.key);
const VALID = new Set(ALL);

function parsePerms(str) {
  if (str === '*') return new Set(ALL);
  return new Set(String(str || '').split(',').map(s => s.trim()).filter(k => VALID.has(k)));
}

async function permsForRole(prisma, roleId) {
  if (roleId === 'admin') return new Set(ALL);
  const r = await prisma.role.findUnique({ where: { id: String(roleId || '') } });
  return r ? parsePerms(r.permissions) : new Set();
}

module.exports = { PERMISSIONS, ALL, VALID, parsePerms, permsForRole };
