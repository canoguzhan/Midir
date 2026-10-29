// Lampdeep rules: pure JS with no DOM and no THREE. game.js draws them; Node bots play them to tune the balance.
// A run is one plain JSON object (saved as-is to resume). act(run, action) plays one turn and returns events
// for the renderer: ph 0 = the lamplighter's action, 1 = shadow strikes, 2 = shadows move and take aim.
// Floors come from hash(seed, depth), so everyone with the same seed descends through the same 40 floors.

export const CFG = {
  depths: 40,             // the Heart of the Dark waits on depth 40; the run may go deeper after that
  creepTurns: 40,         // after this many turns on one floor the dark starts eating oil...
  creepEvery: 6,          // ...one drop every this many turns
  steadyBonus: 30,        // Steady Wick relic: the dark waits this much longer
  flareCd: 7, leapCd: 5, leapDist: 2,
  brazierLight: 2,        // lit braziers light everything within this many tiles
  oilPrice: 2,            // embers per drop of oil at a shrine
  rerollPrice: 3,
  budget: [1.6, 0.42],    // shadow budget per floor: a + b * depth
  podFuse: 3,
};

export const ENEMIES = { // atk: adj (the tile you stand on) | line (to the wall) | cross (4 tiles around) | bomb | ring | line4 | mix
  flitter: { hp: 1, cost: 1, from: 1, atk: 'adj', move: 1, ember: 1 },
  wisp: { hp: 1, cost: 1.5, from: 3, atk: 'line', move: 1, ember: 1, rest: 1 }, // aims only when it stood still
  gloom: { hp: 2, cost: 2, from: 5, atk: 'adj', move: 2, ember: 2, still: true }, // only moves while it stands in the dark
  crab: { hp: 2, cost: 2, from: 8, atk: 'cross', move: 1, ember: 2, rest: 1 },
  pod: { hp: 1, cost: 1, from: 11, atk: 'bomb', move: 0, ember: 1 },
  hound: { hp: 2, cost: 2.5, from: 14, atk: 'adj', move: 2, ember: 2 },
  shell: { hp: 3, cost: 3, from: 22, atk: 'adj', move: 1, ember: 3, shield: true }, // blocks bumps from the front
  queen: { hp: 9, boss: true, atk: 'ring', move: 1, ember: 8, rest: 1, summon: 'flitter', every: 3 },
  soot: { hp: 11, boss: true, atk: 'line4', move: 1, ember: 10, rest: 1, summon: 'pod', every: 3 },
  king: { hp: 12, boss: true, atk: 'ring', move: 2, ember: 12, rest: 1, still: true, summon: 'gloom', every: 4 },
  dark: { hp: 16, boss: true, atk: 'mix', move: 1, ember: 20, rest: 1, summon: 'hound', every: 3 },
};
export const BOSSES = ['queen', 'soot', 'king', 'dark'];

export const RELICS = { // stack = how many times it can be taken
  wick: { stack: 3 },     // +1 max oil (and a drop of oil)
  glass: { stack: 2 },    // +1 light radius
  boots: { stack: 1 },    // bumps push two tiles
  edge: { stack: 2 },     // +1 bump damage
  flint: { stack: 2 },    // Flare recharges 2 turns sooner
  spring: { stack: 1 },   // Leap goes 3 tiles and recharges 1 turn sooner
  moss: { stack: 2 },     // +1 oil on every new depth
  thorns: { stack: 1 },   // shadows that hit you take 1 damage
  swing: { stack: 1 },    // bumps also hit the tiles beside the target
  magnet: { stack: 2 },   // +1 ember per shadow
  steady: { stack: 1 },   // the dark creeps in 30 turns later
  sparks: { stack: 1 },   // Flare also deals 1 damage
  phoenix: { stack: 1 },  // once per run: an empty lamp relights with 3 oil
  lure: { stack: 1 },     // oil puddles give 2
  kin: { stack: 1 },      // lighting a brazier refills 1 oil
  ward: { stack: 1 },     // the first hit on every depth is blocked
};

export const LANTERNS = { // unlock = the deepest depth you must have reached
  brass: { oil: 6, light: 2, unlock: 0 },
  glass: { oil: 5, light: 3, unlock: 10 },
  iron: { oil: 8, light: 1, unlock: 20, edge: 1 },
  moth: { oil: 5, light: 2, unlock: 30, leapCd: 3, flareCd: 5 },
};

export const WAYSTONES = [11, 21, 31]; // after beating a boss you may start later runs here

