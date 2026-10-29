// Tanglepeak meshes: everything is procedural, flat-shaded Three.js (no textures to download). The rules live in climb.js;
// this file only builds what you see: the cliff, ledges, holds, campfires, flowers, the summit and the two climbers.
import * as THREE from 'three';
import { rng } from './climb.js';

// one look per zone, from a green spring meadow to a starry crown
export const LOOK = [
  { wall: '#a39380', wall2: '#bba890', band: '#8f7f6c', cap: '#7cc45a', sky: '#9fd4f0', fog: '#cfe8f2', far: '#a7c7d8' }, // meadow
  { wall: '#b98f62', wall2: '#cfa673', band: '#a27a52', cap: '#6aa850', sky: '#a6d6ee', fog: '#d6eaf0', far: '#a9c4d3' }, // pines (sandstone)
  { wall: '#6e8189', wall2: '#82969d', band: '#5d6f77', cap: '#4f9e70', sky: '#acd9ec', fog: '#d8ecf2', far: '#a2bfcf' }, // falls (wet slate)
  { wall: '#8b8b98', wall2: '#a1a1ad', band: '#777784', cap: '#a5bf6c', sky: '#b9dcec', fog: '#dfedf2', far: '#a9c0cf' }, // ridge
  { wall: '#a8bccc', wall2: '#c7d7e3', band: '#93a9bb', cap: '#f6f9fc', sky: '#cde3ef', fog: '#e8f1f6', far: '#bccfdb' }, // frost
  { wall: '#6b6576', wall2: '#80798b', band: '#5a5465', cap: '#eef0f5', sky: '#f3c69c', fog: '#f1d4b8', far: '#c9a99c' }, // cable (golden hour)
  { wall: '#57507a', wall2: '#6b6390', band: '#48416a', cap: '#f4f1ff', sky: '#3f4486', fog: '#6f69a6', far: '#57548a' }, // crown (night)
];
export const OUTFITS = { // beanies and jackets for the two climbers, unlocked by edelweiss
  hats: [['#ff7a3d', '#2ec4b6'], ['#e8463c', '#ffc23d'], ['#7a5cff', '#ff8ac2'], ['#2f9e5a', '#f4f1e6'], ['#ffc23d', '#3f7fe0'], ['#f4f1e6', '#e8463c'], ['#25334d', '#ff7a3d'], ['#ff8ac2', '#7ad3ff']],
  ropes: ['#ff7a3d', '#ffd23f', '#2ec4b6', '#e8463c', '#9b6cff', '#f4f1e6'],
};

const mats = new Map();
export function mat(color, opts = {}) { // shared flat-shaded materials
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts }));
  return mats.get(key);
}
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const C = new THREE.Color(), C2 = new THREE.Color();

function facetColors(geo, colorAt) { // non-indexed geometry, one colour per triangle -> crisp low-poly facets
  const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    colorAt(x, y, z, C);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = C.r; col[(i + k) * 3 + 1] = C.g; col[(i + k) * 3 + 2] = C.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
function jitter(geo, R, amt, keep = () => false) {
  const p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, keep(p.getX(i), p.getY(i), p.getZ(i)) ? [0, 0, 0] : [(R() - 0.5) * amt[0], (R() - 0.5) * amt[1], (R() - 0.5) * amt[2]]);
    const d = seen.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
}

