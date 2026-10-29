// Tanglepeak: two little climbers tied by one rope. One grips a hold while you swing the other up to the next one;
// when it grabs, they swap and the old anchor lets go. Grip runs out, sandstone crumbles, moss and ice slip, gusts push,
// and a fall can take you a long way down. One fixed mountain for everyone: made for long climbs and for streaming them.
// Sections: CONFIG, I18N, SDK, AUDIO, SCENE, MOUNTAIN, VIEW, FX, INPUT, STATE, UI, TIPS, GAMEPLAY, LOOP, CAPTURE, BOOT.
// Rules + mountain generator live in climb.js (pure), meshes in world.js (procedural); only audio loads from ./assets/.
// No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';
import { PHYS, HOLDS, ZONES, rng, buildMountain, createClimb, step, botControl, holdPos, zoneAt, placeAt, saveSpot } from './climb.js';
import {
  LOOK, OUTFITS, buildCliff, buildWallDetail, buildGround, buildSlab, buildHold, buildCable, buildCamp, buildFlower, buildSummit, buildDressing, buildRanges,
  buildCloud, buildClimber, poseClimber, buildStaminaRing, setStamina,
} from './world.js';

// ================================================================ CONFIG
const SAVE_KEY = 'tanglepeak';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // the bot climbs (trailer footage, balance tests)
const FORCE_TIPS = params.has('tips');
const CFG = {
  fov: 42, camZ: 14, camLead: 1.6, camBelow: 2.6, // the camera looks a little up the wall: the way ahead, fading into the sky // camera distance from the wall and how far above the climbers it looks
  hatUnlock: [0, 3, 6, 9, 12, 15, 18, -1], ropeUnlock: [0, 4, 8, 12, 16, 20], // edelweiss needed (-1: reach the summit)
  voiceGap: 7, bigFall: 15, hugeFall: 40,
};
const ASSETS = {
  sfx: {
    grab: 'assets/audio/tp_grab.mp3', slip: 'assets/audio/tp_slip.mp3', crumble: 'assets/audio/tp_crumble.mp3', fall: 'assets/audio/tp_fall.mp3',
    land: 'assets/audio/tp_land.mp3', rope: 'assets/audio/tp_rope.mp3', camp: 'assets/audio/tp_camp.mp3', ice: 'assets/audio/wool_crack.mp3',
    gust: 'assets/audio/keel_gust.mp3', flags: 'assets/audio/dp_ribbon.mp3', flower: 'assets/audio/bloom_petal.mp3', summit: 'assets/audio/kite_sky_done.mp3',
    unlock: 'assets/audio/unlock.mp3', click: 'assets/audio/rune_tile_tap.mp3', tired: 'assets/audio/rune_tray_warn.mp3', hop: 'assets/audio/footstep.mp3',
    hook: 'assets/audio/whirl_anchor.mp3', catch: 'assets/audio/wool_star.mp3', blocked: 'assets/audio/swv_blocked.mp3', rescue: 'assets/audio/keel_night_fail.mp3',
    wind: 'assets/audio/kite_wind_loop.mp3', birds: 'assets/audio/bloom_birds.mp3', spray: 'assets/audio/bloom_rain_loop.mp3',
  },
  music: ['assets/audio/bgm_bloom_meadow.mp3', 'assets/audio/bgm_kite_day.mp3', 'assets/audio/bgm_wool_frost.mp3', 'assets/audio/bgm_kite_night.mp3'],
  musicByZone: [0, 0, 1, 1, 2, 3, 3],
};
const VOICE_LINES = ['intro', 'grab', 'fall_s1', 'fall_s2', 'fall_s3', 'fall_b1', 'fall_b2', 'fall_b3', 'fall_h1', 'fall_h2', 'catch', 'camp',
  'pines', 'falls', 'ridge', 'frost', 'cable', 'crown', 'summit', 'back', 'flower', 'tired'];
const VOL = { // per-sound levels, evened out by ear
  grab: 0.55, slip: 0.6, crumble: 0.7, fall: 0.5, land: 0.6, rope: 0.35, camp: 0.6, ice: 0.5, gust: 0.55, flags: 0.4, flower: 0.6, summit: 0.6,
  unlock: 0.5, click: 0.6, tired: 0.45, hop: 0.4, hook: 0.35, catch: 0.6, blocked: 0.5, rescue: 0.6,
};

// ================================================================ I18N (English required; Turkish too)
const STRINGS = {
  en: {
    tagline: 'Two climbers. One rope. One very tall mountain.', play: 'Climb', start: 'Start the climb', cont: 'Continue · {m} m',
    summitRun: 'Summit Run', summitInfo: 'No campfires · best {t}', summitNew: 'No campfires. How far can you fall?', summitCont: 'Continue · {m} m · {t}',
    outfits: 'Outfits', outfitsSub: 'Find edelweiss on the mountain to unlock new beanies and ropes.', beanies: 'Beanies', ropes: 'Ropes',
    back: 'Back', paused: 'Paused', resume: 'Resume', toCamp: 'Back to campfire', restartRun: 'Restart run', restartAsk: 'Start again from the foot of the mountain?',
    yes: 'Yes', no: 'No', menu: 'Menu', narrator: 'Narrator', music: 'Music', skipTips: 'Skip tips', or: 'or',
    summit: 'Summit!', summitSub: 'Two climbers, one rope, one summit.', time: 'Time', falls: 'Falls', bigFall: 'Biggest fall', flowers: 'Edelweiss', grabs: 'Holds grabbed',
    again: 'Climb again', best: 'Best', newBest: 'New best time!', trail: 'Trail', locked: 'Locked', needFlowers: '{n} edelweiss', needSummit: 'Reach the summit',
    unlocked: 'New outfit unlocked!', pausedTrail: 'Trail · {m} m · campfire at {c} m', pausedSummit: 'Summit Run · {m} m · {t}',
    zone: '{n}', fallPop: '−{m} m', catchPop: 'Caught it!', campPop: 'Campfire!', flowerPop: 'Edelweiss {n}/{t}', rescued: 'Back at the campfire',
    gust: 'Gust!', crumbled: 'Crumble!', bestPop: 'New height!', ledgeSwap: 'Swap', adUnavailable: 'Ad not available right now',
    tipReach: 'Point at the glowing hold and hold the button to reach for it', tipReachTouch: 'Hold your finger on the glowing hold to reach for it',
    tipReachKeys: 'Hold an arrow key toward the glowing hold to reach for it',
    tipSwap: 'Now the other one lets go. Swing them up to the next hold!', tipTired: 'The one holding on gets tired. Keep moving!',
    tipCatch: 'Falling? Hold the button to catch a hold!', tipCamp: 'Campfire! If you fall below it, you wake up here', tipCrumble: 'Sandy holds crumble. Be quick!',
    tipMoss: 'Moss is slippery: your grip runs out fast', tipIce: 'Ice drains your grip even faster', tipPiton: 'Golden rings never tire you out. Rest here!',
    tipHook: 'Hooks ride their cable. Time your grab', tipWind: 'Gusts! Hold on tight when the flags snap', tipFlower: 'Edelweiss! Collect them for new beanies and ropes',
    tipLedge: 'On a ledge, Space or the swap button changes who climbs', tipLedgeTouch: 'On a ledge, the swap button changes who climbs',
    tipSummitRun: 'Summit Run: no campfires. Every fall counts!',
    z_meadow: 'Meadow Crag', z_pines: 'Pine Ledges', z_falls: 'Waterfall Wall', z_ridge: 'Gusty Ridge', z_frost: 'Frost Chimney', z_cable: 'Old Cable Line', z_crown: 'The Crown',
    vo_intro: 'Two climbers, one rope, one very tall mountain. Up we go!', vo_grab: "That's it. One holds on, the other swings.", vo_fall_s1: 'Oops. Dust yourselves off.',
    vo_fall_s2: 'The mountain says hello.', vo_fall_s3: 'Down is easy. Up is the fun part.', vo_fall_b1: 'Well... that was a long way down.',
    vo_fall_b2: "Deep breath. The summit isn't going anywhere.", vo_fall_b3: 'Every great climber has fallen exactly like that.',
    vo_fall_h1: "Somebody clip that. Actually... maybe don't.", vo_fall_h2: "Oh dear. I'll put the kettle on.", vo_catch: 'What a catch!',
    vo_camp: 'A warm campfire. Rest your fingers.', vo_pines: "Sandy rocks crumble. Don't linger.", vo_falls: 'Wet moss is slippery. Keep moving.',
    vo_ridge: 'Feel that wind? Hold on when the flags snap.', vo_frost: 'Ice steals your grip fast. Be quick!', vo_cable: 'The old cable hooks still run. Time your grab.',
    vo_crown: 'The crown of the mountain. Almost there.', vo_summit: 'You made it! Two climbers, one rope, one summit.', vo_back: "And we're back where we were!",
    vo_flower: 'Edelweiss! A lucky find.', vo_tired: 'Fingers are getting tired!',
  },
  tr: {
    tagline: 'İki tırmanıcı. Bir ip. Kocaman bir dağ.', play: 'Tırman', start: 'Tırmanışa başla', cont: 'Devam · {m} m',
    summitRun: 'Zirve Koşusu', summitInfo: 'Kamp ateşi yok · en iyi {t}', summitNew: 'Kamp ateşi yok. Ne kadar düşebilirsin?', summitCont: 'Devam · {m} m · {t}',
    outfits: 'Kıyafetler', outfitsSub: 'Dağda dağ çiçeği bul, yeni bereler ve ipler aç.', beanies: 'Bereler', ropes: 'İpler',
    back: 'Geri', paused: 'Duraklatıldı', resume: 'Devam', toCamp: 'Kamp ateşine dön', restartRun: 'Baştan başla', restartAsk: 'Dağın eteğinden yeniden başlansın mı?',
    yes: 'Evet', no: 'Hayır', menu: 'Menü', narrator: 'Anlatıcı', music: 'Müzik', skipTips: 'İpuçlarını geç', or: 'ya da',
    summit: 'Zirve!', summitSub: 'İki tırmanıcı, bir ip, bir zirve.', time: 'Süre', falls: 'Düşüş', bigFall: 'En büyük düşüş', flowers: 'Dağ çiçeği', grabs: 'Tutunuş',
    again: 'Yeniden tırman', best: 'En iyi', newBest: 'Yeni en iyi süre!', trail: 'Patika', locked: 'Kilitli', needFlowers: '{n} dağ çiçeği', needSummit: 'Zirveye çık',
    unlocked: 'Yeni kıyafet açıldı!', pausedTrail: 'Patika · {m} m · kamp ateşi {c} m', pausedSummit: 'Zirve Koşusu · {m} m · {t}',
    zone: '{n}', fallPop: '−{m} m', catchPop: 'Yakaladın!', campPop: 'Kamp ateşi!', flowerPop: 'Dağ çiçeği {n}/{t}', rescued: 'Kamp ateşine döndün',
    gust: 'Rüzgâr!', crumbled: 'Ufalandı!', bestPop: 'Yeni yükseklik!', ledgeSwap: 'Değiş', adUnavailable: 'Şu anda reklam yok',
    tipReach: 'Parlayan tutamağa nişan al ve uzanmak için tuşu basılı tut', tipReachTouch: 'Uzanmak için parmağını parlayan tutamağın üstünde tut',
    tipReachKeys: 'Uzanmak için parlayan tutamağa doğru bir ok tuşunu basılı tut',
    tipSwap: 'Şimdi öteki bırakıyor. Onu bir sonraki tutamağa salla!', tipTired: 'Tutunan yorulur. Durma, ilerle!',
    tipCatch: 'Düşüyor musun? Bir tutamak yakalamak için tuşu basılı tut!', tipCamp: 'Kamp ateşi! Altına düşersen burada uyanırsın', tipCrumble: 'Kumlu tutamaklar ufalanır. Çabuk ol!',
    tipMoss: 'Yosun kaygandır: tutuşun çabuk biter', tipIce: 'Buz tutuşunu daha da hızlı tüketir', tipPiton: 'Altın halkalar seni hiç yormaz. Burada dinlen!',
    tipHook: 'Kancalar kablo üstünde gider. Zamanlamana dikkat', tipWind: 'Rüzgâr! Bayraklar çırpınınca sıkı tutun', tipFlower: 'Dağ çiçeği! Topla, yeni bereler ve ipler aç',
    tipLedge: 'Bir sekide Space ya da değiş düğmesi tırmananı değiştirir', tipLedgeTouch: 'Bir sekide değiş düğmesi tırmananı değiştirir',
    tipSummitRun: 'Zirve Koşusu: kamp ateşi yok. Her düşüş sayılır!',
    z_meadow: 'Çayır Kayası', z_pines: 'Çam Sekileri', z_falls: 'Şelale Duvarı', z_ridge: 'Rüzgârlı Sırt', z_frost: 'Buz Bacası', z_cable: 'Eski Kablo Hattı', z_crown: 'Taç',
    vo_intro: 'İki tırmanıcı, bir ip, kocaman bir dağ. Hadi yukarı!', vo_grab: 'İşte böyle. Biri tutunur, öteki sallanır.', vo_fall_s1: 'Hoppala. Üstünüzü silkeleyin.',
    vo_fall_s2: 'Dağ size merhaba diyor.', vo_fall_s3: 'Aşağı inmek kolay. Asıl eğlence yukarıda.', vo_fall_b1: 'Eh... epey uzun bir düşüştü.',
    vo_fall_b2: 'Derin bir nefes. Zirve bir yere kaçmıyor.', vo_fall_b3: 'Her büyük tırmanıcı tam da böyle düşmüştür.',
    vo_fall_h1: 'Biri bunu kaydetsin. Yok, en iyisi kaydetmesin.', vo_fall_h2: 'Eyvah. Ben çaydanlığı ocağa koyayım.', vo_catch: 'Ne yakalayış!',
    vo_camp: 'Sıcak bir kamp ateşi. Parmaklarını dinlendir.', vo_pines: 'Kumlu kayalar ufalanır. Oyalanma.', vo_falls: 'Islak yosun kaygandır. Durma, ilerle.',
    vo_ridge: 'Rüzgârı hissettin mi? Bayraklar çırpınınca sıkı tutun.', vo_frost: 'Buz tutuşunu çabuk çalar. Hızlı ol!', vo_cable: 'Eski kablo kancaları hâlâ çalışıyor. Zamanlamana dikkat.',
    vo_crown: 'Dağın tacı. Az kaldı.', vo_summit: 'Başardınız! İki tırmanıcı, bir ip, bir zirve.', vo_back: 'Ve kaldığımız yere döndük!',
    vo_flower: 'Dağ çiçeği! Şanslı bir buluş.', vo_tired: 'Parmaklar yoruluyor!',
  },
};
let lang = 'en';
const t = (k, vars) => { let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }
const zoneName = (zi) => t(`z_${ZONES[zi].id}`);

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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: reaching the summit, a new best time

