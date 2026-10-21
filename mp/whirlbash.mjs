#!/usr/bin/env node
// Whirlbash online server: authoritative rooms running the same rules as the browser (games/whirlbash/sim.js).
//   node mp/whirlbash.mjs            listens on 127.0.0.1:8090 (MP_HOST / MP_PORT); Caddy serves it at wss://<site>/mp/whirlbash
// No accounts and no typed text: a player is shown by their CrazyGames username (verified from the SDK's signed user token),
// or by a name picked from the word lists in sim.js, or by a generated guest name. There is no chat.
// Rooms play one mode: endless (drop in any time), or round-based last / teams (countdown, a round, results, the next round;
// people who join mid-round watch until the next one). A daily top 10 of online scores is kept in MP_DATA (default mp/data/).
// Protocol (JSON). Client -> server: join {mode: quick|create|code, kind?, code?, name?, tok?, parts}, play {parts}, i {x, y, d, u},
// p {c}, leave, count, top, vote {a}, emote {e}, stat {...}. Server -> client: welcome, you {id, cd}, s (snapshot: tops, events, sparks,
// me, rp, ts), p (pong), count {n}, top {day, list, ranked}, rank {r, d, place}, err {e}.
// Ranked rooms play Last Top rounds and are open only to verified CrazyGames users; ratings are kept per username in MP_DATA.
// stat: anonymous per-run counters (mode, arena, length, how it ended...) summed per day, with no player identifiers stored.
import { WebSocketServer } from 'ws';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../games/whirlbash/sim.js';

const PORT = Number(process.env.MP_PORT || 8090), HOST = process.env.MP_HOST || '127.0.0.1';
const DATA = process.env.MP_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const LIMITS = { roomTops: 12, roomHumans: 10, rooms: 60, clients: 400, perIp: 8, msgPerSec: 60, idleRoom: 60_000 };
const ROUND = { count: 3, end: 10 }; // round rooms: countdown seconds, results (and the vote on the next arena) before the next round
const KINDS = [...S.MODES, 'ranked'];
const EMOTES = 6, EMOTE_GAP = 2500;
const TICK_MS = 50, STEPS_PER_TICK = Math.round(TICK_MS / 1000 / S.STEP); // 20 snapshots/s, physics at 60 Hz
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CG_NAME = /^[A-Za-z0-9._]{3,20}$/; // CrazyGames usernames: letters, digits, period, underscore
const STATE_CODE = { spawn: 0, alive: 1, falling: 2, toppling: 3 };
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

