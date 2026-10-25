// Tumblewool rules: pure simulation (no DOM, no THREE). The island is a grid of cells; tilting it pulls every
// loose body (round sheep and hay bales) the same way. game.js renders the world and reacts to w.events;
// tools and tests can run it headless in Node.
//
// Cell legend (levels.js):
//   ' ' void          '.' grass         '#' hedge (solid)   'T' tree (solid)   'r' rock (solid)
//   'H' barn house    'B' barn pen (goal for sheep)           'S' sheep start    'O' hay bale start
//   'c' clover        'm' mud (slow)    'i' ice (slippery)  'x' thin ice (breaks after something rolls off it)
//   'o' mushroom bumper                 'p' plate socket: a bale rolled onto it locks in and keeps the gates open;
//                                       a sheep on it holds them open only while it stays   'g' gate
//   '>' '<' '^' 'v' wind fan (solid, blows along its arrow)

export const SIM = {
  gravity: 10.5,      // cells/s² at full tilt
  baleGravity: 0.8,   // bales are heavier to get going
  tiltRate: 7,        // how fast the island follows the input (1/s)
  maxSpeed: 7.5,
  sheepR: 0.36, baleR: 0.42, baleMass: 2.5,
  friction: { '.': 1.3, S: 1.3, O: 1.3, c: 1.3, p: 1.3, o: 1.3, m: 7.5, i: 0.12, x: 0.12, B: 4, g: 1.3 },
  wallBounce: 0.32, bodyBounce: 0.5,
  bumperR: 0.3, bumperBounce: 1.15, bumperKick: 4.6,
  respawn: 1.35,      // seconds a fallen sheep takes to float back to its start
  crackDelay: 0.3,    // thin ice gives way this long after a body rolls off it
  refreeze: 6,        // ...and freezes over again after this long, so a level never becomes unsolvable
  fanForce: 7.5, fanReach: 5,
};

const SOLID = '#TrH<>^v';
const FAN = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], v: [0, 1] };

export function parseLevel(def) {
  const rows = def.rows, H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const grid = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) grid.push(rows[z][x] ?? ' ');
  return { W, H, grid };
}

export function createWorld(def) {
  const { W, H, grid } = parseLevel(def);
  const w = {
    def, W, H, grid, tx: 0, tz: 0, time: 0, won: false, events: [],
    bodies: [], clovers: [], plates: [], gates: [], bumpers: [], fans: [], cracks: new Map(),
    gateOpen: false, sheepTotal: 0, home: 0, cloversTaken: 0, falls: 0, fanField: null,
  };
  let id = 0;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = grid[z * W + x], cx = x + 0.5, cz = z + 0.5;
    if (c === 'S' || c === 'O') {
      const sheep = c === 'S';
      w.bodies.push({ id: id++, kind: sheep ? 'sheep' : 'bale', x: cx, z: cz, vx: 0, vz: 0, sx: cx, sz: cz,
        r: sheep ? SIM.sheepR : SIM.baleR, m: sheep ? 1 : SIM.baleMass, state: 'roll', t: 0, cell: z * W + x, slot: -1 });
      if (sheep) w.sheepTotal++;
    }
    if (c === 'c') w.clovers.push({ x: cx, z: cz, taken: false });
    if (c === 'p') w.plates.push(z * W + x);
    if (c === 'g') w.gates.push(z * W + x);
    if (c === 'o') w.bumpers.push({ x: cx, z: cz, hit: 0 });
    if (FAN[c]) w.fans.push({ x, z, dir: FAN[c] });
    if (c === 'x') w.cracks.set(z * W + x, { stepped: false, t: 0 });
  }
  buildFanField(w);
  return w;
}

export const cellAt = (w, x, z) => (x < 0 || z < 0 || x >= w.W || z >= w.H ? ' ' : w.grid[z * w.W + x]);
export function isSolid(w, x, z) { const c = cellAt(w, x, z); return SOLID.includes(c) || (c === 'g' && !w.gateOpen); }
export const isVoid = (w, x, z) => cellAt(w, x, z) === ' ';

