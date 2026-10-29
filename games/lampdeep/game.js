// Lampdeep: a turn-based descent through forty dark floors with one little lamp. Sections: CONFIG, I18N, SDK, AUDIO, ICONS,
// SCENE, FLOOR VIEW, UNITS, FX, INPUT, STATE, UI, TIPS, GAMEPLAY, LOOP, CAPTURE, BOOT.
// The rules live in deep.js (pure, shared with the Node balance bots); this file only draws them and reacts to their events.
// No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';
import * as D from './deep.js';

// ================================================================ CONFIG
const SAVE_KEY = 'lampdeep';
const STEP = 1 / 60; // fixed simulation step: identical timing at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // the bot descends by itself (trailer footage, balance checks)
const CFG = {
  phase: 0.17,       // seconds between a turn's phases: your move, shadow strikes, shadow moves
  botEvery: 0.62,    // autoplay: seconds per bot turn
  fov: 36,
  lowOil: 2,
  creepWarn: 10,     // warn this many turns before the dark starts eating oil
  tipSeconds: 7,
};
const ASSETS = {
  sfx: {
    step: 'assets/audio/footstep.mp3', bump: 'assets/audio/club.mp3', hurt: 'assets/audio/hit.mp3', slam: 'assets/audio/wool_bale.mp3', fall: 'assets/audio/whirl_ringout.mp3',
    die: 'assets/audio/enemy_dissolve.mp3', ember: 'assets/audio/ember_pick.mp3', flare: 'assets/audio/kite_lantern.mp3', leap: 'assets/audio/dodge_roll.mp3',
    brazier: 'assets/audio/tp_camp.mp3', oil: 'assets/audio/potion_pour.mp3', stairs: 'assets/audio/door_open.mp3', relic: 'assets/audio/relic_get.mp3',
    bossIn: 'assets/audio/boss_bell.mp3', bossDead: 'assets/audio/vow_kept.mp3', boom: 'assets/audio/explosion.mp3', spit: 'assets/audio/spear_thrust.mp3',
    sweep: 'assets/audio/saw_whoosh.mp3', bite: 'assets/audio/sword_swing.mp3', warn: 'assets/audio/rune_tray_warn.mp3', tick: 'assets/audio/dp_tick.mp3',
    out: 'assets/audio/vow_broken.mp3', outTune: 'assets/audio/keel_night_fail.mp3', win: 'assets/audio/victory.mp3', unseal: 'assets/audio/wool_plate.mp3',
    crack: 'assets/audio/tp_crumble.mp3', ward: 'assets/audio/kite_ring.mp3', relit: 'assets/audio/bloom_season.mp3', block: 'assets/audio/swv_blocked.mp3',
    click: 'assets/audio/ui_click.mp3', lit: 'assets/audio/keel_lit.mp3',
  },
  music: { a: 'assets/audio/bgm_bloom_dusk.mp3', b: 'assets/audio/bgm_kite_night.mp3', c: 'assets/audio/bgm_ashen_camp.mp3', d: 'assets/audio/bgm_ashen_tower.mp3', boss: 'assets/audio/bgm_ashen_boss.mp3' },
  voice: 'assets/audio/voice/ld_vo_{key}_{lang}.mp3',
};
const VOICE_LINES = ['intro', 'queen', 'soot', 'king', 'dark', 'boss', 'shrine', 'low', 'creep', 'out1', 'out2', 'pit', 'win'];
const VOL = { // per-sound levels, evened out by ear
  step: 0.35, bump: 0.7, hurt: 0.8, slam: 0.7, fall: 0.55, die: 0.6, ember: 0.45, flare: 0.7, leap: 0.6, brazier: 0.6, oil: 0.6,
  stairs: 0.45, relic: 0.7, bossIn: 0.55, bossDead: 0.7, boom: 0.5, spit: 0.45, sweep: 0.45, bite: 0.4, warn: 0.35, tick: 0.5,
  out: 0.7, outTune: 0.5, win: 0.6, unseal: 0.6, crack: 0.55, ward: 0.6, relit: 0.6, block: 0.7, click: 0.5, lit: 0.5,
};
const MUSIC_VOL = 0.32;

