// Kitewind rules: pure (no DOM, no THREE), shared by the browser (solo + online prediction) and mp/kitewind.mjs (online rooms).
// A sky is a set of grey clouds above a beach. Kites are tethered to kids standing on the sand; a kite's ribbon tail paints
// the clouds it sweeps through, and a fully painted cloud "blooms". Everything that happens is pushed to world.events so the
// renderer (and the server's snapshots) react to the same facts.

export const STEP = 1 / 60; // fixed simulation step: identical flight at 60/144/165 Hz and on the server
export const CFG = {
  ground: 0.9,            // kite crashes below this height (sand / sea)
  skyTop: 34,
  sample: 0.05,           // a tail sample every 0.05 s
  paintRate: 1.5,         // paint per second when 10 tail samples are inside a cloud
  stunCrash: 1.4, stunZap: 1.1,
  dash: { time: 0.45, mult: 1.9 },
  loopWindow: 3.2,        // a full turn within this many seconds is a loop
  loopRadius: 4.2, loopPaint: 1.1,
  flockBoost: 1.28, ringBoost: 0.6,
};
// upgrades: value at level n, cost at level n (breeze), max level
export const UPGRADES = {
  string: { max: 8, val: (n) => 14 + 2.3 * n, cost: (n) => Math.round(40 * Math.pow(1.75, n)) },
  tail: { max: 8, val: (n) => 16 + 4 * n, cost: (n) => Math.round(30 * Math.pow(1.7, n)) },
  ribbon: { max: 6, val: (n) => 0.55 + 0.28 * n, cost: (n) => Math.round(45 * Math.pow(1.8, n)) },
  speed: { max: 8, val: (n) => 7 + 0.55 * n, cost: (n) => Math.round(35 * Math.pow(1.7, n)) },
  dash: { max: 6, val: (n) => 2.8 - 0.28 * n, cost: (n) => Math.round(50 * Math.pow(1.8, n)) }, // seconds between gust dashes
};
export const UP_IDS = Object.keys(UPGRADES);
export const KITES = [ // cosmetic shapes with a small perk each; unlocked by stars
  { id: 'diamond', stars: 0, perk: null },
  { id: 'delta', stars: 4, perk: 'turn' },     // +20% turning
  { id: 'fish', stars: 9, perk: 'paint' },     // +12% paint
  { id: 'box', stars: 14, perk: 'lift' },      // falls slower when idle, crashes are rarer
  { id: 'dragon', stars: 19, perk: 'tail' },   // +6 tail samples
  { id: 'star', stars: 24, perk: 'breeze' },   // +15% breeze
];
export const COLORS = ['#ff5f8f', '#ffb13d', '#38c7ff', '#7cd85a', '#b585ff', '#ffe14d']; // kite / ribbon colours by seat

// Eight hand-tuned skies, then Free Sky (endless, procedural, themes cycle). reach = how far the farthest clouds are from
// the kid (the string has to grow to reach them); par = seconds for the second star.
export const SKIES = [
  { id: 'dawn', theme: 'dawn', clouds: 14, goal: 12, reach: 13.5, big: 0, storms: 0, rings: 0, birds: 0, shift: 0, lanterns: 0, par: 75 },
  { id: 'cliffs', theme: 'morning', clouds: 18, goal: 15, reach: 15, big: 0, storms: 0, rings: 0, birds: 2, shift: 0, lanterns: 0, par: 85 },
  { id: 'harbor', theme: 'noon', clouds: 22, goal: 18, reach: 17, big: 1, storms: 0, rings: 6, birds: 2, shift: 0, lanterns: 0, par: 95 },
  { id: 'reef', theme: 'rainbow', clouds: 24, goal: 20, reach: 19.5, big: 4, storms: 0, rings: 6, birds: 2, shift: 0, lanterns: 0, par: 110 },
  { id: 'lagoon', theme: 'sunset', clouds: 28, goal: 23, reach: 22, big: 3, storms: 0, rings: 8, birds: 3, shift: 24, lanterns: 0, par: 120 },
  { id: 'storm', theme: 'storm', clouds: 30, goal: 25, reach: 24, big: 3, storms: 4, rings: 8, birds: 2, shift: 20, lanterns: 0, par: 135 },
  { id: 'lantern', theme: 'night', clouds: 32, goal: 27, reach: 26, big: 4, storms: 2, rings: 8, birds: 0, shift: 0, lanterns: 1, par: 140 },
  { id: 'aurora', theme: 'aurora', clouds: 36, goal: 30, reach: 28, big: 5, storms: 3, rings: 10, birds: 3, shift: 22, lanterns: 1, par: 160 },
];
export const THEMES = ['dawn', 'morning', 'noon', 'rainbow', 'sunset', 'storm', 'night', 'aurora'];
export function freeSky(round) { // Free Sky and online rooms: endless skies, a little bigger each round
  const theme = THEMES[round % THEMES.length], k = Math.min(round, 12);
  return { id: `free${round}`, theme, clouds: 22 + k, goal: 18 + k, reach: 22 + Math.min(8, k), big: 2 + (k >> 2), storms: theme === 'storm' ? 4 : k > 3 ? 1 + (k >> 3) : 0,
    rings: 8, birds: theme === 'night' ? 0 : 2, shift: k > 2 ? 26 : 0, lanterns: theme === 'night' || theme === 'aurora' ? 1 : 0, par: 150, free: true };
}