// ================================================================ CLIFF (one wall slab + two gully pillars per zone)
export function buildCliff(m) {
  const g = new THREE.Group(), R = rng(m.seed + 5);
  m.zones.forEach((z, zi) => {
    const L = LOOK[zi], h = z.y1 - z.y0 + 6, w = z.width * 2 + 7, sx = Math.ceil(w / 1.6), sy = Math.ceil(h / 1.6);
    let geo = new THREE.PlaneGeometry(w, h, sx, sy);
    geo.translate(0, z.y0 + h / 2 - 3, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x + (R() - 0.5) * 0.9, y + (R() - 0.5) * 0.9, -1.0 - R() * 0.7 - Math.sin(y * 0.21 + x * 0.13) * 0.35); }
    geo = geo.toNonIndexed();
    const a = new THREE.Color(L.wall), b = new THREE.Color(L.wall2), band = new THREE.Color(L.band);
    const below = zi ? new THREE.Color(LOOK[zi - 1].wall) : a;
    facetColors(geo, (x, y, zz, out) => {
      const k = (Math.sin(y * 0.9 + Math.sin(x * 0.4) * 1.5) + 1) / 2, s = Math.sin(y * 0.35) > 0.82;
      out.copy(a).lerp(b, k * 0.8 + R() * 0.2); if (s) out.lerp(band, 0.7);
      const blend = Math.max(0, Math.min(1, (z.y0 + 4 - y) / 8)); if (blend > 0) out.lerp(below, blend * 0.8); // zones fade into each other
      out.multiplyScalar(0.92 + R() * 0.12);
    });
    geo.computeVertexNormals();
    const wall = new THREE.Mesh(geo, vcMat); wall.receiveShadow = true; g.add(wall);
    for (const sd of [-1, 1]) { // the gully's side pillars stick out toward the camera
      let pg = new THREE.BoxGeometry(3.4, h, 5, 2, Math.ceil(h / 1.8), 3);
      pg.translate(sd * (z.width + 3.0), z.y0 + h / 2 - 3, 1.3);
      jitter(pg, R, [0.7, 0.5, 0.6]);
      pg = pg.toNonIndexed();
      const pa = new THREE.Color(L.wall).multiplyScalar(0.82), pb = new THREE.Color(L.band).multiplyScalar(0.9);
      facetColors(pg, (x, y, zz, out) => { out.copy(pa).lerp(pb, R() * 0.6); const bl = Math.max(0, Math.min(1, (z.y0 + 4 - y) / 8)); if (bl > 0 && zi) out.lerp(new THREE.Color(LOOK[zi - 1].wall).multiplyScalar(0.82), bl * 0.8); });
      pg.computeVertexNormals();
      const pil = new THREE.Mesh(pg, vcMat); pil.castShadow = true; pil.receiveShadow = true; g.add(pil);
    }
  });
  return g;
}

// little things growing on the rock, one theme per zone (instanced: cheap)
const G_TUFT = new THREE.ConeGeometry(0.16, 0.34, 4), G_PATCH = new THREE.IcosahedronGeometry(0.4, 0), G_CRYSTAL = new THREE.OctahedronGeometry(0.28, 0);
export function buildWallDetail(m, R = rng(m.seed + 21)) {
  const g = new THREE.Group(), near = (x, y) => m.live.some((h) => Math.abs(h.x - x) < 0.8 && Math.abs(h.y - y) < 0.8);
  const kinds = [
    { geo: G_TUFT, colors: ['#6fbf4a', '#8fd16a', '#5aa83e'], n: 90, s: [0.5, 1.0], flat: false }, // meadow: grass tufts
    { geo: G_TUFT, colors: ['#3f8f4f', '#4f9e58', '#7a5236'], n: 70, s: [1, 2.2], flat: false }, // pines: little shrubs
    { geo: G_PATCH, colors: ['#4f9e70', '#6cb88a', '#3d8a5c'], n: 80, s: [0.6, 1.5], flat: true }, // falls: moss
    { geo: G_PATCH, colors: ['#e3b23c', '#d98a3a', '#b9c46a'], n: 70, s: [0.3, 0.8], flat: true }, // ridge: lichen
    { geo: G_PATCH, colors: ['#ffffff', '#eef6fb', '#dbeaf4'], n: 90, s: [0.8, 1.8], flat: true }, // frost: snow
    { geo: G_PATCH, colors: ['#4a4555', '#5c566a', '#7a5236'], n: 50, s: [0.5, 1.2], flat: true }, // cable: soot and old timber
    { geo: G_CRYSTAL, colors: ['#9b8cff', '#6fe3ff', '#ffb3f0'], n: 40, s: [0.6, 1.3], flat: false, glow: true }, // crown: crystals
  ];
  m.zones.forEach((z, zi) => {
    const K = kinds[zi], mesh = new THREE.InstancedMesh(K.geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, ...(K.glow ? { emissive: '#4a3a9a', emissiveIntensity: 0.6 } : {}) }), K.n);
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (let tries = 0; tries < K.n * 6 && k < K.n; tries++) {
      const x = (R() - 0.5) * (z.width * 2 + 1.5), y = z.y0 + R() * (z.y1 - z.y0);
      if (near(x, y)) continue;
      const s = K.s[0] + R() * (K.s[1] - K.s[0]);
      e.set(K.flat ? 0 : (R() - 0.5) * 0.6, R() * 6, K.flat ? R() * 6 : (R() - 0.5) * 0.5); q.setFromEuler(e);
      sc.set(s, K.flat ? s * 0.5 : s, K.flat ? 0.25 : s);
      M4.compose(p.set(x, y, K.flat ? -1.05 : -0.95), q, sc); mesh.setMatrixAt(k, M4); mesh.setColorAt(k, C.set(K.colors[k % K.colors.length])); k++;
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    g.add(mesh);
  });
  return g;
}

