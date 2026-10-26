// Swivel Express props: every mesh in the game is built here from Three.js primitives in one style, a painted wooden
// and tin toy railway on a playroom table, flat-shaded with soft shadows. No model files: nothing here can fail to load.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TS, COLORS, rng } from './rail.js';

const matCache = new Map();
export function lam(color, extra = {}) { // shared flat-shaded Lambert materials
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) { const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }); m.userData.shared = true; matCache.set(key, m); }
  return matCache.get(key);
}
function shadowed(o, cast = true, receive = false) { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = receive; } }); return o; }
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
// a roof: triangular prism along x with the ridge on top (base at y = -r/2, base width 1.73 r)
const prism = (r, len) => new THREE.CylinderGeometry(r, r, len, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);

export const PAINTS = [ // loco body, trim, carriage body (the Paint Shop sells the rest)
  { id: 'cherry', loco: '#e8463c', trim: '#ffcf4a', car: '#2f7fd8' },
  { id: 'ocean', loco: '#2f7fd8', trim: '#ffe08a', car: '#ff8a3c' },
  { id: 'meadow', loco: '#2fae5a', trim: '#ffd84a', car: '#f45b69' },
  { id: 'plum', loco: '#8c55d6', trim: '#ffcf4a', car: '#3cc0b0' },
  { id: 'sunny', loco: '#ffbe2e', trim: '#e8463c', car: '#4b6fd8' },
  { id: 'midnight', loco: '#283a66', trim: '#ffcf4a', car: '#d9443f' },
];

// ---------------------------------------------------------------- textures (canvas, generated once)
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
let _soft = null;
export function softTex() {
  return (_soft ||= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }));
}
let _puff = null;
export function puffTex() { // a round steam puff (not additive: reads on a bright table)
  return (_puff ||= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(28, 26, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(240,240,248,.9)'); gr.addColorStop(1, 'rgba(230,230,240,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  }));
}
function symbolPath(g, sym, cx, cy, s) {
  g.beginPath();
  if (sym === 'circle') g.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
  else if (sym === 'triangle') { g.moveTo(cx, cy - s * 0.6); g.lineTo(cx + s * 0.6, cy + s * 0.48); g.lineTo(cx - s * 0.6, cy + s * 0.48); g.closePath(); }
  else if (sym === 'square') g.rect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
  else { g.moveTo(cx, cy - s * 0.62); g.lineTo(cx + s * 0.62, cy); g.lineTo(cx, cy + s * 0.62); g.lineTo(cx - s * 0.62, cy); g.closePath(); }
}
// station sign: colour + symbol, ringed by patience pips when the platform is full (k = pips left of 12, -1 = no ring)
export function drawBadge(g, ci, k = -1) {
  const col = COLORS[ci]; g.clearRect(0, 0, 128, 128);
  if (k >= 0) for (let n = 0; n < 12; n++) {
    const a = -Math.PI / 2 + (n / 12) * Math.PI * 2; g.beginPath(); g.arc(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56, 6.5, 0, Math.PI * 2);
    g.fillStyle = n < k ? '#ffb02e' : 'rgba(60,40,20,.25)'; g.fill();
  }
  g.beginPath(); g.arc(64, 64, k >= 0 ? 44 : 54, 0, Math.PI * 2); g.fillStyle = '#3a2614'; g.fill();
  g.beginPath(); g.arc(64, 64, k >= 0 ? 37 : 46, 0, Math.PI * 2); g.fillStyle = col.hex; g.fill();
  g.fillStyle = '#ffffff'; symbolPath(g, col.sym, 64, 64, k >= 0 ? 34 : 42); g.fill();
}
const _badges = [];
export function badgeTex(i) { return (_badges[i] ||= canvasTex(128, 128, (g) => drawBadge(g, i))); }
let _dot = null;
export function dotTex() { // a path dot: bright core with a dark rim, so it reads on felt and wood
  return (_dot ||= canvasTex(64, 64, (g) => {
    g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fillStyle = 'rgba(70,40,10,.55)'; g.fill();
    g.beginPath(); g.arc(32, 32, 19, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  }));
}
let _x = null;
export function deadTex() { // where the track runs out
  return (_x ||= canvasTex(128, 128, (g) => {
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fillStyle = '#5a1410'; g.fill();
    g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.fillStyle = '#ff4b3e'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round'; g.beginPath(); g.moveTo(44, 44); g.lineTo(84, 84); g.moveTo(84, 44); g.lineTo(44, 84); g.stroke();
  }));
}
let _swivel = null;
function swivelTex() { // the corner mark of a tile you can turn: a curled arrow
  return (_swivel ||= canvasTex(128, 128, (g) => {
    g.strokeStyle = 'rgba(255,250,225,.95)'; g.lineWidth = 15; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 64, 36, -Math.PI * 0.15, Math.PI * 1.3); g.stroke();
    const a = -Math.PI * 0.15, x = 64 + Math.cos(a) * 36, y = 64 + Math.sin(a) * 36;
    g.fillStyle = 'rgba(255,250,225,.95)'; g.beginPath(); g.moveTo(x + 22, y + 2); g.lineTo(x - 14, y - 6); g.lineTo(x + 6, y + 26); g.closePath(); g.fill();
  }));
}
let _wood = null;
function woodTex() {
  if (_wood) return _wood;
  _wood = canvasTex(512, 512, (g, w, h) => {
    const r = rng(5); g.fillStyle = '#c98e5a'; g.fillRect(0, 0, w, h);
    for (let p = 0; p < 8; p++) { // planks
      const y = p * 64; g.fillStyle = `hsl(28, ${45 + r() * 12}%, ${50 + r() * 8}%)`; g.fillRect(0, y, w, 62);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(110,60,25,${0.08 + r() * 0.1})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const yy = y + 4 + r() * 54; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 10, w * 0.6, yy + (r() - 0.5) * 10, w, yy + (r() - 0.5) * 6); g.stroke(); }
      g.fillStyle = 'rgba(80,40,15,.35)'; g.fillRect(0, y + 62, w, 2);
    }
  });
  _wood.wrapS = _wood.wrapT = THREE.RepeatWrapping; _wood.repeat.set(5, 5); _wood.anisotropy = 4;
  return _wood;
}
const sprite = (map, scale, opts = {}) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, ...opts })); s.scale.setScalar(scale); return s; };

