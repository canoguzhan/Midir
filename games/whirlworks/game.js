// Whirlworks: an idle spinning-top workshop. Tops spin around a turned wooden bowl by themselves and smash toy blocks
// into coins; you whip them for speed, buy new tops, drag twins together to merge them into finer tops, and upgrade the
// workshop. Each stage ends with a Great Block; every 3 stages a new arena (5 in all, each with its own twist). The Grand
// Tournament resets the workshop for trophies that boost everything forever. Coins keep coming while you are away.
// Sections: CONFIG, DATA, I18N, SDK, AUDIO, WORLD, ARENA, MODELS, FX, ECONOMY, SIM, STATE, UI, INPUT, ONBOARDING, BOT,
// LOOP, COVER, BOOT. Everything on screen is procedural; sounds load from ./assets/ with synth fallbacks.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = 'whirlworks';
const STEP = 1 / 60; // fixed simulation step: identical behaviour at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // capture protocol: no rAF loop, the tool drives frames; a bot plays
const AUTOPLAY = (CAPTURE && !params.has('nobot')) || params.has('autoplay');
const BOT_SKILL = +(params.get('skill') || 0.6); // how often the bot plays actively (whips, taps)
const CFG = {
  bowlR: 7.3, flatR: 4.4, slope: 0.13, wall: 7.15,
  hp0: 3, hpG: 3.5, val0: 2, valG: 2.4, tierG: 2.1,
  spin0: 11, spawn0: 1.5, cap0: 5, relaunch0: 3.2, slots0: 4, maxSlots: 12, maxTier: 15,
  goal: (s) => 26 + 5 * Math.min(s, 12), greatHp: 30, greatVal: 30,
  buy0: 5, buyG: 1.13, clash: 0.15, trophyBoost: 0.1, offlineEff: 0.5,
  tourneyStage: 7, trophies: (s) => (s < 7 ? 0 : Math.floor(1.5 * Math.pow(s - 6, 1.3))),
};
if (CAPTURE && params.get('cfg')) try { Object.assign(CFG, JSON.parse(params.get('cfg'))); } catch {}
const SFX_FILES = {
  clash: 'assets/audio/whirl_clash.mp3', clashHeavy: 'assets/audio/whirl_clash_heavy.mp3', launch: 'assets/audio/whirl_launch.mp3',
  topple: 'assets/audio/whirl_topple.mp3', confetti: 'assets/audio/whirl_confetti.mp3', cheer: 'assets/audio/whirl_cheer.mp3',
  perfect: 'assets/audio/whirl_perfect.mp3', dash: 'assets/audio/whirl_dash.mp3', coin: 'assets/audio/coin.mp3', fling: 'assets/audio/coin_fling.mp3',
  merge: 'assets/audio/siege_merge.mp3', upgrade: 'assets/audio/upgrade.mp3', unlock: 'assets/audio/unlock.mp3', level: 'assets/audio/level_up.mp3',
  victory: 'assets/audio/victory.mp3', frenzy: 'assets/audio/frenzy.mp3', click: 'assets/audio/card_pick.mp3', portal: 'assets/audio/portal.mp3',
  crack: 'assets/audio/works_block_crack.mp3', great: 'assets/audio/works_great_block.mp3', jar: 'assets/audio/works_coin_jar.mp3',
  whip: 'assets/audio/works_whip.mp3', register: 'assets/audio/works_register.mp3', fanfare: 'assets/audio/works_fanfare.mp3',
};
const MUSIC_FILES = { bench: 'assets/audio/bgm_works_bench.mp3', clock: 'assets/audio/bgm_works_clock.mp3' };
const SFX_GAIN = { clash: 1.4, clashHeavy: 0.35, launch: 0.35, topple: 0.3, confetti: 0.5, cheer: 0.35, perfect: 0.4, dash: 0.3, coin: 0.22, fling: 0.4,
  merge: 0.7, upgrade: 0.45, unlock: 0.5, level: 0.4, victory: 0.4, frenzy: 0.4, click: 0.8, portal: 0.4, crack: 0.45, great: 0.6, jar: 0.5, whip: 1.6,
  register: 0.6, fanfare: 0.5 };

// ================================================================ DATA (arenas, tiers, upgrades, automations, perks)
const ARENAS = [
  { id: 'bench', music: 'bench', bowl: ['#d99a55', '#b8743a', '#f0c48a'], rim: '#8a5328', blocks: ['#f1d29a', '#e0574a', '#3d7fd6'], pip: '#fff7e6', lamp: '#ffd9a0', fill: ['#ffe6c8', '#3a2414'], twist: null },
  { id: 'drum', music: 'bench', bowl: ['#f3e6c8', '#e8d6ae', '#fff3d6'], rim: '#c8323a', blocks: ['#7fd1c4', '#f2c14e', '#9a6ad6'], pip: '#ffffff', lamp: '#ffe2b0', fill: ['#ffeedd', '#3a2018'], twist: 'bumpers' },
  { id: 'clock', music: 'clock', bowl: ['#c9a04a', '#9c7a2e', '#e8c472'], rim: '#6b4a1a', blocks: ['#b8c4d0', '#d6874a', '#5aa86a'], pip: '#fff0c8', lamp: '#ffd08a', fill: ['#fff0d0', '#2a1c10'], twist: 'turning' },
  { id: 'candy', music: 'clock', bowl: ['#fbf3f6', '#f1e2ea', '#ffffff'], rim: '#ff8fb8', blocks: ['#ffb3c8', '#a8e0ff', '#c8f0a0'], pip: '#ffffff', lamp: '#fff0e0', fill: ['#fff4f8', '#3a2430'], twist: 'golden' },
  { id: 'stars', music: 'clock', bowl: ['#26306a', '#1c2456', '#3a4590'], rim: '#e0b84a', blocks: ['#8fa8ff', '#ff9ad6', '#ffe08a'], pip: '#fffbe0', lamp: '#c8d4ff', fill: ['#c8d0ff', '#120c24'], twist: 'comets' },
];
const arenaOf = (stage) => Math.min(ARENAS.length - 1, Math.floor((stage - 1) / 3));
const TIERS = [ // body, stripe, accent, profile (0 classic, 1 disc, 2 onion, 3 double cone), ring, gems, crown
  ['#f6e7c8', '#3f86d6', '#2a4f8a', 0, 0, 0, 0], ['#e0474a', '#fff1e0', '#8a1a20', 0, 0, 0, 0], ['#9fb6c8', '#e8f0f6', '#4a6070', 1, 1, 0, 0],
  ['#d9a441', '#fff0b0', '#7a5010', 1, 1, 0, 0], ['#3fae84', '#c8f0d8', '#1a5a40', 2, 1, 3, 0], ['#c81e4a', '#ffd36b', '#5a0a20', 2, 1, 4, 0],
  ['#7fd4ff', '#ffffff', '#2a6a9a', 3, 2, 4, 0], ['#ff9a2a', '#ffe680', '#a04a0a', 3, 2, 6, 1], ['#6a4ad6', '#ffd36b', '#2a1a6a', 0, 2, 6, 1],
  ['#2a2a5a', '#ff8fd0', '#ffd36b', 1, 2, 8, 1], ['#f0f0ff', '#8fe0ff', '#ff8fd0', 2, 2, 8, 1], ['#3ad6b0', '#fff6c8', '#1a4a8a', 3, 3, 8, 1],
  ['#ffd36b', '#ffffff', '#c86a0a', 0, 3, 10, 1], ['#14143a', '#9fd0ff', '#ffd36b', 2, 3, 10, 1], ['#ffffff', '#ffd36b', '#ff6b9a', 3, 3, 12, 1],
];
const UPGRADES = [ // id, icon, base cost, growth, max level
  { id: 'tips', icon: 'tip', base: 20, g: 2.4, max: 60 },
  { id: 'value', icon: 'gem', base: 35, g: 2.4, max: 60 },
  { id: 'spin', icon: 'swirl', base: 15, g: 2.2, max: 15 },
  { id: 'spawn', icon: 'block', base: 30, g: 2.5, max: 10 },
  { id: 'tap', icon: 'finger', base: 12, g: 2.2, max: 60 },
  { id: 'launch', icon: 'launch', base: 45, g: 2.4, max: 8 },
  { id: 'crit', icon: 'spark', base: 120, g: 2.6, max: 10 },
  { id: 'pegs', icon: 'peg', base: 80, g: 4.5, max: CFG.maxSlots - CFG.slots0 },
];
const AUTOS = [ // one-off machines, shown once their stage is reached
  { id: 'autoWhip', icon: 'whip', stage: 3, cost: 2500 },
  { id: 'autoMerge', icon: 'merge', stage: 5, cost: 2.5e5 },
  { id: 'autoBuy', icon: 'top', stage: 8, cost: 2e8 },
];
const PERKS = [ // milestones by total trophies (kept forever)
  { at: 1, id: 'head' }, { at: 4, id: 'keepWhip' }, { at: 9, id: 'keepMerge' }, { at: 15, id: 'night' }, { at: 25, id: 'tier3' },
];

