// Whirlbash simulation: the pure game rules, shared by the browser (solo play + online prediction) and the multiplayer
// server (mp/whirlbash.mjs). No DOM and no THREE here: step() changes the world and pushes what happened to world.events
// ({ type: 'clash' | 'dash' | 'wall' | 'land' | 'spark' | 'sparkAdd' | 'fall' | 'topple' | 'elim' | 'add' | 'remove' |
// 'event' | 'eventEnd' | 'leader' | 'puAdd' | 'puTake' | 'puGone' | 'puExpire' | 'puUse' | 'fxEnd' | 'blast' | 'decoyPop' |
// 'boss' | 'bossLeave' | 'split' | 'pull' | 'win' | 'teamWin', ... }); the view (game.js) turns those into particles, sounds and HUD updates.

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
  // perfect dash: a hit early in the dash (from point blank) lands harder and scores a little
  perfectFrac: 0.62, perfectRel: 11, perfectMul: 1.35, perfectPoints: 5,
  // skill power-ups: an orb drops every ~powerEvery s; picking one up gives you powerHold s to use it, or it is lost
  powerFirst: 12, powerEvery: 11, powerMax: 3, powerLife: 22, powerHold: 10, pickup: 0.9,
  blastRadius: 7, blastPush: 11, blastDmg: 7, shieldTime: 3.5, shieldMass: 2.5, magnetTime: 6, magnetRadius: 9, turboTime: 4.5, turboSpeed: 1.45, turboDashCd: 0.5,
  anchorTime: 4, anchorMass: 8, anchorSpeed: 0.7, decoyTime: 6, decoyPopR: 3.5, decoyPopPush: 7,
  // turntable arena: riding the centre disc slowly recharges spin
  turnRecharge: 2.5,
  // the Champion: a boss top that enters endless matches; it leaves again after bossStay s if nobody beats it
  bossFirst: 150, bossEvery: 170, bossSpin: 520, bossStay: 100, bossPoints: 250, bossSlam: 6.5,
  // Last Top Spinning: no respawns; the safe zone closes in and spin drains fast outside it
  zoneStart: 20, zoneShrink: 90, zoneMid: 7, zoneEnd: 35, zoneDrain: 9,
  // the Magnetar (the second boss): every pullEvery s it pulls tops and sparks in for pullTime s
  pullEvery: 7, pullTime: 2.2, pullRadius: 11, pullForce: 13,
  // Teams: two teams of six, a timed round, knockout points go to the team
  teamRound: 180,
  // a new player's first seconds: the pits act as walls (a safety net), and bots go easy on a small newcomer
  spawnNet: 8, newcomer: 60,
  // Sinkhole (arena event): the centre caves in after a sinkWarn s warning and swallows whoever is on it
  sinkR: 3.6, sinkWarn: 3,
  // the Twinspin (the third boss) splits into two smaller twins the first time its spin halves
  splitAt: 0.5, twinPoints: 0.6,
};
export const POWERS = ['blast', 'shield', 'magnet', 'turbo', 'anchor', 'decoy'];
export const FX_CODE = { shield: 1, magnet: 2, turbo: 3, anchor: 4 }; // lasting effects (a blast and a decoy are instant)
const FX_TIME = { shield: CFG.shieldTime, magnet: CFG.magnetTime, turbo: CFG.turboTime, anchor: CFG.anchorTime };
export const R = CFG.arenaR;
export const pitAngles = (n) => Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * Math.PI * 2) / n + Math.PI / n);
export const PIT_ANGLES = pitAngles(CFG.pitCount);
export const EVENT_DUR = { storm: 6, tilt: 7, overdrive: 8, sink: 9 };
export const sinkOpen = (w) => w.event?.id === 'sink' && w.event.t <= w.event.dur - CFG.sinkWarn; // the hole is open (after the warning)

// ---------------------------------------------------------------- arenas (same bowl, different rules)
export const ARENAS = {
  bowl: { pits: 3, pitHalf: CFG.pitHalf },
  turntable: { pits: 3, pitHalf: CFG.pitHalf, turnR: 7.5, turnW: 0.6, pillars: 3, pillarR: 1.25, pillarAt: 14.5 }, // spinning centre disc + bumper pillars
  shutter: { pits: 6, pitHalf: 0.15, shutEvery: 9, shutWarn: 2 }, // six pits, three open at a time, swapping every shutEvery s
  orbit: { pits: 3, pitHalf: 0.17, pitSpin: 0.1 }, // the pits (and their walls) travel round the rim: one lap a minute
};
export const ARENA_IDS = Object.keys(ARENAS);
export const MODES = ['endless', 'last', 'teams'];
// Weekly rule change for Endless (solo and online agree, because it only depends on the date): a new twist every Monday
export const MUTATORS = ['rush', 'overdrive', 'bosses', 'frenzy'];
export const weekMutator = (now = Date.now()) => MUTATORS[Math.floor((now / 86_400_000 + 3) / 7) % MUTATORS.length]; // day 0 was a Thursday: +3 starts weeks on Monday
export const pitAng = (w, i) => w.pits[i] + (w.arena.pitSpin || 0) * w.time; // where pit i is right now
export const pitOpen = (w, i) => !w.arena.shutEvery || (Math.floor(w.time / w.arena.shutEvery) + i) % 2 === 0;
export const shutterLeft = (w) => (w.arena.shutEvery ? w.arena.shutEvery - (w.time % w.arena.shutEvery) : 99); // seconds until the pits swap
export function zoneR(w) { // Last Top Spinning: radius of the safe zone (99 = no zone)
  if (w.mode !== 'last') return 99;
  const t = w.time - CFG.zoneStart; if (t <= 0) return R + 2;
  if (t < CFG.zoneShrink) return R + 2 + (CFG.zoneMid - R - 2) * (t / CFG.zoneShrink);
  return Math.max(0, CFG.zoneMid * (1 - (t - CFG.zoneShrink) / CFG.zoneEnd));
}

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
    { id: 'ruby', lvl: 6, c: '#e8234f' }, { id: 'jade', lvl: 9, c: '#14b892' }, { id: 'aurora', lvl: 15, c: '#ff7ce0' }, // earned by levelling up, never bought
    { id: 'nova', season: 20, c: '#5ee7ff' }, // the season track's last reward
    { id: 'champ', hidden: true, c: '#2e2a5c' }, { id: 'magnetar', hidden: true, c: '#4b2a86' }, { id: 'twins', hidden: true, c: '#127a6b' }, // the bosses' own colours: no player can wear them
  ],
  trail: [ // cosmetic only: sparks left behind while moving, also the colour of your dash burst
    { id: 'none', cost: 0, c: [] }, { id: 'sparkle', cost: 150, c: ['#ffe066', '#ffffff'] }, { id: 'bubble', cost: 250, c: ['#ff7ce0', '#c27bff'] },
    { id: 'frost', cost: 350, c: ['#9ee7ff', '#ffffff'] }, { id: 'flame', lvl: 11, c: ['#ff8a3d', '#ffc531', '#ff5d73'] },
    { id: 'rainbow', lvl: 14, c: ['#ff5d73', '#ff8a3d', '#ffc531', '#3ee0a1', '#4cb8ff', '#a77bff'] },
    { id: 'comet', season: 10, c: ['#ffffff', '#9ee7ff', '#a77bff'] },
  ],
};
export const PART_KINDS = ['crown', 'core', 'tip', 'paint', 'trail'];
// Player names are picked from these words (adjective + noun + optional number), never typed, so nothing needs moderation.
export const NAME_A = ['Swift', 'Brave', 'Lucky', 'Mighty', 'Rapid', 'Sunny', 'Cosmic', 'Turbo', 'Jolly', 'Nimble', 'Zippy', 'Clever', 'Bouncy', 'Breezy', 'Steady', 'Daring',
  'Golden', 'Silver', 'Shiny', 'Fuzzy', 'Happy', 'Mega', 'Super', 'Tiny', 'Giant', 'Electric', 'Frosty', 'Blazing', 'Sneaky', 'Wild', 'Royal', 'Neon'];