// Midgame: only between runs (the summit card's buttons), never on navigation buttons. Mute on adStarted; always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
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

// ================================================================ AUDIO (Web Audio SFX + loops + narrator, synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  grab: ['triangle', 520, 700, 0.08, 0.08], slip: ['sawtooth', 700, 300, 0.25, 0.05], crumble: ['sawtooth', 300, 80, 0.4, 0.07], fall: ['sine', 1200, 300, 1.2, 0.05],
  land: ['sine', 200, 90, 0.18, 0.12], rope: ['triangle', 160, 120, 0.1, 0.05], camp: ['triangle', 660, 990, 0.5, 0.1], ice: ['square', 2400, 1600, 0.08, 0.04],
  gust: ['sine', 300, 700, 0.6, 0.04], flags: ['square', 900, 700, 0.06, 0.03], flower: ['sine', 1320, 1980, 0.3, 0.1], summit: ['triangle', 523, 1046, 0.9, 0.12],
  unlock: ['triangle', 660, 1320, 0.4, 0.1], click: ['square', 900, 900, 0.03, 0.07], tired: ['sine', 440, 330, 0.3, 0.06], hop: ['square', 220, 300, 0.05, 0.04],
  hook: ['square', 300, 200, 0.08, 0.05], catch: ['sine', 1320, 1760, 0.2, 0.09], blocked: ['square', 140, 110, 0.08, 0.07], rescue: ['triangle', 392, 196, 0.8, 0.1],
};
const audio = { ctx: null, master: null, buffers: {}, voices: {}, music: null, musicUrl: '', wantMusic: false, muted: new Set(), playing: 0, loops: {}, vo: null, voT: 0 };

function initAudio() {
  try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.master = audio.ctx.createGain(); audio.master.connect(audio.ctx.destination); }
  catch { audio.ctx = null; }
}
async function loadBuffer(url) {
  if (!audio.ctx) return null;
  try { const r = await fetch(url); if (r.ok) return await audio.ctx.decodeAudioData(await r.arrayBuffer()); } catch {} // missing -> synth / silence
  return null;
}
function unlockAudio() { // iOS: resume inside a user gesture
  if (audio.ctx?.state === 'suspended') audio.ctx.resume();
  if (audio.wantMusic && audio.music?.paused && !audio.muted.size && save.music) audio.music.play().catch(() => {});
}
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.playing > 12 || SIMMING) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime;
  vol *= VOL[key] ?? 1; g.connect(audio.master); audio.playing++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.95 + Math.random() * 0.1); g.gain.value = vol;
    s.connect(g); s.onended = () => audio.playing--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.playing--; o.start(now); o.stop(now + dur);
}
function setLoop(key, vol) { // looping ambience (wind, birds, waterfall spray); missing files simply stay silent
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
  if (audio.music && audio.musicUrl !== url) { const old = audio.music; fadeOut(old); audio.music = null; }
  if (!audio.music && url) {
    audio.musicUrl = url; const m = new Audio(url); m.loop = true; m.volume = 0; m.onerror = () => { if (audio.music === m) audio.music = null; }; audio.music = m; m.dataset.v = '0';
  }
  if (audio.music && !audio.muted.size && save.music) audio.music.play().catch(() => {});
}
function fadeOut(m) { let v = m.volume; const id = setInterval(() => { v -= 0.02; if (v <= 0) { clearInterval(id); m.pause(); } else m.volume = v; }, 50); }
function updateMusic(dt) { // ease the music volume (ducked under the narrator)
  const m = audio.music; if (!m) return;
  const want = audio.muted.size || !save.music ? 0 : audio.vo ? 0.12 : 0.26;
  const v = m.volume + Math.max(-dt * 0.4, Math.min(dt * 0.4, want - m.volume)); m.volume = Math.max(0, Math.min(1, v));
  if (save.music && !audio.muted.size && m.paused && audio.wantMusic && ctxRunning()) m.play().catch(() => {});
  if (!save.music && !m.paused && m.volume < 0.01) m.pause();
}
const ctxRunning = () => !audio.ctx || audio.ctx.state === 'running';
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic && save.music) audio.music.play().catch(() => {}); }
}
// the narrator: Old Juniper, a mountain guide; one line at a time, with a subtitle
let subTimer = 0;
function say(key, { force = false, chance = 1 } = {}) {
  if (CAPTURE || SIMMING || !save.voice) return false;
  if (!force && (audio.vo || clock - audio.voT < CFG.voiceGap || Math.random() > chance)) return false;
  audio.voT = clock;
  const b = audio.voices[key];
  showSub(t(`vo_${key}`), b ? b.duration + 0.6 : 3);
  if (!b || !audio.ctx || audio.muted.size) return true;
  if (audio.vo) try { audio.vo.stop(); } catch {}
  const s = audio.ctx.createBufferSource(), g = audio.ctx.createGain(); s.buffer = b; g.gain.value = 0.95;
  s.connect(g); g.connect(audio.master); s.onended = () => { if (audio.vo === s) audio.vo = null; }; s.start(); audio.vo = s;
  return true;
}
function showSub(text, secs) { const el = $('sub'); el.textContent = text; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; subTimer = secs; }