export const NAME_A = ['Swift', 'Brave', 'Lucky', 'Mighty', 'Rapid', 'Sunny', 'Cosmic', 'Turbo', 'Jolly', 'Nimble', 'Zippy', 'Clever', 'Bouncy', 'Breezy', 'Steady', 'Daring',
  'Golden', 'Silver', 'Shiny', 'Fuzzy', 'Happy', 'Mega', 'Super', 'Tiny', 'Giant', 'Electric', 'Frosty', 'Blazing', 'Sneaky', 'Wild', 'Royal', 'Neon'];
export const NAME_B = ['Comet', 'Falcon', 'Otter', 'Rocket', 'Panda', 'Tiger', 'Pixel', 'Rider', 'Gecko', 'Koala', 'Badger', 'Meteor', 'Fox', 'Whale', 'Lynx', 'Orbit',
  'Dragon', 'Spinner', 'Cyclone', 'Twister', 'Wizard', 'Ninja', 'Knight', 'Pilot', 'Robot', 'Star', 'Storm', 'Bolt', 'Puma', 'Hawk', 'Shark', 'Yeti'];
export function isPickedName(n) { // two words from the lists and an optional number 1-99 (the same lists as Whirlbash)
  const m = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9][0-9]?)?$/.exec(String(n || ''));
  return !!m && NAME_A.includes(m[1]) && NAME_B.includes(m[2]);
}
export const CHAT = ['nice', 'here', 'loop', 'thanks', 'go']; // quick chat: fixed phrases only, never typed text

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// anchors: where the kids stand on the beach. Solo: one kid in the middle; online: up to 4 spread along the sand.
export const anchorsFor = (n) => (n <= 1 ? [0] : n === 2 ? [-9, 9] : n === 3 ? [-14, 0, 14] : [-18, -6, 6, 18]);

// ---------------------------------------------------------------- world
export function createWorld(def, { seed = 1, seats = 1, solo = true } = {}) {
  const R = rng(seed), anchors = anchorsFor(seats), clouds = [];
  const minX = Math.min(...anchors) - def.reach * 0.92, maxX = Math.max(...anchors) + def.reach * 0.92;
  const place = (r, tries = 400) => { // within def.reach of a kid (so a string that long reaches it), clouds may touch but not stack
    for (let i = 0; i < tries; i++) {
      const ax = anchors[(R() * anchors.length) | 0], a = 0.12 + R() * (Math.PI - 0.24), d = 4.5 + Math.sqrt(R()) * (def.reach - 4.5 - r * 0.5);
      const x = clamp(ax + Math.cos(a) * d, minX, maxX), y = Math.sin(a) * d;
      if (y < r + 1.9 || y > CFG.skyTop - r) continue;
      if (clouds.some((c) => Math.hypot(c.x - x, c.y - y) < (c.r + r) * 0.82)) continue;
      return [x, y];
    }
    return null;
  };
  let id = 0, tries = 0;
  const add = (kind, r) => { const p = place(r); if (!p) return; clouds.push({ id: id++, kind, x: p[0], y: p[1], r, paint: 0, need: kind === 'storm' ? 0 : r * r * 1.25, bloomed: false, calm: 0 }); };
  for (let i = 0; i < def.big; i++) add('big', 3.4 + R() * 1.1);
  for (let i = 0; i < def.storms; i++) add('storm', 2.4 + R() * 0.6);
  while (clouds.filter((c) => c.kind !== 'storm').length < def.clouds && tries++ < 200) add('cloud', 1.35 + R() * 1.15); // a full sky stops early
  const rings = [];
  for (let i = 0; i < def.rings; i++) {
    const ax = anchors[i % anchors.length], a = 0.3 + R() * (Math.PI - 0.6), d = 7 + R() * (def.reach - 8);
    rings.push({ id: i, x: ax + Math.cos(a) * d, y: 3 + Math.sin(a) * d, r: 1.25, t: R() * 6, taken: false, back: 0 });
  }
  const goalCount = Math.min(def.goal, clouds.filter((c) => c.kind !== 'storm').length);
  return { def, seed, solo, anchors, clouds, rings, birds: [], kites: [], events: [], time: 0, bloomed: 0, goal: goalCount, done: false,
    wind: { dir: 1, t: def.shift || 0, warn: false }, birdT: 3 + R() * 4, R, nextKite: 0 };
}

