// Bloomtide: single-file game. Sections: CONFIG, I18N, SDK, AUDIO, WORLD, VALLEY, PLANTS, FX, CLOUDS, INPUT, STATE, ECONOMY,
// GAMEPLAY, ONBOARDING, BOT, LOOP, COVER, BOOT.
// You are a little rain cloud over a dry valley: wherever it rains the ground turns green and flowers open. Blooms pay petals,
// petals buy wider rain, a faster breeze, helper clouds and thunder, and a valley in full bloom ends the season (prestige).
// Every model is procedural (one soft low-poly look); sounds load from ./assets/ with synthesized fallbacks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = 'bloomtide';
const STEP = 1 / 60; // fixed simulation step: identical behaviour at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = (CAPTURE && !params.has('nobot')) || params.has('autoplay'); // a bot plays by itself (trailer footage, balance tests)
const NO_TIPS = CAPTURE && !params.has('tips'); // capture mode hides onboarding unless ?tips=1 (to review it)
const CFG = {
  cols: 3, rows: 2, zoneW: 16, zoneH: 13, // the valley: 3 x 2 meadows of 16 x 13 one-metre cells
  cloudY: 4.4,
  rain: [1.6, 0.3], speed: [4.4, 0.42], // [base, per upgrade level]
  water: [0.85, 0.2],
  sproutValue: 0.4, bloomValue: 0.8, sproutRate: 0.01, bloomRate: 0.03, rareMult: 12, roots: 1.15,
  harvest: 1, ripeTime: 20, // full blooms ripen and glitter; raining on them again collects petals
  zoneCost: [0, 400, 3500, 15000, 50000, 150000], zoneMult: [1, 1.5, 2.2, 3.2, 4.6, 6.5], zoneBonus: 20, // full meadow: 20 s of income
  goal: [700, 820, 940, 1030], goalYear: 1.06, costSeason: 1.7, seedBonus: 0.08,
  helper: { radius: 0.62, water: 0.5, speed: 0.62 },
  thunder: { radius: [4.2, 0.55], cooldown: [30, 2.4], min: 12 },
  golden: { every: [34, 3.2], life: 16, value: 18 }, // value: seconds of income
  awayCap: 8 * 3600, awayRate: 0.5, awayMin: 120,
};
if (CAPTURE && params.get('cfg')) try { Object.assign(CFG, JSON.parse(params.get('cfg'))); } catch {} // balance experiments only
const UPGRADES = [ // cost = base * grow^level * costSeason^season
  { id: 'rain', icon: 'i-rain', base: 15, grow: 1.85, max: 14 },
  { id: 'wind', icon: 'i-wind', base: 20, grow: 1.9, max: 10 },
  { id: 'drops', icon: 'i-drop', base: 25, grow: 1.85, max: 15 },
  { id: 'roots', icon: 'i-roots', base: 40, grow: 1.9, max: 30 },
  { id: 'helper', icon: 'i-cloud', base: 400, grow: 3, max: 6, zone: 1 },
  { id: 'fly', icon: 'i-fly', base: 900, grow: 2.4, max: 8, zone: 2 },
  { id: 'thunder', icon: 'i-bolt', base: 1500, grow: 2.3, max: 8, zone: 2 },
];
for (const u of UPGRADES) Object.assign(u, CFG.ups?.[u.id]);
const ZONE_GRID = [[1, 0], [0, 0], [2, 0], [1, 1], [0, 1], [2, 1]]; // unlock order as [col, row]; row 0 is nearest the camera
const PONDS = { 1: [-2.5, 0.5], 3: [3, -0.5], 5: [-1, 0] }; // meadow -> pond centre offset from the meadow centre
const SFX_FILES = {
  pop: 'assets/audio/bloom_pop.mp3', petal: 'assets/audio/bloom_petal.mp3', butterfly: 'assets/audio/bloom_butterfly.mp3',
  season: 'assets/audio/bloom_season.mp3', helper: 'assets/audio/bloom_helper.mp3', zone: 'assets/audio/bloom_zone.mp3',
  thunder: 'assets/audio/thunder.mp3', unlock: 'assets/audio/unlock.mp3', upgrade: 'assets/audio/upgrade.mp3', goal: 'assets/audio/level_up.mp3',
  complete: 'assets/audio/quest_complete.mp3', rare: 'assets/audio/gate_good.mp3', golden: 'assets/audio/dash_gem.mp3',
  rain: 'assets/audio/bloom_rain_loop.mp3', birds: 'assets/audio/bloom_birds.mp3',
};
const MUSIC_FILES = { meadow: 'assets/audio/bgm_bloom_meadow.mp3', dusk: 'assets/audio/bgm_bloom_dusk.mp3' };
// per-file gain so every sound sits at a similar, comfortable loudness (measured with ffmpeg volumedetect)
const SFX_GAIN = { pop: 0.4, petal: 0.55, butterfly: 0.55, season: 0.8, helper: 1.5, zone: 1.7, thunder: 0.6, unlock: 0.55, upgrade: 0.45,
  goal: 0.42, complete: 1.0, rare: 0.6, golden: 1.5, rain: 9, birds: 6, click: 1, tip: 1, nope: 1 };

// Four seasons, each a full palette + plant set (sRGB hex). The valley starts dry every season.
const SEASONS = [
  { id: 'spring', icon: 'i-blossom', music: 'meadow', head: 'tulip', tree: 'round',
    sky: '#9fd3ff', horizon: '#fff1e8', fog: '#dcedf8', sun: '#fff1dc', sunI: 2.5, hemiSky: '#e8f3ff', hemiGnd: '#a08c6a', hemiI: 1.25,
    dry: ['#dcc596', '#c9ad7b', '#e8d6ad'], wet: '#94704f', sprout: '#b4dd73', grass: ['#79cf5f', '#5fbb4f', '#93db73'],
    locked: ['#a39a92', '#958c83'], hillDry: ['#c3b47e', '#b2a46e'], hillLush: ['#7cc861', '#64b552'],
    flowers: ['#ff8fb4', '#ffffff', '#c9a2ff', '#ffd84a', '#ff6f9c', '#ffb26b'], center: '#ffd23f', stem: '#4fa846',
    canopy: ['#ffb8d4', '#ffcade', '#ff9cc4'], hillTrees: ['#7fcf62', '#69bf55', '#ffb8d4', '#8bd46c'], bush: ['#5cb24c', '#6cc25a'],
    trunk: '#8a5a3b', rain: '#8ccaff', rare: '#ff5fd0', pond: '#5cb8ec' },
  { id: 'summer', icon: 'i-sun', music: 'meadow', head: 'daisy', tree: 'round',
    sky: '#86ccff', horizon: '#fff6d8', fog: '#d2eaf6', sun: '#fff5e0', sunI: 2.8, hemiSky: '#ecf7ff', hemiGnd: '#a89064', hemiI: 1.3,
    dry: ['#e5ca8c', '#d4b373', '#efdba8'], wet: '#986d46', sprout: '#a9d860', grass: ['#62c44c', '#4fae40', '#7ad35e'],
    locked: ['#a89d8d', '#9a8f80'], hillDry: ['#cdb878', '#bca86a'], hillLush: ['#5fbf4a', '#4aa83e'],
    flowers: ['#ffd23a', '#ff8c3a', '#ff5a5a', '#6fa8ff', '#ffffff', '#ff7fc0'], center: '#7a4a1e', stem: '#3f9a3a',
    canopy: ['#4fb24a', '#62c456', '#3f9e3e'], hillTrees: ['#4fb24a', '#3f9e3e', '#62c456', '#57b84c'], bush: ['#4aa640', '#5cb84e'],
    trunk: '#7d5234', rain: '#86c6ff', rare: '#ffb000', pond: '#45ade8' },
  { id: 'autumn', icon: 'i-leaf', music: 'dusk', head: 'aster', tree: 'round',
    sky: '#ffcf9f', horizon: '#ffeccc', fog: '#f3dcc2', sun: '#ffd6a0', sunI: 2.5, hemiSky: '#ffe9d2', hemiGnd: '#8a6a4a', hemiI: 1.2,
    dry: ['#cfb48a', '#bf9f73', '#dcc39b'], wet: '#85603f', sprout: '#c3c466', grass: ['#a9bb52', '#93a744', '#bfcd64'],
    locked: ['#9c9086', '#8f847a'], hillDry: ['#b8a274', '#a89266'], hillLush: ['#c49a45', '#a9893c'],
    flowers: ['#ff9a3d', '#d1456f', '#ffcf4a', '#9a7bff', '#ff6a3d'], center: '#5a3418', stem: '#6f8f36',
    canopy: ['#ff7a3d', '#f2a33a', '#e0503a', '#ffc14a'], hillTrees: ['#e0703a', '#f2a33a', '#c9502f', '#d9b040'], bush: ['#c9822f', '#b56a2a'],
    trunk: '#6e4a30', rain: '#a8d0f0', rare: '#ff3d6a', pond: '#4fa0d0' },
  { id: 'winter', icon: 'i-snow', music: 'dusk', head: 'bell', tree: 'pine', snow: true,
    sky: '#c7dcff', horizon: '#f6f2ff', fog: '#e4ebf8', sun: '#eef3ff', sunI: 2.3, hemiSky: '#eef4ff', hemiGnd: '#8f93a8', hemiI: 1.35,
    dry: ['#aaa5b6', '#9b96a9', '#b9b4c4'], wet: '#7b768f', sprout: '#d3e2f0', grass: ['#f3f8ff', '#e2ecf8', '#ffffff'],
    locked: ['#8f8c9c', '#84818f'], hillDry: ['#a3a2b4', '#9594a8'], hillLush: ['#dfe7f3', '#c9d6ea'],
    flowers: ['#9fd6ff', '#ffffff', '#d6c4ff', '#ff6a7a', '#7fc0ff'], center: '#fff1a8', stem: '#5f9a7a',
    canopy: ['#3f7f62', '#4a8c6c', '#356f56'], hillTrees: ['#3f7f62', '#4a8c6c', '#5d9a7c', '#356f56'], bush: ['#6a9c84', '#5d8f78'],
    trunk: '#6a5040', rain: '#ffffff', rare: '#7fe0ff', pond: '#bfe6ff' },
];

// ================================================================ I18N (English required; Turkish welcome)
const STRINGS = {
  en: {
    play: 'Play', continue: 'Continue', settings: 'Settings', paused: 'Paused', resume: 'Resume', menu: 'Menu', done: 'Done',
    music: 'Music', sound: 'Sound', graphics: 'Graphics', gfx_auto: 'Auto', gfx_high: 'High', gfx_low: 'Fast',
    privacy: 'Bloomtide has no accounts of its own. Your garden is saved on this device, and in your CrazyGames account when you are signed in. Nothing else is collected.',
    tagline: 'Rain on a dry valley and watch it bloom.', perSec: '/s', skipTips: 'Skip tips',
    welcomeBack: 'Welcome back!', awaySub: 'Your valley kept blooming while you were away.', doubleIt: 'Watch an ad: double it', collect: 'Collect',
    seedsWord: 'seeds', doubleSeeds: 'Watch an ad: double seeds', stay: 'Keep playing this season',
    adUnavailable: 'No ad available right now', doubled: 'Doubled!', needPetals: 'Not enough petals yet',
    seasons: ['Spring', 'Summer', 'Autumn', 'Winter'], year: 'Year {n}',
    goal: '{n} / {g} in full bloom', goalDone: 'The valley is in full bloom!', nextSeason: 'Next season',
    seasonEndTitle: '{s} in full bloom!', seasonEndSub: 'Start a new season: the valley dries out again, and your seeds make every petal worth more.',
    seedBonus: 'Seeds in total: {n} (+{p}% petals)', startSeason: 'Start {s}', seasonStart: '{s} · Year {n}', seasonStartSub: 'A dry valley waits for rain',
    up_rain: 'Wide Rain', up_wind: 'Breeze', up_drops: 'Big Drops', up_roots: 'Deep Roots', up_helper: 'Helper', up_fly: 'Butterflies', up_thunder: 'Thunder',
    upd_rain: 'Your rain covers a wider circle', upd_wind: 'Your cloud drifts faster', upd_drops: 'Rain soaks the ground faster',
    upd_roots: 'Every bloom gives more petals', upd_helper: 'A little cloud rains on its own', upd_fly: 'More butterflies, and golden ones more often',
    upd_thunder: 'A thunder burst makes a big circle bloom at once',
    lv: 'Lv {n}', max: 'Max', meadowN: 'Meadow {n}', unlock: 'Unlock',
    zones: ['Sunny Hollow', 'Clover Dell', 'Tulip Terrace', 'Willow Brook', 'Blossom Grove', 'Moonpetal Glade'],
    zoneAwakens: '{z} awakens!', zoneBloom: '{z} in full bloom!', zoneBonus: 'Meadow bonus +{n}',
    tip_move: 'Move your cloud', tip_moveTouch: 'Drag anywhere to move your cloud', tip_rain: 'Rain on the dry ground until it blooms',
    tip_buy: 'Spend petals on an upgrade', tip_zone: 'Unlock the next meadow', tip_thunder: 'Thunder makes a big circle bloom at once',
    tip_golden: 'Catch the golden butterfly!', tip_full: 'Keep raining: flowers in full bloom pay the most',
    tip_harvest: 'Glittering flowers are ripe: rain on them again to collect petals',
    ctl_move: 'Move', ctl_thunder: 'Thunder', ctl_pause: 'Pause', ctl_mouse: 'or hold the mouse', ctl_drag: 'Drag to move', ctl_tap: 'Tap to use thunder',
    golden: 'Golden butterfly!', rare: 'Rare bloom!', helperJoins: 'A helper cloud joins you!', garden: 'Garden', seedsStat: '{n} seeds',
  },
  tr: {
    play: 'Oyna', continue: 'Devam et', settings: 'Ayarlar', paused: 'Duraklatıldı', resume: 'Devam', menu: 'Menü', done: 'Tamam',
    music: 'Müzik', sound: 'Ses', graphics: 'Grafik', gfx_auto: 'Otomatik', gfx_high: 'Yüksek', gfx_low: 'Hızlı',
    privacy: 'Bloomtide\'ın kendi hesap sistemi yoktur. Bahçen bu cihazda, giriş yaptıysan CrazyGames hesabında da saklanır. Başka hiçbir veri toplanmaz.',
    tagline: 'Kurak bir vadiye yağmur yağdır, çiçek açışını izle.', perSec: '/sn', skipTips: 'İpuçlarını geç',
    welcomeBack: 'Tekrar hoş geldin!', awaySub: 'Sen yokken vadin çiçek açmaya devam etti.', doubleIt: 'Reklam izle: ikiye katla', collect: 'Topla',
    seedsWord: 'tohum', doubleSeeds: 'Reklam izle: tohumları ikiye katla', stay: 'Bu mevsimde devam et',
    adUnavailable: 'Şu anda reklam yok', doubled: 'İkiye katlandı!', needPetals: 'Henüz yeterli taç yaprağı yok',
    seasons: ['İlkbahar', 'Yaz', 'Sonbahar', 'Kış'], year: '{n}. Yıl',
    goal: '{n} / {g} tam çiçekte', goalDone: 'Vadi tam çiçekte!', nextSeason: 'Sonraki mevsim',
    seasonEndTitle: '{s} tam çiçekte!', seasonEndSub: 'Yeni bir mevsime başla: vadi yeniden kurur ve tohumların her taç yaprağını daha değerli yapar.',
    seedBonus: 'Toplam tohum: {n} (+%{p} taç yaprağı)', startSeason: '{s} başlasın', seasonStart: '{s} · {n}. Yıl', seasonStartSub: 'Kurak bir vadi yağmuru bekliyor',
    up_rain: 'Geniş Yağmur', up_wind: 'Meltem', up_drops: 'İri Damla', up_roots: 'Derin Kök', up_helper: 'Yardımcı', up_fly: 'Kelebekler', up_thunder: 'Yıldırım',
    upd_rain: 'Yağmurun daha geniş bir alana yağar', upd_wind: 'Bulutun daha hızlı süzülür', upd_drops: 'Yağmur toprağı daha çabuk ıslatır',
    upd_roots: 'Her çiçek daha çok taç yaprağı verir', upd_helper: 'Küçük bir bulut kendi kendine yağar', upd_fly: 'Daha çok kelebek, altın kelebekler daha sık',
    upd_thunder: 'Yıldırım geniş bir alanı bir anda çiçeklendirir',
    lv: 'Sv {n}', max: 'Maks', meadowN: '{n}. Çayır', unlock: 'Aç',
    zones: ['Güneşli Çukur', 'Yonca Vadisi', 'Lale Terası', 'Söğüt Deresi', 'Çiçek Korusu', 'Ay Yaprağı Açıklığı'],
    zoneAwakens: '{z} uyanıyor!', zoneBloom: '{z} tam çiçekte!', zoneBonus: 'Çayır ödülü +{n}',
    tip_move: 'Bulutunu hareket ettir', tip_moveTouch: 'Bulutunu hareket ettirmek için sürükle', tip_rain: 'Kuru toprağa çiçek açana kadar yağ',
    tip_buy: 'Taç yapraklarını bir geliştirmeye harca', tip_zone: 'Sonraki çayırı aç', tip_thunder: 'Yıldırım geniş bir alanı bir anda çiçeklendirir',
    tip_golden: 'Altın kelebeği yakala!', tip_full: 'Yağmaya devam et: tam açan çiçekler en çok kazandırır',
    tip_harvest: 'Parlayan çiçekler olgunlaştı: taç yaprağı toplamak için üstlerine yeniden yağ',
    ctl_move: 'Hareket', ctl_thunder: 'Yıldırım', ctl_pause: 'Duraklat', ctl_mouse: 'ya da fareyi basılı tut', ctl_drag: 'Hareket için sürükle', ctl_tap: 'Yıldırım için dokun',
    golden: 'Altın kelebek!', rare: 'Nadir çiçek!', helperJoins: 'Yardımcı bir bulut katıldı!', garden: 'Bahçe', seedsStat: '{n} tohum',
  },
};
let lang = 'en';
const t = (k, vars) => {
  let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;
  if (vars && typeof s === 'string') for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }
const seasonName = (s) => t('seasons')[s % 4];
const zoneName = (z) => t('zones')[z];

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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a valley in full bloom

// Midgame: only between seasons (the level end), never on navigation buttons. Mute on adStarted (not on request); always continue.
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

// ================================================================ AUDIO (Web Audio SFX + loops with synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  click: ['triangle', 880, 660, 0.06, 0.12], tip: ['sine', 660, 1320, 0.16, 0.14], nope: ['triangle', 300, 200, 0.14, 0.12],
  pop: ['sine', 500, 900, 0.08, 0.1], petal: ['sine', 1500, 2200, 0.1, 0.07], butterfly: ['sine', 800, 2400, 0.5, 0.14],
  season: ['triangle', 330, 990, 1.2, 0.16], helper: ['sine', 300, 700, 0.3, 0.14], zone: ['triangle', 440, 880, 0.6, 0.16],
  thunder: ['sawtooth', 120, 40, 0.9, 0.22], unlock: ['triangle', 523, 1046, 0.4, 0.14], upgrade: ['square', 660, 990, 0.14, 0.08],
  goal: ['triangle', 392, 1568, 1.0, 0.16], complete: ['triangle', 523, 1568, 0.8, 0.15], rare: ['sine', 1200, 2400, 0.4, 0.12], golden: ['sine', 1800, 2600, 0.3, 0.1],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0, last: {}, loops: {} };

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
const MIN_GAP = { pop: 0.07, petal: 0.06, tip: 0.1, click: 0.03 };
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 14 || CAPTURE) return;
  const now = audio.ctx.currentTime;
  if (MIN_GAP[key] && now - (audio.last[key] || -9) < MIN_GAP[key]) return;
  audio.last[key] = now;
  const b = audio.buffers[key], g = audio.ctx.createGain(), v = vol * save.vol.sfx;
  if (v <= 0.001) return;
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.95 + Math.random() * 0.1); g.gain.value = v * (SFX_GAIN[key] ?? 1);
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function setLoop(key, level) { // rain + birdsong beds; level 0..1, faded
  if (!audio.ctx || CAPTURE) return;
  let L = audio.loops[key];
  if (!L) {
    const b = audio.buffers[key]; if (!b || level <= 0) return;
    const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain();
    s.buffer = b; s.loop = true; s.loopStart = 0.06; s.loopEnd = b.duration - 0.06; g.gain.value = 0;
    s.connect(g); g.connect(audio.master); s.start(0, 0.06); L = audio.loops[key] = { s, g, level: 0 };
  }
  if (Math.abs(L.level - level) < 0.01) return;
  L.level = level; L.g.gain.setTargetAtTime(level * (SFX_GAIN[key] ?? 1) * save.vol.sfx, audio.ctx.currentTime, 0.6);
}
function playMusic(key) {
  audio.wantMusic = true;
  if (key && key !== audio.musicKey) {
    if (audio.music) { audio.music.pause(); audio.music = null; }
    audio.musicKey = key;
    audio.music = new Audio(MUSIC_FILES[key]); audio.music.loop = true; audio.music.onerror = () => { audio.music = null; };
    setMusicVolume();
  }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function setMusicVolume() { if (audio.music) audio.music.volume = Math.min(1, (audio.musicKey === 'dusk' ? 0.26 : 0.32) * save.vol.music); }
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
}

// ================================================================ WORLD (renderer, lights, sky)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#dcedf8', 46, 95);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
const hemi = new THREE.HemisphereLight('#ffffff', '#a08c6a', 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.5); sun.castShadow = true; scene.add(sun, sun.target);
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.intensity = 0.7;
const uTime = { value: 0 };
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } }, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP;\nvoid main() { float h = clamp(vP.y * 1.8 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0);\n#include <colorspace_fragment>\n}',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), skyMat); sky.renderOrder = -1; scene.add(sky);
let shakeAmt = 0;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Graphics: High (shadows, sharp) or Fast (no shadows, 1x pixels, lighter rain). Auto picks Fast on small-memory devices and
// drops to Fast if play stays under ~30 fps. Capture mode always renders High.
let gfxLow = null, autoLow = !CAPTURE && !!navigator.deviceMemory && navigator.deviceMemory <= 4, fpsAcc = 0, fpsN = 0;
function applyGfx() {
  const low = !CAPTURE && (save.gfx === 'low' || (save.gfx === 'auto' && autoLow));
  if (low === gfxLow) return; gfxLow = low;
  renderer.setPixelRatio(low ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = !low; sun.castShadow = !low;
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  resize();
}
function watchFps(dt) { // Auto: a slow device switches itself to Fast once
  if (save.gfx !== 'auto' || autoLow || CAPTURE || state !== State.PLAYING) { fpsAcc = fpsN = 0; return; }
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 5) { if (fpsAcc / fpsN > 1 / 30) { autoLow = true; applyGfx(); } fpsAcc = fpsN = 0; }
}

// ================================================================ VALLEY (cells, ground mesh with per-vertex colours, hills, ponds, fences)
const W = CFG.cols * CFG.zoneW, H = CFG.rows * CFG.zoneH, N = W * H, MARGIN = 16, GW = W + MARGIN * 2, GH = H + MARGIN * 2, VW = GW + 1;
const ZONES = ZONE_GRID.length;
const FLOWER = 0, BUSH = 1, TREE = 2, RARE = 3, POND = 4;
const zoneOf = new Uint8Array(N), water = new Float32Array(N), ripe = new Float32Array(N), stage = new Uint8Array(N), kind = new Uint8Array(N);
const rnd = new Float32Array(N), patch = new Float32Array(N), cx = new Float32Array(N), cz = new Float32Array(N);
const zoneCells = new Array(ZONES).fill(0), zoneFull = new Array(ZONES).fill(0), zoneRect = [];
const open = new Array(ZONES).fill(false);
for (let z = 0; z < ZONES; z++) {
  const [c, r] = ZONE_GRID[z], x0 = c * CFG.zoneW, z0 = (CFG.rows - 1 - r) * CFG.zoneH;
  zoneRect.push({ x0: x0 - W / 2, x1: x0 + CFG.zoneW - W / 2, z0: z0 - H / 2, z1: z0 + CFG.zoneH - H / 2, cx: x0 + CFG.zoneW / 2 - W / 2, cz: z0 + CFG.zoneH / 2 - H / 2 });
}
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = j * W + i; cx[k] = i - W / 2 + 0.5; cz[k] = j - H / 2 + 0.5; rnd[k] = hash(i * 1.7 + 3, j * 2.3 + 7); patch[k] = noise2(i * 0.21, j * 0.21);
  zoneOf[k] = zoneRect.findIndex((r) => cx[k] > r.x0 && cx[k] < r.x1 && cz[k] > r.z0 && cz[k] < r.z1);
  zoneCells[zoneOf[k]]++;
}
const pondOf = new Int8Array(N).fill(-1), ponds = [];
for (const [zs, [ox, oz]] of Object.entries(PONDS)) {
  const z = +zs, r = zoneRect[z], p = { zone: z, x: r.cx + ox, z: r.cz + oz, r: 2.4, cells: [], full: 0, mesh: null, fill: 0, shown: 0 };
  for (let k = 0; k < N; k++) if (Math.hypot(cx[k] - p.x, cz[k] - p.z) < p.r) { pondOf[k] = ponds.length; p.cells.push(k); }
  ponds.push(p);
}
const cellAt = (x, z) => { const i = Math.floor(x + W / 2), j = Math.floor(z + H / 2); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };

let pal = null; // the current season's palette as THREE.Color objects
const C = (h) => new THREE.Color(h);
function buildPalette(s) {
  const p = SEASONS[s % 4], o = { raw: p };
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && v[0] === '#') o[k] = C(v);
    else if (Array.isArray(v) && typeof v[0] === 'string' && v[0][0] === '#') o[k] = v.map(C);
  }
  o.locked = [o.dry[0].clone().offsetHSL(0.02, -0.22, -0.13), o.dry[1].clone().offsetHSL(0.02, -0.22, -0.15)]; // locked meadows: the same soil, dimmer
  o.straw = o.dry[2].clone().offsetHSL(-0.01, 0.1, -0.02); // parched tufts that turn green when it rains
  return o;
}

// ground: one grid mesh over valley + hills; vertex colours average the four cells around each corner
const groundGeo = new THREE.BufferGeometry();
const gPos = new Float32Array(VW * (GH + 1) * 3), gCol = new Float32Array(VW * (GH + 1) * 3);
function heightAt(x, z) { // flat valley floor, ponds dip, hills rise outside (low in front so they never block the camera)
  const dx = Math.max(0, Math.abs(x) - W / 2), dzBack = Math.max(0, -z - H / 2), dzFront = Math.max(0, z - H / 2);
  const out = Math.hypot(dx, dzBack + dzFront);
  let h = (noise2(x * 0.7, z * 0.7) - 0.5) * 0.08;
  if (out > 0) {
    const tall = dzFront > 0 && dx < 4 ? 0.35 : 1, n = noise2(x * 0.12 + 40, z * 0.12 + 9);
    h += Math.pow(Math.min(1, out / 11), 1.6) * (3.2 + n * 4.5) * tall + noise2(x * 0.5, z * 0.5) * 0.4 * Math.min(1, out / 3);
  }
  for (const p of ponds) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 0.6) h -= 0.32 * Math.pow(1 - Math.min(1, d / (p.r + 0.6)), 0.7); }
  return h;
}
{
  const idx = [];
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
    const v = j * VW + i, x = i - GW / 2, z = j - GH / 2;
    gPos[v * 3] = x + (i > 0 && i < GW ? (hash(i, j) - 0.5) * 0.18 : 0); gPos[v * 3 + 1] = heightAt(x, z); gPos[v * 3 + 2] = z + (j > 0 && j < GH ? (hash(j, i) - 0.5) * 0.18 : 0);
  }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const a = j * VW + i, b = a + 1, c = a + VW, d = c + 1;
    if ((i + j) % 2) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  groundGeo.setIndex(idx); groundGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3)); groundGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
ground.receiveShadow = true; scene.add(ground);
const cellRGB = new Float32Array(N * 3), marginRGB = new Float32Array(GW * GH * 3);
const _c = new THREE.Color(), _c2 = new THREE.Color();
let lush = 0;
function cellColor(k) {
  const P = pal, n = rnd[k], pt = patch[k];
  if (!open[zoneOf[k]]) _c.copy(P.locked[0]).lerp(P.locked[1], pt);
  else {
    _c.copy(P.dry[0]).lerp(P.dry[1], pt); if (n > 0.86) _c.lerp(P.dry[2], 0.6);
    const w = water[k];
    if (pondOf[k] >= 0) { _c.lerp(P.wet, Math.min(1, w / 1.4)); }
    else if (w < 1) _c.lerp(P.wet, w * 0.75);
    else {
      _c2.copy(P.grass[0]).lerp(P.grass[1], pt); if (n > 0.82) _c2.lerp(P.grass[2], 0.7);
      if (w < 2) _c2.lerp(P.sprout, 0.7 * (2 - w));
      _c.copy(_c2);
    }
  }
  cellRGB[k * 3] = _c.r; cellRGB[k * 3 + 1] = _c.g; cellRGB[k * 3 + 2] = _c.b;
}
function marginColor(gi, gj) {
  const P = pal, x = gi - GW / 2 + 0.5, z = gj - GH / 2 + 0.5, n = noise2(x * 0.18, z * 0.18), hgt = heightAt(x, z);
  _c.copy(P.hillDry[0]).lerp(P.hillDry[1], n); _c2.copy(P.hillLush[0]).lerp(P.hillLush[1], n); _c.lerp(_c2, lush);
  _c.offsetHSL(0, 0, Math.min(0.08, hgt * 0.012) + (hash(gi, gj) - 0.5) * 0.03);
  const o = (gj * GW + gi) * 3; marginRGB[o] = _c.r; marginRGB[o + 1] = _c.g; marginRGB[o + 2] = _c.b;
}
const isValley = (gi, gj) => gi >= MARGIN && gj >= MARGIN && gi < MARGIN + W && gj < MARGIN + H;
function vertexColor(v) {
  const i = v % VW, j = (v / VW) | 0; let r = 0, g = 0, b = 0, n = 0;
  for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
    const gi = i + di, gj = j + dj; if (gi < 0 || gj < 0 || gi >= GW || gj >= GH) continue;
    if (isValley(gi, gj)) { const k = ((gj - MARGIN) * W + gi - MARGIN) * 3; r += cellRGB[k]; g += cellRGB[k + 1]; b += cellRGB[k + 2]; }
    else { const o = (gj * GW + gi) * 3; r += marginRGB[o]; g += marginRGB[o + 1]; b += marginRGB[o + 2]; }
    n++;
  }
  gCol[v * 3] = r / n; gCol[v * 3 + 1] = g / n; gCol[v * 3 + 2] = b / n;
}
const dirtyCells = new Set();
function markCell(k) { dirtyCells.add(k); }
function flushGround(all) {
  if (all) {
    for (let k = 0; k < N; k++) cellColor(k);
    for (let gj = 0; gj < GH; gj++) for (let gi = 0; gi < GW; gi++) if (!isValley(gi, gj)) marginColor(gi, gj);
    for (let v = 0; v < VW * (GH + 1); v++) vertexColor(v);
    dirtyCells.clear();
  } else {
    if (!dirtyCells.size) return;
    const verts = new Set();
    for (const k of dirtyCells) {
      cellColor(k); const gi = (k % W) + MARGIN, gj = ((k / W) | 0) + MARGIN;
      verts.add(gj * VW + gi); verts.add(gj * VW + gi + 1); verts.add((gj + 1) * VW + gi); verts.add((gj + 1) * VW + gi + 1);
    }
    for (const v of verts) vertexColor(v);
    dirtyCells.clear();
  }
  groundGeo.attributes.color.needsUpdate = true;
}
function refreshHills() { // the surrounding hills turn lush as the season's goal fills
  for (let gj = 0; gj < GH; gj++) for (let gi = 0; gi < GW; gi++) if (!isValley(gi, gj)) marginColor(gi, gj);
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
    const inside = i > MARGIN && j > MARGIN && i < MARGIN + W && j < MARGIN + H;
    if (!inside) vertexColor(j * VW + i);
  }
  groundGeo.attributes.color.needsUpdate = true;
  colorHillTrees();
}

