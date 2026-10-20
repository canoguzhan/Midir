// Whirlbash: spinning-top arena brawler (io-style, against bots). Sections: CONFIG, I18N, SDK, AUDIO, SAVE, PARTS, WORLD,
// TOPS, SPARKS, FX, INPUT, STATE, UI, GAMEPLAY, AI, EVENTS, TUTORIAL, LOOP, COVER, BOOT.
// Every top, the arena and the icons are procedural (one coherent toy-plastic look); audio loads from ./assets/ with synth
// fallbacks. No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';

// ================================================================ CONFIG
const SAVE_KEY = 'whirlbash';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // the player's top is driven by the bot brain (trailer footage, balance tests)
const CFG = {
  arenaR: 24, pitCount: 3, pitHalf: 0.16, bowlLift: 0.7, bowlPull: 2.2,
  bots: 11, sparks: 130, sparkMax: 220, sparkValue: 4, magnet: 1.4,
  startSpin: 100, maxSpin: 1500, decay: 0.7, decayGrowth: 1 / 500, dashCost: 1.5,
  accel: 24, maxSpeed: 8.5, damping: 1.4,
  dashSpeed: 14, dashTime: 0.32, dashCooldown: 1.7,
  restitution: 0.8, repel: 5, grind: 1.2, clashBase: 0.5, clashSpeed: 0.5, bumpSpeed: 3.5, dashMul: 1.7, maxHit: 22, shield: 2.5, pairCooldown: 0.9,
  wallBounce: 0.55, wallLoss: 0.25,
  ringoutSteal: 0.35, toppleDrop: 0.45, koPoints: 40, ringoutPoints: 60,
  eventFirst: 30, eventEvery: 38, tiltForce: 5.5, overdrive: 1.35,
  respawn: 3, aggroRamp: 120, graceTime: 18,
};
const R = CFG.arenaR;
const PIT_ANGLES = Array.from({ length: CFG.pitCount }, (_, i) => -Math.PI / 2 + (i * Math.PI * 2) / CFG.pitCount + Math.PI / CFG.pitCount);
const SFX_FILES = {
  clash: 'assets/audio/whirl_clash.mp3', clashHeavy: 'assets/audio/whirl_clash_heavy.mp3', dash: 'assets/audio/whirl_dash.mp3',
  ringout: 'assets/audio/whirl_ringout.mp3', topple: 'assets/audio/whirl_topple.mp3', hum: 'assets/audio/whirl_hum.mp3',
  launch: 'assets/audio/whirl_launch.mp3', cheer: 'assets/audio/whirl_cheer.mp3', event: 'assets/audio/whirl_event.mp3',
  wall: 'assets/audio/whirl_wall.mp3', spark: 'assets/audio/dash_gem.mp3', click: 'assets/audio/ui_click.mp3',
  upgrade: 'assets/audio/upgrade.mp3', unlock: 'assets/audio/unlock.mp3', over: 'assets/audio/defeat.mp3', count: 'assets/audio/countdown.mp3',
};
const VOICE_FILES = { // {lang} is filled in at boot (en / tr)
  ringout: 'assets/audio/voice/wb_ringout_{lang}.mp3', topple: 'assets/audio/voice/wb_topple_{lang}.mp3', leader: 'assets/audio/voice/wb_leader_{lang}.mp3',
  storm: 'assets/audio/voice/wb_storm_{lang}.mp3', tilt: 'assets/audio/voice/wb_tilt_{lang}.mp3', overdrive: 'assets/audio/voice/wb_overdrive_{lang}.mp3',
  go: 'assets/audio/voice/wb_go_{lang}.mp3',
};
const MUSIC = 'assets/audio/bgm_whirl_arena.mp3';

// ================================================================ I18N (English required; Turkish written natively)
const STRINGS = {
  en: {
    play: 'Play', garage: 'Garage', done: 'Done', best: 'Best', tagline: 'Spin. Clash. Knock rivals out of the ring!', paused: 'Paused', resume: 'Resume',
    menu: 'Menu', again: 'Play again', eliminated: 'Eliminated!', newBest: 'New best!', rank: 'Best rank', kosLabel: 'Knockouts', peak: 'Peak spin',
    time: 'Time', gears: 'gears', double: 'Double gears', doubled: 'Gears doubled!', adUnavailable: 'Ad not available right now', skip: 'Skip',
    byRingout: 'Knocked into a pit by {n}', byTopple: 'Spun out by {n}', selfRingout: 'You fell into a pit', selfTopple: 'You ran out of spin',
    you: 'You', ctlMove: 'Move', ctlDash: 'Dash', ctlPause: 'Pause', ctlMouse: 'Mouse', ctlClick: 'Click', ctlDrag: 'Drag to move', ctlTap: 'Tap the bolt to dash',
    tutStep: 'Tutorial {i}/4', tutMove: 'Move your top', tutSparks: 'Grab sparks to grow', tutDash: 'Dash into the practice top!', tutPits: 'Push rivals into the glowing pits!',
    tutDone: 'Now become #1!', dummy: 'Practice Top',
    ev_storm: 'Spark Storm!', ev_stormSub: 'Sparks are raining down', ev_tilt: 'Arena Tilt!', ev_tiltSub: 'Everything slides toward a pit',
    ev_overdrive: 'Overdrive!', ev_overdriveSub: 'Everyone is faster', ringout: 'Ring out!', topple: 'Toppled!', leader: "You're #1!", leaderDown: 'Leader down! x2',
    go: 'Spin!', feedRing: 'rang out', feedTopple: 'toppled', fell: 'fell', spunOut: 'spun out',
    tab_crown: 'Crown', tab_core: 'Core', tab_tip: 'Tip', tab_paint: 'Paint', st_atk: 'Attack', st_def: 'Defense', st_sta: 'Stamina', st_spd: 'Speed',
    equipped: 'Equipped', owned: 'Owned', notEnough: 'Not enough gears', unlocked: 'Unlocked!',
    p_halo: 'Halo', d_halo: 'Balanced all-rounder', p_razor: 'Razor', d_razor: 'Hooked blades: big hits', p_bastion: 'Bastion', d_bastion: 'Thick walls: shrugs off hits',
    p_comet: 'Comet', d_comet: 'Swept fins: fast and fierce',
    p_gyro: 'Gyro', d_gyro: 'Balanced weight', p_iron: 'Iron', d_iron: 'Heavy: hard to push', p_feather: 'Feather', d_feather: 'Light and quick',
    p_heart: 'Heartcore', d_heart: 'Spins much longer',
    p_dome: 'Dome', d_dome: 'Steady control', p_grip: 'Grip', d_grip: 'Sharp turns', p_glide: 'Glide', d_glide: 'High top speed', p_needle: 'Needle', d_needle: 'Loses spin slower',
    c_sun: 'Sunburst', c_coral: 'Coral', c_mint: 'Mint', c_sky: 'Sky', c_violet: 'Violet', c_lime: 'Lime', c_tangerine: 'Tangerine', c_snow: 'Snow',
  },
  tr: {
    play: 'Oyna', garage: 'Garaj', done: 'Tamam', best: 'En iyi', tagline: 'Dön. Çarpış. Rakiplerini pistten at!', paused: 'Duraklatıldı', resume: 'Devam',
    menu: 'Menü', again: 'Tekrar oyna', eliminated: 'Elendin!', newBest: 'Yeni rekor!', rank: 'En iyi sıra', kosLabel: 'Nakavt', peak: 'En yüksek dönüş',
    time: 'Süre', gears: 'dişli', double: 'Dişlileri ikiye katla', doubled: 'Dişliler ikiye katlandı!', adUnavailable: 'Şu anda reklam yok', skip: 'Geç',
    byRingout: '{n} seni çukura itti', byTopple: '{n} dönüşünü bitirdi', selfRingout: 'Çukura düştün', selfTopple: 'Dönüşün bitti',
    you: 'Sen', ctlMove: 'Hareket', ctlDash: 'Atıl', ctlPause: 'Duraklat', ctlMouse: 'Fare', ctlClick: 'Tıkla', ctlDrag: 'Hareket için sürükle', ctlTap: 'Atılmak için şimşeğe dokun',
    tutStep: 'Eğitim {i}/4', tutMove: 'Topacını hareket ettir', tutSparks: 'Büyümek için kıvılcım topla', tutDash: 'Antrenman topacına atıl!', tutPits: 'Rakipleri parlayan çukurlara it!',
    tutDone: 'Şimdi 1 numara ol!', dummy: 'Antrenman Topacı',
    ev_storm: 'Kıvılcım Fırtınası!', ev_stormSub: 'Gökten kıvılcım yağıyor', ev_tilt: 'Arena Eğiliyor!', ev_tiltSub: 'Her şey bir çukura kayıyor',
    ev_overdrive: 'Aşırı Hız!', ev_overdriveSub: 'Herkes daha hızlı', ringout: 'Pist dışı!', topple: 'Devrildi!', leader: '1 numara sensin!', leaderDown: 'Lider düştü! x2',
    go: 'Dön!', feedRing: 'çukura itti:', feedTopple: 'devirdi:', fell: 'düştü', spunOut: 'durdu',
    tab_crown: 'Taç', tab_core: 'Çekirdek', tab_tip: 'Uç', tab_paint: 'Boya', st_atk: 'Saldırı', st_def: 'Savunma', st_sta: 'Dayanıklılık', st_spd: 'Hız',
    equipped: 'Takılı', owned: 'Sende', notEnough: 'Yeterli dişli yok', unlocked: 'Açıldı!',
    p_halo: 'Hale', d_halo: 'Her işe yarar, dengeli', p_razor: 'Ustura', d_razor: 'Kancalı bıçaklar: sert vuruş', p_bastion: 'Kale', d_bastion: 'Kalın duvarlar: darbelere dayanır',
    p_comet: 'Kuyruklu Yıldız', d_comet: 'Kavisli kanatlar: hızlı ve sert',
    p_gyro: 'Jiro', d_gyro: 'Dengeli ağırlık', p_iron: 'Demir', d_iron: 'Ağır: itmesi zor', p_feather: 'Tüy', d_feather: 'Hafif ve çevik',
    p_heart: 'Kalp', d_heart: 'Çok daha uzun döner',
    p_dome: 'Kubbe', d_dome: 'Sabit kontrol', p_grip: 'Tutuş', d_grip: 'Keskin dönüşler', p_glide: 'Kayış', d_glide: 'Yüksek azami hız', p_needle: 'İğne', d_needle: 'Dönüşünü yavaş kaybeder',
    c_sun: 'Güneş', c_coral: 'Mercan', c_mint: 'Nane', c_sky: 'Gök', c_violet: 'Menekşe', c_lime: 'Misket', c_tangerine: 'Mandalina', c_snow: 'Kar',
  },
};
let lang = 'en';
const t = (k, vars) => { let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
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
function happytime() { if (!CAPTURE) sdkCall((s) => s.game.happytime()); } // sparingly: new best score, first time at #1 in a run

// Midgame: only between runs, never on navigation buttons. Mute on adStarted (not on request); always continue.
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
  clash: ['square', 1800, 600, 0.12, 0.09], clashHeavy: ['sawtooth', 700, 120, 0.3, 0.14], dash: ['sine', 300, 1400, 0.2, 0.12],
  ringout: ['triangle', 900, 80, 0.9, 0.16], topple: ['triangle', 500, 90, 0.6, 0.14], launch: ['sine', 200, 1600, 0.25, 0.1],
  cheer: ['triangle', 600, 900, 0.3, 0.06], event: ['square', 660, 990, 0.35, 0.08], wall: ['sine', 220, 120, 0.12, 0.12],
  spark: ['square', 1320, 1980, 0.08, 0.06], click: ['square', 900, 900, 0.03, 0.07], upgrade: ['triangle', 520, 1040, 0.3, 0.12],
  unlock: ['triangle', 660, 1320, 0.4, 0.12], over: ['triangle', 440, 110, 0.8, 0.16], count: ['square', 880, 880, 0.08, 0.08],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, wantMusic: false, musicVol: 0.3, muted: new Set(), voices: 0, hum: null, last: {} };

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
  if (audio.muted.size || !audio.ctx || audio.voices > 14 || vol <= 0.02) return;
  const now = audio.ctx.currentTime;
  if (audio.last[key] && now - audio.last[key] < 0.05) return; // the same sound twice in one frame burst is just louder noise
  audio.last[key] = now;
  const b = audio.buffers[key], g = audio.ctx.createGain();
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12); g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  if (key.startsWith('v_')) { audio.voices--; return; } // a missing voice line stays silent (the banner shows the text)
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
const voice = (k) => playSfx(`v_${k}`, 0.95);
function startHum() { // the player's own top: a looping whirr whose pitch follows spin and speed
  stopHum(); if (!audio.ctx) return;
  const g = audio.ctx.createGain(); g.gain.value = 0; g.connect(audio.master);
  let src;
  if (audio.buffers.hum) { src = audio.ctx.createBufferSource(); src.buffer = audio.buffers.hum; src.loop = true; }
  else { src = audio.ctx.createOscillator(); src.type = 'triangle'; src.frequency.value = 180; }
  src.connect(g); src.start(); audio.hum = { src, g };
}
function updateHum(level, pitch) {
  if (!audio.hum) return;
  const now = audio.ctx.currentTime;
  audio.hum.g.gain.setTargetAtTime(level, now, 0.08);
  if (audio.hum.src.playbackRate) audio.hum.src.playbackRate.setTargetAtTime(pitch, now, 0.1); else audio.hum.src.frequency.setTargetAtTime(140 + pitch * 90, now, 0.1);
}
function stopHum() { if (!audio.hum) return; try { audio.hum.src.stop(); } catch {} audio.hum.g.disconnect(); audio.hum = null; }
function playMusic(vol = audio.musicVol) {
  audio.wantMusic = true; audio.musicVol = vol;
  if (!audio.music && MUSIC) { audio.music = new Audio(MUSIC); audio.music.loop = true; audio.music.onerror = () => { audio.music = null; }; }
  if (audio.music) { audio.music.volume = vol; if (!audio.muted.size) audio.music.play().catch(() => {}); }
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
}

