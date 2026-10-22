// Kitewind: fly a kite over a seaside island; its ribbon tail paints grey clouds, painted clouds bloom and rain colour on the
// village below, and the island wakes up. Eight skies + Free Sky solo, and co-op online skies for up to 4 kites (mp/kitewind.mjs).
// Sections: CONFIG, I18N, SDK, AUDIO, WORLD, THEMES, SCENERY, CLOUDS, KITES, FX, INPUT, STATE, UI, SOLO, ONLINE, ONBOARDING,
// BOT, LOOP, COVER, BOOT. Rules live in sim.js (shared with the server); this file draws them and reacts to their events.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as S from './sim.js';

// ================================================================ CONFIG
const SAVE_KEY = 'kitewind';
const STEP = S.STEP;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = (CAPTURE && !params.has('nobot')) || params.has('autoplay'); // a bot flies by itself (trailer, balance tests)
const NO_TIPS = CAPTURE && !params.has('tips');
const MP_URL = /^wss?:\/\//.test(params.get('mp') || '') ? params.get('mp') : 'wss://broadgames.pro/mp/kitewind';
const CFG = { netRate: 1 / 15, interpDelay: 0.13, camLerp: 3.2 };
const SFX_FILES = {
  paint: 'assets/audio/kite_paint.mp3', bloom: 'assets/audio/kite_bloom.mp3', loop: 'assets/audio/kite_loop.mp3', dash: 'assets/audio/kite_dash.mp3',
  ring: 'assets/audio/kite_ring.mp3', lantern: 'assets/audio/kite_lantern.mp3', crash: 'assets/audio/kite_crash.mp3', done: 'assets/audio/kite_sky_done.mp3',
  zap: 'assets/audio/thunder.mp3', cheer: 'assets/audio/whirl_cheer.mp3', confetti: 'assets/audio/whirl_confetti.mp3', wind: 'assets/audio/bloom_season.mp3',
  gem: 'assets/audio/dash_gem.mp3', upgrade: 'assets/audio/upgrade.mp3', unlock: 'assets/audio/unlock.mp3', good: 'assets/audio/gate_good.mp3',
  windLoop: 'assets/audio/kite_wind_loop.mp3', flutter: 'assets/audio/kite_flutter_loop.mp3', shore: 'assets/audio/kite_shore_loop.mp3',
};
const MUSIC_FILES = { day: 'assets/audio/bgm_kite_day.mp3', night: 'assets/audio/bgm_kite_night.mp3' };
const SFX_GAIN = { paint: 0.35, bloom: 1.1, loop: 0.35, dash: 0.6, ring: 1.1, lantern: 0.8, crash: 0.9, done: 0.4, zap: 0.55, cheer: 0.3, confetti: 0.9,
  wind: 0.8, gem: 1.4, upgrade: 0.5, unlock: 0.6, good: 0.7, windLoop: 1.2, flutter: 1.6, shore: 1.0 };

// ================================================================ I18N (English required; Turkish welcome)
const STRINGS = {
  en: {
    play: 'Play', continue: 'Continue', next: 'Next: {s}', flyTogether: 'Fly together', skies: 'Skies', workshop: 'Workshop', settings: 'Settings',
    tagline: 'Fly a kite, paint the sky, wake up the island.', back: 'Back', done: 'Done', menu: 'Menu', paused: 'Paused', resume: 'Resume',
    music: 'Music', sound: 'Sound', graphics: 'Graphics', gfx_auto: 'Auto', gfx_high: 'High', gfx_low: 'Fast', skipTips: 'Skip tips',
    privacy: 'Kitewind has no accounts of its own. Your progress is saved on this device, and in your account when you are signed in on the platform. Online play sends your player name and your kite\'s position to the game server for the length of the match; it keeps nothing else.',
    skyNames: ['Dawn Bay', 'Gull Cliffs', 'Sunny Harbor', 'Rainbow Reef', 'Sunset Lagoon', 'Storm Point', 'Lantern Night', 'Aurora Isle'],
    freeSky: 'Free Sky', freeSkySub: 'Endless skies, one after another', freeLocked: 'Finish Aurora Isle', locked: 'Finish {s}',
    clouds: '{n} / {g} clouds in bloom', starsTotal: '{n} stars', parTime: 'Under {t} for 2 stars',
    resDone: 'Sky in full bloom!', resTime: 'Time {t} · best {b}', resFree: '{n} skies in a row', doubleBreeze: 'Watch an ad: double breeze',
    nextSky: 'Next sky', replay: 'Fly again', freeNext: 'Next Free Sky', toWorkshop: 'Upgrade your kite in the Workshop',
    up_string: 'Longer string', upd_string: 'Reach clouds farther away', up_tail: 'Longer tail', upd_tail: 'Paints more of a cloud at once',
    up_ribbon: 'Wider ribbon', upd_ribbon: 'Paints a wider stripe, bigger loops', up_speed: 'Lighter frame', upd_speed: 'Flies faster',
    up_dash: 'Gust dash', upd_dash: 'Dash again sooner', max: 'Max', kites: 'Kites', starsNeed: '{n} stars',
    kite_diamond: 'Diamond', kite_delta: 'Delta', kite_fish: 'Koi', kite_box: 'Box', kite_dragon: 'Dragon', kite_star: 'Star',
    perk_null: 'A classic', perk_turn: 'Turns 20% faster', perk_paint: 'Paints 12% faster', perk_lift: 'Floats when you let go',
    perk_tail: 'Tail 6 longer', perk_breeze: '+15% breeze',
    tip_move: 'Steer your kite', tip_moveTouch: 'Drag anywhere to steer your kite', tip_paint: 'Fly through a grey cloud to paint it',
    tip_loop: 'Fly a full circle: a loop paints everything inside', tip_dash: 'Gust dash: a burst of speed', tip_birds: 'Fly with the birds for a speed boost',
    tip_rings: 'Rings refill your dash', tip_storm: 'Storm clouds zap kites: loop around them to calm them', tip_wind: 'The wind is turning: the other side gets faster',
    tip_workshop: 'Spend breeze on upgrades', tip_reach: 'Some clouds are too far: buy a longer string',
    bloom: 'Bloom!', combo: 'Combo x{n}', loopBanner: 'Loop!', crash: 'Oops!', zap: 'Zap!', ring: 'Ring!', calm: 'Storm calmed!',
    windTurn: 'The wind is turning…', windNow: 'Wind from the {d}', left: 'left', right: 'right',
    ctl_steer: 'Steer', ctl_dash: 'Gust dash', ctl_pause: 'Pause', ctl_mouse: 'or hold the mouse', ctl_drag: 'Drag to steer', ctl_tap: 'Tap ⚡ to dash',
    onlineSub: 'Paint one sky with up to 3 other players. Every cloud you bloom pays breeze to everyone.', quickJoin: 'Join a sky', createRoom: 'Invite friends',
    joinCode: 'Join with code', connecting: 'Connecting…', offline: 'The online skies are not reachable right now.', full: 'That sky is full.',
    nocode: 'No sky with that code.', busy: 'The server is busy. Try again in a minute.', invite: 'Invite', copied: 'Invite link copied!', inviteCode: 'Room code {c}',
    youAre: 'You fly as {n}', joined: '{n} joined', left_: '{n} left', partyNext: 'Next sky in {n}…', onlinePause: 'Paused (the others keep flying)',
    chat_nice: 'Nice!', chat_here: 'Over here!', chat_loop: 'Loop time!', chat_thanks: 'Thanks!', chat_go: "Let's go!",
    adUnavailable: 'No ad available right now', doubled: 'Breeze doubled!', newBest: 'New best!', needBreeze: 'Not enough breeze yet', stars3: 'All 3 stars!',
  },
  tr: {
    play: 'Oyna', continue: 'Devam et', next: 'Sıradaki: {s}', flyTogether: 'Birlikte uç', skies: 'Gökyüzleri', workshop: 'Atölye', settings: 'Ayarlar',
    tagline: 'Uçurtma uçur, gökyüzünü boya, adayı uyandır.', back: 'Geri', done: 'Tamam', menu: 'Menü', paused: 'Duraklatıldı', resume: 'Devam',
    music: 'Müzik', sound: 'Ses', graphics: 'Grafik', gfx_auto: 'Otomatik', gfx_high: 'Yüksek', gfx_low: 'Hızlı', skipTips: 'İpuçlarını geç',
    privacy: 'Kitewind\'in kendi hesap sistemi yoktur. İlerlemen bu cihazda, platformda giriş yaptıysan hesabında da saklanır. Çevrimiçi oyunda oyuncu adın ve uçurtmanın konumu maç boyunca oyun sunucusuna gider; sunucu başka bir şey tutmaz.',
    skyNames: ['Şafak Koyu', 'Martı Kayalıkları', 'Güneşli Liman', 'Gökkuşağı Resifi', 'Gün Batımı Lagünü', 'Fırtına Burnu', 'Fener Gecesi', 'Kutup Işığı Adası'],
    freeSky: 'Serbest Gökyüzü', freeSkySub: 'Bitmeyen gökyüzleri, biri ardına', freeLocked: 'Kutup Işığı Adası\'nı bitir', locked: '{s} bitmeli',
    clouds: '{n} / {g} bulut çiçekte', starsTotal: '{n} yıldız', parTime: '2 yıldız için {t} altında',
    resDone: 'Gökyüzü tam çiçekte!', resTime: 'Süre {t} · en iyi {b}', resFree: 'Art arda {n} gökyüzü', doubleBreeze: 'Reklam izle: esintiyi ikiye katla',
    nextSky: 'Sonraki gökyüzü', replay: 'Yeniden uç', freeNext: 'Sonraki serbest gökyüzü', toWorkshop: 'Uçurtmanı Atölye\'de geliştir',
    up_string: 'Uzun ip', upd_string: 'Daha uzaktaki bulutlara uzan', up_tail: 'Uzun kuyruk', upd_tail: 'Bir bulutun daha çoğunu boyar',
    up_ribbon: 'Geniş kurdele', upd_ribbon: 'Daha geniş boyar, döngüler büyür', up_speed: 'Hafif gövde', upd_speed: 'Daha hızlı uçar',
    up_dash: 'Rüzgâr atılışı', upd_dash: 'Atılış daha çabuk dolar', max: 'Maks', kites: 'Uçurtmalar', starsNeed: '{n} yıldız',
    kite_diamond: 'Elmas', kite_delta: 'Delta', kite_fish: 'Koi', kite_box: 'Kutu', kite_dragon: 'Ejderha', kite_star: 'Yıldız',
    perk_null: 'Bir klasik', perk_turn: '%20 daha hızlı döner', perk_paint: '%12 daha hızlı boyar', perk_lift: 'Bırakınca süzülür',
    perk_tail: 'Kuyruk 6 uzun', perk_breeze: '+%15 esinti',
    tip_move: 'Uçurtmanı yönlendir', tip_moveTouch: 'Uçurtmayı yönlendirmek için sürükle', tip_paint: 'Boyamak için gri bir bulutun içinden geç',
    tip_loop: 'Tam bir daire çiz: döngü içindeki her şeyi boyar', tip_dash: 'Rüzgâr atılışı: ani bir hız', tip_birds: 'Hız için kuşlarla birlikte uç',
    tip_rings: 'Halkalar atılışını doldurur', tip_storm: 'Fırtına bulutları çarpar: etraflarında döngü yapıp sakinleştir', tip_wind: 'Rüzgâr dönüyor: öbür taraf hızlanacak',
    tip_workshop: 'Esintiyi geliştirmelere harca', tip_reach: 'Bazı bulutlar çok uzakta: daha uzun bir ip al',
    bloom: 'Çiçek!', combo: 'Kombo x{n}', loopBanner: 'Döngü!', crash: 'Hay aksi!', zap: 'Çarpıldın!', ring: 'Halka!', calm: 'Fırtına dindi!',
    windTurn: 'Rüzgâr dönüyor…', windNow: 'Rüzgâr {d} taraftan', left: 'sol', right: 'sağ',
    ctl_steer: 'Yönlendir', ctl_dash: 'Rüzgâr atılışı', ctl_pause: 'Duraklat', ctl_mouse: 'ya da fareyi basılı tut', ctl_drag: 'Yönlendirmek için sürükle', ctl_tap: 'Atılış için ⚡\'ye dokun',
    onlineSub: '3 oyuncuya kadar arkadaşınla aynı gökyüzünü boya. Açtığın her bulut herkese esinti kazandırır.', quickJoin: 'Bir gökyüzüne katıl', createRoom: 'Arkadaş davet et',
    joinCode: 'Kodla katıl', connecting: 'Bağlanıyor…', offline: 'Çevrimiçi gökyüzlerine şu anda ulaşılamıyor.', full: 'O gökyüzü dolu.',
    nocode: 'Bu kodla bir gökyüzü yok.', busy: 'Sunucu meşgul. Biraz sonra tekrar dene.', invite: 'Davet et', copied: 'Davet bağlantısı kopyalandı!', inviteCode: 'Oda kodu {c}',
    youAre: '{n} olarak uçuyorsun', joined: '{n} katıldı', left_: '{n} ayrıldı', partyNext: 'Sonraki gökyüzü {n} sn içinde…', onlinePause: 'Duraklatıldı (diğerleri uçmaya devam ediyor)',
    chat_nice: 'Harika!', chat_here: 'Buraya!', chat_loop: 'Döngü zamanı!', chat_thanks: 'Teşekkürler!', chat_go: 'Hadi!',
    adUnavailable: 'Şu anda reklam yok', doubled: 'Esinti ikiye katlandı!', newBest: 'Yeni rekor!', needBreeze: 'Henüz yeterli esinti yok', stars3: '3 yıldızın hepsi!',
  },
};
let lang = 'en';
const t = (k, vars) => {
  let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;
  if (vars && typeof s === 'string') for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }
const skyName = (i) => (i >= S.SKIES.length ? t('freeSky') : t('skyNames')[i]);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: three stars, a new Free Sky best

// Midgame: only between skies (the level end), never on navigation buttons. Mute on adStarted (not on request); always continue.
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
// multiplayer helpers (CrazyGames room flow; off-platform: ?room=CODE links)
function sdkInviteParam(k) { if (!sdkReady()) return null; try { return crazySdk.game.getInviteParam?.(k) ?? null; } catch { return null; } }
function sdkInstantMultiplayer() { if (!sdkReady()) return false; try { return !!crazySdk.game.isInstantMultiplayer; } catch { return false; } }
function inviteLinkFor(code) {
  if (sdkReady()) try { const link = crazySdk.game.inviteLink({ roomId: code }); if (link) return link; } catch {}
  const u = new URL(location.href); u.search = ''; u.searchParams.set('room', code); return u.toString();
}
async function sdkToken() { // a signed CrazyGames user token: the game server reads the verified username from it
  if (!sdkReady()) return null;
  try {
    if (!crazySdk.user?.isUserAccountAvailable) return null;
    const tok = await Promise.race([crazySdk.user.getUserToken(), new Promise((r) => setTimeout(() => r(null), 1500))]); // never let it hold up the connection
    return tok || null;
  } catch { return null; }
}
const sdkRoom = (info) => sdkCall((s) => s.game.updateRoom?.(info));
const sdkLeftRoom = () => sdkCall((s) => s.game.leftRoom?.());

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
  paint: ['sine', 700, 1100, 0.08, 0.06], bloom: ['triangle', 520, 1560, 0.5, 0.15], loop: ['sine', 300, 1400, 0.5, 0.14], dash: ['sawtooth', 200, 900, 0.25, 0.08],
  ring: ['sine', 1500, 2200, 0.25, 0.12], lantern: ['sine', 600, 900, 0.6, 0.1], crash: ['triangle', 400, 120, 0.5, 0.15], done: ['triangle', 392, 1568, 1, 0.16],
  zap: ['sawtooth', 160, 40, 0.5, 0.2], cheer: ['triangle', 600, 900, 0.4, 0.08], confetti: ['square', 900, 1800, 0.2, 0.06], wind: ['sine', 200, 500, 1, 0.1],
  gem: ['sine', 1800, 2600, 0.2, 0.1], upgrade: ['square', 660, 990, 0.14, 0.08], unlock: ['triangle', 523, 1046, 0.4, 0.14], good: ['sine', 700, 1400, 0.3, 0.12],
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
const MIN_GAP = { paint: 0.12, gem: 0.05, click: 0.03, tip: 0.1, ring: 0.08 };
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
function setLoop(key, level) { // wind, kite flutter and shore beds; level 0..1, faded
  if (!audio.ctx || CAPTURE) return;
  let L = audio.loops[key];
  if (!L) {
    const b = audio.buffers[key]; if (!b || level <= 0) return;
    const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain();
    s.buffer = b; s.loop = true; s.loopStart = 0.06; s.loopEnd = b.duration - 0.06; g.gain.value = 0;
    s.connect(g); g.connect(audio.master); s.start(0, 0.06); L = audio.loops[key] = { s, g, level: -1 };
  }
  if (Math.abs(L.level - level) < 0.02) return;
  L.level = level; L.g.gain.setTargetAtTime(level * (SFX_GAIN[key] ?? 1) * save.vol.sfx, audio.ctx.currentTime, 0.4);
}
function playMusic(key) {
  audio.wantMusic = true;
  if (key && key !== audio.musicKey) {
    if (audio.music) { audio.music.pause(); audio.music = null; }
    audio.musicKey = key; audio.music = new Audio(MUSIC_FILES[key]); audio.music.loop = true; audio.music.onerror = () => { audio.music = null; };
    setMusicVolume();
  }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function setMusicVolume() { if (audio.music) audio.music.volume = Math.min(1, (audio.musicKey === 'night' ? 0.26 : 0.36) * save.vol.music); }
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
}

// ================================================================ WORLD (renderer, camera, lights)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#cfeaff', 70, 190);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);
const hemi = new THREE.HemisphereLight('#ffffff', '#8a9a7a', 1.3); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3dc', 2.4); sun.position.set(-30, 40, 40); scene.add(sun);
const uTime = { value: 0 };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
let shakeAmt = 0;
let gfxLow = null, autoLow = !CAPTURE && !!navigator.deviceMemory && navigator.deviceMemory <= 4, fpsAcc = 0, fpsN = 0;
function applyGfx() { // High (sharp, more particles) or Fast (1x pixels, fewer particles). Auto: Fast on small-memory devices or slow frames
  const low = !CAPTURE && (save.gfx === 'low' || (save.gfx === 'auto' && autoLow));
  if (low === gfxLow) return; gfxLow = low;
  renderer.setPixelRatio(low ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.75)); resize();
}
function watchFps(dt) {
  if (save.gfx !== 'auto' || autoLow || CAPTURE || state !== State.PLAYING) { fpsAcc = fpsN = 0; return; }
  fpsAcc += dt; fpsN++; if (fpsAcc > 5) { if (fpsAcc / fpsN > 1 / 30) { autoLow = true; applyGfx(); } fpsAcc = fpsN = 0; }
}
const fxBudget = () => (gfxLow ? 0.5 : 1);
const hexOf = (c) => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c.getHex(THREE.SRGBColorSpace));

// ================================================================ THEMES (one palette per sky: sky, sea, island, clouds, light)
const THEMES = {
  dawn: { top: '#7f86ff', horizon: '#ffc4a8', fog: '#ffcdb8', sun: '#ffd9b0', sunI: 2.2, sunPos: [-40, 18, 30], hemiSky: '#ffe4e0', hemiGnd: '#9a7f8f', hemiI: 1.3,
    sea: '#7fa3d8', sand: '#f2d2b0', grass: '#9fd07f', hill: '#a7b9d8', grey: '#d8d4de', paints: ['#ff8fb1', '#ffb36b', '#ffe26b', '#b9a2ff', '#7fd8ff'], music: 'day', disc: '#fff1cf' },
  morning: { top: '#55aaff', horizon: '#dff2ff', fog: '#d4ecff', sun: '#fff6e0', sunI: 2.6, sunPos: [-30, 34, 30], hemiSky: '#eef6ff', hemiGnd: '#8a9a7a', hemiI: 1.35,
    sea: '#45a0e0', sand: '#f5dfb5', grass: '#7cd062', hill: '#8fc0a0', grey: '#cdd2dc', paints: ['#ff6f9f', '#ffc23d', '#56d68a', '#5ab8ff', '#c79bff'], music: 'day', disc: '#fffbe8' },
  noon: { top: '#2a86e6', horizon: '#c4e8ff', fog: '#c8e8ff', sun: '#ffffff', sunI: 2.9, sunPos: [0, 60, 30], hemiSky: '#f2f9ff', hemiGnd: '#8a9a7a', hemiI: 1.4,
    sea: '#2c8cd6', sand: '#f7e4b8', grass: '#6cc95a', hill: '#7fbf8f', grey: '#c8ccd6', paints: ['#ff5f8f', '#ffb13d', '#38c7ff', '#7cd85a', '#b585ff'], music: 'day', disc: '#ffffff' },
  rainbow: { top: '#6c98ff', horizon: '#ffe2f2', fog: '#f5e0f0', sun: '#fff2e8', sunI: 2.6, sunPos: [-20, 40, 30], hemiSky: '#fff0fa', hemiGnd: '#9a8aa0', hemiI: 1.35,
    sea: '#4cb0e0', sand: '#f7dcc0', grass: '#7fd36a', hill: '#a0c8b0', grey: '#d2cdd8', paints: ['#ff6b6b', '#ffa94d', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc'], music: 'day', disc: '#fff6e8' },
  sunset: { top: '#584ea6', horizon: '#ffad78', fog: '#ffb88c', sun: '#ffb36b', sunI: 2.3, sunPos: [45, 10, 20], hemiSky: '#ffd2b8', hemiGnd: '#7a5a6a', hemiI: 1.2,
    sea: '#6a6db0', sand: '#e8b89a', grass: '#93a862', hill: '#a87f8f', grey: '#bfaab4', paints: ['#ffd36b', '#ff8f6b', '#ff6fa8', '#c98bff', '#ffe9a8'], music: 'day', disc: '#ffd28a' },
  storm: { top: '#3c436c', horizon: '#9aa3c0', fog: '#8f98b8', sun: '#d0d8f0', sunI: 1.6, sunPos: [-20, 40, 30], hemiSky: '#c8d0e8', hemiGnd: '#5a6070', hemiI: 1.15,
    sea: '#4d5e80', sand: '#c9c0b0', grass: '#6f9a70', hill: '#6f7a90', grey: '#7c8098', paints: ['#7fe0ff', '#ffe066', '#ff8fb1', '#9dff9d', '#c3a6ff'], music: 'night', disc: '#e8eeff' },
  night: { top: '#0d123c', horizon: '#3a3f8f', fog: '#2a2f6a', sun: '#c8d4ff', sunI: 0.9, sunPos: [30, 40, 30], hemiSky: '#8a94d8', hemiGnd: '#2a2f50', hemiI: 0.9,
    sea: '#1d2860', sand: '#8f88a8', grass: '#3f5f6a', hill: '#2f3a6a', grey: '#5a5f8a', paints: ['#ffd36b', '#ff8fb1', '#8fe0ff', '#c3a6ff', '#9dffb8'], music: 'night', disc: '#e8eeff', stars: true, glow: 0.6 },
  aurora: { top: '#091136', horizon: '#1d587a', fog: '#1a3a5a', sun: '#d0f0ff', sunI: 1.0, sunPos: [-30, 40, 30], hemiSky: '#8ad8e8', hemiGnd: '#203040', hemiI: 0.95,
    sea: '#12305a', sand: '#7f88a0', grass: '#2f5a5a', hill: '#22406a', grey: '#4f5a82', paints: ['#7fffd4', '#9fd0ff', '#d09fff', '#ffb3e6', '#fff59f'], music: 'night', disc: '#e8f8ff', stars: true, aurora: true, glow: 0.6 },
};
let theme = null, pal = null;
const C = (h) => new THREE.Color(h);

// ================================================================ SCENERY (sky dome, sea, beach, island village that wakes up)
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.3, -1) }, disc: { value: new THREE.Color() } },
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 disc; varying vec3 vP;
    void main() { float h = clamp(vP.y * 1.5 + 0.08, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.8));
      float s = max(0.0, dot(normalize(vP), normalize(sunDir))); c += disc * (pow(s, 900.0) * 1.4 + pow(s, 12.0) * 0.25);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); sky.renderOrder = -2; scene.add(sky);