// ---------------------------------------------------------------- random, seeds
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(...parts) {
  let h = 2166136261;
  for (const v of parts) { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 0x9e; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const SEED_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeed(rand = Math.random) { let s = ''; for (let i = 0; i < 6; i++) s += SEED_ABC[Math.floor(rand() * SEED_ABC.length)]; return s; }
export const dailySeed = (date) => `DAY-${date}`; // date as YYYY-MM-DD (UTC)
export const cleanSeed = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14);

// ---------------------------------------------------------------- grid helpers
const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const D8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
export const man = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
export function tileAt(f, x, y) { return x < 0 || y < 0 || x >= f.w || y >= f.h ? null : f.grid[y][x]; }
export const enemyAt = (f, x, y) => f.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y) || null;
export const brazierAt = (f, x, y) => f.braziers.find((b) => b.x === x && b.y === y) || null;
const floorish = (t) => t === '.' || t === '%' || t === 'S';
const canStand = (f, x, y) => floorish(tileAt(f, x, y)) && !enemyAt(f, x, y) && !(f.player.x === x && f.player.y === y);
export const bossAlive = (f) => f.enemies.some((e) => e.hp > 0 && ENEMIES[e.type].boss);
export const stairsOpen = (f) => !f.sealed && !bossAlive(f);
export const isBossDepth = (d) => d % 10 === 0;
export const shrineAfter = (d) => [0, 3, 6, 9].includes(d % 10);
export const bossAt = (d) => BOSSES[(Math.floor(d / 10) - 1) % 4];

// ---------------------------------------------------------------- derived stats
const L = (run) => LANTERNS[run.lantern] || LANTERNS.brass;
export function lightRadius(run) { return Math.max(1, L(run).light + (run.relics.glass || 0) - (run.oil <= 2 ? 1 : 0)); }
export function isLit(run, x, y) {
  const f = run.floor, p = f.player;
  if (cheb(x, y, p.x, p.y) <= lightRadius(run)) return true;
  return f.braziers.some((b) => b.lit && cheb(x, y, b.x, b.y) <= CFG.brazierLight);
}
export const intentVisible = (run, e) => e.type === 'pod' || ENEMIES[e.type].boss || isLit(run, e.x, e.y);
export const flareCd = (run) => Math.max(3, (L(run).flareCd ?? CFG.flareCd) - 2 * (run.relics.flint || 0));
export const leapCd = (run) => Math.max(2, (L(run).leapCd ?? CFG.leapCd) - (run.relics.spring ? 1 : 0));
export const leapDist = (run) => CFG.leapDist + (run.relics.spring ? 1 : 0);
export const bumpDmg = (run) => 1 + (run.relics.edge || 0) + (L(run).edge || 0);
export const creepAt = (run) => CFG.creepTurns * (isBossDepth(run.depth) ? 2 : 1) + (run.relics.steady ? CFG.steadyBonus : 0);

// ---------------------------------------------------------------- runs and floors
export function newRun({ seed = randomSeed(), lantern = 'brass', start = 1, daily = false } = {}) {
  const lan = LANTERNS[lantern] ? lantern : 'brass';
  const run = {
    v: 1, seed, lantern: lan, daily, start, depth: start, oil: LANTERNS[lan].oil, maxOil: LANTERNS[lan].oil, embers: 0, kills: 0,
    relics: {}, cd: { flare: 0, leap: 0 }, turns: 0, time: 0, phoenix: false, phase: 'play', killer: null, won: false, nextId: 1,
    stats: { pits: 0, hits: 0, flares: 0, leaps: 0, braziers: 0, bosses: 0, best: 0 }, floor: null,
  };
  if (start > 1) { // a waystone start: the seed hands out the relics a run would have found by then
    const R = rng(hash(seed, 'waystone', start)), n = Math.floor((start - 1) / 10) * 4;
    for (let i = 0; i < n; i++) takeRelic(run, offerRelics(run, R)[0]);
    run.oil = run.maxOil;
  }
  enterDepth(run, start);
  return run;
}

export function enterDepth(run, d) {
  run.depth = d; run.phase = 'play';
  run.floor = genFloor(run, d);
  run.cd.flare = 0; run.cd.leap = 0;
  if (run.relics.moss) run.oil = Math.min(run.maxOil, run.oil + run.relics.moss);
  run.floor.ward = !!run.relics.ward;
}

function makeEnemy(run, type, x, y) {
  const def = ENEMIES[type], cycle = Math.max(0, Math.floor((run.depth - 1) / CFG.depths));
  const hp = def.hp + (def.boss ? cycle * 4 : 0);
  return { id: run.nextId++, type, x, y, hp, max: hp, intent: null, stun: 0, cd: 0, face: [0, 1], sum: 0, awake: false, fuse: 0, next: 'ring' };
}

