// Wolf Pack Run: a 3D crowd runner. Steer a wolf pack through number gates, dodge spikes and saws, overrun rival packs
// and bring enough wolves to topple the Stone Warden at the end of the road.
// Sections: CONFIG, I18N, SDK, AUDIO, ASSETS, WORLD, WOLF CROWDS (baked instanced animation), LEVELS, INPUT, STATE,
// GAMEPLAY, LOOP, BOOT. Static bundle: no API keys, no backend calls. Missing models fall back to primitives.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = 'wolf-pack-run';
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot plays by itself (trailer footage, balance tests)

const ROAD_HALF = 5, SPEED = 10, MAX_SHOWN = 170, ENEMY_SHOWN = 90, FRAMES = 8, WOLF_H = 1.05, SPACING = 0.5, PACK_CAP = 999;
const UPGRADES = [ // permanent shop
  { id: 'pack', max: 15, base: 40, mult: 1.55 }, { id: 'income', max: 10, base: 60, mult: 1.6 }, { id: 'power', max: 10, base: 50, mult: 1.6 },
];
const upgCost = (u, lvl) => Math.round(u.base * Math.pow(u.mult, lvl));
const ASSETS = {
  models: {
    wolf: { files: { walk: 'assets/models/mob_wolf@walk.glb' } },
    golem: { files: { walk: 'assets/models/mob_golem@walk.glb', slash: 'assets/models/mob_golem@slash.glb' }, height: 7.5, yaw: -90 },
    tree: { files: { base: 'assets/models/prop_tree.glb' }, height: 7 },
    rock: { files: { base: 'assets/models/prop_rock.glb' }, height: 1.6 },
  },
  sfx: {
    howl: 'assets/audio/pack_howl.mp3', good: 'assets/audio/gate_good.mp3', bad: 'assets/audio/gate_bad.mp3', saw: 'assets/audio/saw_whoosh.mp3',
    growl: 'assets/audio/wolf_growl.mp3', die: 'assets/audio/wolf_death.mp3', roar: 'assets/audio/golem_roar.mp3', step: 'assets/audio/golem_step.mp3',
    hit: 'assets/audio/hit.mp3', boom: 'assets/audio/explosion.mp3', coin: 'assets/audio/coin.mp3', pop: 'assets/audio/pop.mp3',
    upgrade: 'assets/audio/upgrade.mp3', win: 'assets/audio/victory.mp3', lose: 'assets/audio/defeat.mp3', click: 'assets/audio/ui_click.mp3',
  },
  music: { run: 'assets/audio/bgm_wolf_run.mp3', menu: 'assets/audio/bgm_menu.mp3' },
};

