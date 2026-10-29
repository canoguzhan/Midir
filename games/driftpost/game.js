// Driftpost: you fly the valley's mail balloon. You can only go up or down, and every height has its own wind,
// so the puzzle is picking the layer that blows where you need to go, then dropping each parcel into its garden.
// Sections: CONFIG, I18N, SDK, AUDIO, SCENE, WORLD, RULES, HAZARDS, BOT, VIEW, FX, INPUT, STATE, UI, TIPS, GAMEPLAY, LOOP, CAPTURE, BOOT.
// Route data and wind rules live in levels.js (pure), meshes in world.js (procedural); only audio loads from ./assets/.
// No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';
import { FLOOR, LEVELS, ENDLESS, DEMO, HOUSE_COLORS, genWorld, windAt, layerAt, dirVec, rng } from './levels.js';
import {
  PAINTS, MAT, DEPOT_TOP, buildTerrain, buildWater, buildScenery, buildWindmill, buildDepot, buildHouse, buildRing, buildPin,
  buildBalloon, buildParcel, buildCloud, buildStorm, buildGoose, softTex,
} from './world.js';

// ================================================================ CONFIG
const SAVE_KEY = 'driftpost';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot flies the balloon (trailer footage, balance tests)
const FORCE_TIPS = params.has('tips'); // review onboarding in capture mode
const CFG = {
  fov: 42, camBack: 30, camUp: 25, // gameplay camera: offset behind (south) and above the balloon
  hearts: 3, climb: 7, climbUp: 0.08, sink: 1.6, vent: 8, vResp: 0.45, wResp: 2, // vertical speeds (units/s) and response times (s)
  thermalLift: 3.4, reachXZ: 7, reachY: 13, pickGap: 0.55, // pickups: within reachXZ of the post office, below its flag + reachY
  ring: 6.2, ringUp: 0.07, bull: 0.3, chuteAfter: 0.3, chuteFall: 7, chuteWind: 0.35, // landing ring radius (+8%/level), bullseye fraction
  invuln: 2.2, fare: 5, bullBonus: 3, fareUp: 1, starBonus: 10, prices: [40, 90, 160, 250, 360], paintPrice: 150,
  gooseSpeed: 8.5, gooseGap: [10, 16], stormR: 6.4, stormH: 5.2, letterTime: [38, 0.3], // letters: seconds = 38 + 0.3 * distance
  endlessTime: 120, endlessFare: 18, endlessBull: 5,
};
const UPGRADES = [
  { id: 'burner', name: 'upBurner', desc: 'upBurnerD', icon: 'flame' },
  { id: 'chute', name: 'upChute', desc: 'upChuteD', icon: 'target' },
  { id: 'book', name: 'upBook', desc: 'upBookD', icon: 'stamp' },
];
const ASSETS = {
  sfx: {
    burner: 'assets/audio/dp_burner_loop.mp3', vent: 'assets/audio/dp_vent.mp3', pickup: 'assets/audio/dp_pickup.mp3', drop: 'assets/audio/dp_drop.mp3',
    deliver: 'assets/audio/dp_deliver.mp3', bull: 'assets/audio/dp_bullseye.mp3', miss: 'assets/audio/dp_miss.mp3', goose: 'assets/audio/dp_goose.mp3',
    zap: 'assets/audio/dp_zap.mp3', bump: 'assets/audio/dp_bump.mp3', land: 'assets/audio/dp_land.mp3', thermal: 'assets/audio/dp_thermal.mp3',
    tick: 'assets/audio/dp_tick.mp3', gust: 'assets/audio/dp_ribbon.mp3', wind: 'assets/audio/kite_wind_loop.mp3', birds: 'assets/audio/bloom_birds.mp3',
    fail: 'assets/audio/keel_night_fail.mp3', done: 'assets/audio/kite_sky_done.mp3', star: 'assets/audio/wool_star.mp3', unlock: 'assets/audio/unlock.mp3',
    coin: 'assets/audio/works_coin_jar.mp3', click: 'assets/audio/rune_tile_tap.mp3', blocked: 'assets/audio/swv_blocked.mp3',
  },
  music: { day: 'assets/audio/bgm_driftpost_day.mp3', dusk: 'assets/audio/bgm_driftpost_dusk.mp3' },
};
const VOL = { // per-sound levels, evened out by ear and loudness measurement
  vent: 0.5, pickup: 0.7, drop: 0.6, deliver: 0.75, bull: 0.6, miss: 0.6, goose: 0.55, zap: 0.6, bump: 0.7, land: 0.6, thermal: 0.5, tick: 0.5,
  gust: 0.5, fail: 0.9, done: 0.5, star: 0.6, unlock: 0.5, coin: 0.6, click: 0.6, blocked: 0.5,
};

// ================================================================ I18N (English required; Turkish too)
const STRINGS = {
  en: {
    play: 'Play', routes: 'Routes', workshop: 'Workshop', endless: 'Sunset Rounds', tagline: 'Ride the right wind. Drop the post!',
    route: 'Route {n}', locked: 'Locked', back: 'Back', paused: 'Paused', resume: 'Resume', restart: 'Restart', menu: 'Menu',
    next: 'Next route', replay: 'Replay', retry: 'Try again', double: '▶ Double stamps', doubled: 'Stamps doubled!', adUnavailable: 'Ad not available right now',
    win: 'All delivered!', lose: 'Bumpy landing!', loseSub: 'Your balloon needs patching. Try again!', endlessOver: 'The sun has set',
    starDone: 'All delivered', starClean: 'No bumps or misses', starPar: 'Under {t}', best: 'Best', newBest: 'New best!', score: 'parcels delivered',
    endlessLocked: 'Finish route 5', allDone: 'Every route is done. Try Sunset Rounds!', skipTips: 'Skip tips', or: 'or',
    upgrades: 'Upgrades', paint: 'Balloon Paint', use: 'Use', inUse: 'In use', needCoins: 'Not enough stamps', max: 'Max',
    burn: 'Burner', vent: 'Vent', drop: 'Drop',
    tipBurn: 'Hold to fire the burner and rise', tipLayers: 'Each height has its own wind. The low wind blows to the red house',
    tipDrop: 'Drop when the landing marker turns green inside the ring', tipBack: 'Climb into the top wind, then fly low over the post office',
    tipCompass: 'The compass points to your target. Pick the height whose arrow matches it', tipBest: 'The glowing layer is the best wind right now',
    tipVent: 'Let go to sink slowly. Vent to drop fast', tipThermal: 'Shimmering fields push warm air up: free lift!',
    tipGeese: 'Geese! Their height shows on the altimeter. Climb or sink to let them pass', tipCap: 'Your basket holds two parcels now',
    tipStorm: 'Storm clouds drift with their wind. Fly above or below them', tipVeer: 'The winds turn slowly today. Watch the arrows',
    tipExpress: 'Letters are in a hurry: deliver them before the clock runs out', tipPeaks: 'Mountains block low winds. Climb over them',
    tipIsles: 'Island hopping! A parcel that lands in the sea is lost', tipShift: 'The wind shifts every half minute. A bell rings before it turns',
    tipBusy: 'Three parcels at once. Plan a round trip!',
    bump: 'Bonk!', zapped: 'Zap!', honk: 'Honk!', miss: 'Missed!', splash: 'Splash!', bullseye: 'Bullseye!', late: 'Late!', thermal: 'Updraft!',
    shiftSoon: 'The wind is about to shift!', shifted: 'New winds!', geeseIn: 'Geese ahead!', stormIn: 'Storms are rolling in!', winds: 'The winds are turning!',
    upBurner: 'Hot Burner', upBurnerD: 'Climb faster', upChute: 'Wide Chute', upChuteD: 'Bigger landing rings',
    upBook: 'Stamp Book', upBookD: '+1 stamp for every parcel', timeUp: 'Sunset', extra: '+{s}s',
  },
  tr: {
    play: 'Oyna', routes: 'Rotalar', workshop: 'Atölye', endless: 'Gün Batımı Turu', tagline: 'Doğru rüzgârı yakala. Postayı bırak!',
    route: 'Rota {n}', locked: 'Kilitli', back: 'Geri', paused: 'Duraklatıldı', resume: 'Devam', restart: 'Yeniden', menu: 'Menü',
    next: 'Sonraki rota', replay: 'Tekrar', retry: 'Tekrar dene', double: '▶ Pulları ikiye katla', doubled: 'Pullar ikiye katlandı!', adUnavailable: 'Şu anda reklam yok',
    win: 'Hepsi teslim!', lose: 'Sert iniş!', loseSub: 'Balonun yamaya ihtiyacı var. Tekrar dene!', endlessOver: 'Güneş battı',
    starDone: 'Hepsi teslim', starClean: 'Çarpma ya da ıska yok', starPar: '{t} altında', best: 'En iyi', newBest: 'Yeni rekor!', score: 'paket teslim',
    endlessLocked: '5. rotayı bitir', allDone: 'Bütün rotalar tamam. Gün Batımı Turu’nu dene!', skipTips: 'İpuçlarını geç', or: 'ya da',
    upgrades: 'Geliştirmeler', paint: 'Balon Boyası', use: 'Kullan', inUse: 'Kullanımda', needCoins: 'Yeterli pul yok', max: 'Tam',
    burn: 'Brülör', vent: 'Hava', drop: 'Bırak',
    tipBurn: 'Yükselmek için basılı tutup brülörü yak', tipLayers: 'Her yükseklikte başka bir rüzgâr eser. Alçak rüzgâr kırmızı eve gider',
    tipDrop: 'İniş işareti halkanın içinde yeşile dönünce bırak', tipBack: 'En üst rüzgâra çık, sonra postanenin üstünden alçal',
    tipCompass: 'Pusula hedefini gösterir. Oku ona uyan yüksekliği seç', tipBest: 'Parlayan katman şu an en iyi rüzgâr',
    tipVent: 'Yavaşça alçalmak için bırak. Hızlı inmek için havayı boşalt', tipThermal: 'Parıldayan tarlalar sıcak hava yükseltir: bedava kalkış!',
    tipGeese: 'Kazlar! Yükseklikleri altimetrede görünür. Geçmeleri için yüksel ya da alçal', tipCap: 'Sepetin artık iki paket alıyor',
    tipStorm: 'Fırtına bulutları kendi rüzgârlarıyla sürüklenir. Üstlerinden ya da altlarından geç', tipVeer: 'Bugün rüzgârlar yavaşça dönüyor. Oklara dikkat',
    tipExpress: 'Mektuplar acele: saat bitmeden teslim et', tipPeaks: 'Dağlar alçak rüzgârları keser. Üstlerinden aş',
    tipIsles: 'Adalar arası! Denize düşen paket kaybolur', tipShift: 'Rüzgâr her yarım dakikada döner. Dönmeden önce zil çalar',
    tipBusy: 'Aynı anda üç paket. Bir tur planla!',
    bump: 'Tos!', zapped: 'Çat!', honk: 'Vak!', miss: 'Iska!', splash: 'Şap!', bullseye: 'Tam isabet!', late: 'Geç kaldı!', thermal: 'Sıcak hava!',
    shiftSoon: 'Rüzgâr dönmek üzere!', shifted: 'Yeni rüzgârlar!', geeseIn: 'Kazlar geliyor!', stormIn: 'Fırtınalar geliyor!', winds: 'Rüzgârlar dönüyor!',
    upBurner: 'Sıcak Brülör', upBurnerD: 'Daha hızlı yüksel', upChute: 'Geniş Paraşüt', upChuteD: 'Daha büyük iniş halkaları',
    upBook: 'Pul Defteri', upBookD: 'Her paket için +1 pul', timeUp: 'Gün batımı', extra: '+{s}sn',
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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a new Sunset Rounds best, the last route cleared

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
  vent: ['sawtooth', 400, 200, 0.3, 0.03], pickup: ['triangle', 880, 1320, 0.15, 0.08], drop: ['sine', 700, 300, 0.25, 0.08], deliver: ['triangle', 880, 1320, 0.35, 0.12],
  bull: ['sine', 1320, 1980, 0.3, 0.1], miss: ['triangle', 500, 200, 0.4, 0.08], goose: ['sawtooth', 420, 380, 0.25, 0.05], zap: ['sawtooth', 900, 80, 0.4, 0.07],
  bump: ['sine', 220, 120, 0.25, 0.12], land: ['square', 160, 110, 0.1, 0.05], thermal: ['sine', 300, 600, 0.6, 0.05], tick: ['square', 1800, 1800, 0.03, 0.04],
  gust: ['sine', 500, 900, 0.3, 0.04], fail: ['triangle', 392, 196, 0.8, 0.1], done: ['triangle', 523, 1046, 0.7, 0.12], star: ['sine', 1320, 1980, 0.25, 0.1],
  unlock: ['triangle', 660, 1320, 0.4, 0.1], coin: ['square', 1320, 1980, 0.12, 0.07], click: ['square', 900, 900, 0.03, 0.07], blocked: ['square', 140, 110, 0.08, 0.07],
};
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
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 12 || SIMMING) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime;
  vol *= VOL[key] ?? 1; g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.95 + Math.random() * 0.1); g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function setLoop(key, vol, rate = 1) { // looping sound (burner, wind, birds); missing files simply stay silent
  if (!audio.ctx) return;
  let L = audio.loops[key];
  if (!L) {
    if (vol <= 0.001 || !audio.buffers[key]) return;
    const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain(); s.buffer = audio.buffers[key]; s.loop = true; g.gain.value = 0;
    s.connect(g); g.connect(audio.master); s.start(); L = audio.loops[key] = { s, g, v: 0, r: 1 };
  }
  if (Math.abs(L.v - vol) > 0.01) { L.v = vol; L.g.gain.setTargetAtTime(vol, audio.ctx.currentTime, key === 'burner' ? 0.06 : 0.3); }
  if (Math.abs(L.r - rate) > 0.02) { L.r = rate; L.s.playbackRate.setTargetAtTime(rate, audio.ctx.currentTime, 0.2); }
}
function playMusic(url) {
  audio.wantMusic = true;
  if (audio.music && audio.musicUrl !== url) { audio.music.pause(); audio.music = null; }
  if (!audio.music && url) {
    audio.musicUrl = url; const m = new Audio(url); m.loop = true; m.volume = 0.26; m.onerror = () => { if (audio.music === m) audio.music = null; }; audio.music = m;
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

// ================================================================ SCENE (sky, lights; the valley is rebuilt per route)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe3f2'); scene.fog = new THREE.Fog('#bfe3f2', 70, 170);
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.5, 420);
const hemi = new THREE.HemisphereLight('#ffffff', '#8aa070', 1.6);
const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 220 });
scene.add(hemi, sun, sun.target);
const LIGHTS = { // morning, day and dusk over the valley
  morning: { bg: '#cfe6ef', fog: '#e3ecea', sky: '#fff3e6', ground: '#8f9f74', hemi: 1.65, sun: '#ffe9c9', sunI: 2.0, dir: [-0.6, 0.85, 0.45] },
  day: { bg: '#a9daf0', fog: '#cfe9f3', sky: '#ffffff', ground: '#8aa070', hemi: 1.7, sun: '#fff7e8', sunI: 2.25, dir: [-0.35, 1.2, 0.4] },
  dusk: { bg: '#f3c49a', fog: '#f1cfae', sky: '#ffd9bc', ground: '#7a6a5a', hemi: 1.5, sun: '#ffb26a', sunI: 2.4, dir: [-0.95, 0.6, 0.25] },
};
let sunDir = new THREE.Vector3(-0.35, 1.2, 0.4).normalize();
function applyLight(name) {
  const L = LIGHTS[name] || LIGHTS.day;
  scene.background.set(L.bg); scene.fog.color.set(L.fog);
  hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.hemi;
  sun.color.set(L.sun); sun.intensity = L.sunI; sunDir = new THREE.Vector3(...L.dir).normalize();
}
let shakeAmt = 0, clock = 0, SIMMING = false;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => k * k * (3 - 2 * k);
const lerpAngle = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;