// ================================================================ I18N (English required; Turkish too)
const STRINGS = {
  en: {
    depth: 'Depth', flare: 'Flare', leap: 'Leap', wait: 'Wait', space: 'Space', skipTips: 'Skip tips',
    tagline: 'Forty floors down. One little lamp.', descend: 'Descend', cont: 'Continue', contSub: 'Depth {d} · {lantern}',
    newRun: 'New run', daily: 'Daily depth', setup: 'Lantern & seed', setupTitle: 'Choose your lantern', startAt: 'Start at',
    seed: 'Seed', random: 'Random', seedNote: 'Same seed, same forty floors: race a friend down the same deep.', back: 'Back',
    shrineTitle: 'Shrine of Embers', shrineNote: 'Take one relic. It stays with you for the whole run.',
    buyOil: '+1 oil · {n}', reroll: 'New relics · {n}', leave: 'Leave', paused: 'Paused', sound: 'Sound', voice: 'Keeper', tips: 'Tips',
    resume: 'Resume', saveQuit: 'Save & menu', again: 'Descend again', deeper: 'Keep descending', menu: 'Menu',
    overOut: 'Your lamp went out', overWin: 'The Heart is lit!', killedBy: 'Put out by {who} on depth {d}.',
    winLine: 'You lit the Heart of the Dark in {time}. The deep goes on, if you dare.',
    st_kills: 'Shadows', st_turns: 'Turns', st_time: 'Time', st_pits: 'Into pits', st_embers: 'Embers', st_relics: 'Relics', st_hits: 'Hits taken', st_seed: 'Seed',
    deepest: 'Deepest: {d}', newBest: 'New deepest depth!', statsLine: 'Deepest {d} · Runs {r} · Lit the Heart {w}×',
    statsNew: 'Every shadow telegraphs its strike. Every floor is a little puzzle.',
    wayStart: 'Depth {d}', wayLocked: 'Beat the depth {b} boss', lanternLocked: 'Reach depth {d}', newLantern: 'New lantern: {name}!',
    newWay: 'Waystone {d} unlocked: start later runs there.', adUnavailable: 'Ad not available right now', dailyTag: 'Daily',
    pauseInfo: '{lantern} · seed {seed} · {time}', noRelics: 'No relics yet: shrines wait after depths 3, 6, 9 and every boss.',
    oilPop: '+{n} oil', hurtPop: '-1 oil', blocked: 'Blocked!', ward: 'Ward!', relit: 'Relit!', stunned: 'Stunned!',
    sealed: 'Sealed: light every brazier', bossFirst: 'Beat the boss first', unsealed: 'Stairs open!', creepPop: 'The dark creeps in',
    creepIn: 'The dark in {n}', creepNow: 'The dark eats your oil!', pitPop: 'Into the pit!', bossDown: '{name} falls!',
    zone0: 'The Lantern Cellars', zone1: 'The Ink Wells', zone2: 'The Hollow Halls', zone3: 'The Deep Dark', zone4: 'Below the Heart',
    e_flitter: 'a Flitter', e_wisp: 'a Spitwisp', e_gloom: 'a Gloom', e_crab: 'an Inkcrab', e_pod: 'a Sootpod', e_hound: 'a Duskhound', e_shell: 'a Shellshade',
    e_queen: 'the Moth Queen', e_soot: 'Old Soot', e_king: 'the Gloom King', e_dark: 'the Last Dark', e_creep: 'the creeping dark',
    b_queen: 'The Moth Queen', b_soot: 'Old Soot', b_king: 'The Gloom King', b_dark: 'The Last Dark',
    l_brass: 'Brass Lantern', l_glass: 'Glass Lantern', l_iron: 'Iron Lantern', l_moth: 'Moth Lantern',
    ld_brass: '6 oil, light 2. Steady and honest.', ld_glass: '5 oil, light 3. See every strike coming.',
    ld_iron: '8 oil, light 1. Bumps hit for 2.', ld_moth: '5 oil. Leap every 3 turns, Flare every 5.',
    r_wick: 'Thick Wick', rd_wick: '+1 max oil.', r_glass: 'Wide Glass', rd_glass: '+1 light radius.',
    r_boots: 'Iron Boots', rd_boots: 'Bumps push two tiles.', r_edge: 'Ember Edge', rd_edge: 'Bumps hit for +1.',
    r_flint: 'Quick Flint', rd_flint: 'Flare recharges 2 turns sooner.', r_spring: 'Spring Heels', rd_spring: 'Leap 3 tiles, 1 turn sooner.',
    r_moss: 'Glowmoss', rd_moss: '+1 oil on every new depth.', r_thorns: 'Bramble Coat', rd_thorns: 'Shadows that hit you take 1 damage.',
    r_swing: 'Lantern Swing', rd_swing: 'Bumps also hit both sides.', r_magnet: 'Ember Jar', rd_magnet: '+1 ember per shadow.',
    r_steady: 'Steady Wick', rd_steady: 'The dark creeps in 30 turns later.', r_sparks: 'Spark Flare', rd_sparks: 'Flare also deals 1 damage.',
    r_phoenix: 'Second Flame', rd_phoenix: 'Once per run, an empty lamp relights.', r_lure: 'Oil Lure', rd_lure: 'Oil puddles give 2.',
    r_kin: 'Brazier Kin', rd_kin: 'Lighting a brazier refills 1 oil.', r_ward: 'Moth Ward', rd_ward: 'Blocks the first hit on every depth.',
    t_move: 'Move one tile per turn: arrow keys, WASD, or click a tile.', t_moveTouch: 'Tap a tile to walk one step toward it.',
    t_strike: 'Red tiles get hit after your next move. Step off them!', t_bump: 'Walk into a shadow to hit it and knock it back.',
    t_pit: 'Knock shadows into pits. They never come back.', t_stairs: 'The glowing stairs lead down. Take them when you are ready.',
    t_flare: 'Flare stuns every shadow in your light for a turn.', t_leap: 'Leap two tiles over anything: press E, then a direction.',
    t_leapTouch: 'Leap two tiles over anything: tap Leap, then a glowing tile.',
    t_hidden: 'A ! is a shadow aiming from the dark. Only light shows where.', t_wisp: 'Spitwisps spit down a whole line. Step aside, or get close.',
    t_gloom: 'Glooms only move in the dark. Keep them in your light.', t_crab: 'Inkcrabs strike all four sides, then rest a turn.',
    t_pod: 'Sootpods burst three turns after they wake. Knock them into shadows!', t_hound: 'Duskhounds run two tiles a turn.',
    t_shell: 'Shellshades block hits from the front. Hit their side, or slam them into a wall.',
    t_brazier: 'Walk into a brazier to light it. Its light stays for the whole floor.', t_oil: 'Oil is your light and your life. Grab it!',
    t_crack: 'Cracked floor falls away once you step off it.', t_sealed: 'Sealed stairs: light every brazier to open them.',
    t_creep: 'Don\'t linger: the dark starts eating your oil.', t_boss: 'A boss! Beat it to open the stairs. It rests after each strike.',
    t_shrine: 'Pick a relic. Embers buy oil here too.',
    vo_intro: 'Forty floors down, one little lamp. Mind the dark.', vo_queen: 'The Moth Queen. She loves a bright lamp.',
    vo_soot: 'Old Soot. Mind his pods.', vo_king: 'The Gloom King. Keep him in your light.', vo_dark: 'The Last Dark. Everything you learned, now.',
    vo_boss: 'Ha! The dark is a little smaller now.', vo_shrine: 'A shrine. Take what helps you most.', vo_low: 'Your lamp is flickering. Find oil.',
    vo_creep: 'The dark is creeping in. Keep moving.', vo_out1: 'Your lamp went out. Light it again.', vo_out2: 'Every lamplighter falls once or twice.',
    vo_pit: 'Into the pit with you!', vo_win: 'You reached the Heart, and lit it. Well done, lamplighter.',
  },
  tr: {
    depth: 'Kat', flare: 'Parlama', leap: 'Sıçra', wait: 'Bekle', space: 'Boşluk', skipTips: 'İpuçlarını geç',
    tagline: 'Kırk kat aşağı. Tek bir küçük fener.', descend: 'Aşağı in', cont: 'Devam', contSub: '{d}. kat · {lantern}',
    newRun: 'Yeni oyun', daily: 'Günün derinliği', setup: 'Fener ve tohum', setupTitle: 'Fenerini seç', startAt: 'Başlangıç',
    seed: 'Tohum', random: 'Rastgele', seedNote: 'Aynı tohum, aynı kırk kat: bir arkadaşınla aynı derinlikte yarış.', back: 'Geri',
    shrineTitle: 'Kor Sunağı', shrineNote: 'Bir kalıntı al. Oyun boyunca seninle kalır.',
    buyOil: '+1 yağ · {n}', reroll: 'Yeni kalıntılar · {n}', leave: 'Ayrıl', paused: 'Duraklatıldı', sound: 'Ses', voice: 'Bekçi', tips: 'İpuçları',
    resume: 'Devam', saveQuit: 'Kaydet ve menü', again: 'Yeniden in', deeper: 'İnmeye devam', menu: 'Menü',
    overOut: 'Fenerin söndü', overWin: 'Kalp yandı!', killedBy: '{d}. katta {who} söndürdü.',
    winLine: 'Karanlığın Kalbi\'ni {time} içinde yaktın. Cesaretin varsa derinlik sürüyor.',
    st_kills: 'Gölge', st_turns: 'Tur', st_time: 'Süre', st_pits: 'Çukura', st_embers: 'Kor', st_relics: 'Kalıntı', st_hits: 'Alınan darbe', st_seed: 'Tohum',
    deepest: 'En derin: {d}', newBest: 'Yeni en derin kat!', statsLine: 'En derin {d} · Oyun {r} · Kalbi yakma {w}×',
    statsNew: 'Her gölge vuruşunu önceden gösterir. Her kat küçük bir bulmaca.',
    wayStart: '{d}. kat', wayLocked: '{b}. kat patronunu yen', lanternLocked: '{d}. kata ulaş', newLantern: 'Yeni fener: {name}!',
    newWay: '{d}. kat yol taşı açıldı: sonraki oyunlara oradan başlayabilirsin.', adUnavailable: 'Şu anda reklam yok', dailyTag: 'Günlük',
    pauseInfo: '{lantern} · tohum {seed} · {time}', noRelics: 'Henüz kalıntı yok: sunaklar 3, 6, 9. katlardan ve her patrondan sonra.',
    oilPop: '+{n} yağ', hurtPop: '-1 yağ', blocked: 'Engellendi!', ward: 'Muska!', relit: 'Yeniden yandı!', stunned: 'Sersem!',
    sealed: 'Mühürlü: tüm mangalları yak', bossFirst: 'Önce patronu yen', unsealed: 'Merdiven açıldı!', creepPop: 'Karanlık yaklaşıyor',
    creepIn: 'Karanlık {n} tur sonra', creepNow: 'Karanlık yağını yiyor!', pitPop: 'Çukura!', bossDown: '{name} düştü!',
    zone0: 'Fener Mahzenleri', zone1: 'Mürekkep Kuyuları', zone2: 'Kof Salonlar', zone3: 'Derin Karanlık', zone4: 'Kalbin Altı',
    e_flitter: 'bir Pırpır', e_wisp: 'bir Tükürükçü', e_gloom: 'bir Kasvet', e_crab: 'bir Mürekkep Yengeci', e_pod: 'bir İs Tohumu', e_hound: 'bir Alacakaranlık Tazısı', e_shell: 'bir Kabuk Gölge',
    e_queen: 'Güve Kraliçesi', e_soot: 'Yaşlı İs', e_king: 'Kasvet Kralı', e_dark: 'Son Karanlık', e_creep: 'yaklaşan karanlık',
    b_queen: 'Güve Kraliçesi', b_soot: 'Yaşlı İs', b_king: 'Kasvet Kralı', b_dark: 'Son Karanlık',
    l_brass: 'Pirinç Fener', l_glass: 'Cam Fener', l_iron: 'Demir Fener', l_moth: 'Güve Feneri',
    ld_brass: '6 yağ, 2 ışık. Sağlam ve dürüst.', ld_glass: '5 yağ, 3 ışık. Her vuruşu önceden gör.',
    ld_iron: '8 yağ, 1 ışık. Vuruşlar 2 hasar.', ld_moth: '5 yağ. 3 turda bir sıçra, 5 turda bir parla.',
    r_wick: 'Kalın Fitil', rd_wick: '+1 en fazla yağ.', r_glass: 'Geniş Cam', rd_glass: '+1 ışık menzili.',
    r_boots: 'Demir Çizme', rd_boots: 'Vuruşlar iki kare iter.', r_edge: 'Kor Ağzı', rd_edge: 'Vuruşlar +1 hasar verir.',
    r_flint: 'Çabuk Çakmak', rd_flint: 'Parlama 2 tur erken dolar.', r_spring: 'Yaylı Topuk', rd_spring: '3 kare sıçra, 1 tur erken dolar.',
    r_moss: 'Işıltı Yosunu', rd_moss: 'Her yeni katta +1 yağ.', r_thorns: 'Diken Pelerin', rd_thorns: 'Sana vuran gölge 1 hasar alır.',
    r_swing: 'Fener Savuruşu', rd_swing: 'Vuruşlar iki yana da değer.', r_magnet: 'Kor Kavanozu', rd_magnet: 'Gölge başına +1 kor.',
    r_steady: 'Sabit Fitil', rd_steady: 'Karanlık 30 tur daha geç gelir.', r_sparks: 'Kıvılcım Parlaması', rd_sparks: 'Parlama 1 hasar da verir.',
    r_phoenix: 'İkinci Alev', rd_phoenix: 'Oyunda bir kez, sönen fener yeniden yanar.', r_lure: 'Yağ Yemi', rd_lure: 'Yağ birikintileri 2 verir.',
    r_kin: 'Mangal Dostu', rd_kin: 'Mangal yakmak 1 yağ doldurur.', r_ward: 'Güve Muskası', rd_ward: 'Her kattaki ilk darbeyi engeller.',
    t_move: 'Her tur bir kare yürü: ok tuşları, WASD ya da bir kareye tıkla.', t_moveTouch: 'Bir kareye dokun, ona doğru bir adım at.',
    t_strike: 'Kırmızı kareler bir sonraki hamlenden sonra vurulur. Çekil!', t_bump: 'Gölgeye doğru yürü: vurur ve geri itersin.',
    t_pit: 'Gölgeleri çukura it. Bir daha dönmezler.', t_stairs: 'Parlayan merdiven aşağı iner. Hazır olunca in.',
    t_flare: 'Parlama, ışığındaki tüm gölgeleri bir tur sersemletir.', t_leap: 'Her şeyin üstünden iki kare sıçra: E, sonra bir yön.',
    t_leapTouch: 'Her şeyin üstünden iki kare sıçra: Sıçra\'ya, sonra parlayan kareye dokun.',
    t_hidden: '! karanlıktan nişan alan bir gölgedir. Nereye vuracağını yalnız ışık gösterir.', t_wisp: 'Tükürükçüler bütün bir sıraya tükürür. Yana çekil ya da yaklaş.',
    t_gloom: 'Kasvetler yalnız karanlıkta hareket eder. Onları ışığında tut.', t_crab: 'Mürekkep yengeçleri dört yana vurur, sonra bir tur dinlenir.',
    t_pod: 'İs tohumları uyandıktan üç tur sonra patlar. Onları gölgelere it!', t_hound: 'Alacakaranlık tazıları her tur iki kare koşar.',
    t_shell: 'Kabuk gölgeler önden gelen vuruşu engeller. Yandan vur ya da duvara çarp.',
    t_brazier: 'Yakmak için mangala doğru yürü. Işığı kat boyunca kalır.', t_oil: 'Yağ hem ışığın hem canın. Al onu!',
    t_crack: 'Çatlak zemin, üstünden çekilince çöker.', t_sealed: 'Mühürlü merdiven: açmak için tüm mangalları yak.',
    t_creep: 'Oyalanma: karanlık yağını yemeye başlar.', t_boss: 'Patron! Merdiveni açmak için onu yen. Her vuruştan sonra dinlenir.',
    t_shrine: 'Bir kalıntı seç. Burada korlarla yağ da alınır.',
    vo_intro: 'Kırk kat aşağı, tek bir küçük fener. Karanlığa dikkat.', vo_queen: 'Güve Kraliçesi. Parlak fenerlere bayılır.',
    vo_soot: 'Yaşlı İs. Tohumlarına dikkat.', vo_king: 'Kasvet Kralı. Onu ışığında tut.', vo_dark: 'Son Karanlık. Öğrendiğin her şey, şimdi.',
    vo_boss: 'Ha! Karanlık artık biraz daha küçük.', vo_shrine: 'Bir sunak. En çok işine yarayanı al.', vo_low: 'Fenerin titriyor. Yağ bul.',
    vo_creep: 'Karanlık yaklaşıyor. İlerle.', vo_out1: 'Fenerin söndü. Yeniden yak.', vo_out2: 'Her fenerci bir iki kez düşer.',
    vo_pit: 'Doğru çukura!', vo_win: 'Kalbe ulaştın ve onu yaktın. Aferin, fenerci.',
  },
};
let lang = 'en';
const t = (k, vars) => { let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }
const fmt = (s) => { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const zoneOf = (d) => (d > D.CFG.depths ? 4 : Math.min(3, Math.floor((d - 1) / 10)));

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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a boss falls, the Heart is lit, a new deepest depth

// Midgame: only between runs, never on navigation buttons. Mute on adStarted (not on request); always continue.
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

// ================================================================ AUDIO (Web Audio SFX + synthesized fallbacks, HTML5 music, the Keeper's voice)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  step: ['triangle', 180, 120, 0.06, 0.08], bump: ['square', 220, 90, 0.12, 0.12], hurt: ['sawtooth', 300, 80, 0.3, 0.16],
  die: ['sine', 500, 90, 0.3, 0.12], ember: ['square', 1400, 2000, 0.08, 0.06], flare: ['sine', 300, 1600, 0.4, 0.14],
  click: ['square', 900, 900, 0.03, 0.06], boom: ['sawtooth', 120, 40, 0.5, 0.2], warn: ['triangle', 660, 520, 0.2, 0.08],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicUrl: '', wantMusic: false, muted: new Set(), playing: 0, vo: null, voT: 0, voiceOn: true };

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
  if (SIMMING || audio.muted.size || !audio.ctx || audio.playing > 14) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime, v = vol * (VOL[key] ?? 0.6);
  g.connect(audio.master); audio.playing++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.95 + Math.random() * 0.1); g.gain.value = v;
    s.connect(g); s.onended = () => audio.playing--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.playing--; o.start(now); o.stop(now + dur);
}
function playMusic(url) {
  audio.wantMusic = true;
  if (url && url !== audio.musicUrl) {
    if (audio.music) fadeOut(audio.music);
    audio.musicUrl = url; audio.music = new Audio(url); audio.music.loop = true; audio.music.volume = 0;
    audio.music.onerror = () => { audio.music = null; };
  }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function fadeOut(m) { let v = m.volume; const id = setInterval(() => { v -= 0.03; if (v <= 0) { clearInterval(id); m.pause(); } else m.volume = v; }, 50); }
function updateMusic(dt) { // ease the volume in, ducked under the Keeper
  if (!audio.music) return;
  const want = MUSIC_VOL * (audio.voT > 0 ? 0.45 : 1);
  audio.music.volume = Math.max(0, Math.min(1, audio.music.volume + Math.sign(want - audio.music.volume) * Math.min(Math.abs(want - audio.music.volume), dt * 0.4)));
  audio.voT = Math.max(0, audio.voT - dt);
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
  if (m && audio.vo) audio.vo.pause();
}
let subTimer = 0;
function say(key, chance = 1) { // the Keeper: one line at a time, subtitled, never over another line
  if (SIMMING || (audio.vo && !audio.vo.paused && !audio.vo.ended) || Math.random() > chance) return;
  showSub(t(`vo_${key}`), 3.2);
  if (!audio.voiceOn || audio.muted.size) return;
  const v = new Audio(ASSETS.voice.replace('{key}', key).replace('{lang}', lang === 'tr' ? 'tr' : 'en'));
  v.volume = 0.95; audio.vo = v; audio.voT = 3.2; v.play().catch(() => {});
}
function showSub(text, secs) { if (SIMMING) return; const el = $('sub'); el.textContent = text; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; subTimer = secs; }

// ================================================================ ICONS (inline SVG; flat, outlined, one palette)
const S = (body) => `<svg viewBox="0 0 24 24" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const OUT = 'stroke="#2a1d10" stroke-width="1.4"';
const ICONS = {
  flame: S(`<path d="M12 2.5c3 3.8 6.2 6.8 6.2 11a6.2 6.2 0 0 1-12.4 0c0-3 1.7-5 3-7 .9 1.8 1.9 2.8 3 2.8 0-2.6-.8-4.6.2-6.8z" fill="#ffc45c" ${OUT}/><path d="M12 12.2c1.4 1.4 2.4 2.8 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.5 1-2.9 2.4-4.3z" fill="#fff1c0"/>`),
  flameOff: S('<path d="M12 2.5c3 3.8 6.2 6.8 6.2 11a6.2 6.2 0 0 1-12.4 0c0-3 1.7-5 3-7 .9 1.8 1.9 2.8 3 2.8 0-2.6-.8-4.6.2-6.8z" fill="#2a2140" stroke="#6b5a92" stroke-width="1.4"/>'),
  ember: S(`<path d="M12 2.5l6 9.5-6 9.5-6-9.5z" fill="#ff9a3c" ${OUT}/><path d="M12 7l3 5-3 5-3-5z" fill="#ffe08a"/>`),
  clock: S('<circle cx="12" cy="12" r="8.5" fill="#3a2f5c" stroke="#fff1d6" stroke-width="1.8"/><path d="M12 7v5l3.5 2" fill="none" stroke="#fff1d6" stroke-width="1.8"/>'),
  moon: S('<path d="M15 3.5a8.5 8.5 0 1 0 5.5 13A7 7 0 0 1 15 3.5z" fill="#c9b4ff" stroke="#2a1d40" stroke-width="1.4"/>'),
  flare: S(`<g stroke="#ffe08a" stroke-width="2">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M12 12L${(12 + Math.cos((a * Math.PI) / 180) * 10.5).toFixed(1)} ${(12 + Math.sin((a * Math.PI) / 180) * 10.5).toFixed(1)}"/>`).join('')}</g><circle cx="12" cy="12" r="5" fill="#fff6d0" ${OUT}/>`),
  leap: S('<path d="M3.5 19c2-9 9.5-13 15.5-9" fill="none" stroke="#5fe0c8" stroke-width="2.4" stroke-dasharray="2.6 2.2"/><path d="M15.5 6.5l4.5 3.6-5 2.6z" fill="#5fe0c8" stroke="#123b40" stroke-width="1.2"/><circle cx="4.5" cy="19.5" r="2" fill="#fff1d6"/>'),
  wait: S(`<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="#fff1d6" stroke-width="1.8"/><path d="M9.5 18.5h5l-2.5-2.5z" fill="#ffc45c"/>`),
  lamp: S(`<path d="M9 3.5h6M12 3.5v2" stroke="#fff1d6" stroke-width="1.6"/><rect x="7" y="5.5" width="10" height="13" rx="2.5" fill="#ffc45c" ${OUT}/><path d="M9 21h6" stroke="#fff1d6" stroke-width="2"/><path d="M12 9c1.6 1.6 2.4 2.8 2.4 4.2a2.4 2.4 0 0 1-4.8 0C9.6 11.8 10.4 10.6 12 9z" fill="#fff6d0"/>`),
  sun: S(`<g stroke="#ffc45c" stroke-width="2">${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M${(12 + Math.cos((a * Math.PI) / 180) * 7.5).toFixed(1)} ${(12 + Math.sin((a * Math.PI) / 180) * 7.5).toFixed(1)}L${(12 + Math.cos((a * Math.PI) / 180) * 10.5).toFixed(1)} ${(12 + Math.sin((a * Math.PI) / 180) * 10.5).toFixed(1)}"/>`).join('')}</g><circle cx="12" cy="12" r="4.8" fill="#ffe08a" ${OUT}/>`),
  gear: S('<circle cx="12" cy="12" r="7" fill="#b9a8e8" stroke="#2a1d40" stroke-width="1.4" stroke-dasharray="3.1 2.4" /><circle cx="12" cy="12" r="5.2" fill="#b9a8e8" stroke="#2a1d40" stroke-width="1.4"/><circle cx="12" cy="12" r="2" fill="#2a1d40"/>'),
  oil: S(`<path d="M12 3c3.5 5 6 8 6 11.5a6 6 0 0 1-12 0C6 11 8.5 8 12 3z" fill="#ffb347" ${OUT}/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.6" fill="none" stroke="#fff1c0" stroke-width="1.6"/>`),
  sound: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff1d6" stroke="#2a1d40" stroke-width="1.2"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#fff1d6" stroke-width="1.8"/>'),
  voice: S('<path d="M4 5.5h16v10H11l-4.5 3.5v-3.5H4z" fill="#fff1d6" stroke="#2a1d40" stroke-width="1.2"/><path d="M8 10.5h8" stroke="#2a1d40" stroke-width="1.6"/>'),
  tip: S('<circle cx="12" cy="10" r="6.5" fill="#ffe08a" stroke="#2a1d10" stroke-width="1.4"/><path d="M9.5 18.5h5M10.5 21h3" stroke="#fff1d6" stroke-width="1.8"/><path d="M12 7v3.5" stroke="#2a1d10" stroke-width="1.8"/><circle cx="12" cy="13" r="1" fill="#2a1d10"/>'),
  crown: S('<path d="M4 17.5l1.5-10 4.5 4.5 2-6 2 6 4.5-4.5 1.5 10z" fill="#c59bff" stroke="#1d1530" stroke-width="1.4"/><path d="M4.5 20h15" stroke="#c59bff" stroke-width="2"/>'),
  me: S(`<circle cx="12" cy="12" r="8.5" fill="#ffc45c" ${OUT}/><path d="M12 7.5c1.8 1.8 2.8 3.2 2.8 4.8a2.8 2.8 0 0 1-5.6 0c0-1.6 1-3 2.8-4.8z" fill="#fff6d0"/>`),
  tap: S('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l5 1.2c1 .3 1.6 1.2 1.4 2.2L17.5 20H10l-3.8-4.6a1.4 1.4 0 0 1 2-2z" fill="#fff1d6" stroke="#2a1d40" stroke-width="1.3"/><circle cx="10.5" cy="5" r="3.8" fill="none" stroke="#ffc45c" stroke-width="1.3"/>'),
  mouse: S('<rect x="6" y="3" width="12" height="18" rx="6" fill="#fff1d6" stroke="#2a1d40" stroke-width="1.3"/><path d="M12 3v7M6 10h12" stroke="#2a1d40" stroke-width="1.3"/><path d="M6.6 9.4V9a5.4 5.4 0 0 1 5.4-5.4V9.4z" fill="#ffc45c"/>'),
  danger: S('<rect x="3" y="3" width="18" height="18" rx="3" fill="rgba(255,80,60,.45)" stroke="#ff5a48" stroke-width="2"/><path d="M7 17L17 7M3.5 13.5l10-10M10.5 20.5l10-10" stroke="#ff8a7a" stroke-width="1.2"/>'),
  bang: S('<circle cx="12" cy="12" r="9" fill="#2a1d40" stroke="#c9b4ff" stroke-width="1.6"/><path d="M12 6.5v7" stroke="#e6c8ff" stroke-width="2.6"/><circle cx="12" cy="17" r="1.5" fill="#e6c8ff"/>'),
  pit: S('<ellipse cx="12" cy="13" rx="9" ry="6" fill="#120c20" stroke="#6b5a92" stroke-width="1.6"/><path d="M12 3v6M9 6l3 3 3-3" fill="none" stroke="#ffc45c" stroke-width="1.8"/>'),
  stairs: S('<path d="M3 20h5v-4h4v-4h4V8h5" fill="none" stroke="#5fe0c8" stroke-width="2.2"/><path d="M3 20h18V8" fill="rgba(95,224,200,.25)"/>'),
  crack: S('<rect x="3" y="3" width="18" height="18" rx="3" fill="#7a6a5c" stroke="#2a1d10" stroke-width="1.3"/><path d="M8 3l2 6-3 4 4 3-1 5M14 9l4 1M11 9l3 0" fill="none" stroke="#2a1d10" stroke-width="1.5"/>'),
  seal: S('<circle cx="12" cy="12" r="8.5" fill="#3a2f5c" stroke="#c59bff" stroke-width="1.8"/><path d="M12 6l1.8 4 4.2.4-3.2 2.9 1 4.2L12 15.3 8.2 17.5l1-4.2L6 10.4l4.2-.4z" fill="#c59bff"/>'),
};
const EYE = { flitter: '#ffe066', wisp: '#7ff3ff', gloom: '#c59bff', crab: '#ff7a5a', pod: '#ffa040', hound: '#ff6fd8', shell: '#9dffb0', queen: '#ffe066', soot: '#ffa040', king: '#c59bff', dark: '#ff4a4a' };
function shadeIcon(type) { // a little shadow with that type's eye colour
  const c = EYE[type] || '#fff';
  return S(`<path d="M4 20c0-8 3.5-14 8-14s8 6 8 14c-1.3-1-2.6-1-4 0-1.3-1-2.7-1-4 0-1.3-1-2.7-1-4 0-1.4-1-2.7-1-4 0z" fill="#241a3a" stroke="#6b5a92" stroke-width="1.3"/><ellipse cx="9.5" cy="12" rx="1.6" ry="2.1" fill="${c}"/><ellipse cx="14.5" cy="12" rx="1.6" ry="2.1" fill="${c}"/>`);
}
const RELIC_ICONS = {
  wick: S(`<rect x="8" y="10" width="8" height="11" rx="1.5" fill="#fff1d6" ${OUT}/><path d="M12 10V7.5" stroke="#2a1d10" stroke-width="1.4"/><path d="M12 2.5c1.6 1.8 2.4 3 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-4.2z" fill="#ffc45c" ${OUT}/>`),
  glass: S(`<circle cx="12" cy="12" r="8" fill="#bfe9ff" ${OUT}/><circle cx="12" cy="12" r="4.5" fill="#ffe08a"/><path d="M7.5 9a5.5 5.5 0 0 1 3-3" fill="none" stroke="#fff" stroke-width="1.6"/>`),
  boots: S(`<path d="M7 3.5h6v9l6 3v4.5H5v-4l2-1z" fill="#9aa3b2" ${OUT}/><path d="M5 18h14" stroke="#2a1d10" stroke-width="1.4"/>`),
  edge: S(`<path d="M18.5 3.5L9 13l2 2 9.5-9.5z" fill="#ffc45c" ${OUT}/><path d="M8 12l4 4-2 2-4-4zM6.5 17.5L4 20" fill="#8a5a2a" ${OUT}/>`),
  flint: S(`<path d="M13 2.5L6 13h5l-1 8.5 8-11.5h-5z" fill="#ffe08a" ${OUT}/>`),
  spring: S(`<path d="M6 20h12M7 17c10 0 10-3 0-3s-10-3 0-3 10-3 0-3" fill="none" stroke="#5fe0c8" stroke-width="2"/><path d="M6 5h12" stroke="#fff1d6" stroke-width="2"/>`),
  moss: S(`<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" fill="#7fe08a" ${OUT}/><path d="M5 19l8-8" stroke="#2a5a30" stroke-width="1.5"/>`),
  thorns: S(`<path d="M3 15h18M6 15l1.5-5L9 15M11 15l1.5-6 1.5 6M16 15l1.5-5 1.5 5M8 15l-1 4M15 15l1 4" fill="none" stroke="#7fe08a" stroke-width="1.8"/>`),
  swing: S(`<path d="M4 15a9 9 0 0 1 16 0" fill="none" stroke="#ffc45c" stroke-width="2.4"/><path d="M2.5 12.5L4 16l3.5-1.5M21.5 12.5L20 16l-3.5-1.5" fill="none" stroke="#ffc45c" stroke-width="2"/><circle cx="12" cy="17" r="2.6" fill="#fff1d6" ${OUT}/>`),
  magnet: S(`<path d="M6 4v8a6 6 0 0 0 12 0V4h-3.5v8a2.5 2.5 0 0 1-5 0V4z" fill="#ff7a5a" ${OUT}/><path d="M6 4h3.5v3H6zM14.5 4H18v3h-3.5z" fill="#fff1d6"/>`),
  steady: S(`<circle cx="12" cy="13" r="7.5" fill="#3a2f5c" stroke="#fff1d6" stroke-width="1.6"/><path d="M12 9v4l2.5 1.5" stroke="#fff1d6" stroke-width="1.6" fill="none"/><path d="M12 1.5c1.2 1.2 1.8 2.1 1.8 3a1.8 1.8 0 0 1-3.6 0c0-.9.6-1.8 1.8-3z" fill="#ffc45c"/>`),
  sparks: S(`<path d="M12 3l1.6 5.4L19 7l-3.6 4.2L20 15l-5.6-.6L12 21l-2.4-6.6L4 15l4.6-3.8L5 7l5.4 1.4z" fill="#ffe08a" ${OUT}/>`),
  phoenix: S(`<path d="M18.5 3.5C9 5 5 11 5.5 20.5 12 17 17 12 18.5 3.5z" fill="#ff9a3c" ${OUT}/><path d="M5.5 20.5L14 9" stroke="#7a2d0c" stroke-width="1.4"/>`),
  lure: S(`<path d="M8 3.5h8M9 3.5v3L6.5 10v9.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V10L15 6.5v-3" fill="#bfe9ff" ${OUT}/><path d="M7 13h10v6.5H7z" fill="#ffb347"/>`),
  kin: S(`<path d="M5 11h14l-2 5H7z" fill="#9aa3b2" ${OUT}/><path d="M10 16l-1 5h6l-1-5" fill="#6b5a92" ${OUT}/><path d="M12 2.5c2.5 2.5 3.8 4.4 3.8 6.2a3.8 3.8 0 0 1-7.6 0c0-1.8 1.3-3.7 3.8-6.2z" fill="#ffc45c" ${OUT}/>`),
  ward: S(`<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="#c59bff" ${OUT}/><path d="M12 7c1.6 1.6 2.4 2.8 2.4 4.2a2.4 2.4 0 0 1-4.8 0C9.6 9.8 10.4 8.6 12 7z" fill="#fff6d0"/>`),
};
const LANTERN_COL = { brass: '#ffc45c', glass: '#bfe9ff', iron: '#9aa3b2', moth: '#c59bff' };
const lanternIcon = (id) => S(`<path d="M9 3.5h6M12 3.5v2" stroke="#fff1d6" stroke-width="1.6"/><rect x="7" y="5.5" width="10" height="13" rx="2.5" fill="${LANTERN_COL[id]}" ${OUT}/><path d="M9 21h6" stroke="#fff1d6" stroke-width="2"/><path d="M12 9c1.6 1.6 2.4 2.8 2.4 4.2a2.4 2.4 0 0 1-4.8 0C9.6 11.8 10.4 10.6 12 9z" fill="#fff6d0"/>`);
const fillIcons = (root = document) => root.querySelectorAll('[data-ico]').forEach((el) => { el.innerHTML = ICONS[el.dataset.ico] || ''; });
const ico = (svg, cls = 'ico') => `<i class="${cls}">${svg}</i>`;

