// Driftpost meshes: everything is procedural, flat-shaded low-poly "papercraft" (valley, cottages, post office, balloon,
// geese, clouds). Static scenery is merged into a few vertex-coloured meshes so a 4GB Chromebook draws it cheaply.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cellHash, rng } from './levels.js';

export const PAINTS = [ // balloon envelopes: gores a/b, crown c, basket trim d
  { a: '#e8463c', b: '#fff1dc', c: '#ffc93c', d: '#8a5a32' },
  { a: '#3a86e8', b: '#ffd54a', c: '#ffffff', d: '#7a4e2a' },
  { a: '#2fb67c', b: '#fff1dc', c: '#e8463c', d: '#6e4a2a' },
  { a: '#9b5de5', b: '#ff9ecb', c: '#fff1dc', d: '#7a4e2a' },
  { a: '#ff8a3d', b: '#3a3f6e', c: '#ffd54a', d: '#5a3a22' },
  { a: '#23b5b5', b: '#fff7b0', c: '#ff6f61', d: '#8a5a32' },
];
const shared = (m) => { m.userData.shared = true; return m; };
export const MAT = {
  flat: shared(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
  water: shared(new THREE.MeshLambertMaterial({ color: '#5cb8d8', transparent: true, opacity: 0.88 })),
};
const _c = new THREE.Color();
function paint(geo, color) { // non-indexed copy with one vertex colour
  const g = geo.index ? geo.toNonIndexed() : geo; _c.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const place = (g, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
};
const merged = (parts) => { const g = mergeGeometries(parts.filter(Boolean)); g.computeVertexNormals(); return g; };
function prism(w, h, d) { // roof: triangular prism along x, ridge on top
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-w / 2, 0, 0); return g;
}

// ---------------------------------------------------------------- terrain
const FIELD = ['#9ed36a', '#b6dc72', '#88c55c', '#e6d57a', '#d9b583', '#a6cf60', '#c5df8a', '#94cc66'];
export function buildTerrain(G) {
  const S = G.size + 46, step = G.size > 80 ? 2.6 : 2.3, n = Math.ceil((S * 2) / step), pos = [], col = [];
  const H = (x, z) => G.heightAt(x, z), c = new THREE.Color(), cc = new THREE.Color();
  const colorAt = (x, z, h, slope) => {
    if (h < -0.15) return c.set(G.land === 'isles' ? '#e9d8a6' : '#c9b98e');
    if (h < 0.35 && (G.land === 'isles' || G.riverDist(x, z) < 6.5)) return c.set('#ead9a2');
    if (h > 15) return c.set(h > 19 ? '#f5f7fa' : '#b9b6ac');
    if (h > 5 || slope > 1.1) return c.set(slope > 1.5 ? '#a19d90' : '#7fae57');
    const fx = Math.floor(x / 13), fz = Math.floor(z / 13), k = cellHash(fx, fz, G.seed), base = FIELD[Math.floor(k * FIELD.length)];
    c.set(base);
    if (base === '#d9b583' || base === '#e6d57a') { if (Math.floor(z / 1.15) % 2) c.multiplyScalar(0.93); } // ploughed rows
    cc.setHSL(0, 0, (cellHash(Math.floor(x / 2.3), Math.floor(z / 2.3), 3) - 0.5) * 0.04); c.offsetHSL(0, 0, cc.getHSL({}).l);
    return c;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x0 = -S + i * step, z0 = -S + j * step, x1 = x0 + step, z1 = z0 + step;
    const a = H(x0, z0), b = H(x1, z0), d = H(x0, z1), e = H(x1, z1);
    const tri = (p, q, r) => {
      pos.push(...p, ...q, ...r);
      const cx = (p[0] + q[0] + r[0]) / 3, cz = (p[2] + q[2] + r[2]) / 3, h = (p[1] + q[1] + r[1]) / 3;
      const slope = (Math.max(p[1], q[1], r[1]) - Math.min(p[1], q[1], r[1])) / step;
      colorAt(cx, cz, h, slope); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    };
    tri([x0, a, z0], [x0, d, z1], [x1, b, z0]); tri([x1, b, z0], [x0, d, z1], [x1, e, z1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT.flat); m.receiveShadow = true; return m;
}
export function buildWater(G) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry((G.size + 46) * 2, (G.size + 46) * 2), MAT.water);
  m.rotation.x = -Math.PI / 2; m.position.y = -0.05; m.receiveShadow = true; return m;
}

// ---------------------------------------------------------------- scenery (trees, cottages, hedges, windmills) merged per route
function cottage(x, y, z, ry, wall, roof, s = 1) {
  return [
    place(paint(new THREE.BoxGeometry(2.2, 1.5, 1.7), wall), x, y + 0.75 * s, z, ry, s, s, s),
    place(paint(prism(2.5, 1.05, 2.05), roof), x, y + 1.5 * s, z, ry, s, s, s),
    place(paint(new THREE.BoxGeometry(0.32, 0.8, 0.32), '#9a6a4a'), x + Math.cos(ry) * 0.55 * s, y + 2.1 * s, z - Math.sin(ry) * 0.55 * s, ry, s, s, s),
    place(paint(new THREE.BoxGeometry(0.5, 0.8, 0.06), '#7a4e2a'), x + Math.sin(ry) * 0.86 * s, y + 0.4 * s, z + Math.cos(ry) * 0.86 * s, ry, s, s, s),
  ];
}
function tree(x, y, z, k) {
  const tall = k > 0.5, s = 0.8 + k * 0.6;
  return tall
    ? [place(paint(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 5), '#7a5230'), x, y + 0.45 * s, z, 0, s, s, s),
      place(paint(new THREE.ConeGeometry(0.9, 2.3, 6), k > 0.75 ? '#3f8f4a' : '#4c9e4f'), x, y + 1.9 * s, z, k * 6, s, s, s)]
    : [place(paint(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 5), '#7a5230'), x, y + 0.45 * s, z, 0, s, s, s),
      place(paint(new THREE.IcosahedronGeometry(0.95, 0), k > 0.3 ? '#69b04f' : '#7cbd53'), x, y + 1.55 * s, z, k * 6, s, s * 0.9, s)];
}
const FILLER_ROOFS = ['#b0583e', '#8c6a5a', '#a0522d', '#7d6b8a', '#c4703c'];
export function buildScenery(G, seed) {
  const R = rng(seed + 5), parts = [], H = (x, z) => G.heightAt(x, z);
  const busy = [G.depot, ...G.houses];
  const freeAt = (x, z, r) => busy.every((s) => Math.hypot(s.x - x, s.z - z) > r) && G.thermals.every((t) => Math.hypot(t.x - x, t.z - z) > t.r);
  // villages: a few filler cottages around every house and the post office
  for (const s of busy) for (let k = 0; k < 3 + Math.floor(R() * 3); k++) {
    const a = R() * 6.28, d = 9 + R() * 7, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, h = H(x, z);
    if (h < 0.4 || h > 4 || G.riverDist(x, z) < 6) continue;
    parts.push(...cottage(x, h, z, Math.round(R() * 4) * (Math.PI / 2) + (R() - 0.5) * 0.3, '#f4ead6', FILLER_ROOFS[Math.floor(R() * FILLER_ROOFS.length)], 0.8));
  }
  // trees: woods in clumps plus single trees along field edges
  const S = G.size + 30;
  for (let k = 0; k < 1100; k++) {
    let x, z;
    if (k % 3) { const fx = Math.floor((R() - 0.5) * 2 * S / 13), fz = Math.floor((R() - 0.5) * 2 * S / 13); x = fx * 13 + (R() < 0.5 ? 0 : R() * 13); z = fz * 13 + (R() < 0.5 ? R() * 13 : 0); }
    else { const ck = Math.floor(R() * 9), cx = Math.sin(ck * 12.9 + seed) * S * 0.8, cz = Math.cos(ck * 7.3 + seed) * S * 0.8; x = cx + (R() - 0.5) * 22; z = cz + (R() - 0.5) * 22; }
    const h = H(x, z); if (h < 0.35 || h > 10 || !freeAt(x, z, 7.5)) continue;
    if (G.peaks.some((p) => Math.hypot(p.x - x, p.z - z) < p.r * 0.7)) continue;
    parts.push(...tree(x, h - 0.05, z, R()));
  }
  // hedges along a few field borders
  for (let k = 0; k < 70; k++) {
    const fx = Math.floor((R() - 0.5) * 2 * G.size / 13), fz = Math.floor((R() - 0.5) * 2 * G.size / 13), hor = R() < 0.5;
    const x = fx * 13 + (hor ? 6.5 : 0), z = fz * 13 + (hor ? 0 : 6.5), h = H(x, z);
    if (h < 0.35 || h > 3.5 || !freeAt(x, z, 9) || G.riverDist(x, z) < 6) continue;
    parts.push(place(paint(new THREE.BoxGeometry(12, 0.55, 0.55), '#5f9e48'), x, h + 0.2, z, hor ? 0 : Math.PI / 2));
  }
  // rocks on isles beaches
  if (G.land === 'isles') for (const il of G.islands) for (let k = 0; k < 4; k++) {
    const a = R() * 6.28, x = il.x + Math.cos(a) * il.r * 0.95, z = il.z + Math.sin(a) * il.r * 0.95;
    parts.push(place(paint(new THREE.DodecahedronGeometry(0.6 + R() * 0.5, 0), '#a9a49a'), x, H(x, z) + 0.1, z, R() * 6));
  }
  const m = new THREE.Mesh(merged(parts), MAT.flat); m.castShadow = true; m.receiveShadow = true; return m;
}
export function buildWindmill() { // blades spin (userData.blades)
  const g = new THREE.Group();
  const body = new THREE.Mesh(merged([
    paint(new THREE.CylinderGeometry(0.75, 1.15, 4.2, 8), '#f1e6cf'),
    place(paint(new THREE.ConeGeometry(1.0, 1.3, 8), '#b0583e'), 0, 2.75, 0),
    place(paint(new THREE.BoxGeometry(0.5, 0.9, 0.08), '#7a4e2a'), 0, -1.6, 1.05),
  ]), MAT.flat);
  body.position.y = 2.1; body.castShadow = true; g.add(body);
  const blades = new THREE.Mesh(merged([0, 1, 2, 3].map((k) => place(paint(new THREE.BoxGeometry(0.42, 2.6, 0.06), k % 2 ? '#fff6e4' : '#e9d9bb'), 0, 1.4, 0, 0, 1, 1, 1, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ((k * Math.PI) / 2)))
    .concat([paint(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 6).rotateX(Math.PI / 2), '#7a4e2a')])), MAT.flat);
  blades.position.set(0, 3.9, 1.0); blades.castShadow = true; g.add(blades); g.userData.blades = blades;
  return g;
}

