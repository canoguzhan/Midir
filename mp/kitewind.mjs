#!/usr/bin/env node
// Kitewind online server: co-op skies for up to 4 kites, running the same rules as the browser (games/kitewind/sim.js).
//   node mp/kitewind.mjs            listens on 127.0.0.1:8091 (MP_HOST / MP_PORT); Caddy serves it at wss://<site>/mp/kitewind
// Each client flies its own kite and reports where it is; the server keeps the shared sky: it grows every kite's tail from
// those reports (sim.trackRemote, with speed and string checks), paints the clouds (sim.paintStep), runs the wind, birds and
// rings (sim.skyStep), and pays breeze. When a sky is in full bloom the room celebrates and moves on to the next sky together.
// No accounts, no typed text: a player is shown by their CrazyGames username (verified from the SDK's signed user token), or
// a name built from the word lists in sim.js, or a guest name. Quick chat sends one of sim.CHAT's fixed phrases.
// Protocol (JSON). Client -> server: join {mode: quick|create|code, code?, name?, tok?, ups, kite}, k {x, y, h, s, st}, loop,
//   chat {i}, leave. Server -> client: welcome {you, room}, room {code, priv, round, seed, seats, paint}, s (snapshot), ev {list},
//   err {e}.
import { WebSocketServer } from 'ws';
import { createPublicKey, verify } from 'node:crypto';
import * as S from '../games/kitewind/sim.js';

const PORT = Number(process.env.MP_PORT || 8091), HOST = process.env.MP_HOST || '127.0.0.1';
const LIMITS = { seats: 4, rooms: 60, clients: 240, perIp: 6, msgPerSec: 40, msgBytes: 4096, idleRoom: 60_000, chatGap: 1500 };
const TICK_MS = 50, INTERMISSION = 9; // 20 snapshots/s; the celebration between two skies
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CG_NAME = /^[A-Za-z0-9._]{3,20}$/;
const rooms = new Map(), ipCount = new Map();
let clientCount = 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- CrazyGames user tokens (RS256 JWT signed by CrazyGames)
let cgKey = null;
async function loadCgKey() {
  try { const r = await fetch('https://sdk.crazygames.com/publicKey.json'); const j = await r.json(); cgKey = createPublicKey(j.publicKey); log('CrazyGames public key loaded'); }
  catch (e) { log('CrazyGames public key unavailable:', e.message); setTimeout(loadCgKey, 600_000); }
}
loadCgKey(); setInterval(loadCgKey, 86_400_000);
function cgUsername(tok) { // the username inside a valid, unexpired token; null otherwise
  if (!cgKey || typeof tok !== 'string' || tok.length > 4096) return null;
  try {
    const [h, p, sig] = tok.split('.'); if (!sig) return null;
    if (JSON.parse(Buffer.from(h, 'base64url')).alg !== 'RS256') return null;
    if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), cgKey, Buffer.from(sig, 'base64url'))) return null;
    const body = JSON.parse(Buffer.from(p, 'base64url'));
    if (body.exp && body.exp * 1000 < Date.now()) return null;
    return CG_NAME.test(body.username || '') ? body.username : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- rooms
