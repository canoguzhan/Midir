// Tumblewool: tilt a floating farm island so its round, fluffy sheep tumble into the barn.
// Sections: CONFIG, I18N, SDK, AUDIO, WORLD, BOARD, ACTORS, FX, INPUT, STATE, UI, GAMEPLAY, LOOP, CAPTURE, BOOT.
// The rules live in sim.js (pure, also used by the level tests); this file renders the world and reacts to its events.
// Everything is procedural Three.js plus baked sounds in ./assets/ (with synthesized fallbacks). No keys, no backend.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIM, createWorld, step as simStep, botInput, stars as starsOf, cellAt } from './sim.js';
import { LEVELS, ISLANDS } from './levels.js';

// ================================================================ CONFIG
const SAVE_KEY = 'tumblewool';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // the bot plays by itself (trailer footage, balance tests)
const CFG = {
  maxTilt: 0.2,          // radians the island visibly tips at full input
  dragRadius: 0.11,      // fraction of the short screen side for a full-tilt drag
  introTime: 0.75,       // island drop-in before the sheep start rolling
  winDelay: 1.4,         // sheep celebrate in the pen before the results card
  autoNext: 2.6,         // capture/autoplay: results card stays this long
  pitch: 0.98,           // camera pitch (radians from horizontal)
  fov: 36,
  wool: { base: 3, perSheep: 1, perStar: 2, firstClear: 5 },
};
const COATS = [
  { id: 'cloud', price: 0, color: '#f7f4ee', name: { en: 'Cloud', tr: 'Bulut' } },
  { id: 'cream', price: 10, color: '#f3dcb0', name: { en: 'Cream', tr: 'Krem' } },
  { id: 'cocoa', price: 18, color: '#a5714d', name: { en: 'Cocoa', tr: 'Kakao' } },
  { id: 'midnight', price: 26, color: '#5a5268', name: { en: 'Midnight', tr: 'Gece' } },
  { id: 'bubblegum', price: 34, color: '#f8a9c9', name: { en: 'Bubblegum', tr: 'Sakız' } },
  { id: 'mint', price: 42, color: '#a5e5c4', name: { en: 'Mint', tr: 'Nane' } },
  { id: 'sky', price: 50, color: '#a7d3f7', name: { en: 'Sky', tr: 'Gökyüzü' } },
  { id: 'sunny', price: 60, color: '#ffe27a', name: { en: 'Sunny', tr: 'Güneş' } },
  { id: 'rainbow', price: 80, color: 'rainbow', name: { en: 'Rainbow', tr: 'Gökkuşağı' } },
  { id: 'golden', price: 110, color: '#ffcf5a', name: { en: 'Golden', tr: 'Altın' } },
];
const RAINBOW = ['#ffb3b3', '#ffd59e', '#fff2a1', '#b8f0b0', '#a9dcff', '#d3b8ff'];
const PAL = { // one palette per island: same style, different season
  meadow: { skyTop: '#62bdf0', skyBot: '#e2f5ff', fog: '#d4ecfa', grassA: '#8fd16a', grassB: '#82c55f', dirt: '#b47b4f', rock: '#8d6c57',
    hedge: '#4ea545', leaf: ['#5cba4e', '#79cc5a'], trunk: '#8a5a33', flower: ['#ffffff', '#ffd84d', '#ff9ec4'], cap: '#e8483f', roof: '#7b3b2e',
    hemiSky: '#ffffff', hemiGround: '#7d9a5a', sun: '#fff1d6', pine: false, cloud: '#ffffff', blade: ['#e8483f', '#ffffff'] },
  hay: { skyTop: '#7fc2ea', skyBot: '#fff0d8', fog: '#f8ecd8', grassA: '#c4d36b', grassB: '#b6c75f', dirt: '#b97f4c', rock: '#93704f',
    hedge: '#7ea83f', leaf: ['#e9a43a', '#d9822b'], trunk: '#7a4a2a', flower: ['#ffe27a', '#ffffff', '#e8483f'], cap: '#e0622b', roof: '#6f3326',
    hemiSky: '#fff6e6', hemiGround: '#a0884a', sun: '#ffe2b0', pine: false, cloud: '#fff7ea', blade: ['#e0622b', '#fff2d6'] },
  frost: { skyTop: '#86aee6', skyBot: '#eef5ff', fog: '#e3ecf8', grassA: '#dce7f3', grassB: '#cfdcec', dirt: '#8f8ca6', rock: '#7c7a94',
    hedge: '#e8f0fa', leaf: ['#2f7a5f', '#3b8d6c'], trunk: '#6b4a3a', flower: ['#ffffff', '#cfe6ff', '#ffffff'], cap: '#4a8fe0', roof: '#f4f8ff',
    hemiSky: '#ffffff', hemiGround: '#9aa6c0', sun: '#ffffff', pine: true, cloud: '#ffffff', blade: ['#4a8fe0', '#ffffff'] },
  wind: { skyTop: '#8a93dc', skyBot: '#ffe0c8', fog: '#fbe3d2', grassA: '#a2d477', grassB: '#95c86c', dirt: '#ad6b49', rock: '#8f6550',
    hedge: '#cbb699', leaf: ['#58a64e', '#e8b24a'], trunk: '#7a4a2a', flower: ['#ffffff', '#ffb36b', '#d8a8ff'], cap: '#b25ae0', roof: '#5e3a6e',
    hemiSky: '#ffe9d6', hemiGround: '#8a7a5a', sun: '#ffd3a0', pine: false, cloud: '#fff0e6', blade: ['#b25ae0', '#ffffff'] },
};
const ASSETS = {
  sfx: {
    baaA: 'assets/audio/wool_baa_a.mp3', baaB: 'assets/audio/wool_baa_b.mp3', barn: 'assets/audio/wool_barn.mp3',
    bump: 'assets/audio/wool_bump.mp3', bale: 'assets/audio/wool_bale.mp3', boing: 'assets/audio/wool_boing.mp3',
    mud: 'assets/audio/wool_mud.mp3', crack: 'assets/audio/wool_crack.mp3', plate: 'assets/audio/wool_plate.mp3',
    star: 'assets/audio/wool_star.mp3', done: 'assets/audio/wool_level_done.mp3', clover: 'assets/audio/bloom_petal.mp3',
    gate: 'assets/audio/bloom_zone.mp3', fall: 'assets/audio/whirl_ringout.mp3', click: 'assets/audio/ui_click.mp3',
    unlock: 'assets/audio/unlock.mp3', confetti: 'assets/audio/whirl_confetti.mp3',
    fanLoop: 'assets/audio/wool_fan.mp3', rollLoop: 'assets/audio/wool_roll_loop.mp3', birds: 'assets/audio/bloom_birds.mp3',
  },
  music: { meadow: 'assets/audio/bgm_wool_meadow.mp3', frost: 'assets/audio/bgm_wool_frost.mp3' },
};

// ================================================================ I18N (English required; Turkish too)
const STRINGS = {
  en: {
    play: 'Play', levels: 'Levels', flock: 'Flock', flockTitle: 'Your flock', back: 'Back', wool: 'wool', paused: 'Paused', resume: 'Resume',
    restart: 'Restart', menu: 'Menu', next: 'Next', replay: 'Replay', double: '▶ Double wool', doubled: 'Wool doubled!',
    adUnavailable: 'Ad not available right now', flockHome: 'Flock home!', starHome: 'All sheep home', starClover: 'All clovers {n}',
    starPar: 'Under {t}', tagline: 'Tilt the island. Roll the flock home.', skipTips: 'Skip tips', newStars: '+{n} new ★', locked: 'Locked',
    owned: 'Owned', wear: 'Wear', wearing: 'Wearing', needWool: 'Not enough wool yet', islandDone: 'Island complete!', allDone: 'Every flock is home!',
    tipTilt: 'Tilt the island to roll the sheep', tipBarn: 'Roll the sheep into the barn', tipEdge: 'No fence here: sheep can tumble off the edge!',
    tipFlock: 'All sheep roll the same way. Use the hedges to line them up', tipBumper: 'Mushrooms bounce sheep away. Boing!',
    tipMud: 'Mud is sticky and slows everything down', tipPlate: 'Roll the hay bale onto the golden plate', tipGate: 'The gate is open: bring the sheep home!',
    tipIce: 'Ice is slippery. Tilt gently!', tipCrack: 'Thin ice breaks after something rolls off it. Cross together!', tipFan: 'Windmill fans blow sheep along',
    or: 'or',
  },
  tr: {
    play: 'Oyna', levels: 'Bölümler', flock: 'Sürü', flockTitle: 'Sürün', back: 'Geri', wool: 'yün', paused: 'Duraklatıldı', resume: 'Devam',
    restart: 'Yeniden', menu: 'Menü', next: 'Sonraki', replay: 'Tekrar', double: '▶ Yünü ikiye katla', doubled: 'Yün ikiye katlandı!',
    adUnavailable: 'Şu anda reklam yok', flockHome: 'Sürü evde!', starHome: 'Bütün kuzular evde', starClover: 'Bütün yoncalar {n}',
    starPar: '{t} altında', tagline: 'Adayı eğ. Sürüyü eve yuvarla.', skipTips: 'İpuçlarını geç', newStars: '+{n} yeni ★', locked: 'Kilitli',
    owned: 'Sende', wear: 'Giy', wearing: 'Giyili', needWool: 'Henüz yeterli yün yok', islandDone: 'Ada tamamlandı!', allDone: 'Bütün sürüler evde!',
    tipTilt: 'Kuzuları yuvarlamak için adayı eğ', tipBarn: 'Kuzuyu ahıra yuvarla', tipEdge: 'Burada çit yok: kuzular kenardan düşebilir!',
    tipFlock: 'Bütün kuzular aynı yöne yuvarlanır. Çitleri kullanarak onları hizala', tipBumper: 'Mantarlar kuzuları sektirir. Boing!',
    tipMud: 'Çamur yapışkandır, her şeyi yavaşlatır', tipPlate: 'Saman balyasını altın levhaya yuvarla', tipGate: 'Kapı açıldı: kuzuları eve getir!',
    tipIce: 'Buz kaygandır. Yavaşça eğ!', tipCrack: 'İnce buz, üstünden bir şey geçince kırılır. Birlikte geçin!', tipFan: 'Yel değirmeni pervaneleri kuzuları iter',
    or: 'ya da',
  },
};
let lang = 'en';
const t = (k, vars) => { let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
const nm = (o) => o?.[lang] ?? o?.en ?? '';
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
const adsAvailable = () => sdkReady() && !adsFailed && !!crazySdk.ad;
function sdkCall(fn) { if (!sdkReady()) return; try { fn(crazySdk); } catch (e) { console.warn('[CrazyGames]', e); } }
function sdkLocale() { if (!sdkReady()) return null; try { return crazySdk.user?.systemInfo?.locale || null; } catch { return null; } }
function applySdkSettings(s) { if (s?.muteAudio) muteAudio('sdk'); else unmuteAudio('sdk'); } // platform mute overrides everything

function onGameplayStart() { if (gameplayActive) return; gameplayActive = true; sdkCall((s) => s.game.gameplayStart()); }
function onGameplayStop() { if (!gameplayActive) return; gameplayActive = false; sdkCall((s) => s.game.gameplayStop()); }
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: an island completed

// Midgame: only between levels (the Next button), never on navigation buttons. Mute on adStarted; always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, on the results card only, reward only on adFinished. On error the button is hidden for the
// session, so it never "does nothing" (Basic Launch has ads off, adblockers block them).
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
  if (CAPTURE) return fallback;
  let v = null;
  if (sdkReady() && crazySdk.data) try { v = crazySdk.data.getItem(key); } catch {}
  if (v == null) try { v = localStorage.getItem(key); } catch {}
  try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}