// ---------------------------------------------------------------- post office + houses
export function buildDepot() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(merged([
    paint(new THREE.BoxGeometry(4.6, 2.6, 3.4), '#f6ecd8').translate(0, 1.3, 0),
    place(paint(prism(5.1, 1.5, 3.9), '#d8433a'), 0, 2.6, 0),
    paint(new THREE.BoxGeometry(1.8, 6.8, 1.8), '#f6ecd8').translate(-1.6, 3.4, -0.6), // tower
    place(paint(new THREE.ConeGeometry(1.5, 1.8, 4), '#d8433a'), -1.6, 7.7, -0.6, Math.PI / 4),
    paint(new THREE.BoxGeometry(1.2, 0.9, 0.08), '#ffc93c').translate(-1.6, 5.4, 0.32), // post horn sign
    paint(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10).rotateX(Math.PI / 2), '#d8433a').translate(-1.6, 5.4, 0.38),
    paint(new THREE.BoxGeometry(1.2, 1.5, 0.08), '#7a4e2a').translate(0.9, 0.75, 1.72),
    paint(new THREE.BoxGeometry(0.8, 0.6, 0.06), '#bfe6f2').translate(-1, 1.5, 1.72),
    paint(new THREE.BoxGeometry(0.12, 3.4, 0.12), '#8a6a4a').translate(-1.6, 9.8, -0.6), // flagpole
    // parcel stack by the door
    paint(new THREE.BoxGeometry(0.8, 0.6, 0.8), '#c89a5a').translate(2.6, 0.3, 1.6),
    paint(new THREE.BoxGeometry(0.7, 0.5, 0.7), '#d9ad6c').translate(2.55, 0.85, 1.55),
    paint(new THREE.BoxGeometry(0.6, 0.6, 0.6), '#c89a5a').translate(3.2, 0.3, 0.9),
    // launch field: a round wooden deck
    paint(new THREE.CylinderGeometry(3.2, 3.4, 0.25, 12), '#c8a06a').translate(4.6, 0.1, -2.5),
  ]), MAT.flat);
  m.castShadow = true; m.receiveShadow = true; g.add(m);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 4, 1), new THREE.MeshLambertMaterial({ color: '#ffc93c', side: THREE.DoubleSide }));
  flag.position.set(-0.85, 10.9, -0.6); g.add(flag); g.userData.flag = flag;
  return g;
}
export const DEPOT_TOP = 11; // flag height: pickups happen below DEPOT_TOP + reach
export function buildHouse(color, seed) { // a delivery cottage: coloured roof, white fence yard in front (+z), red mailbox
  const R = rng(seed), g = new THREE.Group(), parts = [...cottage(0, 0, -2.6, 0, '#fbf3e2', color, 1.15)];
  for (let k = -3; k <= 3; k++) parts.push(paint(new THREE.BoxGeometry(0.12, 0.55, 0.12), '#ffffff').translate(k * 0.62, 0.28, 2.3));
  parts.push(paint(new THREE.BoxGeometry(3.9, 0.08, 0.08), '#ffffff').translate(0, 0.45, 2.3));
  for (const sx of [-1, 1]) { for (let k = 0; k < 6; k++) parts.push(paint(new THREE.BoxGeometry(0.12, 0.55, 0.12), '#ffffff').translate(sx * 1.95, 0.28, 2.3 - k * 0.62)); parts.push(paint(new THREE.BoxGeometry(0.08, 0.08, 3.2), '#ffffff').translate(sx * 1.95, 0.45, 0.75)); }
  parts.push(paint(new THREE.BoxGeometry(0.1, 1.0, 0.1), '#7a4e2a').translate(2.4, 0.5, 2.5), paint(new THREE.BoxGeometry(0.42, 0.34, 0.6), '#d8433a').translate(2.4, 1.1, 2.5));
  parts.push(paint(new THREE.CylinderGeometry(0.5, 0.6, 0.35, 7), R() < 0.5 ? '#ff9ecb' : '#fff3a0').translate(-2.6, 0.18, -1.2)); // flower bed
  const m = new THREE.Mesh(merged(parts), MAT.flat); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.22), new THREE.MeshLambertMaterial({ color })); flag.position.set(2.62, 1.25, 2.4); g.add(flag); g.userData.flag = flag;
  return g;
}
export function buildRing(color) { // landing ring in a house yard
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.3, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.86, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
  for (const m of [outer, inner, fill]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 2; g.add(m); }
  inner.position.y = 0.01; g.userData = { outer, inner, fill }; return g;
}
export function pinTexture(color, kind = 'parcel') { // floating marker over an active house (or the post office)
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.arc(64, 60, 50, 0, 7); x.fill();
  x.fillStyle = color; x.strokeStyle = '#2a1d08'; x.lineWidth = 7; x.beginPath(); x.arc(64, 56, 46, 0, 7); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(48, 96); x.lineTo(80, 96); x.lineTo(64, 124); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = color; x.fillRect(46, 88, 36, 10);
  x.fillStyle = '#fff6e4'; x.strokeStyle = '#2a1d08'; x.lineWidth = 5;
  if (kind === 'post') { // post horn
    x.beginPath(); x.arc(64, 58, 20, 0, 7); x.fill(); x.stroke(); x.fillStyle = color; x.beginPath(); x.arc(64, 58, 8, 0, 7); x.fill(); x.stroke();
  } else { x.fillRect(42, 38, 44, 36); x.strokeRect(42, 38, 44, 36); x.beginPath(); x.moveTo(64, 38); x.lineTo(64, 74); x.moveTo(42, 52); x.lineTo(86, 52); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function buildPin(color, kind) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(color, kind), depthTest: false, transparent: true }));
  s.material.userData.ownMap = true; s.renderOrder = 5; s.scale.set(3.2, 3.2, 1); return s;
}