function buildFanField(w) {
  w.fanField = new Float32Array(w.W * w.H * 2);
  for (const f of w.fans) {
    for (let k = 1; k <= SIM.fanReach; k++) {
      const x = f.x + f.dir[0] * k, z = f.z + f.dir[1] * k;
      if (x < 0 || z < 0 || x >= w.W || z >= w.H || isSolid(w, x, z)) break;
      const s = SIM.fanForce * (1 - ((k - 1) / SIM.fanReach) * 0.55), i = (z * w.W + x) * 2;
      w.fanField[i] += f.dir[0] * s; w.fanField[i + 1] += f.dir[1] * s;
    }
  }
}

// One fixed step. input = {x, y} on the unit disk: +x tips the right side down, +y tips the near side down.
export function step(w, input, dt) {
  let ix = input?.x || 0, iy = input?.y || 0; const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  const k = Math.min(1, dt * SIM.tiltRate);
  w.tx += (ix - w.tx) * k; w.tz += (iy - w.tz) * k;
  if (w.won) return;
  w.time += dt;
  updateGates(w);
  const rolling = w.bodies.filter((b) => b.state === 'roll'), solid = w.bodies.filter((b) => b.state === 'roll' || b.state === 'set');
  for (const b of rolling) {
    const cx = Math.floor(b.x), cz = Math.floor(b.z), ci = cz * w.W + cx, c = cellAt(w, cx, cz);
    const g = SIM.gravity * (b.kind === 'bale' ? SIM.baleGravity : 1);
    let ax = g * w.tx, az = g * w.tz;
    if (ci >= 0 && ci < w.W * w.H) { ax += w.fanField[ci * 2]; az += w.fanField[ci * 2 + 1]; }
    if (b.kind === 'bale' && c === 'p') { ax += (cx + 0.5 - b.x) * 30; az += (cz + 0.5 - b.z) * 30; } // the socket's dip pulls a bale in
    b.vx += ax * dt; b.vz += az * dt;
    const f = 1 / (1 + (SIM.friction[c] ?? 1.3) * (b.kind === 'bale' ? 1.4 : 1) * dt);
    b.vx *= f; b.vz *= f;
    const sp = Math.hypot(b.vx, b.vz); if (sp > SIM.maxSpeed) { b.vx *= SIM.maxSpeed / sp; b.vz *= SIM.maxSpeed / sp; }
    b.x += b.vx * dt; b.z += b.vz * dt;
    if (ci !== b.cell) {
      if (c === 'm' && sp > 1) w.events.push({ t: 'mud', id: b.id });
      b.cell = ci;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const b of rolling) { collideWalls(w, b, pass === 0); collideBumpers(w, b, pass === 0); }
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) collideBodies(w, solid[i], solid[j], pass === 0);
  }
  // support, goals and pickups
  const occupied = new Set();
  for (const b of rolling) {
    const cx = Math.floor(b.x), cz = Math.floor(b.z), c = cellAt(w, cx, cz), ci = cz * w.W + cx;
    if (c === ' ') { b.state = 'fall'; b.t = 0; w.falls++; w.events.push({ t: 'fall', id: b.id, kind: b.kind }); continue; }
    if (c === 'x') {
      occupied.add(ci); const cr = w.cracks.get(ci);
      if (!cr.stepped) { cr.stepped = true; w.events.push({ t: 'crack', cell: ci }); }
    }
    if (b.kind === 'bale' && c === 'p' && Math.hypot(cx + 0.5 - b.x, cz + 0.5 - b.z) < 0.22 && !w.bodies.some((o) => o.state === 'set' && o.cell === ci)) {
      b.state = 'set'; b.x = cx + 0.5; b.z = cz + 0.5; b.vx = b.vz = 0; b.cell = ci; w.events.push({ t: 'set', id: b.id }); continue;
    }
    if (b.kind === 'sheep') {
      if (c === 'B') { b.state = 'home'; b.slot = w.home++; b.t = 0; w.events.push({ t: 'home', id: b.id, n: w.home }); continue; }
      for (const cl of w.clovers) {
        if (!cl.taken && Math.hypot(cl.x - b.x, cl.z - b.z) < 0.55) { cl.taken = true; w.cloversTaken++; w.events.push({ t: 'clover', x: cl.x, z: cl.z, n: w.cloversTaken }); }
      }
    }
  }
  for (const [ci, cr] of w.cracks) {
    if (cr.broken) {
      cr.t += dt;
      if (cr.t >= SIM.refreeze && !w.bodies.some((b) => b.state === 'roll' && Math.floor(b.z) * w.W + Math.floor(b.x) === ci)) {
        cr.broken = cr.stepped = false; cr.t = 0; w.grid[ci] = 'x'; w.events.push({ t: 'refreeze', cell: ci });
      }
      continue;
    }
    if (!cr.stepped) continue;
    if (occupied.has(ci)) { cr.t = 0; continue; }
    cr.t += dt;
    if (cr.t >= SIM.crackDelay) { w.grid[ci] = ' '; cr.broken = true; cr.t = 0; w.events.push({ t: 'break', cell: ci }); }
  }
  for (const b of w.bodies) {
    if (b.state === 'fall') {
      b.t += dt;
      if (b.t >= SIM.respawn) {
        b.state = 'roll'; b.x = b.sx; b.z = b.sz; b.vx = b.vz = 0; b.t = 0; b.cell = -1;
        for (const o of w.bodies) if (o !== b && o.state === 'roll' && Math.hypot(o.x - b.x, o.z - b.z) < o.r + b.r) { o.x += 0.01; } // collide() separates them
        w.events.push({ t: 'respawn', id: b.id, kind: b.kind });
      }
    } else if (b.state === 'home') b.t += dt;
  }
  if (w.home >= w.sheepTotal && !w.won) { w.won = true; w.events.push({ t: 'win' }); }
}