// ================================================================ SAVE
const DEFAULT_SAVE = () => ({
  best: 0, gears: 0, runs: 0, tut: false,
  owned: { crown: ['halo'], core: ['gyro'], tip: ['dome'], paint: ['sun', 'coral', 'mint'] },
  sel: { crown: 'halo', core: 'gyro', tip: 'dome', paint: 'sun' },
});
let save = DEFAULT_SAVE();
function loadSave() {
  const d = DEFAULT_SAVE(), s = loadData(`${SAVE_KEY}:save`, null) || {};
  save = { ...d, ...s, owned: { ...d.owned, ...(s.owned || {}) }, sel: { ...d.sel, ...(s.sel || {}) } };
}
const persist = () => saveData(`${SAVE_KEY}:save`, save);

// ================================================================ PARTS (garage: crown = attack ring, core = weight disk, tip = movement)
const PARTS = {
  crown: [
    { id: 'halo', cost: 0, atk: 1, def: 1, spd: 1 },
    { id: 'razor', cost: 150, atk: 1.35, def: 0.85, spd: 1 },
    { id: 'bastion', cost: 150, atk: 0.85, def: 1.4, spd: 0.96 },
    { id: 'comet', cost: 400, atk: 1.2, def: 0.95, spd: 1.08 },
  ],
  core: [
    { id: 'gyro', cost: 0, mass: 1, sta: 1, spd: 1 },
    { id: 'iron', cost: 180, mass: 1.4, sta: 0.95, spd: 0.9 },
    { id: 'feather', cost: 180, mass: 0.75, sta: 1, spd: 1.12 },
    { id: 'heart', cost: 450, mass: 1, sta: 1.45, spd: 1 },
  ],
  tip: [
    { id: 'dome', cost: 0, acc: 1, spd: 1, sta: 1 },
    { id: 'grip', cost: 120, acc: 1.4, spd: 0.92, sta: 1 },
    { id: 'glide', cost: 120, acc: 0.85, spd: 1.2, sta: 1 },
    { id: 'needle', cost: 300, acc: 0.9, spd: 1, sta: 1.3 },
  ],
  paint: [
    { id: 'sun', cost: 0, c: '#ffc531' }, { id: 'coral', cost: 0, c: '#ff5d73' }, { id: 'mint', cost: 0, c: '#3ee0a1' }, { id: 'sky', cost: 80, c: '#4cb8ff' },
    { id: 'violet', cost: 80, c: '#a77bff' }, { id: 'lime', cost: 80, c: '#b6f03c' }, { id: 'tangerine', cost: 120, c: '#ff8a3d' }, { id: 'snow', cost: 120, c: '#eef1f8' },
  ],
};
const part = (kind, id) => PARTS[kind].find((p) => p.id === id) || PARTS[kind][0];
function statsOf(p) {
  const c = part('crown', p.crown), k = part('core', p.core), tp = part('tip', p.tip);
  return { atk: c.atk, def: c.def, mass: k.mass, sta: k.sta * tp.sta, spd: c.spd * k.spd * tp.spd, acc: tp.acc };
}
function displayStats(p) { // 0..1 bars for the garage
  const s = statsOf(p), n = (v) => Math.max(0.05, Math.min(1, (v - 0.6) / 1.0));
  return { atk: n(s.atk), def: n(s.def * Math.sqrt(s.mass)), sta: n(s.sta), spd: n(s.spd * Math.pow(s.acc, 0.4)) };
}
const randomParts = () => ({
  crown: PARTS.crown[(Math.random() * 4) | 0].id, core: PARTS.core[(Math.random() * 4) | 0].id, tip: PARTS.tip[(Math.random() * 4) | 0].id,
  paint: PARTS.paint[(Math.random() * PARTS.paint.length) | 0].id,
});

// ================================================================ WORLD (night stadium: glossy cobalt bowl, bumper walls, three glowing pits)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#15123a'); scene.fog = new THREE.Fog('#15123a', 60, 130);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
let shakeAmt = 0;
const bowlY = (r) => CFG.bowlLift * Math.min(1, (r / R) ** 2);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
let crowd = null, crowdBase = [], beams = [], chevrons = null, pitGlows = [];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

function buildWorld() {
  scene.add(new THREE.HemisphereLight('#c9d0ff', '#2a1d4a', 1.25));
  const sun = new THREE.DirectionalLight('#ffffff', 2.3); sun.position.set(10, 30, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 80 }); sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rimLight = new THREE.DirectionalLight('#ff7fd0', 0.6); rimLight.position.set(-20, 10, -20); scene.add(rimLight);

  // bowl floor: lathe profile with planar UVs so the painted rings stay round
  const prof = []; for (let i = 0; i <= 32; i++) { const r = (i / 32) * (R + 0.3); prof.push(new THREE.Vector2(r, bowlY(Math.min(r, R)))); }
  const floorGeo = new THREE.LatheGeometry(prof, 128), pos = floorGeo.attributes.position, uv = floorGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * (R + 0.3)) + 0.5, pos.getZ(i) / (2 * (R + 0.3)) + 0.5);
  const floorTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2, rr = c;
    const grad = g.createRadialGradient(c, c, 0, c, c, rr); grad.addColorStop(0, '#3a52d6'); grad.addColorStop(0.7, '#2738a8'); grad.addColorStop(1, '#1b2580');
    g.fillStyle = grad; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(140, 165, 255, .28)'; g.lineWidth = 3;
    for (let a = 0; a < 24; a++) { g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos((a / 24) * Math.PI * 2) * rr, c + Math.sin((a / 24) * Math.PI * 2) * rr); g.stroke(); }
    for (const [f, lw, col] of [[0.2, 6, 'rgba(130, 160, 255, .5)'], [0.42, 5, 'rgba(130, 160, 255, .45)'], [0.64, 8, 'rgba(255, 197, 49, .55)'], [0.86, 5, 'rgba(130, 160, 255, .45)'], [0.985, 10, 'rgba(255, 232, 194, .8)']]) {
      g.lineWidth = lw; g.strokeStyle = col; g.beginPath(); g.arc(c, c, rr * f, 0, Math.PI * 2); g.stroke();
    }
    g.lineCap = 'round'; g.lineWidth = 7; g.strokeStyle = 'rgba(255, 214, 92, .55)'; // centre swirl emblem
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(c, c, rr * 0.1, (k * Math.PI * 2) / 3, (k * Math.PI * 2) / 3 + 1.5); g.stroke(); }
    g.fillStyle = 'rgba(255, 232, 194, .7)';
    for (let a = 0; a < 72; a++) { const ang = (a / 72) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(ang) * rr * 0.93, c + Math.sin(ang) * rr * 0.93, 4, 0, Math.PI * 2); g.fill(); }
  });
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide }));
  floor.receiveShadow = true; scene.add(floor);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R * 0.7, 9, 96, 1, true), new THREE.MeshStandardMaterial({ color: '#1a1850', roughness: 0.8, side: THREE.DoubleSide }));
  skirt.position.y = bowlY(R) - 4.5; scene.add(skirt);

  // bumper walls between the pits: alternating coral / cream segments on a dark base
  const segMat = [new THREE.MeshStandardMaterial({ color: '#ff5d73', roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: '#ffe8c2', roughness: 0.35 })];
  const baseMat = new THREE.MeshStandardMaterial({ color: '#2b2a72', roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < CFG.pitCount; i++) {
    const a0 = PIT_ANGLES[i] + CFG.pitHalf, a1 = PIT_ANGLES[(i + 1) % CFG.pitCount] - CFG.pitHalf + (i === CFG.pitCount - 1 ? Math.PI * 2 : 0);
    const len = a1 - a0, n = 7;
    for (let s = 0; s < n; s++) {
      const seg = new THREE.Mesh(new THREE.TorusGeometry(R + 0.5, 0.5, 12, 24, len / n - 0.004), segMat[s % 2]);
      seg.geometry.rotateX(Math.PI / 2); seg.rotation.y = -(a0 + (s * len) / n); seg.position.y = bowlY(R) + 0.45; seg.castShadow = true; scene.add(seg);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.9, R + 0.9, 1.1, 48, 1, true, Math.PI / 2 - a1, len), baseMat);
    base.position.y = bowlY(R) + 0.05; scene.add(base);
    for (const ang of [a0, a1]) { // posts at both ends of each wall
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 1.6, 16), new THREE.MeshStandardMaterial({ color: '#ffc531', roughness: 0.3, metalness: 0.2 }));
      post.position.set(Math.cos(ang) * (R + 0.5), bowlY(R) + 0.7, Math.sin(ang) * (R + 0.5)); post.castShadow = true; scene.add(post);
    }
  }
  // pits: hazard stripes on the lip + a glowing curtain dropping into the dark
  const stripeTex = canvasTex(256, 256, (g, w) => { g.fillStyle = '#ffc531'; g.fillRect(0, 0, w, w); g.fillStyle = '#1d1d3a'; for (let k = -w; k < w * 2; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 0); g.lineTo(k + 32 - w, w); g.lineTo(k - w, w); g.fill(); } });
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.repeat.set(6, 6);
  const glowTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255, 93, 115, 1)'); gr.addColorStop(0.5, 'rgba(255, 60, 90, .35)'); gr.addColorStop(1, 'rgba(255, 60, 90, 0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const pa of PIT_ANGLES) {
    const lip = new THREE.Mesh(new THREE.RingGeometry(R - 1.3, R + 0.05, 24, 1, -(pa + CFG.pitHalf), CFG.pitHalf * 2), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.4, transparent: true, opacity: 0.95 }));
    lip.rotation.x = -Math.PI / 2; lip.position.y = bowlY(R) + 0.02; scene.add(lip); // XY ring laid flat: angle t lands at -t, hence the negated start
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 5, 24, 1, true, Math.PI / 2 - pa - CFG.pitHalf, CFG.pitHalf * 2),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.position.y = bowlY(R) - 2.5; scene.add(glow); pitGlows.push(glow);
  }
  // tilt-event chevrons (hidden until an Arena Tilt)
  chevrons = new THREE.Group(); chevrons.visible = false;
  const vShape = new THREE.Shape(); vShape.moveTo(-1.4, -0.6); vShape.lineTo(0, 0.6); vShape.lineTo(1.4, -0.6); vShape.lineTo(1.4, -1.3); vShape.lineTo(0, -0.1); vShape.lineTo(-1.4, -1.3);
  const vGeo = new THREE.ShapeGeometry(vShape); vGeo.rotateX(-Math.PI / 2);
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(vGeo, new THREE.MeshBasicMaterial({ color: '#ffc531', transparent: true, opacity: 0.7, depthWrite: false }));
    m.rotation.y = -Math.PI / 2; m.position.set(4 + k * 3.2, 0.06, 0); m.userData.k = k; chevrons.add(m);
  }
  scene.add(chevrons);

  // bleachers + crowd, sky dome, light beams: the stadium around the bowl
  const steps = []; for (let s = 0; s < 5; s++) { steps.push(new THREE.Vector2(R + 7 + s * 2.4, -1 + s * 1.5), new THREE.Vector2(R + 7 + (s + 1) * 2.4, -1 + s * 1.5)); }
  steps.push(new THREE.Vector2(R + 7 + 5 * 2.4, -10));
  const stands = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(R + 7, -10), ...steps], 96), new THREE.MeshStandardMaterial({ color: '#2a2860', roughness: 0.9, side: THREE.DoubleSide }));
  scene.add(stands);
  const cols = ['#ff5d73', '#ffc531', '#3ee0a1', '#4cb8ff', '#a77bff', '#ffe8c2', '#ff8a3d'];
  const N = 640; crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const row = i % 5, a = Math.random() * Math.PI * 2, r = R + 8.2 + row * 2.4 + rand(-0.3, 0.3);
    if (PIT_ANGLES.some((p) => Math.abs(angDiff(a, p)) < 0.05)) { tmp.position.set(0, -50, 0); tmp.scale.setScalar(0); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix); tmp.scale.setScalar(1); continue; }
    crowdBase[i] = { x: Math.cos(a) * r, y: -1 + row * 1.5 + 0.55, z: Math.sin(a) * r, ph: Math.random() * 6.28 };
    tmp.position.set(crowdBase[i].x, crowdBase[i].y, crowdBase[i].z); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix);
    crowd.setColorAt(i, col.set(cols[(Math.random() * cols.length) | 0]));
  }
  scene.add(crowd);
  const domeGeo = new THREE.SphereGeometry(200, 32, 16), dc = [], top = new THREE.Color('#0c0a26'), mid = new THREE.Color('#3a1f6c');
  for (let i = 0; i < domeGeo.attributes.position.count; i++) { const y = domeGeo.attributes.position.getY(i) / 200; const c = mid.clone().lerp(top, clamp(y * 1.6, 0, 1)); dc.push(c.r, c.g, c.b); }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
  scene.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  const beamGeo = new THREE.CylinderGeometry(0.4, 5, 60, 24, 1, true); beamGeo.translate(0, -30, 0);
  ['#7fd8ff', '#ff7fd0', '#7fd8ff', '#ff7fd0'].forEach((c, i) => {
    const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const a = (i / 4) * Math.PI * 2 + 0.4; b.position.set(Math.cos(a) * (R + 22), 34, Math.sin(a) * (R + 22)); b.userData.a = a; scene.add(b); beams.push(b);
  });
}