const T1 = ['#..S..#', '.......', '.__....', '.......', '....#..', '.......', '.......'];

function genFloor(run, d) {
  const R = rng(hash(run.seed, 'floor', d)), boss = isBossDepth(d);
  if (d === 1) { // the same gentle first floor for everyone: one flitter, one pit, one puddle of oil
    const f = blankFloor(7, 7, 3, 6, 3, 0);
    f.grid = T1.map((r) => r.split(''));
    f.items.push({ x: 5, y: 5, kind: 'oil' });
    f.enemies.push(makeEnemy(run, 'flitter', 4, 1));
    return f;
  }
  const n = boss ? 9 : d < 10 ? 7 : d < 20 ? 8 : 9;
  for (let tries = 0; tries < 60; tries++) {
    const ex = 1 + Math.floor(R() * (n - 2)), sx = 1 + Math.floor(R() * (n - 2));
    const f = blankFloor(n, n, ex, n - 1, sx, 0);
    const free = (x, y) => f.grid[y][x] === '.' && !(x === ex && y >= n - 2) && !(x === sx && y <= 1);
    const any = (fn, tries2 = 40) => { for (let i = 0; i < tries2; i++) { const x = Math.floor(R() * n), y = Math.floor(R() * n); if (fn(x, y)) return [x, y]; } return null; };
    if (boss) {
      for (const [x, y] of [[1, 2], [n - 2, 2], [1, n - 3], [n - 2, n - 3]]) f.grid[y][x] = '_';
      for (const [x, y] of [[2, 4], [n - 3, 4]]) f.grid[y][x] = '#';
    } else {
      const pillars = 2 + Math.floor(R() * (n - 4));
      for (let i = 0; i < pillars; i++) { const c = any(free); if (c) f.grid[c[1]][c[0]] = '#'; }
      const clusters = Math.min(4, 1 + Math.floor(d / 6));
      for (let i = 0; i < clusters; i++) {
        const c = any(free); if (!c) continue;
        const [dx, dy] = D4[Math.floor(R() * 4)], len = 1 + Math.floor(R() * 3);
        for (let k = 0; k < len; k++) { const x = c[0] + dx * k, y = c[1] + dy * k; if (x >= 0 && y >= 0 && x < n && y < n && free(x, y)) f.grid[y][x] = '_'; }
      }
      if (d >= 11) { const cracks = 2 + Math.floor(R() * 4); for (let i = 0; i < cracks; i++) { const c = any(free); if (c) f.grid[c[1]][c[0]] = '%'; } }
    }
    let nb = d < 4 ? 0 : boss ? 2 : R() < 0.6 ? 1 : 2;
    if (d >= 21 && !boss && R() < 0.35) { f.sealed = true; nb = Math.max(nb, 2) + (R() < 0.4 ? 1 : 0); }
    for (let i = 0; i < nb; i++) { const c = any((x, y) => free(x, y) && x > 0 && y > 0 && x < n - 1 && y < n - 1); if (c) { f.grid[c[1]][c[0]] = 'B'; f.braziers.push({ x: c[0], y: c[1], lit: false }); } }
    if (f.sealed && f.braziers.length < 2) continue;
    const oils = boss ? 2 : R() < 0.55 ? 1 : R() < 0.35 ? 2 : 0;
    for (let i = 0; i < oils; i++) { const c = any((x, y) => free(x, y) && !f.items.some((o) => o.x === x && o.y === y)); if (c) f.items.push({ x: c[0], y: c[1], kind: 'oil' }); }
    // everything that matters must be reachable on foot from the entrance
    const dist = bfs(f, ex, n - 1, (x, y) => floorish(tileAt(f, x, y)));
    const solid = bfs(f, ex, n - 1, (x, y) => { const t = tileAt(f, x, y); return t === '.' || t === 'S'; }); // as if every crack had collapsed
    const reach = (x, y) => dist[y * n + x] >= 0 && solid[y * n + x] >= 0;
    if (!reach(sx, 0)) continue;
    if (f.items.some((o) => !reach(o.x, o.y))) continue;
    if (f.braziers.some((b) => !D4.some(([dx, dy]) => tileAt(f, b.x + dx, b.y + dy) !== null && reach(b.x + dx, b.y + dy)))) continue;
    // shadows
    if (boss) {
      const b = makeEnemy(run, bossAt(d), Math.floor(n / 2), 2); f.enemies.push(b); f.boss = b.id;
    } else {
      const pool = Object.keys(ENEMIES).filter((k) => !ENEMIES[k].boss && ENEMIES[k].from <= d);
      let budget = CFG.budget[0] + d * CFG.budget[1];
      const cap = n === 7 ? 4 : n === 8 ? 6 : 8;
      while (budget >= 1 && f.enemies.length < cap) {
        const ok = pool.filter((k) => ENEMIES[k].cost <= budget); if (!ok.length) break;
        const w = ok.map((k) => (ENEMIES[k].from >= d - 4 ? 2.5 : 1)), tot = w.reduce((a, b) => a + b, 0);
        let r = R() * tot, type = ok[0];
        for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) { type = ok[i]; break; } }
        const c = any((x, y) => (f.grid[y][x] === '.' || f.grid[y][x] === '%') && man(x, y, ex, n - 1) >= 4 && !enemyAt(f, x, y) && !f.items.some((o) => o.x === x && o.y === y), 80);
        if (!c) break;
        f.enemies.push(makeEnemy(run, type, c[0], c[1]));
        budget -= ENEMIES[type].cost;
      }
    }
    return f;
  }
  return blankFloor(n, n, Math.floor(n / 2), n - 1, Math.floor(n / 2), 0); // never reached in practice: an empty floor is still playable
}