// ================================================================ I18N (English required; Turkish included)
const STRINGS = {
  en: {
    level: 'Level', play: 'Play', paused: 'Paused', resume: 'Resume', restart: 'Restart', menu: 'Menu', drag: 'Drag to steer',
    win: 'The Warden falls!', lost: 'Pack lost!', next: 'Next level', retry: 'Try again', upgrades: 'Upgrades', double: '▶ Double coins',
    boss: 'Stone Warden', winInfo: '{n} wolves made it home', loseInfo: 'You reached {p}% of the road', bossLeft: 'The Warden had {n} HP left',
    hintDesktop: 'Drag with the mouse or use A/D, ←/→ to steer · Esc to pause', hintTouch: 'Drag left and right to steer your pack',
    noGold: 'Not enough coins', adUnavailable: 'Ad not available right now', doubled: 'Coins doubled!', max: 'MAX', lvl: 'Lv {n}', fight: 'FIGHT!',
    up: { pack: ['Bigger Pack', '+2 starting wolves'], income: ['Hunter\'s Purse', '+15% coins'], power: ['Sharp Fangs', '+15% boss damage'] },
  },
  tr: {
    level: 'Seviye', play: 'Oyna', paused: 'Duraklatıldı', resume: 'Devam', restart: 'Baştan', menu: 'Menü', drag: 'Yönlendirmek için sürükle',
    win: 'Gardiyan devrildi!', lost: 'Sürü kayboldu!', next: 'Sonraki seviye', retry: 'Tekrar dene', upgrades: 'Geliştirmeler', double: '▶ Altınları ikiye katla',
    boss: 'Taş Gardiyan', winInfo: '{n} kurt eve döndü', loseInfo: 'Yolun %{p} kadarına ulaştın', bossLeft: 'Gardiyanın {n} canı kalmıştı',
    hintDesktop: 'Fareyle sürükle ya da A/D, ←/→ ile yönlendir · Esc ile duraklat', hintTouch: 'Sürünü yönlendirmek için sağa sola sürükle',
    noGold: 'Yeterli altın yok', adUnavailable: 'Şu anda reklam yok', doubled: 'Altınlar ikiye katlandı!', max: 'MAKS', lvl: 'Sv {n}', fight: 'SAVAŞ!',
    up: { pack: ['Büyük Sürü', '+2 başlangıç kurdu'], income: ['Avcı Kesesi', '+%15 altın'], power: ['Keskin Dişler', '+%15 boss hasarı'] },
  },
};
let lang = 'en';
const L = () => STRINGS[lang] || STRINGS.en;
const t = (k, vars) => { let s = L()[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }

// ================================================================ SDK (CrazyGames v3; every call is a safe no-op off-platform)
let crazySdk = null, sdkEnv = 'disabled', gameplayActive = false, adsFailed = false;

async function initCrazySDK() {
  // CrazyGames always embeds games in an iframe. Standalone (our own site, other hosts) the SDK is "disabled":
  // init() takes ~7 s and most getters throw, so skip it there. localhost and ?useLocalSdk keep the SDK's local test mode.
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const sdkHost = embedded || ['localhost', '127.0.0.1'].includes(location.hostname) || params.has('useLocalSdk');
  try {
    if (window.CrazyGames?.SDK && sdkHost) {
      await window.CrazyGames.SDK.init(); // resolves to undefined: the SDK object itself is window.CrazyGames.SDK
      crazySdk = window.CrazyGames.SDK; sdkEnv = crazySdk.environment; // 'crazygames' | 'local' | 'disabled'
    }
  } catch (err) { console.warn('CrazyGames SDK unavailable (running outside CrazyGames?)', err); crazySdk = null; }
  const settings = sdkReady() && crazySdk.game?.settings;
  if (settings) { applySdkSettings(settings); crazySdk.game.addSettingsChangeListener?.(applySdkSettings); }
}
const sdkReady = () => !!crazySdk && sdkEnv !== 'disabled';
const adsAvailable = () => sdkReady() && !adsFailed && !!crazySdk.ad && !CAPTURE;
function sdkCall(fn) { if (!sdkReady()) return; try { fn(crazySdk); } catch (e) { console.warn('[CrazyGames]', e); } }
function sdkLocale() { if (!sdkReady()) return null; try { return crazySdk.user?.systemInfo?.locale || null; } catch { return null; } }
function applySdkSettings(s) { if (s?.muteAudio) muteAudio('sdk'); else unmuteAudio('sdk'); } // platform mute overrides everything

function onGameplayStart() { if (gameplayActive) return; gameplayActive = true; sdkCall((s) => s.game.gameplayStart()); }
function onGameplayStop() { if (!gameplayActive) return; gameplayActive = false; sdkCall((s) => s.game.gameplayStop()); }
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: toppling the Warden with a huge pack

// Midgame: only between levels ("Next level"), never on navigation buttons; mute on adStarted; always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, only on the win screen, reward only on adFinished; hidden for the session after an error.
function triggerRewardedAd(onRewardGranted, onClosed) {
  if (!adsAvailable()) { toast(t('adUnavailable')); onClosed?.(); return; }
  blockUI(true);
  const end = () => { unmuteAudio('ad'); blockUI(false); };
  try {
    crazySdk.ad.requestAd('rewarded', {
      adStarted: () => muteAudio('ad'),
      adFinished: () => { end(); onRewardGranted?.(); },
      adError: () => { end(); adsFailed = true; toast(t('adUnavailable')); onClosed?.(); },
    });
  } catch { end(); onClosed?.(); }
}

function saveData(key, value) { // CrazyGames cloud data when available, mirrored to localStorage
  if (CAPTURE) return;
  const v = JSON.stringify(value);
  if (sdkReady() && crazySdk.data) try { crazySdk.data.setItem(key, v); } catch {}
  try { localStorage.setItem(key, v); } catch {}
}
function loadData(key, fallback) {
  let v = null;
  if (sdkReady() && crazySdk.data) try { v = crazySdk.data.getItem(key); } catch {}
  if (v == null) try { v = localStorage.getItem(key); } catch {}
  try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}

// ================================================================ AUDIO (Web Audio SFX + synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  howl: ['sine', 300, 700, 1.2, 0.12], good: ['sine', 600, 1500, 0.3, 0.12], bad: ['sawtooth', 400, 150, 0.3, 0.1], saw: ['sawtooth', 200, 400, 0.3, 0.06],
  growl: ['sawtooth', 140, 90, 0.3, 0.08], die: ['sawtooth', 500, 150, 0.15, 0.05], roar: ['sawtooth', 120, 50, 0.9, 0.15], step: ['sine', 80, 40, 0.3, 0.15],
  hit: ['square', 220, 90, 0.06, 0.05], boom: ['sawtooth', 160, 40, 0.5, 0.14], coin: ['square', 1320, 1980, 0.08, 0.05], pop: ['sine', 520, 980, 0.07, 0.1],
  upgrade: ['sine', 500, 1500, 0.35, 0.12], win: ['triangle', 520, 1300, 0.7, 0.14], lose: ['triangle', 440, 110, 0.8, 0.16], click: ['square', 900, 900, 0.03, 0.06],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0, last: {} };
function initAudio() {
  try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.master = audio.ctx.createGain(); audio.master.connect(audio.ctx.destination); }
  catch { audio.ctx = null; }
}
async function loadSfx(key, url) {
  if (!audio.ctx) return;
  try { const r = await fetch(url); if (r.ok) audio.buffers[key] = await audio.ctx.decodeAudioData(await r.arrayBuffer()); } catch {}
}
function unlockAudio() {
  if (audio.ctx?.state === 'suspended') audio.ctx.resume();
  if (audio.wantMusic && audio.music?.paused && !audio.muted.size && !CAPTURE) audio.music.play().catch(() => {});
}
function playSfx(key, vol = 1, minGap = 0.05) {
  if (audio.muted.size || !audio.ctx || audio.voices > 16 || CAPTURE) return;
  const now = audio.ctx.currentTime; if (now - (audio.last[key] || 0) < minGap) return; audio.last[key] = now;
  const b = audio.buffers[key], g = audio.ctx.createGain();
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.93 + Math.random() * 0.14; g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function playMusic(key) {
  audio.wantMusic = true;
  if (audio.musicKey !== key) {
    audio.music?.pause(); audio.musicKey = key; audio.music = null;
    if (ASSETS.music[key]) { audio.music = new Audio(ASSETS.music[key]); audio.music.loop = true; audio.music.volume = 0.32; audio.music.onerror = () => { audio.music = null; }; }
  }
  if (audio.music && !audio.muted.size && !CAPTURE) audio.music.play().catch(() => {});
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic && !CAPTURE) audio.music.play().catch(() => {}); }
}