// ground: a spring meadow at the foot of the climb, with pines, boulders and wildflowers
export function buildGround(R = rng(77)) {
  const g = new THREE.Group();
  let geo = new THREE.PlaneGeometry(140, 70, 40, 20); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const far = Math.max(0, Math.abs(x) - 12) * 0.12 + Math.max(0, -z - 8) * 0.05; p.setY(i, Math.max(0, far * (0.6 + R() * 0.8)) + (R() - 0.5) * 0.15); }
  geo = geo.toNonIndexed();
  const ga = new THREE.Color('#7cc45a'), gb = new THREE.Color('#5fae4a');
  facetColors(geo, (x, y, z, out) => out.copy(ga).lerp(gb, R()));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, vcMat); ground.receiveShadow = true; ground.position.y = -0.02; g.add(ground);
  for (let i = 0; i < 46; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (11 + R() * 40), z = -6 - R() * 26 + (Math.abs(x) > 18 ? R() * 18 : 0);
    g.add(buildPine(0.8 + R() * 1.4, R, x, 0, z));
  }
  for (let i = 0; i < 10; i++) { const x = (R() < 0.5 ? -1 : 1) * (12 + R() * 14), z = 3 + R() * 6; g.add(buildPine(0.8 + R() * 0.9, R, x, 0, z)); }
  for (let i = 0; i < 70; i++) {
    const f = new THREE.Mesh(FLOWER_DOT, mat(['#ffffff', '#ffd23f', '#ff8ac2', '#a98bff'][i % 4])); f.position.set((R() - 0.5) * 40, 0.08, -1 + R() * 9); g.add(f);
  }
  return g;
}
const FLOWER_DOT = new THREE.IcosahedronGeometry(0.09, 0);
const PINE_CONE = new THREE.ConeGeometry(1, 1.6, 6), TRUNK = new THREE.CylinderGeometry(0.12, 0.16, 0.6, 5);
export function buildPine(s, R, x, y, z) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK, mat('#7a5236')); trunk.position.y = 0.3; t.add(trunk);
  const green = ['#3f8f4f', '#4f9e58', '#367f46'][Math.floor(R() * 3)];
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(PINE_CONE, mat(green)); c.scale.setScalar(1 - k * 0.25); c.position.y = 1.0 + k * 0.75; c.castShadow = true; t.add(c); }
  t.scale.setScalar(s); t.position.set(x, y, z); t.rotation.y = R() * 6;
  return t;
}

// ================================================================ LEDGES + ROCKS (one chunky slab per collision capsule)
export function buildSlab(s, zi, R) {
  const L = LOOK[zi] || LOOK[0], len = Math.hypot(s.bx - s.ax, s.by - s.ay) + s.r * 2, th = s.r * 2;
  const g = new THREE.Group();
  let geo = new THREE.BoxGeometry(len, th, 1.9, Math.max(2, Math.round(len)), 1, 2);
  jitter(geo, R, [0.18, 0.12, 0.25], (x, y) => y > th / 2 - 0.01);
  geo = geo.toNonIndexed();
  const a = new THREE.Color(L.wall).multiplyScalar(0.95), b = new THREE.Color(L.band);
  facetColors(geo, (x, y, z, out) => out.copy(a).lerp(b, R() * 0.7));
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, vcMat); rock.castShadow = true; rock.receiveShadow = true; g.add(rock);
  if (s.kind !== 'rock') { // a cap of grass / moss / snow on top
    let cg = new THREE.BoxGeometry(len - 0.04, 0.14, 1.85, Math.max(2, Math.round(len * 2)), 1, 2); jitter(cg, R, [0.05, 0.1, 0.05], (x, y) => y < 0); cg = cg.toNonIndexed();
    const ca = new THREE.Color(L.cap), cb = new THREE.Color(L.cap).multiplyScalar(0.85); facetColors(cg, (x, y, z, out) => out.copy(ca).lerp(cb, R())); cg.computeVertexNormals();
    const cap = new THREE.Mesh(cg, vcMat); cap.position.y = th / 2 + 0.04; cap.receiveShadow = true; g.add(cap);
    if (zi >= 4) for (let x = -len / 2 + 0.4; x < len / 2 - 0.2; x += 0.55 + R() * 0.5) { // icicles under frosty ledges
      const ic = new THREE.Mesh(ICICLE, mat('#d8f1ff', { emissive: '#4a8fb5', emissiveIntensity: 0.15 })); ic.scale.y = 0.6 + R() * 0.9; ic.position.set(x, -th / 2 - 0.2 * ic.scale.y, 0.6 + (R() - 0.5) * 0.6); g.add(ic);
    }
    if (zi <= 1 && R() < 0.6 && len > 2.6) g.add(buildPine(0.32 + R() * 0.15, R, (R() - 0.5) * (len - 1), th / 2 + 0.05, -0.6));
  }
  g.position.set((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 0.15);
  g.rotation.z = Math.atan2(s.by - s.ay, s.bx - s.ax);
  return g;
}
const ICICLE = new THREE.ConeGeometry(0.07, 0.4, 5); ICICLE.rotateX(Math.PI);

