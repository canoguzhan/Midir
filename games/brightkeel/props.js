// Brightkeel props: every mesh in the game is built here from Three.js primitives (one flat-shaded low-poly style),
// plus the faceted night-sea shader and the lighthouse beam. No asset files: nothing here can fail to load.
import * as THREE from 'three';
import { SHORE, PIER_LEN, DOCK_Z, COLORS, rng } from './levels.js';

const matCache = new Map();
export function lam(color, extra = {}) { // shared flat-shaded Lambert materials
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) { const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }); m.userData.shared = true; matCache.set(key, m); }
  return matCache.get(key);
}
export const glowMat = (color, opacity = 1) => { // additive sprite glow, cached per colour
  const key = `glow${color}${opacity}`;
  if (!matCache.has(key)) {
    const m = new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    m.userData.shared = true; matCache.set(key, m);
  }
  return matCache.get(key);
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// ---------------------------------------------------------------- textures (canvas, generated once)
let _soft = null;
export function softTex() {
  if (_soft) return _soft;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); _soft = new THREE.CanvasTexture(c); _soft.colorSpace = THREE.SRGBColorSpace; return _soft;
}
let _fogTex = null;
export function fogTex() { // a lumpy cloud puff for fog banks
  if (_fogTex) return _fogTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = rng(7);
  for (let i = 0; i < 14; i++) {
    const x = 34 + r() * 60, y = 34 + r() * 60, rad = 18 + r() * 26, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  _fogTex = new THREE.CanvasTexture(c); _fogTex.colorSpace = THREE.SRGBColorSpace; return _fogTex;
}
const _badges = [];
export function badgeTex(i) { // pier colour + symbol, so colour-blind players can match boats too
  if (_badges[i]) return _badges[i];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), col = COLORS[i];
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fillStyle = '#1b2240'; g.fill();
  g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.fillStyle = col.hex; g.fill();
  g.fillStyle = '#ffffff'; g.beginPath();
  if (col.sym === 'circle') g.arc(64, 64, 20, 0, Math.PI * 2);
  else if (col.sym === 'triangle') { g.moveTo(64, 38); g.lineTo(88, 82); g.lineTo(40, 82); g.closePath(); }
  else if (col.sym === 'square') g.rect(44, 44, 40, 40);
  else { g.moveTo(64, 36); g.lineTo(90, 64); g.lineTo(64, 92); g.lineTo(38, 64); g.closePath(); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (_badges[i] = t);
}
let _warn = null;
export function warnTex() { // "!" shown over a boat that is about to hit something in the dark
  if (_warn) return _warn;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.beginPath(); g.moveTo(64, 8); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath(); g.fillStyle = '#2a1408'; g.fill();
  g.beginPath(); g.moveTo(64, 22); g.lineTo(110, 104); g.lineTo(18, 104); g.closePath(); g.fillStyle = '#ffb02e'; g.fill();
  g.fillStyle = '#2a1408'; g.fillRect(57, 46, 14, 34); g.fillRect(57, 86, 14, 12);
  _warn = new THREE.CanvasTexture(c); _warn.colorSpace = THREE.SRGBColorSpace; return _warn;
}
const sprite = (map, scale, opts = {}) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, ...opts })); s.scale.setScalar(scale); return s; };