// ================================================================ AUDIO (Web Audio SFX + synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  baaA: ['sawtooth', 520, 430, 0.35, 0.06], baaB: ['sawtooth', 700, 560, 0.3, 0.06], barn: ['triangle', 880, 1320, 0.3, 0.12],
  bump: ['sine', 180, 90, 0.12, 0.16], bale: ['triangle', 140, 70, 0.15, 0.16], boing: ['sine', 220, 660, 0.25, 0.14],
  mud: ['sawtooth', 120, 60, 0.18, 0.08], crack: ['square', 1800, 400, 0.15, 0.05], plate: ['square', 300, 300, 0.08, 0.08],
  star: ['triangle', 1200, 1800, 0.25, 0.1], done: ['triangle', 660, 1320, 0.7, 0.14], clover: ['sine', 1320, 1980, 0.15, 0.1],
  gate: ['triangle', 400, 800, 0.4, 0.1], fall: ['sine', 700, 120, 0.6, 0.12], click: ['square', 900, 900, 0.03, 0.08],
  unlock: ['triangle', 600, 1200, 0.4, 0.12], confetti: ['square', 1500, 2500, 0.12, 0.05], pop: ['sine', 500, 900, 0.1, 0.1],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0, loops: {} };

function initAudio() {
  try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.master = audio.ctx.createGain(); audio.master.connect(audio.ctx.destination); }
  catch { audio.ctx = null; }
}
async function loadSfx(key, url) {
  if (!audio.ctx || CAPTURE) return;
  try { const r = await fetch(url); if (r.ok) audio.buffers[key] = await audio.ctx.decodeAudioData(await r.arrayBuffer()); } catch {} // missing -> synth
}
function unlockAudio() { // iOS: resume inside a user gesture
  if (audio.ctx?.state === 'suspended') audio.ctx.resume();
  if (audio.wantMusic && audio.music?.paused && !audio.muted.size) audio.music.play().catch(() => {});
}
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 14 || CAPTURE) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime;
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12); g.gain.value = vol * 0.8;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function loopGain(key, target) { // looping beds (rolling wool, fans, birds): created on demand, faded every frame
  if (!audio.ctx || CAPTURE) return;
  let L = audio.loops[key];
  if (!L) {
    if (!audio.buffers[key]) return;
    const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain(); s.buffer = audio.buffers[key]; s.loop = true; g.gain.value = 0;
    s.connect(g); g.connect(audio.master); s.start(); L = audio.loops[key] = { s, g, v: 0 };
  }
  L.v += (target - L.v) * 0.08; L.g.gain.value = L.v;
}
function playMusic(key) {
  audio.wantMusic = true;
  if (CAPTURE) return;
  if (audio.musicKey !== key) {
    if (audio.music) { audio.music.pause(); audio.music = null; }
    audio.musicKey = key;
    const url = ASSETS.music[key]; if (!url) return;
    audio.music = new Audio(url); audio.music.loop = true; audio.music.volume = 0.32; audio.music.onerror = () => { audio.music = null; };
  }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
}

// ================================================================ WORLD (sky, light, distant islands)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight('#ffffff', '#7d9a5a', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = smoothstep(-0.35, 0.75, vP.y); gl_FragColor = vec4(mix(bot, top, h), 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), skyMat); scene.add(sky);
const boardHolder = new THREE.Group(); scene.add(boardHolder);
const envGroup = new THREE.Group(); scene.add(envGroup);
let envKey = null, shakeAmt = 0;

// geometry helpers: vertex-coloured, non-indexed parts merged into one mesh (flat-shaded low-poly look)
function part(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv'); g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const merged = (parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; };
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
const rnd = (a, b) => a + Math.random() * (b - a);
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function cloudGeo(r, color) {
  const parts = [], R = seeded(Math.round(r * 1000));
  for (let i = 0; i < 6; i++) parts.push(part(new THREE.IcosahedronGeometry(r * (0.55 + R() * 0.4), 1), color, { x: (i - 2.5) * r * 0.55, y: R() * r * 0.35, z: (R() - 0.5) * r * 0.6 }));
  return merged(parts);
}
function buildEnvironment(key) {
  if (envKey === key) return;
  envKey = key; const pal = PAL[key];
  while (envGroup.children.length) { const o = envGroup.children.pop(); o.geometry?.dispose(); }
  skyMat.uniforms.top.value.set(pal.skyTop); skyMat.uniforms.bot.value.set(pal.skyBot);
  scene.fog = new THREE.Fog(pal.fog, 40, 140);
  hemi.color.set(pal.hemiSky); hemi.groundColor.set(pal.hemiGround); sun.color.set(pal.sun);
  const R = seeded(key.length * 977 + 13);
  for (let i = 0; i < 14; i++) { // soft clouds drifting below and around the island
    const a = (i / 14) * Math.PI * 2 + R() * 0.4, d = 14 + R() * 24, y = -14 - R() * 9;
    const m = new THREE.Mesh(cloudGeo(1.1 + R() * 1.3, pal.cloud), vcMat); m.position.set(Math.cos(a) * d, y, Math.sin(a) * d - 6);
    m.userData.drift = 0.15 + R() * 0.25; m.userData.a = a; m.userData.d = d; envGroup.add(m);
  }
  for (let i = 0; i < 6; i++) { // little far-off floating islands with a tree or two
    const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9 + R() * 0.2, d = 18 + R() * 16, s = 1.2 + R() * 1.6;
    const parts = [part(new THREE.CylinderGeometry(1, 0.9, 0.35, 7), pal.grassA, { y: 0 }), part(new THREE.ConeGeometry(0.9, 2.2, 6), pal.dirt, { y: -1.25, rx: Math.PI })];
    if (R() < 0.8) parts.push(...treeParts(pal, R, 0.25, 0.17, 0.2));
    const m = new THREE.Mesh(merged(parts), vcMat); m.scale.setScalar(s); m.position.set(Math.cos(a) * d, -6 - R() * 5, Math.sin(a) * d - 4);
    m.userData.bob = R() * 6; envGroup.add(m);
  }
}
function treeParts(pal, R, x = 0, z = 0, y = 0) {
  const p = [part(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 6), pal.trunk, { x, z, y: y + 0.22 })];
  if (pal.pine) {
    p.push(part(new THREE.ConeGeometry(0.4, 0.55, 7), pal.leaf[0], { x, z, y: y + 0.6 }), part(new THREE.ConeGeometry(0.3, 0.45, 7), pal.leaf[1], { x, z, y: y + 0.9 }),
      part(new THREE.ConeGeometry(0.14, 0.16, 7), '#ffffff', { x, z, y: y + 1.12 }));
  } else {
    p.push(part(new THREE.IcosahedronGeometry(0.36, 0), pal.leaf[0], { x, z, y: y + 0.68 }), part(new THREE.IcosahedronGeometry(0.26, 0), pal.leaf[1], { x: x + 0.12, z: z - 0.05, y: y + 0.95 }));
  }
  return p;
}

// ================================================================ BOARD (the island for one level)
let world = null, board = null, levelIndex = 0;
const tileGeo = new THREE.BoxGeometry(1, 0.3, 1); tileGeo.translate(0, -0.15, 0);
const dirtGeo = new THREE.BoxGeometry(1, 0.55, 1); dirtGeo.translate(0, -0.575, 0);
const spikeGeo = new THREE.ConeGeometry(0.62, 1, 5); spikeGeo.rotateX(Math.PI); spikeGeo.translate(0, -0.5, 0);
const matCache = {};
function mat(key, make) { return (matCache[key] ??= make()); }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}
const crackTex = (heavy) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#d6f1ff'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  g.strokeStyle = heavy ? 'rgba(60,110,150,.85)' : 'rgba(90,140,180,.55)'; g.lineWidth = heavy ? 3 : 2;
  const R = seeded(heavy ? 7 : 3);
  for (let i = 0; i < (heavy ? 7 : 3); i++) {
    g.beginPath(); let x = w / 2, y = h / 2; g.moveTo(x, y);
    const a = R() * Math.PI * 2; for (let k = 0; k < 4; k++) { x += Math.cos(a + (R() - 0.5)) * 18; y += Math.sin(a + (R() - 0.5)) * 18; g.lineTo(x, y); }
    g.stroke();
  }
});
const strawTex = () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#e8c062'; g.fillRect(0, 0, w, h); const R = seeded(11);
  for (let i = 0; i < 90; i++) { g.strokeStyle = R() < 0.5 ? 'rgba(170,120,40,.55)' : 'rgba(255,236,160,.8)'; g.lineWidth = 1 + R() * 1.5; const y = R() * h; g.beginPath(); g.moveTo(R() * w, y); g.lineTo(R() * w, y + (R() - 0.5) * 6); g.stroke(); }
});
const mudTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#a0704a'; g.fillRect(0, 0, w, h); const R = seeded(23);
  for (let i = 0; i < 9; i++) { g.fillStyle = R() < 0.5 ? '#7d5233' : '#8a5d3b'; g.beginPath(); g.ellipse(R() * w, R() * h, 10 + R() * 22, 7 + R() * 14, R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,240,220,.45)'; g.beginPath(); g.ellipse(R() * w, R() * h, 2 + R() * 4, 1.5 + R() * 2, 0, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(90,55,30,.5)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
});
const baleEndTex = () => canvasTex(64, 64, (g, w) => {
  g.fillStyle = '#e2b650'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(150,100,30,.6)'; g.lineWidth = 2;
  g.beginPath(); for (let a = 0; a < 26; a += 0.2) { const r = a * 1.2; g.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } g.stroke();
});