function newCode() { for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; if (!rooms.has(c)) return c; } }
function newSky(room) {
  room.seed = (Math.random() * 1e9) | 0;
  room.world = S.createWorld(S.freeSky(room.round), { seed: room.seed, seats: LIMITS.seats, solo: false });
  room.phase = 'play'; room.phaseT = 0;
  for (const c of room.clients) seatKite(room, c);
}
function createRoom(priv) {
  const room = { code: newCode(), priv, clients: new Set(), round: (Math.random() * 3) | 0, world: null, seed: 0, phase: 'play', phaseT: 0, empty: 0, events: [] };
  newSky(room); rooms.set(room.code, room); log('room', room.code, priv ? 'private' : 'public', 'rooms', rooms.size); return room;
}
function seatKite(room, c) { // a kite on the kid at this client's seat; it keeps the client's upgrades and kite shape
  const k = S.addKite(room.world, { seat: c.seat, ups: c.ups, kite: c.kite, name: c.name });
  k.x = k.ax; k.y = 9; c.kite_ = k; c.paid = 0;
}
function freeSeat(room) { for (let s = 0; s < LIMITS.seats; s++) if (![...room.clients].some((c) => c.seat === s)) return s; return -1; }
const seatList = (room) => [...room.clients].map((c) => ({ id: c.id, name: c.name, seat: c.seat, kite: c.kite, cg: !!c.cg }));
function roomMsg(room) {
  const w = room.world;
  return { t: 'room', code: room.code, priv: room.priv, round: room.round, seed: room.seed, phase: room.phase, phaseT: r2(room.phaseT), seats: seatList(room),
    paint: w.clouds.map((c) => [c.id, r2(c.paint), c.bloomed ? 1 : 0, c.kind === 'storm' ? 1 : 0]), rings: w.rings.map((r) => (r.taken ? 1 : 0)), wind: w.wind.dir, time: r2(w.time) };
}
const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const broadcast = (room, msg) => { const s = JSON.stringify(msg); for (const c of room.clients) send(c, s); };
function joinRoom(c, room) {
  const seat = freeSeat(room); if (seat < 0) { send(c, { t: 'err', e: 'full' }); return; }
  leaveRoom(c); c.room = room; c.seat = seat; room.clients.add(c); room.empty = 0;
  if (room.phase === 'play') seatKite(room, c);
  send(c, { t: 'welcome', you: { id: c.id, name: c.name, seat } });
  broadcast(room, roomMsg(room));
  room.events.push({ t: 'join', id: c.id, name: c.name, seat });
}
function leaveRoom(c) {
  const room = c.room; if (!room) return;
  room.clients.delete(c); if (c.kite_) S.removeKite(room.world, c.kite_.id);
  c.room = null; c.kite_ = null;
  if (room.clients.size) { room.events.push({ t: 'leave', id: c.id, name: c.name }); broadcast(room, roomMsg(room)); }
}
function quickRoom() {
  let best = null;
  for (const r of rooms.values()) if (!r.priv && r.clients.size < LIMITS.seats && (!best || r.clients.size > best.clients.size)) best = r;
  return best || (rooms.size < LIMITS.rooms ? createRoom(false) : null);
}
function guestName(room) { for (;;) { const n = `${S.NAME_A[(Math.random() * S.NAME_A.length) | 0]}${S.NAME_B[(Math.random() * S.NAME_B.length) | 0]}${1 + ((Math.random() * 99) | 0)}`; if (!room || ![...room.clients].some((c) => c.name === n)) return n; } }

// ---------------------------------------------------------------- tick: the shared sky
function tick() {
  for (const room of rooms.values()) {
    if (!room.clients.size) { room.empty += TICK_MS; if (room.empty > LIMITS.idleRoom) { rooms.delete(room.code); log('room closed', room.code, 'rooms', rooms.size); } continue; }
    const w = room.world, dt = TICK_MS / 1000;
    if (room.phase === 'play') {
      S.skyStep(w, dt);
      for (const c of room.clients) if (c.kite_) S.paintStep(w, c.kite_, dt);
      if (w.done) { room.phase = 'party'; room.phaseT = INTERMISSION; room.events.push({ t: 'skydone', round: room.round, time: r2(w.time) }); }
    } else if ((room.phaseT -= dt) <= 0) { room.round++; newSky(room); broadcast(room, roomMsg(room)); continue; }
    // everything that happened: bloom / paint / ring / zap / loop events from the rules plus joins, leaves and chat
    const ev = [...w.events, ...room.events]; w.events.length = 0; room.events.length = 0;
    for (const e of ev) if (e.t === 'bloom') for (const c of room.clients) if (c.kite_ && c.kite_.id !== e.k) c.kite_.breeze += e.big ? 9 : 5; // co-op: every bloom pays everyone
    const kites = [], pay = new Map();
    for (const c of room.clients) {
      const k = c.kite_; if (!k) continue;
      kites.push([c.id, r2(k.x), r2(k.y), r2(k.h), r2(k.s), k.stun > 0 ? 1 : 0, k.combo]);
      const earned = Math.floor(k.breeze - c.paid); if (earned > 0) { c.paid += earned; pay.set(c, earned); }
    }
    const changed = []; // clouds whose paint moved since the last snapshot
    for (const cl of w.clouds) { const q = Math.round((cl.paint / (cl.need || 1)) * 100); if (q !== cl.q || (cl.bloomed ? 1 : 0) !== cl.qb) { cl.q = q; cl.qb = cl.bloomed ? 1 : 0; changed.push([cl.id, r2(cl.paint), cl.qb, cl.kind === 'storm' ? 1 : 0]); } }
    const evOut = ev.map((e) => (e.k != null ? { ...e, k: [...room.clients].find((c) => c.kite_?.id === e.k)?.id ?? -1 } : e)); // kite ids -> player ids
    const base = { t: 's', k: kites, c: changed, b: w.birds.map((b) => [r2(b.x), r2(b.y), b.dir]), r: w.rings.map((r) => (r.taken ? 1 : 0)), w: w.wind.dir, bl: w.bloomed, g: w.goal, tm: r2(w.time), ph: room.phase, pt: r2(room.phaseT), ev: evOut };
    for (const c of room.clients) send(c, { ...base, br: pay.get(c) || 0 });
  }
}
setInterval(tick, TICK_MS);