function updateGates(w) {
  if (!w.plates.length) return;
  let pressed = false;
  for (const b of w.bodies) if ((b.state === 'roll' || b.state === 'set') && w.plates.includes(Math.floor(b.z) * w.W + Math.floor(b.x))) pressed = true;
  if (pressed === w.gateOpen) return;
  if (!pressed) { // never close a gate on top of something
    for (const b of w.bodies) {
      if (b.state !== 'roll') continue;
      for (const gi of w.gates) {
        const gx = gi % w.W, gz = (gi / w.W) | 0;
        const px = Math.max(gx, Math.min(gx + 1, b.x)), pz = Math.max(gz, Math.min(gz + 1, b.z));
        if (Math.hypot(b.x - px, b.z - pz) < b.r) return;
      }
    }
  }
  w.gateOpen = pressed; buildFanField(w);
  w.events.push({ t: 'gate', open: pressed });
}

function bounce(w, b, nx, nz, e, loud, kind) {
  const vn = b.vx * nx + b.vz * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz;
  if (loud && -vn > 1.3) w.events.push({ t: 'bump', id: b.id, kind: b.kind, speed: -vn, on: kind });
  return -vn;
}

function collideWalls(w, b, loud) {
  const r = b.r;
  for (let z = Math.floor(b.z - r); z <= Math.floor(b.z + r); z++) for (let x = Math.floor(b.x - r); x <= Math.floor(b.x + r); x++) {
    if (!isSolid(w, x, z)) continue;
    const px = Math.max(x, Math.min(x + 1, b.x)), pz = Math.max(z, Math.min(z + 1, b.z));
    let dx = b.x - px, dz = b.z - pz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    let nx, nz, push;
    if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = r - d; }
    else { // centre inside the cell: leave by the nearest face
      const opts = [[b.x - x, -1, 0], [x + 1 - b.x, 1, 0], [b.z - z, 0, -1], [z + 1 - b.z, 0, 1]].sort((a, c) => a[0] - c[0]);
      [, nx, nz] = opts[0]; push = opts[0][0] + r;
    }
    b.x += nx * push; b.z += nz * push;
    bounce(w, b, nx, nz, SIM.wallBounce, loud, cellAt(w, x, z));
  }
}