export function addKite(w, { seat = 0, ups = {}, kite = 'diamond', name = 'You', human = true } = {}) {
  const ax = w.anchors[seat % w.anchors.length];
  const k = { id: w.nextKite++, seat, ax, name, kite, human, ups: normUps(ups), x: ax, y: 9, h: Math.PI / 2, s: 4, vx: 0, vy: 0,
    stun: 0, dash: 0, dashCd: 0, trail: [], sampleT: 0, turn: 0, turnT: 0, loopCd: 0, combo: 0, comboT: 0, crashes: 0, breeze: 0, boost: 0, input: { x: 0, y: 0, dash: false } };
  w.kites.push(k); return k;
}
export function normUps(u) { const o = {}; for (const id of UP_IDS) o[id] = clamp((u?.[id] | 0), 0, UPGRADES[id].max); return o; }
export const stat = (k, id) => UPGRADES[id].val(k.ups[id] | 0) + (id === 'tail' && k.kite === 'dragon' ? 6 : 0);
export function removeKite(w, id) { w.kites = w.kites.filter((k) => k.id !== id); }

// ---------------------------------------------------------------- flight
export function integrate(w, k, dt) { // one kite, one step: steering, lift, the string, the ground
  if (k.stun > 0) { // tumbling after a crash or a zap: drift back up above the kid, no painting
    k.stun -= dt; k.trail.length = 0;
    k.x += (k.ax - k.x) * Math.min(1, dt * 1.6); k.y += (9 - k.y) * Math.min(1, dt * 1.6); k.h += dt * 7; k.s = 3;
    if (k.stun <= 0) { k.h = Math.PI / 2; k.stun = 0; }
    return;
  }
  const inp = k.input, L = stat(k, 'string'), base = stat(k, 'speed');
  const dx = k.x - k.ax, dy = k.y, dist = Math.hypot(dx, dy) || 1;
  const want = inp.x || inp.y ? Math.atan2(inp.y, inp.x) : Math.PI / 2; // no input: a kite rises to the top of the wind window
  const turnRate = (inp.x || inp.y ? 3.9 : 1.1) * (k.kite === 'delta' ? 1.2 : 1);
  const dh = clamp(wrap(want - k.h), -turnRate * dt, turnRate * dt);
  k.h = wrap(k.h + dh); k.turn += dh; k.turnT += dt;
  if (k.turnT > CFG.loopWindow) { k.turn *= 0.5; k.turnT = CFG.loopWindow * 0.5; }
  k.loopCd = Math.max(0, k.loopCd - dt);
  if (Math.abs(k.turn) >= Math.PI * 2 && k.loopCd <= 0 && (inp.x || inp.y)) { k.turn = 0; k.turnT = 0; k.loopCd = 1.2; loop(w, k); }
  // power: fast across the wind window, slow at its top; diving speeds up, climbing slows; the wind shifts the sweet side
  const side = Math.abs(dx) / dist, windSide = Math.sign(dx || 1) === w.wind.dir ? 1 : 0.86;
  let target = base * (0.52 + 0.48 * side) * windSide - Math.sin(k.h) * 1.2;
  if (!(inp.x || inp.y)) target = Math.min(target, base * 0.45);
  k.dashCd = Math.max(0, k.dashCd - dt);
  if (inp.dash && k.dashCd <= 0) { k.dash = CFG.dash.time; k.dashCd = stat(k, 'dash'); w.events.push({ t: 'dash', k: k.id }); }
  inp.dash = false;
  if (k.dash > 0) { k.dash -= dt; target *= CFG.dash.mult; }
  if (k.boost > 0) { k.boost -= dt; target *= CFG.flockBoost; }
  k.s += (target - k.s) * Math.min(1, dt * 3.2);
  k.vx = Math.cos(k.h) * k.s; k.vy = Math.sin(k.h) * k.s;
  if (!(inp.x || inp.y)) k.vy -= k.kite === 'box' ? 0.4 : 0.9; // idle drift settles down gently
  k.x += k.vx * dt; k.y += k.vy * dt;
  const nx = k.x - k.ax, nd = Math.hypot(nx, k.y);
  if (nd > L) { k.x = k.ax + (nx / nd) * L; k.y = (k.y / nd) * L; k.s *= 1 - dt * 2.5; } // the string is taut: slide along its circle
  if (k.y > CFG.skyTop) k.y = CFG.skyTop;
  if (k.y < CFG.ground) { // crash into the sand or the sea
    k.stun = CFG.stunCrash; k.crashes++; k.combo = 0; k.y = CFG.ground; w.events.push({ t: 'crash', k: k.id, x: k.x });
    return;
  }
  // tail samples
  k.sampleT += dt;
  while (k.sampleT >= CFG.sample) { k.sampleT -= CFG.sample; k.trail.push(k.x, k.y); }
  const maxPts = Math.round(stat(k, 'tail')) * 2;
  if (k.trail.length > maxPts) k.trail.splice(0, k.trail.length - maxPts);
  k.comboT = Math.max(0, k.comboT - dt); if (k.comboT <= 0) k.combo = 0;
}