// ================================================================ SCENE
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c0a16'); scene.fog = new THREE.Fog('#0c0a16', 14, 30);
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 80);
const hemi = new THREE.HemisphereLight('#7d6cc4', '#160f26', 0.9); scene.add(hemi); // dim moonlit violet: the dark stays readable
const moon = new THREE.DirectionalLight('#9d8fe0', 0.55); moon.position.set(-4, 10, 6); scene.add(moon);
const lampLight = new THREE.PointLight('#ffb35a', 10, 9, 1.4); scene.add(lampLight);
const brazierLights = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ff9a3c', 0, 6, 1.4); scene.add(l); return l; });
const flareLight = new THREE.PointLight('#e8f6ff', 0, 12, 1.2); scene.add(flareLight);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; }
const TEX = {
  glow: canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }),
  danger: canvasTex(128, 128, (g, w) => {
    g.fillStyle = 'rgba(255,70,50,.38)'; roundRect(g, 6, 6, w - 12, w - 12, 18); g.fill();
    g.save(); roundRect(g, 6, 6, w - 12, w - 12, 18); g.clip(); g.strokeStyle = 'rgba(255,140,120,.55)'; g.lineWidth = 7;
    for (let i = -w; i < w * 2; i += 26) { g.beginPath(); g.moveTo(i, w); g.lineTo(i + w, 0); g.stroke(); } g.restore();
    g.strokeStyle = 'rgba(255,90,70,1)'; g.lineWidth = 9; roundRect(g, 8, 8, w - 16, w - 16, 16); g.stroke();
  }),
  ring: canvasTex(128, 128, (g, w) => { g.strokeStyle = '#fff'; g.lineWidth = 10; roundRect(g, 10, 10, w - 20, w - 20, 18); g.stroke(); }),
  crack: canvasTex(128, 128, (g, w) => {
    g.strokeStyle = 'rgba(20,12,8,.85)'; g.lineWidth = 5; g.lineCap = 'round';
    const lines = [[[20, 10], [48, 52], [36, 78], [62, 118]], [[48, 52], [92, 44], [118, 62]], [[36, 78], [86, 92], [104, 120]], [[92, 44], [100, 14]]];
    for (const l of lines) { g.beginPath(); g.moveTo(...l[0]); for (const p of l.slice(1)) g.lineTo(...p); g.stroke(); }
  }),
  bang: canvasTex(64, 64, (g, w) => { g.fillStyle = '#2a1d40'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.strokeStyle = '#c9b4ff'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#e6c8ff'; g.font = '900 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34); }),
  digits: [1, 2, 3].map((n) => canvasTex(64, 64, (g) => { g.fillStyle = '#ff8a3c'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.strokeStyle = '#2a1d10'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#fff6d0'; g.font = '900 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 35); })),
};
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// motes: slow embers and dust drifting up out of the deep
const MOTES = 140, motePos = new Float32Array(MOTES * 3), moteGeo = new THREE.BufferGeometry();
for (let i = 0; i < MOTES; i++) { motePos[i * 3] = rand(-9, 9); motePos[i * 3 + 1] = rand(-6, 5); motePos[i * 3 + 2] = rand(-9, 7); }
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: TEX.glow, color: '#ffb36a', size: 0.12, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(motes);

// ================================================================ FLOOR VIEW (stone tiles floating in the dark)
const ZONE_STONE = ['#8d7a69', '#727c95', '#6f8070', '#6e6289', '#7a5e6a'];
const tileGeo = new THREE.BoxGeometry(0.95, 0.5, 0.95);
const tileMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
const tiles = new THREE.InstancedMesh(tileGeo, tileMat, 100); tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300), 3); scene.add(tiles);
const floorGroup = new THREE.Group(); scene.add(floorGroup);
const FV = { w: 0, h: 0, index: [], base: [], light: [], target: [], drop: [], cracks: new Map(), pillars: [], braziers: [], items: [], stairs: null, glow: null };
const W = (gx) => gx - (FV.w - 1) / 2, Z = (gy) => gy - (FV.h - 1) / 2;
const _m = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const stoneMat = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, flatShading: true });

