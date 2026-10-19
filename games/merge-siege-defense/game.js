// Merge Siege Defense: summon heroes, drag matching heroes together to merge them into stronger tiers,
// and hold the castle against endless waves of wolves and siege golems.
// Sections: CONFIG, I18N, SDK, AUDIO, ASSETS, WORLD, UNITS, ENEMIES, INPUT, STATE, GAMEPLAY, LOOP, BOOT.
// Everything loads from ./assets/ with procedural fallbacks. No API keys, no backend calls: static bundle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = 'merge-siege-defense';
const STEP = 1 / 60; // fixed simulation step: identical behaviour at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for trailer/screenshot capture (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot summons and merges by itself

const GRID = { cols: 5, rows: 3, x0: -5.6, z0: 0.6, dx: 3.2, dz: 3.0 };
const LANE = { z: -6, start: 27, gate: -12 };
const CASTLE = { x: -17, hp: 100 };
const TIERS = [ // hero model, emissive tint, scale, bolt colour
  { hero: 'warrior', tint: null, scale: 0.85, bolt: '#dfe7ef' },
  { hero: 'assassin', tint: null, scale: 0.9, bolt: '#7dffa8' },
  { hero: 'shaman', tint: null, scale: 0.95, bolt: '#6cc7ff' },
  { hero: 'sura', tint: null, scale: 1.0, bolt: '#c77dff' },
  { hero: 'warrior', tint: '#ffb703', scale: 1.06, bolt: '#ffd166' },
  { hero: 'assassin', tint: '#ff3b3b', scale: 1.12, bolt: '#ff6a5a' },
  { hero: 'shaman', tint: '#20c4ff', scale: 1.18, bolt: '#a5f3ff' },
  { hero: 'sura', tint: '#8f3bff', scale: 1.24, bolt: '#e0b3ff' },
  { hero: 'warrior', tint: '#e8f6ff', scale: 1.3, bolt: '#ffffff' },
  { hero: 'sura', tint: '#ff2fb0', scale: 1.38, bolt: '#ff8ad9' },
];
const MAX_TIER = TIERS.length - 1;
const unitDamage = (t) => 5 * Math.pow(2.3, t);
const unitRate = (t) => 0.85 + t * 0.07; // shots per second
const ENEMIES = {
  wolf: { model: 'wolf', hp: 13, speed: 3.4, dmg: 5, gold: 3, size: 1, barY: 2.0 },
  golem: { model: 'golem', hp: 52, speed: 1.55, dmg: 12, gold: 7, size: 1, barY: 3.5 },
  boss: { model: 'golem', hp: 480, speed: 1.05, dmg: 35, gold: 45, size: 1.7, barY: 3.5, tint: '#ff3a20' },
};
const UPGRADES = [ // permanent, bought with gems in the Armory
  { id: 'power', max: 25, base: 8 }, { id: 'walls', max: 25, base: 6 },
  { id: 'treasury', max: 25, base: 6 }, { id: 'luck', max: 10, base: 12 },
];
const upgCost = (u, lvl) => Math.round(u.base * Math.pow(1.42, lvl));
const summonCost = (n) => 10 + n * 3;

const ASSETS = {
  models: { // height in metres, yaw turns the model to face +Z
    warrior: { files: { idle: 'assets/models/hero_warrior@idle.glb', slash: 'assets/models/hero_warrior@slash.glb' }, height: 3.8, yaw: -90 },
    assassin:{ files: { idle: 'assets/models/hero_assassin@idle.glb', slash: 'assets/models/hero_assassin@slash.glb' }, height: 3.8, yaw: -90 },
    shaman:  { files: { idle: 'assets/models/hero_shaman@idle.glb', slash: 'assets/models/hero_shaman@slash.glb' }, height: 3.8, yaw: -90 },
    sura:    { files: { idle: 'assets/models/hero_sura@idle.glb', slash: 'assets/models/hero_sura@slash.glb' }, height: 3.9, yaw: -90 },
    wolf: { files: { walk: 'assets/models/mob_wolf@walk.glb' }, height: 1.5, yaw: -90 },
    golem: { files: { walk: 'assets/models/mob_golem@walk.glb' }, height: 3.0, yaw: -90 },
    castle: { files: { base: 'assets/models/bld_king.glb' }, height: 9, yaw: 90 },
    tower: { files: { base: 'assets/models/bld_tower.glb' }, height: 6.5 },
    outpost: { files: { base: 'assets/models/bld_outpost.glb' }, height: 5.5, yaw: -90 },
    tree: { files: { base: 'assets/models/prop_tree.glb' }, height: 5.5 },
    rock: { files: { base: 'assets/models/prop_rock.glb' }, height: 1.2 },
  },
  sfx: {
    shoot: 'assets/audio/sword_swing.mp3', hit: 'assets/audio/hit.mp3', coin: 'assets/audio/coin.mp3', summon: 'assets/audio/card_pick.mp3',
    merge: 'assets/audio/siege_merge.mp3', wolfDie: 'assets/audio/wolf_death.mp3', roar: 'assets/audio/golem_roar.mp3',
    castleHit: 'assets/audio/siege_castle_hit.mp3', fall: 'assets/audio/tower_down.mp3', thunder: 'assets/audio/thunder.mp3',
    cleared: 'assets/audio/victory.mp3', over: 'assets/audio/defeat.mp3', click: 'assets/audio/ui_click.mp3',
    levelUp: 'assets/audio/level_up.mp3', boom: 'assets/audio/explosion.mp3',
  },
  music: { play: 'assets/audio/bgm_battle.mp3', menu: 'assets/audio/bgm_menu.mp3' },
  voice: { wave: 'assets/audio/voice/siege_wave_{lang}.mp3', boss: 'assets/audio/voice/siege_boss_{lang}.mp3', fallen: 'assets/audio/voice/siege_fallen_{lang}.mp3' },
};

