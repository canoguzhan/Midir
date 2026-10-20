// Whirlbash simulation: the pure game rules, shared by the browser (solo play + online prediction) and the multiplayer
// server (mp/whirlbash.mjs). No DOM and no THREE here: step() changes the world and pushes what happened to world.events
// ({ type: 'clash' | 'dash' | 'wall' | 'land' | 'spark' | 'sparkAdd' | 'fall' | 'topple' | 'elim' | 'add' | 'remove' |
// 'event' | 'eventEnd' | 'leader', ... }); the view (game.js) turns those into particles, sounds and HUD updates.

export const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz and on the server
export const CFG = {
  arenaR: 24, pitCount: 3, pitHalf: 0.16, bowlLift: 0.7, bowlPull: 2.2,
  bots: 11, sparks: 130, sparkMax: 220, sparkValue: 4, magnet: 1.4,
  startSpin: 100, maxSpin: 1500, decay: 0.7, decayGrowth: 1 / 500, dashCost: 1.5,
  accel: 24, maxSpeed: 8.5, damping: 1.4,
  dashSpeed: 14, dashTime: 0.32, dashCooldown: 1.7,
  restitution: 0.8, repel: 5, grind: 1.2, clashBase: 0.5, clashSpeed: 0.5, bumpSpeed: 3.5, dashMul: 1.7, maxHit: 22, shield: 2.5, pairCooldown: 0.9,
  wallBounce: 0.55, wallLoss: 0.25,
  ringoutSteal: 0.35, toppleDrop: 0.45, koPoints: 40, ringoutPoints: 60,
  eventFirst: 30, eventEvery: 38, tiltForce: 5.5, overdrive: 1.35,
  respawn: 3, aggroRamp: 120, graceTime: 18,
};
export const R = CFG.arenaR;
export const PIT_ANGLES = Array.from({ length: CFG.pitCount }, (_, i) => -Math.PI / 2 + (i * Math.PI * 2) / CFG.pitCount + Math.PI / CFG.pitCount);
export const EVENT_DUR = { storm: 6, tilt: 7, overdrive: 8 };

// ---------------------------------------------------------------- parts (garage: crown = attack ring, core = weight disk, tip = movement)
export const PARTS = {
  crown: [
    { id: 'halo', cost: 0, atk: 1, def: 1, spd: 1 },
    { id: 'razor', cost: 150, atk: 1.35, def: 0.85, spd: 1 },
    { id: 'bastion', cost: 150, atk: 0.85, def: 1.4, spd: 0.96 },
    { id: 'comet', cost: 400, atk: 1.2, def: 0.95, spd: 1.08 },
  ],
  core: [
    { id: 'gyro', cost: 0, mass: 1, sta: 1, spd: 1 },
    { id: 'iron', cost: 180, mass: 1.4, sta: 0.95, spd: 0.9 },
    { id: 'feather', cost: 180, mass: 0.75, sta: 1, spd: 1.12 },
    { id: 'heart', cost: 450, mass: 1, sta: 1.45, spd: 1 },
  ],
  tip: [
    { id: 'dome', cost: 0, acc: 1, spd: 1, sta: 1 },
    { id: 'grip', cost: 120, acc: 1.4, spd: 0.92, sta: 1 },
    { id: 'glide', cost: 120, acc: 0.85, spd: 1.2, sta: 1 },
    { id: 'needle', cost: 300, acc: 0.9, spd: 1, sta: 1.3 },
  ],
  paint: [
    { id: 'sun', cost: 0, c: '#ffc531' }, { id: 'coral', cost: 0, c: '#ff5d73' }, { id: 'mint', cost: 0, c: '#3ee0a1' }, { id: 'sky', cost: 80, c: '#4cb8ff' },
    { id: 'violet', cost: 80, c: '#a77bff' }, { id: 'lime', cost: 80, c: '#b6f03c' }, { id: 'tangerine', cost: 120, c: '#ff8a3d' }, { id: 'snow', cost: 120, c: '#eef1f8' },
  ],
};
export const part = (kind, id) => PARTS[kind].find((p) => p.id === id) || PARTS[kind][0];
export function cleanParts(p) { // whatever a client sends, only known part ids survive
  const out = {};
  for (const kind of ['crown', 'core', 'tip', 'paint']) out[kind] = part(kind, p?.[kind]).id;
  return out;
}
export function statsOf(p) {
  const c = part('crown', p.crown), k = part('core', p.core), tp = part('tip', p.tip);
  return { atk: c.atk, def: c.def, mass: k.mass, sta: k.sta * tp.sta, spd: c.spd * k.spd * tp.spd, acc: tp.acc };
}
export function randomParts(rng = Math.random) {
  const pick = (list) => list[(rng() * list.length) | 0].id;
  return { crown: pick(PARTS.crown), core: pick(PARTS.core), tip: pick(PARTS.tip), paint: pick(PARTS.paint) };
}

