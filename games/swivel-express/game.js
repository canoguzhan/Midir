// Swivel Express: a wind-up toy train runs on a table-top railway and never stops. Tap track tiles to swivel them
// ahead of it, keep the line connected and carry the peg-doll passengers to the station with their colour.
// Sections: CONFIG, I18N, SDK, AUDIO, SCENE, VIEW, RULES, HAZARDS, BOT, FX, INPUT, STATE, UI, TIPS, GAMEPLAY, LOOP, CAPTURE, BOOT.
// Board rules and geometry live in rail.js (pure), meshes in props.js (procedural); only audio loads from ./assets/.
// No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';
import { TS, DX, DZ, opp, COLORS, LEVELS, ENDLESS, buildBoard, tileAt, centerOf, tileFromXZ, segment, segPos, traceAhead, exitFor, planRoutes, turnable, maskOf } from './rail.js';
import {
  buildTable, buildBoardBase, buildToys, buildTile, buildCursor, buildStation, buildDepot, buildPortal, buildDeco, buildBlock, buildLoco, buildCar,
  buildPeg, buildCow, buildTop, buildCoin, buildDeadMark, spinAngle, PAINTS, SEATS, softTex, puffTex, dotTex, drawBadge,
} from './props.js';

// ================================================================ CONFIG
const SAVE_KEY = 'swivel-express';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot runs the railway (trailer footage, balance tests)
const FORCE_TIPS = params.has('tips'); // review onboarding in capture mode
const BOT = AUTOPLAY && !params.has('nobot');
const CFG = {
  fov: 34, pitch: 1.0, // gameplay camera: vertical field of view (degrees) and tilt from the horizon (radians)
  hearts: 3, hold: 1.3, // seconds the train waits at the depot before it sets off
  brake: 2.4, brakeUp: 0.5, brakeK: 0.3, brakeRefill: 0.4,
  patience: 30, patienceUp: 0.15, cap: 4, // a full platform (cap passengers) waits this long before two of them give up
  fare: 5, fareUp: 1, multi: 3, starBonus: 10, prices: [40, 90, 160, 250, 360], paintPrice: 150,
  carGap: 1.22, carStep: 1.12, // distance behind the loco of the first carriage, and between carriages
  cowEvery: [9, 15], cowStand: [6, 9], cowWalk: 1.1, cowRun: 3,
  topEvery: [12, 18], topWarn: 1.8, topSpeed: 5.5, coinEvery: 6, coinValue: 5,
  warnDist: 3.2, // units to a dead end that sound the crossing bell
};
const UPGRADES = [
  { id: 'brake', name: 'upBrake', desc: 'upBrakeD', icon: 'brake' },
  { id: 'comfy', name: 'upComfy', desc: 'upComfyD', icon: 'peg' },
  { id: 'lucky', name: 'upLucky', desc: 'upLuckyD', icon: 'coin' },
];
const DEMO = { name: { en: '', tr: '' }, light: 'morning', gen: { cols: 8, rows: 6, holes: 2, stations: 4, scramble: 0.25 }, seed: 4242, cars: 2, speed: 1.15, every: 2.4, maxWait: 9, cows: 1 };
const ASSETS = {
  sfx: {
    turn: 'assets/audio/swv_turn.mp3', blocked: 'assets/audio/swv_blocked.mp3', whistle: 'assets/audio/swv_whistle.mp3', board: 'assets/audio/swv_board.mp3',
    deliver: 'assets/audio/swv_deliver.mp3', derail: 'assets/audio/swv_derail.mp3', moo: 'assets/audio/swv_moo.mp3', tunnel: 'assets/audio/swv_tunnel.mp3',
    brake: 'assets/audio/swv_brake.mp3', grumble: 'assets/audio/swv_grumble.mp3', warn: 'assets/audio/swv_warn.mp3',
    fail: 'assets/audio/swv_fail.mp3', done: 'assets/audio/works_fanfare.mp3', coin: 'assets/audio/works_coin_jar.mp3', knock: 'assets/audio/works_block_crack.mp3',
    star: 'assets/audio/wool_star.mp3', unlock: 'assets/audio/unlock.mp3', combo: 'assets/audio/keel_combo.mp3', top: 'assets/audio/whirl_dash.mp3',
    click: 'assets/audio/rune_tile_tap.mp3', chug: 'assets/audio/swv_chug_loop.mp3', room: 'assets/audio/swv_room_loop.mp3',
  },
  music: { day: 'assets/audio/bgm_swivel_line.mp3', sunset: 'assets/audio/bgm_swivel_sunset.mp3' },
};

// ================================================================ I18N (English required; Turkish too)
const STRINGS = {
  en: {
    play: 'Play', stops: 'Stops', toybox: 'Toy Box', endless: 'Endless Line', tagline: 'Swivel the track. The train never stops!',
    stop: 'Stop {n}', locked: 'Locked', back: 'Back', paused: 'Paused', resume: 'Resume', restart: 'Restart', menu: 'Menu',
    next: 'Next stop', replay: 'Replay', retry: 'Try again', double: '▶ Double coins', doubled: 'Coins doubled!', adUnavailable: 'Ad not available right now',
    win: 'All aboard!', lose: 'Off the rails!', loseSub: 'Too many mishaps. Try again!', endlessOver: 'End of the line',
    starDone: 'Everyone home', starNoMishap: 'No mishaps', starPar: 'Under {t}', best: 'Best', newBest: 'New best!', score: 'passengers home',
    endlessLocked: 'Clear stop 5', allDone: 'Every stop is done. Try the Endless Line!',
    skipTips: 'Skip tips', or: 'or', brake: 'Brake', upgrades: 'Upgrades', paint: 'Paint Shop', owned: 'Owned', use: 'Use', inUse: 'In use',
    tipTurn: 'Tap the tile to turn it and fix the track', tipPath: 'The train never stops. Keep the glowing path joined up!',
    tipRide: 'Passengers ride to the station with their colour', tipDead: 'A red cross is a dead end. Turn tiles before the train gets there!',
    tipShort: 'Every tile with a curled arrow turns. Build shortcuts!', tipColors: 'Match the colour and the hat: every passenger has a home station',
    tipBrake: 'Hold to brake when you need more time', tipCrowd: 'A full platform runs out of patience. Pick them up before the ring empties',
    tipCow: 'A cow on the line stops the train. Tap the cow to shoo it!', tipCars: 'Two carriages today: room for six passengers',
    tipTunnel: 'Tunnels are linked: in one hill, out of the other', tipTop: 'Spinning tops knock tiles askew. Watch the orange lane!',
    tipGold: 'A faster train today. Collect the coins on the track!', tipTwin: 'Two trains! Keep them from bumping into each other',
    derailed: 'Derailed!', crash: 'Bump!', grumble: 'Too crowded!', moo: 'Moo!', needCoins: 'Not enough coins', max: 'Max',
    upBrake: 'Big Brake', upBrakeD: 'Brake for longer', upComfy: 'Comfy Platforms', upComfyD: 'Full platforms wait longer',
    upLucky: 'Lucky Tickets', upLuckyD: '+1 coin for every passenger',
    hzTops: 'Spinning tops are loose!', hzCows: 'The cows are out!', hzFaster: 'Full steam ahead!',
  },
  tr: {
    play: 'Oyna', stops: 'Duraklar', toybox: 'Oyuncak Kutusu', endless: 'Sonsuz Hat', tagline: 'Rayları çevir. Tren hiç durmaz!',
    stop: 'Durak {n}', locked: 'Kilitli', back: 'Geri', paused: 'Duraklatıldı', resume: 'Devam', restart: 'Yeniden', menu: 'Menü',
    next: 'Sonraki durak', replay: 'Tekrar', retry: 'Tekrar dene', double: '▶ Altınları ikiye katla', doubled: 'Altınlar ikiye katlandı!', adUnavailable: 'Şu anda reklam yok',
    win: 'Herkes yerinde!', lose: 'Raydan çıktı!', loseSub: 'Çok fazla aksilik oldu. Tekrar dene!', endlessOver: 'Hattın sonu',
    starDone: 'Herkes evinde', starNoMishap: 'Hiç aksilik yok', starPar: '{t} altında', best: 'En iyi', newBest: 'Yeni rekor!', score: 'yolcu evinde',
    endlessLocked: '5. durağı bitir', allDone: 'Bütün duraklar tamam. Sonsuz Hat’ı dene!',
    skipTips: 'İpuçlarını geç', or: 'ya da', brake: 'Fren', upgrades: 'Geliştirmeler', paint: 'Boya Atölyesi', owned: 'Senin', use: 'Kullan', inUse: 'Kullanımda',
    tipTurn: 'Rayı onarmak için karoya dokunup çevir', tipPath: 'Tren hiç durmaz. Parlayan yolu bağlı tut!',
    tipRide: 'Yolcular kendi renklerindeki istasyona gider', tipDead: 'Kırmızı çarpı çıkmaz yol demek. Tren gelmeden karoları çevir!',
    tipShort: 'Kıvrık oklu her karo döner. Kestirmeler yap!', tipColors: 'Rengi ve şapkayı eşleştir: her yolcunun bir istasyonu var',
    tipBrake: 'Daha çok zaman gerekince basılı tutup fren yap', tipCrowd: 'Dolu peronun sabrı tükenir. Halka bitmeden yolcuları al',
    tipCow: 'Raydaki inek treni durdurur. Kovmak için ineğe dokun!', tipCars: 'Bugün iki vagon var: altı yolcuya yer',
    tipTunnel: 'Tüneller bağlıdır: bir tepeden gir, ötekinden çık', tipTop: 'Topaçlar karoları çevirir. Turuncu şeride dikkat!',
    tipGold: 'Bugün tren daha hızlı. Raydaki altınları topla!', tipTwin: 'İki tren! Birbirlerine çarpmasınlar',
    derailed: 'Raydan çıktı!', crash: 'Tosladı!', grumble: 'Çok kalabalık!', moo: 'Möö!', needCoins: 'Yeterli altın yok', max: 'Tam',
    upBrake: 'Büyük Fren', upBrakeD: 'Daha uzun fren yap', upComfy: 'Rahat Peronlar', upComfyD: 'Dolu peronlar daha uzun bekler',
    upLucky: 'Şanslı Bilet', upLuckyD: 'Her yolcu için +1 altın',
    hzTops: 'Topaçlar serbest!', hzCows: 'İnekler dışarıda!', hzFaster: 'Tam yol ileri!',
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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a new Endless Line best, the last stop cleared

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
  turn: ['square', 520, 380, 0.06, 0.07], blocked: ['square', 140, 110, 0.08, 0.07], whistle: ['triangle', 1180, 1240, 0.35, 0.08], board: ['sine', 700, 1100, 0.12, 0.08],
  deliver: ['triangle', 880, 1320, 0.35, 0.12], derail: ['sawtooth', 300, 70, 0.5, 0.12], moo: ['sawtooth', 160, 120, 0.6, 0.06], tunnel: ['sine', 240, 120, 0.5, 0.06],
  brake: ['sawtooth', 900, 700, 0.3, 0.03], grumble: ['sawtooth', 180, 150, 0.4, 0.05], warn: ['triangle', 1320, 1180, 0.2, 0.06],
  fail: ['triangle', 392, 196, 0.8, 0.1], done: ['triangle', 523, 1046, 0.7, 0.12], coin: ['square', 1320, 1980, 0.12, 0.07], knock: ['square', 300, 200, 0.07, 0.07],
  star: ['sine', 1320, 1980, 0.25, 0.1], unlock: ['triangle', 660, 1320, 0.4, 0.1], combo: ['square', 1175, 1568, 0.16, 0.06], top: ['sine', 300, 900, 0.5, 0.05],
  click: ['square', 900, 900, 0.03, 0.07],
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
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.95 + Math.random() * 0.1); g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function setLoop(key, vol, rate = 1) { // looping sound (train chug, room); missing files simply stay silent
  if (!audio.ctx) return;
  let L = audio.loops[key];
  if (!L) {
    if (vol <= 0.001 || !audio.buffers[key]) return;
    const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain(); s.buffer = audio.buffers[key]; s.loop = true; g.gain.value = 0;
    s.connect(g); g.connect(audio.master); s.start(); L = audio.loops[key] = { s, g, v: 0, r: 1 };
  }
  if (Math.abs(L.v - vol) > 0.01) { L.v = vol; L.g.gain.setTargetAtTime(vol, audio.ctx.currentTime, 0.25); }
  if (Math.abs(L.r - rate) > 0.02) { L.r = rate; L.s.playbackRate.setTargetAtTime(rate, audio.ctx.currentTime, 0.2); }
}
function playMusic(url) {
  audio.wantMusic = true;
  if (audio.music && audio.musicUrl !== url) { audio.music.pause(); audio.music = null; }
  if (!audio.music && url) {
    audio.musicUrl = url; const m = new Audio(url); m.loop = true; m.volume = 0.28; m.onerror = () => { if (audio.music === m) audio.music = null; }; audio.music = m;
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

// ================================================================ SCENE (playroom table and lights: built once)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#f4dcc0'); scene.fog = new THREE.Fog('#f4dcc0', 40, 95);
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 300);
const hemi = new THREE.HemisphereLight('#fff4e0', '#a08868', 1.7);
const sun = new THREE.DirectionalLight('#fff0d8', 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
scene.add(hemi, sun, sun.target, buildTable());
const LIGHTS = { // morning, noon and sunset on the playroom table
  morning: { bg: '#f6dfc4', sky: '#fff4e0', ground: '#a48a68', hemi: 1.75, sun: '#fff0d8', sunI: 2.0, dir: [-0.5, 1, 0.55] },
  noon: { bg: '#f3e6cf', sky: '#ffffff', ground: '#a8946e', hemi: 1.85, sun: '#ffffff', sunI: 2.2, dir: [-0.25, 1.3, 0.35] },
  sunset: { bg: '#f2c09a', sky: '#ffd9b8', ground: '#8a6a58', hemi: 1.55, sun: '#ffb46a', sunI: 2.5, dir: [-0.95, 0.65, 0.35] },
};
function applyLight(name, size) {
  const L = LIGHTS[name] || LIGHTS.morning;
  scene.background.set(L.bg); scene.fog.color.set(L.bg);
  hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.hemi;
  sun.color.set(L.sun); sun.intensity = L.sunI; sun.position.set(L.dir[0] * 30, L.dir[1] * 30, L.dir[2] * 30); sun.target.position.set(0, 0, 0);
  const c = sun.shadow.camera, r = size / 2 + 4; c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 90; c.updateProjectionMatrix();
}
let shakeAmt = 0, clock = 0, SIMMING = false;

// ================================================================ VIEW (meshes for the current board; the rules never touch them)
let view = null;
function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
    const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
    for (const m of ms) if (!m.userData?.shared) { if (m.map && m.userData.ownMap) m.map.dispose(); m.dispose(); }
  });
}
const DOT_COLORS = ['#ffd23f', '#7fe8ff'];
function buildView(w) {
  if (view) { scene.remove(view.root); disposeTree(view.root); }
  const b = w.b, root = new THREE.Group(); scene.add(root);
  root.add(buildBoardBase(b.cols, b.rows), buildToys(b.cols, b.rows, 3 + b.cols));
  const tiles = [];
  for (const tl of b.tiles) {
    if (tl.block != null) continue; // part of a 2x2 scenery block
    const g = buildTile(tl), c = centerOf(b, tl.i, tl.j); g.position.set(c.x, 0, c.z);
    if (tl.shape) g.userData.spin.rotation.y = tl.ang;
    else if (tl.deco) g.add(buildDeco(tl.deco, tl.idx * 31 + 7));
    if (tl.kind === 'station') { const s = buildStation(tl.color); s.rotation.y = spinAngle(tl); g.add(s); g.userData.station = s; }
    if (tl.kind === 'depot') { const d = buildDepot(PAINTS[save.paint] || PAINTS[0]); d.rotation.y = spinAngle(tl, tl.dir); g.add(d); }
    if (tl.kind === 'portal') { const p = buildPortal(); p.rotation.y = spinAngle(tl); g.add(p); }
    root.add(g); tiles[tl.idx] = g;
  }
  for (const h of b.holes || []) {
    const blk = buildBlock(h.kind, h.seed), c0 = centerOf(b, h.i, h.j), c1 = centerOf(b, h.i + 1, h.j + 1);
    blk.position.set((c0.x + c1.x) / 2, 0, (c0.z + c1.z) / 2); root.add(blk);
  }
  root.updateMatrixWorld(true);
  const stations = w.stations.map((st) => { // platform slots in world space and a sign we can redraw with the patience ring
    const s = tiles[st.idx].userData.station, cv = document.createElement('canvas'); cv.width = cv.height = 128; drawBadge(cv.getContext('2d'), st.color);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; s.userData.sign.material.map = tex; s.userData.sign.material.userData.ownMap = true;
    const slots = [-0.74, -0.42, -0.1, 0.22].map((z) => s.localToWorld(new THREE.Vector3(0.68, 0.19, z)));
    return { s, cv, tex, slots, exit: s.localToWorld(new THREE.Vector3(1.5, 0.05, 0.2)), pips: -1, sign: s.userData.sign };
  });
  const trains = w.trains.map((tr) => {
    const paint = trainPaint(tr.k), loco = buildLoco(paint), cars = Array.from({ length: tr.cars }, () => buildCar(paint));
    root.add(loco, ...cars); return { loco, cars, paint };
  });
  const dots = w.trains.map((tr, k) => Array.from({ length: 28 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: DOT_COLORS[k], transparent: true, depthWrite: false, fog: false }));
    s.scale.setScalar(0.32); s.renderOrder = 4; s.visible = false; root.add(s); return s;
  }));
  const deads = w.trains.map(() => { const m = buildDeadMark(); m.visible = false; root.add(m); return m; });
  const cursor = buildCursor(); cursor.visible = false; root.add(cursor);
  const laneMat = new THREE.MeshBasicMaterial({ color: '#ff9a2e', transparent: true, opacity: 0, depthWrite: false });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), laneMat); lane.rotation.x = -Math.PI / 2; lane.position.y = 0.04; lane.visible = false; lane.renderOrder = 3; root.add(lane);
  view = { root, tiles, stations, trains, dots, deads, cursor, lane, pegs: new Map(), leaving: [], cows: new Map(), tops: new Map(), coins: new Map() };
}
const trainPaint = (k) => { const p = PAINTS[save.paint] ? save.paint : 0; return PAINTS[k === 0 ? p : (p + 1) % PAINTS.length]; };