// ================================================================ WORLD (one route: static place data + live state)
let W = null, save = null, view = null;
function createWorld(def, mode) {
  const seed = def.seed ?? 1;
  const G = genWorld(def, seed);
  const deck = { x: G.depot.x + 4.6, z: G.depot.z - 2.5 };
  const w = {
    def, mode, G, seed, demo: mode === 'demo', endless: mode === 'endless', R: rng(seed * 7 + 3), t: 0,
    layers: G.layers, b: { x: deck.x, y: G.heightAt(deck.x, deck.z) + 0.25, z: deck.z, vx: 0, vy: 0, vz: 0, landed: true, inv: 0, carry: [], burn: false, vent: false, thermal: false },
    deck, inFlight: [], delivered: 0, target: def.target, cap: def.cap || 1, hearts: CFG.hearts, bumps: 0, misses: 0, earned: 0, result: null, endT: 0,
    pickCd: 0.4, lastDest: -1, nextId: 1, geese: [], gooseT: 8, storms: [], clouds: [], shiftT: def.shift || 0, shiftWarned: false,
    timeLeft: mode === 'endless' ? CFG.endlessTime : 0, hz: { geese: def.geese || 0, storms: def.storms || 0, veer: def.veer || 0 }, events: [],
    bot: { dropT: 0, y: 20 }, stats: { bulls: 0, late: 0 },
  };
  // decorative clouds drift with their layer; storms live in a layer too
  const R = rng(seed + 99);
  for (let k = 0; k < 9; k++) { const L = w.layers[Math.floor(R() * w.layers.length)]; w.clouds.push({ id: k, x: (R() - 0.5) * G.size * 2, z: (R() - 0.5) * G.size * 2, y: Math.min(G.top + 6, L.y1 + 1 + R() * 3), seed: seed + k * 13 }); }
  for (let k = 0; k < w.hz.storms; k++) addStorm(w, R);
  if (def.start === 'loaded') w.b.carry.push(newParcel(w));
  return w;
}
function addStorm(w, R = w.R) {
  const G = w.G;
  for (let k = 0; k < 50; k++) {
    const L = w.layers[1 + Math.floor(R() * (w.layers.length - 1))], x = (R() - 0.5) * G.size * 1.5, z = (R() - 0.5) * G.size * 1.5;
    if (Math.hypot(x - w.b.x, z - w.b.z) < 30 || Math.hypot(x - G.depot.x, z - G.depot.z) < 18) continue;
    w.storms.push({ id: w.nextId++, x, z, y: (L.y0 + L.y1) / 2, flash: 2 + R() * 3, bolt: 0, seed: 500 + w.storms.length * 31 }); return;
  }
}
const ringR = () => CFG.ring * (1 + CFG.ringUp * (save.up.chute | 0));
const climbRate = () => CFG.climb * (1 + CFG.climbUp * (save.up.burner | 0));
const outstanding = (w) => w.delivered + w.b.carry.length + w.inFlight.length;
const canPick = (w) => w.b.carry.length < w.cap && outstanding(w) < w.target;
const pickCeil = (w) => w.G.heightAt(w.G.depot.x, w.G.depot.z) + DEPOT_TOP + CFG.reachY;

// ================================================================ RULES (fixed-step simulation; the view only reads it)
const _w = { x: 0, z: 0 };
function newParcel(w) {
  const busy = new Set(w.b.carry.map((p) => p.dest).concat(w.inFlight.map((p) => p.dest)));
  let opts = w.G.houses.filter((h) => !busy.has(h.i) && h.i !== w.lastDest);
  if (!opts.length) opts = w.G.houses.filter((h) => !busy.has(h.i));
  if (!opts.length) opts = w.G.houses;
  const h = opts[Math.floor(w.R() * opts.length)];
  const letter = !!w.def.express && w.nextId % 2 === 0, d = Math.hypot(h.x - w.G.depot.x, h.z - w.G.depot.z);
  return { id: w.nextId++, dest: h.i, color: h.color, letter, timer: letter ? CFG.letterTime[0] + CFG.letterTime[1] * d : 0, late: false };
}
function emit(type, data = {}) { W.events.push({ type, ...data }); }
function step(dt) {
  const w = W; if (!w) return;
  const playing = state === State.PLAYING || w.demo;
  stepClouds(w, dt);
  if (!playing || w.result) { if (w.result) { w.endT -= dt; stepBalloon(w, dt, { burn: false, vent: false }); if (w.endT <= 0 && !w.demo && state === State.PLAYING) endLevel(); } return; }
  w.t += dt;
  stepWinds(w, dt);
  const ctl = AUTOPLAY || w.demo ? botControl(w, dt) : { burn: input.burn, vent: input.vent };
  stepBalloon(w, dt, ctl);
  if ((AUTOPLAY || w.demo) && ctl.drop) dropParcel(w);
  // pickups at the post office
  const b = w.b; w.pickCd -= dt;
  if (canPick(w) && w.pickCd <= 0 && Math.hypot(b.x - w.G.depot.x, b.z - w.G.depot.z) < CFG.reachXZ + (b.landed ? 2 : 0) && b.y < pickCeil(w)) {
    const p = newParcel(w); b.carry.push(p); w.pickCd = CFG.pickGap; emit('pickup', { p });
  }
  for (const p of b.carry) if (p.letter && !p.late) { p.timer -= dt; if (p.timer <= 0) { p.late = true; emit('late', { p }); } }
  stepParcels(w, dt);
  stepHazards(w, dt);
  if (w.endless) { w.timeLeft -= dt; if (w.timeLeft <= 0) { w.timeLeft = 0; finish(w, 'time'); } }
  if (!w.endless && !w.demo && w.delivered >= w.target) finish(w, 'win');
}
function finish(w, result) { if (w.result) return; w.result = result; w.endT = result === 'win' ? 1.6 : 2.2; emit('finish', { result }); }
function stepWinds(w, dt) {
  const veer = w.hz.veer;
  if (w.def.shift) { // discrete shifts: a bell, then every layer swings round together
    w.shiftT -= dt;
    if (w.shiftT < 3.5 && !w.shiftWarned) { w.shiftWarned = true; emit('shiftSoon'); }
    if (w.shiftT <= 0) { const turn = (w.R() < 0.5 ? -1 : 1) * (90 + w.R() * 60); for (const L of w.layers) L.base = (L.base + turn + 360) % 360; w.shiftT = w.def.shift; w.shiftWarned = false; emit('shifted'); }
  }
  for (const L of w.layers) {
    const want = veer ? L.base + veer * w.t * (L.i % 2 ? 1 : -1) : L.base;
    L.deg = lerpAngle(L.deg, want, veer ? 1 : 1 - Math.exp(-dt * 1.6));
  }
}
function stepBalloon(w, dt, ctl) {
  const b = w.b, G = w.G;
  b.burn = !!ctl.burn && !w.result; b.vent = !!ctl.vent && !b.burn;
  let tvy = b.burn ? climbRate() : b.vent ? -CFG.vent : -CFG.sink;
  if (w.result === 'lose') tvy = -2.2;
  b.thermal = false;
  for (const th of G.thermals) if (Math.hypot(b.x - th.x, b.z - th.z) < th.r && b.y < G.top - 4) { b.thermal = true; tvy = Math.max(tvy + CFG.thermalLift, CFG.thermalLift * 0.6); }
  b.vy += (tvy - b.vy) * (1 - Math.exp(-dt / CFG.vResp));
  windAt(w.layers, b.y, _w);
  const kw = 1 - Math.exp(-dt / CFG.wResp);
  b.vx += (_w.x - b.vx) * kw; b.vz += (_w.z - b.vz) * kw;
  if (b.landed) { const f = Math.exp(-dt * 7); b.vx *= f; b.vz *= f; }
  const ox = b.x, oz = b.z;
  b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
  // valley walls: slide along the mountains at the edge
  const lim = G.size - 5;
  if (Math.abs(b.x) > lim) { b.x = Math.sign(b.x) * lim; b.vx = 0; }
  if (Math.abs(b.z) > lim) { b.z = Math.sign(b.z) * lim; b.vz = 0; }
  // terrain: a steep face ahead stops the balloon (you climb over it); flat ground is a gentle landing
  const gh = groundAt(w, b.x, b.z);
  if (gh > b.y + 0.9 && !b.landed) {
    b.x = ox; b.z = oz; const sp = Math.hypot(b.vx, b.vz);
    if (sp > 1.2 && w.t - (b.bumpT || -9) > 1) { b.bumpT = w.t; emit('bump', { soft: true }); }
    b.vx *= -0.3; b.vz *= -0.3;
  }
  const g2 = groundAt(w, b.x, b.z);
  if (b.y <= g2) { if (!b.landed && b.vy < -2.5) emit('land'); b.y = g2; b.vy = Math.max(0, b.vy); b.landed = true; }
  else b.landed = b.y < g2 + 0.05;
  if (b.y > G.top + 2) { b.y = G.top + 2; b.vy = Math.min(b.vy, 0); }
  b.inv = Math.max(0, b.inv - dt);
}
function groundAt(w, x, z) { // terrain plus the post office deck and roofs (the basket sits on them)
  const G = w.G; let h = G.heightAt(x, z);
  if (Math.hypot(x - w.deck.x, z - w.deck.z) < 3.3) h = Math.max(h, G.heightAt(w.deck.x, w.deck.z) + 0.25);
  return Math.max(h, G.land === 'isles' ? 0.1 : h);
}
function parcelStep(w, p, dt) { // shared by real parcels and the landing preview
  p.age += dt;
  if (p.age < CFG.chuteAfter) p.vy -= 14 * dt; else p.vy += (-CFG.chuteFall - p.vy) * (1 - Math.exp(-dt / 0.35));
  windAt(w.layers, p.y, _w); const k = 1 - Math.exp(-dt / 0.8);
  p.vx += (_w.x * CFG.chuteWind - p.vx) * k; p.vz += (_w.z * CFG.chuteWind - p.vz) * k;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
}
const _pred = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, path: [] };
function predictLanding(w) {
  const b = w.b, p = _pred; Object.assign(p, { x: b.x, y: b.y - 0.9, z: b.z, vx: b.vx, vy: Math.min(b.vy, 0) * 0.5 - 1, vz: b.vz, age: 0 }); p.path.length = 0;
  p.T = 0;
  for (let i = 0; i < 400; i++) {
    parcelStep(w, p, 1 / 20); p.T += 1 / 20;
    if (i % 3 === 0) p.path.push(p.x, p.y, p.z);
    if (p.y <= Math.max(w.G.heightAt(p.x, p.z), w.G.land === 'isles' ? 0 : -99)) break;
  }
  return p;
}
function dropParcel(w) {
  const b = w.b; if (!b.carry.length || w.result) return false;
  const p = predictLanding(w); let best = 0, bd = 1e9;
  b.carry.forEach((q, k) => { const h = w.G.houses[q.dest], d = Math.hypot(h.x - p.x, h.z - p.z) - (q.letter && !q.late ? 2 : 0); if (d < bd) { bd = d; best = k; } });
  const q = b.carry.splice(best, 1)[0], h = w.G.houses[q.dest], d0 = Math.hypot(h.x - p.x, h.z - p.z);
  // inside the ring the chute steers itself into the garden; how close the marker was decides a bullseye
  const aim = d0 <= ringR() ? { x: (h.x - p.x) * 0.92, z: (h.z - p.z) * 0.92, T: Math.max(0.3, p.T) } : null;
  w.inFlight.push({ ...q, x: b.x, y: b.y - 0.9, z: b.z, vx: b.vx, vy: Math.min(b.vy, 0) * 0.5 - 1, vz: b.vz, age: 0, aim, d0, f: 0 });
  w.pickCd = Math.max(w.pickCd, 1.2); emit('drop', { p: q });
  return true;
}
function stepParcels(w, dt) {
  const G = w.G;
  for (let i = w.inFlight.length - 1; i >= 0; i--) {
    const p = w.inFlight[i]; parcelStep(w, p, dt);
    if (p.aim) { const f = Math.min(1, p.age / p.aim.T), df = f - p.f; p.f = f; p.x += p.aim.x * df; p.z += p.aim.z * df; }
    if (p.letter && !p.late) { p.timer -= dt; if (p.timer <= 0) { p.late = true; emit('late', { p }); } }
    const gh = G.heightAt(p.x, p.z);
    if (p.y > Math.max(gh, G.land === 'isles' ? 0 : -99)) continue;
    w.inFlight.splice(i, 1);
    if (gh < 0.05 && G.land === 'isles' && !p.aim) { w.misses++; emit('miss', { p, water: true }); continue; }
    if (p.aim) {
      const bull = p.d0 <= ringR() * CFG.bull; w.delivered++; w.lastDest = p.dest; if (bull) w.stats.bulls++;
      if (p.late) { w.stats.late++; }
      let gain = CFG.fare + CFG.fareUp * (save.up.book | 0) + (bull ? CFG.bullBonus : 0); if (p.late) gain = Math.ceil(gain / 2);
      if (!w.demo) w.earned += gain;
      if (w.endless) { const s = CFG.endlessFare + (bull ? CFG.endlessBull : 0); w.timeLeft += s; emit('extra', { s }); }
      emit('deliver', { p, bull, gain, x: p.x, z: p.z });
    } else { w.misses++; emit('miss', { p, water: false }); }
  }
}