function buildFloorView(f, depth) {
  floorGroup.clear(); FV.cracks.clear(); FV.pillars = []; FV.braziers = []; FV.items = [];
  FV.w = f.w; FV.h = f.h; FV.index = []; FV.base = []; FV.light = []; FV.target = []; FV.drop = [];
  const stone = new THREE.Color(ZONE_STONE[zoneOf(depth)]), R = D.rng(D.hash('look', depth));
  let n = 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const tch = f.grid[y][x], i = y * f.w + x;
    FV.light[i] = 0; FV.target[i] = 0; FV.drop[i] = 0;
    if (tch === '_' || tch === 'S') { FV.index[i] = -1; continue; }
    FV.index[i] = n;
    const b = stone.clone().multiplyScalar(0.86 + R() * 0.2 + ((x + y) % 2 ? 0.03 : -0.03));
    if (tch === '%') b.multiplyScalar(0.78);
    FV.base[n] = b; FV.jit = FV.jit || []; FV.jit[n] = (R() - 0.5) * 0.05;
    n++;
    if (tch === '%') { const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: TEX.crack, transparent: true, depthWrite: false })); dec.rotation.x = -Math.PI / 2; dec.rotation.z = R() * 6; dec.position.set(W(x), 0.012, Z(y)); floorGroup.add(dec); FV.cracks.set(i, dec); }
  }
  tiles.count = n; placeTiles(0);
  // the rock the floor floats on: a dark slab with hanging crags
  const base = new THREE.Mesh(new THREE.BoxGeometry(f.w + 0.25, 1.6, f.h + 0.25), stoneMat(stone.clone().multiplyScalar(0.28)));
  base.position.y = -1.32; floorGroup.add(base);
  for (let i = 0; i < 16; i++) {
    const r = 0.5 + R() * 1.1, c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.5 + R() * 3, 5), stoneMat(stone.clone().multiplyScalar(0.22 + R() * 0.08)));
    c.rotation.x = Math.PI; c.position.set((R() - 0.5) * (f.w - 0.6), -2.4 - R() * 0.8, (R() - 0.5) * (f.h - 0.6)); floorGroup.add(c);
  }
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const tch = f.grid[y][x];
    if (tch === '_') { const v = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ color: '#05030a' })); v.rotation.x = -Math.PI / 2; v.position.set(W(x), -0.5, Z(y)); floorGroup.add(v); }
    if (tch === '#') FV.pillars.push(buildPillar(x, y, stone, R));
  }
  for (const b of f.braziers) FV.braziers.push(buildBrazier(b, stone));
  for (const o of f.items) FV.items.push(buildOil(o));
  FV.stairs = buildStairs(f, stone);
  updateLightTargets(true);
}
function placeTiles(dt) {
  for (let y = 0; y < FV.h; y++) for (let x = 0; x < FV.w; x++) {
    const i = y * FV.w + x, n = FV.index[i];
    if (n == null || n < 0) continue;
    let yy = -0.25 + FV.jit[n];
    if (FV.drop[i] > 0) { FV.drop[i] += dt; yy -= FV.drop[i] * FV.drop[i] * 9; }
    _m.compose(_v.set(W(x), yy, Z(y)), _q.identity(), FV.drop[i] > 0 ? _s.set(1, 1, 1).multiplyScalar(Math.max(0.01, 1 - FV.drop[i])) : _s.set(1, 1, 1));
    tiles.setMatrixAt(n, _m);
  }
  tiles.instanceMatrix.needsUpdate = true;
}
function buildPillar(x, y, stone, R) {
  const g = new THREE.Group(), mat = stoneMat(stone.clone().multiplyScalar(1.05));
  const h = 0.75 + R() * 0.35; // low enough that nothing hides behind one
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, h, 6), mat); shaft.position.y = h / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.36, 0.18, 6), mat); cap.position.y = h + 0.09;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.16, 6), mat); foot.position.y = 0.08;
  g.add(shaft, cap, foot); g.rotation.y = R() * 2; g.position.set(W(x), 0, Z(y)); floorGroup.add(g);
  g.userData = { x, y, mat, base: mat.color.clone() };
  return g;
}
function buildBrazier(b, stone) {
  const g = new THREE.Group(), mat = stoneMat(stone.clone().multiplyScalar(0.8));
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.55, 7), mat); ped.position.y = 0.27;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.24, 0.24, 8), stoneMat('#5d4a3a')); bowl.position.y = 0.66;
  const coal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: '#2a1a14', emissive: '#ff5a1a', emissiveIntensity: 0.15, flatShading: true })); coal.position.y = 0.76; coal.scale.y = 0.45;
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 7), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.9 }));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 7), new THREE.MeshBasicMaterial({ color: '#ffe9a0' }));
  outer.position.y = 0.35; inner.position.y = 0.25; flame.add(outer, inner); flame.position.y = 0.76; flame.visible = b.lit;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: '#ff9a3c', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.2); halo.position.y = 1.1; halo.visible = b.lit;
  g.add(ped, bowl, coal, flame, halo); g.position.set(W(b.x), 0, Z(b.y)); floorGroup.add(g);
  g.userData = { b, flame, halo, coal, mat, base: mat.color.clone() };
  return g;
}
function buildOil(o) {
  const g = new THREE.Group();
  const pud = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), new THREE.MeshStandardMaterial({ color: '#c97a1c', emissive: '#7a3a00', emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2 }));
  pud.rotation.x = -Math.PI / 2; pud.position.y = 0.011; pud.scale.set(1, 0.8, 1);
  const drop = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#c25f00', emissiveIntensity: 0.9, roughness: 0.25 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 10), ball.material); tip.position.y = 0.15;
  drop.add(ball, tip); drop.position.y = 0.55;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: '#ffb347', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(0.9); halo.position.y = 0.55;
  g.add(pud, drop, halo); g.position.set(W(o.x), 0, Z(o.y)); floorGroup.add(g);
  g.userData = { o, drop };
  return g;
}
function buildStairs(f, stone) {
  const g = new THREE.Group(), s = f.stairs, mat = stoneMat(stone.clone().multiplyScalar(0.75));
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.24), mat); st.position.set(0, -0.12 - i * 0.2, 0.36 - i * 0.24); g.add(st); }
  const wallMat = stoneMat(stone.clone().multiplyScalar(0.55));
  for (const sx of [-0.49, 0.49]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.95), wallMat); wall.position.set(sx, -0.48, 0); g.add(wall); }
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: '#5fe0c8', transparent: true, opacity: 0.85 }));
  portal.rotation.x = -Math.PI / 2; portal.position.y = -0.92; g.add(portal);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: '#5fe0c8', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(1.8); halo.position.y = 0.1; g.add(halo);
  const seal = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.42, 6), new THREE.MeshBasicMaterial({ color: '#c59bff', transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  seal.rotation.x = -Math.PI / 2; seal.position.y = 0.03; g.add(seal);
  g.position.set(W(s.x), 0, Z(s.y)); floorGroup.add(g);
  g.userData = { portal, halo, seal };
  return g;
}
function refreshStairs() {
  if (!FV.stairs || !run) return;
  const open = D.stairsOpen(run.floor), u = FV.stairs.userData;
  u.portal.material.color.set(open ? '#5fe0c8' : '#4a2f7a'); u.halo.material.color.set(open ? '#5fe0c8' : '#7a4dff'); u.halo.material.opacity = open ? 0.55 : 0.3;
  u.seal.visible = !open;
}
function updateLightTargets(snap = false) { // which tiles your lamp and the braziers light (the rules' light, drawn exactly)
  if (!run) return;
  const f = run.floor;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = y * f.w + x, p = f.player, r = D.lightRadius(run), d = D.cheb(x, y, p.x, p.y);
    let v = d <= r ? 1 - (d / (r + 1)) * 0.25 : 0;
    for (const b of f.braziers) if (b.lit && D.cheb(x, y, b.x, b.y) <= D.CFG.brazierLight) v = Math.max(v, 0.8);
    FV.target[i] = v; if (snap) FV.light[i] = v;
  }
}
const WARM = new THREE.Color('#ffd89a'), COLD = new THREE.Color('#3c3366');
function shadeFloor(dt) {
  const k = 1 - Math.exp(-dt * 10);
  for (let y = 0; y < FV.h; y++) for (let x = 0; x < FV.w; x++) {
    const i = y * FV.w + x, n = FV.index[i];
    FV.light[i] = lerp(FV.light[i] ?? 0, FV.target[i] ?? 0, k);
    if (n == null || n < 0) continue;
    const l = FV.light[i];
    _c.copy(FV.base[n]).multiply(_c2.copy(COLD).lerp(WARM, l)).multiplyScalar(0.7 + l * 1.0);
    tiles.setColorAt(n, _c);
    const dec = FV.cracks.get(i); if (dec) dec.material.opacity = 0.35 + l * 0.6;
  }
  tiles.instanceColor.needsUpdate = true;
  for (const pl of FV.pillars) { const l = FV.light[pl.userData.y * FV.w + pl.userData.x] ?? 0; pl.userData.mat.color.copy(pl.userData.base).multiplyScalar(0.5 + l * 0.9); }
}

// ================================================================ UNITS (the lamplighter and the shadows, all procedural)
const views = new Map(); // id -> { g, kind, x, z, path, ... }
const lamb = (c, opts = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...opts });

function buildLamplighter() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.78, 8), lamb('#2a6f8a')); cloak.position.y = 0.39;
  const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.36, 0.06, 8), lamb('#1f5670')); hem.position.y = 0.03;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), lamb('#e2b08a', { flatShading: false, roughness: 1 })); head.position.y = 0.9;
  const hoodMat = lamb('#1f5670', { side: THREE.DoubleSide, roughness: 1 });
  const hood = new THREE.Group(); hood.position.set(0, 0.91, -0.01); hood.rotation.x = -0.12; // a cap over the crown, open only around the face
  hood.add(new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), hoodMat));
  hood.add(new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 8, Math.PI * 0.82, Math.PI * 1.36, Math.PI * 0.28, Math.PI * 0.44), hoodMat));
  const tipHood = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 6), lamb('#1f5670')); tipHood.position.set(0, 1.12, -0.2); tipHood.rotation.x = -1.1;
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b1530' });
  const eyes = [-0.075, 0.075].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), eyeMat); e.position.set(x * 1.1, 0.93, 0.198); e.scale.y = 1.35; return e; });
  const cheekMat = new THREE.MeshBasicMaterial({ color: '#ff9c8a', transparent: true, opacity: 0.7 });
  const cheeks = [-0.13, 0.13].map((x) => { const c = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), cheekMat); c.position.set(x, 0.875, 0.185); c.rotation.y = x * 2.5; return c; });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 6, 14), lamb('#ffb347')); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.7;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.04), lamb('#ffb347')); tail.position.set(0.1, 0.6, -0.14); tail.rotation.z = 0.3;
  const arm = new THREE.Group(); arm.position.set(0.26, 0.6, 0.06);
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 8), lamb('#2a6f8a')); sleeve.rotation.z = 0.9; sleeve.position.set(0.07, -0.02, 0);
  const lantern = new THREE.Group(); lantern.position.set(0.2, -0.16, 0.05);
  const brass = lamb('#7a5428', { metalness: 0.4, roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 6), brass); top.position.y = 0.13;
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 6), brass); bot.position.y = -0.1;
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 4, 10), brass); ringTop.position.y = 0.19;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe2a0' }));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.18, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: '#ffc45c', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(0.9);
  lantern.add(top, bot, ringTop, core, glass, halo);
  arm.add(sleeve, lantern);
  const feet = [-0.11, 0.11].map((x) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lamb('#4a3226')); f.position.set(x, 0.04, 0.08); f.scale.set(1, 0.7, 1.3); return f; });
  body.add(cloak, hem, head, hood, tipHood, ...eyes, ...cheeks, scarf, tail, arm, ...feet);
  const shadow = blobShadow(0.36); g.add(shadow);
  g.userData = { body, arm, lantern, core, halo, eyes, cloakMat: cloak.material, headMat: head.material };
  return g;
}
function blobShadow(r) { const s = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.38, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.y = 0.014; return s; }

const INK = '#1e1533';
function buildShade(type) {
  const def = D.ENEMIES[type], boss = !!def.boss, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const ink = lamb(INK, { emissive: '#2c1a4a', emissiveIntensity: 0.55 });
  const eyeCol = EYE[type], eyeMat = new THREE.MeshBasicMaterial({ color: eyeCol });
  const parts = { wings: [], extra: [] };
  let eyeY = 0.42, eyeZ = 0.24, eyeX = 0.1, blob;
  const add = (m, x, y, z) => { m.position.set(x, y, z); body.add(m); return m; };
  const base = type === 'king' ? 'gloom' : type === 'queen' ? 'flitter' : type === 'soot' ? 'pod' : type === 'dark' ? 'dark' : type;
  if (base === 'flitter') {
    blob = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), ink), 0, 0.5, 0); eyeY = 0.53; eyeZ = 0.2; eyeX = 0.085;
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.3, 5), lamb('#3a2860', { side: THREE.DoubleSide, emissive: '#3a1f6a', emissiveIntensity: 0.5 }));
      wing.scale.set(1, 0.7, 1); const pivot = new THREE.Group(); pivot.position.set(s * 0.12, 0.56, -0.05); wing.position.x = s * 0.26; pivot.add(wing); body.add(pivot); parts.wings.push({ pivot, s });
    }
    for (const s of [-1, 1]) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), ink); ant.position.set(s * 0.08, 0.78, 0.05); ant.rotation.z = -s * 0.4; body.add(ant); }
  } else if (base === 'wisp') {
    blob = add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), ink), 0, 0.5, 0);
    const tail = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), ink), 0, 0.82, -0.08); tail.rotation.x = -0.6; parts.extra.push(tail);
    const mouth = add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12), new THREE.MeshBasicMaterial({ color: '#7ff3ff' })), 0, 0.42, 0.25);
    eyeY = 0.56; eyeZ = 0.22;
    parts.mouth = mouth;
  } else if (base === 'gloom') {
    blob = add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 7), ink), 0, 0.47, 0);
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), ink), 0, 0.92, 0.02);
    parts.extra.push(head); eyeY = 0.93; eyeZ = 0.19; eyeX = 0.075;
    for (const s of [-1, 1]) { const hand = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), ink), s * 0.28, 0.45, 0.08); hand.rotation.z = s * 0.5; hand.rotation.x = Math.PI; }
  } else if (base === 'crab') {
    blob = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), ink), 0, 0.32, 0); blob.scale.set(1.35, 0.7, 1);
    for (const s of [-1, 1]) {
      const claw = add(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 5), ink), s * 0.42, 0.34, 0.12); claw.rotation.z = s * 1.2; parts.extra.push(claw);
      for (const z of [-0.12, 0.05]) { const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 4), ink), s * 0.33, 0.12, z); leg.rotation.z = s * 0.9; }
    }
    eyeY = 0.5; eyeZ = 0.14; eyeX = 0.1;
    for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 4), ink), s * 0.1, 0.43, 0.14);
  } else if (base === 'pod') {
    blob = add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), ink), 0, 0.3, 0);
    for (let i = 0; i < 4; i++) { const seam = add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 4, 20, Math.PI), new THREE.MeshBasicMaterial({ color: '#ff8a3c' })), 0, 0.3, 0); seam.rotation.y = (i * Math.PI) / 4; parts.extra.push(seam); }
    const fuse = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 4), lamb('#6b4a2a')), 0, 0.62, 0);
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spark.scale.setScalar(0.35); spark.position.y = 0.74; body.add(spark);
    parts.spark = spark; parts.fuse = fuse; eyeY = 0.34; eyeZ = 0.25; eyeX = 0.09;
  } else if (base === 'hound') {
    blob = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), ink), 0, 0.36, -0.05); blob.scale.set(0.9, 0.85, 1.5);
    const head = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), ink), 0, 0.5, 0.26);
    for (const s of [-1, 1]) { const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), ink), s * 0.09, 0.68, 0.22); ear.rotation.z = -s * 0.3; }
    const tail = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), ink), 0, 0.48, -0.42); tail.rotation.x = -0.9; parts.extra.push(tail);
    for (const [x, z] of [[-0.12, 0.15], [0.12, 0.15], [-0.12, -0.25], [0.12, -0.25]]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 5), ink), x, 0.11, z);
    parts.head = head; eyeY = 0.53; eyeZ = 0.4; eyeX = 0.07;
  } else if (base === 'shell') {
    blob = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), ink), 0, 0.42, 0); blob.scale.set(1, 1.15, 0.9);
    const shield = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 6), lamb('#3f5f52', { emissive: '#1d4a32', emissiveIntensity: 0.6 })), 0, 0.42, 0.33);
    shield.rotation.x = Math.PI / 2; parts.shield = shield;
    const boss2 = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: '#9dffb0' })), 0, 0.42, 0.38); parts.extra.push(boss2);
    eyeY = 0.7; eyeZ = 0.2; eyeX = 0.08;
  } else { // the Last Dark: a great dark heart ringed with eyes
    blob = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), ink), 0, 0.55, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, e = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat), Math.cos(a) * 0.36, 0.55 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.36); parts.extra.push(e); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), ink), Math.cos(a) * 0.32, 0.22, Math.sin(a) * 0.32); spike.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); }
    eyeY = 0.62; eyeZ = 0.36; eyeX = 0.11;
  }
  const eyes = [-eyeX, eyeX].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(type === 'pod' ? 0.04 : 0.05, 8, 6), eyeMat); e.position.set(x, eyeY, eyeZ); e.scale.y = 1.4; body.add(e); return e; });
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: eyeCol, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  eyeGlow.scale.set(0.55, 0.35, 1); eyeGlow.position.set(0, eyeY, eyeZ + 0.03); body.add(eyeGlow);
  if (boss) { // a crown of dark spikes, and a lot bigger
    const crown = new THREE.Group();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), new THREE.MeshBasicMaterial({ color: eyeCol })); sp.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14); crown.add(sp); }
    const topY = base === 'gloom' ? 1.16 : base === 'flitter' ? 0.8 : base === 'pod' ? 0.66 : 0.98;
    crown.position.y = topY; body.add(crown); parts.crown = crown;
    g.scale.setScalar(base === 'dark' ? 1.55 : 1.65);
  }
  const shadow = blobShadow(boss ? 0.3 : 0.32); g.add(shadow);
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.bang, transparent: true, depthTest: false })); bang.scale.setScalar(0.34); bang.position.y = boss ? 0.95 : 1.15; bang.visible = false; bang.renderOrder = 5; g.add(bang);
  const digit = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.digits[2], transparent: true, depthTest: false })); digit.scale.setScalar(0.36); digit.position.y = 0.95; digit.visible = false; digit.renderOrder = 5; g.add(digit);
  const pips = new THREE.Group(); pips.position.y = boss ? 0 : 1.0; g.add(pips);
  const stars = new THREE.Group(); stars.position.y = boss ? 0.9 : 1.0; stars.visible = false; g.add(stars);
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: '#ffe08a' })); s.position.set(Math.cos(i * 2.1) * 0.22, 0, Math.sin(i * 2.1) * 0.22); stars.add(s); }
  g.userData = { body, blob, ink, eyes, eyeMat, eyeGlow, eyeCol, parts, bang, digit, pips, stars, boss, base, phase: Math.random() * 6 };
  return g;
}
const pipGeo = new THREE.BoxGeometry(0.13, 0.05, 0.05), pipOn = new THREE.MeshBasicMaterial({ color: '#ff6a5a' }), pipOff = new THREE.MeshBasicMaterial({ color: '#2a1d40' }); // a little segmented health bar
function setPips(v, hp, max) {
  const p = v.g.userData.pips; if (v.g.userData.boss) return;
  if (p.userData.hp === hp && p.userData.max === max) return;
  p.clear(); p.userData.hp = hp; p.userData.max = max;
  for (let i = 0; i < max; i++) { const m = new THREE.Mesh(pipGeo, i < hp ? pipOn : pipOff); m.position.x = (i - (max - 1) / 2) * 0.15; m.renderOrder = 4; p.add(m); }
}