// ---------------------------------------------------------------- the balloon
export function buildBalloon(paintIdx = 0) {
  const P = PAINTS[paintIdx] || PAINTS[0], g = new THREE.Group();
  const prof = [[0.55, 0], [0.9, 0.35], [1.7, 1.2], [2.55, 2.4], [3.0, 3.6], [3.05, 4.5], [2.75, 5.5], [2.0, 6.35], [1.0, 6.85], [0.001, 7.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const env = new THREE.LatheGeometry(prof, 16).toNonIndexed(), pos = env.attributes.position, col = new Float32Array(pos.count * 3), ca = new THREE.Color(P.a), cb = new THREE.Color(P.b), cc = new THREE.Color(P.c);
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const gore = Math.floor(((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16, cl = y > 6.35 || (y > 3.6 && y < 4.5) ? cc : gore % 2 ? ca : cb;
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = cl.r; col[(i + k) * 3 + 1] = cl.g; col[(i + k) * 3 + 2] = cl.b; }
  }
  env.setAttribute('color', new THREE.BufferAttribute(col, 3)); env.deleteAttribute('uv'); env.computeVertexNormals();
  const envelope = new THREE.Mesh(env, MAT.flat); envelope.position.y = 2.0; envelope.castShadow = true;
  const basket = new THREE.Mesh(merged([
    paint(new THREE.BoxGeometry(1.3, 0.95, 1.3), '#c08a4e').translate(0, 0.48, 0),
    paint(new THREE.BoxGeometry(1.42, 0.16, 1.42), P.d).translate(0, 0.98, 0),
    paint(new THREE.BoxGeometry(1.42, 0.12, 1.42), P.d).translate(0, 0.08, 0),
    paint(new THREE.CylinderGeometry(0.32, 0.38, 0.38, 8), '#55585e').translate(0, 1.85, 0), // burner
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => { // ropes
      const a = new THREE.Vector3(sx * 0.62, 1.0, sz * 0.62), b = new THREE.Vector3(sx * 0.42, 2.1, sz * 0.42), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
      const geo = paint(new THREE.CylinderGeometry(0.035, 0.035, len, 4), '#4a3a2a'); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    }),
  ]), MAT.flat);
  basket.castShadow = true;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.0, 7), new THREE.MeshBasicMaterial({ color: '#ffb23c', transparent: true, opacity: 0.95 }));
  flame.position.y = 2.45; const core = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 6), new THREE.MeshBasicMaterial({ color: '#fff3b0' })); core.position.y = -0.15; flame.add(core);
  // the pilot: round head, leather cap, goggles, red scarf, a waving arm
  const pilot = new THREE.Group();
  const head = new THREE.Mesh(merged([
    paint(new THREE.IcosahedronGeometry(0.3, 1), '#f2c29b'),
    paint(new THREE.SphereGeometry(0.32, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), '#7a4e2a').translate(0, 0.05, 0),
    paint(new THREE.TorusGeometry(0.31, 0.05, 4, 10), '#5a3a22').rotateX(Math.PI / 2).translate(0, 0.06, 0),
    paint(new THREE.BoxGeometry(0.16, 0.1, 0.06), '#9fd8ef').translate(-0.1, 0.06, 0.28), paint(new THREE.BoxGeometry(0.16, 0.1, 0.06), '#9fd8ef').translate(0.1, 0.06, 0.28),
  ]), MAT.flat);
  head.position.y = 1.42;
  const body = new THREE.Mesh(merged([paint(new THREE.CylinderGeometry(0.26, 0.3, 0.55, 7), '#4f6f8f'), paint(new THREE.TorusGeometry(0.22, 0.08, 5, 8), '#e8463c').rotateX(Math.PI / 2).translate(0, 0.27, 0)]), MAT.flat);
  body.position.y = 1.02;
  const arm = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 5), '#4f6f8f').translate(0, 0.25, 0), MAT.flat);
  arm.position.set(0.28, 1.2, 0.05); arm.rotation.z = -0.4;
  pilot.add(head, body, arm); pilot.position.set(-0.2, 0, 0.15);
  const cargo = new THREE.Group(); cargo.position.y = 0;
  g.add(envelope, basket, flame, pilot, cargo);
  g.userData = { envelope, basket, flame, pilot, head, arm, cargo, paint: paintIdx };
  return g;
}
export function buildParcel(color, letter = false) { // a parcel on its string (under the basket) or falling with a chute
  const g = new THREE.Group();
  const box = new THREE.Mesh(merged(letter
    ? [paint(new THREE.BoxGeometry(0.75, 0.16, 0.55), '#fff6e4'), paint(new THREE.BoxGeometry(0.77, 0.04, 0.1), '#e8463c').translate(0, 0.09, 0), paint(new THREE.BoxGeometry(0.2, 0.05, 0.2), color).translate(0.2, 0.09, 0.12)]
    : [paint(new THREE.BoxGeometry(0.62, 0.5, 0.62), '#d6a565'), paint(new THREE.BoxGeometry(0.64, 0.52, 0.12), color), paint(new THREE.BoxGeometry(0.12, 0.52, 0.64), color)]), MAT.flat);
  box.castShadow = true; g.add(box);
  const string = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.02, 0.02, 1, 3), '#4a3a2a').translate(0, 0.5, 0), MAT.flat); g.add(string);
  const cords = [0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + Math.PI / 4, top = new THREE.Vector3(Math.cos(a) * 0.95, 1.45, Math.sin(a) * 0.95), bot = new THREE.Vector3(Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2);
    const geo = paint(new THREE.CylinderGeometry(0.02, 0.02, top.distanceTo(bot), 3), '#4a3a2a'); geo.applyMatrix4(new THREE.Matrix4().compose(top.clone().add(bot).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()), new THREE.Vector3(1, 1, 1))); return geo; });
  const canopy = new THREE.SphereGeometry(1.05, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2.3).toNonIndexed(), cp = canopy.attributes.position, cc = new Float32Array(cp.count * 3), c1 = new THREE.Color(color), c2 = new THREE.Color('#fff6e4');
  for (let i = 0; i < cp.count; i += 3) { const a = Math.atan2(cp.getZ(i) + cp.getZ(i + 1) + cp.getZ(i + 2), cp.getX(i) + cp.getX(i + 1) + cp.getX(i + 2)), cl = Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 2 ? c1 : c2; for (let k = 0; k < 3; k++) cc.set([cl.r, cl.g, cl.b], (i + k) * 3); }
  canopy.setAttribute('color', new THREE.BufferAttribute(cc, 3)); canopy.deleteAttribute('uv'); canopy.translate(0, 1.15, 0);
  const chute = new THREE.Mesh(merged([canopy, ...cords]), MAT.flat);
  chute.visible = false; chute.castShadow = true; g.add(chute);
  g.userData = { box, string, chute }; return g;
}