// ================================================================ HAZARDS (geese flocks, storm clouds, the Sunset Rounds schedule)
function stepClouds(w, dt) {
  for (const c of w.clouds) {
    windAt(w.layers, c.y, _w); c.x += _w.x * 0.6 * dt; c.z += _w.z * 0.6 * dt;
    const L = w.G.size + 30; if (c.x > L) c.x -= 2 * L; if (c.x < -L) c.x += 2 * L; if (c.z > L) c.z -= 2 * L; if (c.z < -L) c.z += 2 * L;
  }
}
function stepHazards(w, dt) {
  const b = w.b, G = w.G;
  if (w.endless) { // the sun goes down: geese, storms and turning winds join one by one
    const tt = w.t;
    const want = { geese: tt > 35 ? (tt > 160 ? 2 : 1) : 0, storms: tt > 75 ? (tt > 200 ? 2 : 1) : 0, veer: tt > 120 ? 1.5 : 0 };
    if (want.geese > w.hz.geese) { w.hz.geese = want.geese; emit('announce', { k: 'geeseIn' }); }
    if (want.storms > w.hz.storms) { w.hz.storms = want.storms; addStorm(w); emit('announce', { k: 'stormIn' }); }
    if (want.veer > w.hz.veer) { w.hz.veer = want.veer; for (const L of w.layers) L.base = L.deg - want.veer * w.t * (L.i % 2 ? 1 : -1); emit('announce', { k: 'winds' }); }
  }
  // geese: a V of five crossing the valley at about your height
  if (w.hz.geese) {
    w.gooseT -= dt;
    if (w.geese.length < w.hz.geese && w.gooseT <= 0) {
      const a = w.R() * 6.283, dir = { x: Math.cos(a), z: Math.sin(a) }, aimX = b.x + b.vx * 4 + (w.R() - 0.5) * 16, aimZ = b.z + b.vz * 4 + (w.R() - 0.5) * 16;
      const back = G.size * 1.15, y = clamp(b.y + 3 + (w.R() - 0.5) * 8, FLOOR + 3, G.top - 1);
      w.geese.push({ id: w.nextId++, x: aimX - dir.x * back, z: aimZ - dir.z * back, y, dx: dir.x, dz: dir.z, life: (back * 2) / CFG.gooseSpeed, honked: false, scatter: 0 });
      w.gooseT = CFG.gooseGap[0] + w.R() * (CFG.gooseGap[1] - CFG.gooseGap[0]);
    }
  }
  for (let i = w.geese.length - 1; i >= 0; i--) {
    const f = w.geese[i]; f.x += f.dx * CFG.gooseSpeed * dt; f.z += f.dz * CFG.gooseSpeed * dt; f.life -= dt; f.scatter = Math.max(0, f.scatter - dt);
    if (f.life <= 0) { w.geese.splice(i, 1); continue; }
    const d = Math.hypot(f.x - b.x, f.z - b.z);
    if (!f.honked && d < 34) { f.honked = true; emit('honk', { f }); }
    if (f.scatter > 0 || b.inv > 0) continue;
    for (const g of gooseSlots(f)) {
      if (Math.hypot(g.x - b.x, g.z - b.z) < 2.6 && g.y > b.y + 1.2 && g.y < b.y + 8.8) { f.scatter = 3; hit(w, 'goose', g); break; }
    }
  }
  // storms drift with their wind and wrap around the valley; their lightning hurts inside the cloud
  for (const s of w.storms) {
    windAt(w.layers, s.y, _w); s.x += _w.x * 0.55 * dt; s.z += _w.z * 0.55 * dt;
    const L = G.size - 6; if (s.x > L) s.x -= 2 * L; if (s.x < -L) s.x += 2 * L; if (s.z > L) s.z -= 2 * L; if (s.z < -L) s.z += 2 * L;
    s.flash -= dt; s.bolt = Math.max(0, s.bolt - dt);
    if (s.flash <= 0) { s.flash = 2.2 + w.R() * 3; s.bolt = 0.25; emit('bolt', { s }); }
    if (b.inv <= 0 && Math.hypot(s.x - b.x, s.z - b.z) < CFG.stormR && Math.abs(s.y - (b.y + 4.8)) < CFG.stormH) { s.bolt = 0.35; hit(w, 'storm', s); }
  }
}
function gooseSlots(f) { // V formation: leader in front, two wings behind
  const px = -f.dz, pz = f.dx, out = [];
  for (let k = 0; k < 5; k++) { const row = Math.ceil(k / 2), side = k === 0 ? 0 : k % 2 ? 1 : -1; out.push({ x: f.x - f.dx * row * 1.9 + px * side * row * 1.7, z: f.z - f.dz * row * 1.9 + pz * side * row * 1.7, y: f.y + row * 0.25, k }); }
  return out;
}
function hit(w, kind, src) {
  const b = w.b; if (b.inv > 0 || w.result || w.demo) { if (w.demo) b.inv = 1; return; }
  w.hearts--; w.bumps++; b.inv = CFG.invuln;
  if (kind === 'storm') b.vy = -5; else { b.vx += (b.x - src.x) * 0.8; b.vz += (b.z - src.z) * 0.8; b.vy -= 1.5; }
  emit('hit', { kind });
  if (w.hearts <= 0) finish(w, 'lose');
}