function disposeBoard() {
  if (!board) return;
  boardHolder.remove(board.root);
  board.root.traverse((o) => { if (o.geometry && !o.userData.shared && !GLOBAL_GEOS.has(o.geometry)) o.geometry.dispose(); });
  board = null;
}
function instanced(geo, material, list, place) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, material, list.length), d = new THREE.Object3D(), c = new THREE.Color();
  list.forEach((it, i) => { d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); const col = place(d, it, i); d.updateMatrix(); m.setMatrixAt(i, d.matrix); if (col) m.setColorAt(i, c.set(col)); });
  m.castShadow = m.receiveShadow = true; return m;
}

function buildBoard(w) {
  disposeBoard();
  const def = w.def, pal = PAL[ISLANDS[def.island].key], W = w.W, H = w.H, grid = w.grid;
  buildEnvironment(ISLANDS[def.island].key);
  const root = new THREE.Group(); boardHolder.add(root);
  const b = board = { root, W, H, pal, gates: new Map(), plates: new Map(), thin: new Map(), bumpers: [], clovers: [], fans: [], sheep: [], bales: [], barnCells: [], barns: [] };
  const lx = (x) => x + 0.5 - W / 2, lz = (z) => z + 0.5 - H / 2;
  b.lx = lx; b.lz = lz;
  const R = seeded(levelIndex * 7919 + 17);
  // distance to the nearest edge, for the rocky underside
  const edge = new Array(W * H).fill(99), q = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { if (grid[z * W + x] === ' ') continue; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => cellAt(w, x + dx, z + dz) === ' ')) { edge[z * W + x] = 0; q.push(z * W + x); } }
  while (q.length) { const i = q.shift(), x = i % W, z = (i / W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H || grid[nz * W + nx] === ' ') continue; const j = nz * W + nx; if (edge[j] > edge[i] + 1) { edge[j] = edge[i] + 1; q.push(j); } } }
  const lists = { grass: [], straw: [], mud: [], ice: [], dirt: [], pond: [], hedge: [], tree: [], rock: [], flower: [] };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = grid[z * W + x]; if (c === ' ') continue;
    const it = { x, z, c };
    if (c === 'm') lists.mud.push(it); else if (c === 'i') lists.ice.push(it); else if (c === 'B') lists.straw.push(it);
    else if (c === 'x') { /* thin ice: own mesh per cell below */ } else lists.grass.push(it);
    if (c !== 'x') lists.dirt.push(it); else lists.pond.push(it); // thin ice sits over icy water
    if (c === '#') lists.hedge.push(it); if (c === 'T') lists.tree.push(it); if (c === 'r') lists.rock.push(it);
    if ('.S'.includes(c) && R() < 0.35) lists.flower.push({ x: x + (R() < 0.5 ? 0.12 : 0.88), z: z + (R() < 0.5 ? 0.12 : 0.88), k: (R() * 3) | 0 });
    if (c === 'B') b.barnCells.push(z * W + x);
  }
  const add = (m) => { if (m) root.add(m); return m; };
  const grassMat = mat('grass', () => new THREE.MeshStandardMaterial({ roughness: 0.95, color: '#ffffff' }));
  add(instanced(tileGeo, grassMat, lists.grass, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); return (it.x + it.z) % 2 ? pal.grassA : pal.grassB; }));
  add(instanced(tileGeo, mat('straw', () => new THREE.MeshStandardMaterial({ roughness: 1, map: strawTex() })), lists.straw, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); }));
  add(instanced(tileGeo, mat('mud', () => new THREE.MeshStandardMaterial({ roughness: 0.3, map: mudTex() })), lists.mud, (d, it) => { d.position.set(lx(it.x), -0.02, lz(it.z)); d.rotation.y = (it.x * 3 + it.z) % 4 * Math.PI / 2; }));
  add(instanced(tileGeo, mat('ice', () => new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.05, color: '#ffffff', emissive: '#7fb8e0', emissiveIntensity: 0.18 })), lists.ice, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); return (it.x + it.z) % 2 ? '#a9ddff' : '#9bd5fb'; }));
  const dirtMat = mat('dirt', () => new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, color: '#ffffff' }));
  add(instanced(dirtGeo, dirtMat, lists.dirt, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); return new THREE.Color(pal.dirt).offsetHSL(0, 0, (R() - 0.5) * 0.05).getStyle(); }));
  add(instanced(tileGeo, mat('pond', () => new THREE.MeshStandardMaterial({ color: '#3d7fb8', roughness: 0.2, emissive: '#1d4f80', emissiveIntensity: 0.3 })), lists.pond, (d, it) => { d.position.set(lx(it.x), -0.42, lz(it.z)); d.scale.set(1, 0.5, 1); }));
  add(instanced(spikeGeo, dirtMat, lists.dirt, (d, it) => {
    const e = edge[it.z * W + it.x], depth = 0.5 + Math.min(e, 4) * 0.55 + R() * 0.5;
    d.position.set(lx(it.x) + (R() - 0.5) * 0.15, -0.85, lz(it.z) + (R() - 0.5) * 0.15); d.scale.set(0.9 + R() * 0.3, depth, 0.9 + R() * 0.3); d.rotation.y = R() * 3;
    return new THREE.Color(pal.rock).offsetHSL(0, 0, (R() - 0.5) * 0.08).getStyle();
  }));
  // hedges / snowbanks / stone walls
  const hedgeGeo = merged([part(new THREE.BoxGeometry(0.94, 0.5, 0.94), '#ffffff', { y: 0.25 }),
    ...[[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24], [0, 0]].map(([x, z], i) => part(new THREE.IcosahedronGeometry(i === 4 ? 0.3 : 0.25, 0), '#ffffff', { x, z, y: 0.52 }))]);
  const hm = add(instanced(hedgeGeo, mat('hedge', () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 })), lists.hedge, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); d.rotation.y = ((R() * 4) | 0) * Math.PI / 2; return new THREE.Color(pal.hedge).offsetHSL(0, 0, (R() - 0.5) * 0.06).getStyle(); }));
  if (hm) hm.userData.geo = hedgeGeo;
  const treeGeo = merged(treeParts(pal, R)); treeGeo.scale(1.25, 1.25, 1.25);
  add(instanced(treeGeo, vcMat, lists.tree, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); d.rotation.y = R() * 6; d.scale.setScalar(0.9 + R() * 0.25); }));
  const rockGeo = merged([part(new THREE.DodecahedronGeometry(0.36, 0), '#a7a2a0', { y: 0.25, sy: 0.8 }), part(new THREE.DodecahedronGeometry(0.2, 0), '#bdb8b3', { x: 0.25, z: 0.18, y: 0.12 })]);
  add(instanced(rockGeo, vcMat, lists.rock, (d, it) => { d.position.set(lx(it.x), 0, lz(it.z)); d.rotation.y = R() * 6; }));
  const flowerGeo = merged([part(new THREE.IcosahedronGeometry(0.055, 0), '#ffffff', { y: 0.05 })]);
  add(instanced(flowerGeo, mat('flower', () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 })), lists.flower, (d, it) => { d.position.set(it.x - W / 2, 0, it.z - H / 2); return pal.flower[it.k]; }));
  // thin ice tiles (each can break)
  const thinMats = { side: mat('thinSide', () => new THREE.MeshStandardMaterial({ color: '#cfeeff', roughness: 0.1, transparent: true, opacity: 0.85 })),
    a: mat('thinA', () => new THREE.MeshStandardMaterial({ map: crackTex(false), roughness: 0.1, transparent: true, opacity: 0.92 })),
    b: mat('thinB', () => new THREE.MeshStandardMaterial({ map: crackTex(true), roughness: 0.1, transparent: true, opacity: 0.92 })) };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (grid[z * W + x] === 'x') {
    const m = new THREE.Mesh(tileGeo, [thinMats.side, thinMats.side, thinMats.a, thinMats.side, thinMats.side, thinMats.side]);
    m.userData.shared = true; m.position.set(lx(x), 0, lz(z)); m.receiveShadow = true; root.add(m); b.thin.set(z * W + x, { m, mats: thinMats, drop: 0 });
  }
  buildBarns(w, b, root);
  // plates, gates, bumpers, clovers, fans
  for (const pi of w.plates) {
    const x = pi % W, z = (pi / W) | 0, g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.47, 0.08, 20), mat('stone', () => new THREE.MeshStandardMaterial({ color: '#b9b0a2', roughness: 0.9 })));
    ring.position.y = 0.04; ring.receiveShadow = true;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.1, 20), new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.4, metalness: 0.2, emissive: '#ff9a00', emissiveIntensity: 0.15 }));
    btn.position.y = 0.09; btn.castShadow = true; g.add(ring, btn); g.position.set(lx(x), 0, lz(z)); root.add(g); b.plates.set(pi, { g, btn, down: 0 });
  }
  for (const gi of w.gates) {
    const x = gi % W, z = (gi / W) | 0, alongX = '#HTr'.includes(cellAt(w, x - 1, z)) || '#HTr'.includes(cellAt(w, x + 1, z));
    const parts = [];
    for (let i = -1; i <= 1; i++) parts.push(part(new THREE.BoxGeometry(0.2, 0.62, 0.12), '#a8703f', { x: i * 0.3, y: 0.31 }));
    parts.push(part(new THREE.BoxGeometry(0.98, 0.1, 0.14), '#ffc93c', { y: 0.48 }), part(new THREE.BoxGeometry(0.98, 0.1, 0.14), '#8a5a33', { y: 0.16 }));
    const m = new THREE.Mesh(merged(parts), vcMat); m.castShadow = true; if (!alongX) m.rotation.y = Math.PI / 2;
    const g = new THREE.Group(); g.add(m); g.position.set(lx(x), 0, lz(z)); root.add(g); b.gates.set(gi, { g, m, open: 0 });
  }
  const capGeo = (() => {
    const p = [part(new THREE.CylinderGeometry(0.11, 0.15, 0.3, 8), '#f3e6d0', { y: 0.15 }), part(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pal.cap, { y: 0.27, sy: 0.75 })];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push(part(new THREE.IcosahedronGeometry(0.055, 0), '#ffffff', { x: Math.cos(a) * 0.2, z: Math.sin(a) * 0.2, y: 0.4 })); }
    p.push(part(new THREE.IcosahedronGeometry(0.06, 0), '#ffffff', { y: 0.51 }));
    return merged(p);
  })();
  for (const bm of w.bumpers) {
    const m = new THREE.Mesh(capGeo, vcMat); m.castShadow = true; m.position.set(bm.x - W / 2, 0, bm.z - H / 2); root.add(m); b.bumpers.push({ m, squash: 0, hitSeen: 0 });
  }
  const cloverGeo = merged([0, 1, 2, 3].map((i) => part(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), '#46b84f', { x: Math.cos(i * Math.PI / 2 + 0.785) * 0.12, z: Math.sin(i * Math.PI / 2 + 0.785) * 0.12 }))
    .concat([part(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 4), '#2f8a3a', { y: -0.1, z: 0.06, rx: 0.4 })]));
  const cloverMat = mat('clover', () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: '#3be05a', emissiveIntensity: 0.55 }));
  for (const cl of w.clovers) {
    const m = new THREE.Mesh(cloverGeo, cloverMat); m.castShadow = true; m.rotation.x = -0.6; m.scale.setScalar(1.45); const g = new THREE.Group(); g.add(m);
    g.position.set(cl.x - W / 2, 0.42, cl.z - H / 2); root.add(g); b.clovers.push({ g, taken: 0 });
  }
  for (const f of w.fans) {
    const g = new THREE.Group(); g.position.set(lx(f.x), 0, lz(f.z));
    const base = new THREE.Mesh(merged([part(new THREE.BoxGeometry(0.74, 0.5, 0.74), '#c98d5a', { y: 0.25 }), part(new THREE.ConeGeometry(0.56, 0.4, 4), pal.roof, { y: 0.7, ry: Math.PI / 4 })]), vcMat);
    base.castShadow = true; g.add(base);
    const hub = new THREE.Group(); hub.position.set(f.dir[0] * 0.42, 0.62, f.dir[1] * 0.42); hub.rotation.y = Math.atan2(f.dir[0], f.dir[1]);
    const blades = new THREE.Mesh(merged([0, 1, 2, 3].map((i) => part(new THREE.BoxGeometry(0.2, 0.56, 0.03), pal.blade[i % 2], { y: 0.28, rz: 0 }).rotateZ(i * Math.PI / 2))
      .concat([part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), '#6b4423', { rx: Math.PI / 2 })])), vcMat);
    blades.castShadow = true; hub.add(blades); g.add(hub); root.add(g); b.fans.push({ g, blades, f, spawn: R() });
  }
  // actors
  for (const body of w.bodies) {
    const a = body.kind === 'sheep' ? makeSheep(b.sheep.length) : makeBale();
    a.body = body; root.add(a.g); (body.kind === 'sheep' ? b.sheep : b.bales).push(a);
  }
  // camera framing + shadow box
  const span = Math.max(W, H);
  Object.assign(sun.shadow.camera, { left: -span * 0.8, right: span * 0.8, top: span * 0.8, bottom: -span * 0.8, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  return b;
}

function buildBarns(w, b, root) {
  const W = w.W, seen = new Set();
  for (let i = 0; i < w.grid.length; i++) {
    if (w.grid[i] !== 'H' || seen.has(i)) continue;
    const cells = [], q = [i]; seen.add(i);
    while (q.length) { const c = q.pop(); cells.push(c); const x = c % W, z = (c / W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (z + dz) * W + x + dx; if (x + dx >= 0 && x + dx < W && z + dz >= 0 && z + dz < w.H && w.grid[n] === 'H' && !seen.has(n)) { seen.add(n); q.push(n); } } }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const c of cells) { const x = c % W, z = (c / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let bx = 0, bz = 0, n = 0; for (const c of b.barnCells) { bx += c % W + 0.5; bz += ((c / W) | 0) + 0.5; n++; }
    const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2; let dx = n ? bx / n - cx : 0, dz = n ? bz / n - cz : 1;
    const yaw = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
    const sideways = Math.abs(dx) > Math.abs(dz), fw = sideways ? z1 - z0 + 1 : x1 - x0 + 1, fd = sideways ? x1 - x0 + 1 : z1 - z0 + 1;
    const wallH = 0.95, red = '#cc4a3c', white = '#fff6e8', roof = b.pal.roof, p = [];
    p.push(part(new THREE.BoxGeometry(fw * 0.94, wallH, fd * 0.9), red, { y: wallH / 2 }));
    const rr = (fw * 0.94) / Math.sqrt(3) * 1.12; // triangular prism roof (a 3-sided cylinder lying down)
    p.push(part(new THREE.CylinderGeometry(rr, rr, fd * 1.0, 3), roof, { sz: 0.52, rx: -Math.PI / 2, y: wallH + rr * 0.26 - 0.02 }));
    p.push(part(new THREE.BoxGeometry(fw * 0.98, 0.08, fd * 0.94), white, { y: wallH }));
    const dw = Math.min(fw * 0.5, 1.3), dh = wallH * 0.82, front = fd * 0.45 + 0.01;
    p.push(part(new THREE.BoxGeometry(dw, dh, 0.04), '#4a2a1e', { y: dh / 2, z: front }));
    p.push(part(new THREE.BoxGeometry(dw + 0.12, 0.08, 0.06), white, { y: dh, z: front + 0.01 }));
    p.push(part(new THREE.BoxGeometry(0.07, dh, 0.06), white, { x: -dw / 2 - 0.03, y: dh / 2, z: front + 0.01 }), part(new THREE.BoxGeometry(0.07, dh, 0.06), white, { x: dw / 2 + 0.03, y: dh / 2, z: front + 0.01 }));
    p.push(part(new THREE.BoxGeometry(0.3, 0.26, 0.04), white, { y: wallH + 0.26, z: fd * 0.5 + 0.02 }), part(new THREE.BoxGeometry(0.22, 0.18, 0.05), '#4a2a1e', { y: wallH + 0.26, z: fd * 0.5 + 0.03 }));
    for (const s of [-1, 1]) p.push(part(new THREE.BoxGeometry(0.06, 0.5, 0.06), white, { x: s * fw * 0.3, y: 0.3, z: front }), part(new THREE.BoxGeometry(fw * 0.12, 0.06, 0.06), white, { x: s * fw * 0.3, y: 0.3, z: front, rz: s * 0.8 }));
    const m = new THREE.Mesh(merged(p), vcMat); m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m); g.position.set(cx - W / 2, 0, cz - w.H / 2); g.rotation.y = yaw; root.add(g); b.barns.push(g);
  }
}

// ================================================================ ACTORS (sheep that tumble, hay bales that roll)
const woolGeo = (() => {
  const p = [part(new THREE.IcosahedronGeometry(0.82, 1), '#ffffff')], n = 16;
  for (let i = 0; i < n; i++) { // puffs on a fibonacci sphere
    const y = 1 - (i + 0.5) * 2 / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    p.push(part(new THREE.IcosahedronGeometry(0.36, 0), '#ffffff', { x: Math.cos(a) * r * 0.7, y: y * 0.7, z: Math.sin(a) * r * 0.7 }));
  }
  return merged(p);
})();
const headGeo = merged([part(new THREE.IcosahedronGeometry(0.52, 1), '#4a3a44', { y: 0.04, z: 0.7, sx: 1, sy: 0.92, sz: 0.85 }),
  part(new THREE.IcosahedronGeometry(0.17, 0), '#4a3a44', { x: -0.48, y: 0.2, z: 0.6, sx: 1.4, sy: 0.6, sz: 0.8, rz: 0.4 }),
  part(new THREE.IcosahedronGeometry(0.17, 0), '#4a3a44', { x: 0.48, y: 0.2, z: 0.6, sx: 1.4, sy: 0.6, sz: 0.8, rz: -0.4 }),
  part(new THREE.IcosahedronGeometry(0.07, 0), '#f59bb0', { x: -0.24, y: -0.12, z: 1.02 }), part(new THREE.IcosahedronGeometry(0.07, 0), '#f59bb0', { x: 0.24, y: -0.12, z: 1.02 })]);
const eyeGeo = new THREE.SphereGeometry(0.16, 12, 8), pupilGeo = new THREE.SphereGeometry(0.085, 8, 6);
const legGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.42, 6); legGeo.translate(0, -0.21, 0);
const faceMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
const eyeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), pupilMat = new THREE.MeshStandardMaterial({ color: '#1d1820', roughness: 0.3 });
const legMat = new THREE.MeshStandardMaterial({ color: '#4a3a44', roughness: 0.8 });
const woolMats = {};
function woolMat(coat, i) {
  const c = COATS.find((k) => k.id === coat) || COATS[0], color = c.color === 'rainbow' ? RAINBOW[i % RAINBOW.length] : c.color, key = `${c.id}:${color}`;
  return (woolMats[key] ??= new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: c.id === 'golden' ? 0.35 : 1, metalness: c.id === 'golden' ? 0.55 : 0, emissive: color, emissiveIntensity: 0.06 }));
}
function makeSheep(i) {
  const g = new THREE.Group(), s = SIM.sheepR, roll = new THREE.Group(), feet = new THREE.Group();
  const wool = new THREE.Mesh(woolGeo, woolMat(save.coat, i)); wool.castShadow = true; wool.userData.shared = true;
  const head = new THREE.Mesh(headGeo, faceMat); head.castShadow = true; head.userData.shared = true;
  const eyes = new THREE.Group(); eyes.position.set(0, 0.2, 1.06);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(sx * 0.2, 0, 0); e.userData.shared = true;
    const p = new THREE.Mesh(pupilGeo, pupilMat); p.position.set(sx * 0.2, -0.01, 0.11); p.userData.shared = true; eyes.add(e, p);
  }
  roll.add(wool, head, eyes);
  for (const [lx, lz] of [[-0.38, -0.35], [0.38, -0.35], [-0.38, 0.3], [0.38, 0.3]]) { const l = new THREE.Mesh(legGeo, legMat); l.position.set(lx, -0.62, lz); l.userData.shared = true; feet.add(l); }
  g.add(roll, feet); g.scale.setScalar(s * 1.12);
  return { g, roll, feet, eyes, wool, kind: 'sheep', q: new THREE.Quaternion(), squash: 0, blink: 1 + Math.random() * 3, legs: 1, yaw: (Math.random() - 0.5) * 0.8, drop: 0, hop: Math.random() * 6, idx: i, home: null };
}
function makeBale() {
  const g = new THREE.Group(), r = SIM.baleR, inner = new THREE.Group();
  const side = mat('baleSide', () => new THREE.MeshStandardMaterial({ map: strawTex(), roughness: 1 })), end = mat('baleEnd', () => new THREE.MeshStandardMaterial({ map: baleEndTex(), roughness: 1 }));
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.72, 16), [side, end, end]); m.rotation.z = Math.PI / 2; m.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.025, 4, 18), mat('twine', () => new THREE.MeshStandardMaterial({ color: '#b34a2e' }))); band.rotation.y = Math.PI / 2;
  const band2 = band.clone(); band.position.x = 0.18; band2.position.x = -0.18;
  inner.add(m, band, band2); g.add(inner);
  return { g, inner, kind: 'bale', yaw: 0, spin: 0, drop: 0 };
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();
function updateActors(dt) {
  if (!board || !world) return;
  const W = world.W, H = world.H;
  for (const a of board.sheep) {
    const b = a.body, s = SIM.sheepR;
    a.blink -= dt; if (a.blink < 0) a.blink = 2 + Math.random() * 3;
    a.eyes.scale.y = a.blink < 0.12 ? 0.15 : 1;
    a.squash = Math.max(0, a.squash - dt * 4);
    if (b.state === 'home' && a.home) { // hop into the pen, then bounce happily, facing the camera
      const h = a.home; h.t = Math.min(1, h.t + dt * 1.8);
      const x = h.fx + (h.tx - h.fx) * h.t, z = h.fz + (h.tz - h.fz) * h.t;
      a.hop += dt * 7; const hy = h.t < 1 ? Math.sin(h.t * Math.PI) * 0.6 : Math.abs(Math.sin(a.hop)) * 0.12;
      a.g.position.set(x - W / 2, s + hy, z - H / 2);
      _q.setFromEuler(_e.set(-0.3, a.yaw * 0.4, 0)); a.q.slerp(_q, 1 - Math.exp(-dt * 8)); a.roll.quaternion.copy(a.q);
      a.legs += (1 - a.legs) * Math.min(1, dt * 8); a.feet.scale.set(1, a.legs, 1); a.feet.visible = true;
      a.g.visible = true; continue;
    }
    if (b.state === 'fall') { // keep sailing outwards and tumble down
      const tt = b.t; a.g.visible = tt < 1.2;
      a.g.position.set(b.x + b.vx * tt * 0.7 - W / 2, s - 7 * tt * tt, b.z + b.vz * tt * 0.7 - H / 2);
      _q.setFromAxisAngle(_v.set(1, 0, 0.4).normalize(), dt * 9); a.q.premultiply(_q); a.roll.quaternion.copy(a.q); a.feet.visible = false; continue;
    }
    a.g.visible = true;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.55) { // roll without slipping
      _v.set(b.vz, 0, -b.vx).normalize(); _q.setFromAxisAngle(_v, (sp * dt) / s); a.q.premultiply(_q);
      a.legs = Math.max(0, a.legs - dt * 8);
    } else { // stand back up, legs out, face the camera
      _q.setFromEuler(_e.set(-0.3, a.yaw, 0)); a.q.slerp(_q, 1 - Math.exp(-dt * 7));
      if (a.q.angleTo(_q) < 0.35) a.legs = Math.min(1, a.legs + dt * 5);
    }
    a.roll.quaternion.copy(a.q);
    a.feet.scale.set(1, Math.max(0.01, a.legs), 1); a.feet.visible = a.legs > 0.02;
    a.drop = Math.max(0, a.drop - dt * 3);
    const lift = a.legs * 0.14 + a.drop * a.drop * 3, sq = 1 - a.squash * 0.25;
    a.g.position.set(b.x - W / 2, s * sq + lift, b.z - H / 2);
    a.g.scale.set(s * 1.12 * (1 + a.squash * 0.18), s * 1.12 * sq, s * 1.12 * (1 + a.squash * 0.18));
  }
  for (const a of board.bales) {
    const b = a.body, r = SIM.baleR;
    if (b.state === 'fall') { const tt = b.t; a.g.visible = tt < 1.2; a.g.position.set(b.x + b.vx * tt * 0.7 - W / 2, r - 7 * tt * tt, b.z + b.vz * tt * 0.7 - H / 2); a.inner.rotation.x += dt * 6; continue; }
    a.g.visible = true;
    if (b.state === 'set') { a.g.position.set(b.x - W / 2, r - 0.1, b.z - H / 2); continue; }
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.25) { // roll axis perpendicular to the motion (a cylinder looks the same turned 180°)
      let want = Math.atan2(b.vx, b.vz), d = want - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (d > Math.PI / 2) d -= Math.PI; if (d < -Math.PI / 2) d += Math.PI;
      a.g.rotation.y += d * Math.min(1, dt * 10);
      const fwd = b.vx * Math.sin(a.g.rotation.y) + b.vz * Math.cos(a.g.rotation.y);
      a.inner.rotation.x += (fwd * dt) / r;
    }
    a.drop = Math.max(0, a.drop - dt * 3);
    a.g.position.set(b.x - W / 2, r + a.drop * a.drop * 3, b.z - H / 2);
  }
}
function setCoat(id) {
  save.coat = id;
  board?.sheep.forEach((a, i) => { a.wool.material = woolMat(id, i); });
}