const starGeo = new THREE.BufferGeometry(); {
  const p = []; for (let i = 0; i < 700; i++) { const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.2; p.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380 - 50); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
stars.renderOrder = -1; scene.add(stars);
// aurora: three wavy curtains with a scrolling gradient
const auroraMat = new THREE.ShaderMaterial({
  uniforms: { uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: 'uniform float uTime; varying vec2 vUv; void main() { vUv = uv; vec3 p = position; p.z += sin(p.x * 0.05 + uTime * 0.4) * 12.0; p.y += sin(p.x * 0.08 + uTime * 0.7) * 3.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main() { float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
      float flick = 0.6 + 0.4 * sin(vUv.x * 30.0 + uTime * 1.3) * sin(vUv.x * 11.0 - uTime * 0.7);
      vec3 c = mix(vec3(0.2, 1.0, 0.65), vec3(0.6, 0.35, 1.0), vUv.y + 0.2 * sin(vUv.x * 6.0 + uTime * 0.3));
      gl_FragColor = vec4(c * band * flick * 0.55, band * flick * 0.55);
      #include <colorspace_fragment>
    }`,
});
const aurora = new THREE.Group(); scene.add(aurora);
for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(420, 70, 80, 1), auroraMat); m.position.set(rand(-40, 40), 95 + i * 18, -230 - i * 30); aurora.add(m); }

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true, ...o });
const seaMat = new THREE.MeshStandardMaterial({ color: '#45a0e0', roughness: 0.25, metalness: 0.1, flatShading: true });
seaMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = uTime;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    transformed.z += sin(position.x * 0.18 + uTime * 1.1) * 0.18 + sin(position.y * 0.23 + uTime * 0.8) * 0.16;`);
};
const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 300, 90, 45), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.75, 150); scene.add(sea);
const sandMat = std({ color: '#f5dfb5' }), grassMat = std({ color: '#7cd062' }), hillMat = std({ color: '#8fc0a0' });
const beach = new THREE.Mesh(new THREE.BoxGeometry(600, 1, 14), sandMat); beach.position.set(0, -0.5, 4); scene.add(beach);
const land = new THREE.Mesh(new THREE.PlaneGeometry(600, 120, 60, 12), grassMat); land.rotation.x = -Math.PI / 2; land.position.set(0, 0.02, -63); scene.add(land);
{ // gentle land roll
  const p = land.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.max(0, (y + 60) * 0.045) * (1 + Math.sin(x * 0.07) * 0.5) * (y > 40 ? 0 : 1)); }
  land.geometry.computeVertexNormals();
}
const hills = new THREE.Group(); scene.add(hills);
for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat); const s = rand(18, 34); m.scale.set(s * 1.6, s * rand(0.45, 0.7), s); m.position.set(-200 + i * 30 + rand(-8, 8), -2, -95 - rand(0, 35)); hills.add(m); }
// village: houses with windows that light up, bunting, people, palms, a lighthouse
const village = { houses: [], windows: null, bunting: [], people: [], palms: [], lighthouse: null, beam: null, wake: 0 };
const winMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', toneMapped: false });
{
  const roofCols = ['#ff7f8f', '#ffb35c', '#5ab8ff', '#8fd36a', '#c79bff', '#ff8fd0'], wallCols = ['#fff6e8', '#ffe8d8', '#e8f4ff', '#f4ffe8'];
  const houseGeo = new THREE.BoxGeometry(2.4, 2, 2.2); houseGeo.translate(0, 1, 0);
  const roofGeo = new THREE.ConeGeometry(2.05, 1.5, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 2.7, 0);
  const winGeo = new THREE.PlaneGeometry(0.5, 0.6);
  const winPos = [];
  for (let i = 0; i < 26; i++) {
    const x = -62 + i * 5 + rand(-1.2, 1.2), z = -8 - (i % 3) * 3.5 - rand(0, 1.5), s = rand(0.85, 1.25);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = rand(-0.25, 0.25);
    g.add(new THREE.Mesh(houseGeo, std({ color: wallCols[i % wallCols.length] })), new THREE.Mesh(roofGeo, std({ color: roofCols[i % roofCols.length] })));
    scene.add(g); village.houses.push(g);
    for (const wx of [-0.55, 0.55]) winPos.push([x + wx * s * Math.cos(g.rotation.y), 1.05 * s, z + 1.12 * s, g.rotation.y]);
  }
  village.windows = new THREE.InstancedMesh(winGeo, winMat, winPos.length);
  winPos.forEach(([x, y, z, r], i) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(1, 1, 1)); village.windows.setMatrixAt(i, m); village.windows.setColorAt(i, new THREE.Color('#5a5a6a')); });
  scene.add(village.windows);
  // bunting: rows of triangle flags between poles above the village street
  const flagGeo = new THREE.BufferGeometry(); flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.25, 0, 0, 0.25, 0, 0, 0, -0.55, 0], 3)); flagGeo.computeVertexNormals();
  for (let r = 0; r < 4; r++) {
    const row = new THREE.InstancedMesh(flagGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false }), 40);
    const x0 = -60 + r * 32, z = -6.2 - (r % 2) * 2;
    for (let i = 0; i < 40; i++) { const u = i / 39, x = x0 + u * 28, y = 3.6 - Math.sin(u * Math.PI) * 0.9; row.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)); row.setColorAt(i, new THREE.Color(roofCols[i % roofCols.length])); }
    row.visible = false; scene.add(row); village.bunting.push(row);
  }
  // people: little round villagers who come out as the island wakes up
  const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.5, 3, 8); bodyGeo.translate(0, 0.55, 0);
  const headGeo = new THREE.SphereGeometry(0.24, 10, 8); headGeo.translate(0, 1.2, 0);
  const personGeo = mergeGeometries([bodyGeo, headGeo]);
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(personGeo, std({ color: roofCols[i % roofCols.length], flatShading: false }));
    m.position.set(-60 + i * 3.6 + rand(-1, 1), 0, -4.8 - rand(0, 4)); m.visible = false; m.userData = { ph: Math.random() * 6, at: i / 34 };
    scene.add(m); village.people.push(m);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 4.4, 6); trunkGeo.translate(0, 2.2, 0);
  const leafGeo = mergeGeometries(Array.from({ length: 6 }, (_, k) => { const g = new THREE.ConeGeometry(0.5, 2.6, 4); g.rotateZ(Math.PI / 2 - 0.5); g.translate(1.2, 4.3, 0); g.rotateY((k / 6) * Math.PI * 2); return g; }));
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group(); g.position.set(-75 + i * 10 + rand(-3, 3), 0, -2.5 - rand(0, 1.5)); g.rotation.set(rand(-0.08, 0.08), rand(0, 6), rand(-0.12, 0.12));
    g.add(new THREE.Mesh(trunkGeo, std({ color: '#a8784f' })), new THREE.Mesh(leafGeo, std({ color: '#4fae5a' }))); scene.add(g); village.palms.push(g);
  }
  const lh = new THREE.Group(); lh.position.set(40, 0, -14);
  for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.05 - i * 0.12, 1.15 - i * 0.12, 1.6, 10), std({ color: i % 2 ? '#ff6f7f' : '#ffffff', flatShading: false })); seg.position.y = 0.8 + i * 1.6; lh.add(seg); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff2b0', toneMapped: false })); lamp.position.y = 8.8; lh.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4c0', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  beam.geometry.translate(0, -20, 0); beam.rotation.z = Math.PI / 2; beam.position.y = 8.8; lh.add(beam);
  scene.add(lh); village.lighthouse = lh; village.beam = beam;
}
function setWake(f) { // 0..1: windows light up, bunting goes up, villagers come out
  village.wake = f;
  const on = Math.floor(f * village.windows.count * 1.05);
  for (let i = 0; i < village.windows.count; i++) village.windows.setColorAt(i, _c.set(i < on ? (pal.raw.stars ? '#ffd77a' : '#fff3c4') : '#5f6478'));
  village.windows.instanceColor.needsUpdate = true;
  village.bunting.forEach((b, i) => { b.visible = f > 0.15 + i * 0.18; });
  for (const p of village.people) p.visible = f >= p.userData.at * 0.9;
}

// ================================================================ CLOUDS (puffy clusters; grey -> colour as they are painted; faces when they bloom)
const puffGeo = new THREE.SphereGeometry(1, 18, 12);
const faceMat = new THREE.MeshBasicMaterial({ color: '#33305a' }), blushMat = new THREE.MeshBasicMaterial({ color: '#ff9ec0', transparent: true, opacity: 0.8 });
const cloudViews = new Map(); // cloud id -> view
function buildCloud(c) {
  const g = new THREE.Group(), R = S.rng(c.id * 977 + 13), n = c.kind === 'big' ? 11 : 6 + Math.round(c.r * 1.2);
  const mat = new THREE.MeshStandardMaterial({ color: pal.grey, roughness: 1, emissive: '#000000' });
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = c.r * (0.18 + R() * 0.42), s = c.r * (0.34 + R() * 0.26);
    const m = new THREE.Mesh(puffGeo, mat); m.position.set(Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.6, (R() - 0.5) * c.r * 0.5); m.scale.setScalar(s); g.add(m);
  }
  const core = new THREE.Mesh(puffGeo, mat); core.scale.set(c.r * 0.78, c.r * 0.62, c.r * 0.55); g.add(core);
  const face = new THREE.Group(); face.visible = false; face.position.set(0, c.r * 0.05, c.r * 0.62); g.add(face);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(c.r * 0.09, 10, 8), faceMat); e.scale.set(1, 1.3, 0.4); e.position.set(sx * c.r * 0.24, c.r * 0.08, 0); face.add(e);
    const b = new THREE.Mesh(new THREE.SphereGeometry(c.r * 0.11, 10, 8), blushMat); b.scale.set(1.3, 0.6, 0.3); b.position.set(sx * c.r * 0.42, -c.r * 0.08, 0); face.add(b);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(c.r * 0.08, c.r * 0.022, 6, 12, Math.PI), faceMat); smile.rotation.z = Math.PI; smile.position.set(0, -c.r * 0.06, 0.02); face.add(smile);
  g.position.set(c.x, c.y, (R() - 0.5) * 1.2);
  const view = { c, g, mat, face, color: C(pal.paints[c.id % pal.paints.length]), shown: -1, pulse: 0, ph: R() * 6, bolt: 0 };
  scene.add(g); cloudViews.set(c.id, view); return view;
}
function clearClouds() { for (const v of cloudViews.values()) { scene.remove(v.g); v.mat.dispose(); } cloudViews.clear(); }
const STORM = C('#4a4566'), STORM_E = C('#3a2a6a');
function updateClouds(dt) {
  for (const v of cloudViews.values()) {
    const c = v.c, f = c.kind === 'storm' ? 0 : c.need ? c.paint / c.need : 0;
    v.ph += dt; v.pulse = Math.max(0, v.pulse - dt * 2.5);
    if (c.kind === 'storm') {
      v.mat.color.copy(STORM); v.bolt -= dt;
      const flick = v.bolt > 0 ? 1 : Math.random() < dt * 0.6 ? ((v.bolt = 0.12), 1) : 0;
      v.mat.emissive.copy(STORM_E).multiplyScalar(0.4 + flick * 2.2);
    } else if (Math.abs(f - v.shown) > 0.004 || c.bloomed !== v.bloomShown) {
      v.shown = f; v.bloomShown = c.bloomed;
      v.mat.color.copy(pal.grey).lerp(v.color, Math.min(1, f * 1.08));
      v.mat.emissive.copy(v.color).multiplyScalar((c.bloomed ? 0.32 : f * 0.14) + (pal.raw.glow || 0) * f * 0.35);
      v.face.visible = c.bloomed;
    }
    const bob = c.bloomed ? Math.sin(v.ph * 1.6) * 0.18 : Math.sin(v.ph * 0.6) * 0.06;
    v.g.position.y = c.y + bob; v.g.position.x = c.x;
    const s = 1 + v.pulse * 0.12 + (c.bloomed ? Math.sin(v.ph * 2.2) * 0.02 : 0); v.g.scale.setScalar(s);
    if (c.bloomed && Math.random() < dt * 1.2 * fxBudget()) glow.spawn(c.x + rand(-c.r, c.r), c.y + rand(-c.r * 0.4, c.r * 0.5), 0.5, 0, 0.2, 0, 1.2, 0.35, 0.05, hexOf(v.color), 0.8, SH.SPARK);
  }
}