// ================================================================ BOT (menu demo, trailer, balance runs)
function botTarget(w) {
  const b = w.b, G = w.G;
  const dests = b.carry.map((p) => G.houses[p.dest]);
  const nearestDest = dests.reduce((a, h) => { const d = Math.hypot(h.x - b.x, h.z - b.z); return !a || d < a.d ? { h, d } : a; }, null);
  const dd = Math.hypot(G.depot.x - b.x, G.depot.z - b.z);
  if (canPick(w) && (!nearestDest || dd < nearestDest.d * 0.5 || (b.carry.length < w.cap && dd < 14))) return { x: G.depot.x, z: G.depot.z, kind: 'depot', d: dd };
  if (nearestDest) return { x: nearestDest.h.x, z: nearestDest.h.z, kind: 'house', d: nearestDest.d };
  return null;
}
function hazardPenalty(w, y) {
  const b = w.b; let pen = 0;
  for (const f of w.geese) { const d = Math.hypot(f.x - b.x, f.z - b.z), coming = (b.x - f.x) * f.dx + (b.z - f.z) * f.dz > -6; if (coming && d < 44 && f.y > y - 0.5 && f.y < y + 10.5) pen += 1.5 * (1 - d / 50); }
  for (const s of w.storms) { const d = Math.hypot(s.x - b.x, s.z - b.z); if (d < 24 && Math.abs(s.y - (y + 4.8)) < CFG.stormH + 2.5) pen += 1.8 * (1 - d / 30); }
  return pen;
}
const layerMid = (L) => Math.max((L.y0 + L.y1) / 2, FLOOR + 1.5);
// Two-leg route: ride layer A for t1 seconds, then layer B for t2, solving A*t1 + B*t2 = offset to the target.
// Cost = flight time + climbing time + hazards in the first leg; B must sit below maxB (the post office's reach).
// Forward-simulated plans: ride height A for t1 seconds, then height B, with the real balloon physics.
// The best plan passes closest to the target soonest (below maxY for a post office pickup), away from hazards.
function simPlan(w, yA, t1, yB, gx, gz, maxY, T) {
  const b = w.b, dt = 0.2, kv = 1 - Math.exp(-dt / CFG.vResp), kw = 1 - Math.exp(-dt / CFG.wResp), top = w.G.top + 2, climb = climbRate(), lim = w.G.size - 5;
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, best = 1e9, bt = 0;
  for (let t = 0; t < T; t += dt) {
    const err = (t < t1 ? yA : yB) - (y + vy * 0.9), tvy = err > 0.25 ? climb : err < -3.5 ? -CFG.vent : -CFG.sink;
    vy += (tvy - vy) * kv; windAt(w.layers, y, _w); vx += (_w.x - vx) * kw; vz += (_w.z - vz) * kw;
    x += vx * dt; z += vz * dt; y = clamp(y + vy * dt, 1, top);
    if (Math.abs(x) > lim) { x = Math.sign(x) * lim; vx = 0; } if (Math.abs(z) > lim) { z = Math.sign(z) * lim; vz = 0; }
    const d = Math.hypot(gx - x, gz - z) + (y > maxY ? (y - maxY) * 2 : 0);
    if (d < best) { best = d; bt = t; }
  }
  return best * 2.5 + bt;
}
function planRoute(w, gx, gz, maxY) {
  const ys = w.layers.map(layerMid), horizon = clamp(Math.hypot(gx - w.b.x, gz - w.b.z) / 3.5, 30, 60); let best = null;
  const consider = (yA, t1, yB) => {
    const first = t1 > 0 ? yA : yB, c = simPlan(w, yA, t1, yB, gx, gz, maxY, horizon) + hazardPenalty(w, first) * 15 + (t1 > 0 ? 0.5 : 0) - (Math.abs(first - w.bot.y) < 1 ? 2 : 0);
    if (!best || c < best.c) best = { c, y: first };
  };
  for (const yB of ys) consider(yB, 0, yB);
  for (const yA of ys) for (const yB of ys) if (yA !== yB) for (let t1 = 1.5; t1 <= 15; t1 += 1.5) consider(yA, t1, yB);
  return best;
}
function botControl(w, dt) {
  const b = w.b, bt = w.bot, tg = botTarget(w), out = { burn: false, vent: false, drop: false };
  bt.retarget = (bt.retarget || 0) - dt;
  if (bt.retarget <= 0) {
    bt.retarget = 0.5;
    // aim where the parcel will land, not where the balloon is: shift the target by the current drop offset
    let gx = tg?.x ?? b.x, gz = tg?.z ?? b.z;
    if (tg && tg.kind === 'house') { const p = predictLanding(w); gx -= p.x - b.x; gz -= p.z - b.z; }
    const pl = tg && planRoute(w, gx, gz, tg.kind === 'depot' ? pickCeil(w) - 1 : 99);
    let bestY = pl ? pl.y : bt.y;
    if (!tg) bestY = 24 + Math.sin(w.t * 0.1) * 8;
    // climb over terrain ahead
    let ahead = 0; for (let k = 1; k <= 4; k++) ahead = Math.max(ahead, w.G.heightAt(b.x + b.vx * k, b.z + b.vz * k));
    bt.y = Math.max(bestY, ahead + 3);
    if (tg && tg.kind === 'depot' && tg.d < 8) bt.y = Math.min(bt.y, pickCeil(w) - 3);
  }
  const err = bt.y - (b.y + b.vy * 0.9);
  out.burn = err > 0.25; out.vent = err < -3.5;
  bt.dropT -= dt;
  if (b.carry.length && bt.dropT <= 0) {
    bt.dropT = 0.1;
    const p = predictLanding(w); let dmin = 1e9;
    for (const q of b.carry) { const h = w.G.houses[q.dest]; dmin = Math.min(dmin, Math.hypot(h.x - p.x, h.z - p.z)); }
    // drop when the marker is near the centre, or at the closest pass when it is still inside the ring
    if (dmin < ringR() * 0.25 || (dmin < ringR() * 0.9 && dmin > (bt.prevD ?? 1e9) + 0.01)) { out.drop = true; bt.dropT = 0.8; bt.prevD = 1e9; }
    else bt.prevD = dmin;
  }
  return out;
}