// ---------------------------------------------------------------- geometry helpers
export const radiusOf = (spin) => 0.55 + 0.45 * Math.sqrt(Math.max(0, spin) / 100);
export const bowlY = (r) => CFG.bowlLift * Math.min(1, (r / R) ** 2);
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function pitAt(ang, rad) {
  const half = Math.max(0.05, CFG.pitHalf - (rad / R) * 0.55);
  for (let i = 0; i < PIT_ANGLES.length; i++) if (Math.abs(angDiff(ang, PIT_ANGLES[i])) < half) return i;
  return -1;
}
export function nearestPit(x, z) {
  const ang = Math.atan2(z, x); let best = 0, bd = 9;
  PIT_ANGLES.forEach((p, i) => { const d = Math.abs(angDiff(ang, p)); if (d < bd) { bd = d; best = i; } });
  return { i: best, ang: PIT_ANGLES[best], diff: bd, x: Math.cos(PIT_ANGLES[best]) * R, z: Math.sin(PIT_ANGLES[best]) * R };
}
const norm = (x, z) => { const l = Math.hypot(x, z); return l > 1e-3 ? { x: x / l, y: z / l } : { x: 0, y: 0 }; };
export const alive = (tp) => tp.state === 'alive';

const SYL_A = ['Vor', 'Zip', 'Kra', 'Spi', 'Nim', 'Bly', 'Rax', 'Tor', 'Fen', 'Glim', 'Whi', 'Zor', 'Bri', 'Quo', 'Lux', 'Pyr', 'Dex', 'Mo', 'Sky', 'Jet', 'Rio', 'Kai', 'Nova', 'Pix', 'Zee', 'Ori', 'Bo', 'Tam'];
const SYL_B = ['tex', 'nix', 'dle', 'ra', 'zo', 'lo', 'ka', 'vin', 'bolt', 'spin', 'wick', 'rex', 'dash', 'fy', 'mo', 'ny', 'ro', 'lix', 'ton', 'whirl'];
export function botName(w) {
  for (let i = 0; i < 20; i++) {
    const n = SYL_A[(w.rng() * SYL_A.length) | 0] + SYL_B[(w.rng() * SYL_B.length) | 0] + (w.rng() < 0.15 ? String(10 + ((w.rng() * 89) | 0)) : '');
    if (!w.tops.some((tp) => tp.name === n)) return n;
  }
  return 'Top' + ((w.rng() * 999) | 0);
}

