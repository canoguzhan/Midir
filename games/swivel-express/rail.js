// Swivel Express rail rules: boards, track geometry, path tracing and route planning (pure: no DOM, no THREE).
// The board is a grid of square tiles. x grows to the right (column i), z toward the camera (row j).
// Sides: 0 = N (away from the camera), 1 = E, 2 = S, 3 = W. A tile's track is a bit mask of the sides it opens to.
export const TS = 2; // tile size in world units
export const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
export const opp = (d) => (d + 2) & 3;

// One colour per station, each with its own symbol (and hat shape on the passengers), so colour is never the only cue.
export const COLORS = [
  { id: 'red', hex: '#ff5a4e', sym: 'circle' },
  { id: 'blue', hex: '#3f9bff', sym: 'square' },
  { id: 'green', hex: '#3fcf6e', sym: 'triangle' },
  { id: 'violet', hex: '#b27bff', sym: 'diamond' },
];

export function rng(seed) { // mulberry32: the same board for the same seed every time
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- tiles
const BASE = { straight: 0b0101, curve: 0b0011, end: 0b0001 }; // rot 0: straight N-S, curve N-E, end opens N
export const rotMask = (m, r) => { for (let k = 0; k < (r & 3); k++) m = ((m << 1) | (m >> 3)) & 15; return m; };
export const maskOf = (t) => (t?.shape ? rotMask(BASE[t.shape], t.rot) : 0);
export const turnable = (t) => !!t?.shape && !t.fixed; // the player may swivel it
function shapeFromMask(m) {
  if (m === 0b0101) return ['straight', 0];
  if (m === 0b1010) return ['straight', 1];
  for (let r = 0; r < 4; r++) if (rotMask(BASE.curve, r) === m) return ['curve', r];
  return [null, 0];
}
// the rotation of `shape` that joins sides a and e (null if it cannot)
export function rotJoining(shape, a, e) {
  const want = (1 << a) | (1 << e);
  for (let r = 0; r < 4; r++) if (rotMask(BASE[shape], r) === want) return r;
  return null;
}
// side a train leaves by after entering tile t through side a: -1 dead end, -2 into a tunnel
export function exitFor(t, a) {
  if (!t?.shape) return -1;
  const m = maskOf(t);
  if (!((m >> a) & 1)) return -1;
  if (t.shape === 'end') return -2;
  if (t.shape === 'straight') return opp(a);
  for (let d = 0; d < 4; d++) if (d !== a && (m >> d) & 1) return d;
  return -1;
}

// ---------------------------------------------------------------- geometry
export const tileAt = (b, i, j) => (i < 0 || j < 0 || i >= b.cols || j >= b.rows ? null : b.tiles[j * b.cols + i]);
export const centerOf = (b, i, j) => ({ x: (i - (b.cols - 1) / 2) * TS, z: (j - (b.rows - 1) / 2) * TS });
export function tileFromXZ(b, x, z) {
  const i = Math.round(x / TS + (b.cols - 1) / 2), j = Math.round(z / TS + (b.rows - 1) / 2);
  return tileAt(b, i, j);
}
// A segment is the stretch of track inside one tile, from side a (or the centre, -1) to side e (or the centre, -1).
export function segment(b, i, j, a, e) {
  const c = centerOf(b, i, j), h = TS / 2;
  const mid = (d) => (d < 0 ? { x: c.x, z: c.z } : { x: c.x + DX[d] * h, z: c.z + DZ[d] * h });
  const p0 = mid(a), p1 = mid(e), seg = { i, j, a, e };
  if (a < 0 || e < 0 || a === opp(e)) return Object.assign(seg, { line: true, x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z, len: Math.hypot(p1.x - p0.x, p1.z - p0.z) });
  const cx = c.x + (DX[a] + DX[e]) * h, cz = c.z + (DZ[a] + DZ[e]) * h;
  const a0 = Math.atan2(p0.z - cz, p0.x - cx); let da = Math.atan2(p1.z - cz, p1.x - cx) - a0;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Object.assign(seg, { line: false, cx, cz, r: h, a0, da, len: h * Math.abs(da) });
}
export function segPos(seg, s, out = {}) { // position and heading (yaw: 0 faces +z) at distance s along a segment
  const k = Math.max(0, Math.min(1, s / seg.len));
  if (seg.line) {
    out.x = seg.x0 + (seg.x1 - seg.x0) * k; out.z = seg.z0 + (seg.z1 - seg.z0) * k;
    out.yaw = Math.atan2(seg.x1 - seg.x0, seg.z1 - seg.z0);
  } else {
    const th = seg.a0 + seg.da * k, sg = Math.sign(seg.da);
    out.x = seg.cx + Math.cos(th) * seg.r; out.z = seg.cz + Math.sin(th) * seg.r;
    out.yaw = Math.atan2(-Math.sin(th) * sg, Math.cos(th) * sg);
  }
  return out;
}

// Follow the track from the end of `seg` for up to maxTiles tiles. Returns the segments ahead and how it ends:
// { segs, dead: { x, z, i, j } | null } where dead is the edge the train would fall off.
export function traceAhead(b, seg, maxTiles = 14) {
  const segs = []; let i = seg.i, j = seg.j, e = seg.e;
  for (let n = 0; n < maxTiles; n++) {
    if (e < 0) { // finished a tunnel entry: come out of the paired portal
      const t = tileAt(b, i, j), p = b.portals[t.pair]; i = p.i; j = p.j; e = tileAt(b, i, j).rot;
      const s = segment(b, i, j, -1, e); s.tunnel = true; segs.push(s); continue;
    }
    const ni = i + DX[e], nj = j + DZ[e], t = tileAt(b, ni, nj), a = opp(e), x = exitFor(t, a);
    if (x === -1) { const c = centerOf(b, i, j); return { segs, dead: { x: c.x + DX[e] * TS / 2, z: c.z + DZ[e] * TS / 2, i: ni, j: nj, side: a } }; }
    const s = segment(b, ni, nj, a, x === -2 ? -1 : x); segs.push(s); i = ni; j = nj; e = x === -2 ? -1 : x;
  }
  return { segs, dead: null };
}

// Breadth-first route search for the bot: from entering tile (i, j) through side a, which stations can the train reach
// if it may swivel turnable tiles on the way? A route never uses a tile twice. Returns every reached node; node.prev
// links back to the start and node.rot is the rotation that tile needs (null when it stays as it is).
const onRoute = (n, idx) => { for (let q = n; q; q = q.prev) if (q.tile?.idx === idx) return true; return false; };
export function planRoutes(b, i, j, a, { fixedAt = () => false, blocked = () => false, maxDepth = 24 } = {}) {
  const out = [], seen = new Set(), q = [{ i, j, a, depth: 1, prev: null, rot: null }];
  while (q.length) {
    const n = q.shift(), t = tileAt(b, n.i, n.j);
    if (!t?.shape || seen.has(t.idx * 4 + n.a) || blocked(t, n.depth) || onRoute(n.prev, t.idx)) continue;
    let opts = [];
    if (t.shape === 'end') {
      if (t.rot !== n.a) continue;
      const p = b.portals[t.pair], pt = tileAt(b, p.i, p.j);
      seen.add(t.idx * 4 + n.a); n.tile = t; out.push(n);
      if (n.depth < maxDepth) q.push({ i: p.i + DX[pt.rot], j: p.j + DZ[pt.rot], a: opp(pt.rot), depth: n.depth + 2, prev: n, rot: null });
      continue;
    }
    if (!turnable(t) || fixedAt(t, n.depth)) { const e = exitFor(t, n.a); if (e >= 0) opts.push([e, null]); }
    else if (t.shape === 'straight') opts.push([opp(n.a), rotJoining('straight', n.a, opp(n.a))]);
    else for (const e of [(n.a + 1) & 3, (n.a + 3) & 3]) opts.push([e, rotJoining('curve', n.a, e)]);
    if (!opts.length) continue;
    seen.add(t.idx * 4 + n.a);
    for (const [e, rot] of opts) {
      const node = { ...n, tile: t, rot, e };
      out.push(node);
      if (node.depth < maxDepth) q.push({ i: n.i + DX[e], j: n.j + DZ[e], a: opp(e), depth: n.depth + 1, prev: node, rot: null });
    }
  }
  return out;
}

// ---------------------------------------------------------------- boards
// Hand-made maps use two-character tokens: shape + modifier.
//   shapes  - | (straights)  F 7 L J (curves: F = E+S, 7 = W+S, L = N+E, J = N+W)
//   mods    . turnable   # fixed
//   A- B| … station of colour 0..3 (a fixed straight)   S> S< S^ Sv depot (train starts heading that way)
//   .. grass  t. tree  h. house  f. flowers  w. pond
const SHAPES = { '-': ['straight', 1], '|': ['straight', 0], L: ['curve', 0], F: ['curve', 1], 7: ['curve', 2], J: ['curve', 3] };
const DEPOT_DIR = { '^': 0, '>': 1, v: 2, '<': 3 };
const DECO = { '.': 'grass', t: 'tree', h: 'house', f: 'flowers', w: 'pond' };

function blank(cols, rows) {
  const tiles = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) tiles.push({ i, j, idx: j * cols + i, shape: null, rot: 0, fixed: false, kind: 'scenery', deco: 'grass' });
  return { cols, rows, tiles, stations: [], depots: [], portals: [], cycle: [] };
}

