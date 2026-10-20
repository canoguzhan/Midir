// Whirlbash: spinning-top arena brawler (io-style). Solo against bots, or online against real players with bots filling
// the empty seats. The rules live in sim.js (shared with the multiplayer server, mp/whirlbash.mjs); this file is the view:
// Three.js scene, UI, audio, input, the solo run, the online client and the CrazyGames SDK. Sections: CONFIG, I18N, SDK,
// AUDIO, SAVE, WORLD, TOPS, SPARKS, FX, INPUT, STATE, UI, EVENTS, SOLO, TUTORIAL, ONLINE, LOOP, COVER, BOOT.
// Every top, the arena and the icons are procedural; audio loads from ./assets/ with synth fallbacks. No API keys in here.
import * as THREE from 'three';
import * as S from './sim.js';

// ================================================================ CONFIG
const SAVE_KEY = 'whirlbash';
const STEP = S.STEP;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // the player's top is driven by the bot brain (trailer footage, balance tests)
const { CFG, R, PIT_ANGLES, PARTS, part, bowlY, angDiff, clamp, alive } = S;
const MP_URL = /^wss?:\/\//.test(params.get('mp') || '') ? params.get('mp') : 'wss://broadgames.pro/mp/whirlbash'; // online arena (?mp= for local tests)
const INTERP = 0.12; // online: other tops are drawn this far in the past, between two server snapshots
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
    playOnline: 'Play online', online: 'Online', quickMatch: 'Quick match', createRoom: 'Private room', joinCode: 'Join with a code', join: 'Join', back: 'Back',
    noAccount: 'No account needed. You face real players, and bots fill the empty seats.', playingAs: 'You play as {n}', guestAuto: 'You get a guest name automatically',
    connecting: 'Connecting…', connFail: 'Could not reach the online arena. Try again, or play solo.', connLost: 'Connection lost', noRoom: 'No room with that code',
    roomFull: 'That room is full', room: 'Room', invite: 'Invite', linkCopied: 'Invite link copied!', shareCode: 'Room code {c}: share it with friends',
    players: '{n} online', codePh: 'CODE', shakeOn: 'Camera shake: on', shakeOff: 'Camera shake: off',
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
    playOnline: 'Çevrimiçi oyna', online: 'Çevrimiçi', quickMatch: 'Hızlı maç', createRoom: 'Özel oda', joinCode: 'Kodla katıl', join: 'Katıl', back: 'Geri',
    noAccount: 'Hesap gerekmez. Gerçek oyunculara karşı oynarsın, boş yerleri botlar doldurur.', playingAs: 'Oyuncu adın: {n}', guestAuto: 'Sana otomatik bir misafir adı verilir',
    connecting: 'Bağlanıyor…', connFail: 'Çevrimiçi arenaya ulaşılamadı. Tekrar dene ya da tek başına oyna.', connLost: 'Bağlantı koptu', noRoom: 'Bu kodla bir oda yok',
    roomFull: 'Bu oda dolu', room: 'Oda', invite: 'Davet et', linkCopied: 'Davet bağlantısı kopyalandı!', shareCode: 'Oda kodu {c}: arkadaşlarınla paylaş',
    players: '{n} çevrimiçi', codePh: 'KOD', shakeOn: 'Kamera sarsıntısı: açık', shakeOff: 'Kamera sarsıntısı: kapalı',
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

// Multiplayer bits of the SDK: invite links, room status for the CrazyGames friends UI, instant multiplayer, usernames.
function sdkInviteParam(k) { if (!sdkReady()) return null; try { return crazySdk.game.getInviteParam?.(k) ?? null; } catch { return null; } }
function sdkInstantMultiplayer() { if (!sdkReady()) return false; try { return !!crazySdk.game.isInstantMultiplayer; } catch { return false; } }
function inviteLinkFor(code) {
  if (sdkReady()) try { const link = crazySdk.game.inviteLink({ roomId: code }); if (link) return link; } catch {}
  const u = new URL(location.href); u.search = ''; u.searchParams.set('room', code); return u.toString();
}
const sdkRoom = (info) => sdkCall((s) => s.game.updateRoom?.(info));
const sdkLeftRoom = () => sdkCall((s) => s.game.leftRoom?.());
async function sdkUsername() { // CrazyGames username when logged in (required to be shown in multiplayer); guests get a server-made name
  if (!sdkReady()) return null;
  try { if (!crazySdk.user?.isUserAccountAvailable) return null; const u = await crazySdk.user.getUser(); return u?.username || null; } catch { return null; }
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
  best: 0, gears: 0, runs: 0, tut: false, shake: true,
  owned: { crown: ['halo'], core: ['gyro'], tip: ['dome'], paint: ['sun', 'coral', 'mint'] },
  sel: { crown: 'halo', core: 'gyro', tip: 'dome', paint: 'sun' },
});
let save = DEFAULT_SAVE();
function loadSave() {
  const d = DEFAULT_SAVE(), s = loadData(`${SAVE_KEY}:save`, null) || {};
  save = { ...d, ...s, owned: { ...d.owned, ...(s.owned || {}) }, sel: { ...d.sel, ...(s.sel || {}) } };
}
const persist = () => saveData(`${SAVE_KEY}:save`, save);

// ================================================================ WORLD (night stadium: glossy cobalt bowl, bumper walls, three glowing pits)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#15123a'); scene.fog = new THREE.Fog('#15123a', 60, 130);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
let shakeAmt = 0;
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
  const stands = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(R + 7, -10), ...steps], 96), new THREE.MeshStandardMaterial({ color: '#3b3a8c', roughness: 0.85, side: THREE.DoubleSide }));
  scene.add(stands);
  const cols = ['#ff5d73', '#ffc531', '#3ee0a1', '#4cb8ff', '#a77bff', '#ffe8c2', '#ff8a3d'];
  const N = 1100; crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.28, 0.45, 2, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const row = i % 5, a = ((i / 5) | 0) / (N / 5) * Math.PI * 2 + row * 0.013 + rand(-0.004, 0.004), r = R + 8.4 + row * 2.4; // even seats, row by row
    if (PIT_ANGLES.some((p) => Math.abs(angDiff(a, p)) < 0.05)) { tmp.position.set(0, -50, 0); tmp.scale.setScalar(0); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix); tmp.scale.setScalar(1); continue; }
    crowdBase[i] = { x: Math.cos(a) * r, y: -1 + row * 1.5 + 0.52, z: Math.sin(a) * r, ph: Math.random() * 6.28 };
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