export const NAME_B = ['Comet', 'Falcon', 'Otter', 'Rocket', 'Panda', 'Tiger', 'Pixel', 'Rider', 'Gecko', 'Koala', 'Badger', 'Meteor', 'Fox', 'Whale', 'Lynx', 'Orbit',
  'Dragon', 'Spinner', 'Cyclone', 'Twister', 'Wizard', 'Ninja', 'Knight', 'Pilot', 'Robot', 'Star', 'Storm', 'Bolt', 'Puma', 'Hawk', 'Shark', 'Yeti'];
export function isPickedName(n) { // a name made of the two word lists and an optional number from 1 to 99
  const m = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9][0-9]?)?$/.exec(String(n || ''));
  return !!m && NAME_A.includes(m[1]) && NAME_B.includes(m[2]);
}
export const part = (kind, id) => PARTS[kind].find((p) => p.id === id) || PARTS[kind][0];
export function cleanParts(p) { // whatever a client sends, only known, wearable part ids survive
  const out = {};
  for (const kind of PART_KINDS) { const q = part(kind, p?.[kind]); out[kind] = q.hidden ? PARTS[kind][0].id : q.id; }
  return out;
}
export function statsOf(p) {
  const c = part('crown', p.crown), k = part('core', p.core), tp = part('tip', p.tip);
  return { atk: c.atk, def: c.def, mass: k.mass, sta: k.sta * tp.sta, spd: c.spd * k.spd * tp.spd, acc: tp.acc };
}
export function randomParts(rng = Math.random) {
  const pick = (list) => { list = list.filter((p) => !p.hidden); return list[(rng() * list.length) | 0].id; };
  return { crown: pick(PARTS.crown), core: pick(PARTS.core), tip: pick(PARTS.tip), paint: pick(PARTS.paint), trail: rng() < 0.2 ? pick(PARTS.trail) : 'none' };
}