// ================================================================ ASSETS
const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
const models = {};
const $ = (id) => document.getElementById(id);
let loadTotal = 0, loadDone = 0;
function track(p) { loadTotal++; return p.finally(() => { loadDone++; $('loadBar').style.width = `${(100 * loadDone) / loadTotal}%`; }); }
async function loadModel(id) {
  const def = ASSETS.models[id], clips = {}; let scene = null, first = null;
  await Promise.all(Object.entries(def.files).map(async ([clip, url], i) => {
    try { const g = await gltf.loadAsync(url); if (i === 0) first = g.scene; scene ??= g.scene; if (clip !== 'base' && g.animations[0]) clips[clip] = g.animations[0]; } catch {}
  }));
  scene = first || scene; if (!scene) return;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  for (const c of Object.values(clips)) stripRootMotion(c, scene);
  models[id] = { scene, clips, def };
}
function instance(id, fallback) {
  const a = models[id];
  if (!a) return fallback();
  const inner = SkeletonUtils.clone(a.scene);
  if (!a.fit) { const probe = SkeletonUtils.clone(a.scene); probe.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(probe, true); const s = a.def.height / Math.max(0.01, b.max.y - b.min.y); a.fit = { s, oy: b.min.y * s }; }
  inner.scale.multiplyScalar(a.fit.s); inner.position.y -= a.fit.oy; inner.rotation.y = THREE.MathUtils.degToRad(a.def.yaw ?? 0);
  const g = new THREE.Group(); g.add(inner);
  if (Object.keys(a.clips).length) {
    const mixer = new THREE.AnimationMixer(inner), actions = {};
    for (const [k, c] of Object.entries(a.clips)) actions[k] = mixer.clipAction(c);
    g.userData.mixer = mixer; g.userData.actions = actions;
  }
  return g;
}
function playClip(obj, name, fade = 0.2) {
  const next = obj.userData.actions?.[name];
  if (!next || obj.userData.current === next) return;
  next.reset().fadeIn(fade).play(); obj.userData.current?.fadeOut(fade); obj.userData.current = next;
}
function stripRootMotion(clip, root) { // Tripo3D clips walk the hip bone forward: remove the drift so characters animate in place
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.position')) continue;
    const bone = root.getObjectByName(tr.name.slice(0, -9)), v = tr.values, tm = tr.times, n = tm.length;
    if (!bone || n < 3) continue;
    const T = tm[n - 1] - tm[0] || 1;
    for (let c = 0; c < 3; c++) {
      const drift = v[(n - 1) * 3 + c] - v[c]; let mean = 0;
      for (let i = 0; i < n; i++) { v[i * 3 + c] -= (drift * (tm[i] - tm[0])) / T; mean += v[i * 3 + c] / n; }
      const off = mean - bone.position.getComponent(c);
      if (Math.abs(off) > 0.12) for (let i = 0; i < n; i++) v[i * 3 + c] -= off;
    }
  }
}

// ================================================================ WORLD
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#8fd0ff'); scene.fog = new THREE.Fog('#8fd0ff', 45, 110);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
let shakeAmt = 0;
const rand = (a, b) => a + Math.random() * (b - a);
scene.add(new THREE.HemisphereLight('#ffffff', '#5a7a3a', 1.5));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 20, bottom: -20, far: 80 }); sun.shadow.bias = -0.0006; scene.add(sun, sun.target);
const grass = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#6aa84f', roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
const roadTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#c9a46a'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${120 + Math.random() * 60},${90 + Math.random() * 40},${50 + Math.random() * 30},.35)`; x.fillRect(Math.random() * 128, Math.random() * 256, 3 + Math.random() * 6, 3 + Math.random() * 6); }
  x.fillStyle = '#8e6f45'; x.fillRect(0, 0, 6, 256); x.fillRect(122, 0, 6, 256);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return tx;
})();
let road = null;
const trees = [], TREE_ROWS = 26, TREE_GAP = 9;
function buildScenery() {
  for (let i = 0; i < TREE_ROWS * 2; i++) {
    const side = i % 2 ? 1 : -1, obj = Math.random() < 0.82 ? instance('tree', fallbackTree) : instance('rock', fallbackRock);
    obj.position.set(side * rand(ROAD_HALF + 3, ROAD_HALF + 13), 0, -Math.floor(i / 2) * TREE_GAP + rand(-3, 3) + 20); obj.rotation.y = rand(0, 6.3); obj.scale.multiplyScalar(rand(0.8, 1.25));
    obj.userData.side = side; scene.add(obj); trees.push(obj);
  }
}
const fallbackTree = () => { const g = new THREE.Group(), t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2), new THREE.MeshStandardMaterial({ color: '#7a5230' })); t1.position.y = 1; const t2 = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 8), new THREE.MeshStandardMaterial({ color: '#2e7d32', flatShading: true })); t2.position.y = 4.2; t1.castShadow = t2.castShadow = true; g.add(t1, t2); return g; };
const fallbackRock = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: '#8d8d8d', flatShading: true })); m.position.y = 0.6; g.add(m); return g; };
const fallbackGolem = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5), new THREE.MeshStandardMaterial({ color: '#8a8378', flatShading: true })); m.position.y = 3.5; m.castShadow = true; g.add(m); return g; };

const particles = [], pGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
function burst(pos, color, n = 6, speed = 3) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { if (particles.length > 300) return; p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial()); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material.color.set(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.4 + Math.random() * 0.3;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 1.2, (Math.random() - 0.5) * speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 10 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 2.4));
  }
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
function floatText(pos, text, cls = '') {
  const p = pos.clone().project(camera); if (p.z > 1) return;
  const el = document.createElement('div'); el.className = `float ${cls}`; el.textContent = text;
  el.style.left = `${((p.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - p.y) / 2) * innerHeight}px`; $('fx').appendChild(el); setTimeout(() => el.remove(), 900);
}