// ================================================================ VIEW (meshes for the current route; the rules never touch them)
const SOFT = softTex();
function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
    const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
    for (const m of ms) if (!m.userData?.shared) { if (m.map && m.userData.ownMap) m.map.dispose(); m.dispose(); }
  });
}
const RIBBONS = 84;
function buildView(w) {
  if (view) { scene.remove(view.root); disposeTree(view.root); }
  const G = w.G, root = new THREE.Group(); scene.add(root);
  root.add(buildTerrain(G), buildScenery(G, w.seed));
  if (G.land === 'isles' || G.river) root.add(buildWater(G));
  const depot = buildDepot(); depot.position.set(G.depot.x, G.heightAt(G.depot.x, G.depot.z), G.depot.z); root.add(depot);
  const houses = G.houses.map((h) => {
    const g = buildHouse(h.color, w.seed + h.i); g.position.set(h.x, G.heightAt(h.x, h.z), h.z); root.add(g);
    const ring = buildRing(h.color); ring.position.set(h.x, G.heightAt(h.x, h.z) + 0.12, h.z); ring.scale.setScalar(ringR()); root.add(ring);
    const pin = buildPin(h.color, 'parcel'); root.add(pin);
    return { g, ring, pin, y: G.heightAt(h.x, h.z) };
  });
  const depotPin = buildPin('#ffc93c', 'post'); root.add(depotPin);
  // windmills on a few hilltops
  const mills = [], R = rng(w.seed + 77);
  for (let k = 0; k < 60 && mills.length < 3; k++) {
    const x = (R() - 0.5) * G.size * 1.6, z = (R() - 0.5) * G.size * 1.6, h = G.heightAt(x, z);
    if (h < 0.6 || h > 4 || G.riverDist(x, z) < 8 || [G.depot, ...G.houses].some((s) => Math.hypot(s.x - x, s.z - z) < 12) || G.thermals.some((t) => Math.hypot(t.x - x, t.z - z) < 9)) continue;
    const m = buildWindmill(); m.position.set(x, h - 0.1, z); m.rotation.y = R() * 6; root.add(m); mills.push(m);
  }
  // thermals: shimmering rings rising over a sunny field
  const thermals = G.thermals.map((th) => {
    const g = new THREE.Group(), gy = G.heightAt(th.x, th.z); g.position.set(th.x, gy, th.z); root.add(g);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(th.r, 30), new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.32, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.25; g.add(disc);
    const rings = [];
    for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(th.r * 0.8, 0.09, 4, 30), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.5, depthWrite: false })); r.rotation.x = Math.PI / 2; g.add(r); rings.push(r); }
    return { g, rings };
  });
  const balloon = buildBalloon(save.paint | 0); root.add(balloon);
  const ribbonMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.26).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), RIBBONS);
  ribbonMesh.frustumCulled = false; ribbonMesh.renderOrder = 3; root.add(ribbonMesh);
  const ribbons = Array.from({ length: RIBBONS }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, L: 0 }));
  const predRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }));
  predRing.rotation.x = -Math.PI / 2; predRing.renderOrder = 4; root.add(predRing);
  const predDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), 40);
  predDots.frustumCulled = false; root.add(predDots);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false, map: SOFT }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1; root.add(shadow);
  view = { root, depot, depotPin, houses, mills, thermals, balloon, ribbonMesh, ribbons, predRing, predDots, shadow, cargo: new Map(), flying: new Map(), geese: new Map(), storms: new Map(), clouds: new Map(), carryKey: '' };
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _col = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
function syncView(dt) {
  if (!W || !view) return;
  const w = W, b = w.b, G = w.G, V = view, time = clock;
  // balloon: gentle sway, burner flame, pilot waves after a delivery, blink while invulnerable
  const B = V.balloon, U = B.userData;
  B.position.set(b.x, b.y, b.z);
  B.rotation.z = Math.sin(time * 0.9) * 0.025 + clamp(-b.vx * 0.012, -0.08, 0.08); B.rotation.x = Math.sin(time * 0.7 + 1) * 0.02 + clamp(b.vz * 0.012, -0.08, 0.08);
  U.envelope.rotation.y += dt * 0.08;
  U.flame.visible = b.burn || (time * 7) % 1 < 0.04; U.flame.scale.set(1, b.burn ? 1 + Math.sin(time * 40) * 0.15 : 0.4, 1);
  B.visible = !(b.inv > 0 && Math.floor(time * 12) % 2 === 0) || w.result;
  U.wave = Math.max(0, (U.wave || 0) - dt);
  U.arm.rotation.z = U.wave > 0 ? -2.4 + Math.sin(time * 14) * 0.5 : -0.4 + Math.sin(time * 1.3) * 0.06;
  U.head.rotation.y = Math.sin(time * 0.5) * 0.6; U.pilot.position.y = Math.sin(time * 2) * 0.02;
  // parcels hanging under the basket
  const key = b.carry.map((p) => `${p.id}${p.late ? 'l' : ''}`).join(',');
  if (key !== V.carryKey) {
    V.carryKey = key; for (const m of V.cargo.values()) { U.cargo.remove(m); disposeTree(m); } V.cargo.clear();
    b.carry.forEach((p, k) => { const m = buildParcel(p.color, p.letter); m.userData.string.scale.y = 0.9; m.position.set((k - (b.carry.length - 1) / 2) * 0.75, -1.0, 0); U.cargo.add(m); V.cargo.set(p.id, m); });
  }
  for (const m of V.cargo.values()) m.rotation.y = Math.sin(time * 2 + m.position.x) * 0.3;
  // falling parcels with their chutes
  const seen = new Set();
  for (const p of w.inFlight) {
    let m = V.flying.get(p.id); if (!m) { m = buildParcel(p.color, p.letter); m.userData.string.visible = false; V.root.add(m); V.flying.set(p.id, m); }
    seen.add(p.id); m.position.set(p.x, p.y, p.z); m.userData.chute.visible = p.age > CFG.chuteAfter; m.rotation.y = p.age * 1.5; m.rotation.z = Math.sin(p.age * 3) * 0.1;
  }
  for (const [id, m] of V.flying) if (!seen.has(id)) { V.root.remove(m); disposeTree(m); V.flying.delete(id); }
  // blob shadow under the basket (the real shadow falls away from the sun)
  const gh = G.heightAt(b.x, b.z), alt = b.y - gh;
  V.shadow.position.set(b.x, Math.max(gh, G.land === 'isles' ? 0 : gh) + 0.12, b.z); V.shadow.scale.setScalar(1.6 + alt * 0.05); V.shadow.material.opacity = clamp(0.32 - alt * 0.005, 0.1, 0.32);
  // landing preview: dots along the fall and a marker on the ground
  const showPred = b.carry.length > 0 && !w.result && !b.landed && (state === State.PLAYING || CAPTURE) && !w.demo;
  V.predRing.visible = showPred; V.predDots.visible = showPred;
  if (showPred) {
    const p = predictLanding(w), gy = Math.max(G.heightAt(p.x, p.z), G.land === 'isles' ? 0 : -99);
    const inRing = b.carry.some((q) => { const h = G.houses[q.dest]; return Math.hypot(h.x - p.x, h.z - p.z) <= ringR(); });
    V.predRing.position.set(p.x, gy + 0.15, p.z); V.predRing.material.color.set(inRing ? '#7dff9a' : '#ffffff'); V.predRing.scale.setScalar(inRing ? 1.25 + Math.sin(time * 10) * 0.1 : 1);
    const n = Math.min(40, p.path.length / 3); V.predDots.count = n;
    for (let i = 0; i < n; i++) { _p.set(p.path[i * 3], p.path[i * 3 + 1], p.path[i * 3 + 2]); _m4.makeTranslation(_p.x, _p.y, _p.z); V.predDots.setMatrixAt(i, _m4); }
    V.predDots.instanceMatrix.needsUpdate = true; V.predDots.material.color.set(inRing ? '#7dff9a' : '#ffffff');
  }
  // destinations: rings and pins on houses that are waiting for a carried or falling parcel
  const want = new Set(b.carry.map((p) => p.dest).concat(w.inFlight.map((p) => p.dest)));
  V.houses.forEach((hv, k) => {
    const on = want.has(k) && !w.demo; hv.ring.visible = on || (w.demo && k === 0 && false); hv.pin.visible = on;
    if (on) { hv.pin.position.set(G.houses[k].x, hv.y + 8.5 + Math.sin(time * 3 + k) * 0.4, G.houses[k].z); hv.ring.userData.fill.material.opacity = 0.16 + 0.1 * Math.sin(time * 4); hv.ring.scale.setScalar(ringR()); }
    hv.g.userData.flag.rotation.z = on ? Math.sin(time * 6) * 0.5 : 0;
  });
  const dp = canPick(w) && !w.demo && !w.result; V.depotPin.visible = dp;
  if (dp) V.depotPin.position.set(G.depot.x, G.heightAt(G.depot.x, G.depot.z) + 15 + Math.sin(time * 3) * 0.4, G.depot.z);
  const fl = V.depot.userData.flag, fp = fl.geometry.attributes.position;
  windAt(w.layers, 12, _w); fl.rotation.y = Math.atan2(-_w.z, _w.x) * 0 + Math.atan2(_w.z, -_w.x) + Math.PI;
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i); fp.setZ(i, Math.sin(time * 6 + x * 3) * 0.15 * (x + 0.75)); } fp.needsUpdate = true;
  for (const m of V.mills) m.userData.blades.rotation.z += dt * 1.2;
  for (const th of V.thermals) th.rings.forEach((r, k) => { const u = ((time * 0.22 + k / th.rings.length) % 1); r.position.y = 1 + u * 26; r.material.opacity = 0.5 * Math.sin(u * Math.PI); r.scale.setScalar(0.7 + u * 0.5); });
  // geese
  syncSet(V.geese, w.geese.flatMap((f) => gooseSlots(f).map((g) => ({ id: f.id * 10 + g.k, f, g }))), () => buildGoose(), (m, o) => {
    const sc = o.f.scatter > 0 ? (3 - o.f.scatter) : 0;
    m.position.set(o.g.x + Math.sin(o.g.k * 2.1) * sc * 2, o.g.y + sc * (o.g.k % 2 ? 1.5 : -0.8), o.g.z + Math.cos(o.g.k * 1.7) * sc * 2);
    m.rotation.y = Math.atan2(o.f.dx, o.f.dz); const fl2 = Math.sin(time * 9 + o.g.k) * 0.6; m.userData.wl.rotation.z = fl2; m.userData.wr.rotation.z = -fl2;
  });
  syncSet(V.storms, w.storms, (s) => buildStorm(s.seed), (m, s) => {
    m.position.set(s.x, s.y, s.z); m.userData.bolt.visible = s.bolt > 0; m.userData.cloud.rotation.y = time * 0.05;
    m.userData.cloud.material.emissive?.set(s.bolt > 0 ? '#555522' : '#000000');
  });
  // decorative clouds fade out when they sit between the camera and the balloon
  syncSet(V.clouds, w.clouds, (c) => buildCloud(c.seed), (m, c) => {
    m.position.set(c.x, c.y, c.z); const d = distToSegment(c, camera.position, b), near = camera.position.distanceTo(m.position), fade = Math.min(clamp((d - 4) / 8, 0.18, 1), clamp((near - 22) / 30, 0, 1));
    m.material.opacity = 0.9 * fade; m.visible = fade > 0.02; m.scale.setScalar(1.3);
  });
  syncRibbons(dt);
  // sound beds
  if (!SIMMING) {
    setLoop('burner', b.burn && state !== State.MENU ? 0.42 : b.burn ? 0.12 : 0);
    setLoop('wind', state === State.MENU ? 0.1 : clamp(0.08 + (b.y / W.G.top) * 0.3, 0.08, 0.38));
    setLoop('birds', w.def.light === 'dusk' ? 0.12 : 0.3);
  }
}
function distToSegment(c, a, b) {
  const abx = b.x - a.x, aby = b.y + 4 - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz;
  const k = clamp(((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / (l2 || 1), 0, 1);
  return Math.hypot(a.x + abx * k - c.x, a.y + aby * k - c.y, a.z + abz * k - c.z);
}
function syncSet(map, list, make, pose) { // keep one mesh per live object
  const seen = new Set();
  for (const o of list) {
    let m = map.get(o.id); if (!m) { m = make(o); view.root.add(m); map.set(o.id, m); }
    seen.add(o.id); pose(m, o);
  }
  for (const [id, m] of map) if (!seen.has(id)) { view.root.remove(m); disposeTree(m); map.delete(id); }
}
function syncRibbons(dt) { // wind streamers in every layer around the balloon, coloured like the altimeter
  const V = view, w = W, b = w.b, mesh = V.ribbonMesh;
  for (let i = 0; i < RIBBONS; i++) {
    const r = V.ribbons[i]; r.life += dt;
    if (r.life >= r.max) {
      const L = w.layers[i % w.layers.length], a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 34;
      r.x = b.x + Math.cos(a) * d; r.z = b.z + Math.sin(a) * d - 6; r.y = L.y0 + 0.8 + Math.random() * (L.y1 - L.y0 - 1.6); r.L = L.i;
      r.life = 0; r.max = 1.6 + Math.random() * 1.6;
      mesh.setColorAt(i, _col.set(L.color));
    }
    windAt(w.layers, r.y, _w); r.x += _w.x * dt; r.z += _w.z * dt;
    const sp = Math.hypot(_w.x, _w.z), len = (1.2 + sp * 0.45) * Math.sin((r.life / r.max) * Math.PI);
    _q.setFromAxisAngle(_up, Math.atan2(-_w.z, _w.x)); _s.set(Math.max(0.01, len), 1, 1); _p.set(r.x, r.y, r.z);
    _m4.compose(_p, _q, _s); mesh.setMatrixAt(i, _m4);
  }
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.visible = !(w.demo && state !== State.MENU && !CAPTURE) || true;
}

// ================================================================ FX (events -> sound, particles, pops)
const parts = [];
function particle(x, y, z, color, vx, vy, vz, life, size, grav = 0, grow = 0) {
  let p = parts.find((q) => !q.visible);
  if (!p) { if (parts.length > 160) return; p = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, transparent: true, depthWrite: false })); p.userData.v = new THREE.Vector3(); parts.push(p); scene.add(p); }
  p.material.color.set(color); p.visible = true; p.position.set(x, y, z); p.userData.v.set(vx, vy, vz);
  Object.assign(p.userData, { life, max: life, size, grav, grow }); p.scale.setScalar(size);
}
function updateParticles(dt) {
  for (const p of parts) {
    if (!p.visible) continue; const u = p.userData; u.life -= dt; if (u.life <= 0) { p.visible = false; continue; }
    u.v.y -= u.grav * dt; p.position.addScaledVector(u.v, dt); const k = u.life / u.max;
    p.scale.setScalar(u.size * (1 + (1 - k) * u.grow)); p.material.opacity = Math.min(1, k * 2);
  }
}
function burst(x, y, z, colors, n = 18, sp = 5, grav = 9, size = 0.35) {
  if (SIMMING) return;
  for (let i = 0; i < n; i++) particle(x, y, z, colors[i % colors.length], (Math.random() - 0.5) * sp, Math.random() * sp * 0.9 + 1, (Math.random() - 0.5) * sp, 0.7 + Math.random() * 0.5, size, grav);
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
const pops = [];
function pop(text, x, y, z, cls = '') {
  if (SIMMING) return;
  const el = document.createElement('div'); el.className = `pop ${cls}`; el.textContent = text; $('pops').appendChild(el);
  pops.push({ el, x, y, z, t: 0 });
}
const _pp = new THREE.Vector3();
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt; if (p.t > 1.3) { p.el.remove(); pops.splice(i, 1); continue; }
    _pp.set(p.x, p.y + p.t * 2.2, p.z).project(camera);
    p.el.style.transform = `translate(${(_pp.x * 0.5 + 0.5) * innerWidth}px, ${(-_pp.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${Math.min(1, p.t * 6)})`;
    p.el.style.opacity = String(Math.min(1, (1.3 - p.t) * 3));
  }
}
function handleEvents() {
  const w = W; if (!w) return;
  const ev = w.events; w.events = [];
  const b = w.b, quiet = w.demo && state === State.MENU;
  for (const e of ev) {
    switch (e.type) {
      case 'pickup': if (!quiet) { playSfx('pickup'); pop('+1', b.x, b.y - 1, b.z); tipEvent('pickup'); } pulse('hudParcelPill'); break;
      case 'drop': if (!quiet) playSfx('drop'); break;
      case 'deliver': {
        const h = w.G.houses[e.p.dest], y = w.G.heightAt(h.x, h.z);
        if (!quiet) {
          playSfx('deliver'); if (e.bull) { playSfx('bull'); pop(t('bullseye'), e.x, y + 2.6, e.z, 'gold'); }
          if (!w.demo) pop(`+${e.gain}`, e.x, y + 1.4, e.z, 'coin');
          burst(e.x, y + 0.6, e.z, [e.p.color, '#ffffff', '#ffc93c'], e.bull ? 30 : 18, 6); view.balloon.userData.wave = 1.6;
          if (e.p.late) pop(t('late'), e.x, y + 3.6, e.z, 'bad');
        }
        tipEvent('deliver'); pulse('hudParcelPill'); break;
      }
      case 'miss': {
        if (quiet) break; const p = e.p, y = e.water ? 0 : w.G.heightAt(w.G.houses[p.dest].x, w.G.houses[p.dest].z);
        playSfx('miss'); pop(t(e.water ? 'splash' : 'miss'), b.x, b.y - 2, b.z, 'bad');
        if (e.water) burst(b.x, 0.2, b.z, ['#ffffff', '#bfe9ff'], 14, 4); void y; break;
      }
      case 'late': if (!quiet) { playSfx('tick'); pop(t('late'), b.x, b.y - 1.5, b.z, 'bad'); } break;
      case 'hit': {
        playSfx(e.kind === 'storm' ? 'zap' : 'goose'); playSfx('bump'); shake(0.8);
        pop(t(e.kind === 'storm' ? 'zapped' : 'bump'), b.x, b.y + 8, b.z, 'bad');
        burst(b.x, b.y + 4, b.z, e.kind === 'storm' ? ['#fff27a', '#ffffff'] : ['#ffffff', '#f2f2ea'], 16, 6, 4, 0.45); pulse('hudHearts'); break;
      }
      case 'bump': if (!quiet) { playSfx('bump', 0.7); pop(t('bump'), b.x, b.y + 8, b.z, 'bad'); shake(0.3); } break;
      case 'land': if (!quiet) playSfx('land'); burst(b.x, b.y + 0.1, b.z, ['#e9e3cf'], 8, 3, 3, 0.5); break;
      case 'honk': if (!quiet) { playSfx('goose', 0.8); const s = gooseSlots(e.f)[0]; pop(t('honk'), s.x, s.y + 1.5, s.z, 'white'); } break;
      case 'bolt': if (!quiet && Math.hypot(e.s.x - b.x, e.s.z - b.z) < 40) playSfx('zap', 0.35); break;
      case 'shiftSoon': if (!quiet) { playSfx('tick'); banner('', t('shiftSoon')); } break;
      case 'shifted': if (!quiet) { playSfx('gust'); banner('', t('shifted')); } break;
      case 'announce': if (!quiet) { playSfx('gust'); banner(t('endless'), t(e.k)); } break;
      case 'extra': if (!quiet) { pop(t('extra', { s: e.s }), b.x, b.y + 9, b.z, 'white'); pulse('hudTimePill'); } break;
      case 'finish': if (e.result === 'lose') playSfx('bump'); break;
    }
  }
  if (b.thermal && !w.lastThermal && !quiet) { playSfx('thermal'); pop(t('thermal'), b.x, b.y + 9, b.z, 'white'); }
  w.lastThermal = b.thermal;
  if (b.vent && !w.lastVent && !quiet) { playSfx('vent'); tipEvent('vent'); }
  w.lastVent = b.vent;
  if (!SIMMING && b.burn && Math.random() < 0.3) particle(b.x + (Math.random() - 0.5) * 0.3, b.y + 3, b.z, '#ffd27a', 0, 1.5, 0, 0.25, 0.4);
}