// ================================================================ FX (particles, shake)
const GLOBAL_GEOS = new Set(); // module-level geometries reused by every board (filled after they are declared)
const particles = [], pGeo = new THREE.IcosahedronGeometry(0.07, 0), pBox = new THREE.BoxGeometry(0.1, 0.1, 0.1);
function burst(lx, ly, lz, colors, n = 12, speed = 3, { size = 1, grav = 9, life = 0.6, box = false, up = 1 } = {}) {
  if (!board) return;
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible && q.userData.box === box);
    if (!p) { p = new THREE.Mesh(box ? pBox : pGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 })); p.userData = { v: new THREE.Vector3(), box }; particles.push(p); }
    if (p.parent !== board.root) board.root.add(p);
    p.material.color.set(colors[i % colors.length]); p.visible = true; p.position.set(lx, ly, lz);
    Object.assign(p.userData, { life: life * (0.7 + Math.random() * 0.6), max: life, grav, size: size * (0.7 + Math.random() * 0.6) });
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    p.userData.v.set(Math.cos(a) * s, (0.4 + Math.random()) * speed * up, Math.sin(a) * s); p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    const u = p.userData; u.life -= dt; if (u.life <= 0) { p.visible = false; continue; }
    u.v.y -= u.grav * dt; u.v.multiplyScalar(1 - dt * 1.5); p.position.addScaledVector(u.v, dt); p.rotation.x += dt * 4;
    p.scale.setScalar(u.size * Math.min(1, (u.life / u.max) * 2.2));
  }
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
for (const g of [tileGeo, dirtGeo, spikeGeo, woolGeo, headGeo, eyeGeo, pupilGeo, legGeo, pGeo, pBox]) GLOBAL_GEOS.add(g);
const local = (x, z) => [x - world.W / 2, z - world.H / 2];