function collideBumpers(w, b, loud) {
  for (const m of w.bumpers) {
    const dx = b.x - m.x, dz = b.z - m.z, d = Math.hypot(dx, dz), min = b.r + SIM.bumperR;
    if (d >= min || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d; b.x = m.x + nx * min; b.z = m.z + nz * min;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) { b.vx -= (1 + SIM.bumperBounce) * vn * nx; b.vz -= (1 + SIM.bumperBounce) * vn * nz; }
    const out = b.vx * nx + b.vz * nz;
    if (out < SIM.bumperKick) { b.vx += (SIM.bumperKick - out) * nx; b.vz += (SIM.bumperKick - out) * nz; }
    if (loud && m.hit <= w.time - 0.15) w.events.push({ t: 'boing', x: m.x, z: m.z });
    m.hit = w.time;
  }
}

function collideBodies(w, a, b, loud) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
  if (d >= min) return;
  const ia = a.state === 'set' ? 0 : 1 / a.m, ib = b.state === 'set' ? 0 : 1 / b.m, im = ia + ib; // a set bale doesn't move
  if (!im) return;
  const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0, over = min - d;
  a.x -= nx * over * ia / im; a.z -= nz * over * ia / im;
  b.x += nx * over * ib / im; b.z += nz * over * ib / im;
  const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (vn >= 0) return;
  const j = (-(1 + SIM.bodyBounce) * vn) / im;
  a.vx -= j * ia * nx; a.vz -= j * ia * nz; b.vx += j * ib * nx; b.vz += j * ib * nz;
  if (loud && -vn > 1.6) w.events.push({ t: 'bump', id: a.id, other: b.id, kind: a.kind, speed: -vn, on: b.kind });
}

export function stars(w) {
  const par = w.def.par ?? 60;
  return { home: w.won, clovers: w.cloversTaken >= w.clovers.length, par: w.won && w.time <= par };
}