// ---------------------------------------------------------------- daily top 10 (server-side scores only)
const dayKey = () => new Date().toISOString().slice(0, 10);
let daily = { day: dayKey(), list: [] }, dailyDirty = false;
try { const d = JSON.parse(readFileSync(path.join(DATA, 'whirlbash-daily.json'), 'utf8')); if (d.day === dayKey() && Array.isArray(d.list)) daily = d; } catch {}
function recordScore(name, score) {
  if (!name || !(score > 0)) return;
  if (daily.day !== dayKey()) daily = { day: dayKey(), list: [] };
  const cur = daily.list.find((e) => e.n === name);
  if (cur) { if (score <= cur.s) return; cur.s = score; } else daily.list.push({ n: name, s: score });
  daily.list.sort((a, b) => b.s - a.s); daily.list.length = Math.min(daily.list.length, 10); dailyDirty = true;
}
setInterval(() => {
  if (!dailyDirty) return; dailyDirty = false;
  try { mkdirSync(DATA, { recursive: true }); const f = path.join(DATA, 'whirlbash-daily.json'); writeFileSync(f + '.tmp', JSON.stringify(daily)); renameSync(f + '.tmp', f); } catch (e) { log('save daily failed', e.message); }
}, 10_000);
const topMsg = () => ({ t: 'top', day: daily.day === dayKey() ? daily.day : dayKey(), list: daily.day === dayKey() ? daily.list : [], ranked: rankedTop() });
const loadJson = (f, d) => { try { return JSON.parse(readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
function saveJson(f, v) { try { mkdirSync(DATA, { recursive: true }); const p = path.join(DATA, f); writeFileSync(p + '.tmp', JSON.stringify(v)); renameSync(p + '.tmp', p); } catch (e) { log('save failed', f, e.message); } }
// ---------------------------------------------------------------- ranked ratings (verified CrazyGames usernames only)
const ratings = loadJson('whirlbash-ratings.json', {}); let ratingsDirty = false;
const ratingOf = (n) => ratings[n]?.r ?? 1000;
const rankedTop = () => Object.entries(ratings).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].r - a[1].r).slice(0, 10).map(([n, v]) => ({ n, s: v.r }));
function rateRound(room) { // placement among the 12 tops vs what your rating predicts against 1000-rated opposition
  for (const c of room.clients) {
    if (!c.verified || !c.place) continue;
    const r = ratingOf(c.name), perf = (12 - c.place) / 11, expect = 1 / (1 + 10 ** ((1000 - r) / 400)), d = Math.round(40 * (perf - expect));
    ratings[c.name] = { r: r + d, n: (ratings[c.name]?.n || 0) + 1 }; ratingsDirty = true;
    send(c, { t: 'rank', r: r + d, d, place: c.place });
  }
}
// ---------------------------------------------------------------- anonymous play counters, summed per day
const stats = loadJson('whirlbash-stats.json', { days: {} }); let statsDirty = false;
const HOWS = ['ringout', 'topple', 'win', 'teamwin', 'teamlose', 'teamdraw', 'quit'];
function addStat(m) {
  const day = dayKey(), d = (stats.days[day] ||= { runs: 0, time: 0, len: [0, 0, 0, 0, 0], mode: {}, arena: {}, how: {}, online: 0, tut: { done: 0, skipped: 0 }, pu: { used: 0, lost: 0 }, perfect: 0, gfxLow: 0, touch: 0 });
  const time = Math.max(0, Math.min(3600, Number(m.time) || 0)), mode = KINDS.includes(m.mode) ? m.mode : 'endless', arena = S.ARENA_IDS.includes(m.arena) ? m.arena : 'bowl';
  d.runs++; d.time += Math.round(time); d.len[time < 30 ? 0 : time < 60 ? 1 : time < 120 ? 2 : time < 300 ? 3 : 4]++;
  d.mode[mode] = (d.mode[mode] || 0) + 1; d.arena[arena] = (d.arena[arena] || 0) + 1;
  if (HOWS.includes(m.how)) d.how[m.how] = (d.how[m.how] || 0) + 1;
  if (m.online) d.online++; if (m.tut === 'done' || m.tut === 'skipped') d.tut[m.tut]++;
  d.pu.used += Math.min(50, Number(m.puUsed) || 0); d.pu.lost += Math.min(50, Number(m.puLost) || 0); d.perfect += Math.min(200, Number(m.perfect) || 0);
  if (m.gfxLow) d.gfxLow++; if (m.touch) d.touch++;
  const days = Object.keys(stats.days).sort(); while (days.length > 120) delete stats.days[days.shift()]; // keep four months
  statsDirty = true;
}
setInterval(() => { if (ratingsDirty) { ratingsDirty = false; saveJson('whirlbash-ratings.json', ratings); } if (statsDirty) { statsDirty = false; saveJson('whirlbash-stats.json', stats); } }, 10_000);

// ---------------------------------------------------------------- rooms
function newCode() { for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; if (!rooms.has(c)) return c; } }
const isRound = (room) => room.kind !== 'endless';
function newWorld(room, arena = S.ARENA_IDS[(Math.random() * S.ARENA_IDS.length) | 0]) { // endless: one world for the room's life; round rooms: a fresh world every round
  const world = S.createWorld({ bots: LIMITS.roomTops, arena, mode: room.kind === 'ranked' ? 'last' : room.kind, mutator: S.weekMutator() });
  if (room.kind === 'endless') world.heat = (w) => { const hs = w.tops.filter((t) => t.human); return hs.length ? hs.reduce((s, t) => s + t.age, 0) / hs.length : 30; };
  return world;
}
function createRoom(priv, kind) {
  const room = { code: newCode(), priv, kind: KINDS.includes(kind) ? kind : 'endless', clients: new Set(), emptySince: Date.now(), phase: 'play', phaseT: 0, opts: null, votes: new Map() };
  room.world = newWorld(room);
  if (isRound(room)) { room.phase = 'count'; room.phaseT = ROUND.count; room.world.frozen = true; }
  fillBots(room); room.world.events.length = 0;
  rooms.set(room.code, room); log('room +', room.code, priv ? 'private' : 'public', room.kind, room.world.arenaId, `(${rooms.size} rooms)`);
  return room;
}
function fillBots(room) { // bots take every seat the humans leave free
  const w = room.world, humans = w.tops.filter((t) => t.human).length;
  w.botTarget = Math.max(0, LIMITS.roomTops - Math.max(humans, isRound(room) ? 0 : room.clients.size));
  let i = 0; while (w.tops.filter((t) => !t.human && !t.boss && !S.isDecoy(t)).length < w.botTarget) S.spawnBot(w, { ring: i++ % LIMITS.roomTops });
}
const topInfo = (tp) => ({ id: tp.id, name: tp.name, parts: tp.parts, human: tp.human, ...(tp.boss ? { boss: tp.bossKind } : {}), ...(tp.decoyOf ? { decoy: tp.decoyOf } : {}), ...(tp.team != null ? { team: tp.team } : {}) });
function guestName(room) {
  for (let k = 0; k < 30; k++) { const n = S.NAME_A[(Math.random() * S.NAME_A.length) | 0] + S.NAME_B[(Math.random() * S.NAME_B.length) | 0] + (10 + ((Math.random() * 90) | 0)); if (![...room.clients].some((c) => c.name === n)) return n; }
  return 'Guest' + ((Math.random() * 9999) | 0);
}
function uniqueName(room, base) {
  const taken = new Set([...room.clients].map((c) => c.name).concat(room.world.tops.map((t) => t.name)));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 99; i++) if (!taken.has(`${base}${i}`.slice(0, 22))) return `${base}${i}`.slice(0, 22);
  return guestName(room);
}
const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
function sparkData(s, i) { return [i, r2(s.x), r2(s.z), r2(s.vx), r2(s.vz), r2(s.fall), s.big]; }
const roundInfo = (room) => {
  if (!isRound(room)) return null;
  const rp = { ph: room.phase, t: r2(Math.max(0, room.phaseT)) };
  if (room.phase === 'end' && room.opts) { rp.opts = room.opts; rp.votes = room.opts.map((a) => [...room.votes.values()].filter((v) => v === a).length); }
  return rp;
};