// ---------------------------------------------------------------- the playroom: table, board slab, toys around it
export function buildTable() {
  const g = new THREE.Group();
  const top = mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ map: woodTex() }), 0, -0.62, 0);
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true; g.add(top);
  return g;
}
export function buildBoardBase(cols, rows) {
  const g = new THREE.Group(), W = cols * TS, D = rows * TS;
  const slab = mesh(box(W + 0.5, 0.34, D + 0.5), lam('#e9d6ad'), 0, -0.45, 0); slab.receiveShadow = true; g.add(slab);
  const frame = lam('#8b5a34');
  for (const [w, d, x, z] of [[W + 1.1, 0.3, 0, -D / 2 - 0.4], [W + 1.1, 0.3, 0, D / 2 + 0.4], [0.3, D + 0.5, -W / 2 - 0.4, 0], [0.3, D + 0.5, W / 2 + 0.4, 0]]) {
    const f = mesh(box(w, 0.42, d), frame, x, -0.38, z); f.castShadow = true; f.receiveShadow = true; g.add(f);
  }
  return g;
}
export function buildToys(cols, rows, seed = 3) { // blocks, crayons and a ball on the table around the board
  const g = new THREE.Group(), r = rng(seed), W = cols * TS / 2 + 1.6, D = rows * TS / 2 + 1.6;
  const cols6 = ['#e8463c', '#2f7fd8', '#ffbe2e', '#2fae5a', '#8c55d6', '#ff8a3c'];
  // only behind the board and to its right: the menu column sits over the table on the left
  const spots = [[W * 0.25, -D - 2.6], [W + 2.0, -D + 1.6], [-W * 0.55, -D - 2.4], [W + 2.6, D - 2.0], [W * 0.75, -D - 3.4], [W + 3.8, -0.4]];
  spots.forEach(([x, z], k) => {
    const kind = k % 4, c = cols6[(r() * 6) | 0];
    if (kind === 0) { // a little stack of wooden blocks
      for (let n = 0; n < 3; n++) { const s = 1.1 - n * 0.15; const b = mesh(box(s, s, s), lam(cols6[(k + n * 2) % 6]), x + (r() - 0.5) * 0.3, -0.62 + s / 2 + n * 0.98, z + (r() - 0.5) * 0.3); b.rotation.y = r() * 1.5; g.add(b); }
    } else if (kind === 1) { // crayons
      for (let n = 0; n < 3; n++) {
        const cr = new THREE.Group(), cc = cols6[(k + n) % 6];
        cr.add(mesh(cyl(0.16, 0.16, 2.2, 6), lam(cc), 0, 0, 0), mesh(new THREE.ConeGeometry(0.16, 0.4, 6), lam(cc), 0, 1.3, 0), mesh(cyl(0.17, 0.17, 1.2, 6), lam('#fff5dd'), 0, -0.1, 0));
        cr.rotation.z = Math.PI / 2; cr.rotation.y = r() * Math.PI; cr.position.set(x + n * 0.5, -0.46, z + n * 0.4); g.add(cr);
      }
    } else if (kind === 2) { // a striped ball
      const b = mesh(new THREE.IcosahedronGeometry(0.9, 1), lam(c), x, 0.28, z); g.add(b);
      const band = mesh(new THREE.TorusGeometry(0.88, 0.12, 6, 18), lam('#fff5dd'), x, 0.28, z); band.rotation.x = 1.2; g.add(band);
    } else { // a wooden peg toy tree
      g.add(mesh(cyl(0.12, 0.16, 0.8, 6), lam('#8b5a34'), x, -0.22, z), mesh(new THREE.ConeGeometry(0.7, 1.3, 7), lam('#2fae5a'), x, 0.65, z), mesh(new THREE.ConeGeometry(0.5, 0.9, 7), lam('#45c46a'), x, 1.2, z));
    }
  });
  return shadowed(g, true, true);
}