// ================================================================ RULES (fixed-step simulation; the renderer only reads it)
const lvl = (id) => (W?.demo ? 0 : save.up[id] | 0);
const fare = () => CFG.fare + CFG.fareUp * lvl('lucky');
const patienceMax = () => CFG.patience * (1 + CFG.patienceUp * lvl('comfy'));
const brakeMax = () => CFG.brake + CFG.brakeUp * lvl('brake');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const rand = (r, [a, b]) => a + r() * (b - a);

let W = null; // the world of the current stop (or the menu demo)
let occupied = new Set();
function createWorld(def, mode = 'level') {
  const endless = mode === 'endless', demo = mode === 'demo', b = buildBoard(def);
  for (const tl of b.tiles) tl.ang = spinAngle(tl);
  const w = {
    def, mode, endless, demo, b, t: 0, trains: [], cows: [], tops: [], coins: [],
    stations: b.stations.map((idx) => ({ idx, tile: b.tiles[idx], color: b.tiles[idx].color, queue: [], pat: 0, full: false })),
    target: endless || demo ? Infinity : def.deliver, spawned: 0, delivered: 0, hearts: CFG.hearts, mishaps: 0, derails: 0, earned: 0, turns: 0,
    spawnT: 1.5, topT: 9, coinT: 3, thinkT: 0, nextId: 1, result: null, endT: 0, lastDeliver: -99, combo: 0,
    rnd: rngFor(def, mode), brake: { t: 0, on: false }, announced: {}, cowsWanted: def.cows | 0, whys: {},
  };
  w.brake.t = CFG.brake + CFG.brakeUp * (demo ? 0 : save.up.brake | 0);
  b.depots.forEach((di, k) => w.trains.push({ k, depot: di, cars: def.cars, riders: [], state: 'hold', t: CFG.hold, s: 0, dist: 0, v: 0, hist: [], pos: {}, carPos: [], served: -1, warned: false, waitT: 0, honkT: 0, drop: 0 }));
  return w;
}
function rngFor(def, mode) { // mulberry32 seeded per stop, so the bot replays the same night the same way
  let a = ((def.seed || 1) * 977 + (mode === 'endless' ? 13 : 0)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const speedNow = () => (W.endless ? ENDLESS.speed(W.t) : W.def.speed);
const everyNow = () => (W.endless ? ENDLESS.every(W.t) : W.def.every);
const stationAt = (tl) => W.stations.find((s) => s.idx === tl.idx);
const carOffset = (k) => CFG.carGap + k * CFG.carStep;
const live = (tr) => tr.state !== 'derail';

function placeAtDepot(tr) { // the loco at the depot centre, with a trail behind it so the carriages start on the rails
  const b = W.b, d = b.tiles[tr.depot];
  tr.seg = segment(b, d.i, d.j, -1, d.dir); tr.s = 0; tr.dist = 0; tr.served = -1; tr.warned = false; tr.hist = [];
  const back = [], pi = d.i - DX[d.dir], pj = d.j - DZ[d.dir], pt = tileAt(b, pi, pj), x = pt ? exitFor(pt, d.dir) : -1;
  if (x >= 0) back.push(segment(b, pi, pj, x, d.dir));
  back.push(segment(b, d.i, d.j, opp(d.dir), -1));
  let acc = -back.reduce((a, s) => a + s.len, 0);
  if (x < 0) { const c = centerOf(b, d.i, d.j); for (let u = 40; u > 10; u--) tr.hist.push({ x: c.x - DX[d.dir] * u * 0.1, z: c.z - DZ[d.dir] * u * 0.1, yaw: Math.atan2(DX[d.dir], DZ[d.dir]), d: -u * 0.1 }); }
  for (const s of back) { for (let u = 0; u < s.len; u += 0.1) { const p = segPos(s, u); tr.hist.push({ x: p.x, z: p.z, yaw: p.yaw, d: acc + u }); } acc += s.len; }
  tr.pos = segPos(tr.seg, 0); tr.hist.push({ x: tr.pos.x, z: tr.pos.z, yaw: tr.pos.yaw, d: 0 });
  poseCars(tr);
}
function sampleHist(tr, d, out) { // the point the loco passed at distance d (carriages ride on the loco's trail)
  const h = tr.hist; let lo = 0, hi = h.length - 1;
  if (d <= h[0].d) { Object.assign(out, h[0]); out.hidden = false; return out; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h[m].d <= d) lo = m; else hi = m; }
  const a = h[lo], c = h[hi], k = clamp((d - a.d) / Math.max(1e-6, c.d - a.d), 0, 1);
  if (Math.hypot(c.x - a.x, c.z - a.z) > 0.6) { Object.assign(out, k < 0.5 ? a : c); out.hidden = true; return out; } // through a tunnel
  out.x = lerp(a.x, c.x, k); out.z = lerp(a.z, c.z, k);
  let dy = c.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); out.yaw = a.yaw + dy * k; out.hidden = false;
  return out;
}
const inHill = (x, z) => W.b.portals.some((p) => { const c = centerOf(W.b, p.i, p.j); return Math.hypot(x - c.x, z - c.z) < 0.5; });
function poseCars(tr) {
  for (let k = 0; k < tr.cars; k++) {
    const p = sampleHist(tr, tr.dist - carOffset(k), tr.carPos[k] || (tr.carPos[k] = {}));
    if (inHill(p.x, p.z)) p.hidden = true;
  }
  tr.pos.hidden = inHill(tr.pos.x, tr.pos.z);
}
function computeOccupied() { // tiles under a train can't be turned
  occupied = new Set();
  for (const tr of W.trains) {
    if (!live(tr)) continue;
    occupied.add(tileAt(W.b, tr.seg.i, tr.seg.j).idx);
    for (const p of tr.carPos) { const tl = tileFromXZ(W.b, p.x, p.z); if (tl) occupied.add(tl.idx); }
  }
}
function nextTileOf(tr) { const sg = tr.seg; return sg.e < 0 ? null : tileAt(W.b, sg.i + DX[sg.e], sg.j + DZ[sg.e]); }