// ================================================================ I18N (English required; Turkish included)
const STRINGS = {
  en: {
    castle: 'Castle', wave: 'Wave', merge: 'Merge', summon: 'Summon', bestWave: 'Best wave', play: 'Play', armory: 'Armory', back: 'Back',
    paused: 'Paused', resume: 'Resume', menu: 'Menu', fallen: 'The castle has fallen', newBest: 'New best!', gemsWord: 'gems',
    double: '▶ Double gems', again: 'Play again', waveBanner: 'Wave {n}', bossBanner: 'Boss wave {n}!', cleared: 'Wave cleared! +{g}',
    noRoom: 'No free slot: merge your heroes!', noGold: 'Not enough gold', noPairs: 'No matching heroes to merge',
    doubled: 'Gems doubled!', adUnavailable: 'Ad not available right now', max: 'MAX', level: 'Lv {n}',
    hintDesktop: 'Drag a hero onto a matching hero to merge · Space: summon · M: auto-merge · F: speed · Esc: pause',
    hintTouch: 'Drag a hero onto a matching hero to merge them into a stronger one',
    tiers: ['Recruit', 'Scout', 'Mystic', 'Blademaster', 'Paladin', 'Shadow Lord', 'Archmage', 'Void Knight', 'Titan', 'Celestial'],
    upg: { power: ['Sharpened Steel', '+10% hero damage'], walls: ['Stone Walls', '+20 castle HP'], treasury: ['War Chest', '+15 starting gold'], luck: ['Lucky Banner', '+6% chance to summon a Scout'] },
  },
  tr: {
    castle: 'Kale', wave: 'Dalga', merge: 'Birleştir', summon: 'Çağır', bestWave: 'En iyi dalga', play: 'Oyna', armory: 'Cephanelik', back: 'Geri',
    paused: 'Duraklatıldı', resume: 'Devam', menu: 'Menü', fallen: 'Kale düştü', newBest: 'Yeni rekor!', gemsWord: 'mücevher',
    double: '▶ Mücevherleri ikiye katla', again: 'Tekrar oyna', waveBanner: 'Dalga {n}', bossBanner: 'Boss dalgası {n}!', cleared: 'Dalga temizlendi! +{g}',
    noRoom: 'Boş yer yok: kahramanlarını birleştir!', noGold: 'Yeterli altın yok', noPairs: 'Birleştirilecek eş kahraman yok',
    doubled: 'Mücevherler ikiye katlandı!', adUnavailable: 'Şu anda reklam yok', max: 'MAKS', level: 'Sv {n}',
    hintDesktop: 'Birleştirmek için kahramanı aynı kahramanın üstüne sürükle · Boşluk: çağır · M: otomatik birleştir · F: hız · Esc: duraklat',
    hintTouch: 'Daha güçlü bir kahraman için aynı iki kahramanı üst üste sürükle',
    tiers: ['Acemi', 'İzci', 'Mistik', 'Kılıç Ustası', 'Paladin', 'Gölge Lordu', 'Başbüyücü', 'Boşluk Şövalyesi', 'Titan', 'Göksel'],
    upg: { power: ['Bilenmiş Çelik', '+%10 kahraman hasarı'], walls: ['Taş Surlar', '+20 kale canı'], treasury: ['Savaş Sandığı', '+15 başlangıç altını'], luck: ['Şans Sancağı', 'İzci çağırma şansı +%6'] },
  },
};
let lang = 'en';
const t = (k, vars) => {
  let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
const tierName = (i) => (STRINGS[lang] || STRINGS.en).tiers[i];
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }

// ================================================================ SDK (CrazyGames v3; every call is a safe no-op off-platform)
let crazySdk = null, sdkEnv = 'disabled', gameplayActive = false, adsFailed = false;