// ================================================================ PLANTS (instanced, wind sway in the vertex shader)
function sway(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
      vec3 ip = vec3(0.0);
      #endif
      float sw = sin(uTime * 1.7 + ip.x * 0.5 + ip.z * 0.33) + 0.45 * sin(uTime * 2.9 + ip.x * 1.3 - ip.z * 0.7);
      float hy = max(0.0, position.y);
      transformed.x += sw * ${amp.toFixed(3)} * hy * hy;
      transformed.z += sw * ${(amp * 0.45).toFixed(3)} * hy * hy;`);
  };
  mat.customProgramCacheKey = () => `sway${amp}`;
  return mat;
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true, ...o });
const MAT = {
  grass: sway(std({ color: '#ffffff' }), 0.35), stem: sway(std({}), 0.5), head: sway(std({ color: '#ffffff', side: THREE.DoubleSide }), 0.5),
  center: sway(std({}), 0.5), bush: sway(std({ color: '#ffffff' }), 0.06), trunk: std({}), canopy: sway(std({ color: '#ffffff' }), 0.03),
  rare: sway(std({ emissiveIntensity: 0.55, side: THREE.DoubleSide }), 0.3), twig: std({ color: '#a8835c' }), pebble: std({ color: '#ffffff' }),
  wood: std({ color: '#b0855a' }), pad: std({ color: '#4f9e48' }),
};
const tr = (g, x, y, z) => g.translate(x, y, z);
function grassGeo() {
  const parts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, r = 0.09 + (k % 2) * 0.06, h = 0.32 + (k % 3) * 0.09;
    const c = new THREE.ConeGeometry(0.05, h, 3); tr(c, 0, h / 2, 0); c.rotateZ((k % 2 ? 1 : -1) * 0.2); c.rotateY(a); tr(c, Math.cos(a) * r, 0, Math.sin(a) * r); parts.push(c);
  }
  return mergeGeometries(parts);
}
function stemGeo() {
  const s = new THREE.CylinderGeometry(0.022, 0.032, 0.6, 4); tr(s, 0, 0.3, 0);
  const l1 = new THREE.SphereGeometry(0.09, 5, 3); l1.scale(1, 0.22, 0.5); l1.rotateZ(0.5); tr(l1, 0.08, 0.2, 0);
  const l2 = new THREE.SphereGeometry(0.08, 5, 3); l2.scale(1, 0.22, 0.5); l2.rotateZ(-0.5); tr(l2, -0.07, 0.32, 0);
  return mergeGeometries([s, l1, l2]);
}
function petalRing(n, len, wid, lift, y, r0) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const p = new THREE.SphereGeometry(1, 6, 3); p.scale(wid, 0.03, len); tr(p, 0, 0, len * 0.9 + r0); p.rotateX(-lift); p.rotateY((k / n) * Math.PI * 2); tr(p, 0, y, 0); parts.push(p);
  }
  return mergeGeometries(parts);
}
function headGeo(type) {
  if (type === 'tulip') { const g = new THREE.LatheGeometry([[0, 0], [0.07, 0.01], [0.13, 0.09], [0.14, 0.2], [0.1, 0.3], [0.13, 0.33]].map(([x, y]) => new THREE.Vector2(x, y)), 6); tr(g, 0, 0.56, 0); return g; }
  if (type === 'daisy') return petalRing(9, 0.1, 0.045, 0.25, 0.6, 0.04);
  if (type === 'aster') return petalRing(14, 0.09, 0.025, 0.4, 0.6, 0.03);
  const g = new THREE.LatheGeometry([[0, 0.3], [0.08, 0.28], [0.13, 0.18], [0.14, 0.06], [0.1, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 6); tr(g, 0, 0.36, 0); return g; // bell (snowdrop)
}
function centerGeo(type) {
  const g = new THREE.SphereGeometry(type === 'tulip' ? 0.05 : 0.065, 6, 4); g.scale(1, 0.65, 1);
  tr(g, 0, type === 'tulip' ? 0.62 : type === 'bell' ? 0.68 : 0.61, 0); return g;
}
function bushGeo() {
  const a = new THREE.IcosahedronGeometry(0.42, 0); tr(a, 0, 0.36, 0);
  const b = new THREE.IcosahedronGeometry(0.32, 0); tr(b, 0.32, 0.26, 0.1);
  const c = new THREE.IcosahedronGeometry(0.3, 0); tr(c, -0.3, 0.25, -0.08);
  return mergeGeometries([a, b, c]);
}
function trunkGeo() { const g = new THREE.CylinderGeometry(0.09, 0.15, 1.1, 5); tr(g, 0, 0.55, 0); return g; }
function canopyGeo(type) {
  if (type === 'pine') {
    const parts = [[0.85, 1.0, 1.05], [0.65, 0.9, 1.6], [0.42, 0.8, 2.1]].map(([r, h, y]) => { const c = new THREE.ConeGeometry(r, h, 7); tr(c, 0, y, 0); return c; });
    return mergeGeometries(parts);
  }
  const a = new THREE.IcosahedronGeometry(0.78, 1); tr(a, 0, 1.55, 0);
  const b = new THREE.IcosahedronGeometry(0.55, 1); tr(b, 0.45, 1.25, 0.15);
  const c = new THREE.IcosahedronGeometry(0.5, 1); tr(c, -0.42, 1.3, -0.15);
  return mergeGeometries([a, b, c]);
}
function twigGeo() {
  const parts = [];
  for (let k = 0; k < 4; k++) { const c = new THREE.CylinderGeometry(0.012, 0.02, 0.32, 3); tr(c, 0, 0.16, 0); c.rotateZ(0.5 - k * 0.32); c.rotateY(k * 1.7); parts.push(c); }
  return mergeGeometries(parts);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function setInst(mesh, idx, x, y, z, ry, s, tx = 0, tz = 0, sy = s) {
  _p.set(x, y, z); _q.setFromEuler(_e.set(tx, ry, tz, 'XYZ')); _s.set(s, sy, s); _m.compose(_p, _q, _s); mesh.setMatrixAt(idx, _m);
}
function inst(geo, mat, count, shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count)); m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
  _m.makeScale(0, 0, 0); for (let i = 0; i < m.count; i++) m.setMatrixAt(i, _m);
  scene.add(m); return m;
}
// one plant layout per season (seeded, so a reload restores the same garden)
const P = { grass: null, stem: null, head: null, center: null, bush: null, trunk: null, canopy: null, rareStem: null, rareHead: null, twig: null, pebble: null, pad: null };
let flowerBase = [], bushBase = [], treeBase = [], rareBase = [], twigBase = [], grassBase = [];
const fStart = new Int32Array(N), fCount = new Uint8Array(N), bushIdx = new Int32Array(N), treeIdx = new Int32Array(N), rareIdx = new Int32Array(N), twigIdx = new Int32Array(N);
const growCur = new Float32Array(N), growVel = new Float32Array(N), growTarget = new Float32Array(N), active = new Set();
const dirtyMeshes = new Set();
function clearPlants() { for (const k of Object.keys(P)) if (P[k]) { scene.remove(P[k]); P[k].geometry.dispose(); P[k].dispose?.(); P[k] = null; } }
function buildPlants() {
  clearPlants();
  const R = rng(9137 + save.season * 7919), S = pal.raw;
  flowerBase = []; bushBase = []; treeBase = []; rareBase = []; twigBase = []; grassBase = [];
  fStart.fill(-1); fCount.fill(0); bushIdx.fill(-1); treeIdx.fill(-1); rareIdx.fill(-1); twigIdx.fill(-1);
  const rarePerZone = new Array(ZONES).fill(0), pebbles = [];
  for (let k = 0; k < N; k++) {
    const x = cx[k], z = cz[k];
    grassBase.push({ x: x + rand(-0.25, 0.25), z: z + rand(-0.25, 0.25), ry: R() * 6.3, s: 0.9 + R() * 0.5 });
    if (pondOf[k] >= 0) { kind[k] = POND; continue; }
    const r = R(); let kd = FLOWER;
    const nearTree = () => { for (const tb of treeBase) if (Math.hypot(tb.x - x, tb.z - z) < 2.6) return true; return false; };
    if (r < 0.05 && !nearTree()) kd = TREE;
    else if (r < 0.12) kd = BUSH;
    else if (r < 0.128 && rarePerZone[zoneOf[k]] < 2) { kd = RARE; rarePerZone[zoneOf[k]]++; }
    kind[k] = kd;
    if (kd === TREE) { treeIdx[k] = treeBase.length; treeBase.push({ x: x + rand(-0.2, 0.2), z: z + rand(-0.2, 0.2), ry: R() * 6.3, s: 0.9 + R() * 0.45, c: (R() * S.canopy.length) | 0 }); }
    if (kd === BUSH) { bushIdx[k] = bushBase.length; bushBase.push({ x: x + rand(-0.2, 0.2), z: z + rand(-0.2, 0.2), ry: R() * 6.3, s: 0.75 + R() * 0.45, c: (R() * 2) | 0 }); }
    if (kd === RARE) { rareIdx[k] = rareBase.length; rareBase.push({ x, z, ry: R() * 6.3, s: 1.7 }); }
    if (kd === FLOWER || kd === BUSH) {
      const n = kd === BUSH ? 1 : 1 + (R() < 0.6) + (R() < 0.25);
      fStart[k] = flowerBase.length; fCount[k] = n;
      const col = (R() * S.flowers.length) | 0; // one colour per cell reads as drifts of colour
      for (let f = 0; f < n; f++) {
        const a = R() * 6.3, d = n === 1 ? R() * 0.2 : 0.18 + R() * 0.2;
        flowerBase.push({ x: x + Math.cos(a) * d + (kd === BUSH ? 0.35 : 0), z: z + Math.sin(a) * d, ry: R() * 6.3, s: 0.8 + R() * 0.5, tx: rand(-0.18, 0.18), tz: rand(-0.18, 0.18), c: R() < 0.8 ? col : (R() * S.flowers.length) | 0 });
      }
    }
    if (R() < 0.07) { twigIdx[k] = twigBase.length; twigBase.push({ x: x + rand(-0.3, 0.3), z: z + rand(-0.3, 0.3), ry: R() * 6.3, s: 0.6 + R() * 0.35 }); }
    if (R() < 0.08) pebbles.push({ x: x + rand(-0.4, 0.4), z: z + rand(-0.4, 0.4), ry: R() * 6.3, s: 0.6 + R() * 0.9 });
  }
  const head = headGeo(S.head);
  P.grass = inst(grassGeo(), MAT.grass, N);
  P.stem = inst(stemGeo(), MAT.stem, flowerBase.length); MAT.stem.color.copy(pal.stem);
  P.head = inst(head, MAT.head, flowerBase.length);
  P.center = inst(centerGeo(S.head), MAT.center, flowerBase.length); MAT.center.color.copy(pal.center);
  P.bush = inst(bushGeo(), MAT.bush, bushBase.length, true);
  P.trunk = inst(trunkGeo(), MAT.trunk, treeBase.length, true); MAT.trunk.color.copy(pal.trunk);
  P.canopy = inst(canopyGeo(S.tree), MAT.canopy, treeBase.length, true);
  P.rareStem = inst(stemGeo(), MAT.stem, rareBase.length);
  P.rareHead = inst(head.clone().scale(1.25, 1.25, 1.25).translate(0, -0.16, 0), MAT.rare, rareBase.length); MAT.rare.color.copy(pal.rare); MAT.rare.emissive.copy(pal.rare);
  P.twig = inst(twigGeo(), MAT.twig, twigBase.length);
  P.pebble = inst(new THREE.DodecahedronGeometry(0.11, 0), MAT.pebble, pebbles.length);
  P.pad = inst(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 9), MAT.pad, ponds.length * 5);
  for (let k = 0; k < N; k++) tintGrass(k);
  flowerBase.forEach((f, i) => P.head.setColorAt(i, pal.flowers[f.c]));
  bushBase.forEach((b, i) => P.bush.setColorAt(i, pal.bush[b.c]));
  treeBase.forEach((b, i) => P.canopy.setColorAt(i, pal.canopy[b.c]));
  pebbles.forEach((b, i) => { setInst(P.pebble, i, b.x, 0.02, b.z, b.ry, b.s, 0, 0, b.s * 0.6); P.pebble.setColorAt(i, _c.copy(pal.dry[1]).offsetHSL(0, -0.15, -0.12 + hash(i, 3) * 0.1)); });
  for (const m of [P.grass, P.head, P.bush, P.canopy, P.pebble]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  P.pebble.instanceMatrix.needsUpdate = true;
  ponds.forEach((p, i) => { for (let k = 0; k < 5; k++) { const a = k * 1.3 + i, d = 0.6 + (k % 3) * 0.55; p.pads = p.pads || []; p.pads[k] = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, s: 0.7 + (k % 2) * 0.4 }; } });
  for (let k = 0; k < N; k++) { growTarget[k] = stage[k] === 2 ? 1 : stage[k] === 1 ? 0.55 : 0; growCur[k] = growTarget[k]; growVel[k] = 0; applyGrow(k); }
  active.clear(); flushMeshes();
}
function tintGrass(k) {
  if (stage[k] >= 1) _c.copy(pal.grass[0]).lerp(pal.grass[1], patch[k]).offsetHSL(0, 0, (rnd[k] - 0.5) * 0.08);
  else { _c.copy(pal.straw).offsetHSL(0, 0, (rnd[k] - 0.5) * 0.06); if (!open[zoneOf[k]]) _c.offsetHSL(0, -0.12, -0.04); }
  P.grass.setColorAt(k, _c); if (P.grass.instanceColor) P.grass.instanceColor.needsUpdate = true;
}
function applyGrow(k) {
  const g = growCur[k], gb = grassBase[k];
  if (kind[k] !== POND) { const u = clamp(g * 1.7, 0, 1.15), dry = u > 0 || rnd[k] > 0.55 ? 1 : 0; setInst(P.grass, k, gb.x, 0, gb.z, gb.ry, (0.6 + 0.45 * u) * gb.s * dry, 0, 0, (0.32 + 0.78 * u) * gb.s * dry); dirtyMeshes.add(P.grass); }
  if (fStart[k] >= 0) {
    for (let f = fStart[k]; f < fStart[k] + fCount[k]; f++) {
      const b = flowerBase[f], s = g * b.s, hs = g < 0.6 ? s * 0.8 : s;
      setInst(P.stem, f, b.x, 0, b.z, b.ry, s, b.tx, b.tz); setInst(P.head, f, b.x, 0, b.z, b.ry, hs, b.tx, b.tz, s); setInst(P.center, f, b.x, 0, b.z, b.ry, hs, b.tx, b.tz, s);
    }
    dirtyMeshes.add(P.stem); dirtyMeshes.add(P.head); dirtyMeshes.add(P.center);
  }
  if (treeIdx[k] >= 0) { const b = treeBase[treeIdx[k]], s = Math.pow(Math.max(0, g), 1.6) * b.s; setInst(P.trunk, treeIdx[k], b.x, 0, b.z, b.ry, s); setInst(P.canopy, treeIdx[k], b.x, 0, b.z, b.ry, s); dirtyMeshes.add(P.trunk); dirtyMeshes.add(P.canopy); }
  if (bushIdx[k] >= 0) { const b = bushBase[bushIdx[k]]; setInst(P.bush, bushIdx[k], b.x, 0, b.z, b.ry, g * b.s); dirtyMeshes.add(P.bush); }
  if (rareIdx[k] >= 0) { const b = rareBase[rareIdx[k]], s = Math.pow(Math.max(0, g), 1.2) * b.s; setInst(P.rareStem, rareIdx[k], b.x, 0, b.z, b.ry, s); setInst(P.rareHead, rareIdx[k], b.x, 0, b.z, b.ry, s); dirtyMeshes.add(P.rareStem); dirtyMeshes.add(P.rareHead); }
  if (twigIdx[k] >= 0) { const b = twigBase[twigIdx[k]]; setInst(P.twig, twigIdx[k], b.x, 0, b.z, b.ry, Math.max(0, 1 - g * 2.2) * b.s); dirtyMeshes.add(P.twig); }
}
function flushMeshes() { for (const m of dirtyMeshes) m.instanceMatrix.needsUpdate = true; dirtyMeshes.clear(); }
function setGrowTarget(k) { growTarget[k] = stage[k] === 2 ? 1 : stage[k] === 1 ? 0.55 : 0; active.add(k); }
function updateGrowth(dt) {
  for (const k of active) {
    growVel[k] += (growTarget[k] - growCur[k]) * 110 * dt; growVel[k] *= Math.exp(-dt * 10); growCur[k] += growVel[k] * dt;
    if (Math.abs(growTarget[k] - growCur[k]) < 0.003 && Math.abs(growVel[k]) < 0.02) { growCur[k] = growTarget[k]; growVel[k] = 0; active.delete(k); }
    applyGrow(k);
  }
  flushMeshes();
}
function settleGrowth() { for (const k of active) { growCur[k] = growTarget[k]; growVel[k] = 0; applyGrow(k); } active.clear(); flushMeshes(); }

// hills: static trees around the valley, coloured by season and lushness
let hillTrees = null, hillTrunks = null, hillTreeBase = [];
function buildHillTrees() {
  if (hillTrees) { scene.remove(hillTrees, hillTrunks); hillTrees.geometry.dispose(); hillTrees.dispose(); hillTrunks.geometry.dispose(); hillTrunks.dispose(); }
  const R = rng(4242), list = [];
  for (let tries = 0; list.length < 170 && tries < 4000; tries++) {
    const x = rand(-GW / 2 + 1, GW / 2 - 1), z = rand(-GH / 2 + 1, GH / 2 - 1), out = Math.max(Math.abs(x) - W / 2, -z - H / 2, z - H / 2);
    const front = z > H / 2 - 2 && Math.abs(x) < W / 2 + 4;
    if (out < 2.5 || (front && (out < 5 || R() < 0.5))) continue; // only small, far ones in front of the valley, where they could hide the flowers
    if (list.some((p) => Math.hypot(p.x - x, p.z - z) < 1.8)) continue;
    list.push({ x, z, y: heightAt(x, z) - 0.1, s: front ? 0.6 + R() * 0.3 : 0.9 + R() * 0.6 + Math.min(0.5, out * 0.04), ry: R() * 6.3, c: (R() * 4) | 0 });
  }
  hillTreeBase = list;
  hillTrunks = inst(trunkGeo(), MAT.trunk, list.length, true); hillTrees = inst(canopyGeo(pal.raw.tree), MAT.canopy, list.length, true);
  list.forEach((b, i) => { setInst(hillTrunks, i, b.x, b.y, b.z, b.ry, b.s); setInst(hillTrees, i, b.x, b.y, b.z, b.ry, b.s); });
  hillTrees.instanceMatrix.needsUpdate = hillTrunks.instanceMatrix.needsUpdate = true;
  colorHillTrees();
}
function colorHillTrees() {
  if (!hillTrees) return;
  hillTreeBase.forEach((b, i) => hillTrees.setColorAt(i, _c.copy(pal.hillDry[b.c % 2]).offsetHSL(0, -0.1, -0.08).lerp(pal.hillTrees[b.c], 0.25 + 0.75 * lush)));
  hillTrees.instanceColor.needsUpdate = true;
}

// ponds fill as their cells bloom; lily pads float once they are mostly full
const waterMat = new THREE.MeshStandardMaterial({ color: '#5cb8ec', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, emissive: '#1d5a80', emissiveIntensity: 0.25 });
const shoreMat = new THREE.MeshBasicMaterial({ color: '#e9f7ff', transparent: true, opacity: 0.55, depthWrite: false });
for (const p of ponds) {
  p.mesh = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.35, 48), waterMat); p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.set(p.x, -0.3, p.z); p.mesh.scale.setScalar(0.001);
  const shore = new THREE.Mesh(new THREE.RingGeometry(p.r + 0.2, p.r + 0.42, 48), shoreMat); shore.position.z = 0.004; p.mesh.add(shore); scene.add(p.mesh);
}
const pondTarget = (p) => (open[p.zone] ? p.cells.reduce((a, k) => a + Math.min(1, water[k] / 2), 0) / p.cells.length : 0);
function snapPonds() { for (const p of ponds) p.fill = pondTarget(p); updatePonds(0); }
function updatePonds(dt) {
  ponds.forEach((p, i) => {
    p.fill += (pondTarget(p) - p.fill) * Math.min(1, dt * 2);
    const f = p.fill; p.mesh.visible = f > 0.02; p.mesh.scale.setScalar(Math.max(0.001, Math.sqrt(f)));
    p.mesh.position.y = -0.22 + f * 0.25 + Math.sin(uTime.value * 1.3 + i) * 0.01;
    const show = clamp((f - 0.7) / 0.25, 0, 1);
    if (Math.abs(show - p.shown) > 0.01 || dt === 0) {
      p.shown = show;
      p.pads.forEach((d, k) => setInst(P.pad, i * 5 + k, d.x, p.mesh.position.y + 0.02, d.z, k, d.s * show));
      P.pad.instanceMatrix.needsUpdate = true;
    }
  });
}

// fence posts + rails along every border between an open and a locked meadow; a lock badge floats over the next meadow
const postMesh = inst((() => { const g = new THREE.BoxGeometry(0.13, 0.62, 0.13); tr(g, 0, 0.31, 0); return g; })(), MAT.wood, 260, true);
const railMesh = inst((() => { const g = new THREE.BoxGeometry(1, 0.07, 0.05); tr(g, 0, 0.44, 0); return g; })(), MAT.wood, 260);
function rebuildFences() {
  let n = 0, m = 0;
  for (let a = 0; a < ZONES; a++) for (let b = 0; b < ZONES; b++) {
    if (!open[a] || open[b]) continue;
    const A = zoneRect[a], B = zoneRect[b];
    if (A.x1 === B.x0 || A.x0 === B.x1) { // vertical border
      const x = A.x1 === B.x0 ? A.x1 : A.x0, z0 = Math.max(A.z0, B.z0), z1 = Math.min(A.z1, B.z1);
      if (z1 <= z0) continue;
      for (let z = z0; z <= z1 + 0.01 && n < 260; z += 1) { setInst(postMesh, n++, x, 0, z, 0, 1); if (z < z1 - 0.01 && m < 260) setInst(railMesh, m++, x, 0, z + 0.5, Math.PI / 2, 1); }
    }
    if (A.z1 === B.z0 || A.z0 === B.z1) {
      const z = A.z1 === B.z0 ? A.z1 : A.z0, x0 = Math.max(A.x0, B.x0), x1 = Math.min(A.x1, B.x1);
      if (x1 <= x0) continue;
      for (let x = x0; x <= x1 + 0.01 && n < 260; x += 1) { setInst(postMesh, n++, x, 0, z, 0, 1); if (x < x1 - 0.01 && m < 260) setInst(railMesh, m++, x + 0.5, 0, z, 0, 1); }
    }
  }
  _m.makeScale(0, 0, 0);
  for (let i = n; i < 260; i++) postMesh.setMatrixAt(i, _m);
  for (let i = m; i < 260; i++) railMesh.setMatrixAt(i, _m);
  postMesh.instanceMatrix.needsUpdate = railMesh.instanceMatrix.needsUpdate = true;
}
const PATH_LOCK = 'M7 10V8a5 5 0 0 1 10 0v2h1.5v11h-13V10zm2 0h6V8a3 3 0 0 0-6 0z';
const PATH_PETAL = 'M12 2c2.6 2.4 3.9 4.9 3.9 7.4 0 1.2-.3 2.3-.9 3.2 1-.4 2.1-.6 3.3-.5 2.4.2 4.2 1.5 5.4 3.9-2.4 1.6-4.8 2.1-7.2 1.4-1.1-.3-2-.9-2.8-1.6.4 1 .6 2.1.4 3.3-.3 2.4-1.7 4.1-4.1 5.2-1.4-2.5-1.7-4.9-.8-7.2.4-1 1-1.9 1.8-2.6-1 .4-2.1.5-3.2.3C5.4 14.4 3.7 13 2.6 10.6 5.1 9.2 7.5 9 9.8 9.9c.5.2 1 .5 1.4.8-.2-.5-.3-1-.3-1.6C10.9 6.6 11.3 4.3 12 2z';
const badges = [];
function badgeTexture(cost) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = 'rgba(60,40,80,.25)'; g.beginPath(); g.arc(128, 124, 104, 0, 7); g.fill();
  g.fillStyle = '#fffaf2'; g.beginPath(); g.arc(128, 116, 100, 0, 7); g.fill();
  g.save(); g.translate(128 - 60, 116 - 72); g.scale(5, 5); g.fillStyle = '#7a6c8c'; g.fill(new Path2D(PATH_LOCK)); g.restore();
  if (cost != null) {
    g.font = '400 54px Display, sans-serif'; const txt = fmt(cost), w = g.measureText(txt).width + 58;
    g.fillStyle = '#fffaf2'; g.beginPath(); g.roundRect(128 - w / 2, 226, w, 68, 34); g.fill();
    g.save(); g.translate(128 - w / 2 + 10, 236); g.scale(2, 2); g.fillStyle = '#ff7fa8'; g.fill(new Path2D(PATH_PETAL)); g.restore();
    g.fillStyle = '#c4436d'; g.textBaseline = 'middle'; g.fillText(txt, 128 - w / 2 + 56, 262);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function rebuildBadges() {
  for (const b of badges) { scene.remove(b); b.material.map.dispose(); b.material.dispose(); }
  badges.length = 0;
  const nz = nextZone();
  if (nz >= 0) { // only the next meadow carries a badge (the rest read as locked from the fence and the dim soil)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(zoneCost(nz)), transparent: true, depthWrite: false, fog: false }));
    const r = zoneRect[nz]; s.position.set(r.cx, 2.4, r.cz); s.scale.set(2.5, 2.5 * (300 / 256), 1); s.userData.zone = nz;
    scene.add(s); badges.push(s);
  }
}

// ================================================================ FX (two Points systems from one sprite atlas: soft dot, petal, streak, sparkle, ring, leaf, snowflake, heart)
const atlas = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128 + 64, ((i / 4) | 0) * 128 + 64); fn(); g.restore(); };
  cell(0, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); });
  cell(1, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -54); g.bezierCurveTo(40, -30, 36, 30, 0, 54); g.bezierCurveTo(-36, 30, -40, -30, 0, -54); g.fill(); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(-2, -40, 4, 80); });
  cell(2, () => { const gr = g.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = gr; g.fillRect(-4, -60, 8, 120); });
  cell(3, () => { g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? 12 : 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); });
  cell(4, () => { g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 48, 0, 7); g.stroke(); });
  cell(5, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -56); g.quadraticCurveTo(50, -10, 0, 56); g.quadraticCurveTo(-50, -10, 0, -56); g.fill(); g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -46); g.lineTo(0, 50); g.stroke(); });
  cell(6, () => { g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; for (let k = 0; k < 3; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-50, 0); g.lineTo(50, 0); g.stroke(); } });
  cell(7, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 46); g.bezierCurveTo(-70, -6, -30, -64, 0, -26); g.bezierCurveTo(30, -64, 70, -6, 0, 46); g.fill(); });
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; return tex;
})();
const SH = { DOT: 0, PETAL: 1, STREAK: 2, SPARK: 3, RING: 4, LEAF: 5, SNOW: 6 };
const fxUniforms = { map: { value: atlas }, uScale: { value: 400 } };
class FX {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap); this.shape = new Float32Array(cap); this.rot = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap); this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.spin = new Float32Array(cap); this.die = new Uint8Array(cap); this.floor = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1)); g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1));
    for (const a of Object.values(g.attributes)) a.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.ShaderMaterial({
      uniforms: fxUniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 col; attribute float size; attribute float shape; attribute float rot; uniform float uScale;
        varying vec4 vCol; varying float vShape; varying float vRot;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(256.0, size * uScale / -mv.z); gl_Position = projectionMatrix * mv; vCol = col; vShape = shape; vRot = rot; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vCol; varying float vShape; varying float vRot;
        void main() { vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
          vec2 uv = (p + vec2(mod(vShape, 4.0), floor(vShape / 4.0))) * vec2(0.25, 0.5); vec4 t = texture2D(map, uv);
          gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2; scene.add(this.points); this.geo = g;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, hex, a, shape, o = {}) {
    if (this.n >= this.cap) return;
    const i = this.n++, c = typeof hex === 'number' ? hex : 0xffffff;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = ((c >> 16) & 255) / 255; this.col[i * 4 + 1] = ((c >> 8) & 255) / 255; this.col[i * 4 + 2] = (c & 255) / 255; this.col[i * 4 + 3] = 0;
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.shape[i] = shape;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.spin[i] = o.spin || 0; this.rot[i] = o.rot ?? Math.random() * 6.3; this.die[i] = o.die || 0; this.floor[i] = o.floor ?? -99;
  }
  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    for (const a of [this.size, this.shape, this.rot, this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag, this.spin, this.die, this.floor]) a[to] = a[from];
  }
  update(dt) {
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0 || this.pos[i * 3 + 1] < this.floor[i]) {
        if (this.die[i] === 1) splash(this.pos[i * 3], this.pos[i * 3 + 2]);
        this.copy(--this.n, i); continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const u = 1 - this.life[i] / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * u; this.rot[i] += this.spin[i] * dt;
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, u * 8) * Math.min(1, (1 - u) * 3.5);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of Object.values(this.geo.attributes)) a.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}
const fx = new FX(2600, false), glow = new FX(700, true);
const hexOf = (c) => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c.getHex(THREE.SRGBColorSpace));
const fxBudget = () => (gfxLow ? 0.5 : 1);
function splash(x, z) { if (!gfxLow && Math.random() < 0.3) for (let i = 0; i < 2; i++) fx.spawn(x, 0.08, z, rand(-0.8, 0.8), rand(1.2, 2), rand(-0.8, 0.8), 0.28, 0.09, 0.05, 0xe4f4ff, 0.8, SH.DOT, { grav: 9 }); } // droplets spray up where rain lands
function burstPetals(x, z, colorHex, n = 7, up = 1) {
  n = Math.ceil(n * fxBudget());
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.3, s = rand(0.6, 1.8) * up;
    fx.spawn(x, 0.6, z, Math.cos(a) * s, rand(2.2, 4.2) * up, Math.sin(a) * s, rand(0.9, 1.4), 0.32, 0.22, colorHex, 1, SH.PETAL, { grav: 4.5, drag: 1.6, spin: rand(-6, 6), floor: 0.02 });
  }
}
function burstLeaves(x, z, n = 3) {
  n = Math.ceil(n * fxBudget());
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.3; fx.spawn(x, 0.25, z, Math.cos(a) * 1.1, rand(1.5, 2.6), Math.sin(a) * 1.1, 0.7, 0.24, 0.16, hexOf(pal.sprout), 1, SH.LEAF, { grav: 5, drag: 1.4, spin: rand(-5, 5), floor: 0.02 }); }
}
function sparkles(x, y, z, hex, n = 8, spread = 1, up = 1.5) {
  n = Math.ceil(n * fxBudget());
  for (let i = 0; i < n; i++) glow.spawn(x + rand(-spread, spread), y + rand(-0.3, 0.5), z + rand(-spread, spread), rand(-0.5, 0.5), rand(0.4, up), rand(-0.5, 0.5), rand(0.6, 1.2), rand(0.25, 0.45), 0.05, hex, 0.9, SH.SPARK, { drag: 1.2, spin: rand(-3, 3) });
}
// shockwave rings, lightning and the rainbow are meshes (too big for point sprites)
const rings = [];
for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.t = 0; scene.add(m); rings.push(m); }
function shockwave(x, z, r, color = '#fff6c8', life = 0.7) { const m = rings.find((q) => !q.visible) || rings[0]; m.visible = true; m.position.set(x, 0.12, z); m.material.color.set(color); Object.assign(m.userData, { t: 0, life, r }); }
function updateRings(dt) { for (const m of rings) { if (!m.visible) continue; const u = (m.userData.t += dt) / m.userData.life; if (u >= 1) { m.visible = false; continue; } m.scale.setScalar(0.3 + m.userData.r * (1 - Math.pow(1 - u, 3))); m.material.opacity = 0.85 * (1 - u); } }
const boltMat = new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat); bolt.visible = false; bolt.frustumCulled = false; bolt.userData.t = 0; scene.add(bolt);
function strikeBolt(x, y, z) {
  const pts = [], n = 9; let ox = 0;
  for (let i = 0; i <= n; i++) { const u = i / n; ox = i === 0 || i === n ? 0 : ox * 0.4 + rand(-0.55, 0.55); pts.push([x + ox, y * (1 - u), z + ox * 0.3]); }
  const pos = [];
  for (let i = 0; i < n; i++) { const [a, b] = [pts[i], pts[i + 1]], w0 = 0.22 * (1 - i / n) + 0.06, w1 = 0.22 * (1 - (i + 1) / n) + 0.06; pos.push(a[0] - w0, a[1], a[2], a[0] + w0, a[1], a[2], b[0] - w1, b[1], b[2], a[0] + w0, a[1], a[2], b[0] + w1, b[1], b[2], b[0] - w1, b[1], b[2]); }
  bolt.geometry.dispose(); bolt.geometry = new THREE.BufferGeometry(); bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bolt.visible = true; bolt.userData.t = 0;
}
function updateBolt(dt) { if (!bolt.visible) return; bolt.userData.t += dt; boltMat.opacity = bolt.userData.t > 0.35 ? 0 : (Math.sin(bolt.userData.t * 70) > -0.3 ? 1 : 0.25); if (bolt.userData.t > 0.35) bolt.visible = false; }
const rainbow = new THREE.Group(); rainbow.visible = false; rainbow.userData = { t: 0, life: 0 }; scene.add(rainbow);
['#ff6b6b', '#ffa94d', '#ffe066', '#8ce99a', '#74c0fc', '#9775fa'].forEach((c, i) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(7.2 - i * 0.34, 0.17, 6, 48, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  rainbow.add(m);
});
function showRainbow(x, z, life = 7) { rainbow.visible = true; rainbow.position.set(x, -0.6, z - 5); Object.assign(rainbow.userData, { t: 0, life }); }
function updateRainbow(dt) {
  if (!rainbow.visible) return;
  const u = (rainbow.userData.t += dt) / rainbow.userData.life; if (u >= 1) { rainbow.visible = false; return; }
  const a = 0.55 * Math.min(1, u * 5) * Math.min(1, (1 - u) * 3); for (const m of rainbow.children) m.material.opacity = a;
}
// a soft disc under every cloud shows where it rains
const discTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 10, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(0.82, 'rgba(255,255,255,.4)'); gr.addColorStop(0.92, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
function rainDisc() { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: discTex, color: '#cfeaff', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 1; scene.add(m); return m; }

// butterflies: instanced wing pairs flapping over bloomed ground; golden ones are worth a burst of petals
const wingGeo = (() => {
  const s = new THREE.Shape(); s.moveTo(0, 0.02); s.bezierCurveTo(0.2, 0.32, 0.46, 0.3, 0.42, 0.06); s.bezierCurveTo(0.4, -0.06, 0.3, -0.1, 0.36, -0.22); s.bezierCurveTo(0.3, -0.34, 0.1, -0.26, 0, -0.06);
  const g = new THREE.ShapeGeometry(s, 6); g.rotateX(-Math.PI / 2); return g;
})();
const wingMat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.15 });
const BF_MAX = 44;
const wingL = inst(wingGeo.clone().scale(-1, 1, 1), wingMat, BF_MAX), wingR = inst(wingGeo, wingMat, BF_MAX);
const butterflies = [];
for (let i = 0; i < BF_MAX; i++) butterflies.push({ on: false, x: 0, y: 1, z: 0, hx: 0, hz: 0, ph: Math.random() * 6, sp: rand(0.8, 1.4), c: 0, life: 0 });
const goldMat = new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb000', emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 });
function makeGolden() { const g = new THREE.Group(); const l = new THREE.Mesh(wingGeo.clone().scale(-1, 1, 1), goldMat), r = new THREE.Mesh(wingGeo, goldMat); g.add(l, r); g.scale.setScalar(1.7); g.userData = { l, r }; g.visible = false; scene.add(g); return g; }
const goldens = [makeGolden(), makeGolden()].map((mesh) => ({ mesh, on: false, x: 0, z: 0, y: 1.2, hx: 0, hz: 0, t: 0, ph: 0 }));

// ================================================================ CLOUDS (a cute puffy cloud with a face; helpers are smaller copies)
const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e4ecff', emissiveIntensity: 0.42, roughness: 0.95 });
const faceMat = new THREE.MeshBasicMaterial({ color: '#3a2c4f' }), blushMat = new THREE.MeshBasicMaterial({ color: '#ffa6c4', transparent: true, opacity: 0.85 }), shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const puffGeo = new THREE.SphereGeometry(1, 22, 16);
function makeCloud(scale) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const puffs = [[0, 0, 0, 1.15], [0.98, -0.18, 0.08, 0.82], [-0.98, -0.15, 0.04, 0.88], [0.5, 0.52, -0.18, 0.78], [-0.45, 0.48, -0.05, 0.74], [0.05, 0.08, -0.7, 0.92], [1.62, -0.36, -0.12, 0.52], [-1.62, -0.32, -0.02, 0.58], [0.2, -0.42, 0.45, 0.7]];
  for (const [x, y, z, r] of puffs) { const m = new THREE.Mesh(puffGeo, cloudMat); m.position.set(x, y, z); m.scale.setScalar(r); m.castShadow = true; body.add(m); }
  const toward = new THREE.Vector3(0, 0.62, 0.78).normalize(), right = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3().crossVectors(toward, right).negate();
  const onFace = (dx, dy, out = 1.15) => toward.clone().add(right.clone().multiplyScalar(dx)).add(up.clone().multiplyScalar(dy)).normalize().multiplyScalar(out);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), faceMat); e.scale.set(1, 1.3, 0.5); e.position.copy(onFace(sx * 0.3, 0.04, 1.13)); e.lookAt(e.position.clone().multiplyScalar(2)); body.add(e); eyes.push(e);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), shineMat); sh.position.set(0.04, 0.05, 0.12); e.add(sh);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), blushMat); b.scale.set(1.2, 0.6, 0.3); b.position.copy(onFace(sx * 0.55, -0.16, 1.12)); b.lookAt(b.position.clone().multiplyScalar(2)); body.add(b);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 14, Math.PI), faceMat); mouth.position.copy(onFace(0, -0.15, 1.14)); mouth.lookAt(mouth.position.clone().multiplyScalar(2)); mouth.rotateZ(Math.PI); body.add(mouth);
  root.scale.setScalar(scale);
  return { root, body, eyes, blink: rand(1, 4), x: 0, z: 0, vx: 0, vz: 0, disc: rainDisc(), rainAcc: 0, ph: Math.random() * 6 };
}
const cloud = makeCloud(1); scene.add(cloud.root);
const helpers = [];
function addHelper() {
  const h = makeCloud(0.5); scene.add(h.root);
  Object.assign(h, { x: cloud.x + rand(-2, 2), z: cloud.z + rand(-2, 2), target: -1, retarget: 0 });
  helpers.push(h); return h;
}
function clearHelpers() { for (const h of helpers) { scene.remove(h.root, h.disc); } helpers.length = 0; }
function syncHelpers() { while (helpers.length < lv('helper')) addHelper(); }
function animateCloud(c, dt, radius, moving, big) {
  c.ph += dt;
  const bob = Math.sin(c.ph * 2.1) * 0.12;
  c.root.position.set(c.x, CFG.cloudY * (big ? 1 : 0.82) + bob, c.z);
  c.body.rotation.z += (clamp(-c.vx * 0.05, -0.25, 0.25) - c.body.rotation.z) * Math.min(1, dt * 6);
  c.body.rotation.x += (clamp(c.vz * 0.04, -0.2, 0.2) - c.body.rotation.x) * Math.min(1, dt * 6);
  const squash = 1 + Math.sin(c.ph * 4.2) * 0.025 + (moving ? 0.02 : 0); c.body.scale.set(squash, 2 - squash, squash);
  c.blink -= dt; const closed = c.blink < 0.12; if (c.blink < 0) c.blink = rand(2, 5);
  for (const e of c.eyes) e.scale.y = closed ? 0.25 : 1.3;
  c.disc.position.set(c.x, 0.05, c.z); c.disc.scale.setScalar(radius);
  c.disc.material.opacity = 0.42 + Math.sin(c.ph * 3) * 0.06;
}
function rainParticles(c, radius, dt) { // visual rain: streaks (snowflakes in winter) inside the rain circle
  const snow = pal.raw.snow, rate = Math.min(260, radius * radius * 26) * (gfxLow ? 0.45 : 1), h = c.root.position.y - 0.5 * c.root.scale.x;
  c.rainAcc += rate * dt;
  const col = hexOf(pal.rain);
  while (c.rainAcc >= 1) {
    c.rainAcc--;
    const a = Math.random() * 6.3, d = Math.sqrt(Math.random()) * radius, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    if (snow) fx.spawn(x, h, z, rand(-0.3, 0.3), -3.2, rand(-0.3, 0.3), h / 3.2, 0.2, 0.18, col, 0.95, SH.SNOW, { spin: rand(-2, 2), floor: 0.05 });
    else fx.spawn(x, h, z, 0, -15, 0, h / 15, 0.5, 0.5, col, 0.85, SH.STREAK, { rot: 0, die: 1, floor: 0.05 });
  }
}

// ================================================================ INPUT (keyboard, mouse hold-to-steer, touch floating joystick)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, mouse = { on: false, x: 0, y: 0, id: null };
let isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
function setTouchUI(on) { // the input actually used decides: hybrid laptops, tablets with keyboards
  if (isTouch === on && document.body.classList.contains('touch') === on) return;
  isTouch = on; document.body.classList.toggle('touch', on);
  $('menuControls').innerHTML = controlsHTML(); if (coach.id) renderTip();
}
document.body.classList.toggle('touch', isTouch);
addEventListener('touchstart', () => setTouchUI(true), { passive: true, capture: true });
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) setTouchUI(false);
  if (e.code === 'Space' && state === State.PLAYING) useThunder();
  if (e.code === 'KeyE' && state === State.PLAYING) unlockZone();
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.on = false; });
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING) return;
  if (e.pointerType === 'mouse') { if (e.button !== 0) return; setTouchUI(false); mouse.on = true; mouse.id = e.pointerId; mouse.x = e.clientX; mouse.y = e.clientY; canvas.setPointerCapture(e.pointerId); return; }
  if (stick.id !== null) return;
  setTouchUI(true);
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === mouse.id) { mouse.x = e.clientX; mouse.y = e.clientY; return; }
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy), max = 50;
  if (d > max) { dx *= max / d; dy *= max / d; }
  stick.x = dx / max; stick.y = dy / max; $('joystick').firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
const releasePointer = (e) => {
  if (e.pointerId === mouse.id) { mouse.on = false; mouse.id = null; return; }
  if (e.pointerId !== stick.id) return;
  stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; $('joystick').firstElementChild.style.transform = '';
};
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
$('btnThunder').addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); useThunder(); });
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _ndc = new THREE.Vector2();
function moveInput() { // x right, y down on screen == +x, +z in the world (the camera has no yaw)
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = stick.y; }
  else if (mouse.on) {
    _ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1); ray.setFromCamera(_ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, _hit)) { x = _hit.x - cloud.x; y = _hit.z - cloud.z; const d = Math.hypot(x, y); if (d < 0.35) x = y = 0; else if (d < 1.5) { x *= d / 1.5 / d; y *= d / 1.5 / d; } }
  }
  if (AUTOPLAY) { const b = botMove(); x = b.x; y = b.y; }
  const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : l < 0.12 ? { x: 0, y: 0 } : { x, y };
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED; AWAY and SEASONEND are breaks between sessions/levels)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', SETTINGS: 'SETTINGS', AWAY: 'AWAY', SEASONEND: 'SEASONEND', COVER: 'COVER' };
let state = State.BOOT, settingsReturn = State.MENU;
const freshSave = () => ({ v: 1, season: 0, petals: 0, seeds: 0, up: {}, zones: 1, cells: '', seasonPetals: 0, lifetime: 0, goalHit: false, played: 0,
  vol: { music: 0.8, sfx: 0.9 }, gfx: 'auto', tips: {}, lastSeen: 0 });
let save = freshSave();
function loadSave() {
  if (CAPTURE) return;
  const s = loadData(SAVE_KEY, null);
  if (s && s.v === 1) save = { ...freshSave(), ...s, vol: { ...freshSave().vol, ...(s.vol || {}) }, up: { ...(s.up || {}) }, tips: { ...(s.tips || {}) } };
}
function encodeCells() { let s = ''; for (let k = 0; k < N; k++) s += String.fromCharCode(48 + Math.round(water[k] * 20)); return s; }
function persist() {
  if (CAPTURE) return;
  save.cells = encodeCells(); save.lastSeen = Date.now(); saveData(SAVE_KEY, save);
}
function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU; $('paused').hidden = s !== State.PAUSED; $('settings').hidden = s !== State.SETTINGS;
  $('away').hidden = s !== State.AWAY; $('seasonEnd').hidden = s !== State.SEASONEND;
  const inGame = s === State.PLAYING || s === State.PAUSED;
  $('hud').hidden = $('dock').hidden = !inGame;
  $('thunder').hidden = !(inGame && lv('thunder') > 0);
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; mouse.on = false; $('joystick').hidden = true; $('zonePrompt').hidden = true; $('arrow').hidden = true; $('coach').hidden = true; $('hand').hidden = true; }
  else if (coach.id) { $('coach').hidden = false; }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, away, season end
  if (s === State.MENU) refreshMenu();
  if (s !== State.PLAYING) { setLoop('rain', 0); }
}
function togglePause() {
  if (state === State.PLAYING) { setState(State.PAUSED); persist(); }
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
let bannerTimer = 0;
function banner(text, sub = '', ms = 2600) {
  if (CAPTURE && state === State.COVER) return;
  const el = $('banner'); $('bannerText').textContent = text; $('bannerSub').textContent = sub; $('bannerSub').hidden = !sub;
  el.hidden = true; void el.offsetWidth; el.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

click('btnPlay', () => startPlay());
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { persist(); setState(State.MENU); });
click('btnSettings', () => openSettings());
click('btnPauseSettings', () => openSettings());
click('btnSettingsDone', () => { persist(); setState(settingsReturn); });
click('btnSeason', () => openSeasonEnd());
click('btnStay', () => setState(State.PLAYING));
click('btnNextSeason', () => triggerMidgameAd(() => startNextSeason())); // between seasons: the level end, the right moment for a midgame ad
click('btnSeedDouble', () => { $('btnSeedDouble').hidden = true; triggerRewardedAd(() => { seasonEndInfo.doubled = true; renderSeasonEnd(); toast(t('doubled')); }); });
click('btnAwayOk', () => collectAway(1));
click('btnAwayDouble', () => { $('btnAwayDouble').hidden = true; triggerRewardedAd(() => { collectAway(2); toast(t('doubled')); }); });
click('btnZone', () => unlockZone());
function openSettings() { settingsReturn = state === State.PAUSED ? State.PAUSED : State.MENU; renderSettings(); setState(State.SETTINGS); }
function renderSettings() {
  $('volMusic').value = Math.round(save.vol.music * 100); $('volSfx').value = Math.round(save.vol.sfx * 100);
  $('volMusicVal').textContent = $('volMusic').value; $('volSfxVal').textContent = $('volSfx').value;
  $('gfxSeg').innerHTML = ['auto', 'high', 'low'].map((g) => `<button class="${save.gfx === g ? 'on' : ''}" data-g="${g}" role="radio" aria-checked="${save.gfx === g}">${t('gfx_' + g)}</button>`).join('');
  $('gfxSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { playSfx('click', 0.5); save.gfx = b.dataset.g; applyGfx(); renderSettings(); }));
}
$('volMusic').addEventListener('input', () => { save.vol.music = $('volMusic').value / 100; $('volMusicVal').textContent = $('volMusic').value; setMusicVolume(); });
$('volSfx').addEventListener('input', () => { save.vol.sfx = $('volSfx').value / 100; $('volSfxVal').textContent = $('volSfx').value; for (const k of Object.keys(audio.loops)) { const L = audio.loops[k]; L.level = -1; } });
$('volSfx').addEventListener('change', () => playSfx('petal', 1));
for (const id of ['volMusic', 'volSfx']) $(id).addEventListener('keydown', (e) => e.stopPropagation()); // arrow keys move the slider, not the cloud
const keyHTML = (k) => `<span class="key">${k}</span>`;
function controlsHTML() {
  if (isTouch) return `<span><svg><use href="#i-cloud"/></svg>${t('ctl_drag')}</span><span><svg><use href="#i-bolt"/></svg>${t('ctl_tap')}</span>`;
  return `<span>${['W', 'A', 'S', 'D'].map(keyHTML).join('')} / ${['↑', '←', '↓', '→'].map(keyHTML).join('')} ${t('ctl_move')}</span>`
    + `<span>${keyHTML('Space')} ${t('ctl_thunder')}</span><span>${keyHTML('P')} ${t('ctl_pause')}</span>`;
}
function refreshMenu() {
  $('playLabel').textContent = save.played ? t('continue') : t('play');
  const pct = Math.round((100 * fullCount) / N), parts = [];
  if (save.played) {
    parts.push(`<span><svg><use href="#${SEASONS[save.season % 4].icon}"/></svg>${seasonName(save.season)} · ${t('year', { n: Math.floor(save.season / 4) + 1 })}</span>`);
    parts.push(`<span><svg><use href="#i-blossom"/></svg>${t('garden')} ${pct}%</span>`);
    if (save.seeds) parts.push(`<span><svg><use href="#i-seed"/></svg>${t('seedsStat', { n: save.seeds })}</span>`);
  }
  $('menuStats').innerHTML = parts.join('');
  $('menuControls').innerHTML = controlsHTML();
}

// ================================================================ ECONOMY
const lv = (id) => save.up[id] | 0;
const costScale = () => Math.pow(CFG.costSeason, save.season);
const rainRadius = () => CFG.rain[0] + CFG.rain[1] * lv('rain');
const cloudSpeed = () => CFG.speed[0] + CFG.speed[1] * lv('wind');
const waterRate = () => CFG.water[0] * (1 + CFG.water[1] * lv('drops'));
const gainMult = () => Math.pow(CFG.roots, lv('roots')) * (1 + CFG.seedBonus * save.seeds);
const upCost = (u) => Math.ceil(u.base * Math.pow(u.grow, lv(u.id)) * costScale());
const zoneCost = (z) => Math.ceil(CFG.zoneCost[z] * costScale());
const seasonGoal = () => { const s = save.season; return Math.min(Math.round(N * 0.92), Math.round(CFG.goal[s % 4] * Math.pow(CFG.goalYear, Math.floor(s / 4)))); };
const thunderRadius = () => CFG.thunder.radius[0] + CFG.thunder.radius[1] * Math.max(0, lv('thunder') - 1);
const thunderCooldown = () => Math.max(CFG.thunder.min, CFG.thunder.cooldown[0] - CFG.thunder.cooldown[1] * Math.max(0, lv('thunder') - 1));
const nextZone = () => { for (let z = 0; z < ZONES; z++) if (!open[z]) return z; return -1; };
let baseIncome = 0, fullCount = 0, sproutCount = 0, harvests = 0;
const income = () => baseIncome * gainMult();
function cellIncome(k) { const zm = CFG.zoneMult[zoneOf[k]] * (kind[k] === RARE ? CFG.rareMult : 1); return stage[k] === 2 ? CFG.bloomRate * zm : stage[k] === 1 ? CFG.sproutRate * zm : 0; }
function recount() {
  baseIncome = 0; fullCount = 0; sproutCount = 0; zoneFull.fill(0);
  for (let k = 0; k < N; k++) { if (stage[k] >= 1) sproutCount++; if (stage[k] === 2) { fullCount++; zoneFull[zoneOf[k]]++; } baseIncome += cellIncome(k); }
}
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
function fmt(n, dec = false) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return dec && n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3)), v = n / Math.pow(1000, e);
  let s = v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s + SUFFIX[e];
}
let popAcc = 0, popT = 0;
function gain(v) { // instant petals (blooms, butterflies, bonuses), multiplied by roots + seeds
  const g = v * gainMult(); addPetals(g); popAcc += g; return g;
}
function addPetals(g) { save.petals += g; save.seasonPetals += g; save.lifetime += g; }

// ================================================================ GAMEPLAY
let run = { time: 0, thunderCd: 0, golden: 20, pending: [], moved: 0, goalT: 0, botT: 0, botTarget: -1, botRetarget: 0, saveT: 0, hudT: 0, dockT: 0 };
function addWater(k, amt) {
  const w0 = water[k]; if (w0 >= 2) return;
  const w1 = Math.min(2, w0 + amt); water[k] = w1;
  if (Math.floor(w0 * 8) !== Math.floor(w1 * 8)) markCell(k);
  if (w0 < 1 && w1 >= 1) onSprout(k);
  if (w0 < 2 && w1 >= 2) onBloom(k);
}
function rainOn(x, z, r, rate, dt) {
  const r2 = r * r, i0 = Math.max(0, Math.floor(x - r + W / 2)), i1 = Math.min(W - 1, Math.floor(x + r + W / 2)), j0 = Math.max(0, Math.floor(z - r + H / 2)), j1 = Math.min(H - 1, Math.floor(z + r + H / 2));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * W + i; if (!open[zoneOf[k]]) continue;
    const dx = cx[k] - x, dz = cz[k] - z, d2 = dx * dx + dz * dz; if (d2 > r2) continue;
    if (water[k] < 2) addWater(k, rate * dt * (1 - 0.5 * (d2 / r2))); else if (ripe[k] >= 1) harvest(k);
  }
}
function onSprout(k) {
  stage[k] = 1; sproutCount++; run.sprouted = (run.sprouted || 0) + 1; baseIncome += cellIncome(k); setGrowTarget(k); tintGrass(k);
  gain(CFG.sproutValue * CFG.zoneMult[zoneOf[k]]);
  if (!skipping) { burstLeaves(cx[k], cz[k]); playSfx('pop', 0.6, 0.9 + Math.random() * 0.3); }
}
function onBloom(k) {
  const before = cellIncome(k); stage[k] = 2; baseIncome += cellIncome(k) - before; setGrowTarget(k);
  fullCount++; const z = zoneOf[k]; zoneFull[z]++;
  const rare = kind[k] === RARE;
  gain(CFG.bloomValue * CFG.zoneMult[z] * (rare ? CFG.rareMult : 1));
  if (!skipping) {
    const f = fStart[k] >= 0 ? flowerBase[fStart[k]] : null, col = f ? hexOf(pal.flowers[f.c]) : kind[k] === TREE ? hexOf(pal.canopy[treeBase[treeIdx[k]].c]) : hexOf(pal.flowers[0]);
    if (kind[k] !== POND) burstPetals(cx[k], cz[k], col, kind[k] === TREE ? 12 : 6);
    playSfx('petal', 0.5, 0.9 + Math.random() * 0.35);
    if (rare) { sparkles(cx[k], 1.2, cz[k], hexOf(pal.rare), 18, 0.6, 2.5); playSfx('rare', 0.8); popText(cx[k], 1.6, cz[k], t('rare'), 'gold'); }
  }
  if (zoneFull[z] === zoneCells[z]) onZoneComplete(z);
  if (!save.goalHit && fullCount >= seasonGoal()) onGoal();
}
function harvest(k) {
  ripe[k] = 0; harvests++;
  gain(CFG.harvest * CFG.zoneMult[zoneOf[k]] * (kind[k] === RARE ? CFG.rareMult : 1));
  if (skipping) return;
  growVel[k] += 2.2; active.add(k);
  const f = fStart[k] >= 0 ? flowerBase[fStart[k]] : null;
  if (kind[k] !== POND) burstPetals(cx[k], cz[k], f ? hexOf(pal.flowers[f.c]) : 0xfff3b0, 2, 0.8);
  playSfx('petal', 0.35, 1.1 + Math.random() * 0.3);
  doneTip('harvest');
}
function ripen(dt) { const r = dt / CFG.ripeTime; for (let k = 0; k < N; k++) if (stage[k] === 2 && ripe[k] < 1) ripe[k] += r; }
function onZoneComplete(z) {
  const bonus = Math.max(20, income() * CFG.zoneBonus); addPetals(bonus);
  if (skipping) return;
  const r = zoneRect[z]; showRainbow(r.cx, r.cz); playSfx('complete', 0.9);
  banner(t('zoneBloom', { z: zoneName(z) }), t('zoneBonus', { n: fmt(bonus) }));
  for (let i = 0; i < 6; i++) sparkles(r.cx + rand(-6, 6), 1, r.cz + rand(-5, 5), 0xfff3b0, 6, 1.5, 2);
}
function onGoal() {
  save.goalHit = true; run.goalT = 0;
  $('btnSeason').hidden = false; $('btnSeason').textContent = `${t('nextSeason')} ▸`;
  if (skipping) return;
  playSfx('goal', 0.9); happytime(); showRainbow(cloud.x, cloud.z, 9);
  banner(t('goalDone'), seasonName(save.season + 1) + ' ▸', 3200);
  for (let i = 0; i < 10; i++) sparkles(cloud.x + rand(-8, 8), 1, cloud.z + rand(-6, 6), 0xfff3b0, 6, 1.5, 2.4);
}
function canEnter(x, z) {
  if (x < -W / 2 + 0.3 || x > W / 2 - 0.3 || z < -H / 2 + 0.3 || z > H / 2 - 0.3) return false;
  const k = cellAt(x, z); return k >= 0 && open[zoneOf[k]];
}
function moveCloud(c, mx, mz, speed, dt) {
  const ax = mx * speed, az = mz * speed;
  c.vx += (ax - c.vx) * Math.min(1, dt * 7); c.vz += (az - c.vz) * Math.min(1, dt * 7);
  const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
  if (canEnter(nx, c.z)) c.x = nx; else c.vx *= -0.2;
  if (canEnter(c.x, nz)) c.z = nz; else c.vz *= -0.2;
}
function buy(u) {
  if (state !== State.PLAYING) return;
  if (u.zone && !open[u.zone]) { playSfx('nope'); toast(`${t('unlock')}: ${zoneName(u.zone)}`); return; }
  if (lv(u.id) >= u.max) return;
  const c = upCost(u);
  if (save.petals < c) { playSfx('nope'); if (!AUTOPLAY) toast(t('needPetals')); return; }
  save.petals -= c; save.up[u.id] = lv(u.id) + 1;
  playSfx('upgrade', 0.8); sparkles(cloud.x, CFG.cloudY - 0.5, cloud.z, 0xfff3b0, 10, 1.2, 1.5);
  if (u.id === 'helper') { const h = addHelper(); playSfx('helper', 0.9); toast(t('helperJoins')); sparkles(h.x, 3.4, h.z, 0xffffff, 12, 0.8, 1); }
  if (u.id === 'thunder') { $('thunder').hidden = false; if (lv('thunder') === 1) { run.thunderCd = 0; maybeTip('thunder'); } }
  if (u.id === 'rain') shockwave(cloud.x, cloud.z, rainRadius(), '#cfeaff', 0.6);
  doneTip('buy'); refreshDock(true); refreshHud(); persist();
}
function unlockZone() {
  const z = nextZone(); if (z < 0 || state !== State.PLAYING) return;
  const c = zoneCost(z); if (save.petals < c) { playSfx('nope'); if (!AUTOPLAY) toast(t('needPetals')); return; }
  save.petals -= c; open[z] = true; save.zones = z + 1; (run.zoneTimes ||= []).push(Math.round(run.time));
  for (let k = 0; k < N; k++) if (zoneOf[k] === z) { markCell(k); tintGrass(k); }
  rebuildFences(); rebuildBadges();
  const r = zoneRect[z];
  playSfx('zone', 1); playSfx('unlock', 0.6); shake(0.25);
  banner(t('zoneAwakens', { z: zoneName(z) }));
  for (let i = 0; i < 14; i++) sparkles(r.cx + rand(-6, 6), 0.8, r.cz + rand(-5, 5), 0xfff3b0, 4, 1.2, 2);
  shockwave(r.cx, r.cz, 9, '#fff3b0', 1.2);
  doneTip('zone'); refreshDock(true); persist();
}
function useThunder() {
  if (state !== State.PLAYING || lv('thunder') < 1 || run.thunderCd > 0) return;
  run.thunderCd = thunderCooldown();
  const R = thunderRadius(), x = cloud.x, z = cloud.z;
  for (let k = 0; k < N; k++) {
    if (!open[zoneOf[k]] || (water[k] >= 2 && ripe[k] < 1)) continue;
    const d = Math.hypot(cx[k] - x, cz[k] - z); if (d > R) continue;
    run.pending.push([k, d * 0.045]); // the bloom rolls outward as a wave
  }
  doneTip('thunder');
  if (skipping) return;
  strikeBolt(x, CFG.cloudY - 0.4, z); shockwave(x, z, R, '#fff6c8', 0.9); shake(0.55); playSfx('thunder', 0.9);
  const f = $('flash'); f.hidden = true; void f.offsetWidth; f.hidden = false; setTimeout(() => { f.hidden = true; }, 460);
  hemi.intensity = pal.raw.hemiI * 2.2;
  sparkles(x, 0.4, z, 0xfffbe0, 20, R * 0.6, 2);
}
function updateGoldens(dt) {
  run.golden -= dt;
  if (run.golden <= 0) {
    run.golden = Math.max(10, CFG.golden.every[0] - CFG.golden.every[1] * lv('fly')) * rand(0.8, 1.2);
    const g = goldens.find((q) => !q.on);
    if (g && fullCount > 25) {
      for (let tries = 0; tries < 40; tries++) {
        const a = Math.random() * 6.3, d = rand(5, 10), x = cloud.x + Math.cos(a) * d, z = cloud.z + Math.sin(a) * d, k = cellAt(x, z);
        if (k < 0 || !open[zoneOf[k]] || stage[k] < 1) continue;
        Object.assign(g, { on: true, x, z, hx: x, hz: z, t: CFG.golden.life, ph: Math.random() * 6 });
        if (!skipping) { playSfx('golden', 0.8); sparkles(x, 1.2, z, 0xffd84a, 14, 0.5, 2); maybeTip('golden'); }
        break;
      }
    }
  }
  for (const g of goldens) {
    if (!g.on) continue;
    g.t -= dt; g.ph += dt;
    g.x = g.hx + Math.sin(g.ph * 0.9) * 1.6 + Math.sin(g.ph * 2.3) * 0.4; g.z = g.hz + Math.cos(g.ph * 0.7) * 1.3;
    if (Math.hypot(g.x - cloud.x, g.z - cloud.z) < rainRadius() * 0.55 + 1) {
      g.on = false; const v = Math.max(15 * gainMult(), income() * CFG.golden.value * (1 + 0.15 * lv('fly'))); addPetals(v);
      if (!skipping) { playSfx('butterfly', 0.9); sparkles(g.x, 1.4, g.z, 0xffd84a, 26, 0.7, 3); popText(g.x, 1.8, g.z, `+${fmt(v)}`, 'gold'); banner(t('golden'), `+${fmt(v)}`, 1600); doneTip('golden'); }
    } else if (g.t <= 0) { g.on = false; if (!skipping) sparkles(g.x, 1.2, g.z, 0xffd84a, 10, 0.4, 2); }
  }
}
function updateHelpers(dt) {
  const r = rainRadius() * CFG.helper.radius, rate = waterRate() * CFG.helper.water, sp = cloudSpeed() * CFG.helper.speed;
  for (const h of helpers) {
    h.retarget -= dt;
    if (!wanted(h.target) || h.retarget <= 0) { h.target = pickTarget(h.x, h.z, h); h.retarget = 3; }
    let mx = 0, mz = 0;
    if (h.target >= 0) { mx = cx[h.target] - h.x; mz = cz[h.target] - h.z; const d = Math.hypot(mx, mz); if (d > 0.3) { mx /= Math.max(1, d); mz /= Math.max(1, d); } else mx = mz = 0; }
    moveCloud(h, mx, mz, sp, dt);
    rainOn(h.x, h.z, r, rate, dt);
  }
}
const wanted = (k) => k >= 0 && open[zoneOf[k]] && (water[k] < 2 || ripe[k] >= 1); // dry ground to bloom, or ripe flowers to harvest
function pickTarget(x, z, self) {
  let best = -1, bd = 1e9;
  for (let k = 0; k < N; k++) {
    if (!wanted(k)) continue;
    const dx = cx[k] - x, dz = cz[k] - z; let d = dx * dx + dz * dz;
    if (water[k] >= 2) d += 12; // new ground first
    if (self !== cloud && Math.hypot(cx[k] - cloud.x, cz[k] - cloud.z) < rainRadius() + 1.5) d += 60; // helpers spread out from the player
    for (const h of helpers) if (h !== self && h.target >= 0 && Math.abs(cx[h.target] - cx[k]) + Math.abs(cz[h.target] - cz[k]) < 4) d += 40;
    d -= water[k] * 2; // finish what is half done
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
function step(dt) {
  if (state !== State.PLAYING) return;
  run.time += dt; run.thunderCd = Math.max(0, run.thunderCd - dt);
  const m = moveInput(), ox = cloud.x, oz = cloud.z;
  moveCloud(cloud, m.x, m.y, cloudSpeed(), dt);
  run.moved += Math.hypot(cloud.x - ox, cloud.z - oz);
  if (run.moved > 3) doneTip('move');
  rainOn(cloud.x, cloud.z, rainRadius(), waterRate(), dt);
  updateHelpers(dt);
  for (let i = run.pending.length - 1; i >= 0; i--) { const p = run.pending[i]; p[1] -= dt; if (p[1] <= 0) { if (water[p[0]] < 2) addWater(p[0], 2); else if (ripe[p[0]] >= 1) harvest(p[0]); run.pending.splice(i, 1); } }
  ripen(dt);
  addPetals(income() * dt);
  updateGoldens(dt);
  if (save.goalHit) run.goalT += dt;
  if (AUTOPLAY) botThink(dt);
  run.saveT += dt; if (run.saveT > 5) { run.saveT = 0; persist(); }
}
function startPlay() {
  save.played = 1;
  setState(State.PLAYING); playMusic(SEASONS[save.season % 4].music);
  refreshDock(true); refreshHud(); syncHelpers();
  if (!coach.id) nextTip();
}
function resetValley() {
  water.fill(0); stage.fill(0); ripe.fill(0); open.fill(false); open[0] = true; run.pending.length = 0;
  for (const g of goldens) g.on = false;
}
function seedOasis() { // every season starts with a small blooming patch under the cloud: the first screen already shows the idea
  const r = zoneRect[0];
  for (let k = 0; k < N; k++) if (zoneOf[k] === 0 && Math.hypot(cx[k] - r.cx, cz[k] - r.cz) < 1.9) { water[k] = 2; stage[k] = 2; ripe[k] = 0; }
}
function applySeasonLook() {
  pal = buildPalette(save.season);
  const S = pal.raw;
  scene.fog.color.copy(pal.fog); skyMat.uniforms.top.value.copy(pal.sky); skyMat.uniforms.bottom.value.copy(pal.horizon);
  scene.background = pal.horizon.clone();
  sun.color.copy(pal.sun); sun.intensity = S.sunI; hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGnd); hemi.intensity = S.hemiI;
  waterMat.color.copy(pal.pond); waterMat.emissive.copy(pal.pond).multiplyScalar(0.35);
  buildPlants(); buildHillTrees(); lushTarget(); lush = lushGoal; flushGround(true); refreshHills();
  for (let i = 0; i < BF_MAX; i++) { butterflies[i].on = false; wingL.setColorAt(i, pal.flowers[i % pal.flowers.length]); wingR.setColorAt(i, pal.flowers[i % pal.flowers.length]); }
  wingL.instanceColor.needsUpdate = wingR.instanceColor.needsUpdate = true;
  $('seasonIco').firstElementChild.setAttribute('href', `#${S.icon}`);
}
let lushGoal = 0;
function lushTarget() { lushGoal = clamp(fullCount / seasonGoal(), 0, 1); }
let seasonEndInfo = { seeds: 0, doubled: false };
const seedsFor = (p) => Math.max(4, Math.floor(4 + 3 * Math.pow(p / (2000 * costScale()), 0.4))); // per season, independent of how rich seeds already made you
function openSeasonEnd() {
  seasonEndInfo = { seeds: seedsFor(save.seasonPetals), doubled: false };
  renderSeasonEnd(); persist(); setState(State.SEASONEND);
  playSfx('season', 0.7);
}
function renderSeasonEnd() {
  const n = seasonEndInfo.seeds * (seasonEndInfo.doubled ? 2 : 1), total = save.seeds + n;
  $('seasonEndTitle').textContent = t('seasonEndTitle', { s: seasonName(save.season) });
  $('seasonEndSub').textContent = t('seasonEndSub');
  $('seedGain').textContent = `+${n}`;
  $('seedBonus').textContent = t('seedBonus', { n: total, p: Math.round(total * CFG.seedBonus * 100) });
  $('btnNextSeason').textContent = t('startSeason', { s: seasonName(save.season + 1) });
  $('btnSeedDouble').hidden = seasonEndInfo.doubled || !adsAvailable();
}
function startNextSeason() {
  save.seeds += seasonEndInfo.seeds * (seasonEndInfo.doubled ? 2 : 1);
  save.season++; save.petals = 0; save.up = {}; save.zones = 1; save.seasonPetals = 0; save.goalHit = false;
  resetValley(); seedOasis(); recount(); clearHelpers(); run.thunderCd = 0; run.golden = 20;
  applySeasonLook(); rebuildFences(); rebuildBadges();
  $('btnSeason').hidden = true; $('thunder').hidden = true;
  cloud.x = zoneRect[0].cx; cloud.z = zoneRect[0].cz; cloud.vx = cloud.vz = 0; fx.clear(); glow.clear(); snapPonds(); popAcc = 0;
  setState(State.PLAYING); playMusic(SEASONS[save.season % 4].music); playSfx('season', 0.8);
  banner(t('seasonStart', { s: seasonName(save.season), n: Math.floor(save.season / 4) + 1 }), t('seasonStartSub'), 3200);
  refreshDock(true); refreshHud(); persist();
}
let awayPetals = 0;
function computeAway(ms) { const sec = Math.min(CFG.awayCap, ms / 1000); return sec > CFG.awayMin && baseIncome > 0 ? income() * sec * CFG.awayRate : 0; }
function showAway(v) { awayPetals = v; $('awayPetals').textContent = fmt(v); $('btnAwayDouble').hidden = !adsAvailable(); setState(State.AWAY); }
function collectAway(mult) {
  if (state !== State.AWAY) return;
  addPetals(awayPetals * mult); popAcc += awayPetals * mult; awayPetals = 0; playSfx('butterfly', 0.7); startPlay(); persist();
}