// ---------------------------------------------------------------- bot (trailer footage, level tests)
// Dijkstra fields over walkable cells, with a cost for cells next to an edge. Each body wants to roll toward
// the next cell downhill in its field; their wishes (weighted toward the body furthest along) set the tilt.
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function walkable(w, x, z) { const c = cellAt(w, x, z); return c !== ' ' && !isSolid(w, x, z); }
function field(w, targets, forBale) {
  const n = w.W * w.H, dist = new Float32Array(n).fill(Infinity), open = [];
  for (const t of targets) { dist[t] = 0; open.push(t); }
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0], cx = cur % w.W, cz = (cur / w.W) | 0;
    for (const [dx, dz] of NB) {
      const x = cx + dx, z = cz + dz;
      if (!walkable(w, x, z)) continue;
      if (dx && dz && (!walkable(w, cx + dx, cz) || !walkable(w, cx, cz + dz))) continue;
      const c = cellAt(w, x, z);
      if (forBale === false && c === 'B') continue;
      let cost = dx && dz ? 1.42 : 1;
      for (const [ex, ez] of NB) if (isVoid(w, x + ex, z + ez)) { cost += ex && ez ? 1.5 : 3; }
      if (c === 'x') cost += 0.5; if (c === 'm') cost += 1.5; if (c === 'o') cost += 2;
      const ni = z * w.W + x, nd = dist[cur] + cost;
      if (nd < dist[ni]) { if (dist[ni] === Infinity) open.push(ni); dist[ni] = nd; }
    }
  }
  return dist;
}
export function botInput(w) {
  const key = `${w.gateOpen}|${w.grid.join('')}|${w.clovers.filter((c) => !c.taken).length}|${w.bodies.filter((b) => b.state === 'set').length}`;
  if (w._botKey !== key) {
    w._botKey = key;
    const barn = [], plates = [], clovers = [];
    w.grid.forEach((c, i) => { if (c === 'B') barn.push(i); });
    for (const p of w.plates) plates.push(p);
    for (const c of w.clovers) if (!c.taken) clovers.push(Math.floor(c.z) * w.W + Math.floor(c.x));
    const free = plates.filter((p) => !w.bodies.some((b) => b.state === 'set' && b.cell === p));
    w._fBarn = field(w, barn); w._fPlate = free.length ? field(w, free) : null; w._fClover = clovers.length ? field(w, clovers, false) : null;
  }
  let wx = 0, wz = 0, wsum = 0, lead = null, leadD = Infinity;
  const wishes = [];
  const live = w.bodies.filter((b) => b.state === 'roll');
  const ci = (b) => Math.floor(b.z) * w.W + Math.floor(b.x);
  const stuck = live.some((b) => b.kind === 'sheep' && w._fBarn[ci(b)] === Infinity);
  const baleJob = stuck && w._fPlate && live.some((b) => b.kind === 'bale' && w._fPlate[ci(b)] < Infinity);
  for (const b of live) {
    let f, ride = false;
    if (b.kind === 'bale') { if (!baleJob) continue; f = w._fPlate; }
    else if (baleJob) { f = w._fBarn; ride = true; } // sheep ride along; only edge brakes count
    else if (stuck && w._fPlate) f = w._fPlate;
    else if (w._fClover && w._fClover[ci(b)] < 9 && w._fClover[ci(b)] < w._fBarn[ci(b)] + 6) f = w._fClover;
    else f = w._fBarn;
    const here = f[ci(b)];
    if (ride || here === Infinity) {
      const px = b.x + b.vx * 0.4, pz = b.z + b.vz * 0.4;
      if (isVoid(w, Math.floor(px), Math.floor(pz))) { wx += -b.vx * 3 * 3; wz += -b.vz * 3 * 3; wsum += 3; }
      continue;
    }
    const cx = Math.floor(b.x), cz = Math.floor(b.z);
    let best = here, tx = cx + 0.5, tz = cz + 0.5;
    for (const [dx, dz] of NB) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= w.W || z >= w.H) continue;
      if (dx && dz && (!walkable(w, cx + dx, cz) || !walkable(w, cx, cz + dz))) continue;
      const v = f[z * w.W + x]; if (v < best) { best = v; tx = x + 0.5; tz = z + 0.5; }
    }
    // aim a bit past the next cell centre so the body flows, but slow down near edges
    let dx = tx - b.x, dz = tz - b.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let danger = 0; for (const [ex, ez] of NB) if (isVoid(w, cx + ex, cz + ez)) danger++;
    const want = danger ? 1.5 : 2.6, gain = 1.6;
    let ax = (dx * want - b.vx) * gain, az = (dz * want - b.vz) * gain;
    // look ahead: about to roll off an edge? brake hard
    const px = b.x + b.vx * 0.32, pz = b.z + b.vz * 0.32;
    if (isVoid(w, Math.floor(px), Math.floor(pz))) { ax = -b.vx * 3; az = -b.vz * 3; }
    const brake = isVoid(w, Math.floor(px), Math.floor(pz));
    wishes.push({ b, ax, az, brake, d: here });
    if (!brake && here < leadD) { leadD = here; lead = b; }
  }
  // one leader steers (the body closest to its goal, kept for a while so it doesn't flip-flop); the rest only brake
  const keep = w.bodies.find((b) => b.id === w._botLead && b.state === 'roll');
  if (keep && wishes.some((q) => q.b === keep && !q.brake)) lead = keep;
  w._botLead = lead?.id;
  for (const q of wishes) {
    const weight = q.brake ? 2.5 : q.b === lead ? 1 : 0.12;
    wx += q.ax * weight; wz += q.az * weight; wsum += weight;
  }
  if (!wsum) return { x: 0, y: 0 };
  const g = SIM.gravity; let x = wx / wsum / g * 1.6, y = wz / wsum / g * 1.6; const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y };
}