function stepTrain(tr, dt) {
  if (tr.state === 'derail') {
    tr.t += dt;
    if (tr.t > 1.9 && !W.trains.some((o) => o !== tr && live(o) && Math.hypot(o.pos.x - centerOf(W.b, W.b.tiles[tr.depot].i, W.b.tiles[tr.depot].j).x, o.pos.z - centerOf(W.b, W.b.tiles[tr.depot].i, W.b.tiles[tr.depot].j).z) < 3)) {
      placeAtDepot(tr); tr.state = 'hold'; tr.t = CFG.hold; tr.drop = 0.45; ev('respawn', tr);
    }
    return;
  }
  tr.drop = Math.max(0, tr.drop - dt);
  if (tr.state === 'hold') {
    if (tr.t === Infinity) { if (!traceAhead(W.b, tr.seg, 4).dead) tr.t = 0.6; } // the first stop waits until the track ahead is fixed
    else { tr.t -= dt; if (tr.t <= 0) { tr.state = 'run'; ev('go', tr); } }
    return;
  }
  const want = speedNow() * (W.brake.on ? CFG.brakeK : 1);
  if (tr.state === 'wait') {
    const nt = nextTileOf(tr);
    if (nt && cowOn(nt)) { tr.waitT += dt; tr.honkT -= dt; tr.v = 0; if (tr.honkT <= 0) { tr.honkT = 1.7; ev('honk', tr); } return; }
    tr.state = 'run'; tr.waitT = 0;
  }
  tr.v += (want - tr.v) * Math.min(1, dt * 5);
  let s = tr.s + tr.v * dt;
  while (s >= tr.seg.len) {
    const sg = tr.seg;
    if (sg.e === -1) { // the middle of a tunnel portal: come out of its twin
      const pt = tileAt(W.b, sg.i, sg.j), p = W.b.portals[pt.pair];
      s -= sg.len; tr.seg = segment(W.b, p.i, p.j, -1, tileAt(W.b, p.i, p.j).rot); tr.served = -1; ev('tunnel', tr); continue;
    }
    const ni = sg.i + DX[sg.e], nj = sg.j + DZ[sg.e], nt = tileAt(W.b, ni, nj), a = opp(sg.e), x = exitFor(nt, a);
    if (x === -1) { tr.dist += sg.len - tr.s; tr.s = sg.len; tr.pos = segPos(sg, sg.len); derail(tr, nt ? 'dead' : 'edge'); return; }
    if (cowOn(nt)) { tr.dist += sg.len - tr.s; tr.s = sg.len; tr.state = 'wait'; tr.honkT = 0.2; tr.waitT = 0; tr.v = 0; break; }
    s -= sg.len; tr.dist += sg.len - tr.s; tr.s = 0;
    tr.seg = segment(W.b, ni, nj, a, x === -2 ? -1 : x); tr.served = -1;
  }
  if (tr.state === 'run') { tr.dist += s - tr.s; tr.s = s; }
  tr.pos = segPos(tr.seg, tr.s);
  const here = tileAt(W.b, tr.seg.i, tr.seg.j);
  if (tr.served !== here.idx && tr.s >= tr.seg.len * 0.5) {
    tr.served = here.idx;
    if (here.kind === 'station') serve(tr, stationAt(here));
    const ci = W.coins.findIndex((c) => c.idx === here.idx); if (ci >= 0) { const c = W.coins.splice(ci, 1)[0]; W.earned += CFG.coinValue; ev('coin', c); }
  }
  const h = tr.hist, last = h[h.length - 1];
  if (!last || tr.dist - last.d > 0.05) h.push({ x: tr.pos.x, z: tr.pos.z, yaw: tr.pos.yaw, d: tr.dist });
  while (h.length > 2 && h[1].d < tr.dist - 4) h.shift();
  poseCars(tr);
}
function serve(tr, st) {
  const off = tr.riders.filter((p) => p.dest === st.color);
  if (off.length) {
    tr.riders = tr.riders.filter((p) => p.dest !== st.color);
    const n = off.length, gain = n * fare() + (n - 1) * CFG.multi;
    W.combo = W.t - W.lastDeliver < 7 ? W.combo + 1 : 1; W.lastDeliver = W.t;
    W.delivered += n; W.earned += gain;
    ev('deliver', { tr, st, off, gain });
    if (!W.endless && !W.demo && W.delivered >= W.target && !W.result) { W.result = 'win'; W.endT = 2; }
  }
  const on = [], cap = tr.cars * SEATS;
  while (tr.riders.length < cap && st.queue.length) { const p = st.queue.shift(); p.slot = on.length; tr.riders.push(p); on.push(p); }
  if (on.length) ev('board', { tr, st, on });
  if (st.queue.length < CFG.cap) st.full = false;
}
function mishap(why) {
  W.whys[why] = (W.whys[why] | 0) + 1;
  if (W.demo) return;
  W.mishaps++; W.hearts = Math.max(0, W.hearts - 1);
  if (W.hearts <= 0 && !W.result) { W.result = 'fail'; W.endT = 2; }
}
function derail(tr, why) {
  tr.state = 'derail'; tr.t = 0; W.derails++;
  tr.wreck = { x: tr.pos.x, z: tr.pos.z, yaw: tr.pos.yaw, v: Math.max(0.8, tr.v), side: W.rnd() < 0.5 ? -1 : 1, cars: tr.carPos.map((p) => ({ ...p })) };
  mishap(why); ev('derail', tr);
}
function collide() { // trains that touch both tip over
  for (const a of W.trains) for (const o of W.trains) {
    if (a === o || !live(a) || !live(o) || a.pos.hidden) continue;
    const parts = [o.pos, ...o.carPos].filter((p) => !p.hidden);
    if (parts.some((p) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < 0.85)) { derail(a, 'crash'); if (live(o)) derail(o, 'crash'); ev('crash', a); return; }
  }
}
function stepSpawn(dt) {
  W.spawnT -= dt;
  const waiting = W.stations.reduce((a, s) => a + s.queue.length, 0), riding = W.trains.reduce((a, tr) => a + tr.riders.length, 0);
  if (!waiting && !riding && W.spawnT > 0.8) W.spawnT = 0.8; // never leave the line empty for long
  if (W.spawnT > 0) return;
  W.spawnT = everyNow();
  if (W.spawned >= W.target || waiting >= W.def.maxWait) return;
  spawnPassenger();
}
function spawnPassenger(at) {
  const open = W.stations.filter((s) => s.queue.length < CFG.cap); if (!open.length) return;
  let st = at;
  if (!st) { let x = W.rnd() * open.reduce((a, s) => a + CFG.cap - s.queue.length + 0.5, 0); for (const s of open) { x -= CFG.cap - s.queue.length + 0.5; if (x <= 0) { st = s; break; } } st ||= open[0]; }
  const others = W.stations.filter((s) => s !== st), dest = others[(W.rnd() * others.length) | 0].color;
  st.queue.push({ id: W.nextId++, dest, seed: (W.rnd() * 1000) | 0, born: clock }); W.spawned++;
}
function stepPatience(dt) {
  for (const st of W.stations) {
    if (st.queue.length < CFG.cap) { st.full = false; continue; }
    if (!st.full) { st.full = true; st.pat = patienceMax(); ev('full', st); }
    st.pat -= dt;
    if (st.pat <= 0) { // two passengers give up and walk home; they will come back later
      const gone = st.queue.splice(0, 2); st.full = false;
      if (!W.endless && !W.demo) W.spawned -= gone.length;
      mishap('crowd'); ev('crowd', { st, gone });
    }
  }
}
function stepBrake(dt) {
  const B = W.brake, want = W.demo || BOT ? bot.brake : input.brake;
  const was = B.on; B.on = !!W.def.brake && want && B.t > 0.02 && W.trains.some((tr) => tr.state === 'run');
  if (B.on) B.t = Math.max(0, B.t - dt); else B.t = Math.min(brakeMax(), B.t + dt * CFG.brakeRefill);
  if (B.on && !was) { ev('brake'); tipEvent('brake'); }
}

function rotateTile(tl, dir = 1, by = 'player') {
  if (!tl?.shape || !W) return false;
  if (!turnable(tl)) { if (by === 'player') { tl.wiggle = 1; ev('blocked', tl); } return false; }
  if (occupied.has(tl.idx)) { if (by === 'player') { tl.wiggle = 1; ev('blocked', tl); } return false; }
  tl.rot = (tl.rot + dir + 4) & 3; tl.ang -= dir * (Math.PI / 2); tl.bump = 1;
  if (by === 'player') { W.turns++; tipEvent('turn'); }
  ev('turn', { tl, by });
  return true;
}

