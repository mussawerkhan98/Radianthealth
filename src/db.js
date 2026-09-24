// src/db.js — one shared Prisma client connected to Turso (libSQL).
// Reused across hot reloads and serverless invocations.
//
// Env:
//   TURSO_DATABASE_URL  libsql://<db>-<org>.turso.io   (or file:./local.db for local dev)
//   TURSO_AUTH_TOKEN    database token from the Turso dashboard (not needed for file: URLs)
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaLibSQL } = require('@prisma/adapter-libsql');

function dbConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set. See .env.example.');
  return { url, authToken: process.env.TURSO_AUTH_TOKEN || undefined };
}

const globalForPrisma = globalThis;
const prisma = globalForPrisma.__rhaPrisma || new PrismaClient({ adapter: new PrismaLibSQL(dbConfig()) });
globalForPrisma.__rhaPrisma = prisma;

module.exports = prisma;
module.exports.dbConfig = dbConfig;