// ================================================================ KITES (canvas-drawn kite art, ribbon tails, strings, kids on the beach)
function drawKite(g, type, color, size) { // the same art is the kite texture in 3D and its picture in the Workshop
  const s = size / 2, ink = '#22315c', light = '#ffffff';
  g.save(); g.translate(s, s); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = size * 0.035; g.strokeStyle = ink;
  const shade = (c, k) => { const v = new THREE.Color(c); v.offsetHSL(0, 0, k); return `#${v.getHexString()}`; };
  const face = (y, sc = 1) => { g.fillStyle = ink; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * s * 0.17 * sc, y, s * 0.06 * sc, s * 0.08 * sc, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ff9ec0'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * s * 0.31 * sc, y + s * 0.1 * sc, s * 0.07 * sc, s * 0.04 * sc, 0, 0, 7); g.fill(); }
    g.beginPath(); g.arc(0, y + s * 0.06 * sc, s * 0.08 * sc, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); };
  if (type === 'delta') {
    g.beginPath(); g.moveTo(0, -s * 0.78); g.lineTo(s * 0.9, s * 0.5); g.quadraticCurveTo(0, s * 0.3, -s * 0.9, s * 0.5); g.closePath();
    g.fillStyle = color; g.fill(); g.save(); g.clip(); g.fillStyle = shade(color, 0.12); for (let i = -3; i < 4; i++) g.fillRect(i * s * 0.3, -s, s * 0.14, s * 2); g.restore(); g.stroke();
    g.beginPath(); g.moveTo(0, -s * 0.78); g.lineTo(0, s * 0.36); g.stroke(); face(-s * 0.02);
  } else if (type === 'fish') {
    g.beginPath(); g.ellipse(0, -s * 0.05, s * 0.42, s * 0.68, 0, 0, 7); g.fillStyle = color; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.3, s * 0.5); g.lineTo(0, s * 0.95); g.lineTo(s * 0.3, s * 0.5); g.closePath(); g.fillStyle = shade(color, -0.08); g.fill(); g.stroke();
    g.strokeStyle = shade(color, 0.2); for (let r = 0; r < 3; r++) for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * s * 0.18, s * 0.12 + r * s * 0.15, s * 0.1, 0, Math.PI); g.stroke(); }
    g.strokeStyle = ink; g.beginPath(); g.ellipse(0, -s * 0.05, s * 0.42, s * 0.68, 0, 0, 7); g.stroke(); face(-s * 0.32);
  } else if (type === 'box') {
    g.fillStyle = color; g.fillRect(-s * 0.5, -s * 0.72, s, s * 0.5); g.strokeRect(-s * 0.5, -s * 0.72, s, s * 0.5);
    g.fillStyle = shade(color, 0.12); g.fillRect(-s * 0.5, s * 0.1, s, s * 0.5); g.strokeRect(-s * 0.5, s * 0.1, s, s * 0.5);
    g.beginPath(); for (const x of [-s * 0.5, s * 0.5]) { g.moveTo(x, -s * 0.72); g.lineTo(x, s * 0.6); } g.stroke(); face(-s * 0.48, 0.9);
  } else if (type === 'dragon') {
    g.beginPath(); g.arc(0, -s * 0.1, s * 0.58, 0, 7); g.fillStyle = color; g.fill(); g.stroke();
    g.fillStyle = '#ffd23f'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * 0.25, -s * 0.6); g.lineTo(sx * s * 0.5, -s * 0.98); g.lineTo(sx * s * 0.48, -s * 0.5); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = light; g.beginPath(); g.ellipse(0, s * 0.18, s * 0.3, s * 0.18, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = ink; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * s * 0.1, s * 0.17, s * 0.03, 0, 7); g.fill(); } face(-s * 0.2, 1.1);
  } else if (type === 'star') {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.38 : s * 0.85; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + s * 0.05); }
    g.closePath(); g.fillStyle = color; g.fill(); g.save(); g.clip(); g.fillStyle = shade(color, 0.14); g.beginPath(); g.arc(-s * 0.2, -s * 0.25, s * 0.5, 0, 7); g.fill(); g.restore(); g.stroke(); face(s * 0.02);
  } else { // diamond
    g.beginPath(); g.moveTo(0, -s * 0.9); g.lineTo(s * 0.68, -s * 0.15); g.lineTo(0, s * 0.92); g.lineTo(-s * 0.68, -s * 0.15); g.closePath();
    g.fillStyle = color; g.fill(); g.save(); g.clip(); g.fillStyle = shade(color, 0.14); g.fillRect(0, -s, s, s * 0.85); g.fillRect(-s, -s * 0.15, s, s * 1.2); g.restore(); g.stroke();
    g.lineWidth = size * 0.022; g.beginPath(); g.moveTo(0, -s * 0.9); g.lineTo(0, s * 0.92); g.moveTo(-s * 0.68, -s * 0.15); g.lineTo(s * 0.68, -s * 0.15); g.stroke(); g.lineWidth = size * 0.035;
    face(-s * 0.42, 0.9);
  }
  g.restore();
}
const kiteTex = new Map();
function kiteTexture(type, color) {
  const key = `${type}|${color}`; if (kiteTex.has(key)) return kiteTex.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256; drawKite(c.getContext('2d'), type, color, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; kiteTex.set(key, tex); return tex;
}
const views = new Map(); // kite id (solo) or player id (online) -> view
const kidBody = new THREE.CapsuleGeometry(0.34, 0.6, 3, 8); kidBody.translate(0, 0.7, 0);
const kidHead = new THREE.SphereGeometry(0.3, 12, 10); kidHead.translate(0, 1.5, 0);
const kidArm = new THREE.CapsuleGeometry(0.09, 0.5, 2, 6); kidArm.translate(0, 0.3, 0);
const skinMat = std({ color: '#ffd2b0', flatShading: false });
function makeView(id, seat, kiteType) {
  const color = S.COLORS[seat % S.COLORS.length], col = C(color);
  const kite = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), new THREE.MeshBasicMaterial({ map: kiteTexture(kiteType, color), transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, depthTest: false, alphaTest: 0.05 }));
  kite.renderOrder = 8; scene.add(kite); // the kite is the hero: always drawn in front of the clouds
  const RIB = 64, rPos = new Float32Array(RIB * 2 * 3), rCol = new Float32Array(RIB * 2 * 4), idx = [];
  for (let i = 0; i < RIB - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const rGeo = new THREE.BufferGeometry(); rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3)); rGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 4)); rGeo.setIndex(idx);
  const ribbon = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
  ribbon.frustumCulled = false; ribbon.renderOrder = 7; scene.add(ribbon);
  const sPos = new Float32Array(24 * 3), sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const string = new THREE.Line(sGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 })); string.frustumCulled = false; scene.add(string);
  const kid = new THREE.Group(), kmat = std({ color, flatShading: false });
  kid.add(new THREE.Mesh(kidBody, kmat), new THREE.Mesh(kidHead, skinMat));
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), kmat); hat.position.y = 1.56; kid.add(hat);
  const armL = new THREE.Mesh(kidArm, skinMat), armR = new THREE.Mesh(kidArm, skinMat); armL.position.set(-0.32, 1.05, 0); armR.position.set(0.32, 1.05, 0); kid.add(armL, armR);
  scene.add(kid);
  const v = { id, seat, color, col, kite, ribbon, rPos, rCol, rGeo, string, sPos, sGeo, kid, armL, armR, ph: Math.random() * 6, wob: 0, x: 0, y: 9, h: Math.PI / 2, stun: 0, hop: 0, label: null };
  views.set(id, v); return v;
}
function dropView(id) { const v = views.get(id); if (!v) return; scene.remove(v.kite, v.ribbon, v.string, v.kid); v.rGeo.dispose(); v.sGeo.dispose(); views.delete(id); }
function clearViews() { for (const id of [...views.keys()]) dropView(id); }
const _c = new THREE.Color(), _w = new THREE.Color('#ffffff');
function drawKiteView(v, k, trail, dt) { // k: {x, y, h, s, stun, ax}; trail: flat [x, y, ...] (own kite) or the view's own history
  v.ph += dt; v.wob = Math.sin(v.ph * 9) * 0.06 * Math.min(1, (k.s || 0) / 6);
  const tumble = k.stun > 0 ? v.ph * 9 : 0;
  v.kite.position.set(k.x, k.y, 0.4); v.kite.rotation.z = k.h - Math.PI / 2 + v.wob + tumble;
  // ribbon: tapered strip along the tail, kite colour fading to white, with darker bands like tail bows
  const n = Math.min(64, (trail.length >> 1) + 1), width = 0.32 + (k.ribbon || 0.55) * 0.5;
  let px = k.x, py = k.y;
  for (let i = 0; i < 64; i++) {
    const j = trail.length - 2 - (i - 1) * 2, tx = i === 0 ? k.x : j >= 0 ? trail[j] : px, ty = i === 0 ? k.y : j >= 0 ? trail[j + 1] : py;
    const nx = j >= 2 ? trail[j - 2] : tx, ny = j >= 2 ? trail[j - 1] : ty;
    let dx = nx - px, dy = ny - py; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const u = i / Math.max(1, n - 1), w = i < n ? width * (1 - u * 0.75) * (0.85 + 0.15 * Math.sin(v.ph * 8 - i * 0.7)) : 0, wave = Math.sin(v.ph * 6 - i * 0.5) * 0.12 * u;
    const o = i * 6, cx = tx + -dy * wave, cy = ty + dx * wave;
    v.rPos[o] = cx - dy * w; v.rPos[o + 1] = cy + dx * w; v.rPos[o + 2] = 0.3; v.rPos[o + 3] = cx + dy * w; v.rPos[o + 4] = cy - dx * w; v.rPos[o + 5] = 0.3;
    _c.copy(v.col).lerp(_w, u * 0.3); if (i % 6 < 2) _c.lerp(_w, 0.55); // white bows along a coloured ribbon
    const a = i < n ? Math.min(1, (1 - u) * 1.4) : 0;
    for (const q of [0, 4]) { v.rCol[i * 8 + q] = _c.r; v.rCol[i * 8 + q + 1] = _c.g; v.rCol[i * 8 + q + 2] = _c.b; v.rCol[i * 8 + q + 3] = a; }
    px = tx; py = ty;
  }
  v.rGeo.attributes.position.needsUpdate = true; v.rGeo.attributes.color.needsUpdate = true;
  // string with a little sag, from the kid's hands
  const hx = k.ax, hy = 1.75 + v.hop, hz = 2.2, sag = Math.min(2.5, Math.hypot(k.x - hx, k.y) * 0.08);
  for (let i = 0; i < 24; i++) { const u = i / 23; v.sPos[i * 3] = lerp(hx, k.x, u); v.sPos[i * 3 + 1] = lerp(hy, k.y, u) - Math.sin(u * Math.PI) * sag; v.sPos[i * 3 + 2] = lerp(hz, 0.4, u); }
  v.sGeo.attributes.position.needsUpdate = true;
  v.hop = Math.max(0, v.hop - dt * 2.5);
  v.kid.position.set(k.ax, 0 + v.hop + Math.abs(Math.sin(v.ph * 2)) * 0.05, 2.2);
  v.kid.rotation.y = clamp((k.x - k.ax) * 0.03, -0.6, 0.6);
  v.armL.rotation.z = 2.6 + Math.sin(v.ph * 3) * 0.08; v.armR.rotation.z = -2.6 + Math.sin(v.ph * 3 + 1) * 0.08;
}

// ================================================================ FX (Points from one sprite atlas: soft dot, petal, streak, sparkle, ring, confetti, star, heart)
const atlas = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128 + 64, ((i / 4) | 0) * 128 + 64); fn(); g.restore(); };
  cell(0, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); });
  cell(1, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -54); g.bezierCurveTo(40, -30, 36, 30, 0, 54); g.bezierCurveTo(-36, 30, -40, -30, 0, -54); g.fill(); });
  cell(2, () => { const gr = g.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = gr; g.fillRect(-5, -60, 10, 120); });
  cell(3, () => { g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? 12 : 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); });
  cell(4, () => { g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 48, 0, 7); g.stroke(); });
  cell(5, () => { g.fillStyle = '#fff'; g.fillRect(-30, -16, 60, 32); });
  cell(6, () => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 22 : 54; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
  cell(7, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 46); g.bezierCurveTo(-70, -6, -30, -64, 0, -26); g.bezierCurveTo(30, -64, 70, -6, 0, 46); g.fill(); });
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; return tex;
})();
const SH = { DOT: 0, PETAL: 1, STREAK: 2, SPARK: 3, RING: 4, CONFETTI: 5, STAR: 6, HEART: 7 };
const fxUniforms = { map: { value: atlas }, uScale: { value: 400 } };
class FX {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap); this.shape = new Float32Array(cap); this.rot = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap); this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.spin = new Float32Array(cap); this.floor = new Float32Array(cap);
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
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5; scene.add(this.points); this.geo = g;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, hex, a, shape, o = {}) {
    if (this.n >= this.cap) return;
    const i = this.n++, c = typeof hex === 'number' ? hex : 0xffffff;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = ((c >> 16) & 255) / 255; this.col[i * 4 + 1] = ((c >> 8) & 255) / 255; this.col[i * 4 + 2] = (c & 255) / 255; this.col[i * 4 + 3] = 0;
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.shape[i] = shape;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.spin[i] = o.spin || 0; this.rot[i] = o.rot ?? Math.random() * 6.3; this.floor[i] = o.floor ?? -99;
  }
  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    for (const a of [this.size, this.shape, this.rot, this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag, this.spin, this.floor]) a[to] = a[from];
  }
  update(dt) {
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0 || this.pos[i * 3 + 1] < this.floor[i]) { this.copy(--this.n, i); continue; }
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
const fx = new FX(3200, false), glow = new FX(900, true);
glow.points.renderOrder = 9;
function confetti(x, y, colors, n = 26, sp = 5) {
  n = Math.ceil(n * fxBudget());
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, v = rand(1.5, sp); fx.spawn(x, y, 0.6, Math.cos(a) * v, Math.sin(a) * v + 2, rand(-1, 1), rand(1.2, 2), 0.32, 0.2, hexOf(colors[i % colors.length]), 1, i % 3 ? SH.CONFETTI : SH.PETAL, { grav: 4, drag: 1.4, spin: rand(-8, 8) }); }
}
function colorRain(c, hex) { // a bloomed cloud rains colour onto the island behind it
  const n = Math.ceil(30 * fxBudget());
  for (let i = 0; i < n; i++) fx.spawn(c.x + rand(-c.r, c.r), c.y - c.r * 0.3, rand(-1, 0), 0, -rand(6, 9), -rand(1.5, 3), rand(1.4, 2.4), 0.45, 0.4, hex, 0.8, SH.STREAK, { rot: 0, floor: 0.2 });
}
function sparkles(x, y, hex, n = 10, spread = 1) {
  n = Math.ceil(n * fxBudget());
  for (let i = 0; i < n; i++) glow.spawn(x + rand(-spread, spread), y + rand(-spread, spread), 0.6, rand(-0.6, 0.6), rand(0.2, 1.4), 0, rand(0.6, 1.1), rand(0.3, 0.5), 0.05, hex, 0.95, SH.SPARK, { drag: 1.2, spin: rand(-3, 3) });
}
function lanterns(x, n = 2) { // night skies: paper lanterns float up from the village
  for (let i = 0; i < n; i++) glow.spawn(x + rand(-5, 5), 1.5, rand(-8, -4), rand(-0.3, 0.3), rand(1.2, 2), 0, rand(9, 13), 0.9, 0.7, 0xffb85a, 0.95, SH.DOT, { drag: 0.05 });
}
function fireworks(n = 6) {
  for (let i = 0; i < n; i++) setTimeout(() => { const x = camLook.x + rand(-18, 18), y = rand(10, 22), col = pal.paints[(Math.random() * pal.paints.length) | 0];
    for (let k = 0; k < 40 * fxBudget(); k++) { const a = (k / 40) * Math.PI * 2, v = rand(4, 7); glow.spawn(x, y, -6, Math.cos(a) * v, Math.sin(a) * v, 0, rand(1, 1.6), 0.45, 0.1, hexOf(col), 1, SH.SPARK, { grav: 3, drag: 1.2 }); }
    playSfx('confetti', 0.6); }, i * 380);
}
// loop ring, rings to fly through, bird flocks
const ringFx = [];
for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false })); m.visible = false; m.userData.t = 0; m.renderOrder = 6; scene.add(m); ringFx.push(m); }
function ringPulse(x, y, r, color = '#ffffff', life = 0.7) { const m = ringFx.find((q) => !q.visible) || ringFx[0]; m.visible = true; m.position.set(x, y, 0.5); m.material.color.set(color); Object.assign(m.userData, { t: 0, life, r }); }
function updateRingFx(dt) { for (const m of ringFx) { if (!m.visible) continue; const u = (m.userData.t += dt) / m.userData.life; if (u >= 1) { m.visible = false; continue; } m.scale.setScalar(0.3 + m.userData.r * (1 - Math.pow(1 - u, 3))); m.material.opacity = 0.9 * (1 - u); } }
const ringMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.3 });
const ringGeo = new THREE.TorusGeometry(1.25, 0.14, 8, 32);
let ringMeshes = [];
const birdGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.6, 0.15, -0.2, 0, 0, -0.35, 0, 0, 0, 0.6, 0.15, -0.2, 0, 0, -0.35], 3)); g.computeVertexNormals(); return g; })();
const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 60); birds.frustumCulled = false; birds.count = 0; scene.add(birds);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
function drawBirds(list) {
  let n = 0;
  for (const b of list) for (let j = 0; j < 7; j++) {
    const ox = -Math.abs(j - 3) * 0.9 * b.dir, oy = (j - 3) * 0.55, flap = Math.sin(uTime.value * 10 + j) * 0.5;
    _p.set(b.x + ox, b.y + oy, 0.2); _q.setFromEuler(_e.set(flap * 0.3, b.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)); _s.set(1, 1 + flap, 1); _m.compose(_p, _q, _s); birds.setMatrixAt(n++, _m);
  }
  birds.count = n; birds.instanceMatrix.needsUpdate = true;
}