// ================================================================ WOLF CROWDS (skinned run cycle baked into FRAMES static poses, drawn instanced)
const crowd = { frames: [], packMeshes: [], foeMeshes: [] }; // frames[f] = [{ geo, mat }]
function bakeWolf() {
  const a = models.wolf, clip = a?.clips.walk;
  if (!a || !clip) { // fallback: a box wolf with a bobbing pose per frame
    for (let f = 0; f < FRAMES; f++) { const g = new THREE.BoxGeometry(0.4, 0.5, 1.0); g.translate(0, 0.5 + Math.sin((f / FRAMES) * Math.PI * 2) * 0.08, 0); crowd.frames.push([{ geo: g, mat: new THREE.MeshStandardMaterial({ color: '#7d8088' }) }]); }
    return;
  }
  const root = SkeletonUtils.clone(a.scene), mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play();
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const v = new THREE.Vector3(), raw = [];
  for (let f = 0; f < FRAMES; f++) {
    mixer.setTime((clip.duration * f) / FRAMES); root.updateMatrixWorld(true);
    raw.push(meshes.map((m) => {
      const src = m.geometry, n = src.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv); if (src.index) g.setIndex(src.index);
      return { geo: g, mat: m.material };
    }));
  }
  const box = new THREE.Box3(); for (const p of raw[0]) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const s = WOLF_H / Math.max(0.01, box.max.y - box.min.y), c = box.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  for (const frame of raw) for (const p of frame) { p.geo.applyMatrix4(fit); p.geo.computeVertexNormals(); }
  crowd.frames = raw;
}
function makeCrowdMeshes() {
  const foeMat = new Map();
  const make = (cap, team) => crowd.frames.map((frame) => frame.map((p) => {
    let mat = p.mat;
    if (team === 'foe') { if (!foeMat.has(p.mat)) { const m = p.mat.clone(); m.color = new THREE.Color('#ff6a5a'); m.emissive = new THREE.Color('#5a0a05'); foeMat.set(p.mat, m); } mat = foeMat.get(p.mat); }
    const im = new THREE.InstancedMesh(p.geo, mat, cap); im.count = 0; im.castShadow = team === 'pack'; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im;
  }));
  crowd.packMeshes = make(MAX_SHOWN, 'pack'); crowd.foeMeshes = make(ENEMY_SHOWN, 'foe');
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
function drawCrowd(meshes, list, yaw, clock, running) {
  for (const frame of meshes) for (const im of frame) im.count = 0;
  for (const w of list) {
    const f = running ? Math.floor((clock * 2.6 + w.phase) * FRAMES) % FRAMES : Math.floor(w.phase * FRAMES) % FRAMES;
    _p.set(w.x, w.y || 0, w.z); _q.setFromAxisAngle(_y, yaw + (w.turn || 0)); _s.setScalar(w.scale ?? 1); _m.compose(_p, _q, _s);
    for (const im of meshes[f]) { if (im.count < im.instanceMatrix.count) { im.setMatrixAt(im.count, _m); im.count++; } }
  }
  for (const frame of meshes) for (const im of frame) im.instanceMatrix.needsUpdate = true;
}
const slot = (i) => { const r = SPACING * Math.sqrt(i + 0.5), a = i * 2.39996; return { x: r * Math.cos(a), z: r * Math.sin(a) * 1.15 }; };
const radiusOf = (n) => SPACING * Math.sqrt(Math.min(n, MAX_SHOWN) + 0.5) + 0.3;

// ================================================================ LEVELS (seeded; boss HP derived from the best possible gate path)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t2 = Math.imul(a ^ (a >>> 15), 1 | a); t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2; return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; }; }
const applyOp = (n, g) => Math.max(0, Math.min(PACK_CAP, g.op === '+' ? n + g.v : g.op === '-' ? n - g.v : g.op === 'x' ? n * g.v : Math.floor(n / g.v)));
const opLabel = (g) => (g.op === 'x' ? `×${g.v}` : g.op === '/' ? `÷${g.v}` : `${g.op}${g.v}`);
const isGood = (g) => g.op === '+' || g.op === 'x';
function genLevel(n, startPack) {
  const R = rng(n * 7919 + 3), len = Math.min(430, 180 + n * 22), events = [];
  let best = startPack, z = -30;
  const goodGate = () => (R() < 0.3 + Math.min(0.15, n * 0.01) ? { op: 'x', v: n > 4 && R() < 0.2 ? 3 : 2 } : { op: '+', v: Math.round(5 + R() * 10 + n * 1.5) });
  const badGate = () => (R() < 0.3 ? { op: '/', v: 2 } : { op: '-', v: Math.round(4 + R() * 8 + n * 1.2) });
  while (z > -(len - 35)) {
    const r = R();
    if (r < 0.5 || (n === 1 && r < 0.75) || !events.length || (r >= 0.78 && best < 12)) { // open with gates; no rival packs until the pack can afford one
      const good = goodGate(), other = R() < 0.65 ? badGate() : goodGate(), left = R() < 0.5;
      const gates = left ? [good, other] : [other, good];
      events.push({ type: 'gates', z, gates }); best = Math.max(applyOp(best, gates[0]), applyOp(best, gates[1]));
    } else if (r < 0.78) {
      events.push(R() < 0.55 ? { type: 'spikes', z, side: R() < 0.5 ? -1 : 1 } : { type: 'saw', z, phase: R() * 6.28, speed: 1.4 + R() * 0.8 });
      if (radiusOf(best) > ROAD_HALF * 0.55) best = Math.round(best * 0.75); // a pack wider than half the road cannot fully dodge
    } else {
      const size = Math.min(best - 4, Math.max(3, Math.round(best * (0.18 + R() * 0.14 + Math.min(0.12, n * 0.008))))); events.push({ type: 'foes', z, n: size }); best -= size;
    }
    if (R() < 0.6) events.push({ type: 'coins', z: z - 11, x: R() * 6 - 3 });
    z -= 22 + R() * 8;
  }
  const bossHp = Math.max(8, Math.round(best * (0.5 + Math.min(0.28, n * 0.02))));
  return { len, events, bossHp, bestPath: best };
}

// ================================================================ INPUT (drag anywhere, A/D or arrows)
const keys = new Set(), drag = { id: null, x0: 0, t0: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; keys.add(e.code); unlockAudio();
  if (state === State.PLAYING && ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) beginRun();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'Enter' || e.code === 'Space') { if (state === State.MENU) $('btnPlay').click(); else if (state === State.WIN) $('btnNext').click(); else if (state === State.LOSE) $('btnRetry').click(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => { unlockAudio(); if (state !== State.PLAYING || drag.id !== null) return; drag.id = e.pointerId; drag.x0 = e.clientX; drag.t0 = run.targetX; canvas.setPointerCapture(e.pointerId); beginRun(); });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== drag.id || AUTOPLAY) return; run.targetX = THREE.MathUtils.clamp(drag.t0 + ((e.clientX - drag.x0) / Math.min(innerWidth, 900)) * ROAD_HALF * 3, -ROAD_HALF, ROAD_HALF); });