// ---------------------------------------------------------------- connections
const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: LIMITS.msgBytes });
let nextId = 1;
wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (clientCount >= LIMITS.clients || (ipCount.get(ip) || 0) >= LIMITS.perIp) { ws.close(1013, 'busy'); return; }
  clientCount++; ipCount.set(ip, (ipCount.get(ip) || 0) + 1);
  const c = { ws, id: nextId++, ip, name: null, cg: null, seat: -1, room: null, kite_: null, ups: {}, kite: 'diamond', msgs: 0, lastK: 0, lastChat: 0, paid: 0 };
  const rate = setInterval(() => { c.msgs = 0; }, 1000);
  ws.on('message', (raw) => {
    if (++c.msgs > LIMITS.msgPerSec) { ws.close(1008, 'rate'); return; }
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'join') {
      c.ups = S.normUps(m.ups); c.kite = S.KITES.some((k) => k.id === m.kite) ? m.kite : 'diamond';
      c.cg = cgUsername(m.tok);
      const room = m.mode === 'create' ? (rooms.size < LIMITS.rooms ? createRoom(true) : null)
        : m.mode === 'code' ? rooms.get(String(m.code || '').toUpperCase().slice(0, 8)) : quickRoom();
      if (!room) { send(c, { t: 'err', e: m.mode === 'code' ? 'nocode' : 'busy' }); return; }
      const taken = (n) => [...room.clients].some((o) => o !== c && o.name === n);
      c.name = c.cg && !taken(c.cg) ? c.cg : S.isPickedName(m.name) && !taken(m.name) ? m.name : guestName(room); // never free text
      joinRoom(c, room); return;
    }
    const room = c.room; if (!room) return;
    if (m.t === 'k' && c.kite_) {
      const now = Date.now(), dt = Math.min(0.25, (now - (c.lastK || now)) / 1000) || 1 / 15; c.lastK = now;
      const x = +m.x, y = +m.y, h = +m.h, s = +m.s; if (![x, y, h, s].every(Number.isFinite)) return;
      if (m.st) c.kite_.stun = Math.max(c.kite_.stun, 0.1); // the client is tumbling (a crash it saw): no painting
      S.trackRemote(c.kite_, x, y, h, Math.min(Math.abs(s), 40), dt); return;
    }
    if (m.t === 'loop' && c.kite_ && room.phase === 'play') { if (now() - (c.lastLoop || 0) > 1000) { c.lastLoop = now(); S.applyLoop(room.world, c.kite_); } return; }
    if (m.t === 'chat') { const i = m.i | 0; if (i >= 0 && i < S.CHAT.length && now() - c.lastChat > LIMITS.chatGap) { c.lastChat = now(); room.events.push({ t: 'chat', id: c.id, i }); } return; }
    if (m.t === 'leave') { leaveRoom(c); return; }
  });
  ws.on('close', () => { clearInterval(rate); leaveRoom(c); clientCount--; const n = (ipCount.get(ip) || 1) - 1; if (n) ipCount.set(ip, n); else ipCount.delete(ip); });
  ws.on('error', () => {});
});
const now = () => Date.now();
log(`Kitewind online server on ws://${HOST}:${PORT}`);