// ================================================================ SCENE (sky changes with altitude)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(LOOK[0].sky); scene.fog = new THREE.Fog(LOOK[0].fog, 22, 95);
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.5, 600);
const hemi = new THREE.HemisphereLight('#ffffff', '#a7b29a', 1.9);
const sun = new THREE.DirectionalLight('#fff3dc', 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; sun.shadow.intensity = 0.65;
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
scene.add(hemi, sun, sun.target);
let shakeAmt = 0, clock = 0, SIMMING = false;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (s) => { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const SKY = { a: new THREE.Color(), b: new THREE.Color() };
function skyAt(y, out, key) { // blend the zone looks by height
  const zs = M.zones; let i = zoneAt(M, y); const z = zs[i], k = clamp((y - z.y0) / (z.y1 - z.y0), 0, 1);
  const j = Math.min(zs.length - 1, i + 1); SKY.a.set(LOOK[i][key]); SKY.b.set(LOOK[j][key]);
  return out.copy(SKY.a).lerp(SKY.b, k > 0.6 ? (k - 0.6) / 0.4 : 0);
}
const _sky = new THREE.Color(), _fog = new THREE.Color(), _far = new THREE.Color();
function applySky(y) {
  skyAt(y, _sky, 'sky'); skyAt(y, _fog, 'fog'); skyAt(y, _far, 'far');
  scene.background.copy(_sky); scene.fog.color.copy(_fog);
  const night = clamp((y - M.zones[6].y0 + 10) / 40, 0, 1), gold = clamp(1 - Math.abs(y - (M.zones[5].y0 + 30)) / 45, 0, 1);
  hemi.intensity = 1.9 - night * 0.6; sun.intensity = 2.0 - night * 0.9;
  sun.color.setRGB(1, 0.95 - gold * 0.2, 0.86 - gold * 0.35).lerp(_far.setRGB(0.7, 0.75, 1), night);
  hemi.color.setRGB(1, 1, 1).lerp(_far.setRGB(0.75, 0.75, 1), night);
  ranges.forEach((r, i) => { r.material.color.set(_fog).lerp(_sky, 0.25 + i * 0.25).multiplyScalar(0.92 - 0.06 * (2 - i)); if (night > 0) r.material.color.lerp(_far.setRGB(0.18, 0.18, 0.36), night * (0.6 - i * 0.15)); });
  if (dressing.anim.stars) dressing.anim.stars.material.opacity = night * 0.95;
  for (const a of dressing.anim.aurora) a.material.opacity = night * 0.18;
}

// ================================================================ MOUNTAIN (built once: the same peak for everyone)
const M = buildMountain();
const FLOWER_TOTAL = M.flowers.length;
const statics = new THREE.Group(); scene.add(statics);
statics.add(buildCliff(M), buildWallDetail(M), buildGround());
const slabs = M.segs.filter((s) => s.kind === 'ledge' || s.kind === 'camp' || s.kind === 'rock' || s.kind === 'summit');
{ const R = rng(M.seed + 3); for (const s of slabs) statics.add(buildSlab(s, s.zone, R)); }
const holdViews = M.holds.map((h) => { if (h.gone) return null; const v = buildHold(h); statics.add(v); if (h.move) statics.add(buildCable(h)); return v; });
const campViews = M.camps.map((c) => { const v = buildCamp(c); statics.add(v); return v; });
const flowerViews = M.flowers.map((f) => { const v = buildFlower(); v.position.set(f.x, f.y, 0.05); statics.add(v); return v; });
const summitView = buildSummit(M.summit); statics.add(summitView);
const dressing = buildDressing(M); scene.add(dressing.group);
const ranges = buildRanges(); ranges.forEach((r) => scene.add(r));
const clouds = []; { const R = rng(91); for (let i = 0; i < 16; i++) { const c = buildCloud(R); c.position.set((R() - 0.5) * 120, 10 + R() * (M.top + 30), -26 - R() * 30); c.userData.v = 0.4 + R() * 0.8; scene.add(c); clouds.push(c); } }

// ================================================================ VIEW (climbers, rope, rings, particles)
let W = null, save = null;
const climbers = [buildClimber(...OUTFITS.hats[0]), buildClimber(OUTFITS.hats[0][1], OUTFITS.hats[0][0])];
climbers.forEach((c) => scene.add(c));
const stamRing = buildStaminaRing(); scene.add(stamRing);
const ROPE_N = 16, ropePts = Array.from({ length: ROPE_N }, () => ({ x: 0, y: 0, px: 0, py: 0, z: 0.3 }));
const ropeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 5), new THREE.MeshStandardMaterial({ color: OUTFITS.ropes[0], flatShading: true, roughness: 0.8 }), ROPE_N - 1);
ropeMesh.castShadow = true; ropeMesh.frustumCulled = false; scene.add(ropeMesh);
const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }));
targetRing.renderOrder = 4; scene.add(targetRing);
const guideRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: '#ffc23d', transparent: true, opacity: 0.9, depthTest: false }));
guideRing.renderOrder = 4; scene.add(guideRing);
function applyOutfit() {
  const [a, b] = OUTFITS.hats[save.hat] || OUTFITS.hats[0];
  for (const [i, [hat, jacket]] of [[a, b], [b, a]].entries()) {
    const old = climbers[i], fresh = buildClimber(hat, jacket); fresh.position.copy(old.position); scene.remove(old); scene.add(fresh); climbers[i] = fresh;
  }
  ropeMesh.material.color.set(OUTFITS.ropes[save.rope] || OUTFITS.ropes[0]);
}
function resetRope() { const [a, b] = W.c; ropePts.forEach((p, i) => { const k = i / (ROPE_N - 1); p.x = p.px = a.x + (b.x - a.x) * k; p.y = p.py = a.y + (b.y - a.y) * k - 0.05; }); }
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function stepRope(dt) { // a verlet chain hung between the two climbers' harnesses
  const [a, b] = W.c, seg = PHYS.rope / (ROPE_N - 1), g = 14 * dt * dt;
  if (ropePts.some((p) => Math.hypot(p.x - a.x, p.y - a.y) > PHYS.rope + 2 && Math.hypot(p.x - b.x, p.y - b.y) > PHYS.rope + 2)) resetRope(); // after a jump (campfire, resume, skipped time)
  for (let i = 1; i < ROPE_N - 1; i++) { const p = ropePts[i], vx = (p.x - p.px) * 0.97, vy = (p.y - p.py) * 0.97; p.px = p.x; p.py = p.y; p.x += vx; p.y += vy - g; }
  for (let it = 0; it < 14; it++) {
    ropePts[0].x = a.x; ropePts[0].y = a.y - 0.05; ropePts[ROPE_N - 1].x = b.x; ropePts[ROPE_N - 1].y = b.y - 0.05;
    for (let i = 0; i < ROPE_N - 1; i++) {
      const p = ropePts[i], q = ropePts[i + 1], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
      if (d <= seg) continue;
      const k = (d - seg) / d, wp = i === 0 ? 0 : 0.5, wq = i + 1 === ROPE_N - 1 ? 0 : 0.5, s = wp + wq || 1;
      p.x += dx * k * (wp / s); p.y += dy * k * (wp / s); q.x -= dx * k * (wq / s); q.y -= dy * k * (wq / s);
    }
  }
  for (let i = 0; i < ROPE_N - 1; i++) {
    const p = ropePts[i], q = ropePts[i + 1], len = Math.hypot(q.x - p.x, q.y - p.y) || 0.001;
    _d.set((q.x - p.x) / len, (q.y - p.y) / len, 0); _q.setFromUnitVectors(_up, _d);
    _m4.compose(_p.set((p.x + q.x) / 2, (p.y + q.y) / 2, 0.32), _q, _s.set(1, len + 0.02, 1)); ropeMesh.setMatrixAt(i, _m4);
  }
  ropeMesh.instanceMatrix.needsUpdate = true;
}
// particles: one instanced mesh of little quads (dust, chalk, snow, sparkles, spray, embers, wind streaks)
const PART_N = 320, parts = [], partMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }), PART_N);
partMesh.frustumCulled = false; partMesh.renderOrder = 3; scene.add(partMesh);
for (let i = 0; i < PART_N; i++) { parts.push({ life: 0 }); partMesh.setColorAt(i, new THREE.Color('#ffffff')); }
let partNext = 0; const _pc = new THREE.Color();
function emit(x, y, z, n, o) {
  if (SIMMING) return;
  for (let k = 0; k < n; k++) {
    const p = parts[partNext]; partNext = (partNext + 1) % PART_N;
    const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.6);
    Object.assign(p, { x: x + (Math.random() - 0.5) * (o.spread ?? 0.2), y: y + (Math.random() - 0.5) * (o.spread ?? 0.2), z: z + (Math.random() - 0.5) * (o.spreadZ ?? 0.2),
      vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp + (o.vy ?? 0), vz: 0, life: o.life ?? 0.8, max: o.life ?? 0.8, size: o.size ?? 0.12, g: o.g ?? 0, stretch: o.stretch ?? 1, spin: Math.random() * 6 });
    partMesh.setColorAt(partNext === 0 ? PART_N - 1 : partNext - 1, _pc.set(Array.isArray(o.color) ? o.color[k % o.color.length] : o.color || '#ffffff'));
  }
  partMesh.instanceColor.needsUpdate = true;
}
const _e = new THREE.Euler();
function updateParticles(dt) {
  for (let i = 0; i < PART_N; i++) {
    const p = parts[i];
    if (p.life <= 0) { _m4.makeScale(0, 0, 0); partMesh.setMatrixAt(i, _m4); continue; }
    p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.spin += dt * 2;
    const s = p.size * Math.min(1, (p.life / p.max) * 2.5);
    _q.setFromEuler(_e.set(0, 0, p.stretch > 1 ? 0 : p.spin));
    _m4.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s * p.stretch, s, s)); partMesh.setMatrixAt(i, _m4);
  }
  partMesh.instanceMatrix.needsUpdate = true;
}

