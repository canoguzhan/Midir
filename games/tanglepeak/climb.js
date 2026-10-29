// Tanglepeak rules: two climbers tied by one rope. One grips a hold (the anchor) while you swing the other (the active
// climber) toward the next hold; when it grabs, the roles swap and the old anchor lets go. Pure module: no DOM, no THREE,
// so the browser and the Node balance scripts run the same physics. The mountain is generated from a fixed seed, so every
// player (and every streamer) climbs the same peak. Coordinates are metres: x to the right, y up.

export const PHYS = {
  g: 22, rope: 3.2, r: 0.3, hand: 0.45, grabR: 0.62, // climber radius, hand above the body centre, reach to grab a hold
  pull: 38, vPull: 8, drag: 0.1, // arm pull toward the aim point, a little stronger than gravity (fades out as speed toward it reaches vPull)
  walk: 30, walkMax: 4.2, hop: 7.4, hopCd: 0.4, // on a ledge: walk toward the aim, hop when it is above
  catchMax: 15.5, // falling faster than this, a grab slips off
  drain: 1 / 9, drainSafe: 0.15, // grip stamina per second while the partner hangs (x0.15 while the partner is safe)
  crumbleT: 2.6, crumbleBack: 6, rest: 0.12, // crumbling holds break after this long, regrow after crumbleBack
  bigFall: 5, // metres: a fall shorter than this does not count
};

export const HOLDS = { // drain multiplier per hold type
  stone: { drain: 1 }, moss: { drain: 2.3 }, crumble: { drain: 1, crumble: true }, ice: { drain: 2.6 }, piton: { drain: 0 }, hook: { drain: 1 },
};

// zones from the foot to the summit: hold mix, gaps between path holds, how often a ledge comes, wind, side-wall half width
export const ZONES = [
  { id: 'meadow', h: 50, mix: { stone: 1 }, gap: [1.9, 2.5], ledge: [4, 6], width: 6.5, wind: 0, obst: 0, side: 0.25 },
  { id: 'pines', h: 54, mix: { stone: 0.65, crumble: 0.35 }, gap: [2.1, 2.8], ledge: [6, 8], width: 7, wind: 0, obst: 0.08, side: 0.35 },
  { id: 'falls', h: 54, mix: { stone: 0.4, moss: 0.6 }, gap: [2.3, 3.0], ledge: [7, 9], width: 7, wind: 0, obst: 0.12, side: 0.35, piton: 7 },
  { id: 'ridge', h: 56, mix: { stone: 0.6, crumble: 0.2, moss: 0.2 }, gap: [2.5, 3.2], ledge: [7, 10], width: 7.5, wind: 1, obst: 0.12, side: 0.35, piton: 7 },
  { id: 'frost', h: 56, mix: { ice: 0.55, stone: 0.3, crumble: 0.15 }, gap: [2.5, 3.2], ledge: [8, 11], width: 7.5, wind: 0, obst: 0.15, side: 0.35, piton: 6 },
  { id: 'cable', h: 58, mix: { hook: 0.5, stone: 0.3, ice: 0.2 }, gap: [2.5, 3.2], ledge: [8, 11], width: 7.5, wind: 0, obst: 0.12, side: 0.3, piton: 7 },
  { id: 'crown', h: 60, mix: { stone: 0.3, moss: 0.2, ice: 0.2, crumble: 0.2, hook: 0.1 }, gap: [2.6, 3.3], ledge: [9, 12], width: 7.5, wind: 0.6, obst: 0.15, side: 0.3, piton: 6 },
];

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (R, mix) => { let s = 0; for (const k in mix) s += mix[k]; let r = R() * s; for (const k in mix) { r -= mix[k]; if (r <= 0) return k; } return Object.keys(mix)[0]; };