// ================================================================ TOPS (procedural meshes: tip + core + crown + cap, all spinning)
const geoCache = {};
const cached = (k, make) => (geoCache[k] ??= make());
function crownGeometry(id) {
  return cached(`crown:${id}`, () => {
    const shape = new THREE.Shape(), N = 180, TAU = Math.PI * 2;
    const rad = (a) => {
      const u = (k) => (((a / TAU) * k) % 1 + 1) % 1;
      switch (id) {
        case 'razor': return 0.68 + 0.34 * Math.pow(u(3), 2.2); // three hooked blades
        case 'bastion': { const seg = Math.PI / 4, m = (((a % seg) + seg) % seg) - seg / 2; return (0.93 * Math.cos(seg / 2)) / Math.cos(m); } // octagon
        case 'comet': return 0.66 + 0.34 * Math.pow(u(4), 0.55) * (1 - Math.pow(u(4), 10)); // four swept fins
        default: return 0.9 + 0.1 * Math.pow(Math.max(0, Math.cos(a * 6)), 3); // halo: six soft bumps
      }
    };
    for (let i = 0; i <= N; i++) { const a = (i / N) * TAU, r = rad(a); if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.36, 0, TAU, true); shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0.47, 0); return g;
  });
}
function buildTopMesh(parts, paintId, accentHex) {
  const color = part('paint', paintId).c;
  const plastic = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.08 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c9d3e6', roughness: 0.25, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2d4a', roughness: 0.45, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.6, roughness: 0.3 });
  const root = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group();
  root.add(tilt); tilt.add(spin);
  const add = (geo, mat, y = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = cast; spin.add(m); return m; };
  // tip
  switch (parts.tip) {
    case 'grip': add(cached('tip:grip', () => new THREE.CylinderGeometry(0.3, 0.26, 0.2, 24)), dark, 0.1); add(cached('tip:gripRing', () => new THREE.TorusGeometry(0.28, 0.035, 6, 24).rotateX(Math.PI / 2)), accent, 0.17); break;
    case 'glide': add(cached('tip:ball', () => new THREE.SphereGeometry(0.13, 16, 10)), metal, 0.13); add(cached('tip:glideCone', () => new THREE.ConeGeometry(0.28, 0.16, 20).rotateX(Math.PI)), dark, 0.27); break;
    case 'needle': add(cached('tip:needle', () => new THREE.ConeGeometry(0.22, 0.36, 20).rotateX(Math.PI)), metal, 0.18); break;
    default: add(cached('tip:dome', () => new THREE.SphereGeometry(0.24, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), dark, 0.24);
  }
  // core
  switch (parts.core) {
    case 'iron': add(cached('core:iron', () => new THREE.CylinderGeometry(0.72, 0.5, 0.3, 8)), new THREE.MeshStandardMaterial({ color: '#5a5f78', roughness: 0.35, metalness: 0.9, flatShading: true }), 0.34); break;
    case 'feather': add(cached('core:featherRing', () => new THREE.TorusGeometry(0.5, 0.08, 8, 40).rotateX(Math.PI / 2)), metal, 0.36); add(cached('core:featherHub', () => new THREE.CylinderGeometry(0.32, 0.26, 0.26, 24)), metal, 0.33); break;
    case 'heart':
      add(cached('core:gyro', () => new THREE.CylinderGeometry(0.6, 0.4, 0.26, 32)), metal, 0.33);
      for (let k = 0; k < 4; k++) { const gem = add(cached('core:gem', () => new THREE.SphereGeometry(0.09, 12, 8)), accent, 0.4); gem.position.x = Math.cos((k * Math.PI) / 2) * 0.52; gem.position.z = Math.sin((k * Math.PI) / 2) * 0.52; }
      break;
    default: add(cached('core:gyro', () => new THREE.CylinderGeometry(0.6, 0.4, 0.26, 32)), metal, 0.33);
  }
  // crown (attack ring) in the top's paint, cap + three-stripe emblem so the spin direction reads
  add(crownGeometry(parts.crown), plastic);
  add(cached('cap', () => new THREE.CylinderGeometry(0.34, 0.42, 0.16, 32)), plastic, 0.71);
  add(cached('emblem', () => new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24)), dark, 0.8, false);
  for (let k = 0; k < 3; k++) { const s = add(cached('stripe', () => new THREE.BoxGeometry(0.06, 0.03, 0.2).translate(0, 0, 0.1)), accent, 0.83, false); s.rotation.y = (k * Math.PI * 2) / 3; }
  // motion blur disc (fake: a translucent ring that brightens with spin speed)
  const blurTex = cached('blurTex', () => canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, w * 0.18, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(0.85, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }));
  const blur = new THREE.Mesh(cached('blurDisc', () => new THREE.CircleGeometry(1.08, 40).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: blurTex, color, transparent: true, opacity: 0.4, depthWrite: false }));
  blur.position.y = 0.56; tilt.add(blur);
  // ground ring (team colour; the player's is gold and pulses when dash is ready)
  const ring = new THREE.Mesh(cached('groundRing', () => new THREE.RingGeometry(1.1, 1.32, 48).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.position.y = 0.03; root.add(ring);
  return { root, tilt, spin, blur, ring, mats: [plastic, metal, dark, accent, blur.material, ring.material] };
}
function disposeTopMesh(m) { scene.remove(m.root); for (const mat of m.mats) mat.dispose(); m.root.traverse((o) => { if (o.material && !m.mats.includes(o.material)) o.material.dispose?.(); }); }

function labelSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const g = c.getContext('2d'); g.font = '800 64px UI, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(14, 12, 40, .9)'; g.lineJoin = 'round'; g.strokeText(text, 256, 58); g.fillStyle = color; g.fillText(text, 256, 58);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true })); s.renderOrder = 10; return s;
}
const crownSprite = (() => {
  const tex = canvasTex(128, 128, (g) => { g.fillStyle = '#ffc531'; g.strokeStyle = '#3b1d00'; g.lineWidth = 8; g.lineJoin = 'round'; g.beginPath(); g.moveTo(14, 40); g.lineTo(40, 64); g.lineTo(64, 22); g.lineTo(88, 64); g.lineTo(114, 40); g.lineTo(104, 104); g.lineTo(24, 104); g.closePath(); g.stroke(); g.fill(); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.renderOrder = 11; s.visible = false; return s;
})();

const SYL_A = ['Vor', 'Zip', 'Kra', 'Spi', 'Nim', 'Bly', 'Rax', 'Tor', 'Fen', 'Glim', 'Whi', 'Zor', 'Bri', 'Quo', 'Lux', 'Pyr', 'Dex', 'Mo', 'Sky', 'Jet', 'Rio', 'Kai', 'Nova', 'Pix', 'Zee', 'Ori', 'Bo', 'Tam'];
const SYL_B = ['tex', 'nix', 'dle', 'ra', 'zo', 'lo', 'ka', 'vin', 'bolt', 'spin', 'wick', 'rex', 'dash', 'fy', 'mo', 'ny', 'ro', 'lix', 'ton', 'whirl'];
function botName() {
  for (let i = 0; i < 20; i++) {
    const n = SYL_A[(Math.random() * SYL_A.length) | 0] + SYL_B[(Math.random() * SYL_B.length) | 0] + (Math.random() < 0.15 ? String(10 + ((Math.random() * 89) | 0)) : '');
    if (!tops.some((tp) => tp.name === n)) return n;
  }
  return 'Top' + ((Math.random() * 999) | 0);
}

const tops = []; let player = null, topId = 0;
const radiusOf = (spin) => 0.55 + 0.45 * Math.sqrt(Math.max(0, spin) / 100);
function makeTop({ parts, name, isPlayer = false, spin = CFG.startSpin }) {
  const accent = isPlayer ? '#ffffff' : '#ffe8c2';
  const mesh = buildTopMesh(parts, parts.paint, accent);
  if (isPlayer) { mesh.ring.material.color.set('#ffc531'); mesh.ring.material.opacity = 0.85; }
  const tp = {
    id: ++topId, name, isPlayer, parts, color: part('paint', parts.paint).c, stats: statsOf(parts), mesh,
    x: 0, z: 0, vx: 0, vz: 0, spin, peak: spin, r: radiusOf(spin), mass: 1, state: 'alive', timer: 0, fallY: 0, fallV: 0,
    dashT: 0, cd: 0, shield: 0, kos: 0, score: 0, lastHitBy: null, lastHitT: -99, hitWob: 0, prec: Math.random() * 6, faceX: 0, faceZ: 1,
    think: 0, goal: { x: 0, z: 0, dash: false }, skill: 0.6, aggro: 0.6, ai: 'normal', label: null, bestRank: 99,
  };
  tp.label = labelSprite(isPlayer ? t('you') : name, isPlayer ? '#ffc531' : '#ffffff'); scene.add(tp.label);
  scene.add(mesh.root); tops.push(tp); updateMass(tp); return tp;
}
function updateMass(tp) { tp.r = radiusOf(tp.spin); tp.mass = tp.r * tp.r * tp.stats.mass; }
function removeTop(tp) {
  disposeTopMesh(tp.mesh); scene.remove(tp.label); tp.label.material.map.dispose(); tp.label.material.dispose();
  const i = tops.indexOf(tp); if (i >= 0) tops.splice(i, 1);
}
function rebuildPlayerMesh() {
  if (!player) return;
  disposeTopMesh(player.mesh);
  player.parts = { ...save.sel }; player.stats = statsOf(player.parts); player.color = part('paint', player.parts.paint).c;
  player.mesh = buildTopMesh(player.parts, player.parts.paint, '#ffffff'); player.mesh.ring.material.color.set('#ffc531'); player.mesh.ring.material.opacity = 0.85;
  scene.add(player.mesh.root); updateMass(player);
}
const alive = (tp) => tp.state === 'alive';

// ================================================================ SPARKS (instanced pickups: grow your spin)
const sparks = []; let sparkMesh = null;
function initSparks() {
  sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb000', emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.2 }), CFG.sparkMax);
  sparkMesh.castShadow = false; sparkMesh.frustumCulled = false; scene.add(sparkMesh);
  for (let i = 0; i < CFG.sparkMax; i++) sparks.push({ on: false, x: 0, z: 0, y: 0.4, vx: 0, vz: 0, fall: 0, ph: Math.random() * 6, big: 0 });
}
function addSpark(x, z, { vx = 0, vz = 0, fall = 0, big = 0 } = {}) {
  const s = sparks.find((q) => !q.on); if (!s) return null;
  const r = Math.hypot(x, z), lim = R - 1.2; if (r > lim) { x *= lim / r; z *= lim / r; }
  Object.assign(s, { on: true, x, z, vx, vz, fall, big, y: 0.4 + fall }); return s;
}
function randomSparkSpot(maxR = R - 1.8) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * maxR; return [Math.cos(a) * r, Math.sin(a) * r]; }
function updateSparks(dt) {
  for (const s of sparks) {
    if (!s.on) continue;
    s.ph += dt * 3;
    if (s.fall > 0) { s.fall = Math.max(0, s.fall - dt * 9); s.y = 0.4 + s.fall; continue; }
    if (s.vx || s.vz) {
      s.x += s.vx * dt; s.z += s.vz * dt; const k = Math.exp(-3 * dt); s.vx *= k; s.vz *= k;
      if (Math.abs(s.vx) + Math.abs(s.vz) < 0.05) s.vx = s.vz = 0;
      const r = Math.hypot(s.x, s.z), lim = R - 1.2; if (r > lim) { s.x *= lim / r; s.z *= lim / r; s.vx = s.vz = 0; }
    }
  }
}
const sparkTmp = new THREE.Object3D();
function renderSparks() {
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (!s.on) sparkTmp.scale.setScalar(0);
    else {
      const sc = (s.big ? 1.25 + 0.25 * Math.sin(s.ph * 2) : 1) * (s.fall > 0 ? 0.8 : 1);
      sparkTmp.position.set(s.x, bowlY(Math.hypot(s.x, s.z)) + s.y + Math.sin(s.ph) * 0.1, s.z); sparkTmp.rotation.set(0, s.ph, 0); sparkTmp.scale.setScalar(sc);
    }
    sparkTmp.updateMatrix(); sparkMesh.setMatrixAt(i, sparkTmp.matrix);
  }
  sparkMesh.instanceMatrix.needsUpdate = true;
}