function blankFloor(w, h, px, py, sx, sy) {
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  grid[sy][sx] = 'S';
  return { w, h, grid, braziers: [], items: [], enemies: [], player: { x: px, y: py }, stairs: { x: sx, y: sy }, entry: { x: px, y: py }, turn: 0, sealed: false, boss: 0, ward: false };
}

export function bfs(f, x0, y0, pass) { // distance map (-1 = unreachable); pass(x, y) says which tiles can be walked
  const d = new Array(f.w * f.h).fill(-1), q = [[x0, y0]];
  d[y0 * f.w + x0] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h || d[ny * f.w + nx] >= 0 || !pass(nx, ny)) continue;
      d[ny * f.w + nx] = d[y * f.w + x] + 1; q.push([nx, ny]);
    }
  }
  return d;
}

// ---------------------------------------------------------------- shrines (relics), oil
export function offerRelics(run, R = rng(hash(run.seed, 'shrine', run.depth, run.rerolls || 0))) {
  const pool = Object.keys(RELICS).filter((k) => (run.relics[k] || 0) < RELICS[k].stack);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  return out;
}
export function takeRelic(run, id) {
  if (!RELICS[id] || (run.relics[id] || 0) >= RELICS[id].stack) return false;
  run.relics[id] = (run.relics[id] || 0) + 1;
  if (id === 'wick') { run.maxOil++; run.oil++; }
  return true;
}
export function buyOil(run) {
  if (run.embers < CFG.oilPrice || run.oil >= run.maxOil) return false;
  run.embers -= CFG.oilPrice; run.oil++; return true;
}

// ---------------------------------------------------------------- a turn
export function canAct(run, a) {
  if (run.phase !== 'play') return false;
  const f = run.floor, p = f.player;
  if (a.t === 'wait') return true;
  if (a.t === 'flare') return run.cd.flare <= 0;
  if (a.t === 'move') {
    const x = p.x + a.dx, y = p.y + a.dy, t = tileAt(f, x, y);
    if (t === null || t === '#' || t === '_') return false;
    if (t === 'B') return !brazierAt(f, x, y).lit;
    return true;
  }
  if (a.t === 'leap') {
    if (run.cd.leap > 0) return false;
    const k = leapDist(run), x = p.x + a.dx * k, y = p.y + a.dy * k;
    return floorish(tileAt(f, x, y)) && !enemyAt(f, x, y);
  }
  return false;
}