// ================================================================ MOUNTAIN (generated once from a fixed seed)
export const SEED = 20261029;
export function buildMountain(seed = SEED) {
  const R = rng(seed), holds = [], segs = [], camps = [], flowers = [], path = [], zones = [];
  const addHold = (x, y, type, zone, extra = {}) => { const h = { id: holds.length, x, y, type, zone, ...extra }; holds.push(h); return h; };
  const addSeg = (ax, ay, bx, by, r, kind, zone) => { const s = { id: segs.length, ax, ay, bx, by, r, kind, zone }; segs.push(s); return s; };
  const ledge = (cx, top, w, zone, kind = 'ledge') => addSeg(cx - w / 2, top - 0.35, cx + w / 2, top - 0.35, 0.35, kind, zone); // top surface at y = top
  const standY = (top) => top + PHYS.r + 0.01;
  // ground: a wide meadow, with the first campfire
  addSeg(-40, -0.6, 40, -0.6, 0.6, 'ground', 0);
  camps.push({ id: 0, x: -1.5, y: 0, zone: 0 });
  let px = 0, py = 0, onLedge = { cx: 0, top: 0, w: 8 }, zoneY = 0, side = R() < 0.5 ? -1 : 1;
  path.push({ kind: 'ledge', x: 0.6, y: standY(0), top: 0, cx: 0, w: 8, zone: 0 });
  const nearSeg = (x, y, pad) => segs.some((s) => s.kind !== 'ground' && segDist(s, x, y) < s.r + pad);
  for (let zi = 0; zi < ZONES.length; zi++) {
    const Z = ZONES[zi], top = zoneY + Z.h; let sinceLedge = 0, nextLedge = Z.ledge[0] + Math.floor(R() * (Z.ledge[1] - Z.ledge[0] + 1)), sincePiton = 0;
    zones.push({ id: Z.id, y0: zoneY, y1: top, width: Z.width, wind: Z.wind });
    addSeg(-Z.width - 2.6, zoneY - 2, -Z.width - 2.6, top + 2, 1.2, 'wall', zi); // side walls keep the climb in a column
    addSeg(Z.width + 2.6, zoneY - 2, Z.width + 2.6, top + 2, 1.2, 'wall', zi);
    // two campfire ledges per zone (halfway, and at the top), planned up front against alternating walls; the path steers to
    // a hold beside each one's inner end, so every zone has its campfires whatever the seed
    const cs = R() < 0.5 ? -1 : 1, plans = [{ y: zoneY + Z.h * 0.5, w: 5.5, side: cs, top: false }, { y: top, w: 7, side: -cs, top: true }];
    let ci = 0, first = true;
    const placeLedge = (ax, ay, w, sd, kind, isTop) => { // a ledge beside the hold at (ax, ay), extending to side sd
      const cx = ax + sd * (0.75 + w / 2), lt = ay - 0.55, span = [cx - w / 2 - 0.4, cx + w / 2 + 0.4];
      ledge(cx, lt, w, zi, kind);
      for (const o of holds) if (o.side && o.x > span[0] && o.x < span[1] && o.y > lt - 1.2 && o.y < lt + 2.4) o.gone = true;
      const sx = cx + sd * (w / 2 - 0.8);
      path.push({ kind: 'ledge', x: sx, y: standY(lt), top: lt, cx, w, zone: zi });
      if (kind === 'camp' && (!isTop || zi < ZONES.length - 1)) camps.push({ id: camps.length, x: cx - sd * (w / 2 - 0.9), y: lt, zone: isTop ? zi + 1 : zi, top: isTop });
      px = sx; py = standY(lt); onLedge = { cx, top: lt, w }; sinceLedge = 0; nextLedge = Z.ledge[0] + Math.floor(R() * (Z.ledge[1] - Z.ledge[0] + 1));
    };
    while (ci < plans.length) {
      const plan = plans[ci], pcx = plan.side * (Z.width - 0.1 - plan.w / 2), apx = pcx - plan.side * (plan.w / 2 + 0.75), apy = plan.y + 0.55;
      let hx, hy, arrive = false;
      if (onLedge) { // first hold above a ledge: within a hop of its surface
        const dx = (0.4 + R() * 0.8) * (R() < 0.5 ? -1 : 1);
        hx = clamp(px + dx, onLedge.cx - onLedge.w / 2 + 0.3, onLedge.cx + onLedge.w / 2 - 0.3); hy = standY(onLedge.top) + 1.55 + R() * 0.3;
      } else if (py > plan.y - 10) { // steer to the planned campfire
        const dx = apx - px, dy = apy - py, dist = Math.hypot(dx, dy);
        if (dist < 1.4) { placeLedge(px, py, Math.min(plan.w, Z.width - 0.85 - plan.side * px), plan.side, 'camp', plan.top); ci++; continue; }
        if (dist <= Z.gap[1]) { hx = apx; hy = apy; arrive = true; }
        else {
          const d = Z.gap[0] + R() * (Z.gap[1] - Z.gap[0]); const a = clamp(Math.atan2(dx, Math.max(dy, 0.6)) + (R() - 0.5) * 0.6, -1.0, 1.0);
          hx = clamp(px + Math.sin(a) * d, -Z.width, Z.width); hy = py + Math.cos(a) * d;
        }
      } else {
        const d = Z.gap[0] + R() * (Z.gap[1] - Z.gap[0]);
        if (R() < 0.68) side = -side; // zig-zag: most moves swing across
        let a = side * (0.2 + R() * 0.65) - px * 0.05; a = clamp(a, -1.0, 1.0);
        hx = px + Math.sin(a) * d; hy = py + Math.cos(a) * d;
        if (Math.abs(hx) > Z.width) { hx = px - Math.sin(a) * d; side = -side; }
      }
      onLedge = null;
      let type = pick(R, Z.mix);
      if (first && zi === 0) type = 'stone'; first = false;
      if (arrive && type === 'crumble') type = 'stone'; // the move onto a campfire ledge is never from a crumbling hold
      if (Z.piton && sincePiton >= Z.piton) { type = 'piton'; sincePiton = 0; } else sincePiton++;
      const extra = {};
      if (type === 'hook') { if (arrive) type = 'stone'; else { const horiz = R() < 0.6; extra.move = { dx: horiz ? 1.1 + R() * 0.6 : 0.3, dy: horiz ? 0.2 : 0.9 + R() * 0.5, period: 3.2 + R() * 1.6, phase: R() * Math.PI * 2 }; } }
      const h = addHold(hx, hy, type, zi, extra); h.path = path.length; path.push({ kind: 'hold', h: h.id, x: hx, y: hy, zone: zi });
      // a few side holds: other ways up, and something to catch on the way down
      if (R() < Z.side) {
        for (let k = 0; k < 6; k++) {
          const a = R() * Math.PI * 2, d = 1.7 + R() * 1.4, sx = hx + Math.cos(a) * d, sy = hy + Math.sin(a) * d * 0.8;
          if (Math.abs(sx) > Z.width + 1 || holds.some((o) => Math.hypot(o.x - sx, o.y - sy) < 1.4) || nearSeg(sx, sy, 0.8)) continue;
          let st = pick(R, Z.mix); if (st === 'hook') st = 'stone';
          addHold(sx, sy, st, zi, { side: true }); break;
        }
      }
      px = hx; py = hy; sinceLedge++;
      if (arrive) { placeLedge(hx, hy, plan.w, plan.side, 'camp', plan.top); ci++; continue; }
      // a rocky overhang beside the move: something to swing around
      if (Z.obst && R() < Z.obst && path.length > 3 && py < plan.y - 12) {
        const pv = path[path.length - 2], mx = (pv.x + hx) / 2, my = (pv.y + hy) / 2, dir = hx > pv.x ? 1 : -1;
        const ox = mx + dir * (2.1 + R() * 0.6), oy = my + 0.8 + R() * 0.8, len = 1.2 + R() * 0.9, tilt = (R() - 0.5) * 0.8;
        const s = { ax: ox - Math.cos(tilt) * len / 2, ay: oy - Math.sin(tilt) * len / 2, bx: ox + Math.cos(tilt) * len / 2, by: oy + Math.sin(tilt) * len / 2, r: 0.4 };
        const clear = holds.every((o) => segDist(s, o.x, o.y) > 1.5) && Math.abs(ox) + len / 2 < Z.width - 0.3 && segDistLine(s, pv.x, pv.y, hx, hy) > 1.2;
        if (clear) addSeg(s.ax, s.ay, s.bx, s.by, s.r, 'rock', zi);
      }
      // a small ledge to rest on now and then (not right below a campfire)
      if (sinceLedge >= nextLedge && py < plan.y - 12) {
        const w = 2.6 + R() * 1.6;
        for (const sd of [hx > (path[path.length - 2]?.x ?? 0) ? 1 : -1, hx > (path[path.length - 2]?.x ?? 0) ? -1 : 1]) {
          const cx = hx + sd * (0.75 + w / 2), lt = hy - 0.55, span = [cx - w / 2 - 0.4, cx + w / 2 + 0.4];
          if (Math.abs(cx) + w / 2 > Z.width) continue; // keep a climber-wide gap to the side wall: no dead-end pockets
          const blocked = path.slice(-6, -1).some((q) => q.x > span[0] && q.x < span[1] && q.y > lt - 4.5) || holds.some((o) => o.id !== h.id && !o.side && o.x > span[0] && o.x < span[1] && Math.abs(o.y - lt) < 1.6);
          if (blocked) continue;
          placeLedge(hx, hy, w, sd, 'ledge', false); break;
        }
      }
    }
    // flowers (collectibles): a short detour out from a path hold
    const zh = holds.filter((o) => o.zone === zi && o.path != null && !o.move);
    for (let k = 0, tries = 0; k < 3 && tries < 200; tries++) {
      const o = zh[Math.floor(((k + 0.5) / 3 + (R() - 0.5) * 0.2) * zh.length)] || zh[0];
      const a = (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 1.2, d = 2.6 + R() * 1.0, fx = o.x + Math.cos(a) * d, fy = o.y + Math.sin(a) * d * 0.6 + 0.4;
      if (Math.abs(fx) > Z.width + 0.5 || nearSeg(fx, fy, 0.9) || flowers.some((f) => Math.hypot(f.x - fx, f.y - fy) < 6) || holds.some((q) => Math.hypot(q.x - fx, q.y - fy) < 0.9)) continue;
      flowers.push({ id: flowers.length, x: fx, y: fy, zone: zi }); k++;
    }
    zoneY = Math.max(top, py - 0.6);
    zones[zi].y1 = zoneY;
    if (zi + 1 < ZONES.length) { /* next zone starts where this one's last ledge is */ }
  }
  // the summit: a wide crown with a flag
  const last = path[path.length - 1], sy = last.kind === 'ledge' ? last.top + 2.2 : last.y + 1.6;
  const peak = { x: clamp(last.x + 1.6, -4, 4), y: sy };
  addSeg(peak.x - 3.4, sy - 0.4, peak.x + 3.4, sy - 0.4, 0.4, 'summit', ZONES.length - 1);
  const ph = addHold(last.x + (peak.x > last.x ? 0.4 : -0.4), sy - 0.5, 'piton', ZONES.length - 1); ph.path = path.length;
  path.push({ kind: 'hold', h: ph.id, x: ph.x, y: ph.y, zone: ZONES.length - 1 });
  path.push({ kind: 'ledge', x: peak.x, y: standY(sy), top: sy, cx: peak.x, w: 6.8, zone: ZONES.length - 1, summit: true });
  zones[zones.length - 1].y1 = sy + 4;
  const live = holds.filter((h) => !h.gone);
  return { seed, holds, live, segs, camps, flowers, path, zones, summit: { x: peak.x, y: sy }, top: sy };
}

export function segDist(s, x, y) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1e-9;
  const k = clamp(((x - s.ax) * dx + (y - s.ay) * dy) / L2, 0, 1);
  return Math.hypot(x - (s.ax + dx * k), y - (s.ay + dy * k));
}
function segDistLine(s, x0, y0, x1, y1) { // rough: sample the move
  let m = Infinity; for (let k = 0; k <= 8; k++) m = Math.min(m, segDist(s, x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8)); return m;
}
export function zoneAt(m, y) { for (let i = 0; i < m.zones.length; i++) if (y < m.zones[i].y1) return i; return m.zones.length - 1; }