// ---------------------------------------------------------------- track (merged per shape: two draw calls a tile)
const SLEEPER = lam('#8a5a3c'), RAIL = lam('#c7ccd6');
const _track = {};
function trackGeo(shape) {
  if (_track[shape]) return _track[shape];
  const sl = [], rl = [], h = TS / 2, gauge = 0.3;
  const put = (geo, arr, x, y, z, yaw) => { geo.rotateY(yaw); geo.translate(x, y, z); arr.push(geo); };
  if (shape === 'straight' || shape === 'end') { // rot 0 runs N-S (end: from the N edge to the centre)
    const z0 = -h, z1 = shape === 'end' ? 0.15 : h, n = shape === 'end' ? 3 : 5;
    for (let k = 0; k < n; k++) put(box(0.92, 0.07, 0.2), sl, 0, 0.035, z0 + (k + 0.5) * ((z1 - z0) / n), 0);
    for (const x of [-gauge, gauge]) put(box(0.07, 0.08, z1 - z0), rl, x, 0.11, (z0 + z1) / 2, 0);
    if (shape === 'end') put(box(0.86, 0.22, 0.14), rl, 0, 0.16, z1, 0); // buffer stop
  } else { // curve rot 0 joins N and E: an arc around the NE corner
    const cx = h, cz = -h, segs = 8, along = (f) => Math.atan2(-Math.sin(f), Math.cos(f)); // f: angle around the corner
    for (let k = 0; k < 4; k++) { const f = Math.PI / 2 + ((k + 0.5) / 4) * (Math.PI / 2); put(box(0.92, 0.07, 0.2), sl, cx + Math.cos(f) * h, 0.035, cz + Math.sin(f) * h, along(f)); }
    for (const rr of [h - gauge, h + gauge]) for (let k = 0; k < segs; k++) {
      const f = Math.PI / 2 + ((k + 0.5) / segs) * (Math.PI / 2), len = rr * (Math.PI / 2) / segs + 0.02;
      put(box(0.07, 0.08, len), rl, cx + Math.cos(f) * rr, 0.11, cz + Math.sin(f) * rr, along(f));
    }
  }
  const geo = mergeGeometries([mergeGeometries(sl), mergeGeometries(rl)], true); geo.userData.shared = true;
  return (_track[shape] = geo);
}

// A board tile: the felt base (fixed) and the swivelling part (the track) in userData.spin.
const FELT = { turn: lam('#a5dc72'), fixed: lam('#80c25a'), side: lam('#5f9a44') };
const baseGeo = box(TS - 0.06, 0.3, TS - 0.06), topGeo = box(TS - 0.24, 0.02, TS - 0.24), markGeo = new THREE.PlaneGeometry(0.46, 0.46);
baseGeo.userData.shared = topGeo.userData.shared = markGeo.userData.shared = true;
let _markMat = null;
export function buildTile(t) {
  const g = new THREE.Group();
  const base = mesh(baseGeo, FELT.side, 0, -0.15, 0); base.receiveShadow = true; g.add(base);
  const top = mesh(topGeo, t.shape && !t.fixed ? FELT.turn : FELT.fixed, 0, 0.0, 0); top.receiveShadow = true; g.add(top);
  const spin = new THREE.Group(); g.add(spin); g.userData.spin = spin; g.userData.top = top;
  if (!t.shape) return g;
  const tr = new THREE.Mesh(trackGeo(t.shape === 'end' ? 'end' : t.shape), [SLEEPER, RAIL]); tr.castShadow = true; tr.receiveShadow = true;
  tr.position.y = 0.01; spin.add(tr);
  if (!t.fixed) { // the corner mark: you can turn this one
    if (!_markMat) { _markMat = new THREE.MeshBasicMaterial({ map: swivelTex(), transparent: true, depthWrite: false, opacity: 0.85 }); _markMat.userData.shared = true; }
    const d = new THREE.Mesh(markGeo, _markMat);
    d.rotation.x = -Math.PI / 2; d.position.set(0.66, 0.02, 0.66); g.add(d); g.userData.mark = d;
  }
  return g;
}
export const spinAngle = (t, rot = t.rot) => -rot * (Math.PI / 2); // rot r turns the track r quarter turns clockwise