function addView(id, g, gx, gy, kind) {
  const v = { id, g, kind, x: W(gx), z: Z(gy), gx, gy, path: [], seg: null, lunge: null, hit: 0, dying: 0, fell: false, appear: kind === 'p' ? 1 : 0, face: 0, wantFace: 0 };
  g.position.set(v.x, 0, v.z); scene.add(g); views.set(id, v);
  return v;
}
function clearViews() { for (const v of views.values()) scene.remove(v.g); views.clear(); }
function syncViews(snap = false) { // make sure every live unit has a view (the rules are the truth)
  if (!run) return;
  const f = run.floor;
  if (!views.has('p')) addView('p', buildLamplighter(), f.player.x, f.player.y, 'p');
  for (const e of f.enemies) if (!views.has(e.id)) { const v = addView(e.id, buildShade(e.type), e.x, e.y, e.type); if (snap) v.appear = 1; }
  if (snap) for (const v of views.values()) { const u = v.id === 'p' ? f.player : f.enemies.find((e) => e.id === v.id); if (u) { v.gx = u.x; v.gy = u.y; v.x = W(u.x); v.z = Z(u.y); v.path = []; v.seg = null; } }
}
function moveView(id, gx, gy, at, kind) { const v = views.get(id); if (!v) return; v.path.push({ at, gx, gy, kind }); v.gx = gx; v.gy = gy; }

const faceTo = (v, dx, dz) => { if (dx || dz) v.wantFace = Math.atan2(dx, dz); };
function updateViews(dt) {
  const now = vclock;
  for (const v of [...views.values()]) {
    const g = v.g, u = g.userData;
    if (!v.seg && v.path.length && now >= v.path[0].at) {
      const p = v.path.shift(), dur = p.kind === 'leap' ? 0.3 : p.kind === 'slide' ? 0.12 : 0.13;
      v.seg = { fx: v.x, fz: v.z, tx: W(p.gx), tz: Z(p.gy), t: 0, dur, kind: p.kind };
      if (p.kind !== 'slide') faceTo(v, v.seg.tx - v.seg.fx, v.seg.tz - v.seg.fz);
    }
    let lift = 0;
    if (v.seg) {
      const s = v.seg; s.t += dt; const k = clamp(s.t / s.dur, 0, 1), e = k * (2 - k);
      v.x = lerp(s.fx, s.tx, e); v.z = lerp(s.fz, s.tz, e);
      lift = s.kind === 'leap' ? Math.sin(Math.PI * k) * 0.9 : s.kind === 'slide' ? 0 : Math.sin(Math.PI * k) * 0.16;
      if (k >= 1) v.seg = null;
    }
    let lx = 0, lz = 0;
    if (v.lunge && now >= v.lunge.at) { v.lunge.t += dt; const k = v.lunge.t / 0.2; if (k >= 1) v.lunge = null; else { const a = Math.sin(Math.PI * k) * 0.35; lx = v.lunge.dx * a; lz = v.lunge.dz * a; } }
    let d = v.wantFace - v.face; d = Math.atan2(Math.sin(d), Math.cos(d)); v.face += d * Math.min(1, dt * 14);
    g.rotation.y = v.face;
    let y = lift;
    if (v.fell) { v.dying += dt; y = -v.dying * v.dying * 9; g.scale.setScalar(Math.max(0.01, (u.boss ? 1.6 : 1) * (1 - v.dying * 0.9))); if (v.dying > 0.9) { scene.remove(g); views.delete(v.id); continue; } }
    else if (v.dying > 0) { v.dying += dt; const k = v.dying / 0.35; g.scale.set(1 + k * 0.4, Math.max(0.01, 1 - k), 1 + k * 0.4).multiplyScalar(u.boss ? 1.6 : 1); if (k >= 1) { scene.remove(g); views.delete(v.id); continue; } }
    if (v.appear < 1) { v.appear = Math.min(1, v.appear + dt * 3); const k = v.appear; g.scale.setScalar((u.boss ? (u.base === 'dark' ? 1.55 : 1.65) : 1) * (k < 1 ? k * (2.2 - 1.2 * k) : 1)); }
    g.position.set(v.x + lx, y, v.z + lz);
    animateUnit(v, dt);
  }
}
function animateUnit(v, dt) {
  const u = v.g.userData, tt = vclock + (u.phase || 0);
  if (v.kind === 'p') {
    u.body.scale.y = 1 + Math.sin(tt * 2.4) * 0.025; u.body.position.y = Math.max(0, Math.sin(tt * 2.4) * 0.01);
    u.arm.rotation.z = Math.sin(tt * 1.7) * 0.08; u.lantern.rotation.z = -Math.sin(tt * 1.7) * 0.25;
    const blink = (tt % 3.6) < 0.12; for (const e of u.eyes) e.scale.y = blink ? 0.2 : 1.35;
    const flick = 0.92 + Math.sin(tt * 13) * 0.04 + Math.sin(tt * 7.3) * 0.04, low = run && run.oil <= CFG.lowOil;
    u.halo.material.opacity = (low ? 0.45 + Math.abs(Math.sin(tt * 6)) * 0.4 : 0.85) * flick;
    if (v.hit > 0) { v.hit -= dt; u.cloakMat.emissive.setRGB(v.hit * 3, v.hit * 0.6, v.hit * 0.5); } else u.cloakMat.emissive.setRGB(0, 0, 0);
    return;
  }
  const lit = run && v.gx != null && (FV.light[v.gy * FV.w + v.gx] ?? 0) > 0.5;
  const p = u.parts;
  u.body.position.y = (u.base === 'flitter' ? 0.12 + Math.sin(tt * 4) * 0.06 : u.base === 'wisp' ? 0.1 + Math.sin(tt * 2.5) * 0.07 : 0) ;
  u.blob.scale.y = (u.base === 'crab' ? 0.7 : u.base === 'hound' ? 0.85 : 1) * (1 + Math.sin(tt * 3) * 0.04);
  for (const w of p.wings) w.pivot.rotation.y = w.s * (0.3 + Math.sin(tt * 16) * 0.6);
  if (p.spark) p.spark.scale.setScalar(0.25 + Math.abs(Math.sin(tt * (v.armed ? 14 : 5))) * 0.25);
  if (p.crown) p.crown.rotation.y = tt * 0.6;
  if (p.mouth) p.mouth.scale.setScalar(v.armed ? 1.3 + Math.sin(tt * 12) * 0.2 : 1);
  if (u.base === 'dark') u.blob.rotation.y = tt * 0.4;
  const hot = v.armed ? 1 : 0;
  u.eyeMat.color.set(hot ? '#ff4a3a' : u.eyeCol); u.eyeGlow.material.color.set(hot ? '#ff4a3a' : u.eyeCol);
  u.eyeGlow.material.opacity = 0.45 + Math.sin(tt * 3) * 0.1 + hot * 0.3;
  u.ink.emissiveIntensity = (lit ? 0.75 : 0.35) + (v.hit > 0 ? v.hit * 6 : 0);
  if (v.hit > 0) { v.hit -= dt; u.ink.emissive.set('#ff6a5a'); } else u.ink.emissive.set(lit ? '#3a2466' : '#22143c');
  u.stars.visible = !!v.stunned; if (v.stunned) u.stars.rotation.y += dt * 5;
}

// ================================================================ FX (particles, telegraphs, pops)
const PART_N = 360, parts = [];
const partGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), PART_N);
const partInk = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.glow, transparent: true, depthWrite: false, color: '#ffffff' }), PART_N);
for (const m of [partGlow, partInk]) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PART_N * 3), 3); m.count = 0; m.frustumCulled = false; scene.add(m); }
function emit(x, y, z, n, o = {}) {
  if (SIMMING) return;
  for (let i = 0; i < n; i++) {
    if (parts.length > PART_N * 2 - 2) parts.shift();
    const sp = o.speed ?? 2, a = Math.random() * Math.PI * 2, up = o.up ?? 1.5;
    parts.push({ x: x + rand(-0.15, 0.15) * (o.spread ?? 1), y, z: z + rand(-0.15, 0.15) * (o.spread ?? 1), vx: Math.cos(a) * sp * Math.random(), vy: up * (0.4 + Math.random()), vz: Math.sin(a) * sp * Math.random(),
      life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.6), max: 0, size: o.size ?? 0.18, col: new THREE.Color(o.color ?? '#ffb347'), grav: o.grav ?? 3, ink: !!o.ink });
    parts[parts.length - 1].max = parts[parts.length - 1].life;
  }
}
function updateParticles(dt) {
  let ng = 0, ni = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const k = p.life / p.max, s = p.size * (0.4 + k * 0.8), mesh = p.ink ? partInk : partGlow, n = p.ink ? ni++ : ng++;
    if (n >= PART_N) continue;
    _m.compose(_v.set(p.x, p.y, p.z), camera.quaternion, _s.set(s, s, s)); mesh.setMatrixAt(n, _m);
    _c.copy(p.col).multiplyScalar(p.ink ? 1 : k); mesh.setColorAt(n, _c);
  }
  partGlow.count = Math.min(ng, PART_N); partInk.count = Math.min(ni, PART_N);
  for (const m of [partGlow, partInk]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

// telegraphs: the tiles shadows will strike after your next move
const markGeo = new THREE.PlaneGeometry(0.94, 0.94);
const marks = [];
function mark(i) {
  while (marks.length <= i) { const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ map: TEX.danger, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; scene.add(m); marks.push(m); }
  return marks[i];
}
const hover = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ map: TEX.ring, transparent: true, depthWrite: false, color: '#fff1d6', opacity: 0.6 }));
hover.rotation.x = -Math.PI / 2; hover.position.y = 0.02; hover.visible = false; hover.renderOrder = 3; scene.add(hover);
const guide = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ map: TEX.ring, transparent: true, depthWrite: false, color: '#ffc45c' }));
guide.rotation.x = -Math.PI / 2; guide.position.y = 0.025; guide.visible = false; guide.renderOrder = 3; scene.add(guide);
const leapMarks = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ map: TEX.ring, transparent: true, depthWrite: false, color: '#5fe0c8' })); m.rotation.x = -Math.PI / 2; m.position.y = 0.022; m.visible = false; m.renderOrder = 3; scene.add(m); return m; });
let threatOnMe = false;
function refreshIntents() {
  if (!run) return;
  const f = run.floor, p = f.player; let n = 0; threatOnMe = false;
  for (const v of views.values()) { if (v.kind === 'p') continue; v.armed = false; v.stunned = false; v.g.userData.bang.visible = false; v.g.userData.digit.visible = false; }
  for (const e of f.enemies) {
    const v = views.get(e.id); if (!v) continue;
    v.stunned = e.stun > 0; setPips(v, e.hp, e.max);
    if (e.type === 'pod' && e.awake) { v.g.userData.digit.visible = true; v.g.userData.digit.material.map = TEX.digits[clamp(e.fuse, 1, 3) - 1]; }
    if (!e.intent) continue;
    if (!D.intentVisible(run, e)) { v.g.userData.bang.visible = true; continue; }
    v.armed = true;
    for (const [x, y] of e.intent.tiles) {
      const m = mark(n++); m.visible = true; m.position.set(W(x), 0.016 + n * 0.0004, Z(y)); m.userData.mine = x === p.x && y === p.y;
      if (m.userData.mine) threatOnMe = true;
    }
  }
  for (let i = n; i < marks.length; i++) marks[i].visible = false;
  if (threatOnMe && !SIMMING) playSfx('warn');
  if (bossView()) updateBossBar();
}
function pulseMarks(dt) { const a = 0.75 + Math.sin(vclock * 7) * 0.25; for (const m of marks) if (m.visible) m.material.opacity = m.userData.mine ? 0.55 + Math.sin(vclock * 14) * 0.45 : a; }

const pops = [];
function pop(text, gx, gy, cls = '', h = 1.2, life = 1.2) {
  if (SIMMING || !run) return;
  const el = document.createElement('div'); el.className = `pop ${cls}`; el.textContent = text; document.body.appendChild(el);
  pops.push({ el, x: W(gx), z: Z(gy), y: h, t: 0, life });
}
const _pp = new THREE.Vector3();
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    if (p.t >= p.life) { p.el.remove(); pops.splice(i, 1); continue; }
    _pp.set(p.x, p.y + p.t * 0.8, p.z).project(camera);
    p.el.style.left = `${(_pp.x * 0.5 + 0.5) * innerWidth}px`; p.el.style.top = `${(-_pp.y * 0.5 + 0.5) * innerHeight}px`;
    p.el.style.opacity = String(Math.min(1, (p.life - p.t) * 3));
  }
}
function clearPops() { for (const p of pops) p.el.remove(); pops.length = 0; }
let shakeAmt = 0;
const shake = (a) => { shakeAmt = Math.max(shakeAmt, a); };
function vignette(cls) { if (SIMMING) return; const el = $('vig'); el.classList.remove('hurt'); if (cls === 'hurt') { void el.offsetWidth; el.classList.add('hurt'); setTimeout(() => el.classList.remove('hurt'), 60); } }
let flareT = 0;

// timed effects inside a turn (strikes land after your move, shadows move after that)
let vclock = 0;
const timers = [];
const later = (delay, fn) => timers.push({ at: vclock + delay, fn });
function runTimers() { for (let i = 0; i < timers.length; i++) { if (timers[i].at <= vclock) { const tm = timers.splice(i--, 1)[0]; tm.fn(); } } }