// ================================================================ WORLD (one climb: the mountain + live state)
export function createClimb(m, opts = {}) {
  const w = {
    m, t: 0, mode: opts.mode || 'trail', act: 1, events: [], assist: !!opts.assist,
    c: [mkClimber(0), mkClimber(1)], broken: new Float32Array(m.holds.length), gripT: 0, camp: 0, flowers: new Set(opts.flowers || []),
    fall: null, best: 0, hi: 0, stats: { falls: 0, bigFall: 0, fallen: 0, grabs: 0, time: 0 }, won: false, hopCd: 0,
    wind: 0, gust: { t: 6, on: 0, dir: 1, warn: 0 }, rescueY: null, lastHold: -1, slipCd: 0,
  };
  if (opts.stats) Object.assign(w.stats, opts.stats);
  if (opts.best) w.best = w.hi = opts.best;
  placeAt(w, opts.at || { kind: 'camp', id: 0 });
  if (opts.camp != null) w.camp = opts.camp;
  return w;
}
function mkClimber(i) { return { i, x: 0, y: 0, vx: 0, vy: 0, grip: -1, stand: false, st: 1, air: 0, imp: 0, face: i ? -1 : 1, lockH: -1, lockT: 0, on: -1 }; }
export function placeAt(w, at) { // a campfire, a saved ledge spot (both standing) or a saved hold (one gripping, one hanging)
  const m = w.m; let x, y;
  if (at.kind === 'hold' && m.holds[at.h] && !m.holds[at.h].gone) {
    const h = m.holds[at.h], p = holdPos(w, h, { x: 0, y: 0, vx: 0, vy: 0 }), g = w.c[at.c | 0], o = w.c[1 - (at.c | 0)];
    Object.assign(g, { x: p.x, y: p.y - PHYS.hand, vx: 0, vy: 0, grip: h.id, stand: false, st: 1, air: 0 });
    Object.assign(o, { x: p.x + 0.4, y: p.y - PHYS.hand - 1.6, vx: 0, vy: 0, grip: -1, stand: false, st: 1, air: 0 });
    w.act = o.i; w.fall = null; return;
  }
  if (at.kind === 'camp') { const c = m.camps[at.id] || m.camps[0]; x = c.x; y = c.y; w.camp = c.id; }
  else { x = at.x; y = at.y; }
  const sy = y + PHYS.r + 0.02;
  Object.assign(w.c[0], { x: x - 0.5, y: sy, vx: 0, vy: 0, grip: -1, stand: true, st: 1, air: 0 });
  Object.assign(w.c[1], { x: x + 0.5, y: sy, vx: 0, vy: 0, grip: -1, stand: true, st: 1, air: 0 });
  w.act = 1; w.fall = null; w.gripT = 0;
}
export function holdPos(w, h, out = { x: 0, y: 0, vx: 0, vy: 0 }) {
  if (!h.move) { out.x = h.x; out.y = h.y; out.vx = out.vy = 0; return out; }
  const M = h.move, k = (Math.PI * 2) / M.period, s = Math.sin(w.t * k + M.phase), c = Math.cos(w.t * k + M.phase);
  out.x = h.x + M.dx * s; out.y = h.y + M.dy * s; out.vx = M.dx * k * c; out.vy = M.dy * k * c; return out;
}
const secure = (c) => c.grip >= 0 || c.stand;
const emit = (w, type, data = {}) => w.events.push({ type, ...data });
const _hp = { x: 0, y: 0, vx: 0, vy: 0 }, _hq = { x: 0, y: 0, vx: 0, vy: 0 };

