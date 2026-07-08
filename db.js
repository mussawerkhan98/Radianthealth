// db.js — a tiny file-based JSON "database".
// Chosen deliberately over SQLite/Mongo so this app has ZERO native
// dependencies and will install cleanly on Hostinger's Node.js hosting
// without a build step. Fine for a single clinic's traffic; if the
// hospital grows a lot, migrate this to MySQL/Postgres later.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(emptyShape(), null, 2));
  }
}

function emptyShape() {
  return {
    departments: [],
    doctors: [],
    staff: [],
    patients: [],
    appointments: [],
    records: [],
    contactMessages: [],
    teamMembers: []
  };
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('db.json is corrupted, resetting to empty shape.', e);
    data = emptyShape();
  }
  // Backfill any collections added in later versions of this app so an
  // existing live database doesn't break when the code is updated.
  const defaults = emptyShape();
  for (const key of Object.keys(defaults)) {
    if (!Array.isArray(data[key])) data[key] = defaults[key];
  }
  return data;
}

// Very small in-process write queue so concurrent requests don't
// clobber each other's writes to the JSON file.
let writeChain = Promise.resolve();

function writeDb(data) {
  writeChain = writeChain.then(() => {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  return writeChain;
}

module.exports = { readDb, writeDb, DB_PATH };