export function parseMap(rows, broken = []) {
  const grid = rows.map((r) => r.trim().split(/\s+/)), b = blank(grid[0].length, grid.length);
  grid.forEach((row, j) => row.forEach((tok, i) => {
    const t = tileAt(b, i, j), c = tok[0], m = tok[1];
    if (SHAPES[c]) { [t.shape, t.rot] = SHAPES[c]; t.kind = 'track'; t.fixed = m !== '.'; }
    else if ('ABCD'.includes(c)) { t.shape = 'straight'; t.rot = m === '-' ? 1 : 0; t.fixed = true; t.kind = 'station'; t.color = 'ABCD'.indexOf(c); b.stations.push(t.idx); }
    else if (c === 'S') { const d = DEPOT_DIR[m]; t.shape = 'straight'; t.rot = d & 1; t.fixed = true; t.kind = 'depot'; t.dir = d; b.depots.push(t.idx); }
    else t.deco = DECO[c] || 'grass';
  }));
  for (const [i, j] of broken) { const t = tileAt(b, i, j); t.rot = (t.rot + 3) & 3; } // one clockwise tap fixes it
  return b;
}

const HOLE_KINDS = ['town', 'pond', 'forest', 'farm', 'town', 'park'];
// Generated boards: a random spanning tree on a half-resolution grid; walking around it gives one big loop through
// every tile (so every board is solvable), then stations, depots and tunnels sit on its straights and a
// share of the turnable tiles is swivelled out of place.
export function generate(p, seed) {
  for (let k = 0; k < 80; k++) { const b = tryGenerate(p, seed + k * 7919); if (b) { b.seed = seed + k * 7919; return b; } }
  throw new Error('no board for ' + JSON.stringify(p));
}
function halfConnected(hc, hr, hole) {
  const cells = []; for (let c = 0; c < hc * hr; c++) if (!hole.has(c)) cells.push(c);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), st = [cells[0]];
  while (st.length) { const c = st.pop(), x = c % hc, y = (c / hc) | 0; for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DZ[d], n = ny * hc + nx; if (nx >= 0 && ny >= 0 && nx < hc && ny < hr && !hole.has(n) && !seen.has(n)) { seen.add(n); st.push(n); } } }
  return seen.size === cells.length;
}
function tryGenerate(p, seed) {
  const r = rng(seed), { cols, rows } = p, hc = cols / 2, hr = rows / 2, hole = new Set();
  for (let tries = 0; hole.size < (p.holes | 0) && tries < 60; tries++) {
    const c = ((r() * hc) | 0) + ((r() * hr) | 0) * hc; if (hole.has(c)) continue;
    hole.add(c); if (!halfConnected(hc, hr, hole)) hole.delete(c);
  }
  // random depth-first spanning tree (long corridors give plenty of straights)
  const cells = []; for (let c = 0; c < hc * hr; c++) if (!hole.has(c)) cells.push(c);
  const start = cells[(r() * cells.length) | 0], seen = new Set([start]), stack = [start], edges = [];
  while (stack.length) {
    const c = stack[stack.length - 1], x = c % hc, y = (c / hc) | 0, nb = [];
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DZ[d], n = ny * hc + nx; if (nx >= 0 && ny >= 0 && nx < hc && ny < hr && !hole.has(n) && !seen.has(n)) nb.push([n, d]); }
    if (!nb.length) { stack.pop(); continue; }
    const [n, d] = nb[(r() * nb.length) | 0]; seen.add(n); edges.push([c, n, d]); stack.push(n);
  }
  const conn = new Array(cols * rows).fill(0), id = (i, j) => j * cols + i;
  const link = (a, b2, d) => { conn[a] |= 1 << d; conn[b2] |= 1 << opp(d); }, unlink = (a, b2, d) => { conn[a] &= ~(1 << d); conn[b2] &= ~(1 << opp(d)); };
  const corners = (c) => { const x = (c % hc) * 2, y = ((c / hc) | 0) * 2; return { TL: id(x, y), TR: id(x + 1, y), BL: id(x, y + 1), BR: id(x + 1, y + 1) }; };
  for (const c of cells) { const k = corners(c); link(k.TL, k.TR, 1); link(k.TR, k.BR, 2); link(k.BR, k.BL, 3); link(k.BL, k.TL, 0); }
  for (let [c, n, d] of edges) {
    if (d === 3 || d === 0) { [c, n] = [n, c]; d = opp(d); } // always join left->right or top->bottom
    const A = corners(c), B = corners(n);
    if (d === 1) { unlink(A.TR, A.BR, 2); unlink(B.TL, B.BL, 2); link(A.TR, B.TL, 1); link(A.BR, B.BL, 1); }
    else { unlink(A.BL, A.BR, 1); unlink(B.TL, B.TR, 1); link(A.BL, B.TL, 2); link(A.BR, B.TR, 2); }
  }
  const b = blank(cols, rows);
  b.holes = [];
  for (const t of b.tiles) {
    const hcell = ((t.j / 2) | 0) * hc + ((t.i / 2) | 0);
    if (hole.has(hcell)) { t.block = hcell; continue; }
    const [shape, rot] = shapeFromMask(conn[t.idx]); if (!shape) return null;
    t.shape = shape; t.rot = rot; t.kind = 'track';
  }
  for (const c of hole) b.holes.push({ i: (c % hc) * 2, j: ((c / hc) | 0) * 2, kind: HOLE_KINDS[(r() * HOLE_KINDS.length) | 0], seed: (r() * 1e6) | 0 });
  // the loop, in travel order: cycle[k] = { idx, a (entry side), e (exit side) }
  const first = b.tiles.find((t) => t.shape);
  let cur = first, a = -1;
  for (let n = 0; n < cols * rows + 1; n++) {
    const m = conn[cur.idx]; let e = -1;
    for (let d = 0; d < 4; d++) if ((m >> d) & 1 && d !== a) { e = d; break; }
    if (a < 0) { for (let d = 0; d < 4; d++) if ((m >> d) & 1 && d !== e) a = d; }
    b.cycle.push({ idx: cur.idx, a, e });
    const nx = tileAt(b, cur.i + DX[e], cur.j + DZ[e]); a = opp(e); cur = nx;
    if (cur === first) break;
  }
  const L = b.cycle.length;
  if (L !== b.tiles.filter((t) => t.shape).length) return null;
  // stations and depots, spread evenly along the loop on straight tiles
  const used = new Set(), near = (k) => { for (const u of used) { const d = Math.abs(u - k); if (Math.min(d, L - d) < 3) return true; } return false; };
  const straightAt = (k) => b.tiles[b.cycle[k].idx].shape === 'straight';
  function pickNear(target, span) {
    for (let o = 0; o <= span; o++) for (const s of [o, -o]) { const k = (((target + s) % L) + L) % L; if (straightAt(k) && !near(k)) { used.add(k); return k; } }
    return -1;
  }
  const nd = p.twin ? 2 : 1, ns = p.stations, roles = [];
  if (nd === 2) { const half = Math.ceil(ns / 2); roles.push('D', ...Array(half).fill('S'), 'D', ...Array(ns - half).fill('S')); }
  else roles.push('D', ...Array(ns).fill('S'));
  const spacing = L / roles.length, off = (r() * L) | 0, colors = [...Array(ns).keys()];
  for (let k = colors.length - 1; k > 0; k--) { const q = (r() * (k + 1)) | 0; [colors[k], colors[q]] = [colors[q], colors[k]]; }
  let si = 0;
  const depotPos = [];
  for (let m = 0; m < roles.length; m++) {
    const k = pickNear(Math.round(off + m * spacing), Math.floor(spacing / 2)); if (k < 0) return null;
    const c = b.cycle[k], t = b.tiles[c.idx];
    t.fixed = true;
    if (roles[m] === 'D') { t.kind = 'depot'; t.dir = c.e; b.depots.push(t.idx); depotPos.push(k); }
    else { t.kind = 'station'; t.color = colors[si++]; b.stations.push(t.idx); }
  }
  // tunnels: two straights on the loop become portals; the stretch between them is skipped (and stays as track)
  for (let n = 0; n < (p.tunnels | 0); n++) {
    let ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      const k1 = (r() * L) | 0, gap = 4 + ((r() * Math.max(1, L / 4 - 4)) | 0), k2 = (k1 + gap) % L;
      if (!straightAt(k1) || !straightAt(k2) || near(k1) || near(k2)) continue;
      let clear = true; for (let s = 1; s < gap; s++) if (used.has((k1 + s) % L)) clear = false;
      for (const u of used) { const t = b.tiles[b.cycle[u].idx]; if (t.kind === 'station' || t.kind === 'depot') { for (let s = 0; s <= gap; s++) if ((k1 + s) % L === u) clear = false; } }
      if (!clear) continue;
      const P1 = b.tiles[b.cycle[k1].idx], P2 = b.tiles[b.cycle[k2].idx], pi = b.portals.length;
      Object.assign(P1, { kind: 'portal', shape: 'end', rot: b.cycle[k1].a, fixed: true, pair: pi + 1 });
      Object.assign(P2, { kind: 'portal', shape: 'end', rot: b.cycle[k2].e, fixed: true, pair: pi });
      b.portals.push({ i: P1.i, j: P1.j, idx: P1.idx }, { i: P2.i, j: P2.j, idx: P2.idx });
      for (let s = 0; s <= gap; s++) used.add((k1 + s) % L);
      ok = true;
    }
    if (!ok) return null;
  }
  // safe start: the tile behind each depot and the three ahead keep their loop rotation
  const safe = new Set();
  for (const k of depotPos) for (let s = -1; s <= 3; s++) safe.add(b.cycle[(k + s + L) % L].idx);
  for (const t of b.tiles) if (turnable(t) && !safe.has(t.idx) && r() < p.scramble) t.rot = (t.rot + 1 + (t.shape === 'straight' ? 0 : (r() * 3) | 0)) & 3;
  return b;
}