// ================================================================ INPUT (keys: move/bump, F flare, E leap, Space wait, P pause; pointer/touch: tap tiles)
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
let leapArmed = false, queued = null;
addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  unlockAudio();
  if (e.code === 'KeyP') { togglePause(); return; } // never Escape: on CrazyGames it exits fullscreen
  if (state === State.MENU && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { $('btnPlay').click(); return; }
  if (state !== State.PLAYING || AUTOPLAY) return;
  if (e.repeat && !DIRS[e.code]) return;
  if (DIRS[e.code]) { const [dx, dy] = DIRS[e.code]; request(leapArmed ? { t: 'leap', dx, dy } : { t: 'move', dx, dy }); return; }
  if (e.code === 'Space' || e.code === 'Period') request({ t: 'wait' });
  else if (e.code === 'KeyF' || e.code === 'KeyQ') request({ t: 'flare' });
  else if (e.code === 'KeyE' || e.code === 'ShiftLeft') armLeap(!leapArmed);
});
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
function tileFromPointer(e) {
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
  const gx = Math.round(_hit.x + (FV.w - 1) / 2), gy = Math.round(_hit.z + (FV.h - 1) / 2);
  return gx >= 0 && gy >= 0 && gx < FV.w && gy < FV.h ? [gx, gy] : null;
}
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { unlockAudio(); downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointermove', (e) => {
  if (state !== State.PLAYING || isTouch) { hover.visible = false; return; }
  const c = tileFromPointer(e); hover.visible = !!c && !AUTOPLAY;
  if (c) hover.position.set(W(c[0]), 0.02, Z(c[1]));
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || state !== State.PLAYING || AUTOPLAY) return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 18) return;
  downAt = null;
  const c = tileFromPointer(e); if (!c) return;
  tileAction(c[0], c[1]);
});
function tileAction(gx, gy) {
  const f = run.floor, p = f.player, dx = gx - p.x, dy = gy - p.y;
  if (leapArmed) {
    const k = D.leapDist(run);
    if ((dx === 0 || dy === 0) && Math.abs(dx + dy) === k) { request({ t: 'leap', dx: Math.sign(dx), dy: Math.sign(dy) }); return; }
    armLeap(false); return;
  }
  if (!dx && !dy) { request({ t: 'wait' }); return; }
  if (Math.abs(dx) + Math.abs(dy) === 1) { request({ t: 'move', dx, dy }); return; }
  const step = firstStep(f, gx, gy); // farther away: one step along the shortest walk there
  if (step) request({ t: 'move', dx: step[0], dy: step[1] });
}
function firstStep(f, gx, gy) {
  const walk = (x, y) => { const tch = D.tileAt(f, x, y); return (tch === '.' || tch === '%' || tch === 'S') && !D.enemyAt(f, x, y); };
  const goal = (x, y) => x === gx && y === gy || (!walk(gx, gy) && D.man(x, y, gx, gy) === 1);
  const d = D.bfs(f, gx, gy, (x, y) => walk(x, y) || (x === f.player.x && y === f.player.y));
  let best = null, bd = 1e9;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const x = f.player.x + dx, y = f.player.y + dy;
    if (D.tileAt(f, x, y) === null) continue;
    const v = d[y * f.w + x];
    if (x === gx && y === gy) return [dx, dy];
    if (v >= 0 && walk(x, y) && v < bd) { bd = v; best = [dx, dy]; }
  }
  if (!best && goal) { const dx = Math.sign(gx - f.player.x), dy = Math.sign(gy - f.player.y); if (dx && D.canAct(run, { t: 'move', dx, dy: 0 })) return [dx, 0]; if (dy && D.canAct(run, { t: 'move', dx: 0, dy })) return [0, dy]; }
  return best;
}
function armLeap(on) {
  if (on && (!run || run.cd.leap > 0)) { if (run) pop(String(run.cd.leap), run.floor.player.x, run.floor.player.y, 'info', 1.5, 0.8); return; }
  leapArmed = on; $('btnLeap').classList.toggle('armed', on); refreshLeapMarks();
}
function refreshLeapMarks() {
  const k = run ? D.leapDist(run) : 2, p = run?.floor.player; let i = 0;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const m = leapMarks[i++]; m.visible = leapArmed && !!run && D.canAct(run, { t: 'leap', dx, dy });
    if (m.visible) m.position.set(W(p.x + dx * k), 0.022, Z(p.y + dy * k));
  }
}
const press = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); if (state === State.PLAYING && !AUTOPLAY) fn(); });
press('btnFlare', () => request({ t: 'flare' }));
press('btnLeap', () => armLeap(!leapArmed));
press('btnWait', () => request({ t: 'wait' }));

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED / SHRINE -> GAMEOVER)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', SHRINE: 'SHRINE', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, run = null, SIMMING = false;
const DEFAULT_SAVE = { best: 0, runs: 0, wins: 0, kills: 0, bestTime: 0, lantern: 'brass', start: 1, tipsSeen: {}, tipsOff: false, sound: true, voice: true, daily: {}, run: null, v: 1 };
let save = { ...DEFAULT_SAVE };
const persist = () => { if (!CAPTURE) saveData(`${SAVE_KEY}:save`, save); };
function persistRun() { if (!run || CAPTURE) return; save.run = (run.phase === 'dead' || run.phase === 'won') ? null : run; persist(); }