// ---------------------------------------------------------------- world
export function createWorld({ bots = CFG.bots, rng = Math.random, sparks = CFG.sparks } = {}) {
  const w = {
    tops: [], sparks: [], time: 0, nextId: 1, events: [], pairHits: new Map(), pendingRespawns: [], rng,
    botTarget: bots, event: null, nextEvent: CFG.eventFirst, lastEvent: '', eventsOn: true, frozen: false,
    leader: null, leaderT: 0, heat: null, trimT: 0,
  };
  for (let i = 0; i < CFG.sparkMax; i++) w.sparks.push({ on: false, x: 0, z: 0, y: 0.4, vx: 0, vz: 0, fall: 0, ph: rng() * 6, big: 0 });
  for (let i = 0; i < sparks; i++) addSpark(w, ...randomSpot(w));
  return w;
}
const emit = (w, e) => { w.events.push(e); };
const heatOf = (w) => (w.heat ? w.heat(w) : w.time); // how far the match has escalated (solo: run time; server: players' time alive)
export function randomSpot(w, maxR = R - 1.8) { const a = w.rng() * Math.PI * 2, r = Math.sqrt(w.rng()) * maxR; return [Math.cos(a) * r, Math.sin(a) * r]; }
export function addSpark(w, x, z, { vx = 0, vz = 0, fall = 0, big = 0 } = {}) {
  const i = w.sparks.findIndex((q) => !q.on); if (i < 0) return -1;
  const r = Math.hypot(x, z), lim = R - 1.2; if (r > lim) { x *= lim / r; z *= lim / r; }
  Object.assign(w.sparks[i], { on: true, x, z, vx, vz, fall, big, y: 0.4 + fall });
  emit(w, { type: 'sparkAdd', i }); return i;
}
export function updateSparks(w, dt) { // also run by online clients on their mirror, so sliding sparks move smoothly between snapshots
  for (const s of w.sparks) {
    if (!s.on) continue;
    s.ph += dt * 3;
    if (s.fall > 0) { s.fall = Math.max(0, s.fall - dt * 9); s.y = 0.4 + s.fall; continue; }
    if (s.vx || s.vz) {
      s.x += s.vx * dt; s.z += s.vz * dt; const k = Math.exp(-3 * dt); s.vx *= k; s.vz *= k;
      if (Math.abs(s.vx) + Math.abs(s.vz) < 0.05) s.vx = s.vz = 0;
      const r = Math.hypot(s.x, s.z), lim = R - 1.2; if (r > lim) { s.x *= lim / r; s.z *= lim / r; s.vx = s.vz = 0; }
    }
  }
}

export function addTop(w, { parts, name, human = false, spin = CFG.startSpin, x = 0, z = 0, ai = 'normal', spawn = true, skill = 0.6, aggro = 0.6 }) {
  parts = cleanParts(parts);
  const tp = {
    id: w.nextId++, name, human, parts, stats: statsOf(parts),
    x, z, vx: 0, vz: 0, spin, peak: spin, r: radiusOf(spin), mass: 1, state: spawn ? 'spawn' : 'alive', timer: spawn ? 0.6 : 0, fallY: 0, fallV: 0,
    dashT: 0, cd: 0, shield: 0, kos: 0, score: 0, lastHitBy: 0, lastHitT: -99, hitWob: 0, faceX: 0, faceZ: 1, age: 0,
    think: 0, goal: { x: 0, z: 0, dash: false }, skill, aggro, ai, noDecay: false, dmgTaken: 1,
  };
  updateMass(tp); w.tops.push(tp); emit(w, { type: 'add', id: tp.id }); return tp;
}
export function updateMass(tp) { tp.r = radiusOf(tp.spin); tp.mass = tp.r * tp.r * tp.stats.mass; }
export function removeTop(w, tp) {
  const i = w.tops.indexOf(tp); if (i < 0) return;
  w.tops.splice(i, 1); emit(w, { type: 'remove', id: tp.id });
  if (w.leader === tp.id) w.leader = null;
}
export const topById = (w, id) => w.tops.find((tp) => tp.id === id) || null;
export function spawnBot(w, { ring = -1, idle = false, spin = null, avoidPaint = null, avoid = [] } = {}) {
  const parts = randomParts(w.rng);
  if (avoidPaint && parts.paint === avoidPaint) parts.paint = PARTS.paint[(PARTS.paint.findIndex((p) => p.id === parts.paint) + 3) % PARTS.paint.length].id;
  const heat = heatOf(w), s = spin ?? Math.round(80 + w.rng() * 35 + w.rng() * Math.min(420, heat * 1.6));
  let x = 0, z = 0;
  if (ring >= 0) { const a = (ring / CFG.bots) * Math.PI * 2 + 0.3, r = 9 + (ring % 3) * 4; x = Math.cos(a) * r; z = Math.sin(a) * r; }
  else for (let k = 0; k < 20; k++) { [x, z] = randomSpot(w, R - 6); if (avoid.every((p) => Math.hypot(x - p.x, z - p.z) > 9)) break; }
  return addTop(w, { parts, name: botName(w), spin: s, x, z, ai: idle ? 'idle' : 'normal', spawn: !idle, skill: 0.35 + w.rng() * 0.6, aggro: 0.4 + w.rng() * 0.6 });
}
export function freeSpot(w, minGap = 7) { // where a newly joined human can land without being on top of someone
  let best = [0, 0], bestD = -1;
  for (let k = 0; k < 24; k++) {
    const [x, z] = randomSpot(w, R - 7), d = Math.min(99, ...w.tops.map((o) => Math.hypot(o.x - x, o.z - z) - o.r));
    if (d > bestD) { bestD = d; best = [x, z]; } if (d > minGap) break;
  }
  return best;
}