// ================================================================ I18N (English required; Turkish welcome)
const STRINGS = {
  en: {
    play: 'Play', continue: 'Continue', settings: 'Settings', paused: 'Paused', resume: 'Resume', menu: 'Menu', back: 'Back', collect: 'Collect',
    music: 'Music', sfx: 'Sounds', graphics: 'Graphics', gfxAuto: 'Auto', gfxHigh: 'High', gfxLow: 'Low', perSec: '/s',
    tagline: 'Spin tops, smash toy blocks, build the grandest workshop.', workshop: 'Workshop', buyTop: 'New top', skipTips: 'Skip tips',
    stage: 'Stage {n}', great: 'Great Block', blocks: '{a} / {b} blocks', slotsFull: 'All pegs are full: merge twins or buy an Extra Peg',
    notEnough: 'Not enough coins yet', adUnavailable: 'Ad not available right now', saved: 'Saved',
    menuBest: 'Best stage', menuTrophies: 'Trophies',
    ctl_whip: 'whip a top', ctl_merge: 'merge twins', ctl_buy: 'buy', ctl_pause: 'pause', ctl_click: 'Click', ctl_drag: 'Drag', ctl_tap: 'Tap',
    sect_up: 'Upgrades', sect_auto: 'Machines', sect_perk: 'Trophy perks',
    up_tips: 'Sharper Tips', upd_tips: 'Tops hit harder', up_value: 'Painted Blocks', upd_value: 'Blocks pay more coins',
    up_spin: 'Longer Spin', upd_spin: 'Tops spin longer before they topple', up_spawn: 'Block Chute', upd_spawn: 'More blocks, more often',
    up_tap: 'Finger Flick', upd_tap: 'Your taps on blocks hit harder', up_launch: 'Spring Launcher', upd_launch: 'Toppled tops relaunch sooner',
    up_crit: 'Lucky Sparks', upd_crit: 'Chance of a x5 critical hit', up_pegs: 'Extra Peg', upd_pegs: 'Room for one more top',
    au_autoWhip: 'Whip Arm', aud_autoWhip: 'Whips your slowest top every 6 s', au_autoMerge: 'Merge Bot', aud_autoMerge: 'Merges twin tops by itself',
    au_autoBuy: 'Top Lathe', aud_autoBuy: 'Turns a new top whenever a peg is free and it is cheap', unlockAt: 'Opens at stage {n}', owned: 'Owned', max: 'Max',
    pk_head: 'Head start: begin with 3 tops', pk_keepWhip: 'The Whip Arm stays after tournaments', pk_keepMerge: 'The Merge Bot stays after tournaments',
    pk_night: 'Coins keep coming for up to 8 h away', pk_tier3: 'New workshops start with tier 3 tops', perkAt: '{n} trophies',
    tourneyBtn: 'Grand Tournament', tourneyTitle: 'Grand Tournament',
    tourneyText: 'Enter your tops in the Grand Tournament. Your workshop starts over, but every trophy you win makes all tops and blocks stronger, forever.',
    tourneyWin: 'Trophies you win', tourneyBoost: 'Workshop bonus', tourneyGo: 'Enter the tournament', notYet: 'Not yet', tourneyPerk: 'New perk: {p}',
    tourneyDone: 'Tournament won!', tourneyDoneSub: '+{n} trophies on the shelf',
    awayTitle: 'Welcome back!', awayText: 'Your tops kept spinning for {t} while you were away.', awayDouble: 'Watch an ad: double it',
    clearedTitle: 'Great Block smashed!', clearedNext: 'Next up: {a}', clearedStage: 'On to stage {n}.', clearTriple: 'Watch an ad: triple the prize',
    newTier: 'New top!', arenaBanner: 'Stage {n}', greatBanner: 'The Great Block!', greatSub: 'Smash it for a big prize', mult: 'Trophy bonus x{m}',
    tip_whip: 'Click a spinning top to whip it', tip_whip_t: 'Tap a spinning top to whip it', tip_buy: 'Buy a new top', tip_buy2: 'Buy one more top',
    tip_merge: 'Drag a top onto its twin to merge them', tip_upgrade: 'Upgrade your workshop', tip_tap: 'Click blocks to flick them too', tip_tap_t: 'Tap blocks to flick them too',
    tip_tourney: 'The Grand Tournament is open',
    ar_bench: 'Workbench Bowl', ar_drum: 'Tin Drum', ar_clock: 'Clockwork Plate', ar_candy: 'Candy Saucer', ar_stars: 'Starlight Music Box',
    tw_bumpers: 'Springy bumpers fling your tops', tw_turning: 'The plate turns and carries everything round', tw_golden: 'Golden blocks pay ten times more',
    tw_comets: 'Shooting-star blocks streak across', hours: '{h} h {m} min', minutes: '{m} min',
    t1: 'Pine Twirler', t2: 'Cherry Spinner', t3: 'Tin Whirl', t4: 'Brass Gyro', t5: 'Jade Dervish', t6: 'Ruby Royal', t7: 'Frost Comet', t8: 'Sunburst',
    t9: 'Thunder Crown', t10: 'Nebula Queen', t11: 'Prism Emperor', t12: 'Aurora Titan', t13: 'Star Sovereign', t14: 'Galaxy Grand', t15: 'The Eternal Whirl',
    fx_dmg: 'x{a} → x{b}', fx_val: 'x{a} → x{b}', fx_spin: '{a} s → {b} s', fx_spawn: '{a} blocks → {b}', fx_crit: '{a}% → {b}%', fx_launch: '{a} s → {b} s', fx_pegs: '{a} → {b} pegs',
  },
  tr: {
    play: 'Oyna', continue: 'Devam', settings: 'Ayarlar', paused: 'Duraklatıldı', resume: 'Devam et', menu: 'Menü', back: 'Geri', collect: 'Topla',
    music: 'Müzik', sfx: 'Sesler', graphics: 'Grafik', gfxAuto: 'Otomatik', gfxHigh: 'Yüksek', gfxLow: 'Düşük', perSec: '/sn',
    tagline: 'Topaç çevir, oyuncak blokları kır, en büyük atölyeyi kur.', workshop: 'Atölye', buyTop: 'Yeni topaç', skipTips: 'İpuçlarını geç',
    stage: 'Bölüm {n}', great: 'Dev Blok', blocks: '{a} / {b} blok', slotsFull: 'Tüm yuvalar dolu: ikizleri birleştir ya da Ek Yuva al',
    notEnough: 'Henüz yeterli altın yok', adUnavailable: 'Şu anda reklam yok', saved: 'Kaydedildi',
    menuBest: 'En iyi bölüm', menuTrophies: 'Kupalar',
    ctl_whip: 'topacı kamçıla', ctl_merge: 'ikizleri birleştir', ctl_buy: 'satın al', ctl_pause: 'duraklat', ctl_click: 'Tıkla', ctl_drag: 'Sürükle', ctl_tap: 'Dokun',
    sect_up: 'Geliştirmeler', sect_auto: 'Makineler', sect_perk: 'Kupa ayrıcalıkları',
    up_tips: 'Sivri Uçlar', upd_tips: 'Topaçlar daha sert vurur', up_value: 'Boyalı Bloklar', upd_value: 'Bloklar daha çok altın verir',
    up_spin: 'Uzun Dönüş', upd_spin: 'Topaçlar devrilmeden önce daha uzun döner', up_spawn: 'Blok Oluğu', upd_spawn: 'Daha çok blok, daha sık',
    up_tap: 'Parmak Fiskesi', upd_tap: 'Bloklara dokunuşun daha sert vurur', up_launch: 'Yaylı Fırlatıcı', upd_launch: 'Devrilen topaçlar daha çabuk fırlar',
    up_crit: 'Şanslı Kıvılcım', upd_crit: 'x5 kritik vuruş şansı', up_pegs: 'Ek Yuva', upd_pegs: 'Bir topaç için daha yer',
    au_autoWhip: 'Kamçı Kolu', aud_autoWhip: 'Her 6 sn en yavaş topacı kamçılar', au_autoMerge: 'Birleştirme Robotu', aud_autoMerge: 'İkiz topaçları kendisi birleştirir',
    au_autoBuy: 'Topaç Tornası', aud_autoBuy: 'Boş yuva varsa ve ucuzsa yeni topaç yapar', unlockAt: '{n}. bölümde açılır', owned: 'Alındı', max: 'Tam',
    pk_head: 'Hızlı başlangıç: 3 topaçla başla', pk_keepWhip: 'Kamçı Kolu turnuvalardan sonra kalır', pk_keepMerge: 'Birleştirme Robotu turnuvalardan sonra kalır',
    pk_night: 'Uzaktayken 8 saate kadar altın gelir', pk_tier3: 'Yeni atölyeler 3. seviye topaçlarla başlar', perkAt: '{n} kupa',
    tourneyBtn: 'Büyük Turnuva', tourneyTitle: 'Büyük Turnuva',
    tourneyText: 'Topaçlarını Büyük Turnuva\'ya sok. Atölyen baştan başlar ama kazandığın her kupa tüm topaçları ve blokları sonsuza dek güçlendirir.',
    tourneyWin: 'Kazanacağın kupalar', tourneyBoost: 'Atölye bonusu', tourneyGo: 'Turnuvaya katıl', notYet: 'Şimdi değil', tourneyPerk: 'Yeni ayrıcalık: {p}',
    tourneyDone: 'Turnuva kazanıldı!', tourneyDoneSub: 'Rafa +{n} kupa',
    awayTitle: 'Tekrar hoş geldin!', awayText: 'Sen yokken topaçların {t} boyunca dönmeye devam etti.', awayDouble: 'Reklam izle: ikiye katla',
    clearedTitle: 'Dev Blok kırıldı!', clearedNext: 'Sıradaki: {a}', clearedStage: 'Sıra {n}. bölümde.', clearTriple: 'Reklam izle: ödülü üçe katla',
    newTier: 'Yeni topaç!', arenaBanner: 'Bölüm {n}', greatBanner: 'Dev Blok!', greatSub: 'Büyük ödül için kır', mult: 'Kupa bonusu x{m}',
    tip_whip: 'Kamçılamak için dönen bir topaca tıkla', tip_whip_t: 'Kamçılamak için dönen bir topaca dokun', tip_buy: 'Yeni bir topaç al', tip_buy2: 'Bir topaç daha al',
    tip_merge: 'Birleştirmek için topacı ikizinin üstüne sürükle', tip_upgrade: 'Atölyeni geliştir', tip_tap: 'Bloklara tıklayıp fiske de vurabilirsin', tip_tap_t: 'Bloklara dokunup fiske de vurabilirsin',
    tip_tourney: 'Büyük Turnuva açıldı',
    ar_bench: 'Tezgâh Kâsesi', ar_drum: 'Teneke Davul', ar_clock: 'Saat Çarkı Tabağı', ar_candy: 'Şeker Tabağı', ar_stars: 'Yıldızlı Müzik Kutusu',
    tw_bumpers: 'Yaylı tamponlar topaçları fırlatır', tw_turning: 'Tabak döner ve her şeyi taşır', tw_golden: 'Altın bloklar on kat öder',
    tw_comets: 'Kayan yıldız blokları süzülür', hours: '{h} sa {m} dk', minutes: '{m} dk',
    t1: 'Çam Fırıldak', t2: 'Kiraz Topacı', t3: 'Teneke Girdap', t4: 'Pirinç Jiro', t5: 'Yeşim Derviş', t6: 'Yakut Asil', t7: 'Ayaz Kuyrukluyıldız', t8: 'Güneş Patlaması',
    t9: 'Şimşek Taç', t10: 'Nebula Kraliçesi', t11: 'Prizma İmparator', t12: 'Kutup Işığı Titanı', t13: 'Yıldız Hükümdarı', t14: 'Galaksi Ulusu', t15: 'Sonsuz Girdap',
    fx_dmg: 'x{a} → x{b}', fx_val: 'x{a} → x{b}', fx_spin: '{a} sn → {b} sn', fx_spawn: '{a} blok → {b}', fx_crit: '%{a} → %{b}', fx_launch: '{a} sn → {b} sn', fx_pegs: '{a} → {b} yuva',
  },
};
let lang = 'en';
const t = (k, v) => { let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k; if (v) for (const [a, b] of Object.entries(v)) s = s.replaceAll(`{${a}}`, b); return s; };
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  let i = Math.floor(Math.log10(n) / 3), name;
  if (i < SUFFIX.length) name = SUFFIX[i]; else { const j = i - SUFFIX.length; name = String.fromCharCode(97 + Math.floor(j / 26) % 26) + String.fromCharCode(97 + (j % 26)); }
  const v = n / Math.pow(1000, i);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + name;
}
const fmtX = (m) => (m < 100 ? m.toFixed(m < 10 ? 2 : 1) : fmt(m));

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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a new arena, a tournament won
// Midgame: only at natural breaks (a new arena, a tournament), never on navigation buttons. Mute on adStarted; always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, only on break screens (welcome back, Great Block prize), reward only on adFinished; hidden after an error.
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

// ================================================================ AUDIO (Web Audio SFX with synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  click: ['triangle', 660, 440, 0.06, 0.12], clash: ['square', 900, 300, 0.06, 0.05], crack: ['square', 320, 120, 0.08, 0.08], coin: ['sine', 1500, 2200, 0.08, 0.05],
  whip: ['sawtooth', 300, 1400, 0.14, 0.08], tip: ['sine', 520, 1040, 0.16, 0.14], nope: ['triangle', 260, 180, 0.14, 0.12],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0, last: {} };
function initAudio() {
  try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.master = audio.ctx.createGain(); audio.master.connect(audio.ctx.destination); }
  catch { audio.ctx = null; }
}
async function loadSfx(key, url) {
  if (!audio.ctx) return;
  try { const r = await fetch(url); if (r.ok) audio.buffers[key] = await audio.ctx.decodeAudioData(await r.arrayBuffer()); } catch {} // missing -> synth
}
function unlockAudio() {
  if (audio.ctx?.state === 'suspended') audio.ctx.resume();
  if (audio.wantMusic && audio.music?.paused && !audio.muted.size) audio.music.play().catch(() => {});
}
const MIN_GAP = { clash: 0.07, crack: 0.06, coin: 0.05, click: 0.03, tip: 0.1, whip: 0.06, jar: 0.12, launch: 0.15, topple: 0.2, fling: 0.1 };
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 16 || CAPTURE || simulating) return;
  const now = audio.ctx.currentTime;
  if (MIN_GAP[key] && now - (audio.last[key] || -9) < MIN_GAP[key]) return;
  audio.last[key] = now;
  const b = audio.buffers[key], g = audio.ctx.createGain(), v = vol * save.vol.sfx;
  if (v <= 0.001) return;
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12); g.gain.value = v * (SFX_GAIN[key] ?? 1);
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function playMusic(key) {
  audio.wantMusic = true;
  if (CAPTURE) return;
  if (key && key !== audio.musicKey) {
    if (audio.music) { audio.music.pause(); audio.music = null; }
    audio.musicKey = key; audio.music = new Audio(MUSIC_FILES[key]); audio.music.loop = true; audio.music.onerror = () => { audio.music = null; };
    setMusicVolume();
  }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function setMusicVolume() { if (audio.music) audio.music.volume = Math.min(1, 0.26 * save.vol.music); }
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
}

// ================================================================ WORLD (renderer, camera, lights, the workshop around the bowl)
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a1a10'); scene.fog = new THREE.Fog('#2a1a10', 30, 62);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight('#ffe6c8', '#3a2414', 1.15); scene.add(hemi);
const lamp = new THREE.SpotLight('#ffd9a0', 520, 60, 0.62, 0.55, 1.6); lamp.position.set(-11, 16, -5); lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0006; lamp.shadow.normalBias = 0.04; lamp.shadow.camera.near = 4; lamp.shadow.camera.far = 40; scene.add(lamp, lamp.target);
const fillLight = new THREE.DirectionalLight('#9fb8ff', 0.55); fillLight.position.set(10, 8, 12); scene.add(fillLight);
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, ...o });
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const floorY = (r) => 0.12 + (r > CFG.flatR ? (r - CFG.flatR) * (r - CFG.flatR) * CFG.slope : 0);

function roundedBox(w, h, d, r, seg = 3) { // a softened toy block
  let g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, lo = new THREE.Vector3(-w / 2 + r, -h / 2 + r, -d / 2 + r), hi = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r), v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.copy(v).clamp(lo, hi); v.sub(c); if (v.lengthSq() > 1e-8) v.setLength(r); p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z); }
  g.computeVertexNormals(); return g;
}
function paintGeo(g, fn, perFace = false) { // vertex colors from a function of the vertex (or face centre) position
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    if (perFace) { const f = i - (i % 3); v.fromBufferAttribute(p, f); w.fromBufferAttribute(p, f + 1); v.add(w); w.fromBufferAttribute(p, f + 2); v.add(w).multiplyScalar(1 / 3); } else v.fromBufferAttribute(p, i);
    fn(v, _c, i); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; }