// ---------------------------------------------------------------- sky things
export function buildCloud(seed, dark = false) {
  const R = rng(seed), parts = [], n = (dark ? 8 : 5) + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.28 + R(), d = k === 0 ? 0 : 1.6 + R() * 1.6, s = 1.5 + R() * 1.3 - d * 0.15;
    parts.push(place(paint(new THREE.IcosahedronGeometry(1, dark ? 1 : 0), dark ? (R() < 0.5 ? '#8a94ab' : '#9aa3b8') : (R() < 0.5 ? '#ffffff' : '#f2f6fb')), Math.cos(a) * d * 1.3, (R() - 0.3) * 0.6, Math.sin(a) * d, R() * 6, s * 1.25, s * 0.8, s));
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: dark ? 0.97 : 0.9 });
  const m = new THREE.Mesh(merged(parts), mat); m.castShadow = !dark; return m;
}
export function buildStorm(seed) { // a dark cloud with a hidden lightning bolt (userData.bolt)
  const g = new THREE.Group(), c = buildCloud(seed, true); c.scale.set(1.7, 1.3, 1.7); g.add(c);
  const rain = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 2.6, 7, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#9fb4d0', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  rain.position.y = -4.2; g.add(rain);
  const pts = []; let x = 0, y = -1.2; for (let k = 0; k < 7; k++) { pts.push(new THREE.Vector3(x, y, 0)); x += (k % 2 ? 1 : -1) * (0.4 + Math.random() * 0.4); y -= 1.3; }
  const bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 16, 0.12, 4), new THREE.MeshBasicMaterial({ color: '#fff27a' }));
  bolt.visible = false; g.add(bolt); g.userData = { cloud: c, bolt }; return g;
}
export function buildGoose() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(merged([
    paint(new THREE.IcosahedronGeometry(0.5, 1), '#fbfbf6').scale(0.75, 0.6, 1.45),
    paint(new THREE.ConeGeometry(0.22, 0.5, 5).rotateX(-Math.PI / 2), '#e3e3dc').translate(0, 0.02, -0.85),
    paint(new THREE.CylinderGeometry(0.08, 0.12, 0.75, 5), '#3a3a3a').rotateX(Math.PI / 2 - 0.35).translate(0, 0.14, 0.95),
    paint(new THREE.IcosahedronGeometry(0.16, 1), '#3a3a3a').translate(0, 0.27, 1.32),
    paint(new THREE.BoxGeometry(0.2, 0.08, 0.06), '#ffffff').translate(0, 0.25, 1.25),
    paint(new THREE.ConeGeometry(0.06, 0.24, 4), '#ff9d2e').rotateX(Math.PI / 2).translate(0, 0.26, 1.52),
  ]), MAT.flat);
  body.castShadow = true; g.add(body);
  const ws = new THREE.Shape(); ws.moveTo(0, -0.32); ws.lineTo(0.75, -0.28); ws.lineTo(1.35, 0.05); ws.lineTo(0.7, 0.28); ws.lineTo(0, 0.3); ws.closePath();
  const wingGeo = merged([
    paint(new THREE.ExtrudeGeometry(ws, { depth: 0.06, bevelEnabled: false }).rotateX(Math.PI / 2), '#f4f4ee'),
    paint(new THREE.ExtrudeGeometry((() => { const t = new THREE.Shape(); t.moveTo(0.95, -0.15); t.lineTo(1.35, 0.05); t.lineTo(1.0, 0.2); t.closePath(); return t; })(), { depth: 0.07, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.005, 0), '#8a8f99'),
  ]);
  const wl = new THREE.Mesh(wingGeo, MAT.flat), wr = new THREE.Mesh(wingGeo, MAT.flat); wr.scale.x = -1; wl.position.set(0.25, 0.12, 0); wr.position.set(-0.25, 0.12, 0);
  wl.castShadow = wr.castShadow = true; g.add(wl, wr); g.userData = { wl, wr };
  return g;
}
export function softTex() { // round soft dot (shadows, puffs, sparkles)
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t;
}