// ================================================================ HOLDS
const G_STONE = new THREE.DodecahedronGeometry(0.25, 0), G_PLATE = new THREE.CircleGeometry(0.36, 9), G_ICE = new THREE.IcosahedronGeometry(0.21, 0), G_CHALK = new THREE.IcosahedronGeometry(0.07, 0);
const G_RING = new THREE.TorusGeometry(0.13, 0.045, 6, 12), G_BOLT = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6), G_CRACK = new THREE.BoxGeometry(0.03, 0.3, 0.04);
const G_HOOK = new THREE.TorusGeometry(0.11, 0.035, 5, 10, Math.PI * 1.3), G_CABLE = new THREE.CylinderGeometry(0.025, 0.025, 1, 4);
export const HOLD_COLORS = { stone: '#f3e2c4', crumble: '#f0a24a', moss: '#4fbf6a', ice: '#bfe9ff', piton: '#ffc23d', hook: '#b4bdcc' };
export function buildHold(h) {
  const g = new THREE.Group();
  let m;
  if (h.type === 'ice') { m = new THREE.Mesh(G_ICE, mat('#c4ecff', { emissive: '#5fb8e0', emissiveIntensity: 0.35, roughness: 0.3 })); }
  else if (h.type === 'piton') {
    m = new THREE.Group();
    const bolt = new THREE.Mesh(G_BOLT, mat('#c99a2e', { metalness: 0.6, roughness: 0.35 })); bolt.rotation.x = Math.PI / 2; bolt.position.z = -0.08; m.add(bolt);
    const ring = new THREE.Mesh(G_RING, mat('#ffc23d', { metalness: 0.7, roughness: 0.3, emissive: '#6b4a00', emissiveIntensity: 0.4 })); m.add(ring);
  } else if (h.type === 'hook') {
    m = new THREE.Group();
    const hook = new THREE.Mesh(G_HOOK, mat('#aab3c2', { metalness: 0.7, roughness: 0.35 })); hook.rotation.z = -0.4; m.add(hook);
    const top = new THREE.Mesh(G_BOLT, mat('#6b7280', { metalness: 0.5 })); top.scale.set(0.8, 0.9, 0.8); top.position.y = 0.17; m.add(top);
  } else {
    m = new THREE.Mesh(G_STONE, mat(HOLD_COLORS[h.type] || HOLD_COLORS.stone));
    m.scale.set(1.15, 0.8, 0.75);
    if (h.type === 'stone') { const ch = new THREE.Mesh(G_CHALK, mat('#ffffff')); ch.position.set(0.04, 0.12, 0.08); m.add(ch); }
    if (h.type === 'crumble') for (const r of [-0.5, 0.6]) { const c = new THREE.Mesh(G_CRACK, mat('#6b4423')); c.rotation.z = r; c.position.set(r * 0.08, 0, 0.16); m.add(c); }
    if (h.type === 'moss') { const t = new THREE.Mesh(G_CHALK, mat('#8fd18a')); t.scale.set(2.2, 0.8, 1.6); t.position.y = 0.14; m.add(t); }
  }
  // a dark socket behind every hold, so holds read clearly against the rock
  const plate = new THREE.Mesh(G_PLATE, new THREE.MeshBasicMaterial({ color: '#2b2233', transparent: true, opacity: 0.35, depthWrite: false })); plate.position.z = -0.12; g.add(plate);
  g.add(m); g.userData.body = m;
  g.position.set(h.x, h.y, -0.2);
  return g;
}
export function buildCable(h) { // a steel cable along the hook's track
  const M = h.move, len = Math.hypot(M.dx, M.dy) * 2 + 1.4;
  const c = new THREE.Mesh(G_CABLE, mat('#4a4f5c', { metalness: 0.5, roughness: 0.5 }));
  c.scale.y = len; c.position.set(h.x, h.y + 0.25, -0.35); c.rotation.z = -Math.atan2(M.dx, M.dy);
  const g = new THREE.Group(); g.add(c);
  for (const sd of [-1, 1]) { const anchor = new THREE.Mesh(G_BOLT, mat('#6b7280', { metalness: 0.5 })); anchor.rotation.x = Math.PI / 2; const k = len / 2 / Math.hypot(M.dx, M.dy); anchor.position.set(h.x + M.dx * k * sd, h.y + 0.25 + M.dy * k * sd, -0.4); g.add(anchor); }
  return g;
}