// ---------------------------------------------------------------- geometry helpers
export const radiusOf = (spin) => 0.55 + 0.45 * Math.sqrt(Math.max(0, spin) / 100);
export const bowlY = (r) => CFG.bowlLift * Math.min(1, (r / R) ** 2);
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function pitAt(w, ang, rad) {
  const half = Math.max(0.05, w.arena.pitHalf - (rad / R) * 0.55);
  for (let i = 0; i < w.pits.length; i++) if (pitOpen(w, i) && Math.abs(angDiff(ang, pitAng(w, i))) < half) return i;
  return -1;
}
export function nearestPit(w, x, z) { // the nearest open pit
  const ang = Math.atan2(z, x); let best = 0, bd = 9;
  w.pits.forEach((p, i) => { if (!pitOpen(w, i)) return; const d = Math.abs(angDiff(ang, pitAng(w, i))); if (d < bd) { bd = d; best = i; } });
  const a = pitAng(w, best);
  return { i: best, ang: a, diff: bd, x: Math.cos(a) * R, z: Math.sin(a) * R };
}
const norm = (x, z) => { const l = Math.hypot(x, z); return l > 1e-3 ? { x: x / l, y: z / l } : { x: 0, y: 0 }; };
export const alive = (tp) => tp.state === 'alive';
export const isDecoy = (tp) => tp.ai === 'decoy';
export const sameTeam = (a, b) => a.team != null && a.team === b.team;

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
export function createWorld({ bots = CFG.bots, rng = Math.random, sparks = CFG.sparks, arena = 'bowl', mode = 'endless', mutator = null } = {}) {
  const arenaId = ARENAS[arena] ? arena : 'bowl', def = ARENAS[arenaId], pits = pitAngles(def.pits);
  const pillars = Array.from({ length: def.pillars || 0 }, (_, i) => { const a = pits[i % pits.length] + Math.PI / def.pits; return { x: Math.cos(a) * def.pillarAt, z: Math.sin(a) * def.pillarAt, r: def.pillarR }; });
  if (!MODES.includes(mode)) mode = 'endless';
  const w = {
    tops: [], sparks: [], time: 0, nextId: 1, events: [], pairHits: new Map(), pendingRespawns: [], rng,
    botTarget: bots, event: null, nextEvent: CFG.eventFirst, lastEvent: '', eventsOn: true, frozen: false,
    leader: null, leaderT: 0, heat: null, trimT: 0,
    powerups: [], powerT: CFG.powerFirst, nextPu: 1, powersOn: true,
    arenaId, arena: def, pits, pillars, mode, respawns: mode !== 'last', bossOn: mode === 'endless', bossAt: CFG.bossFirst, bossCount: 0, over: false,
    teamScore: [0, 0], roundEnd: mode === 'teams' ? CFG.teamRound : 0,
    mut: mode === 'endless' && MUTATORS.includes(mutator) ? mutator : null, bossEvery: CFG.bossEvery, bossStay: CFG.bossStay, powerEvery: CFG.powerEvery, powerMax: CFG.powerMax, sparkTarget: CFG.sparks,
  };
  if (w.mut === 'bosses') { w.bossAt = 45; w.bossEvery = 60; w.bossStay = 60; } // Boss Rush: they come early and often, and stay a shorter time
  if (w.mut === 'frenzy') { w.powerEvery = 4; w.powerMax = 5; w.powerT = 4; } // Power Frenzy
  if (w.mut === 'rush') { w.sparkTarget = Math.round(CFG.sparks * 1.3); sparks = Math.round(sparks * 1.3); } // Spark Rush
  for (let i = 0; i < CFG.sparkMax; i++) w.sparks.push({ on: false, x: 0, z: 0, y: 0.4, vx: 0, vz: 0, fall: 0, ph: rng() * 6, big: 0 });
  for (let i = 0; i < sparks; i++) addSpark(w, ...randomSpot(w));
  return w;
}
const emit = (w, e) => { w.events.push(e); };
const heatOf = (w) => (w.heat ? w.heat(w) : w.time); // how far the match has escalated (solo: run time; server: players' time alive)
const spotR = (w, maxR) => Math.max(2, Math.min(maxR, zoneR(w) - 1.5)); // Last Top Spinning: keep new sparks and orbs inside the safe zone
export function randomSpot(w, maxR = R - 1.8) { const a = w.rng() * Math.PI * 2, r = Math.sqrt(w.rng()) * spotR(w, maxR); return [Math.cos(a) * r, Math.sin(a) * r]; }
function outsidePillars(w, x, z, pad) { // nudge a point out of any pillar
  for (const p of w.pillars) { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; if (d < p.r + pad) { x = p.x + (dx / d) * (p.r + pad); z = p.z + (dz / d) * (p.r + pad); } }
  return [x, z];
}
export function addSpark(w, x, z, { vx = 0, vz = 0, fall = 0, big = 0 } = {}) {
  const i = w.sparks.findIndex((q) => !q.on); if (i < 0) return -1;
  const r = Math.hypot(x, z), lim = R - 1.2; if (r > lim) { x *= lim / r; z *= lim / r; }
  if (w.pillars.length) [x, z] = outsidePillars(w, x, z, 0.5);
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

export function addTop(w, { parts, name, human = false, spin = CFG.startSpin, x = 0, z = 0, ai = 'normal', spawn = true, skill = 0.6, aggro = 0.6, team = null }) {
  parts = cleanParts(parts);
  const tp = {
    id: w.nextId++, name, human, parts, stats: statsOf(parts),
    x, z, vx: 0, vz: 0, spin, peak: spin, r: radiusOf(spin), mass: 1, state: spawn ? 'spawn' : 'alive', timer: spawn ? 0.6 : 0, fallY: 0, fallV: 0,
    dashT: 0, cd: 0, shield: 0, kos: 0, score: 0, lastHitBy: 0, lastHitT: -99, hitWob: 0, faceX: 0, faceZ: 1, age: 0,
    think: 0, goal: { x: 0, z: 0, dash: false, use: false }, skill, aggro, ai, noDecay: false, dmgTaken: 1,
    power: null, fx: null, // power: a held skill { kind, t } (t counts down to loss); fx: an active effect { kind, t }
    team: w.mode === 'teams' ? team ?? smallerTeam(w) : null,
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
export function smallerTeam(w) { // new tops join the team with fewer members
  const n = [0, 0]; for (const tp of w.tops) if (tp.team != null && !isDecoy(tp)) n[tp.team]++;
  return n[1] < n[0] ? 1 : 0;
}
export function spawnBot(w, { ring = -1, idle = false, spin = null, avoidPaint = null, avoid = [] } = {}) {
  const parts = randomParts(w.rng);
  if (avoidPaint && parts.paint === avoidPaint) parts.paint = PARTS.paint[(PARTS.paint.findIndex((p) => p.id === parts.paint) + 3) % 8].id;
  const heat = heatOf(w), s = spin ?? Math.round(80 + w.rng() * 35 + w.rng() * Math.min(420, heat * 1.6));
  let x = 0, z = 0;
  if (ring >= 0) { const a = (ring / CFG.bots) * Math.PI * 2 + 0.3, r = 9 + (ring % 3) * 4; [x, z] = outsidePillars(w, Math.cos(a) * r, Math.sin(a) * r, 1.5); }
  else for (let k = 0; k < 20; k++) { [x, z] = randomSpot(w, R - 6); if (avoid.every((p) => Math.hypot(x - p.x, z - p.z) > 9) && w.pillars.every((p) => Math.hypot(x - p.x, z - p.z) > p.r + 1.5)) break; }
  return addTop(w, { parts, name: botName(w), spin: s, x, z, ai: idle ? 'idle' : 'normal', spawn: !idle, skill: 0.35 + w.rng() * 0.6, aggro: 0.4 + w.rng() * 0.6 });
}
export function freeSpot(w, minGap = 7) { // where a newly joined human (or the Champion) can land without being on top of someone
  let best = [0, 0], bestD = -1;
  for (let k = 0; k < 24; k++) {
    const [x, z] = randomSpot(w, R - 7), d = Math.min(99, ...w.tops.map((o) => Math.hypot(o.x - x, o.z - z) - o.r), ...w.pillars.map((p) => Math.hypot(p.x - x, p.z - z) - p.r));
    if (d > bestD) { bestD = d; best = [x, z]; } if (d > minGap) break;
  }
  return best;
}
export const BOSSES = ['champion', 'magnetar', 'twins']; // they take turns: the Champion slams, the Magnetar pulls everything in, the Twinspin splits in two
const BOSS_LOOK = {
  champion: { parts: { crown: 'razor', core: 'iron', tip: 'needle' }, name: 'Champion', spin: 1, stats: { atk: 1.25, def: 1.5, mass: 1.7, sta: 2.2, spd: 0.92, acc: 0.85 } },
  magnetar: { parts: { crown: 'comet', core: 'heart', tip: 'glide' }, name: 'Magnetar', spin: 0.9, stats: { atk: 1.1, def: 1.35, mass: 1.6, sta: 2.2, spd: 1, acc: 0.9 } },
  twins: { parts: { crown: 'bastion', core: 'heart', tip: 'grip' }, name: 'Twinspin', spin: 0.95, stats: { atk: 1.15, def: 1.3, mass: 1.5, sta: 2.2, spd: 1.02, acc: 0.95 } },
};
const BOSS_PAINT = { champion: 'champ', magnetar: 'magnetar', twins: 'twins' };
export function spawnBoss(w, kind = BOSSES[w.bossCount % BOSSES.length]) {
  const heat = heatOf(w), [x, z] = freeSpot(w, 8), L = BOSS_LOOK[kind] || BOSS_LOOK.champion;
  const tp = addTop(w, { parts: L.parts, name: L.name, spin: Math.round(Math.min(900, CFG.bossSpin * L.spin + heat * 0.6)), x, z, ai: 'boss', skill: 0.92, aggro: 1 });
  tp.boss = true; tp.bossKind = kind; tp.parts.paint = BOSS_PAINT[kind]; tp.stats = { ...L.stats };
  tp.slamT = 4; tp.pullT = 4; tp.pulling = 0; tp.bossT = w.bossStay; tp.canSplit = kind === 'twins'; updateMass(tp); w.bossCount++;
  emit(w, { type: 'boss', id: tp.id, kind });
  return tp;
}
function splitTwins(w, b) { // the Twinspin halves: a twin rolls off the other way with the same spin and the time it has left
  b.canSplit = false;
  const a = w.rng() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), off = b.r * 1.2;
  const twin = addTop(w, { parts: b.parts, name: b.name, spin: b.spin, x: b.x + c * off, z: b.z + s * off, ai: 'boss', spawn: false, skill: 0.92, aggro: 1 });
  Object.assign(twin, { boss: true, bossKind: 'twins', stats: { ...b.stats }, slamT: 4, pullT: 4, pulling: 0, bossT: b.bossT, canSplit: false, shield: 0.6 });
  twin.parts.paint = BOSS_PAINT.twins; b.shield = 0.6;
  b.x -= c * off; b.z -= s * off; b.vx -= c * 9; b.vz -= s * 9; twin.vx = c * 9; twin.vz = s * 9;
  updateMass(b); updateMass(twin);
  emit(w, { type: 'split', id: b.id, twin: twin.id, x: (b.x + twin.x) / 2, z: (b.z + twin.z) / 2 });
}
function tickMagnetar(w, b, dt) { // every pullEvery s: a pullTime s tug on every top and spark within reach
  if (b.pulling > 0) {
    b.pulling -= dt;
    for (const o of w.tops) {
      if (o === b || !alive(o) || (o.human && o.age < CFG.graceTime) || o.fx?.kind === 'anchor') continue;
      const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz); if (d > CFG.pullRadius || d < 0.5) continue;
      const k = (CFG.pullForce * (1 - d / CFG.pullRadius) * dt) / Math.sqrt(o.stats.mass); o.vx += (dx / d) * k; o.vz += (dz / d) * k;
    }
    for (const s of w.sparks) { if (!s.on || s.fall > 0) continue; const dx = b.x - s.x, dz = b.z - s.z, d = Math.hypot(dx, dz); if (d < CFG.pullRadius && d > 0.3) { const k = Math.min(1, (6 * dt) / d); s.x += dx * k; s.z += dz * k; } }
    if (b.pulling <= 0) emit(w, { type: 'pull', id: b.id, on: false });
  } else if ((b.pullT -= dt) <= 0) { b.pullT = CFG.pullEvery; b.pulling = CFG.pullTime; emit(w, { type: 'pull', id: b.id, on: true }); }
}

// ---------------------------------------------------------------- physics
export function dash(w, tp, dir) {
  if (tp.cd > 0 || !alive(tp)) return;
  let dx = dir.x, dz = dir.y;
  if (!dx && !dz) { const sp = Math.hypot(tp.vx, tp.vz); if (sp > 0.5) { dx = tp.vx / sp; dz = tp.vz / sp; } else { dx = tp.faceX; dz = tp.faceZ; } }
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  tp.vx += dx * CFG.dashSpeed; tp.vz += dz * CFG.dashSpeed; tp.dashT = CFG.dashTime; tp.cd = tp.fx?.kind === 'turbo' ? CFG.turboDashCd : CFG.dashCooldown; tp.spin -= CFG.dashCost;
  emit(w, { type: 'dash', id: tp.id, dx, dz });
}
// Movement for one alive top: thrust, bowl pull, turntable, tilt, damping, speed cap. Also used for online client prediction.
export function integrate(w, tp, inp, dt) {
  const od = w.event?.id === 'overdrive' ? CFG.overdrive : w.mut === 'overdrive' ? 1.2 : 1; // Overdrive week: always a bit faster
  if (inp.x || inp.y) { tp.faceX = inp.x; tp.faceZ = inp.y; }
  const st = tp.stats, lowSpin = tp.spin < 25 ? 0.55 + 0.45 * Math.max(0, tp.spin) / 25 : 1;
  const fx = tp.fx?.kind, turbo = fx === 'turbo' ? CFG.turboSpeed : 1, anchored = fx === 'anchor';
  const maxV = (CFG.maxSpeed * st.spd * od * lowSpin * turbo * (anchored ? CFG.anchorSpeed : 1)) / (0.8 + 0.2 * tp.r), acc = CFG.accel * st.acc * od * (turbo > 1 ? 1.3 : 1);
  tp.vx += inp.x * acc * dt; tp.vz += inp.y * acc * dt;
  const r0 = Math.hypot(tp.x, tp.z);
  if (!anchored) { // an anchored top ignores the bowl, the tilt and the turntable
    if (r0 > 0.01) { const pull = CFG.bowlPull * (r0 / R); tp.vx -= (tp.x / r0) * pull * dt; tp.vz -= (tp.z / r0) * pull * dt; }
    if (w.event?.id === 'tilt') { const a = w.event.ang ?? w.pits[w.event.pit] ?? 0; tp.vx += Math.cos(a) * CFG.tiltForce * dt; tp.vz += Math.sin(a) * CFG.tiltForce * dt; }
    const A = w.arena; if (A.turnR && r0 < A.turnR) { tp.vx -= tp.z * A.turnW * 1.4 * dt; tp.vz += tp.x * A.turnW * 1.4 * dt; } // the disc carries you round (counter-clockwise from above)
  }
  const damp = Math.exp(-CFG.damping * dt); tp.vx *= damp; tp.vz *= damp;
  const sp = Math.hypot(tp.vx, tp.vz);
  if (tp.dashT <= 0 && sp > maxV) { const k = Math.max(maxV, sp - 30 * dt) / sp; tp.vx *= k; tp.vz *= k; }
  tp.x += tp.vx * dt; tp.z += tp.vz * dt;
  tp.dashT = Math.max(0, tp.dashT - dt); tp.cd = Math.max(0, tp.cd - dt);
}
function bounce(w, tp, nx, nz, vn, at, predict) { // vn: speed into the surface along the inward normal (nx, nz)
  tp.vx -= (1 + CFG.wallBounce) * vn * nx; tp.vz -= (1 + CFG.wallBounce) * vn * nz;
  if (!predict && vn > 2) { tp.spin -= CFG.wallLoss * vn; if (vn > 3) emit(w, { type: 'wall', id: tp.id, x: at[0], z: at[1], vn }); } // impacts cost spin; leaning on the wall does not
}
export function walls(w, tp, predict = false) {
  for (const p of w.pillars) { // bumper pillars (turntable arena)
    const dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz), min = p.r + tp.r * 0.9;
    if (d >= min || d < 1e-4) continue;
    const nx = -dx / d, nz = -dz / d, vn = tp.vx * nx + tp.vz * nz;
    if (vn > 0) bounce(w, tp, nx, nz, vn, [p.x - nx * p.r, p.z - nz * p.r], predict);
    tp.x = p.x - nx * min; tp.z = p.z - nz * min;
  }
  const r = Math.hypot(tp.x, tp.z), lim = R - tp.r * 0.92;
  if (r <= lim) return;
  const ang = Math.atan2(tp.z, tp.x), nx = tp.x / r, nz = tp.z / r;
  if (pitAt(w, ang, tp.r) >= 0 && !(tp.human && tp.age < CFG.spawnNet)) { if (!predict && r > R - tp.r * 0.3) startFall(w, tp); return; } // a newcomer bounces off the pits
  const vn = tp.vx * nx + tp.vz * nz;
  if (vn > 0) bounce(w, tp, nx, nz, vn, [nx * R, nz * R], predict);
  tp.x = nx * lim; tp.z = nz * lim;
}
const heavy = (tp) => tp.mass * (tp.fx?.kind === 'shield' ? CFG.shieldMass : tp.fx?.kind === 'anchor' ? CFG.anchorMass : 1); // shielded / anchored tops are hard to push
function collide(w, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), minD = a.r + b.r;
  if (d >= minD || d < 1e-4) return;
  const nx = dx / d, nz = dz / d, overlap = minD - d, ima = 1 / heavy(a), imb = 1 / heavy(b), sum = ima + imb;
  a.x -= (nx * overlap * ima) / sum; a.z -= (nz * overlap * ima) / sum; b.x += (nx * overlap * imb) / sum; b.z += (nz * overlap * imb) / sum;
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // closing speed along the normal
  if (rel <= 0.4) return; // resting contact: no clash
  const kick = CFG.repel * (0.6 + 0.4 * Math.min(1, (a.spin + b.spin) / 400)); // spinning tops fling apart
  const j = ((1 + CFG.restitution) * rel + kick) / sum;
  a.vx -= j * ima * nx; a.vz -= j * ima * nz; b.vx += j * imb * nx; b.vz += j * imb * nz;
  const tx = -nz, tz = nx, g = CFG.grind; // clockwise spin grinds the tops sideways
  a.vx += tx * g; a.vz += tz * g; b.vx -= tx * g; b.vz -= tz * g;
  if (isDecoy(a) || isDecoy(b)) { // a decoy bursts at the first touch of anyone but its owner (or the owner's team), and hurts nobody
    const dc = isDecoy(a) ? a : b, other = dc === a ? b : a;
    if (other.id !== dc.decoyOf && !isDecoy(other) && !sameTeam(other, dc)) popDecoy(w, dc, other);
    return;
  }
  if (sameTeam(a, b)) return; // teammates bounce off each other but never hurt each other
  const key = a.id < b.id ? a.id * 65536 + b.id : b.id * 65536 + a.id, now = w.time;
  if (now - (w.pairHits.get(key) ?? -9) < CFG.pairCooldown) return; // still bounce, but one clash per contact
  w.pairHits.set(key, now);
  const base = CFG.clashBase + Math.max(0, rel - CFG.bumpSpeed) * CFG.clashSpeed; // slow bumps barely hurt; real hits do
  const perfect = (tp) => tp.human && tp.dashT > CFG.dashTime * CFG.perfectFrac && rel > CFG.perfectRel; // a player's full-speed charge from point blank
  const dmgTo = (atk, def) => (def.shield > 0 || def.fx?.kind === 'shield' ? 0 : Math.min(CFG.maxHit + def.spin * 0.08, (base * atk.stats.atk * (atk.dashT > 0 ? CFG.dashMul : 1) * (perfect(atk) ? CFG.perfectMul : 1) * Math.sqrt(atk.mass / def.mass)) / def.stats.def));
  let dA = dmgTo(b, a), dB = dmgTo(a, b);
  if (a.dashT > 0) dA *= 0.4; if (b.dashT > 0) dB *= 0.4; // the rammer wins the exchange: dash with intent
  const mercy = (tp) => (tp.spin < 60 ? 0.55 + 0.45 * (tp.spin / 60) : 1); // a low top can still claw back
  dA *= mercy(a) * a.dmgTaken; dB *= mercy(b) * b.dmgTaken;
  a.spin -= dA; b.spin -= dB;
  const aPerf = perfect(a) && dB > 1, bPerf = perfect(b) && dA > 1;
  if (aPerf) a.score += CFG.perfectPoints; if (bPerf) b.score += CFG.perfectPoints;
  a.lastHitBy = b.id; a.lastHitT = now; b.lastHitBy = a.id; b.lastHitT = now;
  a.hitWob = Math.min(0.45, a.hitWob + dA * 0.012); b.hitWob = Math.min(0.45, b.hitWob + dB * 0.012);
  const cx = a.x + nx * a.r, cz = a.z + nz * a.r;
  emit(w, { type: 'clash', a: a.id, b: b.id, x: cx, z: cz, rel, heavy: rel > 9 || dA + dB > 40, aDash: a.dashT > 0, bDash: b.dashT > 0, dA, dB, aPerf, bPerf });
}
function collectSpark(w, tp, i) {
  const s = w.sparks[i]; s.on = false;
  tp.spin = Math.min(CFG.maxSpin, tp.spin + CFG.sparkValue * (s.big ? 2 : 1) * (w.mut === 'rush' ? 1.5 : 1));
  tp.score += s.big ? 2 : 1;
  emit(w, { type: 'spark', i, id: tp.id, x: s.x, z: s.z, big: s.big });
}
function startFall(w, tp, sink = false) { // sink: into the Sinkhole in the middle, straight down
  const r = Math.hypot(tp.x, tp.z);
  tp.state = 'falling'; tp.timer = 1.1; tp.fallY = bowlY(r); tp.fallV = -2;
  if (sink) { tp.vx *= 0.2; tp.vz *= 0.2; }
  else { const sp = Math.hypot(tp.vx, tp.vz); if (sp < 4) { tp.vx += (tp.x / r) * 4; tp.vz += (tp.z / r) * 4; } }
  emit(w, { type: 'fall', id: tp.id });
}
function startTopple(w, tp) { tp.state = 'toppling'; tp.timer = 0.9; tp.spin = 0; emit(w, { type: 'topple', id: tp.id }); }
export function animateDying(tp, dt) { // falling / toppling motion (also used by online clients to animate mirrored tops)
  if (tp.state === 'falling') { tp.timer -= dt; tp.fallV += 22 * dt; tp.fallY -= tp.fallV * dt; tp.x += tp.vx * dt; tp.z += tp.vz * dt; }
  else if (tp.state === 'toppling') { tp.timer -= dt; const k = Math.exp(-4 * dt); tp.vx *= k; tp.vz *= k; tp.x += tp.vx * dt; tp.z += tp.vz * dt; }
}
function eliminate(w, tp, how) {
  if (isDecoy(tp)) { emit(w, { type: 'decoyPop', id: tp.id, owner: tp.decoyOf, by: 0, x: tp.x, z: tp.z }); tp.state = 'dead'; removeTop(w, tp); return; }
  const now = w.time, wasLeader = w.leader === tp.id, hitter = topById(w, tp.lastHitBy);
  const killer = hitter && now - tp.lastHitT < 5 && alive(hitter) && !isDecoy(hitter) ? hitter : null;
  let pts = 0;
  if (killer) {
    killer.kos++;
    pts = (how === 'ringout' ? CFG.ringoutPoints : CFG.koPoints) + Math.round(tp.peak * 0.1) + (tp.boss ? Math.round(CFG.bossPoints * (tp.bossKind === 'twins' ? CFG.twinPoints : 1)) : 0);
    if (wasLeader) pts *= 2;
    killer.score += pts;
    if (killer.team != null) w.teamScore[killer.team] += pts;
    if (how === 'ringout') killer.spin = Math.min(CFG.maxSpin, killer.spin + tp.peak * CFG.ringoutSteal * 0.5 + 15);
  }
  if (how === 'topple') { // spun-out tops spill their sparks
    const n = Math.min(tp.boss ? 45 : 30, 4 + Math.round((tp.peak * CFG.toppleDrop) / CFG.sparkValue / 3));
    for (let k = 0; k < n; k++) { const a = w.rng() * Math.PI * 2, v = 2 + w.rng() * 5; addSpark(w, tp.x, tp.z, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, big: k % 5 === 0 ? 1 : 0 }); }
  }
  if (tp.boss) w.bossAt = heatOf(w) + w.bossEvery;
  emit(w, { type: 'elim', id: tp.id, killer: killer?.id || 0, how, pts, wasLeader, boss: tp.bossKind || false, x: tp.x, z: tp.z, peak: tp.peak, score: tp.score, kos: tp.kos });
  tp.state = 'dead';
  removeTop(w, tp);
  if (!tp.human && !tp.boss && w.respawns) w.pendingRespawns.push(CFG.respawn); // the refill below brings a new bot after the delay
}