async function initCrazySDK() {
  try {
    if (window.CrazyGames?.SDK) {
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
function applySdkSettings(s) { if (s?.muteAudio) muteAudio('sdk'); else unmuteAudio('sdk'); } // platform mute overrides everything

function onGameplayStart() { if (gameplayActive) return; gameplayActive = true; sdkCall((s) => s.game.gameplayStart()); }
function onGameplayStop() { if (!gameplayActive) return; gameplayActive = false; sdkCall((s) => s.game.gameplayStop()); }
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: new best wave only

// Midgame: only between waves (after every boss wave) or between runs, never on navigation buttons.
// The simulation is held while the ad runs; audio mutes on adStarted (not on request); the game always continues.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  hold = true; onGameplayStop(); blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); hold = false; if (state === State.PLAYING) onGameplayStart(); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, only on the game-over screen, reward only on adFinished; hidden for the session after an error.
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

// ================================================================ AUDIO (Web Audio SFX + synthesized fallbacks, HTML5 music/voice)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  shoot: ['triangle', 900, 500, 0.08, 0.05], hit: ['square', 220, 90, 0.08, 0.06], coin: ['square', 1320, 1980, 0.1, 0.06],
  summon: ['sine', 400, 900, 0.15, 0.12], merge: ['sawtooth', 300, 1400, 0.4, 0.1], wolfDie: ['sawtooth', 500, 120, 0.25, 0.08],
  roar: ['sawtooth', 120, 60, 0.7, 0.15], castleHit: ['square', 120, 50, 0.3, 0.18], fall: ['sawtooth', 200, 40, 1.2, 0.2],
  thunder: ['sawtooth', 90, 40, 0.8, 0.15], cleared: ['triangle', 520, 1040, 0.5, 0.12], over: ['triangle', 440, 110, 0.9, 0.18],
  click: ['square', 900, 900, 0.03, 0.06], levelUp: ['sine', 600, 1600, 0.35, 0.12], boom: ['sawtooth', 160, 40, 0.5, 0.18],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0, lastShoot: 0 };

function initAudio() {
  try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.master = audio.ctx.createGain(); audio.master.connect(audio.ctx.destination); }
  catch { audio.ctx = null; }
}
async function loadSfx(key, url) {
  if (!audio.ctx) return;
  try { const r = await fetch(url); if (r.ok) audio.buffers[key] = await audio.ctx.decodeAudioData(await r.arrayBuffer()); } catch {} // missing -> synth
}
function unlockAudio() { // iOS: resume inside a user gesture
  if (audio.ctx?.state === 'suspended') audio.ctx.resume();
  if (audio.wantMusic && audio.music?.paused && !audio.muted.size) audio.music.play().catch(() => {});
}
function playSfx(key, vol = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 14 || CAPTURE) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime;
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.94 + Math.random() * 0.12; g.gain.value = vol;
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
function playVoice(key) {
  if (audio.muted.size || CAPTURE || !ASSETS.voice[key]) return;
  const a = new Audio(ASSETS.voice[key].replace('{lang}', STRINGS[lang] ? lang : 'en')); a.volume = 0.9;
  a.onerror = () => { if (lang !== 'en') { const b = new Audio(ASSETS.voice[key].replace('{lang}', 'en')); b.volume = 0.9; b.play().catch(() => {}); } };
  a.play().catch(() => {});
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic && !CAPTURE) audio.music.play().catch(() => {}); }
}

// ================================================================ ASSETS (GLB + clips; null when missing so fallbacks kick in)
const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
const models = {};
let loadTotal = 0, loadDone = 0;
const $ = (id) => document.getElementById(id);
function track(p) { loadTotal++; return p.finally(() => { loadDone++; $('loadBar').style.width = `${(100 * loadDone) / loadTotal}%`; }); }

async function loadModel(id) {
  const def = ASSETS.models[id], clips = {}; let scene = null;
  await Promise.all(Object.entries(def.files).map(async ([clip, url], i) => {
    try {
      const g = await gltf.loadAsync(url);
      if (i === 0 || !scene) scene = scene && i !== 0 ? scene : g.scene;
      if (clip !== 'base' && g.animations[0]) clips[clip] = g.animations[0]; // clips bind by bone name onto the first scene
    } catch {}
  }));
  if (!scene) return;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  for (const c of Object.values(clips)) stripRootMotion(c, scene);
  models[id] = { scene, clips, def };
}
// A placeable copy: scaled to def.height, feet on y=0, facing +Z. Returns fallback() when the GLB is missing.
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
function playClip(obj, name, fade = 0.15) {
  const acts = obj.userData.actions, next = acts?.[name];
  if (!next || obj.userData.current === next) return;
  next.reset().fadeIn(fade).play(); obj.userData.current?.fadeOut(fade); obj.userData.current = next;
}
// Tripo3D clips walk the hip bone forward (root motion): remove the drift so characters animate in place.
function stripRootMotion(clip, root) {
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
const tintCache = new Map();
function tint(obj, color, strength = 0.45) { // per-tier glow: cloned materials, cached per (material, colour)
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const key = m.material.uuid + color;
    if (!tintCache.has(key)) { const c = m.material.clone(); c.emissive = new THREE.Color(color); c.emissiveIntensity = strength; tintCache.set(key, c); }
    m.material = tintCache.get(key);
  });
}

// ================================================================ WORLD
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9cd2ef'); scene.fog = new THREE.Fog('#9cd2ef', 55, 110);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
const CAM_LOOK = new THREE.Vector3(3, 0, -1.2), CAM_OFFSET = new THREE.Vector3(0, 22, 18.5);
let shakeAmt = 0;
const rand = (a, b) => a + Math.random() * (b - a);
const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