function welcome(c, room) {
  const w = room.world;
  send(c, {
    t: 'welcome', code: room.code, priv: room.priv, kind: room.kind, name: c.name, tm: r2(w.time), players: room.clients.size, arena: w.arenaId,
    tops: w.tops.map(topInfo), sparks: w.sparks.map((s, i) => (s.on ? sparkData(s, i) : null)).filter(Boolean),
    ev: w.event ? { id: w.event.id, t: r2(w.event.t), pit: w.event.pit } : null, leader: w.leader,
    pu: w.powerups.map((q) => ({ id: q.id, kind: q.kind, x: r2(q.x), z: r2(q.z) })), rp: roundInfo(room), ts: w.teamScore,
  });
}
function joinRoom(c, room) {
  c.room = room; room.clients.add(c); c.carry = null;
  welcome(c, room);
  if (!isRound(room)) { fillBots(room); spawnHuman(c, c.parts); }
  else if (room.phase === 'count') { spawnHuman(c, c.parts); fillBots(room); } // still in the countdown: jump in; otherwise watch until the next round
}
const sendYou = (c, room) => { if (c.top) send(c, { t: 'you', id: c.top.id, cd: room.phase === 'count' ? r2(room.phaseT) : 0 }); };
function spawnHuman(c, parts, tell = true) {
  const room = c.room; if (!room || (c.top && room.world.tops.includes(c.top))) return;
  const w = room.world, [x, z] = S.freeSpot(w);
  c.top = S.addTop(w, { parts, name: c.name, human: true, x, z, team: room.kind === 'teams' ? humanTeam(room) : null });
  if (c.carry) { c.top.score = c.carry.score; c.top.kos = c.carry.kos; } // Teams: a respawn keeps your score
  c.top.client = c; c.input = { x: 0, y: 0, dash: false, use: false };
  if (tell) sendYou(c, room);
  if (room.kind === 'teams') { // keep six a side: drop a bot from the human's team
    const b = w.tops.find((t) => !t.human && !t.boss && !S.isDecoy(t) && t.team === c.top.team && S.alive(t)) || w.tops.find((t) => !t.human && !t.boss && !S.isDecoy(t) && t.team === c.top.team);
    if (b && w.tops.filter((t) => t.team === c.top.team && !S.isDecoy(t)).length > LIMITS.roomTops / 2) S.removeTop(w, b);
  }
}
function humanTeam(room) { // humans are spread evenly over the two teams
  const n = [0, 0]; for (const k of room.clients) if (k.top && room.world.tops.includes(k.top) && k.top.team != null) n[k.top.team]++;
  return n[1] < n[0] ? 1 : n[0] < n[1] ? 0 : (Math.random() < 0.5 ? 0 : 1);
}
function leaveRoom(c) {
  const room = c.room; if (!room) return;
  if (c.top && room.world.tops.includes(c.top)) { recordScore(c.name, c.top.score); S.removeTop(room.world, c.top); }
  room.clients.delete(c); c.room = null; c.top = null;
  if (!isRound(room)) room.world.botTarget = Math.max(0, LIMITS.roomTops - room.clients.size);
  if (!room.clients.size) room.emptySince = Date.now();
}
function pickQuickRoom(kind) {
  let best = null;
  for (const r of rooms.values()) if (!r.priv && r.kind === kind && r.clients.size < LIMITS.roomHumans && (!best || r.clients.size > best.clients.size)) best = r;
  return best || (rooms.size < LIMITS.rooms ? createRoom(false, kind) : null);
}
function startRound(room) { // a fresh world in the arena the room voted for; everyone plays, bots fill the rest
  let arena;
  if (room.opts) { const tally = room.opts.map((a) => [...room.votes.values()].filter((v) => v === a).length), best = Math.max(...tally), top = room.opts.filter((_, i) => tally[i] === best); arena = top[(Math.random() * top.length) | 0]; }
  room.opts = null; room.votes.clear();
  room.world = newWorld(room, arena); room.phase = 'count'; room.phaseT = ROUND.count; room.world.frozen = true;
  for (const c of room.clients) { c.top = null; c.carry = null; c.place = 0; spawnHuman(c, c.parts, false); }
  fillBots(room); room.world.events.length = 0;
  for (const c of room.clients) { welcome(c, room); sendYou(c, room); } // only now: the welcome must list every top of the new round
}

