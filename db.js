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
    contactMessages: []
  };
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('db.json is corrupted, resetting to empty shape.', e);
    return emptyShape();
  }
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
