// src/location.js — the clinic's location (Admin → Site Settings → Clinic Location).
// Stored in the Setting table under "location":
//   { address, mapsUrl, embedUrl, notes }
// Shown on the booking page for in-clinic visits and emailed to patients
// after they book an in-clinic visit.

const clean = (v, max) => String(v == null ? '' : v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max);

function httpsUrl(v) {
  try { const u = new URL(String(v).trim()); return u.protocol === 'https:' ? u : null; } catch (e) { return null; }
}
const isGoogleHost = h => /(^|\.)google\.[a-z.]{2,6}$/i.test(h) || /^(maps\.app\.)?goo\.gl$/i.test(h);

// Validates what the admin typed. Throws { status: 400, message } on bad input.
function normalize(input) {
  const b = input || {};
  const out = { address: clean(b.address, 300), notes: clean(b.notes, 300), mapsUrl: '', embedUrl: '' };
  const bad = msg => { const e = new Error(msg); e.status = 400; throw e; };

  const link = clean(b.mapsUrl, 1000);
  if (link) {
    const u = httpsUrl(link);
    if (!u || !isGoogleHost(u.hostname)) bad('The Google Maps link must start with https:// and come from Google Maps (Share → Copy link).');
    out.mapsUrl = u.toString();
  }

  // Accept either the whole "Embed a map" HTML (<iframe src="…">) or just the URL.
  let embed = clean(b.embed != null ? b.embed : b.embedUrl, 4000);
  if (embed) {
    const m = /src\s*=\s*["']([^"']+)["']/i.exec(embed);
    if (m) embed = m[1];
    embed = embed.replace(/&amp;/g, '&');
    const u = httpsUrl(embed);
    const ok = u && isGoogleHost(u.hostname) && (u.pathname.startsWith('/maps/embed') || u.searchParams.get('output') === 'embed');
    if (!ok) bad('The map embed must be the code from Google Maps → Share → "Embed a map" (it starts with <iframe src="https://www.google.com/maps/embed…).');
    out.embedUrl = u.toString();
  }
  return out;
}

// What the site and emails use. null when nothing is set.
function publicLocation(loc) {
  loc = loc || {};
  const address = clean(loc.address, 300);
  if (!address && !loc.mapsUrl && !loc.embedUrl) return null;
  const q = encodeURIComponent(address);
  return {
    address,
    notes: clean(loc.notes, 300),
    link: loc.mapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${q}` : ''),
    embed: loc.embedUrl || (address ? `https://maps.google.com/maps?q=${q}&z=16&output=embed` : '')
  };
}

module.exports = { normalize, publicLocation };