// ================================================================ INPUT (keyboard, mouse hold-to-steer, touch floating joystick, dash button)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, mouse = { on: false, x: 0, y: 0, id: null };
let isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
function setTouchUI(on) {
  if (isTouch === on && document.body.classList.contains('touch') === on) return;
  isTouch = on; document.body.classList.toggle('touch', on); $('menuControls').innerHTML = controlsHTML(); if (coach.id) renderTip(); renderChatBar();
  $('dash').hidden = !((state === State.PLAYING || state === State.PAUSED) && on); // the input actually used decides (tablets with keyboards)
}
document.body.classList.toggle('touch', isTouch);
addEventListener('touchstart', () => setTouchUI(true), { passive: true, capture: true });
let dashQueued = false;
addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) setTouchUI(false);
  if ((e.code === 'Space' || e.code === 'ShiftLeft') && state === State.PLAYING) dashQueued = true;
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (net.on && state === State.PLAYING && /^Digit[1-5]$/.test(e.code)) sendChat(+e.code.slice(5) - 1);
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.on = false; });
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING) return;
  if (e.pointerType === 'mouse') { if (e.button !== 0) return; setTouchUI(false); mouse.on = true; mouse.id = e.pointerId; mouse.x = e.clientX; mouse.y = e.clientY; canvas.setPointerCapture(e.pointerId); return; }
  if (stick.id !== null) return;
  setTouchUI(true); stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false; canvas.setPointerCapture(e.pointerId);
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
$('btnDash').addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); dashQueued = true; });
const ray = new THREE.Raycaster(), kitePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), _hit = new THREE.Vector3(), _ndc = new THREE.Vector2();
function readInput(k) { // steering direction (screen up = sky up): keys, the joystick, or toward the mouse in the kite's plane
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = -stick.y; if (Math.hypot(x, y) < 0.2) x = y = 0; }
  else if (mouse.on) {
    _ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1); ray.setFromCamera(_ndc, camera);
    if (ray.ray.intersectPlane(kitePlane, _hit)) { x = _hit.x - k.x; y = _hit.y - k.y; if (Math.hypot(x, y) < 0.6) x = y = 0; }
  }
  if (AUTOPLAY) { const b = botInput(k); x = b.x; y = b.y; if (b.dash) dashQueued = true; }
  const l = Math.hypot(x, y); const out = l > 0 ? { x: x / l, y: y / l, dash: dashQueued } : { x: 0, y: 0, dash: dashQueued };
  dashQueued = false; return out;
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> RESULTS; online rooms share PLAYING)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', RESULTS: 'RESULTS', SKIES: 'SKIES', WORKSHOP: 'WORKSHOP', SETTINGS: 'SETTINGS', ONLINE: 'ONLINE', COVER: 'COVER' };
let state = State.BOOT, back = State.MENU;
const freshSave = () => ({ v: 1, breeze: 0, ups: {}, stars: {}, best: {}, kite: 'diamond', played: 0, freeBest: 0, nick: '', vol: { music: 0.8, sfx: 0.9 }, gfx: 'auto', tips: {} });
let save = freshSave();
function loadSave() { if (CAPTURE) return; const s = loadData(SAVE_KEY, null); if (s && s.v === 1) save = { ...freshSave(), ...s, vol: { ...freshSave().vol, ...(s.vol || {}) }, ups: { ...(s.ups || {}) }, stars: { ...(s.stars || {}) }, best: { ...(s.best || {}) }, tips: { ...(s.tips || {}) } }; }
function persist() { if (!CAPTURE) saveData(SAVE_KEY, save); }
const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
const SCREENS = { MENU: 'menu', PAUSED: 'paused', RESULTS: 'results', SKIES: 'skies', WORKSHOP: 'workshop', SETTINGS: 'settings', ONLINE: 'online' };
function setState(s) {
  state = s;
  for (const [st, id] of Object.entries(SCREENS)) $(id).hidden = s !== st;
  const inGame = s === State.PLAYING || s === State.PAUSED;
  $('hud').hidden = !inGame; $('dash').hidden = !(inGame && isTouch);
  $('players').hidden = $('roomChip').hidden = !(inGame && net.on); $('chatBar').hidden = !(s === State.PLAYING && net.on);
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; mouse.on = false; $('joystick').hidden = true; $('coach').hidden = true; $('hand').hidden = true; $('arrow').hidden = true; }
  else if (coach.id) $('coach').hidden = false;
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop();
  if (s === State.MENU) refreshMenu();
}
function togglePause() {
  if (state === State.PLAYING) { setState(State.PAUSED); $('paused').querySelector('h2').textContent = net.on ? t('onlinePause') : t('paused'); persist(); }
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
let bannerTimer = 0;
function banner(text, sub = '', ms = 2200) {
  if (state === State.COVER) return;
  const el = $('banner'); $('bannerText').textContent = text; $('bannerSub').textContent = sub; $('bannerSub').hidden = !sub;
  el.hidden = true; void el.offsetWidth; el.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

// ================================================================ UI (menu, skies map, workshop, results, settings)
const keyHTML = (k) => `<span class="key">${k}</span>`;
function controlsHTML() {
  if (isTouch) return `<span><svg><use href="#i-kite"/></svg>${t('ctl_drag')}</span><span><svg><use href="#i-bolt"/></svg>${t('ctl_tap')}</span>`;
  return `<span>${['W', 'A', 'S', 'D'].map(keyHTML).join('')} / ${['↑', '←', '↓', '→'].map(keyHTML).join('')} ${t('ctl_steer')}</span><span>${keyHTML('Space')} ${t('ctl_dash')}</span><span>${keyHTML('P')} ${t('ctl_pause')}</span>`;
}
const nextSkyIndex = () => { for (let i = 0; i < S.SKIES.length; i++) if (!save.stars[S.SKIES[i].id]) return i; return S.SKIES.length; };
function refreshMenu() {
  const n = nextSkyIndex();
  $('playLabel').textContent = !save.played ? t('play') : n < S.SKIES.length ? t('next', { s: skyName(n) }) : t('freeSky');
  const parts = [];
  if (save.played) { parts.push(`<span><svg><use href="#i-star"/></svg>${t('starsTotal', { n: totalStars() })}</span>`); parts.push(`<span><svg class="breeze-ico"><use href="#i-wind"/></svg>${Math.floor(save.breeze)}</span>`); }
  $('menuStats').innerHTML = parts.join(''); $('menuControls').innerHTML = controlsHTML();
}
function renderSkies() {
  const html = S.SKIES.map((d, i) => {
    const st = save.stars[d.id] | 0, locked = i > 0 && !save.stars[S.SKIES[i - 1].id];
    return `<button class="sky t-${d.theme}${locked ? ' locked' : ''}" data-i="${i}" ${locked ? 'aria-disabled="true"' : ''}>${locked ? '<svg class="lock"><use href="#i-lock"/></svg>' : ''}<b>${skyName(i)}</b>
      <small>${locked ? t('locked', { s: skyName(i - 1) }) : save.best[d.id] ? mmss(save.best[d.id]) : t('parTime', { t: mmss(d.par) })}</small>
      <span class="st">${[0, 1, 2].map((k) => `<svg class="${k < st ? 'on' : ''}"><use href="#i-star"/></svg>`).join('')}</span></button>`;
  }).join('');
  const freeLocked = !save.stars[S.SKIES[S.SKIES.length - 1].id];
  $('skyGrid').innerHTML = html + `<button class="sky t-free${freeLocked ? ' locked' : ''}" data-i="${S.SKIES.length}">${freeLocked ? '<svg class="lock"><use href="#i-lock"/></svg>' : ''}<b>${t('freeSky')}</b><small>${freeLocked ? t('freeLocked') : save.freeBest ? t('resFree', { n: save.freeBest }) : t('freeSkySub')}</small></button>`;
  $('skiesStars').innerHTML = `<svg><use href="#i-star"/></svg>${totalStars()} / ${S.SKIES.length * 3}`;
  $('skyGrid').querySelectorAll('.sky').forEach((b) => b.addEventListener('click', () => { if (b.classList.contains('locked')) { playSfx('nope'); return; } playSfx('click', 0.6); startSolo(+b.dataset.i); }));
}
function renderWorkshop() {
  $('wsBreeze').textContent = Math.floor(save.breeze);
  $('upGrid').innerHTML = S.UP_IDS.map((id) => {
    const lv = save.ups[id] | 0, u = S.UPGRADES[id], max = lv >= u.max, cost = max ? 0 : S.upCost(save.ups, id), ok = !max && save.breeze >= cost;
    return `<button class="up ${max ? 'max' : ok ? 'ok' : 'no'}" data-id="${id}"><b>${t('up_' + id)}</b><small>${t('upd_' + id)}</small>
      <span class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>
      <span class="cost">${max ? t('max') : `<svg class="breeze-ico"><use href="#i-wind"/></svg>${cost}`}</span></button>`;
  }).join('');
  $('upGrid').querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => buyUpgrade(b.dataset.id)));
  const ts = totalStars();
  $('kiteGrid').innerHTML = S.KITES.map((k) => `<button class="kopt${save.kite === k.id ? ' on' : ''}${ts < k.stars ? ' locked' : ''}" data-id="${k.id}"><canvas width="96" height="96"></canvas><b>${t('kite_' + k.id)}</b>
    <small>${ts < k.stars ? `<svg><use href="#i-lock"/></svg> ${t('starsNeed', { n: k.stars })}` : t('perk_' + k.perk)}</small></button>`).join('');
  $('kiteGrid').querySelectorAll('.kopt').forEach((b) => {
    drawKite(b.querySelector('canvas').getContext('2d'), b.dataset.id, S.COLORS[0], 96);
    b.addEventListener('click', () => { const k = S.KITES.find((q) => q.id === b.dataset.id); if (totalStars() < k.stars) { playSfx('nope'); return; } save.kite = k.id; playSfx('good', 0.7); persist(); renderWorkshop(); });
  });
}
function buyUpgrade(id) {
  const lv = save.ups[id] | 0; if (lv >= S.UPGRADES[id].max) return;
  const c = S.upCost(save.ups, id); if (save.breeze < c) { playSfx('nope'); toast(t('needBreeze')); return; }
  save.breeze -= c; save.ups[id] = lv + 1; playSfx('upgrade', 0.9); doneTip('workshop'); persist(); renderWorkshop();
}
function openSettings() { back = state; renderSettings(); setState(State.SETTINGS); }
function renderSettings() {
  $('volMusic').value = Math.round(save.vol.music * 100); $('volSfx').value = Math.round(save.vol.sfx * 100);
  $('volMusicVal').textContent = $('volMusic').value; $('volSfxVal').textContent = $('volSfx').value;
  $('gfxSeg').innerHTML = ['auto', 'high', 'low'].map((g) => `<button class="${save.gfx === g ? 'on' : ''}" data-g="${g}" role="radio" aria-checked="${save.gfx === g}">${t('gfx_' + g)}</button>`).join('');
  $('gfxSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { playSfx('click', 0.5); save.gfx = b.dataset.g; applyGfx(); renderSettings(); }));
}
$('volMusic').addEventListener('input', () => { save.vol.music = $('volMusic').value / 100; $('volMusicVal').textContent = $('volMusic').value; setMusicVolume(); });
$('volSfx').addEventListener('input', () => { save.vol.sfx = $('volSfx').value / 100; $('volSfxVal').textContent = $('volSfx').value; for (const L of Object.values(audio.loops)) L.level = -1; });
$('volSfx').addEventListener('change', () => playSfx('bloom', 0.8));
for (const id of ['volMusic', 'volSfx']) $(id).addEventListener('keydown', (e) => e.stopPropagation());
click('btnPlay', () => { const n = nextSkyIndex(); startSolo(save.played ? Math.min(n, S.SKIES.length) : 0); });
click('btnSkies', () => { renderSkies(); setState(State.SKIES); });
click('btnSkiesBack', () => setState(State.MENU));
click('btnWorkshop', () => { back = state; renderWorkshop(); setState(State.WORKSHOP); });
click('btnWsBack', () => { if (back === State.RESULTS) { renderResults(); setState(State.RESULTS); } else setState(State.MENU); });
click('btnSettings', () => openSettings());
click('btnPauseSettings', () => openSettings());
click('btnSettingsDone', () => { persist(); setState(back === State.PAUSED ? State.PAUSED : State.MENU); });
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { if (net.on) leaveOnline(); else { persist(); toMenuScene(); } setState(State.MENU); });
click('btnOnline', () => openOnline());
click('btnOnlineBack', () => { netClose(); setState(State.MENU); });
click('btnQuick', () => connectOnline({ mode: 'quick' }));
click('btnCreate', () => connectOnline({ mode: 'create' }));
$('codeForm').addEventListener('submit', (e) => { e.preventDefault(); const c = $('codeInput').value.trim().toUpperCase(); if (/^[A-Z0-9]{4,8}$/.test(c)) connectOnline({ mode: 'code', code: c }); });
click('btnInvite', () => copyInvite());
click('btnResNext', () => triggerMidgameAd(() => startSolo(solo.next))); // between skies: the level end, the right moment for a midgame ad
click('btnResReplay', () => startSolo(solo.index));
click('btnResMenu', () => { toMenuScene(); setState(State.MENU); });
click('btnResWorkshop', () => { back = State.RESULTS; renderWorkshop(); setState(State.WORKSHOP); });
click('btnResDouble', () => { $('btnResDouble').hidden = true; triggerRewardedAd(() => { save.breeze += solo.earned; solo.earned *= 2; solo.doubled = true; renderResults(); toast(t('doubled')); persist(); }); });
click('btnSkipTips', () => { save.tips.off = 1; coach.id = null; $('coach').hidden = true; $('hand').hidden = true; persist(); });