const shelfCups = new THREE.Group();
let jarCoins = null;
function buildWorkshop() {
  // the workbench: planks with small gaps and grain
  const plankMat = std({ vertexColors: true, roughness: 0.82 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.BoxGeometry(44, 1, 2.9, 1, 1, 1), base = new THREE.Color(['#8a5a34', '#93603a', '#7f5230'][i % 3]);
    paintGeo(g, (v, c) => { const grain = 0.5 + 0.5 * Math.sin(v.x * 1.7 + Math.sin(v.x * 0.37 + i) * 3 + i * 4); c.copy(base).multiplyScalar(0.88 + grain * 0.16); });
    const m = new THREE.Mesh(g, plankMat); m.position.set(0, -0.52, -12 + i * 3); m.receiveShadow = true; scene.add(m);
  }
  // pegboard wall with tools
  const pegTex = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#2f5d58'; x.fillRect(0, 0, w, h); x.fillStyle = '#1d3d3a'; for (let i = 8; i < w; i += 21) for (let j = 8; j < h; j += 21) { x.beginPath(); x.arc(i, j, 3.2, 0, 7); x.fill(); } });
  pegTex.wrapS = pegTex.wrapT = THREE.RepeatWrapping; pegTex.repeat.set(4, 2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(64, 26), std({ map: pegTex, roughness: 0.9 })); wall.position.set(0, 12, -14); wall.receiveShadow = true; scene.add(wall);
  const toolMat = std({ color: '#c8ccd4', metalness: 0.55, roughness: 0.4 }), handleMat = std({ color: '#c8452e' }), woodMat = std({ color: '#b07a44' });
  const tool = (parts, x, y, rz) => { const g = new THREE.Group(); for (const [geo, mat, px, py] of parts) { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, 0); m.castShadow = true; g.add(m); } g.position.set(x, y, -13.7); g.rotation.z = rz; scene.add(g); };
  tool([[new THREE.BoxGeometry(0.35, 3.4, 0.3), woodMat, 0, 0], [new THREE.BoxGeometry(1.6, 0.6, 0.5), toolMat, 0, 1.8]], -12, 9, 0.15); // hammer
  tool([[new THREE.BoxGeometry(0.4, 1.6, 0.35), handleMat, 0, -1.2], [new THREE.BoxGeometry(0.22, 2.6, 0.2), toolMat, 0, 0.9]], -9.4, 8.6, -0.1); // screwdriver
  tool([[new THREE.BoxGeometry(2.6, 1.2, 0.08), toolMat, 0, 0], [new THREE.BoxGeometry(0.9, 1.3, 0.35), woodMat, -1.6, 0]], 11.5, 9.4, 0.05); // saw
  tool([[new THREE.TorusGeometry(0.55, 0.16, 8, 16), toolMat, 0, 1.4], [new THREE.BoxGeometry(0.32, 2.6, 0.18), toolMat, 0, 0]], 9, 8.6, 0.2); // wrench
  for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 16), std({ color: ['#e85a4a', '#3fc1b0', '#ffd36b', '#8a6ad6'][i] })); sp.rotation.z = Math.PI / 2; sp.position.set(-3 + i * 1.3, 7.4, -13.4); sp.castShadow = true; scene.add(sp); }
  // the trophy shelf (fills up with Grand Tournament cups)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 1.6), std({ color: '#7a4a28' })); shelf.position.set(0, 10.8, -13.1); shelf.castShadow = shelf.receiveShadow = true; scene.add(shelf);
  shelfCups.position.set(0, 10.98, -13.1); scene.add(shelfCups);
  // desk lamp (the light source), a coin jar, spools and a paint pot on the bench
  const brass = std({ color: '#d4a24a', metalness: 0.7, roughness: 0.35 }), lampG = new THREE.Group();
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 24), brass); lb.position.y = 0.17;
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), brass); a1.position.set(0, 3.6, 0); a1.rotation.z = 0.12;
  const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 8), brass); a2.position.set(1.4, 7.2, 1.2); a2.rotation.set(0.6, 0, -1.0);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2, 24, 1, true), std({ color: '#2f6f62', side: THREE.DoubleSide, roughness: 0.5 })); shade.position.set(3.1, 8.2, 2.4); shade.rotation.set(0.35, 0, -0.5);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff3c8' })); bulb.position.set(3.4, 7.6, 2.6);
  for (const m of [lb, a1, a2, shade]) m.castShadow = true;
  lampG.add(lb, a1, a2, shade, bulb); lampG.position.set(-15.5, 0, -9.5); lampG.rotation.y = 0.5; scene.add(lampG);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.8, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.28, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  jar.position.set(10.6, 1.4, -4.6); scene.add(jar);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.3, 28), brass); lid.position.set(10.6, 2.95, -4.6); lid.castShadow = true; scene.add(lid);
  jarCoins = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1, 28), std({ color: '#ffcc33', metalness: 0.75, roughness: 0.3, emissive: '#4a3000' })); jarCoins.position.set(10.6, 0.5, -4.6); scene.add(jarCoins);
  for (const [x, z, c] of [[-10.8, 2.6, '#e85a4a'], [-11.6, 4.4, '#3fc1b0']]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 20), std({ color: c })); sp.position.set(x, 0.55, z); sp.castShadow = true; scene.add(sp);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 20), woodMat); cap.position.set(x, 1.15, z); scene.add(cap);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.8, 1.3, 20), std({ color: '#5a7ad6', metalness: 0.4, roughness: 0.4 })); pot.position.set(11.4, 0.65, 1.8); pot.castShadow = true; scene.add(pot);
  const paint = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), std({ color: '#ffd36b' })); paint.rotation.x = -Math.PI / 2; paint.position.set(11.4, 1.31, 1.8); scene.add(paint);
}
function updateShelf() {
  shelfCups.clear();
  const n = Math.min(12, save.trophies), gold = std({ color: '#ffd36b', metalness: 0.8, roughness: 0.25, emissive: '#3a2400' });
  const prof = [[0, 0], [0.45, 0], [0.45, 0.12], [0.12, 0.2], [0.1, 0.55], [0.42, 0.75], [0.5, 1.25], [0.44, 1.25], [0.36, 0.82], [0, 0.72]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 18);
  for (let i = 0; i < n; i++) { const s = 0.75 + Math.min(1, save.trophies / 40) * 0.5, m = new THREE.Mesh(geo, gold); m.scale.setScalar(s); m.position.x = (i - (n - 1) / 2) * 1.2; m.castShadow = true; shelfCups.add(m); }
}

// ================================================================ ARENA (the turned bowl and its twist: bumpers, turning plate, comets)
const arena = { group: new THREE.Group(), idx: -1, bumpers: [], gear: null, spinAng: 0 };
scene.add(arena.group);
const BUMPERS = [0, 1, 2].map((i) => ({ x: Math.cos(Math.PI / 2 + (i * Math.PI * 2) / 3) * 3.6, z: Math.sin(Math.PI / 2 + (i * Math.PI * 2) / 3) * 3.6, r: 0.55, k: 0 }));
function buildArena(idx) {
  arena.idx = idx; arena.group.clear(); arena.bumpers = []; arena.gear = null;
  const A = ARENAS[idx], c0 = new THREE.Color(A.bowl[0]), c1 = new THREE.Color(A.bowl[1]), c2 = new THREE.Color(A.bowl[2]), rimC = new THREE.Color(A.rim);
  const pts = [];
  for (let i = 0; i <= 40; i++) { const r = (i / 40) * (CFG.bowlR + 0.15); pts.push(new THREE.Vector2(r, floorY(r))); }
  pts.push(new THREE.Vector2(CFG.bowlR + 0.45, floorY(CFG.bowlR) + 0.32), new THREE.Vector2(CFG.bowlR + 0.75, floorY(CFG.bowlR) + 0.12), new THREE.Vector2(CFG.bowlR + 0.8, -0.02), new THREE.Vector2(6, -0.02));
  const geo = new THREE.LatheGeometry(pts, 96).toNonIndexed();
  paintGeo(geo, (v, c) => {
    const r = Math.hypot(v.x, v.z), ang = Math.atan2(v.z, v.x);
    if (r > CFG.bowlR + 0.05) { c.copy(rimC); if (A.id === 'drum' && Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24) % 2) c.set('#ffffff'); return; }
    if (A.id === 'bench') { const ring = 0.5 + 0.5 * Math.sin(r * 8.5 + Math.sin(ang * 3) * 0.4); c.copy(c1).lerp(c0, 0.35 + ring * 0.65); }
    else if (A.id === 'drum') { c.copy(r < CFG.flatR - 0.3 ? c0 : c1); if (Math.abs(r - 2.2) < 0.08 || Math.abs(r - CFG.flatR + 0.3) < 0.08) c.copy(rimC); }
    else if (A.id === 'clock') { c.copy(c0).lerp(c1, 0.5 + 0.5 * Math.sin(r * 5)); }
    else if (A.id === 'candy') { const swirl = Math.sin(ang * 8 + r * 1.2) > 0.6 && r > CFG.flatR ? 1 : 0; c.copy(c0); if (swirl) c.set('#ffd0e2'); if (Math.abs(r - CFG.flatR) < 0.1) c.copy(rimC); }
    else { c.copy(c0).lerp(c1, 0.5 + 0.5 * Math.sin(r * 3)); const h = Math.sin(v.x * 12.9898 + v.z * 78.233) * 43758.5453; if (h - Math.floor(h) > 0.985) c.set('#fff6c8'); }
  }, true);
  geo.computeVertexNormals();
  const metal = A.id === 'clock' || A.id === 'drum';
  const bowl = new THREE.Mesh(geo, std({ side: THREE.DoubleSide, vertexColors: true, roughness: A.id === 'candy' ? 0.3 : metal ? 0.45 : 0.7, metalness: A.id === 'clock' ? 0.45 : A.id === 'drum' ? 0.15 : 0 }));
  bowl.receiveShadow = true; arena.group.add(bowl);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(CFG.bowlR + 0.45, 0.16, 10, 96), std({ color: A.id === 'stars' || A.id === 'clock' ? '#e8c060' : A.rim, metalness: A.id === 'stars' || A.id === 'clock' ? 0.8 : 0.1, roughness: 0.35 }));
  rimRing.rotation.x = Math.PI / 2; rimRing.position.y = floorY(CFG.bowlR) + 0.34; rimRing.castShadow = true; arena.group.add(rimRing);
  if (A.twist === 'bumpers') for (const b of BUMPERS) {
    const g = new THREE.Group(), post = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.1, 0.7, 20), std({ color: '#c8323a', roughness: 0.4 }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(b.r + 0.02, 0.09, 8, 20), std({ color: '#ffffff' })); band.rotation.x = Math.PI / 2; band.position.y = 0.3;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(b.r * 0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: '#ffd36b', metalness: 0.5, roughness: 0.3 })); cap.position.y = 0.35;
    post.position.y = 0.35; post.castShadow = true; g.add(post, band, cap); g.position.set(b.x, floorY(0), b.z); arena.group.add(g); arena.bumpers.push({ ...b, mesh: g });
  }
  if (A.twist === 'turning') { // a brass gear face that turns slowly under everything
    const s = new THREE.Shape(), teeth = 28, R1 = CFG.flatR - 0.2, R2 = CFG.flatR + 0.15;
    for (let i = 0; i <= teeth * 4; i++) { const a = (i / (teeth * 4)) * Math.PI * 2, r = i % 4 < 2 ? R2 : R1; if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    for (let k = 0; k < 5; k++) { const hole = new THREE.Path(), a = (k / 5) * Math.PI * 2; hole.absarc(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0.7, 0, Math.PI * 2, true); s.holes.push(hole); }
    const gg = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false, curveSegments: 6 }); gg.rotateX(-Math.PI / 2);
    arena.gear = new THREE.Mesh(gg, std({ color: '#e0b858', metalness: 0.75, roughness: 0.32 })); arena.gear.position.y = floorY(0) + 0.005; arena.gear.receiveShadow = true; arena.group.add(arena.gear);
  }
  // lighting and background shift per arena
  lamp.color.set(A.lamp); hemi.color.set(A.fill[0]); hemi.groundColor.set(A.fill[1]);
  const bg = A.id === 'stars' ? '#140e26' : '#2a1a10'; scene.background.set(bg); scene.fog.color.set(bg);
}

// ================================================================ MODELS (lathe-turned tops by tier, toy blocks)
const topGeoCache = {};
const PROFILES = [
  [[0, 0], [0.06, 0.04], [0.3, 0.28], [0.5, 0.5], [0.56, 0.6], [0.5, 0.68], [0.3, 0.76], [0.1, 0.8], [0, 0.8]], // classic pear
  [[0, 0], [0.06, 0.05], [0.2, 0.16], [0.62, 0.34], [0.66, 0.42], [0.6, 0.5], [0.26, 0.58], [0.1, 0.62], [0, 0.62]], // flat disc gyro
  [[0, 0], [0.07, 0.04], [0.22, 0.2], [0.48, 0.42], [0.58, 0.6], [0.5, 0.82], [0.26, 0.96], [0.08, 1.02], [0, 1.02]], // onion dome
  [[0, 0], [0.06, 0.05], [0.58, 0.44], [0.6, 0.5], [0.58, 0.56], [0.2, 0.86], [0.08, 0.92], [0, 0.92]], // double cone
];
function topGeometry(tier) {
  if (topGeoCache[tier]) return topGeoCache[tier];
  const [body, stripe, accent, prof] = TIERS[tier - 1], pts = PROFILES[prof].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 24).toNonIndexed(), cb = new THREE.Color(body), cs = new THREE.Color(stripe), ca = new THREE.Color(accent), tip = new THREE.Color('#9aa0a8');
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), maxY = pts[pts.length - 1].y;
  for (let f = 0; f < p.count; f += 3) { // paint per face: metal tip, painted stripes around the waist, an accent band, a body cap
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const sector = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 12), yy = cy / maxY;
    let c = cb;
    if (yy < 0.1) c = tip; else if (yy < 0.44) c = cb; else if (yy < 0.54) c = ca; else if (yy < 0.9) c = sector % 2 ? cs : cb; else c = ca;
    for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  return (topGeoCache[tier] = { geo, maxY, width: Math.max(...pts.map((q) => q.x)) });
}
const topMat = std({ vertexColors: true, roughness: 0.42, metalness: 0.08 });
const stemMat = std({ color: '#f4e4c8', roughness: 0.5 }), ringMat = std({ color: '#ffd36b', metalness: 0.8, roughness: 0.25 }), gemMats = {};
const swooshMat = new THREE.MeshBasicMaterial({ color: '#fff4d8', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const topSize = (tier) => 0.98 + Math.min(tier, 12) * 0.045;
function buildTopView(tier) {
  const { geo, maxY, width } = topGeometry(tier), [, stripe, accent, , ring, gems, crown] = TIERS[tier - 1], s = topSize(tier);
  const root = new THREE.Group(), tilt = new THREE.Group(), spinG = new THREE.Group();
  const body = new THREE.Mesh(geo, topMat); body.castShadow = true; spinG.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.34, 10), stemMat); stem.position.y = maxY + 0.15; stem.castShadow = true; spinG.add(stem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), crown ? ringMat : stemMat); knob.position.y = maxY + 0.33; spinG.add(knob);
  for (let i = 0; i < ring; i++) { const tr = new THREE.Mesh(new THREE.TorusGeometry(width * (0.98 - i * 0.16), 0.035, 6, 32), ringMat); tr.rotation.x = Math.PI / 2; tr.position.y = maxY * (0.47 + i * 0.13); spinG.add(tr); }
  if (gems) { gemMats[accent] ??= std({ color: stripe, emissive: stripe, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.2 }); const gg = new THREE.OctahedronGeometry(0.07); for (let i = 0; i < gems; i++) { const a = (i / gems) * Math.PI * 2, gm = new THREE.Mesh(gg, gemMats[accent]); gm.position.set(Math.cos(a) * width * 0.86, maxY * 0.6, Math.sin(a) * width * 0.86); spinG.add(gm); } }
  if (crown) { const cg = new THREE.ConeGeometry(0.05, 0.16, 5); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, cm = new THREE.Mesh(cg, ringMat); cm.position.set(Math.cos(a) * 0.17, maxY + 0.06, Math.sin(a) * 0.17); spinG.add(cm); } }
  const swoosh = new THREE.Mesh(new THREE.RingGeometry(width * 1.08, width * 1.22, 24, 1, 0, Math.PI * 1.1), swooshMat); swoosh.rotation.x = -Math.PI / 2; swoosh.position.y = maxY * 0.5;
  tilt.add(spinG, swoosh); root.add(tilt); root.scale.setScalar(s);
  return { root, tilt, spinG, swoosh, tier };
}
const blockGeo = [roundedBox(0.75, 0.75, 0.75, 0.13), roundedBox(1.0, 1.0, 1.0, 0.16), roundedBox(1.3, 1.3, 1.3, 0.2), roundedBox(2.6, 2.2, 2.6, 0.34)];
const pipGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12);
const BLOCK_TYPES = [ // hp mult, value mult, geometry, weight, pips
  { hp: 1, val: 1, geo: 0, w: 0.6, pips: 1, size: 0.75 }, { hp: 3, val: 3.6, geo: 1, w: 0.3, pips: 2, size: 1.0 }, { hp: 8, val: 10.5, geo: 2, w: 0.1, pips: 3, size: 1.3 },
];
function buildBlockView(type, color, golden, great, star) {
  const g = new THREE.Group(), geo = blockGeo[great ? 3 : BLOCK_TYPES[type].geo];
  const mat = std({ color: golden ? '#ffcc33' : color, roughness: golden ? 0.25 : 0.55, metalness: golden ? 0.7 : 0, emissive: '#000000' });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const h = great ? 1.1 : BLOCK_TYPES[type].size / 2, pipMat = std({ color: golden ? '#fff6c8' : ARENAS[arena.idx].pip, roughness: 0.5 });
  if (great) { // a gift-wrapped Great Block: ribbons and a bow
    const rib = std({ color: '#ff5a6a', roughness: 0.45 });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.66, 2.26, 0.4), rib), r2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.26, 2.66), rib);
    const bow1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 16), rib), bow2 = bow1.clone(); bow1.position.set(-0.36, 1.25, 0); bow2.position.set(0.36, 1.25, 0); bow1.rotation.y = 0.5; bow2.rotation.y = -0.5;
    for (const q of [r1, r2, bow1, bow2]) { q.castShadow = true; g.add(q); }
  } else if (star) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), std({ color: '#fff6c8', emissive: '#ffd36b', emissiveIntensity: 0.8 })); st.position.y = h + 0.12; g.add(st);
  } else {
    const n = BLOCK_TYPES[type].pips, spots = [[[0, 0]], [[-0.18, -0.18], [0.18, 0.18]], [[-0.25, -0.25], [0, 0], [0.25, 0.25]]][n - 1];
    for (const [x, z] of spots) { const p = new THREE.Mesh(pipGeo, pipMat); p.position.set(x * BLOCK_TYPES[type].size * 1.25, h + 0.005, z * BLOCK_TYPES[type].size * 1.25); g.add(p); }
  }
  return { root: g, mat, base: mat.color.clone() };
}