// ================================================================ INPUT (keyboard, drag-to-tilt on mouse and touch)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (e.code === 'KeyR' && state === State.PLAYING) restartLevel();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU && !$('menu').hidden) $('btnPlay').click();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.GAMEOVER) $('btnNext').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING || stick.id !== null) return;
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy), max = Math.max(40, Math.min(innerWidth, innerHeight) * CFG.dragRadius);
  if (d > max) { dx *= max / d; dy *= max / d; }
  stick.x = dx / max; stick.y = dy / max; $('joystick').firstElementChild.style.transform = `translate(${(dx / max) * 45}px, ${(dy / max) * 45}px)`;
});
const releaseStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; $('joystick').firstElementChild.style.transform = ''; };
canvas.addEventListener('pointerup', releaseStick); canvas.addEventListener('pointercancel', releaseStick);

function tiltInput() { // x: right side down, y: near side down (screen down)
  if (AUTOPLAY || (state === State.MENU)) return botInput(world);
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = stick.y; }
  const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> GAMEOVER (results))
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, run = null, menuShift = 1;
const DEFAULT_SAVE = { v: 1, stars: [], best: [], wool: 0, coats: ['cloud'], coat: 'cloud', tips: {}, tipsOff: false, last: 0 };
let save = structuredClone(DEFAULT_SAVE);

function setState(s, panel = 'menu') {
  state = s;
  $('menu').hidden = !(s === State.MENU && panel === 'menu'); $('levels').hidden = !(s === State.MENU && panel === 'levels'); $('flock').hidden = !(s === State.MENU && panel === 'flock');
  $('paused').hidden = s !== State.PAUSED; $('results').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; }
  if (s !== State.PLAYING && s !== State.PAUSED) { $('tip').hidden = true; $('arrow').hidden = true; tipState = null; }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, results
}
function togglePause() {
  if (state === State.PLAYING) setState(State.PAUSED);
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });
const persist = () => saveData(`${SAVE_KEY}:save`, save);
const starCount = (i) => { const s = save.stars[i] | 0; return (s & 1) + ((s >> 1) & 1) + ((s >> 2) & 1); };
const totalStars = () => LEVELS.reduce((a, _, i) => a + starCount(i), 0);
const unlocked = (i) => i === 0 || (save.stars[i - 1] & 1) > 0;
const levelLabel = (i) => `${LEVELS[i].island + 1}-${(i % 6) + 1}`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function nextLevelToPlay() { for (let i = 0; i < LEVELS.length; i++) if (!(save.stars[i] & 1)) return i; return Math.min(save.last | 0, LEVELS.length - 1); }