// ---------------------------------------------------------------- painting
export function paintStep(w, k, dt) { // the tail sweeps through clouds; returns nothing, pushes events
  if (k.stun > 0 || k.trail.length < 4) return;
  const pad = stat(k, 'ribbon'), rate = CFG.paintRate * (k.kite === 'fish' ? 1.12 : 1) / 10;
  for (const c of w.clouds) {
    if (c.bloomed) continue;
    const rr = c.r + pad, rr2 = rr * rr; let inside = 0;
    if (Math.abs(c.x - k.x) > rr + 30) continue;
    for (let i = 0; i < k.trail.length; i += 2) { const dx = k.trail[i] - c.x, dy = k.trail[i + 1] - c.y; if (dx * dx + dy * dy < rr2) inside++; }
    if (!inside) continue;
    if (c.kind === 'storm') { // a storm cloud zaps the kite (loops calm it instead)
      const hx = k.x - c.x, hy = k.y - c.y;
      if (hx * hx + hy * hy < c.r * c.r) { k.stun = CFG.stunZap; k.combo = 0; w.events.push({ t: 'zap', k: k.id, c: c.id, x: c.x, y: c.y }); }
      continue;
    }
    addPaint(w, k, c, rate * inside * dt);
  }
  for (const r of w.rings) { // rings: a dash refill and a little breeze
    if (r.taken) continue;
    if (Math.hypot(k.x - r.x, k.y - r.y) < r.r + 0.4) { r.taken = true; r.back = 14; k.dashCd = 0; give(w, k, 5); w.events.push({ t: 'ring', k: k.id, r: r.id, x: r.x, y: r.y }); }
  }
  for (const b of w.birds) if (Math.hypot(k.x - b.x, k.y - b.y) < 3.2) { if (k.boost <= 0) w.events.push({ t: 'flock', k: k.id }); k.boost = 0.6; }
}
export function addPaint(w, k, c, amount) {
  if (c.bloomed || c.kind === 'storm' || amount <= 0) return;
  const before = c.paint; c.paint = Math.min(c.need, c.paint + amount);
  if (k) give(w, k, (c.paint - before) * 1.6);
  if (Math.floor(before * 4) !== Math.floor(c.paint * 4)) w.events.push({ t: 'paint', k: k ? k.id : -1, c: c.id });
  if (c.paint >= c.need) bloom(w, k, c);
}
function bloom(w, k, c) {
  c.bloomed = true; w.bloomed++;
  if (k) { k.combo++; k.comboT = 4; give(w, k, (c.kind === 'big' ? 22 : 10) + 2 * Math.min(k.combo, 10)); }
  w.events.push({ t: 'bloom', k: k ? k.id : -1, c: c.id, x: c.x, y: c.y, big: c.kind === 'big', combo: k ? k.combo : 0 });
  if (!w.done && w.bloomed >= w.goal) { w.done = true; w.events.push({ t: 'done' }); }
}
function loop(w, k) { // a full turn paints everything inside the circle it drew, and calms storm clouds
  let cx = 0, cy = 0, n = 0;
  for (let i = Math.max(0, k.trail.length - 60); i < k.trail.length; i += 2) { cx += k.trail[i]; cy += k.trail[i + 1]; n++; }
  if (!n) return;
  cx /= n; cy /= n;
  const R = CFG.loopRadius + stat(k, 'ribbon') * 0.6;
  w.events.push({ t: 'loop', k: k.id, x: cx, y: cy, r: R });
  if (w.remote) return; // an online client's copy of the sky: the server paints the loop (and pays for it)
  give(w, k, 8);
  for (const c of w.clouds) {
    if (c.bloomed || Math.hypot(c.x - cx, c.y - cy) > R + c.r) continue;
    if (c.kind === 'storm') { c.kind = 'big'; c.need = c.r * c.r * 1.25; w.events.push({ t: 'calm', k: k.id, c: c.id, x: c.x, y: c.y }); continue; }
    addPaint(w, k, c, c.need * 0.55 * CFG.loopPaint);
  }
}
function give(w, k, v) { k.breeze += v * 0.7 * (k.kite === "star" ? 1.15 : 1); }
export const applyLoop = loop; // online: the client reports a loop, the server paints it with its own copy of the tail
export function trackRemote(k, x, y, h, s, dt) { // server side: a remote kite's reported position grows its tail like integrate() does
  const L = stat(k, 'string') + 0.5, d = Math.hypot(x - k.ax, y);
  if (d > L) { x = k.ax + ((x - k.ax) / d) * L; y = (y / d) * L; } // no flying off the string
  const jump = Math.hypot(x - k.x, y - k.y), maxJump = (stat(k, 'speed') * CFG.dash.mult * 1.6 + 2) * Math.max(dt, 0.05);
  if (jump > maxJump) { const f = maxJump / jump; x = k.x + (x - k.x) * f; y = k.y + (y - k.y) * f; } // no teleporting
  k.x = x; k.y = y; k.h = h; k.s = s;
  if (k.stun > 0) { k.stun -= dt; k.trail.length = 0; return; }
  if (y < CFG.ground + 0.2) { k.trail.length = 0; return; }
  k.sampleT += dt;
  while (k.sampleT >= CFG.sample) { k.sampleT -= CFG.sample; k.trail.push(x, y); }
  const maxPts = Math.round(stat(k, 'tail')) * 2;
  if (k.trail.length > maxPts) k.trail.splice(0, k.trail.length - maxPts);
}