// ================================================================ FX (pooled additive sparks + shockwave rings, camera shake)
const particles = [], pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.32), pMats = {};
const pMat = (c) => (pMats[c] ??= new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
function burst(pos, color, n = 14, speed = 6, up = 1) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { if (particles.length > 360) return; p = new THREE.Mesh(pGeo, pMat(color)); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material = pMat(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.35 + Math.random() * 0.35;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6 * up, (Math.random() - 0.5) * speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 12 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 3));
    p.lookAt(p.position.x + p.userData.v.x, p.position.y + p.userData.v.y, p.position.z + p.userData.v.z);
  }
}
const waves = [];
function shockwave(x, y, z, size = 2, color = '#ffffff') {
  let w = waves.find((q) => !q.visible);
  if (!w) { w = new THREE.Mesh(cached('wave', () => new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); waves.push(w); scene.add(w); }
  w.material.color.set(color); w.visible = true; w.position.set(x, y + 0.1, z); w.userData = { life: 0.4, size };
}
function updateWaves(dt) {
  for (const w of waves) {
    if (!w.visible) continue; w.userData.life -= dt; if (w.userData.life <= 0) { w.visible = false; continue; }
    const k = 1 - w.userData.life / 0.4; w.scale.setScalar(0.5 + k * w.userData.size); w.material.opacity = 1 - k;
  }
}
function shake(a) { if (!CAPTURE || a < 0.5) shakeAmt = Math.max(shakeAmt, a); }
const nearVol = (x, z) => (player ? clamp(1.25 - Math.hypot(x - player.x, z - player.z) / 22, 0.12, 1) : 0.5);

// ================================================================ INPUT (keyboard, mouse steering + click dash, touch joystick + button)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, mouse = { on: false, sx: 0, sy: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) mouse.on = false;
  if (e.code === 'Space' && state === State.PLAYING) playerDash();
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && state === State.PLAYING) setState(State.PAUSED); });
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING) return;
  if (e.pointerType === 'mouse') { mouse.on = true; mouse.sx = e.clientX; mouse.sy = e.clientY; if (e.button === 0) playerDash(); return; }
  if (stick.id !== null) return;
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { if (Math.abs(e.clientX - mouse.sx) + Math.abs(e.clientY - mouse.sy) > 3) mouse.on = true; mouse.sx = e.clientX; mouse.sy = e.clientY; return; }
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy), max = 50;
  if (d > max) { dx *= max / d; dy *= max / d; }
  stick.x = dx / max; stick.y = dy / max; $('joystick').firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.on = false; });
const releaseStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; $('joystick').firstElementChild.style.transform = ''; };
canvas.addEventListener('pointerup', releaseStick); canvas.addEventListener('pointercancel', releaseStick);
$('btnAction').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); playerDash(); });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), hit = new THREE.Vector3();
function playerInput() { // x/z world direction; the camera has no yaw, so screen right = +x and screen down = +z
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0); // e.code is the physical key: ZQSD on AZERTY
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = stick.y; }
  else if (mouse.on && !x && !y) {
    ndc.set((mouse.sx / innerWidth) * 2 - 1, -(mouse.sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, hit)) { x = hit.x - player.x; y = hit.z - player.z; const l = Math.hypot(x, y); if (l < 1.6) { x /= 1.6; y /= 1.6; } else { x /= l; y /= l; } } // ease off near the cursor }
  }
  const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : l < 0.12 ? { x: 0, y: 0 } : { x, y };
}

// ================================================================ STATE (BOOT -> MENU <-> GARAGE, MENU -> PLAYING <-> PAUSED -> GAMEOVER)
const State = { BOOT: 'BOOT', MENU: 'MENU', GARAGE: 'GARAGE', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', COVER: 'COVER' };
let state = State.BOOT, run = null, simTime = 0;

function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU; $('garage').hidden = s !== State.GARAGE; $('paused').hidden = s !== State.PAUSED; $('gameover').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  $('btnAction').hidden = !(s === State.PLAYING && isTouch);
  $('dashKey').hidden = isTouch;
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; }
  if (s !== State.PLAYING && s !== State.PAUSED) { $('coach').hidden = true; $('countdown').hidden = true; }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, game over
  if (s === State.MENU || s === State.GARAGE) { playMusic(0.2); camera.clearViewOffset(); }
  if (s === State.PLAYING) playMusic(0.32);
  if (s === State.PAUSED || s === State.MENU || s === State.GAMEOVER) updateHum(0, 1);
}
function togglePause() {
  if (state === State.PLAYING) setState(State.PAUSED);
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2000); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

click('btnPlay', () => startRun());
click('btnGarage', () => openGarage());
click('btnOverGarage', () => { resetArena(); openGarage(); });
click('btnGarageDone', () => { setState(State.MENU); refreshMenu(); });
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { endRunSilently(); setState(State.MENU); refreshMenu(); });
click('btnMenu', () => { resetArena(); setState(State.MENU); refreshMenu(); }); // navigation: never an ad here
click('btnRetry', () => triggerMidgameAd(() => startRun())); // between runs: the right moment for a midgame ad
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.gears += run.gearsEarned; persist(); run.gearsEarned *= 2; $('overGears').textContent = run.gearsEarned; toast(t('doubled')); playSfx('unlock'); refreshMenu(); }, () => {});
});
click('btnSkipTut', () => finishTutorial(true));

