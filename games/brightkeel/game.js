// Brightkeel: you keep the lighthouse of a little harbour at night. Boats inside your beam follow it; boats left in the
// dark drift toward rocks and the shore. Lead every boat to the pier with its lantern colour.
// Sections: CONFIG, I18N, SDK, AUDIO, SCENE, VIEW, RULES, BOT, FX, INPUT, STATE, UI, TIPS, GAMEPLAY, LOOP, CAPTURE, BOOT.
// Everything on screen is procedural (props.js); only audio loads from ./assets/, with synthesized fallbacks.
// No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';
import { NIGHTS, LONG, COLORS, SHORE, PIER_LEN, DOCK_Z, AREA, nightPiers, scatterRocks, rng } from './levels.js';
import { buildSky, buildWater, buildBeam, buildLighthouse, buildTown, buildPier, buildRock, buildBoat, buildWhale, BOAT_TYPES, BOAT_SCALE, softTex, fogTex } from './props.js';

// ================================================================ CONFIG
const SAVE_KEY = 'brightkeel';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot keeps the lighthouse (trailer footage, balance tests)
const FORCE_TIPS = params.has('tips'); // review onboarding in capture mode
const BOT = AUTOPLAY && !params.has('nobot'); // ?capture=1&nobot: frames and screenshots of an untouched night
const CFG = {
  fov: 30, pitch: 0.95, // gameplay camera: vertical field of view (degrees) and tilt from the horizon (radians)
  beamR: 2.3, beamRUp: 0.3, sweep: 13, sweepUp: 2.4, lensUp: 0.08, // the light and its Lamp Room upgrades
  hornDur: 3, hornDurUp: 0.6, hornCd: 16, hornCdUp: 1.6,
  accel: 2.4, hearts: 3, comboWindow: 4.5, starBonus: 10, prices: [40, 80, 140, 220, 320],
  boats: { // r: hull radius, lit: speed while following the light, dark: drift speed, value: coins on docking
    skiff: { r: 0.52, lit: 3.3, dark: 0.62, value: 5 },
    sail: { r: 0.62, lit: 3.0, dark: 0.68, value: 7, wander: 0.35 },
    trawler: { r: 0.75, lit: 2.6, dark: 0.52, value: 8 },
    ferry: { r: 1.08, lit: 1.95, dark: 0.42, value: 16 },
  },
  whirlR: 4.3, whirlCore: 0.75, whirlPull: 1.6, whaleR: 4.3, whalePush: 3.4, gust: 1.05, fogR: 3.4,
  warnAt: 2.2, touchOffset: 64,
};
const UPGRADES = [
  { id: 'beam', name: 'upBeam', desc: 'upBeamD', icon: 'lamp' },
  { id: 'sweep', name: 'upSweep', desc: 'upSweepD', icon: 'sweep' },
  { id: 'horn', name: 'upHorn', desc: 'upHornD', icon: 'horn' },
  { id: 'lens', name: 'upLens', desc: 'upLensD', icon: 'lens' },
];
const DEMO = { name: { en: '', tr: '' }, piers: 3, boats: 0, maxAt: 3, every: 4.5, drift: 0.9, rocks: 4, seed: 31, types: { trawler: 2, skiff: 1, sail: 2, ferry: 1 }, horn: false };
const ASSETS = {
  sfx: {
    dock: 'assets/audio/keel_dock.mp3', lit: 'assets/audio/keel_lit.mp3', wreck: 'assets/audio/keel_wreck.mp3', bump: 'assets/audio/keel_bump.mp3',
    toot: 'assets/audio/keel_toot.mp3', horn: 'assets/audio/keel_foghorn.mp3', whale: 'assets/audio/keel_whale.mp3', gust: 'assets/audio/keel_gust.mp3',
    thunder: 'assets/audio/thunder.mp3', done: 'assets/audio/keel_night_done.mp3', fail: 'assets/audio/keel_night_fail.mp3', combo: 'assets/audio/keel_combo.mp3',
    warn: 'assets/audio/keel_warn.mp3', star: 'assets/audio/wool_star.mp3', unlock: 'assets/audio/unlock.mp3', click: 'assets/audio/keel_bump.mp3',
    coin: 'assets/audio/works_coin_jar.mp3', lamp: 'assets/audio/kite_lantern.mp3',
    sea: 'assets/audio/keel_sea_loop.mp3', rain: 'assets/audio/keel_rain_loop.mp3', whirl: 'assets/audio/keel_whirl_loop.mp3',
  },
  music: { calm: 'assets/audio/bgm_keel_lullaby.mp3', storm: 'assets/audio/bgm_keel_squall.mp3' },
};

// ================================================================ I18N (English required; Turkish too)
const STRINGS = {
  en: {
    play: 'Play', nights: 'Nights', lampRoom: 'Lamp Room', longNight: 'Long Night', tagline: 'Light the way. Bring every boat home.',
    night: 'Night {n}', locked: 'Locked', back: 'Back', paused: 'Paused', resume: 'Resume', restart: 'Restart', menu: 'Menu',
    next: 'Next night', replay: 'Replay', retry: 'Try again', double: '▶ Double coins', doubled: 'Coins doubled!', adUnavailable: 'Ad not available right now',
    safe: 'Safe harbour!', closed: 'Harbour closed', closedSub: 'Too many wrecks tonight. Try again!', longOver: 'Dawn breaks',
    starDone: 'Every boat in', starNoWreck: 'No wrecks', starPar: 'Under {t}', best: 'Best', newBest: 'New best!', score: 'boats home',
    longLocked: 'Clear night 5', allDone: 'Every night is safe. Try the Long Night!',
    skipTips: 'Skip tips', or: 'or', foghorn: 'Foghorn',
    tipBeam: 'Move your light onto the boat', tipLead: 'Boats follow your light. Lead it to its pier', tipDark: 'Boats left in the dark drift toward the shore',
    tipColors: 'Each boat docks only at the pier with its colour and symbol', tipRocks: 'Rocks hide in the dark. Keep boats away from them',
    tipWarn: 'A warning sign means a crash is coming. Light that boat!', tipCurrent: 'Currents push the boats you leave in the dark',
    tipHorn: 'Foghorn: every boat in the dark stops and waits', tipFerry: 'Big ferries are slow, but they pay the most',
    tipFog: 'Boats vanish in the fog. Sweep your light to find them', tipWhirl: 'Keep boats away from the whirlpool',
    tipFour: 'Four piers tonight. Match the symbols!', tipStorm: 'Gusts push the boats. Lightning shows the rocks',
    tipWhale: 'Ripples mean the whale is coming up. Its splash pushes boats',
    aground: 'Aground!', rocksHit: 'Rocks!', whirlHit: 'Whirlpool!', combo: 'Combo ×{n}', needCoins: 'Not enough coins', max: 'Max',
    upBeam: 'Wide Beam', upBeamD: 'A bigger circle of light', upSweep: 'Swift Lamp', upSweepD: 'Your light moves faster',
    upHorn: 'Long Horn', upHornD: 'Boats wait longer, the horn recharges sooner', upLens: 'Bright Lens', upLensD: 'Boats in the light sail faster',
    hzFog: 'Fog rolls in', hzWhale: 'The moonwhale is awake', hzStorm: 'A storm is coming', hzWhirl: 'A whirlpool opens',
  },
  tr: {
    play: 'Oyna', nights: 'Geceler', lampRoom: 'Fener Odası', longNight: 'Uzun Gece', tagline: 'Yolu aydınlat. Her tekneyi limana getir.',
    night: 'Gece {n}', locked: 'Kilitli', back: 'Geri', paused: 'Duraklatıldı', resume: 'Devam', restart: 'Yeniden', menu: 'Menü',
    next: 'Sonraki gece', replay: 'Tekrar', retry: 'Tekrar dene', double: '▶ Altınları ikiye katla', doubled: 'Altınlar ikiye katlandı!', adUnavailable: 'Şu anda reklam yok',
    safe: 'Liman güvende!', closed: 'Liman kapandı', closedSub: 'Bu gece çok fazla kaza oldu. Tekrar dene!', longOver: 'Şafak söktü',
    starDone: 'Bütün tekneler limanda', starNoWreck: 'Hiç kaza yok', starPar: '{t} altında', best: 'En iyi', newBest: 'Yeni rekor!', score: 'tekne limanda',
    longLocked: '5. geceyi bitir', allDone: 'Bütün geceler güvende. Uzun Gece’yi dene!',
    skipTips: 'İpuçlarını geç', or: 'ya da', foghorn: 'Sis düdüğü',
    tipBeam: 'Işığını teknenin üstüne getir', tipLead: 'Tekneler ışığını izler. Onu iskelesine götür', tipDark: 'Karanlıkta kalan tekneler kıyıya doğru sürüklenir',
    tipColors: 'Her tekne yalnızca kendi renk ve simgesindeki iskeleye yanaşır', tipRocks: 'Kayalar karanlıkta saklanır. Tekneleri onlardan uzak tut',
    tipWarn: 'Uyarı işareti kaza geliyor demek. O tekneyi aydınlat!', tipCurrent: 'Akıntılar karanlıkta bıraktığın tekneleri sürükler',
    tipHorn: 'Sis düdüğü: karanlıktaki bütün tekneler durup bekler', tipFerry: 'Büyük vapurlar yavaştır ama en çok onlar kazandırır',
    tipFog: 'Tekneler siste kaybolur. Onları bulmak için ışığını gezdir', tipWhirl: 'Tekneleri girdaptan uzak tut',
    tipFour: 'Bu gece dört iskele var. Simgeleri eşleştir!', tipStorm: 'Rüzgâr tekneleri iter. Şimşek kayaları gösterir',
    tipWhale: 'Halkalar balinanın çıkacağını gösterir. Sıçrayışı tekneleri iter',
    aground: 'Karaya oturdu!', rocksHit: 'Kayalar!', whirlHit: 'Girdap!', combo: 'Kombo ×{n}', needCoins: 'Yeterli altın yok', max: 'Tam',
    upBeam: 'Geniş Işık', upBeamD: 'Daha büyük bir ışık halkası', upSweep: 'Hızlı Fener', upSweepD: 'Işığın daha hızlı hareket eder',
    upHorn: 'Uzun Düdük', upHornD: 'Tekneler daha uzun bekler, düdük daha çabuk dolar', upLens: 'Parlak Mercek', upLensD: 'Işıktaki tekneler daha hızlı gider',
    hzFog: 'Sis çöküyor', hzWhale: 'Ay balinası uyandı', hzStorm: 'Fırtına geliyor', hzWhirl: 'Bir girdap açıldı',
  },
};
let lang = 'en';
const t = (k, vars) => { let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
const nm = (def) => def.name[lang] || def.name.en;
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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a new Long Night best, the last night cleared

// Midgame: only between runs/levels, never on navigation buttons. Mute on adStarted (not on request); always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, never on the active gameplay screen, reward only on adFinished. On error the button is hidden
// for the session, so it never "does nothing" (Basic Launch has ads off, adblockers block them).
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

// ================================================================ AUDIO (Web Audio SFX + loops + synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  dock: ['triangle', 880, 1320, 0.35, 0.12], lit: ['sine', 660, 990, 0.18, 0.06], wreck: ['sawtooth', 220, 60, 0.5, 0.14], bump: ['square', 180, 120, 0.08, 0.08],
  toot: ['square', 392, 392, 0.22, 0.05], horn: ['sawtooth', 110, 98, 1.4, 0.12], whale: ['sine', 300, 120, 1.2, 0.1], gust: ['sine', 200, 500, 0.6, 0.05],
  thunder: ['sawtooth', 80, 30, 1.0, 0.12], done: ['triangle', 523, 1046, 0.7, 0.14], fail: ['triangle', 392, 196, 0.8, 0.12], combo: ['square', 1175, 1568, 0.16, 0.07],
  warn: ['triangle', 740, 620, 0.25, 0.06], star: ['sine', 1320, 1980, 0.25, 0.1], unlock: ['triangle', 660, 1320, 0.4, 0.12], click: ['square', 900, 900, 0.03, 0.08],
  coin: ['square', 1320, 1980, 0.12, 0.08], lamp: ['sine', 440, 880, 0.5, 0.08],
};
const LOOPS = new Set(['sea', 'rain', 'whirl']);
const audio = { ctx: null, master: null, buffers: {}, music: null, musicUrl: '', wantMusic: false, muted: new Set(), voices: 0, loops: {} };

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
  if (audio.muted.size || !audio.ctx || audio.voices > 12 || SIMMING) return;
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
function setLoop(key, vol) { // looping ambience (sea, rain, whirlpool); missing files simply stay silent
  if (!audio.ctx) return;
  let L = audio.loops[key];
  if (!L) {
    if (vol <= 0.001 || !audio.buffers[key]) return;
    const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain(); s.buffer = audio.buffers[key]; s.loop = true; g.gain.value = 0;
    s.connect(g); g.connect(audio.master); s.start(); L = audio.loops[key] = { s, g, v: 0 };
  }
  if (Math.abs(L.v - vol) > 0.01) { L.v = vol; L.g.gain.setTargetAtTime(vol, audio.ctx.currentTime, 0.5); }
}
function playMusic(url) {
  audio.wantMusic = true;
  if (audio.music && audio.musicUrl !== url) { audio.music.pause(); audio.music = null; }
  if (!audio.music && url) {
    audio.musicUrl = url; const m = new Audio(url); m.loop = true; m.volume = 0.3; m.onerror = () => { if (audio.music === m) audio.music = null; }; audio.music = m;
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

// ================================================================ SCENE (sky, sea, lighthouse, town: built once)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1030'); scene.fog = new THREE.Fog('#141a3c', 45, 150);
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight('#7d92e6', '#1c2348', 2.3);
const moonLight = new THREE.DirectionalLight('#b3c4ff', 1.3); moonLight.position.set(-30, 40, -50);
const spot = new THREE.SpotLight('#ffd58a', 9, 0, 0.3, 0.55, 0);
const pierLights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight('#ffffff', 0, 7, 1.6); scene.add(l); return l; }); // fixed light count: no shader recompiles between nights
scene.add(hemi, moonLight, spot, spot.target);
const sky = buildSky(); scene.add(sky);
const water = buildWater(); scene.add(water.mesh);
const beamMesh = buildBeam(); scene.add(beamMesh);
const lighthouse = buildLighthouse(); scene.add(lighthouse);
scene.add(buildTown());
const LAMP = lighthouse.userData.lamp;
let shakeAmt = 0, clock = 0, SIMMING = false;