// ---------------------------------------------------------------- physics
export function dash(w, tp, dir) {
  if (tp.cd > 0 || !alive(tp)) return;
  let dx = dir.x, dz = dir.y;
  if (!dx && !dz) { const sp = Math.hypot(tp.vx, tp.vz); if (sp > 0.5) { dx = tp.vx / sp; dz = tp.vz / sp; } else { dx = tp.faceX; dz = tp.faceZ; } }
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  tp.vx += dx * CFG.dashSpeed; tp.vz += dz * CFG.dashSpeed; tp.dashT = CFG.dashTime; tp.cd = CFG.dashCooldown; tp.spin -= CFG.dashCost;
  emit(w, { type: 'dash', id: tp.id, dx, dz });
}
// Movement for one alive top: thrust, bowl pull, tilt, damping, speed cap. Also used for online client prediction.
export function integrate(w, tp, inp, dt) {
  const od = w.event?.id === 'overdrive' ? CFG.overdrive : 1;
  if (inp.x || inp.y) { tp.faceX = inp.x; tp.faceZ = inp.y; }
  const st = tp.stats, lowSpin = tp.spin < 25 ? 0.55 + 0.45 * Math.max(0, tp.spin) / 25 : 1;
  const maxV = (CFG.maxSpeed * st.spd * od * lowSpin) / (0.8 + 0.2 * tp.r), acc = CFG.accel * st.acc * od;
  tp.vx += inp.x * acc * dt; tp.vz += inp.y * acc * dt;
  const r0 = Math.hypot(tp.x, tp.z);
  if (r0 > 0.01) { const pull = CFG.bowlPull * (r0 / R); tp.vx -= (tp.x / r0) * pull * dt; tp.vz -= (tp.z / r0) * pull * dt; }
  if (w.event?.id === 'tilt') { const a = PIT_ANGLES[w.event.pit]; tp.vx += Math.cos(a) * CFG.tiltForce * dt; tp.vz += Math.sin(a) * CFG.tiltForce * dt; }
  const damp = Math.exp(-CFG.damping * dt); tp.vx *= damp; tp.vz *= damp;
  const sp = Math.hypot(tp.vx, tp.vz);
  if (tp.dashT <= 0 && sp > maxV) { const k = Math.max(maxV, sp - 30 * dt) / sp; tp.vx *= k; tp.vz *= k; }
  tp.x += tp.vx * dt; tp.z += tp.vz * dt;
  tp.dashT = Math.max(0, tp.dashT - dt); tp.cd = Math.max(0, tp.cd - dt);
}
export function walls(w, tp, predict = false) {
  const r = Math.hypot(tp.x, tp.z), lim = R - tp.r * 0.92;
  if (r <= lim) return;
  const ang = Math.atan2(tp.z, tp.x), nx = tp.x / r, nz = tp.z / r;
  if (pitAt(ang, tp.r) >= 0) { if (!predict && r > R - tp.r * 0.3) startFall(w, tp); return; }
  const vn = tp.vx * nx + tp.vz * nz;
  if (vn > 0) {
    tp.vx -= (1 + CFG.wallBounce) * vn * nx; tp.vz -= (1 + CFG.wallBounce) * vn * nz;
    if (!predict && vn > 2) { tp.spin -= CFG.wallLoss * vn; if (vn > 3) emit(w, { type: 'wall', id: tp.id, x: nx * R, z: nz * R, vn }); } // impacts cost spin; leaning on the wall does not
  }
  tp.x = nx * lim; tp.z = nz * lim;
}
function collide(w, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), minD = a.r + b.r;
  if (d >= minD || d < 1e-4) return;
  const nx = dx / d, nz = dz / d, overlap = minD - d, ima = 1 / a.mass, imb = 1 / b.mass, sum = ima + imb;
  a.x -= (nx * overlap * ima) / sum; a.z -= (nz * overlap * ima) / sum; b.x += (nx * overlap * imb) / sum; b.z += (nz * overlap * imb) / sum;
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // closing speed along the normal
  if (rel <= 0.4) return; // resting contact: no clash
  const kick = CFG.repel * (0.6 + 0.4 * Math.min(1, (a.spin + b.spin) / 400)); // spinning tops fling apart
  const j = ((1 + CFG.restitution) * rel + kick) / sum;
  a.vx -= j * ima * nx; a.vz -= j * ima * nz; b.vx += j * imb * nx; b.vz += j * imb * nz;
  const tx = -nz, tz = nx, g = CFG.grind; // clockwise spin grinds the tops sideways
  a.vx += tx * g; a.vz += tz * g; b.vx -= tx * g; b.vz -= tz * g;
  const key = a.id < b.id ? a.id * 65536 + b.id : b.id * 65536 + a.id, now = w.time;
  if (now - (w.pairHits.get(key) ?? -9) < CFG.pairCooldown) return; // still bounce, but one clash per contact
  w.pairHits.set(key, now);
  const base = CFG.clashBase + Math.max(0, rel - CFG.bumpSpeed) * CFG.clashSpeed; // slow bumps barely hurt; real hits do
  const dmgTo = (atk, def) => (def.shield > 0 ? 0 : Math.min(CFG.maxHit + def.spin * 0.08, (base * atk.stats.atk * (atk.dashT > 0 ? CFG.dashMul : 1) * Math.sqrt(atk.mass / def.mass)) / def.stats.def));
  let dA = dmgTo(b, a), dB = dmgTo(a, b);
  if (a.dashT > 0) dA *= 0.4; if (b.dashT > 0) dB *= 0.4; // the rammer wins the exchange: dash with intent
  const mercy = (tp) => (tp.spin < 60 ? 0.55 + 0.45 * (tp.spin / 60) : 1); // a low top can still claw back
  dA *= mercy(a) * a.dmgTaken; dB *= mercy(b) * b.dmgTaken;
  a.spin -= dA; b.spin -= dB;
  a.lastHitBy = b.id; a.lastHitT = now; b.lastHitBy = a.id; b.lastHitT = now;
  a.hitWob = Math.min(0.45, a.hitWob + dA * 0.012); b.hitWob = Math.min(0.45, b.hitWob + dB * 0.012);
  const cx = a.x + nx * a.r, cz = a.z + nz * a.r;
  emit(w, { type: 'clash', a: a.id, b: b.id, x: cx, z: cz, rel, heavy: rel > 9 || dA + dB > 40, aDash: a.dashT > 0, bDash: b.dashT > 0, dA, dB });
}
function collectSpark(w, tp, i) {
  const s = w.sparks[i]; s.on = false;
  tp.spin = Math.min(CFG.maxSpin, tp.spin + CFG.sparkValue * (s.big ? 2 : 1));
  tp.score += s.big ? 2 : 1;
  emit(w, { type: 'spark', i, id: tp.id, x: s.x, z: s.z, big: s.big });
}
function startFall(w, tp) {
  tp.state = 'falling'; tp.timer = 1.1; tp.fallY = bowlY(R); tp.fallV = -2;
  const sp = Math.hypot(tp.vx, tp.vz), r = Math.hypot(tp.x, tp.z); if (sp < 4) { tp.vx += (tp.x / r) * 4; tp.vz += (tp.z / r) * 4; }
  emit(w, { type: 'fall', id: tp.id });
}
function startTopple(w, tp) { tp.state = 'toppling'; tp.timer = 0.9; tp.spin = 0; emit(w, { type: 'topple', id: tp.id }); }
export function animateDying(tp, dt) { // falling / toppling motion (also used by online clients to animate mirrored tops)
  if (tp.state === 'falling') { tp.timer -= dt; tp.fallV += 22 * dt; tp.fallY -= tp.fallV * dt; tp.x += tp.vx * dt; tp.z += tp.vz * dt; }
  else if (tp.state === 'toppling') { tp.timer -= dt; const k = Math.exp(-4 * dt); tp.vx *= k; tp.vz *= k; tp.x += tp.vx * dt; tp.z += tp.vz * dt; }
}
function eliminate(w, tp, how) {
  const now = w.time, wasLeader = w.leader === tp.id, hitter = topById(w, tp.lastHitBy);
  const killer = hitter && now - tp.lastHitT < 5 && alive(hitter) ? hitter : null;
  let pts = 0;
  if (killer) {
    killer.kos++;
    pts = (how === 'ringout' ? CFG.ringoutPoints : CFG.koPoints) + Math.round(tp.peak * 0.1);
    if (wasLeader) pts *= 2;
    killer.score += pts;
    if (how === 'ringout') killer.spin = Math.min(CFG.maxSpin, killer.spin + tp.peak * CFG.ringoutSteal * 0.5 + 15);
  }
  if (how === 'topple') { // spun-out tops spill their sparks
    const n = Math.min(30, 4 + Math.round((tp.peak * CFG.toppleDrop) / CFG.sparkValue / 3));
    for (let k = 0; k < n; k++) { const a = w.rng() * Math.PI * 2, v = 2 + w.rng() * 5; addSpark(w, tp.x, tp.z, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, big: k % 5 === 0 ? 1 : 0 }); }
  }
  emit(w, { type: 'elim', id: tp.id, killer: killer?.id || 0, how, pts, wasLeader, x: tp.x, z: tp.z, peak: tp.peak, score: tp.score, kos: tp.kos });
  tp.state = 'dead';
  removeTop(w, tp);
  if (!tp.human) w.pendingRespawns.push(CFG.respawn); // the refill below brings a new bot after the delay
}