function buildWorld() {
  scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f4a', 1.5));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(-10, 26, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 24, bottom: -24, far: 90 }); sun.shadow.bias = -0.0005;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), std('#6fae4f')); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const road = new THREE.Mesh(new THREE.BoxGeometry(LANE.start - LANE.gate + 10, 0.06, 4.2), std('#c9a46a'));
  road.position.set((LANE.start + LANE.gate) / 2 + 1, 0.03, LANE.z); road.receiveShadow = true; scene.add(road);
  for (let i = 0; i < 24; i++) { // road stones
    const s = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.2, 0.45), rand(0.3, 0.5), 0.1, 6), std('#a88a5a'));
    s.position.set(rand(LANE.gate, LANE.start + 3), 0.06, LANE.z + rand(-1.7, 1.7)); s.receiveShadow = true; scene.add(s);
  }
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(GRID.cols * GRID.dx + 1.6, 0.1, GRID.rows * GRID.dz + 1.4), std('#a7a296'));
  plaza.position.set(GRID.x0 + ((GRID.cols - 1) * GRID.dx) / 2, 0.05, GRID.z0 + ((GRID.rows - 1) * GRID.dz) / 2); plaza.receiveShadow = true; scene.add(plaza);
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
    const mat = std('#8d93a8', { emissive: new THREE.Color('#000000') });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.2, 6), mat);
    mesh.position.set(GRID.x0 + c * GRID.dx, 0.15, GRID.z0 + r * GRID.dz); mesh.receiveShadow = true; scene.add(mesh);
    slots.push({ pos: mesh.position.clone().setY(0.25), mesh, unit: null });
  }
  const castle = instance('castle', fallbackCastle); castle.position.set(CASTLE.x, 0, LANE.z); scene.add(castle); world.castle = castle;
  for (const z of [LANE.z - 5.5, LANE.z + 5.5]) { const tw = instance('tower', fallbackTower); tw.position.set(CASTLE.x + 4.5, 0, z); scene.add(tw); }
  const gate = instance('outpost', fallbackOutpost); gate.position.set(LANE.start + 3, 0, LANE.z); scene.add(gate);
  const keepOut = (x, z) => !(z < LANE.z - 5.5 || x < -27 || x > 32); // trees only behind the road or off the sides, never over the lane or grid
  let placed = 0;
  for (let i = 0; i < 200 && placed < 34; i++) {
    const x = rand(-36, 42), z = rand(-26, 16);
    if (keepOut(x, z)) continue;
    const tr = instance(Math.random() < 0.8 ? 'tree' : 'rock', Math.random() < 0.8 ? fallbackTree : fallbackRock);
    tr.position.set(x, 0, z); tr.rotation.y = rand(0, 6.28); tr.scale.multiplyScalar(rand(0.8, 1.25)); scene.add(tr); placed++;
  }
}
const fallbackTree = () => {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6), std('#7a5230')); trunk.position.y = 0.8;
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 7), std('#2f7d36', { flatShading: true })); top.position.y = 3.2;
  trunk.castShadow = top.castShadow = true; g.add(trunk, top); return g;
};
const fallbackRock = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), std('#8d8d8d', { flatShading: true })); m.position.y = 0.5; m.castShadow = true; g.add(m); return g; };
const fallbackCastle = () => {
  const g = new THREE.Group(), stone = std('#b9b2a3');
  const keep = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 7), stone); keep.position.y = 3;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 3.5, 4), std('#3d5a99')); roof.position.y = 7.7; roof.rotation.y = Math.PI / 4;
  const gateM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 2), std('#5a3a1e')); gateM.position.set(3.05, 1.3, 0);
  for (const m of [keep, roof]) m.castShadow = true;
  g.add(keep, roof, gateM); return g;
};
const fallbackTower = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 6, 8), std('#b9b2a3')); m.position.y = 3; const r = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.2, 8), std('#3d5a99')); r.position.y = 7.1; m.castShadow = r.castShadow = true; g.add(m, r); return g; };
const fallbackOutpost = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 5), std('#4a3b3b')); m.position.y = 2; m.castShadow = true; g.add(m); return g; };
const fallbackHero = (tier) => () => {
  const g = new THREE.Group(), col = TIERS[tier].bolt;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 4, 10), std(col, { emissive: new THREE.Color(col), emissiveIntensity: 0.25 })); body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), std('#f1c9a5')); head.position.y = 1.55;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.12), std('#dfe7ef', { metalness: 0.8, roughness: 0.3 })); blade.position.set(0.5, 1.0, 0.25);
  body.castShadow = head.castShadow = true; g.add(body, head, blade); return g;
};
const fallbackWolf = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 1.3), std('#777b82')); m.position.y = 0.55; const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.45), std('#666a70')); h.position.set(0, 0.85, 0.75); m.castShadow = true; g.add(m, h); return g; };
const fallbackGolem = () => { const g = new THREE.Group(), mat = std('#8a8378', { flatShading: true }); const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85), mat); b.position.y = 1.3; const h = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45), mat); h.position.y = 2.25; b.castShadow = true; g.add(b, h); return g; };