// ================================================================ VIEW (meshes for the current night; the rules never touch them)
let view = null;
function disposeTree(o) {
  o.traverse((c) => {
    c.geometry?.dispose();
    const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
    for (const m of ms) if (!m.userData?.shared) m.dispose();
  });
}
function buildView(w) {
  if (view) { scene.remove(view.root); disposeTree(view.root); }
  const root = new THREE.Group(); scene.add(root);
  const piers = w.piers.map((p) => { const m = buildPier(p.x, p.color); root.add(m); return m; });
  pierLights.forEach((l, i) => {
    const p = w.piers[i]; l.intensity = p ? 5 : 0;
    if (p) { l.color.set(COLORS[p.color].hex); l.position.set(p.x + 0.45, 2.1, SHORE - PIER_LEN + 0.2); }
  });
  const rocks = w.rocks.map((r) => { const m = buildRock(r); root.add(m); return m; });
  const fogMat = new THREE.SpriteMaterial({ map: fogTex(), color: '#aab6e6', transparent: true, opacity: 0.4, depthWrite: false, fog: false });
  const fogs = w.fogs.map((f, i) => {
    const g = new THREE.Group(), r = rng(40 + i);
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Sprite(fogMat); const a = r() * Math.PI * 2, d = r() * f.r * 0.6;
      s.position.set(Math.cos(a) * d, 0.5 + r() * 1.1, Math.sin(a) * d * 0.7); s.scale.setScalar(f.r * (1.0 + r() * 0.6)); s.renderOrder = 8; g.add(s);
    }
    root.add(g); return g;
  });
  let whale = null, rain = null;
  if (w.whale) { whale = buildWhale(); whale.visible = false; root.add(whale); }
  if (w.storm) {
    const n = 700, pos = new Float32Array(n * 6), r = rng(77);
    for (let i = 0; i < n; i++) { const x = -19 + r() * 38, y = r() * 16, z = -14 + r() * 26; pos.set([x, y, z, x, y - 0.5, z], i * 6); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#a9bcff', transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    rain.frustumCulled = false; root.add(rain);
  }
  view = { root, piers, rocks, fogs, whale, rain, boats: new Map(), rowers: [] };
}
function addBoatMesh(b) {
  const m = buildBoat(b.type, b.color, b.seed); m.position.set(b.x, 0, b.z); m.rotation.y = b.yaw; m.scale.setScalar(0.01);
  view.root.add(m); view.boats.set(b.id, m);
}
function removeBoatMesh(b) {
  const m = view?.boats.get(b.id); if (!m) return;
  view.root.remove(m); disposeTree(m); view.boats.delete(b.id);
}

// ================================================================ RULES (fixed-step simulation; the renderer only reads it)
const lvl = (id) => (W?.demo ? 1 : save.up[id] | 0);
const beamR = () => CFG.beamR + CFG.beamRUp * lvl('beam');
const sweepSpeed = () => CFG.sweep + CFG.sweepUp * lvl('sweep');
const hornDur = () => CFG.hornDur + CFG.hornDurUp * lvl('horn');
const hornCd = () => CFG.hornCd - CFG.hornCdUp * lvl('horn');
const lensMul = () => 1 + CFG.lensUp * lvl('lens');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

let W = null; // the world of the current night (or the menu demo)
function createWorld(def, mode = 'night') {
  const endless = mode === 'long', demo = mode === 'demo', piers = nightPiers(def);
  const avoid = def.whirl ? [{ x: def.whirl[0], z: def.whirl[1], r: CFG.whirlR + 1.4 }] : [];
  const rocks = scatterRocks(def.rocks, def.seed, piers.map((p) => p.x), avoid), r = rng(def.seed * 7 + 1);
  const nFog = endless ? 3 : def.fog | 0;
  const fogs = Array.from({ length: nFog }, (_, i) => ({
    x: -14 + (i + 0.5) * (28 / nFog) + (r() - 0.5) * 3, z: -7.5 + r() * 8.5, r: CFG.fogR * (0.85 + r() * 0.35), vx: (r() > 0.5 ? 1 : -1) * (0.25 + r() * 0.2), on: !endless,
  }));
  return {
    def, mode, endless, demo, t: 0, boats: [], rocks, piers: piers.map((p) => ({ ...p, side: 0 })), fogs,
    currents: (def.currents || []).map((c) => ({ ...c, on: true })),
    whirl: def.whirl ? { x: def.whirl[0], z: def.whirl[1], on: !endless, k: endless ? 0 : 1 } : null,
    storm: def.storm || endless ? { on: !!def.storm, flash: 0, nextFlash: 5, gust: null, nextGust: 8 } : null,
    whale: def.whale || endless ? { on: !!def.whale, phase: 'idle', t: 0, next: 9, x: 0, z: 0, yaw: 0 } : null,
    total: endless || demo ? Infinity : def.boats, spawned: 0, docked: 0, wrecked: 0, hearts: CFG.hearts, coins: 0, combo: 0, lastDock: -99,
    spawnT: demo ? 1.2 : 2.4, thinkT: 0, horn: { on: !!def.horn, t: 0, cd: 0 }, beam: { x: 0, z: -2, tx: 0, tz: -2 }, nextId: 1, result: null, endT: 0,
    rnd: rng(def.seed * 13 + (endless ? 5 : 0)), announced: {}, whys: {},
  };
}
const maxAt = () => (W.endless ? LONG.maxAt(W.t) : W.def.maxAt);
const every = () => (W.endless ? LONG.every(W.t) : W.def.every);
const driftK = () => (W.endless ? LONG.drift(W.t) : W.def.drift);
const sailing = () => W.boats.filter((b) => b.state === 'sail');