// ---------------------------------------------------------------- skill power-ups (Blast, Shield, Magnet, Turbo, Anchor, Decoy)
export function spawnPowerup(w, kind = POWERS[(w.rng() * POWERS.length) | 0], at = null) {
  const [x, z] = at || randomSpot(w, R - 5);
  const pu = { id: w.nextPu++, kind, x, z, t: CFG.powerLife };
  w.powerups.push(pu); emit(w, { type: 'puAdd', id: pu.id, kind, x, z }); return pu;
}
function popDecoy(w, d, by = null) {
  if (d.state === 'dead') return;
  for (const o of w.tops) { // a little puff that shoves whoever fell for it
    if (o === d || !alive(o) || o.id === d.decoyOf || isDecoy(o) || sameTeam(o, d)) continue;
    const dx = o.x - d.x, dz = o.z - d.z, dist = Math.hypot(dx, dz), reach = CFG.decoyPopR + o.r;
    if (dist > reach || dist < 1e-3) continue;
    const k = 1 - dist / reach, push = (CFG.decoyPopPush * k) / Math.sqrt(o.stats.mass);
    o.vx += (dx / dist) * push; o.vz += (dz / dist) * push; o.hitWob = Math.min(0.45, o.hitWob + 0.25 * k);
  }
  emit(w, { type: 'decoyPop', id: d.id, owner: d.decoyOf, by: by?.id || 0, x: d.x, z: d.z });
  d.state = 'dead'; removeTop(w, d);
}
export function usePower(w, tp) {
  const kind = tp.power?.kind; if (!kind || !alive(tp)) return;
  tp.power = null;
  if (kind === 'blast') { // instant: every top in range is flung away and loses a little spin
    const popped = [];
    for (const o of w.tops) {
      if (o === tp || !alive(o) || sameTeam(o, tp)) continue;
      const dx = o.x - tp.x, dz = o.z - tp.z, d = Math.hypot(dx, dz), reach = CFG.blastRadius + o.r;
      if (d > reach || d < 1e-3) continue;
      if (isDecoy(o)) { if (o.decoyOf !== tp.id) popped.push(o); continue; }
      const k = 1 - d / reach, push = (CFG.blastPush * k) / Math.sqrt(heavy(o) / o.r / o.r);
      o.vx += (dx / d) * push; o.vz += (dz / d) * push; o.hitWob = Math.min(0.45, o.hitWob + 0.3 * k);
      if (o.shield <= 0 && o.fx?.kind !== 'shield') o.spin -= CFG.blastDmg * k * tp.stats.atk;
      o.lastHitBy = tp.id; o.lastHitT = w.time;
    }
    for (const o of popped) popDecoy(w, o, tp);
    emit(w, { type: 'blast', id: tp.id, x: tp.x, z: tp.z });
    return;
  }
  if (kind === 'decoy') { // a copy of you rolls off to the side; whoever hits it wastes their charge
    const sp = Math.hypot(tp.vx, tp.vz), base = sp > 0.5 ? Math.atan2(tp.vz, tp.vx) : Math.atan2(tp.faceZ, tp.faceX), a = base + (w.rng() < 0.5 ? -1 : 1) * 0.9;
    const d = addTop(w, { parts: tp.parts, name: tp.name, human: false, spin: Math.max(40, tp.spin * 0.85), x: tp.x + Math.cos(a) * tp.r * 2.3, z: tp.z + Math.sin(a) * tp.r * 2.3, ai: 'decoy', spawn: false, team: tp.team });
    Object.assign(d, { decoyOf: tp.id, life: CFG.decoyTime, noDecay: true, dirX: Math.cos(a), dirZ: Math.sin(a), vx: Math.cos(a) * Math.max(5, sp), vz: Math.sin(a) * Math.max(5, sp) });
    emit(w, { type: 'puUse', id: tp.id, kind, decoy: d.id });
    return;
  }
  tp.fx = { kind, t: FX_TIME[kind] };
  emit(w, { type: 'puUse', id: tp.id, kind });
}
function tickPowers(w, dt) {
  if (w.powersOn) {
    w.powerT -= dt;
    if (w.powerT <= 0) { w.powerT = w.powerEvery * (0.75 + w.rng() * 0.5); if (w.powerups.length < w.powerMax) spawnPowerup(w); }
  }
  for (let i = w.powerups.length - 1; i >= 0; i--) {
    const pu = w.powerups[i]; pu.t -= dt;
    if (pu.t <= 0) { w.powerups.splice(i, 1); emit(w, { type: 'puGone', id: pu.id }); continue; }
    for (const tp of w.tops) { // the first top without a power that touches the orb takes it
      if (!alive(tp) || tp.power || tp.ai === 'dummy' || tp.boss || isDecoy(tp) || Math.hypot(tp.x - pu.x, tp.z - pu.z) > tp.r + CFG.pickup) continue;
      tp.power = { kind: pu.kind, t: CFG.powerHold }; w.powerups.splice(i, 1);
      emit(w, { type: 'puTake', id: pu.id, top: tp.id, kind: pu.kind }); break;
    }
  }
  for (const tp of w.tops) {
    if (tp.power) { tp.power.t -= dt; if (tp.power.t <= 0) { emit(w, { type: 'puExpire', id: tp.id, kind: tp.power.kind }); tp.power = null; } }
    if (tp.fx) { tp.fx.t -= dt; if (tp.fx.t <= 0) { emit(w, { type: 'fxEnd', id: tp.id, kind: tp.fx.kind }); tp.fx = null; } }
  }
}
function botPowerChoice(w, b) { // when should a bot fire its power? roughly when a player would
  const k = b.power.kind;
  if (b.power.t < 1.5) return true; // never waste it
  let near = 99, threat = false;
  for (const o of w.tops) { if (o === b || !alive(o) || sameTeam(o, b)) continue; const d = Math.hypot(o.x - b.x, o.z - b.z) - o.r - b.r; near = Math.min(near, d); if (d < 3 && o.spin > b.spin * 1.2) threat = true; }
  if (k === 'blast') return near < 2.5 && !w.tops.some((o) => o.human && !b.human && o.age < CFG.graceTime && Math.hypot(o.x - b.x, o.z - b.z) < CFG.blastRadius + o.r); // spare fresh players
  if (k === 'shield') return threat || b.spin < 40;
  if (k === 'turbo') return !!b.goal.dash;
  if (k === 'anchor') { const r = Math.hypot(b.x, b.z); return threat || (near < 3 && r > R - 6 && nearestPit(w, b.x, b.z).diff < 0.5); }
  if (k === 'decoy') return threat || b.spin < 50;
  return b.power.t < CFG.powerHold - 1.2; // magnet: soon after pickup
}