// ---------------------------------------------------------------- HUD, dock, zone prompt, arrow, pops
function buildDock() {
  $('dock').innerHTML = UPGRADES.map((u, k) => `<button class="up" data-k="${k}" title="${t('upd_' + u.id)}"><span class="lv"></span><svg><use href="#${u.icon}"/></svg><span class="nm">${t('up_' + u.id)}</span><span class="cost"></span></button>`).join('');
  $('dock').querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => { unlockAudio(); buy(UPGRADES[+b.dataset.k]); }));
}
const dockCache = [];
function refreshDock(force) {
  const btns = $('dock').children;
  UPGRADES.forEach((u, k) => {
    const b = btns[k], L = lv(u.id), locked = u.zone && !open[u.zone], max = L >= u.max, c = upCost(u), ok = !locked && !max && save.petals >= c;
    const key = `${locked}|${max}|${ok}|${L}|${c}|${coach.hl === k}`;
    if (!force && dockCache[k] === key) return; dockCache[k] = key;
    b.className = `up${locked ? ' locked' : max ? ' max' : ok ? ' ok' : ' no'}${coach.hl === k ? ' hl' : ''}`;
    b.querySelector('.lv').textContent = L ? t('lv', { n: L }) : '';
    b.querySelector('.cost').innerHTML = locked ? `<svg><use href="#i-lock"/></svg>${t('meadowN', { n: u.zone + 1 })}` : max ? t('max') : `<svg><use href="#i-petal"/></svg>${fmt(c)}`;
  });
}
let lastPetalsShown = -1;
function refreshHud() {
  const p = Math.floor(save.petals);
  if (p !== lastPetalsShown) { $('petals').textContent = fmt(p); lastPetalsShown = p; }
  $('income').textContent = `+${fmt(income(), true)}`;
  $('seasonName').textContent = seasonName(save.season); $('yearName').textContent = t('year', { n: Math.floor(save.season / 4) + 1 });
  const g = seasonGoal(); $('goalFill').style.width = `${Math.min(100, (100 * fullCount) / g)}%`;
  $('goalText').textContent = save.goalHit ? t('goalDone') : t('goal', { n: fullCount, g });
  $('btnSeason').hidden = !save.goalHit;
  if (lv('thunder') > 0) { const cd = run.thunderCd, mx = thunderCooldown(); $('thunderCd').style.height = `${(100 * cd) / mx}%`; $('btnThunder').classList.toggle('cool', cd > 0); }
  const z = nextZone();
  if (z >= 0 && state === State.PLAYING) {
    const r = zoneRect[z], near = cloud.x > r.x0 - 4 && cloud.x < r.x1 + 4 && cloud.z > r.z0 - 4 && cloud.z < r.z1 + 4, c = zoneCost(z), afford = save.petals >= c;
    const show = afford || save.petals >= c * 0.5 || (near && FIRST_TIPS.every((f) => save.tips[f]));
    $('zonePrompt').hidden = !show;
    if (show) {
      $('zoneName').textContent = zoneName(z);
      const html = `<svg><use href="#i-lock"/></svg>${t('unlock')} <svg><use href="#i-petal"/></svg>${fmt(c)}${isTouch ? '' : ' <span class="key keyhint">E</span>'}`;
      if ($('btnZone').dataset.h !== html) { $('btnZone').innerHTML = html; $('btnZone').dataset.h = html; }
      $('btnZone').disabled = !afford;
    }
  } else $('zonePrompt').hidden = true;
}
const _v = new THREE.Vector3();
function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind: _v.z > 1 }; }
function popText(x, y, z, text, cls) {
  if (state === State.COVER || $('pops').childElementCount > 8) return;
  const s = toScreen(x, y, z), el = document.createElement('div'); el.textContent = text; if (cls) el.className = cls;
  el.style.left = `${s.x}px`; el.style.top = `${s.y}px`; $('pops').appendChild(el);
  const a = el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-110%) scale(1.05)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-260%) scale(1)', opacity: 0 }], { duration: 1150, easing: 'ease-out' });
  a.onfinish = () => el.remove();
}
function updatePops(dt) {
  popT += dt;
  if (popT > 0.45) { popT = 0; if (popAcc >= 1) { popText(cloud.x + rand(-0.6, 0.6), CFG.cloudY + 0.9, cloud.z, `+${fmt(popAcc)}`); $('petals').parentElement.classList.remove('bump'); void $('petals').offsetWidth; $('petals').parentElement.classList.add('bump'); } popAcc = 0; }
}
function updateArrow() {
  const el = $('arrow');
  let target = null;
  const z = nextZone();
  if (state === State.PLAYING && z >= 0 && save.petals >= zoneCost(z) && !open[z]) { const r = zoneRect[z]; target = [clamp(cloud.x, r.x0 + 1, r.x1 - 1), clamp(cloud.z, r.z0 + 1, r.z1 - 1)]; }
  if (state === State.PLAYING && coach.id === 'rain' && run.time > 6) { const k = pickTarget(cloud.x, cloud.z, cloud); if (k >= 0 && Math.hypot(cx[k] - cloud.x, cz[k] - cloud.z) > rainRadius() + 1) target = [cx[k], cz[k]]; }
  if (!target) { el.hidden = true; return; }
  const s = toScreen(target[0], 0.5, target[1]), m = 46, cxs = innerWidth / 2, cys = innerHeight / 2;
  const inside = s.x > m && s.x < innerWidth - m && s.y > m * 2 && s.y < innerHeight - m * 2.5;
  let x = s.x, y = s.y, ang = 180;
  if (!inside) { const dx = s.x - cxs, dy = s.y - cys, k = Math.min((cxs - m) / Math.abs(dx || 1e-3), (cys - m * 2.5) / Math.abs(dy || 1e-3)); x = cxs + dx * k; y = cys + dy * k; ang = (Math.atan2(dx, -dy) * 180) / Math.PI; }
  else y -= 40;
  el.hidden = false; el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.transform = `rotate(${ang}deg)`;
}

