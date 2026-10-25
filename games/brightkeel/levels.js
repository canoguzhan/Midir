// Brightkeel nights: pure data plus a seeded rock scatter (no DOM, no THREE).
// Coordinates: x to the right, z toward the harbour shore (the camera side), water at y = 0.
// Piers stand on the shore at z = SHORE and reach PIER_LEN into the bay; boats dock just past the pier tip.

export const SHORE = 7.6, PIER_LEN = 3.2, DOCK_Z = SHORE - PIER_LEN - 0.55;
export const AREA = { x0: -15.6, x1: 15.6, z0: -11.4, z1: SHORE };

// One pier per colour, each with its own symbol so colours never have to be told apart by hue alone.
export const COLORS = [
  { id: 'red', hex: '#ff6159', sym: 'circle' },
  { id: 'green', hex: '#4fe39a', sym: 'triangle' },
  { id: 'blue', hex: '#5ab8ff', sym: 'square' },
  { id: 'violet', hex: '#c890ff', sym: 'diamond' },
];
export const PIER_X = { 1: [0], 2: [-6, 6], 3: [-9, 0, 9], 4: [-10.5, -3.5, 3.5, 10.5] };

export function rng(seed) { // mulberry32: same rocks for the same night every time
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Rocks sit in the middle of the bay: never in the arrival band at the top, never on a dock approach, never in a whirlpool.
export function scatterRocks(n, seed, piers, avoid = []) {
  const rnd = rng(seed), out = [], keep = [...piers.map((x) => ({ x, z: DOCK_Z, r: 3.2 })), ...avoid];
  for (let tries = 0; out.length < n && tries < 4000; tries++) {
    const x = -12.8 + rnd() * 25.6, z = -7.4 + rnd() * 9.6, r = 0.5 + rnd() * 0.5;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 2.7)) continue;
    if (keep.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + r)) continue;
    out.push({ x, z, r, seed: (rnd() * 1e6) | 0 });
  }
  return out;
}

