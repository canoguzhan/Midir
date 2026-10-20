#!/usr/bin/env node
// Whirlbash online server: authoritative rooms running the same rules as the browser (games/whirlbash/sim.js).
//   node mp/whirlbash.mjs            listens on 127.0.0.1:8090 (MP_HOST / MP_PORT); Caddy serves it at wss://<site>/mp/whirlbash
// No accounts: a player is named by their CrazyGames username when the SDK reports one, otherwise the server picks a guest
// name. There is no chat and no free-text input, so nothing user-written is ever shown to other players.
// Protocol (JSON). Client -> server: join {mode: quick|create|code, code?, name?, parts}, play {parts}, i {x, y, d, u}, p {c}, leave.
// Server -> client: welcome, you, s (snapshot: tops, events, sparks, me), p (pong), err {e}.
import { WebSocketServer } from 'ws';
import * as S from '../games/whirlbash/sim.js';

const PORT = Number(process.env.MP_PORT || 8090), HOST = process.env.MP_HOST || '127.0.0.1';
const LIMITS = { roomTops: 12, roomHumans: 10, rooms: 60, clients: 400, perIp: 8, msgPerSec: 60, idleRoom: 60_000 };
const TICK_MS = 50, STEPS_PER_TICK = Math.round(TICK_MS / 1000 / S.STEP); // 20 snapshots/s, physics at 60 Hz
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CG_NAME = /^[A-Za-z0-9._]{3,20}$/; // CrazyGames usernames: letters, digits, period, underscore
const GUEST_A = ['Swift', 'Brave', 'Lucky', 'Mighty', 'Rapid', 'Sunny', 'Cosmic', 'Turbo', 'Jolly', 'Nimble', 'Zippy', 'Clever', 'Bouncy', 'Breezy', 'Steady', 'Daring'];
const GUEST_B = ['Comet', 'Falcon', 'Otter', 'Rocket', 'Panda', 'Tiger', 'Pixel', 'Rider', 'Gecko', 'Koala', 'Badger', 'Meteor', 'Fox', 'Whale', 'Lynx', 'Orbit'];
const STATE_CODE = { spawn: 0, alive: 1, falling: 2, toppling: 3 };
const rooms = new Map(), ipCount = new Map();
let clientCount = 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const r2 = (v) => Math.round(v * 100) / 100;

function newCode() { for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; if (!rooms.has(c)) return c; } }
function createRoom(priv) {
  const code = newCode(), world = S.createWorld({ bots: LIMITS.roomTops });
  world.heat = (w) => { const hs = w.tops.filter((t) => t.human); return hs.length ? hs.reduce((s, t) => s + t.age, 0) / hs.length : 30; };
  for (let i = 0; i < LIMITS.roomTops; i++) S.spawnBot(world, { ring: i });
  world.events.length = 0;
  const room = { code, priv, world, clients: new Set(), emptySince: Date.now() };
  rooms.set(code, room); log('room +', code, priv ? 'private' : 'public', `(${rooms.size} rooms)`);
  return room;
}
const topInfo = (tp) => ({ id: tp.id, name: tp.name, parts: tp.parts, human: tp.human });
function guestName(room) {
  for (let k = 0; k < 30; k++) { const n = GUEST_A[(Math.random() * 16) | 0] + GUEST_B[(Math.random() * 16) | 0] + (10 + ((Math.random() * 90) | 0)); if (![...room.clients].some((c) => c.name === n)) return n; }
  return 'Guest' + ((Math.random() * 9999) | 0);
}
function uniqueName(room, base) {
  const taken = new Set([...room.clients].map((c) => c.name).concat(room.world.tops.map((t) => t.name)));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 99; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  return guestName(room);
}
const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
function sparkData(s, i) { return [i, r2(s.x), r2(s.z), r2(s.vx), r2(s.vz), r2(s.fall), s.big]; }