// One view (mesh + name label) per top in the current world; views appear and disappear with the world's tops.
let world = null, meId = 0, player = null, mode = 'solo'; // player: my top (kept after it is eliminated, for the results + camera)
const views = new Map();
const topColor = (tp) => part('paint', tp.parts.paint).c;
function viewFor(tp) {
  let v = views.get(tp.id);
  if (v) return v;
  const me = tp.id === meId, mesh = buildTopMesh(tp.parts, tp.parts.paint, me ? '#ffffff' : '#ffe8c2');
  if (me) { mesh.ring.material.color.set('#ffc531'); mesh.ring.material.opacity = 0.85; }
  const label = labelSprite(me ? t('you') : tp.name, me ? '#ffc531' : tp.human ? '#9ee7ff' : '#ffffff');
  scene.add(mesh.root, label);
  v = { mesh, label, prec: Math.random() * 6, tp }; views.set(tp.id, v); return v;
}
function dropView(id) {
  const v = views.get(id); if (!v) return;
  disposeTopMesh(v.mesh); scene.remove(v.label); v.label.material.map.dispose(); v.label.material.dispose(); views.delete(id);
}
function clearViews() { for (const id of [...views.keys()]) dropView(id); }
const infoOf = (id) => (id ? S.topById(world, id) || views.get(id)?.tp || null : null); // tops that just left the world keep their view one more frame
function refreshPlayer() { const p = S.topById(world, meId); if (p) player = p; }

// ================================================================ SPARKS (instanced pickups: grow your spin)
let sparkMesh = null;
function initSparks() {
  sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb000', emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.2 }), CFG.sparkMax);
  sparkMesh.castShadow = false; sparkMesh.frustumCulled = false; scene.add(sparkMesh);
}
const sparkTmp = new THREE.Object3D();
function renderSparks() {
  const sparks = world.sparks;
  for (let i = 0; i < CFG.sparkMax; i++) {
    const s = sparks[i];
    if (!s?.on) sparkTmp.scale.setScalar(0);
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
  if (quietFx()) return;
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
  if (quietFx()) return;
  let w = waves.find((q) => !q.visible);
  if (!w && waves.length >= 24) return;
  if (!w) { w = new THREE.Mesh(cached('wave', () => new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); waves.push(w); scene.add(w); }
  w.material.color.set(color); w.visible = true; w.position.set(x, y + 0.1, z); w.userData = { life: 0.4, size };
}
function updateWaves(dt) {
  for (const w of waves) {
    if (!w.visible) continue; w.userData.life -= dt; if (w.userData.life <= 0) { w.visible = false; continue; }
    const k = 1 - w.userData.life / 0.4; w.scale.setScalar(0.5 + k * w.userData.size); w.material.opacity = 1 - k;
  }
}
function shake(a) { if (save.shake !== false && !CAPTURE) shakeAmt = Math.max(shakeAmt, Math.min(a, 0.3)); } // small and smooth: big jolts make people motion sick
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

// ================================================================ STATE (BOOT -> MENU <-> GARAGE / LOBBY, -> PLAYING <-> PAUSED -> GAMEOVER)
const State = { BOOT: 'BOOT', MENU: 'MENU', GARAGE: 'GARAGE', LOBBY: 'LOBBY', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', COVER: 'COVER' };
let state = State.BOOT, run = null, simTime = 0, dashQueued = false;

function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU; $('garage').hidden = s !== State.GARAGE; $('lobby').hidden = s !== State.LOBBY;
  $('paused').hidden = s !== State.PAUSED; $('gameover').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  $('btnAction').hidden = !(s === State.PLAYING && isTouch);
  $('dashKey').hidden = isTouch;
  $('roomChip').hidden = mode !== 'online';
  $('btnOverGarage').hidden = mode === 'online';
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; }
  if (s !== State.PLAYING && s !== State.PAUSED) { $('coach').hidden = true; $('countdown').hidden = true; $('banner').hidden = true; bannerTimer = 0; }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, game over
  if (s === State.MENU || s === State.GARAGE || s === State.LOBBY) { playMusic(0.2); camera.clearViewOffset(); }
  if (s === State.PLAYING) playMusic(0.32);
  if (s === State.PAUSED || s === State.MENU || s === State.GAMEOVER) updateHum(0, 1);
}
function togglePause() {
  if (state === State.PLAYING) setState(State.PAUSED);
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });
function playerDash() { if (state === State.PLAYING && run && !(run.countdown > 0) && player && alive(player)) dashQueued = true; }
const takeDash = () => { const d = dashQueued; dashQueued = false; return d; };