// hover / cursor frame drawn over a tile
export function buildCursor() {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.9, depthWrite: false });
  const L = TS - 0.12, w = 0.1;
  for (const [x, z, sx, sz] of [[0, -L / 2, L, w], [0, L / 2, L, w], [-L / 2, 0, w, L], [L / 2, 0, w, L]]) g.add(mesh(box(sx, 0.04, sz), m, x, 0.06, z));
  g.userData.mat = m; g.renderOrder = 5; return g;
}

// ---------------------------------------------------------------- station, depot, tunnel portal
export function buildStation(ci) { // local frame: track runs N-S; an open platform on the east side, a kiosk at its south end
  const g = new THREE.Group(), col = COLORS[ci].hex;
  g.add(mesh(box(0.56, 0.16, 1.86), lam('#f1e5c9'), 0.7, 0.08, 0), mesh(box(0.6, 0.04, 1.9), lam('#d9c7a2'), 0.7, 0.17, 0));
  g.add(mesh(box(0.07, 0.025, 1.86), lam(col), 0.43, 0.2, 0)); // painted edge in the station colour
  g.add(mesh(box(0.4, 0.4, 0.34), lam('#fff6e4'), 0.74, 0.39, 0.72), mesh(box(0.5, 0.07, 0.44), lam(col), 0.74, 0.62, 0.72));
  g.add(mesh(box(0.02, 0.16, 0.2), WIN_STATION, 0.535, 0.44, 0.72));
  g.add(mesh(cyl(0.035, 0.035, 1.0, 6), lam('#5a3a22'), 0.95, 0.68, 0.45));
  const sign = sprite(badgeTex(ci), 0.95); sign.position.set(0.95, 1.5, 0.45); sign.renderOrder = 6; g.add(sign);
  g.userData.sign = sign;
  return shadowed(g);
}
export function buildDepot(paint = PAINTS[0]) { // a little engine shed in the corner of the tile where the train starts
  const g = new THREE.Group();
  g.add(mesh(box(0.42, 0.36, 0.52), lam('#fff6e4'), 0.74, 0.18, 0.62), mesh(prism(0.27, 0.6), lam(paint.loco), 0.74, 0.5, 0.62).rotateY(Math.PI / 2));
  g.add(mesh(box(0.02, 0.24, 0.24), lam('#5a3a22'), 0.525, 0.12, 0.62), mesh(box(0.1, 0.22, 0.1), lam('#8b5a34'), 0.86, 0.6, 0.46));
  return shadowed(g);
}
export function buildPortal() { // a grassy hill with a stone arch; local frame: the opening faces N, the hill covers S
  const g = new THREE.Group();
  const hill = mesh(new THREE.SphereGeometry(1.0, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam('#6bb84c'), 0, 0, 0.35); hill.scale.set(0.95, 0.95, 0.65); g.add(hill);
  g.add(mesh(new THREE.SphereGeometry(0.32, 6, 4), lam('#7fca5a'), 0.5, 0.45, 0.55), mesh(new THREE.ConeGeometry(0.2, 0.5, 6), lam('#2f8f4a'), -0.55, 0.62, 0.6));
  g.add(mesh(new THREE.TorusGeometry(0.45, 0.1, 6, 12, Math.PI), lam('#c9c2b4'), 0, 0.02, -0.3));
  g.add(mesh(new THREE.CircleGeometry(0.42, 12, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#1d1410', side: THREE.DoubleSide }), 0, 0.02, -0.29));
  return shadowed(g);
}

// ---------------------------------------------------------------- scenery (single tiles and 2x2 blocks)
export function buildTree(r, s = 1) {
  const g = new THREE.Group(), k = r();
  g.add(mesh(cyl(0.06 * s, 0.09 * s, 0.4 * s, 6), lam('#8b5a34'), 0, 0.2 * s, 0));
  if (k < 0.5) g.add(mesh(new THREE.IcosahedronGeometry(0.42 * s, 0), lam(k < 0.25 ? '#3fae4e' : '#56c25a'), 0, 0.68 * s, 0));
  else { g.add(mesh(new THREE.ConeGeometry(0.4 * s, 0.7 * s, 7), lam('#2f8f4a'), 0, 0.65 * s, 0), mesh(new THREE.ConeGeometry(0.3 * s, 0.5 * s, 7), lam('#3fae4e'), 0, 1.0 * s, 0)); }
  return g;
}
export function buildHouse(r, s = 1) {
  const g = new THREE.Group(), walls = ['#fff0d6', '#ffd9c2', '#d8ecff', '#fff3a8', '#e6dcff'], roofs = ['#e8463c', '#2f7fd8', '#8c55d6', '#ff8a3c', '#d9443f'];
  const w = (0.7 + r() * 0.25) * s, d = (0.6 + r() * 0.2) * s, h = (0.5 + r() * 0.25) * s;
  g.add(mesh(box(w, h, d), lam(walls[(r() * walls.length) | 0]), 0, h / 2, 0));
  g.add(mesh(prism(d * 0.66, w * 1.08), lam(roofs[(r() * roofs.length) | 0]), 0, h + d * 0.33, 0));
  g.add(mesh(box(0.16 * s, 0.24 * s, 0.02), lam('#7a4a2a'), 0, 0.12 * s, d / 2 + 0.01));
  g.add(mesh(box(0.16 * s, 0.14 * s, 0.02), lam('#ffe9a0', { emissive: '#5a4210' }), w * 0.28, h * 0.62, d / 2 + 0.01));
  return g;
}
export function buildPond(r, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.7 * s, 0.75 * s, 0.05, 14), lam('#5ab8e8'), 0, 0.03, 0));
  for (let k = 0; k < 2; k++) g.add(mesh(cyl(0.12 * s, 0.12 * s, 0.02, 8), lam('#3fae4e'), (r() - 0.5) * 0.7 * s, 0.07, (r() - 0.5) * 0.7 * s));
  const duck = new THREE.Group(); duck.add(mesh(new THREE.SphereGeometry(0.1 * s, 6, 4), lam('#ffd84a'), 0, 0.1, 0), mesh(new THREE.SphereGeometry(0.06 * s, 6, 4), lam('#ffd84a'), 0, 0.2, 0.07 * s), mesh(box(0.05, 0.03, 0.06), lam('#ff8a3c'), 0, 0.2, 0.14 * s));
  duck.position.set(0.25 * s, 0, -0.1 * s); g.add(duck); g.userData.duck = duck;
  return g;
}
function flowers(r, g, n, spread) {
  const cs = ['#ff6b8a', '#ffd84a', '#ffffff', '#b27bff', '#ff8a3c'];
  for (let k = 0; k < n; k++) g.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), lam(cs[(r() * cs.length) | 0]), (r() - 0.5) * spread, 0.06, (r() - 0.5) * spread));
}
export function buildDeco(kind, seed) { // a single scenery tile (hand-made maps)
  const g = new THREE.Group(), r = rng(seed);
  if (kind === 'tree') { g.add(buildTree(r, 1.1)); const t2 = buildTree(r, 0.8); t2.position.set(0.55, 0, 0.45); g.add(t2); }
  else if (kind === 'house') { const h = buildHouse(r, 1.2); h.rotation.y = (r() - 0.5) * 0.5; g.add(h); const t = buildTree(r, 0.7); t.position.set(-0.6, 0, 0.55); g.add(t); }
  else if (kind === 'pond') g.add(buildPond(r, 1.1));
  else if (kind === 'flowers') flowers(r, g, 14, 1.5);
  else flowers(r, g, 4, 1.6);
  return shadowed(g);
}
export function buildBlock(kind, seed) { // a 2x2 scenery block on generated boards (4 x 4 units, centred)
  const g = new THREE.Group(), r = rng(seed);
  const base = mesh(box(TS * 2 - 0.06, 0.3, TS * 2 - 0.06), FELT.side, 0, -0.15, 0); base.receiveShadow = true; g.add(base);
  const top = mesh(box(TS * 2 - 0.24, 0.02, TS * 2 - 0.24), lam('#8fcf62'), 0, 0, 0); top.receiveShadow = true; g.add(top);
  const place = (o, x, z, yaw = 0) => { o.position.set(x, 0, z); o.rotation.y = yaw; g.add(o); return o; };
  if (kind === 'town') {
    place(buildHouse(r, 1.15), -0.8, -0.7, 0.1); place(buildHouse(r, 1.05), 0.9, -0.6, -0.15); place(buildHouse(r, 1.1), -0.4, 0.9, 0.05);
    place(buildTree(r, 1.1), 1.1, 0.9); place(buildTree(r, 0.9), 0.4, 0.2);
    g.add(mesh(box(0.5, 0.01, 3.4), lam('#e9dcb8'), 0.3, 0.02, 0)); flowers(r, g, 8, 3.2);
  } else if (kind === 'pond') {
    const p = place(buildPond(r, 1.9), -0.2, 0.1); g.userData.duck = p.userData.duck; place(buildTree(r, 1.0), 1.25, -1.2); place(buildTree(r, 0.8), -1.3, 1.2); flowers(r, g, 10, 3.4);
  } else if (kind === 'forest') {
    for (let k = 0; k < 7; k++) place(buildTree(r, 0.9 + r() * 0.5), (r() - 0.5) * 3, (r() - 0.5) * 3);
  } else if (kind === 'farm') {
    const barn = new THREE.Group(); barn.add(mesh(box(1.3, 0.8, 1.0), lam('#d9443f'), 0, 0.4, 0), mesh(box(1.4, 0.08, 1.1), lam('#fff5dd'), 0, 0.82, 0));
    barn.add(mesh(prism(0.62, 1.42), lam('#7a3a2a'), 0, 1.17, 0));
    barn.add(mesh(box(0.4, 0.5, 0.02), lam('#fff5dd'), 0, 0.25, 0.51));
    place(barn, -0.6, -0.6, 0.2);
    for (let k = 0; k < 3; k++) { const h = mesh(cyl(0.22, 0.22, 0.3, 10), lam('#f2c94c'), 0.6 + k * 0.45, 0.22, 0.9); h.rotation.x = Math.PI / 2; g.add(h); }
    for (let k = 0; k < 5; k++) g.add(mesh(box(0.06, 0.3, 0.06), lam('#fff5dd'), -1.6 + k * 0.5, 0.15, 1.5));
    g.add(mesh(box(2.2, 0.04, 0.05), lam('#fff5dd'), -0.6, 0.25, 1.5));
    place(buildTree(r, 1.0), 1.3, -1.2);
  } else { // park: fountain, benches, flowers
    g.add(mesh(cyl(0.7, 0.75, 0.2, 14), lam('#d9d2c2'), 0, 0.1, 0), mesh(cyl(0.58, 0.58, 0.06, 14), lam('#5ab8e8'), 0, 0.19, 0), mesh(cyl(0.08, 0.1, 0.6, 8), lam('#d9d2c2'), 0, 0.4, 0));
    for (const [x, z, y] of [[-1.2, 0, Math.PI / 2], [1.2, 0, Math.PI / 2]]) { const b = new THREE.Group(); b.add(mesh(box(0.7, 0.06, 0.24), lam('#8b5a34'), 0, 0.22, 0), mesh(box(0.7, 0.2, 0.05), lam('#8b5a34'), 0, 0.34, -0.1)); place(b, x, z, y); }
    place(buildTree(r, 1.1), -1.2, -1.2); place(buildTree(r, 1.1), 1.2, 1.2); flowers(r, g, 16, 3.4);
  }
  return shadowed(g, true, true);
}