// ================================================================ UI
click('btnPlay', () => startLevel(nextLevelToPlay()));
click('btnLevels', () => openLevels(LEVELS[nextLevelToPlay()].island));
click('btnFlock', () => openFlock());
click('btnLevelsBack', () => showMenu());
click('btnFlockBack', () => showMenu());
click('btnPause', () => togglePause());
click('btnRestart', () => restartLevel());
click('btnResume', () => togglePause());
click('btnPauseRestart', () => restartLevel());
click('btnPauseLevels', () => openLevels(LEVELS[levelIndex].island));
click('btnQuit', () => showMenu());
click('btnReplay', () => restartLevel()); // replay: no ad (navigation-like, instant)
click('btnResLevels', () => openLevels(LEVELS[levelIndex].island));
click('btnNext', () => { // the level end: the right moment for a midgame ad
  const n = levelIndex + 1;
  triggerMidgameAd(() => { if (n < LEVELS.length) startLevel(n); else openLevels(ISLANDS.length - 1); });
});
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.wool += run.woolGain; run.woolGain *= 2; $('resWool').textContent = run.woolGain; persist(); refreshMenu(); toast(t('doubled')); playSfx('unlock', 0.7); }, () => {});
});
click('btnSkipTips', () => { save.tipsOff = true; persist(); $('tip').hidden = true; $('arrow').hidden = true; tipState = null; });

function showMenu() {
  if (state === State.PLAYING || state === State.PAUSED || state === State.GAMEOVER) startDemo(levelIndex);
  setState(State.MENU, 'menu'); refreshMenu();
}
function refreshMenu() {
  const n = nextLevelToPlay();
  $('playLevel').textContent = levelLabel(n);
  $('menuStars').textContent = totalStars(); $('menuStarsMax').textContent = LEVELS.length * 3; $('menuWool').textContent = save.wool;
}
let levelsIsland = 0;
function openLevels(island) {
  levelsIsland = island;
  if (state !== State.MENU) startDemo(levelIndex);
  setState(State.MENU, 'levels');
  const tabs = $('islandTabs'); tabs.innerHTML = '';
  ISLANDS.forEach((isl, k) => {
    const b = document.createElement('button'), first = LEVELS.findIndex((l) => l.island === k), open = unlocked(first);
    b.textContent = nm(isl.name); b.className = (k === island ? 'on' : '') + (open ? '' : ' locked');
    b.onclick = () => { playSfx('click', 0.5); openLevels(k); }; tabs.appendChild(b);
  });
  const grid = $('levelGrid'); grid.innerHTML = ''; const cur = nextLevelToPlay();
  LEVELS.forEach((l, i) => {
    if (l.island !== island) return;
    const b = document.createElement('button'), open = unlocked(i), s = save.stars[i] | 0;
    b.className = (open ? '' : 'locked') + (i === cur ? ' current' : '');
    b.innerHTML = open ? `${(i % 6) + 1}<small>${nm(l.name)}</small><span class="st">${[1, 2, 4].map((m) => `<i class="ico ico-star${s & m ? '' : ' off'}"></i>`).join('')}</span>`
      : `<i class="ico ico-lock" style="width:1.2em;height:1.2em"></i><small>${t('locked')}</small>`;
    if (open) b.onclick = () => { unlockAudio(); playSfx('click', 0.6); startLevel(i); };
    grid.appendChild(b);
  });
}
function openFlock() {
  setState(State.MENU, 'flock');
  $('flockWool').textContent = save.wool;
  const grid = $('coatGrid'); grid.innerHTML = '';
  for (const c of COATS) {
    const owned = save.coats.includes(c.id), on = save.coat === c.id, b = document.createElement('button');
    b.className = (on ? 'on' : '') + (owned ? '' : ' locked');
    const bg = c.color === 'rainbow' ? `conic-gradient(${RAINBOW.join(',')},${RAINBOW[0]})` : c.id === 'golden' ? 'radial-gradient(circle at 35% 30%, #fff3c0, #ffcf5a 45%, #c9921e)' : c.color;
    b.innerHTML = `<span class="swatch" style="background:${bg}"></span><small>${nm(c.name)}</small>` +
      (owned ? `<span class="price">${on ? t('wearing') : t('wear')}</span>` : `<span class="price"><i class="ico ico-wool"></i>${c.price}</span>`);
    b.onclick = () => {
      unlockAudio();
      if (owned) { setCoat(c.id); playSfx('click', 0.6); playSfx('baaA', 0.6); }
      else if (save.wool >= c.price) { save.wool -= c.price; save.coats.push(c.id); setCoat(c.id); playSfx('unlock', 0.8); playSfx('baaB', 0.6); }
      else { toast(t('needWool')); playSfx('click', 0.4); return; }
      persist(); refreshMenu(); openFlock();
    };
    grid.appendChild(b);
  }
}
function buildHudSheep() {
  const el = $('hudSheep'); el.innerHTML = '';
  for (let i = 0; i < world.sheepTotal; i++) { const s = document.createElement('i'); s.className = 'ico ico-sheep off'; el.appendChild(s); }
}
let hudCache = '';
function updateHud() {
  if (!run || !world) return;
  const par = world.def.par, late = world.time > par;
  const key = `${world.home}|${world.cloversTaken}|${Math.floor(world.time)}|${late}`;
  if (key === hudCache) return; hudCache = key;
  [...$('hudSheep').children].forEach((s, i) => s.classList.toggle('off', i >= world.home));
  $('cloverN').textContent = `${world.cloversTaken}/${world.clovers.length}`; $('hudClover').hidden = !world.clovers.length;
  $('timeN').textContent = fmt(world.time); $('parN').textContent = `/ ${fmt(par)}`; $('hudTime').classList.toggle('late', late);
}
function pulse(id) { const el = $(id); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 160); }

// onboarding tips: shown once per kind, step by step, inside gameplay; Skip tips turns them off
const TIPS = {
  tilt: [{ pic: 'keys', text: 'tipTilt', until: 'tilted' }, { pic: 'sheep', text: 'tipBarn', arrow: 'barn', until: 'home' }],
  edge: [{ pic: 'sheep', text: 'tipEdge', time: 6 }],
  flock: [{ pic: 'sheep', text: 'tipFlock', time: 7 }],
  bumper: [{ pic: 'bumper', text: 'tipBumper', arrow: 'bumper', time: 6 }],
  mud: [{ pic: 'mud', text: 'tipMud', arrow: 'mud', time: 6 }],
  plate: [{ pic: 'plate', text: 'tipPlate', arrow: 'bale', until: 'set' }, { pic: 'sheep', text: 'tipGate', arrow: 'barn', until: 'home' }],
  ice: [{ pic: 'ice', text: 'tipIce', time: 6 }],
  crack: [{ pic: 'ice', text: 'tipCrack', arrow: 'thin', time: 7 }],
  fan: [{ pic: 'fan', text: 'tipFan', arrow: 'fan', time: 6 }],
};
const PICS = { sheep: '<span class="tip-pic"><i class="ico ico-sheep" style="width:1.6em;height:1.6em"></i></span>',
  bumper: '<span class="tip-pic" style="background:#ffd9d4">🍄</span>', mud: '<span class="tip-pic" style="background:#c79a6c"></span>',
  plate: '<span class="tip-pic" style="background:#ffe08a"><i class="ico ico-star"></i></span>', ice: '<span class="tip-pic" style="background:#cdeeff"></span>',
  fan: '<span class="tip-pic" style="background:#f3e3ff">✣</span>' };
let tipState = null;
function startTips(key) {
  tipState = null; $('tip').hidden = true; $('arrow').hidden = true;
  if (!key || save.tipsOff || save.tips[key] || AUTOPLAY || !TIPS[key]) return;
  tipState = { key, i: -1, t: 0, tilted: 0 }; nextTip();
}
function nextTip() {
  const steps = TIPS[tipState.key]; tipState.i++; tipState.t = 0;
  if (tipState.i >= steps.length) { save.tips[tipState.key] = 1; persist(); tipState = null; $('tip').hidden = true; $('arrow').hidden = true; return; }
  const s = steps[tipState.i];
  const keysPic = isTouch ? '<span class="hand"></span>' : `<span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span class="keys"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span><span class="or">${t('or')}</span><span class="mouse"></span>`;
  $('tipIcon').innerHTML = s.pic === 'keys' ? keysPic : PICS[s.pic] || '';
  $('tipText').textContent = t(s.text); $('tip').hidden = false; $('tip').style.animation = 'none'; void $('tip').offsetWidth; $('tip').style.animation = '';
}
function tipEvent(kind) { if (tipState && TIPS[tipState.key][tipState.i]?.until === kind) nextTip(); }
const _p = new THREE.Vector3();
function tipAnchor(kind) {
  if (!board || !world) return null;
  const W = world.W, H = world.H;
  if (kind === 'barn') { let x = 0, z = 0; for (const c of board.barnCells) { x += c % W + 0.5; z += ((c / W) | 0) + 0.5; } const n = board.barnCells.length || 1; return _p.set(x / n - W / 2, 0.9, z / n - H / 2); }
  if (kind === 'bale') { const b = world.bodies.find((o) => o.kind === 'bale' && o.state === 'roll'); return b ? _p.set(b.x - W / 2, 0.9, b.z - H / 2) : null; }
  if (kind === 'bumper' && world.bumpers[0]) return _p.set(world.bumpers[0].x - W / 2, 0.9, world.bumpers[0].z - H / 2);
  const find = (ch) => { const i = world.grid.indexOf(ch); return i < 0 ? null : _p.set(i % W + 0.5 - W / 2, 0.6, ((i / W) | 0) + 0.5 - H / 2); };
  if (kind === 'mud') return find('m'); if (kind === 'thin') return find('x');
  if (kind === 'fan' && world.fans[0]) return _p.set(world.fans[0].x + 0.5 - W / 2, 1.1, world.fans[0].z + 0.5 - H / 2);
  return null;
}
function updateTips(dt) {
  if (!tipState) return;
  const s = TIPS[tipState.key][tipState.i]; tipState.t += dt;
  if (s.until === 'tilted') { tipState.tilted += Math.hypot(world.tx, world.tz) > 0.45 ? dt : 0; if (tipState.tilted > 0.7) nextTip(); }
  else if (s.time && tipState.t > s.time) nextTip();
  const cur = tipState && TIPS[tipState.key][tipState.i], arrow = $('arrow');
  const p = cur?.arrow && tipAnchor(cur.arrow);
  if (p) { board.root.localToWorld(p); p.project(camera); arrow.hidden = false; arrow.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`; arrow.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`; }
  else arrow.hidden = true;
}