export function act(run, a) {
  if (!canAct(run, a)) return null;
  const f = run.floor, p = f.player, ev = [], ctx = { ph: 0 };
  const E = (o) => { o.ph = ctx.ph; ev.push(o); };
  run.cd.flare = Math.max(0, run.cd.flare - 1); run.cd.leap = Math.max(0, run.cd.leap - 1);
  run.turns++; f.turn++;
  if (a.t === 'move') {
    const x = p.x + a.dx, y = p.y + a.dy, e = enemyAt(f, x, y);
    if (e) bump(run, e, a.dx, a.dy, E);
    else if (tileAt(f, x, y) === 'B') {
      const b = brazierAt(f, x, y); b.lit = true; run.stats.braziers++;
      E({ t: 'brazier', x, y, dx: a.dx, dy: a.dy });
      if (run.relics.kin && run.oil < run.maxOil) { run.oil++; E({ t: 'oil', n: 1, x, y }); }
      if (f.sealed && f.braziers.every((q) => q.lit)) { f.sealed = false; E({ t: 'unseal', x: f.stairs.x, y: f.stairs.y }); }
    } else stepPlayer(run, x, y, 'move', E);
  } else if (a.t === 'wait') E({ t: 'wait', x: p.x, y: p.y });
  else if (a.t === 'flare') {
    run.cd.flare = flareCd(run); run.stats.flares++;
    const r = lightRadius(run) + 1;
    E({ t: 'flare', x: p.x, y: p.y, r });
    for (const e of [...f.enemies]) {
      if (e.hp <= 0 || cheb(e.x, e.y, p.x, p.y) > r) continue;
      e.intent = null; if (!ENEMIES[e.type].boss) e.stun = 1;
      if (e.type === 'pod') { e.awake = false; e.fuse = 0; }
      E({ t: 'stun', id: e.id, x: e.x, y: e.y });
      if (run.relics.sparks) hurt(run, e, 1, E);
    }
  } else if (a.t === 'leap') {
    const k = leapDist(run);
    run.cd.leap = leapCd(run); run.stats.leaps++;
    stepPlayer(run, p.x + a.dx * k, p.y + a.dy * k, 'leap', E);
  }
  if (run.phase === 'play') enemyPhase(run, E, ctx);
  return ev;
}

function stepPlayer(run, x, y, kind, E) {
  const f = run.floor, p = f.player, fx = p.x, fy = p.y;
  p.x = x; p.y = y;
  E({ t: kind, id: 'p', x, y, fx, fy });
  if (f.grid[fy][fx] === '%') { f.grid[fy][fx] = '_'; E({ t: 'crack', x: fx, y: fy }); }
  const it = f.items.findIndex((o) => o.x === x && o.y === y);
  if (it >= 0) {
    f.items.splice(it, 1);
    const n = Math.min(run.relics.lure ? 2 : 1, run.maxOil - run.oil);
    run.oil += n; E({ t: 'oil', n, x, y });
  }
  if (f.grid[y][x] === 'S') {
    if (stairsOpen(f)) { run.phase = 'descend'; E({ t: 'descend', x, y }); }
    else E({ t: 'sealed', x, y, boss: bossAlive(f) });
  }
}

function bump(run, e, dx, dy, E) {
  const def = ENEMIES[e.type], tx = e.x, ty = e.y;
  E({ t: 'bump', id: 'p', x: tx, y: ty, dx, dy, target: e.id });
  let dmg = bumpDmg(run);
  if (def.shield && e.face[0] === -dx && e.face[1] === -dy) { E({ t: 'block', id: e.id, x: tx, y: ty }); dmg = 0; }
  if (dmg) hurt(run, e, dmg, E);
  if (e.hp > 0 && !def.boss) push(run, e, dx, dy, run.relics.boots ? 2 : 1, E);
  if (run.relics.swing) for (const [sx, sy] of [[dy, dx], [-dy, -dx]]) { const o = enemyAt(run.floor, tx + sx, ty + sy); if (o) hurt(run, o, 1, E); }
}

function push(run, e, dx, dy, dist, E) {
  const f = run.floor, p = f.player;
  if (e.intent) { e.intent = null; E({ t: 'stagger', id: e.id, x: e.x, y: e.y }); }
  for (let i = 0; i < dist && e.hp > 0; i++) {
    const nx = e.x + dx, ny = e.y + dy, t = tileAt(f, nx, ny);
    if (t === null || t === '#' || t === 'B' || (nx === p.x && ny === p.y)) { E({ t: 'slam', id: e.id, x: e.x, y: e.y, dx, dy }); hurt(run, e, 1, E); return; }
    const o = enemyAt(f, nx, ny);
    if (o) { E({ t: 'clash', id: e.id, other: o.id, x: nx, y: ny }); hurt(run, e, 1, E); hurt(run, o, 1, E); return; }
    e.x = nx; e.y = ny; E({ t: 'push', id: e.id, x: nx, y: ny });
    if (t === '_') { E({ t: 'fall', id: e.id, x: nx, y: ny }); run.stats.pits++; kill(run, e, E, true); return; }
  }
}

function hurt(run, e, n, E) {
  if (e.hp <= 0) return;
  e.hp -= n; E({ t: 'dmg', id: e.id, n, x: e.x, y: e.y });
  if (e.hp <= 0) { if (e.type === 'pod') explode(run, e, E); else kill(run, e, E); }
}