// ================================================================ FX (events -> sound, particles, pops, narrator)
const pops = [];
function pop(text, x, y, cls = '', life = 1.4) {
  if (SIMMING) return;
  const el = document.createElement('div'); el.className = `pop ${cls}`; el.textContent = text; $('pops').appendChild(el);
  pops.push({ el, x, y, life, max: life });
}
const _pp = new THREE.Vector3();
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.life -= dt;
    if (p.life <= 0) { p.el.remove(); pops.splice(i, 1); continue; }
    _pp.set(p.x, p.y + (1 - p.life / p.max) * 1.2, 0.5).project(camera);
    p.el.style.transform = `translate(${(_pp.x * 0.5 + 0.5) * innerWidth}px, ${(-_pp.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    p.el.style.opacity = Math.min(1, p.life * 2.5);
  }
}
let run = null; // per-run bookkeeping in the view (zones announced, last voice, fall memory)
function handleEvents() {
  const w = W; if (!w) return;
  for (const e of w.events) {
    const c = e.c != null ? w.c[e.c] : null;
    switch (e.type) {
      case 'grab': {
        const h = M.holds[e.h], hp = holdPos(w, h);
        playSfx('grab', 1, h.type === 'ice' ? 1.2 : 1); if (h.type === 'hook') playSfx('hook'); if (h.type === 'ice') playSfx('ice', 0.6, 1.3);
        emit(hp.x, hp.y, 0.2, 5, { color: h.type === 'moss' ? '#bfe8c0' : h.type === 'ice' ? '#e6f7ff' : '#ffffff', speed: 1.4, life: 0.5, size: 0.1 });
        if (e.catch) { playSfx('catch'); pop(t('catchPop'), hp.x, hp.y + 0.6, 'gold'); if (run.fallFrom - hp.y > 4) say('catch', { chance: 0.7 }); }
        if (!w.demo && !AUTOPLAY) { run.grabsSeen++; tipEvent('grab'); if (run.grabsSeen === 2 && !save.said.grab) { save.said.grab = 1; say('grab', { force: true }); } }
        firstSeen(h.type);
        break;
      }
      case 'release': if (e.why === 'tired') { playSfx('slip'); const h = M.holds[e.h]; emit(h.x, h.y, 0.2, 6, { color: '#d9cbb5', speed: 1.5, g: 6, life: 0.7 }); } break;
      case 'slip': playSfx('slip', 0.8); break;
      case 'crumble': {
        const h = M.holds[e.h]; playSfx('crumble'); shakeAmt = Math.max(shakeAmt, 0.12);
        emit(h.x, h.y, 0.1, 14, { color: ['#e2a75e', '#c98a48', '#f0c690'], speed: 2.4, g: 14, life: 1, size: 0.14 });
        pop(t('crumbled'), h.x, h.y + 0.5, 'white', 1);
        break;
      }
      case 'regrow': { const h = M.holds[e.h]; emit(h.x, h.y, 0.1, 6, { color: '#f0c690', speed: 0.8, life: 0.6 }); break; }
      case 'tired': playSfx('tired'); if (!w.demo) say('tired', { chance: 0.25 }); break;
      case 'hop': playSfx('hop', 0.7); break;
      case 'land': if (e.v > 5) { playSfx('land', Math.min(1, e.v / 12)); emit(c.x, c.y - 0.3, 0.3, 6, { color: '#cbbfa9', speed: 1.6, g: 4, life: 0.6 }); if (e.v > 12) shakeAmt = Math.max(shakeAmt, 0.18); } break;
      case 'bump': playSfx('land', 0.5, 1.3); break;
      case 'taut': if (e.v > 8) playSfx('rope', Math.min(1, e.v / 14)); break;
      case 'fall': onFall(e.dist, e.caught); break;
      case 'rescue': onRescue(e); break;
      case 'camp': onCamp(e.id); break;
      case 'flower': onFlower(e.id); break;
      case 'gustWarn': playSfx('flags'); run.gustFlap = 1.6; break;
      case 'gust': playSfx('gust'); run.gustFlap = 2.4; pop(t('gust'), (w.c[0].x + w.c[1].x) / 2 + e.dir * 3, Math.max(w.c[0].y, w.c[1].y) + 1.5, 'white', 1.2); firstSeen('wind'); break;
      case 'summit': onSummit(); break;
      default: break;
    }
  }
  w.events.length = 0;
}
function onFall(dist, caught) {
  const w = W, top = Math.max(w.c[0].y, w.c[1].y), m = Math.round(dist);
  if (w.demo) return;
  shakeAmt = Math.max(shakeAmt, Math.min(0.5, dist / 60));
  pop(t('fallPop', { m }), (w.c[0].x + w.c[1].x) / 2, top + 1.2, dist >= CFG.hugeFall ? 'huge' : 'fall', 2.2);
  if (dist >= CFG.bigFall) run.comeback = top + dist; // climb back above where you fell from: the narrator cheers
  if (dist >= CFG.hugeFall) { playSfx('rescue', 0.7); say(Math.random() < 0.5 ? 'fall_h1' : 'fall_h2', { force: true }); }
  else if (dist >= CFG.bigFall) say(['fall_b1', 'fall_b2', 'fall_b3'][Math.floor(Math.random() * 3)], { chance: 0.85 });
  else say(['fall_s1', 'fall_s2', 'fall_s3'][Math.floor(Math.random() * 3)], { chance: 0.3 });
  run.bumpHud = 'hudFalls';
}
function onRescue(e) {
  const w = W, cp = M.camps[e.id]; if (w.demo) return;
  pop(t('fallPop', { m: Math.round(Math.max(9, e.dist)) }), cp.x, cp.y + 2, e.dist >= CFG.hugeFall ? 'huge' : 'fall', 2.2);
  banner(t('rescued'), ''); resetRope(); snapCamera(); playSfx('rescue', 0.6);
  if (e.dist >= CFG.bigFall) say(['fall_b1', 'fall_b2', 'fall_b3'][Math.floor(Math.random() * 3)], { chance: 0.8 }); else say('fall_s2', { chance: 0.3 });
  run.bumpHud = 'hudFalls';
}
function onCamp(id) {
  const w = W, cp = M.camps[id]; if (w.demo || w.mode !== 'trail') return; // Summit Run: campfires are only scenery
  playSfx('camp'); emit(cp.x, cp.y + 0.6, 0.3, 16, { color: ['#ffd23f', '#ff8a2a', '#fff4e0'], speed: 2.2, vy: 1.5, life: 1.1, size: 0.12 });
  pop(t('campPop'), cp.x, cp.y + 1.6, 'gold');
  if (!save.litCamps.includes(id)) save.litCamps.push(id);
  if (w.mode === 'trail') { save.trail = snapshot('camp'); persist(); }
  if (!save.said.camp) { save.said.camp = 1; say('camp', { force: true }); } else say('camp', { chance: 0.25 });
  if (w.mode === 'trail') firstSeen('camp');
}
function onFlower(id) {
  const f = M.flowers[id]; if (W.demo) return;
  playSfx('flower'); emit(f.x, f.y, 0.2, 18, { color: ['#ffffff', '#fff7c2', '#ffd23f'], speed: 2.5, life: 1, size: 0.12 });
  flowerViews[id].visible = false;
  const before = unlockedCount();
  if (!save.flowers.includes(id)) save.flowers.push(id);
  pop(t('flowerPop', { n: save.flowers.length, t: FLOWER_TOTAL }), f.x, f.y + 0.6, 'gold');
  if (unlockedCount() > before) { setTimeout(() => { toast(t('unlocked')); playSfx('unlock'); }, 900); }
  if (save.flowers.length <= 2) say('flower', { force: true }); else say('flower', { chance: 0.3 });
  firstSeen('flower'); persist(); run.bumpHud = 'hudFlowers';
}
function onSummit() {
  const w = W; if (w.demo) return;
  playSfx('summit'); happytime(); say('summit', { force: true });
  for (let k = 0; k < 6; k++) setTimeout(() => emit(M.summit.x + (Math.random() - 0.5) * 4, M.summit.y + 2 + Math.random() * 2, 0.5, 18, { color: ['#ff7a3d', '#ffd23f', '#2ec4b6', '#ffffff', '#ff8ac2'], speed: 4, g: 5, life: 1.6, size: 0.14 }), k * 250);
  banner(t('summit'), zoneName(6));
  run.summitT = 3.2;
}
let firstSeenSet = new Set();
function firstSeen(kind) { // first time a mechanic shows up: one tip card (once per save)
  if (firstSeenSet.has(kind)) return; firstSeenSet.add(kind);
  const map = { crumble: 'crumble', moss: 'moss', ice: 'ice', piton: 'piton', hook: 'hook', wind: 'wind', flower: 'flower', camp: 'camp' };
  if (map[kind]) queueTip(map[kind]);
}

// ================================================================ INPUT (pointer: aim + hold to reach; keys: arrows/WASD reach that way; Space swaps)
const keys = new Set(), input = { sx: innerWidth / 2, sy: innerHeight / 2, down: false, mode: 'pointer', swap: false, lastMove: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const DIRS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyZ: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyQ: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
function keyDir() { let dx = 0, dy = 0; for (const k of keys) if (DIRS[k]) { dx += DIRS[k][0]; dy += DIRS[k][1]; } const l = Math.hypot(dx, dy); return l ? [dx / l, dy / l] : null; }
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (DIRS[e.code]) input.mode = 'keys';
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (state === State.PLAYING && (e.code === 'Space' || e.code === 'KeyE')) input.swap = true;
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU && !$('menu').hidden) $('btnPlay').click();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.GAMEOVER && !$('results').hidden) $('btnAgain').click();
});
addEventListener('keyup', (e) => { keys.delete(e.code); });
addEventListener('blur', () => { keys.clear(); input.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio(); input.sx = e.clientX; input.sy = e.clientY; input.mode = 'pointer';
  if (state !== State.PLAYING) return;
  if (e.button === 2) { input.swap = true; return; }
  input.down = true; canvas.setPointerCapture?.(e.pointerId);
});
addEventListener('pointermove', (e) => { input.sx = e.clientX; input.sy = e.clientY; if (e.pointerType === 'mouse' && Math.hypot(e.movementX, e.movementY) > 2) input.mode = 'pointer'; });
for (const evn of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(evn, () => { input.down = false; });
$('btnSwap').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); input.swap = true; });
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.3), _hit = new THREE.Vector3();
function aimWorld() { // the pointer, projected onto the climbers' plane
  _ndc.set((input.sx / innerWidth) * 2 - 1, -(input.sy / innerHeight) * 2 + 1); _ray.setFromCamera(_ndc, camera);
  return _ray.ray.intersectPlane(_plane, _hit) ? { x: _hit.x, y: _hit.y } : { x: 0, y: 0 };
}
function playerControl() {
  const w = W, a = w.c[w.act], swap = input.swap; input.swap = false;
  const kd = keyDir();
  if (kd && input.mode === 'keys') return { pull: true, dir: true, dx: kd[0], dy: kd[1], ax: a.x + kd[0] * 3, ay: a.y + PHYS.hand + kd[1] * 3, swap };
  const p = aimWorld();
  return { pull: input.down, ax: p.x, ay: p.y, swap };
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> GAMEOVER (summit))
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, camWant = 0, camBlend = 0;
const DEFAULT_SAVE = {
  v: 1, trail: null, summit: null, bestTrail: 0, bestSummit: 0, splits: [], summits: 0, bestHeight: 0, flowers: [], litCamps: [], hat: 0, rope: 0,
  voice: true, music: true, tips: {}, tipsOff: false, said: {}, totals: { falls: 0, time: 0, grabs: 0 },
};
save = structuredClone(DEFAULT_SAVE);

function setState(s, panel = 'menu') {
  state = s;
  for (const id of ['menu', 'outfits']) $(id).hidden = !(s === State.MENU && panel === id);
  $('paused').hidden = !(s === State.PAUSED && panel !== 'confirm'); $('confirm').hidden = !(s === State.PAUSED && panel === 'confirm'); $('results').hidden = s !== State.GAMEOVER;
  const inGame = s === State.PLAYING || s === State.PAUSED;
  $('hud').hidden = !inGame; $('map').hidden = !inGame;
  hudCache = '';
  if (!inGame) { $('tip').hidden = true; $('arrow').hidden = true; tipState = null; tipQueue.length = 0; $('btnSwap').hidden = true; $('aimHint').hidden = true; $('split').hidden = true; }
  if (s !== State.PLAYING) input.down = false;
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, summit
}
function togglePause() {
  if (state === State.PLAYING) { persistRun(); setState(State.PAUSED); refreshPause(); }
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { if (SIMMING || CAPTURE) return; const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400); }
function banner(big, small) { if (SIMMING) return; const el = $('banner'); $('bannerBig').textContent = big; $('bannerSmall').textContent = small || ''; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(banner.tm); banner.tm = setTimeout(() => { el.hidden = true; }, 2600); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click'); fn(); });
const persist = () => saveData(`${SAVE_KEY}:save`, save);
const unlockedCount = () => CFG.hatUnlock.filter((n, i) => hatOpen(i)).length + CFG.ropeUnlock.filter((n) => save.flowers.length >= n).length;
const hatOpen = (i) => (CFG.hatUnlock[i] < 0 ? save.summits > 0 : save.flowers.length >= CFG.hatUnlock[i]);

// ================================================================ UI
click('btnPlay', () => startClimb('trail', !!save.trail));
click('btnSummit', () => startClimb('summit', !!save.summit));
click('btnOutfits', () => openOutfits());
click('btnOutfitsBack', () => showMenu());
click('btnVoice', () => { save.voice = !save.voice; persist(); refreshToggles(); });
click('btnMusic', () => { save.music = !save.music; persist(); refreshToggles(); if (save.music) playMusic(audio.musicUrl || ASSETS.music[0]); });
click('btnPauseVoice', () => { save.voice = !save.voice; persist(); refreshToggles(); });
click('btnPauseMusic', () => { save.music = !save.music; persist(); refreshToggles(); });
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnCamp', () => backToCamp());
click('btnPauseCamp', () => { setState(State.PLAYING); backToCamp(); });
click('btnRestartRun', () => setState(State.PAUSED, 'confirm'));
click('btnConfirmNo', () => { setState(State.PAUSED); refreshPause(); });
click('btnConfirmYes', () => { if (W.mode === 'trail') save.trail = null; else save.summit = null; persist(); startClimb(W.mode, false); });
click('btnQuit', () => { persistRun(); showMenu(); });
click('btnSkipTips', () => { save.tipsOff = true; persist(); tipState = null; tipQueue.length = 0; $('tip').hidden = true; $('arrow').hidden = true; });
click('btnAgain', () => triggerMidgameAd(() => startClimb(W.mode, false))); // between two runs only
click('btnResSummit', () => triggerMidgameAd(() => startClimb('summit', !!save.summit)));
click('btnResMenu', () => showMenu());

function refreshToggles() {
  for (const [id, on] of [['btnVoice', save.voice], ['btnMusic', save.music], ['btnPauseVoice', save.voice], ['btnPauseMusic', save.music]]) $(id).classList.toggle('off', !on);
  if (!save.voice && audio.vo) { try { audio.vo.stop(); } catch {} audio.vo = null; $('sub').hidden = true; }
}
function refreshMenu() {
  const tr = save.trail, su = save.summit;
  $('playLabel').textContent = tr ? t('play') : t('start');
  $('playInfo').textContent = tr ? t('cont', { m: Math.round(Math.max(0, (tr.best || 0) - PHYS.r)) }) : '';
  $('playInfo').hidden = !tr;
  $('summitInfo').textContent = su ? t('summitCont', { m: Math.round(su.y || 0), t: fmt(su.stats?.time || 0) }) : save.bestSummit ? t('summitInfo', { t: fmt(save.bestSummit) }) : t('summitNew');
  $('menuBest').textContent = `${Math.round(save.bestHeight)} m`; $('menuFlowers').textContent = save.flowers.length; $('menuFlowersMax').textContent = FLOWER_TOTAL;
  $('menuSummits').textContent = save.summits;
  refreshToggles();
}
function showMenu() {
  W = null; startDemo(); setState(State.MENU, 'menu'); refreshMenu(); camWant = 0;
  playMusic(ASSETS.music[0]);
}
function openOutfits() {
  const hg = $('hatGrid'); hg.innerHTML = '';
  OUTFITS.hats.forEach(([a, b], i) => {
    const open = hatOpen(i), el = document.createElement('button'); el.className = `pick soft${save.hat === i ? ' on' : ''}${open ? '' : ' locked'}`;
    el.innerHTML = `<span class="swatch" style="--a:${a};--b:${b}"></span><small>${open ? '' : `<i class="ico ico-lock"></i>${CFG.hatUnlock[i] < 0 ? '<i class="ico ico-flag"></i>' : CFG.hatUnlock[i]}`}</small>`;
    el.addEventListener('click', () => { if (!open) { playSfx('blocked'); toast(CFG.hatUnlock[i] < 0 ? t('needSummit') : t('needFlowers', { n: CFG.hatUnlock[i] })); return; } playSfx('click'); save.hat = i; persist(); applyOutfit(); openOutfits(); });
    hg.appendChild(el);
  });
  const rg = $('ropeGrid'); rg.innerHTML = '';
  OUTFITS.ropes.forEach((c, i) => {
    const open = save.flowers.length >= CFG.ropeUnlock[i], el = document.createElement('button'); el.className = `pick soft${save.rope === i ? ' on' : ''}${open ? '' : ' locked'}`;
    el.innerHTML = `<span class="swatch" style="--a:${c};--b:${c}"></span><small>${open ? '' : `<i class="ico ico-lock"></i>${CFG.ropeUnlock[i]}`}</small>`;
    el.addEventListener('click', () => { if (!open) { playSfx('blocked'); toast(t('needFlowers', { n: CFG.ropeUnlock[i] })); return; } playSfx('click'); save.rope = i; persist(); applyOutfit(); openOutfits(); });
    rg.appendChild(el);
  });
  setState(State.MENU, 'outfits');
}
function refreshPause() {
  const w = W, h = Math.round(heightOf(w)), cp = M.camps[w.camp];
  $('pausedInfo').textContent = w.mode === 'trail' ? t('pausedTrail', { m: h, c: Math.round(cp?.y || 0) }) : t('pausedSummit', { m: h, t: fmt(w.stats.time) });
  $('btnPauseCamp').hidden = w.mode !== 'trail';
  refreshToggles();
}
// HUD
let hudCache = '';
const heightOf = (w) => Math.max(0, Math.max(w.c[0].y, w.c[1].y) - PHYS.r);
function buildMap() {
  const tr = $('mapTrack'); tr.innerHTML = '';
  const H = M.top + 4;
  M.zones.forEach((z, i) => { const el = document.createElement('i'); el.style.bottom = `${(z.y0 / H) * 100}%`; el.style.height = `${((Math.min(z.y1, H) - z.y0) / H) * 100}%`; el.style.background = LOOK[i].wall2; tr.appendChild(el); });
  if (W.mode === 'trail') M.camps.forEach((c) => { const el = document.createElement('i'); el.className = `camp${save.litCamps.includes(c.id) ? ' lit' : ''}`; el.style.bottom = `${(c.y / H) * 100}%`; tr.appendChild(el); });
  const fl = document.createElement('i'); fl.style.cssText = `bottom:${(M.summit.y / H) * 100}%;height:.5em;background:#ff7a3d`; tr.appendChild(fl);
}
function updateHud() {
  const w = W; if (!w || w.demo) return;
  const h = heightOf(w), zi = zoneAt(M, Math.max(w.c[0].y, w.c[1].y)), H = M.top + 4;
  const key = `${Math.round(h)}|${Math.round(w.best)}|${zi}|${w.stats.time | 0}|${w.stats.falls}|${save.flowers.length}|${lang}`;
  if (key !== hudCache) {
    hudCache = key;
    $('hudHeight').textContent = Math.round(h); $('hudBest').textContent = `${t('best')} ${Math.round(Math.max(w.best - PHYS.r, 0))} m`;
    $('hudZone').textContent = zoneName(zi); $('hudTime').textContent = fmt(w.stats.time); $('hudFalls').textContent = w.stats.falls; $('hudFlowers').textContent = `${save.flowers.length}/${FLOWER_TOTAL}`;
    $('mapMe').style.bottom = `${(clamp(h, 0, H) / H) * 100}%`; $('mapBest').style.bottom = `${(clamp(w.best, 0, H) / H) * 100}%`;
  }
  if (run.bumpHud) { const el = $(run.bumpHud).parentElement; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); run.bumpHud = null; }
  $('btnCamp').hidden = w.mode !== 'trail';
  // swap: shown when both climbers are safe (on a ledge), so you can choose who climbs
  const canSwap = w.c.every((c) => c.grip >= 0 || c.stand) && w.c.some((c) => c.stand);
  $('btnSwap').hidden = !canSwap;
  if (canSwap && !save.tips.ledgeTip) { save.tips.ledgeTip = 1; queueTip('ledge'); }
}
// the reach ring: which hold would you grab right now?
const _tp = { x: 0, y: 0, vx: 0, vy: 0 };
function grabPreview() {
  const w = W, a = w.c[w.act], o = w.c[1 - w.act];
  if (a.grip >= 0) return null;
  let aim;
  if (input.mode === 'keys') { const kd = keyDir(); if (!kd) return null; aim = { x: a.x + kd[0] * 2, y: a.y + PHYS.hand + kd[1] * 2 }; } else aim = aimWorld();
  let best = null, bd = 1.6;
  for (const h of M.live) {
    if (Math.abs(h.y - aim.y) > 2.5 || w.broken[h.id] > 0 || o.grip === h.id) continue;
    const p = holdPos(w, h, _tp), d = Math.hypot(p.x - aim.x, p.y - aim.y);
    if (d < bd) { bd = d; best = { h, x: p.x, y: p.y, reach: Math.hypot(p.x - o.x, p.y - o.y) < PHYS.rope + PHYS.hand + PHYS.grabR - 0.1 || a.stand }; }
  }
  return best;
}