// ================================================================ ONBOARDING (guided first minute, then one-off contextual tips; all skippable)
const coach = { id: null, hl: -1, handT: 0 };
const FIRST_TIPS = ['move', 'rain', 'buy'];
const cheapest = () => Math.min(...UPGRADES.filter((u) => (!u.zone || open[u.zone]) && lv(u.id) < u.max).map(upCost));
function nextTip() {
  if (NO_TIPS || save.tips.off) return;
  for (const id of FIRST_TIPS) if (!save.tips[id]) { if (id === 'buy' && save.petals < cheapest()) return; showTip(id); return; }
}
function showTip(id) {
  if (NO_TIPS || save.tips.off || save.tips[id]) return;
  coach.id = id; coach.hl = -1; renderTip();
  if (state === State.PLAYING) { $('coach').hidden = false; playSfx('tip', 0.6); }
}
function maybeTip(id) { if (!coach.id && FIRST_TIPS.every((f) => save.tips[f])) showTip(id); }
function renderTip() {
  const id = coach.id; if (!id) return;
  const text = { move: isTouch ? t('tip_moveTouch') : t('tip_move'), rain: t('tip_rain'), buy: t('tip_buy'), zone: t('tip_zone'), thunder: t('tip_thunder'), golden: t('tip_golden'), full: t('tip_full'), harvest: t('tip_harvest') }[id];
  $('coachText').textContent = text;
  let keysH = '';
  if (!isTouch && id === 'move') keysH = ['W', 'A', 'S', 'D'].map(keyHTML).join('') + '<span class="or">/</span>' + ['←', '↑', '↓', '→'].map(keyHTML).join('');
  if (!isTouch && id === 'thunder') keysH = keyHTML('Space');
  if (!isTouch && id === 'zone') keysH = keyHTML('E');
  if (id === 'rain') keysH = '<svg class="tip-ico"><use href="#i-rain"/></svg>';
  if (id === 'golden') keysH = '<svg class="tip-ico gold"><use href="#i-fly"/></svg>';
  if (id === 'harvest') keysH = '<svg class="tip-ico gold"><use href="#i-blossom"/></svg>';
  $('coachKeys').innerHTML = keysH;
}
function doneTip(id) {
  if (save.tips[id]) return;
  save.tips[id] = 1;
  if (coach.id !== id) return;
  coach.id = null; coach.hl = -1; $('coach').hidden = true; $('hand').hidden = true; refreshDock(true);
  playSfx('tip', 0.7);
  setTimeout(() => { if (!coach.id) nextTip(); }, 600);
}
click('btnSkipTips', () => { save.tips.off = 1; coach.id = null; coach.hl = -1; $('coach').hidden = true; $('hand').hidden = true; refreshDock(true); persist(); });
function ripeNear() { for (let k = 0; k < N; k++) if (ripe[k] >= 1 && Math.hypot(cx[k] - cloud.x, cz[k] - cloud.z) < 9) return true; return false; }
function updateCoach(dt) {
  if (state !== State.PLAYING) return;
  if (!coach.id && !save.tips.off && FIRST_TIPS.every((f) => save.tips[f])) {
    const z = nextZone();
    if (!save.tips.zone && z >= 0 && save.petals >= zoneCost(z)) showTip('zone');
    else if (!save.tips.full && fullCount === 0 && sproutCount > 30) showTip('full');
    else if (!save.tips.harvest && run.time > 40 && ripeNear()) showTip('harvest');
  }
  if (coach.id === 'full' && fullCount >= 5) doneTip('full');
  if (coach.id === 'rain' && run.sprouted >= 8) doneTip('rain');
  if (!coach.id && !save.tips.off && !FIRST_TIPS.every((f) => save.tips[f]) && Math.random() < dt * 3) nextTip(); // the buy tip waits until something is affordable
  const hand = $('hand'); coach.handT += dt;
  let target = null;
  if (coach.id === 'buy') {
    let best = -1, bc = 1e18; UPGRADES.forEach((u, k) => { if ((!u.zone || open[u.zone]) && lv(u.id) < u.max && upCost(u) < bc) { bc = upCost(u); best = k; } });
    if (coach.hl !== best) { coach.hl = best; refreshDock(true); }
    if (best >= 0 && save.petals >= bc) { const r = $('dock').children[best].getBoundingClientRect(); target = [r.left + r.width / 2, r.top + r.height * 0.15]; }
  }
  if (coach.id === 'zone' && !$('zonePrompt').hidden) { const r = $('btnZone').getBoundingClientRect(); target = [r.left + r.width / 2, r.top + r.height * 0.2]; }
  if (coach.id === 'thunder' && isTouch) { const r = $('btnThunder').getBoundingClientRect(); target = [r.left + r.width / 2, r.top + r.height * 0.2]; }
  if (coach.id === 'move' && isTouch) { const u = (coach.handT % 2) / 2; target = [innerWidth * (0.38 + 0.18 * Math.sin(u * Math.PI * 2)), innerHeight * 0.62]; }
  hand.hidden = !target;
  if (target) { hand.style.left = `${target[0]}px`; hand.style.top = `${target[1]}px`; }
}