function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU || !$('setup').hidden; $('paused').hidden = s !== State.PAUSED; $('gameover').hidden = s !== State.GAMEOVER;
  $('shrine').hidden = s !== State.SHRINE;
  const inRun = s === State.PLAYING || s === State.PAUSED || s === State.SHRINE;
  $('hud').hidden = !inRun; $('actions').hidden = s !== State.PLAYING; $('depthMap').hidden = !inRun; $('relicStrip').hidden = !inRun;
  if (s !== State.PLAYING) { $('banner').hidden = true; hover.visible = false; guide.visible = false; $('tip').hidden = true; document.body.classList.remove('tipping'); if (leapArmed) armLeap(false); }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, shrines, game over
}
function togglePause() {
  if (state === State.PLAYING) { setState(State.PAUSED); refreshPause(); persistRun(); }
  else if (state === State.PAUSED) { setState(State.PLAYING); if (tipState) showTip(); }
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { if (SIMMING) return; const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }
function banner(big, small) { if (SIMMING) return; const el = $('banner'); $('bannerBig').textContent = big; $('bannerSmall').textContent = small || ''; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(banner.tm); banner.tm = setTimeout(() => { el.hidden = true; }, 2500); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click'); fn(); });

// ================================================================ UI
const lanternName = (id) => t(`l_${id}`);
const lanternOpen = (id) => save.best >= D.LANTERNS[id].unlock;
const waysOpen = () => [1, ...D.WAYSTONES.filter((w) => save.best >= w)];
const today = () => new Date().toISOString().slice(0, 10);
let setupSel = { lantern: 'brass', start: 1, seed: '' };

function refreshMenu() {
  const r = save.run;
  $('playLabel').textContent = r ? t('cont') : t('descend');
  $('playSub').textContent = r ? t('contSub', { d: r.depth, lantern: lanternName(r.lantern) }) : '';
  $('btnNew').hidden = !r;
  $('menuStats').textContent = save.runs ? t('statsLine', { d: save.best, r: save.runs, w: save.wins }) : t('statsNew');
}
function showMenu() {
  clearPops(); $('setup').hidden = true; setState(State.MENU); refreshMenu();
  startDemo(); playMusic(ASSETS.music.a);
}
function openSetup() {
  setupSel = { lantern: lanternOpen(save.lantern) ? save.lantern : 'brass', start: waysOpen().includes(save.start) ? save.start : 1, seed: D.randomSeed() };
  $('seedInput').value = setupSel.seed;
  renderSetup(); $('setup').hidden = false; $('menu').hidden = true;
}
function renderSetup() {
  $('lanterns').innerHTML = Object.keys(D.LANTERNS).map((id) => {
    const open = lanternOpen(id);
    return `<button data-l="${id}" class="${id === setupSel.lantern ? 'sel' : ''} ${open ? '' : 'locked'}">${ico(lanternIcon(id))}<b>${lanternName(id)}</b><span>${open ? t(`ld_${id}`) : t('lanternLocked', { d: D.LANTERNS[id].unlock })}</span></button>`;
  }).join('');
  $('lanterns').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { if (!lanternOpen(b.dataset.l)) { playSfx('block'); return; } playSfx('click'); setupSel.lantern = b.dataset.l; renderSetup(); }));
  const ways = waysOpen();
  $('waystones').innerHTML = [1, ...D.WAYSTONES].map((d) => {
    const open = ways.includes(d);
    return `<button data-w="${d}" class="${d === setupSel.start ? 'sel' : ''}" ${open ? '' : 'disabled'} title="${open ? '' : t('wayLocked', { b: d - 1 })}">${t('wayStart', { d })}</button>`;
  }).join('');
  $('waystones').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { playSfx('click'); setupSel.start = +b.dataset.w; renderSetup(); }));
}
function oilPips() {
  const el = $('oil'); let h = '';
  for (let i = 0; i < run.maxOil; i++) h += `<i class="${i < run.oil ? 'full' : ''}">${i < run.oil ? ICONS.flame : ICONS.flameOff}</i>`;
  el.innerHTML = h; el.classList.toggle('low', run.oil <= CFG.lowOil);
  $('vig').classList.toggle('low', run.oil <= 1);
}
let lastOil = -1, lastEmbers = -1;
function updateHud() {
  if (!run) return;
  const f = run.floor;
  $('hudDepth').textContent = run.depth; $('hudOf').textContent = run.depth <= D.CFG.depths ? `/ ${D.CFG.depths}` : '';
  if (run.oil !== lastOil || $('oil').childElementCount !== run.maxOil) { oilPips(); lastOil = run.oil; }
  if (run.embers !== lastEmbers) { $('embers').textContent = run.embers; if (lastEmbers >= 0 && !SIMMING) { const el = $('hudEmbers'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } lastEmbers = run.embers; }
  $('hudSeed').textContent = run.daily ? `${t('dailyTag')} ${today().slice(5)}` : run.seed;
  const creep = D.creepAt(run), left = creep - f.turn;
  $('creep').hidden = left > CFG.creepWarn; $('creepText').textContent = left > 0 ? t('creepIn', { n: left }) : t('creepNow');
  for (const [id, cd] of [['btnFlare', run.cd.flare], ['btnLeap', run.cd.leap]]) { const b = $(id); b.classList.toggle('cooling', cd > 0); b.querySelector('.cd').textContent = cd > 0 ? cd : ''; }
  updateDepthMap();
}
function updateTimer() { if (run) $('timer').textContent = fmt(run.time); }
function buildDepthMap() {
  const tr = $('depthTrack'), n = D.CFG.depths;
  let h = '<div class="fill" id="depthFill"></div>';
  for (let b = 10; b <= n; b += 10) h += `<i class="boss ico" style="top:${(b / n) * 100}%">${ICONS.crown}</i>`;
  h += `<div class="best" id="depthBest"></div><i class="me ico" id="depthMe">${ICONS.me}</i>`;
  tr.innerHTML = h;
}
function updateDepthMap() {
  const n = D.CFG.depths, d = Math.min(run.depth, n), k = (d - 0.5) / n;
  $('depthFill').style.height = `${k * 100}%`; $('depthMe').style.top = `${k * 100}%`;
  $('depthBest').style.top = `${(Math.min(save.best, n) / n) * 100}%`; $('depthBest').hidden = !save.best;
}
function updateRelicStrip() {
  $('relicStrip').innerHTML = Object.entries(run.relics).map(([id, n]) => `<i title="${t(`r_${id}`)}">${RELIC_ICONS[id]}${n > 1 ? `<b>${n}</b>` : ''}</i>`).join('');
}
function bossView() { if (!run) return null; const b = run.floor.enemies.find((e) => D.ENEMIES[e.type].boss); return b || null; }
function updateBossBar() {
  const b = bossView(); $('bossBar').hidden = !b || state !== State.PLAYING && state !== State.PAUSED;
  if (!b) return;
  $('bossName').textContent = t(`b_${b.type}`); $('bossFill').style.width = `${(100 * b.hp) / b.max}%`;
}
function refreshPause() {
  $('pauseInfo').textContent = t('pauseInfo', { lantern: lanternName(run.lantern), seed: run.daily ? t('dailyTag') : run.seed, time: fmt(run.time) });
  const ids = Object.keys(run.relics);
  $('pauseRelics').innerHTML = ids.length ? ids.map((id) => `<span>${ico(RELIC_ICONS[id])}${t(`r_${id}`)}${run.relics[id] > 1 ? ` ×${run.relics[id]}` : ''}</span>`).join('') : `<span>${t('noRelics')}</span>`;
  $('btnSound').classList.toggle('off', !save.sound); $('btnVoice').classList.toggle('off', !save.voice); $('btnTips').classList.toggle('off', save.tipsOff);
}

// ================================================================ TIPS (onboarding inside gameplay: a picture, a few words, never a pause)
const K = (k) => `<kbd>${k}</kbd>`;
const TIPS = {
  move: () => ({ pic: isTouch ? ico(ICONS.tap) : K('W') + K('A') + K('S') + K('D') + ico(ICONS.mouse), text: isTouch ? 't_moveTouch' : 't_move', until: 'move', guide: 'next' }),
  strike: () => ({ pic: ico(ICONS.danger), text: 't_strike', until: 'turn2' }),
  bump: () => ({ pic: ico(shadeIcon('flitter')), text: 't_bump', until: 'bump', guide: 'foe' }),
  pit: () => ({ pic: ico(ICONS.pit), text: 't_pit', until: 'time' }),
  stairs: () => ({ pic: ico(ICONS.stairs), text: 't_stairs', until: 'descend', guide: 'stairs' }),
  flare: () => ({ pic: (isTouch ? '' : K('F')) + ico(ICONS.flare), text: 't_flare', until: 'time' }),
  leap: () => ({ pic: (isTouch ? '' : K('E')) + ico(ICONS.leap), text: isTouch ? 't_leapTouch' : 't_leap', until: 'time' }),
  hidden: () => ({ pic: ico(ICONS.bang), text: 't_hidden', until: 'time' }),
  oil: () => ({ pic: ico(ICONS.oil), text: 't_oil', until: 'time', guide: 'oil' }),
  brazier: () => ({ pic: ico(RELIC_ICONS.kin), text: 't_brazier', until: 'time', guide: 'brazier' }),
  crack: () => ({ pic: ico(ICONS.crack), text: 't_crack', until: 'time' }),
  sealed: () => ({ pic: ico(ICONS.seal), text: 't_sealed', until: 'time', guide: 'brazier' }),
  creep: () => ({ pic: ico(ICONS.moon), text: 't_creep', until: 'time' }),
  boss: () => ({ pic: ico(ICONS.crown), text: 't_boss', until: 'time' }),
  shrine: () => ({ pic: ico(RELIC_ICONS.wick), text: 't_shrine', until: 'time' }),
  ...Object.fromEntries(['wisp', 'gloom', 'crab', 'pod', 'hound', 'shell'].map((k) => [k, () => ({ pic: ico(shadeIcon(k)), text: `t_${k}`, until: 'time' })])),
};
let tipQueue = [], tipState = null;
function queueTip(key) {
  if (save.tipsOff || save.tipsSeen[key] || tipQueue.includes(key) || tipState?.key === key) return;
  save.tipsSeen[key] = 1; tipQueue.push(key);
  if (!tipState) nextTip();
}
function nextTip() {
  const k = tipQueue.shift();
  if (!k) { tipState = null; $('tip').hidden = true; guide.visible = false; document.body.classList.remove('tipping'); return; }
  tipState = { key: k, def: TIPS[k](), t: 0, turns: 0 }; showTip(); persist();
}
function showTip() {
  if (!tipState || SIMMING || state !== State.PLAYING) return;
  $('tipPic').innerHTML = tipState.def.pic; $('tipText').textContent = t(tipState.def.text); $('tip').hidden = false; document.body.classList.add('tipping');
}
function tipEvent(kind) { if (tipState && (tipState.def.until === kind || (kind === 'turn' && tipState.def.until === 'turn2' && ++tipState.turns >= 2))) nextTip(); }
function updateTips(dt) {
  if (!tipState || state !== State.PLAYING) { guide.visible = false; return; }
  tipState.t += dt;
  if (tipState.t > (tipState.def.until === 'time' ? CFG.tipSeconds : CFG.tipSeconds * 3)) nextTip();
  const g = tipState?.def.guide, c = g && guideTile(g);
  guide.visible = !!c;
  if (c) { guide.position.set(W(c[0]), 0.025, Z(c[1])); const s = 1 + Math.sin(vclock * 6) * 0.08; guide.scale.set(s, s, 1); }
}
function guideTile(kind) {
  const f = run.floor, p = f.player;
  if (kind === 'stairs') return [f.stairs.x, f.stairs.y];
  if (kind === 'foe') { const e = f.enemies[0]; return e ? [e.x, e.y] : null; }
  if (kind === 'oil') { const o = f.items[0]; return o ? [o.x, o.y] : null; }
  if (kind === 'brazier') { const b = f.braziers.find((q) => !q.lit); return b ? [b.x, b.y] : null; }
  if (kind === 'next') { const s = firstStep(f, f.stairs.x, f.stairs.y); return s ? [p.x + s[0], p.y + s[1]] : null; }
  return null;
}
function scanTips() { // first time a thing shows up on a floor: one card (once per save)
  if (!run) return;
  const f = run.floor;
  if (run.depth === 2) queueTip('flare');
  if (run.depth === 3) queueTip('leap');
  for (const e of f.enemies) if (TIPS[e.type] && D.isLit(run, e.x, e.y)) queueTip(e.type);
  if (f.enemies.some((e) => e.intent && D.intentVisible(run, e))) queueTip('strike');
  if (f.enemies.some((e) => e.intent && !D.intentVisible(run, e))) queueTip('hidden');
  if (f.enemies.some((e) => D.man(e.x, e.y, f.player.x, f.player.y) === 1)) queueTip('bump');
  if (f.items.length && f.items.some((o) => D.cheb(o.x, o.y, f.player.x, f.player.y) <= 3)) queueTip('oil');
  if (f.braziers.length) queueTip(f.sealed ? 'sealed' : 'brazier');
  if (f.grid.some((r) => r.includes('%'))) queueTip('crack');
  if (D.bossAlive(f)) queueTip('boss');
  if (f.turn >= D.creepAt(run) - CFG.creepWarn) queueTip('creep');
  if (run.depth === 1 && (f.turn >= 10 || !f.enemies.length)) queueTip('stairs');
}

// ================================================================ GAMEPLAY
let demo = false, busyUntil = 0, botT = 0, shrineOffer = [], ended = false;
function startDemo() { // the menu: the lamplighter waits on the first floor while eyes watch from the dark
  demo = true; run = D.newRun({ seed: 'MENU', lantern: 'brass' });
  enterFloorView();
  const f = run.floor; // two more pairs of eyes in the dark for the menu
  for (const [type, x, y] of [['gloom', 0, 1], ['wisp', 6, 3]]) { const e = { id: 900 + x, type, x, y, hp: 1, max: 1, intent: null, stun: 0, cd: 0, face: [0, 1] }; f.enemies.push(e); }
  syncViews(true); views.get('p').wantFace = 0; views.get('p').face = 0;
}
function newRunFrom(cfg) {
  demo = false; ended = false;
  run = D.newRun(cfg); run.prevBest = save.best;
  save.runs++; save.lantern = cfg.lantern || 'brass'; save.start = cfg.start || 1; persistRun();
  beginRun(true);
}
function beginRun(fresh) {
  clearPops(); buildDepthMap(); updateRelicStrip();
  enterFloorView(); setState(State.PLAYING); afterFloorEnter(fresh);
}
function continueRun() {
  demo = false; ended = false; run = save.run;
  if (run.phase === 'descend') D.enterDepth(run, run.depth + 1); // saved on the stairs: carry on one floor down
  beginRun(false);
}
function enterFloorView() {
  clearViews(); timers.length = 0; busyUntil = 0; queued = null;
  buildFloorView(run.floor, run.depth); syncViews(true); refreshStairs(); refreshIntents(); fitCamera(true);
  lastOil = -1; lastEmbers = -1; updateHud(); updateTimer();
}
function afterFloorEnter(fresh) {
  const d = run.depth, boss = D.isBossDepth(d);
  playMusic(boss ? ASSETS.music.boss : [ASSETS.music.a, ASSETS.music.b, ASSETS.music.c, ASSETS.music.d, ASSETS.music.b][zoneOf(d)]);
  if (boss) { const b = bossView(); banner(t(`b_${b.type}`), t('depth') + ' ' + d); playSfx('bossIn'); say(b.type); }
  else banner(`${t('depth')} ${d}`, t(`zone${zoneOf(d)}`));
  if (fresh && d === run.start) { if (d === 1) say('intro'); }
  if (d === 1) queueTip('move');
  scanTips(); updateBossBar(); persistRun();
}
function request(a) {
  if (state !== State.PLAYING || !run || demo || run.phase !== 'play') return;
  if (vclock < busyUntil - 0.12) { queued = a; return; }
  doAct(a);
}
function doAct(a) {
  if (a.t === 'flare' && run.cd.flare > 0) { pop(String(run.cd.flare), run.floor.player.x, run.floor.player.y, 'info', 1.5, 0.8); playSfx('block', 0.5); return; }
  const ev = D.act(run, a);
  if (!ev) { if (a.t !== 'leap') { const v = views.get('p'); if (v) { v.lunge = { at: vclock, t: 0, dx: (a.dx || 0) * 0.3, dz: (a.dy || 0) * 0.3 }; } playSfx('block', 0.4); } return; }
  if (leapArmed) armLeap(false);
  playEvents(ev);
  busyUntil = vclock + CFG.phase * 2 + 0.16;
  tipEvent('turn');
  if (run.oil <= CFG.lowOil && run.oil > 0 && !playEvents.saidLow) { playEvents.saidLow = true; say('low'); } else if (run.oil > CFG.lowOil) playEvents.saidLow = false;
}
function playEvents(ev) {
  const T = (ph) => ph * CFG.phase, steps = new Map(), f = run.floor;
  for (const e of ev) {
    const at = T(e.ph);
    switch (e.t) {
      case 'move': moveView('p', e.x, e.y, vclock + at, 'hop'); later(at, () => { playSfx('step'); emit(W(e.x), 0.05, Z(e.y), 4, { color: '#8d7a69', speed: 0.8, up: 0.6, size: 0.1, ink: true, life: 0.4 }); }); tipEvent('move'); break;
      case 'leap': moveView('p', e.x, e.y, vclock + at, 'leap'); later(at, () => playSfx('leap')); later(at + 0.3, () => { emit(W(e.x), 0.1, Z(e.y), 10, { color: '#5fe0c8', speed: 1.6, up: 0.8 }); shake(0.08); }); break;
      case 'bump': { const v = views.get('p'), dx = e.dx, dz = e.dy; if (v) { faceTo(v, dx, dz); v.lunge = { at: vclock + at, t: 0, dx, dz }; } later(at + 0.07, () => { playSfx('bump'); emit(W(e.x), 0.5, Z(e.y), 8, { color: '#ffe08a', speed: 2.4, up: 1.2, size: 0.14 }); shake(0.1); }); tipEvent('bump'); break; }
      case 'dmg': later(at + 0.08, () => { const v = views.get(e.id); if (v) v.hit = 0.25; pop(`-${e.n}`, e.x, e.y, 'hurt', 1.1); }); break;
      case 'push': moveView(e.id, e.x, e.y, vclock + at + 0.08, 'slide'); break;
      case 'slam': later(at + 0.12, () => { playSfx('slam'); shake(0.16); emit(W(e.x + e.dx * 0.5), 0.35, Z(e.y + e.dy * 0.5), 10, { color: '#c8b8a8', speed: 2, up: 1, size: 0.12, ink: true }); }); break;
      case 'clash': later(at + 0.12, () => { playSfx('slam', 0.8); shake(0.12); }); break;
      case 'fall': later(at + 0.2, () => { const v = views.get(e.id); if (v) v.fell = true; playSfx('fall'); pop(t('pitPop'), e.x, e.y, 'good', 0.6); if (Math.random() < 0.18) say('pit'); }); tipEvent('pit'); break;
      case 'die': later(at + (e.fell ? 0.25 : 0.14), () => { const v = views.get(e.id); if (v && !v.fell) { v.dying = 0.001; emit(W(e.x), 0.4, Z(e.y), 16, { color: '#2a1846', speed: 2, up: 1.6, size: 0.24, ink: true, life: 0.8 }); emit(W(e.x), 0.4, Z(e.y), 8, { color: EYE[e.type], speed: 1.6, up: 1.4, size: 0.12 }); } playSfx('die'); }); break;
      case 'ember': later(at + 0.3, () => { playSfx('ember'); pop(`+${e.n}`, e.x, e.y, 'ember', 1.3); emit(W(e.x), 0.4, Z(e.y), 6 + e.n * 2, { color: '#ffb347', speed: 0.8, up: 2.2, grav: -0.5, size: 0.12, life: 1 }); }); break;
      case 'oil': later(at + 0.1, () => { playSfx('oil'); pop(t('oilPop', { n: e.n }), e.x, e.y, 'good', 1.2); emit(W(e.x), 0.4, Z(e.y), 10, { color: '#ffc45c', speed: 1.2, up: 1.8 }); removeItemView(e.x, e.y); tipEvent('oil'); }); break;
      case 'brazier': { const v = views.get('p'); if (v) { faceTo(v, e.dx, e.dy); v.lunge = { at: vclock + at, t: 0, dx: e.dx, dz: e.dy }; } later(at + 0.1, () => { lightBrazierView(e.x, e.y); playSfx('brazier'); emit(W(e.x), 1, Z(e.y), 18, { color: '#ff9a3c', speed: 1.5, up: 2.5, grav: 0.5 }); updateLightTargets(); }); break; }
      case 'unseal': later(at + 0.3, () => { playSfx('unseal'); refreshStairs(); pop(t('unsealed'), e.x, e.y, 'good', 0.8, 1.6); emit(W(e.x), 0.2, Z(e.y), 20, { color: '#5fe0c8', speed: 1.4, up: 2 }); }); break;
      case 'sealed': later(at + 0.1, () => { playSfx('block', 0.6); pop(e.boss ? t('bossFirst') : t('sealed'), e.x, e.y, 'info', 1.4, 1.8); }); break;
      case 'flare': later(at, () => { playSfx('flare'); flareT = 0.5; shake(0.12); const p = run.floor.player; emit(W(p.x), 0.6, Z(p.y), 40, { color: '#e8f6ff', speed: 5, up: 1, grav: 0, size: 0.2, life: 0.5 }); }); break;
      case 'stun': later(at + 0.1, () => { pop(t('stunned'), e.x, e.y, 'info', 1.3, 0.9); }); break;
      case 'stagger': break;
      case 'block': later(at + 0.08, () => { playSfx('block'); pop(t('blocked'), e.x, e.y, 'info', 1.3); }); break;
      case 'atk': {
        const v = views.get(e.id), p = run.floor.player;
        if (v) { const dx = Math.sign(p.x - e.x), dz = Math.sign(p.y - e.y); v.lunge = { at: vclock + at, t: 0, dx: dx * 0.8, dz: dz * 0.8 }; }
        later(at + 0.05, () => {
          playSfx(e.kind === 'line' || e.kind === 'line4' ? 'spit' : e.kind === 'adj' ? 'bite' : 'sweep');
          for (const [x, y] of e.tiles) emit(W(x), 0.15, Z(y), 3, { color: EYE[views.get(e.id)?.kind] || '#ff5a48', speed: 0.6, up: 1.2, size: 0.16, life: 0.4 });
        });
        break;
      }
      case 'hurt': later(at + 0.1, () => { const v = views.get('p'); if (v) v.hit = 0.35; playSfx('hurt'); shake(0.25); vignette('hurt'); pop(t('hurtPop'), e.x, e.y, 'hurt', 1.4); }); break;
      case 'ward': later(at + 0.1, () => { playSfx('ward'); pop(t('ward'), e.x, e.y, 'good', 1.4); emit(W(e.x), 0.6, Z(e.y), 14, { color: '#c59bff', speed: 2, up: 1 }); }); break;
      case 'phoenix': later(at + 0.2, () => { playSfx('relit'); pop(t('relit'), e.x, e.y, 'good', 1.5, 1.6); emit(W(e.x), 0.6, Z(e.y), 30, { color: '#ff9a3c', speed: 2, up: 3 }); }); break;
      case 'death': later(at + 0.2, () => { playSfx('out'); const v = views.get('p'); if (v) { v.g.userData.halo.visible = false; v.g.userData.core.material.color.set('#3a2f5c'); } lampLight.intensity = 0; }); later(1.4, () => endRun(false)); break;
      case 'boom': later(at + 0.05, () => { playSfx('boom'); shake(0.35); emit(W(e.x), 0.4, Z(e.y), 30, { color: '#ff8a3c', speed: 3.5, up: 2, size: 0.26 }); emit(W(e.x), 0.4, Z(e.y), 20, { color: '#2a1846', speed: 2.5, up: 2, size: 0.3, ink: true }); }); break;
      case 'emove': { const k = steps.get(e.id) || 0; steps.set(e.id, k + 1); moveView(e.id, e.x, e.y, vclock + at + k * 0.11, 'hop'); break; }
      case 'summon': later(at, () => { syncViews(false); emit(W(e.x), 0.3, Z(e.y), 14, { color: '#2a1846', speed: 1.6, up: 1.6, size: 0.26, ink: true }); }); break;
      case 'crack': later(at + 0.1, () => { const i = e.y * FV.w + e.x; FV.drop[i] = 0.001; const dec = FV.cracks.get(i); if (dec) dec.visible = false; playSfx('crack'); emit(W(e.x), 0, Z(e.y), 10, { color: '#7a6a5c', speed: 1, up: 0.5, size: 0.14, ink: true }); }); break;
      case 'creep': later(at + 0.1, () => { playSfx('tick'); pop(t('creepPop'), run.floor.player.x, run.floor.player.y, 'info', 1.8, 1.4); if (!playEvents.saidCreep) { playEvents.saidCreep = true; say('creep'); } }); break;
      case 'wake': later(at + 0.1, () => playSfx('warn', 0.6)); break;
      case 'boss_dead': later(at + 0.4, () => { playSfx('bossDead'); shake(0.4); banner(t('bossDown', { name: t(`b_${e.type}`) }), ''); say('boss'); happytime(); refreshStairs(); updateBossBar(); emit(W(e.x), 0.6, Z(e.y), 50, { color: '#c59bff', speed: 3, up: 3, size: 0.24, life: 1.2 }); }); break;
      case 'descend': later(at + 0.3, () => { playSfx('stairs'); onDescend(); }); tipEvent('descend'); break;
      default: break;
    }
  }
  later(T(2) + 0.12, () => { refreshIntents(); updateHud(); scanTips(); });
  later(0.02, () => { updateLightTargets(); updateHud(); });
  if (run.turns % 6 === 0) persistRun();
}
function removeItemView(x, y) { const i = FV.items.findIndex((g) => g.userData.o.x === x && g.userData.o.y === y); if (i >= 0) { floorGroup.remove(FV.items[i]); FV.items.splice(i, 1); } }
function lightBrazierView(x, y) { const g = FV.braziers.find((b) => b.userData.b.x === x && b.userData.b.y === y); if (g) { g.userData.flame.visible = true; g.userData.halo.visible = true; g.userData.coal.material.emissiveIntensity = 1; g.userData.b.lit = true; } }

function onDescend() {
  if (!run || ended) return;
  persistRun();
  $('fade').classList.add('on');
  later(0.4, () => {
    if (run.depth === D.CFG.depths && run.won && !run.wonShown) { run.wonShown = true; $('fade').classList.remove('on'); endRun(true); return; }
    if (D.shrineAfter(run.depth)) openShrine();
    else nextDepth();
  });
}
function nextDepth() {
  D.enterDepth(run, run.depth + 1);
  checkUnlocks();
  enterFloorView(); setState(State.PLAYING); $('fade').classList.remove('on'); afterFloorEnter(false);
  playEvents.saidCreep = false;
}
function checkUnlocks() { // reaching a depth counts: lanterns and waystones open as you go deeper
  const reached = run.depth;
  if (reached <= save.best) return;
  const before = save.best; save.best = reached;
  for (const [id, l] of Object.entries(D.LANTERNS)) if (l.unlock > before && l.unlock <= reached) toast(t('newLantern', { name: lanternName(id) }));
  for (const w of D.WAYSTONES) if (w > before && w <= reached) later(1.5, () => toast(t('newWay', { d: w })));
  persist();
}
function openShrine() {
  $('fade').classList.remove('on');
  shrineOffer = D.offerRelics(run);
  setState(State.SHRINE); renderShrine(); say('shrine', 0.5);
  if (tipState) nextTip();
  if (!save.tipsSeen.shrine && !save.tipsOff) { save.tipsSeen.shrine = 1; toast(t('t_shrine')); }
  if (AUTOPLAY) later(1.6, () => { if (state !== State.SHRINE) return; const pick = D.offerRelics(run); D.botShrine(run); playSfx('relic'); leaveShrine(); void pick; });
}
function renderShrine() {
  $('relicCards').innerHTML = shrineOffer.map((id) => `<button data-r="${id}">${ico(RELIC_ICONS[id])}<b>${t(`r_${id}`)}</b><span>${t(`rd_${id}`)}</span></button>`).join('');
  $('relicCards').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { unlockAudio(); if (D.takeRelic(run, b.dataset.r)) { playSfx('relic'); updateRelicStrip(); leaveShrine(); } }));
  const canOil = run.embers >= D.CFG.oilPrice && run.oil < run.maxOil, canRe = run.embers >= D.CFG.rerollPrice;
  $('buyOilText').textContent = t('buyOil', { n: D.CFG.oilPrice }); $('btnBuyOil').disabled = !canOil;
  $('rerollText').textContent = t('reroll', { n: D.CFG.rerollPrice }); $('btnReroll').disabled = !canRe;
  $('btnBuyOil').title = `${run.oil}/${run.maxOil}`;
  updateHud();
}
click('btnBuyOil', () => { if (D.buyOil(run)) { playSfx('oil'); renderShrine(); } });
click('btnReroll', () => { if (run.embers < D.CFG.rerollPrice) return; run.embers -= D.CFG.rerollPrice; run.rerolls = (run.rerolls || 0) + 1; shrineOffer = D.offerRelics(run); playSfx('ember'); renderShrine(); });
click('btnLeave', () => leaveShrine());
function leaveShrine() { updateRelicStrip(); nextDepth(); }