// ================================================================ FX (coins that fly to the counter, wood chips, sparks, floating numbers)
const COIN_N = 90, CHIP_N = 160, SPARK_N = 90;
const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), std({ color: '#ffcc33', metalness: 0.75, roughness: 0.3, emissive: '#5a3a00' }), COIN_N);
const chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), std({ color: '#ffffff', roughness: 0.7 }), CHIP_N);
const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), SPARK_N);
for (const im of [coinMesh, chipMesh, sparkMesh]) { im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
coinMesh.castShadow = true;
chipMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHIP_N * 3), 3);
const coins = [], chips = [], sparks = [];
const hudTarget = new THREE.Vector3();
let shakeAmt = 0, coinBumpT = 0;
function spawnCoins(x, y, z, n) { for (let i = 0; i < n && coins.length < COIN_N; i++) coins.push({ x, y, z, vx: rand(-2.5, 2.5), vy: rand(4, 7), vz: rand(-2.5, 2.5), t: 0, fly: rand(0.45, 0.7), rx: rand(0, 6), ry: rand(0, 6) }); }
function spawnChips(x, y, z, color, n, speed = 4) { _c.set(color); for (let i = 0; i < n && chips.length < CHIP_N; i++) chips.push({ x, y, z, vx: rand(-1, 1) * speed, vy: rand(1.5, 1) * speed, vz: rand(-1, 1) * speed, life: rand(0.5, 0.9), r: rand(0, 6), c: _c.clone().multiplyScalar(rand(0.8, 1.1)) }); }
function spawnSparks(x, y, z, n, speed = 5) { for (let i = 0; i < n && sparks.length < SPARK_N; i++) sparks.push({ x, y, z, vx: rand(-1, 1) * speed, vy: rand(0.2, 1) * speed, vz: rand(-1, 1) * speed, life: rand(0.2, 0.45) }); }
function updateFx(dt) {
  _v.set(-0.82, 0.86, 0.5).unproject(camera).sub(camera.position).normalize(); hudTarget.copy(camera.position).addScaledVector(_v, 12); // toward the coin counter, never into the lens
  let n = 0;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i]; c.t += dt;
    if (c.t < c.fly) { c.vy -= 18 * dt; c.x += c.vx * dt; c.y = Math.max(0.2, c.y + c.vy * dt); c.z += c.vz * dt; }
    else { const k = Math.min(1, (c.t - c.fly) * 2.2); c.x = lerp(c.x, hudTarget.x, k * k); c.y = lerp(c.y, hudTarget.y, k * k); c.z = lerp(c.z, hudTarget.z, k * k); if (k >= 1) { coins.splice(i, 1); coinArrived(); continue; } }
    c.rx += dt * 9; _p.set(c.x, c.y, c.z); _q.setFromEuler(_e.set(c.rx, c.ry, 0)); _s.setScalar(c.t < c.fly ? 1 : Math.max(0.25, 1 - (c.t - c.fly) * 1.6)); _m.compose(_p, _q, _s); coinMesh.setMatrixAt(n++, _m);
  }
  coinMesh.count = n; coinMesh.instanceMatrix.needsUpdate = true;
  n = 0;
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i]; c.life -= dt; if (c.life <= 0) { chips.splice(i, 1); continue; }
    c.vy -= 16 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; if (c.y < 0.15) { c.y = 0.15; c.vy *= -0.3; c.vx *= 0.6; c.vz *= 0.6; } c.r += dt * 10;
    _p.set(c.x, c.y, c.z); _q.setFromEuler(_e.set(c.r, c.r * 0.7, 0)); _s.setScalar(Math.min(1, c.life * 3)); _m.compose(_p, _q, _s); chipMesh.setMatrixAt(n, _m); chipMesh.setColorAt(n, c.c); n++;
  }
  chipMesh.count = n; chipMesh.instanceMatrix.needsUpdate = true; if (chipMesh.instanceColor) chipMesh.instanceColor.needsUpdate = true;
  n = 0;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const c = sparks[i]; c.life -= dt; if (c.life <= 0) { sparks.splice(i, 1); continue; }
    c.vy -= 9 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    _p.set(c.x, c.y, c.z); _q.identity(); _s.setScalar(c.life * 3); _m.compose(_p, _q, _s); sparkMesh.setMatrixAt(n++, _m);
  }
  sparkMesh.count = n; sparkMesh.instanceMatrix.needsUpdate = true;
}
function coinArrived() { if (coinBumpT <= 0) { const el = $('coinText').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); coinBumpT = 0.12; playSfx('coin', 1, rand(0.95, 1.15)); } }
const popPool = [];
function popText(x, y, z, text, cls = '') {
  if (simulating || $('pops').childElementCount > 14) return;
  _v.set(x, y, z).project(camera); if (_v.z > 1) return;
  const el = popPool.pop() || document.createElement('div');
  el.className = `pop ${cls}`; el.textContent = text; el.style.left = `${((_v.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - _v.y) / 2) * innerHeight}px`;
  $('pops').appendChild(el); setTimeout(() => { el.remove(); popPool.push(el); }, 1000);
}
function shake(a) { if (save.shake !== 'off') shakeAmt = Math.max(shakeAmt, a); }
function flash() { const f = $('flash'); f.hidden = true; void f.offsetWidth; f.hidden = false; setTimeout(() => { f.hidden = true; }, 450); }

// ================================================================ ECONOMY (all the numbers in one place)
let save = null;
const lvl = (id) => save.up[id] || 0;
const trophyMult = () => 1 + CFG.trophyBoost * save.trophies;
const H = (s) => CFG.hp0 * Math.pow(CFG.hpG, s - 1);
const V = (s) => CFG.val0 * Math.pow(CFG.valG, s - 1);
const power = (tier) => Math.pow(CFG.tierG, tier - 1);
const dmgMult = () => Math.pow(1.25, lvl('tips')) * trophyMult();
const valMult = () => Math.pow(1.2, lvl('value')) * trophyMult();
const spinTime = (l = lvl('spin')) => CFG.spin0 * Math.pow(1.2, l);
const spawnEvery = (l = lvl('spawn')) => CFG.spawn0 * Math.pow(0.88, l);
const blockCap = (l = lvl('spawn')) => CFG.cap0 + l;
const critChance = (l = lvl('crit')) => 0.03 * l;
const relaunchTime = (l = lvl('launch')) => CFG.relaunch0 * Math.pow(0.85, l);
const slotCount = (l = lvl('pegs')) => CFG.slots0 + l;
const maxTierOwned = () => Math.max(1, ...save.tops.filter(Boolean));
const buyTier = () => Math.max(hasPerk('tier3') ? 3 : 1, (save.bestTier || 1) - 4);
const buyCost = () => CFG.buy0 * Math.pow(CFG.buyG, save.bought) * power(buyTier()) * 1.1;
const tapDamage = () => power(maxTierOwned()) * dmgMult() * Math.pow(1.5, lvl('tap'));
const upCost = (u, l = lvl(u.id)) => u.base * Math.pow(u.g, l) * (u.id === 'pegs' ? 1 : Math.pow(1.6, Math.floor(l / 10)));
const autoCost = (a) => a.cost;
const hasPerk = (id) => PERKS.some((p) => p.id === id && save.trophies >= p.at);
const goalFor = (s) => CFG.goal(s);
const offlineCap = () => (hasPerk('night') ? 8 : 2) * 3600;