// ---------------------------------------------------------------- sky (menu and covers look up at it)
export function buildSky() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 14), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uFlash: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uFlash; varying vec3 vP;
      void main(){ float h = clamp(vP.y, -0.2, 1.); vec3 hor = vec3(.16,.17,.36), mid = vec3(.07,.09,.24), top = vec3(.02,.03,.1);
        vec3 c = mix(hor, mid, smoothstep(0., .25, h)); c = mix(c, top, smoothstep(.25, .9, h));
        float glow = pow(max(0., dot(vP, normalize(vec3(-.45,.32,-1.)))), 18.); c += vec3(.35,.32,.25) * glow;
        c += vec3(.3,.34,.5) * uFlash; gl_FragColor = vec4(c, 1.); }`,
  }));
  g.add(dome); g.userData.dome = dome;
  const n = 420, pos = new Float32Array(n * 3), r = rng(3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, y = 0.06 + Math.pow(r(), 0.7) * 0.94, k = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * k * 150, y * 150, Math.sin(a) * k * 150], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe6ff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false })));
  const moonDir = new THREE.Vector3(-0.45, 0.32, -1).normalize();
  const moon = new THREE.Mesh(new THREE.CircleGeometry(6, 28), new THREE.MeshBasicMaterial({ color: '#fff1c8', fog: false }));
  moon.position.copy(moonDir).multiplyScalar(140); moon.lookAt(0, 0, 0); g.add(moon);
  const halo = new THREE.Sprite(glowMat('#c9c6ff', 0.6)); halo.position.copy(moon.position).multiplyScalar(0.99); halo.scale.setScalar(44); g.add(halo);
  for (let i = 0; i < 6; i++) { // far islands on the horizon
    const isl = mesh(new THREE.ConeGeometry(8 + r() * 10, 4 + r() * 6, 6), lam('#1c2347'), -80 + i * 32 + r() * 10, 0, -95 - r() * 20);
    isl.scale.z = 0.5; g.add(isl);
  }
  return g;
}

// ---------------------------------------------------------------- water: faceted waves + beam pool + lantern reflections
export function buildWater() {
  const uniforms = {
    uTime: { value: 0 }, uFlash: { value: 0 }, uBeam: { value: new THREE.Vector3(0, 0, 2.3) }, uBeamOn: { value: 1 },
    uBoats: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uCols: { value: COLORS.map((c) => new THREE.Color(c.hex)) },
    uPiers: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    uWhirl: { value: new THREE.Vector4() }, uCur: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
    uCurDir: { value: Array.from({ length: 3 }, () => new THREE.Vector3()) }, uWind: { value: new THREE.Vector3() },
    uRipple: { value: new THREE.Vector4() }, uFogCol: { value: new THREE.Color('#141a3c') }, uFogNear: { value: 45 }, uFogFar: { value: 150 },
    uShore: { value: SHORE }, uStorm: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `uniform float uTime, uStorm; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.);
        float a = 1. + uStorm * 1.4;
        w.y += (sin(w.x * .55 + uTime * 1.1) * .07 + sin(w.z * .72 - uTime * .9 + w.x * .3) * .06 + sin((w.x + w.z) * 1.3 + uTime * 1.7) * .025) * a;
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uFlash, uBeamOn, uFogNear, uFogFar, uShore, uStorm;
      uniform vec3 uBeam, uCols[4], uFogCol, uWind, uCurDir[3]; uniform vec4 uBoats[8], uPiers[4], uWhirl, uCur[3], uRipple;
      varying vec3 vW;
      void main(){
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.) n = -n;
        vec2 p = vW.xz; vec3 v = normalize(cameraPosition - vW);
        float shallow = smoothstep(-16., uShore, p.y);
        vec3 col = mix(vec3(.05, .1, .22), vec3(.09, .25, .36), shallow) * (1. - uStorm * .25);
        float diff = clamp(dot(n, normalize(vec3(-.35, .85, -.5))), 0., 1.);
        col *= .7 + .55 * diff;
        vec3 moon = normalize(vec3(-.45, .32, -1.));
        float spec = pow(clamp(dot(reflect(-moon, n), v), 0., 1.), 60.);
        col += vec3(.6, .66, .9) * spec * .6;
        for (int i = 0; i < 4; i++) { vec4 q = uPiers[i]; if (q.z <= 0.) continue;
          vec2 dq = (p - q.xy) * vec2(1., .6); col += uCols[i] * exp(-dot(dq, dq) * .3) * .2; }
        for (int i = 0; i < 8; i++) { vec4 q = uBoats[i]; if (q.z <= 0.) continue;
          vec2 dq = p - q.xy; col += uCols[int(q.w)] * exp(-dot(dq, dq) * 1.3) * .3 * q.z; }
        for (int i = 0; i < 3; i++) { if (uCurDir[i].z <= 0.) continue;
          vec2 q = p - uCur[i].xy; vec2 hw = uCur[i].zw * .5;
          float inside = (1. - smoothstep(hw.x - 1.5, hw.x, abs(q.x))) * (1. - smoothstep(hw.y - .8, hw.y, abs(q.y)));
          vec2 dn = normalize(uCurDir[i].xy); float along = dot(q, dn), across = dot(q, vec2(-dn.y, dn.x));
          float lane = smoothstep(.55, 1., sin(across * 2.6 + 1.3)), dash = smoothstep(.55, .95, fract(along * .26 - uTime * .32 + sin(across * 1.7) * .4));
          col += vec3(.5, .75, 1.) * lane * dash * .22 * inside; col += vec3(.03, .07, .12) * inside; }
        if (uWind.z > 0.) { vec2 dn = normalize(uWind.xy); float along = dot(p, dn), across = dot(p, vec2(-dn.y, dn.x));
          float st = smoothstep(.8, 1., sin(across * 1.9)) * smoothstep(.75, .98, fract(along * .12 - uTime * 1.1 + sin(across * .7)));
          col += vec3(.7, .8, 1.) * st * .35 * uWind.z; }
        if (uWhirl.w > 0.) { vec2 q = p - uWhirl.xy; float r = length(q);
          if (r < uWhirl.z) { float k = 1. - r / uWhirl.z, a = atan(q.y, q.x), sw = sin(a * 3. + r * 2.3 - uTime * 3.6);
            col = mix(col, vec3(.01, .03, .09), k * k * .9 * uWhirl.w); col += vec3(.6, .85, 1.) * smoothstep(.55, 1., sw) * (k * .75 + .1) * .6 * uWhirl.w;
            col += vec3(.5, .75, 1.) * smoothstep(.12, 0., abs(r - uWhirl.z * .97)) * .25 * uWhirl.w; } }
        if (uRipple.w > 0.) { float r = length(p - uRipple.xy); float ring = max(0., sin(r * 4.5 - uTime * 7.)) * smoothstep(4.5, .5, r);
          col += vec3(.6, .85, 1.) * ring * .35 * uRipple.w; }
        float foam = smoothstep(uShore - 1., uShore - .1, p.y); col += vec3(.6, .72, .85) * foam * (.22 + .2 * sin(p.x * 2.1 + uTime * 1.4));
        float d = length(p - uBeam.xy), b = smoothstep(uBeam.z, uBeam.z * .3, d) * uBeamOn;
        float sp = pow(max(0., sin(p.x * 3.3 + uTime * 2.1) * sin(p.y * 2.9 - uTime * 1.7 + p.x)), 5.);
        col += vec3(1., .76, .4) * b * (.4 + .45 * sp + .25 * diff);
        col += vec3(1., .85, .55) * smoothstep(.18, 0., abs(d - uBeam.z * .94)) * .16 * uBeamOn;
        col += vec3(.32, .38, .6) * uFlash * (.5 + .5 * diff);
        float f = smoothstep(uFogNear, uFogFar, length(cameraPosition - vW)); col = mix(col, uFogCol, f);
        gl_FragColor = vec4(col, 1.); }`,
  });
  const geo = new THREE.PlaneGeometry(240, 240, 150, 150); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.z = -40; m.frustumCulled = false;
  return { mesh: m, uniforms };
}

// ---------------------------------------------------------------- the beam: a soft additive cone from the lamp to the water
export function buildBeam() {
  const geo = new THREE.CylinderGeometry(0.12, 1, 1, 32, 1, true); geo.translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOn: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOn; varying vec2 vUv; varying float vF; void main(){ float a = (.08 + .3 * vUv.y) * pow(vF, 1.5) * uOn; gl_FragColor = vec4(vec3(1., .82, .5) * a, a); }',
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5;
  return m;
}

// ---------------------------------------------------------------- lighthouse on its headland
export const LIGHTHOUSE = new THREE.Vector3(17.6, 0, -4.2);
export const BOAT_SCALE = 1.35; // boats read at 800x450
export function buildLighthouse() {
  const g = new THREE.Group(); g.position.copy(LIGHTHOUSE);
  const rockMat = lam('#5f6680'), r = rng(5);
  for (let i = 0; i < 9; i++) {
    const s = 1.2 + r() * 1.6, k = mesh(new THREE.DodecahedronGeometry(s, 0), rockMat, (r() - 0.5) * 4, s * 0.25, (r() - 0.5) * 3.4);
    k.rotation.set(r() * 3, r() * 3, r() * 3); k.scale.y = 0.8; g.add(k);
  }
  const top = mesh(new THREE.CylinderGeometry(2.3, 2.7, 0.6, 9), lam('#4c7a4e'), 0, 1.45, 0); g.add(top);
  const base = 1.7, bands = [['#f4ecdf', 1.3], ['#d8473d', 1.3], ['#f4ecdf', 1.3], ['#d8473d', 1.3]];
  let y = base, rad = 1.05;
  for (const [c, h] of bands) {
    const r1 = rad - 0.085 * h; g.add(mesh(new THREE.CylinderGeometry(r1, rad, h, 12), lam(c), 0, y + h / 2, 0)); y += h; rad = r1;
  }
  g.add(mesh(new THREE.CylinderGeometry(rad + 0.35, rad + 0.25, 0.16, 14), lam('#2d3550'), 0, y + 0.08, 0));
  const rail = mesh(new THREE.TorusGeometry(rad + 0.3, 0.035, 4, 24), lam('#2d3550'), 0, y + 0.45, 0); rail.rotation.x = Math.PI / 2; g.add(rail);
  const glass = mesh(new THREE.CylinderGeometry(rad * 0.82, rad * 0.82, 0.9, 10), new THREE.MeshBasicMaterial({ color: '#ffe3a0' }), 0, y + 0.6, 0); g.add(glass);
  for (let i = 0; i < 5; i++) { const bar = mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), lam('#2d3550'), Math.cos(i * 1.257) * rad * 0.84, y + 0.6, Math.sin(i * 1.257) * rad * 0.84); g.add(bar); }
  g.add(mesh(new THREE.ConeGeometry(rad + 0.25, 0.8, 10), lam('#c23f37'), 0, y + 1.45, 0));
  g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), lam('#2d3550'), 0, y + 1.9, 0));
  const door = mesh(new THREE.PlaneGeometry(0.5, 0.8), new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), 0, base + 0.42, 1.04); g.add(door);
  for (const [wy, wa] of [[base + 2.2, -0.5], [base + 3.6, 0.45]]) {
    const w = mesh(new THREE.PlaneGeometry(0.26, 0.36), new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), Math.sin(wa) * 0.93, wy, Math.cos(wa) * 0.93); w.rotation.y = wa; g.add(w);
  }
  const head = new THREE.Group(); head.position.set(0, y + 0.6, 0); g.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.34, 0.34, 0.5), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), 0, 0, 0.12));
  const glow = new THREE.Sprite(glowMat('#ffd88a', 0.95)); glow.scale.setScalar(5.5); glow.position.set(0, y + 0.6, 0); g.add(glow);
  const cottage = buildHouse('#e8dcc4', '#a8473c', 1.9, 1.4, 1.6, [[0, 0.65], [-0.55, 0.65]], r); cottage.position.set(2.2, 1.2, 1.6); cottage.rotation.y = 0.3; g.add(cottage);
  g.userData = { head, glow, lamp: new THREE.Vector3(0, y + 0.6, 0).add(LIGHTHOUSE) };
  return g;
}

// ---------------------------------------------------------------- town, beach and cliffs (static)
function buildHouse(body, roof, w, h, d, windows, r) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, h, d), lam(body), 0, h / 2, 0));
  const rr = d * 0.62, rf = mesh(new THREE.CylinderGeometry(rr, rr, w + 0.2, 3), lam(roof), 0, h + rr * 0.5, 0);
  rf.rotation.set(-Math.PI / 2, 0, Math.PI / 2); g.add(rf); // a triangular prism along x, ridge up
  const winMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), darkMat = new THREE.MeshBasicMaterial({ color: '#2a2f4a' });
  for (const [wx, wy] of windows) for (const side of [-1, 1]) { // windows on both faces: the bay side and the camera side
    const lit = !r || r() > 0.2, pane = mesh(new THREE.PlaneGeometry(0.32, 0.38), lit ? winMat : darkMat, wx, wy, side * (d / 2 + 0.01)); pane.rotation.y = side < 0 ? Math.PI : 0; g.add(pane);
  }
  if (r && r() > 0.5) g.add(mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), lam('#6a5a52'), w * 0.25, h + d * 0.4, 0.2));
  return g;
}
export function buildTown() {
  const g = new THREE.Group(), r = rng(9);
  const sand = mesh(new THREE.BoxGeometry(70, 1, 3.2), lam('#94785c'), 0, -0.38, SHORE + 1.5); g.add(sand);
  const pebble = lam('#5d6378'), wood = lam('#7a5232'), crate = lam('#a77a48');
  for (let x = -16; x < 16; x += 0.55 + r() * 0.7) { // pebbles along the waterline
    const s = 0.16 + r() * 0.24, k = mesh(new THREE.DodecahedronGeometry(s, 0), pebble, x, 0.05, SHORE + 0.1 + r() * 0.35); k.rotation.set(r() * 3, r() * 3, 0); g.add(k);
  }
  for (let x = -14.6; x < 15; x += 2.6 + r() * 2.2) { // barrels and crates on the sand
    if (r() > 0.5) g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.55, 8), wood, x, 0.4, SHORE + 2.4 + r() * 0.4));
    else { const c = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), crate, x, 0.35, SHORE + 2.3 + r() * 0.5); c.rotation.y = r(); g.add(c); }
  }
  const land = mesh(new THREE.BoxGeometry(70, 1.2, 14), lam('#3f6a4a'), 0, -0.1, SHORE + 9.6); g.add(land);
  const lane = mesh(new THREE.BoxGeometry(70, 0.1, 1.1), lam('#8a7a6a'), 0, 0.52, SHORE + 3.6); g.add(lane);
  const bodies = ['#e8d9c0', '#d9926e', '#8fb3c9', '#e6c36a', '#c9a3c9', '#a7c98f'], roofs = ['#a8473c', '#3f5a7a', '#6a4a3a', '#7a3f5f'];
  for (let i = 0; i < 13; i++) {
    const x = -15.5 + i * 2.35 + (r() - 0.5) * 0.6; if (x > 15.5) break;
    const w = 1.5 + r() * 0.7, h = 1.2 + r() * 0.9, d = 1.4 + r() * 0.3, z = SHORE + 4.9 + r() * 1.6;
    const wins = [[-w * 0.22, h * 0.55], [w * 0.22, h * 0.55]]; if (h > 1.7) wins.push([0, h * 0.85]);
    const hs = buildHouse(bodies[(r() * bodies.length) | 0], roofs[(r() * roofs.length) | 0], w, h, d, wins, r);
    hs.position.set(x, 0.5, z); hs.rotation.y = (r() - 0.5) * 0.25; g.add(hs);
  }
  const postMat = lam('#3a3448');
  for (let x = -14; x < 16; x += 4.6) {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 5), postMat, x, 1.2, SHORE + 3.1));
    const s = new THREE.Sprite(glowMat('#ffc86a', 0.8)); s.scale.setScalar(1.3); s.position.set(x, 1.95, SHORE + 3.1); g.add(s);
    g.add(mesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffe0a0' }), x, 1.95, SHORE + 3.1));
  }
  const cliff = lam('#565d78'), cliff2 = lam('#4a5068'), pine = lam('#2f5a46');
  for (const side of [-1, 1]) {
    for (let z = -15; z < (side > 0 ? 6.5 : 9); z += 1.9) {
      const s = 1.5 + r() * 1.1, k = mesh(new THREE.DodecahedronGeometry(s, 0), r() > 0.5 ? cliff : cliff2, side * (18.0 + r() * 1.0), s * 0.2 - 0.3, z + r() * 0.8);
      k.rotation.set(r() * 3, r() * 3, r() * 3); k.scale.set(1, 0.75 + r() * 0.35, 1); g.add(k);
      if (r() > 0.6) { const t = mesh(new THREE.ConeGeometry(0.6, 1.8, 6), pine, side * (19.2 + r()), s * 0.9 + 0.6, z); g.add(t); }
    }
  }
  for (let i = 0; i < 4; i++) { // sea stacks out past the arrival band
    const s = 1.4 + r() * 1.4, k = mesh(new THREE.DodecahedronGeometry(s, 0), cliff2, -22 + i * 14 + r() * 4, s * 0.3, -19 - r() * 6);
    k.scale.y = 1.6; g.add(k);
  }
  return g;
}

// ---------------------------------------------------------------- piers with a lantern post and a boathouse
export function buildPier(x, ci) {
  const g = new THREE.Group(), hex = COLORS[ci].hex, wood = lam('#8a6240'), wood2 = lam('#6e4c33'), tipZ = SHORE - PIER_LEN;
  g.position.x = x;
  for (const dx of [-0.42, 0, 0.42]) g.add(mesh(new THREE.BoxGeometry(0.38, 0.14, PIER_LEN + 1.4), dx ? wood : wood2, dx, 0.42, tipZ + (PIER_LEN + 1.4) / 2));
  for (let z = tipZ + 0.15; z < SHORE + 0.4; z += 1.05) for (const dx of [-0.6, 0.6]) g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 6), wood2, dx, -0.05, z));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.9, 6), lam('#3a3448'), 0.45, 1.3, tipZ + 0.2));
  const lantern = mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: hex }), 0.45, 2.32, tipZ + 0.2); g.add(lantern);
  g.add(mesh(new THREE.ConeGeometry(0.24, 0.22, 6), lam('#2d3550'), 0.45, 2.58, tipZ + 0.2));
  const glow = new THREE.Sprite(glowMat(hex, 0.9)); glow.scale.setScalar(2.6); glow.position.copy(lantern.position); g.add(glow);
  const badge = sprite(badgeTex(ci), 1.05); badge.position.set(-0.1, 3.25, tipZ + 0.2); g.add(badge);
  const ring = mesh(new THREE.RingGeometry(1.0, 1.22, 40), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.08, DOCK_Z);
  ring.rotation.x = -Math.PI / 2; g.add(ring);
  const house = new THREE.Group(); house.position.set(0, 0.1, SHORE + 1.5); g.add(house);
  house.add(mesh(new THREE.BoxGeometry(2.0, 1.25, 1.5), lam('#a07a58'), 0, 0.62, 0));
  const roof = mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.2, 3), lam(hex), 0, 1.25 + 0.47, 0); roof.rotation.set(-Math.PI / 2, 0, Math.PI / 2); house.add(roof);
  const door = mesh(new THREE.PlaneGeometry(0.9, 0.85), new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), 0, 0.45, -0.76); door.rotation.y = Math.PI; house.add(door);
  house.add(mesh(new THREE.PlaneGeometry(0.4, 0.35), new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), 0.5, 0.75, 0.76));
  g.userData = { lantern, glow, badge, ring, tip: new THREE.Vector3(x, 0, DOCK_Z) };
  return g;
}

// ---------------------------------------------------------------- rocks (dark until the beam finds them) with a foam ring
export function buildRock(rock) {
  const g = new THREE.Group(), r = rng(rock.seed), geo = new THREE.DodecahedronGeometry(rock.r, 0), p = geo.attributes.position;
  const jit = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + rock.seed) * 43758.5453; return 0.82 + 0.36 * (v - Math.floor(v)); };
  for (let i = 0; i < p.count; i++) { const k = jit(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } // same corner, same push: no cracks
  geo.computeVertexNormals();
  const m = mesh(geo, lam(r() > 0.5 ? '#626a82' : '#57607a'), 0, rock.r * 0.12, 0); m.scale.y = 0.85; m.rotation.y = r() * 6; g.add(m);
  if (rock.r > 0.75) { const m2 = mesh(new THREE.DodecahedronGeometry(rock.r * 0.5, 0), lam('#4c546c'), rock.r * 0.7, 0, rock.r * 0.3); g.add(m2); }
  const foam = mesh(new THREE.RingGeometry(rock.r * 1.0, rock.r * 1.45, 22), new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.09, 0);
  foam.rotation.x = -Math.PI / 2; g.add(foam);
  g.position.set(rock.x, 0, rock.z); g.userData.foam = foam;
  return g;
}

// ---------------------------------------------------------------- boats: hull + type details + a lantern in the pier colour
function hullGeo(w, l, h) {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.8, -l); s.lineTo(w * 0.8, -l);
  s.quadraticCurveTo(w * 1.08, -l * 0.25, w * 0.92, l * 0.25); s.quadraticCurveTo(w * 0.6, l * 0.8, 0, l);
  s.quadraticCurveTo(-w * 0.6, l * 0.8, -w * 0.92, l * 0.25); s.quadraticCurveTo(-w * 1.08, -l * 0.25, -w * 0.8, -l);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, h - 0.16, 0); // bow at +z, deck on top, keel just under the water
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.7); p.setZ(i, p.getZ(i) * 0.93); }
  g.computeVertexNormals();
  return g;
}
const HULLS = ['#e8574a', '#f3efe6', '#3f7fa8', '#2f4f6f', '#e6b84a', '#4e9a7a'];
function sailor() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.26, 6), lam('#ffcf3d'), 0, 0.13, 0));
  g.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), lam('#f2c49c'), 0, 0.33, 0));
  g.add(mesh(new THREE.ConeGeometry(0.12, 0.1, 7), lam('#ffcf3d'), 0, 0.42, 0));
  return g;
}
export const BOAT_TYPES = {
  skiff: { w: 0.3, l: 0.62, h: 0.3, badgeY: 1.55 },
  sail: { w: 0.34, l: 0.82, h: 0.3, badgeY: 2.35 },
  trawler: { w: 0.46, l: 1.0, h: 0.38, badgeY: 1.95 },
  ferry: { w: 0.66, l: 1.45, h: 0.42, badgeY: 2.1 },
};
export function buildBoat(type, ci, seed) {
  const T = BOAT_TYPES[type], hex = COLORS[ci].hex, r = rng(seed), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const hullCol = type === 'ferry' ? '#f3efe6' : HULLS[(r() * HULLS.length) | 0];
  body.add(new THREE.Mesh(hullGeo(T.w, T.l, T.h), [lam('#c99a66'), lam(hullCol)]));
  const top = T.h - 0.16, colMat = lam(hex), white = lam('#f4f0e6'), dark = lam('#2d3550'), win = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
  let lanternAt;
  if (type === 'skiff') {
    body.add(mesh(new THREE.BoxGeometry(T.w * 1.3, 0.06, 0.14), lam('#8a6240'), 0, top + 0.04, 0.1));
    const s = sailor(); s.position.set(0, top, -0.12); body.add(s);
    for (const sx of [-1, 1]) { const oar = mesh(new THREE.BoxGeometry(0.7, 0.03, 0.06), lam('#c99a66'), sx * 0.42, top + 0.05, -0.05); oar.rotation.z = sx * 0.25; body.add(oar); }
    body.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5), dark, 0, top + 0.42, -T.l * 0.75));
    lanternAt = new THREE.Vector3(0, top + 0.9, -T.l * 0.75);
  } else if (type === 'sail') {
    body.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.75, 6), dark, 0, top + 0.87, 0.12));
    const ms = new THREE.Shape(); ms.moveTo(0, 0.12); ms.lineTo(0, 1.6); ms.lineTo(0.62, 0.12); ms.closePath();
    const sailMesh = mesh(new THREE.ShapeGeometry(ms), new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide, flatShading: true }), 0, top, 0.08); sailMesh.rotation.y = Math.PI / 2; body.add(sailMesh);
    const js = new THREE.Shape(); js.moveTo(0, 0.1); js.lineTo(0, 1.25); js.lineTo(-0.5, 0.1); js.closePath();
    const jib = mesh(new THREE.ShapeGeometry(js), new THREE.MeshLambertMaterial({ color: '#f4f0e6', side: THREE.DoubleSide, flatShading: true }), 0, top, 0.2); jib.rotation.y = Math.PI / 2; body.add(jib);
    const s = sailor(); s.position.set(0, top, -0.5); body.add(s);
    lanternAt = new THREE.Vector3(0, top + 1.8, 0.12);
    g.userData.sail = sailMesh;
  } else if (type === 'trawler') {
    body.add(mesh(new THREE.BoxGeometry(0.6, 0.42, 0.55), white, 0, top + 0.21, -0.3));
    body.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.65), colMat, 0, top + 0.46, -0.3));
    const w1 = mesh(new THREE.PlaneGeometry(0.45, 0.14), win, 0, top + 0.28, -0.02); body.add(w1);
    body.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 5), dark, 0, top + 0.55, 0.42));
    const boom = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), dark, 0, top + 0.75, 0.15); boom.rotation.x = 1.1; body.add(boom);
    body.add(mesh(new THREE.BoxGeometry(0.28, 0.12, 0.2), lam('#c9813a'), 0.12, top + 0.06, 0.55));
    const s = sailor(); s.position.set(-0.12, top, 0.2); body.add(s);
    lanternAt = new THREE.Vector3(0, top + 1.14, 0.42);
  } else {
    body.add(mesh(new THREE.BoxGeometry(0.98, 0.42, 1.9), white, 0, top + 0.21, -0.1));
    body.add(mesh(new THREE.BoxGeometry(0.75, 0.32, 1.05), white, 0, top + 0.58, -0.25));
    for (const sx of [-1, 1]) {
      const strip = mesh(new THREE.PlaneGeometry(1.6, 0.14), win, sx * 0.495, top + 0.25, -0.1); strip.rotation.y = sx * Math.PI / 2; body.add(strip);
      const strip2 = mesh(new THREE.PlaneGeometry(0.85, 0.11), win, sx * 0.38, top + 0.6, -0.25); strip2.rotation.y = sx * Math.PI / 2; body.add(strip2);
    }
    body.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), colMat, 0, top + 0.98, -0.45));
    body.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 8), dark, 0, top + 1.24, -0.45));
    body.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), dark, 0, top + 1.05, 0.35));
    lanternAt = new THREE.Vector3(0, top + 1.42, 0.35);
  }
  const lantern = mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: hex }), lanternAt.x, lanternAt.y, lanternAt.z); body.add(lantern);
  const glow = new THREE.Sprite(glowMat(hex, 0.95)); glow.scale.setScalar(1.5); glow.position.copy(lanternAt); body.add(glow);
  body.scale.setScalar(BOAT_SCALE);
  const badge = sprite(badgeTex(ci), 0.95); badge.position.set(0, T.badgeY * BOAT_SCALE, 0); g.add(badge);
  const warn = sprite(warnTex(), 1.0); warn.position.set(0, T.badgeY * BOAT_SCALE + 0.95, 0); warn.visible = false; g.add(warn);
  g.userData = { body, lantern, glow, badge, warn };
  return g;
}

// ---------------------------------------------------------------- the moonwhale (friendly; its splash pushes boats)
export function buildWhale() {
  const g = new THREE.Group(), blue = lam('#3c6194'), belly = lam('#cfe2ef');
  const body = mesh(new THREE.SphereGeometry(1, 12, 8), blue, 0, 0, 0); body.scale.set(1.25, 0.8, 2.7); g.add(body);
  const b2 = mesh(new THREE.SphereGeometry(1, 10, 6), belly, 0, -0.28, 0.35); b2.scale.set(1.05, 0.55, 2.2); g.add(b2);
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), lam('#ffffff'), sx * 0.95, 0.18, 1.55));
    g.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), lam('#1b2240'), sx * 1.05, 0.2, 1.62));
    const fin = mesh(new THREE.BoxGeometry(1.0, 0.1, 0.55), blue, sx * 1.35, -0.35, 0.6); fin.rotation.z = sx * -0.5; g.add(fin);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.15, -2.6); g.add(tail);
  const stalk = mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.2, 8), blue, 0, 0, -0.2); stalk.rotation.x = Math.PI / 2; tail.add(stalk);
  for (const sx of [-1, 1]) { const f = mesh(new THREE.BoxGeometry(1.3, 0.1, 0.6), blue, sx * 0.62, 0, -0.85); f.rotation.y = sx * 0.45; tail.add(f); }
  g.userData = { tail };
  return g;
}