// ================================================================ BOT (trailer footage + balance tests): rains on the nearest dry ground, buys greedily
let skipping = false;
function botMove() {
  run.botRetarget -= STEP;
  const g = goldens.find((q) => q.on);
  if (g) return { x: g.x - cloud.x, y: g.z - cloud.z };
  if (!wanted(run.botTarget) || run.botRetarget <= 0) { run.botTarget = pickTarget(cloud.x, cloud.z, cloud); run.botRetarget = 1.2; }
  const k = run.botTarget; if (k < 0) return { x: 0, y: 0 };
  const dx = cx[k] - cloud.x, dz = cz[k] - cloud.z, d = Math.hypot(dx, dz);
  return d < 0.25 ? { x: 0, y: 0 } : { x: dx / Math.max(d, 0.6), y: dz / Math.max(d, 0.6) };
}
function botThink(dt) {
  run.botT -= dt; if (run.botT > 0) return; run.botT = 0.5;
  const z = nextZone();
  if (z >= 0 && save.petals >= zoneCost(z)) { unlockZone(); return; }
  const saving = z >= 0 && zoneCost(z) < save.petals * 2.2 && fullCount > zoneFullCapacity() * 0.7; // nearly done here: save for the next meadow
  const order = [...UPGRADES].filter((u) => (!u.zone || open[u.zone]) && lv(u.id) < u.max).sort((a, b) => upCost(a) - upCost(b));
  for (const u of order) { if (saving && upCost(u) > save.petals - zoneCost(z) * 0.5) break; if (save.petals >= upCost(u)) { buy(u); break; } }
  if (lv('thunder') && run.thunderCd <= 0) { let dry = 0; const R = thunderRadius(); for (let k = 0; k < N; k++) if (open[zoneOf[k]] && water[k] < 2 && Math.hypot(cx[k] - cloud.x, cz[k] - cloud.z) < R) dry++; if (dry > R * R * 1.2) useThunder(); }
  if (save.goalHit && run.goalT > 12 && CAPTURE) { seasonEndInfo = { seeds: seedsFor(save.seasonPetals), doubled: false }; startNextSeason(); }
}
const zoneFullCapacity = () => zoneCells.reduce((a, n, z) => a + (open[z] ? n : 0), 0);