// ================================================================ GAMEPLAY
function loadLevel(i) {
  levelIndex = i; world = createWorld(LEVELS[i]); buildBoard(world);
}
function startDemo(i) { // the menu shows a live island the bot plays (silently)
  loadLevel(Math.min(i, LEVELS.length - 1)); run = null; demoT = 0;
}
let demoT = 0;
function startLevel(i) {
  loadLevel(i); save.last = i; persist();
  run = { intro: CFG.introTime, winT: -1, autoT: 0, woolGain: 0, rollCd: 0, baaCd: 0 };
  hudCache = ''; buildHudSheep(); updateHud();
  $('hudLevel').textContent = levelLabel(i); $('hudName').textContent = nm(LEVELS[i].name);
  const b = $('banner'); $('bannerIsland').textContent = `${nm(ISLANDS[LEVELS[i].island].name)} · ${levelLabel(i)}`; $('bannerName').textContent = nm(LEVELS[i].name);
  b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 2300);
  setState(State.PLAYING); playMusic(ISLANDS[LEVELS[i].island].music);
  startTips(LEVELS[i].tip);
}
function restartLevel() { if (world) startLevel(levelIndex); }
function finishLevel() {
  const s = starsOf(world), mask = (s.home ? 1 : 0) | (s.clovers ? 2 : 0) | (s.par ? 4 : 0), old = save.stars[levelIndex] | 0;
  const first = !(old & 1), gained = mask & ~old, nStars = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1), newCount = (gained & 1) + ((gained >> 1) & 1) + ((gained >> 2) & 1);
  save.stars[levelIndex] = old | mask;
  if (!save.best[levelIndex] || world.time < save.best[levelIndex]) save.best[levelIndex] = Math.round(world.time * 10) / 10;
  const wg = CFG.wool; run.woolGain = wg.base + world.sheepTotal * wg.perSheep + nStars * wg.perStar + (first ? wg.firstClear : 0);
  save.wool += run.woolGain; persist();
  const islandDone = first && (levelIndex % 6 === 5);
  if (islandDone) happytime();
  setState(State.GAMEOVER);
  $('resTitle').textContent = levelIndex === LEVELS.length - 1 && first ? t('allDone') : islandDone ? t('islandDone') : t('flockHome');
  $('starCloverLabel').textContent = t('starClover', { n: `${world.cloversTaken}/${world.clovers.length}` });
  $('starParLabel').textContent = t('starPar', { t: fmt(world.def.par) });
  ['home', 'clovers', 'par'].forEach((k, j) => {
    const el = $(`star${j}`); el.classList.remove('on');
    if (s[k]) { if (CAPTURE) el.classList.add('on'); else setTimeout(() => { el.classList.add('on'); playSfx('star', 0.7, 1 + j * 0.12); }, 300 + j * 280); }
  });
  $('resWool').textContent = run.woolGain;
  $('resNew').hidden = !newCount; $('resNew').textContent = t('newStars', { n: newCount });
  $('btnDouble').hidden = !adsAvailable();
  $('btnNext').hidden = levelIndex >= LEVELS.length - 1;
  refreshMenu();
}

function handleEvents(live) {
  const W = world.W, H = world.H;
  for (const e of world.events) {
    const body = e.id != null ? world.bodies[e.id] : null, actor = body ? (body.kind === 'sheep' ? board.sheep.find((a) => a.body === body) : board.bales.find((a) => a.body === body)) : null;
    const [bx, bz] = body ? local(body.x, body.z) : [0, 0];
    switch (e.t) {
      case 'bump':
        if (actor?.kind === 'sheep') { actor.squash = Math.min(1, e.speed / 5); burst(bx, 0.3, bz, ['#ffffff', '#f4efe6'], 4, 1.4, { size: 1.4, grav: 2, life: 0.5 }); }
        if (!live) break;
        playSfx(e.kind === 'bale' || e.on === 'bale' ? 'bale' : 'bump', Math.min(1, e.speed / 5) * 0.8);
        if (e.kind === 'sheep' && e.speed > 3.6 && run.baaCd <= 0) { playSfx(Math.random() < 0.5 ? 'baaA' : 'baaB', 0.5); run.baaCd = 1.2; }
        if (e.speed > 4) shake(0.08);
        break;
      case 'boing': {
        const m = board.bumpers[world.bumpers.findIndex((q) => q.x === e.x && q.z === e.z)]; if (m) m.squash = 1;
        burst(e.x - W / 2, 0.5, e.z - H / 2, [board.pal.cap, '#ffffff'], 8, 2.4, { box: true, size: 0.8 });
        if (live) { playSfx('boing', 0.7); if (run.baaCd <= 0) { playSfx('baaB', 0.45); run.baaCd = 1; } }
        break;
      }
      case 'mud': burst(bx, 0.05, bz, ['#6b4528', '#83583a'], 6, 1.6, { size: 1.2 }); if (live) playSfx('mud', 0.45); break;
      case 'fall': burst(bx, 0, bz, [board.pal.grassA, board.pal.dirt], 6, 1.5, { box: true, size: 0.7 }); if (live) { playSfx('fall', 0.6); if (e.kind === 'sheep') playSfx('baaB', 0.6, 1.15); shake(0.12); } break;
      case 'respawn': if (actor) actor.drop = 1; burst(bx, 0.6, bz, ['#ffffff'], 10, 1.8, { size: 2, grav: 1, life: 0.7 }); if (live) playSfx('pop', 0.5); break;
      case 'home':
        if (actor) {
          const n = board.barnCells.length, slot = board.barnCells[(e.n - 1) % n], ring = Math.floor((e.n - 1) / n);
          actor.home = { t: 0, fx: body.x, fz: body.z, tx: (slot % W) + 0.5 + (ring ? (Math.random() - 0.5) * 0.4 : 0), tz: ((slot / W) | 0) + 0.5 + (ring ? (Math.random() - 0.5) * 0.4 : 0) };
        }
        burst(bx, 0.6, bz, ['#ffc93c', '#ffffff', '#ff9ec4'], 14, 2.8, { box: true, size: 0.7 });
        if (live) { playSfx('barn', 0.8); playSfx('baaA', 0.7); pulse('hudSheep'); tipEvent('home'); }
        break;
      case 'clover': {
        const c = board.clovers[world.clovers.findIndex((q) => q.x === e.x && q.z === e.z)]; if (c) c.taken = 0.001;
        burst(e.x - W / 2, 0.45, e.z - H / 2, ['#46b84f', '#a6f08a', '#ffffff'], 12, 2.4, { box: true, size: 0.6 });
        if (live) { playSfx('clover', 0.8, 1 + (e.n - 1) * 0.1); pulse('hudClover'); }
        break;
      }
      case 'crack': { const th = board.thin.get(e.cell); if (th) th.m.material[2] = th.mats.b; if (live) playSfx('crack', 0.3, 1.3); break; }
      case 'break': {
        const th = board.thin.get(e.cell); if (th) th.drop = 0.001;
        const x = e.cell % W + 0.5 - W / 2, z = ((e.cell / W) | 0) + 0.5 - H / 2;
        burst(x, 0, z, ['#d6f1ff', '#ffffff', '#9fd0f0'], 12, 2.2, { box: true, size: 1 });
        if (live) playSfx('crack', 0.7);
        break;
      }
      case 'refreeze': {
        const th = board.thin.get(e.cell); if (th) { th.drop = 0; th.m.visible = true; th.m.position.y = 0; th.m.material[2] = th.mats.a; }
        const x = e.cell % W + 0.5 - W / 2, z = ((e.cell / W) | 0) + 0.5 - H / 2; burst(x, 0.1, z, ['#ffffff', '#e6f6ff'], 8, 1.2, { size: 1.4, grav: 0.5 });
        break;
      }
      case 'set': burst(bx, 0.5, bz, ['#ffc93c', '#fff2b0'], 16, 2.6, { box: true, size: 0.7 }); if (live) { playSfx('plate', 0.8); tipEvent('set'); } break;
      case 'gate': if (live) playSfx(e.open ? 'gate' : 'bale', e.open ? 0.7 : 0.4); break;
      case 'win':
        if (run) { run.winT = CFG.winDelay; }
        if (live) { playSfx('done', 0.75); playSfx('confetti', 0.5); }
        for (const c of board.barnCells.slice(0, 4)) burst(c % W + 0.5 - W / 2, 1.2, ((c / W) | 0) + 0.5 - H / 2, ['#ff6b6b', '#ffd93c', '#5fd4ff', '#8be07a', '#ff9ec4'], 14, 4, { box: true, size: 0.8, grav: 6, life: 1.2, up: 1.4 });
        break;
    }
  }
  world.events.length = 0;
}