function endRun(won) {
  if (ended) return;
  ended = true;
  const prevBest = run.prevBest ?? save.best;
  save.kills += run.kills;
  if (won) {
    save.wins++; if (!save.bestTime || run.time < save.bestTime) save.bestTime = run.time;
    playSfx('win'); say('win'); happytime();
  } else { playSfx('outTune'); say(Math.random() < 0.5 ? 'out1' : 'out2'); }
  if (run.daily) { const k = today(); save.daily[k] = Math.max(save.daily[k] || 0, run.depth); }
  save.best = Math.max(save.best, run.depth);
  save.run = won ? run : null;
  persist();
  $('overTitle').textContent = won ? t('overWin') : t('overOut');
  $('finalDepth').textContent = run.depth;
  $('overLine').textContent = won ? t('winLine', { time: fmt(run.time) }) : t('killedBy', { who: t(`e_${run.killer || 'creep'}`), d: run.depth });
  const st = [['st_kills', run.kills], ['st_pits', run.stats.pits], ['st_embers', run.embers], ['st_relics', Object.values(run.relics).reduce((a, b) => a + b, 0)],
    ['st_turns', run.turns], ['st_time', fmt(run.time)], ['st_hits', run.stats.hits], ['st_seed', run.daily ? t('dailyTag') : run.seed]];
  $('overStats').innerHTML = st.map(([k, v]) => `<div><b>${v}</b><small>${t(k)}</small></div>`).join('');
  const isBest = run.depth > prevBest;
  $('overBest').textContent = isBest ? t('newBest') : t('deepest', { d: save.best });
  if (isBest && !won && run.depth >= 5) happytime();
  $('btnDeeper').hidden = !won;
  setState(State.GAMEOVER);
}
let lastCfg = { lantern: 'brass', start: 1 };
click('btnPlay', () => { if (save.run) continueRun(); else { lastCfg = { lantern: save.lantern && lanternOpen(save.lantern) ? save.lantern : 'brass', start: 1 }; newRunFrom({ ...lastCfg, seed: D.randomSeed() }); } });
click('btnNew', () => { save.run = null; lastCfg = { lantern: lanternOpen(save.lantern) ? save.lantern : 'brass', start: 1 }; newRunFrom({ ...lastCfg, seed: D.randomSeed() }); });
click('btnDaily', () => { save.run = null; lastCfg = { lantern: 'brass', start: 1, daily: true }; newRunFrom({ ...lastCfg, seed: D.dailySeed(today()) }); });
click('btnSetup', () => openSetup());
click('btnSetupBack', () => { $('setup').hidden = true; setState(State.MENU); });
click('btnRandomSeed', () => { $('seedInput').value = D.randomSeed(); });
click('btnSetupGo', () => {
  save.run = null; $('setup').hidden = true;
  const seed = D.cleanSeed($('seedInput').value) || D.randomSeed();
  lastCfg = { lantern: setupSel.lantern, start: setupSel.start };
  newRunFrom({ ...lastCfg, seed });
});
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { persistRun(); showMenu(); });
click('btnSound', () => { save.sound = !save.sound; if (save.sound) unmuteAudio('user'); else muteAudio('user'); persist(); refreshPause(); });
click('btnVoice', () => { save.voice = !save.voice; audio.voiceOn = save.voice; persist(); refreshPause(); });
click('btnTips', () => { save.tipsOff = !save.tipsOff; if (save.tipsOff) { tipQueue = []; nextTip(); } persist(); refreshPause(); });
click('btnSkipTips', () => { save.tipsOff = true; tipQueue = []; nextTip(); persist(); });
click('btnMenu', () => { save.run = null; persist(); showMenu(); }); // navigation: never an ad here
click('btnRetry', () => triggerMidgameAd(() => { save.run = null; newRunFrom({ ...lastCfg, seed: lastCfg.daily ? D.dailySeed(today()) : D.randomSeed() }); })); // between runs
click('btnDeeper', () => { ended = false; save.run = null; nextDepth(); });

// ================================================================ LOOP
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _camWant = new THREE.Vector3();
function fitCamera(snap = false) {
  const n = Math.max(FV.w, FV.h) || 7, aspect = innerWidth / innerHeight, menu = state === State.MENU || state === State.BOOT || demo;
  const half = (n / 2 + 0.6), vfov = THREE.MathUtils.degToRad(CFG.fov / 2);
  let dist = half / Math.tan(vfov) * 1.05;
  const hfov = Math.atan(Math.tan(vfov) * aspect);
  dist = Math.max(dist, (half + (menu ? 0 : 0.8)) / Math.tan(hfov) * 1.05);
  dist *= menu ? (aspect > 1 ? 1.08 : 1) : 1.12;
  const dir = _v.set(0, 1.25, 0.95).normalize();
  const shiftX = menu && aspect > 1 ? -n * 0.42 * Math.min(1.4, aspect / 1.4) : 0, shiftZ = menu && aspect <= 1 ? -n * 0.32 : 0;
  camLook.set(shiftX, 0, shiftZ + (menu ? 0.35 : 1.0)); // in play the board sits a little higher: the action bar and tips live below it
  _camWant.copy(dir).multiplyScalar(dist).add(camLook);
  if (snap) camPos.copy(_camWant); else camPos.lerp(_camWant, 0.1);
}
function updateCamera(dt) {
  fitCamera(false);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  camera.position.copy(camPos);
  if (demo) { const a = vclock * 0.08; camera.position.x += Math.sin(a) * 0.6; camera.position.y += Math.sin(a * 0.7) * 0.25; }
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook);
}
function updateLights(dt) {
  const pv = views.get('p');
  if (pv && run) {
    const r = D.lightRadius(run), flick = 1 + Math.sin(vclock * 11) * 0.04 + Math.sin(vclock * 6.7) * 0.05, low = run.oil <= CFG.lowOil;
    lampLight.position.set(pv.g.position.x + 0.3, 2.3, pv.g.position.z + 0.5); // above the head: no hot spot on the face
    if (run.phase !== 'dead') { lampLight.intensity = (7 + r * 5) * flick * (low ? 0.75 + Math.abs(Math.sin(vclock * 5)) * 0.25 : 1); lampLight.distance = r + 3.4; }
  }
  for (let i = 0; i < brazierLights.length; i++) {
    const b = FV.braziers[i], l = brazierLights[i];
    if (b && b.userData.b.lit) { l.position.set(b.position.x, 1.3, b.position.z); l.intensity = 7 * (1 + Math.sin(vclock * 9 + i) * 0.08); b.userData.flame.scale.set(1, 1 + Math.sin(vclock * 12 + i) * 0.12, 1); }
    else l.intensity = 0;
  }
  for (const it of FV.items) { it.userData.drop.position.y = 0.55 + Math.sin(vclock * 2.6 + it.position.x) * 0.06; it.userData.drop.rotation.y += dt; }
  if (FV.stairs) { const u = FV.stairs.userData; u.halo.material.opacity = (u.seal.visible ? 0.28 : 0.5) + Math.sin(vclock * 2.5) * 0.08; u.seal.rotation.z += dt * 0.6; }
  flareT = Math.max(0, flareT - dt);
  if (pv) flareLight.position.set(pv.g.position.x, 1.6, pv.g.position.z);
  flareLight.intensity = flareT > 0 ? flareT * 90 : 0;
  for (let i = 0; i < MOTES; i++) { motePos[i * 3 + 1] += dt * 0.25; if (motePos[i * 3 + 1] > 5) motePos[i * 3 + 1] = -6; }
  moteGeo.attributes.position.needsUpdate = true;
}
function step(dt) { // fixed step: timers, the bot, run clock
  vclock += dt;
  runTimers();
  if (state === State.PLAYING && run && !demo) {
    run.time += dt;
    if (queued && vclock >= busyUntil - 0.12 && run.phase === 'play') { const a = queued; queued = null; doAct(a); }
    if (AUTOPLAY && run.phase === 'play' && vclock >= busyUntil && (botT -= dt) <= 0) { botT = CFG.botEvery; doAct(D.botAction(run, { deep: true })); }
  }
  if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) $('sub').hidden = true; }
}
let acc = 0, last = performance.now(), timerT = 0;
function advance(dt) {
  if (state === State.PAUSED) return;
  acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; }
  updateViews(dt); updateParticles(dt); shadeFloor(dt); placeTiles(dt); pulseMarks(dt); updateTips(dt); updateMusic(dt);
  if ((timerT += dt) > 0.25) { timerT = 0; updateTimer(); }
}
function render(dt) { updateCamera(dt); updateLights(dt); updatePops(dt); renderer.render(scene, camera); }
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); fitCamera(true); }
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistRun(); });

// ================================================================ CAPTURE (press kit: tools/capture.mjs drives frames; covers are staged here)
function stageCover(kind) {
  demo = true; state = State.GAMEOVER;
  for (const id of ['menu', 'hud', 'actions', 'depthMap', 'relicStrip', 'tip', 'sub', 'banner', 'paused', 'gameover', 'shrine', 'setup', 'toast']) $(id).hidden = true;
  clearPops(); timers.length = 0;
  run = D.newRun({ seed: 'COVER', lantern: 'brass' }); D.enterDepth(run, 14);
  const n = 7, f = run.floor;
  f.w = n; f.h = n; f.grid = Array.from({ length: n }, () => Array(n).fill('.'));
  f.grid[0][5] = 'S'; f.stairs = { x: 5, y: 0 }; f.grid[1][1] = '#'; f.grid[5][5] = '#'; f.grid[4][1] = '_'; f.grid[5][1] = '_'; f.grid[2][5] = '%';
  f.grid[1][3] = 'B'; f.braziers = [{ x: 3, y: 1, lit: true }]; f.items = [{ x: 5, y: 4, kind: 'oil' }];
  f.player = { x: 3, y: 4 }; f.sealed = false;
  const mk = (type, x, y, intent) => { const e = { id: 700 + x * 10 + y, type, x, y, hp: D.ENEMIES[type].hp, max: D.ENEMIES[type].hp, intent, stun: 0, cd: 0, face: [0, 1] }; f.enemies.push(e); return e; };
  f.enemies = [];
  mk('flitter', 2, 4, { tiles: [[3, 4]], kind: 'adj' });
  mk('wisp', 3, 2, { tiles: [[3, 3], [3, 4], [3, 5], [3, 6]], kind: 'line' });
  mk('gloom', 0, 2, null); mk('hound', 6, 5, null); mk('crab', 5, 3, null);
  run.relics = {}; run.oil = 5;
  buildFloorView(f, 14); clearViews(); syncViews(true); refreshStairs(); updateLightTargets(true); refreshIntents();
  const pv = views.get('p'); pv.face = pv.wantFace = -0.4; // three-quarters toward the camera, turned to the flitter
  views.get(700 + 20 + 4).face = Math.PI / 2; views.get(700 + 30 + 2).face = 0;
  const aspect = kind === 'portrait' ? 800 / 1200 : kind === 'square' ? 1 : 1920 / 1080;
  const look = new THREE.Vector3(0, 0.4, kind === 'portrait' ? 0.9 : 0.6), dir = new THREE.Vector3(0.18, 0.95, 1).normalize();
  const dist = kind === 'portrait' ? 12.5 : kind === 'square' ? 10.2 : 9.2;
  camLook.copy(look); camPos.copy(dir.multiplyScalar(dist).add(look));
  camera.aspect = aspect; camera.updateProjectionMatrix();
  for (let i = 0; i < 40; i++) { vclock += 1 / 30; shadeFloor(1 / 30); placeTiles(0); updateViews(1 / 30); updateLights(1 / 30); pulseMarks(); }
  emit(W(3), 1.2, Z(1), 24, { color: '#ff9a3c', speed: 0.8, up: 1.6, grav: -0.4, size: 0.14, life: 2 });
  updateParticles(0.3);
  camera.position.copy(camPos); camera.lookAt(camLook);
  renderer.render(scene, camera);
}

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n(); fillIcons();
  if (isTouch) document.body.classList.add('touch');
  initAudio();
  const loads = Object.entries(ASSETS.sfx).map(([k, u]) => { const p = loadSfx(k, u); p.finally(() => { $('loadBar').style.width = `${Math.min(100, ($('loadBar').dataset.n = (+$('loadBar').dataset.n || 0) + 1) * 100 / Object.keys(ASSETS.sfx).length)}%`; }); return p; });
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 12000))]); // never hang on a slow asset
  save = { ...DEFAULT_SAVE, ...(loadData(`${SAVE_KEY}:save`, null) || {}) };
  if (CAPTURE) save = { ...DEFAULT_SAVE };
  if (save.run && (save.run.v !== 1 || !save.run.floor)) save.run = null;
  audio.voiceOn = save.voice !== false; if (!save.sound) muteAudio('user');
  buildDepthMap(); resize();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  showMenu();
  if (CAPTURE) { // capture protocol used by tools/capture.mjs: no rAF loop, the tool drives every frame
    window.__game = {
      start: () => { save.tipsOff = false; newRunFrom({ seed: 'EMBER7', lantern: 'brass', start: 1 }); },
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { SIMMING = true; for (let s = 0; s < sec; s += STEP) { advance(STEP); if (state === State.GAMEOVER) newRunFrom({ seed: 'EMBER8', lantern: 'brass', start: 11 }); } SIMMING = false; clearPops(); refreshIntents(); updateHud(); if (tipState) showTip(); },
      sim: (sec) => { SIMMING = true; for (let s = 0; s < sec && state !== State.GAMEOVER; s += STEP) advance(STEP); SIMMING = false; return window.__game.info(); },
      info: () => ({ state, depth: run?.depth, oil: run?.oil, turns: run?.turns, kills: run?.kills, time: run?.time }),
      cover: (kind) => stageCover(kind),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