function pickType() {
  const ent = Object.entries(W.def.types); let x = W.rnd() * ent.reduce((a, [, v]) => a + v, 0);
  for (const [k, v] of ent) { x -= v; if (x <= 0) return k; }
  return ent[0][0];
}
function spawnBoat() {
  const type = pickType(), T = CFG.boats[type], z = -10.4;
  let x = 0;
  for (let i = 0; i < 10; i++) { x = -11.5 + W.rnd() * 23; if (!W.boats.some((b) => b.state === 'sail' && Math.hypot(b.x - x, b.z - z) < 3.2)) break; }
  const gx = -9 + W.rnd() * 18, hx = gx - x, hz = SHORE - z, l = Math.hypot(hx, hz), k = T.dark * driftK();
  const b = {
    id: W.nextId++, type, T, color: (W.rnd() * W.piers.length) | 0, x, z, hx: hx / l, hz: hz / l, vx: (hx / l) * k, vz: (hz / l) * k, yaw: Math.atan2(hx, hz),
    state: 'sail', lit: false, t: 0, danger: 99, risk: 99, hidden: false, anim: 0, litCd: 0, bumpCd: 0, wake: 0, seed: (W.rnd() * 1e6) | 0,
  };
  W.boats.push(b); W.spawned++; ev('spawn', b);
}
function dock(b, p) {
  b.state = 'dock'; b.anim = 0; p.side ^= 1;
  b.berthX = p.x + (p.side ? 1 : -1) * (0.72 + BOAT_TYPES[b.type].w * BOAT_SCALE); b.fromX = b.x; b.fromZ = b.z;
  W.docked++; W.combo = W.t - W.lastDock < CFG.comboWindow ? W.combo + 1 : 1; W.lastDock = W.t;
  b.gain = b.T.value + (W.combo - 1) * 2; W.coins += b.gain;
  ev('dock', b);
}
function wreck(b, why) {
  b.state = 'wreck'; b.anim = 0; b.why = why; W.wrecked++; W.combo = 0; W.whys[`${why}:${b.type}:${b.lit ? 'lit' : 'dark'}`] = (W.whys[`${why}:${b.type}:${b.lit ? 'lit' : 'dark'}`] | 0) + 1;
  if (!W.demo) W.hearts--;
  ev('wreck', b);
  if (W.hearts <= 0 && !W.result) { W.result = 'fail'; W.endT = 2; }
}
function blowHorn() {
  const h = W?.horn; if (!h?.on || h.cd > 0 || W.result) return;
  h.t = hornDur(); h.cd = hornCd(); ev('horn'); tipEvent('horn');
}

function updateBeam(dt) {
  const bm = W.beam;
  if (W.demo || BOT) { bm.tx = bot.tx; bm.tz = bot.tz; }
  else if (input.mode === 'keys') { const k = keyDir(); bm.tx = bm.x + k.x * 2; bm.tz = bm.z + k.y * 2; }
  else if (input.mode === 'pointer') { bm.tx = input.wx; bm.tz = input.wz; }
  bm.tx = clamp(bm.tx, AREA.x0 + 0.4, AREA.x1 - 0.4); bm.tz = clamp(bm.tz, AREA.z0, SHORE - 0.3);
  const dx = bm.tx - bm.x, dz = bm.tz - bm.z, d = Math.hypot(dx, dz), mx = sweepSpeed() * dt;
  if (d <= mx) { bm.x = bm.tx; bm.z = bm.tz; } else { bm.x += (dx / d) * mx; bm.z += (dz / d) * mx; }
}

function stepBoat(b, dt) {
  const T = b.T, bm = W.beam; b.t += dt; b.litCd -= dt; b.bumpCd -= dt;
  const dB = Math.hypot(bm.x - b.x, bm.z - b.z), lit = dB < beamR() + T.r * 0.3;
  if (lit && !b.lit) { if (b.litCd <= 0) ev('lit', b); b.litCd = 1.5; }
  b.lit = lit;
  const anchored = !lit && W.horn.t > 0;
  let tx = 0, tz = 0;
  if (lit) { // follow the light, easing in as the boat reaches its centre
    const sp = T.lit * lensMul() * Math.min(1, dB / 1.4);
    if (dB > 0.2) { tx = ((bm.x - b.x) / dB) * sp; tz = ((bm.z - b.z) / dB) * sp; }
    const s = Math.hypot(b.vx, b.vz); if (s > 0.3) { b.hx = b.vx / s; b.hz = b.vz / s; }
  } else if (!anchored) { // drift on: the heading bends slowly toward the shore, sailboats wander
    let a = Math.atan2(b.hz, b.hx), da = Math.PI / 2 - a; da = Math.atan2(Math.sin(da), Math.cos(da));
    a += Math.sign(da) * Math.min(Math.abs(da), 0.1 * dt) + (T.wander ? Math.sin(b.t * 0.6 + b.id) * T.wander * dt : 0);
    b.hx = Math.cos(a); b.hz = Math.sin(a);
    const sp = T.dark * driftK(); tx = b.hx * sp; tz = b.hz * sp;
  }
  if (!anchored) { // the sea pushes everyone, boats in the light a lot less
    const k = lit ? 0.35 : 1;
    for (const c of W.currents) if (c.on && Math.abs(b.x - c.x) < c.w / 2 && Math.abs(b.z - c.z) < c.h / 2) { tx += c.dx * k; tz += c.dz * k; }
    const g = W.storm?.on && W.storm.gust; if (g && g.phase === 'blow') { tx += g.dx * CFG.gust * k; tz += g.dz * CFG.gust * k; }
    const wh = W.whirl;
    if (wh?.on) {
      const ex = wh.x - b.x, ez = wh.z - b.z, d = Math.hypot(ex, ez);
      if (d < CFG.whirlR && d > 0.01) { const pull = CFG.whirlPull * wh.k * (1 - d / CFG.whirlR) * (lit ? 0.3 : 1); tx += (ex / d) * pull - (ez / d) * pull * 0.8; tz += (ez / d) * pull + (ex / d) * pull * 0.8; }
    }
  }
  const a = Math.min(1, dt * CFG.accel);
  b.vx += (tx - b.vx) * a; b.vz += (tz - b.vz) * a;
  b.x += b.vx * dt; b.z += b.vz * dt;
  if (Math.hypot(b.vx, b.vz) > 0.06) { let d = Math.atan2(b.vx, b.vz) - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); b.yaw += d * Math.min(1, dt * 3.2); }
}
function stepAnim(b, dt) { // docking glides into the boathouse; wrecks tip over and sink
  b.anim += dt;
  if (b.state === 'dock') {
    const z0 = DOCK_Z + 0.5; let want;
    if (b.anim < 0.8) { const k = ease(b.anim / 0.8); b.x = lerp(b.fromX, b.berthX, k); b.z = lerp(b.fromZ, z0, k); want = Math.atan2(b.berthX - b.fromX, z0 - b.fromZ + 0.01); }
    else { b.x = b.berthX; b.z = lerp(z0, SHORE - 0.1, ease(Math.min(1, (b.anim - 0.8) / 1.4))); want = 0; }
    let d = want - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); b.yaw += d * Math.min(1, dt * 6);
    if (b.anim > 2.6) { b.state = 'gone'; ev('gone', b); }
  } else if (b.state === 'wreck') {
    b.vx *= 1 - dt * 3; b.vz *= 1 - dt * 3; b.x += b.vx * dt; b.z += b.vz * dt;
    if (b.anim > 2.4) { b.state = 'gone'; ev('gone', b); }
  }
}
function collide() {
  const sail = sailing();
  for (let i = 0; i < sail.length; i++) for (let j = i + 1; j < sail.length; j++) { // boats bonk, never sink each other
    const a = sail[i], b = sail[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.T.r + b.T.r;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, push = (min - d) / 2; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rel < 0) { a.vx += nx * rel * 0.6; a.vz += nz * rel * 0.6; b.vx -= nx * rel * 0.6; b.vz -= nz * rel * 0.6; }
    if (rel < -0.5 && a.bumpCd <= 0) { a.bumpCd = b.bumpCd = 0.6; ev('bump', a); }
  }
  for (const b of sail) {
    const r = b.T.r;
    for (const p of W.piers) { // piers are solid; touching your own pier docks you
      const cx = clamp(b.x, p.x - 0.65, p.x + 0.65), cz = clamp(b.z, SHORE - PIER_LEN, SHORE + 1), dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (p.color === b.color) { dock(b, p); break; }
      if (d > 1e-4) { b.x = cx + (dx / d) * r; b.z = cz + (dz / d) * r; const vn = b.vx * (dx / d) + b.vz * (dz / d); if (vn < 0) { b.vx -= (dx / d) * vn * 1.3; b.vz -= (dz / d) * vn * 1.3; } }
      else b.x += b.x < p.x ? -0.05 : 0.05;
      if (b.bumpCd <= 0) { b.bumpCd = 0.6; ev('bump', b); }
    }
    if (b.state !== 'sail') continue;
    const home = W.piers[b.color];
    if (Math.hypot(b.x - home.x, b.z - DOCK_Z) < 1.15) { dock(b, home); continue; }
    if (W.rocks.some((k) => Math.hypot(b.x - k.x, b.z - k.z) < k.r * 0.9 + r * 0.75)) { wreck(b, 'rock'); continue; }
    if (W.whirl?.on && W.whirl.k >= 1 && Math.hypot(b.x - W.whirl.x, b.z - W.whirl.z) < CFG.whirlCore + r * 0.4) { wreck(b, 'whirl'); continue; }
    if (b.z + r * 0.6 > SHORE) { wreck(b, 'shore'); continue; }
    if (Math.abs(b.x) + r * 0.5 > AREA.x1) { wreck(b, 'rock'); continue; }
    if (b.z < AREA.z0) { b.z = AREA.z0; b.vz = Math.abs(b.vz) * 0.3; b.hz = Math.abs(b.hz) + 0.3; const l = Math.hypot(b.hx, b.hz); b.hx /= l; b.hz /= l; }
  }
}
// seconds until a boat hits something if it keeps its current velocity (99 = safe); drives the warning sign and the bot
function impactTime(b, horizon = 3) {
  let x = b.x, z = b.z; const vx = b.vx, vz = b.vz, r = b.T.r;
  if (Math.hypot(vx, vz) < 0.05) return 99;
  for (let s = 0.15; s <= horizon; s += 0.15) {
    x += vx * 0.15; z += vz * 0.15;
    if (W.piers.some((p) => Math.abs(x - p.x) < 0.65 + r && z > SHORE - PIER_LEN - r)) return 99; // a pier stops it (or docks it)
    if (z + r * 0.6 > SHORE || Math.abs(x) + r * 0.5 > AREA.x1) return s;
    for (const k of W.rocks) if (Math.hypot(x - k.x, z - k.z) < k.r * 0.9 + r * 0.75) return s;
    if (W.whirl?.on && Math.hypot(x - W.whirl.x, z - W.whirl.z) < CFG.whirlCore + 0.6) return s;
  }
  return 99;
}