function step(dt) {
  if (!world) return;
  const playing = state === State.PLAYING && run;
  if (playing) {
    run.baaCd -= dt;
    if (run.intro > 0) { run.intro -= dt; simStep(world, { x: 0, y: 0 }, 0); return; }
    if (run.winT > 0) { run.winT -= dt; simStep(world, { x: 0, y: 0 }, dt); handleEvents(true); if (run.winT <= 0) finishLevel(); return; }
    simStep(world, tiltInput(), dt); handleEvents(true);
  } else if (state === State.MENU) {
    simStep(world, world.won ? { x: 0, y: 0 } : tiltInput(), dt); handleEvents(false);
    if (world.won || world.time > 70) { demoT += dt; if (demoT > 2.5) startDemo(levelIndex); }
  } else if (state === State.GAMEOVER) {
    simStep(world, { x: 0, y: 0 }, dt); handleEvents(false);
    if (AUTOPLAY && run) { run.autoT += dt; if (run.autoT > CFG.autoNext) { if (levelIndex < LEVELS.length - 1) startLevel(levelIndex + 1); else startLevel(0); } }
  }
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, clock = 0;
const camTarget = new THREE.Vector3(), lookAt = new THREE.Vector3();
function advance(dt) {
  clock += dt;
  if (state !== State.PAUSED) { acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; } updateParticles(dt); updateBoardFx(dt); }
  updateActors(state === State.PAUSED ? 0 : dt);
  if (state === State.PLAYING) { updateHud(); updateTips(dt); }
  // audio beds
  if (world && board) {
    const live = state === State.PLAYING;
    let sp = 0; for (const b of world.bodies) if (b.state === 'roll') sp += Math.hypot(b.vx, b.vz);
    loopGain('rollLoop', live ? Math.min(0.35, sp * 0.045) : 0);
    loopGain('fanLoop', live && world.fans.length ? 0.16 : 0);
    loopGain('birds', (live || state === State.MENU) && board.pal !== PAL.frost ? 0.22 : 0);
  }
}
function updateBoardFx(dt) {
  if (!board || !world) return;
  for (const [gi, g] of board.gates) { g.open += ((world.gateOpen ? 1 : 0) - g.open) * Math.min(1, dt * 6); g.m.position.y = -g.open * 0.7; g.m.visible = g.open < 0.98; }
  for (const [pi, p] of board.plates) {
    const on = world.bodies.some((b) => (b.state === 'roll' || b.state === 'set') && Math.floor(b.z) * world.W + Math.floor(b.x) === pi);
    p.down += ((on ? 1 : 0) - p.down) * Math.min(1, dt * 10); p.btn.position.y = 0.09 - p.down * 0.06; p.btn.material.emissiveIntensity = 0.15 + p.down * 0.6;
  }
  board.bumpers.forEach((m) => { m.squash = Math.max(0, m.squash - dt * 4); const s = Math.sin(m.squash * Math.PI * 2) * m.squash * 0.25; m.m.scale.set(1 + s, 1 - s, 1 + s); });
  board.clovers.forEach((c, i) => {
    const g = c.g; g.rotation.y += dt * 1.6; g.position.y = 0.42 + Math.sin(clock * 2.5 + i) * 0.06;
    if (c.taken) { c.taken += dt * 3; g.scale.setScalar(Math.max(0, 1 + c.taken - c.taken * c.taken * 2)); g.position.y += c.taken; if (c.taken > 1) g.visible = false; }
  });
  for (const f of board.fans) {
    f.blades.rotation.z += dt * 9;
    f.spawn -= dt; if (f.spawn <= 0) { f.spawn = 0.18; const [x, z] = local(f.f.x + 0.5 + f.f.dir[0] * 0.6, f.f.z + 0.5 + f.f.dir[1] * 0.6); windStreak(x, z, f.f.dir); }
  }
  for (const th of board.thin.values()) if (th.drop) { th.drop += dt; th.m.position.y = -th.drop * th.drop * 6; if (th.drop > 0.6) th.m.visible = false; }
  updateStreaks(dt);
}
const streaks = [], streakGeo = new THREE.BoxGeometry(0.34, 0.025, 0.025), streakMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
function windStreak(x, z, dir) {
  let s = streaks.find((q) => !q.visible);
  if (!s) { s = new THREE.Mesh(streakGeo, streakMat); s.userData.shared = true; streaks.push(s); }
  if (s.parent !== board.root) board.root.add(s);
  s.visible = true; s.position.set(x + (Math.random() - 0.5) * 0.2 * Math.abs(dir[1]) * 4, 0.2 + Math.random() * 0.45, z + (Math.random() - 0.5) * 0.8 * Math.abs(dir[0]));
  s.rotation.y = Math.atan2(-dir[1], dir[0]); s.userData.dir = dir; s.userData.life = SIM.fanReach / 4.5;
}
function updateStreaks(dt) {
  for (const s of streaks) { if (!s.visible) continue; s.userData.life -= dt; if (s.userData.life <= 0) { s.visible = false; continue; } s.position.x += s.userData.dir[0] * 4.5 * dt; s.position.z += s.userData.dir[1] * 4.5 * dt; }
}
function frameCamera(dt, snap = false) {
  if (!world) return;
  const aspect = innerWidth / innerHeight, menu = state === State.MENU && $('menu').hidden === false;
  menuShift += ((menu ? 1 : 0) - menuShift) * (snap ? 1 : Math.min(1, dt * 4));
  const portrait = aspect < 1, vf = THREE.MathUtils.degToRad(CFG.fov) / 2, hf = Math.atan(Math.tan(vf) * aspect);
  const wSpan = world.W / 2 + 0.8, dSpan = world.H * 0.5 * Math.sin(CFG.pitch) + 1.3;
  let dist = Math.max(dSpan / Math.tan(vf), wSpan / Math.tan(hf)) * 1.04 + 3;
  if (menu && !portrait) dist *= 1.08;
  if (state === State.PLAYING || state === State.PAUSED) dist *= 1.08; // room for the HUD and tips
  const dir = new THREE.Vector3(0, Math.sin(CFG.pitch), Math.cos(CFG.pitch));
  lookAt.set(0, -0.2, 0.15 - (state === State.PLAYING ? 0.25 : 0));
  camTarget.copy(lookAt).addScaledVector(dir, dist);
  if (snap) camera.position.copy(camTarget); else camera.position.lerp(camTarget, 1 - Math.exp(-dt * 4));
  shakeAmt = Math.max(0, shakeAmt - dt * 1.2);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(lookAt);
  const w = innerWidth, h = innerHeight;
  if (portrait) camera.setViewOffset(w, h, 0, -h * 0.17 * menuShift, w, h); else camera.setViewOffset(w, h, -w * 0.2 * menuShift, 0, w, h);
}
function render(dt) {
  if (world && board) {
    const k = CFG.maxTilt; board.root.rotation.set(world.tz * k, 0, -world.tx * k);
    const intro = run && state === State.PLAYING ? Math.max(0, run.intro / CFG.introTime) : 0; boardHolder.position.y = intro * intro * 7;
    sun.position.set(6, 16, 8); sun.target.position.set(0, 0, 0);
  }
  for (const c of envGroup.children) {
    if (c.userData.drift) { c.userData.a += dt * c.userData.drift * 0.02; c.position.x = Math.cos(c.userData.a) * c.userData.d; c.position.z = Math.sin(c.userData.a) * c.userData.d - 6; }
    if (c.userData.bob != null) c.position.y += Math.sin(clock * 0.6 + c.userData.bob) * dt * 0.15;
  }
  frameCamera(dt);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ CAPTURE (press kit: frames, trailer, in-engine covers)
const COVER = { // a hand-staged island: barn, mushrooms, mud, clovers, an open edge, five sheep mid-tumble
  rows: [
    '  #########   ',
    ' #T.HHHH..T#  ',
    ' #..BBBB....# ',
    '#c..SS......##',
    '#..o....mm..c#',
    '#.S...o.mm...#',
    ' #......S...r#',
    ' T#....S..  # ',
    '   ...  ...   ',
  ],
  sheep: [[5.6, 2.6, 0.15, 0], [7.4, 3.9, -0.45, 0], [4.2, 4.6, 0.5, 0.35, 0.75], [10.1, 5.9, -0.7, 0.25], [6.4, 6.8, 0.3, 0]],
};
function stageCover(kind) {
  for (const id of ['hud', 'menu', 'levels', 'flock', 'paused', 'results', 'tip', 'arrow', 'banner', 'joystick', 'toast']) $(id).hidden = true;
  state = State.BOOT; run = null; levelIndex = 4;
  world = createWorld({ island: 0, par: 60, rows: COVER.rows }); buildBoard(world);
  board.sheep.forEach((a, i) => {
    const [x, z, yaw, tumble, air] = COVER.sheep[i] || [3, 3, 0, 0]; const b = a.body; b.x = x; b.z = z; b.vx = b.vz = 0;
    a.yaw = yaw; a.q.setFromEuler(_e.set(-0.32 + tumble * 0.5, yaw, tumble * 0.6)); a.legs = tumble ? 0 : 1; a.blink = 2; a.drop = air ? Math.sqrt(air / 3) : 0;
  });
  world.tx = 0.15; world.tz = 0.1; updateActors(0);
  board.sheep.forEach((a) => { a.roll.quaternion.copy(a.q); a.feet.scale.y = Math.max(0.01, a.legs); a.feet.visible = a.legs > 0.05; });
  const aspect = innerWidth / innerHeight; camera.aspect = aspect; camera.updateProjectionMatrix(); camera.clearViewOffset();
  const k = CFG.maxTilt; board.root.rotation.set(world.tz * k, 0, -world.tx * k); boardHolder.position.y = 0;
  const vf = THREE.MathUtils.degToRad(CFG.fov) / 2, hf = Math.atan(Math.tan(vf) * aspect), pitch = 0.86;
  const dist = Math.max((world.H * 0.5 * Math.sin(pitch) + 1.6) / Math.tan(vf), (world.W / 2 + 0.6) / Math.tan(hf)) * (aspect > 1.2 ? 0.86 : aspect < 0.9 ? 0.6 : 0.84) + 1.5;
  const look = new THREE.Vector3(0.1, -0.3, aspect < 0.9 ? 0.6 : 0.2);
  camera.position.copy(look).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(dist)); camera.lookAt(look);
  if (kind !== 'keyart') camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * (aspect < 0.9 ? -0.06 : aspect < 1.2 ? 0.03 : 0.035), innerWidth, innerHeight); // room for the title at the bottom
  renderer.render(scene, camera);
}
function captureApi() {
  const capLevel = Math.max(0, Math.min(LEVELS.length - 1, (params.get('level') | 0 || 3) - 1));
  window.__game = {
    start: () => startLevel(capLevel),
    frame: (dt = 1 / 30) => { advance(dt); render(dt); },
    skip: (sec) => { for (let s = 0; s < sec; s += STEP) advance(STEP); },
    sim: (sec) => { const end = clock + sec; while (clock < end && !(state === State.GAMEOVER)) advance(STEP); return window.__game.info(); },
    info: () => ({ state, level: levelIndex + 1, time: world?.time, home: world?.home, sheep: world?.sheepTotal, falls: world?.falls, stars: totalStars() }),
    cover: (kind) => stageCover(kind),
  };
}

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n();
  initAudio();
  const loads = Object.entries(ASSETS.sfx).map(([k, u]) => loadSfx(k, u).finally(() => { $('loadBar').style.width = `${Math.min(100, (Object.keys(audio.buffers).length / Object.keys(ASSETS.sfx).length) * 100)}%`; }));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  const saved = loadData(`${SAVE_KEY}:save`, null);
  if (saved && typeof saved === 'object') save = { ...structuredClone(DEFAULT_SAVE), ...saved };
  if (!save.coats.includes(save.coat)) save.coat = 'cloud';
  resize();
  startDemo(Math.min(nextLevelToPlay(), LEVELS.length - 1));
  setState(State.MENU, 'menu'); refreshMenu(); frameCamera(0, true);
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  if (CAPTURE) { captureApi(); render(0); } // capture protocol (tools/capture.mjs): no rAF loop, the tool drives every frame
  else { playMusic(ISLANDS[LEVELS[levelIndex].island].music); requestAnimationFrame((n) => { last = n; frame(n); }); }
}
boot();