// pooled particles + bolts
const particles = [], pGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
function burst(pos, color, n = 12, speed = 5) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial()); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material.color.set(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.45 + Math.random() * 0.35;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 13 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 2));
  }
}
const bolts = [], boltGeo = new THREE.SphereGeometry(0.22, 10, 8);
function fireBolt(from, target, dmg, color) {
  let b = bolts.find((q) => !q.visible);
  if (!b) { b = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial()); bolts.push(b); scene.add(b); }
  b.material.color.set(color); b.visible = true; b.position.copy(from); b.scale.setScalar(0.8 + Math.min(1.6, dmg / 200));
  b.userData = { target, dmg, color }; target.incoming += dmg;
}
function updateBolts(dt) {
  for (const b of bolts) {
    if (!b.visible) continue;
    const e = b.userData.target, aim = e.obj.position.clone().setY(e.def.barY * 0.5), d = aim.sub(b.position), len = d.length();
    if (e.dead) { b.visible = false; continue; }
    if (len < 0.5) { b.visible = false; e.incoming -= b.userData.dmg; damageEnemy(e, b.userData.dmg, b.userData.color); continue; }
    b.position.addScaledVector(d, Math.min(1, (28 * dt) / len));
  }
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

// floating DOM text anchored to world positions
const _v = new THREE.Vector3();
function floater(pos, text, cls = '') {
  if (CAPTURE && cls === 'dmg') return;
  _v.copy(pos).project(camera);
  if (_v.z > 1) return;
  const el = document.createElement('div'); el.className = `float ${cls}`; el.textContent = text;
  el.style.left = `${((_v.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - _v.y) / 2) * innerHeight}px`;
  $('floaters').appendChild(el); setTimeout(() => el.remove(), 900);
}

// ================================================================ UNITS (heroes on the grid)
const slots = [], world = {};
const badgeTex = [];
function badge(tier) { // round tier badge sprite above each hero
  if (!badgeTex[tier]) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = TIERS[tier].bolt; x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fill(); x.lineWidth = 5; x.strokeStyle = '#1a1626'; x.stroke();
    x.fillStyle = '#1a1626'; x.font = 'bold 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(tier + 1), 32, 34);
    badgeTex[tier] = new THREE.CanvasTexture(c); badgeTex[tier].colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex[tier], depthTest: false })); s.scale.setScalar(0.75); s.renderOrder = 10; return s;
}
function makeUnit(tier, slot) {
  const def = TIERS[tier], obj = instance(def.hero, fallbackHero(tier));
  if (!models[def.hero]) obj.scale.multiplyScalar(1.4);
  obj.scale.multiplyScalar(def.scale); if (def.tint) tint(obj, def.tint);
  const b = badge(tier); b.position.y = 4.3; obj.add(b);
  obj.position.copy(slot.pos); obj.rotation.y = Math.PI; scene.add(obj); playClip(obj, 'idle');
  const u = { tier, obj, slot, cooldown: rand(0.2, 0.8), idleT: 0, pop: 0.25 };
  slot.unit = u; units.push(u); return u;
}
function removeUnit(u) { scene.remove(u.obj); units.splice(units.indexOf(u), 1); if (u.slot.unit === u) u.slot.unit = null; }
const units = [];

// ================================================================ ENEMIES
const enemies = [];
function spawnEnemy(type) {
  const def = ENEMIES[type], scale = Math.pow(1.19, run.wave - 1);
  const obj = instance(def.model, def.model === 'wolf' ? fallbackWolf : fallbackGolem);
  obj.scale.multiplyScalar(def.size); if (def.tint) tint(obj, def.tint, 0.35);
  obj.position.set(LANE.start, 0, LANE.z + (type === 'boss' ? 0 : rand(-1.2, 1.2))); obj.rotation.y = -Math.PI / 2; scene.add(obj); playClip(obj, 'walk');
  obj.userData.mixer?.update(Math.random()); // desync walk cycles
  const bar = new THREE.Group(), w = 1.3 * Math.max(1, def.size * 0.8);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.16), new THREE.MeshBasicMaterial({ color: '#2a1216', depthTest: false }));
  const fgGeo = new THREE.PlaneGeometry(w, 0.16); fgGeo.translate(w / 2, 0, 0);
  const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: type === 'boss' ? '#ff9a3c' : '#ff4d4d', depthTest: false }));
  fg.position.x = -w / 2; bg.renderOrder = fg.renderOrder = 9; bar.add(bg, fg); bar.position.y = def.barY; obj.add(bar);
  bar.visible = false;
  const hp = Math.round(def.hp * scale);
  enemies.push({ type, def, obj, hp, maxHp: hp, incoming: 0, speed: def.speed * rand(0.92, 1.08), bar, fg, dead: false });
  if (type === 'boss') { playSfx('roar'); playSfx('thunder', 0.6); shake(0.5); }
}
function damageEnemy(e, dmg, color) {
  if (e.dead) return;
  e.hp -= dmg; e.bar.visible = true; e.fg.scale.x = Math.max(0, e.hp / e.maxHp);
  burst(e.obj.position.clone().setY(e.def.barY * 0.45), color, 4, 3); playSfx('hit', 0.35);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; scene.remove(e.obj); enemies.splice(enemies.indexOf(e), 1);
  const g = Math.round(e.def.gold * (1 + 0.09 * (run.wave - 1)));
  run.gold += g; run.kills++; updateHud();
  const p = e.obj.position.clone().setY(e.def.barY * 0.6);
  burst(p, e.type === 'wolf' ? '#9a9da3' : '#a8957a', e.type === 'boss' ? 40 : 14, e.type === 'boss' ? 9 : 5);
  floater(p, `+${g}`); playSfx(e.type === 'wolf' ? 'wolfDie' : 'boom', e.type === 'boss' ? 1 : 0.5); playSfx('coin', 0.35);
  if (e.type === 'boss') shake(0.6);
}