// ---------------------------------------------------------------- bots (grab sparks, hunt smaller tops toward pits, flee bigger ones)
export function botMove(w, b, dt) {
  b.think -= dt;
  if (b.think <= 0) { b.think = 0.1 + w.rng() * 0.12; decide(w, b); }
  if (b.goal.dash && b.cd <= 0) { b.goal.dash = false; dash(w, b, { x: b.goal.x, y: b.goal.z }); }
  if (b.power && b.ai !== 'passive' && botPowerChoice(w, b)) usePower(w, b);
  if (b.bossKind === 'magnetar') tickMagnetar(w, b, dt);
  else if (b.boss) { // the Champion slams the floor when rivals crowd it
    b.slamT -= dt;
    if (b.slamT <= 0 && w.tops.some((o) => o !== b && alive(o) && !isDecoy(o) && Math.hypot(o.x - b.x, o.z - b.z) - o.r - b.r < 2.2 && !(o.human && o.age < CFG.graceTime))) { b.slamT = CFG.bossSlam; b.power = { kind: 'blast', t: 1 }; usePower(w, b); }
  }
  const noise = (1 - b.skill) * 0.25;
  return norm(b.goal.x + (w.rng() * 2 - 1) * noise, b.goal.z + (w.rng() * 2 - 1) * noise);
}
function decoyMove(w, d) { // roll on, curving away from the walls like a nervous player
  const r = Math.hypot(d.x, d.z), k = clamp((r - (R - 9)) / 6, 0, 1.5);
  const gx = d.dirX - (d.x / (r || 1)) * k, gz = d.dirZ - (d.z / (r || 1)) * k, l = Math.hypot(gx, gz) || 1;
  d.dirX = gx / l; d.dirZ = gz / l;
  return { x: d.dirX, y: d.dirZ };
}
function decide(w, b) {
  const r = Math.hypot(b.x, b.z), pit = nearestPit(w, b.x, b.z);
  const ramp = Math.min(1, 0.2 + heatOf(w) / CFG.aggroRamp), aggro = b.ai === 'passive' ? 0 : b.boss ? 1 : b.aggro * ramp;
  // 0. Last Top Spinning: get back inside the safe zone
  const zr = zoneR(w);
  if (zr < R && r > zr - 2.5) { b.goal = { x: -b.x / (r || 1), z: -b.z / (r || 1), dash: r > zr && b.skill > 0.5 && b.spin > 30 }; return; }
  // 0.5 the Sinkhole: get off the middle while it is warning or open
  if (w.event?.id === 'sink' && r < CFG.sinkR + 3) { const l = r || 1; b.goal = { x: r > 0.1 ? b.x / l : 1, z: r > 0.1 ? b.z / l : 0, dash: r < CFG.sinkR + 1 && sinkOpen(w) === false && b.skill > 0.4 }; return; }
  // 1. stay out of the pits: steer back to the centre when close to an opening
  if (r > R - 4.5 && pit.diff < w.arena.pitHalf + 0.28) { b.goal = { x: -b.x / r, z: -b.z / r, dash: r > R - 2.5 && b.skill > 0.5 }; return; }
  let flee = null, prey = null, preyScore = 0;
  for (const o of w.tops) {
    if (o === b || !alive(o) || o.id === b.decoyOf || sameTeam(o, b)) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z); if (d > 12) continue;
    const ratio = o.spin / Math.max(1, b.spin);
    if (!b.boss && ratio > 1.45 && d < 6.5 && (!flee || d < flee.d)) flee = { o, d };
    if (aggro > 0 && ratio < 0.95 && d < 9) { // only hunt tops smaller than you
      let s = (12 - d) * (1.3 - ratio) * aggro;
      if (o.human && !b.human) s *= o.age < CFG.graceTime || ratio > 0.8 ? 0 : 0.9; // a quiet start, and only clearly smaller players get hunted
      if (o.human && !b.human && o.age < CFG.newcomer && o.spin < (w.avgSpin || 0)) s *= 0.4; // a small newcomer gets a gentler first minute
      if (o.id === w.leader) s *= 1.4;
      const op = nearestPit(w, o.x, o.z); if (Math.hypot(o.x, o.z) > R - 7 && op.diff < 0.45) s *= 1.7; // easy ring-out
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
    const o = prey.o, op = nearestPit(w, o.x, o.z), px = op.x - o.x, pz = op.z - o.z, pl = Math.hypot(px, pz) || 1;
    let gx, gz;
    if (prey.d > 4.5) { gx = o.x - (px / pl) * (o.r + b.r + 1) - b.x; gz = o.z - (pz / pl) * (o.r + b.r + 1) - b.z; }
    else { gx = o.x - b.x; gz = o.z - b.z; }
    b.goal = { x: gx, z: gz, dash: prey.d < 4.2 + o.r && w.rng() < b.skill * 0.6 };
    return;
  }
  // 3. a power-up orb close by beats sparks
  if (!b.power && !b.boss) { const pu = w.powerups.find((q) => Math.hypot(q.x - b.x, q.z - b.z) < 10); if (pu) { b.goal = { x: pu.x - b.x, z: pu.z - b.z, dash: false }; return; } }
  // 4. sparks: nearest one, else drift toward the middle ring (the turntable disc, if there is one)
  let best = null, bd = 1e9;
  for (const s of w.sparks) { if (!s.on || s.fall > 0) continue; const d = (s.x - b.x) ** 2 + (s.z - b.z) ** 2; if (d < bd) { bd = d; best = s; } }
  if (best) b.goal = { x: best.x - b.x, z: best.z - b.z, dash: false };
  else b.goal = { x: -b.x * 0.3 + (w.rng() * 2 - 1), z: -b.z * 0.3 + (w.rng() * 2 - 1), dash: false };
  if (r > R - 2.5) { b.goal.x -= (b.x / r) * 1.5; b.goal.z -= (b.z / r) * 1.5; } // don't hug the wall
}