function stepHazards(dt) {
  if (W.endless) { // the Long Night adds weather as it goes on
    const tt = W.t, on = (key, cond, msg) => { if (cond && !W.announced[key]) { W.announced[key] = 1; banner(t('longNight'), t(msg)); playSfx('warn', 0.5); } return cond; };
    const fogOn = on('fog', tt > LONG.fogAt, 'hzFog'); for (const f of W.fogs) f.on = fogOn;
    W.whale.on = on('whale', tt > LONG.whaleAt, 'hzWhale'); W.storm.on = on('storm', tt > LONG.stormAt, 'hzStorm'); W.whirl.on = on('whirl', tt > LONG.whirlAt, 'hzWhirl');
  }
  if (W.whirl?.on) W.whirl.k = Math.min(1, W.whirl.k + dt / 6); // a new whirlpool swirls up over a few seconds
  for (const f of W.fogs) { f.x += f.vx * dt; if (f.x > 19) f.x = -19; else if (f.x < -19) f.x = 19; }
  const st = W.storm;
  if (st?.on) {
    st.flash = Math.max(0, st.flash - dt * 2.5); st.nextFlash -= dt;
    if (st.nextFlash <= 0) { st.flash = 1; st.nextFlash = 7 + W.rnd() * 7; ev('thunder'); }
    if (!st.gust) {
      st.nextGust -= dt;
      if (st.nextGust <= 0) { const ang = (W.rnd() < 0.5 ? 0 : Math.PI) + (W.rnd() - 0.5) * 0.6; st.gust = { dx: Math.cos(ang), dz: Math.sin(ang), phase: 'warn', t: 2 }; }
    } else {
      st.gust.t -= dt;
      if (st.gust.t <= 0) { if (st.gust.phase === 'warn') { st.gust.phase = 'blow'; st.gust.t = 3; ev('gust'); } else { st.gust = null; st.nextGust = 9 + W.rnd() * 6; } }
    }
  }
  const wh = W.whale;
  if (wh?.on) {
    wh.t += dt;
    if (wh.phase === 'idle' && wh.t > wh.next) {
      for (let i = 0; i < 25; i++) {
        wh.x = -11 + W.rnd() * 22; wh.z = -8 + W.rnd() * 8.5;
        if (!W.rocks.some((k) => Math.hypot(k.x - wh.x, k.z - wh.z) < k.r + 2.6) && !(W.whirl?.on && Math.hypot(W.whirl.x - wh.x, W.whirl.z - wh.z) < 6)) break;
      }
      wh.yaw = W.rnd() * Math.PI * 2; wh.phase = 'warn'; wh.t = 0; ev('whaleWarn');
    } else if (wh.phase === 'warn' && wh.t > 2.4) {
      wh.phase = 'up'; wh.t = 0;
      for (const b of sailing()) { // the splash pushes boats outward
        const dx = b.x - wh.x, dz = b.z - wh.z, d = Math.hypot(dx, dz);
        if (d < CFG.whaleR && d > 0.01) { const imp = CFG.whalePush * (1 - d / CFG.whaleR) + 0.8; b.vx += (dx / d) * imp; b.vz += (dz / d) * imp; }
      }
      ev('whale');
    } else if (wh.phase === 'up' && wh.t > 2.4) { wh.phase = 'idle'; wh.t = 0; wh.next = 13 + W.rnd() * 7; }
  }
}
function stepSpawn(dt) {
  if (W.spawned >= W.total || W.result) return;
  W.spawnT -= dt;
  const active = sailing().length;
  if (active === 0 && W.spawnT > 1.5) W.spawnT = 1.5; // never leave the bay empty for long
  if (W.spawnT <= 0 && active < maxAt()) { spawnBoat(); W.spawnT = every(); }
}
function think() { // ten times a second: warning signs, and the bot's plan
  const sail = sailing();
  for (const b of sail) {
    const dg = b.lit ? 99 : impactTime(b, 3);
    if (dg < CFG.warnAt && b.danger >= CFG.warnAt && !b.hidden) ev('warn', b);
    b.danger = dg;
  }
  if (W.demo || BOT) botPlan(sail);
}
function step(dt) {
  if (!W || !(state === State.PLAYING || (state === State.MENU && W.demo))) return;
  W.t += dt;
  updateBeam(dt);
  const h = W.horn; h.t = Math.max(0, h.t - dt); h.cd = Math.max(0, h.cd - dt);
  stepSpawn(dt); stepHazards(dt);
  for (const b of W.boats) { if (b.state === 'sail') stepBoat(b, dt); else stepAnim(b, dt); }
  collide();
  W.boats = W.boats.filter((b) => b.state !== 'gone');
  W.thinkT -= dt; if (W.thinkT <= 0) { W.thinkT = 0.1; think(); }
  if (!W.result && !W.endless && !W.demo && W.spawned >= W.total && !W.boats.some((b) => b.state === 'sail')) { W.result = 'win'; W.endT = 1.6; }
  if (W.result) { W.endT -= dt; if (W.endT <= 0 && state === State.PLAYING) endNight(); }
  if (state === State.PLAYING) updateTips(dt);
}

// ================================================================ BOT (menu demo, trailer, balance runs)
const bot = { tx: 0, tz: -4, target: null };
const botScore = (b) => Math.hypot(b.x - W.beam.x, b.z - W.beam.z) - b.t * 0.15;
function botPlan(sail) {
  if (!sail.length) { bot.target = null; bot.tx = 0; bot.tz = -7; return; }
  for (const b of sail) b.risk = impactTime(b, 4);
  let tgt = sail.find((b) => b.id === bot.target) || null, urgent = null;
  for (const b of sail) if (b !== tgt && !b.lit && b.risk < 2.6 && (!urgent || b.risk < urgent.risk)) urgent = b;
  if (urgent && tgt && W.horn.on && W.horn.cd <= 0) blowHorn();
  else if (urgent && (!tgt || tgt.risk > urgent.risk + 0.6)) tgt = urgent;
  if (!tgt) tgt = sail.reduce((a, b) => (botScore(b) < botScore(a) ? b : a));
  bot.target = tgt.id;
  const dir = pathDir(tgt), d = Math.hypot(W.piers[tgt.color].x - tgt.x, DOCK_Z - tgt.z), lead = clamp(d, 0.6, 1.5);
  bot.tx = tgt.x + dir.x * lead; bot.tz = tgt.z + dir.z * lead;
}
function pathDir(b) { // try 32 headings: the one closest to the dock that keeps clear of rocks, whirlpool, piers and shore
  const p = W.piers[b.color], r = b.T.r; let gx = p.x, gz = DOCK_Z;
  if (b.z > DOCK_Z + 0.3 && Math.abs(b.x - p.x) > 1) { gx = b.x + Math.sign(p.x - b.x) * 0.5; gz = DOCK_Z - 1.2; } // between the piers: back out first
  const obs = W.rocks.map((k) => ({ x: k.x, z: k.z, r: k.r * 0.9 }));
  if (W.whirl?.on) obs.push({ x: W.whirl.x, z: W.whirl.z, r: CFG.whirlR * 0.55 });
  for (const q of W.piers) if (q !== p) for (let z = SHORE - PIER_LEN; z < SHORE; z += 0.7) obs.push({ x: q.x, z, r: 0.7 });
  const toG = Math.atan2(gz - b.z, gx - b.x), dG = Math.hypot(gx - b.x, gz - b.z);
  let best = { x: Math.cos(toG), z: Math.sin(toG) }, bestS = -1e9;
  for (let i = 0; i < 32; i++) {
    const a = toG + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 16), dx = Math.cos(a), dz = Math.sin(a);
    let clear = 9;
    for (let s = 0.35; s <= Math.min(3.5, dG + 0.4); s += 0.35) {
      const x = b.x + dx * s, z = b.z + dz * s;
      for (const o of obs) clear = Math.min(clear, Math.hypot(x - o.x, z - o.z) - o.r - r);
      clear = Math.min(clear, AREA.x1 - Math.abs(x) - r * 0.6);
      if (Math.abs(x - p.x) > 1.2) clear = Math.min(clear, SHORE - z - r);
    }
    const sc = Math.cos(a - toG) * 2 + Math.min(clear, 1) * 1.5 - (clear < 0.3 ? 50 : 0);
    if (sc > bestS) { bestS = sc; best = { x: dx, z: dz }; }
  }
  return best;
}