const endDrag = (e) => { if (e.pointerId === drag.id) drag.id = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> WIN | LOSE)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', WIN: 'WIN', LOSE: 'LOSE' };
let state = State.BOOT, run = null;
let save = { level: 1, coins: 0, up: {} };
function setState(s) {
  state = s;
  for (const id of ['menu', 'paused', 'win', 'lose']) $(id).hidden = s !== State[id.toUpperCase()];
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  $('packCount').hidden = !(s === State.PLAYING || s === State.PAUSED);
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop();
  if (s === State.MENU) { playMusic('menu'); refreshShop(); }
}
function togglePause() { if (state === State.PLAYING) setState(State.PAUSED); else if (state === State.PAUSED) setState(State.PLAYING); }
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { if (AUTOPLAY) return; const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1800); }
let bannerTimer = 0;
function banner(text, bad = false) { const el = $('banner'); el.textContent = text; el.className = bad ? 'bad' : ''; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 1100); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6, 0); fn(); });

click('btnPlay', () => startLevel(save.level));
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnRestart', () => startLevel(run.level));
click('btnQuit', () => { setState(State.MENU); previewLevel(); });
click('btnNext', () => triggerMidgameAd(() => startLevel(save.level))); // between levels: the natural midgame break
click('btnRetry', () => startLevel(run.level));
click('btnWinMenu', () => { setState(State.MENU); previewLevel(); });
click('btnLoseMenu', () => { setState(State.MENU); previewLevel(); });
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.coins += run.reward; run.reward *= 2; $('winCoins').textContent = run.reward; saveData(SAVE_KEY, save); toast(t('doubled')); playSfx('coin', 1, 0); }, () => {});
});
function refreshShop() {
  document.querySelectorAll('.bank').forEach((el) => { el.textContent = save.coins; }); document.querySelectorAll('.menuLevel').forEach((el) => { el.textContent = save.level; });
  const box = $('shop'); box.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = save.up[u.id] || 0, cost = upgCost(u, lvl), [name, desc] = L().up[u.id], el = document.createElement('div'); el.className = 'upg';
    el.innerHTML = '<b></b><small></small><small></small><button></button>';
    el.querySelector('b').textContent = name; el.querySelectorAll('small')[0].textContent = desc; el.querySelectorAll('small')[1].textContent = t('lvl', { n: lvl });
    const btn = el.querySelector('button');
    if (lvl >= u.max) { btn.textContent = t('max'); btn.disabled = true; }
    else {
      btn.innerHTML = `<img src="assets/visuals/icon_coin.webp" alt=""> ${cost}`; btn.disabled = save.coins < cost;
      btn.addEventListener('click', () => { if (save.coins < cost) return; save.coins -= cost; save.up[u.id] = lvl + 1; saveData(SAVE_KEY, save); playSfx('upgrade', 0.8, 0); refreshShop(); previewLevel(); });
    }
    box.appendChild(el);
  }
}