// ================================================================ LOOP
let last = performance.now(), acc = 0, hillT = 0, bfT = 0;
const camPos = new THREE.Vector3(0, 20, 20), camLook = new THREE.Vector3();
function advance(dt) {
  if (state !== State.PAUSED && state !== State.COVER) { acc += dt; let n = 0; while (acc >= STEP && n < 12) { step(STEP); acc -= STEP; n++; } if (n === 12) acc = 0; }
  animate(dt);
}
function animate(dt) {
  uTime.value += dt;
  updateGrowth(dt); flushGround(false);
  const moving = Math.hypot(cloud.vx, cloud.vz) > 0.3, playing = state === State.PLAYING || state === State.PAUSED;
  animateCloud(cloud, dt, rainRadius(), moving, true);
  cloud.root.scale.setScalar(0.86 + rainRadius() * 0.085);
  if (state !== State.PAUSED) { rainParticles(cloud, rainRadius(), dt); for (const h of helpers) rainParticles(h, rainRadius() * CFG.helper.radius, dt); }
  for (const h of helpers) animateCloud(h, dt, rainRadius() * CFG.helper.radius, true, false);
  if (state !== State.PAUSED) { fx.update(dt); glow.update(dt); }
  updateButterflies(dt); updatePonds(dt); updateRings(dt); updateBolt(dt); updateRainbow(dt);
  hemi.intensity += (pal.raw.hemiI - hemi.intensity) * Math.min(1, dt * 4);
  for (const b of badges) { b.position.y = 2.4 + Math.sin(uTime.value * 1.6 + b.userData.zone) * 0.12; b.visible = playing; } // never behind the menu card
  hillT += dt; if (hillT > 0.5) { hillT = 0; lushTarget(); if (Math.abs(lush - lushGoal) > 0.02) { lush += clamp(lushGoal - lush, -0.05, 0.05); refreshHills(); } }
  if (rareBase.length && Math.random() < dt * 3 * fxBudget()) { const k = rareBase[(Math.random() * rareBase.length) | 0]; const cell = cellAt(k.x, k.z); if (cell >= 0 && stage[cell] === 2) sparkles(k.x, 1.1, k.z, hexOf(pal.rare), 2, 0.3, 1); }
  if (Math.random() < dt * 6 * fxBudget()) pollen();
  glitter(dt);
  if (playing) {
    const hudBusy = (run.hudT += dt) > 0.1; if (hudBusy) { run.hudT = 0; refreshHud(); }
    if ((run.dockT += dt) > 0.25) { run.dockT = 0; refreshDock(); }
    updatePops(dt); updateArrow(); updateCoach(dt);
    setLoop('rain', state === State.PLAYING ? 0.6 : 0.25);
  }
  setLoop('birds', state === State.COVER ? 0 : clamp(fullCount / 300, 0, 1) * 0.9);
}
let glitterAcc = 0;
function glitter(dt) { // ripe flowers twinkle gold so the player sees where to rain again
  glitterAcc += dt * 70 * fxBudget();
  while (glitterAcc >= 1) {
    glitterAcc--;
    const x = camLook.x + rand(-15, 15), z = camLook.z + rand(-10, 9), k = cellAt(x, z);
    if (k < 0 || ripe[k] < 1 || kind[k] === POND) continue;
    glow.spawn(cx[k] + rand(-0.35, 0.35), rand(0.55, 0.9), cz[k] + rand(-0.35, 0.35), 0, rand(0.15, 0.4), 0, rand(0.7, 1.1), rand(0.28, 0.4), 0.05, 0xffe27a, 0.95, SH.SPARK, { spin: rand(-2, 2) });
  }
}
function pollen() { // drifting glow motes over bloomed ground near the camera
  for (let tries = 0; tries < 6; tries++) {
    const x = camLook.x + rand(-14, 14), z = camLook.z + rand(-9, 9), k = cellAt(x, z);
    if (k >= 0 && stage[k] === 0 && Math.random() < 0.5) { fx.spawn(x, rand(0.2, 1.2), z, rand(0.2, 0.5), rand(0.02, 0.12), rand(-0.1, 0.1), rand(3, 5), 0.12, 0.1, 0xfff0d0, 0.45, SH.DOT); return; } // warm dust over the dry soil
    if (k < 0 || stage[k] !== 2) continue;
    glow.spawn(x, rand(0.4, 1.6), z, rand(-0.2, 0.2), rand(0.1, 0.35), rand(-0.2, 0.2), rand(2.5, 4), 0.18, 0.12, pal.raw.snow ? 0xdff0ff : 0xfff1b0, 0.55, SH.DOT);
    return;
  }
}
function updateButterflies(dt) {
  bfT += dt;
  const want = fullCount < 20 ? 0 : Math.min(BF_MAX, 6 + Math.floor(fullCount / 40) + lv('fly') * 4) * (gfxLow ? 0.5 : 1);
  let on = 0;
  for (let i = 0; i < BF_MAX; i++) {
    const b = butterflies[i];
    if (!b.on && on < want && bfT > 0.3) {
      for (let tries = 0; tries < 8; tries++) {
        const x = camLook.x + rand(-16, 16), z = camLook.z + rand(-10, 10), k = cellAt(x, z);
        if (k >= 0 && stage[k] === 2) { Object.assign(b, { on: true, x, z, hx: x, hz: z, y: 0.9, life: rand(14, 30) }); bfT = 0; break; }
      }
    }
    if (!b.on || (b.life -= dt) < 0 || i >= want + 4) { if (b.on && b.life < 0) b.on = false; setInst(wingL, i, 0, -5, 0, 0, 0); setInst(wingR, i, 0, -5, 0, 0, 0); continue; }
    on++;
    b.ph += dt * b.sp;
    const nx = b.hx + Math.sin(b.ph * 0.8) * 2 + Math.sin(b.ph * 1.9) * 0.6, nz = b.hz + Math.cos(b.ph * 0.6) * 1.6;
    const head = Math.atan2(nx - b.x, nz - b.z); b.x = nx; b.z = nz; b.y = 0.9 + Math.sin(b.ph * 2.2) * 0.35;
    const flap = Math.sin(uTime.value * 18 + i) * 0.9 + 0.2;
    _q.setFromEuler(_e.set(0, head, flap, 'YXZ')); _p.set(b.x, b.y, b.z); _s.set(0.55, 0.55, 0.55); _m.compose(_p, _q, _s); wingL.setMatrixAt(i, _m);
    _q.setFromEuler(_e.set(0, head, -flap, 'YXZ')); _m.compose(_p, _q, _s); wingR.setMatrixAt(i, _m);
  }
  wingL.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = true;
  for (const g of goldens) {
    g.mesh.visible = g.on; if (!g.on) continue;
    const flap = Math.sin(uTime.value * 14) * 0.9 + 0.2; g.mesh.position.set(g.x, 1.3 + Math.sin(g.ph * 2.5) * 0.3, g.z);
    g.mesh.userData.l.rotation.z = flap; g.mesh.userData.r.rotation.z = -flap; g.mesh.rotation.y = g.ph;
    if (Math.random() < dt * 14 * fxBudget()) glow.spawn(g.x + rand(-0.3, 0.3), g.mesh.position.y, g.z + rand(-0.3, 0.3), 0, -0.3, 0, 0.8, 0.3, 0.05, 0xffd84a, 0.9, SH.SPARK);
  }
}
function updateCamera(dt, snap = false) {
  const portrait = innerHeight > innerWidth, zoom = (portrait ? 1.55 : 1) * (1 + (rainRadius() - CFG.rain[0]) * 0.07);
  let tx = cloud.x, tz = cloud.z;
  if (state === State.MENU || (state === State.SETTINGS && settingsReturn === State.MENU)) { tx -= portrait ? 0 : 6.5; tz += portrait ? 5 : 0.5; } // the menu card covers the left
  tx = clamp(tx, -W / 2 + 4, W / 2 - 4); tz = clamp(tz, -H / 2 + 3, H / 2 - 1);
  const k = snap ? 1 : 1 - Math.exp(-dt * 3.5);
  camLook.x += (tx - camLook.x) * k; camLook.z += (tz - 0.4 - camLook.z) * k; camLook.y = 0;
  camPos.set(camLook.x, 17 * zoom, camLook.z + 12.5 * zoom);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  camera.position.copy(camPos); camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook);
  sun.position.set(camLook.x + 12, 26, camLook.z + 10); sun.target.position.copy(camLook);
  sky.position.copy(camera.position);
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
function render(dt) { updateCamera(dt); renderer.render(scene, camera); }
let lastFrameAt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; lastFrameAt = performance.now();
  advance(dt); render(dt); watchFps(dt);
  requestAnimationFrame(frame);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  fxUniforms.uScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', resize);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); persist(); return; }
  if (!hiddenAt || CAPTURE) return;
  const away = Date.now() - hiddenAt; hiddenAt = 0; last = performance.now();
  if (state === State.PLAYING) { const v = computeAway(away); if (v > 0) showAway(v); }
});
addEventListener('pagehide', () => persist());