// ---------------------------------------------------------------- bots (grab sparks, hunt smaller tops toward pits, flee bigger ones)
export function botMove(w, b, dt) {
  b.think -= dt;
  if (b.think <= 0) { b.think = 0.1 + w.rng() * 0.12; decide(w, b); }
  if (b.goal.dash && b.cd <= 0) { b.goal.dash = false; dash(w, b, { x: b.goal.x, y: b.goal.z }); }
  const noise = (1 - b.skill) * 0.25;
  return norm(b.goal.x + (w.rng() * 2 - 1) * noise, b.goal.z + (w.rng() * 2 - 1) * noise);
}
function decide(w, b) {
  const r = Math.hypot(b.x, b.z), pit = nearestPit(b.x, b.z);
  const ramp = Math.min(1, 0.2 + heatOf(w) / CFG.aggroRamp), aggro = b.ai === 'passive' ? 0 : b.aggro * ramp;
  // 1. stay out of the pits: steer back to the centre when close to an opening
  if (r > R - 4.5 && pit.diff < CFG.pitHalf + 0.28) { b.goal = { x: -b.x / r, z: -b.z / r, dash: r > R - 2.5 && b.skill > 0.5 }; return; }
  let flee = null, prey = null, preyScore = 0;
  for (const o of w.tops) {
    if (o === b || !alive(o)) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z); if (d > 12) continue;
    const ratio = o.spin / Math.max(1, b.spin);
    if (ratio > 1.45 && d < 6.5 && (!flee || d < flee.d)) flee = { o, d };
    if (aggro > 0 && ratio < 0.95 && d < 9) { // only hunt tops smaller than you
      let s = (12 - d) * (1.3 - ratio) * aggro;
      if (o.human && !b.human) s *= o.age < CFG.graceTime || ratio > 0.8 ? 0 : 0.9; // a quiet start, and only clearly smaller players get hunted
      if (o.id === w.leader) s *= 1.4;
      const op = nearestPit(o.x, o.z); if (Math.hypot(o.x, o.z) > R - 7 && op.diff < 0.45) s *= 1.7; // easy ring-out
      if (o.ai === 'dummy') s = 0;
      if (s > preyScore) { preyScore = s; prey = { o, d }; }
    }
  }
  if (flee && (!prey || b.skill < 0.7 || flee.d < 4)) { // run away, but not toward a pit
    const fx = b.x - flee.o.x, fz = b.z - flee.o.z, l = Math.hypot(fx, fz) || 1;
    b.goal = { x: fx / l - (b.x / R) * 0.9, z: fz / l - (b.z / R) * 0.9, dash: flee.d < 3 && w.rng() < b.skill * 0.5 };
    return;
  }
  if (prey) { // approach from the side away from the prey's nearest pit, then charge
    const o = prey.o, op = nearestPit(o.x, o.z), px = op.x - o.x, pz = op.z - o.z, pl = Math.hypot(px, pz) || 1;
    let gx, gz;
    if (prey.d > 4.5) { gx = o.x - (px / pl) * (o.r + b.r + 1) - b.x; gz = o.z - (pz / pl) * (o.r + b.r + 1) - b.z; }
    else { gx = o.x - b.x; gz = o.z - b.z; }
    b.goal = { x: gx, z: gz, dash: prey.d < 4.2 + o.r && w.rng() < b.skill * 0.6 };
    return;
  }
  // 3. sparks: nearest one, else drift toward the middle ring
  let best = null, bd = 1e9;
  for (const s of w.sparks) { if (!s.on || s.fall > 0) continue; const d = (s.x - b.x) ** 2 + (s.z - b.z) ** 2; if (d < bd) { bd = d; best = s; } }
  if (best) b.goal = { x: best.x - b.x, z: best.z - b.z, dash: false };
  else b.goal = { x: -b.x * 0.3 + (w.rng() * 2 - 1), z: -b.z * 0.3 + (w.rng() * 2 - 1), dash: false };
  if (r > R - 2.5) { b.goal.x -= (b.x / r) * 1.5; b.goal.z -= (b.z / r) * 1.5; } // don't hug the wall
}