// ================================================================ CAMPFIRES, FLOWERS, SUMMIT
const G_LOG = new THREE.CylinderGeometry(0.07, 0.08, 0.6, 5), G_FLAME = new THREE.ConeGeometry(0.17, 0.5, 6), G_STONE_S = new THREE.DodecahedronGeometry(0.09, 0);
export function buildCamp(c) {
  const g = new THREE.Group();
  for (const r of [0.6, -0.6]) { const l = new THREE.Mesh(G_LOG, mat('#7a4e2c')); l.rotation.set(Math.PI / 2, 0, r); l.position.y = 0.08; g.add(l); }
  for (let k = 0; k < 7; k++) { const s = new THREE.Mesh(G_STONE_S, mat('#9c958c')); const a = (k / 7) * Math.PI * 2; s.position.set(Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32); g.add(s); }
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(G_FLAME, new THREE.MeshBasicMaterial({ color: '#ff8a2a' })); outer.position.y = 0.3; flame.add(outer);
  const inner = new THREE.Mesh(G_FLAME, new THREE.MeshBasicMaterial({ color: '#ffe066' })); inner.scale.set(0.55, 0.65, 0.55); inner.position.y = 0.24; flame.add(inner);
  g.add(flame); g.userData.flame = flame;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.25, depthWrite: false })); glow.position.set(0, 0.45, 0.05); g.add(glow); g.userData.glow = glow;
  // a little pennant on a stick: the campfire's banner
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 4), mat('#7a5236')); pole.position.set(0.55, 0.55, -0.3); g.add(pole);
  const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.45, -0.13, 0), new THREE.Vector3(0, -0.26, 0)]), new THREE.MeshBasicMaterial({ color: '#ff7a3d', side: THREE.DoubleSide }));
  flag.geometry.computeVertexNormals(); flag.position.set(0.57, 1.08, -0.3); g.add(flag); g.userData.flag = flag;
  g.position.set(c.x, c.y, 0.3);
  return g;
}
const G_PETAL = new THREE.SphereGeometry(0.1, 6, 4), G_CENTER = new THREE.IcosahedronGeometry(0.07, 0);
export function buildFlower() {
  const g = new THREE.Group();
  for (let k = 0; k < 7; k++) { const p = new THREE.Mesh(G_PETAL, mat('#ffffff', { emissive: '#bfc8ff', emissiveIntensity: 0.25 })); const a = (k / 7) * Math.PI * 2; p.scale.set(1.2, 0.45, 0.35); p.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0); p.rotation.z = a; g.add(p); }
  const c = new THREE.Mesh(G_CENTER, mat('#ffd23f', { emissive: '#a07000', emissiveIntensity: 0.3 })); c.position.z = 0.04; g.add(c);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 20), new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.5, depthWrite: false })); halo.position.z = -0.02; g.add(halo); g.userData.halo = halo;
  return g;
}
export function buildSummit(sm) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), mat('#d9d9e3', { metalness: 0.4 })); pole.position.set(0, 1.6, -0.4); g.add(pole);
  const fg = new THREE.PlaneGeometry(1.6, 1, 8, 4); fg.translate(0.8, 0, 0);
  const flag = new THREE.Mesh(fg, mat('#ff7a3d', { side: THREE.DoubleSide, flatShading: false })); flag.position.set(0.05, 2.7, -0.4); g.add(flag); g.userData.flag = flag;
  for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(G_STONE, mat('#bdb6c9')); s.scale.setScalar(1.5 - k * 0.15); s.position.set((k % 2 ? 0.25 : -0.25), 0.2 + k * 0.22, -0.4); g.add(s); }
  g.position.set(sm.x - 1.2, sm.y, 0);
  return g;
}