// ================================================================ COVER (tools/game_covers.py: honest key art rendered from the game itself)
function stageCover(kind) {
  state = State.COVER; document.body.classList.add('cover');
  for (const id of ['menu', 'paused', 'settings', 'away', 'seasonEnd', 'hud', 'dock', 'banner', 'coach', 'hand', 'toast', 'zonePrompt', 'arrow', 'thunder', 'joystick', 'pops']) $(id).hidden = true;
  save.season = 0; save.up = { rain: 5, helper: 1, fly: 3 };
  resetValley(); for (let z = 0; z < 4; z++) open[z] = true;
  const front = 2.2; // bloomed to the left of the cloud, dry to the right: the whole idea in one picture
  cloud.x = 1.5; cloud.z = 4.5;
  for (let k = 0; k < N; k++) {
    if (!open[zoneOf[k]]) continue;
    const d = cx[k] - cloud.x + (noise2(cz[k] * 0.4, 3) - 0.5) * 2.5;
    water[k] = d < -front ? 2 : d < front ? clamp(2 - (d + front) / (front * 1.1), 0, 2) : 0;
  }
  for (let k = 0; k < N; k++) stage[k] = water[k] >= 2 ? 2 : water[k] >= 1 ? 1 : 0;
  recount(); applySeasonLook(); rebuildFences(); for (const b of badges) b.visible = false; rebuildBadges(); for (const b of badges) b.visible = false;
  clearHelpers(); const h = addHelper(); h.x = -7; h.z = -2;
  lush = 1; refreshHills();
  for (const p of ponds) p.fill = 1;
  const pairs = [[-4, 2.6], [-6.5, 5.5], [-2.8, 6.8], [-9, 1], [-5, -1.5], [-11, 4]];
  pairs.forEach(([x, z], i) => Object.assign(butterflies[i], { on: true, x: cloud.x + x, z: cloud.z + z, hx: cloud.x + x, hz: cloud.z + z, ph: i * 1.7, life: 99 }));
  goldens[0].mesh.scale.setScalar(1.15); Object.assign(goldens[0], { on: true, x: cloud.x - 3.2, z: cloud.z + 1.4, hx: cloud.x - 3.2, hz: cloud.z + 1.4, ph: 0.6, t: 99 });
  showRainbow(cloud.x - 5, cloud.z - 4, 99); rainbow.userData.t = 30;
  for (let i = 0; i < 20; i++) animate(1 / 30);
  for (let k = 0; k < N; k++) if (stage[k] === 2 && Math.abs(cx[k] - cloud.x + front) < 1.2 && Math.abs(cz[k] - cloud.z) < 3 && Math.random() < 0.4) burstPetals(cx[k], cz[k], hexOf(pal.flowers[(Math.random() * 6) | 0]), 4);
  for (let i = 0; i < 5; i++) { fx.update(1 / 30); glow.update(1 / 30); }
  const cam = { landscape: [2.2, 8.5, 10.5, 0.5, 1.2, 0.5], portrait: [1.8, 12.5, 14.5, 1.2, 0.9, 0.2], square: [1.8, 9.5, 11, 0.8, 1.1, 0.5], keyart: [2.2, 8.5, 10.5, 0.5, 1.2, 0.5] }[kind] || [2.2, 8.5, 10.5, 0.5, 1.2, 0.5];
  camera.position.set(cloud.x + cam[0] - 2.2, cam[1], cloud.z + cam[2]); camera.lookAt(cloud.x + cam[3] - 1.2, cam[4], cloud.z + cam[5] - 2);
  sun.position.set(cloud.x + 12, 26, cloud.z + 10); sun.target.position.set(cloud.x, 0, cloud.z); sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n();
  initAudio(); loadSave();
  if (CAPTURE && params.get('season')) save.season = +params.get('season') || 0; // review autumn / winter looks
  const jobs = [...Object.entries(SFX_FILES).map(([k, u]) => loadSfx(k, u)), document.fonts?.load('800 32px UI').catch(() => {}), document.fonts?.load('32px Display').catch(() => {})];
  let done = 0; jobs.forEach((p) => Promise.resolve(p).finally(() => { done++; $('loadBar').style.width = `${(100 * done) / jobs.length}%`; }));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  // restore the garden
  resetValley();
  for (let z = 0; z < Math.min(ZONES, save.zones); z++) open[z] = true;
  if (!(save.cells && save.cells.length === N)) seedOasis();
  else for (let k = 0; k < N; k++) { water[k] = clamp((save.cells.charCodeAt(k) - 48) / 20, 0, 2); stage[k] = water[k] >= 2 ? 2 : water[k] >= 1 ? 1 : 0; ripe[k] = stage[k] === 2 ? Math.random() : 0; if (!open[zoneOf[k]]) { water[k] = 0; stage[k] = 0; } }
  recount(); applySeasonLook(); rebuildFences(); rebuildBadges(); buildDock(); syncHelpers(); snapPonds();
  cloud.x = zoneRect[0].cx; cloud.z = zoneRect[0].cz;
  if (save.goalHit) $('btnSeason').textContent = `${t('nextSeason')} ▸`;
  resize(); applyGfx(); updateCamera(0, true);
  for (const h of helpers) { h.x = cloud.x + rand(-4, 4); h.z = cloud.z + rand(-3, 3); }
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  audio.wantMusic = true; playMusic(SEASONS[save.season % 4].music);
  const awayV = save.played && save.lastSeen ? computeAway(Date.now() - save.lastSeen) : 0;
  if (awayV > 0) showAway(awayV); else setState(State.MENU); // a returning player collects and lands straight in the garden
  if (CAPTURE) { // capture protocol used by tools/capture.mjs: no rAF loop, the tool drives every frame
    window.__game = {
      start: () => startPlay(),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { skipping = true; for (let s = 0; s < sec; s += STEP) step(STEP); skipping = false; settleGrowth(); flushGround(true); lushTarget(); lush = lushGoal; refreshHills(); fx.clear(); glow.clear(); snapPonds(); popAcc = 0; refreshHud(); refreshDock(true); updateCamera(0, true); },
      sim: (sec) => { skipping = true; for (let s = 0; s < sec; s += STEP) { step(STEP); if (save.goalHit) break; } skipping = false; },
      info: () => ({ state, time: run.time, season: save.season, petals: Math.floor(save.petals), income: income(), full: fullCount, sprouts: sproutCount, goal: seasonGoal(), goalHit: save.goalHit, zones: open.filter(Boolean).length, zt: run.zoneTimes || [], up: { ...save.up }, seeds: save.seeds, seasonPetals: save.seasonPetals, harvests }),
      cover: (kind) => stageCover(kind),
      ui: (name) => { if (name === 'away') showAway(income() * 3600 * CFG.awayRate || 1234); if (name === 'pause') togglePause(); if (name === 'settings') openSettings(); if (name === 'seasonEnd') openSeasonEnd(); }, // screen review
    };
    render(0);
    return;
  }
  requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