// ================================================================ SOLO (campaign skies and Free Sky)
let world = null, me = null; // the current sky and the player's kite (online too: world is the client's copy)
const solo = { index: 0, freeRound: 0, earned: 0, next: 0, startBreeze: 0, ended: false };
function loadSky(def, seed, seats, remote) {
  clearClouds(); clearViews(); fx.clear(); glow.clear();
  world = S.createWorld(def, { seed, seats, solo: !remote }); world.remote = remote;
  applyTheme(def.theme);
  for (const c of world.clouds) buildCloud(c);
  for (const m of ringMeshes) scene.remove(m);
  ringMeshes = world.rings.map((r) => { const m = new THREE.Mesh(ringGeo, ringMat); m.position.set(r.x, r.y, 0.2); scene.add(m); return m; });
  setWake(0); camSnap = true;
}
function applyTheme(id) {
  theme = id; const p = THEMES[id]; pal = { raw: p };
  for (const [k, v] of Object.entries(p)) { if (typeof v === 'string' && v[0] === '#') pal[k] = C(v); else if (Array.isArray(v)) pal[k] = v.map(C); }
  skyMat.uniforms.top.value.copy(pal.top); skyMat.uniforms.bottom.value.copy(pal.horizon); skyMat.uniforms.disc.value.copy(pal.disc);
  skyMat.uniforms.sunDir.value.set(...p.sunPos).normalize();
  scene.fog.color.copy(pal.fog); scene.background = pal.horizon.clone();
  sun.color.copy(pal.sun); sun.intensity = p.sunI; sun.position.set(...p.sunPos); hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGnd); hemi.intensity = p.hemiI;
  seaMat.color.copy(pal.sea); sandMat.color.copy(pal.sand); grassMat.color.copy(pal.grass); hillMat.color.copy(pal.hill);
  stars.visible = !!p.stars; aurora.visible = !!p.aurora; village.beam.visible = !!p.stars;
  playMusic(p.music);
}
function startSolo(index) {
  netClose();
  solo.index = index; solo.ended = false;
  const free = index >= S.SKIES.length;
  if (!free) solo.freeRound = 0;
  const def = free ? S.freeSky(solo.freeRound) : S.SKIES[index];
  loadSky(def, free ? 1000 + solo.freeRound * 31 + ((Math.random() * 1e6) | 0) : 100 + index, 1, false);
  me = S.addKite(world, { ups: save.ups, kite: save.kite, name: 'You' });
  makeView(me.id, 0, save.kite);
  save.played = 1; solo.startBreeze = 0;
  setState(State.PLAYING); refreshHud(true);
  banner(skyName(index), free ? t('resFree', { n: solo.freeRound + 1 }) : t('parTime', { t: mmss(def.par) }), 2600);
  if (!coach.id) nextTip();
  if (!free && index === 1) maybeTip('dash');
  if (!free && unreachable() > world.def.clouds * 0.25) maybeTip('reach');
}
const unreachable = () => world.clouds.filter((c) => c.kind !== 'storm' && Math.hypot(c.x - me.ax, c.y) > S.stat(me, 'string') + c.r).length;
function finishSolo() { // the sky is in full bloom: stars, breeze, the island party, then the results card
  if (solo.ended) return; solo.ended = true;
  const def = world.def, free = !!def.free, st = S.stars(world, me);
  const bonus = S.completionBonus(free ? S.SKIES.length : solo.index);
  solo.earned = Math.floor(me.breeze + bonus); save.breeze += solo.earned;
  let newBest = false;
  if (free) { solo.freeRound++; if (solo.freeRound > save.freeBest) { save.freeBest = solo.freeRound; newBest = true; } solo.next = S.SKIES.length; }
  else {
    const prev = save.stars[def.id] | 0; if (st > prev) save.stars[def.id] = st;
    if (!save.best[def.id] || world.time < save.best[def.id]) { save.best[def.id] = Math.round(world.time); newBest = !!prev; }
    if (st === 3 && prev < 3) happytime();
    solo.next = Math.min(solo.index + 1, S.SKIES.length);
  }
  if (newBest && free) happytime();
  solo.stars = st; solo.newBest = newBest; persist();
  playSfx('done', 1); playSfx('cheer', 1); fireworks(7); setWake(1);
  banner(t('resDone'), '', 2400);
  const show = () => { if (state !== State.PLAYING || world?.def !== def) return; $('banner').hidden = true; renderResults(); setState(State.RESULTS); if (AUTOPLAY && !CAPTURE) setTimeout(() => botResults(), 1500); };
  solo.doubled = false;
  if (CAPTURE) show(); else setTimeout(show, 2600);
  $('banner').hidden = true; // capture: right away (skip() moves on to the next sky itself)
}
function renderResults() {
  const def = world.def, free = !!def.free;
  $('resTitle').textContent = free ? t('resFree', { n: solo.freeRound }) : `${skyName(solo.index)}: ${t('resDone')}`;
  $('resStars').hidden = free;
  $('resStars').querySelectorAll('svg').forEach((s, i) => s.classList.toggle('on', i < (solo.stars | 0)));
  $('resSub').textContent = free ? (solo.newBest ? t('newBest') : '') : `${t('resTime', { t: mmss(world.time), b: mmss(save.best[def.id] || world.time) })}${solo.stars === 3 ? ` · ${t('stars3')}` : ''}`;
  $('resBreeze').textContent = `+${solo.earned}`;
  $('btnResDouble').hidden = !adsAvailable() || solo.doubled;
  $('btnResNext').textContent = free ? t('freeNext') : solo.next >= S.SKIES.length ? t('freeSky') : t('nextSky');
  if (!save.tips.workshop && S.UP_IDS.some((id) => (save.ups[id] | 0) < S.UPGRADES[id].max && save.breeze >= S.upCost(save.ups, id))) { $('resSub').textContent += ` · ${t('toWorkshop')}`; $('btnResWorkshop').classList.add('pulse'); }
}
function toMenuScene() { // the menu flies a kite gently over the first unfinished sky
  netClose();
  const i = Math.min(nextSkyIndex(), S.SKIES.length - 1);
  loadSky(S.SKIES[i], 100 + i, 1, false);
  me = S.addKite(world, { ups: save.ups, kite: save.kite }); makeView(me.id, 0, save.kite);
  world.clouds.forEach((c, i) => { if ((save.stars[world.def.id] | 0) > 0 || i % 5 < 3) { c.paint = c.need; c.bloomed = true; } else if (i % 5 === 3) c.paint = c.need * 0.4; }); // a colourful sky behind the menu
  setWake(save.stars[world.def.id] ? 1 : 0.6);
}

// ---------------------------------------------------------------- events from the rules -> sound, particles, banners
function handleEvents(list, online, local = false) { // local: events from my own kite's flight (online), the rest come from the rules or the server
  for (const e of list) {
    const mine = online ? e.k === net.you?.id : e.k === me?.id;
    if (online && !local && mine && e.t === 'loop') { sparkles(e.x, e.y, 0xfff3b0, 10, e.r * 0.5); continue; } // the server painting my loop: already celebrated
    const v = online ? views.get(e.k) : views.get(e.k);
    if (e.t === 'paint') { const cv = cloudViews.get(e.c); if (cv) { cv.pulse = 1; if (mine) playSfx('paint', 0.5, 0.9 + Math.random() * 0.3); } }
    else if (e.t === 'bloom') {
      const cv = cloudViews.get(e.c); if (!cv) continue;
      const hex = hexOf(cv.color); cv.pulse = 2;
      confetti(e.x, e.y, pal.paints, e.big ? 40 : 24, e.big ? 7 : 5); colorRain(cv.c, hex); sparkles(e.x, e.y, hex, 12, cv.c.r * 0.6);
      playSfx('bloom', mine ? 0.9 : 0.5, 0.95 + Math.min(0.4, (e.combo || 0) * 0.04));
      if (pal.raw.stars) { lanterns(e.x, 3); playSfx('lantern', 0.5); }
      if (mine && e.combo >= 3 && e.combo % 2 === 1) popText(e.x, e.y + 1.4, t('combo', { n: e.combo }), 'gold');
      if (world) setWake(clamp(world.bloomed / Math.max(1, world.goal), 0, 1));
      if (v) v.hop = 0.5;
    } else if (e.t === 'loop') {
      ringPulse(e.x, e.y, e.r, '#ffffff', 0.8); sparkles(e.x, e.y, 0xfff3b0, 18, e.r * 0.6); playSfx('loop', mine ? 0.9 : 0.4);
      if (mine) { banner(t('loopBanner'), '', 900); doneTip('loop'); if (online && local) netSend({ t: 'loop' }); }
    } else if (e.t === 'dash') { if (mine) { playSfx('dash', 0.8); doneTip('dash'); } if (v) for (let i = 0; i < 8; i++) fx.spawn(v.kite.position.x, v.kite.position.y, 0.5, rand(-3, 3), rand(-3, 3), 0, 0.4, 0.3, 0.05, 0xffffff, 0.8, SH.DOT); }
    else if (e.t === 'ring') { playSfx('ring', mine ? 1 : 0.4); sparkles(e.x, e.y, 0xffd23f, 14, 1); if (mine) { popText(e.x, e.y + 1, t('ring'), 'gold'); doneTip('rings'); if (online && me) me.dashCd = 0; } }
    else if (e.t === 'crash') { if (mine) { playSfx('crash', 0.9); shake(0.3); popText(e.x, 2, t('crash')); } if (v) v.hop = 0.8; confetti(e.x, 1, ['#f5dfb5', '#ffffff'], 10, 3); }
    else if (e.t === 'zap') {
      const cv = cloudViews.get(e.c); if (cv) cv.bolt = 0.4;
      if (mine) { playSfx('zap', 0.9); shake(0.4); const f = $('flash'); f.hidden = true; void f.offsetWidth; f.hidden = false; setTimeout(() => { f.hidden = true; }, 450); popText(e.x, e.y + 1, t('zap')); if (online && me) { me.stun = S.CFG.stunZap; me.trail.length = 0; } }
    } else if (e.t === 'calm') { sparkles(e.x, e.y, 0xffffff, 22, 2); playSfx('good', 0.8); if (mine) banner(t('calm'), '', 1200); doneTip('storm'); }
    else if (e.t === 'flock') { if (mine) { playSfx('wind', 0.4); doneTip('birds'); if (online && me) me.boost = 0.6; } }
    else if (e.t === 'windwarn') { $('windText').textContent = t('windTurn'); $('windWarn').hidden = false; maybeTip('wind'); }
    else if (e.t === 'wind') { $('windText').textContent = t('windNow', { d: e.dir > 0 ? t('left') : t('right') }); setTimeout(() => { $('windWarn').hidden = true; }, 1800); playSfx('wind', 0.6); }
    else if (e.t === 'done' && !online) finishSolo();
    else if (e.t === 'join') { if (e.id !== net.you?.id) toast(t('joined', { n: e.name })); }
    else if (e.t === 'leave') { toast(t('left_', { n: e.name })); }
    else if (e.t === 'chat') showChat(e.id, e.i);
    else if (e.t === 'skydone') { playSfx('done', 1); playSfx('cheer', 1); fireworks(7); setWake(1); banner(t('resDone'), t('partyNext', { n: 9 }), 3000); }
  }
}
const _v = new THREE.Vector3();
function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight }; }
function popText(x, y, text, cls) {
  if (state === State.COVER || $('pops').childElementCount > 8) return;
  const s = toScreen(x, y, 0.5), el = document.createElement('div'); el.textContent = text; if (cls) el.className = cls;
  el.style.left = `${s.x}px`; el.style.top = `${s.y}px`; $('pops').appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-110%) scale(1.05)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-240%) scale(1)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).onfinish = () => el.remove();
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
let lastBreezeShown = -1;
function refreshHud(force) {
  if (!world || !me) return;
  const b = Math.floor(save.breeze + (net.on ? 0 : me.breeze));
  if (b !== lastBreezeShown || force) { $('breeze').textContent = b; lastBreezeShown = b; }
  $('skyName').textContent = net.on ? `${t('freeSky')} ${net.round + 1}` : skyName(solo.index);
  $('timer').textContent = mmss(world.time);
  $('goalFill').style.width = `${Math.min(100, (100 * world.bloomed) / Math.max(1, world.goal))}%`;
  $('goalText').textContent = t('clouds', { n: world.bloomed, g: world.goal });
  $('comboPill').hidden = !(me.combo >= 2); $('combo').textContent = `x${me.combo}`;
  if (isTouch) { const cd = me.dashCd, mx = S.stat(me, 'dash'); $('dashCd').style.height = `${(100 * cd) / mx}%`; }
}