// ================================================================ DRESSING (per zone: waterfall, bunting, mine beams, stars)
export function buildDressing(m, R = rng(m.seed + 9)) {
  const g = new THREE.Group(), anim = { waterfall: null, bunting: [], lanterns: [], aurora: [] };
  const zf = m.zones[2], zr = m.zones[3], zc = m.zones[5], zn = m.zones[6];
  // waterfall: pours down the left pillar's face through the wet zone
  const wfH = zf.y1 - zf.y0 + 10, wfGeo = new THREE.PlaneGeometry(1.8, wfH, 1, 1);
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128; const cx = cv.getContext('2d');
  cx.fillStyle = '#9fd8f0'; cx.fillRect(0, 0, 32, 128);
  for (let i = 0; i < 40; i++) { cx.fillStyle = i % 3 ? 'rgba(255,255,255,.55)' : 'rgba(120,190,230,.6)'; cx.fillRect(Math.random() * 30, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 26); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, wfH / 6);
  const wf = new THREE.Mesh(wfGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85 }));
  wf.position.set(-(zf.width + 1.35), (zf.y0 + zf.y1) / 2 - 2, 2.2); g.add(wf); anim.waterfall = tex;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 12), new THREE.MeshBasicMaterial({ color: '#d7f1fb', transparent: true, opacity: 0.6 })); pool.position.set(wf.position.x, zf.y0 - 6, 2.4); g.add(pool);
  // bunting: strings of little flags across the windy ridge (they snap in gusts)
  for (let y = zr.y0 + 6; y < zr.y1 - 4; y += 9 + R() * 5) {
    const sd = R() < 0.5 ? -1 : 1, x0 = sd * (zr.width + 1.6), x1 = sd * (zr.width - 3.5 - R() * 2), n = 7;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, Math.abs(x1 - x0), 3), mat('#5a4a3a')); line.rotation.z = Math.PI / 2; line.position.set((x0 + x1) / 2, y, -0.6); g.add(line);
    const flags = [];
    for (let k = 0; k < n; k++) {
      const f = new THREE.Mesh(BUNT, new THREE.MeshBasicMaterial({ color: ['#ff7a3d', '#ffd23f', '#2ec4b6', '#e8463c', '#7a5cff'][k % 5], side: THREE.DoubleSide }));
      f.position.set(x0 + ((x1 - x0) * (k + 0.5)) / n, y, -0.58); g.add(f); flags.push(f);
    }
    anim.bunting.push(flags);
  }
  // the old mine: timber beams and lanterns on the pillars along the cable zone
  for (let y = zc.y0 + 3; y < zc.y1; y += 7 + R() * 4) {
    for (const sd of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.2), mat('#7a5236')); beam.position.set(sd * (zc.width + 1.3), y, 1.2); g.add(beam);
      if (R() < 0.6) { const lan = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#ffd27a' })); lan.position.set(sd * (zc.width + 1.0), y - 0.45, 2.4); g.add(lan); anim.lanterns.push(lan); }
    }
  }
  // the crown: stars and a soft aurora far behind the peak
  const sp = [], sc = [];
  for (let i = 0; i < 380; i++) { sp.push((R() - 0.5) * 260, zn.y0 - 40 + R() * 170, -120 - R() * 40); const b = 0.6 + R() * 0.4; sc.push(b, b, b * (0.9 + R() * 0.1)); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false })); g.add(stars); anim.stars = stars;
  for (let k = 0; k < 3; k++) {
    const ag = new THREE.PlaneGeometry(200, 26, 40, 1), a = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: ['#6fffc8', '#7ad3ff', '#b58bff'][k], transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    a.position.set(0, zn.y0 + 40 + k * 16, -110 + k * 5); a.rotation.x = -0.25; g.add(a); anim.aurora.push(a);
  }
  return { group: g, anim };
}
const BUNT = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0), new THREE.Vector3(0, -0.4, 0)]);