// ================================================================ UI (menu, garage, HUD, leaderboard, feed, banners)
function controlsHTML() {
  const k = (s) => `<span class="key">${s}</span>`;
  if (isTouch) return `<span><svg><use href="#i-move"/></svg>${t('ctlDrag')}</span><span><svg class="gold"><use href="#i-dash"/></svg>${t('ctlTap')}</span>`;
  return `<span>${k('W')}${k('A')}${k('S')}${k('D')} / ${t('ctlMouse')}: ${t('ctlMove')}</span><span>${k('Space')} / ${t('ctlClick')}: ${t('ctlDash')}</span><span>${k('P')}: ${t('ctlPause')}</span>`;
}
function refreshMenu() {
  $('menuBest').textContent = save.best; $('menuGears').textContent = save.gears; $('garageGears').textContent = save.gears;
  const affordable = Object.entries(PARTS).some(([kind, list]) => list.some((p) => !save.owned[kind].includes(p.id) && p.cost <= save.gears));
  $('garageDot').hidden = !affordable;
}
let garageTab = 'crown';
function openGarage() { setState(State.GARAGE); renderGarage(); }
function renderGarage() {
  $('garageGears').textContent = save.gears;
  $('garageTabs').innerHTML = ['crown', 'core', 'tip', 'paint'].map((k) => `<button data-tab="${k}" class="${k === garageTab ? 'on' : ''}">${t('tab_' + k)}</button>`).join('');
  $('garageParts').innerHTML = PARTS[garageTab].map((p) => {
    const owned = save.owned[garageTab].includes(p.id), on = save.sel[garageTab] === p.id;
    const label = garageTab === 'paint' ? t('c_' + p.id) : t('p_' + p.id);
    const desc = garageTab === 'paint' ? `<span class="swatch" style="background:${p.c}"></span>` : `<small>${t('d_' + p.id)}</small>`;
    const status = on ? `<small>${t('equipped')}</small>` : owned ? `<small>${t('owned')}</small>` : `<span class="cost ${save.gears < p.cost ? 'no' : ''}"><svg><use href="#i-lock"/></svg>${p.cost}</span>`;
    return `<button class="part ${on ? 'on' : ''} ${owned ? '' : 'locked'}" data-id="${p.id}"><b>${label}</b>${desc}${status}</button>`;
  }).join('');
  const ds = displayStats(save.sel);
  $('garageStats').innerHTML = ['atk', 'def', 'sta', 'spd'].map((k) => `<span>${t('st_' + k)}</span><div class="bar"><i style="width:${Math.round(ds[k] * 100)}%"></i></div>`).join('');
  $('garageTabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { playSfx('click', 0.5); garageTab = b.dataset.tab; renderGarage(); }));
  $('garageParts').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectPart(garageTab, b.dataset.id)));
}
function selectPart(kind, id) {
  const p = part(kind, id);
  if (!save.owned[kind].includes(id)) {
    if (save.gears < p.cost) { toast(t('notEnough')); playSfx('wall', 0.6); return; }
    save.gears -= p.cost; save.owned[kind].push(id); toast(t('unlocked')); playSfx('unlock', 0.8);
  } else playSfx('upgrade', 0.5);
  save.sel[kind] = id; persist(); rebuildPlayerMesh(); renderGarage(); refreshMenu();
  if (player) { burst(new THREE.Vector3(player.x, 1, player.z), '#ffe066', 18, 5); shockwave(player.x, bowlY(0), player.z, 3, '#ffc531'); }
}

let boardTimer = 0, leader = null;
function rankList() { return tops.filter((tp) => alive(tp) || tp.state === 'spawn').sort((a, b) => b.spin - a.spin); }
function renderBoard() {
  const list = rankList(), me = list.indexOf(player), rows = [];
  const row = (tp, i, extra = '') => `<li class="${tp.isPlayer ? 'me' : ''} ${extra}"><span>${i === 0 ? '<svg><use href="#i-crown"/></svg>' : i + 1 + '.'}</span><i class="sw" style="background:${tp.color}"></i>${escapeHTML(tp.isPlayer ? t('you') : tp.name)}<b>${Math.round(tp.spin)}</b></li>`;
  list.slice(0, 5).forEach((tp, i) => rows.push(row(tp, i)));
  if (me >= 5) rows.push(row(player, me, 'gap'));
  $('board').innerHTML = rows.join('');
}
const escapeHTML = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function feed(killer, victim, how) {
  if (CAPTURE && !killer) return;
  const el = document.createElement('div'), name = (tp) => `<b style="color:${tp.isPlayer ? '#ffc531' : tp.color}">${escapeHTML(tp.isPlayer ? t('you') : tp.name)}</b>`;
  el.innerHTML = killer ? `${name(killer)}<em>${t(how === 'ringout' ? 'feedRing' : 'feedTopple')}</em>${name(victim)}` : `${name(victim)}<em>${t(how === 'ringout' ? 'fell' : 'spunOut')}</em>`;
  if (killer?.isPlayer || victim.isPlayer) el.className = 'me';
  const f = $('feed'); f.prepend(el); while (f.children.length > 4) f.lastChild.remove();
  setTimeout(() => el.remove(), 4500);
}
let bannerTimer = 0;
function banner(text, sub = '', bad = false, secs = 1.8) {
  const b = $('banner'); $('bannerText').textContent = text; $('bannerSub').textContent = sub; b.classList.toggle('bad', bad);
  b.hidden = true; void b.offsetWidth; b.hidden = false; bannerTimer = secs;
}
function updateHUD() {
  const p = player, frac = clamp(p.spin / Math.max(200, p.peak), 0, 1);
  $('spinBar').style.width = `${Math.round(frac * 100)}%`; $('spinBar').classList.toggle('low', p.spin < 30); $('spinVal').textContent = Math.max(0, Math.round(p.spin));
  $('score').textContent = p.score; $('kos').textContent = p.kos;
  const cd = p.cd > 0 ? 1 - p.cd / CFG.dashCooldown : 1;
  $('dashKey').style.setProperty('--cd', cd.toFixed(3)); $('btnAction').style.setProperty('--cd', cd.toFixed(3));
  if (run.event) { $('eventChip').hidden = false; $('eventName').textContent = t('ev_' + run.event.id).replace('!', ''); $('eventTime').textContent = `${Math.ceil(run.event.t)}s`; }
  else $('eventChip').hidden = true;
}

// ================================================================ GAMEPLAY
function resetArena() {
  stopHum();
  for (const tp of [...tops]) if (!tp.isPlayer) removeTop(tp);
  for (const s of sparks) s.on = false;
  pendingRespawns.length = 0;
  for (let i = 0; i < CFG.sparks; i++) addSpark(...randomSparkSpot());
  if (player) Object.assign(player, { x: 0, z: 0, vx: 0, vz: 0, spin: CFG.startSpin, peak: CFG.startSpin, state: 'alive', dashT: 0, cd: 0 });
  if (player) { player.mesh.root.visible = true; player.label.visible = true; updateMass(player); }
  for (let i = 0; i < CFG.bots; i++) spawnBot({ ring: i, idle: true });
  run = null; leader = null; crownSprite.visible = false; chevrons.visible = false;
}
function spawnBot({ ring = -1, idle = false, spin = null } = {}) {
  const parts = randomParts();
  if (player && parts.paint === player.parts.paint) parts.paint = PARTS.paint[(PARTS.paint.findIndex((p) => p.id === parts.paint) + 3) % PARTS.paint.length].id;
  const tm = run ? run.time : 0;
  const s = spin ?? Math.round(rand(80, 115) + Math.random() * Math.min(420, tm * 1.6));
  const b = makeTop({ parts, name: botName(), spin: s });
  let x, z;
  if (ring >= 0) { const a = (ring / CFG.bots) * Math.PI * 2 + 0.3, r = 9 + (ring % 3) * 4; x = Math.cos(a) * r; z = Math.sin(a) * r; }
  else for (let k = 0; k < 20; k++) { [x, z] = randomSparkSpot(R - 6); if (!player || Math.hypot(x - player.x, z - player.z) > 9) break; }
  Object.assign(b, { x, z, skill: rand(0.35, 0.95), aggro: rand(0.4, 1), ai: idle ? 'idle' : 'normal' });
  if (!idle) { b.state = 'spawn'; b.timer = 0.6; }
  return b;
}
function startRun() {
  resetArena();
  rebuildPlayerMesh();
  const tutorial = !save.tut && !CAPTURE;
  pairHits.clear();
  run = {
    time: 0, countdown: CAPTURE ? 0 : 2.6, score: 0, gearsEarned: 0, slow: 0, over: false, overTimer: 0, how: '', killer: null,
    nextEvent: CFG.eventFirst, event: null, lastEvent: '', leaderSaid: -99, wasLeader: false, happy: false, bestRank: 99,
    tutorial, tutStep: -1, tutMoved: 0, tutSparks: 0, tutDashHit: false, tutT: 0, dummy: null,
  };
  for (const tp of tops) { if (!tp.isPlayer) { tp.ai = tutorial ? 'passive' : 'normal'; tp.state = 'spawn'; tp.timer = 0.6 + Math.random() * 0.6; } }
  Object.assign(player, { kos: 0, score: 0, state: 'spawn', timer: 0.6, lastHitBy: null });
  save.runs++; persist();
  $('feed').innerHTML = ''; boardTimer = 0;
  setState(State.PLAYING); startHum();
  if (!CAPTURE) { voice('go'); playSfx('launch', 0.8); }
}
function endRunSilently() { stopHum(); if (run) run.over = true; resetArena(); }
function playerDash() { if (state === State.PLAYING && run && run.countdown <= 0 && alive(player)) dash(player, playerInput()); }
function dash(tp, dir) {
  if (tp.cd > 0 || !alive(tp)) return;
  let dx = dir.x, dz = dir.y;
  if (!dx && !dz) { const sp = Math.hypot(tp.vx, tp.vz); if (sp > 0.5) { dx = tp.vx / sp; dz = tp.vz / sp; } else { dx = tp.faceX; dz = tp.faceZ; } }
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  tp.vx += dx * CFG.dashSpeed; tp.vz += dz * CFG.dashSpeed; tp.dashT = CFG.dashTime; tp.cd = CFG.dashCooldown; tp.spin -= CFG.dashCost;
  const y = bowlY(Math.hypot(tp.x, tp.z)) + 0.4;
  burst(new THREE.Vector3(tp.x - dx * tp.r, y, tp.z - dz * tp.r), tp.isPlayer ? '#ffe066' : '#ffffff', 8, 4, 0.4);
  playSfx('dash', tp.isPlayer ? 0.7 : 0.35 * nearVol(tp.x, tp.z));
}