// ---------------------------------------------------------------- the train
const WIN_STATION = lam('#3a3550');
const DARK = lam('#2b2b38'), GOLD = lam('#ffcf4a'), WHEEL = lam('#d9443f'), WIN = lam('#3a3550');
const wheelGeo = cyl(0.16, 0.16, 0.09, 12);
function wheels(g, zs) {
  const out = [];
  for (const z of zs) for (const x of [-0.37, 0.37]) { const w = mesh(wheelGeo, WHEEL, x, 0.17, z); w.rotation.z = Math.PI / 2; g.add(w); out.push(w); g.add(mesh(cyl(0.05, 0.05, 0.1, 6), GOLD, x * 1.03, 0.17, z).rotateZ(Math.PI / 2)); }
  return out;
}
export function buildLoco(paint = PAINTS[0]) { // faces +z
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const P = lam(paint.loco), T = lam(paint.trim);
  body.add(mesh(box(0.66, 0.16, 1.3), DARK, 0, 0.28, 0));
  const boiler = mesh(cyl(0.27, 0.27, 0.78, 14), P, 0, 0.62, 0.22); boiler.rotation.x = Math.PI / 2; body.add(boiler);
  for (const z of [-0.02, 0.3, 0.58]) { const band = mesh(cyl(0.285, 0.285, 0.05, 14), T, 0, 0.62, z); band.rotation.x = Math.PI / 2; body.add(band); }
  const face = mesh(cyl(0.22, 0.22, 0.04, 14), DARK, 0, 0.62, 0.62); face.rotation.x = Math.PI / 2; body.add(face);
  body.add(mesh(cyl(0.1, 0.075, 0.3, 10), DARK, 0, 1.0, 0.44), mesh(cyl(0.14, 0.1, 0.08, 10), DARK, 0, 1.17, 0.44));
  body.add(mesh(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), T, 0, 0.87, 0.14));
  body.add(mesh(box(0.66, 0.56, 0.48), P, 0, 0.7, -0.36), mesh(box(0.78, 0.08, 0.62), DARK, 0, 1.02, -0.36));
  for (const x of [-0.335, 0.335]) body.add(mesh(box(0.02, 0.2, 0.24), WIN, x, 0.78, -0.36));
  body.add(mesh(box(0.7, 0.1, 0.06), WHEEL, 0, 0.3, 0.68)); // buffer beam
  const cow = mesh(new THREE.ConeGeometry(0.3, 0.3, 4, 1), DARK, 0, 0.22, 0.74); cow.rotation.set(Math.PI / 2, Math.PI / 4, 0); cow.scale.set(1, 0.5, 0.7); body.add(cow);
  const lamp = mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff4c2' }), 0, 0.92, 0.64); body.add(lamp);
  const key = new THREE.Group(); key.position.set(0, 0.86, -0.64); body.add(key); // the wind-up key turns while the train runs
  key.add(mesh(cyl(0.035, 0.035, 0.18, 6), GOLD, 0, 0, -0.06).rotateX(Math.PI / 2));
  for (const s of [-1, 1]) { const loop = mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12), GOLD, s * 0.12, 0, -0.16); loop.rotation.y = Math.PI / 2; key.add(loop); }
  g.userData = { body, key, wheels: wheels(body, [-0.38, 0.38]), chimney: new THREE.Vector3(0, 1.25, 0.44), len: 1.3 };
  return shadowed(g);
}
export const SEATS = 3;
export function buildCar(paint = PAINTS[0]) { // an open toy carriage with three seats
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const C = lam(paint.car), T = lam(paint.trim);
  body.add(mesh(box(0.66, 0.16, 1.05), DARK, 0, 0.28, 0), mesh(box(0.68, 0.08, 1.08), C, 0, 0.4, 0));
  for (const x of [-0.31, 0.31]) body.add(mesh(box(0.06, 0.22, 1.0), C, x, 0.53, 0));
  for (const z of [-0.5, 0.5]) body.add(mesh(box(0.66, 0.22, 0.06), C, 0, 0.53, z));
  for (const x of [-0.31, 0.31]) body.add(mesh(box(0.075, 0.05, 1.02), T, x, 0.66, 0));
  const seats = [];
  for (let k = 0; k < SEATS; k++) { const s = new THREE.Group(); s.position.set(0, 0.44, -0.3 + k * 0.3); body.add(s); seats.push(s); }
  body.add(mesh(cyl(0.04, 0.04, 0.2, 6), DARK, 0, 0.3, 0.6).rotateX(Math.PI / 2));
  g.userData = { body, seats, wheels: wheels(body, [-0.3, 0.3]), len: 1.05 };
  return shadowed(g);
}