// ================================================================ HAZARDS (cows, spinning tops, coins; the Endless Line's schedule)
function cowOn(tl) {
  if (!tl) return false;
  const c = centerOf(W.b, tl.i, tl.j);
  return W.cows.some((cw) => (cw.state === 'stand' || cw.state === 'walk') && cw.tile === tl.idx && Math.hypot(cw.x - c.x, cw.z - c.z) < 1.1);
}
function cowHome() { // a spot on the table just off the board
  const b = W.b, hw = (b.cols * TS) / 2 + 1.4, hd = (b.rows * TS) / 2 + 1.3, r = W.rnd;
  const side = (r() * 3) | 0; // never the near side: the cow walks in from behind or the sides
  if (side === 0) return { x: (r() - 0.5) * hw * 1.6, z: -hd };
  return { x: side === 1 ? -hw : hw, z: (r() - 0.5) * hd * 1.4 };
}
function addCow() { const h = cowHome(); W.cows.push({ id: W.nextId++, x: h.x, z: h.z, yaw: 0, home: h, state: 'home', t: 3 + W.rnd() * 4, tile: -1, walk: 0 }); }
function pickCowTile() {
  const runners = W.trains.filter((tr) => tr.state === 'run'); if (!runners.length) return null;
  const tr = runners[(W.rnd() * runners.length) | 0], ahead = traceAhead(W.b, tr.seg, 8).segs.slice(3, 7);
  const ok = ahead.map((s) => tileAt(W.b, s.i, s.j)).filter((tl) => tl.kind === 'track' && !occupied.has(tl.idx) && !W.cows.some((c) => c.tile === tl.idx));
  return ok.length ? ok[(W.rnd() * ok.length) | 0] : null;
}
function stepCows(dt) {
  if (W.cows.length < W.cowsWanted) addCow();
  for (const cw of W.cows) {
    cw.walk += dt;
    if (cw.state === 'home') {
      cw.t -= dt;
      if (cw.t <= 0) { const tl = pickCowTile(); if (tl) { const c = centerOf(W.b, tl.i, tl.j); cw.tile = tl.idx; cw.tx = c.x + (W.rnd() - 0.5) * 0.5; cw.tz = c.z + (W.rnd() - 0.5) * 0.5; cw.state = 'walk'; ev('cowIn', cw); } else cw.t = 1.5; }
      continue;
    }
    if (cw.state === 'stand') { cw.t -= dt; if (cw.t <= 0) { cw.state = 'leave'; cw.tx = cw.home.x; cw.tz = cw.home.z; } continue; }
    const sp = cw.state === 'shoo' ? CFG.cowRun : CFG.cowWalk, dx = cw.tx - cw.x, dz = cw.tz - cw.z, d = Math.hypot(dx, dz);
    if (d > 0.02) cw.yaw = Math.atan2(dx, dz);
    if (d <= sp * dt) {
      cw.x = cw.tx; cw.z = cw.tz;
      if (cw.state === 'walk') { cw.state = 'stand'; cw.t = rand(W.rnd, CFG.cowStand); cw.since = W.t; }
      else { const h = cowHome(); cw.home = h; cw.state = 'home'; cw.t = rand(W.rnd, CFG.cowEvery); cw.tile = -1; cw.x = h.x; cw.z = h.z; }
    } else { cw.x += (dx / d) * sp * dt; cw.z += (dz / d) * sp * dt; }
  }
}
function shooCow(cw) {
  if (!(cw.state === 'stand' || cw.state === 'walk')) return false;
  cw.state = 'shoo'; cw.tx = cw.home.x; cw.tz = cw.home.z; cw.tile = -1; ev('moo', cw); tipEvent('shoo'); return true;
}
const topsOn = () => !!W.def.tops || (W.endless && W.t > ENDLESS.topsAt);
function stepTops(dt) {
  if (topsOn() && !W.tops.length) { W.topT -= dt; if (W.topT <= 0) { spawnTop(); W.topT = rand(W.rnd, CFG.topEvery); } }
  const b = W.b, hw = (b.cols * TS) / 2, hd = (b.rows * TS) / 2;
  for (const tp of W.tops) {
    tp.spin += dt;
    if (tp.phase === 'warn') { tp.t -= dt; if (tp.t <= 0) { tp.phase = 'run'; ev('topGo', tp); } continue; }
    if (tp.hor) tp.x += tp.dir * CFG.topSpeed * dt; else tp.z += tp.dir * CFG.topSpeed * dt;
    const tl = tileFromXZ(b, tp.x, tp.z);
    if (tl && tl.idx !== tp.last) {
      const c = centerOf(b, tl.i, tl.j);
      if (Math.abs(tp.hor ? tp.x - c.x : tp.z - c.z) < 0.35) { tp.last = tl.idx; if (rotateTile(tl, 1 + ((W.rnd() * 2) | 0), 'top')) ev('knock', tl); }
    }
    if (Math.abs(tp.x) > hw + 2 || Math.abs(tp.z) > hd + 2) tp.done = true;
  }
  W.tops = W.tops.filter((tp) => !tp.done);
}
function spawnTop() {
  const b = W.b, r = W.rnd, hor = r() < 0.55, dir = r() < 0.5 ? 1 : -1, hw = (b.cols * TS) / 2, hd = (b.rows * TS) / 2;
  const line = hor ? (r() * b.rows) | 0 : (r() * b.cols) | 0, c = hor ? centerOf(b, 0, line) : centerOf(b, line, 0);
  W.tops.push({ id: W.nextId++, hor, dir, line, x: hor ? -dir * (hw + 1.2) : c.x, z: hor ? c.z : -dir * (hd + 1.2), phase: 'warn', t: CFG.topWarn, last: -1, spin: 0, seed: W.nextId });
  ev('topWarn');
}
const goldOn = () => !!W.def.gold;
function stepCoins(dt) {
  if (!goldOn()) return;
  W.coinT -= dt;
  if (W.coinT > 0 || W.coins.length >= 2) return;
  W.coinT = CFG.coinEvery;
  const pool = W.b.tiles.filter((tl) => tl.kind === 'track' && !occupied.has(tl.idx) && !W.coins.some((c) => c.idx === tl.idx));
  if (pool.length) { const tl = pool[(W.rnd() * pool.length) | 0], c = centerOf(W.b, tl.i, tl.j); W.coins.push({ id: W.nextId++, idx: tl.idx, x: c.x, z: c.z, born: clock }); }
}
function stepEndless() { // the Endless Line adds trouble as it goes on
  const on = (key, cond, msg) => { if (cond && !W.announced[key]) { W.announced[key] = 1; banner(t('endless'), t(msg)); playSfx('warn', 0.5); } };
  on('tops', W.t > ENDLESS.topsAt, 'hzTops');
  on('cows', W.t > ENDLESS.cowsAt, 'hzCows'); if (W.t > ENDLESS.cowsAt) W.cowsWanted = W.t > ENDLESS.cowsAt * 2 ? 2 : 1;
  on('fast', W.t > 180, 'hzFaster');
}

function think() { // ~8 times a second: the dead-end warning, and the bot's plan
  for (const tr of W.trains) {
    if (tr.state !== 'run') { tr.warned = false; continue; }
    const ah = traceAhead(W.b, tr.seg, 3); let d = tr.seg.len - tr.s;
    for (const s of ah.segs) d += s.len;
    const near = ah.dead && d < CFG.warnDist;
    if (near && !tr.warned) ev('warn', tr);
    tr.warned = near;
  }
  if (W.demo || BOT) botThink();
}
function step(dt) {
  if (!W || !(state === State.PLAYING || (state === State.MENU && W.demo))) return;
  W.t += dt;
  computeOccupied();
  stepBrake(dt);
  if (W.endless) stepEndless();
  stepSpawn(dt); stepPatience(dt); stepCoins(dt);
  for (const tr of W.trains) stepTrain(tr, dt);
  collide(); stepCows(dt); stepTops(dt);
  W.thinkT -= dt; if (W.thinkT <= 0) { W.thinkT = 0.12; think(); }
  if (W.result) { W.endT -= dt; if (W.endT <= 0 && state === State.PLAYING) endLevel(); }
  if (W.demo && W.delivered > 40) { W.delivered = 0; }
  if (state === State.PLAYING) updateTips(dt);
}

// ================================================================ BOT (menu demo, trailer, balance runs)
const bot = { brake: false };
function stationValue(tr, st) {
  const free = tr.cars * SEATS - tr.riders.length, home = tr.riders.filter((p) => p.dest === st.color).length;
  return home * 3 + Math.min(free, st.queue.length) * 1.2 + (st.full ? 2.5 : 0) + (st.queue.length && free ? 0.3 : 0);
}
function botThink() {
  bot.brake = false;
  const busy = new Map(); // tiles each train is on or about to use
  for (const tr of W.trains) {
    const set = new Set(); if (live(tr)) { set.add(tileAt(W.b, tr.seg.i, tr.seg.j).idx); for (const p of tr.carPos) { const tl = tileFromXZ(W.b, p.x, p.z); if (tl) set.add(tl.idx); } for (const s of traceAhead(W.b, tr.seg, 1).segs) set.add(tileAt(W.b, s.i, s.j).idx); }
    busy.set(tr, set);
  }
  let clicks = 0;
  const reserved = new Set();
  for (const tr of W.trains) {
    if (!live(tr)) { tr.plan = null; continue; }
    if (tr.state === 'wait') { const nt = nextTileOf(tr), cw = nt && W.cows.find((c) => c.tile === nt.idx); if (cw && tr.waitT > 0.4) shooCow(cw); continue; }
    const sg = tr.seg; if (sg.e < 0) continue;
    const others = W.trains.filter((o) => o !== tr && live(o)).map((o) => busy.get(o));
    const v = Math.max(0.3, tr.v || speedNow()), toNext = (sg.len - tr.s) / v;
    // keep the current plan while it still works: re-planning every think makes the bot dither between equal routes
    const nt = nextTileOf(tr); if (!nt) { tr.plan = null; continue; }
    if (tr.plan) { const k = tr.plan.findIndex((p) => p.idx === nt?.idx); tr.plan = k < 0 ? null : tr.plan.slice(k); }
    if (tr.plan && (tr.plan.length < 4 || W.t > tr.planT + 5 || (tr.target >= 0 && !tr.plan.some((p) => p.idx === tr.target)) || !planOk(tr, others))) tr.plan = null;
    if (!tr.plan) {
      const nodes = planRoutes(W.b, nt.i, nt.j, opp(sg.e), {
        fixedAt: (tl, depth) => occupied.has(tl.idx) || (depth > 2 && reserved.has(tl.idx)), blocked: (tl, depth) => depth <= 4 && others.some((s) => s.has(tl.idx)), maxDepth: 26,
      });
      if (!nodes.length) continue;
      const reach = new Map(), deepest = nodes.reduce((a, n) => (n.depth > a.depth ? n : a)); // how far each route can go on
      for (const n of nodes) for (let q = n; q; q = q.prev) { if ((reach.get(q) | 0) >= n.depth) break; reach.set(q, n.depth); }
      let best = null, bestS = 0;
      for (const n of nodes) {
        if (n.tile.kind !== 'station' || reach.get(n) < Math.min(deepest.depth, n.depth + 2)) continue; // only targets with a way out
        const val = stationValue(tr, stationAt(n.tile)); if (val <= 0) continue;
        const sc = (val / (n.depth + 3)) * (n.tile.idx === tr.target ? 2 : 1); if (sc > bestS) { bestS = sc; best = n; }
      }
      if (!best) best = deepest; // nothing to do: keep rolling
      tr.target = best.tile.kind === 'station' ? best.tile.idx : -1;
      let tail = best; // keep the line going past the target too: the deepest route that runs through it
      for (const n of nodes) { if (n.depth <= tail.depth) continue; for (let q = n.prev; q; q = q.prev) if (q === best) { tail = n; break; } }
      const path = []; for (let n = tail; n; n = n.prev) path.unshift(n);
      tr.plan = path.map((n) => ({ idx: n.tile.idx, rot: n.rot, a: n.a, e: n.e, depth: n.depth })); tr.planT = W.t;
    }
    const plan = tr.plan;
    for (const p of plan) reserved.add(p.idx); // the other train works around this whole route
    if (traceAhead(W.b, sg, 2).dead && W.def.brake && W.brake.t > 0.2) { const ah = traceAhead(W.b, sg, 2); let d = sg.len - tr.s; for (const q of ah.segs) d += q.len; if (d < 2.6) bot.brake = true; } // buy time
    for (let k = 0; k < plan.length && k < 4; k++) { const cw = W.cows.find((c) => c.state === 'stand' && c.tile === plan[k].idx); if (cw && W.t - cw.since > 0.7) shooCow(cw); } // shoo cows off the route
    // swivel the tiles on the way, nearest first: all at once for the very next tile, otherwise one click per think
    for (let k = 0; k < plan.length && k < 5; k++) {
      const p = plan[k], tl = W.b.tiles[p.idx]; if (p.rot == null || !turnable(tl) || occupied.has(tl.idx)) continue;
      if (maskOf(tl) === maskOf({ shape: tl.shape, rot: p.rot })) continue;
      const steps = (p.rot - tl.rot + 4) & 3, dir = steps === 3 ? -1 : 1;
      if (k === 0 && toNext < 0.45) { let g = 0; while (maskOf(tl) !== maskOf({ shape: tl.shape, rot: p.rot }) && g++ < 4) rotateTile(tl, dir, 'bot'); }
      else if (clicks < 2) { rotateTile(tl, dir, 'bot'); clicks++; }
      break;
    }
  }
}
function planOk(tr, others) { // can the train still follow its plan?
  for (let k = 0; k < tr.plan.length && k < 8; k++) {
    const p = tr.plan[k], tl = W.b.tiles[p.idx];
    if (k < 4 && others.some((s) => s.has(p.idx))) return false;
    if (tl.kind === 'portal') continue;
    if (p.rot != null) { if (occupied.has(p.idx) && maskOf(tl) !== maskOf({ shape: tl.shape, rot: p.rot })) return false; continue; }
    if (exitFor(tl, p.a) !== p.e) return false;
  }
  return true;
}