// ctl = { pull, ax, ay, swap, dir, dx, dy }: pull toward the aim point (world metres); swap trades roles when both are safe;
// dir = keyboard aiming (dx, dy is the stick direction), which grabs any hold in that direction
export function step(w, dt, ctl) {
  const m = w.m, P = PHYS; w.t += dt; if (!w.won) w.stats.time += dt;
  const a = w.c[w.act], b = w.c[1 - w.act];
  w.hopCd -= dt; w.slipCd -= dt; for (const c of w.c) if (c.lockH >= 0) { c.lockT -= dt; const lh = w.m.holds[c.lockH]; if (c.lockT < 0 || Math.hypot(c.x - lh.x, c.y + PHYS.hand - lh.y) > 1.2) c.lockH = -1; }
  for (let i = 0; i < w.broken.length; i++) if (w.broken[i] > 0) { w.broken[i] -= dt; if (w.broken[i] <= 0) emit(w, 'regrow', { h: i }); }
  stepWind(w, dt);
  // gripping climbers ride their hold
  for (const c of w.c) if (c.grip >= 0) { holdPos(w, m.holds[c.grip], _hp); c.x = _hp.x; c.y = _hp.y - P.hand; c.vx = _hp.vx; c.vy = _hp.vy; }
  // forces on free climbers
  for (const c of w.c) {
    if (c.grip >= 0) continue;
    c.air += dt;
    const isAct = c === a, pulling = isAct && ctl.pull;
    if (c.stand && !(pulling && ctl.ay > c.y + 0.9 && w.hopCd <= 0)) {
      if (pulling) { // walk along the ledge toward the aim
        const want = clamp((ctl.ax - c.x) * 3, -P.walkMax, P.walkMax);
        c.vx += clamp(want - c.vx, -P.walk * dt, P.walk * dt);
      } else if (!isAct && c.on >= 0 && a.grip < 0 && ((!secure(a) && a.y < c.y - 0.4) || Math.hypot(a.x - c.x, a.y - c.y) > P.rope - 0.5)) { // belayer: follow the partner along the ledge
        const sg = m.segs[c.on], lo = Math.min(sg.ax, sg.bx) + 0.35, hi = Math.max(sg.ax, sg.bx) - 0.35;
        const under = a.y < c.y - 0.4 && a.x > lo - 0.6 && a.x < hi + 0.6, goal = under ? (a.x - lo < hi - a.x ? lo : hi) : clamp(a.x, lo, hi); // partner under the ledge: walk to its nearer end
        const want = clamp((goal - c.x) * 4, -2.5, 2.5); c.vx += clamp(want - c.vx, -20 * dt, 20 * dt);
      } else c.vx *= Math.exp(-dt * 12);
      c.vy -= P.g * dt;
    } else {
      if (c.stand && pulling) { // hop off the ledge toward a hold above
        c.vy = P.hop * (w.assist ? 1.1 : 1); c.vx += clamp((ctl.ax - c.x) * 1.6, -3, 3); c.stand = false; w.hopCd = P.hopCd; emit(w, 'hop', { c: c.i });
      }
      c.vy -= P.g * dt;
      if (!c.stand) c.vx += w.wind * dt;
      if (pulling) {
        let dx = ctl.ax - c.x, dy = ctl.ay - (c.y + P.hand * 0.5); const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const along = c.vx * dx + c.vy * dy, k = clamp(1 - along / P.vPull, 0, 1) * clamp(d / 0.6, 0.3, 1);
        const f = P.pull * (w.assist ? 1.25 : 1) * k; c.vx += dx * f * dt; c.vy += dy * f * dt;
      }
      const dr = Math.exp(-P.drag * dt); c.vx *= dr; c.vy *= dr;
    }
    c.x += c.vx * dt; c.y += c.vy * dt;
  }
  rope(w);
  // terrain
  for (const c of w.c) {
    if (c.grip >= 0) continue;
    const was = c.stand; c.stand = false;
    for (const s of m.segs) {
      if (c.y < Math.min(s.ay, s.by) - 2 || c.y > Math.max(s.ay, s.by) + 2) continue;
      const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1e-9;
      const k = clamp(((c.x - s.ax) * dx + (c.y - s.ay) * dy) / L2, 0, 1), qx = s.ax + dx * k, qy = s.ay + dy * k;
      let nx = c.x - qx, ny = c.y - qy; const d = Math.hypot(nx, ny), min = P.r + s.r;
      if (d >= min || d < 1e-6) continue;
      nx /= d; ny /= d; c.x = qx + nx * min; c.y = qy + ny * min;
      const vn = c.vx * nx + c.vy * ny;
      if (vn < 0) { c.imp = Math.max(c.imp, -vn); c.vx -= (1 + P.rest) * vn * nx; c.vy -= (1 + P.rest) * vn * ny; }
      if (ny > 0.55) { c.stand = true; c.air = 0; c.on = s.id; } else { c.vx *= 0.985; c.vy *= 0.985; }
    }
    if (c.stand && !was && c.imp > 3) emit(w, 'land', { c: c.i, v: c.imp });
    if (!c.stand && c.imp > 7) emit(w, 'bump', { c: c.i, v: c.imp });
    c.imp = 0;
  }
  // grabbing: the active climber grabs while you pull; while falling, either one can catch a hold
  const falling = !secure(a) && !secure(b);
  if (ctl.pull || (w.assist && falling)) {
    for (const c of falling ? [a, b] : [a]) {
      if (c.grip >= 0) continue;
      // you grab the hold you point at (keyboard: one in the stick's direction); a falling pair catches anything
      const aimed = falling ? null : (h) => { const p = holdPos(w, h, _hq); return ctl.dir ? (p.x - c.x) * ctl.dx + (p.y - c.y - P.hand) * ctl.dy > -0.15 : Math.hypot(p.x - ctl.ax, p.y - ctl.ay) < 1.6; };
      const h = nearestHold(w, c.x, c.y + P.hand, P.grabR, c.lockH, aimed);
      if (!h) continue;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > P.catchMax * (w.assist ? 1.6 : 1)) { if (w.slipCd <= 0) { emit(w, 'slip', { c: c.i, h: h.id }); w.slipCd = 0.4; } continue; }
      grab(w, c, h); break;
    }
  }
  // standing up somewhere higher than the partner makes you the anchor
  const A = w.c[w.act], B = w.c[1 - w.act];
  if (A.stand && A.air === 0 && B.grip >= 0 && A.y > B.y - 0.25 && A.vy <= 0.5 && w.hopCd < 0.1) {
    w.act = B.i; releaseGrip(w, B, 'swap');
  } else if (!secure(B) && secure(A)) w.act = B.i; // after a fall the safe one holds the rope
  if (ctl.swap && secure(w.c[0]) && secure(w.c[1])) { w.act = 1 - w.act; emit(w, 'swap'); }
  // grip stamina and crumbling holds
  for (const c of w.c) {
    if (c.grip < 0) continue;
    const h = m.holds[c.grip], other = w.c[1 - c.i];
    if (HOLDS[h.type].crumble) { c.crumble = (c.crumble || 0) + dt; if (c.crumble > P.crumbleT) { w.broken[h.id] = P.crumbleBack; emit(w, 'crumble', { h: h.id, c: c.i }); releaseGrip(w, c, 'crumble'); continue; } }
    if (w.assist) { c.st = 1; continue; }
    const rate = P.drain * HOLDS[h.type].drain * (secure(other) ? P.drainSafe : 1);
    const before = c.st; c.st = Math.max(0, c.st - rate * dt);
    if (before > 0.3 && c.st <= 0.3) emit(w, 'tired', { c: c.i });
    if (c.st <= 0) releaseGrip(w, c, 'tired');
  }
  trackFall(w);
  // campfires, flowers, the summit
  for (const c of w.c) {
    if (c.stand) for (const cp of m.camps) if (cp.id !== w.camp && Math.abs(c.x - cp.x) < 2 && Math.abs(c.y - (cp.y + P.r)) < 0.6 && cp.y > (m.camps[w.camp]?.y ?? -1)) { w.camp = cp.id; emit(w, 'camp', { id: cp.id }); }
    for (const f of m.flowers) if (!w.flowers.has(f.id) && Math.hypot(c.x - f.x, c.y - f.y) < 0.75) { w.flowers.add(f.id); emit(w, 'flower', { id: f.id }); }
  }
  const hy = Math.max(w.c[0].y, w.c[1].y);
  if (secure(w.c[0]) || secure(w.c[1])) { const sy = Math.max(secure(w.c[0]) ? w.c[0].y : -1e9, secure(w.c[1]) ? w.c[1].y : -1e9); if (sy > w.hi + 0.5) { w.hi = sy; } if (sy > w.best) w.best = sy; }
  if (!w.won && w.c.some((c) => c.stand && c.y > m.summit.y && Math.abs(c.x - m.summit.x) < 3.6)) { w.won = true; emit(w, 'summit'); }
  // Trail mode: fall below the last campfire and you wake up beside it
  const cp = m.camps[w.camp];
  if (w.mode === 'trail' && cp && hy < cp.y - 9) { emit(w, 'rescue', { id: cp.id, dist: (w.fall?.from ?? hy) - cp.y }); w.stats.falls++; placeAt(w, { kind: 'camp', id: cp.id }); }
  if (hy < -20) placeAt(w, { kind: 'camp', id: 0 });
}
function stepWind(w, dt) {
  const z = w.m.zones[zoneAt(w.m, Math.max(w.c[0].y, w.c[1].y))], s = z.wind;
  const G = w.gust;
  if (!s) { w.wind *= Math.exp(-dt * 2); G.on = 0; G.warn = 0; return; }
  G.t -= dt;
  if (G.on > 0) { G.on -= dt; if (G.on <= 0) G.t = 6 + ((w.t * 7.31) % 4); }
  else if (G.t <= 1.6 && !G.warn) { G.warn = 1; G.dir = Math.sin(w.t * 1.7) > 0 ? 1 : -1; emit(w, 'gustWarn', { dir: G.dir }); }
  if (G.t <= 0 && G.on <= 0 && G.warn) { G.on = 2.4; G.warn = 0; emit(w, 'gust', { dir: G.dir }); }
  const want = (Math.sin(w.t * 0.4) * 1.5 + (G.on > 0 ? G.dir * 13 : 0)) * s;
  w.wind += (want - w.wind) * (1 - Math.exp(-dt * 3));
}
export function nearestHold(w, x, y, r, skip = -1, ok = null) {
  let best = null, bd = r;
  for (const h of w.m.live) {
    if (Math.abs(h.y - y) > r + 2 || h.id === skip || w.broken[h.id] > 0 || (ok && !ok(h))) continue;
    const p = holdPos(w, h, _hp), d = Math.hypot(p.x - x, p.y - y);
    if (d < bd && !w.c.some((c) => c.grip === h.id)) { bd = d; best = h; }
  }
  return best;
}
function grab(w, c, h) {
  const fallingBefore = !!w.fall;
  c.grip = h.id; c.st = 1; c.crumble = 0; c.stand = false; c.vx = c.vy = 0; w.stats.grabs++;
  emit(w, 'grab', { c: c.i, h: h.id, kind: h.type, catch: fallingBefore });
  const o = w.c[1 - c.i];
  w.act = o.i;
  if (o.grip >= 0) releaseGrip(w, o, 'swap');
  w.lastHold = h.id;
}
function releaseGrip(w, c, why) { if (c.grip < 0) return; const h = c.grip; c.grip = -1; c.lockH = h; c.lockT = 2.5; c.crumble = 0; c.air = 0; emit(w, 'release', { c: c.i, h, why }); }
function rope(w) {
  const L = PHYS.rope, [p, q] = w.c;
  for (let it = 0; it < 2; it++) {
    let dx = q.x - p.x, dy = q.y - p.y; const d = Math.hypot(dx, dy);
    if (d <= L) return;
    dx /= d; dy /= d;
    const fixed = (c) => c.grip >= 0 || (c.stand && c.i !== w.act);
    let ip = fixed(p) ? 0 : 1, iq = fixed(q) ? 0 : 1;
    if (!ip && !iq) { const c = w.c[w.act]; if (c.grip >= 0) releaseGrip(w, c, 'stretch'); c.stand = false; if (c === p) ip = 1; else iq = 1; }
    const s = ip + iq, over = d - L;
    p.x += dx * over * ip / s; p.y += dy * over * ip / s; q.x -= dx * over * iq / s; q.y -= dy * over * iq / s;
    const rv = (q.vx - p.vx) * dx + (q.vy - p.vy) * dy; // separating speed along the rope
    if (rv > 0) { p.vx += dx * rv * ip / s; p.vy += dy * rv * ip / s; q.vx -= dx * rv * iq / s; q.vy -= dy * rv * iq / s; if (rv > 6) emit(w, 'taut', { v: rv }); }
  }
}
function trackFall(w) {
  const safe = secure(w.c[0]) || secure(w.c[1]), top = Math.max(w.c[0].y, w.c[1].y);
  if (!safe) { if (!w.fall) w.fall = { from: top, t: 0 }; else { w.fall.from = Math.max(w.fall.from, top); w.fall.t += 1 / 60; } return; }
  if (!w.fall) return;
  const at = Math.max(secure(w.c[0]) ? w.c[0].y : -1e9, secure(w.c[1]) ? w.c[1].y : -1e9), dist = w.fall.from - at;
  if (dist > PHYS.bigFall) { w.stats.falls++; w.stats.fallen += dist; w.stats.bigFall = Math.max(w.stats.bigFall, dist); emit(w, 'fall', { dist, caught: w.c.some((c) => c.grip >= 0) }); }
  w.fall = null;
}