click('btnPlay', () => startRun());
click('btnOnline', () => openLobby());
click('btnGarage', () => openGarage());
click('btnOverGarage', () => { toMenuWorld(); openGarage(); });
click('btnGarageDone', () => { setState(State.MENU); refreshMenu(); });
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnShake', () => { save.shake = save.shake === false; persist(); refreshShakeButton(); });
click('btnQuit', () => { leaveToMenu(); });
click('btnMenu', () => { leaveToMenu(); }); // navigation: never an ad here
click('btnRetry', () => triggerMidgameAd(() => (mode === 'online' ? onlinePlayAgain() : startRun()))); // between runs: the right moment for a midgame ad
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.gears += run.gearsEarned; persist(); run.gearsEarned *= 2; $('overGears').textContent = run.gearsEarned; toast(t('doubled')); playSfx('unlock'); refreshMenu(); }, () => {});
});
click('btnSkipTut', () => finishTutorial(true));
click('btnQuick', () => connectOnline({ t: 'join', mode: 'quick' }));
click('btnCreate', () => connectOnline({ t: 'join', mode: 'create' }));
click('btnJoinCode', () => joinByCode($('codeInput').value));
click('btnLobbyBack', () => { closeOnline(); setState(State.MENU); });
click('btnInvite', () => shareInvite());
$('codeInput').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') joinByCode($('codeInput').value); });
$('codeInput').addEventListener('input', () => { $('codeInput').value = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

// ================================================================ UI (menu, garage, lobby, HUD, leaderboard, feed, banners)
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
const refreshShakeButton = () => { $('btnShake').textContent = t(save.shake === false ? 'shakeOff' : 'shakeOn'); };
function displayStats(p) { // 0..1 bars for the garage
  const s = S.statsOf(p), n = (v) => Math.max(0.05, Math.min(1, (v - 0.6) / 1.0));
  return { atk: n(s.atk), def: n(s.def * Math.sqrt(s.mass)), sta: n(s.sta), spd: n(s.spd * Math.pow(s.acc, 0.4)) };
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
  save.sel[kind] = id; persist(); renderGarage(); refreshMenu();
  if (player) { // the garage preview is my top in the menu world: give it the new part
    player.parts = S.cleanParts(save.sel); player.stats = S.statsOf(player.parts); S.updateMass(player); dropView(player.id);
    burst(new THREE.Vector3(player.x, 1, player.z), '#ffe066', 18, 5); shockwave(player.x, bowlY(0), player.z, 3, '#ffc531');
  }
}
async function openLobby() {
  setState(State.LOBBY); $('lobbyStatus').textContent = ''; $('lobbyStatus').classList.remove('bad');
  const name = await sdkUsername();
  $('lobbyName').textContent = name ? t('playingAs', { n: name }) : t('guestAuto');
}

let boardTimer = 0;
function renderBoard() {
  const list = S.rankList(world), me = list.findIndex((tp) => tp.id === meId), rows = [];
  const row = (tp, i, extra = '') => {
    const mine = tp.id === meId;
    return `<li class="${mine ? 'me' : tp.human ? 'hu' : ''} ${extra}"><span>${i === 0 ? '<svg><use href="#i-crown"/></svg>' : i + 1 + '.'}</span><i class="sw" style="background:${topColor(tp)}"></i>${escapeHTML(mine ? t('you') : tp.name)}<b>${Math.round(tp.spin)}</b></li>`;
  };
  list.slice(0, 5).forEach((tp, i) => rows.push(row(tp, i)));
  if (me >= 5) rows.push(row(list[me], me, 'gap'));
  $('board').innerHTML = rows.join('');
}
const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function feed(killer, victim, how) {
  if (CAPTURE && !killer) return;
  const el = document.createElement('div'), name = (tp) => `<b style="color:${tp.id === meId ? '#ffc531' : topColor(tp)}">${escapeHTML(tp.id === meId ? t('you') : tp.name)}</b>`;
  el.innerHTML = killer ? `${name(killer)}<em>${t(how === 'ringout' ? 'feedRing' : 'feedTopple')}</em>${name(victim)}` : `${name(victim)}<em>${t(how === 'ringout' ? 'fell' : 'spunOut')}</em>`;
  if (killer?.id === meId || victim.id === meId) el.className = 'me';
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
  const ev = world.event;
  if (ev) { $('eventChip').hidden = false; $('eventName').textContent = t('ev_' + ev.id).replace('!', ''); $('eventTime').textContent = `${Math.max(0, Math.ceil(ev.t))}s`; }
  else $('eventChip').hidden = true;
  if (mode === 'online') { $('roomCode').textContent = net.code; $('roomInfo').textContent = `${t('players', { n: net.players })} · ${Math.round(net.rtt)} ms`; }
}

// ================================================================ EVENTS (what the world reports -> particles, sounds, banners; same for solo and online)
const pos3 = (x, z, up = 0.4) => new THREE.Vector3(x, bowlY(Math.hypot(x, z)) + up, z);
let lastFrameAt = 0;
const quietFx = () => document.hidden || (mode === 'online' && performance.now() - lastFrameAt > 250);
function handleEvent(e) {
  const tp = infoOf(e.id);
  switch (e.type) {
    case 'land':
      if (!tp) break;
      if (!CAPTURE) playSfx('launch', 0.5 * nearVol(tp.x, tp.z));
      burst(pos3(tp.x, tp.z, 0.1), '#cfd8ff', 10, 4, 0.5); shockwave(tp.x, bowlY(Math.hypot(tp.x, tp.z)), tp.z, tp.r * 2.2, '#cfd8ff');
      break;
    case 'dash':
      if (tp && !(mode === 'online' && e.id === meId)) dashFx(tp, e.dx, e.dz); // my own dash already played when I pressed it
      break;
    case 'wall':
      playSfx('wall', clamp(e.vn / 12, 0.2, 0.8) * nearVol(e.x, e.z)); burst(pos3(e.x, e.z, 0.5), '#ffe8c2', 4 + (e.vn | 0), 4);
      break;
    case 'clash': {
      const mine = e.a === meId || e.b === meId, cy = 0.55 * Math.min(infoOf(e.a)?.r ?? 1, infoOf(e.b)?.r ?? 1), p = pos3(e.x, e.z, cy);
      burst(p, '#fff2a8', Math.min(26, 6 + (e.rel | 0) * 2), 6 + e.rel * 0.4);
      burst(p, e.heavy ? '#ff9a3d' : '#7fd8ff', e.heavy ? 10 : 4, 5);
      if (e.heavy) shockwave(e.x, p.y - 0.4, e.z, 2.5 + e.rel * 0.15, '#ffd27a');
      playSfx(e.heavy ? 'clashHeavy' : 'clash', (mine ? 1 : nearVol(e.x, e.z) * 0.6) * clamp(0.4 + e.rel / 14, 0.4, 1), e.heavy ? 1 : 1.1);
      if (mine && e.heavy) shake(0.15);
      if (mode === 'online') for (const id of [e.a, e.b]) { const o = S.topById(world, id); if (o) o.hitWob = Math.min(0.45, o.hitWob + (e.heavy ? 0.3 : 0.12)); }
      if (run?.tutorial && run.tutStep === 2 && run.dummyId && [e.a, e.b].includes(meId) && [e.a, e.b].includes(run.dummyId) && (e.a === meId ? e.aDash : e.bDash)) run.tutDashHit = true;
      break;
    }
    case 'spark': {
      const s = world.sparks[e.i], x = e.x ?? s?.x, z = e.z ?? s?.z;
      if (mode === 'online' && s) s.on = false;
      if (x != null) burst(pos3(x, z, 0.5), '#ffe066', 4, 3);
      if (e.id === meId) { playSfx('spark', 0.45, 0.9 + Math.random() * 0.3); if (run?.tutorial) run.tutSparks++; }
      break;
    }
    case 'fall':
      if (!tp) break;
      playSfx('ringout', e.id === meId ? 1 : 0.8 * nearVol(tp.x, tp.z));
      if (e.id === meId && run) { run.slow = 1.1; shake(0.2); }
      break;
    case 'topple':
      if (!tp) break;
      playSfx('topple', e.id === meId ? 1 : 0.7 * nearVol(tp.x, tp.z));
      if (e.id === meId && run) { run.slow = 1.1; shake(0.15); }
      break;
    case 'elim': onElim(e); break;
    case 'event': onEventStart(e); break;
    case 'eventEnd': onEventEnd(e); break;
    case 'leader': onLeader(e.id); break;
  }
}
function dashFx(tp, dx, dz) {
  burst(pos3(tp.x - dx * tp.r, tp.z - dz * tp.r), tp.id === meId ? '#ffe066' : '#ffffff', 8, 4, 0.4);
  playSfx('dash', tp.id === meId ? 0.7 : 0.35 * nearVol(tp.x, tp.z));
}
function onElim(e) {
  const victim = infoOf(e.id) || { id: e.id, name: '?', parts: S.cleanParts({}), r: 1 }, killer = infoOf(e.killer);
  if (e.how === 'topple') { const p = pos3(e.x, e.z, 0.5); burst(p, topColor(victim), 22, 7); shockwave(e.x, p.y - 0.4, e.z, (victim.r || 1) * 3, topColor(victim)); }
  feed(killer, victim, e.how);
  if (e.killer && e.killer === meId) {
    banner(t(e.how === 'ringout' ? 'ringout' : 'topple'), e.wasLeader ? t('leaderDown') : `+${e.pts}`); voice(e.how === 'ringout' ? 'ringout' : 'topple');
    playSfx('cheer', 0.55); cheer(); shake(0.1);
  }
  if (e.id === meId && run && !run.over) endRun(e, killer);
}
function onEventStart(e) {
  if (mode === 'online') world.event = { id: e.id, t: e.t ?? S.EVENT_DUR[e.id], pit: e.pit };
  banner(t('ev_' + e.id), t(`ev_${e.id}Sub`), e.id === 'tilt', 2.2); playSfx('event', 0.7); voice(e.id);
  if (e.id === 'tilt') { chevrons.visible = true; chevrons.rotation.y = -PIT_ANGLES[e.pit]; }
  if (e.id === 'overdrive' && audio.music) audio.music.playbackRate = 1.08;
}
function onEventEnd(e) {
  if (mode === 'online') world.event = null;
  if (e.id === 'tilt') chevrons.visible = false;
  if (e.id === 'overdrive' && audio.music) audio.music.playbackRate = 1;
}
function onLeader(id) {
  world.leader = id;
  if (id && id === meId && run && !run.over && run.time - run.leaderSaid > 12 && run.time > 5) {
    run.leaderSaid = run.time; banner(t('leader'), '', false, 1.6); voice('leader');
    if (!run.happy) { run.happy = true; happytime(); }
  }
}
function cheer() { crowdCheer = 2.2; }
let crowdCheer = 0;

// ================================================================ SOLO (a local world against 11 bots; the menu shows an idle one)
function toMenuWorld() {
  stopHum(); clearViews(); mode = 'solo'; run = null;
  world = S.createWorld(); world.frozen = true;
  player = S.addTop(world, { parts: save.sel, name: 'You', human: true, spawn: false }); meId = player.id;
  for (let i = 0; i < CFG.bots; i++) S.spawnBot(world, { ring: i, idle: true, avoidPaint: save.sel.paint });
  world.events.length = 0; crownSprite.visible = false; chevrons.visible = false;
}
function leaveToMenu() { closeOnline(); toMenuWorld(); setState(State.MENU); refreshMenu(); }
const newRun = (extra = {}) => ({
  time: 0, countdown: 0, gearsEarned: 0, slow: 0, over: false, overTimer: 0, how: '', killer: null, leaderSaid: -99, happy: false, bestRank: 99, isBest: false,
  tutorial: false, tutStep: -1, tutMoved: 0, tutSparks: 0, tutDashHit: false, tutT: 0, dummyId: 0, ...extra,
});
function startRun() {
  closeOnline(); stopHum(); clearViews(); mode = 'solo';
  const tutorial = !save.tut && !CAPTURE;
  world = S.createWorld(); world.eventsOn = !tutorial; world.frozen = !CAPTURE;
  player = S.addTop(world, { parts: save.sel, name: 'You', human: true }); meId = player.id;
  if (tutorial) { player.noDecay = true; player.dmgTaken = 0.3; }
  for (let i = 0; i < CFG.bots; i++) { const b = S.spawnBot(world, { ring: i, avoidPaint: save.sel.paint }); b.timer = 0.6 + Math.random() * 0.6; if (tutorial) b.ai = 'passive'; }
  world.events.length = 0;
  run = newRun({ countdown: CAPTURE ? 0 : 2.6, tutorial });
  save.runs++; persist();
  $('feed').innerHTML = ''; boardTimer = 0;
  setState(State.PLAYING); startHum();
  if (!CAPTURE) { voice('go'); playSfx('launch', 0.8); }
}
const soloInput = (tp) => (tp.id !== meId ? null : AUTOPLAY ? S.botMove(world, tp, STEP) : { ...playerInput(), dash: takeDash() });
function endRun(e, killer) {
  run.over = true; run.how = e.how; run.killer = killer;
  Object.assign(player, { score: e.score ?? player.score, kos: e.kos ?? player.kos, peak: e.peak ?? player.peak, state: 'dead' });
  stopHum(); playSfx('over', 0.7);
  run.gearsEarned = Math.floor(player.score / 10) + player.kos * 3 + Math.floor(run.time / 20);
  save.gears += run.gearsEarned;
  run.isBest = player.score > save.best;
  if (run.isBest) { save.best = player.score; happytime(); }
  persist();
  run.overTimer = 1.2;
}
function showResults() {
  const r = run, k = r.killer;
  $('overBy').textContent = k ? t(r.how === 'ringout' ? 'byRingout' : 'byTopple', { n: k.name }) : t(r.how === 'ringout' ? 'selfRingout' : 'selfTopple');
  $('finalScore').textContent = player.score; $('overBest').textContent = save.best; $('newBest').hidden = !r.isBest;
  $('overRank').textContent = `#${r.bestRank < 99 ? r.bestRank : '-'}`; $('overKos').textContent = player.kos; $('overPeak').textContent = Math.round(player.peak);
  const sec = Math.floor(r.time); $('overTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('overGears').textContent = r.gearsEarned;
  $('btnDouble').hidden = !(adsAvailable() && r.gearsEarned > 0);
  setState(State.GAMEOVER); refreshMenu();
}
function tickRun(dt) {
  if (!run) return;
  if (run.countdown > 0) {
    const before = Math.ceil(run.countdown); run.countdown -= dt; const after = Math.ceil(run.countdown);
    const cd = $('countdown');
    boardTimer -= dt; if (boardTimer <= 0) { boardTimer = 0.25; renderBoard(); }
    if (run.countdown <= 0) {
      world.frozen = false; if (run.tutorial) nextTutStep();
      cd.textContent = t('go'); cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); setTimeout(() => { cd.hidden = true; }, 600);
    } else if (before !== after || cd.hidden) { cd.hidden = false; cd.textContent = String(after); cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); playSfx('count', 0.5); }
    return;
  }
  if (run.over) { run.overTimer -= dt; if (run.overTimer <= 0 && state === State.PLAYING) showResults(); }
  else run.time += dt;
  if (!run.over && player && alive(player)) { const rk = S.rankList(world).findIndex((tp) => tp.id === meId) + 1; if (rk > 0) run.bestRank = Math.min(run.bestRank, rk); }
  if (run.tutorial) tickTutorial(dt);
  boardTimer -= dt; if (boardTimer <= 0 && state === State.PLAYING) { boardTimer = 0.25; renderBoard(); }
  if (state === State.PLAYING && player && alive(player)) updateHUD();
}

// ================================================================ TUTORIAL (first solo run: learn by doing, ~30 s, skippable)
const TUT = [
  { text: 'tutMove', icon: () => (isTouch ? '<svg class="hand"><use href="#i-move"/></svg>' : '<span class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></span>'), done: () => run.tutMoved > 6 },
  { text: 'tutSparks', icon: () => '<svg><use href="#i-spark"/></svg>', setup: () => { for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; S.addSpark(world, player.x + Math.cos(a) * 4, player.z + Math.sin(a) * 4, { big: 1 }); } }, done: () => run.tutSparks >= 5 },
  { text: 'tutDash', icon: () => (isTouch ? '<svg class="hand"><use href="#i-dash"/></svg>' : '<span class="key">Space</span>'),
    setup: () => {
      const a = Math.atan2(-player.z, -player.x) || 0;
      const d = S.addTop(world, { parts: { crown: 'bastion', core: 'iron', tip: 'grip', paint: 'snow' }, name: t('dummy'), spin: 60, x: player.x + Math.cos(a) * 5, z: player.z + Math.sin(a) * 5, ai: 'dummy', spawn: false });
      run.dummyId = d.id;
    },
    done: () => run.tutDashHit },
  { text: 'tutPits', icon: () => '<svg><use href="#i-pit"/></svg>', setup: () => { const p = S.nearestPit(player.x, player.z); chevrons.visible = true; chevrons.rotation.y = -p.ang; run.tutT = 0; }, done: () => run.tutT > 5 },
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
  if (run.tutStep === 2 && !S.topById(world, run.dummyId)) TUT[2].setup(); // the practice top fell into a pit: bring a new one
  if (TUT[run.tutStep]?.done()) nextTutStep();
}
function finishTutorial(skipped) {
  if (!run?.tutorial) return;
  run.tutorial = false; save.tut = true; persist();
  $('coach').hidden = true; chevrons.visible = false;
  const dummy = S.topById(world, run.dummyId); if (dummy) dummy.ai = 'normal';
  for (const tp of world.tops) if (tp.ai === 'passive') tp.ai = 'normal';
  player.noDecay = false; player.dmgTaken = 1;
  world.eventsOn = true; world.nextEvent = world.time + CFG.eventFirst;
  if (!skipped) { banner(t('tutDone'), '', false, 2); playSfx('unlock', 0.7); }
}