function kill(run, e, E, fell = false) {
  const f = run.floor, def = ENEMIES[e.type];
  e.hp = 0; e.intent = null;
  f.enemies = f.enemies.filter((o) => o !== e);
  const n = def.ember + (run.relics.magnet || 0);
  run.embers += n; run.kills++;
  E({ t: 'die', id: e.id, type: e.type, x: e.x, y: e.y, fell });
  E({ t: 'ember', n, x: e.x, y: e.y });
  if (def.boss) {
    run.stats.bosses++;
    E({ t: 'boss_dead', id: e.id, type: e.type, x: e.x, y: e.y });
    if (run.depth === CFG.depths) run.won = true;
  }
}

function explode(run, e, E) {
  const f = run.floor, p = f.player, x = e.x, y = e.y;
  kill(run, e, E);
  E({ t: 'boom', x, y });
  for (const [dx, dy] of [[0, 0], ...D8]) {
    const tx = x + dx, ty = y + dy;
    if (tx === p.x && ty === p.y) hurtPlayer(run, 1, E, 'pod');
    const o = enemyAt(f, tx, ty); if (o) hurt(run, o, 1, E);
  }
}

function hurtPlayer(run, n, E, src, attacker = null, wardable = true) {
  if (run.phase === 'dead') return;
  const f = run.floor;
  if (wardable && f.ward) { f.ward = false; E({ t: 'ward', x: f.player.x, y: f.player.y }); return; }
  run.oil -= n; run.stats.hits++;
  E({ t: 'hurt', n, src, x: f.player.x, y: f.player.y });
  if (attacker && run.relics.thorns && attacker.hp > 0) hurt(run, attacker, 1, E);
  if (run.oil <= 0) {
    if (run.relics.phoenix && !run.phoenix) { run.phoenix = true; run.oil = 3; E({ t: 'phoenix', x: f.player.x, y: f.player.y }); }
    else { run.oil = 0; run.phase = 'dead'; run.killer = src; E({ t: 'death', src, x: f.player.x, y: f.player.y }); }
  }
}

function enemyPhase(run, E, ctx) {
  const f = run.floor, p = f.player;
  ctx.ph = 1; // strikes that were aimed last turn land now
  for (const e of [...f.enemies]) {
    if (e.hp <= 0 || run.phase !== 'play') continue;
    const def = ENEMIES[e.type];
    if (e.type === 'pod') { if (e.awake && --e.fuse <= 0) { e.intent = null; e.hp = 0; explode(run, e, E); } continue; }
    if (!e.intent) continue;
    const { tiles, kind } = e.intent; e.intent = null;
    E({ t: 'atk', id: e.id, tiles, kind, x: e.x, y: e.y });
    for (const [x, y] of tiles) {
      if (x === p.x && y === p.y) hurtPlayer(run, 1, E, e.type, e);
      else { const o = enemyAt(f, x, y); if (o && o !== e) hurt(run, o, 1, E); }
    }
    e.cd = def.rest ? def.rest + 1 : 0; // +1: the plan step later this same turn already counts one down
    if (def.atk === 'mix') e.next = e.next === 'ring' ? 'line4' : 'ring';
  }
  if (run.phase !== 'play') return;
  const creep = creepAt(run); // the lamp burns down if you linger
  if (f.turn > creep && (f.turn - creep) % CFG.creepEvery === 0) { E({ t: 'creep' }); hurtPlayer(run, 1, E, 'creep', null, false); if (run.phase !== 'play') return; }
  ctx.ph = 2; // shadows move and take aim
  for (const e of [...f.enemies]) {
    const def = ENEMIES[e.type];
    if (e.hp <= 0 || !def.boss || !def.summon) continue;
    if (++e.sum < def.every) continue;
    e.sum = 0;
    if (f.enemies.filter((o) => !ENEMIES[o.type].boss).length >= 3) continue;
    const spots = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (canStand(f, x, y) && cheb(x, y, p.x, p.y) >= 2 && cheb(x, y, e.x, e.y) <= 2 && f.grid[y][x] !== 'S') spots.push([x, y]);
    if (!spots.length) continue;
    const [x, y] = spots[(f.turn * 7 + e.id) % spots.length];
    const m = makeEnemy(run, def.summon, x, y); f.enemies.push(m);
    if (m.type === 'pod') { m.awake = true; m.fuse = CFG.podFuse; m.intent = { tiles: box3(f, x, y), kind: 'bomb' }; }
    E({ t: 'summon', id: m.id, type: m.type, x, y, by: e.id });
  }
  for (const e of [...f.enemies]) {
    if (e.hp <= 0) continue;
    if (e.stun > 0) { e.stun--; continue; }
    plan(run, e, E);
  }
}