// boats: how many arrive; maxAt: how many can be on the water at once; every: seconds between arrivals;
// drift: speed of boats left in the dark (x base); types: arrival weights; par: seconds for the third star.
// currents: {x, z, w, h, dx, dz} (a band that pushes dark boats); fog: drifting fog banks; whirl: [x, z]; storm / whale: on.
export const NIGHTS = [
  { name: { en: 'First Light', tr: 'İlk Işık' }, piers: 1, boats: 3, maxAt: 1, every: 5, drift: 0.85, rocks: 0, seed: 11,
    types: { trawler: 1 }, par: 35, tip: 'first' },
  { name: { en: 'Two Lanterns', tr: 'İki Fener' }, piers: 2, boats: 5, maxAt: 2, every: 9, drift: 0.9, rocks: 0, seed: 12,
    types: { trawler: 2, skiff: 1 }, par: 65, tip: 'colors' },
  { name: { en: 'Hidden Rocks', tr: 'Gizli Kayalar' }, piers: 2, boats: 6, maxAt: 2, every: 8, drift: 0.95, rocks: 5, seed: 13,
    types: { trawler: 2, skiff: 2 }, par: 75, tip: 'rocks' },
  { name: { en: 'The Drift', tr: 'Akıntı' }, piers: 2, boats: 7, maxAt: 3, every: 8, drift: 1, rocks: 4, seed: 14,
    types: { trawler: 2, skiff: 2, sail: 1 }, par: 90, tip: 'current',
    currents: [{ x: 0, z: -3.2, w: 30, h: 3.2, dx: 0.75, dz: 0 }] },
  { name: { en: 'Foghorn', tr: 'Sis Düdüğü' }, piers: 3, boats: 8, maxAt: 3, every: 7.5, drift: 1, rocks: 5, seed: 15,
    types: { trawler: 2, skiff: 2, sail: 2 }, par: 105, tip: 'horn', horn: true },
  { name: { en: 'Ferry Night', tr: 'Vapur Gecesi' }, piers: 3, boats: 9, maxAt: 3, every: 7.5, drift: 1.05, rocks: 6, seed: 16,
    types: { trawler: 2, skiff: 2, sail: 1, ferry: 2 }, par: 120, tip: 'ferry', horn: true,
    currents: [{ x: -6, z: -1.5, w: 14, h: 3, dx: -0.7, dz: 0 }] },
  { name: { en: 'Sea Fog', tr: 'Deniz Sisi' }, piers: 3, boats: 10, maxAt: 3, every: 7, drift: 1.05, rocks: 6, seed: 17,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 1 }, par: 120, tip: 'fog', horn: true, fog: 3 },
  { name: { en: 'Busy Cove', tr: 'Kalabalık Koy' }, piers: 3, boats: 12, maxAt: 4, every: 6.5, drift: 1.1, rocks: 7, seed: 18,
    types: { trawler: 2, skiff: 3, sail: 2, ferry: 1 }, par: 135, horn: true,
    currents: [{ x: 6, z: -5, w: 16, h: 2.8, dx: -0.8, dz: 0 }, { x: -7, z: 1, w: 14, h: 2.6, dx: 0.7, dz: 0 }] },
  { name: { en: 'The Whirl', tr: 'Girdap' }, piers: 3, boats: 11, maxAt: 4, every: 6.5, drift: 1.1, rocks: 4, seed: 19,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 1 }, par: 125, tip: 'whirl', horn: true, whirl: [0, -2.5] },
  { name: { en: 'Four Lights', tr: 'Dört Işık' }, piers: 4, boats: 12, maxAt: 4, every: 6.5, drift: 1.12, rocks: 6, seed: 20,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 1 }, par: 145, tip: 'four', horn: true, fog: 2 },
  { name: { en: 'Squall', tr: 'Sağanak' }, piers: 3, boats: 12, maxAt: 4, every: 6.5, drift: 1.12, rocks: 6, seed: 21,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 1 }, par: 135, tip: 'storm', horn: true, storm: true },
  { name: { en: 'Fog and Tide', tr: 'Sis ve Gelgit' }, piers: 4, boats: 14, maxAt: 4, every: 6, drift: 1.15, rocks: 6, seed: 22,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 2 }, par: 175, horn: true, fog: 3,
    currents: [{ x: 0, z: -4.5, w: 30, h: 2.8, dx: 0.8, dz: 0 }] },
  { name: { en: 'Moonwhale', tr: 'Ay Balinası' }, piers: 4, boats: 14, maxAt: 4, every: 6, drift: 1.15, rocks: 5, seed: 23,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 2 }, par: 155, tip: 'whale', horn: true, whale: true },
  { name: { en: 'Tempest', tr: 'Fırtına' }, piers: 4, boats: 15, maxAt: 5, every: 5.8, drift: 1.18, rocks: 5, seed: 24,
    types: { trawler: 2, skiff: 2, sail: 2, ferry: 2 }, par: 155, horn: true, storm: true, whirl: [-4, -3] },
  { name: { en: "Keeper's Night", tr: 'Bekçinin Gecesi' }, piers: 4, boats: 18, maxAt: 5, every: 5.5, drift: 1.2, rocks: 6, seed: 25,
    types: { trawler: 3, skiff: 2, sail: 2, ferry: 2 }, par: 185, horn: true, storm: true, whale: true, fog: 2,
    currents: [{ x: 5, z: -1, w: 18, h: 2.6, dx: -0.75, dz: 0 }] },
];

// Long Night: endless, unlocked after night 5. Hazards join as the night goes on (seconds); score = boats home.
export const LONG = {
  name: { en: 'Long Night', tr: 'Uzun Gece' }, piers: 4, rocks: 6, seed: 99, horn: true, whirlAt: 240, whirl: [6, -3.5],
  types: { trawler: 3, skiff: 2, sail: 2, ferry: 1 },
  currents: [{ x: -5, z: -4.5, w: 18, h: 2.6, dx: 0.7, dz: 0 }],
  fogAt: 75, whaleAt: 140, stormAt: 200,
  maxAt: (t) => Math.min(6, 2 + Math.floor(t / 45)), every: (t) => Math.max(3.4, 8 - t / 45), drift: (t) => Math.min(1.3, 0.95 + t / 900),
};

export function nightPiers(def) { return PIER_X[def.piers].map((x, i) => ({ x, color: i })); }