function onMessage(c, raw) {
  const now = Date.now();
  if (now - c.sec > 1000) { c.sec = now; c.msgs = 0; }
  if (++c.msgs > LIMITS.msgPerSec) { c.ws.close(1008, 'rate'); return; }
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'i': { // input: a direction (clamped to the unit circle) and sticky dash / use flags consumed by the next physics step
      if (!c.input) return;
      let x = Number(m.x) || 0, y = Number(m.y) || 0; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      c.input.x = x; c.input.y = y; if (m.d) c.input.dash = true; if (m.u) c.input.use = true;
      return;
    }
    case 'p': send(c, { t: 'p', c: Number(m.c) || 0 }); return;
    case 'count': { let n = 0; for (const r of rooms.values()) n += r.clients.size; send(c, { t: 'count', n }); return; }
    case 'top': send(c, topMsg()); return;
    case 'vote': { const room = c.room; if (room?.phase === 'end' && room.opts?.includes(m.a)) room.votes.set(c, m.a); return; }
    case 'emote': { // fixed phrases only, a few seconds apart, from a top in play
      const e = Number(m.e) | 0; if (e < 0 || e >= EMOTES || !c.top || !c.room?.world.tops.includes(c.top) || now - (c.emoteAt || 0) < EMOTE_GAP) return;
      c.emoteAt = now; c.room.world.events.push({ type: 'emote', id: c.top.id, e }); return;
    }
    case 'stat': if (now - (c.statAt || 0) > 15_000) { c.statAt = now; addStat(m); } return;
    case 'play': if (c.room && !isRound(c.room)) { c.parts = S.cleanParts(m.parts); spawnHuman(c, c.parts); } return; // round rooms bring you back next round
    case 'leave': leaveRoom(c); return;
    case 'join': {
      if (c.room) leaveRoom(c);
      c.parts = S.cleanParts(m.parts);
      let kind = KINDS.includes(m.kind) ? m.kind : 'endless';
      const cg = cgUsername(m.tok); c.verified = !!cg;
      if (kind === 'ranked' && m.mode === 'create') kind = 'last'; // no private ranked rooms: ratings come from public matches
      let room = null;
      if (m.mode === 'create') { if (rooms.size >= LIMITS.rooms) { send(c, { t: 'err', e: 'busy' }); return; } room = createRoom(true, kind); }
      else if (m.mode === 'code') {
        room = rooms.get(String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
        if (!room) { send(c, { t: 'err', e: 'noroom' }); return; }
        if (room.clients.size >= LIMITS.roomHumans) { send(c, { t: 'err', e: 'full' }); return; }
      } else room = pickQuickRoom(kind);
      if (!room) { send(c, { t: 'err', e: 'busy' }); return; }
      if (room.kind === 'ranked' && !cg) { send(c, { t: 'err', e: 'ranked' }); return; } // ranked needs a CrazyGames account
      // a verified CrazyGames username, else a name picked from the word lists, else a guest name (never free text)
      const legacy = !cgKey && typeof m.name === 'string' && CG_NAME.test(m.name) ? m.name : null;
      c.name = room.kind === 'ranked' ? cg : uniqueName(room, cg || (S.isPickedName(m.name) ? m.name : legacy) || guestName(room)); // ratings key on the real username
      if (room.kind === 'ranked' && [...room.clients].some((k) => k.name === cg)) { send(c, { t: 'err', e: 'full' }); return; }
      joinRoom(c, room);
      if (room.kind === 'ranked') send(c, { t: 'rank', r: ratingOf(c.name), d: 0, place: 0 });
      return;
    }
  }
}