// ================================================================ SIM (tops and blocks in the bowl: fixed-step 2D physics on a curved floor)
const tops = [], blocks = [];
let great = null, blockId = 0, spawnT = 1, cometT = 14, autoT = { whip: 6, merge: 2, buy: 3 }, simTime = 0, earnWindow = [], simulating = false;
function addTop(slot, tier, drop = true) {
  const a = rand(0, Math.PI * 2), r = rand(0.5, 3.2);
  const tp = { slot, tier, x: Math.cos(a) * r, z: Math.sin(a) * r, vx: rand(-1, 1), vz: rand(-1, 1), spin: 1, st: drop ? 'drop' : 'spin', t: drop ? 0.55 : 0, whip: 0, tgt: null, retarget: 0, prec: rand(0, 6), spinAng: rand(0, 6), view: buildTopView(tier), hitCd: {} };
  tp.r = radiusOf(tp); scene.add(tp.view.root); tops.push(tp); placeTop(tp); return tp;
}
function removeTop(tp) { scene.remove(tp.view.root); tops.splice(tops.indexOf(tp), 1); }
function setTopTier(tp, tier) { scene.remove(tp.view.root); tp.tier = tier; tp.r = radiusOf(tp); tp.view = buildTopView(tier); scene.add(tp.view.root); placeTop(tp); }
const radiusOf = (tp) => 0.55 * topSize(tp.tier);
function spawnBlock({ great: isGreat = false, star = false } = {}) {
  const A = ARENAS[arena.idx];
  let type = 0; const roll = Math.random(); if (roll > 0.9) type = 2; else if (roll > 0.6) type = 1;
  const golden = !isGreat && !star && Math.random() < (A.twist === 'golden' ? 0.06 : 0.015);
  let x, z;
  if (star) { const a = rand(0, Math.PI * 2); x = Math.cos(a) * 6; z = Math.sin(a) * 6; }
  else if (isGreat) { x = 0; z = 0; }
  else { for (let k = 0; k < 12; k++) { const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 5.6; x = Math.cos(a) * r; z = Math.sin(a) * r; if (!blocks.some((b) => Math.hypot(b.x - x, b.z - z) < 1.6) && !tops.some((tp) => Math.hypot(tp.x - x, tp.z - z) < 1.2)) break; } }
  const bt = BLOCK_TYPES[type], s = save.stage;
  const hp = isGreat ? H(s) * CFG.greatHp : H(s) * bt.hp * (star ? 2 : 1), val = isGreat ? V(s) * CFG.greatVal : V(s) * bt.val * (golden ? 10 : star ? 6 : 1);
  const b = { id: ++blockId, type, great: isGreat, golden, star, x, z, vx: 0, vz: 0, hp, maxHp: hp, val, r: isGreat ? 1.6 : bt.size * 0.62, mass: isGreat ? 60 : bt.size * bt.size * 2.2, y: isGreat ? 9 : 2, vy: 0, grow: isGreat ? 1 : 0, rot: rand(0, Math.PI * 2), squash: 0, flash: 0, view: buildBlockView(type, A.blocks[type], golden, isGreat, star) };
  if (star) { const a = Math.atan2(-z, -x) + rand(-0.5, 0.5); b.vx = Math.cos(a) * 9; b.vz = Math.sin(a) * 9; b.y = 0.6; }
  scene.add(b.view.root); blocks.push(b); placeBlock(b);
  if (isGreat) { great = b; b.mass = 60; }
  return b;
}
function removeBlock(b) { scene.remove(b.view.root); blocks.splice(blocks.indexOf(b), 1); if (b === great) great = null; }
function bowlForce(o, dt, k = 1) { // the bowl's curve pulls everything back toward the middle; the wall bounces
  const r = Math.hypot(o.x, o.z);
  if (r > CFG.flatR) { const f = (r - CFG.flatR) * 2 * CFG.slope * 9.8 * k; o.vx -= (o.x / r) * f * dt; o.vz -= (o.z / r) * f * dt; }
  const lim = CFG.wall - (o.r || 0.4);
  if (r > lim) { const nx = o.x / r, nz = o.z / r, vn = o.vx * nx + o.vz * nz; o.x = nx * lim; o.z = nz * lim; if (vn > 0) { o.vx -= 1.7 * vn * nx; o.vz -= 1.7 * vn * nz; } }
  if (ARENAS[arena.idx].twist === 'turning') { o.vx += -o.z * 0.22 * dt; o.vz += o.x * 0.22 * dt; }
}
function pickTarget(tp) {
  if (great && Math.random() < 0.75) return great;
  let best = null, bd = 1e9;
  for (const b of blocks) { if (b.y > 1.5) continue; const d = Math.hypot(b.x - tp.x, b.z - tp.z) * rand(0.7, 1.3); if (d < bd) { bd = d; best = b; } }
  return best;
}
function stepTop(tp, dt) {
  tp.prec += dt * (2.5 + (1 - tp.spin) * 7);
  if (tp.st === 'drop') { tp.t -= dt; if (tp.t <= 0) { tp.st = 'spin'; spawnChips(tp.x, 0.2, tp.z, '#e8d8c0', 6, 2); playSfx('launch', 0.6); } return; }
  if (tp.st === 'down') { tp.t -= dt; tp.vx *= Math.exp(-3 * dt); tp.vz *= Math.exp(-3 * dt); tp.x += tp.vx * dt; tp.z += tp.vz * dt; bowlForce(tp, dt, 0.5); if (tp.t <= 0) { tp.st = 'wait'; tp.t = relaunchTime(); } return; }
  if (tp.st === 'wait') { tp.t -= dt; if (tp.t <= 0) relaunch(tp); return; }
  tp.spin -= dt / spinTime(); tp.whip = Math.max(0, tp.whip - dt);
  if (tp.spin <= 0) { tp.spin = 0; tp.st = 'down'; tp.t = 0.9; playSfx('topple', 0.5); return; }
  tp.retarget -= dt;
  if (tp.retarget <= 0 || !tp.tgt || !blocks.includes(tp.tgt)) { tp.tgt = pickTarget(tp); tp.retarget = rand(0.5, 1.1); }
  const drive = (0.35 + 0.65 * Math.min(1, tp.spin * 1.6)) * (tp.whip > 0 ? 1.7 : 1);
  if (tp.tgt) { const dx = tp.tgt.x - tp.x, dz = tp.tgt.z - tp.z, d = Math.hypot(dx, dz) || 1; tp.vx += (dx / d) * 10 * drive * dt; tp.vz += (dz / d) * 10 * drive * dt; }
  else { tp.vx += Math.cos(tp.prec) * 3 * dt; tp.vz += Math.sin(tp.prec) * 3 * dt; }
  const vmax = 6 * drive, sp = Math.hypot(tp.vx, tp.vz); if (sp > vmax) { tp.vx *= vmax / sp; tp.vz *= vmax / sp; }
  tp.vx *= Math.exp(-0.6 * dt); tp.vz *= Math.exp(-0.6 * dt);
  tp.x += tp.vx * dt; tp.z += tp.vz * dt; tp.r = radiusOf(tp); bowlForce(tp, dt);
  for (const k in tp.hitCd) { tp.hitCd[k] -= dt; if (tp.hitCd[k] <= 0) delete tp.hitCd[k]; }
}
function relaunch(tp) { const a = rand(0, Math.PI * 2), r = rand(0.5, 3.4); tp.x = Math.cos(a) * r; tp.z = Math.sin(a) * r; tp.vx = rand(-1, 1); tp.vz = rand(-1, 1); tp.spin = 1; tp.st = 'drop'; tp.t = 0.45; }
function whip(tp, fromPlayer = true) {
  if (!tp || tp.st === 'down' || tp.st === 'wait') { if (tp) { relaunch(tp); playSfx('launch', 0.7); } return; }
  tp.spin = 1; tp.whip = 3; const tg = tp.tgt || pickTarget(tp);
  if (tg) { const dx = tg.x - tp.x, dz = tg.z - tp.z, d = Math.hypot(dx, dz) || 1; tp.vx += (dx / d) * 6; tp.vz += (dz / d) * 6; }
  spawnSparks(tp.x, 0.6, tp.z, 10, 4); playSfx('whip', 1, rand(0.95, 1.1));
  if (fromPlayer) { coachDone('whip'); stats.whips++; const el = document.querySelector(`.slot[data-i="${tp.slot}"]`); if (el) { el.classList.remove('whipped'); void el.offsetWidth; el.classList.add('whipped'); } }
}
function hitBlock(b, dmg, crit, x, z, by) {
  b.hp -= dmg; b.flash = 1; b.squash = 1;
  if (!simulating) { spawnChips(b.x, (b.great ? 1.1 : 0.4), b.z, b.golden ? '#ffcc33' : ARENAS[arena.idx].blocks[b.type], crit ? 8 : 3, 3.2); if (crit) { spawnSparks(x, 0.6, z, 12, 6); popText(b.x, 1.4, b.z, fmt(dmg), 'crit'); } }
  if (by === 'tap') popText(b.x, 1.2, b.z, fmt(dmg), 'tap');
  playSfx('clash', 0.7, rand(0.9, 1.25));
  if (b.great) { shake(crit ? 0.25 : 0.1); playSfx('clashHeavy', 0.5); }
  if (b.hp <= 0) breakBlock(b);
}
function breakBlock(b) {
  const gain = b.val * valMult();
  if (b.great) {
    earn(gain * 0, b.x, b.z); clearedPrize = gain; playSfx('great'); playSfx('cheer', 0.8); shake(0.8); flash();
    spawnChips(b.x, 1.2, b.z, '#ff5a6a', 40, 7); spawnChips(b.x, 1.2, b.z, ARENAS[arena.idx].blocks[1], 30, 7); spawnCoins(b.x, 1.5, b.z, 40);
    removeBlock(b); happytime(); showCleared(); return;
  }
  earn(gain, b.x, b.z, b.golden || b.star ? 'big' : '');
  spawnChips(b.x, 0.4, b.z, b.golden ? '#ffcc33' : ARENAS[arena.idx].blocks[b.type], 14, 4.5); spawnCoins(b.x, 0.6, b.z, b.golden || b.star ? 12 : 2 + b.type * 2);
  playSfx('crack', 1, rand(0.9, 1.15)); if (b.golden || b.star) { playSfx('perfect', 0.8); shake(0.25); }
  removeBlock(b);
  if (!great && state === State.PLAYING) { save.progress++; if (save.progress >= goalFor(save.stage)) summonGreat(); } // the menu's attract mode never counts
  stats.broken++;
}
function earn(amount, x, z, cls = '') {
  if (state === State.MENU || state === State.COVER) return;
  save.coins += amount; save.runCoins += amount; save.total += amount; earnWindow.push([simTime, amount]);
  if (amount > 0 && x !== undefined) popText(x, 1.1, z, `+${fmt(amount)}`, cls);
}
function summonGreat() {
  spawnBlock({ great: true }); shake(0.5); playSfx('great', 0.6, 0.8);
  if (!simulating) banner(t('greatBanner'), t('greatSub'));
  coachDone('great');
}
function collideTops(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = a.r + b.r;
  if (d >= rr || d < 1e-4) return;
  const nx = dx / d, nz = dz / d, ov = rr - d; a.x -= nx * ov * 0.5; a.z -= nz * ov * 0.5; b.x += nx * ov * 0.5; b.z += nz * ov * 0.5;
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz; if (rv > 0) return;
  const j = -1.9 * rv / 2; a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
  // spinning tops kick sideways off each other: that is what makes them dance
  a.vx += -nz * 1.6 * a.spin; a.vz += nx * 1.6 * a.spin; b.vx += nz * 1.6 * b.spin; b.vz += -nx * 1.6 * b.spin;
  a.spin -= 0.012; b.spin -= 0.012;
  if (!simulating) spawnSparks((a.x + b.x) / 2, 0.55, (a.z + b.z) / 2, 6, 4);
  playSfx('clash', 0.5, rand(1.1, 1.4));
  const key = 'c' + b.slot; if (!a.hitCd[key]) { a.hitCd[key] = 0.6; earn(V(save.stage) * CFG.clash * valMult()); }
}
function collideBlock(tp, b) {
  if (b.y > 0.9) return;
  const dx = b.x - tp.x, dz = b.z - tp.z, d = Math.hypot(dx, dz), rr = tp.r + b.r;
  if (d >= rr || d < 1e-4) return;
  const nx = dx / d, nz = dz / d, ov = rr - d, mt = 1 + tp.tier * 0.25, k = b.mass / (b.mass + mt);
  tp.x -= nx * ov * k; tp.z -= nz * ov * k; b.x += nx * ov * (1 - k); b.z += nz * ov * (1 - k);
  const rv = (b.vx - tp.vx) * nx + (b.vz - tp.vz) * nz;
  if (rv < 0) { const j = (-1.8 * rv) / (1 / mt + 1 / b.mass); tp.vx -= (j / mt) * nx; tp.vz -= (j / mt) * nz; b.vx += (j / b.mass) * nx; b.vz += (j / b.mass) * nz; }
  tp.vx += -nz * 1.4 * tp.spin; tp.vz += nx * 1.4 * tp.spin;
  const key = 'b' + b.id; stats.contacts++;
  if (!tp.hitCd[key]) { stats.hits++; // every contact bites (at most every 0.3 s); the top rebounds off the block so it keeps chattering at it
    tp.hitCd[key] = 0.22; tp.vx -= nx * 2.2; tp.vz -= nz * 2.2;
    const crit = Math.random() < critChance(), dmg = power(tp.tier) * dmgMult() * (tp.whip > 0 ? 2 : 1) * (crit ? 5 : 1);
    hitBlock(b, dmg, crit, tp.x + nx * tp.r, tp.z + nz * tp.r, 'top');
  }
}
function stepBlocks(dt) {
  for (const b of blocks) {
    if (b.y > 0.001 || b.vy) { b.vy -= 30 * dt; b.y += b.vy * dt; const fy = 0; if (b.y <= fy) { if (b.vy < -6) { spawnChips(b.x, 0.2, b.z, '#e8d8c0', b.great ? 16 : 4, 2); if (b.great) { shake(0.6); playSfx('clashHeavy', 0.8, 0.7); } } b.y = fy; b.vy = b.vy < -4 ? -b.vy * 0.25 : 0; } }
    const drag = b.star ? 0.25 : 2.6; b.vx *= Math.exp(-drag * dt); b.vz *= Math.exp(-drag * dt);
    b.x += b.vx * dt; b.z += b.vz * dt; bowlForce(b, dt, 0.7);
    b.flash = Math.max(0, b.flash - dt * 6); b.squash = Math.max(0, b.squash - dt * 5);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) { // blocks nudge each other
    const a = blocks[i], b = blocks[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = a.r + b.r;
    if (d < rr && d > 1e-4) { const ov = (rr - d) / 2, nx = dx / d, nz = dz / d, ka = b.mass / (a.mass + b.mass); a.x -= nx * ov * 2 * ka; a.z -= nz * ov * 2 * ka; b.x += nx * ov * 2 * (1 - ka); b.z += nz * ov * 2 * (1 - ka); }
  }
}
function stepBumpers(tp) {
  for (const bm of arena.bumpers) {
    const dx = tp.x - bm.x, dz = tp.z - bm.z, d = Math.hypot(dx, dz), rr = tp.r + bm.r;
    if (d < rr && d > 1e-4) { const nx = dx / d, nz = dz / d; tp.x = bm.x + nx * rr; tp.z = bm.z + nz * rr; const sp = Math.max(6, Math.hypot(tp.vx, tp.vz) * 1.5); tp.vx = nx * sp; tp.vz = nz * sp; tp.spin = Math.min(1, tp.spin + 0.04); bm.k = 1; playSfx('clashHeavy', 0.3, 1.4); if (!simulating) spawnSparks(tp.x, 0.5, tp.z, 8, 5); }
  }
}
function simStep(dt) {
  simTime += dt;
  const playing = state === State.PLAYING, field = blocks.length - (great ? 1 : 0);
  spawnT -= dt;
  if (spawnT <= 0 && field < blockCap()) { spawnBlock(); spawnT = spawnEvery() * (great ? 1.6 : 1); }
  if (ARENAS[arena.idx].twist === 'comets') { cometT -= dt; if (cometT <= 0) { spawnBlock({ star: true }); cometT = rand(16, 22); } }
  for (const tp of tops) stepTop(tp, dt);
  const live = tops.filter((tp) => tp.st === 'spin');
  for (let i = 0; i < live.length; i++) { for (let j = i + 1; j < live.length; j++) collideTops(live[i], live[j]); for (const b of blocks) collideBlock(live[i], b); if (arena.bumpers.length) stepBumpers(live[i]); }
  stepBlocks(dt);
  if (playing) {
    if (save.auto.autoWhip) { autoT.whip -= dt; if (autoT.whip <= 0) { autoT.whip = 6; const slow = live.slice().sort((a, b) => a.spin - b.spin)[0] || tops.find((tp) => tp.st === 'wait'); if (slow) whip(slow, false); } }
    if (save.auto.autoMerge) { autoT.merge -= dt; if (autoT.merge <= 0) { autoT.merge = 2.5; autoMergeOnce(); } }
    if (save.auto.autoBuy) { autoT.buy -= dt; if (autoT.buy <= 0) { autoT.buy = 3; if (freeSlot() >= 0 && buyCost() <= save.coins * 0.25) buyTop(); } }
    while (earnWindow.length && earnWindow[0][0] < simTime - 30) earnWindow.shift();
    save.playTime += dt;
  }
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED; break screens: OFFLINE, CLEARED, TOURNEY)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', BREAK: 'BREAK', COVER: 'COVER' };
let state = State.BOOT, prevBreak = null, clearedPrize = 0, toastTimer = 0;
const stats = { whips: 0, broken: 0, merges: 0, hits: 0, contacts: 0 };
const freshSave = () => ({ v: 1, coins: 0, total: 0, runCoins: 0, stage: 1, progress: 0, tops: [1, 0, 0, 0], bought: 0, up: {}, auto: {}, trophies: 0, tourneys: 0, bestStage: 1, bestTier: 1,
  tiersSeen: { 1: 1 }, playTime: 0, rate: 0, last: 0, tips: {}, vol: { music: 0.8, sfx: 0.9 }, gfx: 'auto', shake: 'on' });
function loadSave() {
  save = freshSave();
  if (CAPTURE) return;
  const s = loadData(SAVE_KEY, null);
  if (s && s.v === 1) save = { ...freshSave(), ...s, vol: { ...freshSave().vol, ...(s.vol || {}) }, up: { ...(s.up || {}) }, auto: { ...(s.auto || {}) }, tips: { ...(s.tips || {}) }, tiersSeen: { 1: 1, ...(s.tiersSeen || {}) } };
  while (save.tops.length < slotCount()) save.tops.push(0);
}
function persist() {
  if (CAPTURE || !save) return;
  save.rate = incomeRate(); save.last = Date.now();
  saveData(SAVE_KEY, save);
}
function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU; $('paused').hidden = s !== State.PAUSED;
  document.body.classList.toggle('menu-open', s === State.MENU);
  $('hud').hidden = $('rack').hidden = $('panel').hidden = !(s === State.PLAYING || s === State.PAUSED || s === State.BREAK);
  if (s !== State.PLAYING) { $('hand').hidden = true; $('coach').hidden = true; endDrag(); }
  else if (coach.id) $('coach').hidden = false;
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menu, pause, prize screens
}
function togglePause() {
  if (state === State.PLAYING) { setState(State.PAUSED); persist(); }
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
let bannerTimer = 0;
function banner(title, sub = '') { if (simulating) return; const b = $('banner'); $('bannerTitle').textContent = title; $('bannerSub').textContent = sub; b.hidden = true; void b.offsetWidth; b.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2200); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.7); fn(); });
function openBreak(id) { for (const k of ['offline', 'cleared', 'tourney', 'settings']) $(k).hidden = k !== id; prevBreak = state === State.BREAK ? prevBreak : state; setState(State.BREAK); }
function closeBreak(id, to = State.PLAYING) { $(id).hidden = true; setState(to); }