// ================================================================ ONLINE (no account: join a public match, or a private room by code / invite link)
// The server runs the authoritative world; this client mirrors it. Other tops are drawn INTERP seconds in the past between
// two snapshots; my own top is predicted locally (same sim.integrate) and eased toward the server so steering feels instant.
const net = { joinable: null, ws: null, status: 'off', code: '', priv: false, name: '', players: 0, rtt: 0, offset: null, snaps: [], srvMe: null, me: null, leaving: false, sendT: 0, pingT: 0, sx: 9, sy: 9, dash: false };
const STATE_NAME = ['spawn', 'alive', 'falling', 'toppling'];
function connectOnline(joinMsg) {
  if (CAPTURE) return;
  closeOnline();
  net.status = 'connecting'; net.leaving = false;
  $('lobbyStatus').textContent = t('connecting'); $('lobbyStatus').classList.remove('bad');
  if (state !== State.LOBBY) setState(State.LOBBY);
  let ws; try { ws = new WebSocket(MP_URL); } catch { onlineFail('connFail'); return; }
  net.ws = ws;
  ws.onopen = async () => {
    net.opened = true;
    const name = await Promise.race([sdkUsername(), new Promise((r) => setTimeout(() => r(null), 3000))]); // never wait long for the account lookup
    if (net.ws === ws) ws.send(JSON.stringify({ ...joinMsg, name, parts: save.sel }));
  };
  ws.onmessage = (m) => { if (net.ws !== ws) return; let d; try { d = JSON.parse(m.data); } catch { return; } onNet(d); };
  ws.onclose = () => {
    if (net.ws !== ws) return;
    const was = net.status; net.ws = null; net.status = 'off';
    if (was === 'connecting') onlineFail('connFail'); else if (!net.leaving) { toast(t('connLost')); leaveToMenu(); }
  };
  ws.onerror = () => {};
  net.opened = false;
  setTimeout(() => { if (net.ws === ws && !net.opened && ws.readyState === WebSocket.CONNECTING) ws.close(); }, 25000); // only a socket that never opens times out
}
function onlineFail(key) { closeOnline(); if (state !== State.LOBBY) setState(State.LOBBY); $('lobbyStatus').textContent = t(key); $('lobbyStatus').classList.add('bad'); }
function closeOnline() {
  if (!net.ws && net.status === 'off') return;
  net.leaving = true; const ws = net.ws; net.ws = null; net.status = 'off';
  try { ws?.send(JSON.stringify({ t: 'leave' })); ws?.close(); } catch {}
  if (mode === 'online') sdkLeftRoom();
}
const netSend = (m) => { if (net.ws?.readyState === 1) net.ws.send(JSON.stringify(m)); };
function joinByCode(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { $('lobbyStatus').textContent = t('noRoom'); $('lobbyStatus').classList.add('bad'); return; }
  connectOnline({ t: 'join', mode: 'code', code });
}
function onNet(d) {
  switch (d.t) {
    case 'err': onlineFail(d.e === 'noroom' ? 'noRoom' : d.e === 'full' ? 'roomFull' : 'connFail'); break;
    case 'welcome': enterOnline(d); break;
    case 'you': meId = d.id; startOnlineLife(); break;
    case 's': onSnapshot(d); break;
    case 'p': { const rtt = performance.now() - d.c; net.rtt = net.rtt ? net.rtt * 0.8 + rtt * 0.2 : rtt; break; }
  }
}
function mirrorTop(info) {
  if (S.topById(world, info.id)) return;
  const parts = S.cleanParts(info.parts);
  const tp = {
    id: info.id, name: info.name, human: !!info.human, parts, stats: S.statsOf(parts), x: 0, z: 0, vx: 0, vz: 0, spin: CFG.startSpin, peak: CFG.startSpin,
    r: 1, mass: 1, state: 'spawn', timer: 0.6, fallY: 0, fallV: 0, dashT: 0, cd: 0, shield: 0, kos: 0, score: 0, hitWob: 0, faceX: 0, faceZ: 1, age: 0, placed: false,
  };
  S.updateMass(tp); world.tops.push(tp);
}
function mirrorSpark([i, x, z, vx, vz, fall, big]) { const s = world.sparks[i]; if (s) Object.assign(s, { on: true, x, z, vx, vz, fall, big, y: 0.4 + fall }); }
function enterOnline(d) {
  stopHum(); clearViews(); mode = 'online'; run = null; player = null; meId = 0;
  Object.assign(net, { status: 'in', code: d.code, priv: d.priv, name: d.name, players: d.players, snaps: [], offset: null, srvMe: null, me: null });
  $('roomCode').textContent = d.code; $('roomInfo').textContent = t('players', { n: d.players });
  world = S.createWorld({ bots: 0, sparks: 0 }); world.events.length = 0; world.time = d.tm;
  for (const info of d.tops) mirrorTop(info);
  for (const sp of d.sparks) mirrorSpark(sp);
  world.event = d.ev ? { ...d.ev } : null; world.leader = d.leader;
  chevrons.visible = world.event?.id === 'tilt'; if (chevrons.visible) chevrons.rotation.y = -PIT_ANGLES[world.event.pit];
  net.joinable = d.players < 10; sdkRoom({ roomId: d.code, isJoinable: net.joinable, inviteParams: { roomId: d.code } });
  if (d.priv) toast(t('shareCode', { c: d.code }));
}
function startOnlineLife() {
  run = newRun({ online: true }); player = S.topById(world, meId) || player;
  $('feed').innerHTML = ''; boardTimer = 0;
  setState(State.PLAYING); startHum(); playSfx('launch', 0.8);
}
function onlinePlayAgain() { if (net.status === 'in') netSend({ t: 'play', parts: save.sel }); else leaveToMenu(); }
function onSnapshot(d) {
  const now = performance.now() / 1000, off = d.tm - now;
  net.offset = net.offset == null ? off : net.offset + (off - net.offset) * 0.05; // smoothed server clock
  if (off > net.offset + 0.25) net.offset = off; // big lag spike recovered: jump forward
  world.time = d.tm; net.players = d.n;
  for (const e of d.ev) { if (e.type === 'add') mirrorTop(e); else handleEvent(e); }
  for (const sp of d.sp) mirrorSpark(sp);
  const seen = new Map();
  for (const a of d.tops) {
    seen.set(a[0], a);
    const tp = S.topById(world, a[0]); if (!tp) continue;
    const st = STATE_NAME[a[6]] || 'alive';
    if (st !== tp.state) { // state changes are animated locally from here
      if (st === 'falling') { tp.timer = 1.1; tp.fallY = bowlY(R); tp.fallV = -2; tp.vx = a[3]; tp.vz = a[4]; }
      if (st === 'toppling') { tp.timer = 0.9; tp.vx = a[3]; tp.vz = a[4]; }
      if (st === 'alive' && tp.id === meId) { tp.x = a[1]; tp.z = a[2]; tp.vx = a[3]; tp.vz = a[4]; }
      tp.state = st;
    }
    if (!tp.placed) { tp.x = a[1]; tp.z = a[2]; tp.placed = true; }
    tp.spin = a[5]; tp.peak = Math.max(tp.peak, tp.spin); tp.shield = a[7] & 2 ? 1 : 0; tp.dashT = a[7] & 1 ? 0.1 : 0; S.updateMass(tp);
    if (tp.id === meId) net.srvMe = { tm: d.tm, x: a[1], z: a[2], vx: a[3], vz: a[4] };
  }
  world.tops = world.tops.filter((tp) => seen.has(tp.id) || ((tp.state === 'falling' || tp.state === 'toppling') && tp.timer > 0)); // let a fall finish locally
  net.snaps.push({ tm: d.tm, tops: seen }); if (net.snaps.length > 30) net.snaps.shift();
  if (d.e && world.event) world.event.t = d.e.t; else if (!d.e && world.event) onEventEnd({ id: world.event.id });
  if (d.me && player && d.me.id === player.id) { player.score = d.me.score; player.kos = d.me.kos; player.peak = Math.max(player.peak, d.me.peak); player.cd = Math.max(player.cd, d.me.cd - 0.15); }
  const joinable = d.n < 10; if (joinable !== net.joinable) { net.joinable = joinable; sdkRoom({ isJoinable: joinable }); }
}
function netStep(dt) { // per fixed step while online: local animation, my prediction, input upload
  S.updateSparks(world, dt);
  if (world.event) world.event.t -= dt;
  for (const tp of world.tops) {
    tp.hitWob = Math.max(0, tp.hitWob - dt * 0.8);
    if (tp.state === 'falling' || tp.state === 'toppling') S.animateDying(tp, dt);
    else if (tp.state === 'spawn') tp.timer = Math.max(0, tp.timer - dt);
  }
  const me = S.topById(world, meId), playing = state === State.PLAYING && run && !run.over;
  let inp = { x: 0, y: 0 };
  if (me && alive(me) && playing) {
    inp = playerInput();
    if (takeDash() && me.cd <= 0) { S.dash(world, me, inp); dashFx(me, me.faceX, me.faceZ); net.dash = true; world.events.length = 0; }
    S.integrate(world, me, inp, dt); S.walls(world, me, true); S.updateMass(me);
    const srv = net.srvMe;
    if (srv) { // ease toward where the server says I am (extrapolated to now); snap when far off
      const age = clamp(performance.now() / 1000 + net.offset - srv.tm, 0, 0.4), tx = srv.x + srv.vx * age, tz = srv.z + srv.vz * age, err = Math.hypot(tx - me.x, tz - me.z);
      if (err > 4) { me.x = tx; me.z = tz; me.vx = srv.vx; me.vz = srv.vz; }
      else { const k = 1 - Math.exp(-dt * 5), kv = 1 - Math.exp(-dt * 3); me.x += (tx - me.x) * k; me.z += (tz - me.z) * k; me.vx += (srv.vx - me.vx) * kv; me.vz += (srv.vz - me.vz) * kv; }
    }
  }
  net.sendT -= dt; net.pingT -= dt;
  if (net.sendT <= 0 && (net.dash || Math.abs(inp.x - net.sx) + Math.abs(inp.y - net.sy) > 0.05 || net.sendT < -0.25)) {
    netSend({ t: 'i', x: Math.round(inp.x * 100) / 100, y: Math.round(inp.y * 100) / 100, d: net.dash ? 1 : 0 });
    net.sx = inp.x; net.sy = inp.y; net.dash = false; net.sendT = 0.05;
  }
  if (net.pingT <= 0) { net.pingT = 2; netSend({ t: 'p', c: performance.now() }); }
}
function netInterpolate() { // place every other top at "server now - INTERP" between the two snapshots around that time
  const snaps = net.snaps; if (!snaps.length || net.offset == null) return;
  const rt = performance.now() / 1000 + net.offset - INTERP;
  let s0 = snaps[0], s1 = snaps[snaps.length - 1];
  for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].tm <= rt) { s0 = snaps[i - 1]; s1 = snaps[i]; break; }
  const k = s1.tm > s0.tm ? clamp((rt - s0.tm) / (s1.tm - s0.tm), 0, 1) : 1;
  for (const tp of world.tops) {
    if ((tp.id === meId && alive(tp)) || tp.state === 'falling' || tp.state === 'toppling') continue;
    const a = s0.tops.get(tp.id), b = s1.tops.get(tp.id) || a; if (!a && !b) continue;
    const p = a || b;
    tp.x = p[1] + (b[1] - p[1]) * k; tp.z = p[2] + (b[2] - p[2]) * k; tp.vx = p[3] + (b[3] - p[3]) * k; tp.vz = p[4] + (b[4] - p[4]) * k;
  }
}
async function shareInvite() {
  if (!net.code) return;
  const link = inviteLinkFor(net.code);
  try { await navigator.clipboard.writeText(link); toast(t('linkCopied')); } catch { toast(t('shareCode', { c: net.code })); }
}