// ================================================================ ONLINE (co-op skies: client flies its own kite, the server keeps the sky)
const net = { on: false, ws: null, you: null, room: null, seats: [], snaps: new Map(), sendT: 0, round: 0, pendingJoin: null, phase: 'play', chats: new Map() };
function openOnline() {
  if (!save.nick) { save.nick = `${S.NAME_A[(Math.random() * S.NAME_A.length) | 0]}${S.NAME_B[(Math.random() * S.NAME_B.length) | 0]}${1 + ((Math.random() * 99) | 0)}`; persist(); }
  $('onlineStatus').textContent = t('youAre', { n: save.nick }); setState(State.ONLINE);
}
async function connectOnline(join) {
  netClose(); $('onlineStatus').textContent = t('connecting');
  const tok = await sdkToken(); // before the socket exists: its open event must find the handler below
  let ws; try { ws = new WebSocket(MP_URL); } catch { $('onlineStatus').textContent = t('offline'); return; }
  net.ws = ws;
  const fail = setTimeout(() => { if (!net.room) { $('onlineStatus').textContent = t('offline'); netClose(); } }, 8000);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', ...join, name: save.nick, tok, ups: save.ups, kite: save.kite }));
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onNet(m); if (net.room) clearTimeout(fail); };
  ws.onclose = () => { clearTimeout(fail); if (net.on) { toast(t('offline')); net.on = false; sdkLeftRoom(); toMenuScene(); setState(State.MENU); } else if (net.ws === ws) $('onlineStatus').textContent = t('offline'); };
  ws.onerror = () => { $('onlineStatus').textContent = t('offline'); };
}
function netSend(m) { if (net.ws?.readyState === 1) net.ws.send(JSON.stringify(m)); }
function netClose() { if (net.ws) { const ws = net.ws; net.ws = null; net.on = false; try { ws.onclose = null; ws.close(); } catch {} sdkLeftRoom(); } net.on = false; net.room = null; }
function leaveOnline() { netSend({ t: 'leave' }); netClose(); toMenuScene(); }
function onNet(m) {
  if (m.t === 'err') { $('onlineStatus').textContent = t(m.e) || t('offline'); return; }
  if (m.t === 'welcome') { net.you = m.you; return; }
  if (m.t === 'room') {
    const newSky = !net.room || m.seed !== net.seed;
    net.room = m.code; net.seed = m.seed; net.round = m.round; net.seats = m.seats; net.on = true;
    if (newSky) {
      loadSky(S.freeSky(m.round), m.seed, 4, true);
      const mine = m.seats.find((s) => s.id === net.you?.id);
      me = S.addKite(world, { seat: mine?.seat ?? 0, ups: save.ups, kite: save.kite, name: save.nick });
      net.snaps.clear();
      if (state !== State.PLAYING) setState(State.PLAYING);
      banner(`${t('freeSky')} ${m.round + 1}`, t('inviteCode', { c: m.code }), 2600);
      sdkRoom({ roomId: m.code, isJoinable: m.seats.length < 4, inviteParams: { roomId: m.code } });
    }
    for (const p of m.paint) { const c = world.clouds[p[0]]; if (c) { c.paint = p[1]; c.bloomed = !!p[2]; if (!p[3] && c.kind === 'storm') { c.kind = 'big'; c.need = c.r * c.r * 1.25; } } }
    world.bloomed = world.clouds.filter((c) => c.bloomed).length;
    syncSeatViews(); $('roomCode').textContent = m.code; renderPlayers(); renderChatBar();
    return;
  }
  if (m.t === 's' && world) {
    const now = performance.now() / 1000;
    for (const k of m.k) { if (k[0] === net.you?.id) continue; let q = net.snaps.get(k[0]); if (!q) net.snaps.set(k[0], (q = [])); q.push([now, k[1], k[2], k[3], k[4], k[5]]); if (q.length > 12) q.shift(); }
    for (const c of m.c) { const cl = world.clouds[c[0]]; if (!cl) continue; cl.paint = c[1]; if (!c[3] && cl.kind === 'storm') { cl.kind = 'big'; cl.need = cl.r * cl.r * 1.25; } cl.bloomed = !!c[2]; }
    world.birds = m.b.map((b) => ({ x: b[0], y: b[1], dir: b[2] })); world.rings.forEach((r, i) => { r.taken = !!m.r[i]; });
    world.wind.dir = m.w; world.bloomed = m.bl; world.goal = m.g; world.time = m.tm; net.phase = m.ph;
    if (m.br) { save.breeze += m.br; me.breeze += 0; }
    handleEvents(m.ev, true);
  }
}
function syncSeatViews() {
  const ids = new Set(net.seats.map((s) => s.id));
  for (const id of [...views.keys()]) if (!ids.has(id)) dropView(id);
  for (const s of net.seats) if (!views.has(s.id)) makeView(s.id, s.seat, s.kite);
}
function renderPlayers() {
  $('players').innerHTML = net.seats.map((s) => `<div class="${s.id === net.you?.id ? 'me' : ''}" data-id="${s.id}"><i style="background:${S.COLORS[s.seat]}"></i>${s.name.replace(/[<>&]/g, '')}<span class="bubble">${net.chats.get(s.id) || ''}</span></div>`).join('');
}
function renderChatBar() {
  $('chatBar').innerHTML = S.CHAT.map((c, i) => `<button data-i="${i}">${isTouch ? '' : keyHTML(i + 1)}${t('chat_' + c)}</button>`).join('');
  $('chatBar').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sendChat(+b.dataset.i)));
}
function sendChat(i) { netSend({ t: 'chat', i }); }
function showChat(id, i) { net.chats.set(id, t('chat_' + S.CHAT[i])); renderPlayers(); playSfx('gem', 0.5); setTimeout(() => { net.chats.delete(id); renderPlayers(); }, 2500); }
function copyInvite() {
  const link = inviteLinkFor(net.room);
  try { navigator.clipboard.writeText(link).then(() => toast(t('copied')), () => toast(t('inviteCode', { c: net.room }))); } catch { toast(t('inviteCode', { c: net.room })); }
}
function remoteKite(id) { // 120 ms behind, interpolated between snapshots
  const q = net.snaps.get(id); if (!q || !q.length) return null;
  const tt = performance.now() / 1000 - CFG.interpDelay;
  let a = q[0], b = q[q.length - 1];
  for (let i = 0; i < q.length - 1; i++) if (q[i][0] <= tt && q[i + 1][0] >= tt) { a = q[i]; b = q[i + 1]; break; }
  const u = b[0] > a[0] ? clamp((tt - a[0]) / (b[0] - a[0]), 0, 1) : 1;
  const dh = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
  return { x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), h: a[3] + dh * u, s: lerp(a[4], b[4], u), stun: b[5] ? 1 : 0 };
}
const remoteTrails = new Map();

// ================================================================ ONBOARDING (guided first sky, one-off contextual tips; all skippable)
const coach = { id: null, t: 0, moved: 0 };
const FIRST_TIPS = ['move', 'paint', 'loop'];
function nextTip() { if (NO_TIPS || save.tips.off) return; for (const id of FIRST_TIPS) if (!save.tips[id]) { showTip(id); return; } }
function showTip(id) { if (NO_TIPS || save.tips.off || save.tips[id]) return; coach.id = id; coach.t = 0; renderTip(); if (state === State.PLAYING) { $('coach').hidden = false; playSfx('tip', 0.6); } }
function maybeTip(id) { if (!coach.id && FIRST_TIPS.every((f) => save.tips[f])) showTip(id); }
function renderTip() {
  const id = coach.id; if (!id) return;
  $('coachText').textContent = id === 'move' && isTouch ? t('tip_moveTouch') : t('tip_' + id);
  let k = '';
  if (id === 'move' && !isTouch) k = ['W', 'A', 'S', 'D'].map(keyHTML).join('') + '<span class="or">/</span>' + ['←', '↑', '↓', '→'].map(keyHTML).join('');
  if (id === 'dash') k = isTouch ? '<svg class="tip-ico"><use href="#i-bolt"/></svg>' : keyHTML('Space');
  if (id === 'loop') k = '<svg class="tip-ico"><use href="#i-loop"/></svg>';
  if (id === 'paint') k = '<svg class="tip-ico"><use href="#i-cloud"/></svg>';
  $('coachKeys').innerHTML = k;
}
function doneTip(id) {
  if (save.tips[id]) return; save.tips[id] = 1;
  if (coach.id !== id) return;
  coach.id = null; $('coach').hidden = true; $('hand').hidden = true; $('arrow').hidden = true; playSfx('tip', 0.7);
  setTimeout(() => { if (!coach.id && state === State.PLAYING) nextTip(); }, 700);
}
function updateCoach(dt) {
  if (state !== State.PLAYING || !me) return;
  coach.t += dt;
  if (coach.id === 'move') { coach.moved += Math.hypot(me.vx, me.vy) * dt * (Math.abs(me.input.x) + Math.abs(me.input.y) > 0 ? 1 : 0); if (coach.moved > 6) doneTip('move'); }
  if (coach.id === 'paint' && world.clouds.some((c) => c.paint > 0.3)) doneTip('paint');
  if (FIRST_TIPS.includes(coach.id) && coach.id !== 'move' && !save.tips.move) { coach.id = null; nextTip(); } // never skip ahead of the first lesson
  if (coach.id === 'loop' && coach.t > 25) doneTip('loop'); // optional: it never blocks
  const hand = $('hand'), arrow = $('arrow'); let hp = null, ap = null;
  if (coach.id === 'move' && isTouch) { const u = (coach.t % 2) / 2; hp = [innerWidth * (0.5 + 0.15 * Math.sin(u * Math.PI * 2)), innerHeight * (0.6 - 0.12 * Math.cos(u * Math.PI * 2))]; }
  if (coach.id === 'paint') { let best = null, bd = 1e9; for (const c of world.clouds) { if (c.bloomed || c.kind === 'storm') continue; const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < bd) { bd = d; best = c; } } if (best) ap = toScreen(best.x, best.y + best.r + 0.8, 0.5); }
  if (coach.id === 'dash' && isTouch) { const r = $('btnDash').getBoundingClientRect(); hp = [r.left + r.width / 2, r.top + r.height * 0.2]; }
  if (coach.id === 'loop') { const a = coach.t * 3, s = toScreen(me.x + Math.cos(a) * 3, me.y + Math.sin(a) * 3, 0.5); hp = [s.x, s.y]; }
  hand.hidden = !hp; if (hp) { hand.style.left = `${hp[0]}px`; hand.style.top = `${hp[1]}px`; }
  arrow.hidden = !ap; if (ap) { arrow.style.left = `${ap.x}px`; arrow.style.top = `${ap.y}px`; arrow.style.transform = 'rotate(180deg)'; }
}