// ================================================================ FX (events -> sound, particles, pops)
const _w = new THREE.Vector3();
function ev(kind, o) {
  const demo = W?.demo, quiet = demo ? 0.25 : 1;
  switch (kind) {
    case 'turn': if (o.by === 'player') playSfx('turn', 2.4); else if (o.by === 'bot' && !demo) playSfx('turn', 1.1); break;
    case 'blocked': playSfx('blocked', 3.5); break;
    case 'go': playSfx('whistle', 0.3 * quiet); tipEvent('go'); break;
    case 'respawn': playSfx('whistle', 0.25 * quiet); break;
    case 'honk': playSfx('whistle', 0.22 * quiet, 0.9); if (!demo) { const nt = nextTileOf(o), cw = nt && W.cows.find((c) => c.tile === nt.idx); if (cw) pop(cw.x, 1.4, cw.z, t('moo'), 'moo'); } break;
    case 'board': if (!demo) playSfx('board', 0.7); for (const p of o.on) flyFromPlatform(p, o.st); break;
    case 'deliver': {
      playSfx('deliver', 2 * quiet); if (o.off.length > 1 || W.combo > 1) playSfx('combo', 0.4 * quiet);
      const sv = view?.stations[W.stations.indexOf(o.st)];
      if (sv) {
        const p = sv.slots[1]; confetti(p.x, 1.0, p.z, COLORS[o.st.color].hex, 22);
        if (!demo) { pop(p.x, 2.4, p.z, `+${o.gain}`, 'coin'); pulse('hudCoins'); pulse('hudPaxPill'); }
        for (const q of o.off) flyToPlatform(q, o.tr, o.st);
      }
      tipEvent('deliver');
      break;
    }
    case 'derail': {
      playSfx('derail', 0.7 * quiet); shake(demo ? 0.05 : 0.4);
      burst(o.wreck.x, 0.5, o.wreck.z, '#ffffff', 14, 2.2); burst(o.wreck.x, 0.4, o.wreck.z, '#ffcf4a', 10, 3, true);
      if (!demo) { pop(o.wreck.x, 1.8, o.wreck.z, t('derailed'), 'bad'); pulse('hudHearts'); }
      break;
    }
    case 'crash': if (!demo) pop(o.pos.x, 2.2, o.pos.z, t('crash'), 'bad'); break;
    case 'tunnel': playSfx('tunnel', 0.5 * quiet); break;
    case 'warn': if (!demo) playSfx('warn', 0.55); break;
    case 'full': if (!demo) { playSfx('grumble', 0.35); if (!save.tips.crowd && !(AUTOPLAY && !FORCE_TIPS) && !save.tipsOff && !tipState) startTips('crowd'); } break;
    case 'crowd': {
      const sv = view?.stations[W.stations.indexOf(o.st)];
      playSfx('grumble', 0.7 * quiet);
      if (sv && !demo) { pop(sv.slots[1].x, 2.2, sv.slots[1].z, t('grumble'), 'bad'); pulse('hudHearts'); shake(0.15); }
      break;
    }
    case 'moo': playSfx('moo', 0.25 * quiet); burst(o.x, 0.6, o.z, '#ffffff', 8, 1.6); break;
    case 'cowIn': if (!demo) playSfx('moo', 0.14, 1.15); break;
    case 'brake': if (!demo) playSfx('brake', 0.45); break;
    case 'coin': playSfx('coin', 0.7 * quiet); burst(o.x, 0.6, o.z, '#ffcf4a', 12, 2.2, true); if (!demo) { pop(o.x, 1.6, o.z, `+${CFG.coinValue}`, 'coin'); pulse('hudCoins'); } break;
    case 'topWarn': break;
    case 'topGo': playSfx('top', 0.4 * quiet); break;
    case 'knock': if (!demo) playSfx('knock', 0.45); { const c = centerOf(W.b, o.i, o.j); burst(c.x, 0.3, c.z, '#ffe2a8', 6, 1.6); } break;
    default:
  }
}

// passengers hopping between platform and carriage (pure view bookkeeping: positions are resolved every frame)
function flyFromPlatform(p, st) { if (SIMMING || !view) return; const sv = view.stations[W.stations.indexOf(st)]; p.fly = { from: sv.slots[Math.min(3, p.slot)].clone(), t0: clock, dur: 0.38 }; }
function flyToPlatform(p, tr, st) {
  if (SIMMING || !view) return;
  const m = view.pegs.get(p.id); const sv = view.stations[W.stations.indexOf(st)];
  view.leaving.push({ p, from: m ? m.position.clone() : sv.slots[0].clone(), to: sv.slots[(view.leaving.length + 1) % 4].clone(), exit: sv.exit.clone(), t0: clock });
}