function simulate(dt) {
  const od = run?.event?.id === 'overdrive' ? CFG.overdrive : 1;
  const tilt = run?.event?.id === 'tilt' ? { x: Math.cos(PIT_ANGLES[run.event.pit]) * CFG.tiltForce, z: Math.sin(PIT_ANGLES[run.event.pit]) * CFG.tiltForce } : null;
  const frozen = run && run.countdown > 0;
  for (const tp of tops) {
    if (tp.state === 'spawn') { tp.timer -= dt; if (tp.timer <= 0) { tp.state = 'alive'; tp.shield = CFG.shield; if (!CAPTURE) playSfx('launch', 0.5 * nearVol(tp.x, tp.z)); burst(new THREE.Vector3(tp.x, bowlY(Math.hypot(tp.x, tp.z)) + 0.1, tp.z), '#cfd8ff', 10, 4, 0.5); shockwave(tp.x, bowlY(Math.hypot(tp.x, tp.z)), tp.z, tp.r * 2.2, '#cfd8ff'); } continue; }
    if (tp.state === 'falling') { tp.timer -= dt; tp.fallV += 22 * dt; tp.fallY -= tp.fallV * dt; tp.x += tp.vx * dt; tp.z += tp.vz * dt; if (tp.timer <= 0) eliminate(tp, 'ringout'); continue; }
    if (tp.state === 'toppling') { tp.timer -= dt; const k = Math.exp(-4 * dt); tp.vx *= k; tp.vz *= k; tp.x += tp.vx * dt; tp.z += tp.vz * dt; if (tp.timer <= 0) eliminate(tp, 'topple'); continue; }
    if (tp.state !== 'alive') continue;
    // input: player, bot brain, or nothing (menu idle / countdown)
    let inp = { x: 0, y: 0 };
    if (!frozen && run && !run.over) {
      if (tp.isPlayer) inp = AUTOPLAY ? botMove(tp, dt) : playerInput();
      else if (tp.ai !== 'idle' && tp.ai !== 'dummy') inp = botMove(tp, dt);
    }
    if (inp.x || inp.y) { tp.faceX = inp.x; tp.faceZ = inp.y; }
    const st = tp.stats, lowSpin = tp.spin < 25 ? 0.55 + 0.45 * Math.max(0, tp.spin) / 25 : 1;
    const maxV = (CFG.maxSpeed * st.spd * od * lowSpin) / (0.8 + 0.2 * tp.r), acc = CFG.accel * st.acc * od;
    tp.vx += inp.x * acc * dt; tp.vz += inp.y * acc * dt;
    const r0 = Math.hypot(tp.x, tp.z);
    if (r0 > 0.01) { const pull = CFG.bowlPull * (r0 / R); tp.vx -= (tp.x / r0) * pull * dt; tp.vz -= (tp.z / r0) * pull * dt; }
    if (tilt) { tp.vx += tilt.x * dt; tp.vz += tilt.z * dt; }
    const damp = Math.exp(-CFG.damping * dt); tp.vx *= damp; tp.vz *= damp;
    const sp = Math.hypot(tp.vx, tp.vz);
    if (tp.dashT <= 0 && sp > maxV) { const k = Math.max(maxV, sp - 30 * dt) / sp; tp.vx *= k; tp.vz *= k; }
    tp.x += tp.vx * dt; tp.z += tp.vz * dt;
    tp.dashT = Math.max(0, tp.dashT - dt); tp.cd = Math.max(0, tp.cd - dt); if (!frozen) tp.shield = Math.max(0, tp.shield - dt); tp.hitWob = Math.max(0, tp.hitWob - dt * 0.8);
    // spin decays faster the bigger you are; tutorial and countdown are forgiving
    if (run && !frozen && !(run.tutorial && tp.isPlayer)) tp.spin -= ((CFG.decay * (1 + tp.spin * CFG.decayGrowth)) / st.sta) * (od > 1 ? 0.5 : 1) * dt;
    if (tp.ai === 'dummy') tp.spin = Math.max(tp.spin, 1);
    tp.peak = Math.max(tp.peak, tp.spin);
    walls(tp);
    if (tp.state === 'alive' && tp.spin <= 0) startTopple(tp);
    updateMass(tp);
  }
  // top vs top
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) if (alive(tops[i]) && alive(tops[j])) collide(tops[i], tops[j]);
  // sparks: magnet + pickup
  for (const s of sparks) {
    if (!s.on || s.fall > 0) continue;
    for (const tp of tops) {
      if (!alive(tp)) continue;
      const dx = tp.x - s.x, dz = tp.z - s.z, d = Math.hypot(dx, dz);
      if (d < tp.r + 0.35) { collectSpark(tp, s); break; }
      if (d < tp.r + CFG.magnet) { const k = (8 * dt) / Math.max(d, 0.1); s.x += dx * k; s.z += dz * k; }
    }
  }
}
function walls(tp) {
  const r = Math.hypot(tp.x, tp.z), lim = R - tp.r * 0.92;
  if (r <= lim) return;
  const ang = Math.atan2(tp.z, tp.x), nx = tp.x / r, nz = tp.z / r;
  if (pitAt(ang, tp.r) >= 0) {
    if (r > R - tp.r * 0.3) startFall(tp);
    return;
  }
  const vn = tp.vx * nx + tp.vz * nz;
  if (vn > 0) {
    tp.vx -= (1 + CFG.wallBounce) * vn * nx; tp.vz -= (1 + CFG.wallBounce) * vn * nz; tp.spin -= CFG.wallLoss * vn;
    if (vn > 3) { playSfx('wall', clamp(vn / 12, 0.2, 0.8) * nearVol(tp.x, tp.z)); burst(new THREE.Vector3(nx * R, bowlY(R) + 0.5, nz * R), '#ffe8c2', 4 + (vn | 0), 4); }
  }
  tp.x = nx * lim; tp.z = nz * lim;
}
function pitAt(ang, rad) {
  const half = Math.max(0.05, CFG.pitHalf - (rad / R) * 0.55);
  for (let i = 0; i < PIT_ANGLES.length; i++) if (Math.abs(angDiff(ang, PIT_ANGLES[i])) < half) return i;
  return -1;
}
function nearestPit(x, z) {
  const ang = Math.atan2(z, x); let best = 0, bd = 9;
  PIT_ANGLES.forEach((p, i) => { const d = Math.abs(angDiff(ang, p)); if (d < bd) { bd = d; best = i; } });
  return { i: best, ang: PIT_ANGLES[best], diff: bd, x: Math.cos(PIT_ANGLES[best]) * R, z: Math.sin(PIT_ANGLES[best]) * R };
}
function collide(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), minD = a.r + b.r;
  if (d >= minD || d < 1e-4) return;
  const nx = dx / d, nz = dz / d, overlap = minD - d, ima = 1 / a.mass, imb = 1 / b.mass, sum = ima + imb;
  a.x -= (nx * overlap * ima) / sum; a.z -= (nz * overlap * ima) / sum; b.x += (nx * overlap * imb) / sum; b.z += (nz * overlap * imb) / sum;
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // closing speed along the normal
  if (rel <= 0.4) return; // resting contact: no clash
  const kick = CFG.repel * (0.6 + 0.4 * Math.min(1, (a.spin + b.spin) / 400)); // spinning tops fling apart
  const j = ((1 + CFG.restitution) * rel + kick) / sum;
  a.vx -= j * ima * nx; a.vz -= j * ima * nz; b.vx += j * imb * nx; b.vz += j * imb * nz;
  const tx = -nz, tz = nx, g = CFG.grind; // clockwise spin grinds the tops sideways
  a.vx += tx * g; a.vz += tz * g; b.vx -= tx * g; b.vz -= tz * g;
  const key = a.id < b.id ? a.id * 4096 + b.id : b.id * 4096 + a.id, now = run ? run.time : simTime;
  if (now - (pairHits.get(key) ?? -9) < CFG.pairCooldown) return; // still bounce, but one clash per contact
  pairHits.set(key, now);
  const base = CFG.clashBase + Math.max(0, rel - CFG.bumpSpeed) * CFG.clashSpeed; // slow bumps barely hurt; real hits do
  const dmgTo = (atk, def) => def.shield > 0 ? 0 : Math.min(CFG.maxHit + def.spin * 0.08, (base * atk.stats.atk * (atk.dashT > 0 ? CFG.dashMul : 1) * Math.sqrt(atk.mass / def.mass)) / def.stats.def);
  let dA = dmgTo(b, a), dB = dmgTo(a, b);
  if (a.dashT > 0) dA *= 0.4; if (b.dashT > 0) dB *= 0.4; // the rammer wins the exchange: dash with intent
  const mercy = (tp) => (tp.spin < 60 ? 0.55 + 0.45 * (tp.spin / 60) : 1); // a low top can still claw back
  dA *= mercy(a); dB *= mercy(b);
  if (run?.tutorial && a.isPlayer) dA *= 0.3; if (run?.tutorial && b.isPlayer) dB *= 0.3;
  if (a.ai === 'dummy' || b.ai === 'dummy') { if (run?.tutorial && run.tutStep === 2 && (a.isPlayer || b.isPlayer) && (a.dashT > 0 || b.dashT > 0)) run.tutDashHit = true; }
  a.spin -= dA; b.spin -= dB;
  a.lastHitBy = b; a.lastHitT = now; b.lastHitBy = a; b.lastHitT = now;
  a.hitWob = Math.min(0.45, a.hitWob + dA * 0.012); b.hitWob = Math.min(0.45, b.hitWob + dB * 0.012);
  const cx = a.x + nx * a.r, cz = a.z + nz * a.r, cy = bowlY(Math.hypot(cx, cz)) + 0.55 * Math.min(a.r, b.r);
  const heavy = rel > 9 || dA + dB > 40, mine = a.isPlayer || b.isPlayer, vol = mine ? 1 : nearVol(cx, cz) * 0.6;
  burst(new THREE.Vector3(cx, cy, cz), '#fff2a8', Math.min(26, 6 + (rel | 0) * 2), 6 + rel * 0.4);
  burst(new THREE.Vector3(cx, cy, cz), heavy ? '#ff9a3d' : '#7fd8ff', heavy ? 10 : 4, 5);
  if (heavy) shockwave(cx, cy - 0.4, cz, 2.5 + rel * 0.15, '#ffd27a');
  playSfx(heavy ? 'clashHeavy' : 'clash', vol * clamp(0.4 + rel / 14, 0.4, 1), heavy ? 1 : 1.1);
  if (mine) shake(heavy ? 0.55 : 0.22);
}
function collectSpark(tp, s) {
  s.on = false;
  tp.spin = Math.min(CFG.maxSpin, tp.spin + CFG.sparkValue * (s.big ? 2 : 1));
  if (tp.isPlayer) {
    tp.score += s.big ? 2 : 1; playSfx('spark', 0.45, 0.9 + Math.random() * 0.3);
    if (run?.tutorial) run.tutSparks++;
  }
  burst(new THREE.Vector3(s.x, bowlY(Math.hypot(s.x, s.z)) + 0.5, s.z), '#ffe066', 4, 3);
}
function startFall(tp) {
  tp.state = 'falling'; tp.timer = 1.1; tp.fallY = bowlY(R); tp.fallV = -2;
  const sp = Math.hypot(tp.vx, tp.vz), r = Math.hypot(tp.x, tp.z); if (sp < 4) { tp.vx += (tp.x / r) * 4; tp.vz += (tp.z / r) * 4; }
  playSfx('ringout', tp.isPlayer ? 1 : 0.8 * nearVol(tp.x, tp.z));
  if (tp.isPlayer) { run.slow = 1.1; shake(0.6); }
}
function startTopple(tp) {
  tp.state = 'toppling'; tp.timer = 0.9; tp.spin = 0;
  playSfx('topple', tp.isPlayer ? 1 : 0.7 * nearVol(tp.x, tp.z));
  if (tp.isPlayer) { run.slow = 1.1; shake(0.4); }
}
function eliminate(tp, how) {
  const now = run ? run.time : 0, wasLeader = tp === leader;
  const killer = tp.lastHitBy && now - tp.lastHitT < 5 && tops.includes(tp.lastHitBy) && alive(tp.lastHitBy) ? tp.lastHitBy : null;
  if (killer) {
    killer.kos++;
    let pts = (how === 'ringout' ? CFG.ringoutPoints : CFG.koPoints) + Math.round(tp.peak * 0.1);
    if (wasLeader) pts *= 2;
    killer.score += pts;
    if (how === 'ringout') killer.spin = Math.min(CFG.maxSpin, killer.spin + tp.peak * CFG.ringoutSteal * 0.5 + 15);
    if (killer.isPlayer) {
      banner(t(how === 'ringout' ? 'ringout' : 'topple'), wasLeader ? t('leaderDown') : `+${pts}`); voice(how === 'ringout' ? 'ringout' : 'topple');
      playSfx('cheer', 0.55); cheer(); shake(0.35);
    }
  }
  if (how === 'topple') { // spun-out tops spill their sparks
    const n = Math.min(30, 4 + Math.round((tp.peak * CFG.toppleDrop) / CFG.sparkValue / 3)), y = bowlY(Math.hypot(tp.x, tp.z)) + 0.5;
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = rand(2, 7); addSpark(tp.x, tp.z, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, big: k % 5 === 0 ? 1 : 0 }); }
    burst(new THREE.Vector3(tp.x, y, tp.z), tp.color, 22, 7); shockwave(tp.x, y - 0.4, tp.z, tp.r * 3, tp.color);
  }
  feed(killer, tp, how);
  if (tp.isPlayer) { endRun(killer, how); return; }
  if (run?.dummy === tp) run.dummy = null;
  removeTop(tp);
  pendingRespawns.push(CFG.respawn); // tickRun refills the arena once the delay runs out
}
const pendingRespawns = [], pairHits = new Map();
function endRun(killer, how) {
  run.over = true; run.how = how; run.killer = killer;
  player.state = 'dead'; player.mesh.root.visible = false; player.label.visible = false;
  stopHum(); playSfx('over', 0.7);
  run.gearsEarned = Math.floor(player.score / 10) + player.kos * 3 + Math.floor(run.time / 20);
  save.gears += run.gearsEarned;
  const isBest = player.score > save.best;
  if (isBest) { save.best = player.score; happytime(); }
  persist();
  run.overTimer = 1.2; run.isBest = isBest;
}
function showResults() {
  const r = run, k = r.killer;
  $('overBy').textContent = k ? t(r.how === 'ringout' ? 'byRingout' : 'byTopple', { n: k.isPlayer ? t('you') : k.name }) : t(r.how === 'ringout' ? 'selfRingout' : 'selfTopple');
  $('finalScore').textContent = player.score; $('overBest').textContent = save.best; $('newBest').hidden = !r.isBest;
  $('overRank').textContent = `#${r.bestRank < 99 ? r.bestRank : '-'}`; $('overKos').textContent = player.kos; $('overPeak').textContent = Math.round(player.peak);
  const sec = Math.floor(r.time); $('overTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('overGears').textContent = r.gearsEarned;
  $('btnDouble').hidden = !(adsAvailable() && r.gearsEarned > 0);
  setState(State.GAMEOVER); refreshMenu();
}
function cheer() { crowdCheer = 2.2; }
let crowdCheer = 0;

function tickRun(dt) {
  if (!run) return;
  if (run.countdown > 0) {
    const before = Math.ceil(run.countdown); run.countdown -= dt; const after = Math.ceil(run.countdown);
    const cd = $('countdown');
    boardTimer -= dt; if (boardTimer <= 0) { boardTimer = 0.25; renderBoard(); }
    if (run.countdown <= 0) { if (run.tutorial) nextTutStep(); cd.textContent = t('go'); cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); setTimeout(() => { cd.hidden = true; }, 600); }
    else if (before !== after || cd.hidden) { cd.hidden = false; cd.textContent = String(after); cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); playSfx('count', 0.5); }
    return;
  }
  if (run.over) { run.overTimer -= dt; if (run.overTimer <= 0 && state === State.PLAYING) showResults(); }
  else run.time += dt;
  // keep the arena full and stocked
  for (let i = pendingRespawns.length - 1; i >= 0; i--) { pendingRespawns[i] -= dt; if (pendingRespawns[i] <= 0) pendingRespawns.splice(i, 1); }
  const bots = tops.filter((tp) => !tp.isPlayer).length;
  if (bots < CFG.bots && pendingRespawns.length < CFG.bots - bots) spawnBot();
  const active = sparks.reduce((n, s) => n + (s.on ? 1 : 0), 0);
  if (active < CFG.sparks && Math.random() < dt * 6) addSpark(...randomSparkSpot());
  // leader + rank
  const list = rankList(); const lead = list[0] || null;
  if (lead !== leader) { leader = lead; if (leader?.isPlayer && !run.over && run.time - run.leaderSaid > 12 && run.time > 5) { run.leaderSaid = run.time; banner(t('leader'), '', false, 1.6); voice('leader'); if (!run.happy) { run.happy = true; happytime(); } } }
  if (!run.over && alive(player)) { const rk = list.indexOf(player) + 1; if (rk > 0) run.bestRank = Math.min(run.bestRank, rk); }
  // events
  if (!run.tutorial && !run.over) {
    if (run.event) { run.event.t -= dt; tickEvent(run.event, dt); if (run.event.t <= 0) endEvent(); }
    else if (run.time >= run.nextEvent) startEvent();
  }
  if (run.tutorial) tickTutorial(dt);
  boardTimer -= dt; if (boardTimer <= 0 && state === State.PLAYING) { boardTimer = 0.25; renderBoard(); }
  if (state === State.PLAYING && alive(player)) updateHUD();
}