// ================================================================ TIPS (onboarding inside gameplay: a few words, a pointer, never a pause)
const TIPS = {
  first: [
    { pic: 'reach', text: () => (isTouch ? 'tipReachTouch' : input.mode === 'keys' ? 'tipReachKeys' : 'tipReach'), arrow: 'guide', until: 'grab', time: 90 },
    { pic: 'swap', text: () => 'tipSwap', arrow: 'guide', until: 'grab', time: 40 },
    { pic: 'tired', text: () => 'tipTired', arrow: 'ring', time: 7 },
  ],
  catch: [{ pic: 'fall', text: () => 'tipCatch', time: 6 }], camp: [{ pic: 'fire', text: () => 'tipCamp', time: 6 }],
  crumble: [{ pic: 'crumble', text: () => 'tipCrumble', time: 6 }], moss: [{ pic: 'moss', text: () => 'tipMoss', time: 6 }],
  ice: [{ pic: 'ice', text: () => 'tipIce', time: 6 }], piton: [{ pic: 'piton', text: () => 'tipPiton', time: 6 }], hook: [{ pic: 'hook', text: () => 'tipHook', time: 6 }],
  wind: [{ pic: 'wind', text: () => 'tipWind', time: 6 }], flower: [{ pic: 'flower', text: () => 'tipFlower', time: 6 }],
  ledge: [{ pic: 'ledge', text: () => (isTouch ? 'tipLedgeTouch' : 'tipLedge'), time: 7 }], summitRun: [{ pic: 'flag', text: () => 'tipSummitRun', time: 6 }],
};
const HOLD_PIC = { crumble: '#e2a75e', moss: '#5aa86a', ice: '#bfe9ff', piton: '#ffc23d', hook: '#9aa3b2' };
let tipState = null; const tipQueue = [];
function queueTip(key) {
  if (save.tipsOff || save.tips[key] || (AUTOPLAY && !FORCE_TIPS) || !TIPS[key] || W?.demo) return;
  if (tipState?.key === key || tipQueue.includes(key)) return;
  tipQueue.push(key); if (!tipState) nextQueued();
}
function nextQueued() { const k = tipQueue.shift(); if (!k) { tipState = null; $('tip').hidden = true; $('arrow').hidden = true; return; } tipState = { key: k, i: -1, t: 0 }; nextTip(); }
function nextTip() {
  const steps = TIPS[tipState.key]; tipState.i++; tipState.t = 0;
  if (tipState.i >= steps.length) { save.tips[tipState.key] = 1; persist(); nextQueued(); return; }
  showTip(steps[tipState.i]);
}
function showTip(s) {
  const pic = (inner, bg = '#eadbbd') => `<span class="tip-pic" style="background:${bg}">${inner}</span>`, ico = (n) => `<i class="ico ico-${n}"></i>`;
  const hold = (c) => pic(`<span class="hold" style="background:${c}"></span>`, '#f3e8d2');
  const arrows = '<span class="keys"><kbd class="solo">↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span>';
  const pics = {
    reach: isTouch ? `<span class="hand"></span>${hold('#e2d3bd')}` : input.mode === 'keys' ? `${arrows}${hold('#e2d3bd')}` : `<span class="mouse"></span>${hold('#e2d3bd')}`,
    swap: pic(ico('rope'), '#ffe2cc'), tired: pic(ico('grip'), '#ffe2cc'), fall: pic(ico('fall'), '#ffe2dc'), fire: pic(ico('fire'), '#ffe9a8'),
    crumble: hold(HOLD_PIC.crumble), moss: hold(HOLD_PIC.moss), ice: hold(HOLD_PIC.ice), piton: hold(HOLD_PIC.piton), hook: hold(HOLD_PIC.hook),
    wind: pic(ico('flag'), '#d9ecf5'), flower: pic(ico('flower'), '#e8f0ff'), flag: pic(ico('flag'), '#ffe2cc'),
    ledge: isTouch ? `<span class="hand"></span>${pic(ico('swap'), '#ffe9a8')}` : `<kbd class="solo wide">Space</kbd><span class="or">${t('or')}</span><span class="mouse right"></span>`,
  };
  $('tipIcon').innerHTML = pics[s.pic] || ''; $('tipText').textContent = t(s.text());
  $('tip').hidden = false; $('tip').style.animation = 'none'; void $('tip').offsetWidth; $('tip').style.animation = '';
}
function tipEvent(kind) { if (tipState && TIPS[tipState.key][tipState.i]?.until === kind) nextTip(); }
function updateTips(dt) {
  if (!tipState || !W) return;
  const s = TIPS[tipState.key][tipState.i]; tipState.t += dt;
  if (s.time && tipState.t > s.time) nextTip();
}
const _a = new THREE.Vector3();
const guideB = {};
function guideTarget() { // the next hold on the mountain's main line (onboarding only)
  const w = W; botControl(w, guideB); const n = M.path[Math.min(M.path.length - 1, (guideB.i ?? 0) + 1)];
  if (!n || n.kind !== 'hold') return null; const p = holdPos(w, M.holds[n.h], _tp); return { x: p.x, y: p.y };
}
function placeArrow() {
  const s = tipState && TIPS[tipState.key][tipState.i], arrow = $('arrow');
  let p = null;
  if (s?.arrow === 'guide') { const g = guideTarget(); if (g) p = _a.set(g.x, g.y + 0.35, 0.3); }
  if (s?.arrow === 'ring') { const c = W.c.find((q) => q.grip >= 0); if (c) p = _a.set(c.x, c.y + 1.25, 0.3); }
  if (!p) { arrow.hidden = true; return; }
  p.project(camera); if (p.z > 1 || Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95) { arrow.hidden = true; return; }
  arrow.hidden = false; arrow.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`; arrow.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
}

// ================================================================ GAMEPLAY (Trail, Summit Run, saves, splits)
function snapshot(kind) { // what a save needs to resume this climb later
  const w = W; const at = kind === 'camp' || w.mode === 'trail' ? { kind: 'camp', id: w.camp } : saveSpot(w) || run.lastSpot || { kind: 'camp', id: 0 };
  return { at, camp: w.camp, best: w.best, y: heightOf(w), stats: { ...w.stats }, zones: [...run.zonesSeen] };
}
let persistT = 0;
function persistRun() {
  const w = W; if (!w || w.demo || w.won || AUTOPLAY) return;
  const spot = saveSpot(w); if (spot) run.lastSpot = spot;
  if (w.mode === 'trail') save.trail = snapshot('camp'); else save.summit = snapshot('spot');
  save.bestHeight = Math.max(save.bestHeight, w.best - PHYS.r);
  persist();
}
function enterClimb(w) {
  for (const k of Object.keys(botB)) delete botB[k]; for (const k of Object.keys(guideB)) delete guideB[k];
  W = w; run = { zonesSeen: new Set(), grabsSeen: 0, fallFrom: 0, comeback: 0, whistled: false, bumpHud: null, gustFlap: 0, summitT: 0, lastSpot: null, splitShown: -1 };
  for (const p of pops) p.el.remove(); pops.length = 0;
  for (const p of parts) p.life = 0;
  flowerViews.forEach((v, i) => { v.visible = !save.flowers.includes(M.flowers[i].id); });
  resetRope(); snapCamera(); hudCache = '';
}
function startDemo() { // the menu: the two climbers warm up by the first campfire
  const w = createClimb(M, { mode: 'trail' }); w.demo = true; enterClimb(w); camWant = 0;
}
function startClimb(mode, resume) {
  const s = resume ? (mode === 'trail' ? save.trail : save.summit) : null;
  const w = createClimb(M, { mode, at: s?.at, camp: s?.camp, best: s?.best, stats: s?.stats, flowers: [] });
  enterClimb(w);
  if (s?.zones) for (const z of s.zones) run.zonesSeen.add(z);
  run.zonesSeen.add(zoneAt(M, w.c[0].y));
  if (!resume) { if (mode === 'trail') save.trail = snapshot('camp'); else save.summit = snapshot('spot'); persist(); }
  buildMap(); setState(State.PLAYING); camWant = 1;
  firstSeenSet = new Set(Object.keys(save.tips).filter((k) => save.tips[k]));
  const zi = zoneAt(M, w.c[0].y);
  banner(mode === 'trail' ? zoneName(zi) : t('summitRun'), mode === 'trail' ? (resume ? `${Math.round(heightOf(w))} m` : t('tagline')) : t('tipSummitRun'));
  if (!resume || !save.said.intro) { save.said.intro = 1; say('intro', { force: true }); }
  if (!save.tips.first && !resume) { tipQueue.length = 0; tipState = null; queueTip('first'); }
  if (mode === 'summit') queueTip('summitRun');
  playMusic(ASSETS.music[ASSETS.musicByZone[zi]]);
}
function backToCamp() {
  const w = W; if (!w || w.mode !== 'trail' || w.demo) return;
  placeAt(w, { kind: 'camp', id: w.camp }); resetRope(); snapCamera(); playSfx('camp', 0.6);
}
function trackProgress() { // zones, splits, comebacks, music, autosave
  const w = W; if (w.demo) return;
  const zi = zoneAt(M, Math.max(w.c[0].y, w.c[1].y) - 0.5);
  if (!run.zonesSeen.has(zi) && (w.c[0].grip >= 0 || w.c[0].stand || w.c[1].grip >= 0 || w.c[1].stand)) {
    run.zonesSeen.add(zi);
    banner(zoneName(zi), `${Math.round(M.zones[zi].y0)} m`);
    say(ZONES[zi].id === 'meadow' ? 'intro' : ZONES[zi].id, { force: true });
    if (w.mode === 'summit') showSplit(zi);
    playMusic(ASSETS.music[ASSETS.musicByZone[zi]]);
  }
  if (run.comeback && heightOf(w) > run.comeback) { run.comeback = 0; say('back', { chance: 0.8 }); pop(t('bestPop'), w.c[0].x, w.c[0].y + 1.2, 'gold'); }
  if (!w.fall) run.whistled = false;
  else { run.fallFrom = w.fall.from; if (!run.whistled && w.fall.from - Math.max(w.c[0].y, w.c[1].y) > 3) { run.whistled = true; playSfx('fall', 0.8); queueTip('catch'); } }
  persistT += 1 / 60;
  if (persistT > 8) { persistT = 0; persistRun(); }
}
function showSplit(zi) {
  const w = W, tNow = w.stats.time, best = save.splits[zi], el = $('split');
  run.splits = run.splits || []; run.splits[zi] = tNow;
  if (zi === 0) return;
  el.innerHTML = `${zoneName(zi)} <b>${fmt(tNow)}</b>${best ? ` <span class="${tNow <= best ? 'ahead' : 'behind'}">${tNow <= best ? '−' : '+'}${fmt(Math.abs(tNow - best))}</span>` : ''}`;
  el.hidden = false; clearTimeout(showSplit.tm); showSplit.tm = setTimeout(() => { el.hidden = true; }, 5000);
}
function endClimb() { // the summit card
  const w = W, mode = w.mode, time = w.stats.time;
  save.summits++; save.bestHeight = Math.max(save.bestHeight, M.summit.y);
  const key = mode === 'trail' ? 'bestTrail' : 'bestSummit', isBest = !save[key] || time < save[key];
  if (isBest) { save[key] = time; if (mode === 'summit' && run.splits) save.splits = run.splits.slice(); }
  if (mode === 'trail') save.trail = null; else save.summit = null;
  save.totals.falls += w.stats.falls; save.totals.time += time; save.totals.grabs += w.stats.grabs;
  persist();
  setState(State.GAMEOVER);
  $('resTitle').textContent = t('summit'); $('resSub').textContent = `${mode === 'trail' ? t('trail') : t('summitRun')} · ${t('summitSub')}`;
  $('resTime').textContent = fmt(time); $('resFalls').textContent = w.stats.falls; $('resBig').textContent = `${Math.round(w.stats.bigFall)} m`;
  $('resFlowers').textContent = `${save.flowers.length}/${FLOWER_TOTAL}`; $('resGrabs').textContent = w.stats.grabs;
  $('resBest').innerHTML = isBest ? `<span class="new">${t('newBest')}</span>` : `${t('best')} ${fmt(save[key])}`;
  if (save.summits === 1) setTimeout(() => { toast(t('unlocked')); playSfx('unlock'); }, 1200);
}

// ================================================================ LOOP (fixed-step sim, then the view follows it)
let last = performance.now(), acc = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
const demoB = {}, botB = {};
function stepWorld(dt) {
  const w = W; if (!w) return;
  if (w.demo) { // menu: they stand by the campfire; one stretches now and then
    step(w, dt, { pull: false, ax: 0, ay: 0 }); handleEvents(); return;
  }
  if (state !== State.PLAYING) return;
  const ctl = AUTOPLAY ? botControl(w, botB) : playerControl();
  step(w, dt, ctl);
  handleEvents();
  trackProgress();
  if (run.summitT > 0) { run.summitT -= dt; if (run.summitT <= 0 && !AUTOPLAY) endClimb(); }
}
function cameraGoal(outPos, outLook) {
  const w = W, aspect = innerWidth / innerHeight, far = aspect < 1 ? 1.75 : aspect < 1.4 ? 1.2 : 1;
  const k = clamp(camBlend, 0, 1), e = k * k * (3 - 2 * k);
  const a = w.c[w.act], o = w.c[1 - w.act];
  const fx = a.x * 0.6 + o.x * 0.4, fy = Math.max(a.y, o.y) * 0.55 + Math.min(a.y, o.y) * 0.45;
  // gameplay: straight on, a little above the pair
  const gl = _cl.set(clamp(fx, -4, 4) * 0.8, fy + CFG.camLead, 0), gp = _cp.set(gl.x, gl.y - CFG.camBelow, CFG.camZ * far);
  // menu: closer, low, with the climbers to the right of the title column
  const side = aspect > 1.1 ? -3.4 : 0, ml = new THREE.Vector3(o.x + side + Math.sin(clock * 0.08) * 0.4, o.y + (aspect > 1.1 ? 2.2 : -0.6), 0);
  const mp = new THREE.Vector3(ml.x + 2.5, ml.y + 1.4, 11.5 * far);
  outPos.lerpVectors(mp, gp, e); outLook.lerpVectors(ml, gl, e);
}
function snapCamera() { if (W) cameraGoal(camPos, camLook); }
function advance(dt) {
  camBlend += (camWant - camBlend) * (1 - Math.exp(-dt * 2.2));
  if (state !== State.PAUSED) { acc += dt; while (acc >= STEP) { stepWorld(STEP); clock += STEP; acc -= STEP; } }
  updateParticles(dt); if (state === State.PLAYING) updateTips(dt);
  subTimer -= dt; if (subTimer <= 0 && !$('sub').hidden) $('sub').hidden = true;
  updateMusic(dt);
}
const _gp = new THREE.Vector3(), _gl = new THREE.Vector3();
function render(dt) {
  if (!W) return;
  const w = W;
  cameraGoal(_gp, _gl);
  const fast = Math.max(Math.abs(w.c[0].vy), Math.abs(w.c[1].vy)), k = 1 - Math.exp(-dt * (fast > 12 ? 9 : 3.2));
  camPos.lerp(_gp, k); camLook.lerp(_gl, k);
  camera.position.copy(camPos);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.2);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook);
  sun.target.position.set(camLook.x, camLook.y, 0); sun.position.set(camLook.x - 5, camLook.y + 11, 26);
  applySky(camLook.y);
  syncView(dt);
  renderer.render(scene, camera);
  if (!SIMMING) { updateHud(); updatePops(dt); if (state === State.PLAYING) placeArrow(); }
}
function syncView(dt) {
  const w = W, tNow = clock;
  // climbers
  const a = w.c[w.act];
  w.c.forEach((c, i) => {
    let reach = null;
    if (c.grip >= 0) reach = holdPos(w, M.holds[c.grip], _tp);
    else if (c === a && (AUTOPLAY ? !c.stand : input.down || (input.mode === 'keys' && keyDir())) && state === State.PLAYING && !w.demo) reach = AUTOPLAY ? null : input.mode === 'keys' ? (() => { const kd = keyDir(); return { x: c.x + kd[0] * 2, y: c.y + kd[1] * 2 }; })() : aimWorld();
    poseClimber(climbers[i], c, reach ? { x: reach.x, y: reach.y } : null, tNow, dt, { worried: c.grip >= 0 && c.st < 0.35 });
  });
  // stamina ring above whoever grips (not on golden rings)
  const g = w.c.find((c) => c.grip >= 0 && HOLDS[M.holds[c.grip].type].drain > 0 && c.st < 0.995);
  stamRing.visible = !!g && !w.demo;
  if (g) { stamRing.position.set(g.x, g.y + 1.05, 0.9); setStamina(stamRing, g.st); stamRing.scale.setScalar(g.st < 0.3 ? 1 + Math.sin(tNow * 18) * 0.12 : 1); }
  stepRope(dt);
  // holds: hooks ride their cables, crumbling ones shake, broken ones vanish and regrow
  for (let i = 0; i < holdViews.length; i++) {
    const v = holdViews[i]; if (!v) continue; const h = M.holds[i];
    if (Math.abs(h.y - camLook.y) > 22) continue;
    if (h.move) { const p = holdPos(w, h, _tp); v.position.set(p.x, p.y, -0.2); }
    const br = w.broken[i];
    if (br > 0) v.scale.setScalar(br < 0.5 ? 1 - br * 2 : 0.001); else v.scale.setScalar(1);
    if (h.type === 'crumble') { const c = w.c.find((q) => q.grip === i); v.userData.body.position.x = c ? Math.sin(tNow * 50) * 0.03 * (c.crumble / PHYS.crumbleT) * 2 : 0; if (c && Math.random() < 0.15) emit(h.x, h.y - 0.15, 0.1, 1, { color: '#e2a75e', speed: 0.4, g: 10, life: 0.7, size: 0.07 }); }
    if (h.type === 'ice' || h.type === 'piton') v.userData.body.rotation.y = Math.sin(tNow * 1.5 + i) * 0.3;
  }
  // campfires (lit once reached), flowers bob, the summit flag waves
  campViews.forEach((v, i) => {
    if (Math.abs(M.camps[i].y - camLook.y) > 24) return;
    const lit = w.demo ? i === 0 : save.litCamps.includes(i) || w.camp === i;
    v.userData.flame.visible = lit; v.userData.glow.visible = lit;
    if (lit) { const f = 1 + Math.sin(tNow * 13 + i) * 0.1 + Math.sin(tNow * 23) * 0.06; v.userData.flame.scale.set(1, f, 1); v.userData.glow.material.opacity = 0.2 + Math.sin(tNow * 9 + i) * 0.05; if (Math.random() < dt * 4) emit(M.camps[i].x, M.camps[i].y + 0.5, 0.35, 1, { color: '#ffb35c', speed: 0.3, vy: 1.4, life: 1, size: 0.06 }); }
    v.userData.flag.rotation.y = Math.sin(tNow * 3 + i) * 0.3;
  });
  flowerViews.forEach((v, i) => { if (!v.visible) return; v.position.y = M.flowers[i].y + Math.sin(tNow * 2 + i) * 0.06; v.rotation.z = tNow * 0.6 + i; v.userData.halo.material.opacity = 0.35 + Math.sin(tNow * 4 + i) * 0.2; });
  const fp = summitView.userData.flag.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i); fp.setZ(i, Math.sin(x * 3 - tNow * 6) * 0.12 * x); }
  fp.needsUpdate = true;
  // dressing: waterfall flows, bunting snaps in gusts, lanterns flicker, clouds drift
  if (dressing.anim.waterfall) dressing.anim.waterfall.offset.y = (tNow * 1.2) % 1;
  run.gustFlap = Math.max(0, (run.gustFlap || 0) - dt);
  dressing.anim.bunting.forEach((flags, j) => flags.forEach((f, k) => { f.rotation.x = Math.sin(tNow * (run.gustFlap > 0 ? 16 : 3) + k + j) * (run.gustFlap > 0 ? 0.9 : 0.25); }));
  dressing.anim.lanterns.forEach((l, i) => l.scale.setScalar(1 + Math.sin(tNow * 7 + i * 3) * 0.08));
  for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 70) c.position.x = -70; }
  ranges.forEach((r) => { r.position.y = camLook.y * r.userData.k - 10; r.position.x = camLook.x * 0.6; });
  // ambient particles by zone (snow, leaves, spray) and wind streaks
  const zi = zoneAt(M, camLook.y);
  if (!SIMMING) {
    if ((zi >= 4 || zi === 6) && Math.random() < dt * 22) emit(camLook.x + (Math.random() - 0.5) * 26, camLook.y + 9, 1 + Math.random() * 3, 1, { color: '#ffffff', speed: 0.3, vy: -1.2, vx: w.wind * 0.3, life: 7, size: 0.08 });
    if (zi <= 1 && Math.random() < dt * 3) emit(camLook.x + (Math.random() - 0.5) * 24, camLook.y + 7, 1.5, 1, { color: ['#8fd18a', '#f0c690', '#ff8ac2'], speed: 0.4, vy: -0.8, vx: 0.6, life: 7, size: 0.1 });
    if (zi === 2 && Math.random() < dt * 10) { const zf = M.zones[2]; emit(-(zf.width + 1.3) + (Math.random() - 0.5) * 1.5, camLook.y + (Math.random() - 0.5) * 12, 2.6, 1, { color: '#e6f7ff', speed: 0.6, vy: -2, life: 1.2, size: 0.12 }); }
    if (Math.abs(w.wind) > 4 && Math.random() < dt * 30) emit(camLook.x - Math.sign(w.wind) * 13, camLook.y + (Math.random() - 0.5) * 12, 1 + Math.random() * 2, 1, { color: '#ffffff', speed: 0, vx: w.wind * 1.6, life: 0.9, size: 0.05, stretch: 14 });
  }
  // the reach ring (pointer / keys) and the onboarding guide ring
  const pv = state === State.PLAYING && !w.demo && !AUTOPLAY ? grabPreview() : null;
  targetRing.visible = !!pv;
  if (pv) { targetRing.position.set(pv.x, pv.y, 0.1); targetRing.material.color.set(pv.reach ? '#8dff9e' : '#ffffff'); targetRing.scale.setScalar(1 + Math.sin(tNow * 8) * 0.06); }
  const gs = tipState?.key === 'first' && state === State.PLAYING ? guideTarget() : null;
  guideRing.visible = !!gs;
  if (gs) { guideRing.position.set(gs.x, gs.y, 0.12); guideRing.scale.setScalar(1.1 + Math.sin(tNow * 5) * 0.15); }
  // ambience
  const hy = camLook.y;
  setLoop('birds', w.demo || zi === 0 ? 0.35 : zi === 1 ? 0.18 : 0);
  setLoop('wind', clamp(0.06 + hy / 600 + Math.abs(w.wind) / 40, 0, 0.45));
  setLoop('spray', zi === 2 ? 0.22 : 0);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ CAPTURE (press kit: frames, trailer, in-engine covers)
function stageCover(kind) { // a hand-staged moment: one climber on a hold, the other mid-swing to the next, the peak behind
  for (const id of ['hud', 'menu', 'outfits', 'paused', 'confirm', 'results', 'tip', 'arrow', 'banner', 'toast', 'map', 'pops', 'sub', 'btnSwap', 'aimHint', 'split']) $(id).hidden = true;
  state = State.BOOT;
  // a stone hold with open rock around it (no ledge in front of the pair)
  const clearOf = (x, y) => M.segs.every((sg) => sg.kind === 'wall' || sg.kind === 'ground' || Math.hypot((sg.ax + sg.bx) / 2 - x, (sg.ay + sg.by) / 2 - y) > Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) / 2 + 4.5);
  const n0 = M.path.find((n) => n.kind === 'hold' && n.y > (+params.get('coverY') || 60) && M.holds[n.h].type === 'stone' && clearOf(n.x, n.y) && clearOf(n.x, n.y - 2.5));
  const w = createClimb(M, { mode: 'trail', at: { kind: 'hold', h: n0.h, c: 0 } }); w.demo = true; enterClimb(w);
  const h0 = M.holds[n0.h], o = w.c[1], sd = h0.x > 0 ? -1 : 1; // swing out toward the middle of the wall
  Object.assign(o, { x: h0.x + sd * 2.35, y: h0.y - PHYS.hand - 1.5, vx: sd * 4, vy: 2, grip: -1, stand: false });
  // the swinging one reaches for an edelweiss nearby (or the nearest hold above)
  const dist = (p) => Math.hypot(p.x - o.x, p.y - o.y - 0.6), flower = M.flowers.filter((f) => dist(f) < 4).sort((p, q) => dist(p) - dist(q))[0];
  const above = M.live.filter((h) => h !== h0 && h.y > o.y && dist(h) < 2).sort((p, q) => dist(p) - dist(q))[0];
  const n1 = flower || above || { x: o.x + sd * 0.6, y: o.y + 1.2 };
  w.act = 1; resetRope();
  for (let k = 0; k < 120; k++) stepRope(1 / 60);
  const mx = (h0.x + o.x) / 2, my = (h0.y + o.y) / 2 - 0.2, aspect = innerWidth / innerHeight;
  const pc = (params.get('cam') || '').split(',').map(Number), shape = aspect < 0.9 ? 'tall' : aspect < 1.2 ? 'square' : 'wide';
  const base = { wide: [0.9, -1.2, 6.0, 0.3, 46], square: [0.7, -1.3, 7.2, 0.4, 48], tall: [0.6, -1.6, 9.0, 0.6, 50] }[shape];
  const [dx0, dy0, dz0, ly, fov] = pc.length === 3 ? [...pc, +(params.get('look') || base[3]), +(params.get('fov') || base[4])] : base;
  camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix();
  camLook.set(mx, my + ly, 0); camPos.set(mx + dx0, my + dy0, dz0);
  camera.position.copy(camPos); camera.lookAt(camLook);
  const lift = kind === 'keyart' ? 0 : 0.16; // room for the title at the bottom
  if (lift) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * lift, innerWidth, innerHeight); // + moves the pair up
  sun.target.position.set(mx, my, 0); sun.position.set(mx - 5, my + 11, 26);
  applySky(my);
  syncViewStatic();
  targetRing.visible = guideRing.visible = stamRing.visible = false;
  W.c.forEach((c, k) => { for (let s = 0; s < 30; s++) poseClimber(climbers[k], c, k === 0 ? holdPos(w, h0) : { x: n1.x, y: n1.y }, 1.3 + s / 30, 1 / 30, {}); });
  flowerViews.forEach((v) => { v.visible = true; });
  renderer.render(scene, camera);
  camera.clearViewOffset(); camera.fov = CFG.fov; camera.updateProjectionMatrix();
}
function syncViewStatic() { // dressing without re-posing the climbers (cover staging)
  ranges.forEach((r) => { r.position.y = camLook.y * r.userData.k - 10; r.position.x = camLook.x * 0.6; });
  campViews.forEach((v) => { v.userData.flame.visible = true; v.userData.glow.visible = true; });
}
function captureApi() {
  const camp = clamp(params.get('camp') | 0, 0, M.camps.length - 1);
  window.__game = {
    start: () => { startClimb('trail', false); if (camp) { placeAt(W, { kind: 'camp', id: camp }); resetRope(); snapCamera(); } },
    frame: (dt = 1 / 30) => { advance(dt); render(dt); },
    skip: (sec) => { SIMMING = true; for (let s = 0; s < sec; s += STEP) { advance(STEP); if (W?.won && run.summitT <= 0) startClimb('trail', false); } SIMMING = false; snapCamera(); }, // the camera catches up at once
    sim: (sec) => { SIMMING = true; const end = clock + sec; while (clock < end && state === State.PLAYING && !W.won) advance(STEP); SIMMING = false; snapCamera(); return window.__game.info(); },
    info: () => ({ state, mode: W?.mode, height: W && heightOf(W), best: W?.best, falls: W?.stats.falls, bigFall: W?.stats.bigFall, time: W?.stats.time, zone: W && zoneAt(M, W.c[0].y), won: W?.won, grabs: W?.stats.grabs }),
    cover: (kind) => stageCover(kind),
    summitRun: () => startClimb('summit', false),
    screen: (name) => { if (name === 'summit') { W.stats.time = 4321; W.stats.falls = 37; W.stats.bigFall = 64; W.stats.grabs = 512; endClimb(); } else if (name === 'pause') { setState(State.PAUSED); refreshPause(); } else if (name === 'outfits') openOutfits(); else if (name === 'menu') showMenu(); }, // review
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
  const loads = keysToLoad.map((k) => loadBuffer(ASSETS.sfx[k]).then((b) => { if (b) audio.buffers[k] = b; }).finally(() => { $('loadBar').style.width = `${(100 * ++done) / keysToLoad.length}%`; }));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  const saved = loadData(`${SAVE_KEY}:save`, null);
  if (saved && typeof saved === 'object') save = { ...structuredClone(DEFAULT_SAVE), ...saved, totals: { ...DEFAULT_SAVE.totals, ...(saved.totals || {}) } };
  if (CAPTURE) { save = structuredClone(DEFAULT_SAVE); save.voice = false; }
  document.body.classList.toggle('touch', isTouch);
  resize(); applyOutfit(); startDemo();
  setState(State.MENU, 'menu'); refreshMenu(); camBlend = 0; snapCamera();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  if (!CAPTURE) {
    playMusic(ASSETS.music[0]);
    for (const k of VOICE_LINES) loadBuffer(`assets/audio/voice/tp_vo_${k}_${lang}.mp3`).then((b) => { if (b) audio.voices[k] = b; }); // the narrator loads after the menu is up
  }
  if (CAPTURE) { captureApi(); render(0); } // capture protocol (tools/capture.mjs): no rAF loop, the tool drives every frame
  else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