// ================================================================ UI (HUD, rack, workshop panel, break screens)
const incomeRate = () => { if (!earnWindow.length) return save?.rate || 0; const span = Math.max(10, Math.min(30, simTime - earnWindow[0][0])); return earnWindow.reduce((a, e) => a + e[1], 0) / span; };
function tierColor(tier) { const [b, s, a] = TIERS[tier - 1]; return `conic-gradient(${b} 0 30deg, ${s} 30deg 60deg, ${b} 60deg 90deg, ${s} 90deg 120deg, ${b} 120deg 150deg, ${s} 150deg 180deg, ${b} 180deg 210deg, ${s} 210deg 240deg, ${b} 240deg 270deg, ${s} 270deg 300deg, ${b} 300deg 330deg, ${s} 330deg), ${a}`; }
function renderSlots() {
  const el = $('slots'), n = slotCount(); el.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const tier = save.tops[i] || 0, d = document.createElement('div');
    d.className = `slot${tier ? '' : ' empty'}`; d.dataset.i = i;
    if (tier) { d.innerHTML = `<div class="tic" style="background:${tierColor(tier)}"></div><b>${tier}</b><div class="down" hidden><i></i></div>`; d.title = t(`t${tier}`); }
    el.appendChild(d);
  }
  markMatches();
}
function markMatches() {
  const counts = {}; for (const tr of save.tops) if (tr) counts[tr] = (counts[tr] || 0) + 1;
  document.querySelectorAll('.slot').forEach((s) => { const tr = save.tops[+s.dataset.i]; s.classList.toggle('match', !!tr && counts[tr] > 1 && tr < CFG.maxTier); });
}
function updateSlotStates() {
  for (const tp of tops) {
    const el = document.querySelector(`.slot[data-i="${tp.slot}"] .down`); if (!el) continue;
    const down = tp.st === 'down' || tp.st === 'wait'; el.hidden = !down;
    if (down) el.firstElementChild.style.setProperty('--p', `${tp.st === 'wait' ? Math.round((1 - tp.t / relaunchTime()) * 100) : 0}%`);
  }
}
let shopDirty = true;
function renderShop() {
  shopDirty = false;
  const list = $('shopList'); list.innerHTML = '';
  const sect = (k) => { const h = document.createElement('div'); h.className = 'sect'; h.textContent = t(k); list.appendChild(h); };
  const row = (id, icon, name, desc, fx, cost, cls, kind) => {
    const r = document.createElement('div'); r.className = `row ${cls}`; r.dataset.id = id; r.dataset.kind = kind;
    r.innerHTML = `<span class="ri"><svg><use href="#i-${icon}"/></svg></span><span class="rt"><b>${name}</b><span>${desc}${fx ? ` <i>${fx}</i>` : ''}</span></span>`;
    const b = document.createElement('button'); b.dataset.cost = cost ?? '';
    if (cls.includes('max')) b.innerHTML = t('max'); else if (cls.includes('owned')) b.innerHTML = `<svg><use href="#i-check"/></svg>`; else if (cls.includes('locked')) b.innerHTML = `<svg><use href="#i-lock"/></svg>`;
    else b.innerHTML = `<svg><use href="#i-coin"/></svg>${fmt(cost)}`;
    b.addEventListener('click', () => { unlockAudio(); if (kind === 'up') buyUpgrade(id); else if (kind === 'auto') buyAuto(id); });
    r.appendChild(b); list.appendChild(r);
  };
  sect('sect_up');
  for (const u of UPGRADES) {
    const L = lvl(u.id), max = L >= u.max;
    row(u.id, u.icon, `${t('up_' + u.id)}<em>${L ? `Lv ${L}` : ''}</em>`, t('upd_' + u.id), max ? '' : upFx(u.id, L), upCost(u), max ? 'max' : '', 'up');
  }
  sect('sect_auto');
  for (const a of AUTOS) {
    const owned = !!save.auto[a.id], locked = save.stage < a.stage && !owned;
    row(a.id, a.icon, t('au_' + a.id), locked ? t('unlockAt', { n: a.stage }) : t('aud_' + a.id), '', autoCost(a), owned ? 'owned' : locked ? 'locked' : '', 'auto');
  }
  if (save.tourneys > 0 || save.stage >= CFG.tourneyStage - 1) {
    sect('sect_perk');
    for (const p of PERKS) row(p.id, 'trophy', t('pk_' + p.id), t('perkAt', { n: p.at }), '', null, save.trophies >= p.at ? 'owned' : 'locked', 'perk');
  }
  updateAfford();
}
function upFx(id, L) {
  const f2 = (x) => (Math.round(x * 100) / 100).toString();
  switch (id) {
    case 'tips': return t('fx_dmg', { a: fmtX(Math.pow(1.25, L)), b: fmtX(Math.pow(1.25, L + 1)) });
    case 'value': return t('fx_val', { a: fmtX(Math.pow(1.2, L)), b: fmtX(Math.pow(1.2, L + 1)) });
    case 'tap': return t('fx_dmg', { a: fmtX(Math.pow(1.5, L)), b: fmtX(Math.pow(1.5, L + 1)) });
    case 'spin': return t('fx_spin', { a: Math.round(spinTime(L)), b: Math.round(spinTime(L + 1)) });
    case 'spawn': return t('fx_spawn', { a: blockCap(L), b: blockCap(L + 1) });
    case 'crit': return t('fx_crit', { a: Math.round(critChance(L) * 100), b: Math.round(critChance(L + 1) * 100) });
    case 'launch': return t('fx_launch', { a: f2(relaunchTime(L).toFixed(1)), b: f2(relaunchTime(L + 1).toFixed(1)) });
    case 'pegs': return t('fx_pegs', { a: slotCount(L), b: slotCount(L + 1) });
  }
  return '';
}
function updateAfford() {
  document.querySelectorAll('#shopList .row').forEach((r) => {
    const b = r.querySelector('button'), c = +b.dataset.cost;
    if (b.dataset.cost !== '' && !r.classList.contains('max') && !r.classList.contains('owned') && !r.classList.contains('locked')) b.classList.toggle('cant', c > save.coins);
  });
  const bc = buyCost(); $('buyCost').textContent = fmt(bc); $('buyTier').textContent = buyTier(); $('btnBuy').classList.toggle('cant', bc > save.coins || freeSlot() < 0);
}
let hudT = 0;
function updateHud(dt) {
  coinBumpT -= dt; hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  $('coinText').textContent = fmt(save.coins); $('rateText').textContent = fmt(incomeRate());
  const A = ARENAS[arena.idx]; $('arenaName').textContent = t('ar_' + A.id); $('stageText').textContent = t('stage', { n: save.stage });
  const goal = $('goalFill').parentElement;
  if (great) { goal.classList.add('boss'); $('goalFill').style.width = `${Math.max(0, (great.hp / great.maxHp) * 100)}%`; $('goalText').textContent = `${t('great')} · ${fmt(Math.max(0, great.hp))}`; }
  else { goal.classList.remove('boss'); const g = goalFor(save.stage); $('goalFill').style.width = `${(save.progress / g) * 100}%`; $('goalText').textContent = t('blocks', { a: Math.min(save.progress, g), b: g }); }
  $('btnTourney').hidden = !(save.stage >= CFG.tourneyStage && state !== State.MENU);
  $('multText').textContent = save.trophies ? t('mult', { m: fmtX(trophyMult()) }) : '';
  updateAfford(); updateSlotStates();
  if (jarCoins) { const f = clamp(Math.log10(1 + save.coins) / 14, 0.05, 1); jarCoins.scale.y = f * 2.5; jarCoins.position.y = (f * 2.5) / 2; }
}
function freeSlot() { const n = slotCount(); for (let i = 0; i < n; i++) if (!save.tops[i]) return i; return -1; }
function buyTop() {
  const i = freeSlot(), cost = buyCost();
  if (i < 0) { toast(t('slotsFull')); playSfx('nope'); return false; }
  if (cost > save.coins) { toast(t('notEnough')); playSfx('nope'); return false; }
  save.coins -= cost; save.bought++; const tier = buyTier(); save.tops[i] = tier; addTop(i, tier); renderSlots(); playSfx('register', 0.8); playSfx('launch', 0.6);
  coachDone('buy'); return true;
}
function mergeSlots(a, b) { // drop a onto b
  const ta = save.tops[a], tb = save.tops[b];
  if (!ta || a === b) return false;
  const tpa = tops.find((q) => q.slot === a), tpb = tops.find((q) => q.slot === b);
  if (!tb) { save.tops[b] = ta; save.tops[a] = 0; if (tpa) tpa.slot = b; renderSlots(); return true; } // move to an empty peg
  if (ta !== tb || ta >= CFG.maxTier) { save.tops[a] = tb; save.tops[b] = ta; if (tpa) tpa.slot = b; if (tpb) tpb.slot = a; renderSlots(); return true; } // swap
  const nt = ta + 1; save.tops[a] = 0; save.tops[b] = nt;
  if (tpa) { if (!simulating) spawnSparks(tpa.x, 0.6, tpa.z, 14, 4); removeTop(tpa); }
  const tp = tpb || addTop(b, ta, false); setTopTier(tp, nt); tp.spin = 1; tp.whip = 1.5; if (tp.st !== 'spin') relaunch(tp);
  if (!simulating) { spawnSparks(tp.x, 0.8, tp.z, 24, 6); spawnChips(tp.x, 0.6, tp.z, TIERS[nt - 1][1], 10, 3); }
  playSfx('merge'); stats.merges++;
  if (nt > (save.bestTier || 1)) save.bestTier = nt;
  if (!save.tiersSeen[nt]) { save.tiersSeen[nt] = 1; banner(t('newTier'), t(`t${nt}`)); playSfx('level', 0.7); shake(0.2); }
  renderSlots(); coachDone('merge'); return true;
}
function autoMergeOnce() {
  const seen = {};
  for (let i = 0; i < slotCount(); i++) { const tr = save.tops[i]; if (!tr || tr >= CFG.maxTier) continue; if (seen[tr] !== undefined) { mergeSlots(i, seen[tr]); return true; } seen[tr] = i; }
  return false;
}
function buyUpgrade(id) {
  const u = UPGRADES.find((q) => q.id === id), L = lvl(id), c = upCost(u);
  if (L >= u.max) return false;
  if (c > save.coins) { if (!AUTOPLAY) { toast(t('notEnough')); playSfx('nope'); } return false; }
  save.coins -= c; save.up[id] = L + 1; playSfx('upgrade', 0.8);
  if (id === 'pegs') { while (save.tops.length < slotCount()) save.tops.push(0); renderSlots(); }
  shopDirty = true; coachDone('upgrade'); return true;
}
function buyAuto(id) {
  const a = AUTOS.find((q) => q.id === id);
  if (save.auto[id] || save.stage < a.stage) return false;
  if (a.cost > save.coins) { if (!AUTOPLAY) { toast(t('notEnough')); playSfx('nope'); } return false; }
  save.coins -= a.cost; save.auto[id] = 1; playSfx('unlock', 0.8); banner(t('au_' + id), t('aud_' + id)); shopDirty = true; return true;
}
function showCleared() {
  const nextStage = save.stage + 1, newArena = arenaOf(nextStage) !== arena.idx;
  $('clearedCoins').textContent = fmt(clearedPrize);
  $('clearedText').textContent = newArena ? `${t('clearedNext', { a: t('ar_' + ARENAS[arenaOf(nextStage)].id) })}: ${t('tw_' + ARENAS[arenaOf(nextStage)].twist)}` : t('clearedStage', { n: nextStage });
  $('btnClearTriple').hidden = !adsAvailable();
  if (simulating || AUTOPLAY) { collectCleared(1); return; }
  openBreak('cleared'); playSfx('fanfare', 0.7);
}
function collectCleared(mult) {
  earn(clearedPrize * mult); playSfx('jar'); clearedPrize = 0;
  const nextStage = save.stage + 1, newArena = arenaOf(nextStage) !== arena.idx;
  save.stage = nextStage; save.progress = 0; save.bestStage = Math.max(save.bestStage, nextStage); shopDirty = true;
  const go = () => {
    if (newArena) { enterArena(arenaOf(save.stage), true); happytime(); }
    else banner(t('arenaBanner', { n: save.stage }), t('ar_' + ARENAS[arena.idx].id));
    if (state === State.BREAK) closeBreak('cleared');
    if (save.stage >= CFG.tourneyStage) coachStart('tourney');
    persist();
  };
  if (newArena && !simulating && !CAPTURE) triggerMidgameAd(go); else go(); // a new arena is a natural break: the place for a midgame ad
}
function enterArena(idx, announce) {
  for (const b of blocks.slice()) removeBlock(b); great = null; coins.length = 0;
  buildArena(idx); for (const tp of tops) relaunch(tp);
  spawnT = 0.5; cometT = 10;
  if (announce && !simulating) { banner(t('ar_' + ARENAS[idx].id), ARENAS[idx].twist ? t('tw_' + ARENAS[idx].twist) : t('stage', { n: save.stage })); playSfx('portal', 0.7); flash(); }
  if (state !== State.MENU) playMusic(ARENAS[idx].music);
}
function openTourney() {
  const gain = CFG.trophies(save.stage), now = save.trophies;
  $('tourneyGain').textContent = `+${gain}`; $('tourneyMult').textContent = `x${fmtX(trophyMult())} → x${fmtX(1 + CFG.trophyBoost * (now + gain))}`;
  const perk = PERKS.find((p) => now < p.at && now + gain >= p.at); $('tourneyPerk').textContent = perk ? t('tourneyPerk', { p: t('pk_' + perk.id) }) : '';
  openBreak('tourney');
}
function doTourney() {
  const gain = CFG.trophies(save.stage);
  if (gain <= 0) return;
  const keep = { coins: 0, total: save.total, trophies: save.trophies + gain, tourneys: save.tourneys + 1, bestStage: save.bestStage, bestTier: 1, tiersSeen: save.tiersSeen, playTime: save.playTime, tips: save.tips, vol: save.vol, gfx: save.gfx, shake: save.shake };
  const auto = {}; if (hasPerkAt('keepWhip', keep.trophies) && save.auto.autoWhip) auto.autoWhip = 1; if (hasPerkAt('keepMerge', keep.trophies) && save.auto.autoMerge) auto.autoMerge = 1;
  save = { ...freshSave(), ...keep, auto };
  const startTier = hasPerk('tier3') ? 3 : 1; save.bestTier = startTier;
  save.tops = [startTier, hasPerk('head') ? startTier : 0, hasPerk('head') ? startTier : 0, 0];
  for (const tp of tops.slice()) removeTop(tp);
  for (let i = 0; i < save.tops.length; i++) if (save.tops[i]) addTop(i, save.tops[i]);
  earnWindow = []; enterArena(0, false); renderSlots(); shopDirty = true; updateShelf();
  playSfx('fanfare', 0.8); playSfx('cheer', 0.7); happytime();
  banner(t('tourneyDone'), t('tourneyDoneSub', { n: gain })); persist();
}
const hasPerkAt = (id, n) => PERKS.some((p) => p.id === id && n >= p.at);
function showOffline(force = false) {
  if ((CAPTURE && !force) || !save.last || !save.rate) return false;
  const away = Math.min(offlineCap(), (Date.now() - save.last) / 1000);
  if (away < 60) return false;
  const amount = save.rate * away * CFG.offlineEff; if (amount < 1) return false;
  offlineAmount = amount;
  const h = Math.floor(away / 3600), m = Math.floor((away % 3600) / 60);
  $('awayText').textContent = t('awayText', { t: h ? t('hours', { h, m }) : t('minutes', { m: Math.max(1, m) }) });
  $('awayCoins').textContent = fmt(amount); $('btnAwayDouble').hidden = !adsAvailable();
  openBreak('offline'); playSfx('register', 0.8); return true;
}
let offlineAmount = 0;
function controlsHTML() {
  const key = (k) => `<span class="key">${k}</span>`;
  const verb = isTouch ? t('ctl_tap') : t('ctl_click');
  return `<span><svg><use href="#i-finger"/></svg>${verb}: ${t('ctl_whip')}</span><span><svg><use href="#i-merge"/></svg>${t('ctl_drag')}: ${t('ctl_merge')}</span>` +
    (isTouch ? '' : `<span>${key('B')} ${t('ctl_buy')}</span><span>${key('P')} ${t('ctl_pause')}</span>`);
}
function refreshMenu() {
  $('playLabel').textContent = save.total > 0 ? t('continue') : t('play');
  $('menuStats').innerHTML = save.total > 0 ? `<span>${t('menuBest')}: <b>${save.bestStage}</b></span><span>${t('menuTrophies')}: <b>${save.trophies}</b></span>` : '';
  $('menuControls').innerHTML = controlsHTML();
}
function applyGfx() {
  const g = save.gfx === 'auto' ? (lowGfx ? 'low' : 'high') : save.gfx;
  renderer.setPixelRatio(Math.min(devicePixelRatio, g === 'low' ? 1 : 1.75));
  lamp.castShadow = g !== 'low';
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.gfx === save.gfx));
  resize();
}
let lowGfx = false, fpsAcc = 0, fpsN = 0;
function watchFps(dt) { if (save.gfx !== 'auto' || lowGfx) return; fpsAcc += dt; fpsN++; if (fpsAcc > 4) { if (fpsN / fpsAcc < 40) { lowGfx = true; applyGfx(); } fpsAcc = 0; fpsN = 0; } }