// ================================================================ LOOP (fixed-step simulation, render sync, calm camera)
let last = performance.now(), acc = 0;
const camPos = new THREE.Vector3(0, 30, 24), camLook = new THREE.Vector3(), lookGoal = new THREE.Vector3();
function step(dt) {
  simTime += dt;
  if (mode === 'online') { if (net.status === 'in') netStep(dt); tickRun(dt); return; }
  if (state === State.PLAYING || state === State.GAMEOVER) {
    S.step(world, dt, soloInput);
    for (const e of world.events) handleEvent(e);
    world.events.length = 0;
    tickRun(dt);
  } else S.updateSparks(world, dt);
}
function advance(dt) {
  if (state === State.PAUSED && mode !== 'online') return; // online the world keeps going: my top just stops steering
  let sdt = dt;
  if (run?.slow > 0) { run.slow -= dt; sdt = dt * (mode === 'online' ? 1 : 0.3); }
  acc += sdt; let n = 0; while (acc >= STEP && n < 8) { step(STEP); acc -= STEP; n++; } if (n >= 8) acc = 0;
  if (mode === 'online') netInterpolate();
  refreshPlayer();
  updateParticles(sdt); updateWaves(sdt);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').hidden = true; }
  if (state === State.PLAYING && run && player && alive(player)) {
    const sp = Math.hypot(player.vx, player.vz);
    updateHum(0.05 + 0.1 * clamp(player.spin / 300, 0, 1) + 0.05 * clamp(sp / 10, 0, 1), 0.75 + 0.45 * clamp(player.spin / 400, 0, 1) + sp * 0.01);
  }
}
function syncTop(tp, v, dt) {
  const m = v.mesh, s = tp.r, r = Math.hypot(tp.x, tp.z), me = tp.id === meId;
  let y = bowlY(Math.min(r, R));
  if (tp.state === 'spawn') y += Math.max(0, tp.timer) * 9;
  if (tp.state === 'falling') y = tp.fallY;
  m.root.scale.setScalar(s); m.root.position.set(tp.x, y, tp.z);
  const spinFrac = clamp(tp.spin / 220, 0, 1);
  const omega = tp.state === 'toppling' ? tp.timer * 10 : 9 + 28 * spinFrac;
  m.spin.rotation.y -= omega * dt;
  v.prec += dt * (5 + 7 * spinFrac);
  let amp = 0.025 + tp.hitWob + (tp.spin < 30 ? ((30 - Math.max(0, tp.spin)) / 30) * 0.28 : 0);
  if (tp.state === 'toppling') amp = 0.35 + (0.9 - tp.timer) * 1.3;
  if (tp.state === 'falling') amp = 0.3 + (1.1 - tp.timer) * 1.2;
  const sp = Math.hypot(tp.vx, tp.vz), lean = clamp(sp * 0.014, 0, 0.13), lx = sp > 0.1 ? tp.vx / sp : 0, lz = sp > 0.1 ? tp.vz / sp : 0;
  m.tilt.rotation.x = lean * lz + amp * Math.sin(v.prec); m.tilt.rotation.z = -lean * lx + amp * Math.cos(v.prec);
  m.blur.material.opacity = tp.state === 'alive' || tp.state === 'spawn' ? 0.12 + 0.42 * spinFrac : 0.05;
  if (me) m.ring.material.opacity = tp.cd <= 0 ? 0.7 + 0.25 * Math.sin(simTime * 8) : 0.4;
  m.ring.visible = tp.state === 'alive' && !(tp.shield > 0 && Math.sin(simTime * 30) < -0.3);
  v.label.visible = state !== State.COVER && (state === State.PLAYING || state === State.GAMEOVER || state === State.PAUSED);
  v.label.position.set(tp.x, y + 0.95 * s + 0.75, tp.z);
  const ls = 2.5 + s * 0.4; v.label.scale.set(ls, ls * 0.22, 1);
  v.tp = tp;
}
function render(dt) {
  const ids = new Set();
  for (const tp of world.tops) { ids.add(tp.id); syncTop(tp, viewFor(tp), dt); }
  for (const id of [...views.keys()]) if (!ids.has(id)) dropView(id);
  renderSparks();
  const lead = S.topById(world, world.leader);
  if (lead && alive(lead) && (state === State.PLAYING || state === State.GAMEOVER || state === State.PAUSED)) {
    crownSprite.visible = true; crownSprite.position.set(lead.x, views.get(lead.id).mesh.root.position.y + 0.95 * lead.r + 1.55, lead.z); const cs = 0.9 + lead.r * 0.15; crownSprite.scale.set(cs, cs, 1);
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
  if (state === State.MENU || state === State.GARAGE || state === State.LOBBY) {
    const a = simTime * 0.18, dist = state === State.GARAGE ? 5.2 : 6.5, h = state === State.GARAGE ? 2.6 : 3.2;
    const px = player ? player.x : 0, pz = player ? player.z : 0, py = player ? bowlY(Math.hypot(px, pz)) : 0;
    camPos.set(px + Math.sin(a) * dist, py + h, pz + Math.cos(a) * dist); camLook.set(px, py + 0.75, pz);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 3));
    const w = innerWidth, hh = innerHeight;
    if (portrait) camera.setViewOffset(w, hh, 0, hh * 0.22, w, hh); else camera.setViewOffset(w, hh, -w * 0.2, 0, w, hh);
  } else {
    // Calm follow: a small velocity lead and smoothed look target, so knock-backs and topples do not whip the view around
    camera.clearViewOffset();
    const s = player ? player.r : 1, zoom = (1 + (s - 1) * 0.45) * (portrait ? 1.55 : 1);
    const px = player ? player.x : 0, pz = player ? player.z : 0;
    const lead = state === State.PLAYING && player && alive(player) ? 0.12 : 0;
    lookGoal.set(px + (player?.vx || 0) * lead, 0, pz + (player?.vz || 0) * lead);
    camLook.lerp(lookGoal, 1 - Math.exp(-dt * 4));
    const over = state === State.GAMEOVER ? 1.25 : 1;
    camPos.set(camLook.x, 15 * zoom * over, camLook.z + 12.5 * zoom * over);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 3.5));
  }
  shakeAmt = Math.max(0, shakeAmt - dt * 2.5);
  if (shakeAmt > 0) { camera.position.x += Math.sin(simTime * 31) * shakeAmt * 0.5; camera.position.z += Math.cos(simTime * 27) * shakeAmt * 0.4; } // smooth wobble, no random jitter
  camera.lookAt(camLook);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; lastFrameAt = performance.now();
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ COVER (tools/game_covers.py: honest key art rendered from the game itself)
function stageCover(kind) {
  state = State.COVER; document.body.classList.add('cover');
  for (const id of ['menu', 'garage', 'lobby', 'paused', 'gameover', 'hud', 'banner', 'coach', 'countdown', 'toast', 'btnAction', 'joystick']) $(id).hidden = true;
  camera.clearViewOffset(); clearViews(); mode = 'solo';
  world = S.createWorld({ bots: 0, sparks: 0 });
  player = S.addTop(world, { parts: { crown: 'razor', core: 'heart', tip: 'needle', paint: 'sun' }, name: 'You', human: true, spin: 220, x: -1.15, z: 0.3, spawn: false }); meId = player.id; player.hitWob = 0.12;
  S.addTop(world, { parts: { crown: 'bastion', core: 'iron', tip: 'grip', paint: 'coral' }, name: 'Rival', spin: 200, x: player.x + player.r + S.radiusOf(200) - 0.05, z: 0.1, spawn: false }).hitWob = 0.15;
  const extra = [[{ crown: 'comet', core: 'feather', tip: 'glide', paint: 'mint' }, -6.5, -5.5], [{ crown: 'halo', core: 'gyro', tip: 'dome', paint: 'sky' }, 6.5, -6.5], [{ crown: 'razor', core: 'gyro', tip: 'grip', paint: 'violet' }, -9, -12], [{ crown: 'halo', core: 'iron', tip: 'needle', paint: 'lime' }, 10, -13]];
  for (const [p, x, z] of extra) S.addTop(world, { parts: p, name: 'b', spin: 120, x, z, spawn: false });
  for (let k = 0; k < 45; k++) { const a = rand(Math.PI * 1.05, Math.PI * 1.95), r = rand(3, 16); S.addSpark(world, Math.cos(a) * r, Math.sin(a) * r, { big: k % 4 === 0 ? 1 : 0 }); } // behind the clash, not in the lens
  world.events.length = 0;
  const cx = player.x + player.r, cy = bowlY(1) + 0.55 * player.r;
  for (const tp of world.tops) syncTop(tp, viewFor(tp), 0.016);
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
  buildWorld(); initSparks(); scene.add(crownSprite);
  toMenuWorld();
  $('menuControls').innerHTML = controlsHTML(); refreshMenu(); refreshShakeButton();
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
    return;
  }
  requestAnimationFrame((n) => { last = n; frame(n); });
  if (params.has('debug')) window.__wb = () => ({ world, meId, player, net, views, state, mode }); // inspection hook for tests
  // invite links and the CrazyGames "instant multiplayer" entry go straight into the right room
  const invited = sdkInviteParam('roomId') || params.get('room');
  const afterFirstFrames = (fn) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fn, 0))); // shaders are compiled by then
  if (invited) afterFirstFrames(() => joinByCode(invited));
  else if (sdkInstantMultiplayer()) afterFirstFrames(() => connectOnline({ t: 'join', mode: 'create' }));
  sdkCall((s) => s.game.addJoinRoomListener?.((p) => { if (p?.roomId) { leaveToMenu(); joinByCode(p.roomId); } }));
}
boot();