// ================================================================ FX (events -> sound, particles, pops)
function ev(kind, b) {
  const demo = W?.demo;
  switch (kind) {
    case 'spawn': addBoatMesh(b); if (!demo) { playSfx('toot', 0.16); ring(b.x, b.z, COLORS[b.color].hex, 3.2); } break;
    case 'lit': if (!demo) playSfx('lit', 0.6); tipEvent('lit'); break;
    case 'dock': {
      playSfx('dock', demo ? 0.25 : 0.8);
      burst(b.x, 1.2, b.z, COLORS[b.color].hex, 16, 3.2, { up: 2.5, size: 0.35 }); ring(b.x, b.z, COLORS[b.color].hex, 2.4);
      if (!demo) {
        pop(b.x, 1.8, b.z, `+${b.gain}`, 'coin');
        if (W.combo > 1) { playSfx('combo', 0.45); pop(b.x, 2.6, b.z, t('combo', { n: W.combo }), 'combo'); }
        pulse('hudCoins'); tipEvent('dock');
      }
      break;
    }
    case 'wreck':
      playSfx('wreck', demo ? 0.12 : 0.6); burst(b.x, 0.3, b.z, '#d8ecff', 22, 3.5, { up: 3, grav: 7, size: 0.32 });
      if (!demo) { shake(0.35); pop(b.x, 1.8, b.z, t(b.why === 'shore' ? 'aground' : b.why === 'whirl' ? 'whirlHit' : 'rocksHit'), 'bad'); pulse('hudHearts'); rower(b); }
      break;
    case 'bump': if (!demo) playSfx('bump', 0.35); break;
    case 'horn': playSfx('horn', 0.28); for (const [k, d] of [[0, 1.6], [1, 2.0], [2, 2.4]]) ring(LAMP.x - 1.5 - k * 0.3, LAMP.z, '#ffe7a8', 14 + k * 9, d, 0.32); break;
    case 'warn': if (!demo) playSfx('warn', 3); break;
    case 'thunder': playSfx('thunder', 0.4); break;
    case 'gust': playSfx('gust', 0.32); break;
    case 'whaleWarn': if (!demo) playSfx('warn', 3); break;
    case 'whale': {
      const wh = W.whale; playSfx('whale', 0.45); shake(0.2);
      burst(wh.x, 0.4, wh.z, '#e2f2ff', 30, 4.5, { up: 4, grav: 6, size: 0.4 }); ring(wh.x, wh.z, '#bfe4ff', CFG.whaleR * 1.3, 1.2);
      break;
    }
    case 'gone': removeBoatMesh(b); break;
    default:
  }
}