click('btnPlay', () => startGame());
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { persist(); setState(State.MENU); refreshMenu(); menuView(); });
click('btnSettingsMenu', () => { settingsFrom = State.MENU; openSettings(); });
click('btnSettingsPause', () => { settingsFrom = State.PAUSED; openSettings(); });
click('btnSettingsBack', () => { $('settings').hidden = true; persist(); if (settingsFrom === State.MENU) { setState(State.MENU); } else { $('paused').hidden = false; setState(State.PAUSED); } });
click('btnBuy', () => buyTop());
click('btnTourney', () => openTourney());
click('btnTourneyBack', () => closeBreak('tourney'));
click('btnTourneyGo', () => { $('tourney').hidden = true; triggerMidgameAd(() => { doTourney(); setState(State.PLAYING); }); }); // a tournament is a full break: midgame ad
click('btnAwayCollect', () => { earn(offlineAmount); offlineAmount = 0; playSfx('jar'); closeBreak('offline'); nextCoach(); });
click('btnAwayDouble', () => { $('btnAwayDouble').hidden = true; triggerRewardedAd(() => { offlineAmount *= 2; $('awayCoins').textContent = fmt(offlineAmount); playSfx('frenzy', 0.7); }, () => {}); });
click('btnClearCollect', () => collectCleared(1));
click('btnClearTriple', () => { $('btnClearTriple').hidden = true; triggerRewardedAd(() => { clearedPrize *= 3; $('clearedCoins').textContent = fmt(clearedPrize); playSfx('frenzy', 0.7); }, () => {}); });
click('btnSkipTips', () => { save.tips.off = 1; coachEnd(); persist(); });
let settingsFrom = State.MENU;
function openSettings() {
  $('volMusic').value = save.vol.music; $('volSfx').value = save.vol.sfx;
  $('menu').hidden = true; $('paused').hidden = true; $('settings').hidden = false; applyGfx();
  if (state === State.PLAYING) setState(State.PAUSED);
}
$('volMusic').addEventListener('input', (e) => { save.vol.music = +e.target.value; setMusicVolume(); });
$('volSfx').addEventListener('input', (e) => { save.vol.sfx = +e.target.value; playSfx('coin', 1); });
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { save.gfx = b.dataset.gfx; lowGfx = false; applyGfx(); }));

// ================================================================ INPUT (tap tops to whip, tap blocks to flick, drag pegs to merge, keys)
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function screenOf(x, y, z) { _v.set(x, y, z).project(camera); return [((_v.x + 1) / 2) * innerWidth, ((1 - _v.y) / 2) * innerHeight]; }
function pickAt(px, py) {
  let best = null, bd = isTouch ? 60 : 46;
  for (const tp of tops) { const [sx, sy] = screenOf(tp.x, 0.4, tp.z), d = Math.hypot(sx - px, sy - py); if (d < bd) { bd = d; best = { tp }; } }
  if (best) return best;
  bd = isTouch ? 64 : 52;
  for (const b of blocks) { const [sx, sy] = screenOf(b.x, b.great ? 1 : 0.4, b.z), d = Math.hypot(sx - px, sy - py) - (b.great ? 40 : 0); if (d < bd) { bd = d; best = { b }; } }
  return best;
}
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (hit?.tp) whip(hit.tp);
  else if (hit?.b) { hitBlock(hit.b, tapDamage(), false, hit.b.x, hit.b.z, 'tap'); coachDone('tap'); }
});
const drag = { from: -1, id: null, x0: 0, y0: 0, on: false, el: null };
$('slots').addEventListener('pointerdown', (e) => {
  unlockAudio();
  const s = e.target.closest('.slot'); if (!s || state !== State.PLAYING) return;
  const i = +s.dataset.i; if (!save.tops[i]) return;
  drag.from = i; drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.on = false;
  s.setPointerCapture?.(e.pointerId);
});
addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id || drag.from < 0) return;
  if (!drag.on && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) {
    drag.on = true; const src = document.querySelector(`.slot[data-i="${drag.from}"]`); src?.classList.add('dragging');
    drag.el = src.cloneNode(true); drag.el.id = 'drag'; drag.el.classList.remove('dragging', 'match'); document.body.appendChild(drag.el);
  }
  if (drag.on) { drag.el.style.left = `${e.clientX}px`; drag.el.style.top = `${e.clientY}px`; }
});
addEventListener('pointerup', (e) => {
  if (e.pointerId !== drag.id || drag.from < 0) return;
  if (drag.on) {
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('slot') && n.id !== 'drag');
    if (under) mergeSlots(drag.from, +under.dataset.i);
  } else { const tp = tops.find((q) => q.slot === drag.from); whip(tp); } // a tap on a peg whips that top
  endDrag();
});
addEventListener('pointercancel', (e) => { if (e.pointerId === drag.id) endDrag(); });
function endDrag() { drag.el?.remove(); drag.el = null; document.querySelectorAll('.slot.dragging').forEach((s) => s.classList.remove('dragging')); drag.from = -1; drag.id = null; drag.on = false; }
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  unlockAudio();
  if (e.code === 'KeyP') { togglePause(); return; } // never Escape: on CrazyGames it exits fullscreen
  if (state === State.MENU && (e.code === 'Enter' || e.code === 'Space')) { $('btnPlay').click(); return; }
  if (state !== State.PLAYING) return;
  if (e.code === 'KeyB') buyTop();
  if (e.code === 'Space') { const slow = tops.filter((q) => q.st === 'spin').sort((a, b) => a.spin - b.spin)[0] || tops.find((q) => q.st === 'wait'); whip(slow); }
  if (e.code === 'KeyM') autoMergeOnce();
});

// ================================================================ ONBOARDING (teaches by doing: whip, buy, merge, upgrade; one-off tips later; skippable)
const coach = { id: null, t: 0 };
const COACH_ORDER = ['whip', 'buy', 'merge', 'upgrade'];
function coachStart(id) {
  if (AUTOPLAY || save.tips.off || save.tips[id] || coach.id === id) return;
  if (coach.id && COACH_ORDER.includes(coach.id) && !COACH_ORDER.includes(id)) return;
  coach.id = id; coach.t = 0; renderCoach();
}
function renderCoach() {
  const id = coach.id; if (!id) return;
  let txt = t('tip_' + id), ico = '';
  if (id === 'whip') { txt = t(isTouch ? 'tip_whip_t' : 'tip_whip'); ico = '<svg><use href="#i-finger"/></svg>'; }
  else if (id === 'buy') { txt = t(save.tops.filter(Boolean).length >= 2 ? 'tip_buy2' : 'tip_buy'); ico = '<svg><use href="#i-top"/></svg>'; }
  else if (id === 'merge') ico = '<svg><use href="#i-merge"/></svg>';
  else if (id === 'upgrade') ico = '<svg><use href="#i-tip"/></svg>';
  else if (id === 'tap') { txt = t(isTouch ? 'tip_tap_t' : 'tip_tap'); ico = '<svg><use href="#i-block"/></svg>'; }
  else if (id === 'tourney') ico = '<svg><use href="#i-trophy"/></svg>';
  $('coachText').textContent = txt; $('coachIco').innerHTML = ico; $('coach').hidden = state !== State.PLAYING;
}
function coachDone(id) {
  if (!save || save.tips[id]) return;
  save.tips[id] = 1;
  if (coach.id === id) { coachEnd(); playSfx('tip', 0.6); nextCoach(); }
}
function coachEnd() { coach.id = null; $('coach').hidden = true; $('hand').hidden = true; }
function nextCoach() {
  if (save.tips.off || AUTOPLAY) return;
  for (const id of COACH_ORDER) if (!save.tips[id]) { coachStart(id); return; }
}
function updateCoach(dt) {
  const hand = $('hand');
  if (!coach.id || state !== State.PLAYING) { hand.hidden = true; return; }
  coach.t += dt;
  if (coach.id === 'buy' && save.tops.filter(Boolean).length >= 2 && Object.values(countTiers()).some((n) => n > 1)) { save.tips.buy = 1; coachEnd(); nextCoach(); return; }
  if (coach.id === 'merge' && !Object.values(countTiers()).some((n) => n > 1)) { // need twins first: ask for one more top
    if (freeSlot() >= 0) { hand.hidden = true; $('coachText').textContent = t('tip_buy2'); placeHand('btnBuy'); return; }
  }
  if (coach.id === 'merge') {
    const c = countTiers(), tier = +Object.keys(c).find((k) => c[k] > 1), idx = save.tops.map((q, i) => (q === tier ? i : -1)).filter((i) => i >= 0);
    const a = document.querySelector(`.slot[data-i="${idx[1]}"]`), b = document.querySelector(`.slot[data-i="${idx[0]}"]`);
    $('coachText').textContent = t('tip_merge');
    if (a && b) { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); hand.className = 'drag'; hand.hidden = false; hand.style.left = `${ra.left + ra.width / 2}px`; hand.style.top = `${ra.top + ra.height / 2}px`; hand.style.setProperty('--dx', `${rb.left - ra.left}px`); hand.style.setProperty('--dy', `${rb.top - ra.top}px`); }
    return;
  }
  if (coach.id === 'whip') { const tp = tops.find((q) => q.st === 'spin'); if (tp) { const [x, y] = screenOf(tp.x, 0.3, tp.z); hand.className = 'tap'; hand.hidden = false; hand.style.left = `${x}px`; hand.style.top = `${y}px`; } return; }
  if (coach.id === 'buy') { placeHand('btnBuy'); if (buyCost() > save.coins) hand.hidden = true; return; }
  if (coach.id === 'upgrade') {
    const r = [...document.querySelectorAll('#shopList .row')].find((q) => q.dataset.kind === 'up' && !q.querySelector('button').classList.contains('cant') && !q.classList.contains('max'));
    document.querySelectorAll('#shopList .row.glow').forEach((q) => q !== r && q.classList.remove('glow'));
    if (r) { r.classList.add('glow'); placeHand(r.querySelector('button')); } else hand.hidden = true;
    return;
  }
  if (coach.id === 'tourney') { placeHand('btnTourney'); if (coach.t > 8) { save.tips.tourney = 1; coachEnd(); } return; }
  if (coach.id === 'tap' && coach.t > 7) { save.tips.tap = 1; coachEnd(); }
  hand.hidden = true;
}
function placeHand(elOrId) {
  const el = typeof elOrId === 'string' ? $(elOrId) : elOrId, hand = $('hand');
  if (!el || el.hidden || !el.offsetParent) { hand.hidden = true; return; }
  const r = el.getBoundingClientRect(); hand.className = 'tap'; hand.hidden = false; hand.style.left = `${r.left + r.width * 0.55}px`; hand.style.top = `${r.top + r.height * 0.5}px`;
}
const countTiers = () => { const c = {}; for (const tr of save.tops) if (tr) c[tr] = (c[tr] || 0) + 1; return c; };