// distant ranges: three layers of jagged peaks that drift with parallax
export function buildRanges(R = rng(4)) {
  const layers = [];
  [[-70, 46, '#a9c7d6'], [-120, 70, '#bcd4e0'], [-180, 96, '#cfe0e8']].forEach(([z, hgt, col], li) => {
    const shape = new THREE.Shape(), W = 520; shape.moveTo(-W / 2, -260);
    let x = -W / 2; while (x < W / 2) { x += 10 + R() * 22; shape.lineTo(x, hgt * (0.35 + R() * 0.65)); }
    shape.lineTo(W / 2, -260); shape.lineTo(-W / 2, -260);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, fog: false }));
    mesh.position.z = z; mesh.userData = { k: 0.55 + li * 0.15, base: col }; layers.push(mesh);
    // snowy tips on the near ranges
  });
  return layers;
}
const G_PUFF = new THREE.IcosahedronGeometry(1, 1);
export function buildCloud(R) {
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(G_PUFF, mat('#ffffff', { roughness: 1 })); p.scale.set(1.6 + R() * 1.4, 1 + R() * 0.6, 1); p.position.set((k - 2) * 1.5 + R(), R() * 0.6, R()); g.add(p); }
  return g;
}

// ================================================================ CLIMBERS
const G_BODY = new THREE.CapsuleGeometry(0.19, 0.2, 3, 8), G_HEAD = new THREE.SphereGeometry(0.2, 10, 8), G_EYE = new THREE.SphereGeometry(0.03, 6, 4);
const G_HAT = new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), G_POM = new THREE.IcosahedronGeometry(0.075, 1), G_BAND = new THREE.TorusGeometry(0.205, 0.04, 5, 14);
const G_LIMB = new THREE.CapsuleGeometry(0.055, 0.2, 2, 6), G_HAND = new THREE.SphereGeometry(0.06, 6, 4), G_BOOT = new THREE.BoxGeometry(0.12, 0.08, 0.16), G_PACK = new THREE.BoxGeometry(0.26, 0.28, 0.14);
export function buildClimber(hat, jacket) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const jm = mat(jacket), hm = mat(hat), skin = mat('#ffd9b8'), dark = mat('#2b2233'), boot = mat('#5a4031');
  const body = new THREE.Mesh(G_BODY, jm); body.castShadow = true; rig.add(body);
  const pack = new THREE.Mesh(G_PACK, mat('#8a5a3a')); pack.position.set(0, 0.02, -0.18); rig.add(pack);
  const head = new THREE.Group(); head.position.y = 0.38; rig.add(head);
  const face = new THREE.Mesh(G_HEAD, skin); face.castShadow = true; head.add(face);
  const eyes = [];
  for (const sx of [-0.075, 0.075]) { const e = new THREE.Mesh(G_EYE, dark); e.position.set(sx, 0.01, 0.18); e.scale.y = 1.3; head.add(e); eyes.push(e); }
  for (const sx of [-0.12, 0.12]) { const ch = new THREE.Mesh(G_EYE, mat('#ff9e9e')); ch.scale.set(1.3, 0.8, 0.5); ch.position.set(sx, -0.06, 0.16); head.add(ch); }
  const hatM = new THREE.Mesh(G_HAT, hm); hatM.position.y = 0.03; hatM.castShadow = true; head.add(hatM);
  const band = new THREE.Mesh(G_BAND, mat(new THREE.Color(hat).multiplyScalar(0.75).getStyle())); band.rotation.x = Math.PI / 2; band.position.y = 0.04; head.add(band);
  const pom = new THREE.Mesh(G_POM, mat('#fff6e4')); pom.position.y = 0.27; head.add(pom);
  const limb = (x, y, m, len = 1) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); const l = new THREE.Mesh(G_LIMB, m); l.position.y = -0.14 * len; l.scale.y = len; piv.add(l); rig.add(piv); return piv; };
  const armL = limb(-0.21, 0.12, jm), armR = limb(0.21, 0.12, jm);
  for (const a of [armL, armR]) { const hnd = new THREE.Mesh(G_HAND, skin); hnd.position.y = -0.3; a.add(hnd); }
  const legL = limb(-0.09, -0.22, mat('#3b4f70')), legR = limb(0.09, -0.22, mat('#3b4f70'));
  for (const l of [legL, legR]) { const b = new THREE.Mesh(G_BOOT, boot); b.position.set(0, -0.3, 0.03); l.add(b); }
  root.userData = { rig, head, eyes, armL, armR, legL, legR, blink: Math.random() * 4, face: 1, swing: 0, look: 0 };
  return root;
}
const _v = new THREE.Vector2();
// pose: c = climber state from climb.js; reach = {x,y} the hand target (hold, aim point) or null; t = clock
export function poseClimber(g, c, reach, t, dt, opt = {}) {
  const U = g.userData, { rig, head, eyes, armL, armR, legL, legR } = U;
  g.position.set(c.x, c.y, 0.3);
  const air = c.grip < 0 && !c.stand;
  // face where you move or reach (a quarter turn at most; the camera always sees the face)
  const wantFace = reach ? Math.sign(reach.x - c.x) || U.face : Math.abs(c.vx) > 0.3 ? Math.sign(c.vx) : U.face;
  U.face = wantFace; U.look += ((U.face * 0.45) - U.look) * Math.min(1, dt * 6); rig.rotation.y = U.look;
  // body tilt follows the swing
  const tilt = c.grip >= 0 || air ? Math.max(-0.6, Math.min(0.6, -c.vx * 0.06)) : 0;
  rig.rotation.z += (tilt - rig.rotation.z) * Math.min(1, dt * 8);
  const breathe = Math.sin(t * 2.2 + c.i) * 0.02; rig.position.y = breathe;
  const armTo = (arm, tx, ty) => { // rotate an arm pivot so the hand points at (tx, ty) in world space
    _v.set(tx - (c.x + arm.position.x * Math.cos(U.look)), ty - (c.y + arm.position.y)); const a = Math.atan2(_v.x, -_v.y) - rig.rotation.z;
    arm.rotation.z += (a - arm.rotation.z) * Math.min(1, dt * 14); arm.rotation.x = 0;
  };
  if (c.grip >= 0 && reach) { armTo(armL, reach.x - 0.05, reach.y); armTo(armR, reach.x + 0.05, reach.y); }
  else if (reach) { armTo(armR, reach.x, reach.y); armTo(armL, reach.x - 0.1 * U.face, reach.y - 0.6); }
  else if (air) { const f = Math.sin(t * 18 + c.i) * 0.5; armL.rotation.z += (-2.4 + f - armL.rotation.z) * Math.min(1, dt * 10); armR.rotation.z += (2.4 - f - armR.rotation.z) * Math.min(1, dt * 10); }
  else { const s = Math.sin(t * 2 + c.i) * 0.06; armL.rotation.z += (-0.25 + s - armL.rotation.z) * Math.min(1, dt * 8); armR.rotation.z += (0.25 - s - armR.rotation.z) * Math.min(1, dt * 8); }
  // legs: dangle and kick in the air, stand on ledges
  U.swing += dt * (air || c.grip >= 0 ? 5 + Math.min(8, Math.hypot(c.vx, c.vy)) : 0);
  const kick = air ? Math.sin(U.swing) * 0.6 : c.grip >= 0 ? Math.sin(U.swing * 0.5) * 0.25 - c.vx * 0.05 : 0;
  legL.rotation.z += (kick + (c.stand ? -0.05 : 0.1) - legL.rotation.z) * Math.min(1, dt * 10);
  legR.rotation.z += (-kick + (c.stand ? 0.05 : -0.1) - legR.rotation.z) * Math.min(1, dt * 10);
  // blink, and look worried when tired
  U.blink -= dt; const closed = U.blink < 0.12; if (U.blink < 0) U.blink = 2.5 + Math.random() * 3;
  for (const e of eyes) e.scale.y = closed ? 0.25 : opt.worried ? 0.8 : 1.3;
  head.rotation.z = Math.sin(t * 1.3 + c.i * 2) * 0.06 + (opt.worried ? Math.sin(t * 30) * 0.05 : 0);
  head.rotation.x = air ? -0.25 : c.grip >= 0 ? -0.2 : 0;
}

// a ring of little pips above a gripping climber: grip stamina (green -> red)
export function buildStaminaRing() {
  const geo = new THREE.RingGeometry(0.17, 0.25, 28, 1, Math.PI / 2, -Math.PI * 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
  const back = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.27, 28), new THREE.MeshBasicMaterial({ color: '#1a2438', transparent: true, opacity: 0.55, depthTest: false }));
  const g = new THREE.Group(); g.add(back, m); g.renderOrder = 5; m.renderOrder = 6; back.renderOrder = 5; g.userData = { m, count: geo.index.count };
  return g;
}
export function setStamina(g, st) {
  const { m, count } = g.userData; m.geometry.setDrawRange(0, Math.max(0, Math.floor((count / 6) * st)) * 6);
  m.material.color.set(st > 0.55 ? '#7dff8a' : st > 0.3 ? '#ffd23f' : '#ff5a4a');
}