// ================================================================ INPUT (hold to burn, vent to sink, drop the parcel)
const keys = new Set(), input = { burn: false, vent: false, burnKey: false, burnPtr: false, burnBtn: false, ventKey: false, ventBtn: false };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const BURN_KEYS = ['Space', 'KeyW', 'ArrowUp', 'KeyZ'], VENT_KEYS = ['KeyS', 'ArrowDown'], DROP_KEYS = ['KeyE', 'KeyF', 'Enter', 'KeyX'];
function syncInput() {
  input.burnKey = BURN_KEYS.some((k) => keys.has(k)); input.ventKey = VENT_KEYS.some((k) => keys.has(k));
  input.burn = input.burnKey || input.burnPtr || input.burnBtn; input.vent = !input.burn && (input.ventKey || input.ventBtn);
  $('btnBurn').classList.toggle('on', input.burn); $('btnVent').classList.toggle('on', input.vent);
}
function doDrop() { if (state === State.PLAYING && W && !W.demo && !AUTOPLAY) { if (dropParcel(W)) tipEvent('drop'); else if (!W.b.carry.length) playSfx('blocked'); } }
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio(); syncInput();
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (state === State.PLAYING && DROP_KEYS.includes(e.code)) doDrop();
  if (state === State.PLAYING && e.code === 'KeyR') restartLevel();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU && !$('menu').hidden) $('btnPlay').click();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.GAMEOVER && !$('results').hidden) (!$('btnNext').hidden ? $('btnNext') : $('btnRetry')).click();
});
addEventListener('keyup', (e) => { keys.delete(e.code); syncInput(); });
addEventListener('blur', () => { keys.clear(); input.burnPtr = input.burnBtn = input.ventBtn = false; syncInput(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio(); if (state !== State.PLAYING) return;
  if (e.button === 2) { doDrop(); return; }
  input.burnPtr = true; syncInput(); canvas.setPointerCapture?.(e.pointerId);
});
for (const evn of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(evn, () => { input.burnPtr = false; syncInput(); });
function holdButton(id, prop) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); input[prop] = true; syncInput(); el.setPointerCapture?.(e.pointerId); });
  for (const evn of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(evn, () => { input[prop] = false; syncInput(); });
}
holdButton('btnBurn', 'burnBtn'); holdButton('btnVent', 'ventBtn');
$('btnDrop').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); doDrop(); });

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> GAMEOVER (results))
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, levelIndex = 0, camWant = 0, camBlend = 0, run = null;
const DEFAULT_SAVE = { v: 1, stars: [], best: [], coins: 0, up: { burner: 0, chute: 0, book: 0 }, paints: [0], paint: 0, tips: {}, tipsOff: false, endlessBest: 0 };
save = structuredClone(DEFAULT_SAVE);

function setState(s, panel = 'menu') {
  state = s;
  for (const id of ['menu', 'routesPanel', 'workshop']) $(id).hidden = !(s === State.MENU && panel === id);
  $('paused').hidden = s !== State.PAUSED; $('results').hidden = s !== State.GAMEOVER;
  const inGame = s === State.PLAYING || s === State.PAUSED;
  $('hud').hidden = !inGame; $('alt').hidden = !inGame; $('controls').hidden = !(s === State.PLAYING);
  hudCache = '';
  if (!inGame) { $('tip').hidden = true; $('arrow').hidden = true; tipState = null; $('ptrs').innerHTML = ''; ptrEls.length = 0; }
  if (s !== State.PLAYING) { input.burnPtr = input.burnBtn = input.ventBtn = false; syncInput(); }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, results
}
function togglePause() {
  if (state === State.PLAYING) setState(State.PAUSED);
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click'); fn(); });
const persist = () => saveData(`${SAVE_KEY}:save`, save);
const starCount = (i) => { const s = save.stars[i] | 0; return (s & 1) + ((s >> 1) & 1) + ((s >> 2) & 1); };
const totalStars = () => LEVELS.reduce((a, _, i) => a + starCount(i), 0);
const unlocked = (i) => i === 0 || (save.stars[i - 1] & 1) > 0;
const endlessUnlocked = () => (save.stars[4] & 1) > 0;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function nextLevelToPlay() { for (let i = 0; i < LEVELS.length; i++) if (!(save.stars[i] & 1)) return i; return LEVELS.length - 1; }

// ================================================================ UI
click('btnPlay', () => startLevel(nextLevelToPlay()));
click('btnRoutes', () => openRoutes());
click('btnWorkshop', () => openWorkshop());
click('btnEndless', () => { if (endlessUnlocked()) startEndless(); else toast(t('endlessLocked')); });
click('btnRoutesBack', () => showMenu());
click('btnWorkshopBack', () => showMenu());
click('btnPause', () => togglePause());
click('btnRestart', () => restartLevel());
click('btnResume', () => togglePause());
click('btnPauseRestart', () => restartLevel());
click('btnPauseRoutes', () => openRoutes());
click('btnQuit', () => showMenu());
click('btnReplay', () => restartLevel()); // replay: no ad (navigation-like, instant)
click('btnResRoutes', () => openRoutes());
click('btnResMenu', () => showMenu());
click('btnNext', () => { // the level end: the right moment for a midgame ad
  const n = levelIndex + 1;
  triggerMidgameAd(() => { if (n < LEVELS.length) startLevel(n); else { openRoutes(); toast(t('allDone')); } });
});
click('btnRetry', () => triggerMidgameAd(() => restartLevel())); // between two runs after a lost route
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.coins += run.gain; run.gain *= 2; $('resCoins').textContent = run.gain; persist(); refreshMenu(); toast(t('doubled')); playSfx('coin'); }, () => {});
});
click('btnSkipTips', () => { save.tipsOff = true; persist(); $('tip').hidden = true; $('arrow').hidden = true; tipState = null; });