const parts = [];
function particle(x, y, z, color, vx, vy, vz, life, size, grav = 0, grow = 0) {
  let p = parts.find((q) => !q.visible);
  if (!p) {
    if (parts.length > 260) return;
    p = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    p.userData.v = new THREE.Vector3(); parts.push(p); scene.add(p);
  }
  p.material.color.set(color); p.position.set(x, y, z); p.userData.v.set(vx, vy, vz);
  Object.assign(p.userData, { life, max: life, size, grav, grow }); p.scale.setScalar(size); p.visible = true;
}
function burst(x, y, z, color, n, speed, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    particle(x, y, z, color, Math.cos(a) * s, (o.up ?? 1) * (0.5 + Math.random()), Math.sin(a) * s, 0.6 + Math.random() * 0.5, o.size ?? 0.3, o.grav ?? 3);
  }
}
function updateParticles(dt) {
  for (const p of parts) {
    if (!p.visible) continue;
    const u = p.userData; u.life -= dt; if (u.life <= 0) { p.visible = false; continue; }
    u.v.y -= u.grav * dt; p.position.addScaledVector(u.v, dt); if (p.position.y < 0.02 && u.grav) { p.position.y = 0.02; u.v.y = 0; u.v.x *= 0.9; u.v.z *= 0.9; }
    const k = u.life / u.max; p.scale.setScalar(u.size * (1 + u.grow * (1 - k))); p.material.opacity = Math.min(1, k * 1.6) * 0.9;
  }
}
const rings = [];
function ring(x, z, color, size, dur = 0.9, alpha = 0.7) { // an expanding ring on the water
  let r = rings.find((q) => !q.visible);
  if (!r) {
    r = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    r.rotation.x = -Math.PI / 2; rings.push(r); scene.add(r);
  }
  r.material.color.set(color); r.position.set(x, 0.12, z); Object.assign(r.userData, { t: 0, dur, size, alpha }); r.visible = true;
}
function updateRings(dt) {
  for (const r of rings) {
    if (!r.visible) continue;
    const u = r.userData; u.t += dt; const k = u.t / u.dur; if (k >= 1) { r.visible = false; continue; }
    r.scale.setScalar(0.3 + ease(k) * u.size); r.material.opacity = (1 - k) * u.alpha;
  }
}
function rower(b) { // the crew always gets home: a little dinghy rows to the shore
  if (!view) return;
  const m = buildBoat('skiff', b.color, b.seed + 1); m.scale.setScalar(0.65); m.userData.badge.visible = false; m.position.set(b.x, 0, b.z); view.root.add(m);
  view.rowers.push({ m, x: b.x, z: b.z, t: 0 });
}
function updateRowers(dt) {
  if (!view) return;
  for (let i = view.rowers.length - 1; i >= 0; i--) {
    const r = view.rowers[i]; r.t += dt;
    const k = Math.min(1, r.t / 4.5), z = lerp(r.z, SHORE - 0.2, ease(k));
    r.m.position.set(r.x + Math.sin(r.t * 2) * 0.1, Math.sin(r.t * 5) * 0.03, z); r.m.rotation.y = 0;
    r.m.userData.body.rotation.z = Math.sin(r.t * 6) * 0.08;
    if (k >= 1 || r.t > 5) { r.m.scale.multiplyScalar(0.9); if (r.m.scale.x < 0.05) { view.root.remove(r.m); disposeTree(r.m); view.rowers.splice(i, 1); } }
  }
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

const popPool = [];
function pop(x, y, z, text, cls) {
  if (SIMMING) return;
  let el = popPool.find((e) => !e._on);
  if (!el) { el = document.createElement('div'); $('pops').appendChild(el); popPool.push(el); }
  el.className = `pop ${cls}`; el.textContent = text; el._on = true; el._t = 0; el._p = new THREE.Vector3(x, y, z); el.hidden = false;
}
const _v = new THREE.Vector3();
function updatePops(dt) {
  for (const el of popPool) {
    if (!el._on) continue;
    el._t += dt; if (el._t > 1.3) { el._on = false; el.hidden = true; continue; }
    _v.copy(el._p); _v.y += el._t * 1.2; _v.project(camera);
    el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${Math.min(1, el._t * 6)})`;
    el.style.opacity = String(Math.min(1, (1.3 - el._t) * 3));
  }
}

// ================================================================ INPUT (mouse moves the light; touch drags it; keys steer it)
const keys = new Set(), input = { mode: 'none', wx: 0, wz: -2, touch: false };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const raycaster = new THREE.Raycaster(), waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _ndc = new THREE.Vector2();
function pointerToWorld(cx, cy) {
  _ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); raycaster.setFromCamera(_ndc, camera);
  if (raycaster.ray.intersectPlane(waterPlane, _hit)) { input.wx = _hit.x; input.wz = _hit.z; input.mode = 'pointer'; }
}
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) input.mode = 'keys';
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (state === State.PLAYING && (e.code === 'Space' || e.code === 'KeyH')) blowHorn();
  if (e.code === 'KeyR' && state === State.PLAYING) restartNight();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU && !$('menu').hidden) $('btnPlay').click();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.GAMEOVER) (!$('btnNext').hidden ? $('btnNext') : $('btnRetry')).click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function keyDir() {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp') ? 1 : 0);
  const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l };
}
const touchY = (e) => (e.pointerType === 'mouse' ? e.clientY : e.clientY - CFG.touchOffset); // keep the light above the finger
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio(); input.touch = e.pointerType !== 'mouse';
  if (state === State.PLAYING) { pointerToWorld(e.clientX, touchY(e)); if (input.touch) canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener('pointermove', (e) => {
  if (state !== State.PLAYING) return;
  if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) pointerToWorld(e.clientX, touchY(e));
});
$('btnHorn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); blowHorn(); });

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> GAMEOVER (results))
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, nightIndex = 0, camWant = 0, camBlend = 0, run = null;
const DEFAULT_SAVE = { v: 1, stars: [], best: [], coins: 0, up: { beam: 0, sweep: 0, horn: 0, lens: 0 }, tips: {}, tipsOff: false, longBest: 0 };
let save = structuredClone(DEFAULT_SAVE);

function setState(s, panel = 'menu') {
  state = s;
  for (const id of ['menu', 'nightsPanel', 'lamp']) $(id).hidden = !(s === State.MENU && panel === id);
  $('paused').hidden = s !== State.PAUSED; $('results').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  $('btnHorn').hidden = !(s === State.PLAYING && W?.horn?.on && !W.demo); hudCache = '';
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
const totalStars = () => NIGHTS.reduce((a, _, i) => a + starCount(i), 0);
const unlocked = (i) => i === 0 || (save.stars[i - 1] & 1) > 0;
const longUnlocked = () => (save.stars[4] & 1) > 0;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function nextNightToPlay() { for (let i = 0; i < NIGHTS.length; i++) if (!(save.stars[i] & 1)) return i; return NIGHTS.length - 1; }

// ================================================================ UI
click('btnPlay', () => startNight(nextNightToPlay()));
click('btnNights', () => openNights());
click('btnLamp', () => openLamp());
click('btnLong', () => { if (longUnlocked()) startLong(); else toast(t('longLocked')); });
click('btnNightsBack', () => showMenu());
click('btnLampBack', () => showMenu());
click('btnPause', () => togglePause());
click('btnRestart', () => restartNight());
click('btnResume', () => togglePause());
click('btnPauseRestart', () => restartNight());
click('btnPauseNights', () => openNights());
click('btnQuit', () => showMenu());
click('btnReplay', () => restartNight()); // replay: no ad (navigation-like, instant)
click('btnResNights', () => openNights());
click('btnResMenu', () => showMenu());
click('btnNext', () => { // the level end: the right moment for a midgame ad
  const n = nightIndex + 1;
  triggerMidgameAd(() => { if (n < NIGHTS.length) startNight(n); else { openNights(); toast(t('allDone')); } });
});
click('btnRetry', () => triggerMidgameAd(() => restartNight())); // between two runs after a lost night
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.coins += run.gain; run.gain *= 2; $('resCoins').textContent = run.gain; persist(); refreshMenu(); toast(t('doubled')); playSfx('coin', 0.7); }, () => {});
});
click('btnSkipTips', () => { save.tipsOff = true; persist(); $('tip').hidden = true; $('arrow').hidden = true; tipState = null; });

function showMenu() {
  if (!W?.demo) startDemo();
  setState(State.MENU, 'menu'); refreshMenu(); camWant = 0;
}
function refreshMenu() {
  const n = nextNightToPlay();
  $('playNight').textContent = t('night', { n: n + 1 });
  $('menuStars').textContent = totalStars(); $('menuStarsMax').textContent = NIGHTS.length * 3; $('menuCoins').textContent = save.coins;
  $('btnLong').classList.toggle('locked', !longUnlocked());
  $('longInfo').textContent = longUnlocked() ? (save.longBest ? `${t('best')} ${save.longBest}` : '') : t('longLocked');
}
function openNights() {
  if (!W?.demo) startDemo();
  setState(State.MENU, 'nightsPanel'); camWant = 0;
  const grid = $('nightGrid'); grid.innerHTML = ''; const cur = nextNightToPlay();
  NIGHTS.forEach((def, i) => {
    const b = document.createElement('button'), open = unlocked(i), s = save.stars[i] | 0;
    b.className = (open ? '' : 'locked') + (i === cur ? ' current' : '');
    b.innerHTML = open ? `${i + 1}<small>${nm(def)}</small><span class="st">${[1, 2, 4].map((m) => `<i class="ico ico-star${s & m ? '' : ' off'}"></i>`).join('')}</span>`
      : `<i class="ico ico-lock"></i><small>${t('locked')}</small>`;
    if (open) b.onclick = () => { unlockAudio(); playSfx('click', 0.6); startNight(i); };
    grid.appendChild(b);
  });
}
function openLamp() {
  setState(State.MENU, 'lamp'); camWant = 0;
  $('lampCoins').textContent = save.coins;
  const grid = $('upGrid'); grid.innerHTML = '';
  for (const u of UPGRADES) {
    const lv = save.up[u.id] | 0, max = lv >= CFG.prices.length, price = CFG.prices[lv], card = document.createElement('div');
    card.className = 'up-card';
    card.innerHTML = `<i class="ico ico-${u.icon} big"></i><b>${t(u.name)}</b><small>${t(u.desc)}</small>` +
      `<span class="pips">${CFG.prices.map((_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</span>`;
    const btn = document.createElement('button'); btn.className = max ? 'soft' : 'buy';
    btn.innerHTML = max ? t('max') : `<i class="ico ico-coin"></i>${price}`; btn.disabled = max;
    btn.onclick = () => {
      unlockAudio();
      if (save.coins < price) { toast(t('needCoins')); playSfx('click', 0.4); return; }
      save.coins -= price; save.up[u.id] = lv + 1; persist(); playSfx('unlock', 0.5); refreshMenu(); openLamp();
    };
    card.appendChild(btn); grid.appendChild(card);
  }
}
function buildHudHearts() {
  const el = $('hudHearts'); el.innerHTML = '';
  for (let i = 0; i < CFG.hearts; i++) { const s = document.createElement('i'); s.className = 'ico ico-lantern'; el.appendChild(s); }
}
let hudCache = '';
function updateHud() {
  if (!W || W.demo) return;
  const h = W.horn, key = `${W.docked}|${W.hearts}|${W.coins}|${W.spawned}|${Math.ceil(h.cd)}|${h.on}|${state}`;
  if (key !== hudCache) {
    hudCache = key;
    $('hudBoats').textContent = W.endless ? `${W.docked}` : `${W.docked}/${W.total}`;
    [...$('hudHearts').children].forEach((s, i) => s.classList.toggle('off', i >= W.hearts));
    $('hudCoinsN').textContent = W.coins;
    $('btnHorn').hidden = !(h.on && state === State.PLAYING);
  }
  if (h.on) { const btn = $('btnHorn'); btn.style.setProperty('--cd', String(h.cd / hornCd())); btn.classList.toggle('ready', h.cd <= 0); btn.classList.toggle('on', h.t > 0); }
}
function pulse(id) { const el = $(id); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
let bannerTimer = 0;
function banner(small, big) {
  if (SIMMING) return;
  const el = $('banner'); $('bannerSmall').textContent = small; $('bannerBig').textContent = big;
  el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ================================================================ TIPS (onboarding inside gameplay: a few words, an arrow, never a pause)
const TIPS = {
  first: [{ pic: 'pointer', text: 'tipBeam', arrow: 'boat', until: 'lit', time: 25 }, { pic: 'pier', text: 'tipLead', arrow: 'pier', until: 'dock', time: 40 }, { pic: 'boat', text: 'tipDark', time: 6 }],
  colors: [{ pic: 'badges', text: 'tipColors', arrow: 'pier', time: 7 }],
  rocks: [{ pic: 'rock', text: 'tipRocks', arrow: 'rock', time: 7 }, { pic: 'warn', text: 'tipWarn', time: 6 }],
  current: [{ pic: 'current', text: 'tipCurrent', time: 7 }],
  horn: [{ pic: 'horn', text: 'tipHorn', until: 'horn', time: 14 }],
  ferry: [{ pic: 'boat', text: 'tipFerry', time: 6 }],
  fog: [{ pic: 'fog', text: 'tipFog', time: 7 }],
  whirl: [{ pic: 'whirl', text: 'tipWhirl', arrow: 'whirl', time: 7 }],
  four: [{ pic: 'badges', text: 'tipFour', time: 6 }],
  storm: [{ pic: 'storm', text: 'tipStorm', time: 8 }],
  whale: [{ pic: 'whale', text: 'tipWhale', time: 8 }],
};
const PIC = (name, bg = '') => `<span class="tip-pic"${bg ? ` style="background:${bg}"` : ''}><i class="ico ico-${name}"></i></span>`;
const PICS = {
  pier: PIC('lantern'), boat: PIC('boat'), horn: PIC('horn', '#ffe7a8'), fog: PIC('fog', '#dfe5ff'), whirl: PIC('whirl', '#cfe8ff'), storm: PIC('storm', '#d7ddff'),
  whale: PIC('whale', '#cfe8ff'), rock: PIC('rock', '#d5d9e6'), warn: PIC('warn', '#ffe2b0'), current: PIC('wave', '#cfe8ff'),
  badges: `<span class="tip-badges">${COLORS.map((c) => `<i class="badge sym-${c.sym}" style="background:${c.hex}"></i>`).join('')}</span>`,
};
let tipState = null;
function startTips(key) {
  tipState = null; $('tip').hidden = true; $('arrow').hidden = true;
  if (!key || save.tipsOff || save.tips[key] || (AUTOPLAY && !FORCE_TIPS) || !TIPS[key]) return;
  tipState = { key, i: -1, t: 0 }; nextTip();
}
function nextTip() {
  const steps = TIPS[tipState.key]; tipState.i++; tipState.t = 0;
  if (tipState.i >= steps.length) { save.tips[tipState.key] = 1; persist(); tipState = null; $('tip').hidden = true; $('arrow').hidden = true; return; }
  const s = steps[tipState.i];
  const pointerPic = isTouch ? '<span class="hand"></span>'
    : `<span class="mouse"></span><span class="or">${t('or')}</span><span class="keys"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span>`;
  const hornPic = isTouch ? PICS.horn : `${PICS.horn}<kbd class="wide">Space</kbd>`;
  $('tipIcon').innerHTML = s.pic === 'pointer' ? pointerPic : s.pic === 'horn' ? hornPic : PICS[s.pic] || '';
  $('tipText').textContent = t(s.text); $('tip').hidden = false; $('tip').style.animation = 'none'; void $('tip').offsetWidth; $('tip').style.animation = '';
}
function tipEvent(kind) { if (tipState && TIPS[tipState.key][tipState.i]?.until === kind) nextTip(); }
const _a = new THREE.Vector3();
function tipAnchor(kind) {
  if (!W) return null;
  const first = sailing()[0];
  if (kind === 'boat' && first && !first.lit) return _a.set(first.x, 1.2, first.z);
  if (kind === 'pier') { const p = W.piers[first ? first.color : 0]; return p ? _a.set(p.x, 3.4, SHORE - PIER_LEN + 0.2) : null; }
  if (kind === 'rock' && W.rocks.length) { const k = W.rocks.reduce((a, b) => (Math.hypot(b.x, b.z + 3) < Math.hypot(a.x, a.z + 3) ? b : a)); return _a.set(k.x, 1.1, k.z); }
  if (kind === 'whirl' && W.whirl) return _a.set(W.whirl.x, 0.8, W.whirl.z);
  return null;
}
function updateTips(dt) {
  if (!tipState) return;
  const s = TIPS[tipState.key][tipState.i]; tipState.t += dt;
  if (s.time && tipState.t > s.time) nextTip();
}
function placeArrow() {
  const s = tipState && TIPS[tipState.key][tipState.i], arrow = $('arrow'), p = s?.arrow && tipAnchor(s.arrow);
  if (!p) { arrow.hidden = true; return; }
  p.project(camera); arrow.hidden = false; arrow.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`; arrow.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
}

// ================================================================ GAMEPLAY (nights, the Long Night, results)
function enterWorld(w) {
  for (const b of W?.boats || []) removeBoatMesh(b);
  W = w; buildView(W); hudCache = ''; bot.target = null;
  W.beam.x = W.beam.tx = input.wx = 0; W.beam.z = W.beam.tz = input.wz = -2;
  const stormy = !!W.def.storm;
  setLoop('rain', 0); setLoop('whirl', 0);
  if (!CAPTURE) playMusic(stormy ? ASSETS.music.storm : ASSETS.music.calm);
}
function startDemo() { enterWorld(createWorld(DEMO, 'demo')); camWant = 0; }
function startNight(i) {
  nightIndex = i; const def = NIGHTS[i];
  enterWorld(createWorld(def, 'night')); input.mode = isTouch ? 'none' : input.mode === 'keys' ? 'keys' : 'none';
  run = { gain: 0 }; buildHudHearts();
  $('hudNight').textContent = t('night', { n: i + 1 }); $('hudName').textContent = nm(def);
  setState(State.PLAYING); camWant = 1; playSfx('lamp', 0.5);
  banner(t('night', { n: i + 1 }), nm(def)); startTips(def.tip);
}
function startLong() {
  nightIndex = -1;
  enterWorld(createWorld(LONG, 'long')); input.mode = 'none';
  run = { gain: 0 }; buildHudHearts();
  $('hudNight').textContent = t('longNight'); $('hudName').textContent = '';
  setState(State.PLAYING); camWant = 1; playSfx('lamp', 0.5);
  banner(t('longNight'), save.longBest ? `${t('best')} ${save.longBest}` : t('tagline'));
}
function restartNight() { if (nightIndex < 0) startLong(); else startNight(nightIndex); }
function endNight() {
  const win = W.result === 'win', endless = W.endless;
  setState(State.GAMEOVER);
  const R = { title: '', sub: '', stars: 0, gain: W.coins };
  $('resStars').hidden = endless || !win; $('resScore').hidden = !endless; $('resSub').hidden = true;
  $('btnNext').hidden = endless || !win; $('btnRetry').hidden = !(endless || !win); $('btnReplay').hidden = endless || !win;
  if (endless) {
    const isBest = W.docked > save.longBest; if (isBest) { save.longBest = W.docked; happytime(); }
    $('resTitle').textContent = t('longOver'); $('resScoreN').textContent = W.docked; $('resBest').textContent = save.longBest; $('resNewBest').hidden = !isBest;
    playSfx(isBest ? 'done' : 'fail', isBest ? 0.5 : 0.35);
  } else if (win) {
    const def = NIGHTS[nightIndex], bits = 1 | (W.wrecked === 0 ? 2 : 0) | (W.t <= def.par ? 4 : 0);
    R.stars = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1); R.gain += R.stars * CFG.starBonus;
    const firstClear = !(save.stars[nightIndex] & 1);
    save.stars[nightIndex] = (save.stars[nightIndex] | 0) | bits;
    if (!save.best[nightIndex] || W.t < save.best[nightIndex]) save.best[nightIndex] = Math.round(W.t * 10) / 10;
    if (firstClear && nightIndex === NIGHTS.length - 1) happytime();
    $('resTitle').textContent = t('safe'); $('starParLabel').textContent = t('starPar', { t: fmt(def.par) });
    [0, 1, 2].forEach((k) => $(`star${k}`).classList.remove('on'));
    [1, 2, 4].forEach((m, k) => { if (bits & m) setTimeout(() => { $(`star${k}`).classList.add('on'); playSfx('star', 0.6); }, 350 + k * 380); });
    playSfx('done', 0.5);
  } else {
    $('resTitle').textContent = t('closed'); $('resSub').textContent = t('closedSub'); $('resSub').hidden = false; playSfx('fail', 0.35);
  }
  save.coins += R.gain; run.gain = R.gain; persist(); refreshMenu();
  $('resCoins').textContent = R.gain;
  $('btnDouble').hidden = !(adsAvailable() && R.gain > 0);
}

// ================================================================ LOOP (fixed-step sim, then the view follows it)
let last = performance.now(), acc = 0;
const camGame = { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 0, -1.4) }, camMenu = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _c = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 400), _q = new THREE.Vector3();
function fitCameras() {
  const aspect = innerWidth / innerHeight; _c.aspect = aspect; _c.fov = CFG.fov; _c.updateProjectionMatrix();
  const pts = [[-15.9, 0, -11.8], [15.9, 0, -11.8], [-15.9, 0, SHORE + 1.9], [15.9, 0, SHORE + 1.9], [-15.9, 0, -3], [15.9, 0, -3], [LAMP.x, LAMP.y + 1.2, LAMP.z]];
  const dir = new THREE.Vector3(0, Math.sin(CFG.pitch), Math.cos(CFG.pitch));
  let lo = 8, hi = 160;
  for (let i = 0; i < 30; i++) { // smallest distance that keeps the whole bay on screen, under the HUD
    const d = (lo + hi) / 2; _c.position.copy(camGame.look).addScaledVector(dir, d); _c.lookAt(camGame.look); _c.updateMatrixWorld();
    const ok = pts.every((p) => { _q.set(...p).project(_c); return Math.abs(_q.x) < 0.985 && _q.y < 0.84 && _q.y > -0.97; });
    if (ok) hi = d; else lo = d;
  }
  camGame.pos.copy(camGame.look).addScaledVector(dir, hi);
  const narrow = aspect < 1.25;
  camMenu.pos.set(narrow ? 2 : -3, narrow ? 15 : 12, narrow ? 40 : 29); camMenu.look.set(narrow ? 5 : 6, narrow ? 1.5 : 3.4, narrow ? -2 : -2);
}
function advance(dt) {
  camBlend += (camWant - camBlend) * (1 - Math.exp(-dt * 2.6));
  if (state !== State.PAUSED) { acc += dt; while (acc >= STEP) { step(STEP); clock += STEP; acc -= STEP; } }
  updateParticles(dt); updateRings(dt); updateRowers(dt);
}
const _lookNow = new THREE.Vector3(), _spotT = new THREE.Vector3(), _dir = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);
function render(dt) {
  const k = ease(clamp(camBlend, 0, 1));
  const sway = (1 - k) * Math.sin(clock * 0.15) * 0.8;
  camera.position.lerpVectors(camMenu.pos, camGame.pos, k); camera.position.x += sway;
  _lookNow.lerpVectors(camMenu.look, camGame.look, k);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(_lookNow);
  syncView(dt);
  renderer.render(scene, camera);
  if (!SIMMING) { updateHud(); updatePops(dt); if (state === State.PLAYING) placeArrow(); }
}
function syncView(dt) {
  if (!W || !view) return;
  const u = water.uniforms, bm = W.beam, R = beamR(), time = clock;
  u.uTime.value = time; u.uBeam.value.set(bm.x, bm.z, R);
  // beam cone, spotlight and the lamp head follow the light
  _spotT.set(bm.x, 0, bm.z); _dir.subVectors(_spotT, LAMP); const len = _dir.length(); _dir.divideScalar(len);
  beamMesh.position.copy(LAMP); beamMesh.quaternion.setFromUnitVectors(_down, _dir); beamMesh.scale.set(R, len, R);
  spot.position.copy(LAMP); spot.target.position.copy(_spotT); spot.angle = Math.atan(R / len) * 1.15;
  lighthouse.userData.head.rotation.y = Math.atan2(bm.x - LAMP.x, bm.z - LAMP.z);
  // weather
  const st = W.storm, flash = st?.on ? st.flash : 0;
  u.uFlash.value = flash; sky.userData.dome.material.uniforms.uFlash.value = flash; hemi.intensity = 2.3 + flash * 4;
  u.uStorm.value = lerp(u.uStorm.value, st?.on ? 1 : 0, Math.min(1, dt));
  const g = st?.on && st.gust; u.uWind.value.set(g ? g.dx : 1, g ? g.dz : 0, g ? (g.phase === 'warn' ? 0.5 + 0.5 * Math.sin(time * 10) : 1) : 0);
  if (view.rain) {
    view.rain.visible = !!st?.on;
    if (st?.on) {
      const p = view.rain.geometry.attributes.position, wx = g && g.phase === 'blow' ? g.dx * 0.25 : 0.06;
      for (let i = 0; i < p.count; i += 2) {
        let y = p.getY(i) - dt * 18; let x = p.getX(i) + wx * dt * 18;
        if (y < 0) { y += 16; x = -19 + Math.random() * 38; } if (x > 19) x -= 38; else if (x < -19) x += 38;
        p.setXYZ(i, x, y, p.getZ(i)); p.setXYZ(i + 1, x - wx * 2, y + 0.5, p.getZ(i));
      }
      p.needsUpdate = true;
    }
  }
  if (!SIMMING) { setLoop('sea', 0.6); setLoop('rain', st?.on ? 0.45 : 0); setLoop('whirl', W.whirl?.on && !W.demo ? 0.1 * W.whirl.k : 0); }
  // currents, whirlpool, whale ripples
  for (let i = 0; i < 3; i++) {
    const c = W.currents[i];
    if (c?.on) { u.uCur.value[i].set(c.x, c.z, c.w, c.h); u.uCurDir.value[i].set(c.dx, c.dz, 1); } else u.uCurDir.value[i].set(1, 0, 0);
  }
  u.uWhirl.value.set(W.whirl?.x || 0, W.whirl?.z || 0, CFG.whirlR * (0.4 + 0.6 * (W.whirl?.k ?? 0)), W.whirl?.on ? W.whirl.k : 0);
  const wh = W.whale;
  u.uRipple.value.set(wh?.x || 0, wh?.z || 0, 0, wh?.on && wh.phase === 'warn' ? Math.min(1, wh.t) : 0);
  if (view.whale) {
    const up = wh?.on && wh.phase === 'up', m = view.whale; m.visible = !!up;
    if (up) {
      const k2 = wh.t / 2.4, s = Math.sin(Math.PI * k2);
      m.position.set(wh.x + Math.sin(wh.yaw) * (k2 - 0.5) * 3.5, -2.2 + s * 2.3, wh.z + Math.cos(wh.yaw) * (k2 - 0.5) * 3.5);
      m.rotation.set(-(k2 - 0.5) * 1.1, wh.yaw, 0); m.userData.tail.rotation.x = Math.sin(time * 4) * 0.35;
      if (Math.random() < 0.25) particle(m.position.x, m.position.y + 1.1, m.position.z, '#e8f4ff', (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 0.7, 0.35, 5);
    }
  }
  // fog banks
  view.fogs.forEach((m, i) => { const f = W.fogs[i]; m.visible = f.on; m.position.set(f.x, 0, f.z); });
  for (const r of view.rocks) { const f = r.userData.foam; f.scale.setScalar(1 + Math.sin(time * 1.7 + r.position.x) * 0.08); }
  // piers: rings pulse while a boat of their colour is in the light
  const litCols = new Set(W.boats.filter((b) => b.state === 'sail' && b.lit).map((b) => b.color));
  view.piers.forEach((p, i) => {
    const on = litCols.has(W.piers[i].color), ring = p.userData.ring;
    ring.material.opacity = on ? 0.45 + 0.35 * Math.sin(time * 7) : 0.22; ring.scale.setScalar(on ? 1 + 0.06 * Math.sin(time * 7) : 1);
    p.userData.glow.scale.setScalar(2.6 + Math.sin(time * 2 + i) * 0.15);
    u.uPiers.value[i].set(W.piers[i].x, SHORE - PIER_LEN + 0.2, 1, 0);
  });
  for (let i = W.piers.length; i < 4; i++) u.uPiers.value[i].set(0, 0, 0, 0);
  // boats
  let n = 0;
  for (const b of W.boats) {
    const m = view.boats.get(b.id); if (!m) continue;
    const d = m.userData, inFog = W.fogs.some((f) => f.on && Math.hypot(b.x - f.x, b.z - f.z) < f.r * 0.8);
    b.hidden = inFog && !b.lit && b.state === 'sail';
    m.visible = !b.hidden;
    m.position.set(b.x, Math.sin(time * 2 + b.id) * 0.035, b.z); m.rotation.y = b.yaw;
    d.body.rotation.z = Math.sin(time * 1.6 + b.id) * 0.05 * (1 + (u.uStorm.value || 0)); d.body.rotation.x = Math.sin(time * 1.3 + b.id * 2) * 0.03;
    let s = 1;
    if (b.state === 'sail') s = Math.min(1, b.t / 0.5);
    else if (b.state === 'dock') s = b.anim > 2.2 ? Math.max(0.01, 1 - (b.anim - 2.2) / 0.4) : 1;
    m.scale.setScalar(Math.max(0.01, s));
    if (b.state === 'wreck') { d.body.rotation.z = Math.min(1, b.anim) * 0.8; m.position.y = -b.anim * 0.45; d.glow.visible = b.anim < 0.8; }
    d.badge.visible = b.state === 'sail';
    d.badge.scale.setScalar(b.lit ? 0.8 + 0.08 * Math.sin(time * 9) : 0.72);
    d.warn.visible = b.state === 'sail' && b.danger < CFG.warnAt && !W.demo;
    if (d.warn.visible) d.warn.scale.setScalar(0.8 * (1 + 0.2 * Math.sin(time * 14)));
    if (b.state === 'sail' && !b.hidden && n < 8) u.uBoats.value[n++].set(b.x, b.z, Math.min(1, b.t), b.color);
    const sp = Math.hypot(b.vx, b.vz);
    if (b.state === 'sail' && sp > 0.3 && !b.hidden && !SIMMING) {
      b.wake += dt * sp;
      if (b.wake > 0.35) { b.wake = 0; const back = BOAT_TYPES[b.type].l * BOAT_SCALE * 0.9; particle(b.x - Math.sin(b.yaw) * back, 0.06, b.z - Math.cos(b.yaw) * back, '#9fc4e8', 0, 0, 0, 1.1, 0.35 + b.T.r * 0.4, 0, 1.4); }
    }
  }
  for (; n < 8; n++) u.uBoats.value[n].set(0, 0, 0, 0);
  beamMesh.material.uniforms.uOn.value = lerp(1.5, 1, camBlend);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); fitCameras(); }