// ---------------------------------------------------------------- the sky moves
export function skyStep(w, dt) { // wind shifts, birds, rings coming back; shared by solo and the server
  w.time += dt;
  if (w.def.shift) {
    w.wind.t -= dt;
    if (w.wind.t < 3 && !w.wind.warn) { w.wind.warn = true; w.events.push({ t: 'windwarn', dir: -w.wind.dir }); }
    if (w.wind.t <= 0) { w.wind.dir *= -1; w.wind.t = w.def.shift; w.wind.warn = false; w.events.push({ t: 'wind', dir: w.wind.dir }); }
  }
  if (w.def.birds) {
    w.birdT -= dt;
    if (w.birdT <= 0 && w.birds.length < w.def.birds) {
      const dir = w.R() < 0.5 ? 1 : -1, span = Math.max(...w.anchors) - Math.min(...w.anchors) + w.def.reach * 2;
      w.birds.push({ x: -dir * span * 0.55, y: 8 + w.R() * (w.def.reach * 0.6), dir, sp: 4.2 + w.R() * 1.6, ph: w.R() * 6, span });
      w.birdT = 6 + w.R() * 6;
    }
    for (const b of w.birds) { b.x += b.dir * b.sp * dt; b.ph += dt; b.y += Math.sin(b.ph * 0.9) * dt * 0.8; }
    w.birds = w.birds.filter((b) => Math.abs(b.x) < b.span * 0.6);
  }
  for (const r of w.rings) { r.t += dt; if (r.taken && (r.back -= dt) <= 0) r.taken = false; }
}
export function step(w, dt) { // solo: everything in one go
  skyStep(w, dt);
  for (const k of w.kites) { integrate(w, k, dt); paintStep(w, k, dt); }
}

// ---------------------------------------------------------------- results
export function stars(w, k) { // 1: sky done; 2: under par time; 3: under par and no crash
  if (!w.done) return 0;
  return 1 + (w.time <= w.def.par ? 1 : 0) + (w.time <= w.def.par && k.crashes === 0 ? 1 : 0);
}
export const completionBonus = (skyIndex) => 50 + 30 * skyIndex;
export const upCost = (ups, id) => UPGRADES[id].cost(ups[id] | 0);