// ================================================================ INPUT (mouse/touch drag & drop, keyboard shortcuts)
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
function groundPoint(e) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera); const p = new THREE.Vector3(); return raycaster.ray.intersectPlane(groundPlane, p) ? p : null;
}
function nearestSlot(p, max = 1.8) {
  let best = null, bd = max;
  for (const s of slots) { const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function highlight(fn) { for (const s of slots) s.mesh.material.emissive.set(fn(s) || '#000000'); }
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING || hold || drag) return;
  const p = groundPoint(e), s = p && nearestSlot(p, 1.6);
  if (!s?.unit) return;
  drag = { unit: s.unit, from: s, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); playSfx('click', 0.5);
  highlight((q) => (q.unit && q !== s && q.unit.tier === s.unit.tier && s.unit.tier < MAX_TIER ? '#5a3fb3' : null));
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const p = groundPoint(e); if (!p) return;
  drag.unit.obj.position.set(p.x, 1.1, p.z);
  const target = nearestSlot(p);
  highlight((q) => (q === target ? (q.unit && q.unit !== drag.unit && q.unit.tier === drag.unit.tier && drag.unit.tier < MAX_TIER ? '#b48cff' : '#3a3f55')
    : q.unit && q.unit !== drag.unit && q.unit.tier === drag.unit.tier && drag.unit.tier < MAX_TIER ? '#5a3fb3' : null));
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const p = groundPoint(e), target = p && nearestSlot(p), u = drag.unit, from = drag.from;
  drag = null; highlight(() => null);
  if (!target || target === from || state !== State.PLAYING) { u.obj.position.copy(from.pos); return; }
  if (target.unit && target.unit.tier === u.tier && u.tier < MAX_TIER) { mergeInto(u, target.unit); return; }
  if (target.unit) { const o = target.unit; o.slot = from; from.unit = o; o.obj.position.copy(from.pos); } else from.unit = null;
  u.slot = target; target.unit = u; u.obj.position.copy(target.pos); playSfx('summon', 0.4);
}
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  unlockAudio();
  if (state === State.PLAYING && !hold) {
    if (e.code === 'Space') summon();
    if (e.code === 'KeyM') autoMerge(true);
    if (e.code === 'KeyF') toggleSpeed();
  }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});

// ================================================================ STATE (BOOT -> MENU/ARMORY -> PLAYING <-> PAUSED -> GAMEOVER)
const State = { BOOT: 'BOOT', MENU: 'MENU', ARMORY: 'ARMORY', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, hold = false, run = null;
let save = { best: 0, gems: 0, upg: { power: 0, walls: 0, treasury: 0, luck: 0 } };

function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU; $('armory').hidden = s !== State.ARMORY; $('paused').hidden = s !== State.PAUSED; $('gameover').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  if (s !== State.PLAYING && drag) { drag.unit.obj.position.copy(drag.from.pos); drag = null; highlight(() => null); }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, game over
  if (s === State.MENU || s === State.ARMORY) playMusic('menu');
  if (s === State.MENU || s === State.ARMORY || s === State.GAMEOVER) refreshMeta();
}
function togglePause() { if (hold) return; if (state === State.PLAYING) setState(State.PAUSED); else if (state === State.PAUSED) setState(State.PLAYING); }
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2000); }
let bannerTimer = 0;
function banner(text, boss = false) { const el = $('banner'); el.textContent = text; el.className = boss ? 'boss' : ''; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 1800); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

click('btnPlay', () => startRun());
click('btnArmory', () => setState(State.ARMORY));
click('btnOverArmory', () => setState(State.ARMORY)); // navigation: never an ad here
click('btnArmoryBack', () => setState(State.MENU));
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { setState(State.MENU); demoGrid(); });
click('btnMenu', () => { setState(State.MENU); demoGrid(); });
click('btnRetry', () => triggerMidgameAd(() => startRun())); // between runs: a natural midgame break
click('btnSummon', () => summon());
click('btnMerge', () => autoMerge(true));
click('btnSpeed', () => toggleSpeed());
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.gems += run.gemsEarned; run.gemsEarned *= 2; saveData(SAVE_KEY, save); $('gemsEarned').textContent = run.gemsEarned; refreshMeta(); toast(t('doubled')); playSfx('levelUp'); }, () => {});
});

function refreshMeta() {
  document.querySelectorAll('.bestWave').forEach((el) => { el.textContent = save.best; });
  document.querySelectorAll('.gems').forEach((el) => { el.textContent = save.gems; });
  const box = $('upgrades'); box.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = save.upg[u.id] || 0, cost = upgCost(u, lvl), [name, desc] = (STRINGS[lang] || STRINGS.en).upg[u.id];
    const el = document.createElement('div'); el.className = 'upg';
    el.innerHTML = `<div><b></b> <small></small></div><small></small><button></button>`;
    el.querySelector('b').textContent = name; el.querySelectorAll('small')[0].textContent = t('level', { n: lvl }); el.querySelectorAll('small')[1].textContent = desc;
    const btn = el.querySelector('button');
    if (lvl >= u.max) { btn.textContent = t('max'); btn.disabled = true; }
    else {
      btn.innerHTML = `<img src="assets/visuals/icon_gem.webp" alt="" onerror="this.remove()"> ${cost}`; btn.disabled = save.gems < cost;
      btn.addEventListener('click', () => { if (save.gems < cost) return; save.gems -= cost; save.upg[u.id] = lvl + 1; saveData(SAVE_KEY, save); playSfx('levelUp'); refreshMeta(); });
    }
    box.appendChild(el);
  }
}

