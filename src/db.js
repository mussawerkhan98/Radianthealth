// src/db.js — one shared Prisma client (reused across hot reloads and
// serverless invocations so we don't open a new DB pool per request).
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;
const prisma = globalForPrisma.__rhaPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__rhaPrisma = prisma;

module.exports = prisma;