// ---------------------------------------------------------------- passengers: wooden peg dolls with a hat in their station's symbol
const SKIN = ['#f6d2b4', '#e0ac85', '#b9805a', '#8a5a3c', '#f2c7a0'];
const HAT = lam('#ffffff');
const shared = (geo) => { geo.userData.shared = true; return geo; };
const PEG = { // passengers come and go all the time: one set of geometries for all of them
  body: shared(cyl(0.1, 0.13, 0.28, 10)), head: shared(new THREE.SphereGeometry(0.105, 10, 8)), eye: shared(box(0.025, 0.025, 0.01)),
  circle: shared(new THREE.SphereGeometry(0.075, 8, 6)), square: shared(box(0.13, 0.13, 0.13)), triangle: shared(new THREE.ConeGeometry(0.1, 0.18, 4)), diamond: shared(new THREE.OctahedronGeometry(0.1, 0)),
};
const HAT_Y = { circle: 0.53, square: 0.54, triangle: 0.56, diamond: 0.57 };
export function buildPeg(ci, seed = 0) {
  const g = new THREE.Group(), col = COLORS[ci];
  g.add(mesh(PEG.body, lam(col.hex), 0, 0.14, 0), mesh(PEG.head, lam(SKIN[seed % SKIN.length]), 0, 0.38, 0));
  const hat = mesh(PEG[col.sym], HAT, 0, HAT_Y[col.sym], 0); hat.rotation.y = Math.PI / 4; g.add(hat);
  g.add(mesh(PEG.eye, lam('#2b2b38'), -0.04, 0.4, 0.1), mesh(PEG.eye, lam('#2b2b38'), 0.04, 0.4, 0.1));
  return shadowed(g);
}