// ================================================================ GAMEPLAY
function clearBoard() {
  for (const u of [...units]) removeUnit(u);
  for (const e of enemies) scene.remove(e.obj); enemies.length = 0;
  for (const b of bolts) b.visible = false;
}
function demoGrid() { // menu backdrop: a few heroes standing guard
  clearBoard();
  [[0, 2], [1, 0], [2, 3], [3, 1], [4, 4], [6, 7]].forEach(([tier, i]) => makeUnit(tier, slots[i]));
}
function startRun() {
  clearBoard();
  const maxHp = CASTLE.hp + 20 * save.upg.walls;
  run = { wave: 0, gold: 30 + 15 * save.upg.treasury, summons: 0, kills: 0, hp: maxHp, maxHp, queue: [], spawnT: 0, spawnEvery: 1, breakT: 1.2, speed: run?.speed || 1, botT: 1, topTier: 0, gemsEarned: 0, over: false };
  setState(State.PLAYING); playMusic('play'); updateHud();
  for (let i = 0; i < 2; i++) summon(true);
}
function updateHud() {
  if (!run) return;
  $('gold').textContent = run.gold; $('waveNum').textContent = Math.max(1, run.wave);
  $('hpFill').style.width = `${Math.max(0, (100 * run.hp) / run.maxHp)}%`; $('hpText').textContent = Math.max(0, Math.ceil(run.hp));
  const cost = summonCost(run.summons); $('summonCost').textContent = cost;
  $('btnSummon').classList.toggle('pulse', run.gold >= cost && slots.some((s) => !s.unit));
  $('btnSpeed').textContent = `${run.speed}×`;
  $('tierInfo').textContent = tierName(run.topTier);
}
function summon(free = false) {
  if (state !== State.PLAYING) return false;
  const empty = slots.filter((s) => !s.unit), cost = summonCost(run.summons);
  if (!empty.length) { if (!free && !AUTOPLAY) toast(t('noRoom')); return false; }
  if (!free && run.gold < cost) { if (!AUTOPLAY) toast(t('noGold')); return false; }
  if (!free) { run.gold -= cost; run.summons++; }
  const tier = Math.random() < save.upg.luck * 0.06 ? 1 : 0;
  const u = makeUnit(tier, empty[Math.floor(Math.random() * empty.length)]);
  u.obj.scale.multiplyScalar(0.01); u.pop = 0.25;
  burst(u.slot.pos.clone().setY(0.6), TIERS[tier].bolt, 10, 4); playSfx('summon', 0.7); updateHud();
  return true;
}
function mergeInto(a, b) { // a is dropped onto b (same tier): b's slot gets the next tier
  const tier = a.tier + 1, slot = b.slot;
  removeUnit(a); removeUnit(b);
  const u = makeUnit(tier, slot); u.obj.scale.multiplyScalar(0.01); u.pop = 0.3;
  const p = slot.pos.clone().setY(1.2);
  burst(p, TIERS[tier].bolt, 26, 7); burst(p, '#ffffff', 10, 4); shake(0.12 + tier * 0.02);
  floater(p.clone().setY(2.8), tierName(tier), 'merge'); playSfx('merge', 0.9);
  if (tier > run.topTier) { run.topTier = tier; if (tier >= 3) playSfx('levelUp', 0.7); }
  updateHud();
}
function autoMerge(manual = false) {
  if (state !== State.PLAYING) return false;
  const byTier = {};
  for (const u of units) if (u.tier < MAX_TIER) (byTier[u.tier] ??= []).push(u);
  const tier = Object.keys(byTier).map(Number).sort((x, y) => x - y).find((k) => byTier[k].length >= 2);
  if (tier === undefined) { if (manual && !AUTOPLAY) toast(t('noPairs')); return false; }
  const [a, b] = byTier[tier]; mergeInto(a, b); return true;
}
function toggleSpeed() { if (!run) return; run.speed = run.speed === 1 ? 2 : 1; updateHud(); }

function startWave() {
  run.wave++;
  const n = run.wave, count = Math.min(45, 4 + Math.round(n * 1.8)), golemEvery = n >= 3 ? Math.max(2, 5 - Math.floor(n / 4)) : 0;
  run.queue = Array.from({ length: count }, (_, i) => (golemEvery && i % golemEvery === golemEvery - 1 ? 'golem' : 'wolf'));
  const boss = n % 5 === 0;
  if (boss) run.queue.push('boss');
  run.spawnEvery = Math.max(0.42, 1.15 - n * 0.035); run.spawnT = 0.6;
  banner(t(boss ? 'bossBanner' : 'waveBanner', { n }), boss); playVoice(boss ? 'boss' : n === 1 || n % 5 === 1 ? 'wave' : '');
  updateHud();
}
function waveCleared() {
  const bonus = 5 + run.wave * 2; run.gold += bonus; updateHud();
  banner(t('cleared', { g: bonus })); playSfx('cleared', 0.6);
  run.breakT = 2.6;
  if (run.wave % 5 === 0) triggerMidgameAd(); // after each boss wave: the "between levels" moment
}
function castleHit(e) {
  run.hp -= e.def.dmg; updateHud();
  const p = new THREE.Vector3(LANE.gate - 1, 2, LANE.z);
  burst(p, '#c9b28a', 18, 6); floater(p.clone().setY(4), `-${e.def.dmg}`, 'dmg'); playSfx('castleHit'); shake(0.25 + e.def.dmg / 60);
  if (run.hp <= 0) gameOver();
}
function gameOver() {
  run.over = true; run.hp = 0; updateHud();
  playSfx('fall'); playSfx('over', 0.8); playVoice('fallen'); shake(1);
  for (let i = 0; i < 4; i++) burst(new THREE.Vector3(CASTLE.x + rand(-2, 2), rand(2, 6), LANE.z + rand(-2, 2)), i % 2 ? '#c9b28a' : '#ff8a3c', 30, 9);
  const reached = run.wave, isBest = reached > save.best;
  run.gemsEarned = reached * 3 + Math.floor(run.kills / 8);
  save.gems += run.gemsEarned; if (isBest) save.best = reached; saveData(SAVE_KEY, save);
  if (isBest && !CAPTURE) happytime();
  $('finalWave').textContent = reached; $('gemsEarned').textContent = run.gemsEarned; $('newBest').hidden = !isBest;
  $('btnDouble').hidden = !(adsAvailable() && run.gemsEarned > 0);
  setTimeout(() => { if (run.over && state === State.PLAYING) setState(State.GAMEOVER); }, CAPTURE ? 0 : 1400);
}