// snapshot: tops as [id, x, z, vx, vz, spin, state, flags (1 dash, 2 shield, bits 2-4 the power effect, 32 the Magnetar pulling)],
// plus the events and spark changes since the last tick, the round phase and the team scores
function snapshot(room) {
  const w = room.world, ev = [], sp = [];
  for (const e of w.events) {
    switch (e.type) {
      case 'add': { const tp = S.topById(w, e.id); if (tp) ev.push({ type: 'add', ...topInfo(tp) }); break; }
      case 'sparkAdd': { const s = w.sparks[e.i]; if (s.on) sp.push(sparkData(s, e.i)); break; }
      case 'clash': ev.push({ type: 'clash', a: e.a, b: e.b, x: r2(e.x), z: r2(e.z), rel: r2(e.rel), heavy: e.heavy, aDash: e.aDash, bDash: e.bDash, aPerf: e.aPerf, bPerf: e.bPerf, dA: Math.round(e.dA), dB: Math.round(e.dB) }); break;
      case 'spark': ev.push({ type: 'spark', i: e.i, id: e.id, big: e.big }); break;
      case 'wall': ev.push({ type: 'wall', id: e.id, x: r2(e.x), z: r2(e.z), vn: r2(e.vn) }); break;
      case 'puAdd': ev.push({ type: 'puAdd', id: e.id, kind: e.kind, x: r2(e.x), z: r2(e.z) }); break;
      case 'blast': ev.push({ type: 'blast', id: e.id, x: r2(e.x), z: r2(e.z) }); break;
      case 'decoyPop': ev.push({ type: 'decoyPop', id: e.id, owner: e.owner, by: e.by, x: r2(e.x), z: r2(e.z) }); break;
      case 'elim': ev.push({ type: 'elim', id: e.id, killer: e.killer, how: e.how, pts: e.pts, wasLeader: e.wasLeader, boss: e.boss, x: r2(e.x), z: r2(e.z), peak: Math.round(e.peak), score: e.score, kos: e.kos }); break;
      default: ev.push(e);
    }
  }
  w.events.length = 0;
  const tops = w.tops.map((tp) => [tp.id, r2(tp.x), r2(tp.z), r2(tp.vx), r2(tp.vz), Math.round(tp.spin * 10) / 10, STATE_CODE[tp.state] ?? 1, (tp.dashT > 0 ? 1 : 0) | (tp.shield > 0 ? 2 : 0) | ((S.FX_CODE[tp.fx?.kind] || 0) << 2) | (tp.pulling > 0 ? 32 : 0)]);
  const body = JSON.stringify({ t: 's', tm: r2(w.time), tops, ev, sp, e: w.event ? { id: w.event.id, t: r2(w.event.t), pit: w.event.pit } : null, n: room.clients.size, rp: roundInfo(room), ts: room.kind === 'teams' ? w.teamScore : undefined });
  return body.slice(0, -1); // the per-player "me" block is appended below
}
function afterStep(room) { // humans knocked out: daily scores, Teams respawns; a finished round goes to its results
  const w = room.world;
  for (const e of w.events) {
    if (e.type === 'elim') {
      const c = [...room.clients].find((k) => k.top && k.top.id === e.id); if (!c) continue;
      if (room.kind === 'teams' && room.phase === 'play') { c.carry = { score: e.score, kos: e.kos }; c.respawnAt = Date.now() + S.CFG.respawn * 1000; }
      else { recordScore(c.name, e.score); if (room.phase === 'play') c.place = w.tops.filter((t) => !S.isDecoy(t) && t.state !== 'dead').length + 1; }
    }
    if ((e.type === 'win' || e.type === 'teamWin') && room.phase === 'play') {
      room.phase = 'end'; room.phaseT = ROUND.end;
      for (const c of room.clients) if (c.top && w.tops.includes(c.top)) { recordScore(c.name, c.top.score); if (e.type === 'win' && c.top.id === e.id) c.place = 1; } else if (c.carry) recordScore(c.name, c.carry.score);
      const pool = [...S.ARENA_IDS].sort(() => Math.random() - 0.5); room.opts = pool.slice(0, 3); room.votes.clear(); // the next arena is up for a vote
      if (room.kind === 'ranked') rateRound(room);
    }
  }
}
setInterval(() => {
  const now = Date.now(), dt = TICK_MS / 1000;
  for (const room of rooms.values()) {
    if (!room.clients.size) { if (now - room.emptySince > LIMITS.idleRoom) { rooms.delete(room.code); log('room -', room.code, `(${rooms.size} rooms)`); } continue; }
    if (isRound(room)) {
      room.phaseT -= dt;
      if (room.phase === 'count' && room.phaseT <= 0) { room.phase = 'play'; room.world.frozen = false; }
      else if (room.phase === 'end' && room.phaseT <= 0) startRound(room);
      if (room.kind === 'teams' && room.phase === 'play') for (const c of room.clients) if (c.respawnAt && now >= c.respawnAt) { c.respawnAt = 0; c.top = null; spawnHuman(c, c.parts); }
    }
    const w = room.world;
    const inputFor = (tp) => { const inp = tp.client?.input; if (!inp) return null; const out = { x: inp.x, y: inp.y, dash: inp.dash, use: inp.use }; inp.dash = inp.use = false; return out; };
    for (let k = 0; k < STEPS_PER_TICK; k++) S.step(w, S.STEP, inputFor);
    afterStep(room);
    const head = snapshot(room);
    for (const c of room.clients) {
      const tp = c.top && w.tops.includes(c.top) ? c.top : null;
      send(c, `${head},"me":${JSON.stringify(tp ? { id: tp.id, score: tp.score, kos: tp.kos, cd: r2(tp.cd), peak: Math.round(tp.peak), pw: tp.power ? [tp.power.kind, r2(tp.power.t)] : null, fx: tp.fx ? [tp.fx.kind, r2(tp.fx.t)] : null } : null)}}`);
    }
  }
}, TICK_MS);

const wss = new WebSocketServer({ host: HOST, port: PORT, path: '/mp/whirlbash', maxPayload: 8192, perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (clientCount >= LIMITS.clients || (ipCount.get(ip) || 0) >= LIMITS.perIp) { ws.close(1013, 'busy'); return; }
  ipCount.set(ip, (ipCount.get(ip) || 0) + 1); clientCount++;
  const c = { ws, ip, room: null, top: null, name: '', parts: null, input: null, sec: Date.now(), msgs: 0, carry: null, respawnAt: 0 };
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
