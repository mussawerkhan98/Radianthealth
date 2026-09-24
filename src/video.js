// src/video.js — video appointments via Daily.co (https://www.daily.co).
// Needs DAILY_API_KEY (Daily dashboard → Developers → API key). Without it,
// the "Video call" option is simply hidden.
//
// How it works: each video appointment has two secret keys (patient, doctor).
// People open  /video.html?a=<appointment id>&k=<their key>  — the server
// checks the key and time window, creates a PRIVATE Daily room the first time
// it's needed, and hands back a personal join link (a short-lived token).
const crypto = require('crypto');

const API = 'https://api.daily.co/v1';
const isConfigured = () => !!process.env.DAILY_API_KEY;
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

// Private room that only works during the appointment window.
async function createRoom({ appointmentId, opens, closes }) {
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

// Personal link into the room (doctor = room owner).
async function joinLink({ roomName, roomUrl, userName, isOwner, closes }) {
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

async function deleteRoom(roomName) {
  if (!roomName || !isConfigured()) return;
  try { await daily('DELETE', `/rooms/${encodeURIComponent(roomName)}`); } catch (e) { /* already gone */ }
}

module.exports = { isConfigured, newKey, joinWindow, createRoom, joinLink, deleteRoom, EARLY_MIN, LATE_MIN };