// ---------------------------------------------------------------- arena events (every ~40 s: Spark Storm, Arena Tilt, Overdrive)
function startEvent(w) {
  const ids = ['storm', 'tilt', 'overdrive', 'sink'].filter((e) => e !== w.lastEvent && !(e === 'sink' && w.mode === 'last')), id = ids[(w.rng() * ids.length) | 0]; // Last Top's ring closes on the middle: no Sinkhole there
  const open = w.pits.map((_, i) => i).filter((i) => pitOpen(w, i)), pit = open[(w.rng() * open.length) | 0] ?? 0;
  w.event = { id, t: EVENT_DUR[id], dur: EVENT_DUR[id], pit, ang: pitAng(w, pit), acc: 0 };
  w.lastEvent = id;
  emit(w, { type: 'event', id, pit, t: w.event.t });
}
function tickEvent(w, dt) {
  const ev = w.event; ev.t -= dt;
  if (ev.id === 'storm') { ev.acc += dt * 8; while (ev.acc >= 1) { ev.acc--; const [x, z] = randomSpot(w, R * 0.75); addSpark(w, x, z, { fall: 7, big: w.rng() < 0.25 ? 1 : 0 }); } }
  if (ev.id === 'sink' && sinkOpen(w)) { // the hole swallows whatever is on it: tops (a ring out for whoever pushed them) and sparks
    for (const tp of w.tops) if (alive(tp) && !tp.boss && Math.hypot(tp.x, tp.z) < CFG.sinkR - tp.r * 0.35) startFall(w, tp, true);
    for (const s of w.sparks) if (s.on && Math.hypot(s.x, s.z) < CFG.sinkR) s.on = false;
  }
  if (ev.t <= 0) { emit(w, { type: 'eventEnd', id: ev.id }); w.event = null; w.nextEvent = w.time + CFG.eventEvery; }
}