function joinRoom(c, room) {
  c.room = room; room.clients.add(c);
  room.world.botTarget = Math.max(0, LIMITS.roomTops - room.clients.size);
  const w = room.world;
  send(c, {
    t: 'welcome', code: room.code, priv: room.priv, name: c.name, tm: r2(w.time), players: room.clients.size,
    tops: w.tops.map(topInfo), sparks: w.sparks.map((s, i) => (s.on ? sparkData(s, i) : null)).filter(Boolean),
    ev: w.event ? { id: w.event.id, t: r2(w.event.t), pit: w.event.pit } : null, leader: w.leader,
    pu: w.powerups.map((q) => ({ id: q.id, kind: q.kind, x: r2(q.x), z: r2(q.z) })),
  });
  spawnHuman(c, c.parts);
}
function spawnHuman(c, parts) {
  const room = c.room; if (!room || (c.top && room.world.tops.includes(c.top))) return;
  const [x, z] = S.freeSpot(room.world);
  c.top = S.addTop(room.world, { parts, name: c.name, human: true, x, z });
  c.top.client = c; c.input = { x: 0, y: 0, dash: false, use: false };
  send(c, { t: 'you', id: c.top.id });
}
function leaveRoom(c) {
  const room = c.room; if (!room) return;
  if (c.top && room.world.tops.includes(c.top)) S.removeTop(room.world, c.top);
  room.clients.delete(c); c.room = null; c.top = null;
  room.world.botTarget = Math.max(0, LIMITS.roomTops - room.clients.size);
  if (!room.clients.size) room.emptySince = Date.now();
}
function pickQuickRoom() {
  let best = null;
  for (const r of rooms.values()) if (!r.priv && r.clients.size < LIMITS.roomHumans && (!best || r.clients.size > best.clients.size)) best = r;
  return best || (rooms.size < LIMITS.rooms ? createRoom(false) : null);
}

function onMessage(c, raw) {
  const now = Date.now();
  if (now - c.sec > 1000) { c.sec = now; c.msgs = 0; }
  if (++c.msgs > LIMITS.msgPerSec) { c.ws.close(1008, 'rate'); return; }
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'i': { // input: a direction (clamped to the unit circle) and a sticky dash flag consumed by the next physics step
      if (!c.input) return;
      let x = Number(m.x) || 0, y = Number(m.y) || 0; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      c.input.x = x; c.input.y = y; if (m.d) c.input.dash = true; if (m.u) c.input.use = true;
      return;
    }
    case 'p': send(c, { t: 'p', c: Number(m.c) || 0 }); return;
    case 'play': if (c.room) { c.parts = S.cleanParts(m.parts); spawnHuman(c, c.parts); } return;
    case 'leave': leaveRoom(c); return;
    case 'join': {
      if (c.room) leaveRoom(c);
      c.parts = S.cleanParts(m.parts);
      let room = null;
      if (m.mode === 'create') { if (rooms.size >= LIMITS.rooms) { send(c, { t: 'err', e: 'busy' }); return; } room = createRoom(true); }
      else if (m.mode === 'code') {
        room = rooms.get(String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
        if (!room) { send(c, { t: 'err', e: 'noroom' }); return; }
        if (room.clients.size >= LIMITS.roomHumans) { send(c, { t: 'err', e: 'full' }); return; }
      } else room = pickQuickRoom();
      if (!room) { send(c, { t: 'err', e: 'busy' }); return; }
      c.name = uniqueName(room, typeof m.name === 'string' && CG_NAME.test(m.name) ? m.name : guestName(room));
      joinRoom(c, room);
      return;
    }
  }
}