function step(dt) {
  if (state !== State.PLAYING || hold || !run || run.over) return;
  // waves
  if (!run.queue.length && !enemies.length) {
    if (run.breakT > 0) { run.breakT -= dt; if (run.breakT <= 0) startWave(); }
    else if (run.wave > 0) waveCleared();
  } else if (run.queue.length) {
    run.spawnT -= dt; if (run.spawnT <= 0) { spawnEnemy(run.queue.shift()); run.spawnT = run.spawnEvery; }
  }
  // enemies advance on the castle
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]; e.obj.position.x -= e.speed * dt;
    if (e.obj.position.x <= LANE.gate) { e.dead = true; scene.remove(e.obj); enemies.splice(i, 1); castleHit(e); if (run.over) return; }
  }
  // heroes: target the enemy closest to the castle that is not already doomed by bolts in flight
  const dmgMul = 1 + 0.1 * save.upg.power;
  const order = [...enemies].sort((a, b) => a.obj.position.x - b.obj.position.x);
  for (const u of units) {
    u.cooldown -= dt; u.idleT -= dt;
    if (u.idleT <= 0 && u.obj.userData.current !== u.obj.userData.actions?.idle) playClip(u.obj, 'idle');
    if (drag?.unit === u || u.cooldown > 0 || !order.length) continue;
    const target = order.find((e) => e.hp - e.incoming > 0 && e.obj.position.x < LANE.start - 1) || null;
    if (!target) continue;
    u.cooldown = 1 / unitRate(u.tier);
    const want = Math.atan2(target.obj.position.x - u.obj.position.x, target.obj.position.z - u.obj.position.z);
    u.obj.rotation.y = want; playClip(u.obj, 'slash', 0.08); u.idleT = 0.7;
    fireBolt(u.obj.position.clone().setY(1.3 * TIERS[u.tier].scale), target, unitDamage(u.tier) * dmgMul, TIERS[u.tier].bolt);
    if (performance.now() - audio.lastShoot > 70) { audio.lastShoot = performance.now(); playSfx('shoot', 0.18); }
  }
  updateBolts(dt);
  // autoplay bot (trailer capture / ?autoplay): merge first, then summon
  if (AUTOPLAY) { run.botT -= dt; if (run.botT <= 0) { run.botT = 0.55; if (!autoMerge()) summon(); } }
}

// ================================================================ LOOP
let last = performance.now(), acc = 0;
function animate(dt) { // visuals that also run in menus
  updateParticles(dt);
  for (const u of units) {
    u.obj.userData.mixer?.update(dt);
    if (u.pop > 0) { u.pop = Math.max(0, u.pop - dt); const k = 1 - u.pop / 0.3, s = TIERS[u.tier].scale * (k < 1 ? 0.01 + k * 1.15 : 1); u.obj.scale.setScalar(Math.min(s, TIERS[u.tier].scale * 1.15)); if (u.pop === 0) u.obj.scale.setScalar(TIERS[u.tier].scale); }
    if (state !== State.PLAYING) u.obj.rotation.y += (Math.PI - u.obj.rotation.y) * Math.min(1, dt * 3);
  }
  for (const e of enemies) { e.obj.userData.mixer?.update(dt * (e.type === 'boss' ? 0.7 : 1.2)); e.bar.quaternion.copy(camera.quaternion); }
}
function render(dt) {
  const portrait = innerHeight > innerWidth ? Math.min(2.1, 1.25 * (innerHeight / innerWidth)) : Math.max(1, 1.45 / (innerWidth / innerHeight));
  camera.position.copy(CAM_LOOK).add(CAM_OFFSET.clone().multiplyScalar(portrait));
  shakeAmt = Math.max(0, shakeAmt - dt * 2);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(CAM_LOOK);
  renderer.render(scene, camera);
}
function advance(dt) { // one rendered frame's worth of simulation
  if (state !== State.PAUSED) {
    const sim = dt * (state === State.PLAYING && run ? run.speed : 1);
    acc += sim; while (acc >= STEP) { step(STEP); acc -= STEP; }
    animate(sim);
  }
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
  lang = (params.get('lang') || crazySdk?.user?.systemInfo?.locale || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n(); $('hint').textContent = t(matchMedia('(pointer: coarse)').matches ? 'hintTouch' : 'hintDesktop');
  initAudio();
  const loads = [...Object.keys(ASSETS.models).map((id) => track(loadModel(id))), ...Object.entries(ASSETS.sfx).map(([k, u]) => track(loadSfx(k, u)))];
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 20000))]); // never hang on a slow asset
  const saved = loadData(SAVE_KEY, null);
  if (saved) save = { ...save, ...saved, upg: { ...save.upg, ...(saved.upg || {}) } };
  buildWorld(); resize();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  demoGrid(); setState(State.MENU);
  if (CAPTURE) {
    window.__game = {
      start: () => { startRun(); },
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) advance(STEP); },
      info: () => ({ state, wave: run?.wave, gold: run?.gold, units: units.map((u) => u.tier), enemies: enemies.length, hp: run?.hp }),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