export function buildBoard(def) {
  const b = def.map ? parseMap(def.map, def.broken) : generate(def.gen, def.seed);
  b.tiles.forEach((t) => { t.vrot = t.rot; });
  return b;
}

// ---------------------------------------------------------------- levels ("stops")
// deliver: passengers to bring home; speed: train speed (units/s); cars: carriages (3 seats each); every: seconds between
// new passengers; maxWait: passengers waiting on all platforms at once; par: seconds for the third star.
// Extras: brake, cows (count), tops (spinning tops knock tiles askew), gold (coins on the track), twin (second train),
// gen.tunnels. light: morning | noon | sunset.
export const LEVELS = [
  { name: { en: 'First Stop', tr: 'İlk Durak' }, light: 'morning', tip: 'first', hold: true,
    map: ['F# -# A- -# 7.', '|# t. h. f. |#', 'L. -# B- S< J#', '.. t. .. w. ..'], broken: [[0, 2], [4, 0]],
    deliver: 4, speed: 1.0, cars: 1, every: 3, maxWait: 3, par: 60 },
  { name: { en: 'Shortcut', tr: 'Kestirme' }, light: 'morning', tip: 'path', gen: { cols: 6, rows: 4, holes: 1, stations: 2, scramble: 0.35 }, seed: 205,
    deliver: 6, speed: 1.1, cars: 1, every: 4, maxWait: 4, par: 95 },
  { name: { en: 'Three Colours', tr: 'Üç Renk' }, light: 'morning', tip: 'colors', gen: { cols: 8, rows: 4, holes: 1, stations: 3, scramble: 0.4 }, seed: 311,
    deliver: 8, speed: 1.15, cars: 1, every: 4, maxWait: 5, par: 135 },
  { name: { en: 'Hold Tight', tr: 'Sıkı Tutun' }, light: 'morning', tip: 'brake', brake: true, gen: { cols: 8, rows: 4, holes: 1, stations: 3, scramble: 0.45 }, seed: 412,
    deliver: 9, speed: 1.3, cars: 1, every: 3.8, maxWait: 5, par: 210 },
  { name: { en: 'Toy Town', tr: 'Oyuncak Kasaba' }, light: 'morning', tip: 'crowd', brake: true, gen: { cols: 8, rows: 6, holes: 2, stations: 3, scramble: 0.45 }, seed: 517,
    deliver: 10, speed: 1.3, cars: 1, every: 3.6, maxWait: 6, par: 250 },
  { name: { en: 'Moo!', tr: 'Möö!' }, light: 'noon', tip: 'cow', brake: true, cows: 2, gen: { cols: 8, rows: 6, holes: 2, stations: 3, scramble: 0.45 }, seed: 623,
    deliver: 10, speed: 1.3, cars: 1, every: 3.6, maxWait: 6, par: 195 },
  { name: { en: 'Two Carriages', tr: 'İki Vagon' }, light: 'noon', tip: 'cars', brake: true, gen: { cols: 8, rows: 6, holes: 1, stations: 4, scramble: 0.5 }, seed: 733,
    deliver: 12, speed: 1.35, cars: 2, every: 3.2, maxWait: 8, par: 210 },
  { name: { en: 'Under the Hill', tr: 'Tepenin Altında' }, light: 'noon', tip: 'tunnel', brake: true, cows: 1, gen: { cols: 8, rows: 6, holes: 1, stations: 4, scramble: 0.5, tunnels: 1 }, seed: 839,
    deliver: 12, speed: 1.35, cars: 2, every: 3.2, maxWait: 8, par: 375 },
  { name: { en: 'Spinning Tops', tr: 'Topaçlar' }, light: 'noon', tip: 'top', brake: true, tops: true, gen: { cols: 8, rows: 6, holes: 2, stations: 4, scramble: 0.45 }, seed: 947,
    deliver: 12, speed: 1.35, cars: 2, every: 3.1, maxWait: 8, par: 225 },
  { name: { en: 'Express', tr: 'Ekspres' }, light: 'noon', tip: 'gold', brake: true, gold: true, cows: 1, gen: { cols: 8, rows: 6, holes: 1, stations: 4, scramble: 0.5 }, seed: 1051,
    deliver: 14, speed: 1.6, cars: 2, every: 2.8, maxWait: 8, par: 215 },
  { name: { en: 'Twin Lines', tr: 'İkiz Hatlar' }, light: 'sunset', tip: 'twin', brake: true, twin: true, gen: { cols: 8, rows: 6, holes: 1, stations: 4, scramble: 0.4, twin: true }, seed: 1163,
    deliver: 14, speed: 1.2, cars: 1, every: 2.8, maxWait: 8, par: 205 },
  { name: { en: 'Playtime', tr: 'Oyun Saati' }, light: 'sunset', brake: true, tops: true, cows: 2, gen: { cols: 8, rows: 6, holes: 1, stations: 4, scramble: 0.45 }, seed: 1277,
    deliver: 14, speed: 1.35, cars: 2, every: 3, maxWait: 8, par: 235 },
  { name: { en: 'Rush Hour', tr: 'Yoğun Saat' }, light: 'sunset', brake: true, tops: true, cows: 1, gen: { cols: 10, rows: 6, holes: 2, stations: 4, scramble: 0.5, tunnels: 1 }, seed: 1381,
    deliver: 16, speed: 1.45, cars: 2, every: 2.6, maxWait: 9, par: 200 },
  { name: { en: 'Twin Tunnels', tr: 'İkiz Tüneller' }, light: 'sunset', brake: true, twin: true, gold: true, gen: { cols: 10, rows: 6, holes: 2, stations: 4, scramble: 0.45, tunnels: 1, twin: true }, seed: 1493,
    deliver: 16, speed: 1.25, cars: 1, every: 2.5, maxWait: 9, par: 240 },
  { name: { en: 'Grand Junction', tr: 'Büyük Kavşak' }, light: 'sunset', brake: true, tops: true, gold: true, cows: 2, gen: { cols: 10, rows: 6, holes: 2, stations: 4, scramble: 0.5, tunnels: 1 }, seed: 1601,
    deliver: 20, speed: 1.45, cars: 2, every: 2.4, maxWait: 10, par: 285 },
];

// Endless Line: unlocked after stop 5. A fresh board every run; hazards join and the train speeds up over time.
export const ENDLESS = {
  name: { en: 'Endless Line', tr: 'Sonsuz Hat' }, light: 'sunset', brake: true, gold: true,
  gen: { cols: 10, rows: 6, holes: 2, stations: 4, scramble: 0.45, tunnels: 1 },
  cars: 2, maxWait: 10, topsAt: 60, cowsAt: 120,
  speed: (t) => Math.min(1.85, 1.3 + t / 400), every: (t) => Math.max(1.9, 3.4 - t / 160),
};