// ================================================================ GAMEPLAY
const levelGroup = new THREE.Group(); scene.add(levelGroup);
let boss = null;
const startPack = () => 5 + 2 * (save.up.pack || 0);
function gateMesh(g, x) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x2 = c.getContext('2d'), good = isGood(g);
  x2.fillStyle = good ? 'rgba(40,140,255,.55)' : 'rgba(255,60,70,.55)'; x2.fillRect(0, 0, 256, 160);
  x2.strokeStyle = good ? '#bfe3ff' : '#ffc0c4'; x2.lineWidth = 10; x2.strokeRect(5, 5, 246, 150);
  x2.fillStyle = '#fff'; x2.font = 'bold 92px system-ui, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.shadowColor = 'rgba(0,0,0,.5)'; x2.shadowBlur = 8; x2.fillText(opLabel(g), 128, 84);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF - 0.2, 2.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, 1.6, 0); return m;
}
function buildLevel() {
  levelGroup.clear();
  if (road) scene.remove(road);
  roadTex.repeat.set(1, (run.def.len + 80) / 8);
  road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 1, run.def.len + 80), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 1 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, -run.def.len / 2 + 20); road.receiveShadow = true; scene.add(road);
  const postMat = new THREE.MeshStandardMaterial({ color: '#e8e2d0' }), spikeMat = new THREE.MeshStandardMaterial({ color: '#b0b8c4', metalness: 0.7, roughness: 0.3 });
  for (const ev of run.def.events) {
    const g = new THREE.Group(); g.position.z = ev.z; ev.obj = g; levelGroup.add(g);
    if (ev.type === 'gates') {
      g.add(gateMesh(ev.gates[0], -ROAD_HALF / 2), gateMesh(ev.gates[1], ROAD_HALF / 2));
      for (const x of [-ROAD_HALF, 0, ROAD_HALF]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), postMat); p.position.set(x, 1.7, 0); p.castShadow = true; g.add(p); }
    } else if (ev.type === 'spikes') {
      for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), spikeMat); s.position.set(ev.side * (0.4 + (i % 6) * 0.78), 0.45, Math.floor(i / 6) * 0.8 - 0.8); s.castShadow = true; g.add(s); }
      const base = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF, 0.1, 2.6), new THREE.MeshStandardMaterial({ color: '#6b4a2e' })); base.position.set(ev.side * ROAD_HALF / 2, 0.05, 0); g.add(base);
    } else if (ev.type === 'saw') {
      const saw = new THREE.Group(), disc = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 24), spikeMat); disc.rotation.z = Math.PI / 2; saw.add(disc);
      for (let i = 0; i < 10; i++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), spikeMat); const a = (i / 10) * Math.PI * 2; tooth.position.set(0, Math.cos(a) * 1.3, Math.sin(a) * 1.3); tooth.rotation.x = a; saw.add(tooth); }
      saw.position.y = 1.2; saw.traverse((o) => { o.castShadow = true; }); g.add(saw); ev.saw = saw;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: '#4a3b2e' })); rail.position.y = 0.04; g.add(rail);
    } else if (ev.type === 'foes') {
      ev.left = ev.n; ev.list = Array.from({ length: Math.min(ev.n, ENEMY_SHOWN) }, (_, i) => { const s = slot(i); return { x: s.x, z: ev.z + s.z, phase: Math.random() }; });
    } else if (ev.type === 'coins') {
      ev.coins = [];
      for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(coinGeo, coinMat); c.position.set(ev.x, 0.8, -i * 1.6); c.rotation.x = Math.PI / 2; g.add(c); ev.coins.push(c); }
    }
  }
  if (boss) scene.remove(boss);
  boss = instance('golem', fallbackGolem); boss.position.set(0, 0, -run.def.len); boss.rotation.y = 0; scene.add(boss); playClip(boss, 'walk');
  boss.userData.mixer?.timeScale && (boss.userData.mixer.timeScale = 0.25);
  const arena = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshStandardMaterial({ color: '#8e7a5c' })); arena.rotation.x = -Math.PI / 2; arena.position.set(0, 0.03, -run.def.len); levelGroup.add(arena);
}
const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 18), coinMat = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 0.8, roughness: 0.25, emissive: '#6b4a00' });
function previewLevel() { run = newRun(save.level); buildLevel(); syncPack(); placeCamera(1); }
function newRun(level) {
  const n0 = startPack();
  return { level, def: genLevel(level, n0), count: n0, wolves: [], x: 0, targetX: 0, z: 0, started: false, battle: null, bossFight: false, bossHp: 0, bossMax: 0,
    collected: 0, reward: 0, over: false, botT: 0, attackT: 0, clock: 0, evIdx: 0 };
}
function startLevel(level) {
  run = newRun(level); run.bossHp = run.bossMax = run.def.bossHp;
  buildLevel(); syncPack();
  $('levelNum').textContent = level; $('bossbar').hidden = true; $('dragHint').hidden = AUTOPLAY;
  setState(State.PLAYING); playMusic('run');
  if (AUTOPLAY) beginRun();
}
function beginRun() { if (!run || run.started || state !== State.PLAYING) return; run.started = true; $('dragHint').hidden = true; playSfx('howl', 0.9, 0); }
function syncPack(fromPos) { // keep the visible wolves in step with the pack count
  const want = Math.min(run.count, MAX_SHOWN);
  while (run.wolves.length < want) { const s = slot(run.wolves.length); run.wolves.push({ sx: s.x, sz: s.z, x: (fromPos?.x ?? run.x) + s.x * 0.2, z: (fromPos?.z ?? run.z) + s.z * 0.2, phase: Math.random(), scale: 0.2 }); }
  while (run.wolves.length > want) { const w = run.wolves.splice(Math.floor(Math.random() * run.wolves.length), 1)[0]; burst(new THREE.Vector3(w.x, 0.6, w.z), '#9a9da3', 4, 3); }
  run.wolves.forEach((w, i) => { const s = slot(i); w.sx = s.x; w.sz = s.z; });
  const el = $('packCount'); el.textContent = run.count; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function changeCount(n, at) { run.count = Math.max(0, Math.min(PACK_CAP, n)); syncPack(at); if (run.count <= 0) lose(); }
function hazardHit(ev, w) { // hazards take at most 30% of the pack that meets them
  ev.cap ??= Math.max(1, Math.floor(run.count * 0.3)); ev.taken ??= 0;
  if (ev.taken >= ev.cap) return;
  const before = run.count; killVisible(w); ev.taken += before - run.count;
}
function killVisible(w) { // one visible wolf hit by a hazard: removes its share of the (possibly larger) pack
  const share = Math.max(1, Math.round(run.count / Math.max(1, run.wolves.length)));
  run.wolves.splice(run.wolves.indexOf(w), 1); burst(new THREE.Vector3(w.x, 0.6, w.z), '#d24b4b', 5, 3); playSfx('die', 0.35, 0.06);
  run.count = Math.max(0, run.count - share); syncPack(); if (run.count <= 0) lose();
}
function updatePack(dt) {
  const rad = radiusOf(run.count), lim = Math.max(0, ROAD_HALF - Math.min(rad, ROAD_HALF) * 0.75);
  if (!AUTOPLAY) { const k = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0); if (k) run.targetX += k * 9 * dt; }
  run.targetX = THREE.MathUtils.clamp(run.targetX, -lim, lim);
  run.x += (run.targetX - run.x) * Math.min(1, dt * 10);
  const moving = run.started && !run.battle && !run.bossFight;
  if (moving) run.z -= SPEED * dt;
  for (const w of run.wolves) {
    w.x += (run.x + w.sx - w.x) * Math.min(1, dt * 8); w.z += (run.z + w.sz - w.z) * Math.min(1, dt * 8); w.scale = Math.min(1, (w.scale ?? 1) + dt * 4);
    w.turn = (run.targetX - run.x) * -0.08;
  }
}
function updateEvents(dt) {
  for (const ev of run.def.events) {
    if (ev.done) continue;
    const dz = run.z - ev.z;
    if (ev.type === 'gates' && dz <= 0) {
      ev.done = true; const g = ev.gates[run.x < 0 ? 0 : 1], before = run.count, after = applyOp(before, g);
      const pos = new THREE.Vector3(run.x, 2, run.z);
      floatText(pos, opLabel(g), isGood(g) ? 'good' : 'bad'); playSfx(isGood(g) ? 'good' : 'bad', 0.9, 0); burst(pos, isGood(g) ? '#7fc8ff' : '#ff6b6b', 16, 5);
      ev.obj.children.forEach((c) => { if (c.material?.map) c.material.opacity = 0.25; });
      changeCount(after, new THREE.Vector3(run.x, 0, run.z)); if (after > before) shake(0.12);
    } else if (ev.type === 'spikes' && dz < 1.6 && dz > -2.0) {
      for (const w of [...run.wolves]) if (Math.abs(w.z - ev.z) < 1.3 && w.x * ev.side > 0.15 && Math.abs(w.x) < ROAD_HALF) hazardHit(ev, w);
      if (dz < -1.9) ev.done = true;
    } else if (ev.type === 'saw') {
      const sx = Math.sin(run.clock * ev.speed + ev.phase) * (ROAD_HALF - 1.2); ev.saw.position.x = sx; ev.saw.rotation.x += dt * 14;
      if (dz < 1.6 && dz > -2) { for (const w of [...run.wolves]) if (Math.abs(w.z - ev.z) < 0.8 && Math.abs(w.x - sx) < 1.3) hazardHit(ev, w); if (Math.abs(dz) < 0.3) playSfx('saw', 0.5, 0.6); }
      if (dz < -2) ev.done = true;
    } else if (ev.type === 'foes') {
      const front = run.z - radiusOf(run.count), foeBack = ev.z + radiusOf(ev.left) * 1.15;
      if (!run.battle && front <= foeBack && ev.left > 0) { run.battle = ev; banner(t('fight'), true); playSfx('growl', 0.9, 0); }
      if (run.battle === ev) {
        ev.tick = (ev.tick || 0) + dt; const rate = Math.max(30, (ev.left + run.count) * 0.8);
        while (ev.tick > 1 / rate && ev.left > 0 && run.count > 0) {
          ev.tick -= 1 / rate; ev.left--; run.count--;
          if (ev.list.length > Math.min(ev.left, ENEMY_SHOWN)) { const f = ev.list.shift(); burst(new THREE.Vector3(f.x, 0.6, f.z), '#ff6a5a', 3, 3); }
          if (run.wolves.length > Math.min(run.count, MAX_SHOWN)) { const w = run.wolves.shift(); burst(new THREE.Vector3(w.x, 0.6, w.z), '#9a9da3', 3, 3); }
          playSfx('hit', 0.3, 0.04);
        }
        syncPack(); shake(0.05);
        if (run.count <= 0) { lose(); return; }
        if (ev.left <= 0) { run.battle = null; ev.done = true; playSfx('growl', 0.6, 0); }
      }
      for (const f of ev.list) { f.z += (run.z - f.z > 0 && run.battle === ev ? 3 : 0) * dt; }
    } else if (ev.type === 'coins') {
      for (const c of ev.coins) {
        if (!c.visible) continue; c.rotation.z += dt * 4;
        const wz = ev.z + c.position.z;
        if (Math.abs(wz - run.z) < radiusOf(run.count) && Math.abs(ev.x - run.x) < radiusOf(run.count) + 0.4) { c.visible = false; run.collected += 1; playSfx('coin', 0.4, 0.03); floatText(new THREE.Vector3(ev.x, 1.4, wz), '+1', 'coin'); }
      }
      if (dz < -12) ev.done = true;
    }
  }
}
function updateBoss(dt) {
  if (!run.bossFight && run.z <= -run.def.len + 7 + radiusOf(run.count)) {
    run.bossFight = true; $('bossbar').hidden = false; playClip(boss, 'slash'); if (boss.userData.mixer) boss.userData.mixer.timeScale = 1; playSfx('roar', 1, 0); shake(0.4);
  }
  if (!run.bossFight || run.over) return;
  run.attackT += dt;
  const rate = Math.max(18, run.count * 0.9), dmg = 1 + 0.15 * (save.up.power || 0);
  while (run.attackT > 1 / rate && run.count > 0 && run.bossHp > 0) {
    run.attackT -= 1 / rate; run.count--; run.bossHp -= dmg;
    if (run.wolves.length > Math.min(run.count, MAX_SHOWN)) { const w = run.wolves.pop(); burst(new THREE.Vector3(w.x, 1, w.z - 1), '#ffe2a8', 4, 4); }
    playSfx('hit', 0.35, 0.04);
  }
  syncPack(); shake(0.06);
  $('bossFill').style.width = `${Math.max(0, (100 * run.bossHp) / run.bossMax)}%`;
  if (run.bossHp <= 0) win(); else if (run.count <= 0) lose();
}
function win() {
  if (run.over) return; run.over = true;
  const income = 1 + 0.15 * (save.up.income || 0);
  run.reward = Math.round((20 + run.level * 6 + run.count * 2 + run.collected) * income);
  save.coins += run.reward; if (run.level >= save.level) save.level = run.level + 1; saveData(SAVE_KEY, save);
  burst(boss.position.clone().setY(4), '#c9b28a', 60, 10); playSfx('boom', 1, 0); playSfx('win', 0.9, 0); shake(0.8);
  boss.userData.falling = 0.001;
  $('winInfo').textContent = t('winInfo', { n: run.count }); $('winCoins').textContent = run.reward; $('btnDouble').hidden = !(adsAvailable() && run.reward > 0);
  if (run.count >= 100 && !CAPTURE) happytime();
  setTimeout(() => setState(State.WIN), CAPTURE ? 0 : 900);
}
function lose() {
  if (run.over) return; run.over = true;
  const income = 1 + 0.15 * (save.up.income || 0), progress = Math.min(1, -run.z / run.def.len);
  run.reward = Math.round((run.collected + progress * 10) * income); save.coins += run.reward; saveData(SAVE_KEY, save);
  playSfx('lose', 0.9, 0);
  $('loseInfo').textContent = run.bossFight ? t('bossLeft', { n: Math.ceil(run.bossHp) }) : t('loseInfo', { p: Math.round(progress * 100) });
  $('loseCoins').textContent = run.reward;
  setTimeout(() => setState(State.LOSE), CAPTURE ? 0 : 700);
}
function botSteer() { // looks ahead: best gate side, away from spikes and the saw's predicted position, centre for fights
  const ahead = run.def.events.filter((e) => !e.done && e.z < run.z + 1 && e.z > run.z - 30).sort((a, b) => b.z - a.z)[0];
  if (!ahead) { run.targetX *= 0.95; return; }
  if (ahead.type === 'gates') run.targetX = applyOp(run.count, ahead.gates[0]) >= applyOp(run.count, ahead.gates[1]) ? -ROAD_HALF / 2 : ROAD_HALF / 2;
  else if (ahead.type === 'spikes') run.targetX = -ahead.side * ROAD_HALF / 2;
  else if (ahead.type === 'saw') { const tArr = run.clock + (run.z - ahead.z) / SPEED, sx = Math.sin(tArr * ahead.speed + ahead.phase) * (ROAD_HALF - 1.2); run.targetX = sx > 0 ? -ROAD_HALF / 2 : ROAD_HALF / 2; }
  else if (ahead.type === 'coins' && ahead.z > run.z - 14) run.targetX = ahead.x;
  else run.targetX *= 0.9;
}
function placeCamera(k) {
  const rad = radiusOf(run.count), back = 11 + rad * 1.1, up = 9 + rad * 0.9, portrait = innerHeight > innerWidth ? 1.35 : 1;
  const want = new THREE.Vector3(run.x * 0.4, up * portrait, run.z + back * portrait), look = new THREE.Vector3(run.x * 0.5, 0, run.z - 8);
  camera.position.lerp(want, k); camera.lookAt(look);
}