export function saveSpot(w) { // somewhere safe to resume a climb: a gripped hold or a ledge
  const g = w.c.find((c) => c.grip >= 0), s = w.c.filter((c) => c.stand).sort((p, q) => q.y - p.y)[0];
  if (s && (!g || s.y >= g.y - 0.3)) return { kind: 'xy', x: s.x, y: s.y - PHYS.r - 0.02 };
  if (g && !HOLDS[w.m.holds[g.grip].type].crumble && !w.m.holds[g.grip].move) return { kind: 'hold', h: g.grip, c: g.i };
  return null;
}

// ================================================================ BOT (menu demo, trailer, balance runs)
// Follows the generated path: swing the active climber toward the next path node, pumping when the swing is too low.
export function botControl(w, B) {
  const m = w.m, P = PHYS, a = w.c[w.act], o = w.c[1 - w.act];
  if (B.i == null) B.i = 0;
  // where are we on the path? the highest path node the anchor sits at or above
  const anchorY = secure(o) ? o.y : Math.max(o.y, a.y);
  if (B.sync <= 0 || B.sync == null) {
    let best = -1, near = 0, nd = Infinity;
    for (let i = 0; i < m.path.length; i++) {
      const n = m.path[i], hp = n.kind === 'hold' ? holdPos(w, m.holds[n.h], _hp) : n, nx = hp.x, ny = n.kind === 'hold' ? hp.y - P.hand : n.y;
      for (const c of w.c) {
        if (!secure(c)) continue;
        const d = n.kind === 'ledge' ? (c.stand && Math.abs(c.y - n.y) < 0.5 && Math.abs(c.x - n.cx) < n.w / 2 + 0.3 ? 0 : 9) : Math.hypot(nx - c.x, ny - c.y);
        if (d < 1.2) best = Math.max(best, i);
        if (d < nd) { nd = d; near = i; }
      }
    }
    B.i = best >= 0 ? best : Math.max(0, near - 1); B.sync = 0.5;
  }
  B.sync -= 1 / 60;
  const n = m.path[Math.min(m.path.length - 1, B.i + 1)];
  let tx, ty;
  if (n.kind === 'hold') { const p = holdPos(w, m.holds[n.h], _hp); tx = p.x; ty = p.y; } else { tx = n.x; ty = n.top + 1.2; }
  if (!a.stand) { // something in the way (a ledge above us, a rock)? go out past its nearer end first
    for (const sg of m.segs) {
      if (sg.kind === 'wall' || sg.kind === 'ground' || Math.max(sg.ay, sg.by) < a.y - 1 || Math.min(sg.ay, sg.by) > ty + 1) continue;
      if (segDistLine(sg, a.x, a.y, tx, ty - (n.kind === 'hold' ? P.hand : 0)) > sg.r + P.r + 0.05) continue;
      const left = Math.min(sg.ax, sg.bx), right = Math.max(sg.ax, sg.bx), sy = Math.max(sg.ay, sg.by);
      const cost = (e, sd) => Math.abs(a.x - e) + Math.abs(tx - e) + (Math.hypot(e + sd * 0.9 - o.x, sy + 1 - o.y) > P.rope - 0.2 ? 50 : 0); // an end the rope can reach
      const side = cost(left, -1) < cost(right, 1) ? -1 : 1, ex = (side < 0 ? left : right) + side * (sg.r + P.r + 0.25);
      if ((side < 0 && a.x > left - 0.05) || (side > 0 && a.x < right + 0.05)) { tx = ex; ty = Math.min(a.y + 0.6, sy - sg.r - 0.7); } else { tx = ex; ty = sy + 1.2; }
      B.still = 0; break;
    }
  }
  if (n.kind === 'hold' && o.grip === n.h) { B.i++; return { pull: false, ax: a.x, ay: a.y }; }
  if (a.stand) {
    if (n.kind === 'ledge' && Math.abs(a.y - n.y) < 0.5 && Math.abs(a.x - n.cx) < n.w / 2 + 0.2) { B.i++; return { pull: false, ax: a.x, ay: a.y }; }
    return { pull: true, ax: tx, ay: ty + 0.4 };
  }
  // reach straight for it; if no progress for a while, swing away and come back with momentum
  const d = Math.hypot(tx - a.x, ty - (a.y + P.hand));
  if (d < (B.bestD ?? Infinity) - 0.05) { B.bestD = d; B.still = 0; } else B.still = (B.still || 0) + 1 / 60;
  if (B.target !== B.i) { B.target = B.i; B.bestD = Infinity; B.still = 0; }
  if (B.still > 1.6) { B.swing = 0.9; B.still = 0; B.bestD = Infinity; B.dir = tx > o.x ? -1 : 1; }
  if (B.swing > 0) { B.swing -= 1 / 60; return { pull: true, ax: o.x + B.dir * 4, ay: o.y - 1 }; }
  if (B.jit == null || Math.random() < 0.01) B.jit = (Math.random() - 0.5) * 0.5; // a little human wobble: no endless identical retries
  return { pull: true, ax: tx + B.jit, ay: ty + 0.25 };
}