// ================================================================ AI (bots: grab sparks, hunt smaller tops toward pits, flee bigger ones)
function botMove(b, dt) {
  b.think -= dt;
  if (b.think <= 0) { b.think = rand(0.1, 0.22); decide(b); }
  if (b.goal.dash && b.cd <= 0) { b.goal.dash = false; dash(b, { x: b.goal.x, y: b.goal.z }); }
  const noise = (1 - b.skill) * 0.25;
  return norm(b.goal.x + rand(-noise, noise), b.goal.z + rand(-noise, noise));
}
const norm = (x, z) => { const l = Math.hypot(x, z); return l > 1e-3 ? { x: x / l, y: z / l } : { x: 0, y: 0 }; };
function decide(b) {
  const r = Math.hypot(b.x, b.z), pit = nearestPit(b.x, b.z);
  const ramp = Math.min(1, 0.2 + (run ? run.time : 0) / CFG.aggroRamp), aggro = b.ai === 'passive' ? 0 : b.aggro * ramp;
  // 1. stay out of the pits: steer back to the centre when close to an opening
  if (r > R - 4.5 && pit.diff < CFG.pitHalf + 0.28) { b.goal = { x: -b.x / r, z: -b.z / r, dash: r > R - 2.5 && b.skill > 0.5 }; return; }
  let flee = null, prey = null, preyScore = 0;
  for (const o of tops) {
    if (o === b || !alive(o)) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z); if (d > 12) continue;
    const ratio = o.spin / Math.max(1, b.spin);
    if (ratio > 1.45 && d < 6.5 && (!flee || d < flee.d)) flee = { o, d };
    if (aggro > 0 && ratio < 0.95 && d < 9) { // only hunt tops smaller than you
      let s = (12 - d) * (1.3 - ratio) * aggro;
      if (o.isPlayer) s *= (run && run.time < CFG.graceTime) || ratio > 0.8 ? 0 : 0.9; // a quiet start, and only clearly smaller players get hunted
      if (o === leader) s *= 1.4;
      const op = nearestPit(o.x, o.z); if (Math.hypot(o.x, o.z) > R - 7 && op.diff < 0.45) s *= 1.7; // easy ring-out
      if (o.ai === 'dummy') s = 0;
      if (s > preyScore) { preyScore = s; prey = { o, d }; }
    }
  }
  if (flee && (!prey || b.skill < 0.7 || flee.d < 4)) { // run away, but not toward a pit
    const fx = b.x - flee.o.x, fz = b.z - flee.o.z, l = Math.hypot(fx, fz) || 1;
    b.goal = { x: fx / l - (b.x / R) * 0.9, z: fz / l - (b.z / R) * 0.9, dash: flee.d < 3 && Math.random() < b.skill * 0.5 };
    return;
  }
  if (prey) { // approach from the side away from the prey's nearest pit, then charge
    const o = prey.o, op = nearestPit(o.x, o.z), px = op.x - o.x, pz = op.z - o.z, pl = Math.hypot(px, pz) || 1;
    let gx, gz;
    if (prey.d > 4.5) { gx = o.x - (px / pl) * (o.r + b.r + 1) - b.x; gz = o.z - (pz / pl) * (o.r + b.r + 1) - b.z; }
    else { gx = o.x - b.x; gz = o.z - b.z; }
    b.goal = { x: gx, z: gz, dash: prey.d < 4.2 + o.r && Math.random() < b.skill * 0.6 };
    return;
  }
  // 3. sparks: nearest one (sampled), else drift toward the middle ring
  let best = null, bd = 1e9;
  for (let i = 0; i < sparks.length; i += 1) { const s = sparks[i]; if (!s.on || s.fall > 0) continue; const d = (s.x - b.x) ** 2 + (s.z - b.z) ** 2; if (d < bd) { bd = d; best = s; } }
  if (best) b.goal = { x: best.x - b.x, z: best.z - b.z, dash: false };
  else b.goal = { x: -b.x * 0.3 + rand(-1, 1), z: -b.z * 0.3 + rand(-1, 1), dash: false };
  if (r > R - 2.5) { b.goal.x -= (b.x / r) * 1.5; b.goal.z -= (b.z / r) * 1.5; } // don't hug the wall
}

// ================================================================ EVENTS (every ~40 s: Spark Storm, Arena Tilt, Overdrive)
function startEvent() {
  const ids = ['storm', 'tilt', 'overdrive'].filter((e) => e !== run.lastEvent), id = ids[(Math.random() * ids.length) | 0];
  const dur = { storm: 6, tilt: 7, overdrive: 8 }[id];
  run.event = { id, t: dur, dur, pit: (Math.random() * CFG.pitCount) | 0, acc: 0 };
  run.lastEvent = id;
  banner(t('ev_' + id), t(`ev_${id}Sub`), id === 'tilt', 2.2); playSfx('event', 0.7); voice(id);
  if (id === 'tilt') { chevrons.visible = true; chevrons.rotation.y = -PIT_ANGLES[run.event.pit]; }
  if (id === 'overdrive' && audio.music) audio.music.playbackRate = 1.08;
}
function tickEvent(ev, dt) {
  if (ev.id === 'storm') { ev.acc += dt * 8; while (ev.acc >= 1) { ev.acc--; const [x, z] = randomSparkSpot(R * 0.75); addSpark(x, z, { fall: 7, big: Math.random() < 0.25 ? 1 : 0 }); } }
}
function endEvent() {
  if (run.event.id === 'tilt') chevrons.visible = false;
  if (run.event.id === 'overdrive' && audio.music) audio.music.playbackRate = 1;
  run.event = null; run.nextEvent = run.time + CFG.eventEvery;
}

// ================================================================ TUTORIAL (first run: learn by doing, ~30 s, skippable)
const TUT = [
  { text: 'tutMove', icon: () => (isTouch ? '<svg class="hand"><use href="#i-move"/></svg>' : '<span class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></span>'), done: () => run.tutMoved > 6 },
  { text: 'tutSparks', icon: () => '<svg><use href="#i-spark"/></svg>', setup: () => { for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; addSpark(player.x + Math.cos(a) * 4, player.z + Math.sin(a) * 4, { big: 1 }); } }, done: () => run.tutSparks >= 5 },
  { text: 'tutDash', icon: () => (isTouch ? '<svg class="hand"><use href="#i-dash"/></svg>' : '<span class="key">Space</span>'),
    setup: () => { const a = Math.atan2(-player.z, -player.x) || 0, d = makeTop({ parts: { crown: 'bastion', core: 'iron', tip: 'grip', paint: 'snow' }, name: t('dummy'), spin: 60 }); Object.assign(d, { x: player.x + Math.cos(a) * 5, z: player.z + Math.sin(a) * 5, ai: 'dummy' }); run.dummy = d; },
    done: () => run.tutDashHit },
  { text: 'tutPits', icon: () => '<svg><use href="#i-pit"/></svg>', setup: () => { const p = nearestPit(player.x, player.z); chevrons.visible = true; chevrons.rotation.y = -p.ang; run.tutT = 0; }, done: () => run.tutT > 5 },
];
function nextTutStep() {
  run.tutStep++;
  if (run.tutStep >= TUT.length) { finishTutorial(false); return; }
  const s = TUT[run.tutStep];
  $('coachIcon').innerHTML = s.icon(); $('coachText').textContent = t(s.text); $('coachStep').textContent = t('tutStep', { i: run.tutStep + 1 });
  const c = $('coach'); c.hidden = true; void c.offsetWidth; c.hidden = false;
  s.setup?.(); playSfx('upgrade', 0.4);
}
function tickTutorial(dt) {
  if (run.tutStep < 0) return;
  run.tutT += dt;
  if (run.tutStep === 0) run.tutMoved += Math.hypot(player.vx, player.vz) * dt;
  if (run.tutStep === 2 && !run.dummy) TUT[2].setup(); // the practice top fell into a pit: bring a new one
  if (TUT[run.tutStep]?.done()) nextTutStep();
}
function finishTutorial(skipped) {
  if (!run?.tutorial) return;
  run.tutorial = false; save.tut = true; persist();
  $('coach').hidden = true; chevrons.visible = false;
  if (run.dummy) { run.dummy.ai = 'normal'; run.dummy = null; }
  for (const tp of tops) if (tp.ai === 'passive') tp.ai = 'normal';
  run.nextEvent = run.time + CFG.eventFirst;
  if (!skipped) { banner(t('tutDone'), '', false, 2); playSfx('unlock', 0.7); }
}