function step(dt) {
  if (state !== State.PLAYING || !run || run.over) return;
  run.clock += dt;
  if (AUTOPLAY) { run.botT -= dt; if (run.botT <= 0) { run.botT = 0.1; botSteer(); } }
  updatePack(dt);
  updateEvents(dt); if (run.over) return;
  updateBoss(dt);
  $('progFill').style.width = `${Math.min(100, (100 * -run.z) / run.def.len)}%`;
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, clock = 0, autoT = 0;
function animate(dt) {
  clock += dt; updateParticles(dt);
  if (!run) return;
  placeCamera(Math.min(1, dt * 5)); // follow in the simulation step, so skip() (capture) keeps the camera with the pack
  const running = state === State.PLAYING && run.started && !run.battle && !run.bossFight;
  drawCrowd(crowd.packMeshes, run.wolves, Math.PI, clock, running || run.battle || run.bossFight);
  const foes = []; for (const ev of run.def.events) if (ev.type === 'foes' && !ev.done) for (const f of ev.list) foes.push(f);
  drawCrowd(crowd.foeMeshes, foes, 0, clock, !!run.battle);
  if (boss) {
    boss.userData.mixer?.update(dt);
    if (boss.userData.falling) { boss.userData.falling = Math.min(1, boss.userData.falling + dt * 1.2); boss.rotation.x = -boss.userData.falling * 1.4; boss.position.y = -boss.userData.falling * 1.5; }
  }
  for (const tr of trees) if (tr.position.z > camera.position.z + 12) tr.position.z -= TREE_ROWS * TREE_GAP; // recycle scenery ahead
  if (state === State.PLAYING || state === State.PAUSED) {
    const p = new THREE.Vector3(run.x, 1.5 + radiusOf(run.count) * 0.25, run.z).project(camera), el = $('packCount');
    el.style.left = `${((p.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  }
  if (AUTOPLAY && (state === State.WIN || state === State.LOSE)) { autoT += dt; if (autoT > 1.6) { autoT = 0; startLevel(save.level); } }
}
function advance(dt) {
  if (state === State.PAUSED) return;
  acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; }
  animate(dt);
}
function render(dt) {
  shakeAmt = Math.max(0, shakeAmt - dt * 2);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  const fz = run ? run.z : 0; sun.position.set(-10, 26, fz + 8); sun.target.position.set(0, 0, fz - 6); grass.position.z = fz - 40;
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n(); $('hint').textContent = t(isTouch ? 'hintTouch' : 'hintDesktop');
  initAudio();
  const loads = [...Object.keys(ASSETS.models).map((id) => track(loadModel(id))), ...Object.entries(ASSETS.sfx).map(([k, u]) => track(loadSfx(k, u)))];
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 20000))]);
  bakeWolf(); makeCrowdMeshes(); buildScenery();
  const saved = loadData(SAVE_KEY, null);
  if (saved) save = { ...save, ...saved, up: { ...(saved.up || {}) } };
  resize(); previewLevel();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  setState(State.MENU);
  if (CAPTURE) {
    window.__game = {
      start: () => startLevel(save.level),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) advance(STEP); },
      info: () => ({ state, level: run?.level, count: run?.count, z: run?.z, len: run?.def.len, boss: run?.bossHp, bestPath: run?.def.bestPath, coins: save.coins }),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