addEventListener('resize', resize);

// ================================================================ CAPTURE (press kit: frames, trailer, in-engine covers)
const COVER = { // a hand-staged night: three boats in the beam heading home, lanterns in the dark, the moonwhale surfacing
  rocks: [{ x: 3.4, z: -4.6, r: 0.8, seed: 1 }, { x: 11.2, z: -1.0, r: 0.7, seed: 2 }, { x: -3.8, z: -2.6, r: 0.9, seed: 3 }, { x: 14.2, z: -9.5, r: 1.0, seed: 4 }, { x: -9, z: -6, r: 0.8, seed: 5 }],
  boats: [['sail', 1, 6.9, -3.0, 0.35], ['trawler', 2, 8.7, -4.2, -0.25], ['skiff', 0, 5.4, -1.7, 0.5], ['ferry', 3, 0.2, -9.6, 0.55], ['trawler', 0, 2.8, -11, 0.2], ['sail', 2, 12.6, -8.2, -0.4], ['skiff', 1, -5.5, -3.6, 0.8]],
  cams: { // aspect: [camera position, look-at, field of view, upward shift that leaves water at the bottom for the title]
    wide: [[-4.2, 6.4, 4.0], [7.5, 2.9, -6], 50, 0.09], square: [[-4.5, 6.2, 2.6], [10.5, 2.6, -4.6], 52, 0.1], tall: [[-5.5, 7.4, 2.2], [12, 3.2, -4.4], 62, 0.1],
  },
};
function stageCover(kind) {
  for (const id of ['hud', 'menu', 'nightsPanel', 'lamp', 'paused', 'results', 'tip', 'arrow', 'banner', 'toast', 'btnHorn', 'pops']) $(id).hidden = true;
  state = State.BOOT;
  const w = createWorld({ ...NIGHTS[12], whale: true }, 'night'); w.rocks = COVER.rocks; enterWorld(w);
  for (const [type, color, x, z, yaw] of COVER.boats) {
    const b = { id: W.nextId++, type, T: CFG.boats[type], color, x, z, hx: 0, hz: 1, vx: 0, vz: 0, yaw, state: 'sail', lit: false, t: 5, danger: 99, risk: 99, hidden: false, anim: 0, litCd: 0, bumpCd: 0, wake: 0, seed: W.nextId * 77 };
    W.boats.push(b); addBoatMesh(b);
  }
  W.beam.x = 6.9; W.beam.z = -2.9; W.boats.forEach((b, i) => { b.lit = i < 3; });
  Object.assign(W.whale, { on: true, phase: 'up', t: 1.05, x: 6.5, z: -17, yaw: 1.7 });
  const aspect = innerWidth / innerHeight, [pos, look, fov, lift] = COVER.cams[aspect < 0.9 ? 'tall' : aspect < 1.2 ? 'square' : 'wide'];
  camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix();
  camera.position.set(...pos); _lookNow.set(...look); camera.lookAt(_lookNow); clock = 3.2;
  if (kind !== 'keyart') camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * lift, innerWidth, innerHeight);
  syncView(0);
  for (const m of [...view.boats.values(), ...view.piers]) m.userData.badge.visible = false; // the scene speaks for itself on a cover
  beamMesh.material.uniforms.uOn.value = 2.6;
  const wm = view.whale.position; for (let i = 0; i < 26; i++) particle(wm.x + (Math.random() - 0.5) * 0.5, wm.y + 1.3 + Math.random() * 2.4, wm.z + 1.2, '#e8f4ff', 0, 0, 0, 1, 0.3 + Math.random() * 0.3);
  renderer.render(scene, camera);
  camera.clearViewOffset(); camera.fov = CFG.fov; camera.updateProjectionMatrix();
}
function captureApi() {
  const capNight = clamp((params.get('night') | 0 || 13) - 1, 0, NIGHTS.length - 1);
  window.__game = {
    start: () => startNight(capNight),
    frame: (dt = 1 / 30) => { advance(dt); render(dt); },
    skip: (sec) => { SIMMING = true; for (let s = 0; s < sec; s += STEP) { advance(STEP); if (state === State.GAMEOVER) startNight(Math.min(NIGHTS.length - 1, nightIndex + 1)); } SIMMING = false; },
    sim: (sec) => { SIMMING = true; const end = clock + sec; while (clock < end && state === State.PLAYING) advance(STEP); SIMMING = false; return window.__game.info(); },
    night: (i) => startNight(i),
    long: () => startLong(),
    info: () => ({ state, night: nightIndex + 1, t: W?.t, docked: W?.docked, wrecked: W?.wrecked, hearts: W?.hearts, spawned: W?.spawned, total: W?.total, result: W?.result, coins: save.coins, stars: totalStars(), whys: W?.whys }),
    cover: (kind) => stageCover(kind),
    cam: (p, l) => { camMenu.pos.set(...p); camMenu.look.set(...l); }, // framing experiments
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
  const keysToLoad = Object.keys(ASSETS.sfx); let done = 0;
  const loads = keysToLoad.map((k) => loadSfx(k, ASSETS.sfx[k]).finally(() => { $('loadBar').style.width = `${(100 * ++done) / keysToLoad.length}%`; }));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  const saved = loadData(`${SAVE_KEY}:save`, null);
  if (saved && typeof saved === 'object') save = { ...structuredClone(DEFAULT_SAVE), ...saved, up: { ...DEFAULT_SAVE.up, ...(saved.up || {}) } };
  $('hornKey').hidden = isTouch;
  resize(); startDemo();
  setState(State.MENU, 'menu'); refreshMenu(); camBlend = 0;
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  if (CAPTURE) { captureApi(); render(0); } // capture protocol (tools/capture.mjs): no rAF loop, the tool drives every frame
  else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
