// Sanctuary Merchant — arcade-idle game engine (Three.js).
// World: XZ plane, y up. The sanctuary is walled in; the service counter sits in the south gate (z≈5);
// champions arrive from the lane in the south, queue outside the counter, pay, and sprint back to the lane.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { t, lang } from './i18n.js';

// ------------------------------------------------------------ tuning
export const ITEMS = {
  blade: { price: 5, h: 0.16, color: 0x8fc4ff }, flask: { price: 6, h: 0.34, color: 0xff4d6d },
  shield: { price: 12, h: 0.14, color: 0xd9b25e }, tome: { price: 20, h: 0.18, color: 0xb06aff }, // tomes: 4x a blade
};
const STATIONS = {
  forge: { item: 'blade', interval: 1.5, pos: [-6, -3], sfx: 'anvil' },
  font: { item: 'flask', interval: 2.0, pos: [6, -3], sfx: 'brew' },
  anvil: { item: 'shield', interval: 2.6, pos: [-9.5, 2.2], sfx: 'anvil' },
  scribe: { item: 'tome', interval: 4.0, pos: [-6, -9.8], sfx: 'scribe' },
};
const RACK_CAP = 10;
const PADS = [ // unlock order: each pad appears once its prerequisites are bought
  { id: 'A', cost: 50, pos: [-9.5, 2.2], unlock: 'anvil', after: [], major: false },
  { id: 'D', cost: 100, pos: [6, -9.8], unlock: 'desk', after: ['A'], major: false },
  { id: 'B', cost: 150, pos: [9.5, 2.2], unlock: 'golem', after: ['A'], major: false },
  { id: 'C', cost: 300, pos: [-6, -9.8], unlock: 'scribe', after: ['B'], major: true },
  { id: 'E', cost: 1000, pos: [0, -11.2], unlock: 'hall', after: ['C', 'D'], major: true },
];
const ARCHETYPES = {
  berserker: { speed: 4.2, patience: 16, wants: () => [['blade', rnd(1, 3)]], voice: ['berserker_need', 'berserker_lane'], color: 0xb84a2a },
  elementalist: { speed: 3.0, patience: 26, tip: 0.5, color: 0x6a4ab8, voice: ['elementalist_need'],
    wants: (u) => { const w = [['flask', rnd(1, 2)]]; if (u.scribe && Math.random() < 0.6) w.push(['tome', 1]); return w; } },
  juggernaut: { speed: 2.4, patience: 42, wants: () => [['shield', rnd(1, 2)]], voice: ['juggernaut_need'], color: 0x5a6a7a },
};
const UPGRADES = { speed: { max: 6, step: 0.15 }, capacity: { max: 6, step: 2 }, craft: { max: 6, step: 0.12 } };
const upgradeCost = (lv) => Math.round(100 * 1.75 ** lv);
const BASE_SPEED = 6, BASE_CAP = 4, QUEUE_MAX = 6;
const COUNTER_Z = 5.1, SERVE = new THREE.Vector3(0, 0, 3.7), COIN_AREA = new THREE.Vector3(3.4, 0, 3.3), TRASH = new THREE.Vector3(-3.6, 0, 3.4);
const QUEUE0 = 7.2, QUEUE_GAP = 1.45, SPAWN_Z = 25;
const BOUNDS = { x0: -12.3, x1: 12.3, z0: -13.3, z1: 4.4 };

function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const ease = { outBack: (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2, outCubic: (k) => 1 - (1 - k) ** 3, inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2) };
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.1, ...o });
const glow = (c, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });

export class GameEngine {
  constructor({ canvas, assets, sound, bridge, ui }) {
    Object.assign(this, { canvas, assets, sound, bridge, ui });
    this.state = Object.assign({ gold: 0, unlocked: {}, padPaid: {}, upg: { speed: 0, capacity: 0, craft: 0 }, earned: 0, m500: false, sales: 0 }, bridge.load('sanctuary_save') || {});
    this.tweens = []; this.fly = []; this.fx = []; this.customers = []; this.coins = []; this.workers = []; this.stations = {}; this.pads = {};
    this.paused = true; this.time = 0; this.shake = 0; this.frenzy = 0; this.spawnT = 2; this.input = { x: 0, z: 0 }; this.keys = {}; this.started = false;
    this.setupRenderer(); this.buildWorld(); this.setupInput();
    this.player = this.makeCarrier('merchant', V(0, 0), { color: 0x3a6ab8 });
    this.player.cap = () => BASE_CAP + this.state.upg.capacity * UPGRADES.capacity.step;
    for (const p of PADS) this.makePad(p);
    for (const k of Object.keys(STATIONS)) if (k === 'forge' || k === 'font' || this.state.unlocked[k]) this.makeStation(k, false);
    if (this.state.unlocked.desk) this.makeDesk(false);
    if (this.state.unlocked.golem) this.hireGolem(false);
    if (this.state.unlocked.hall) this.makeHall(false);
    this.refreshPads(); this.ui.setGold(this.state.gold, false);
    setInterval(() => this.save(), 5000);
    addEventListener('resize', () => this.resize()); this.resize();
    this.clock = new THREE.Clock(); this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ rendering
  setupRenderer() {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x2b3a2a); this.scene.fog = new THREE.Fog(0x2b3a2a, 45, 85);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.camYaw = Math.PI / 4; this.camPitch = THREE.MathUtils.degToRad(42); this.camTarget = V(0, 0);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4)); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe4ff, 0x5a4630, 1.1));
    this.composer = new EffectComposer(r); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 0.86)); this.composer.addPass(new OutputPass());
  }
  resize() {
    const w = innerWidth, h = innerHeight, aspect = w / h, viewH = aspect < 1 ? Math.max(17, 15.5 / aspect) : 17; // portrait: keep ~15.5 units across
    Object.assign(this.camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 }); this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
  }
  placeCamera(dt) {
    const p = this.player.g.position;
    this.camTarget.lerp(V(THREE.MathUtils.clamp(p.x, -7, 7), THREE.MathUtils.clamp(p.z, -9, 9)), Math.min(1, dt * 5));
    const d = 50, c = this.camTarget;
    this.camera.position.set(c.x + d * Math.cos(this.camPitch) * Math.sin(this.camYaw), d * Math.sin(this.camPitch), c.z + d * Math.cos(this.camPitch) * Math.cos(this.camYaw));
    if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; }
    this.camera.lookAt(c); this.sun.position.set(c.x - 14, 30, c.z + 10); this.sun.target.position.copy(c);
  }
  project(v) { const p = v.clone().project(this.camera); return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, vis: p.z < 1 }; }

  // ------------------------------------------------------------ world
  canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
    if (repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(...repeat); } return tx;
  }
  runeTex(color = '#7fd4ff') {
    return this.canvasTex(256, 256, (x) => {
      x.translate(128, 128); x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 5; x.shadowColor = color; x.shadowBlur = 12;
      x.beginPath(); x.arc(0, 0, 118, 0, 7); x.stroke(); x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 96, 0, 7); x.stroke();
      x.font = 'bold 18px serif'; x.textAlign = 'center'; const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
      for (let i = 0; i < 24; i++) { x.save(); x.rotate((i / 24) * Math.PI * 2); x.fillText(glyphs[i], 0, -102); x.restore(); }
    });
  }
  buildWorld() {
    const S = this.scene;
    // stone floor with baked edge darkening (cheap ambient-occlusion tint)
    const floorTex = this.canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#8b8478'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const o = (j % 2) * 32, l = 118 + Math.random() * 30; x.fillStyle = `rgb(${l},${l - 6},${l - 16})`; x.fillRect(i * 64 + o + 2, j * 64 + 2, 60, 60);
        x.fillStyle = 'rgba(0,0,0,.06)'; for (let k = 0; k < 14; k++) x.fillRect(i * 64 + o + Math.random() * 56, j * 64 + Math.random() * 56, 3, 3);
      }
    }, [7, 6]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(27, 20), std(0xffffff, { map: floorTex, roughness: 0.92 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, -4.4); floor.receiveShadow = true; S.add(floor);
    const ao = this.canvasTex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    const aoM = new THREE.Mesh(new THREE.PlaneGeometry(27, 20), new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false })); aoM.rotation.x = -Math.PI / 2; aoM.position.set(0, 0.02, -4.4); S.add(aoM);
    const grassTex = this.canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#4c6b34'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = Math.random() < 0.5 ? '#5f8040' : '#3f5a2a'; x.fillRect(Math.random() * w, Math.random() * h, 2, 5); } }, [24, 24]);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), std(0xffffff, { map: grassTex, roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; S.add(grass);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), std(0x8a6a48, { roughness: 1 })); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.015, 25); path.receiveShadow = true; S.add(path);
    // walls with a gate filled by the service counter
    const wallM = std(0x9a9284, { roughness: 0.95 }), capM = std(0x6e675c);
    const wall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.7), wallM);
      m.position.set((x0 + x1) / 2, 0.8, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); m.castShadow = m.receiveShadow = true; S.add(m);
      for (let i = 0.6; i < len; i += 1.4) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.8), capM); c.position.set(x0 + ((x1 - x0) * i) / len, 1.8, z0 + ((z1 - z0) * i) / len); c.rotation.y = m.rotation.y; c.castShadow = true; S.add(c); }
    };
    wall(-13.4, -14.4, 13.4, -14.4); wall(-13.4, -14.4, -13.4, 5.6); wall(13.4, -14.4, 13.4, 5.6); wall(-13.4, 5.6, -2.6, 5.6); wall(2.6, 5.6, 13.4, 5.6);
    // pillars with braziers (two real lights, the rest emissive)
    this.flames = [];
    for (const [x, z, light] of [[-13.4, 5.6, 1], [13.4, 5.6, 1], [-13.4, -14.4, 0], [13.4, -14.4, 0], [-2.8, 5.6, 0], [2.8, 5.6, 0]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 3.2, 8), capM); p.position.set(x, 1.6, z); p.castShadow = true; S.add(p);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.4, 10), std(0x3a3a40, { metalness: 0.7 })); bowl.position.set(x, 3.4, z); S.add(bowl);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), glow(0xff8a2a, 2.5)); fl.position.set(x, 3.95, z); S.add(fl); this.flames.push(fl);
      if (light) { const l = new THREE.PointLight(0xff9a40, 18, 12, 1.6); l.position.set(x, 4.2, z); S.add(l); fl.userData.light = l; }
    }
    // service counter (fills the gate) + recycle cauldron + coin tray rune
    const counter = new THREE.Group(); counter.position.set(0, 0, COUNTER_Z); S.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 1.3), std(0x7a4a26, { roughness: 0.6 })); top.position.y = 1.05; top.castShadow = true; counter.add(top);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.0, 1.1), std(0x5a3418)); body.position.y = 0.5; body.castShadow = body.receiveShadow = true; counter.add(body);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.6, 0.05), std(0x2a56a8)); cloth.position.set(0, 0.62, 0.56); counter.add(cloth);
    this.groundRune(SERVE, 1.5, '#ffd27a'); this.groundRune(COIN_AREA, 1.2, '#ffd27a', 0.35); this.label(SERVE.clone().setY(0.1), '', 'zone');
    const caul = new THREE.Group(); caul.position.copy(TRASH); S.add(caul);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), std(0x2e2e34, { metalness: 0.6, side: THREE.DoubleSide })); pot.position.y = 0.75; pot.rotation.x = Math.PI; pot.castShadow = true; caul.add(pot);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), glow(0x6aff9a, 1.6)); brew.rotation.x = -Math.PI / 2; brew.position.y = 0.9; caul.add(brew);
    this.label(TRASH.clone().setY(1.6), 'trash', 'small');
    // the sanctuary fountain: crystal over a rune circle
    const fx = V(0, -5.2); this.groundRune(fx, 2.6, '#7fd4ff');
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.5, 20), std(0xb0a898)); basin.position.set(fx.x, 0.25, fx.z); basin.castShadow = basin.receiveShadow = true; S.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.55, 24), std(0x3a8ac8, { roughness: 0.1, metalness: 0.3, emissive: 0x0a3050 })); water.rotation.x = -Math.PI / 2; water.position.set(fx.x, 0.51, fx.z); S.add(water);
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), new THREE.MeshStandardMaterial({ color: 0x9ae6ff, emissive: 0x3ab8ff, emissiveIntensity: 2.2, roughness: 0.1 }));
    this.crystal.position.set(fx.x, 2.3, fx.z); S.add(this.crystal);
    const cl = new THREE.PointLight(0x6ac8ff, 25, 11, 1.5); cl.position.set(fx.x, 2.6, fx.z); S.add(cl);
    this.colliders = [{ p: fx, r: 2.0 }, { p: TRASH, r: 0.8 }];
    // decoration outside the walls: towers flanking the lane, trees, rocks (Tripo models with fallbacks)
    this.prop('tower', V(-5.5, 13), () => this.procTower(), Math.PI); this.prop('tower', V(5.5, 13), () => this.procTower(), Math.PI);
    for (const [x, z, s] of [[-17, -8, 1], [-18, 2, 0.8], [17.5, -6, 1.1], [18, 4, 0.85], [-16, 12, 0.9], [16, 13, 1], [-9, 19, 0.8], [9, 20, 0.9], [-12, -18, 1], [8, -18, 1.1], [-3, -19, 0.9], [20, -14, 0.8]])
      this.prop('tree', V(x, z), () => this.procTree(), Math.random() * 6, s);
    for (const [x, z] of [[-15, -2], [15, 9], [-7, 15], [11, -17], [3, 17]]) this.prop('rock', V(x, z), () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.8), std(0x7a7670, { flatShading: true })), Math.random() * 6);
    this.blobTex = this.canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 4, 32, 32, 31); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  }
  groundRune(pos, r, color, opacity = 0.7) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: this.runeTex(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.03, pos.z); this.scene.add(m); (this.runes ??= []).push(m); return m;
  }
  procTower() {
    const g = new THREE.Group(), st = std(0x8d8478, { roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 4.5, 10), st); b.position.y = 2.25; b.castShadow = true; g.add(b);
    const r = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 10), std(0x2a56a8)); r.position.y = 5.3; r.castShadow = true; g.add(r); return g;
  }
  procTree() {
    const g = new THREE.Group(), tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.4, 7), std(0x5a3a22)); tr.position.y = 1.2; tr.castShadow = true; g.add(tr);
    for (const [y, r] of [[3, 1.9], [4.2, 1.4], [5.1, 0.9]]) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), std(0x3f6e2e, { flatShading: true })); c.position.y = y; c.castShadow = true; g.add(c); }
    return g;
  }
  async prop(id, pos, fallback, rotY = 0, scale = 1) { // procedural now, Tripo model when it arrives
    let o = fallback(); o.position.copy(pos); o.rotation.y = rotY; o.scale.setScalar(scale); o.traverse((m) => m.isMesh && (m.castShadow = true)); this.scene.add(o);
    const a = await this.assets.model(id); if (!a) return;
    const n = this.assets.instance(a); n.position.copy(pos); n.rotation.y = rotY; n.scale.multiplyScalar(scale); this.scene.remove(o); this.scene.add(n);
  }
  label(pos, key, cls = '') { const el = document.createElement('div'); el.className = 'wlabel ' + cls; if (key) { el.dataset.key = key; el.textContent = t(key); } this.ui.labels.appendChild(el); (this.labels ??= []).push({ el, pos }); return el; }
  relabel() { for (const l of this.labels || []) if (l.el.dataset.key) l.el.textContent = t(l.el.dataset.key); for (const p of Object.values(this.pads)) this.updatePadVisual(p); for (const c of this.customers) this.renderBubble(c); }

  // ------------------------------------------------------------ item meshes
  itemMesh(type) {
    const g = new THREE.Group(), c = ITEMS[type].color;
    if (type === 'blade') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.13), std(0xdfe8f2, { metalness: 0.9, roughness: 0.25, emissive: c, emissiveIntensity: 0.25 })); b.position.x = 0.15; g.add(b);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), std(0xd9b25e, { metalness: 0.8 })); gd.position.x = -0.32; g.add(gd);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6), std(0x4a2a14)); h.rotation.z = Math.PI / 2; h.position.x = -0.48; g.add(h); g.position.y = 0.06;
    } else if (type === 'flask') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.9 })); b.position.y = 0.17; g.add(b);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 8), std(0xd8e8f0, { roughness: 0.1 })); n.position.y = 0.36; g.add(n);
    } else if (type === 'shield') {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), std(0x9aa4b0, { metalness: 0.7, roughness: 0.3 })); s.position.y = 0.05; g.add(s);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 20), std(c, { metalness: 0.9 })); r.rotation.x = Math.PI / 2; r.position.y = 0.08; g.add(r);
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.42), std(0x5a2a7a)); b.position.y = 0.08; g.add(b);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.38), std(0xf2e8d0)); p.position.set(0.03, 0.08, 0); g.add(p);
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), glow(c, 2.5)); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.165; g.add(rune);
    }
    g.traverse((m) => m.isMesh && (m.castShadow = true)); g.userData.type = type; return g;
  }

  // ------------------------------------------------------------ characters & carriers
  procHumanoid(color, scale = 1) {
    const g = new THREE.Group(), body = std(color), skin = std(0xe0b090), dark = std(0x3a2a1e), rig = { arms: [], legs: [] };
    const part = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
    part(new THREE.CapsuleGeometry(0.3, 0.45, 4, 10), body, 0, 0.95, 0); part(new THREE.SphereGeometry(0.22, 14, 10), skin, 0, 1.55, 0);
    const limb = (x, y, len, mat, arr) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); part(new THREE.CapsuleGeometry(0.09, len, 4, 6), mat, 0, -len / 2, 0, p); arr.push(p); };
    limb(-0.4, 1.25, 0.45, body, rig.arms); limb(0.4, 1.25, 0.45, body, rig.arms); limb(-0.15, 0.6, 0.45, dark, rig.legs); limb(0.15, 0.6, 0.45, dark, rig.legs);
    g.scale.setScalar(scale); g.userData.rig = rig; return g;
  }
  makeCarrier(modelId, pos, { color = 0x888888, scale = 1, height = 1.75 } = {}) {
    const g = new THREE.Group(); g.position.copy(pos); this.scene.add(g);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3 * scale, 1.3 * scale), new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; g.add(blob);
    const c = { g, body: this.procHumanoid(color, scale), stack: [], stackG: new THREE.Group(), vel: new THREE.Vector3(), sway: new THREE.Vector2(), swayV: new THREE.Vector2(), anim: 'idle', phase: 0, height: height * scale, cap: () => 4, pickT: 0, serveT: 0 };
    g.add(c.body); c.stackG.position.y = c.height + 0.15; g.add(c.stackG);
    this.assets.model(modelId).then((a) => {
      if (!a || c.removed) return;
      const m = this.assets.instance(a); if (scale !== 1) m.scale.multiplyScalar(scale);
      g.remove(c.body); c.body = m; g.add(m);
      if (Object.keys(a.clips).length) { c.mixer = new THREE.AnimationMixer(m.userData.inner); c.acts = {}; for (const [k, cl] of Object.entries(a.clips)) c.acts[k] = c.mixer.clipAction(cl); c.cur = null; this.playAnim(c, c.anim, true); }
    });
    return c;
  }
  playAnim(c, name, force) {
    if (!c.acts) return; if (c.anim === name && !force) return; c.anim = name;
    const a = c.acts[name] || (name === 'run' ? c.acts.walk : name === 'walk' ? c.acts.run : null) || c.acts.idle; if (!a || a === c.cur) return;
    a.reset().fadeIn(0.15).play(); a.timeScale = c.acts[name] ? 1 : name === 'run' ? 1.6 : 0.8; c.cur?.fadeOut(0.15); c.cur = a;
  }
  animateCarrier(c, dt, speed) {
    const moving = speed > 0.3; c.phase += dt * (6 + speed * 1.6);
    if (c.mixer) { this.playAnim(c, moving ? (speed > 4.5 ? 'run' : 'walk') : 'idle'); c.mixer.update(dt); if (!c.acts.walk && !c.acts.run && moving) c.body.position.y = Math.abs(Math.sin(c.phase)) * 0.08; else c.body.position.y = 0; }
    else { c.anim = moving ? 'walk' : 'idle'; const r = c.body.userData.rig, s = moving ? Math.sin(c.phase) * 0.7 : 0;
      if (r) { r.legs.forEach((l, i) => (l.rotation.x = i ? s : -s)); r.arms.forEach((a, i) => (a.rotation.x = c.stack.length ? -1.3 : i ? -s * 0.5 : s * 0.5)); }
      c.body.position.y = moving ? Math.abs(Math.sin(c.phase)) * 0.06 : Math.sin(this.time * 2) * 0.01; }
    // stack spring: the tower leans opposite to acceleration and wobbles back
    const target = new THREE.Vector2(-c.vel.x, -c.vel.z).multiplyScalar(0.035);
    c.swayV.add(target.clone().sub(c.sway).multiplyScalar(dt * 60)).multiplyScalar(Math.max(0, 1 - dt * 9)); c.sway.add(c.swayV.clone().multiplyScalar(dt));
    let y = 0;
    c.stack.forEach((m, i) => { const k = (i + 1) ** 1.25 * 0.5; m.position.set(c.sway.x * k, y, c.sway.y * k); m.rotation.y = (i % 2) * 0.35 + Math.sin(this.time * 2 + i) * 0.03; y += ITEMS[m.userData.type].h; });
  }
  moveCarrier(c, dir, speed, dt) {
    const want = dir.clone().multiplyScalar(speed); c.vel.lerp(want, Math.min(1, dt * 12));
    const p = c.g.position; p.addScaledVector(c.vel, dt);
    if (c.bounded) { p.x = THREE.MathUtils.clamp(p.x, BOUNDS.x0, BOUNDS.x1); p.z = THREE.MathUtils.clamp(p.z, BOUNDS.z0, BOUNDS.z1); }
    for (const col of this.colliders) { const d = Math.hypot(p.x - col.p.x, p.z - col.p.z); if (d < col.r && d > 0.001) { p.x = col.p.x + ((p.x - col.p.x) / d) * col.r; p.z = col.p.z + ((p.z - col.p.z) / d) * col.r; } }
    if (c.vel.lengthSq() > 0.05) { const a = Math.atan2(c.vel.x, c.vel.z); let d = a - c.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); c.g.rotation.y += d * Math.min(1, dt * 14); }
  }
  near(c, pos, r) { return Math.hypot(c.g.position.x - pos.x, c.g.position.z - pos.z) < r; }

  // ------------------------------------------------------------ item flights (rack → head, head → customer)
  flyItem(mesh, fromWorld, toObj, toLocal, dur = 0.28, done) {
    this.scene.add(mesh); mesh.position.copy(fromWorld);
    this.fly.push({ mesh, from: fromWorld.clone(), toObj, toLocal, t: 0, dur, done });
  }
  updateFly(dt) {
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i]; f.t += dt; const k = Math.min(1, f.t / f.dur), to = f.toObj.localToWorld(f.toLocal.clone());
      f.mesh.position.lerpVectors(f.from, to, ease.inOut(k)); f.mesh.position.y += Math.sin(k * Math.PI) * 1.2; f.mesh.rotation.y += dt * 10;
      if (k >= 1) { this.fly.splice(i, 1); f.done?.(f.mesh); }
    }
  }
  stackTopLocal(c) { let y = 0; for (const m of c.stack) y += ITEMS[m.userData.type].h; return V(0, 0, y); }

  // ------------------------------------------------------------ stations
  makeStation(key, animate) {
    const d = STATIONS[key], pos = V(d.pos[0], d.pos[1]), g = new THREE.Group(); g.position.copy(pos); this.scene.add(g);
    const st = { key, d, g, rack: [], t: 0, rackPos: V(pos.x, pos.z + 1.9), anim: 0 };
    const stone = std(0x6a645c, { roughness: 0.9 }), iron = std(0x3a3a40, { metalness: 0.7, roughness: 0.4 }), wood = std(0x7a4a26);
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    if (key === 'forge') {
      part(new THREE.BoxGeometry(2.4, 1.4, 1.6), stone, 0, 0.7, -0.3); part(new THREE.BoxGeometry(1.2, 0.5, 0.2), glow(0xff6a20, 2), 0, 0.8, 0.52);
      part(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), stone, 0.7, 2.4, -0.6); st.fire = new THREE.PointLight(0xff7a30, 10, 6, 1.6); st.fire.position.set(0, 1.2, 0.9); g.add(st.fire);
      st.tool = part(new THREE.BoxGeometry(0.3, 0.25, 0.25), iron, -0.6, 1.7, 0.3);
    } else if (key === 'font') {
      part(new THREE.CylinderGeometry(1.0, 1.2, 0.9, 16), std(0xb0a898), 0, 0.45, -0.2);
      part(new THREE.CircleGeometry(0.85, 20), std(0xff4d6d, { emissive: 0xaa1a3a, emissiveIntensity: 1.4, roughness: 0.1 }), 0, 0.91, -0.2).rotation.x = -Math.PI / 2;
      st.tool = part(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: 0xff8aa0, emissive: 0xff3a6a, emissiveIntensity: 2 }), 0, 1.7, -0.2);
    } else if (key === 'anvil') {
      part(new THREE.CylinderGeometry(0.5, 0.6, 0.8, 10), wood, 0, 0.4, -0.2); part(new THREE.BoxGeometry(1.1, 0.35, 0.45), iron, 0, 0.98, -0.2);
      part(new THREE.BoxGeometry(0.4, 0.2, 0.35), iron, 0.6, 1.0, -0.2); st.tool = part(new THREE.BoxGeometry(0.28, 0.2, 0.2), iron, -0.3, 1.5, -0.2);
      this.assets.model('anvil').then((a) => { if (!a) return; const m = this.assets.instance(a); g.children.slice(0, 3).forEach((c) => (c.visible = false)); g.add(m); });
    } else {
      part(new THREE.BoxGeometry(2.0, 0.15, 1.1), wood, 0, 1.0, -0.2); for (const x of [-0.85, 0.85]) for (const z of [-0.6, 0.2]) part(new THREE.BoxGeometry(0.12, 1.0, 0.12), wood, x, 0.5, z);
      part(new THREE.BoxGeometry(0.6, 0.12, 0.45), std(0xf2e8d0), 0, 1.13, -0.2); st.tool = part(new THREE.ConeGeometry(0.06, 0.5, 6), glow(0xd0a0ff, 2), 0.3, 1.45, -0.1);
      st.fire = new THREE.PointLight(0xb06aff, 6, 5, 1.6); st.fire.position.set(0, 1.8, 0); g.add(st.fire);
    }
    // rack in front, toward the middle of the room
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.9), wood); rack.position.set(0, 0.45, 1.9); rack.castShadow = rack.receiveShadow = true; g.add(rack);
    for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.1), wood); l.position.set(x, 0.22, 1.9); g.add(l); }
    this.groundRune(st.rackPos, 1.25, '#9fe0ff', 0.45);
    this.colliders.push({ p: pos, r: 1.4 });
    st.label = this.label(V(pos.x, pos.z, 3.2), key === 'forge' ? 'forge' : key === 'font' ? 'font' : key === 'anvil' ? 'padA' : 'padC', 'small');
    this.stations[key] = st;
    if (animate) { g.scale.setScalar(0.01); this.tween(g.scale, { x: 1, y: 1, z: 1 }, 0.8, ease.outBack); this.burst(pos.clone().setY(0.5), 0xffd27a, 40); }
    return st;
  }
  rackSlot(i) { return V(-0.6 + (i % 5) * 0.3, 0, 1.9 + (Math.floor(i / 5) - 0.5) * 0.35).setY(0.53 + Math.floor(i / 10) * 0.2); }
  updateStations(dt) {
    const craftMul = 1 - this.state.upg.craft * UPGRADES.craft.step;
    for (const st of Object.values(this.stations)) {
      st.anim = Math.max(0, st.anim - dt * 3); if (st.tool) st.tool.position.y += (Math.sin(this.time * 6) * 0.004) + (st.anim > 0 ? Math.sin(st.anim * 12) * 0.02 : 0);
      if (st.fire) st.fire.intensity = (st.key === 'forge' ? 10 : 6) + Math.sin(this.time * 9 + st.g.position.x) * 1.5;
      if (st.key === 'font' && st.tool) st.tool.rotation.y += dt * 1.5;
      if (st.rack.length >= RACK_CAP) continue;
      st.t += dt; const interval = this.frenzy > 0 ? 0.15 : st.d.interval * craftMul;
      if (st.t < interval) continue; st.t = 0; st.anim = 1;
      const m = this.itemMesh(st.d.item); m.position.copy(this.rackSlot(st.rack.length)); if (st.d.item === 'blade') m.rotation.y = Math.PI / 2;
      st.g.add(m); m.scale.setScalar(0.01); this.tween(m.scale, { x: 1, y: 1, z: 1 }, 0.3, ease.outBack); st.rack.push(m);
      const dist = this.player.g.position.distanceTo(st.g.position); if (dist < 9 && this.frenzy <= 0) this.sound.play(st.d.sfx, 0.25 * (1 - dist / 9));
    }
  }
  pickFromRacks(c, dt, only) { // only: optional set of item types the carrier wants
    c.pickT -= dt; if (c.pickT > 0 || c.stack.length >= c.cap()) return false;
    for (const st of Object.values(this.stations)) {
      if (!st.rack.length || !this.near(c, st.rackPos, 1.35) || (only && !only.has(st.d.item))) continue;
      const m = st.rack.pop(), from = m.getWorldPosition(new THREE.Vector3()); st.g.remove(m);
      const slot = this.stackTopLocal(c); c.stack.push(m); m.visible = false;
      this.flyItem(m.clone(), from, c.stackG, slot, 0.22, (f) => { this.scene.remove(f); m.visible = true; });
      c.stackG.add(m); c.pickT = 0.11; if (c === this.player) this.sound.play('pop', 0.6, 1 + c.stack.length * 0.05);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ customers
  unlockedItems() { return { blade: true, flask: true, shield: !!this.state.unlocked.anvil, tome: !!this.state.unlocked.scribe }; }
  spawnCustomer() {
    const u = this.state.unlocked, pool = ['berserker', 'berserker', 'elementalist', 'elementalist'];
    if (u.anvil) pool.push('juggernaut', 'juggernaut');
    const kind = pool[Math.floor(Math.random() * pool.length)], A = ARCHETYPES[kind];
    const c = this.makeCarrier(kind, V((Math.random() - 0.5) * 2, SPAWN_Z), { color: A.color, height: kind === 'juggernaut' ? 2 : 1.8 });
    const wants = A.wants(u).map(([type, n]) => ({ type, n }));
    Object.assign(c, { kind, A, state: 'arrive', wants, originalWants: wants.map((w) => ({ ...w })), patience: A.patience, maxPatience: A.patience, waited: 0 });
    c.g.rotation.y = Math.PI;
    c.bubble = document.createElement('div'); c.bubble.className = 'bubble'; this.ui.labels.appendChild(c.bubble); this.renderBubble(c);
    this.customers.push(c);
  }
  renderBubble(c) {
    const r = 15, circ = 2 * Math.PI * r, k = Math.max(0, c.patience / c.maxPatience), col = k > 0.5 ? '#5fd35f' : k > 0.25 ? '#ffc94a' : '#ff5a4a';
    const items = c.wants.filter((w) => w.n > 0).map((w) => `<span class="want"><img src="${this.assets.icon(w.type) || ''}" alt="">${w.n > 1 ? '×' + w.n : ''}</span>`).join('');
    c.bubble.innerHTML = c.state === 'angry' ? '<b class="mad">!</b>' : c.state === 'paid' || c.state === 'leave' ? '<b class="happy">♥</b>'
      : `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="${r}" class="bg"/><circle cx="18" cy="18" r="${r}" stroke="${col}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - k)}" class="fg"/></svg>${items}`;
  }
  queueIndex(c) { return this.customers.filter((x) => x.state === 'arrive' || x.state === 'wait').indexOf(c); }
  updateCustomers(dt) {
    const waiting = this.customers.filter((x) => x.state === 'arrive' || x.state === 'wait');
    this.spawnT -= dt;
    if (this.spawnT <= 0 && waiting.length < QUEUE_MAX) { this.spawnCustomer(); this.spawnT = 3.5 + Math.random() * 3 - Math.min(2, this.state.sales * 0.02); }
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i], p = c.g.position; let dir = V(0, 0), speed = 0;
      if (c.state === 'arrive' || c.state === 'wait') {
        const qi = this.queueIndex(c), slot = V(0, QUEUE0 + qi * QUEUE_GAP), d = slot.clone().sub(p).setY(0);
        if (d.length() > 0.15) { dir = d.normalize(); speed = Math.min(c.A.speed, d.length() * 4); if (c.state === 'wait' && qi > 0) speed = Math.min(speed, 2.5); }
        else if (c.state === 'arrive') { c.state = 'wait'; if (qi === 0 && Math.random() < 0.7) this.sound.voice(c.A.voice[Math.floor(Math.random() * c.A.voice.length)], 6000); }
        if (c.state === 'wait' || d.length() < 3) {
          c.patience -= dt * (qi === 0 ? 1 : 0.6); c.waited += dt;
          if (c.patience <= 0) { c.state = 'angry'; this.sound.play('angry', 0.7); this.sound.voice(c.kind + '_angry', 3000); this.renderBubble(c); this.popText(p.clone().setY(c.height + 0.8), '!', 'mad'); continue; }
        }
        if (Math.floor(c.patience * 4) !== c.lastP) { c.lastP = Math.floor(c.patience * 4); this.renderBubble(c); }
      } else if (c.state === 'paid') {
        c.payT -= dt; if (c.payT <= 0) { c.state = 'leave'; this.renderBubble(c); }
      } else { // leave / angry: sprint back down the lane
        const exit = V(c.state === 'angry' ? -2.2 : 2.2, SPAWN_Z + 3), d = exit.clone().sub(p).setY(0);
        dir = d.normalize(); speed = c.A.speed * (c.state === 'leave' ? 1.6 : 1.1);
        if (p.z > SPAWN_Z + 1) { c.removed = true; this.scene.remove(c.g); c.bubble.remove(); this.customers.splice(i, 1); continue; }
      }
      this.moveCarrier(c, dir, speed, dt); if (c.state === 'wait') c.g.rotation.y = Math.PI; this.animateCarrier(c, dt, c.vel.length());
    }
  }
  // any carrier standing at the service rune hands matching items to the front customer
  serve(c, dt) {
    if (!this.near(c, SERVE, 1.5) || !c.stack.length) return false;
    const front = this.customers.find((x) => x.state === 'wait' && this.queueIndex(x) === 0); if (!front) return false;
    c.serveT -= dt; if (c.serveT > 0) return true;
    for (let i = c.stack.length - 1; i >= 0; i--) {
      const m = c.stack[i], w = front.wants.find((x) => x.type === m.userData.type && x.n > 0); if (!w) continue;
      c.stack.splice(i, 1); const from = m.getWorldPosition(new THREE.Vector3()); c.stackG.remove(m); w.n--; c.serveT = 0.16;
      this.flyItem(m, from, front.g, V(0, 0, front.height * 0.6), 0.25, (f) => this.scene.remove(f));
      this.sound.play('drop', 0.5, 1.2); this.renderBubble(front);
      if (front.wants.every((x) => x.n <= 0)) this.pay(front);
      return true;
    }
    return false;
  }
  pay(c) {
    c.state = 'paid'; c.payT = 0.7; this.renderBubble(c);
    let total = c.originalWants.reduce((s, w) => s + ITEMS[w.type].price * w.n, 0);
    const fast = c.waited < c.maxPatience * 0.4, tip = c.A.tip && fast ? Math.round(total * c.A.tip) : 0;
    total = Math.round((total + tip) * (this.state.unlocked.hall ? 1.5 : 1));
    this.state.sales++; const n = Math.min(14, Math.max(3, Math.ceil(total / 4)));
    for (let k = 0; k < n; k++) this.spawnCoin(c.g.position.clone().setY(1.4), Math.floor(total / n) + (k < total % n ? 1 : 0), k * 0.035);
    this.sound.play('fling', 0.7); if (tip) this.popText(c.g.position.clone().setY(c.height + 1), `+${tip} TIP!`, 'tip');
    const items = c.originalWants.reduce((s, w) => s + w.n, 0);
    if (items >= 3 || this.state.sales % 4 === 0) this.sound.voice('merchant_sale' + rnd(1, 3), 9000); else this.sound.play('sale', 0.35);
  }

  // ------------------------------------------------------------ coins
  spawnCoin(from, value, delay) {
    this.ensureCoinGeo(); const m = new THREE.Mesh(this.coinGeo, this.coinMat); m.castShadow = true; m.position.copy(from); m.visible = false; this.scene.add(m);
    const a = Math.random() * 6.28, r = Math.random() * 1.0, to = V(COIN_AREA.x + Math.cos(a) * r, COIN_AREA.z + Math.sin(a) * r, 0.03);
    this.coins.push({ m, value, from: from.clone(), to, t: -delay, dur: 0.55, landed: false, spin: Math.random() * 10 });
  }
  ensureCoinGeo() { if (!this.coinGeo) { this.coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14); this.coinMat = std(0xffc83a, { metalness: 0.9, roughness: 0.25, emissive: 0x7a4a00, emissiveIntensity: 0.35 }); } }
  updateCoins(dt) {
    const pp = this.player.g.position;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i]; c.t += dt; if (c.t < 0) continue; c.m.visible = true;
      if (!c.landed) {
        const k = Math.min(1, c.t / c.dur); c.m.position.lerpVectors(c.from, c.to, k); c.m.position.y += Math.sin(k * Math.PI) * 1.6; c.m.rotation.x += dt * 14;
        if (k >= 1) { c.landed = true; c.m.rotation.set(0, c.spin, 0); this.tween(c.m.position, { y: 0.25 }, 0.12, ease.outCubic, () => this.tween(c.m.position, { y: 0.03 }, 0.15, ease.outCubic)); }
        continue;
      }
      const d = c.m.position.distanceTo(V(pp.x, pp.z, 0.03));
      if (d < 2.8 || c.pulled) { // magnet: accelerate into the merchant
        c.pulled = true; c.vel = (c.vel || 0) + dt * 30; const to = V(pp.x, pp.z, 1.0), dir = to.clone().sub(c.m.position);
        if (dir.length() < 0.4) { this.scene.remove(c.m); this.coins.splice(i, 1); this.addGold(c.value, to); continue; }
        c.m.position.addScaledVector(dir.normalize(), Math.min(dir.length(), c.vel * dt)); c.m.rotation.y += dt * 12;
      } else c.m.rotation.y += dt * 1.2;
    }
  }
  addGold(v, at) {
    this.state.gold += v; this.state.earned += v; this.ui.setGold(this.state.gold, true); this.sound.play('coin', 0.45, 1 + Math.random() * 0.2);
    if (at) { this.popText(at.clone().setY(2.4), `+${v}`, 'gold'); this.burst(at, 0xffd23a, 6, 2.5, 0.12); }
    if (!this.state.m500 && this.state.gold >= 500) { this.state.m500 = true; this.ui.toast(t('milestone500')); this.bridge.happytime(); this.sound.play('unlock', 0.6); }
  }

  // ------------------------------------------------------------ unlock pads
  makePad(def) {
    if (this.state.unlocked[def.unlock]) return;
    const g = new THREE.Group(), pos = V(def.pos[0], def.pos[1]); g.position.copy(pos); g.visible = false; this.scene.add(g);
    const base = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.55, depthWrite: false })); base.rotation.x = -Math.PI / 2; base.position.y = 0.035; g.add(base);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.45, 48), glow(0xffd27a, 1.6)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    const fill = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.22, 48, 1, Math.PI / 2, 0.001), glow(0xffc83a, 1.2)); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.045; g.add(fill);
    const el = this.label(V(pos.x, pos.z, 0.6), '', 'pad');
    this.pads[def.id] = { def, g, fill, el, standT: 0, payAcc: 0, fxT: 0 };
    this.updatePadVisual(this.pads[def.id]);
  }
  updatePadVisual(p) {
    const paid = this.state.padPaid[p.def.id] || 0, k = Math.min(1, paid / p.def.cost);
    p.fill.geometry.dispose(); p.fill.geometry = new THREE.RingGeometry(0.2, 1.22, 48, 1, Math.PI / 2, Math.max(0.001, k * Math.PI * 2));
    p.el.innerHTML = `<img src="${this.assets.icon('coin') || ''}" alt="">${p.def.cost - paid}<small>${t('pad' + p.def.id)}${p.def.id === 'E' ? ' · ' + t('padE_desc') : ''}</small>`;
  }
  refreshPads() {
    for (const p of Object.values(this.pads)) {
      const show = p.def.after.every((id) => this.state.unlocked[PADS.find((x) => x.id === id).unlock]);
      if (show && !p.g.visible) { p.g.visible = true; p.g.scale.setScalar(0.01); this.tween(p.g.scale, { x: 1, y: 1, z: 1 }, 0.6, ease.outBack); }
      p.el.hidden = !show;
    }
  }
  updatePads(dt) {
    for (const p of Object.values(this.pads)) {
      if (!p.g.visible) continue;
      p.g.children[1].material.color.setScalar(1.3 + Math.sin(this.time * 4) * 0.3).multiply(new THREE.Color(0xffd27a));
      if (!this.near(this.player, p.g.position, 1.35) || this.state.gold <= 0) { p.standT = 0; continue; }
      p.standT += dt; if (p.standT < 0.3) continue;
      const left = p.def.cost - (this.state.padPaid[p.def.id] || 0), rate = Math.max(p.def.cost / 1.6, 30);
      p.payAcc += rate * dt; const pay = Math.min(left, this.state.gold, Math.floor(p.payAcc)); if (pay <= 0) continue;
      p.payAcc -= pay; this.state.gold -= pay; this.state.padPaid[p.def.id] = (this.state.padPaid[p.def.id] || 0) + pay; this.ui.setGold(this.state.gold, false);
      p.fxT -= dt; if (p.fxT <= 0) { p.fxT = 0.07; this.coinToPad(p); this.sound.play('padFill', 0.25, 0.8 + (1 - left / p.def.cost) * 0.8); }
      this.updatePadVisual(p);
      if (this.state.padPaid[p.def.id] >= p.def.cost) this.unlock(p);
    }
  }
  coinToPad(p) {
    this.ensureCoinGeo(); const m = new THREE.Mesh(this.coinGeo, this.coinMat); const from = this.player.g.position.clone().setY(1.6), to = p.g.position.clone().setY(0.1);
    this.scene.add(m); this.fx.push({ life: 0.3, max: 0.3, upd: (k) => { m.position.lerpVectors(to, from, k); m.position.y += Math.sin(k * Math.PI) * 0.8; }, end: () => this.scene.remove(m) });
  }
  unlock(p) {
    const id = p.def.unlock; this.state.unlocked[id] = true; delete this.pads[p.def.id];
    this.scene.remove(p.g); p.el.remove(); this.labels = this.labels.filter((l) => l.el !== p.el);
    const pos = V(p.def.pos[0], p.def.pos[1]);
    if (STATIONS[id]) this.makeStation(id, true); else if (id === 'desk') this.makeDesk(true); else if (id === 'golem') this.hireGolem(true); else if (id === 'hall') this.makeHall(true);
    this.shake = 0.5; this.sound.play('unlock', 0.8); this.sound.voice('merchant_unlock', 2000); this.burst(pos.clone().setY(0.6), 0xffd27a, 60, 6, 0.22);
    this.ui.toast(`${t('pad' + p.def.id)} — ${t('unlocked')}`); this.bridge.happytime(); this.refreshPads(); this.save();
    if (id === 'hall') this.ui.victory?.(); else if (p.def.major) this.ui.midgame?.();
  }

  // ------------------------------------------------------------ upgrade desk & hall
  makeDesk(animate) {
    const pos = V(6, -9.8), g = new THREE.Group(); g.position.copy(pos); this.scene.add(g);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1.1), std(0x6a3a1a)); top.position.y = 1.0; top.castShadow = true; g.add(top);
    for (const x of [-0.9, 0.9]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.9), std(0x4a2a12)); l.position.set(x, 0.5, 0); l.castShadow = true; g.add(l); }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9fffb0, emissive: 0x3aff7a, emissiveIntensity: 1.8 })); orb.position.set(0.5, 1.35, 0); g.add(orb); this.deskOrb = orb;
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), std(0xf2e8d0)); scroll.rotation.z = Math.PI / 2; scroll.position.set(-0.4, 1.15, 0); g.add(scroll);
    this.deskZone = V(pos.x, pos.z + 1.8); this.groundRune(this.deskZone, 1.3, '#9fffb0', 0.6); this.colliders.push({ p: pos, r: 1.3 });
    this.label(V(pos.x, pos.z, 2.4), 'padD', 'small');
    if (animate) { g.scale.setScalar(0.01); this.tween(g.scale, { x: 1, y: 1, z: 1 }, 0.8, ease.outBack); }
  }
  makeHall(animate) {
    const pos = V(0, -12.2), g = new THREE.Group(); g.position.copy(pos); this.scene.add(g);
    const gold = std(0xd9b25e, { metalness: 0.9, roughness: 0.25 });
    for (const x of [-2.2, 2.2]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 4, 12), std(0xe8e2d6)); c.position.set(x, 2, 0); c.castShadow = true; g.add(c); }
    const arch = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.6, 0.9), gold); arch.position.y = 4.2; arch.castShadow = true; g.add(arch);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), std(0x2a56a8, { side: THREE.DoubleSide, emissive: 0x0a1a40 })); banner.position.set(0, 2.6, 0); g.add(banner);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 8, 16), glow(0xffd27a, 2)); crown.position.set(0, 2.9, 0.05); g.add(crown);
    if (animate) { g.scale.setScalar(0.01); this.tween(g.scale, { x: 1, y: 1, z: 1 }, 1.0, ease.outBack); }
  }
  upgradeInfo() { return Object.entries(UPGRADES).map(([k, u]) => ({ key: k, lv: this.state.upg[k], max: u.max, cost: this.state.upg[k] >= u.max ? null : upgradeCost(this.state.upg[k]) })); }
  buyUpgrade(key) {
    const u = UPGRADES[key], lv = this.state.upg[key]; if (lv >= u.max) return false; const cost = upgradeCost(lv);
    if (this.state.gold < cost) return false;
    this.state.gold -= cost; this.state.upg[key]++; this.ui.setGold(this.state.gold, false); this.sound.play('upgrade', 0.8); this.shake = 0.2;
    this.burst(this.player.g.position.clone().setY(1), 0x9fffb0, 30, 4); this.save(); return true;
  }

  // ------------------------------------------------------------ assistant golems (AI workers)
  hireGolem(animate, master = false) {
    const home = master ? V(8.5, -1) : V(9.5, 2.2);
    const w = this.makeCarrier('golem', home.clone(), { color: master ? 0xd9b25e : 0x7a7670, scale: master ? 1.0 : 0.85, height: 2.1 });
    Object.assign(w, { home, master, task: 'idle', wait: 1, life: master ? 90 : Infinity, speed: master ? 5.2 : 3.6, bounded: true });
    w.cap = () => (master ? 5 : 3);
    if (master) w.body.traverse?.((m) => m.isMesh && m.material?.emissive && (m.material = m.material.clone(), m.material.emissive.set(0x6a4a00)));
    if (animate) { w.g.scale.setScalar(0.01); this.tween(w.g.scale, { x: 1, y: 1, z: 1 }, 0.7, ease.outBack); this.burst(home.clone().setY(1), master ? 0xffd27a : 0xaaaaaa, 40, 5); }
    this.workers.push(w); return w;
  }
  demanded() { // item types the queue still needs, minus what carriers already hold
    const need = {}; for (const c of this.customers) if (c.state === 'wait' || c.state === 'arrive') for (const w of c.wants) need[w.type] = (need[w.type] || 0) + w.n;
    for (const w of [this.player, ...this.workers]) for (const m of w.stack) need[m.userData.type] = (need[m.userData.type] || 0) - 1;
    return new Set(Object.keys(need).filter((k) => need[k] > 0));
  }
  updateWorkers(dt) {
    for (let i = this.workers.length - 1; i >= 0; i--) {
      const w = this.workers[i]; let goal = null;
      if (w.master) { w.life -= dt; if (w.life <= 0) { this.burst(w.g.position.clone().setY(1), 0xffd27a, 40); this.scene.remove(w.g); w.removed = true; this.workers.splice(i, 1); this.ui.golemTimer(0); continue; } this.ui.golemTimer(w.life); }
      const need = this.demanded();
      if (w.task === 'idle') { w.wait -= dt; if (w.wait <= 0) { w.wait = 0.8; const st = Object.values(this.stations).find((s) => s.rack.length && (need.has(s.d.item) || !need.size)); if (st && need.size) { w.task = 'fetch'; w.target = st; } } goal = w.home; }
      if (w.task === 'fetch') {
        goal = w.target.rackPos;
        if (this.near(w, goal, 1.2)) { const want = new Set([...need, ...w.stack.map((m) => m.userData.type)]); this.pickFromRacks(w, dt, want);
          if (w.stack.length >= w.cap() || !w.target.rack.length || !need.has(w.target.d.item)) { const next = Object.values(this.stations).find((s) => s.rack.length && need.has(s.d.item) && s !== w.target);
            if (next && w.stack.length < w.cap()) w.target = next; else { w.task = w.stack.length ? 'deliver' : 'idle'; w.deliverT = 0; } } }
      }
      if (w.task === 'deliver') {
        goal = SERVE.clone().add(V(this.near(this.player, SERVE, 1.2) ? 1.2 : 0, -0.3));
        if (this.near(w, SERVE, 1.5)) { if (!this.serve(w, dt)) w.deliverT += dt; else w.deliverT = 0;
          if (!w.stack.length) w.task = 'idle'; else if (w.deliverT > 5) w.task = 'trash'; }
      }
      if (w.task === 'trash') { goal = TRASH.clone().add(V(0, -1)); if (this.near(w, TRASH, 1.9)) { this.trash(w); w.task = 'idle'; } }
      let dir = V(0, 0), speed = 0;
      if (goal) { const d = goal.clone().sub(w.g.position).setY(0); if (d.length() > 0.3) { dir = d.normalize(); speed = w.speed * (this.frenzy > 0 ? 1.5 : 1); } }
      this.moveCarrier(w, dir, speed, dt); this.animateCarrier(w, dt, w.vel.length());
      if (speed && Math.random() < dt * 2.5 && this.near(this.player, w.g.position, 8)) this.sound.play('golemStep', 0.15);
    }
  }
  trash(c) { // recycle cauldron: drop everything (gets carriers unstuck)
    if (!c.stack.length) return;
    for (const m of c.stack) { const from = m.getWorldPosition(new THREE.Vector3()); c.stackG.remove(m); this.flyItem(m, from, this.scene, TRASH.clone().setY(0.8), 0.3, (f) => { this.scene.remove(f); this.burst(TRASH.clone().setY(0.9), 0x6aff9a, 6, 2, 0.12); }); }
    c.stack = []; this.sound.play('trash', 0.5);
  }

  // ------------------------------------------------------------ boosts (rewarded ads)
  startFrenzy(sec = 60) { this.frenzy = sec; this.sound.play('frenzy', 0.9); this.ui.toast(t('frenzyOn')); this.burst(this.player.g.position.clone().setY(1), 0x7fd4ff, 50, 6); }

  // ------------------------------------------------------------ fx / tweens / text
  tween(obj, to, dur, fn = ease.outCubic, done) { const from = {}; for (const k in to) from[k] = obj[k]; this.tweens.push({ obj, from, to, dur, t: 0, fn, done }); }
  updateTweens(dt) { for (let i = this.tweens.length - 1; i >= 0; i--) { const w = this.tweens[i]; w.t += dt; const k = Math.min(1, w.t / w.dur), e = w.fn(k); for (const p in w.to) w.obj[p] = w.from[p] + (w.to[p] - w.from[p]) * e; if (k >= 1) { this.tweens.splice(i, 1); w.done?.(); } } }
  burst(pos, color, n = 24, speed = 5, size = 0.16) {
    const geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { arr.set([pos.x, pos.y, pos.z], i * 3); const a = Math.random() * 6.28; vel.push([Math.cos(a) * speed * Math.random(), speed * (0.5 + Math.random()), Math.sin(a) * speed * Math.random()]); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(2), size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(pts);
    this.fx.push({ life: 0.9, max: 0.9, upd: (k, dt) => { const a = geo.attributes.position.array; for (let i = 0; i < n; i++) { vel[i][1] -= 12 * dt; for (let c = 0; c < 3; c++) a[i * 3 + c] += vel[i][c] * dt; } geo.attributes.position.needsUpdate = true; pts.material.opacity = k; },
      end: () => { this.scene.remove(pts); geo.dispose(); pts.material.dispose(); } });
  }
  updateFx(dt) { for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.life -= dt; f.upd(Math.max(0, f.life / f.max), dt); if (f.life <= 0) { f.end?.(); this.fx.splice(i, 1); } } }
  popText(pos, text, cls = '') { const p = this.project(pos); if (!p.vis) return; const d = document.createElement('div'); d.className = 'splat ' + cls; d.textContent = text; d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; this.ui.labels.appendChild(d); setTimeout(() => d.remove(), 1000); }
  updateLabels() {
    for (const l of this.labels || []) { if (l.el.hidden) continue; const p = this.project(l.pos); l.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; }
    for (const c of this.customers) { const p = this.project(c.g.position.clone().setY(c.height + 1.1)); c.bubble.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`; }
    const pp = this.project(this.player.g.position.clone().setY(this.player.height + 0.4 + this.stackTopLocal(this.player).y));
    this.ui.stackBadge(pp, this.player.stack.length, this.player.cap());
  }

  // ------------------------------------------------------------ input
  setupInput() {
    addEventListener('keydown', (e) => { this.keys[e.code] = true; if (/^(Arrow|Key[WASD])/.test(e.code)) this.firstInput(); });
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    addEventListener('blur', () => (this.keys = {}));
    // floating joystick: appears wherever the finger (or mouse) lands on the play field
    const joy = this.ui.joy, knob = joy.firstElementChild; let id = null, ox = 0, oy = 0;
    this.canvas.addEventListener('pointerdown', (e) => { if (this.paused) return; id = e.pointerId; ox = e.clientX; oy = e.clientY; this.canvas.setPointerCapture(id); joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; joy.hidden = false; knob.style.transform = ''; this.firstInput(); this.sound.unlock(); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return; let dx = e.clientX - ox, dy = e.clientY - oy; const r = 55, l = Math.hypot(dx, dy);
      if (l > r) { ox += (dx / l) * (l - r); oy += (dy / l) * (l - r); joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; dx = e.clientX - ox; dy = e.clientY - oy; } // base follows the thumb
      knob.style.transform = `translate(${dx}px,${dy}px)`; this.joyVec = { x: dx / r, y: dy / r };
    });
    const up = (e) => { if (e.pointerId !== id) return; id = null; joy.hidden = true; this.joyVec = null; };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
  }
  firstInput() { if (!this.paused) this.bridge.gameplayStart(); }
  inputDir() {
    let sx = 0, sy = 0; const k = this.keys;
    if (k.KeyW || k.ArrowUp) sy -= 1; if (k.KeyS || k.ArrowDown) sy += 1; if (k.KeyA || k.ArrowLeft) sx -= 1; if (k.KeyD || k.ArrowRight) sx += 1;
    if (this.joyVec) { sx += this.joyVec.x; sy += this.joyVec.y; }
    const l = Math.hypot(sx, sy); if (l < 0.12) return V(0, 0); const m = Math.min(1, l);
    // screen → world for the 45° camera: up-screen points away from the camera
    const fwd = V(-Math.sin(this.camYaw), -Math.cos(this.camYaw)), right = V(Math.cos(this.camYaw), -Math.sin(this.camYaw));
    return right.multiplyScalar(sx / l).add(fwd.multiplyScalar(-sy / l)).normalize().multiplyScalar(m);
  }

  // ------------------------------------------------------------ main loop
  pause() { this.paused = true; this.keys = {}; this.joyVec = null; this.ui.joy.hidden = true; this.bridge.gameplayStop(); this.save(); }
  resume() { this.paused = false; this.clock.getDelta(); }
  save() { const s = { ...this.state }; this.bridge.save('sanctuary_save', s); }
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) this.update(dt);
    this.placeCamera(dt); this.composer.render(dt); this.updateLabels();
  }
  update(dt) {
    this.time += dt; this.shake = Math.max(0, this.shake - dt * 1.5); if (this.frenzy > 0) { this.frenzy -= dt; this.ui.frenzyTimer(this.frenzy); }
    const P = this.player, dir = this.inputDir(), speed = BASE_SPEED * (1 + this.state.upg.speed * UPGRADES.speed.step) * (this.frenzy > 0 ? 2 : 1) * dir.length();
    P.bounded = true; this.moveCarrier(P, dir.lengthSq() ? dir.clone().normalize() : dir, speed, dt); this.animateCarrier(P, dt, P.vel.length());
    if (P.stack.length >= P.cap() && Object.values(this.stations).some((s) => s.rack.length && this.near(P, s.rackPos, 1.35)) && !this.fullWarned) { this.fullWarned = true; this.popText(P.g.position.clone().setY(P.height + 1.5), t('full'), 'warn'); }
    if (P.stack.length < P.cap()) this.fullWarned = false;
    this.pickFromRacks(P, dt); this.serve(P, dt); if (this.near(P, TRASH, 1.9)) this.trash(P);
    this.ui.showUpgrades(!!this.deskZone && this.near(P, this.deskZone, 1.4));
    this.updateStations(dt); this.updateCustomers(dt); this.updateWorkers(dt); this.updateCoins(dt); this.updatePads(dt);
    this.updateFly(dt); this.updateTweens(dt); this.updateFx(dt);
    this.crystal.rotation.y += dt; this.crystal.position.y = 2.3 + Math.sin(this.time * 1.6) * 0.15;
    for (const f of this.flames) { f.scale.y = 1 + Math.sin(this.time * 12 + f.position.x) * 0.15; if (f.userData.light) f.userData.light.intensity = 16 + Math.sin(this.time * 11 + f.position.z) * 3; }
    for (const r of this.runes || []) r.rotation.z += dt * 0.15;
    if (this.deskOrb) this.deskOrb.position.y = 1.35 + Math.sin(this.time * 2) * 0.08;
  }
}