// ---------------------------------------------------------------- cow, spinning top, coin
export function buildCow() {
  const g = new THREE.Group(), W = lam('#fbfbf6'), B = lam('#2b2b38'), body = new THREE.Group(); g.add(body);
  body.add(mesh(box(0.42, 0.3, 0.68), W, 0, 0.42, 0));
  for (const [x, y, z, s] of [[0.212, 0.46, 0.1, 0.18], [-0.212, 0.4, -0.15, 0.2], [0.1, 0.572, -0.2, 0.16]]) body.add(mesh(box(x ? 0.01 : s, s * 0.8, s), B, x, y, z));
  const head = new THREE.Group(); head.position.set(0, 0.56, 0.38); body.add(head);
  head.add(mesh(box(0.26, 0.24, 0.26), W, 0, 0, 0.06), mesh(box(0.27, 0.11, 0.08), lam('#ffb3c1'), 0, -0.06, 0.2));
  for (const s of [-1, 1]) { head.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 5), lam('#fff1c9'), s * 0.1, 0.16, 0.02)); head.add(mesh(box(0.1, 0.05, 0.05), B, s * 0.16, 0.06, 0.0)); head.add(mesh(box(0.03, 0.04, 0.01), B, s * 0.06, 0.04, 0.19)); }
  const legs = [];
  for (const [x, z] of [[-0.14, -0.24], [0.14, -0.24], [-0.14, 0.24], [0.14, 0.24]]) { const l = new THREE.Group(); l.position.set(x, 0.28, z); l.add(mesh(box(0.08, 0.28, 0.08), W, 0, -0.14, 0), mesh(box(0.085, 0.05, 0.085), B, 0, -0.26, 0)); body.add(l); legs.push(l); }
  const tail = mesh(box(0.03, 0.26, 0.03), W, 0, 0.42, -0.36); tail.geometry.translate(0, -0.13, 0); body.add(tail);
  body.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), lam('#c9c2b4'), 0, 0.26, 0.02)); // bell
  g.userData = { body, head, legs, tail };
  return shadowed(g);
}
export function buildTop(seed = 0) { // a striped wind-up spinning top
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const cs = [['#e8463c', '#ffcf4a'], ['#2f7fd8', '#ffffff'], ['#8c55d6', '#ffcf4a']][seed % 3];
  const prof = [[0.02, 0], [0.32, 0.28], [0.55, 0.5], [0.58, 0.58], [0.4, 0.72], [0.08, 0.8], [0.06, 1.1], [0.0, 1.12]].map(([x, y]) => new THREE.Vector2(x, y));
  const lathe = new THREE.LatheGeometry(prof, 12); spin.add(mesh(lathe, lam(cs[0])));
  for (let k = 0; k < 6; k++) { const s = mesh(box(0.08, 0.2, 0.06), lam(cs[1]), Math.cos((k / 6) * Math.PI * 2) * 0.53, 0.52, Math.sin((k / 6) * Math.PI * 2) * 0.53); s.rotation.y = -(k / 6) * Math.PI * 2; spin.add(s); }
  g.userData = { spin };
  return shadowed(g);
}
export function buildCoin() {
  const g = new THREE.Group(), c = mesh(cyl(0.26, 0.26, 0.07, 16), lam('#ffcf4a', { emissive: '#5a3a00' }), 0, 0, 0); c.rotation.x = Math.PI / 2; g.add(c);
  g.add(mesh(cyl(0.16, 0.16, 0.08, 12), lam('#ffe08a'), 0, 0, 0).rotateX(Math.PI / 2));
  return shadowed(g);
}
export function buildDeadMark() { const s = sprite(deadTex(), 0.8); s.renderOrder = 9; return s; }
export const dotMat = new THREE.SpriteMaterial({ map: softTex(), color: '#fff3a0', transparent: true, depthWrite: false, fog: false });