// snapshot: tops as [id, x, z, vx, vz, spin, state, flags], plus the events and spark changes since the last tick
function snapshot(room) {
  const w = room.world, ev = [], sp = [];
  for (const e of w.events) {
    switch (e.type) {
      case 'add': { const tp = S.topById(w, e.id); if (tp) ev.push({ type: 'add', ...topInfo(tp) }); break; }
      case 'sparkAdd': { const s = w.sparks[e.i]; if (s.on) sp.push(sparkData(s, e.i)); break; }
      case 'clash': ev.push({ type: 'clash', a: e.a, b: e.b, x: r2(e.x), z: r2(e.z), rel: r2(e.rel), heavy: e.heavy, aDash: e.aDash, bDash: e.bDash }); break;
      case 'spark': ev.push({ type: 'spark', i: e.i, id: e.id, big: e.big }); break;
      case 'wall': ev.push({ type: 'wall', id: e.id, x: r2(e.x), z: r2(e.z), vn: r2(e.vn) }); break;
      case 'puAdd': ev.push({ type: 'puAdd', id: e.id, kind: e.kind, x: r2(e.x), z: r2(e.z) }); break;
      case 'blast': ev.push({ type: 'blast', id: e.id, x: r2(e.x), z: r2(e.z) }); break;
      case 'elim': ev.push({ type: 'elim', id: e.id, killer: e.killer, how: e.how, pts: e.pts, wasLeader: e.wasLeader, x: r2(e.x), z: r2(e.z), peak: Math.round(e.peak), score: e.score, kos: e.kos }); break;
      default: ev.push(e);
    }
  }
  w.events.length = 0;
  const tops = w.tops.map((tp) => [tp.id, r2(tp.x), r2(tp.z), r2(tp.vx), r2(tp.vz), Math.round(tp.spin * 10) / 10, STATE_CODE[tp.state] ?? 1, (tp.dashT > 0 ? 1 : 0) | (tp.shield > 0 ? 2 : 0) | ((S.FX_CODE[tp.fx?.kind] || 0) << 2)]);
  const body = JSON.stringify({ t: 's', tm: r2(w.time), tops, ev, sp, e: w.event ? { id: w.event.id, t: r2(w.event.t), pit: w.event.pit } : null, n: room.clients.size });
  return body.slice(0, -1); // the per-player "me" block is appended below
}
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.clients.size) { if (now - room.emptySince > LIMITS.idleRoom) { rooms.delete(room.code); log('room -', room.code, `(${rooms.size} rooms)`); } continue; }
    const w = room.world;
    const inputFor = (tp) => { const inp = tp.client?.input; if (!inp) return null; const out = { x: inp.x, y: inp.y, dash: inp.dash, use: inp.use }; inp.dash = inp.use = false; return out; };
    for (let k = 0; k < STEPS_PER_TICK; k++) S.step(w, S.STEP, inputFor);
    const head = snapshot(room);
    for (const c of room.clients) {
      const tp = c.top && w.tops.includes(c.top) ? c.top : null;
      send(c, `${head},"me":${JSON.stringify(tp ? { id: tp.id, score: tp.score, kos: tp.kos, cd: r2(tp.cd), peak: Math.round(tp.peak), pw: tp.power ? [tp.power.kind, r2(tp.power.t)] : null, fx: tp.fx ? [tp.fx.kind, r2(tp.fx.t)] : null } : null)}}`);
    }
  }
}, TICK_MS);

const wss = new WebSocketServer({ host: HOST, port: PORT, path: '/mp/whirlbash', maxPayload: 1024, perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (clientCount >= LIMITS.clients || (ipCount.get(ip) || 0) >= LIMITS.perIp) { ws.close(1013, 'busy'); return; }
  ipCount.set(ip, (ipCount.get(ip) || 0) + 1); clientCount++;
  const c = { ws, ip, room: null, top: null, name: '', parts: null, input: null, sec: Date.now(), msgs: 0 };
  ws._wbAlive = true; ws.on('pong', () => { ws._wbAlive = true; });
  ws.on('message', (data) => onMessage(c, data.toString()));
  ws.on('close', () => { leaveRoom(c); clientCount--; const n = (ipCount.get(ip) || 1) - 1; if (n > 0) ipCount.set(ip, n); else ipCount.delete(ip); });
  ws.on('error', () => {});
});
setInterval(() => { // drop dead connections (no pong for 30 s)
  for (const ws of wss.clients) { if (ws._wbAlive === false) { ws.terminate(); continue; } ws._wbAlive = false; ws.ping(); }
}, 15_000);
setInterval(() => { if (clientCount) log(`${clientCount} players in ${rooms.size} rooms`); }, 300_000);
log(`whirlbash server on ws://${HOST}:${PORT}/mp/whirlbash`);
