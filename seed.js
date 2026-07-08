// seed.js — populates data/db.json with a starting multi-department
// hospital directory, an admin account, and doctor login accounts.
//
// Run once with: npm run seed
// Safe to re-run — it will NOT overwrite an existing db.json.
// Delete data/db.json first if you want to reseed from scratch.

const bcrypt = require('bcryptjs');
const { readDb, writeDb, DB_PATH } = require('./db');
const fs = require('fs');

const DEFAULT_PASSWORD = 'ChangeMe123!';

function id(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

async function seed() {
  if (fs.existsSync(DB_PATH)) {
    const existing = readDb();
    if (existing.departments && existing.departments.length > 0) {
      console.log('db.json already has data — skipping seed. Delete data/db.json to reseed.');
      return;
    }
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const departments = [
    { id: id('dept'), name: 'General Medicine', description: 'Everyday health concerns, check-ups and referrals.', icon: 'stethoscope' },
    { id: id('dept'), name: 'Cardiology', description: 'Heart health, blood pressure and cardiac screening.', icon: 'heart' },
    { id: id('dept'), name: 'Pediatrics', description: 'Care for infants, children and teenagers.', icon: 'baby' },
    { id: id('dept'), name: 'Orthopedics', description: 'Bones, joints, muscles and sports injuries.', icon: 'bone' },
    { id: id('dept'), name: 'Dermatology', description: 'Skin, hair and nail conditions.', icon: 'skin' },
    { id: id('dept'), name: 'Gynecology', description: "Women's health and reproductive care.", icon: 'gyno' },
    { id: id('dept'), name: 'ENT', description: 'Ear, nose and throat conditions.', icon: 'ent' },
    { id: id('dept'), name: 'Dental', description: 'Oral health, cleanings and dental procedures.', icon: 'tooth' },
    { id: id('dept'), name: 'Ophthalmology', description: 'Eye exams, vision correction and eye conditions.', icon: 'eye' },
    { id: id('dept'), name: 'Radiology', description: 'Diagnostic imaging: X-ray, ultrasound and scans.', icon: 'scan' },
    { id: id('dept'), name: 'Physiotherapy', description: 'Rehabilitation, mobility and pain management.', icon: 'physio' }
  ];

  const byName = (n) => departments.find(d => d.name === n).id;

  const doctorSeeds = [
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
  ];

  const doctors = doctorSeeds.map(([name, dept, specialty]) => {
    const slug = name.toLowerCase().replace('dr. ', '').replace(/[^a-z]+/g, '.');
    return {
      id: id('doc'),
      name,
      departmentId: byName(dept),
      specialty,
      bio: `${name} is a ${specialty.toLowerCase()} at Radiant Health Alliance, focused on compassionate, evidence-based care.`,
      email: `${slug}@radianthealthalliance.com`,
      passwordHash,
      mustChangePassword: true,
      photo: null,
      workingHours: { start: '09:00', end: '17:00', slotMinutes: 30 },
      workingDays: [1, 2, 3, 4, 5] // Mon–Fri (0=Sun)
    };
  });

  const staff = [
    {
      id: id('staff'),
      role: 'admin',
      name: 'Front Desk Admin',
      email: 'admin@radianthealthalliance.com',
      passwordHash,
      mustChangePassword: true
    }
  ];

  const data = {
    departments,
    doctors,
    staff,
    patients: [],
    appointments: [],
    records: [],
    contactMessages: [],
    teamMembers: []
  };

  await writeDb(data);

  console.log('Seed complete.');
  console.log('----------------------------------------------------');
  console.log('Admin login:   admin@radianthealthalliance.com /', DEFAULT_PASSWORD);
  console.log('Doctor logins: <firstname.lastname>@radianthealthalliance.com /', DEFAULT_PASSWORD);
  console.log('e.g. amina.farouk@radianthealthalliance.com /', DEFAULT_PASSWORD);
  console.log('CHANGE THESE PASSWORDS IMMEDIATELY after first login.');
  console.log('----------------------------------------------------');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