// ================================================================ BOT (trailer footage + balance tests)
const botMem = { t: null, time: 0, loopT: 0 };
function botInput(k) {
  if (!world || k.stun > 0) return { x: 0, y: 0 };
  const L = S.stat(k, 'string');
  botMem.time += STEP;
  if (!botMem.t || botMem.t.bloomed || botMem.time > 6) {
    botMem.time = 0; let best = null, bd = 1e9;
    for (const c of world.clouds) { if (c.bloomed || c.kind === 'storm') continue; if (Math.hypot(c.x - k.ax, c.y) > L + c.r * 0.6) continue; const d = Math.hypot(c.x - k.x, c.y - k.y) - c.paint; if (d < bd) { bd = d; best = c; } }
    botMem.t = best;
  }
  const c = botMem.t; if (!c) return { x: 0, y: 0 };
  let dx = c.x - k.x, dy = c.y - k.y; const d = Math.hypot(dx, dy);
  if (d < c.r * 0.6) { dx = -dy; dy = c.x - k.x; }
  for (const s of world.clouds) if (s.kind === 'storm' && Math.hypot(s.x - k.x, s.y - k.y) < s.r + 2.5) { dx += (k.x - s.x) * 3; dy += (k.y - s.y) * 3; }
  if (k.y < 3) dy += 4;
  const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l, dash: d > 8 };
}
function botResults() { // capture / autoplay: spend breeze (string first when the next sky reaches further), fly on
  if (state !== State.RESULTS) return;
  for (;;) {
    const nxt = S.SKIES[Math.min(solo.next, S.SKIES.length - 1)], L = S.UPGRADES.string.val(save.ups.string | 0);
    let pick = L < nxt.reach + 0.5 && (save.ups.string | 0) < S.UPGRADES.string.max ? 'string' : null;
    if (!pick) pick = S.UP_IDS.filter((id) => (save.ups[id] | 0) < S.UPGRADES[id].max).sort((a, b) => S.upCost(save.ups, a) - S.upCost(save.ups, b))[0];
    if (!pick || S.upCost(save.ups, pick) > save.breeze) break;
    save.breeze -= S.upCost(save.ups, pick); save.ups[pick] = (save.ups[pick] | 0) + 1;
  }
  startSolo(solo.next);
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, camSnap = true;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(0, 10, 0);
function step(dt) { // one fixed step of the sim
  if (!world || !me) return;
  if (net.on) { // online: fly my kite locally; the server paints, runs the wind, birds and rings
    if (state === State.PLAYING) me.input = readInput(me); else me.input = { x: 0, y: 0, dash: false };
    S.integrate(world, me, dt);
    net.sendT += dt;
    if (net.sendT >= CFG.netRate) { net.sendT = 0; netSend({ t: 'k', x: +me.x.toFixed(2), y: +me.y.toFixed(2), h: +me.h.toFixed(3), s: +me.s.toFixed(2), st: me.stun > 0 ? 1 : 0 }); }
    handleEvents(world.events.splice(0).map((e) => ({ ...e, k: net.you?.id })), true, true);
    return;
  }
  if (state === State.PLAYING) me.input = readInput(me);
  else if (state === State.MENU || state === State.COVER) me.input = menuInput(me);
  else me.input = { x: 0, y: 0, dash: false };
  if (state === State.PLAYING) S.step(world, dt);
  else if (state === State.MENU) { S.skyStep(world, dt); S.integrate(world, me, dt); }
  if (state !== State.PLAYING) world.events.length = 0;
  else handleEvents(world.events.splice(0), false);
}
function menuInput(k) { // the menu kite draws lazy figure-eights over the beach
  const tt = uTime.value * 0.35; return { x: Math.cos(tt * 2) - (k.x - k.ax) * 0.08, y: Math.sin(tt) * 0.6 + (10 - k.y) * 0.06, dash: false };
}
function advance(dt) {
  if (state !== State.PAUSED || net.on) { acc += dt; let n = 0; while (acc >= STEP && n < 10) { step(STEP); acc -= STEP; n++; } if (n === 10) acc = 0; }
  animate(dt);
}
function animate(dt) {
  uTime.value += dt;
  if (!world) return;
  updateClouds(dt);
  if (me && views.get(net.on ? net.you?.id : me.id)) { const v = views.get(net.on ? net.you?.id : me.id); drawKiteView(v, { ...me, ribbon: S.stat(me, 'ribbon') }, me.trail, dt); }
  if (net.on) for (const s of net.seats) {
    if (s.id === net.you?.id) continue; const v = views.get(s.id), k = remoteKite(s.id); if (!v || !k) continue;
    let tr = remoteTrails.get(s.id); if (!tr) remoteTrails.set(s.id, (tr = []));
    tr.push(k.x, k.y); if (tr.length > 60) tr.splice(0, tr.length - 60); if (k.stun) tr.length = 0;
    drawKiteView(v, { ...k, ax: world.anchors[s.seat], ribbon: 0.9 }, tr, dt);
  }
  ringMeshes.forEach((m, i) => { const r = world.rings[i]; m.visible = !r.taken; m.rotation.y = uTime.value * 1.5 + i; m.position.y = r.y + Math.sin(uTime.value * 2 + i) * 0.15; });
  drawBirds(world.birds);
  for (const p of village.people) if (p.visible) { p.userData.ph += dt; p.position.y = Math.max(0, Math.sin(p.userData.ph * (village.wake >= 1 ? 7 : 2))) * (village.wake >= 1 ? 0.5 : 0.08); }
  village.beam.rotation.y = uTime.value * 0.6;
  updateRingFx(dt);
  if (state !== State.PAUSED || net.on) { fx.update(dt); glow.update(dt); }
  if (Math.random() < dt * 8 * fxBudget()) { const x = camLook.x + rand(-30, 30), y = rand(3, 26); fx.spawn(x, y, rand(-6, 2), (world.wind.dir) * rand(3, 5), 0, 0, rand(1.5, 2.5), 0.55, 0.5, 0xffffff, 0.18, SH.STREAK, { rot: Math.PI / 2 }); } // wind streaks
  const playing = state === State.PLAYING || state === State.PAUSED;
  if (playing) { if ((hudT += dt) > 0.1) { hudT = 0; refreshHud(); } updateCoach(dt); }
  setLoop('windLoop', state === State.COVER ? 0 : 0.5);
  setLoop('flutter', playing && me ? clamp(me.s / 10, 0.2, 1) * 0.7 : 0.15);
  setLoop('shore', state === State.COVER ? 0 : 0.45);
}
let hudT = 0;
function updateCamera(dt) {
  if (!world || !me) return;
  const portrait = innerHeight > innerWidth, L = S.stat(me, 'string');
  const kx = me.x, ky = me.y, inMenu = state === State.MENU || state === State.SKIES || state === State.WORKSHOP || (state === State.SETTINGS && back === State.MENU) || state === State.ONLINE;
  const dist = clamp(17 + L * 0.85, 26, 46) * (portrait ? 1.55 : 1);
  const tx = lerp(me.ax, kx, 0.7) - (inMenu && !portrait ? 8 : 0), ty = clamp(ky * 0.55 + L * 0.22, 9, 19);
  const k = camSnap ? 1 : 1 - Math.exp(-dt * CFG.camLerp); camSnap = false;
  camLook.x += (tx - camLook.x) * k; camLook.y += (ty - camLook.y) * k; camLook.z = 0;
  camPos.set(camLook.x, camLook.y - 2, dist);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  camera.position.copy(camPos); camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook.x, camLook.y, camLook.z);
  sky.position.copy(camera.position); stars.position.copy(camera.position); stars.position.y = 0;
}
function render(dt) { updateCamera(dt); renderer.render(scene, camera); }
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt); watchFps(dt);
  requestAnimationFrame(frame);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  fxUniforms.uScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', resize);
addEventListener('pagehide', () => persist());
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); else last = performance.now(); });

// ================================================================ COVER (tools/game_covers.py: honest key art rendered from the game itself)
function stageCover(kind) {
  state = State.COVER; document.body.classList.add('cover');
  for (const id of ['menu', 'skies', 'workshop', 'results', 'online', 'paused', 'settings', 'hud', 'banner', 'coach', 'hand', 'arrow', 'toast', 'dash', 'joystick', 'players', 'roomChip', 'chatBar', 'windWarn']) $(id).hidden = true;
  netClose();
  const def = { ...S.SKIES[3], clouds: 18, big: 3, storms: 0, rings: 3, birds: 1, reach: 19 };
  loadSky(def, 4242, 1, false);
  me = S.addKite(world, { ups: { string: 4, tail: 6, ribbon: 3 }, kite: 'diamond' }); makeView(me.id, 0, 'diamond');
  // a sweeping loop already drawn behind the kite, half of the sky in bloom, colour raining on a festive island
  const cx = -2, cy = 13;
  for (let i = 0; i < 42; i++) { const a = -Math.PI / 2 + (i / 42) * Math.PI * 1.7, r = 4.2; me.trail.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); }
  me.x = me.trail[me.trail.length - 2]; me.y = me.trail[me.trail.length - 1] + 0.3; me.h = Math.PI * 0.95; me.s = 8;
  world.clouds.forEach((c, i) => { if (i % 4 !== 0) { c.paint = c.need; c.bloomed = true; } }); // most in bloom, a few still grey: the idea in one picture
  world.bloomed = world.clouds.filter((c) => c.bloomed).length;
  world.birds = [{ x: 14, y: 18, dir: -1 }];
  setWake(1);
  for (let i = 0; i < 20; i++) { updateClouds(1 / 30); fx.update(1 / 30); glow.update(1 / 30); }
  for (const c of world.clouds) if (c.bloomed && Math.random() < 0.6) { const v = cloudViews.get(c.id); colorRain(c, hexOf(v.color)); }
  confetti(cx + 3, cy + 1, pal.paints, 30, 5); sparkles(cx, cy, 0xfff3b0, 20, 3);
  for (let i = 0; i < 18; i++) { fx.update(1 / 30); glow.update(1 / 30); updateClouds(1 / 30); }
  const v = views.get(me.id); for (let i = 0; i < 4; i++) drawKiteView(v, { ...me, ribbon: S.stat(me, 'ribbon') }, me.trail, 1 / 30);
  drawBirds(world.birds); village.beam.visible = false;
  const cam = { landscape: [2.5, 1.5, 17, 1.5, 0.5], portrait: [0.5, 0, 26, 0.5, 1.5], square: [1.5, 0.5, 21, 1, 1], keyart: [2.5, 1.5, 17, 1.5, 0.5] }[kind] || [2.5, 1.5, 17, 1.5, 0.5];
  camera.position.set(me.x + cam[0], me.y + cam[1] - 2.5, cam[2]); camera.lookAt(me.x + cam[3], me.y + cam[4] - 1, 0); // close on the kite and its loop
  sky.position.copy(camera.position); stars.position.copy(camera.position);
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
  const jobs = [...Object.entries(SFX_FILES).map(([k, u]) => loadSfx(k, u)), document.fonts?.load('800 32px UI').catch(() => {}), document.fonts?.load('32px Display').catch(() => {})];
  let done = 0; jobs.forEach((p) => Promise.resolve(p).finally(() => { done++; $('loadBar').style.width = `${(100 * done) / jobs.length}%`; }));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  resize(); applyGfx(); toMenuScene(); renderChatBar();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  setState(State.MENU);
  if (CAPTURE) { // capture protocol used by tools/capture.mjs: no rAF loop, the tool drives every frame
    const startAt = +params.get('sky') || 0;
    window.__game = {
      start: () => startSolo(startAt),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) { step(STEP); if (state === State.RESULTS) botResults(); } fx.clear(); glow.clear(); updateClouds(1); camSnap = true; },
      sim: (sec) => { for (let s = 0; s < sec; s += STEP) { step(STEP); if (state === State.RESULTS) break; } },
      info: () => ({ state, sky: solo.index, free: solo.freeRound, time: world?.time, bloomed: world?.bloomed, goal: world?.goal, breeze: Math.floor(save.breeze + (me?.breeze || 0)), ups: { ...save.ups }, stars: { ...save.stars }, crashes: me?.crashes }),
      cover: (kind) => stageCover(kind),
      next: () => botResults(),
      dbg: () => { const v = views.get(me.id); return { trail: me.trail.length, pos: Array.from(v.rPos.slice(0, 12)).map((x) => +x.toFixed(2)), col: Array.from(v.rCol.slice(0, 8)).map((x) => +x.toFixed(2)), ribbonVisible: v.ribbon.visible, kite: [me.x, me.y] }; },
    };
    render(0);
    return;
  }
  requestAnimationFrame((n) => { last = n; frame(n); });
  if (params.has('debug')) window.__kw = () => ({ state, online: net.on, room: net.room, you: net.you, seats: net.seats.map((s) => s.name), bloomed: world?.bloomed, goal: world?.goal, round: net.round, breeze: Math.floor(save.breeze), me: me && [+me.x.toFixed(1), +me.y.toFixed(1)], painted: world?.clouds.filter((c) => c.paint > 0).length, others: [...net.snaps.keys()] }); // inspection hook for tests
  // invite links and the CrazyGames "instant multiplayer" entry go straight into a room
  const invited = sdkInviteParam('roomId') || params.get('room');
  if (invited && /^[A-Z0-9]{4,8}$/i.test(invited)) { openOnline(); connectOnline({ mode: 'code', code: invited.toUpperCase() }); }
  else if (sdkInstantMultiplayer()) { openOnline(); connectOnline({ mode: 'quick' }); }
  sdkCall((s) => s.game.addJoinRoomListener?.((p) => { if (p?.roomId) { openOnline(); connectOnline({ mode: 'code', code: String(p.roomId).toUpperCase() }); } }));
}
boot();