// ================================================================ LOOP (fixed-step simulation, interpolation-free render sync)
let last = performance.now(), acc = 0;
const camPos = new THREE.Vector3(0, 30, 24), camLook = new THREE.Vector3();
function step(dt) {
  simTime += dt;
  updateSparks(dt);
  if (state === State.PLAYING || state === State.GAMEOVER) { simulate(dt); tickRun(dt); }
  else if (state === State.MENU || state === State.GARAGE) { for (const tp of tops) { tp.spin = Math.max(tp.spin, 60); updateMass(tp); } }
}
function advance(dt) {
  if (state === State.PAUSED) return;
  let sdt = dt;
  if (run?.slow > 0) { run.slow -= dt; sdt = dt * 0.3; }
  acc += sdt; let n = 0; while (acc >= STEP && n < 8) { step(STEP); acc -= STEP; n++; } if (n >= 8) acc = 0;
  updateParticles(sdt); updateWaves(sdt);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').hidden = true; }
  if (state === State.PLAYING && run && alive(player)) {
    const sp = Math.hypot(player.vx, player.vz);
    updateHum(0.05 + 0.1 * clamp(player.spin / 300, 0, 1) + 0.05 * clamp(sp / 10, 0, 1), 0.75 + 0.45 * clamp(player.spin / 400, 0, 1) + sp * 0.01);
  }
}
function syncTop(tp, dt) {
  const m = tp.mesh, s = tp.r, r = Math.hypot(tp.x, tp.z);
  let y = bowlY(Math.min(r, R));
  if (tp.state === 'spawn') y += Math.max(0, tp.timer) * 9;
  if (tp.state === 'falling') y = tp.fallY;
  m.root.scale.setScalar(s); m.root.position.set(tp.x, y, tp.z);
  const spinFrac = clamp(tp.spin / 220, 0, 1);
  const omega = tp.state === 'toppling' ? tp.timer * 10 : 9 + 28 * spinFrac;
  m.spin.rotation.y -= omega * dt;
  tp.prec += dt * (5 + 7 * spinFrac);
  let amp = 0.025 + tp.hitWob + (tp.spin < 30 ? ((30 - Math.max(0, tp.spin)) / 30) * 0.28 : 0);
  if (tp.state === 'toppling') amp = 0.35 + (0.9 - tp.timer) * 1.3;
  if (tp.state === 'falling') amp = 0.3 + (1.1 - tp.timer) * 1.2;
  const sp = Math.hypot(tp.vx, tp.vz), lean = clamp(sp * 0.014, 0, 0.13), lx = sp > 0.1 ? tp.vx / sp : 0, lz = sp > 0.1 ? tp.vz / sp : 0;
  m.tilt.rotation.x = lean * lz + amp * Math.sin(tp.prec); m.tilt.rotation.z = -lean * lx + amp * Math.cos(tp.prec);
  m.blur.material.opacity = tp.state === 'alive' || tp.state === 'spawn' ? 0.12 + 0.42 * spinFrac : 0.05;
  if (tp.isPlayer) m.ring.material.opacity = tp.cd <= 0 ? 0.7 + 0.25 * Math.sin(simTime * 8) : 0.4;
  m.ring.visible = tp.state === 'alive' && !(tp.shield > 0 && Math.sin(simTime * 30) < -0.3);
  tp.label.visible = state !== State.COVER && tp.state !== 'dead' && (state === State.PLAYING || state === State.GAMEOVER || state === State.PAUSED);
  tp.label.position.set(tp.x, y + 0.95 * s + 0.75, tp.z);
  const ls = 2.5 + s * 0.4; tp.label.scale.set(ls, ls * 0.22, 1);
}
function render(dt) {
  for (const tp of tops) syncTop(tp, dt);
  renderSparks();
  if (leader && alive(leader) && (state === State.PLAYING || state === State.GAMEOVER)) {
    crownSprite.visible = true; crownSprite.position.set(leader.x, leader.mesh.root.position.y + 0.95 * leader.r + 1.55, leader.z); const cs = 0.9 + leader.r * 0.15; crownSprite.scale.set(cs, cs, 1);
  } else crownSprite.visible = false;
  // stadium life
  crowdCheer = Math.max(0, crowdCheer - dt);
  if (crowd) {
    const tmp = sparkTmp, amp = 0.12 + crowdCheer * 0.35;
    for (let i = 0; i < crowdBase.length; i++) { const c = crowdBase[i]; if (!c) continue; tmp.position.set(c.x, c.y + Math.abs(Math.sin(simTime * (crowdCheer > 0 ? 9 : 2.2) + c.ph)) * amp, c.z); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix); }
    crowd.instanceMatrix.needsUpdate = true;
  }
  for (const b of beams) { b.rotation.z = Math.sin(simTime * 0.4 + b.userData.a) * 0.35; b.rotation.x = Math.cos(simTime * 0.3 + b.userData.a) * 0.35; }
  for (const g of pitGlows) g.material.opacity = 0.75 + 0.25 * Math.sin(simTime * 4);
  if (chevrons.visible) for (const c of chevrons.children) c.material.opacity = 0.25 + 0.6 * Math.max(0, Math.sin(simTime * 6 - c.userData.k * 0.9));
  if (state !== State.COVER) updateCamera(dt);
  renderer.render(scene, camera);
}
function updateCamera(dt) {
  const portrait = innerHeight > innerWidth;
  if (state === State.MENU || state === State.GARAGE) {
    const a = simTime * 0.18, dist = state === State.GARAGE ? 5.2 : 6.5, h = state === State.GARAGE ? 2.6 : 3.2;
    const px = player ? player.x : 0, pz = player ? player.z : 0, py = player ? player.mesh.root.position.y : 0;
    camPos.set(px + Math.sin(a) * dist, py + h, pz + Math.cos(a) * dist); camLook.set(px, py + 0.75, pz);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 3));
    const w = innerWidth, hh = innerHeight;
    if (portrait) camera.setViewOffset(w, hh, 0, hh * 0.22, w, hh); else camera.setViewOffset(w, hh, -w * 0.2, 0, w, hh);
  } else {
    camera.clearViewOffset();
    const s = player ? player.r : 1, zoom = (1 + (s - 1) * 0.45) * (portrait ? 1.55 : 1);
    const px = player ? player.x : 0, pz = player ? player.z : 0;
    const lead = state === State.PLAYING && player ? 0.35 : 0;
    camLook.set(px + (player?.vx || 0) * lead, 0, pz + (player?.vz || 0) * lead);
    const over = state === State.GAMEOVER ? 1.25 : 1;
    camPos.set(camLook.x, 15 * zoom * over, camLook.z + 12.5 * zoom * over);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 5));
  }
  shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ COVER (tools/game_covers.py: honest key art rendered from the game itself)
function stageCover(kind) {
  state = State.COVER; document.body.classList.add('cover');
  for (const id of ['menu', 'garage', 'paused', 'gameover', 'hud', 'banner', 'coach', 'countdown', 'toast', 'btnAction', 'joystick']) $(id).hidden = true;
  camera.clearViewOffset();
  for (const tp of [...tops]) if (!tp.isPlayer) removeTop(tp);
  for (const s of sparks) s.on = false;
  save.sel = { crown: 'razor', core: 'heart', tip: 'needle', paint: 'sun' }; rebuildPlayerMesh();
  Object.assign(player, { x: -1.15, z: 0.3, vx: 0, vz: 0, spin: 220, state: 'alive', hitWob: 0.12 }); player.mesh.root.visible = true; updateMass(player);
  const rival = makeTop({ parts: { crown: 'bastion', core: 'iron', tip: 'grip', paint: 'coral' }, name: 'Rival', spin: 200 });
  Object.assign(rival, { x: player.x + player.r + radiusOf(200) - 0.05, z: 0.1, hitWob: 0.15 }); updateMass(rival);
  const extra = [[{ crown: 'comet', core: 'feather', tip: 'glide', paint: 'mint' }, -6.5, -5.5], [{ crown: 'halo', core: 'gyro', tip: 'dome', paint: 'sky' }, 6.5, -6.5], [{ crown: 'razor', core: 'gyro', tip: 'grip', paint: 'violet' }, -9, -12], [{ crown: 'halo', core: 'iron', tip: 'needle', paint: 'lime' }, 10, -13]];
  for (const [p, x, z] of extra) { const b = makeTop({ parts: p, name: 'b', spin: 120 }); Object.assign(b, { x, z }); updateMass(b); }
  for (let k = 0; k < 45; k++) { const a = rand(Math.PI * 1.05, Math.PI * 1.95), r = rand(3, 16); addSpark(Math.cos(a) * r, Math.sin(a) * r, { big: k % 4 === 0 ? 1 : 0 }); } // behind the clash, not in the lens
  const cx = player.x + player.r, cy = bowlY(1) + 0.55 * player.r;
  for (const tp of tops) syncTop(tp, 0.016);
  burst(new THREE.Vector3(cx, cy, 0.2), '#ffe27a', 22, 11); burst(new THREE.Vector3(cx, cy, 0.2), '#ff9a3d', 12, 9); burst(new THREE.Vector3(cx, cy, 0.2), '#7fd8ff', 8, 8);
  shockwave(cx, cy - 0.4, 0.2, 3.2, '#ffd27a'); updateParticles(0.14); updateWaves(0.12);
  const cam = { landscape: [0.4, 2.6, 7.4, 0.2, 0.9, -1.5], portrait: [0.2, 3.3, 9.6, 0.1, 0.7, -2.2], square: [0.3, 3.0, 8.4, 0.2, 0.8, -1.8], keyart: [0.4, 2.6, 7.4, 0.2, 0.9, -1.5] }[kind] || [0.4, 2.6, 7.4, 0.2, 0.9, -1.5];
  camera.position.set(cam[0], cam[1], cam[2]); camera.lookAt(cam[3], cam[4], cam[5]);
  render(0);
}

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n();
  initAudio(); loadSave();
  const jobs = [...Object.entries(SFX_FILES).map(([k, u]) => loadSfx(k, u)), ...Object.entries(VOICE_FILES).map(([k, u]) => loadSfx(`v_${k}`, u.replace('{lang}', lang))),
    document.fonts?.load('800 32px UI').catch(() => {}), document.fonts?.load('32px Display').catch(() => {})];
  let done = 0; jobs.forEach((p) => Promise.resolve(p).finally(() => { done++; $('loadBar').style.width = `${(100 * done) / jobs.length}%`; }));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  buildWorld(); initSparks();
  player = makeTop({ parts: { ...save.sel }, name: 'You', isPlayer: true }); scene.add(crownSprite);
  resetArena();
  $('menuControls').innerHTML = controlsHTML(); refreshMenu();
  resize();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  setState(State.MENU);
  if (CAPTURE) { // capture protocol used by tools/capture.mjs: no rAF loop, the tool drives every frame
    window.__game = {
      start: () => startRun(),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) { advance(STEP); if (state === State.GAMEOVER) startRun(); } },
      sim: (sec) => { for (let s = 0; s < sec; s += STEP) { advance(STEP); if (run?.over) break; } }, // balance tests: stops when the run ends
      info: () => ({ how: run?.how, state, score: player?.score, spin: player?.spin, time: run?.time, kos: player?.kos, rank: run?.bestRank, over: run?.over }),
      cover: (kind) => stageCover(kind),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
