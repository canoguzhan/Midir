// Driftpost rules data: routes, wind layers, terrain heights and place generation. Pure: no DOM, no THREE.
// Compass degrees: 0 = north (-z, up on screen), 90 = east (+x, right on screen).

export const FLOOR = 6, BAND = 8.5; // wind layers stack from FLOOR in bands of BAND; below FLOOR the air is calm near the ground
export const HOUSE_COLORS = [
  { hex: '#e8463c', name: 'red' }, { hex: '#3a86e8', name: 'blue' }, { hex: '#f2b632', name: 'yellow' },
  { hex: '#9b5de5', name: 'purple' }, { hex: '#ff8a3d', name: 'orange' }, { hex: '#23b5b5', name: 'teal' },
];
export const LAYER_COLORS = ['#8fe3ff', '#ffd39a', '#c4f7a8', '#ffb0b8', '#c9bcff', '#fff3a0'];

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const dirVec = (deg) => ({ x: Math.sin((deg * Math.PI) / 180), z: -Math.cos((deg * Math.PI) / 180) });

// ---------------------------------------------------------------- routes
// layers: [compass degrees, speed] from low to high (bands of BAND from FLOOR up); 'auto' picks spread-out directions.
// fixed: hand-placed post office and houses (route 1 is a straight line so it can be flown with altitude alone).
const N = (en, tr) => ({ en, tr });
export const LEVELS = [
  { name: N('First Flight', 'İlk Uçuş'), light: 'morning', land: 'valley', size: 56, seed: 11, layers: [[90, 5.2], [270, 5.6]],
    fixed: { depot: [-30, 0], houses: [[26, -2.5]] }, target: 2, cap: 1, par: 80, tip: 'first', hint: true, start: 'loaded' },
  { name: N('Crosswinds', 'Çapraz Rüzgârlar'), light: 'morning', land: 'valley', size: 60, seed: 23, layers: [[95, 5.2], [215, 5.4], [335, 5.8]],
    houses: 2, target: 3, cap: 1, par: 160, tip: 'layers', hint: true },
  { name: N('Round the Mill', 'Değirmenin Etrafında'), light: 'day', land: 'valley', size: 64, seed: 37, layers: [[85, 5], [180, 5.4], [275, 5.6], [0, 6]],
    houses: 3, target: 4, cap: 1, par: 240, tip: 'sink', hint: true },
  { name: N('Warm Fields', 'Ilık Tarlalar'), light: 'day', land: 'valley', size: 68, seed: 41, layers: [[45, 5], [140, 5.4], [260, 5.6], [340, 6]],
    houses: 3, target: 4, cap: 1, par: 200, thermals: 4, tip: 'thermal' },
  { name: N('Goose Lane', 'Kaz Yolu'), light: 'day', land: 'valley', size: 70, seed: 53, layers: 'auto', nLayers: 4,
    houses: 3, target: 5, cap: 1, par: 250, geese: 1, tip: 'geese' },
  { name: N('Two at Once', 'İkisi Birden'), light: 'morning', land: 'valley', size: 74, seed: 67, layers: 'auto', nLayers: 4,
    houses: 4, target: 6, cap: 2, par: 380, geese: 1, thermals: 2, tip: 'cap' },
  { name: N('Thunderheads', 'Fırtına Bulutları'), light: 'dusk', land: 'valley', size: 74, seed: 79, layers: 'auto', nLayers: 5,
    houses: 4, target: 6, cap: 2, par: 230, storms: 2, tip: 'storm' },
  { name: N('Turning Winds', 'Dönen Rüzgârlar'), light: 'morning', land: 'valley', size: 78, seed: 83, layers: 'auto', nLayers: 4,
    houses: 4, target: 6, cap: 2, par: 360, veer: 2.4, geese: 1, tip: 'veer' },
  { name: N('Express Letters', 'Ekspres Mektuplar'), light: 'day', land: 'valley', size: 78, seed: 97, layers: 'auto', nLayers: 5,
    houses: 5, target: 7, cap: 2, par: 430, express: true, geese: 1, thermals: 2, tip: 'express' },
  { name: N('Peak Post', 'Zirve Postası'), light: 'day', land: 'peaks', size: 80, seed: 101, layers: 'auto', nLayers: 5,
    houses: 4, target: 6, cap: 2, par: 720, thermals: 3, storms: 1, tip: 'peaks' },
  { name: N('Island Hop', 'Ada Ada'), light: 'day', land: 'isles', size: 84, seed: 113, layers: 'auto', nLayers: 5,
    houses: 5, target: 7, cap: 2, par: 430, geese: 2, tip: 'isles' },
  { name: N('Wind Shift', 'Rüzgâr Dönüyor'), light: 'dusk', land: 'valley', size: 84, seed: 127, layers: 'auto', nLayers: 4,
    houses: 5, target: 7, cap: 2, par: 540, shift: 28, storms: 1, tip: 'shift' },
  { name: N('Busy Skies', 'Kalabalık Gökyüzü'), light: 'day', land: 'valley', size: 88, seed: 131, layers: 'auto', nLayers: 5,
    houses: 5, target: 8, cap: 3, par: 400, geese: 2, storms: 2, thermals: 2, tip: 'busy' },
  { name: N('Evening Rush', 'Akşam Telaşı'), light: 'dusk', land: 'isles', size: 88, seed: 149, layers: 'auto', nLayers: 5,
    houses: 6, target: 9, cap: 3, par: 640, veer: 1.6, express: true, storms: 1, geese: 1 },
  { name: N('Grand Round', 'Büyük Tur'), light: 'dusk', land: 'peaks', size: 92, seed: 157, layers: 'auto', nLayers: 5,
    houses: 6, target: 10, cap: 3, par: 600, geese: 2, storms: 2, shift: 34, express: true, thermals: 3 },
];
// Sunset Rounds: a new valley every run, the clock is the enemy and hazards join as the sun goes down
export const ENDLESS = { name: N('Sunset Rounds', 'Gün Batımı Turu'), light: 'dusk', land: 'valley', size: 82, layers: 'auto', nLayers: 5,
  houses: 6, target: 9999, cap: 2, par: 0, thermals: 2, endless: true };