// ---------------------------------------------------------------- arena events (every ~40 s: Spark Storm, Arena Tilt, Overdrive)
function startEvent(w) {
  const ids = ['storm', 'tilt', 'overdrive'].filter((e) => e !== w.lastEvent), id = ids[(w.rng() * ids.length) | 0];
  w.event = { id, t: EVENT_DUR[id], dur: EVENT_DUR[id], pit: (w.rng() * CFG.pitCount) | 0, acc: 0 };
  w.lastEvent = id;
  emit(w, { type: 'event', id, pit: w.event.pit, t: w.event.t });
}
function tickEvent(w, dt) {
  const ev = w.event; ev.t -= dt;
  if (ev.id === 'storm') { ev.acc += dt * 8; while (ev.acc >= 1) { ev.acc--; const [x, z] = randomSpot(w, R * 0.75); addSpark(w, x, z, { fall: 7, big: w.rng() < 0.25 ? 1 : 0 }); } }
  if (ev.t <= 0) { emit(w, { type: 'eventEnd', id: ev.id }); w.event = null; w.nextEvent = w.time + CFG.eventEvery; }
}

// ---------------------------------------------------------------- step
export const rankList = (w) => w.tops.filter((tp) => alive(tp) || tp.state === 'spawn').sort((a, b) => b.spin - a.spin);
// inputFor(top) -> { x, y, dash } for human tops (keyboard/touch locally, the latest network message on the server)
export function step(w, dt, inputFor) {
  w.time += dt;
  updateSparks(w, dt);
  for (const tp of [...w.tops]) {
    if (tp.state === 'spawn') {
      tp.timer -= dt;
      if (tp.timer <= 0) { tp.state = 'alive'; tp.shield = CFG.shield; emit(w, { type: 'land', id: tp.id }); }
      continue;
    }
    if (tp.state === 'falling' || tp.state === 'toppling') { animateDying(tp, dt); if (tp.timer <= 0) eliminate(w, tp, tp.state === 'falling' ? 'ringout' : 'topple'); continue; }
    if (tp.state !== 'alive') continue;
    let inp = { x: 0, y: 0 };
    if (!w.frozen) {
      if (tp.human) { const i = inputFor(tp) || inp; if (i.dash) dash(w, tp, i); inp = i; }
      else if (tp.ai !== 'idle' && tp.ai !== 'dummy') inp = botMove(w, tp, dt);
      tp.age += dt; tp.shield = Math.max(0, tp.shield - dt);
    }
    integrate(w, tp, inp, dt);
    tp.hitWob = Math.max(0, tp.hitWob - dt * 0.8);
    // spin decays faster the bigger you are
    if (!w.frozen && !tp.noDecay) tp.spin -= ((CFG.decay * (1 + tp.spin * CFG.decayGrowth)) / tp.stats.sta) * (w.event?.id === 'overdrive' ? 0.5 : 1) * dt;
    if (tp.ai === 'dummy') tp.spin = Math.max(tp.spin, 1);
    tp.peak = Math.max(tp.peak, tp.spin);
    walls(w, tp);
    if (tp.state === 'alive' && tp.spin <= 0) startTopple(w, tp);
    updateMass(tp);
  }
  const T = w.tops;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (alive(T[i]) && alive(T[j])) collide(w, T[i], T[j]);
  for (let i = 0; i < w.sparks.length; i++) { // sparks: magnet + pickup
    const s = w.sparks[i]; if (!s.on || s.fall > 0) continue;
    for (const tp of T) {
      if (!alive(tp)) continue;
      const dx = tp.x - s.x, dz = tp.z - s.z, d = Math.hypot(dx, dz);
      if (d < tp.r + 0.35) { collectSpark(w, tp, i); break; }
      if (d < tp.r + CFG.magnet) { const k = (8 * dt) / Math.max(d, 0.1); s.x += dx * k; s.z += dz * k; }
    }
  }
  if (w.frozen) return;
  // keep the arena full and stocked
  for (let i = w.pendingRespawns.length - 1; i >= 0; i--) { w.pendingRespawns[i] -= dt; if (w.pendingRespawns[i] <= 0) w.pendingRespawns.splice(i, 1); }
  const bots = T.filter((tp) => !tp.human);
  if (bots.length < w.botTarget && w.pendingRespawns.length < w.botTarget - bots.length) spawnBot(w, { avoid: T.filter((tp) => tp.human) });
  w.trimT -= dt;
  if (bots.length > w.botTarget && w.trimT <= 0) { // a human joined a full room: one bot leaves per second
    w.trimT = 1; const humans = T.filter((tp) => tp.human), far = (b) => Math.min(99, ...humans.map((h) => Math.hypot(h.x - b.x, h.z - b.z)));
    const b = bots.filter(alive).sort((p, q) => far(q) - far(p))[0]; if (b) removeTop(w, b);
  }
  const active = w.sparks.reduce((n, s) => n + (s.on ? 1 : 0), 0);
  if (active < CFG.sparks && w.rng() < dt * 6) addSpark(w, ...randomSpot(w));
  w.leaderT -= dt;
  if (w.leaderT <= 0) { w.leaderT = 0.25; const lead = rankList(w)[0]?.id ?? null; if (lead !== w.leader) { w.leader = lead; emit(w, { type: 'leader', id: lead }); } }
  if (w.eventsOn) { if (w.event) tickEvent(w, dt); else if (w.time >= w.nextEvent) startEvent(w); }
}