const box3 = (f, x, y) => [[0, 0], ...D8].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => tileAt(f, a, b) !== null);
const ring8 = (f, x, y) => D8.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => tileAt(f, a, b) !== null);
const cross4 = (f, x, y) => D4.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => tileAt(f, a, b) !== null);
function lineTiles(f, x, y, dx, dy) {
  const out = [];
  for (let i = 1; ; i++) { const t = tileAt(f, x + dx * i, y + dy * i); if (t === null || t === '#' || t === 'B') break; out.push([x + dx * i, y + dy * i]); }
  return out;
}
function alignDir(f, e) { // a clear straight line from e to the player, or null
  const p = f.player;
  if (e.x !== p.x && e.y !== p.y) return null;
  const dx = Math.sign(p.x - e.x), dy = Math.sign(p.y - e.y);
  return lineTiles(f, e.x, e.y, dx, dy).some(([x, y]) => x === p.x && y === p.y) ? [dx, dy] : null;
}

function plan(run, e, E) {
  const f = run.floor, p = f.player, def = ENEMIES[e.type];
  if (e.type === 'pod') {
    if (!e.awake && cheb(e.x, e.y, p.x, p.y) <= 2) { e.awake = true; e.fuse = CFG.podFuse; E({ t: 'wake', id: e.id, x: e.x, y: e.y }); }
    if (e.awake) e.intent = { tiles: box3(f, e.x, e.y), kind: 'bomb' };
    return;
  }
  const resting = e.cd > 0; if (resting) e.cd--;
  const atk = def.atk === 'mix' ? e.next : def.atk;
  const adjGoal = (x, y) => man(x, y, p.x, p.y) === 1;
  if (atk === 'adj' || atk === 'cross') {
    if (man(e.x, e.y, p.x, p.y) !== 1) walk(run, e, adjGoal, def.move, E);
    if (!resting && man(e.x, e.y, p.x, p.y) === 1) {
      e.face = [p.x - e.x, p.y - e.y];
      e.intent = atk === 'adj' ? { tiles: [[p.x, p.y]], kind: 'adj' } : { tiles: cross4(f, e.x, e.y), kind: 'cross' };
    }
  } else if (atk === 'line') {
    const dir = alignDir(f, e);
    if (!dir) walk(run, e, (x, y) => (x === p.x || y === p.y) && man(x, y, p.x, p.y) >= 2, def.move, E);
    else if (!resting) e.intent = { tiles: lineTiles(f, e.x, e.y, dir[0], dir[1]), kind: 'line' };
  } else if (atk === 'ring') {
    if (cheb(e.x, e.y, p.x, p.y) > 1) walk(run, e, (x, y) => cheb(x, y, p.x, p.y) === 1, def.move, E);
    if (!resting && cheb(e.x, e.y, p.x, p.y) <= 1) e.intent = { tiles: ring8(f, e.x, e.y), kind: 'ring' };
  } else if (atk === 'line4') {
    if (resting) walk(run, e, (x, y) => cheb(x, y, p.x, p.y) <= 2, 1, E);
    else e.intent = { tiles: D4.flatMap(([dx, dy]) => lineTiles(f, e.x, e.y, dx, dy)), kind: 'line4' };
  }
}

function walk(run, e, goal, steps, E) { // up to `steps` tiles along the shortest path to any goal tile
  const f = run.floor, def = ENEMIES[e.type];
  for (let s = 0; s < steps; s++) {
    if (def.still && isLit(run, e.x, e.y)) return; // glooms freeze in any light
    if (goal(e.x, e.y)) return;
    const from = bfs(f, e.x, e.y, (x, y) => canStand(f, x, y));
    let best = -1, bd = 1e9;
    for (let i = 0; i < from.length; i++) if (from[i] > 0 && from[i] < bd && goal(i % f.w, Math.floor(i / f.w))) { bd = from[i]; best = i; }
    if (best < 0) return;
    let cx = best % f.w, cy = Math.floor(best / f.w); // walk back to the first step
    while (from[cy * f.w + cx] > 1) {
      for (const [dx, dy] of D4) { const nx = cx + dx, ny = cy + dy; if (tileAt(f, nx, ny) !== null && from[ny * f.w + nx] === from[cy * f.w + cx] - 1) { cx = nx; cy = ny; break; } }
    }
    e.face = [Math.sign(cx - e.x), Math.sign(cy - e.y)];
    e.x = cx; e.y = cy; E({ t: 'emove', id: e.id, x: cx, y: cy });
  }
}