const parts = [];
function particle(x, y, z, color, vx, vy, vz, life, size, grav = 0, grow = 0, add = false, map = null) {
  let p = parts.find((q) => !q.visible && q.userData.add === add);
  if (!p) {
    if (parts.length > 300) return;
    p = new THREE.Sprite(new THREE.SpriteMaterial({ map: add ? softTex() : map || puffTex(), transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }));
    p.userData.v = new THREE.Vector3(); p.userData.add = add; parts.push(p); scene.add(p);
  }
  p.material.color.set(color); p.position.set(x, y, z); p.userData.v.set(vx, vy, vz);
  Object.assign(p.userData, { life, max: life, size, grav, grow }); p.scale.setScalar(size); p.visible = true;
}
function burst(x, y, z, color, n, speed, add = false) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    particle(x, y, z, color, Math.cos(a) * s, 1.5 + Math.random() * 2, Math.sin(a) * s, 0.5 + Math.random() * 0.4, add ? 0.28 : 0.3, 6, 0, add);
  }
}
const CONFETTI = ['#ff5a4e', '#3f9bff', '#3fcf6e', '#b27bff', '#ffcf4a', '#ffffff'];
function confetti(x, y, z, color, n) {
  if (SIMMING) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 1.8;
    particle(x, y, z, i % 3 === 0 ? color : CONFETTI[(Math.random() * CONFETTI.length) | 0], Math.cos(a) * s, 2.5 + Math.random() * 2.5, Math.sin(a) * s, 0.9 + Math.random() * 0.5, 0.16, 5.5, 0, false, softTex());
  }
}
function updateParticles(dt) {
  for (const p of parts) {
    if (!p.visible) continue;
    const u = p.userData; u.life -= dt; if (u.life <= 0) { p.visible = false; continue; }
    u.v.y -= u.grav * dt; p.position.addScaledVector(u.v, dt); if (p.position.y < 0.05 && u.grav) { p.position.y = 0.05; u.v.y = 0; u.v.x *= 0.85; u.v.z *= 0.85; }
    const k = u.life / u.max; p.scale.setScalar(u.size * (1 + u.grow * (1 - k))); p.material.opacity = Math.min(1, k * 2) * (u.add ? 0.9 : 0.95);
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
    _v.copy(el._p); _v.y += el._t * 1.0; _v.project(camera);
    el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${Math.min(1, el._t * 6)})`;
    el.style.opacity = String(Math.min(1, (1.3 - el._t) * 3));
  }
}

// ================================================================ INPUT (tap a tile to swivel it; keys move a cursor; hold to brake)
const keys = new Set(), input = { mode: 'none', touch: false, brake: false, brakeKey: false, brakeBtn: false, ci: 0, cj: 0, hover: null, px: -1, py: -1 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const raycaster = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _ndc = new THREE.Vector2();
function screenToFloor(cx, cy, y = 0) {
  _ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); raycaster.setFromCamera(_ndc, camera); floor.constant = -y;
  return raycaster.ray.intersectPlane(floor, _hit) ? _hit : null;
}
function tapAt(cx, cy, dir) {
  if (!W || state !== State.PLAYING) return;
  const up = screenToFloor(cx, cy, 0.45); // cows first: a cow on the line is tapped, not the tile under it
  if (up) { const cw = W.cows.find((c) => (c.state === 'stand' || c.state === 'walk') && Math.hypot(c.x - up.x, c.z - up.z) < 0.85); if (cw) { shooCow(cw); return; } }
  const p = screenToFloor(cx, cy, 0); if (!p) return;
  const tl = tileFromXZ(W.b, p.x, p.z); if (tl) { input.ci = tl.i; input.cj = tl.j; rotateTile(tl, dir); }
}
function updateHover() {
  input.hover = null;
  if (!W || state !== State.PLAYING || input.px < 0 || input.touch) return;
  const p = screenToFloor(input.px, input.py, 0); if (p) input.hover = tileFromXZ(W.b, p.x, p.z);
}
const MOVE = { ArrowUp: [0, -1], KeyW: [0, -1], KeyZ: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyQ: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (state === State.PLAYING && MOVE[e.code] && W) {
    if (input.mode !== 'keys') { input.mode = 'keys'; placeKeyCursor(); }
    else { input.ci = clamp(input.ci + MOVE[e.code][0], 0, W.b.cols - 1); input.cj = clamp(input.cj + MOVE[e.code][1], 0, W.b.rows - 1); }
    return;
  }
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (state === State.PLAYING && W) {
    if (e.code === 'KeyE' || e.code === 'Enter') { if (input.mode !== 'keys') { input.mode = 'keys'; placeKeyCursor(); } rotateTile(tileAt(W.b, input.ci, input.cj), 1); }
    if (e.code === 'Space' || e.code === 'KeyB' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.brakeKey = true; syncBrake(); }
    if (e.code === 'KeyR') restartLevel();
  }
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU && !$('menu').hidden) $('btnPlay').click();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.GAMEOVER) (!$('btnNext').hidden ? $('btnNext') : $('btnRetry')).click();
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (['Space', 'KeyB', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { input.brakeKey = false; syncBrake(); } });
addEventListener('blur', () => { keys.clear(); input.brakeKey = input.brakeBtn = false; syncBrake(); });
function syncBrake() { input.brake = input.brakeKey || input.brakeBtn; }
function placeKeyCursor() { // start the keyboard cursor on the tile just ahead of the first train
  const tr = W.trains[0], nt = tr && nextTileOf(tr);
  if (nt) { input.ci = nt.i; input.cj = nt.j; } else { input.ci = W.b.cols >> 1; input.cj = W.b.rows >> 1; }
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio(); input.touch = e.pointerType !== 'mouse';
  if (state !== State.PLAYING) return;
  if (e.pointerType === 'mouse') input.mode = 'pointer';
  tapAt(e.clientX, e.clientY, e.button === 2 ? -1 : 1);
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { input.px = e.clientX; input.py = e.clientY; input.touch = false; if (input.mode === 'keys' && Math.abs(e.movementX) + Math.abs(e.movementY) > 3) input.mode = 'pointer'; } });
canvas.addEventListener('pointerleave', () => { input.px = -1; });
const brakeBtn = $('btnBrake');
brakeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); input.brakeBtn = true; syncBrake(); brakeBtn.setPointerCapture?.(e.pointerId); });
for (const evn of ['pointerup', 'pointercancel', 'lostpointercapture']) brakeBtn.addEventListener(evn, () => { input.brakeBtn = false; syncBrake(); });

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> GAMEOVER (results))
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, levelIndex = 0, camWant = 0, camBlend = 0, run = null;
const DEFAULT_SAVE = { v: 1, stars: [], best: [], coins: 0, up: { brake: 0, comfy: 0, lucky: 0 }, paints: [0], paint: 0, tips: {}, tipsOff: false, endlessBest: 0 };
let save = structuredClone(DEFAULT_SAVE);

function setState(s, panel = 'menu') {
  state = s;
  for (const id of ['menu', 'stopsPanel', 'toybox']) $(id).hidden = !(s === State.MENU && panel === id);
  $('paused').hidden = s !== State.PAUSED; $('results').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  $('btnBrake').hidden = !(s === State.PLAYING && W?.def.brake && !W.demo); hudCache = '';
  if (s !== State.PLAYING && s !== State.PAUSED) { $('tip').hidden = true; $('arrow').hidden = true; tipState = null; }
  if (s !== State.PLAYING) { input.brakeBtn = input.brakeKey = false; syncBrake(); }
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
const endlessUnlocked = () => (save.stars[4] & 1) > 0;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function nextLevelToPlay() { for (let i = 0; i < LEVELS.length; i++) if (!(save.stars[i] & 1)) return i; return LEVELS.length - 1; }

// ================================================================ UI
click('btnPlay', () => startLevel(nextLevelToPlay()));
click('btnStops', () => openStops());
click('btnToybox', () => openToybox());
click('btnEndless', () => { if (endlessUnlocked()) startEndless(); else toast(t('endlessLocked')); });
click('btnStopsBack', () => showMenu());
click('btnToyboxBack', () => showMenu());
click('btnPause', () => togglePause());
click('btnRestart', () => restartLevel());
click('btnResume', () => togglePause());
click('btnPauseRestart', () => restartLevel());
click('btnPauseStops', () => openStops());
click('btnQuit', () => showMenu());
click('btnReplay', () => restartLevel()); // replay: no ad (navigation-like, instant)
click('btnResStops', () => openStops());
click('btnResMenu', () => showMenu());
click('btnNext', () => { // the level end: the right moment for a midgame ad
  const n = levelIndex + 1;
  triggerMidgameAd(() => { if (n < LEVELS.length) startLevel(n); else { openStops(); toast(t('allDone')); } });
});
click('btnRetry', () => triggerMidgameAd(() => restartLevel())); // between two runs after a lost stop
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
  const n = nextLevelToPlay();
  $('playStop').textContent = t('stop', { n: n + 1 });
  $('menuStars').textContent = totalStars(); $('menuStarsMax').textContent = LEVELS.length * 3; $('menuCoins').textContent = save.coins;
  $('btnEndless').classList.toggle('locked', !endlessUnlocked());
  $('endlessInfo').textContent = endlessUnlocked() ? (save.endlessBest ? `${t('best')} ${save.endlessBest}` : '') : t('endlessLocked');
}
function openStops() {
  if (!W?.demo) startDemo();
  setState(State.MENU, 'stopsPanel'); camWant = 0;
  const grid = $('stopGrid'); grid.innerHTML = ''; const cur = nextLevelToPlay();
  LEVELS.forEach((def, i) => {
    const b = document.createElement('button'), open = unlocked(i), s = save.stars[i] | 0;
    b.className = (open ? '' : 'locked') + (i === cur ? ' current' : '');
    b.innerHTML = open ? `${i + 1}<small>${nm(def)}</small><span class="st">${[1, 2, 4].map((m) => `<i class="ico ico-star${s & m ? '' : ' off'}"></i>`).join('')}</span>`
      : `<i class="ico ico-lock"></i><small>${t('locked')}</small>`;
    if (open) b.onclick = () => { unlockAudio(); playSfx('click', 0.6); startLevel(i); };
    grid.appendChild(b);
  });
}
function openToybox() {
  setState(State.MENU, 'toybox'); camWant = 0;
  $('toyCoins').textContent = save.coins;
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
      if (save.coins < price) { toast(t('needCoins')); playSfx('blocked', 0.5); return; }
      save.coins -= price; save.up[u.id] = lv + 1; persist(); playSfx('unlock', 0.5); refreshMenu(); openToybox();
    };
    card.appendChild(btn); grid.appendChild(card);
  }
  const pg = $('paintGrid'); pg.innerHTML = '';
  PAINTS.forEach((p, i) => {
    const owned = save.paints.includes(i), inUse = save.paint === i, b = document.createElement('button');
    b.className = `paint${inUse ? ' on' : ''}`;
    b.innerHTML = `<span class="swatch" style="--a:${p.loco};--b:${p.car};--c:${p.trim}"></span><small>${inUse ? t('inUse') : owned ? t('use') : `<i class="ico ico-coin"></i>${CFG.paintPrice}`}</small>`;
    b.onclick = () => {
      unlockAudio();
      if (!owned) {
        if (save.coins < CFG.paintPrice) { toast(t('needCoins')); playSfx('blocked', 0.5); return; }
        save.coins -= CFG.paintPrice; save.paints.push(i); playSfx('unlock', 0.5);
      } else playSfx('click', 0.6);
      save.paint = i; persist(); refreshMenu(); if (W?.demo) startDemo(); openToybox();
    };
    pg.appendChild(b);
  });
}
function buildHudHearts() {
  const el = $('hudHearts'); el.innerHTML = '';
  for (let i = 0; i < CFG.hearts; i++) { const s = document.createElement('i'); s.className = 'ico ico-heart'; el.appendChild(s); }
}
let hudCache = '';
function updateHud() {
  if (!W || W.demo) return;
  const key = `${W.delivered}|${W.hearts}|${W.earned}|${state}`;
  if (key !== hudCache) {
    hudCache = key;
    $('hudPax').textContent = W.endless ? `${W.delivered}` : `${W.delivered}/${W.target}`;
    [...$('hudHearts').children].forEach((s, i) => s.classList.toggle('off', i >= W.hearts));
    $('hudCoinsN').textContent = W.earned;
  }
  if (W.def.brake) { const btn = $('btnBrake'); btn.style.setProperty('--k', String(W.brake.t / brakeMax())); btn.classList.toggle('on', W.brake.on); }
}
function pulse(id) { const el = $(id); if (!el) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
let bannerTimer = 0;
function banner(small, big) {
  if (SIMMING) return;
  const el = $('banner'); $('bannerSmall').textContent = small; $('bannerBig').textContent = big;
  el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ================================================================ TIPS (onboarding inside gameplay: a few words, an arrow, never a pause)
const TIPS = {
  first: [{ pic: 'tap', text: 'tipTurn', arrow: 'dead', until: 'go', time: 90 }, { pic: 'path', text: 'tipPath', time: 7 }, { pic: 'peg', text: 'tipRide', arrow: 'station', until: 'deliver', time: 45 }],
  path: [{ pic: 'dead', text: 'tipDead', arrow: 'dead', time: 8 }, { pic: 'tap', text: 'tipShort', time: 7 }],
  colors: [{ pic: 'badges', text: 'tipColors', time: 8 }],
  brake: [{ pic: 'brake', text: 'tipBrake', until: 'brake', time: 16 }],
  crowd: [{ pic: 'crowd', text: 'tipCrowd', arrow: 'full', time: 9 }],
  cow: [{ pic: 'cow', text: 'tipCow', arrow: 'cow', until: 'shoo', time: 40 }],
  cars: [{ pic: 'peg', text: 'tipCars', time: 7 }],
  tunnel: [{ pic: 'tunnel', text: 'tipTunnel', arrow: 'portal', time: 9 }],
  top: [{ pic: 'top', text: 'tipTop', time: 10 }],
  gold: [{ pic: 'coin', text: 'tipGold', arrow: 'coin', time: 8 }],
  twin: [{ pic: 'twin', text: 'tipTwin', time: 9 }],
};
const PIC = (name, bg = '') => `<span class="tip-pic"${bg ? ` style="background:${bg}"` : ''}><i class="ico ico-${name}"></i></span>`;
const PICS = {
  path: PIC('path'), peg: PIC('peg'), dead: PIC('dead', '#ffd9d4'), crowd: PIC('crowd', '#ffe2b0'), cow: PIC('cow'), tunnel: PIC('tunnel'),
  top: PIC('top', '#ffe2b0'), coin: PIC('coin'), twin: PIC('train'),
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
  const tapPic = isTouch ? '<span class="hand"></span>'
    : `<span class="mouse click"></span><span class="or">${t('or')}</span><span class="keys"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span><kbd class="solo">E</kbd>`;
  const brakePic = isTouch ? PIC('brake', '#ffd9d4') : `${PIC('brake', '#ffd9d4')}<kbd class="wide">Space</kbd>`;
  $('tipIcon').innerHTML = s.pic === 'tap' ? tapPic : s.pic === 'brake' ? brakePic : PICS[s.pic] || '';
  $('tipText').textContent = t(s.text); $('tip').hidden = false; $('tip').style.animation = 'none'; void $('tip').offsetWidth; $('tip').style.animation = '';
}
function tipEvent(kind) { if (tipState && TIPS[tipState.key][tipState.i]?.until === kind) nextTip(); }
const _a = new THREE.Vector3();
function tipAnchor(kind) {
  if (!W) return null;
  const tr = W.trains[0];
  if (kind === 'dead' && tr && live(tr)) { const ah = traceAhead(W.b, tr.seg, 8); if (ah.dead) { const tl = tileAt(W.b, ah.dead.i, ah.dead.j); if (tl) { const c = centerOf(W.b, tl.i, tl.j); return _a.set(c.x, 0.6, c.z); } return _a.set(ah.dead.x, 0.6, ah.dead.z); } }
  if (kind === 'station' && tr) {
    const want = tr.riders[0]?.dest; const st = W.stations.find((s) => s.color === want) || W.stations.find((s) => s.queue.length) || W.stations[0];
    const sv = view?.stations[W.stations.indexOf(st)]; if (sv) return _a.copy(sv.slots[1]).setY(2.2);
  }
  if (kind === 'full') { const st = W.stations.find((s) => s.full); const sv = st && view?.stations[W.stations.indexOf(st)]; if (sv) return _a.copy(sv.slots[1]).setY(2.4); }
  if (kind === 'cow') { const cw = W.cows.find((c) => c.state === 'stand' || c.state === 'walk'); if (cw && Math.abs(cw.x) < (W.b.cols * TS) / 2 + 0.5 && Math.abs(cw.z) < (W.b.rows * TS) / 2 + 0.5) return _a.set(cw.x, 1.0, cw.z); }
  if (kind === 'portal' && W.b.portals.length) { const p = W.b.portals[0], c = centerOf(W.b, p.i, p.j); return _a.set(c.x, 1.1, c.z); }
  if (kind === 'coin' && W.coins.length) return _a.set(W.coins[0].x, 0.7, W.coins[0].z);
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

// ================================================================ GAMEPLAY (stops, the Endless Line, results)
function enterWorld(w) {
  for (const p of parts) p.visible = false; // no smoke from the last board
  W = w; applyLight(W.def.light, Math.max(W.b.cols, W.b.rows) * TS);
  for (const tr of W.trains) placeAtDepot(tr);
  computeOccupied(); buildView(W); fitCameras(); hudCache = ''; input.mode = input.mode === 'keys' ? 'keys' : 'none';
  if (input.mode === 'keys') placeKeyCursor();
  // the first passenger waits at the first station ahead, so the very first pickup comes quickly
  const tr = W.trains[0], ah = traceAhead(W.b, tr.seg, 14), first = ah.segs.map((s) => tileAt(W.b, s.i, s.j)).find((tl) => tl.kind === 'station');
  spawnPassenger(first ? stationAt(first) : null);
  if (!CAPTURE) playMusic(W.def.light === 'sunset' ? ASSETS.music.sunset : ASSETS.music.day);
}
function startDemo() { enterWorld(createWorld(DEMO, 'demo')); camWant = 0; for (const tr of W.trains) tr.t = 0.5; }
function startLevel(i) {
  levelIndex = i; const def = LEVELS[i];
  enterWorld(createWorld(def, 'level'));
  if (def.hold && !(save.stars[i] & 1)) W.trains[0].t = Infinity; // the first stop waits for the player's first fix
  run = { gain: 0 }; buildHudHearts();
  $('hudStop').textContent = t('stop', { n: i + 1 }); $('hudName').textContent = nm(def);
  setState(State.PLAYING); camWant = 1; camBlend = Math.max(camBlend, 0);
  banner(t('stop', { n: i + 1 }), nm(def)); startTips(def.tip);
}
function startEndless() {
  levelIndex = -1;
  const def = { ...ENDLESS, seed: CAPTURE ? 777 : 1 + ((Math.random() * 1e6) | 0), every: 0, speed: 0 };
  enterWorld(createWorld(def, 'endless'));
  run = { gain: 0 }; buildHudHearts();
  $('hudStop').textContent = t('endless'); $('hudName').textContent = '';
  setState(State.PLAYING); camWant = 1;
  banner(t('endless'), save.endlessBest ? `${t('best')} ${save.endlessBest}` : t('tagline'));
}
function restartLevel() { if (levelIndex < 0) startEndless(); else startLevel(levelIndex); }
function endLevel() {
  const win = W.result === 'win', endless = W.endless;
  setState(State.GAMEOVER);
  const R = { stars: 0, gain: W.earned };
  $('resStars').hidden = endless || !win; $('resScore').hidden = !endless; $('resSub').hidden = true;
  $('btnNext').hidden = endless || !win; $('btnRetry').hidden = !(endless || !win); $('btnReplay').hidden = endless || !win;
  if (endless) {
    const isBest = W.delivered > save.endlessBest; if (isBest) { save.endlessBest = W.delivered; happytime(); }
    $('resTitle').textContent = t('endlessOver'); $('resScoreN').textContent = W.delivered; $('resBest').textContent = save.endlessBest; $('resNewBest').hidden = !isBest;
    playSfx(isBest ? 'done' : 'fail', isBest ? 0.45 : 1);
  } else if (win) {
    const def = LEVELS[levelIndex], bits = 1 | (W.mishaps === 0 ? 2 : 0) | (W.t <= def.par ? 4 : 0);
    R.stars = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1); R.gain += R.stars * CFG.starBonus;
    const firstClear = !(save.stars[levelIndex] & 1);
    save.stars[levelIndex] = (save.stars[levelIndex] | 0) | bits;
    if (!save.best[levelIndex] || W.t < save.best[levelIndex]) save.best[levelIndex] = Math.round(W.t * 10) / 10;
    if (firstClear && levelIndex === LEVELS.length - 1) happytime();
    $('resTitle').textContent = t('win'); $('starParLabel').textContent = t('starPar', { t: fmt(def.par) });
    [0, 1, 2].forEach((k) => $(`star${k}`).classList.remove('on'));
    [1, 2, 4].forEach((m, k) => { if (bits & m) setTimeout(() => { $(`star${k}`).classList.add('on'); playSfx('star', 0.6); }, 350 + k * 380); });
    playSfx('done', 0.45);
  } else {
    $('resTitle').textContent = t('lose'); $('resSub').textContent = t('loseSub'); $('resSub').hidden = false; playSfx('fail', 1);
  }
  save.coins += R.gain; run.gain = R.gain; persist(); refreshMenu();
  $('resCoins').textContent = R.gain;
  $('btnDouble').hidden = !(adsAvailable() && R.gain > 0);
}

// ================================================================ LOOP (fixed-step sim, then the view follows it)
let last = performance.now(), acc = 0;
const camGame = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, camMenu = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _c = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 300), _q = new THREE.Vector3();
function fitCameras() {
  if (!W) return;
  const aspect = innerWidth / innerHeight, hw = (W.b.cols * TS) / 2 + 0.7, hd = (W.b.rows * TS) / 2 + 0.7;
  _c.aspect = aspect; _c.fov = CFG.fov; _c.updateProjectionMatrix();
  const pts = [[-hw, 0, -hd], [hw, 0, -hd], [-hw, 0, hd], [hw, 0, hd], [-hw, 2, -hd + 0.6], [hw, 2, -hd + 0.6]];
  const dir = new THREE.Vector3(0, Math.sin(CFG.pitch), Math.cos(CFG.pitch));
  camGame.look.set(0, 0, 0.2);
  let lo = 6, hi = 140;
  for (let i = 0; i < 30; i++) { // smallest distance that keeps the whole board on screen, under the HUD
    const d = (lo + hi) / 2; _c.position.copy(camGame.look).addScaledVector(dir, d); _c.lookAt(camGame.look); _c.updateMatrixWorld();
    const ok = pts.every((p) => { _q.set(...p).project(_c); return Math.abs(_q.x) < 0.96 && _q.y < 0.8 && _q.y > -0.93; });
    if (ok) hi = d; else lo = d;
  }
  camGame.pos.copy(camGame.look).addScaledVector(dir, hi);
  const narrow = aspect < 1.25, big = Math.max(hw, hd);
  if (narrow) { camMenu.look.set(0, 0, hd * 0.2); camMenu.pos.set(-big * 0.3, big * 2.4 + 6, big * 2.1 + 10); }
  else { camMenu.look.set(-hw * 0.8, 0, -0.4); camMenu.pos.set(-hw * 1.1, big * 1.15 + 6, hd + big * 1.05 + 6); }
}
function advance(dt) {
  camBlend += (camWant - camBlend) * (1 - Math.exp(-dt * 2.8));
  if (state !== State.PAUSED) { acc += dt; while (acc >= STEP) { step(STEP); clock += STEP; acc -= STEP; } }
  updateParticles(dt);
}
const _lookNow = new THREE.Vector3();
function render(dt) {
  const k = ease(clamp(camBlend, 0, 1));
  const sway = (1 - k) * Math.sin(clock * 0.12) * 0.9;
  camera.position.lerpVectors(camMenu.pos, camGame.pos, k); camera.position.x += sway;
  _lookNow.lerpVectors(camMenu.look, camGame.look, k);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(_lookNow);
  if (!SIMMING) updateHover();
  syncView(dt);
  renderer.render(scene, camera);
  if (!SIMMING) { updateHud(); updatePops(dt); if (state === State.PLAYING) placeArrow(); }
}
const _seat = new THREE.Vector3(), _from = new THREE.Vector3();
function syncView(dt) {
  if (!W || !view) return;
  const time = clock, b = W.b;
  // tiles swivel smoothly to their rotation, hop when turned, wiggle when they can't turn
  for (const tl of b.tiles) {
    const g = view.tiles[tl.idx]; if (!g || !tl.shape) continue;
    const sp = g.userData.spin; sp.rotation.y += (tl.ang - sp.rotation.y) * Math.min(1, dt * 16);
    tl.bump = Math.max(0, (tl.bump || 0) - dt * 4.5); tl.wiggle = Math.max(0, (tl.wiggle || 0) - dt * 3.5);
    sp.position.y = Math.sin((tl.bump || 0) * Math.PI) * 0.16; if (tl.wiggle) sp.rotation.y += Math.sin(time * 50) * 0.07 * tl.wiggle;
  }
  // stations: waiting passengers hop, the sign grows a patience ring when the platform is full
  view.stations.forEach((sv, k) => {
    const st = W.stations[k], pips = st.full ? Math.max(0, Math.ceil((st.pat / patienceMax()) * 12)) : -1;
    if (pips !== sv.pips) { sv.pips = pips; drawBadge(sv.cv.getContext('2d'), st.color, pips); sv.tex.needsUpdate = true; }
    sv.sign.scale.setScalar(st.full ? 1.15 + 0.08 * Math.sin(time * 9) : 0.95);
  });
  // trains
  W.trains.forEach((tr, k) => {
    const tv = view.trains[k]; if (!tv) return;
    const moving = tr.state === 'run' ? tr.v : 0, L = tv.loco, U = L.userData;
    if (tr.state === 'derail') { poseWreck(tr, tv); return; }
    const lift = tr.drop > 0 ? tr.drop * 6 : 0;
    L.visible = !tr.pos.hidden; L.position.set(tr.pos.x, 0.02 + lift, tr.pos.z); L.rotation.set(0, tr.pos.yaw, 0);
    U.body.rotation.z = 0; U.body.position.y = moving ? Math.abs(Math.sin(time * 18)) * 0.015 : 0;
    for (const w of U.wheels) w.rotation.x += (moving * dt) / 0.16; U.key.rotation.z += dt * (moving ? 5 : 1);
    tv.cars.forEach((c, n) => {
      const p = tr.carPos[n]; c.visible = !!p && !p.hidden; if (!p) return;
      c.position.set(p.x, 0.02 + lift, p.z); c.rotation.set(0, p.yaw, 0); c.userData.body.rotation.z = 0;
      c.userData.body.position.y = moving ? Math.abs(Math.sin(time * 18 + n + 1)) * 0.012 : 0;
      for (const w of c.userData.wheels) w.rotation.x += (moving * dt) / 0.16;
    });
    if (!SIMMING && L.visible && (tr.state === 'run' || tr.state === 'hold')) { // chimney puffs
      tr.puff = (tr.puff || 0) - dt;
      if (tr.puff <= 0) {
        tr.puff = tr.state === 'run' ? 0.17 : 0.45; _w.copy(U.chimney); L.localToWorld(_w);
        particle(_w.x, _w.y, _w.z, '#ffffff', (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, 1.1, 0.28, -0.2, 1.8);
      }
    }
  });
  syncPegs(dt);
  syncPreview();
  // cows, tops, coins, the cursor
  syncSet(view.cows, W.cows, buildCow, (m, cw) => {
    m.position.set(cw.x, 0.02, cw.z); m.rotation.y = cw.yaw; const U = m.userData, walking = cw.state === 'walk' || cw.state === 'leave' || cw.state === 'shoo';
    const f = cw.state === 'shoo' ? 16 : 8; U.legs.forEach((l, i) => { l.rotation.x = walking ? Math.sin(time * f + (i % 2) * Math.PI + (i > 1 ? Math.PI : 0)) * 0.45 : 0; });
    U.head.rotation.x = walking ? 0 : Math.sin(time * 1.4 + cw.id) * 0.18 + 0.15; U.tail.rotation.z = Math.sin(time * 3 + cw.id) * 0.4;
    U.body.position.y = walking ? Math.abs(Math.sin(time * f)) * 0.03 : 0;
  });
  syncSet(view.tops, W.tops, (tp) => buildTop(tp.seed), (m, tp) => {
    m.position.set(tp.x, 0.05, tp.z); m.userData.spin.rotation.y = tp.spin * 22; m.rotation.z = Math.sin(tp.spin * 7) * 0.08; m.rotation.x = Math.cos(tp.spin * 7) * 0.08;
  });
  const tp = W.tops[0], lane = view.lane;
  lane.visible = !!tp;
  if (tp) {
    const c = tp.hor ? centerOf(b, 0, tp.line) : centerOf(b, tp.line, 0), L = (tp.hor ? b.cols : b.rows) * TS + 2;
    lane.position.set(tp.hor ? 0 : c.x, 0.05, tp.hor ? c.z : 0); lane.scale.set(tp.hor ? L : TS * 0.9, tp.hor ? TS * 0.9 : L, 1);
    lane.material.opacity = tp.phase === 'warn' ? 0.18 + 0.16 * Math.abs(Math.sin(time * 8)) : 0.14;
  }
  syncSet(view.coins, W.coins, () => buildCoin(), (m, c) => { const s = Math.min(1, (clock - c.born) * 4); m.position.set(c.x, 0.55 + Math.sin(time * 3 + c.id) * 0.08, c.z); m.rotation.y = time * 2.5; m.scale.setScalar(Math.max(0.01, s)); });
  const cur = view.cursor, ct = state === State.PLAYING && (input.mode === 'keys' ? tileAt(b, input.ci, input.cj) : input.hover);
  cur.visible = !!ct && (input.mode === 'keys' || turnable(ct));
  if (cur.visible) {
    const c = centerOf(b, ct.i, ct.j), bad = !turnable(ct) || occupied.has(ct.idx);
    cur.position.set(c.x, 0, c.z); cur.userData.mat.color.set(bad ? '#ff8a7a' : '#fff6c8'); cur.userData.mat.opacity = 0.6 + 0.3 * Math.sin(time * 6);
  }
  // sound beds
  if (!SIMMING) {
    const running = W.trains.some((tr) => tr.state === 'run' && tr.v > 0.2);
    setLoop('chug', running ? (W.demo ? 0.15 : 0.45) : 0, clamp(speedNow() / 1.3, 0.8, 1.35) * (W.brake.on ? 0.7 : 1));
    setLoop('room', 0.8);
  }
}
function syncSet(map, list, make, pose) { // keep one mesh per live object
  const seen = new Set();
  for (const o of list) {
    let m = map.get(o.id); if (!m) { m = make(o); view.root.add(m); map.set(o.id, m); }
    seen.add(o.id); pose(m, o);
  }
  for (const [id, m] of map) if (!seen.has(id)) { view.root.remove(m); disposeTree(m); map.delete(id); }
}
function poseWreck(tr, tv) { // the toy tips over, slides to a stop, then is lifted off the table
  const w = tr.wreck, k = Math.min(1, tr.t / 0.55), slide = w.v * 0.55 * (1 - (1 - k) * (1 - k)), lift = tr.t > 1.35 ? (tr.t - 1.35) * 9 : 0;
  const x = w.x + Math.sin(w.yaw) * slide, z = w.z + Math.cos(w.yaw) * slide, L = tv.loco;
  L.visible = true; L.position.set(x, 0.02 + Math.sin(k * Math.PI) * 0.25 + lift, z); L.rotation.set(0, w.yaw + w.side * k * 0.6, 0); L.userData.body.rotation.z = w.side * k * 1.45;
  tv.cars.forEach((c, n) => {
    const p = w.cars[n]; if (!p) return; const kk = Math.min(1, Math.max(0, (tr.t - 0.08 * (n + 1)) / 0.6));
    c.visible = !p.hidden; c.position.set(p.x + Math.sin(p.yaw) * slide * 0.6, 0.02 + Math.sin(kk * Math.PI) * 0.18 + lift, p.z + Math.cos(p.yaw) * slide * 0.6);
    c.rotation.set(0, p.yaw - w.side * kk * 0.5 * (n % 2 ? -1 : 1), 0); c.userData.body.rotation.z = -w.side * kk * 1.2 * (n % 2 ? -1 : 1);
  });
}
const PEG_SCALE = 1.2; // passengers read at 800x450
function syncPegs(dt) { // every passenger is one peg mesh, placed on its platform, in its seat, or mid-hop
  const want = new Map();
  W.stations.forEach((st, k) => st.queue.forEach((p, q) => want.set(p.id, { p, at: 'wait', k, q })));
  W.trains.forEach((tr, k) => tr.riders.forEach((p, r) => want.set(p.id, { p, at: 'ride', k, r })));
  for (const L of view.leaving) want.set(L.p.id, { p: L.p, at: 'leave', L });
  const time = clock;
  for (const [id, w] of want) {
    let m = view.pegs.get(id);
    if (!m) { m = buildPeg(w.p.dest, w.p.seed); view.root.add(m); view.pegs.set(id, m); m.userData.born = time; }
    const grow = Math.min(1, (time - m.userData.born) * 5) * PEG_SCALE;
    m.visible = true; m.scale.setScalar(Math.max(0.01, grow));
    if (w.at === 'wait') {
      const sv = view.stations[w.k], slot = sv.slots[Math.min(3, w.q)], st = W.stations[w.k];
      const hop = st.full ? Math.abs(Math.sin(time * 9 + id)) * 0.12 : Math.max(0, Math.sin(time * 3 + id * 1.7)) * 0.05;
      m.position.set(slot.x, slot.y + hop, slot.z); m.rotation.y = Math.sin(time * 1.5 + id) * 0.4 + (st.full ? Math.sin(time * 14 + id) * 0.25 : 0);
    } else if (w.at === 'ride') {
      const tr = W.trains[w.k], tv = view.trains[w.k], ci = Math.floor(w.r / SEATS), car = tv?.cars[ci];
      if (!car || !car.visible || tr.state === 'derail') { m.visible = tr.state !== 'derail' ? false : m.visible; if (tr.state === 'derail' && car) { car.updateMatrixWorld(); _seat.set(0, 0.44, -0.3 + (w.r % SEATS) * 0.3); car.userData.body.localToWorld(_seat); m.position.copy(_seat); } continue; }
      car.updateMatrixWorld(); _seat.copy(car.userData.seats[w.r % SEATS].position); car.userData.body.localToWorld(_seat);
      const f = w.p.fly;
      if (f && time - f.t0 < f.dur) { const k = (time - f.t0) / f.dur; m.position.lerpVectors(f.from, _seat, ease(k)); m.position.y += Math.sin(k * Math.PI) * 0.8; }
      else { m.position.copy(_seat); w.p.fly = null; }
      m.rotation.y = car.rotation.y;
    } else {
      const L = w.L, k = (time - L.t0) / 0.42;
      if (k < 1) { m.position.lerpVectors(L.from, L.to, ease(k)); m.position.y += Math.sin(k * Math.PI) * 0.8; }
      else { const k2 = Math.min(1, (k - 1) * 0.42 / 0.9); m.position.lerpVectors(L.to, L.exit, k2); m.position.y = L.to.y + Math.abs(Math.sin(k2 * 14)) * 0.1; m.rotation.y = Math.atan2(L.exit.x - L.to.x, L.exit.z - L.to.z); m.scale.setScalar(Math.max(0.01, (1 - Math.max(0, k2 - 0.7) / 0.3) * PEG_SCALE)); }
    }
  }
  for (const [id, m] of view.pegs) if (!want.has(id)) { view.root.remove(m); view.pegs.delete(id); }
  view.leaving = view.leaving.filter((L) => time - L.t0 < 0.42 + 0.9);
}
function syncPreview() { // glowing dots along the track ahead of each train, and a red cross where it runs out
  W.trains.forEach((tr, k) => {
    const dots = view.dots[k], dead = view.deads[k];
    const show = (tr.state === 'run' || tr.state === 'hold' || tr.state === 'wait') && !(W.demo && camBlend < 0.5);
    if (!show) { dots.forEach((d) => { d.visible = false; }); dead.visible = false; return; }
    const ah = traceAhead(W.b, tr.seg, 9), segs = [{ seg: tr.seg, from: tr.s }, ...ah.segs.map((s) => ({ seg: s, from: 0 }))];
    const gap = 0.5, flow = (clock * 1.4) % gap; let n = 0, along = 0;
    const p = {};
    for (const { seg, from } of segs) {
      let u = from + ((gap - ((along + flow) % gap)) % gap);
      for (; u < seg.len && n < dots.length; u += gap) {
        segPos(seg, u, p); const d = dots[n++], dist = along + (u - from);
        if (inHill(p.x, p.z)) { d.visible = false; continue; }
        d.visible = dist > 0.7; d.position.set(p.x, 0.2, p.z); d.material.opacity = clamp(1.1 - dist / 14, 0.2, 0.95); d.scale.setScalar(0.3);
      }
      along += seg.len - from;
      if (n >= dots.length) break;
    }
    for (; n < dots.length; n++) dots[n].visible = false;
    dead.visible = !!ah.dead && !(W.demo && camBlend < 0.5);
    if (ah.dead) { const near = along < CFG.warnDist + 1; dead.position.set(ah.dead.x, 0.45, ah.dead.z); dead.scale.setScalar(near ? 0.95 + 0.25 * Math.abs(Math.sin(clock * 9)) : 0.75); }
  });
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); fitCameras(); }
addEventListener('resize', resize);

// ================================================================ CAPTURE (press kit: frames, trailer, in-engine covers)
const COVER = { // a hand-staged afternoon: a full train rounding toward a busy station, a cow on the line behind it
  def: { name: { en: '', tr: '' }, light: 'noon', gen: { cols: 8, rows: 6, holes: 2, stations: 4, scramble: 0 }, seed: 4242, cars: 2, speed: 1, every: 99, maxWait: 9 },
  cams: { wide: [6.4, 5.6, 7.4, 40, 0.1], square: [6.6, 5, 8.6, 46, 0.12], tall: [5.6, 4.2, 11, 50, 0.08] }, // ahead, aside, height, fov, title room
};
function stageCover(kind) {
  for (const id of ['hud', 'menu', 'stopsPanel', 'toybox', 'paused', 'results', 'tip', 'arrow', 'banner', 'toast', 'btnBrake', 'pops']) $(id).hidden = true;
  state = State.BOOT;
  enterWorld(createWorld(COVER.def, 'demo')); W.demo = true;
  const tr = W.trains[0], b = W.b;
  for (let i = 0; i < 4000; i++) { // roll the train along the loop until a station is just ahead
    computeOccupied(); stepTrain(tr, STEP); if (tr.state === 'hold') tr.t = 0;
    const ah = traceAhead(b, tr.seg, 2).segs;
    if (i > 300 && ah.length === 2 && tileAt(b, ah[1].i, ah[1].j).kind === 'station' && tr.s > tr.seg.len * 0.5) break;
  }
  tr.riders = [0, 1, 2, 3, 1, 2].map((c, n) => ({ id: 9000 + n, dest: c, seed: n * 3 }));
  W.stations.forEach((st, k) => { st.queue = Array.from({ length: 3 }, (_, n) => ({ id: 9100 + k * 10 + n, dest: (st.color + 1 + n) % 4, seed: k + n * 5 })); });
  const behind = sampleHist(tr, tr.dist - 4.6, {}), ct = tileFromXZ(b, behind.x, behind.z);
  W.cows = [];
  if (ct) { const c = centerOf(b, ct.i, ct.j); W.cows.push({ id: 9300, x: c.x + 0.35, z: c.z + 0.3, yaw: 2.4, home: { x: 0, z: 0 }, state: 'stand', t: 99, tile: ct.idx, walk: 0 }); }
  const aspect = innerWidth / innerHeight, [ahead, aside, up, fov, lift] = COVER.cams[aspect < 0.9 ? 'tall' : aspect < 1.2 ? 'square' : 'wide'];
  const hx = Math.sin(tr.pos.yaw), hz = Math.cos(tr.pos.yaw);
  camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix();
  camera.position.set(tr.pos.x + hx * ahead - hz * aside, up, tr.pos.z + hz * ahead + hx * aside);
  _lookNow.set(tr.pos.x + hx * 1.4, 0.3, tr.pos.z + hz * 1.4); camera.lookAt(_lookNow);
  if (kind !== 'keyart') camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * lift, innerWidth, innerHeight);
  clock = 3; syncView(0); clock = 5; syncView(0.1); // let the passengers pop in
  view.dots.forEach((ds) => ds.forEach((d) => { d.visible = false; })); view.deads.forEach((d) => { d.visible = false; });
  const L = view.trains[0].loco; for (let i = 0; i < 6; i++) { _w.copy(L.userData.chimney); L.localToWorld(_w); particle(_w.x - hx * i * 0.3, _w.y + i * 0.24, _w.z - hz * i * 0.3, '#ffffff', 0, 0, 0, 1, 0.3 + i * 0.07); }
  renderer.render(scene, camera);
  camera.clearViewOffset(); camera.fov = CFG.fov; camera.updateProjectionMatrix();
}
function captureApi() {
  const capLevel = clamp((params.get('stop') | 0 || 9) - 1, 0, LEVELS.length - 1);
  window.__game = {
    start: () => startLevel(capLevel),
    frame: (dt = 1 / 30) => { advance(dt); render(dt); },
    skip: (sec) => { SIMMING = true; for (let s = 0; s < sec; s += STEP) { advance(STEP); if (state === State.GAMEOVER) startLevel(Math.min(LEVELS.length - 1, levelIndex + 1)); } SIMMING = false; },
    sim: (sec) => { SIMMING = true; const end = clock + sec; while (clock < end && state === State.PLAYING) advance(STEP); SIMMING = false; return window.__game.info(); },
    level: (i) => startLevel(i),
    endless: () => startEndless(),
    info: () => ({ state, stop: levelIndex + 1, t: W?.t, delivered: W?.delivered, target: W?.target, hearts: W?.hearts, mishaps: W?.mishaps, derails: W?.derails, result: W?.result, coins: save.coins, stars: totalStars(), whys: W?.whys, turns: W?.turns }),
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
  $('brakeKey').hidden = isTouch;
  resize(); startDemo();
  setState(State.MENU, 'menu'); refreshMenu(); camBlend = 0;
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  if (CAPTURE) { captureApi(); render(0); } // capture protocol (tools/capture.mjs): no rAF loop, the tool drives every frame
  else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