function showMenu() {
  if (!W?.demo) startDemo();
  setState(State.MENU, 'menu'); refreshMenu(); camWant = 0;
}
function refreshMenu() {
  const n = nextLevelToPlay();
  $('playRoute').textContent = t('route', { n: n + 1 });
  $('menuStars').textContent = totalStars(); $('menuStarsMax').textContent = LEVELS.length * 3; $('menuCoins').textContent = save.coins;
  $('btnEndless').classList.toggle('locked', !endlessUnlocked());
  $('endlessInfo').textContent = endlessUnlocked() ? (save.endlessBest ? `${t('best')} ${save.endlessBest}` : '') : t('endlessLocked');
}
const LEVEL_ICONS = { geese: 'goose', storm: 'storm', thermal: 'thermal', veer: 'veer', express: 'letter', peaks: 'peak', isles: 'isle', shift: 'veer', cap: 'parcel' };
function openRoutes() {
  if (!W?.demo) startDemo();
  setState(State.MENU, 'routesPanel'); camWant = 0;
  const grid = $('routeGrid'); grid.innerHTML = ''; const cur = nextLevelToPlay();
  LEVELS.forEach((def, i) => {
    const b = document.createElement('button'), open = unlocked(i), s = save.stars[i] | 0;
    b.className = (open ? '' : 'locked') + (i === cur ? ' current' : '');
    b.innerHTML = open ? `${i + 1}<small>${nm(def)}</small><span class="st">${[1, 2, 4].map((m) => `<i class="ico ico-star${s & m ? '' : ' off'}"></i>`).join('')}</span>`
      : `<i class="ico ico-lock"></i><small>${t('locked')}</small>`;
    if (open) b.onclick = () => { unlockAudio(); playSfx('click'); startLevel(i); };
    grid.appendChild(b);
  });
}
function openWorkshop() {
  setState(State.MENU, 'workshop'); camWant = 0;
  $('shopCoins').textContent = save.coins;
  const grid = $('upGrid'); grid.innerHTML = '';
  for (const u of UPGRADES) {
    const lv = save.up[u.id] | 0, max = lv >= CFG.prices.length, price = CFG.prices[lv], card = document.createElement('div');
    card.className = 'up-card';
    card.innerHTML = `<i class="ico ico-${u.icon} big"></i><b>${t(u.name)}</b><small>${t(u.desc)}</small>` +
      `<span class="pips">${CFG.prices.map((_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</span>`;
    const btn = document.createElement('button'); btn.className = max ? 'soft' : 'buy';
    btn.innerHTML = max ? t('max') : `<i class="ico ico-stamp"></i>${price}`; btn.disabled = max;
    btn.onclick = () => {
      unlockAudio();
      if (save.coins < price) { toast(t('needCoins')); playSfx('blocked'); return; }
      save.coins -= price; save.up[u.id] = lv + 1; persist(); playSfx('unlock'); refreshMenu(); openWorkshop();
    };
    card.appendChild(btn); grid.appendChild(card);
  }
  const pg = $('paintGrid'); pg.innerHTML = '';
  PAINTS.forEach((p, i) => {
    const owned = save.paints.includes(i), inUse = save.paint === i, b = document.createElement('button');
    b.className = `paint${inUse ? ' on' : ''}`;
    b.innerHTML = `<span class="swatch" style="--a:${p.a};--b:${p.b};--c:${p.c}"></span><small>${inUse ? t('inUse') : owned ? t('use') : `<i class="ico ico-stamp"></i>${CFG.paintPrice}`}</small>`;
    b.onclick = () => {
      unlockAudio();
      if (!owned) {
        if (save.coins < CFG.paintPrice) { toast(t('needCoins')); playSfx('blocked'); return; }
        save.coins -= CFG.paintPrice; save.paints.push(i); playSfx('unlock');
      } else playSfx('click');
      save.paint = i; persist(); refreshMenu(); if (W?.demo) repaintBalloon(); openWorkshop();
    };
    pg.appendChild(b);
  });
}
function repaintBalloon() {
  const old = view.balloon; view.root.remove(old); disposeTree(old);
  view.balloon = buildBalloon(save.paint | 0); view.root.add(view.balloon); view.carryKey = '';
}
function buildHudHearts() {
  const el = $('hudHearts'); el.innerHTML = '';
  for (let i = 0; i < CFG.hearts; i++) { const s = document.createElement('i'); s.className = 'ico ico-heart'; el.appendChild(s); }
}
let hudCache = '';
function updateHud() {
  if (!W || W.demo) return;
  const w = W, key = `${w.delivered}|${w.hearts}|${w.earned}|${w.b.carry.length}|${state}|${Math.ceil(w.timeLeft)}`;
  if (key !== hudCache) {
    hudCache = key;
    $('hudParcels').textContent = w.endless ? `${w.delivered}` : `${w.delivered}/${w.target}`;
    $('hudCarry').textContent = `${w.b.carry.length}/${w.cap}`;
    [...$('hudHearts').children].forEach((s, i) => s.classList.toggle('off', i >= w.hearts));
    $('hudCoinsN').textContent = w.earned;
    $('hudTime').textContent = fmt(w.timeLeft); $('hudTimePill').classList.toggle('low', w.timeLeft < 15);
  }
  $('btnDrop').classList.toggle('ready', w.b.carry.length > 0);
  updateAltimeter();
  updatePointers();
}
function pulse(id) { const el = $(id); if (!el || SIMMING) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
let bannerTimer = 0;
function banner(small, big) {
  if (SIMMING) return;
  const el = $('banner'); $('bannerSmall').textContent = small; $('bannerBig').textContent = big;
  el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
// the altimeter: one band per wind layer with its arrow, your balloon, the pickup line, nearby geese and storms
let ALT_MAX = 48, altBands = [], altHaz = [];
function buildAltimeter() {
  const bar = $('altBar'); bar.querySelectorAll('.band,.haz').forEach((e) => e.remove()); altBands = []; altHaz = [];
  ALT_MAX = W.G.top + 2;
  const calm = bar.querySelector('.calm'); calm.style.height = `${(FLOOR / ALT_MAX) * 100}%`;
  for (const L of W.layers) {
    const el = document.createElement('div'); el.className = 'band';
    el.style.bottom = `${(L.y0 / ALT_MAX) * 100}%`; el.style.height = `${((L.y1 - L.y0) / ALT_MAX) * 100}%`; el.style.setProperty('--c', L.color);
    el.innerHTML = '<i class="warr"></i>'; bar.appendChild(el); altBands.push({ el, arr: el.firstChild, deg: -999 });
  }
  for (let k = 0; k < 4; k++) { const el = document.createElement('i'); el.className = 'haz'; el.hidden = true; bar.appendChild(el); altHaz.push(el); }
}
let altBest = -1;
function currentTarget() {
  const w = W, b = w.b, G = w.G;
  if (b.carry.length) {
    let best = null; for (const p of b.carry) { const h = G.houses[p.dest], d = Math.hypot(h.x - b.x, h.z - b.z); if (!best || d < best.d) best = { x: h.x, z: h.z, d, color: h.color, kind: 'house' }; }
    if (canPick(w)) { const dd = Math.hypot(G.depot.x - b.x, G.depot.z - b.z); if (dd < best.d * 0.5) return { x: G.depot.x, z: G.depot.z, d: dd, color: '#ffc93c', kind: 'depot' }; }
    return best;
  }
  if (canPick(w)) return { x: G.depot.x, z: G.depot.z, d: Math.hypot(G.depot.x - b.x, G.depot.z - b.z), color: '#ffc93c', kind: 'depot' };
  return null;
}
function updateAltimeter() {
  const w = W, b = w.b;
  $('altMe').style.bottom = `${(clamp(b.y, 0, ALT_MAX) / ALT_MAX) * 100}%`;
  const pc = canPick(w); $('altPick').hidden = !pc; if (pc) $('altPick').style.bottom = `${(pickCeil(w) / ALT_MAX) * 100}%`;
  const tg = currentTarget(); let ux = 0, uz = 0;
  $('altCompass').classList.toggle('off', !tg);
  if (tg) { ux = (tg.x - b.x) / Math.max(1, tg.d); uz = (tg.z - b.z) / Math.max(1, tg.d); $('altNeedle').style.transform = `rotate(${Math.atan2(ux, -uz)}rad)`; $('altCompass').style.setProperty('--c', tg.color); $('altDist').textContent = `${Math.round(tg.d)}`; }
  let best = -1, bs = -1e9;
  w.layers.forEach((L, i) => {
    const B = altBands[i]; if (!B) return;
    if (Math.abs(B.deg - L.deg) > 0.5) { B.deg = L.deg; B.arr.style.transform = `rotate(${L.deg}deg)`; }
    const d = dirVec(L.deg), s = d.x * ux + d.z * uz; if (s > bs) { bs = s; best = i; }
  });
  const hint = tg && (w.def.hint || tipShowsBest());
  const bi = hint ? best : -1;
  if (bi !== altBest) { altBands.forEach((B, i) => B.el.classList.toggle('best', i === bi)); altBest = bi; }
  const cur = layerAt(w.layers, b.y); altBands.forEach((B, i) => B.el.classList.toggle('cur', cur && cur.i === i));
  // hazards within reach
  const hz = [];
  for (const f of w.geese) { const d = Math.hypot(f.x - b.x, f.z - b.z); if (d < 45) hz.push({ y: f.y, k: 'goose', d }); }
  for (const s of w.storms) { const d = Math.hypot(s.x - b.x, s.z - b.z); if (d < 45) hz.push({ y: s.y, k: 'storm', d }); }
  hz.sort((a, c) => a.d - c.d);
  altHaz.forEach((el, i) => {
    const h = hz[i]; el.hidden = !h; if (!h) return;
    el.className = `haz ico ico-${h.k}`; el.style.bottom = `${(h.y / ALT_MAX) * 100}%`; el.style.opacity = String(clamp(1.3 - h.d / 45, 0.35, 1));
  });
}
// edge pointers toward off-screen destinations and the post office
const ptrEls = [];
const _np = new THREE.Vector3();
function updatePointers() {
  const w = W, b = w.b, G = w.G, list = [];
  const dests = new Set(b.carry.map((p) => p.dest));
  for (const k of dests) { const h = G.houses[k]; list.push({ x: h.x, y: G.heightAt(h.x, h.z) + 2, z: h.z, color: h.color, icon: 'parcel' }); }
  if (canPick(w)) list.push({ x: G.depot.x, y: G.heightAt(G.depot.x, G.depot.z) + 6, z: G.depot.z, color: '#ffc93c', icon: 'post' });
  while (ptrEls.length < list.length) { const el = document.createElement('div'); el.className = 'ptr'; el.innerHTML = '<i class="ptr-arrow"></i><i class="ico"></i><b></b>'; $('ptrs').appendChild(el); ptrEls.push(el); }
  ptrEls.forEach((el, i) => {
    const o = list[i]; if (!o) { el.hidden = true; return; }
    _np.set(o.x, o.y, o.z).project(camera);
    let x = _np.x, y = _np.y; const behind = _np.z > 1;
    if (behind) { x = -x; y = -y; }
    const inside = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86;
    el.hidden = inside; if (inside) return;
    const m = Math.max(x > 0 ? x / 0.72 : -x / 0.86, y > 0 ? y / 0.72 : -y / (Math.abs(x) > 0.55 ? 0.5 : 0.78), 1e-3); x /= m; y /= m; // keep clear of the altimeter, HUD and buttons
    const ang = Math.atan2(-y * innerHeight, x * innerWidth);
    el.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px, ${(-y * 0.5 + 0.5) * innerHeight}px)`;
    el.style.setProperty('--c', o.color); el.children[0].style.transform = `rotate(${ang}rad)`;
    el.children[1].className = `ico ico-${o.icon}`; el.children[2].textContent = `${Math.round(Math.hypot(o.x - b.x, o.z - b.z))}`;
  });
}

// ================================================================ TIPS (onboarding inside gameplay: a few words, an arrow, never a pause)
const TIPS = {
  first: [
    { pic: 'burn', text: 'tipBurn', arrow: 'burn', until: 'high', time: 120 },
    { pic: 'layers', text: 'tipLayers', arrow: 'alt', until: 'nearHouse', time: 60 },
    { pic: 'drop', text: 'tipDrop', arrow: 'ring', until: 'deliver', time: 120 },
    { pic: 'post', text: 'tipBack', arrow: 'altTop', until: 'pickup', time: 90 },
  ],
  layers: [{ pic: 'compass', text: 'tipCompass', arrow: 'compass', time: 9 }, { pic: 'layers', text: 'tipBest', arrow: 'alt', time: 8 }],
  sink: [{ pic: 'vent', text: 'tipVent', arrow: 'vent', until: 'vent', time: 16 }],
  thermal: [{ pic: 'thermal', text: 'tipThermal', arrow: 'thermal', time: 10 }],
  geese: [{ pic: 'goose', text: 'tipGeese', arrow: 'alt', time: 11, delay: 6 }],
  cap: [{ pic: 'parcel', text: 'tipCap', time: 8 }],
  storm: [{ pic: 'storm', text: 'tipStorm', arrow: 'storm', time: 11 }],
  veer: [{ pic: 'veer', text: 'tipVeer', arrow: 'alt', time: 9 }],
  express: [{ pic: 'letter', text: 'tipExpress', time: 9 }],
  peaks: [{ pic: 'peak', text: 'tipPeaks', time: 9 }],
  isles: [{ pic: 'isle', text: 'tipIsles', time: 9 }],
  shift: [{ pic: 'veer', text: 'tipShift', time: 9 }],
  busy: [{ pic: 'parcel', text: 'tipBusy', time: 8 }],
};
const PIC = (name, bg = '') => `<span class="tip-pic"${bg ? ` style="background:${bg}"` : ''}><i class="ico ico-${name}"></i></span>`;
let tipState = null;
function startTips(key) {
  tipState = null; $('tip').hidden = true; $('arrow').hidden = true;
  if (!key || save.tipsOff || save.tips[key] || (AUTOPLAY && !FORCE_TIPS) || !TIPS[key]) return;
  tipState = { key, i: -1, t: 0 }; nextTip();
}
function tipShowsBest() { return tipState && TIPS[tipState.key][tipState.i]?.text === 'tipBest'; }
function nextTip() {
  const steps = TIPS[tipState.key]; tipState.i++; tipState.t = 0;
  if (tipState.i >= steps.length) { save.tips[tipState.key] = 1; persist(); tipState = null; $('tip').hidden = true; $('arrow').hidden = true; return; }
  const s = steps[tipState.i];
  if (s.delay) { $('tip').hidden = true; tipState.wait = s.delay; return; }
  showTip(s);
}
function showTip(s) {
  const keysPic = (ks, wide) => ks.map((k) => `<kbd class="solo${wide ? ' wide' : ''}">${k}</kbd>`).join('');
  const pics = {
    burn: isTouch ? `<span class="hand hold"></span>${PIC('flame', '#ffe2b0')}` : `${keysPic(['Space'], true)}<span class="or">${t('or')}</span><span class="mouse hold"></span>`,
    vent: isTouch ? `<span class="hand"></span>${PIC('vent', '#d9ecf5')}` : `${PIC('vent', '#d9ecf5')}${keysPic(['S'])}`,
    drop: isTouch ? `<span class="hand"></span>${PIC('drop', '#ffe2b0')}` : `${PIC('drop', '#ffe2b0')}${keysPic(['E'])}<span class="or">${t('or')}</span><span class="mouse right"></span>`,
    layers: PIC('wind', '#d9ecf5'), compass: PIC('compass', '#d9ecf5'), post: PIC('post', '#ffe9a8'), thermal: PIC('thermal', '#fff1c4'), goose: PIC('goose', '#e6f4ff'),
    parcel: PIC('parcel'), storm: PIC('storm', '#e3e6ef'), veer: PIC('veer', '#d9ecf5'), letter: PIC('letter', '#ffe2dc'), peak: PIC('peak'), isle: PIC('isle', '#d4f0f7'),
  };
  $('tipIcon').innerHTML = pics[s.pic] || ''; $('tipText').textContent = t(s.text);
  $('tip').hidden = false; $('tip').style.animation = 'none'; void $('tip').offsetWidth; $('tip').style.animation = '';
}
function tipEvent(kind) { if (tipState && !tipState.wait && TIPS[tipState.key][tipState.i]?.until === kind) nextTip(); }
const _a = new THREE.Vector3();
function tipAnchor(kind) { // world point -> projected, or a DOM element -> its rect
  const w = W; if (!w) return null;
  const el = (id, dx = 0, dy = 0) => { const r = $(id).getBoundingClientRect(); return r.width ? { sx: r.left + r.width / 2 + dx, sy: r.top + dy } : null; };
  if (kind === 'burn') return el('btnBurn');
  if (kind === 'vent') return el('btnVent');
  if (kind === 'alt') { const r = $('altBar').getBoundingClientRect(); const L = w.layers[altBest >= 0 ? altBest : 0], y = r.bottom - ((L.y0 + L.y1) / 2 / ALT_MAX) * r.height; return { sx: r.left - 4, sy: y - 6, side: true }; }
  if (kind === 'altTop') { const r = $('altBar').getBoundingClientRect(); const L = w.layers[w.layers.length - 1], y = r.bottom - ((L.y0 + L.y1) / 2 / ALT_MAX) * r.height; return { sx: r.left - 4, sy: y - 6, side: true }; }
  if (kind === 'compass') return el('altCompass');
  if (kind === 'ring') { const p = w.b.carry[0] || w.inFlight[0]; if (p) { const h = w.G.houses[p.dest]; return _a.set(h.x, w.G.heightAt(h.x, h.z) + 1.5, h.z); } }
  if (kind === 'thermal' && w.G.thermals.length) { const th = w.G.thermals.reduce((a, c) => (Math.hypot(c.x - w.b.x, c.z - w.b.z) < Math.hypot(a.x - w.b.x, a.z - w.b.z) ? c : a)); return _a.set(th.x, w.G.heightAt(th.x, th.z) + 2, th.z); }
  if (kind === 'storm' && w.storms.length) { const s = w.storms[0]; return _a.set(s.x, s.y + 4, s.z); }
  return null;
}
function updateTips(dt) {
  if (!tipState || !W) return;
  const s = TIPS[tipState.key][tipState.i];
  if (tipState.wait) { tipState.wait -= dt; if (tipState.wait <= 0) { tipState.wait = 0; showTip(s); } return; }
  tipState.t += dt;
  if (s.until === 'high' && W.b.y > FLOOR + 4) return nextTip();
  if (s.until === 'nearHouse' && W.b.carry.length) { const h = W.G.houses[W.b.carry[0].dest]; if (Math.hypot(h.x - W.b.x, h.z - W.b.z) < 24) return nextTip(); }
  if (s.time && tipState.t > s.time) nextTip();
}
function placeArrow() {
  const s = tipState && !tipState.wait && TIPS[tipState.key][tipState.i], arrow = $('arrow'), p = s?.arrow && tipAnchor(s.arrow);
  if (!p) { arrow.hidden = true; return; }
  let sx, sy;
  if (p.isVector3) { p.project(camera); if (p.z > 1 || Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95) { arrow.hidden = true; return; } sx = (p.x * 0.5 + 0.5) * innerWidth; sy = (-p.y * 0.5 + 0.5) * innerHeight; }
  else { sx = p.sx; sy = p.sy; }
  arrow.hidden = false; arrow.classList.toggle('side', !!p.side); arrow.style.left = `${sx}px`; arrow.style.top = `${sy}px`;
}

// ================================================================ GAMEPLAY (routes, Sunset Rounds, results)
function enterWorld(w) {
  for (const p of parts) p.visible = false;
  for (const p of pops) p.el.remove(); pops.length = 0;
  W = w; applyLight(w.def.light); buildView(w); buildAltimeter(); hudCache = ''; altBest = -1;
  $('hudTimePill').hidden = !w.endless; $('hudParcelPill').hidden = false;
  snapCamera();
  if (!CAPTURE) playMusic(w.def.light === 'dusk' ? ASSETS.music.dusk : ASSETS.music.day);
}
function startDemo() {
  const w = createWorld(DEMO, 'demo'); w.b.y = 22; w.b.landed = false; w.bot.y = 22; enterWorld(w); camWant = 0;
}
function startLevel(i) {
  levelIndex = i; const def = LEVELS[i];
  enterWorld(createWorld(def, 'level'));
  run = { gain: 0 }; buildHudHearts();
  $('hudRoute').textContent = t('route', { n: i + 1 }); $('hudName').textContent = nm(def);
  setState(State.PLAYING); camWant = 1;
  banner(t('route', { n: i + 1 }), nm(def)); startTips(def.tip);
}
function startEndless() {
  levelIndex = -1;
  const def = { ...ENDLESS, seed: CAPTURE ? 777 : 1 + ((Math.random() * 1e6) | 0) };
  enterWorld(createWorld(def, 'endless'));
  run = { gain: 0 }; buildHudHearts();
  $('hudRoute').textContent = t('endless'); $('hudName').textContent = '';
  setState(State.PLAYING); camWant = 1;
  banner(t('endless'), save.endlessBest ? `${t('best')} ${save.endlessBest}` : t('tagline'));
}
function restartLevel() { if (levelIndex < 0) startEndless(); else startLevel(levelIndex); }
function endLevel() {
  const w = W, win = w.result === 'win', endless = w.endless;
  setState(State.GAMEOVER);
  const R = { stars: 0, gain: w.earned };
  $('resStars').hidden = endless || !win; $('resScore').hidden = !endless; $('resSub').hidden = true;
  $('btnNext').hidden = endless || !win; $('btnRetry').hidden = !(endless || !win); $('btnReplay').hidden = endless || !win;
  if (endless) {
    const isBest = w.delivered > save.endlessBest; if (isBest) { save.endlessBest = w.delivered; if (w.delivered > 0) happytime(); }
    $('resTitle').textContent = t('endlessOver'); $('resScoreN').textContent = w.delivered; $('resBest').textContent = save.endlessBest; $('resNewBest').hidden = !isBest;
    playSfx(isBest ? 'done' : 'fail');
  } else if (win) {
    const def = LEVELS[levelIndex], bits = 1 | (w.bumps === 0 && w.misses === 0 && w.stats.late === 0 ? 2 : 0) | (w.t <= def.par ? 4 : 0);
    R.stars = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1); R.gain += R.stars * CFG.starBonus;
    const firstClear = !(save.stars[levelIndex] & 1);
    save.stars[levelIndex] = (save.stars[levelIndex] | 0) | bits;
    if (!save.best[levelIndex] || w.t < save.best[levelIndex]) save.best[levelIndex] = Math.round(w.t * 10) / 10;
    if (firstClear && levelIndex === LEVELS.length - 1) happytime();
    $('resTitle').textContent = t('win'); $('starParLabel').textContent = t('starPar', { t: fmt(def.par) });
    [0, 1, 2].forEach((k) => $(`star${k}`).classList.remove('on'));
    [1, 2, 4].forEach((m, k) => { if (bits & m) setTimeout(() => { $(`star${k}`).classList.add('on'); playSfx('star'); }, 350 + k * 380); });
    playSfx('done');
  } else {
    $('resTitle').textContent = t('lose'); $('resSub').textContent = t('loseSub'); $('resSub').hidden = false; playSfx('fail');
  }
  save.coins += R.gain; run.gain = R.gain; persist(); refreshMenu();
  $('resCoins').textContent = R.gain;
  $('btnDouble').hidden = !(adsAvailable() && R.gain > 0);
}

// ================================================================ LOOP (fixed-step sim, then the view follows it)
let last = performance.now(), acc = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _right = new THREE.Vector3();
function cameraGoal(outPos, outLook) {
  const w = W, b = w.b, aspect = innerWidth / innerHeight, far = aspect < 1 ? 1.5 : aspect < 1.4 ? 1.18 : 1;
  const kGame = ease(clamp(camBlend, 0, 1));
  // gameplay: north-up, from the south and above, leading a little in the wind's direction
  const gLook = _cl.set(b.x + b.vx * 0.9, b.y + 2.5, b.z + b.vz * 0.9);
  const gPos = _cp.set(gLook.x, gLook.y + CFG.camUp * far, gLook.z + CFG.camBack * far);
  // menu: a slow orbit low beside the balloon, which sits right of the title column
  const a = clock * 0.05 + 0.6, mLook = new THREE.Vector3(b.x, b.y + 3.5, b.z);
  const mPos = new THREE.Vector3(b.x + Math.sin(a) * 26, b.y + 7, b.z + Math.cos(a) * 26);
  if (aspect > 1.1) { _right.subVectors(mLook, mPos).cross(_up).normalize(); mLook.addScaledVector(_right, -9); } else { mLook.y -= 5; mPos.y += 6; }
  outPos.lerpVectors(mPos, gPos, kGame); outLook.lerpVectors(mLook, gLook, kGame);
}
function snapCamera() { cameraGoal(camPos, camLook); }
function advance(dt) {
  camBlend += (camWant - camBlend) * (1 - Math.exp(-dt * 2.5));
  if (state !== State.PAUSED) { acc += dt; while (acc >= STEP) { step(STEP); clock += STEP; acc -= STEP; } }
  handleEvents(); updateParticles(dt); if (state === State.PLAYING) updateTips(dt);
}
const _gp = new THREE.Vector3(), _gl = new THREE.Vector3();
function render(dt) {
  if (!W) return;
  cameraGoal(_gp, _gl);
  const k = 1 - Math.exp(-dt * 4);
  camPos.lerp(_gp, k); camLook.lerp(_gl, k);
  camera.position.copy(camPos);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook);
  const b = W.b; sun.target.position.set(b.x, 0, b.z); sun.position.set(b.x + sunDir.x * 90, sunDir.y * 90, b.z + sunDir.z * 90);
  syncView(dt);
  renderer.render(scene, camera);
  if (!SIMMING) { updateHud(); updatePops(dt); if (state === State.PLAYING) placeArrow(); }
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ CAPTURE (press kit: frames, trailer, in-engine covers)
const COVER = { // a hand-staged morning: the balloon low over a village, a parcel drifting down under its chute into a yard
  def: { ...DEMO, seed: 4242, light: 'morning' },
  cams: { wide: [-15, 1.5, 22, 50, 0], square: [-15, 2, 25, 56, 0], tall: [-12, 2, 30, 62, 0] }, // side, up, back, fov, title room
};
function stageCover(kind) {
  for (const id of ['hud', 'menu', 'routesPanel', 'workshop', 'paused', 'results', 'tip', 'arrow', 'banner', 'toast', 'controls', 'alt', 'pops', 'ptrs']) $(id).hidden = true;
  state = State.BOOT;
  const w = createWorld(COVER.def, 'demo'); enterWorld(w); w.demo = true;
  const G = w.G, h = G.houses[0], hy = G.heightAt(h.x, h.z);
  const b = w.b; Object.assign(b, { x: h.x - 9, y: hy + 12, z: h.z + 10, vx: 2, vy: 0, vz: 0, landed: false, burn: true });
  b.carry = [{ id: 901, dest: 1, color: G.houses[1].color }, { id: 902, dest: 2, color: G.houses[2 % G.houses.length].color }];
  w.inFlight = [{ id: 903, dest: 0, color: h.color, x: h.x - 3.5, y: hy + 6, z: h.z + 4.5, vx: 0, vy: -4, vz: 0, age: 1 }];
  w.geese = [{ id: 950, x: b.x + 12, z: b.z - 4, y: b.y + 6, dx: -0.85, dz: -0.5, life: 99, honked: true, scatter: 0 }];
  view.houses[0].ring.visible = true;
  const aspect = innerWidth / innerHeight, [side, up, back, fov, lift] = COVER.cams[aspect < 0.9 ? 'tall' : aspect < 1.2 ? 'square' : 'wide'];
  camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix();
  camera.position.set(b.x + side, b.y + up, b.z + back);
  camera.lookAt(b.x + 5, b.y - 3.2, b.z - 6); // the balloon left of centre, its target garden ahead and right, above the title band
  if (kind !== 'keyart') camera.setViewOffset(innerWidth, innerHeight, 0, -innerHeight * lift, innerWidth, innerHeight);
  sun.target.position.set(b.x, 0, b.z); sun.position.set(b.x + sunDir.x * 90, sunDir.y * 90, b.z + sunDir.z * 90);
  w.clouds = w.clouds.filter((c) => camera.position.distanceTo(_p.set(c.x, c.y, c.z)) > 70); // no cloud right in front of the lens
  for (let i = 0; i < 40; i++) syncView(1 / 30), clock += 1 / 30; // ribbons spread out
  view.houses[0].ring.visible = true; view.houses[0].pin.visible = false;
  view.predRing.visible = false; view.predDots.visible = false; view.depotPin.visible = false;
  view.balloon.userData.flame.visible = true; view.balloon.userData.flame.scale.set(1, 1.1, 1); view.balloon.visible = true;
  renderer.render(scene, camera);
  camera.clearViewOffset(); camera.fov = CFG.fov; camera.updateProjectionMatrix();
}
function captureApi() {
  const capLevel = clamp((params.get('route') | 0 || 6) - 1, 0, LEVELS.length - 1);
  window.__game = {
    start: () => startLevel(capLevel),
    frame: (dt = 1 / 30) => { advance(dt); render(dt); },
    skip: (sec) => { SIMMING = true; for (let s = 0; s < sec; s += STEP) { advance(STEP); if (state === State.GAMEOVER) startLevel(Math.min(LEVELS.length - 1, levelIndex + 1)); } SIMMING = false; snapCamera(); }, // the camera catches up at once
    sim: (sec) => { SIMMING = true; const end = clock + sec; while (clock < end && state === State.PLAYING) advance(STEP); SIMMING = false; snapCamera(); return window.__game.info(); },
    level: (i) => startLevel(i),
    endless: () => startEndless(),
    info: () => ({ state, route: levelIndex + 1, t: W?.t, delivered: W?.delivered, target: W?.target, hearts: W?.hearts, bumps: W?.bumps, misses: W?.misses, late: W?.stats.late, bulls: W?.stats.bulls, result: W?.result, coins: save.coins, stars: totalStars(), timeLeft: W?.timeLeft, y: W?.b.y, x: W?.b.x, z: W?.b.z, carry: W?.b.carry.length, fly: W?.inFlight.length, goal: W?.bot.y, landed: W?.b.landed }),
    cover: (kind) => stageCover(kind),
    debug: () => { const w = W, tg = botTarget(w), p = w.b.carry.length ? predictLanding(w) : null; return { tg, b: { ...w.b, carry: w.b.carry.map((q) => q.dest) }, houses: w.G.houses, depot: w.G.depot, layers: w.layers.map((L) => [L.y0, L.deg]), pred: p && { x: p.x, z: p.z }, goal: w.bot.y }; },
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
  document.body.classList.toggle('touch', isTouch);
  resize(); startDemo();
  setState(State.MENU, 'menu'); refreshMenu(); camBlend = 0; snapCamera();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  if (CAPTURE) { captureApi(); render(0); } // capture protocol (tools/capture.mjs): no rAF loop, the tool drives every frame
  else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