export const DEMO = { name: N('', ''), light: 'morning', land: 'valley', size: 70, seed: 4242, layers: 'auto', nLayers: 4, houses: 4, target: 9999, cap: 2, thermals: 2, demo: true };

// ---------------------------------------------------------------- noise
function hash2(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export const cellHash = (i, j, s) => hash2(i, j, s + 7);

// ---------------------------------------------------------------- generation
// Builds the static world of a route: wind layers, terrain function, post office, houses, thermals, peaks, islands.
export function genWorld(def, seed) {
  const R = rng(seed), size = def.size, land = def.land;
  // wind layers
  let raw = def.layers;
  if (raw === 'auto') {
    // a spiral: each layer turns further round than the one below (like real wind veering with height),
    // so climbing through a layer drifts you sideways rather than straight back
    const n = def.nLayers || 4, base = R() * 360, turn = R() < 0.5 ? 1 : -1, dirs = [];
    for (let i = 0; i < n; i++) dirs.push(base + turn * ((i * 360) / n + (R() - 0.5) * 24));
    raw = dirs.map((d, i) => [((d % 360) + 360) % 360, 4.8 + i * 0.35 + R() * 0.5]);
  }
  const band = BAND, top = FLOOR + raw.length * BAND;
  const layers = raw.map(([deg, speed], i) => ({ i, y0: FLOOR + i * band, y1: FLOOR + (i + 1) * band, deg, base: deg, speed, color: LAYER_COLORS[i % LAYER_COLORS.length] }));

  // river (valley and peaks): a lazy sine across the map
  const river = land === 'isles' ? null : { a: size * (0.12 + R() * 0.1), f: (1.2 + R() * 0.8) / size, ph: R() * 6.28, z0: (R() - 0.5) * size * 0.5, vertical: R() < 0.5 };
  const riverDist = (x, z) => {
    if (!river) return 1e9;
    const u = river.vertical ? z : x, v = river.vertical ? x : z;
    return Math.abs(v - (river.z0 + river.a * Math.sin(u * river.f * 6.28 + river.ph)));
  };
  const edge = (x, z) => Math.max(Math.abs(x), Math.abs(z)) - (size - 6);

  // places: post office near the middle, houses spread around it
  const spots = [];
  const ok = (x, z, minD) => edge(x, z) < -10 && riverDist(x, z) > 9 && spots.every((s) => Math.hypot(s.x - x, s.z - z) > minD);
  let depot;
  if (def.fixed) depot = { x: def.fixed.depot[0], z: def.fixed.depot[1] };
  else { for (let k = 0; k < 400; k++) { const x = (R() - 0.5) * size * 0.5, z = (R() - 0.5) * size * 0.5; if (ok(x, z, 0) || k === 399) { depot = { x, z }; break; } } }
  spots.push(depot);
  const houses = [];
  const nh = def.fixed ? def.fixed.houses.length : def.houses;
  for (let h = 0; h < nh; h++) {
    let p = null;
    if (def.fixed) p = { x: def.fixed.houses[h][0], z: def.fixed.houses[h][1] };
    else for (let k = 0; k < 900 && !p; k++) {
      const a = R() * 6.283, d = 24 + R() * (size - 30), x = depot.x + Math.cos(a) * d, z = depot.z + Math.sin(a) * d;
      if (ok(x, z, k < 600 ? 22 : 14)) p = { x, z };
    }
    if (!p) p = { x: (R() - 0.5) * size, z: (R() - 0.5) * size };
    spots.push(p); houses.push({ i: h, x: p.x, z: p.z, color: HOUSE_COLORS[h % HOUSE_COLORS.length].hex });
  }
  // peaks stand between places; thermals sit over open fields
  const peaks = [];
  if (land === 'peaks') {
    for (let k = 0; k < 600 && peaks.length < 6; k++) {
      const x = (R() - 0.5) * size * 1.6, z = (R() - 0.5) * size * 1.6;
      if (edge(x, z) > -12 || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 17) || peaks.some((p) => Math.hypot(p.x - x, p.z - z) < 22)) continue;
      peaks.push({ x, z, h: 20 + R() * 12, r: 7 + R() * 3 });
    }
  }
  const thermals = [];
  for (let k = 0; k < 600 && thermals.length < (def.thermals || 0); k++) {
    const x = (R() - 0.5) * size * 1.5, z = (R() - 0.5) * size * 1.5;
    if (edge(x, z) > -10 || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 12) || thermals.some((t) => Math.hypot(t.x - x, t.z - z) < 26)) continue;
    if (peaks.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 9)) continue;
    thermals.push({ x, z, r: 6.5 });
  }
  // islands: every place gets one, plus a few empty ones
  const islands = [];
  if (land === 'isles') {
    spots.forEach((s, k) => islands.push({ x: s.x, z: s.z, r: k === 0 ? 15 : 11 + R() * 3 }));
    for (let k = 0; k < 300 && islands.length < spots.length + 5; k++) {
      const x = (R() - 0.5) * size * 1.7, z = (R() - 0.5) * size * 1.7;
      if (edge(x, z) > -8 || islands.some((i) => Math.hypot(i.x - x, i.z - z) < i.r + 10)) continue;
      islands.push({ x, z, r: 6 + R() * 6 });
    }
  }
  const nseed = (seed % 997) + 3;
  function heightAt(x, z) {
    let h;
    if (land === 'isles') {
      h = -3.2;
      for (const il of islands) { const d = Math.hypot(il.x - x, il.z - z) / il.r; if (d < 1.25) h = Math.max(h, 2.4 * (1 - d * d) + 0.3 * vnoise(x / 6, z / 6, nseed)); }
    } else {
      h = 0.5 + 1.3 * vnoise(x / 24, z / 24, nseed) + 0.5 * vnoise(x / 9, z / 9, nseed + 1);
      const rd = riverDist(x, z);
      if (rd < 6) h = h * smooth(2.2, 6, rd) - 1.4 * (1 - smooth(0, 3.2, rd));
    }
    for (const s of spots) { const d = Math.hypot(s.x - x, s.z - z); if (d < 12) { const k = smooth(8.5, 12, d); h = h * k + (land === 'isles' ? 1.4 : 0.9) * (1 - k); } }
    for (const p of peaks) { const d = Math.hypot(p.x - x, p.z - z) / p.r; if (d < 2.2) h += p.h * Math.max(0, 1 - d / 2.2) ** 1.6 * (0.85 + 0.3 * vnoise(x / 3, z / 3, nseed + 2)); }
    const e = edge(x, z);
    if (e > 0) h = Math.max(h, 0.6) + Math.min(15, e * 1.1 + e * e * 0.03) * (0.7 + 0.6 * vnoise(x / 9, z / 9, nseed + 3));
    return h;
  }
  return { layers, top, depot, houses, peaks, thermals, islands, river, riverDist, heightAt, size, land, seed };
}

// Wind at altitude y (absolute), smoothly blended across layer boundaries; calm near the ground.
export function windAt(layers, y, out) {
  let x = 0, z = 0, wsum = 0;
  for (const L of layers) {
    const lo = L.i === 0 ? -99 : L.y0, hi = L.i === layers.length - 1 ? 999 : L.y1;
    const w = smooth(lo - 1, lo + 1, y) * (1 - smooth(hi - 1, hi + 1, y));
    if (w <= 0) continue;
    const d = dirVec(L.deg); x += d.x * L.speed * w; z += d.z * L.speed * w; wsum += w;
  }
  const calm = smooth(FLOOR - 4.5, FLOOR, y) * 0.92 + 0.08;
  if (wsum > 0) { x /= wsum; z /= wsum; }
  out.x = x * calm; out.z = z * calm;
  return out;
}
export const layerAt = (layers, y) => layers.find((L) => y >= L.y0 && y < L.y1) || (y < FLOOR ? null : layers[layers.length - 1]);
