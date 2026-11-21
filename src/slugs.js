// src/slugs.js — readable URLs for departments, doctors and team members:
//   /departments/cardiology   /doctors/dr-amina-farouk   /team/sara-khan
// Slugs come from the name, so renaming in Admin updates the URL automatically
// (old ID-based links keep working). If two people share a name, both get a
// short suffix from their ID so every URL stays unique.
const { slugify } = require('./markdown');

function slugMap(items) {
  const base = new Map(items.map(i => [i.id, slugify(i.name)]));
  const counts = {};
  for (const s of base.values()) counts[s] = (counts[s] || 0) + 1;
  const out = new Map();
  for (const [id, s] of base) out.set(id, counts[s] > 1 ? `${s}-${String(id).slice(-6).toLowerCase()}` : s);
  return out;
}

const lists = {
  department: prisma => prisma.department.findMany({ where: { active: true }, select: { id: true, name: true } }),
  doctor: prisma => prisma.doctor.findMany({ where: { active: true }, select: { id: true, name: true } }),
  team: prisma => prisma.teamMember.findMany({ select: { id: true, name: true } })
};

async function mapFor(prisma, kind) { return slugMap(await lists[kind](prisma)); }

// Accepts an ID or a slug; returns the ID (or the input if nothing matches).
async function resolveId(prisma, kind, idOrSlug) {
  const key = String(idOrSlug || '');
  const map = await mapFor(prisma, kind);
  if (map.has(key)) return key;
  for (const [id, slug] of map) if (slug === key.toLowerCase()) return id;
  return key;
}

module.exports = { slugMap, mapFor, resolveId };
