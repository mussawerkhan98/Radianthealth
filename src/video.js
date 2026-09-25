// src/video.js — video appointments.
//
// Default: Jitsi Meet (https://meet.jit.si) — completely free, no account or
// API key needed. Each appointment gets its own long, random, unguessable room
// name. Patients just click; on meet.jit.si the first person may be asked to
// sign in (Google/GitHub) once to start the meeting — that's the doctor.
//   JITSI_DOMAIN   optional, e.g. your own Jitsi server later (default meet.jit.si)
//   VIDEO_ENABLED  set to "false" to hide the "Video call" option entirely
//
// Optional upgrade: if DAILY_API_KEY is set, Daily.co private rooms with
// time-limited tokens are used instead (no code change needed).
//
// People open  /video.html?a=<appointment id>&k=<their key>  — the server
// checks the key and time window, creates the room the first time it's
// needed, and hands back their personal join link.
const crypto = require('crypto');

const API = 'https://api.daily.co/v1';
const useDaily = () => !!process.env.DAILY_API_KEY;
const isConfigured = () => String(process.env.VIDEO_ENABLED || '').toLowerCase() !== 'false';
const provider = () => (useDaily() ? 'daily' : 'jitsi');
const jitsiDomain = () => String(process.env.JITSI_DOMAIN || 'meet.jit.si').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const EARLY_MIN = 15;   // join opens this many minutes before the start
const LATE_MIN = 30;    // and closes this long after the scheduled end

const newKey = () => crypto.randomBytes(18).toString('base64url');

async function daily(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.DAILY_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (!res.ok) {
    console.error(`Daily ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    const err = new Error('The video service is not responding. Please try again in a minute.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Window during which the call can be joined (Date objects).
function joinWindow(start, slotMinutes) {
  const opens = new Date(start.getTime() - EARLY_MIN * 60000);
  const closes = new Date(start.getTime() + ((slotMinutes || 30) + LATE_MIN) * 60000);
  return { opens, closes };
}

async function createRoom({ appointmentId, opens, closes }) {
  if (!useDaily()) {
    // 128 random bits — impossible to guess, so only people with the link get in.
    const name = `RadiantHealth-${crypto.randomBytes(16).toString('hex')}`;
    return { name, url: `https://${jitsiDomain()}/${name}` };
  }
  // Daily: private room that only works during the appointment window.
  const name = `rha-${appointmentId.replace(/[^a-z0-9]/gi, '').slice(-12)}-${crypto.randomBytes(4).toString('hex')}`;
  const room = await daily('POST', '/rooms', {
    name,
    privacy: 'private',
    properties: {
      nbf: Math.floor(opens.getTime() / 1000),
      exp: Math.floor(closes.getTime() / 1000),
      eject_at_room_exp: true,
      enable_prejoin_ui: true,
      enable_chat: true,
      enable_screenshare: true,
      max_participants: 4,
      lang: 'en'
    }
  });
  return { name: room.name, url: room.url };
}

const isJitsiRoom = (roomUrl) => /^https:\/\/[^/]+\/RadiantHealth-[0-9a-f]{32}$/.test(String(roomUrl || '')) && !/\.daily\.co\//.test(roomUrl);

// Personal link into the room (doctor = room owner on Daily).
async function joinLink({ roomName, roomUrl, userName, isOwner, closes }) {
  if (isJitsiRoom(roomUrl)) {
    // Jitsi reads settings from the # part (never sent to any server).
    const h = (k, v) => `${k}=${encodeURIComponent(JSON.stringify(v))}`;
    return `${roomUrl}#` + [
      h('userInfo.displayName', String(userName || '').slice(0, 60)),
      h('config.subject', 'Radiant Health video appointment'),
      h('config.prejoinConfig.enabled', true),
      h('config.disableDeepLinking', true)   // phones stay in the browser, no app needed
    ].join('&');
  }
  if (!useDaily()) {
    const err = new Error('The video service is not available. Please call the clinic.');
    err.status = 503;
    throw err;
  }
  const t = await daily('POST', '/meeting-tokens', {
    properties: {
      room_name: roomName,
      user_name: String(userName || '').slice(0, 60),
      is_owner: !!isOwner,
      exp: Math.floor(closes.getTime() / 1000),
      eject_at_token_exp: true
    }
  });
  return `${roomUrl}?t=${encodeURIComponent(t.token)}`;
}

// Jitsi rooms vanish on their own once empty; Daily rooms are deleted.
async function deleteRoom(roomName) {
  if (!roomName || !useDaily() || String(roomName).startsWith('RadiantHealth-')) return;
  try { await daily('DELETE', `/rooms/${encodeURIComponent(roomName)}`); } catch (e) { /* already gone */ }
}

module.exports = { isConfigured, provider, newKey, joinWindow, createRoom, joinLink, deleteRoom, EARLY_MIN, LATE_MIN };