// ---------------------------------------------------------------- step
export const rankList = (w) => w.tops.filter((tp) => (alive(tp) || tp.state === 'spawn') && !isDecoy(tp)).sort((a, b) => b.spin - a.spin);
// inputFor(top) -> { x, y, dash, use } for human tops (keyboard/touch locally, the latest network message on the server)
export function step(w, dt, inputFor) {
  w.time += dt;
  updateSparks(w, dt);
  const zr = zoneR(w), turn = w.arena.turnR || 0;
  for (const tp of [...w.tops]) {
    if (tp.state === 'dead') continue; // popped earlier in this step
    if (tp.state === 'spawn') {
      tp.timer -= dt;
      if (tp.timer <= 0) { tp.state = 'alive'; tp.shield = CFG.shield; emit(w, { type: 'land', id: tp.id }); }
      continue;
    }
    if (tp.state === 'falling' || tp.state === 'toppling') { animateDying(tp, dt); if (tp.timer <= 0) eliminate(w, tp, tp.state === 'falling' ? 'ringout' : 'topple'); continue; }
    if (tp.state !== 'alive') continue;
    let inp = { x: 0, y: 0 };
    if (!w.frozen) {
      if (tp.human) { const i = inputFor(tp) || inp; if (i.dash) dash(w, tp, i); if (i.use) usePower(w, tp); inp = i; }
      else if (isDecoy(tp)) { tp.life -= dt; if (tp.life <= 0) { popDecoy(w, tp); continue; } inp = decoyMove(w, tp); }
      else if (tp.ai !== 'idle' && tp.ai !== 'dummy') inp = botMove(w, tp, dt);
      tp.age += dt; tp.shield = Math.max(0, tp.shield - dt);
    }
    integrate(w, tp, inp, dt);
    tp.hitWob = Math.max(0, tp.hitWob - dt * 0.8);
    if (!w.frozen) {
      const r = Math.hypot(tp.x, tp.z);
      // spin decays faster the bigger you are
      if (!tp.noDecay) tp.spin -= ((CFG.decay * (1 + tp.spin * CFG.decayGrowth)) / tp.stats.sta) * (w.event?.id === 'overdrive' ? 0.5 : 1) * dt;
      if (turn && r < turn && !isDecoy(tp)) tp.spin = Math.min(CFG.maxSpin, tp.spin + CFG.turnRecharge * dt); // riding the turntable recharges you
      if (r > zr) tp.spin -= (CFG.zoneDrain + Math.max(0, tp.spin) * 0.03) * dt; // outside the safe zone
      if (tp.boss) { tp.bossT -= dt; if (tp.bossT <= 0) { emit(w, { type: 'bossLeave', id: tp.id }); w.bossAt = heatOf(w) + w.bossEvery; removeTop(w, tp); continue; } }
    }
    if (tp.ai === 'dummy') tp.spin = Math.max(tp.spin, 1);
    tp.peak = Math.max(tp.peak, tp.spin);
    walls(w, tp);
    if (tp.state === 'alive' && tp.spin <= 0) startTopple(w, tp);
    updateMass(tp);
  }
  const T = w.tops;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (T[i] && T[j] && alive(T[i]) && alive(T[j])) collide(w, T[i], T[j]);
  for (let i = 0; i < w.sparks.length; i++) { // sparks: magnet + pickup
    const s = w.sparks[i]; if (!s.on || s.fall > 0) continue;
    for (const tp of T) {
      if (!alive(tp) || isDecoy(tp)) continue;
      const dx = tp.x - s.x, dz = tp.z - s.z, d = Math.hypot(dx, dz), mag = tp.fx?.kind === 'magnet';
      if (d < tp.r + 0.35) { collectSpark(w, tp, i); break; }
      if (d < tp.r + (mag ? CFG.magnetRadius : CFG.magnet)) { const k = ((mag ? 16 : 8) * dt) / Math.max(d, 0.1); s.x += dx * Math.min(1, k); s.z += dz * Math.min(1, k); }
    }
  }
  if (w.frozen) return;
  // keep the arena full and stocked (Last Top Spinning: nobody comes back)
  for (let i = w.pendingRespawns.length - 1; i >= 0; i--) { w.pendingRespawns[i] -= dt; if (w.pendingRespawns[i] <= 0) w.pendingRespawns.splice(i, 1); }
  const bots = T.filter((tp) => !tp.human && !tp.boss && !isDecoy(tp));
  if (w.respawns && bots.length < w.botTarget && w.pendingRespawns.length < w.botTarget - bots.length) spawnBot(w, { avoid: T.filter((tp) => tp.human) });
  w.trimT -= dt;
  if (bots.length > w.botTarget && w.trimT <= 0) { // a human joined a full room: one bot leaves per second
    w.trimT = 1; const humans = T.filter((tp) => tp.human), far = (b) => Math.min(99, ...humans.map((h) => Math.hypot(h.x - b.x, h.z - b.z)));
    const b = bots.filter(alive).sort((p, q) => far(q) - far(p))[0]; if (b) removeTop(w, b);
  }
  const active = w.sparks.reduce((n, s) => n + (s.on ? 1 : 0), 0);
  if (active < w.sparkTarget && w.rng() < dt * (w.mut === 'rush' ? 9 : 6)) addSpark(w, ...randomSpot(w));
  w.leaderT -= dt;
  if (w.leaderT <= 0) {
    w.leaderT = 0.25; const ranks = rankList(w), lead = ranks[0]?.id ?? null; if (lead !== w.leader) { w.leader = lead; emit(w, { type: 'leader', id: lead }); }
    w.avgSpin = ranks.length ? ranks.reduce((n, tp) => n + tp.spin, 0) / ranks.length : 0; // how big the field is: bots spare newcomers below it
  }
  for (const tp of T) if (tp.canSplit && alive(tp) && tp.spin < tp.peak * CFG.splitAt) splitTwins(w, tp);
  if (w.eventsOn) { if (w.event) tickEvent(w, dt); else if (w.time >= w.nextEvent) startEvent(w); }
  tickPowers(w, dt);
  if (w.bossOn && heatOf(w) >= w.bossAt && !T.some((tp) => tp.boss)) spawnBoss(w);
  if (w.mode === 'teams' && !w.over && w.time >= w.roundEnd) { // Teams: the round ends on time; more knockout points wins
    w.over = true; const [a, b] = w.teamScore;
    emit(w, { type: 'teamWin', team: a > b ? 0 : b > a ? 1 : -1, scores: [a, b] });
  }
  if (w.mode === 'last' && !w.over) { // Last Top Spinning ends when one top is left
    const left = T.filter((tp) => !isDecoy(tp) && tp.state !== 'dead');
    if (left.length <= 1) { w.over = true; emit(w, { type: 'win', id: left[0]?.id || 0 }); }
  }
}