// ---------------------------------------------------------------- bot (autoplay, trailer footage, balance tests)
const ACTIONS = [{ t: 'wait' }, { t: 'flare' }, ...D4.map(([dx, dy]) => ({ t: 'move', dx, dy })), ...D4.map(([dx, dy]) => ({ t: 'leap', dx, dy }))];
const clone = (o) => JSON.parse(JSON.stringify(o));

// opt.fair: only see what the player sees (lit intents); opt.noise: chance of a weaker pick; opt.rand: random source
export function botAction(run, opt = {}) {
  const rand = opt.rand || Math.random, scored = [];
  for (const a of ACTIONS) {
    if (!canAct(run, a)) continue;
    const c = clone(run), ev = act(c, a);
    let v = score(run, c, a, ev, opt);
    if (opt.deep && c.phase === 'play') { // two-step lookahead (balance tests): the best follow-up counts too
      let best = -1e9;
      for (const b of ACTIONS) { if (!canAct(c, b)) continue; const d = clone(c), ev2 = act(d, b); best = Math.max(best, score(c, d, b, ev2, opt)); }
      v = v * 0.4 + best * 0.6;
    }
    scored.push({ a, s: v });
  }
  scored.sort((x, y) => y.s - x.s);
  if (opt.noise && scored.length > 1 && rand() < opt.noise) return scored[1 + Math.floor(rand() * Math.min(2, scored.length - 1))].a;
  return scored[0]?.a || { t: 'wait' };
}

function score(before, c, a, ev, opt) {
  if (c.phase === 'dead') return -1e6;
  const f = c.floor, p = f.player, foes = f.enemies.filter((e) => e.hp > 0);
  let s = c.oil * 40 + c.embers * 3 + (c.won && !before.won ? 500 : 0);
  s -= foes.reduce((t, e) => t + e.hp * (ENEMIES[e.type].boss ? 6 : 4), 0);
  if (c.phase === 'descend') {
    const left = foes.filter((e) => e.type !== 'pod').length;
    return s + 60 - left * 5 + (f.turn > creepAt(c) - 6 ? 80 : 0) + (c.oil <= 2 ? 60 : 0);
  }
  const hits = (x, y, vis) => foes.filter((e) => e.intent && (vis || !opt.fair || intentVisible(c, e)) && e.intent.tiles.some(([tx, ty]) => tx === x && ty === y)).length;
  const threat = hits(p.x, p.y);
  if (threat) {
    let escape = false;
    for (const [dx, dy] of D4) { const x = p.x + dx, y = p.y + dy; if (floorish(tileAt(f, x, y)) && !enemyAt(f, x, y) && !hits(x, y, false)) escape = true; }
    s -= threat * (escape ? 4 : 30);
  }
  if (opt.fair) s -= foes.filter((e) => e.intent && !intentVisible(c, e) && man(e.x, e.y, p.x, p.y) <= 1).length * 8; // unseen shadow next to me
  const pass = (x, y) => floorish(tileAt(f, x, y)) || (tileAt(f, x, y) === 'B' && !brazierAt(f, x, y).lit);
  const dist = bfs(f, p.x, p.y, pass), at = (x, y) => (dist[y * f.w + x] < 0 ? 25 : dist[y * f.w + x]);
  const ds = at(f.stairs.x, f.stairs.y);
  if (!bossAlive(f)) s -= ds * (foes.length && c.oil > 2 && f.turn < 20 ? 1 : 6);
  else { const near = Math.min(...foes.map((e) => man(e.x, e.y, p.x, p.y))); s -= near * 1.5; }
  if (f.sealed) { const b = f.braziers.filter((q) => !q.lit).map((q) => at(q.x, q.y)); s -= (b.length ? Math.min(...b) : 0) * 4 + b.length * 80; }
  if (c.oil < c.maxOil && f.items.length) s -= Math.min(...f.items.map((o) => Math.max(0, at(o.x, o.y)))) * 2;
  if (a.t === 'flare') s -= threat ? 2 : 14;
  if (a.t === 'leap') s -= 6;
  if (a.t === 'wait') s -= 3;
  return s;
}

// shrine picks for the bot: a fixed taste, good enough to judge balance
const BOT_TASTE = ['wick', 'edge', 'glass', 'ward', 'thorns', 'phoenix', 'moss', 'boots', 'flint', 'swing', 'kin', 'sparks', 'lure', 'spring', 'steady', 'magnet'];
export function botShrine(run) {
  const offer = offerRelics(run);
  offer.sort((a, b) => BOT_TASTE.indexOf(a) - BOT_TASTE.indexOf(b));
  takeRelic(run, offer[0]);
  while (buyOil(run));
}