// ================================================================ BOT (trailer footage + balance tests: plays like a reasonably active player)
let botT = 0;
function botTick(dt) {
  if (!AUTOPLAY || state !== State.PLAYING) return;
  botT -= dt; if (botT > 0) return; botT = 0.5;
  if (Math.random() < BOT_SKILL * 0.6) { const slow = tops.filter((q) => q.st === 'spin' || q.st === 'wait').sort((a, b) => a.spin - b.spin)[0]; if (slow && slow.spin < 0.6) whip(slow, false); }
  if (Math.random() < BOT_SKILL * 0.8 && blocks.length) { const b = great || blocks[(Math.random() * blocks.length) | 0]; if (b.y < 0.9) hitBlock(b, tapDamage(), false, b.x, b.z, 'bot'); }
  while (autoMergeOnce());
  if (freeSlot() >= 0 && buyCost() <= save.coins) { buyTop(); while (autoMergeOnce()); }
  for (const a of AUTOS) if (!save.auto[a.id] && save.stage >= a.stage && a.cost <= save.coins * 0.9) buyAuto(a.id);
  const cands = UPGRADES.filter((u) => lvl(u.id) < u.max).map((u) => ({ u, c: upCost(u) * (u.id === 'pegs' && freeSlot() >= 0 ? 4 : 1) * (u.id === 'crit' || u.id === 'launch' ? 1.5 : 1) })).sort((a, b) => a.c - b.c);
  if (cands[0] && cands[0].c <= save.coins && (freeSlot() < 0 || buyCost() > cands[0].c * 0.5)) buyUpgrade(cands[0].u.id);
  // a tournament once progress stalls and the trophies are worth it
  if (save.stage >= CFG.tourneyStage) {
    const gain = CFG.trophies(save.stage); botStageT += 0.5;
    if (gain >= Math.max(3, save.trophies * 0.6) && (botStageT > 150 || gain >= save.trophies * 2 + 6)) { botStageT = 0; doTourney(); }
  }
}
let botStageT = 0, lastBotStage = 1;
function botStageWatch() { if (save.stage !== lastBotStage) { lastBotStage = save.stage; botStageT = 0; } }

// ================================================================ LOOP
let last = performance.now(), acc = 0, camShift = 0;
function step(dt) {
  if (state === State.PLAYING || state === State.MENU || state === State.COVER) simStep(dt);
  if (AUTOPLAY && state === State.PLAYING) { botStageWatch(); botTick(dt); }
}
function advance(dt) {
  if (state === State.PLAYING || state === State.MENU) { acc += dt; let n = 0; while (acc >= STEP && n < 10) { step(STEP); acc -= STEP; n++; } if (n === 10) acc = 0; }
  else acc = 0;
  animate(dt);
}
function placeTop(tp) {
  const v = tp.view, r = Math.hypot(tp.x, tp.z);
  let y = floorY(r), tilt = 0.1 + Math.pow(1 - tp.spin, 4) * 0.5;
  if (tp.st === 'drop') y += Math.max(0, tp.t) * 7;
  if (tp.st === 'down' || tp.st === 'wait') { tilt = Math.min(1.25, 1.25 * (1 - Math.max(0, tp.t) / 0.9) + (tp.st === 'wait' ? 1.25 : 0)); tilt = Math.min(1.25, tilt); }
  v.root.position.set(tp.x, y, tp.z);
  v.tilt.rotation.set(Math.cos(tp.prec) * tilt, 0, Math.sin(tp.prec) * tilt);
}
function animate(dt) {
  for (const tp of tops) {
    const v = tp.view, spinning = tp.st === 'spin' || tp.st === 'drop';
    v.spinG.rotation.y -= dt * (spinning ? 9 + tp.spin * 16 : 0);
    v.swoosh.visible = spinning && tp.spin > 0.25; v.swoosh.rotation.z -= dt * 14; swooshMat.opacity = 0.32;
    placeTop(tp);
    if (tp.whip > 0 && !simulating && Math.random() < dt * 20) spawnSparks(tp.x, 0.3, tp.z, 1, 2);
  }
  for (const b of blocks) placeBlock(b, dt);
  for (const bm of arena.bumpers) { bm.k = Math.max(0, bm.k - dt * 5); bm.mesh.scale.set(1 + bm.k * 0.25, 1 - bm.k * 0.2, 1 + bm.k * 0.25); }
  if (arena.gear) arena.gear.rotation.y += dt * 0.22;
  updateFx(dt);
}
function placeBlock(b, dt = 0) {
  const r = Math.hypot(b.x, b.z), sq = b.squash;
  b.view.root.position.set(b.x, floorY(r) + b.y + (b.great ? 1.1 : BLOCK_TYPES[b.type].size / 2) * (1 - sq * 0.15), b.z);
  b.rot += dt * (b.star ? 4 : Math.hypot(b.vx, b.vz) * 0.4); b.view.root.rotation.y = b.rot;
  b.grow = Math.min(1, (b.grow ?? 1) + dt * 4); const gs = 0.3 + 0.7 * b.grow; // blocks pop in as they drop
  b.view.root.scale.set((1 + sq * 0.12) * gs, (1 - sq * 0.15) * gs, (1 + sq * 0.12) * gs);
  b.view.mat.emissive.setRGB(b.flash * 0.6, b.flash * 0.45, b.flash * 0.25);
  if (b.great) { const k = b.hp / b.maxHp; b.view.mat.color.copy(b.view.base).multiplyScalar(0.7 + 0.3 * k); }
}
let menuMode = false;
function menuView() { menuMode = true; if (!tops.length) for (let i = 0; i < 3; i++) addTop(i, [3, 2, 1][i], false); }
function updateCamera(dt) {
  const portrait = innerHeight > innerWidth * 1.25;
  const want = menuMode && !portrait ? -4.6 : 0; camShift += (want - camShift) * (1 - Math.exp(-dt * 4));
  const dist = portrait ? 1.55 : 1;
  camera.position.set(camShift * 0.6, 13.2 * dist, 19 * dist + (portrait ? 2 : 0));
  shakeAmt = Math.max(0, shakeAmt - dt * 2);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camShift, 0, portrait ? 2.2 : 0.9);
  applyViewOffset();
}
function applyViewOffset() { // keep the bowl centred in the space the panel and rack leave free
  const w = innerWidth, h = innerHeight, portrait = h > w * 1.25;
  if (state === State.MENU || state === State.COVER || state === State.BOOT) { camera.clearViewOffset(); return; }
  const panel = portrait ? 0 : $('panel').offsetWidth || 0, panelH = portrait ? $('panel').offsetHeight || 0 : 0, rack = $('rack').offsetHeight || 0;
  camera.setViewOffset(w, h, panel / 2, (rack + panelH) / 2 - 18, w, h);
}
function render(dt) { updateCamera(dt); renderer.render(scene, camera); }
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt); watchFps(dt);
  if (state === State.PLAYING) { updateHud(dt); updateCoach(dt); if (shopDirty) renderShop(); }
  saveT -= dt; if (saveT <= 0 && state === State.PLAYING) { saveT = 5; persist(); }
  requestAnimationFrame(frame);
}
let saveT = 5;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
addEventListener('pagehide', () => persist());
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); else last = performance.now(); });

function startGame() {
  menuMode = false;
  for (const tp of tops.slice()) removeTop(tp);
  for (let i = 0; i < slotCount(); i++) if (save.tops[i]) addTop(i, save.tops[i]);
  if (arena.idx !== arenaOf(save.stage)) enterArena(arenaOf(save.stage), false);
  if (great == null && save.progress >= goalFor(save.stage)) summonGreat();
  renderSlots(); shopDirty = true; renderShop(); updateShelf();
  setState(State.PLAYING); playMusic(ARENAS[arena.idx].music);
  hudT = 0; updateHud(0);
  if (!showOffline()) nextCoach();
  if (!save.tips.off && save.tips.upgrade && !save.tips.tap) setTimeout(() => coachStart('tap'), 20000);
}

// ================================================================ COVER (tools/game_covers.py: honest key art rendered from the game itself)
function stageCover(kind) {
  setState(State.COVER); document.body.classList.add('cover'); menuMode = false;
  for (const id of ['menu', 'paused', 'settings', 'offline', 'cleared', 'tourney', 'banner', 'toast', 'coach', 'hand']) $(id).hidden = true;
  for (const tp of tops.slice()) removeTop(tp); for (const b of blocks.slice()) removeBlock(b);
  coins.length = chips.length = sparks.length = 0;
  save.stage = 4; buildArena(1); save.trophies = 6; updateShelf();
  const spots = [[11, -1.2, 0.6], [8, 1.6, -1.4], [6, 2.4, 1.9], [4, -2.6, -1.9], [2, -3.2, 1.6]];
  for (const [tier, x, z] of spots) { const tp = addTop(0, tier, false); tp.x = x; tp.z = z; tp.spin = 1; tp.st = 'spin'; tp.prec = rand(0, 6); }
  const bl = [[0, 0.3, 2.6], [1, 3.4, -0.3], [2, -0.6, -2.9], [0, -4.2, -0.2], [1, 4.4, 2.8], [0, 1.2, -4.6], [2, -4.4, 3.4]];
  for (const [type, x, z] of bl) { const b = spawnBlock(); removeBlock(b); const nb = { ...b, type, x, z, y: 0, r: BLOCK_TYPES[type].size * 0.62, view: buildBlockView(type, ARENAS[1].blocks[type], false, false, false) }; nb.golden = false; scene.add(nb.view.root); blocks.push(nb); }
  const gb = spawnBlock(); removeBlock(gb); const golden = { ...gb, type: 1, x: 2.2, z: 1.2, y: 0, golden: true, r: 0.62, view: buildBlockView(1, '#ffcc33', true, false, false) }; scene.add(golden.view.root); blocks.push(golden);
  for (let i = 0; i < 30; i++) animate(1 / 30);
  spawnChips(-0.6, 0.6, -2.9, ARENAS[1].blocks[2], 18, 3.5); spawnSparks(-1.2, 0.6, 0.6, 20, 4); spawnSparks(1.6, 0.6, -1.4, 14, 4); spawnCoins(-0.6, 0.6, -2.6, 10);
  for (let i = 0; i < 9; i++) { updateFx(1 / 30); }
  for (const c of coins) c.t = 0;
  const cam = { landscape: [0, 9.5, 9.8, 0, 0, 0.2], portrait: [0, 13, 11, 0, 0, 1.4], square: [0, 11, 10.5, 0, 0, 0.8], keyart: [0, 9.5, 9.8, 0, 0, 0.2] }[kind] || [0, 9.5, 9.8, 0, 0, 0.2];
  camera.clearViewOffset(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.position.set(cam[0], cam[1], cam[2]); camera.lookAt(cam[3], cam[4], cam[5]);
  renderer.render(scene, camera);
}

// ================================================================ BOOT
function showcaseSave() { // capture/trailer: a lively mid-game workshop instead of a lone first top
  Object.assign(save, { coins: 2.4e4, total: 3e5, stage: 4, progress: 12, tops: [6, 5, 5, 4, 3, 3, 2, 1], bought: 40, up: { tips: 8, value: 6, spin: 5, spawn: 4, pegs: 4, tap: 4 }, bestTier: 6, trophies: 3, tourneys: 1, bestStage: 7, tiersSeen: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 } });
}
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n();
  initAudio(); loadSave();
  if (CAPTURE && !params.has('fresh')) showcaseSave();
  const jobs = [...Object.entries(SFX_FILES).map(([k, u]) => loadSfx(k, u)), document.fonts?.load('800 32px UI').catch(() => {}), document.fonts?.load('32px Display').catch(() => {})];
  let done = 0; jobs.forEach((p) => Promise.resolve(p).finally(() => { done++; $('loadBar').style.width = `${(100 * done) / jobs.length}%`; }));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 12000))]);
  buildWorkshop(); buildArena(arenaOf(save.stage)); updateShelf();
  resize(); applyGfx();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  audio.wantMusic = true; setState(State.MENU); refreshMenu(); menuView();
  for (let i = 0; i < 90; i++) simStep(STEP);
  if (CAPTURE) {
    window.__game = {
      start: () => startGame(),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); if (state === State.PLAYING) { updateHud(dt); updateCoach(dt); if (shopDirty) renderShop(); } },
      skip: (sec) => { simulating = true; for (let s = 0; s < sec; s += STEP) step(STEP); simulating = false; coins.length = chips.length = sparks.length = 0; $('pops').innerHTML = ''; $('banner').hidden = true; $('toast').hidden = true; hudT = 0; updateHud(0); if (shopDirty) renderShop(); },
      sim: (sec) => { simulating = true; for (let s = 0; s < sec; s += STEP) step(STEP); simulating = false; coins.length = chips.length = sparks.length = 0; },
      info: () => ({ state, stage: save.stage, coins: save.coins, rate: incomeRate(), tops: save.tops.slice(0, slotCount()), up: { ...save.up }, auto: { ...save.auto }, trophies: save.trophies, tourneys: save.tourneys, time: save.playTime, bestTier: save.bestTier, progress: save.progress, great: great ? great.hp / great.maxHp : null, blocks: blocks.length, stats: { ...stats } }),
      cover: (kind) => stageCover(kind),
      stage: (n, near = true) => { save.stage = n; save.progress = near ? goalFor(n) - 1 : 0; save.bestStage = Math.max(save.bestStage, n); enterArena(arenaOf(n), false); shopDirty = true; },
      open: (id) => { if (id === 'tourney') openTourney(); if (id === 'cleared') { clearedPrize = V(save.stage) * CFG.greatVal * valMult(); $('clearedCoins').textContent = fmt(clearedPrize); $('clearedText').textContent = t('clearedStage', { n: save.stage + 1 }); $('btnClearTriple').hidden = false; openBreak('cleared'); }
        if (id === 'offline') { save.last = Date.now() - 2.6 * 3600e3; save.rate = 820; showOffline(true); $('btnAwayDouble').hidden = false; } if (id === 'great') summonGreat(); },
      probe: () => { const out = []; scene.traverse((o) => { if (o.isMesh && (o.geometry === blockGeo[3] || o.geometry === blockGeo[2])) { o.getWorldPosition(_v); out.push([o.geometry === blockGeo[3] ? 'great' : 'big', +_v.x.toFixed(1), +_v.y.toFixed(1), +_v.z.toFixed(1), blocks.some((b) => b.view.root === o.parent)]); } }); return out; },
      dbg: () => blocks.map((b) => [+b.x.toFixed(1), +b.y.toFixed(2), +b.z.toFixed(1), +b.vy.toFixed(1), Math.round(b.hp), b.view.root.position.y.toFixed(2), b.view.root.visible]),
    };
    render(0);
    return;
  }
  requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
