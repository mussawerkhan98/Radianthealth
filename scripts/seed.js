// scripts/seed.js — creates starting departments, doctors and an admin
// account in an EMPTY database. Safe to re-run: skips if data exists.
//
//   npm run seed
//
// Already have a live site with data/db.json? Use `npm run import:json`
// instead to copy your real data (keeps everyone's passwords).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');
const { newId } = require('../src/ids');

const DEFAULT_PASSWORD = 'ChangeMe123!';

async function main() {
  if ((await prisma.department.count()) > 0 || (await prisma.staff.count()) > 0) {
    console.log('Database already has data — skipping seed.');
    return;
  }
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const depts = [
    ['General Medicine', 'Everyday health concerns, check-ups and referrals.', 'stethoscope'],
    ['Cardiology', 'Heart health, blood pressure and cardiac screening.', 'heart'],
    ['Pediatrics', 'Care for infants, children and teenagers.', 'baby'],
    ['Orthopedics', 'Bones, joints, muscles and sports injuries.', 'bone'],
    ['Dermatology', 'Skin, hair and nail conditions.', 'skin'],
    ['Gynecology', "Women's health and reproductive care.", 'gyno'],
    ['ENT', 'Ear, nose and throat conditions.', 'ent'],
    ['Dental', 'Oral health, cleanings and dental procedures.', 'tooth'],
    ['Ophthalmology', 'Eye exams, vision correction and eye conditions.', 'eye'],
    ['Radiology', 'Diagnostic imaging: X-ray, ultrasound and scans.', 'scan'],
    ['Physiotherapy', 'Rehabilitation, mobility and pain management.', 'physio']
  ].map(([name, description, icon], i) => ({ id: newId('dept'), name, description, icon, sortOrder: i }));
  const byName = n => depts.find(d => d.name === n).id;

  const doctors = [
    ['Dr. Amina Farouk', 'General Medicine', 'Family & Internal Medicine'],
    ['Dr. Yusuf Al Mansoori', 'Cardiology', 'Cardiologist'],
    ['Dr. Layla Haddad', 'Pediatrics', 'Pediatrician'],
    ['Dr. Omar Siddiqui', 'Orthopedics', 'Orthopedic Surgeon'],
    ['Dr. Fatima Noor', 'Dermatology', 'Dermatologist'],
    ['Dr. Sara Abdullah', 'Gynecology', 'Gynecologist'],
    ['Dr. Karim El Sayed', 'ENT', 'ENT Specialist'],
    ['Dr. Hana Youssef', 'Dental', 'General Dentist'],
    ['Dr. Bilal Rahman', 'Ophthalmology', 'Ophthalmologist'],
    ['Dr. Nadia Khalil', 'Radiology', 'Radiologist'],
    ['Dr. Tariq Aziz', 'General Medicine', 'Family Medicine'],
    ['Dr. Mona Reza', 'Cardiology', 'Interventional Cardiologist'],
    ['Dr. Zainab Hussain', 'Physiotherapy', 'Physiotherapist']
  ].map(([name, dept, specialty]) => ({
    id: newId('doc'), name, departmentId: byName(dept), specialty,
    bio: `${name} is a ${specialty.toLowerCase()} at Radiant Health Alliance, focused on compassionate, evidence-based care.`,
    email: `${name.toLowerCase().replace('dr. ', '').replace(/[^a-z]+/g, '.')}@radianthealthalliance.com`,
    passwordHash, mustChangePassword: true
  }));

  await prisma.$transaction([
    prisma.department.createMany({ data: depts }),
    prisma.doctor.createMany({ data: doctors }),
    prisma.staff.create({ data: { id: newId('staff'), role: 'admin', name: 'Front Desk Admin', email: 'admin@radianthealthalliance.com', passwordHash, mustChangePassword: true } })
  ]);

  console.log('Seed complete.');
  console.log('Admin login:   admin@radianthealthalliance.com /', DEFAULT_PASSWORD);
  console.log('Doctor logins: <firstname.lastname>@radianthealthalliance.com /', DEFAULT_PASSWORD);
  console.log('CHANGE THESE PASSWORDS IMMEDIATELY after first login.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
