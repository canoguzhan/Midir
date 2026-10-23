// Ashen Vow: a fallen knight climbs a burning cathedral one room at a time. Move, and the knight strikes by itself; dodge
// the red-marked attacks; before every room swear a vow (a challenge for a bigger reward); after every room pick a relic.
// A boss every 5 floors, 3 acts (cathedral, catacombs, burning sky), then endless ascension. Embers carried out of the
// tower buy lasting upgrades and new weapons at the camp.
// Sections: CONFIG, DATA, I18N, SDK, AUDIO, WORLD, ROOM, MODELS, FX, INPUT, STATE, UI, RUN, COMBAT, ENEMIES, BOSSES,
// ONBOARDING, BOT, LOOP, COVER, BOOT. Everything on screen is procedural; sounds load from ./assets/ with synth fallbacks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = 'ashenvow';
const STEP = 1 / 60; // fixed simulation step: identical behaviour at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const AUTOPLAY = (CAPTURE && !params.has('nobot')) || params.has('autoplay');
const BOT_SKILL = +(params.get('skill') || 0.7); // share of attacks the bot notices (1 = perfect)
const NO_TIPS = CAPTURE && !params.has('tips');
const CFG = {
  roomR: 10.5, playerR: 0.55, hp: 100, speed: 5.4, dmg: 10, invuln: 0.55,
  dodge: { time: 0.3, speed: 14, cd: 1.3 },
  magnet: 2.4, emberValue: 1,
  hpScale: 0.3, dmgScale: 0.14, ascension: 1.35, morrowHeal: 0.02, lifesteal: 0.015, solenne: 0.005, emberDrop: 1.5, // per floor; ascension multiplies again past floor 15
  waves: (f) => Math.min(3, 1 + Math.floor((f + 1) / 4)), waveSize: (f, w) => Math.round(3 + f * 0.75 + w * 1.2),
  bossEvery: 5, finalFloor: 15,
};
if (CAPTURE && params.get('cfg')) try { Object.assign(CFG, JSON.parse(params.get('cfg'))); } catch {}
const SFX_FILES = {
  swing: 'assets/audio/sword_swing.mp3', hit: 'assets/audio/hit.mp3', slam: 'assets/audio/skill_slam.mp3', fire: 'assets/audio/skill_fire.mp3',
  boom: 'assets/audio/explosion.mp3', shock: 'assets/audio/shock.mp3', level: 'assets/audio/level_up.mp3', coin: 'assets/audio/coin.mp3',
  victory: 'assets/audio/victory.mp3', defeat: 'assets/audio/defeat.mp3', card: 'assets/audio/card_pick.mp3', horn: 'assets/audio/dash_boss_horn.mp3',
  dash: 'assets/audio/skill_dash.mp3', roar: 'assets/audio/golem_roar.mp3', heal: 'assets/audio/skill_heal.mp3', unlock: 'assets/audio/unlock.mp3',
  swear: 'assets/audio/vow_swear.mp3', kept: 'assets/audio/vow_kept.mp3', broken: 'assets/audio/vow_broken.mp3', ember: 'assets/audio/ember_pick.mp3',
  dissolve: 'assets/audio/enemy_dissolve.mp3', door: 'assets/audio/door_open.mp3', roll: 'assets/audio/dodge_roll.mp3', thrust: 'assets/audio/spear_thrust.mp3',
  smash: 'assets/audio/hammer_smash.mp3', bell: 'assets/audio/boss_bell.mp3', relic: 'assets/audio/relic_get.mp3', hurt: 'assets/audio/player_hurt.mp3',
};
const MUSIC_FILES = { tower: 'assets/audio/bgm_ashen_tower.mp3', boss: 'assets/audio/bgm_ashen_boss.mp3', camp: 'assets/audio/bgm_ashen_camp.mp3' };
const SFX_GAIN = { swing: 0.35, hit: 0.35, slam: 0.45, fire: 0.35, boom: 0.45, shock: 0.4, level: 0.5, coin: 0.4, victory: 0.5, defeat: 0.5, card: 1.1, horn: 0.3,
  dash: 0.4, roar: 0.3, heal: 0.4, unlock: 0.5, swear: 0.7, kept: 0.6, broken: 0.5, ember: 1.3, dissolve: 0.3, door: 0.35, roll: 0.6, thrust: 0.3, smash: 0.4,
  bell: 0.4, relic: 0.8, hurt: 0.45 };

// ================================================================ DATA (weapons, gods, vows, relics, camp upgrades, enemies, acts)
const ICON = {
  sword: 'M20.5 2 21 3.5 10.6 13.9l-1.4-1.4zM7.8 13.9l2.3 2.3-1.4 1.4-1.1-1.1-2.8 2.8.9 2.1L3.6 22 2 20.4l.6-2.1 2.1.9 2.8-2.8-1.1-1.1z',
  spear: 'M12 1l3.2 6.4-2.2 1V23h-2V8.4l-2.2-1z', daggers: 'M5 2l2 1-1 9 2 2-2 2-2-2 1-1zM19 2l-2 1 1 9-2 2 2 2 2-2-1-1z',
  hammer: 'M3 4h13v7H3zM11 11h2.4v11H11z', flail: 'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm1.6 5.5 6.6 6.6M16.5 12a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  heart: 'M12 21 3.5 12.6A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 8.5 6.6z', flame: 'M12 2c1 3.5 5 5.6 5 10.4A5 5 0 0 1 12 18a5 5 0 0 1-5-5.2c0-2 1-3.4 2-4.3.2 1.6 1 2.6 2 3-.4-3.4.4-6.6 1-9.5z',
  snow: 'M11 2h2v20h-2zM2 11h20v2H2zM4.2 5.6l1.4-1.4 14.2 14.2-1.4 1.4zM18.4 4.2l1.4 1.4L5.6 19.8l-1.4-1.4z', bolt: 'M13.5 2 4 13.5h6.2L9 22l10-12h-6.4z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z', feather: 'M20 3c-7 0-13 5-14 12l-3 6 2 1 3-5c7-1 12-7 12-14zM9 15c1-4 4-7 8-9-3 3-5 6-6 10z',
  boot: 'M6 2h6v10l7 3c2 1 3 2 3 4v2H2v-4l4-1z', magnet: 'M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z', sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4z',
  diamond: 'M12 2l10 10-10 10L2 12z', skull: 'M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.6 3 5.8V19h2v2h2v-2h2v2h2v-2h2v-3.2c1.8-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8zm-3 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  hourglass: 'M6 2h12v4l-4 6 4 6v4H6v-4l4-6-4-6z', gem: 'M12 2l4 5-4 15-4-15zm-6 5h3l3 13zm9 0h3l-6 13z', eye: 'M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M14 2a10 10 0 1 0 8 15A8 8 0 0 1 14 2z', drop: 'M12 2.5C8.4 7.4 5.5 11 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 11 15.6 7.4 12 2.5z', vow: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 4.5 1.4 3 3.3.4-2.4 2.3.6 3.3-2.9-1.6-2.9 1.6.6-3.3-2.4-2.3 3.3-.4z',
  fist: 'M7 9V5a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v8a8 8 0 0 1-8 8H9a5 5 0 0 1-5-5v-3a2 2 0 0 1 3-1.7z',
};
const svgIcon = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${ICON[k] || ICON.gem}"/></svg>`;
// weapons: range (m), arc (rad, full width), cd (s), dmg (x base), plus behaviour flags
const WEAPONS = {
  sword: { icon: 'sword', cost: 0, range: 2.4, arc: 2.5, cd: 0.52, dmg: 1.0, sfx: 'swing' },
  spear: { icon: 'spear', cost: 120, range: 3.7, arc: 0.7, cd: 0.6, dmg: 1.25, sfx: 'thrust' },
  daggers: { icon: 'daggers', cost: 260, range: 1.95, arc: Math.PI * 2, cd: 0.34, dmg: 0.55, sfx: 'swing' },
  hammer: { icon: 'hammer', cost: 450, range: 2.6, arc: 2.2, cd: 1.05, dmg: 2.3, stun: 0.7, wave: 3.3, sfx: 'smash' },
  flail: { icon: 'flail', cost: 700, range: 2.4, arc: 0, cd: 0.45, dmg: 0.62, orbit: true, sfx: 'hit' },
};
const GODS = {
  solenne: { icon: 'sun', color: '#ffd27a' }, // light: regen CFG.solenne of max hp / s
  morrow: { icon: 'skull', color: '#9fa8ff' }, // death: heal CFG.morrowHeal of max hp per kill
  vanity: { icon: 'diamond', color: '#ff8fd0' }, // mirror: +12% everything
};
const VOWS = { // check: when it breaks; reward on a kept vow
  unscathed: { icon: 'shield' }, swift: { icon: 'hourglass' }, darkness: { icon: 'moon' }, blood: { icon: 'drop' }, standfast: { icon: 'boot' },
};
const RELICS = { // max: how many times it can stack
  edge: { icon: 'sword', max: 3 }, grip: { icon: 'fist', max: 3 }, reach: { icon: 'spear', max: 2 }, heart: { icon: 'heart', max: 3 },
  greaves: { icon: 'boot', max: 2 }, thorns: { icon: 'shield', max: 2 }, thirst: { icon: 'drop', max: 2 }, firebrand: { icon: 'flame', max: 2 },
  frost: { icon: 'snow', max: 1 }, chain: { icon: 'bolt', max: 2 }, echo: { icon: 'daggers', max: 1 }, execute: { icon: 'skull', max: 1 },
  glass: { icon: 'diamond', max: 1, rare: true }, magnet: { icon: 'magnet', max: 1 }, bulwark: { icon: 'shield', max: 2 }, phoenix: { icon: 'feather', max: 1, rare: true },
  shadow: { icon: 'moon', max: 1 }, nova: { icon: 'sun', max: 2 }, vengeance: { icon: 'eye', max: 1 }, crit: { icon: 'gem', max: 2 }, haste: { icon: 'bolt', max: 1 },
};
const SYNERGY = { firebrand: ['nova', 'chain'], nova: ['firebrand'], frost: ['hammer'], chain: ['firebrand'], shadow: ['firebrand'] }; // highlighted on cards
const META = { // camp upgrades: cost(level), max
  vitality: { icon: 'heart', max: 10, cost: (n) => 30 + n * 25 }, might: { icon: 'sword', max: 10, cost: (n) => 40 + n * 30 },
  swiftness: { icon: 'boot', max: 6, cost: (n) => 35 + n * 30 }, luck: { icon: 'flame', max: 8, cost: (n) => 30 + n * 30 },
  second: { icon: 'feather', max: 1, cost: () => 400 }, reroll: { icon: 'diamond', max: 3, cost: (n) => 120 + n * 120 },
};
const ACTS = [
  { id: 'cathedral', stone: ['#4b5068', '#3c4058', '#565c78'], fog: '#0d0f1c', hemiSky: '#7f8fd0', hemiGnd: '#1a1422', moon: '#9fb4ff', beams: ['#7f9fff', '#c79bff', '#ffd27a'], ember: 0xffa04a, enemies: ['skeleton', 'ghoul', 'wisp'], music: 'tower' },
  { id: 'catacombs', stone: ['#3f4a44', '#333d38', '#4a5750'], fog: '#08120e', hemiSky: '#7fd0a8', hemiGnd: '#101a14', moon: '#9fffd0', beams: ['#7fffc4', '#9fd0ff', '#d0ff9f'], ember: 0x9fff9a, enemies: ['skeleton', 'ghoul', 'imp', 'brute'], music: 'tower' },
  { id: 'sky', stone: ['#5a3a3a', '#4a2e30', '#6a4440'], fog: '#1a0806', hemiSky: '#ff9a6a', hemiGnd: '#200a08', moon: '#ffb48a', beams: ['#ff8a3d', '#ff4d6a', '#ffd27a'], ember: 0xff7a2a, enemies: ['imp', 'brute', 'wisp', 'skeleton'], music: 'tower' },
];
const ENEMIES = { // hp, speed, dmg, radius, reach, value (embers)
  skeleton: { hp: 24, sp: 2.7, dmg: 11, r: 0.5, reach: 1.25, wind: 0.45, value: 2 },
  ghoul: { hp: 16, sp: 4.4, dmg: 8, r: 0.45, reach: 1.1, wind: 0.34, value: 2 },
  wisp: { hp: 12, sp: 3.8, dmg: 20, r: 0.4, fuse: 0.8, blast: 2.3, value: 2 },
  imp: { hp: 20, sp: 3.0, dmg: 13, r: 0.45, ranged: true, value: 3 },
  brute: { hp: 95, sp: 1.8, dmg: 20, r: 0.85, reach: 1.7, wind: 0.7, charge: true, value: 7 },
};
const BOSSES = ['warden', 'lich', 'king'];
const BOSS_HP = { warden: 800, lich: 1500, king: 2400 };

// ================================================================ I18N (English required; Turkish welcome)
const STRINGS = {
  en: {
    play: 'Play', camp: 'Camp', settings: 'Settings', done: 'Done', menu: 'Menu', paused: 'Paused', resume: 'Resume', abandon: 'Abandon run', again: 'Climb again',
    ascend: 'Ascend further', tagline: 'Climb the burning cathedral. Swear vows. Break the curse.', skipTips: 'Skip tips',
    music: 'Music', sound: 'Sound', graphics: 'Graphics', gfx_auto: 'Auto', gfx_high: 'High', gfx_low: 'Fast', shakeOpt: 'Screen shake', shake_on: 'On', shake_low: 'Low', shake_off: 'Off',
    privacy: 'Ashen Vow has no accounts of its own. Your progress is saved on this device, and in your account when you are signed in on the platform. Nothing else is collected.',
    campSub: 'Embers you carry out of the tower stay with you. Spend them on lasting strength.', weapons: 'Weapons', equip: 'Equip', equipped: 'Equipped',
    floor: 'Floor {n}', ascensionFloor: 'Ascension {a} · Floor {n}', acts: ['The Cathedral', 'The Catacombs', 'The Burning Sky'],
    bestFloor: 'Best: floor {n}', runs: '{n} runs', embersTotal: '{n} embers',
    pickGod: 'Choose your patron', pickGodSub: 'A god watches over this climb.', pickVow: 'Swear a vow', pickVowSub: 'Keep it through the next room for a reward. Break it and you only lose the reward.',
    pickRelic: 'Choose a relic', pickRelicSub: 'Relics last until the end of this climb.', noVow: 'No vow', reroll: 'Reroll ({n})', synergy: 'Synergy', rare: 'Rare',
    god_solenne: 'Solenne, the Dawn', godd_solenne: 'Heals 0.5% of your health every second.', god_morrow: 'Morrow, the Last Bell', godd_morrow: 'Each kill heals 2% of your health.',
    god_vanity: 'Vanity, the Mirror', godd_vanity: '+12% damage, health, speed and attack speed.',
    vow_unscathed: 'Unscathed', vowd_unscathed: 'Take no hits in this room.', vowr_unscathed: 'Reward: an extra relic and +50% embers',
    vow_swift: 'Swift Judgment', vowd_swift: 'Clear the room within {t} seconds.', vowr_swift: 'Reward: an extra relic',
    vow_darkness: 'Darkness', vowd_darkness: 'Your light shrinks to a small circle.', vowr_darkness: 'Reward: double embers from this room',
    vow_blood: 'Blood Price', vowd_blood: 'Start the room at half health.', vowr_blood: 'Reward: full heal and an extra relic',
    vow_standfast: 'Stand Fast', vowd_standfast: 'Do not dodge in this room.', vowr_standfast: 'Reward: double embers and +10 max health',
    vowKept: 'Vow kept!', vowBroken: 'Vow broken', vowSworn: 'Vow sworn: {v}',
    rel_edge: 'Ember Edge', reld_edge: '+20% damage.', rel_grip: 'Quickened Grip', reld_grip: '+18% attack speed.', rel_reach: 'Long Reach', reld_reach: '+20% weapon reach.',
    rel_heart: 'Iron Heart', reld_heart: '+25 max health and heal 25.', rel_greaves: 'Swift Greaves', reld_greaves: '+10% move speed.',
    rel_thorns: 'Thorned Mail', reld_thorns: 'Attackers take 40% of the damage they deal.', rel_thirst: 'Bloodthirst', reld_thirst: 'Heal 1.5% of the damage you deal.',
    rel_firebrand: 'Firebrand', reld_firebrand: 'Hits set enemies on fire.', rel_frost: 'Frost Sigil', reld_frost: 'Hits slow enemies by 35%.',
    rel_chain: 'Chain Spark', reld_chain: '25% of hits arc lightning to 2 more enemies.', rel_echo: 'Echo Blade', reld_echo: 'Every third attack strikes twice.',
    rel_execute: 'Executioner', reld_execute: 'Double damage to enemies below 25% health.', rel_glass: 'Glass Heart', reld_glass: '+50% damage, but -25% max health.',
    rel_magnet: 'Ember Lodestone', reld_magnet: 'Embers fly to you from twice as far; +15% embers.', rel_bulwark: 'Bulwark', reld_bulwark: 'Take 15% less damage.',
    rel_phoenix: 'Phoenix Feather', reld_phoenix: 'Once, rise again at 40% health.', rel_shadow: 'Shadow Step', reld_shadow: 'Dodge recharges 35% faster and burns enemies you roll through.',
    rel_nova: 'Holy Nova', reld_nova: 'Every 6 seconds, a burst of light hits everything near you.', rel_vengeance: 'Vengeance', reld_vengeance: 'After you are hit, your next attack deals +150%.',
    rel_crit: 'Keen Sigil', reld_crit: '15% chance to deal double damage.', rel_haste: 'Bloodrush', reld_haste: 'Each kill: +30% speed for 2 seconds.',
    meta_vitality: 'Vitality', metad_vitality: '+12 max health', meta_might: 'Might', metad_might: '+6% damage', meta_swiftness: 'Swiftness', metad_swiftness: '+3% move speed',
    meta_luck: 'Ember Luck', metad_luck: '+8% embers', meta_second: 'Second Wind', metad_second: 'Once per climb, survive a killing blow', meta_reroll: 'Fate Thread', metad_reroll: '+1 relic reroll per climb',
    w_sword: 'Longsword', wd_sword: 'Wide sweeping arcs.', w_spear: 'Spear', wd_spear: 'Long, piercing thrusts.', w_daggers: 'Twin Daggers', wd_daggers: 'Fast spins all around you.',
    w_hammer: 'Warhammer', wd_hammer: 'Slow smashes that stun and shake the floor.', w_flail: 'Flail', wd_flail: 'A spiked ball that circles you.',
    boss_warden: 'The Bell Warden', boss_lich: 'The Choir Lich', boss_king: 'The Ashen King', bossDown: '{b} has fallen!',
    roomClear: 'Room cleared', doorOpen: 'The door is open', deathTitle: 'Fallen on floor {n}', victoryTitle: 'The curse is broken!', victorySub: 'The Ashen King has fallen. The tower goes on: ascend for greater rewards.',
    deathSub: 'Your embers return to the camp with you.', st_floor: 'Floor reached', st_kills: 'Enemies defeated', st_vows: 'Vows kept', st_relics: 'Relics', st_time: 'Time',
    doubleEmbers: 'Watch an ad: double embers', doubled: 'Embers doubled!', adUnavailable: 'No ad available right now', newBest: 'New best floor!', needEmbers: 'Not enough embers yet',
    revived: 'Risen again!', synergyToast: 'Synergy: {a} + {b}',
    tip_move: 'Move your knight', tip_moveTouch: 'Drag anywhere to move', tip_attack: 'Walk up to enemies: you strike by yourself',
    tip_dodge: 'Red marks warn of attacks: dodge out', tip_door: 'The door is open: walk through it', tip_camp: 'Spend your embers at the Camp',
    ctl_move: 'Move', ctl_dodge: 'Dodge', ctl_pause: 'Pause', ctl_drag: 'Drag to move', ctl_tap: 'Tap to dodge', ctl_auto: 'Attacks are automatic',
  },
  tr: {
    play: 'Oyna', camp: 'Kamp', settings: 'Ayarlar', done: 'Tamam', menu: 'Menü', paused: 'Duraklatıldı', resume: 'Devam', abandon: 'Tırmanışı bırak', again: 'Yeniden tırman',
    ascend: 'Daha da yüksel', tagline: 'Yanan katedrale tırman. Yemin et. Laneti kır.', skipTips: 'İpuçlarını geç',
    music: 'Müzik', sound: 'Ses', graphics: 'Grafik', gfx_auto: 'Otomatik', gfx_high: 'Yüksek', gfx_low: 'Hızlı', shakeOpt: 'Ekran sarsıntısı', shake_on: 'Açık', shake_low: 'Az', shake_off: 'Kapalı',
    privacy: 'Ashen Vow\'un kendi hesap sistemi yoktur. İlerlemen bu cihazda, platformda giriş yaptıysan hesabında da saklanır. Başka hiçbir veri toplanmaz.',
    campSub: 'Kuleden çıkardığın közler seninle kalır. Onları kalıcı güce harca.', weapons: 'Silahlar', equip: 'Kuşan', equipped: 'Kuşanıldı',
    floor: '{n}. Kat', ascensionFloor: 'Yükseliş {a} · {n}. Kat', acts: ['Katedral', 'Yeraltı Mezarları', 'Yanan Gökyüzü'],
    bestFloor: 'En iyi: {n}. kat', runs: '{n} tırmanış', embersTotal: '{n} köz',
    pickGod: 'Koruyucunu seç', pickGodSub: 'Bu tırmanışta bir tanrı seni gözetiyor.', pickVow: 'Bir yemin et', pickVowSub: 'Sonraki odada yeminini tut, ödülü kazan. Bozarsan sadece ödülü kaybedersin.',
    pickRelic: 'Bir kalıntı seç', pickRelicSub: 'Kalıntılar bu tırmanışın sonuna kadar kalır.', noVow: 'Yemin yok', reroll: 'Yeniden çek ({n})', synergy: 'Uyum', rare: 'Nadir',
    god_solenne: 'Şafak Tanrıçası Solenne', godd_solenne: 'Her saniye canının %0,5\'ini iyileştirir.', god_morrow: 'Son Çan Morrow', godd_morrow: 'Her öldürme canının %2\'sini iyileştirir.',
    god_vanity: 'Ayna Tanrısı Vanity', godd_vanity: 'Hasar, can, hız ve saldırı hızına +%12.',
    vow_unscathed: 'Yarasız', vowd_unscathed: 'Bu odada hiç darbe alma.', vowr_unscathed: 'Ödül: fazladan bir kalıntı ve +%50 köz',
    vow_swift: 'Hızlı Hüküm', vowd_swift: 'Odayı {t} saniyede temizle.', vowr_swift: 'Ödül: fazladan bir kalıntı',
    vow_darkness: 'Karanlık', vowd_darkness: 'Işığın küçük bir daireye iner.', vowr_darkness: 'Ödül: bu odadan iki kat köz',
    vow_blood: 'Kan Bedeli', vowd_blood: 'Odaya yarı canla başla.', vowr_blood: 'Ödül: tam iyileşme ve fazladan bir kalıntı',
    vow_standfast: 'Sağlam Dur', vowd_standfast: 'Bu odada yuvarlanma.', vowr_standfast: 'Ödül: iki kat köz ve +10 en yüksek can',
    vowKept: 'Yemin tutuldu!', vowBroken: 'Yemin bozuldu', vowSworn: 'Yemin edildi: {v}',
    rel_edge: 'Köz Kenarı', reld_edge: '+%20 hasar.', rel_grip: 'Çevik Kavrayış', reld_grip: '+%18 saldırı hızı.', rel_reach: 'Uzun Erişim', reld_reach: '+%20 silah menzili.',
    rel_heart: 'Demir Yürek', reld_heart: '+25 en yüksek can ve 25 iyileşme.', rel_greaves: 'Hızlı Dizlikler', reld_greaves: '+%10 hareket hızı.',
    rel_thorns: 'Dikenli Zırh', reld_thorns: 'Saldıranlar verdikleri hasarın %40\'ını alır.', rel_thirst: 'Kan Susuzluğu', reld_thirst: 'Verdiğin hasarın %1,5\'i kadar iyileş.',
    rel_firebrand: 'Ateş Damgası', reld_firebrand: 'Vuruşlar düşmanları tutuşturur.', rel_frost: 'Ayaz Mührü', reld_frost: 'Vuruşlar düşmanları %35 yavaşlatır.',
    rel_chain: 'Zincir Kıvılcım', reld_chain: 'Vuruşların %25\'i 2 düşmana daha şimşek sıçratır.', rel_echo: 'Yankı Kılıcı', reld_echo: 'Her üçüncü saldırı iki kez vurur.',
    rel_execute: 'Cellat', reld_execute: 'Canı %25\'in altındaki düşmanlara iki kat hasar.', rel_glass: 'Cam Yürek', reld_glass: '+%50 hasar ama -%25 en yüksek can.',
    rel_magnet: 'Köz Mıknatısı', reld_magnet: 'Közler iki kat uzaktan gelir; +%15 köz.', rel_bulwark: 'Siper', reld_bulwark: '%15 daha az hasar al.',
    rel_phoenix: 'Anka Tüyü', reld_phoenix: 'Bir kez, %40 canla yeniden doğ.', rel_shadow: 'Gölge Adımı', reld_shadow: 'Yuvarlanma %35 daha hızlı dolar ve içinden geçtiğin düşmanları yakar.',
    rel_nova: 'Kutsal Patlama', reld_nova: 'Her 6 saniyede bir ışık patlaması yakındaki her şeye vurur.', rel_vengeance: 'İntikam', reld_vengeance: 'Darbe aldıktan sonraki saldırın +%150 vurur.',
    rel_crit: 'Keskin Mühür', reld_crit: '%15 şansla iki kat hasar.', rel_haste: 'Kan Coşkusu', reld_haste: 'Her öldürme: 2 saniye +%30 hız.',
    meta_vitality: 'Dirilik', metad_vitality: '+12 en yüksek can', meta_might: 'Kudret', metad_might: '+%6 hasar', meta_swiftness: 'Çeviklik', metad_swiftness: '+%3 hareket hızı',
    meta_luck: 'Köz Şansı', metad_luck: '+%8 köz', meta_second: 'İkinci Nefes', metad_second: 'Her tırmanışta bir kez ölümcül darbeden kurtul', meta_reroll: 'Kader İpliği', metad_reroll: 'Her tırmanışta +1 kalıntı yeniden çekme',
    w_sword: 'Uzun Kılıç', wd_sword: 'Geniş savuruşlar.', w_spear: 'Mızrak', wd_spear: 'Uzun, delici hamleler.', w_daggers: 'İkiz Hançer', wd_daggers: 'Etrafında hızlı dönüşler.',
    w_hammer: 'Savaş Çekici', wd_hammer: 'Sersemleten, zemini sarsan ağır vuruşlar.', w_flail: 'Topuz', wd_flail: 'Etrafında dönen dikenli bir top.',
    boss_warden: 'Çan Bekçisi', boss_lich: 'Koro Lich\'i', boss_king: 'Kül Kral', bossDown: '{b} düştü!',
    roomClear: 'Oda temizlendi', doorOpen: 'Kapı açıldı', deathTitle: '{n}. katta düştün', victoryTitle: 'Lanet kırıldı!', victorySub: 'Kül Kral düştü. Kule devam ediyor: daha büyük ödüller için yüksel.',
    deathSub: 'Közlerin seninle birlikte kampa döner.', st_floor: 'Ulaşılan kat', st_kills: 'Yenilen düşman', st_vows: 'Tutulan yemin', st_relics: 'Kalıntı', st_time: 'Süre',
    doubleEmbers: 'Reklam izle: közleri ikiye katla', doubled: 'Közler ikiye katlandı!', adUnavailable: 'Şu anda reklam yok', newBest: 'Yeni en iyi kat!', needEmbers: 'Henüz yeterli köz yok',
    revived: 'Yeniden doğdun!', synergyToast: 'Uyum: {a} + {b}',
    tip_move: 'Şövalyeni hareket ettir', tip_moveTouch: 'Hareket için sürükle', tip_attack: 'Düşmanlara yaklaş: kendiliğinden vurursun',
    tip_dodge: 'Kırmızı işaretler saldırıyı haber verir: yuvarlanıp kaç', tip_door: 'Kapı açık: içinden geç', tip_camp: 'Közlerini Kamp\'ta harca',
    ctl_move: 'Hareket', ctl_dodge: 'Yuvarlan', ctl_pause: 'Duraklat', ctl_drag: 'Hareket için sürükle', ctl_tap: 'Yuvarlanmak için dokun', ctl_auto: 'Saldırılar otomatik',
  },
};
let lang = 'en';
const t = (k, vars) => {
  let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;
  if (vars && typeof s === 'string') for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }
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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: a boss down, a new best floor
// Midgame: only between climbs, never on navigation buttons. Mute on adStarted (not on request); always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, never on the active gameplay screen, reward only on adFinished; hidden for the session after an error.
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
  click: ['triangle', 660, 440, 0.06, 0.12], tip: ['sine', 520, 1040, 0.16, 0.14], nope: ['triangle', 260, 180, 0.14, 0.12],
  swing: ['sawtooth', 500, 180, 0.12, 0.06], hit: ['square', 220, 90, 0.1, 0.09], ember: ['sine', 1400, 2100, 0.08, 0.06], hurt: ['sawtooth', 200, 80, 0.25, 0.15],
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
const MIN_GAP = { swing: 0.08, hit: 0.05, ember: 0.045, dissolve: 0.06, click: 0.03, tip: 0.1, hurt: 0.15, thrust: 0.08 };
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 16 || CAPTURE) return;
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
  if (key && key !== audio.musicKey) {
    if (audio.music) { audio.music.pause(); audio.music = null; }
    audio.musicKey = key; audio.music = new Audio(MUSIC_FILES[key]); audio.music.loop = true; audio.music.onerror = () => { audio.music = null; };
    setMusicVolume();
  }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function setMusicVolume() { if (audio.music) audio.music.volume = Math.min(1, (audio.musicKey === 'camp' ? 0.3 : 0.24) * save.vol.music); }
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#0d0f1c', 18, 42); scene.background = new THREE.Color('#07060c');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight('#7f8fd0', '#1a1422', 0.75); scene.add(hemi);
const moon = new THREE.DirectionalLight('#9fb4ff', 1.15); moon.position.set(-8, 18, 6); moon.castShadow = true; scene.add(moon, moon.target);
moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 }); moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.03;
const torch = new THREE.PointLight('#ffa860', 26, 11, 1.6); scene.add(torch); // the knight's own warm light
const uTime = { value: 0 };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const pickOne = (a) => a[(Math.random() * a.length) | 0];
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let shakeAmt = 0;
let gfxLow = null, autoLow = !CAPTURE && !!navigator.deviceMemory && navigator.deviceMemory <= 4, fpsAcc = 0, fpsN = 0;
function applyGfx() { // High (shadows, sharp) or Fast (no shadows, 1x pixels, fewer particles)
  const low = !CAPTURE && (save.gfx === 'low' || (save.gfx === 'auto' && autoLow));
  if (low === gfxLow) return; gfxLow = low;
  renderer.setPixelRatio(low ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = !low; moon.castShadow = !low;
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  resize();
}
function watchFps(dt) {
  if (save.gfx !== 'auto' || autoLow || CAPTURE || state !== State.PLAYING) { fpsAcc = fpsN = 0; return; }
  fpsAcc += dt; fpsN++; if (fpsAcc > 5) { if (fpsAcc / fpsN > 1 / 30) { autoLow = true; applyGfx(); } fpsAcc = fpsN = 0; }
}
const fxBudget = () => (gfxLow ? 0.5 : 1);
const C = (h) => new THREE.Color(h);
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true, ...o });
function colored(geo, hex) { // a geometry painted one vertex colour, so many parts merge into one mesh
  const g = geo.index ? geo.toNonIndexed() : geo; const c = C(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
const part = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const g = colored(geo.clone(), hex); g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const merge = (parts) => mergeGeometries(parts);

// ================================================================ ROOM (floor tiles, pillars, candles, stained-glass beams, the door)
const room = { group: new THREE.Group(), tiles: null, beams: [], candles: [], door: null, doorGlow: null, doorOpen: 0, sigil: null, act: -1 };
scene.add(room.group);
const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb05a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const beamTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 128); return new THREE.CanvasTexture(c); })();
function buildRoom(actIndex) {
  const A = ACTS[actIndex % 3]; room.act = actIndex % 3;
  for (const ch of [...room.group.children]) { room.group.remove(ch); ch.geometry?.dispose(); }
  room.beams.length = 0; room.candles.length = 0;
  scene.fog.color.set(A.fog); scene.background = C(A.fog).multiplyScalar(0.6);
  hemi.color.set(A.hemiSky); hemi.groundColor.set(A.hemiGnd); moon.color.set(A.moon);
  const R = CFG.roomR, tileParts = [], rimParts = [];
  // floor: worn square slabs in rings, each a slightly different stone and height
  for (let x = -R - 1; x <= R + 1; x += 1.6) for (let z = -R - 1; z <= R + 1; z += 1.6) {
    const d = Math.hypot(x, z); if (d > R + 0.4) continue;
    const s = 1.5 - Math.random() * 0.06, col = C(pickOne(A.stone)).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04).getStyle();
    tileParts.push(part(new THREE.BoxGeometry(1, 0.3, 1), col, x + rand(-0.04, 0.04), -0.15 + rand(-0.03, 0.03), z + rand(-0.04, 0.04), 0, rand(-0.04, 0.04), 0, s, 1, s));
  }
  const floor = new THREE.Mesh(merge(tileParts), std({ vertexColors: true, roughness: 0.95 })); floor.receiveShadow = true; room.group.add(floor);
  // a darker rim and a pit of nothing beyond (the tower falls away into fog)
  rimParts.push(part(new THREE.CylinderGeometry(R + 1.6, R + 1.2, 0.8, 32, 1, true), A.stone[1], 0, -0.4, 0));
  const rim = new THREE.Mesh(merge(rimParts), std({ vertexColors: true, side: THREE.DoubleSide })); room.group.add(rim);
  // engraved vow circle in the middle of the floor (glows while a vow is sworn)
  room.sigil = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.65, 48), new THREE.MeshBasicMaterial({ color: '#f2c25c', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
  room.sigil.rotation.x = -Math.PI / 2; room.sigil.position.y = 0.02; room.group.add(room.sigil);
  // pillars with capitals, some broken; candles at their feet
  const pillarParts = [], n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n, x = Math.cos(a) * (R + 0.9), z = Math.sin(a) * (R + 0.9);
    if (Math.abs(Math.sin(a) + 1) < 0.1) continue; // leave the north side open for the door
    const h = z > 1 ? rand(0.9, 1.6) : i % 4 === 1 ? rand(2.2, 3.2) : 7, col = A.stone[i % 3]; // near the camera only broken stumps
    pillarParts.push(part(new THREE.CylinderGeometry(0.55, 0.62, h, 8), col, x, h / 2, z));
    pillarParts.push(part(new THREE.BoxGeometry(1.6, 0.4, 1.6), A.stone[2], x, 0.2, z));
    if (h > 5) pillarParts.push(part(new THREE.BoxGeometry(1.5, 0.5, 1.5), A.stone[2], x, h, z, 0, a, 0));
    const cx = Math.cos(a) * (R - 0.2), cz = Math.sin(a) * (R - 0.2);
    pillarParts.push(part(new THREE.CylinderGeometry(0.09, 0.11, 0.45, 6), '#e8dcc0', cx, 0.22, cz));
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flameMat); flame.scale.y = 1.8; flame.position.set(cx, 0.55, cz); room.group.add(flame); room.candles.push(flame);
  }
  // back wall arches beyond the pillars, so the room reads as the inside of a cathedral
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI, x = Math.cos(a) * (R + 4.5), z = Math.sin(a) * (R + 4.5);
    pillarParts.push(part(new THREE.BoxGeometry(3.6, 12, 0.8), A.stone[1], x, 4, z, 0, -a + Math.PI / 2, 0));
  }
  const pillars = new THREE.Mesh(merge(pillarParts), std({ vertexColors: true })); pillars.castShadow = true; pillars.receiveShadow = true; room.group.add(pillars);
  // stained-glass light beams slanting in from high windows
  A.beams.forEach((col, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 26), new THREE.MeshBasicMaterial({ map: beamTex, color: col, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    const a = -Math.PI * 0.75 + i * 0.75, x = Math.cos(a) * 5, z = Math.sin(a) * 4 - 1;
    m.position.set(x, 8, z); m.rotation.set(0, rand(-0.6, 0.6), 0.45); room.group.add(m); room.beams.push(m);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    pool.rotation.x = -Math.PI / 2; pool.scale.set(1.4, 1, 1); pool.position.set(x - 3.2, 0.03, z); room.group.add(pool);
  });
  // the door: a pointed arch at the north edge; the slab sinks when the room is clear
  const archParts = [part(new THREE.BoxGeometry(0.7, 4.2, 0.9), A.stone[2], -1.7, 2.1, 0), part(new THREE.BoxGeometry(0.7, 4.2, 0.9), A.stone[2], 1.7, 2.1, 0),
    part(new THREE.ConeGeometry(2.3, 1.8, 4, 1), A.stone[2], 0, 5, 0, 0, Math.PI / 4, 0, 1, 1, 0.45)];
  const arch = new THREE.Mesh(merge(archParts), std({ vertexColors: true })); arch.position.set(0, 0, -R - 0.2); arch.castShadow = true; room.group.add(arch);
  room.door = new THREE.Mesh(new THREE.BoxGeometry(2.7, 4, 0.4), std({ color: '#2a1e18' })); room.door.position.set(0, 2, -R - 0.2); room.group.add(room.door);
  room.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 4), new THREE.MeshBasicMaterial({ color: '#ffb05a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  room.doorGlow.position.set(0, 2, -R - 0.45); room.group.add(room.doorGlow);
  room.doorOpen = 0;
}
function updateRoom(dt) {
  for (const f of room.candles) { const k = 0.8 + Math.random() * 0.4; f.scale.set(k, 1.6 + Math.random() * 0.5, k); }
  room.beams.forEach((b, i) => { b.material.opacity = 0.26 + Math.sin(uTime.value * 0.6 + i * 2) * 0.06; });
  const want = run?.phase === 'door' ? 1 : 0; room.doorOpen += (want - room.doorOpen) * Math.min(1, dt * 1.5);
  room.door.position.y = 2 - room.doorOpen * 4.1; room.doorGlow.material.opacity = room.doorOpen * (0.55 + Math.sin(uTime.value * 3) * 0.15);
  const vowOn = run?.vow && !run.vowBroken; room.sigil.material.opacity += ((vowOn ? 0.75 : 0.14) - room.sigil.material.opacity) * Math.min(1, dt * 3);
  room.sigil.rotation.z += dt * 0.15;
  if (Math.random() < dt * 30 * fxBudget()) { // drifting embers rising through the room
    const a = Math.random() * 6.3, d = Math.sqrt(Math.random()) * (CFG.roomR + 2);
    glow.spawn(Math.cos(a) * d, rand(0, 1), Math.sin(a) * d, rand(-0.2, 0.2), rand(0.4, 1.2), rand(-0.2, 0.2), rand(3, 6), rand(0.09, 0.16), 0.03, ACTS[Math.max(0, room.act)].ember, 0.85, SH.DOT);
  }
}

// ================================================================ MODELS (procedural knight, enemies and bosses; animated in code)
const BODY_MAT = () => std({ vertexColors: true, emissive: '#000000' });
function buildKnight(weapon = 'sword') { // groups: root > body (bob) > torso, head; legs and arms pivot at hips / shoulders
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mat = BODY_MAT(), steel = '#6a7290', dark = '#3a3f56', gold = '#d9a441', cloth = '#7a1f2b';
  const torso = new THREE.Mesh(merge([
    part(new THREE.CylinderGeometry(0.42, 0.34, 0.75, 7), steel, 0, 1.05, 0),
    part(new THREE.CylinderGeometry(0.36, 0.42, 0.3, 7), dark, 0, 0.62, 0),
    part(new THREE.BoxGeometry(0.5, 0.06, 0.08), gold, 0, 1.0, 0.36),
    part(new THREE.SphereGeometry(0.26, 8, 6), steel, -0.48, 1.36, 0, 0, 0, 0, 1, 0.8, 1), part(new THREE.SphereGeometry(0.26, 8, 6), steel, 0.48, 1.36, 0, 0, 0, 0, 1, 0.8, 1),
    part(new THREE.TorusGeometry(0.2, 0.05, 6, 10), gold, -0.48, 1.38, 0, Math.PI / 2), part(new THREE.TorusGeometry(0.2, 0.05, 6, 10), gold, 0.48, 1.38, 0, Math.PI / 2),
  ]), mat);
  const head = new THREE.Group(); head.position.y = 1.62;
  const helm = new THREE.Mesh(merge([
    part(new THREE.CylinderGeometry(0.27, 0.3, 0.46, 8), steel, 0, 0.05, 0), part(new THREE.ConeGeometry(0.29, 0.3, 8), steel, 0, 0.43, 0),
    part(new THREE.BoxGeometry(0.05, 0.38, 0.1), gold, 0, 0.12, 0.29), part(new THREE.ConeGeometry(0.06, 0.45, 5), cloth, 0, 0.72, -0.05, -0.5),
  ]), mat);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: '#ffb05a', toneMapped: false })); visor.position.set(0, 0.08, 0.28);
  head.add(helm, visor);
  const legGeo = merge([part(new THREE.BoxGeometry(0.22, 0.55, 0.24), dark, 0, -0.27, 0), part(new THREE.BoxGeometry(0.26, 0.14, 0.34), steel, 0, -0.55, 0.05)]);
  const legL = new THREE.Mesh(legGeo, mat), legR = new THREE.Mesh(legGeo, mat); legL.position.set(-0.17, 0.62, 0); legR.position.set(0.17, 0.62, 0);
  const armGeo = merge([part(new THREE.BoxGeometry(0.17, 0.55, 0.17), steel, 0, -0.27, 0), part(new THREE.BoxGeometry(0.2, 0.16, 0.2), dark, 0, -0.56, 0)]);
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-0.52, 1.32, 0); armR.position.set(0.52, 1.32, 0);
  armL.add(new THREE.Mesh(armGeo, mat)); armR.add(new THREE.Mesh(armGeo, mat));
  const weaponG = new THREE.Group(); weaponG.position.set(0, -0.58, 0.05); armR.add(weaponG); setKnightWeapon({ weaponG }, weapon);
  // cape: a segmented plane that waves behind the shoulders
  const capeGeo = new THREE.PlaneGeometry(0.9, 1.15, 4, 6); capeGeo.translate(0, -0.575, 0);
  const cape = new THREE.Mesh(capeGeo, std({ color: cloth, emissive: '#3a0c14', side: THREE.DoubleSide, flatShading: false })); cape.position.set(0, 1.42, -0.32); cape.userData.base = Float32Array.from(capeGeo.attributes.position.array);
  body.add(torso, head, legL, legR, armL, armR, cape);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, head, legL, legR, armL, armR, weaponG, cape, mat, ph: 0, swing: 0, swingDir: 1, roll: 0, flash: 0, type: weapon };
}
function setKnightWeapon(k, type) {
  for (const ch of [...k.weaponG.children]) k.weaponG.remove(ch);
  const blade = '#d8e0f0', gold = '#d9a441', wood = '#6a4a30', glowM = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: '#ff7a2a', emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.4 });
  const geo = {
    sword: [part(new THREE.BoxGeometry(0.1, 1.25, 0.04), blade, 0, -0.75, 0), part(new THREE.ConeGeometry(0.07, 0.18, 4), blade, 0, -1.46, 0, Math.PI), part(new THREE.BoxGeometry(0.42, 0.07, 0.1), gold, 0, -0.1, 0), part(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), wood, 0, 0.06, 0)],
    spear: [part(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), wood, 0, -0.6, 0), part(new THREE.ConeGeometry(0.1, 0.42, 4), blade, 0, -1.9, 0, Math.PI), part(new THREE.TorusGeometry(0.07, 0.025, 4, 8), gold, 0, -1.62, 0, Math.PI / 2)],
    daggers: [part(new THREE.BoxGeometry(0.08, 0.5, 0.03), blade, 0, -0.38, 0), part(new THREE.BoxGeometry(0.22, 0.05, 0.07), gold, 0, -0.1, 0)],
    hammer: [part(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 6), wood, 0, -0.45, 0), part(new THREE.BoxGeometry(0.62, 0.36, 0.36), '#8a90a8', 0, -1.1, 0), part(new THREE.BoxGeometry(0.66, 0.08, 0.4), gold, 0, -1.1, 0)],
    flail: [part(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), wood, 0, -0.12, 0)],
  }[type] || [];
  k.weaponG.add(new THREE.Mesh(merge(geo), glowM));
  k.type = type;
}
function animateKnight(k, dt, moving, speed) {
  k.ph += dt * (moving ? 9 * speed : 2.2);
  const sw = moving ? Math.sin(k.ph) * 0.65 : 0, bob = moving ? Math.abs(Math.sin(k.ph)) * 0.06 : Math.sin(k.ph) * 0.02;
  k.legL.rotation.x = sw; k.legR.rotation.x = -sw; k.body.position.y = bob;
  k.armL.rotation.x = -sw * 0.6;
  if (k.swing > 0) { // a swing: arm sweeps across in front, the weapon follows
    const u = 1 - k.swing / 0.2, a = Math.sin(u * Math.PI);
    k.armR.rotation.set(-1.4 + a * 0.4, 0, (u * 2.4 - 1.2) * k.swingDir);
    if (k.type === 'spear') k.armR.rotation.set(-1.55, 0, 0.1 - a * 0.3);
    if (k.type === 'hammer') k.armR.rotation.set(-2.6 + u * 3.2, 0, 0.1);
    k.swing = Math.max(0, k.swing - dt);
  } else k.armR.rotation.set(sw * 0.6 - 0.25, 0, 0.12);
  if (k.roll > 0) { k.body.rotation.x = (1 - k.roll / CFG.dodge.time) * Math.PI * 2; k.roll = Math.max(0, k.roll - dt); } else k.body.rotation.x = 0;
  const p = k.cape.geometry.attributes.position, b = k.cape.userData.base;
  for (let i = 0; i < p.count; i++) { const y = b[i * 3 + 1]; p.setZ(i, b[i * 3 + 2] - y * (moving ? 0.5 : 0.1) * -1 * 0.6 + Math.sin(uTime.value * 6 + y * 4 + b[i * 3] * 2) * 0.05 * -y); }
  p.needsUpdate = true; k.cape.geometry.computeVertexNormals(); // lit as it bends, never a black slab
  k.flash = Math.max(0, k.flash - dt * 6); k.mat.emissive.setRGB(k.flash * 1.4, k.flash * 0.25, k.flash * 0.3);
}
// enemies: one merged body + limbs that animate; each has its own material so hits flash just that enemy
const enemyGeo = {};
function buildEnemyGeo(type) {
  if (enemyGeo[type]) return enemyGeo[type];
  const bone = '#e6dcc4', boneD = '#a89a80', g = {};
  if (type === 'skeleton') {
    g.body = merge([part(new THREE.BoxGeometry(0.32, 0.5, 0.18), bone, 0, 1.0, 0), part(new THREE.BoxGeometry(0.42, 0.05, 0.2), boneD, 0, 1.05, 0), part(new THREE.BoxGeometry(0.4, 0.05, 0.2), boneD, 0, 0.88, 0),
      part(new THREE.SphereGeometry(0.24, 8, 6), bone, 0, 1.48, 0, 0, 0, 0, 1, 1.1, 1), part(new THREE.BoxGeometry(0.18, 0.12, 0.12), bone, 0, 1.3, 0.1), part(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), boneD, 0, 0.7, 0)]);
    g.limb = merge([part(new THREE.BoxGeometry(0.08, 0.5, 0.08), bone, 0, -0.25, 0)]); g.eyes = '#5fe0ff'; g.eyeY = 1.5; g.eyeZ = 0.2; g.leg = 0.6; g.shoulder = 1.18; g.armX = 0.24;
  } else if (type === 'ghoul') {
    const skin = '#7f8f6a', dark = '#4a5a3c';
    g.body = merge([part(new THREE.SphereGeometry(0.42, 8, 6), skin, 0, 0.9, -0.05, 0.5, 0, 0, 1, 1.2, 0.9), part(new THREE.SphereGeometry(0.25, 8, 6), skin, 0, 1.15, 0.32), part(new THREE.BoxGeometry(0.3, 0.06, 0.06), dark, 0, 1.05, 0.5)]);
    g.limb = merge([part(new THREE.BoxGeometry(0.11, 0.75, 0.11), skin, 0, -0.37, 0), part(new THREE.ConeGeometry(0.07, 0.2, 4), '#e6dcc4', 0, -0.8, 0.05, Math.PI)]); g.eyes = '#d0ff5a'; g.eyeY = 1.2; g.eyeZ = 0.5; g.leg = 0.5; g.shoulder = 1.0; g.armX = 0.4;
  } else if (type === 'imp') {
    const red = '#c8324a', dark = '#6a1a2a';
    g.body = merge([part(new THREE.SphereGeometry(0.32, 8, 6), red, 0, 1.4, 0), part(new THREE.ConeGeometry(0.06, 0.3, 4), '#2a1a1a', -0.18, 1.72, 0, 0, 0, 0.4), part(new THREE.ConeGeometry(0.06, 0.3, 4), '#2a1a1a', 0.18, 1.72, 0, 0, 0, -0.4),
      part(new THREE.ConeGeometry(0.5, 0.9, 3), dark, -0.45, 1.45, -0.1, 0, 0, 1.2, 1, 1, 0.15), part(new THREE.ConeGeometry(0.5, 0.9, 3), dark, 0.45, 1.45, -0.1, 0, 0, -1.2, 1, 1, 0.15), part(new THREE.ConeGeometry(0.08, 0.5, 4), red, 0, 1.05, -0.1, Math.PI)]);
    g.limb = merge([part(new THREE.BoxGeometry(0.08, 0.3, 0.08), red, 0, -0.15, 0)]); g.eyes = '#ffe066'; g.eyeY = 1.45; g.eyeZ = 0.28; g.leg = 1.1; g.shoulder = 1.4; g.armX = 0.28; g.float = 0.25;
  } else if (type === 'brute') {
    const plate = '#4a4458', dark = '#2a2632';
    g.body = merge([part(new THREE.CylinderGeometry(0.75, 0.6, 1.1, 7), plate, 0, 1.35, 0), part(new THREE.SphereGeometry(0.4, 8, 6), plate, -0.85, 1.75, 0), part(new THREE.SphereGeometry(0.4, 8, 6), plate, 0.85, 1.75, 0),
      part(new THREE.BoxGeometry(0.5, 0.45, 0.5), dark, 0, 2.05, 0.05), part(new THREE.ConeGeometry(0.1, 0.4, 4), '#d9a441', -0.25, 2.35, 0, 0, 0, 0.3), part(new THREE.ConeGeometry(0.1, 0.4, 4), '#d9a441', 0.25, 2.35, 0, 0, 0, -0.3)]);
    g.limb = merge([part(new THREE.BoxGeometry(0.3, 0.9, 0.3), plate, 0, -0.45, 0), part(new THREE.BoxGeometry(0.42, 0.36, 0.42), dark, 0, -0.95, 0)]); g.eyes = '#ff5a3a'; g.eyeY = 2.08; g.eyeZ = 0.3; g.leg = 0.8; g.shoulder = 1.75; g.armX = 0.95; g.core = true;
  } else if (type === 'wisp') {
    g.body = null; g.eyes = '#ffffff'; g.eyeY = 1.1; g.eyeZ = 0.3;
  }
  enemyGeo[type] = g; return g;
}
const eyeGeo = new THREE.SphereGeometry(0.05, 6, 4);
function buildEnemyView(e) {
  const g = buildEnemyGeo(e.type), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mat = BODY_MAT(), v = { root, body, mat, limbs: [], ph: Math.random() * 6, flash: 0, scale: e.elite ? 1.25 : 1 };
  if (e.type === 'wisp') {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.position.y = 1.1; body.add(core); v.core = core;
  } else {
    const b = new THREE.Mesh(g.body, mat); b.castShadow = true; body.add(b);
    for (const [x, y, isLeg] of [[-g.armX, g.shoulder, 0], [g.armX, g.shoulder, 0], [-0.14, g.leg, 1], [0.14, g.leg, 1]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); const m = new THREE.Mesh(g.limb, mat); m.castShadow = true; pivot.add(m); body.add(pivot); v.limbs.push({ pivot, isLeg });
    }
    if (g.core) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff7a2a', toneMapped: false })); c.position.set(0, 1.4, 0.62); body.add(c); }
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: g.eyes, toneMapped: false });
  for (const sx of [-1, 1]) { const ey = new THREE.Mesh(eyeGeo, eyeMat); ey.position.set(sx * 0.09 * (e.type === 'brute' ? 1.6 : 1), g.eyeY, g.eyeZ); body.add(ey); }
  if (e.elite) { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color: '#f2c25c', toneMapped: false })); halo.rotation.x = Math.PI / 2; halo.position.y = 0.06; root.add(halo); }
  root.scale.setScalar(v.scale); scene.add(root); return v;
}
function animateEnemy(e, dt) {
  const v = e.view, g = buildEnemyGeo(e.type); v.ph += dt * (e.moving ? 9 : 2.5);
  const sw = e.moving ? Math.sin(v.ph) * 0.7 : 0;
  v.root.position.set(e.x, (g.float ? g.float + Math.sin(v.ph * 0.5) * 0.12 : 0) + (e.dying > 0 ? -0.6 * (1 - e.dying / 0.45) : 0), e.z);
  v.root.rotation.y = e.face;
  for (const [i, l] of v.limbs.entries()) {
    if (l.isLeg) l.pivot.rotation.x = i % 2 ? -sw : sw;
    else l.pivot.rotation.x = e.wind > 0 ? -2.4 * (1 - e.wind / e.windMax) : (i % 2 ? sw : -sw) * 0.5 - (e.type === 'ghoul' ? 0.9 : 0.2);
  }
  if (v.core) { v.core.scale.setScalar(1 + Math.sin(uTime.value * 8) * 0.12 + (e.fuse > 0 ? (1 - e.fuse / ENEMIES.wisp.fuse) * 0.8 : 0)); if (Math.random() < dt * 20) glow.spawn(e.x, 1.1, e.z, rand(-0.3, 0.3), rand(0.4, 1), rand(-0.3, 0.3), 0.6, 0.35, 0.05, 0x8fd8ff, 0.9, SH.DOT); }
  v.flash = Math.max(0, v.flash - dt * 7); v.mat.emissive.setRGB(v.flash * 1.6, v.flash * 1.2, v.flash * 1.0); // a short white-hot pulse, not a tint
  if (e.burn > 0 && Math.random() < dt * 14) glow.spawn(e.x + rand(-0.3, 0.3), rand(0.6, 1.6), e.z + rand(-0.3, 0.3), 0, 1.2, 0, 0.5, 0.3, 0.05, 0xff7a2a, 0.9, SH.DOT);
  if (e.slow > 0 && Math.random() < dt * 6) glow.spawn(e.x + rand(-0.3, 0.3), rand(0.4, 1.4), e.z + rand(-0.3, 0.3), 0, 0.3, 0, 0.6, 0.25, 0.05, 0x9fd8ff, 0.7, SH.SPARK);
  if (e.dying > 0) v.root.scale.setScalar(v.scale * Math.max(0.01, e.dying / 0.45));
}
function buildBossView(type) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mat = BODY_MAT(), v = { root, body, mat, ph: 0, flash: 0, limbs: [] };
  if (type === 'warden') {
    const plate = '#5a5470', dark = '#2e2a3c', bronze = '#b8863a';
    body.add(new THREE.Mesh(merge([part(new THREE.CylinderGeometry(1.2, 0.95, 2, 8), plate, 0, 2.4, 0), part(new THREE.SphereGeometry(0.7, 8, 6), plate, -1.4, 3.3, 0), part(new THREE.SphereGeometry(0.7, 8, 6), plate, 1.4, 3.3, 0),
      part(new THREE.CylinderGeometry(0.55, 0.65, 0.9, 8), dark, 0, 3.8, 0), part(new THREE.BoxGeometry(0.7, 0.1, 0.1), '#ffb05a', 0, 3.85, 0.6), part(new THREE.CylinderGeometry(0.9, 1.1, 1.4, 8), dark, 0, 0.7, 0)]), mat));
    const bell = new THREE.Mesh(merge([part(new THREE.CylinderGeometry(0.5, 1.15, 1.6, 10, 1, true), bronze, 0, -1.2, 0), part(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bronze, 0, -0.4, 0), part(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), '#3a2a20', 0, 0.1, 0)]),
      std({ vertexColors: true, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    const arm = new THREE.Group(); arm.position.set(1.5, 3.1, 0); arm.add(new THREE.Mesh(merge([part(new THREE.BoxGeometry(0.5, 1.6, 0.5), plate, 0, -0.8, 0)]), mat)); bell.position.y = -1.7; arm.add(bell); body.add(arm); v.limbs.push(arm); v.bell = bell;
    v.scale = 1; v.eyeH = 3.85;
  } else if (type === 'lich') {
    const robe = '#2a2a5a', trim = '#9fa8ff';
    body.add(new THREE.Mesh(merge([part(new THREE.ConeGeometry(1.1, 3, 9), robe, 0, 1.7, 0), part(new THREE.SphereGeometry(0.42, 8, 6), '#e6dcc4', 0, 3.4, 0), part(new THREE.TorusGeometry(0.45, 0.07, 6, 14), trim, 0, 3.75, 0, Math.PI / 2),
      part(new THREE.ConeGeometry(0.09, 0.4, 4), trim, 0, 3.95, 0.35), part(new THREE.ConeGeometry(0.09, 0.4, 4), trim, -0.33, 3.95, -0.15), part(new THREE.ConeGeometry(0.09, 0.4, 4), trim, 0.33, 3.95, -0.15), part(new THREE.BoxGeometry(1.8, 0.12, 0.12), trim, 0, 2.6, 0.2)]), mat));
    v.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: '#9fa8ff', toneMapped: false })); v.orb.position.set(1.2, 2.8, 0.5); body.add(v.orb); v.float = 0.6; v.eyeH = 3.42;
  } else {
    const plate = '#3a2a2a', ember = '#ff7a2a', gold = '#f2c25c';
    body.add(new THREE.Mesh(merge([part(new THREE.CylinderGeometry(1.05, 0.85, 1.9, 8), plate, 0, 2.3, 0), part(new THREE.SphereGeometry(0.62, 8, 6), plate, -1.25, 3.1, 0), part(new THREE.SphereGeometry(0.62, 8, 6), plate, 1.25, 3.1, 0),
      part(new THREE.CylinderGeometry(0.45, 0.5, 0.8, 8), plate, 0, 3.6, 0), part(new THREE.CylinderGeometry(0.55, 0.5, 0.35, 8, 1, true), gold, 0, 4.1, 0), part(new THREE.BoxGeometry(0.6, 0.08, 0.1), ember, 0, 3.65, 0.5),
      part(new THREE.CylinderGeometry(0.9, 1.0, 1.4, 8), '#5a1a1a', 0, 0.7, 0)]), mat));
    const arm = new THREE.Group(); arm.position.set(1.3, 3.0, 0);
    arm.add(new THREE.Mesh(merge([part(new THREE.BoxGeometry(0.4, 1.4, 0.4), plate, 0, -0.7, 0), part(new THREE.BoxGeometry(0.22, 3.4, 0.08), '#ffd2a0', 0, -2.9, 0.3), part(new THREE.BoxGeometry(0.8, 0.12, 0.16), gold, 0, -1.25, 0.3)]),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: '#ff5a1a', emissiveIntensity: 0.55 })));
    body.add(arm); v.limbs.push(arm); v.eyeH = 3.65;
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(root); return v;
}

// ================================================================ FX (Points from one sprite atlas + telegraph decals + swing trails)
const atlas = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128 + 64, ((i / 4) | 0) * 128 + 64); fn(); g.restore(); };
  cell(0, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); });
  cell(1, () => { g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? 12 : 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
  cell(2, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -56); g.lineTo(18, 0); g.lineTo(0, 56); g.lineTo(-18, 0); g.fill(); });
  cell(3, () => { g.strokeStyle = '#fff'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 50, 0, 7); g.stroke(); });
  cell(4, () => { g.fillStyle = '#fff'; g.fillRect(-26, -26, 52, 52); });
  cell(5, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill(); });
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; return tex;
})();
const SH = { DOT: 0, SPARK: 1, SHARD: 2, RING: 3, CHIP: 4, SMOKE: 5 };
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
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, u * 8) * Math.min(1, (1 - u) * 3);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of Object.values(this.geo.attributes)) a.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}
const fx = new FX(2400, false), glow = new FX(1800, true);
function burst(x, y, z, hex, n = 14, sp = 4, shape = SH.DOT, size = 0.3) {
  n = Math.ceil(n * fxBudget());
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, v = rand(0.4, 1) * sp; glow.spawn(x, y, z, Math.cos(a) * v, rand(0.5, 1.6) * sp * 0.6, Math.sin(a) * v, rand(0.4, 0.8), size, 0.04, hex, 1, shape, { grav: 4, drag: 2, spin: rand(-6, 6) }); }
}
function dissolve(x, z, h, hex) { // an enemy breaks into rising ember sparks and ash
  const n = Math.ceil(26 * fxBudget());
  for (let i = 0; i < n; i++) glow.spawn(x + rand(-0.4, 0.4), rand(0.2, h), z + rand(-0.4, 0.4), rand(-0.6, 0.6), rand(1, 3), rand(-0.6, 0.6), rand(0.6, 1.3), rand(0.15, 0.32), 0.03, hex, 1, i % 3 ? SH.DOT : SH.SPARK, { drag: 1.5 });
  for (let i = 0; i < 6 * fxBudget(); i++) fx.spawn(x + rand(-0.3, 0.3), rand(0.3, 1), z + rand(-0.3, 0.3), rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5), rand(1, 1.6), 0.5, 1.2, 0x2a2430, 0.5, SH.SMOKE);
}
// telegraphs: red ground marks that fill up before an attack lands
const teleMat = (opacity) => new THREE.MeshBasicMaterial({ color: '#ff3a4a', transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const teles = [];
function telegraph(o) { // {shape: circle|ring|line|cone, x, z, r, r2, len, w, ang, arc, dur, dmg, onHit, src}
  const g = new THREE.Group(); g.position.set(o.x, 0.04, o.z);
  const mk = (geo, op) => { const m = new THREE.Mesh(geo, teleMat(op)); m.rotation.x = -Math.PI / 2; g.add(m); return m; };
  let fill;
  if (o.shape === 'circle') { mk(new THREE.RingGeometry(o.r - 0.08, o.r, 40), 0.85); mk(new THREE.CircleGeometry(o.r, 40), 0.12); fill = mk(new THREE.CircleGeometry(o.r, 40), 0.3); }
  else if (o.shape === 'ring') { mk(new THREE.RingGeometry(o.r2, o.r, 56), 0.15); fill = mk(new THREE.RingGeometry(o.r2, o.r, 56), 0.35); mk(new THREE.RingGeometry(o.r - 0.07, o.r, 56), 0.85); }
  else if (o.shape === 'line') { const pg = new THREE.PlaneGeometry(o.w, o.len); pg.translate(0, o.len / 2, 0); mk(pg, 0.16); const fg = pg.clone(); fill = mk(fg, 0.35); g.rotation.y = -o.ang - Math.PI / 2; }
  else if (o.shape === 'cone') { const cg = new THREE.CircleGeometry(o.r, 32, -o.arc / 2 + Math.PI / 2, o.arc); mk(cg, 0.14); fill = mk(cg.clone(), 0.35); g.rotation.y = -o.ang - Math.PI / 2; }
  scene.add(g);
  const tl = { ...o, g, fill, t: 0, seen: Math.random() < BOT_SKILL }; teles.push(tl); fill.scale.setScalar(0.01); return tl;
}
function inTele(tl, x, z, pad = 0) {
  const dx = x - tl.x, dz = z - tl.z, d = Math.hypot(dx, dz);
  if (tl.shape === 'circle') return d <= tl.r + pad;
  if (tl.shape === 'ring') return d <= tl.r + pad && d >= tl.r2 - pad;
  if (tl.shape === 'line') { const ca = Math.cos(tl.ang), sa = Math.sin(tl.ang), along = dx * ca + dz * sa, side = -dx * sa + dz * ca; return along >= -pad && along <= tl.len + pad && Math.abs(side) <= tl.w / 2 + pad; }
  if (tl.shape === 'cone') return d <= tl.r + pad && Math.abs(wrapA(Math.atan2(dz, dx) - tl.ang)) <= tl.arc / 2;
  return false;
}
function updateTeles(dt) {
  for (let i = teles.length - 1; i >= 0; i--) {
    const tl = teles[i]; tl.t += dt; const u = Math.min(1, tl.t / tl.dur);
    if (tl.shape === 'line') tl.fill.scale.set(1, u, 1); else tl.fill.scale.setScalar(Math.max(0.01, u));
    if (tl.follow) { tl.x = tl.follow.x; tl.z = tl.follow.z; tl.g.position.set(tl.x, 0.04, tl.z); }
    if (tl.t >= tl.dur) {
      if (tl.dmg && inTele(tl, player.x, player.z)) hurtPlayer(tl.dmg, tl.src);
      tl.onHit?.(tl);
      scene.remove(tl.g); tl.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); teles.splice(i, 1);
    }
  }
}
function cancelTele(tl) { const i = teles.indexOf(tl); if (i < 0) return; scene.remove(tl.g); tl.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); teles.splice(i, 1); }
function clearTeles() { for (const tl of teles) { scene.remove(tl.g); tl.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); } teles.length = 0; }
// swing trails: a short additive arc in front of the knight
const trails = [];
function swingTrail(x, z, ang, range, arc, hex = 0xffd2a0) {
  const full = arc >= Math.PI * 1.9, geo = new THREE.RingGeometry(Math.max(0.3, range * 0.35), range, 32, 1, full ? 0 : -arc / 2, full ? Math.PI * 2 : arc);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = ang; m.position.set(x, 0.9, z); scene.add(m); trails.push({ m, t: 0.18 });
}
function updateTrails(dt) { for (let i = trails.length - 1; i >= 0; i--) { const tr = trails[i]; tr.t -= dt; tr.m.material.opacity = Math.max(0, tr.t / 0.18) * 0.6; tr.m.scale.setScalar(1 + (0.18 - tr.t) * 0.8); if (tr.t <= 0) { scene.remove(tr.m); tr.m.geometry.dispose(); tr.m.material.dispose(); trails.splice(i, 1); } } }
const shockRings = [];
function shockwave(x, z, r, hex = '#ffd2a0', life = 0.5) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); scene.add(m); shockRings.push({ m, t: 0, life, r });
}
function updateShock(dt) { for (let i = shockRings.length - 1; i >= 0; i--) { const s = shockRings[i]; s.t += dt; const u = s.t / s.life; if (u >= 1) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); shockRings.splice(i, 1); continue; } s.m.scale.setScalar(0.3 + s.r * (1 - Math.pow(1 - u, 3))); s.m.material.opacity = 0.9 * (1 - u); } }
// embers on the floor
const emberMeshGeo = new THREE.OctahedronGeometry(0.13, 0), emberMat = new THREE.MeshBasicMaterial({ color: '#ffb05a', toneMapped: false });
const emberMesh = new THREE.InstancedMesh(emberMeshGeo, emberMat, 300); emberMesh.count = 0; emberMesh.frustumCulled = false; scene.add(emberMesh);
const embers = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
function dropEmbers(x, z, n) { for (let i = 0; i < n && embers.length < 300; i++) { const a = Math.random() * 6.3, s = rand(1, 3); embers.push({ x, z, y: 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(2, 4), t: 0, ph: Math.random() * 6 }); } }
// projectiles (imp fireballs, lich bolts, king embers)
const projGeo = new THREE.IcosahedronGeometry(0.22, 1);
const projs = [];
function shoot(x, z, ang, speed, dmg, hex = '#ff7a3a', r = 0.3, life = 4) {
  const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })); m.position.set(x, 1, z); m.scale.setScalar(r / 0.22); scene.add(m);
  projs.push({ m, x, z, vx: Math.cos(ang) * speed, vz: Math.sin(ang) * speed, dmg, r, life, hex: C(hex).getHex() });
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt; p.m.position.set(p.x, 1, p.z);
    if (Math.random() < dt * 30 * fxBudget()) glow.spawn(p.x, 1, p.z, 0, 0.2, 0, 0.35, p.r * 1.6, 0.05, p.hex, 0.9, SH.DOT);
    let gone = p.life <= 0 || Math.hypot(p.x, p.z) > CFG.roomR + 1;
    if (!gone && Math.hypot(p.x - player.x, p.z - player.z) < p.r + CFG.playerR) { hurtPlayer(p.dmg, null); gone = true; burst(p.x, 1, p.z, p.hex, 10, 3); }
    if (gone) { scene.remove(p.m); p.m.material.dispose(); projs.splice(i, 1); }
  }
}
function clearProjs() { for (const p of projs) { scene.remove(p.m); p.m.material.dispose(); } projs.length = 0; }

// ================================================================ INPUT (keyboard, mouse hold-to-move, touch floating joystick, dodge button)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, mouse = { on: false, x: 0, y: 0, id: null };
let isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
function setTouchUI(on) {
  if (isTouch === on && document.body.classList.contains('touch') === on) return;
  isTouch = on; document.body.classList.toggle('touch', on); $('menuControls').innerHTML = controlsHTML(); if (coach.id) renderTip();
  $('dodge').hidden = !((state === State.PLAYING || state === State.PAUSED) && on);
}
document.body.classList.toggle('touch', isTouch);
addEventListener('touchstart', () => setTouchUI(true), { passive: true, capture: true });
let dodgeQueued = false;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) setTouchUI(false);
  if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && state === State.PLAYING) dodgeQueued = true;
  if (e.code === 'KeyP') togglePause(); // never Escape: on CrazyGames it exits fullscreen
  if (state === State.PICK && /^Digit[1-4]$/.test(e.code)) { const c = $('pickCards').children[+e.code.slice(5) - 1]; c?.click(); }
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.on = false; });
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING) return;
  if (e.pointerType === 'mouse') { if (e.button === 2) { dodgeQueued = true; return; } if (e.button !== 0) return; setTouchUI(false); mouse.on = true; mouse.id = e.pointerId; mouse.x = e.clientX; mouse.y = e.clientY; canvas.setPointerCapture(e.pointerId); return; }
  if (stick.id !== null) return;
  setTouchUI(true); stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
$('btnDodge').addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); dodgeQueued = true; });
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _ndc = new THREE.Vector2();
function moveInput() { // x right, y down on screen == +x, +z in the world (the camera has no yaw)
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = stick.y; }
  else if (mouse.on) {
    _ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1); ray.setFromCamera(_ndc, camera);
    if (ray.ray.intersectPlane(floorPlane, _hit)) { x = _hit.x - player.x; y = _hit.z - player.z; const d = Math.hypot(x, y); if (d < 0.35) x = y = 0; else if (d < 1.2) { x *= 1 / 1.2; y *= 1 / 1.2; } }
  }
  if (AUTOPLAY) { const b = botMove(); x = b.x; y = b.y; if (b.dodge) dodgeQueued = true; }
  const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : l < 0.15 ? { x: 0, y: 0 } : { x, y };
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED / PICK -> OVER; CAMP and SETTINGS from the menu)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', PICK: 'PICK', OVER: 'OVER', CAMP: 'CAMP', SETTINGS: 'SETTINGS', COVER: 'COVER' };
let state = State.BOOT, back = State.MENU;
const freshSave = () => ({ v: 1, embers: 0, meta: {}, weapons: { sword: 1 }, weapon: 'sword', best: 0, runs: 0, kills: 0, wins: 0, tips: {}, vol: { music: 0.8, sfx: 0.9 }, gfx: 'auto', shake: 'on' });
let save = freshSave();
function loadSave() { if (CAPTURE) return; const s = loadData(SAVE_KEY, null); if (s && s.v === 1) save = { ...freshSave(), ...s, vol: { ...freshSave().vol, ...(s.vol || {}) }, meta: { ...(s.meta || {}) }, weapons: { sword: 1, ...(s.weapons || {}) }, tips: { ...(s.tips || {}) } }; }
function persist() { if (!CAPTURE) saveData(SAVE_KEY, save); }
const SCREENS = { MENU: 'menu', PAUSED: 'paused', PICK: 'pick', OVER: 'over', CAMP: 'camp', SETTINGS: 'settings' };
function setState(s) {
  state = s;
  for (const [st, id] of Object.entries(SCREENS)) $(id).hidden = s !== st;
  const inGame = s === State.PLAYING || s === State.PAUSED || s === State.PICK;
  $('hud').hidden = !inGame; $('dodge').hidden = !((s === State.PLAYING || s === State.PAUSED) && isTouch); $('bossBar').hidden = !(inGame && run?.boss);
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; mouse.on = false; $('joystick').hidden = true; $('coach').hidden = true; $('hand').hidden = true; $('arrow').hidden = true; }
  else if (coach.id) $('coach').hidden = false;
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop();
  if (s === State.MENU) { refreshMenu(); playMusic('camp'); }
}
function togglePause() {
  if (state === State.PLAYING) { setState(State.PAUSED); $('pauseRelics').innerHTML = Object.entries(run.relics).map(([id, n]) => `<span>${svgIcon(RELICS[id].icon)} ${t('rel_' + id)}${n > 1 ? ` ×${n}` : ''}</span>`).join(''); }
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
let bannerTimer = 0;
function banner(text, sub = '', ms = 2000) {
  if (state === State.COVER) return;
  const el = $('banner'); $('bannerText').textContent = text; $('bannerSub').textContent = sub; $('bannerSub').hidden = !sub;
  el.hidden = true; void el.offsetWidth; el.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

// ================================================================ UI (menu, camp, picks, results, settings)
const keyHTML = (k) => `<span class="key">${k}</span>`;
function controlsHTML() {
  if (isTouch) return `<span>${svgIcon('boot')}${t('ctl_drag')}</span><span>${svgIcon('feather')}${t('ctl_tap')}</span><span>${svgIcon('sword')}${t('ctl_auto')}</span>`;
  return `<span>${['W', 'A', 'S', 'D'].map(keyHTML).join('')} / ${['↑', '←', '↓', '→'].map(keyHTML).join('')} ${t('ctl_move')}</span><span>${keyHTML('Space')} ${t('ctl_dodge')}</span><span>${keyHTML('P')} ${t('ctl_pause')}</span><span>${svgIcon('sword')}${t('ctl_auto')}</span>`;
}
function refreshMenu() {
  const parts = [];
  if (save.runs) { parts.push(`<span>${svgIcon('skull')}${t('bestFloor', { n: save.best })}</span>`); parts.push(`<span>${svgIcon('flame')}${t('embersTotal', { n: Math.floor(save.embers) })}</span>`); }
  $('menuStats').innerHTML = parts.join(''); $('menuControls').innerHTML = controlsHTML();
  $('btnCamp').classList.toggle('pulse', save.runs > 0 && canAffordAny());
}
const metaLv = (id) => save.meta[id] | 0;
const canAffordAny = () => Object.entries(META).some(([id, m]) => metaLv(id) < m.max && save.embers >= m.cost(metaLv(id))) || Object.entries(WEAPONS).some(([id, w]) => !save.weapons[id] && save.embers >= w.cost);
function renderCamp() {
  $('campEmbers').textContent = Math.floor(save.embers);
  $('metaGrid').innerHTML = Object.entries(META).map(([id, m]) => {
    const lv = metaLv(id), max = lv >= m.max, c = max ? 0 : m.cost(lv), ok = !max && save.embers >= c;
    return `<button class="opt ${max ? 'on' : ok ? 'ok' : 'no'}" data-meta="${id}"><span class="ico">${svgIcon(m.icon)}</span><b>${t('meta_' + id)}</b><small>${t('metad_' + id)}</small>
      <span class="pips">${Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span><span class="cost">${max ? svgIcon('check') : `${svgIcon('flame')}${c}`}</span></button>`;
  }).join('');
  $('weaponGrid').innerHTML = Object.entries(WEAPONS).map(([id, w]) => {
    const owned = !!save.weapons[id], on = save.weapon === id, ok = owned || save.embers >= w.cost;
    return `<button class="opt ${on ? 'on' : owned ? '' : ok ? 'ok' : 'no'}" data-weapon="${id}"><span class="ico">${svgIcon(w.icon)}</span><b>${t('w_' + id)}</b><small>${t('wd_' + id)}</small>
      <span class="cost">${on ? t('equipped') : owned ? t('equip') : `${svgIcon('flame')}${w.cost}`}</span></button>`;
  }).join('');
  $('metaGrid').querySelectorAll('[data-meta]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.meta, m = META[id], lv = metaLv(id); if (lv >= m.max) return;
    if (save.embers < m.cost(lv)) { playSfx('nope'); toast(t('needEmbers')); return; }
    save.embers -= m.cost(lv); save.meta[id] = lv + 1; playSfx('relic', 0.8); doneTip('camp'); persist(); renderCamp();
  }));
  $('weaponGrid').querySelectorAll('[data-weapon]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.weapon, w = WEAPONS[id];
    if (!save.weapons[id]) { if (save.embers < w.cost) { playSfx('nope'); toast(t('needEmbers')); return; } save.embers -= w.cost; save.weapons[id] = 1; playSfx('unlock', 0.8); doneTip('camp'); }
    save.weapon = id; setKnightWeapon(knight, id); persist(); renderCamp();
  }));
}
function openSettings() { back = state; renderSettings(); setState(State.SETTINGS); }
function renderSettings() {
  $('volMusic').value = Math.round(save.vol.music * 100); $('volSfx').value = Math.round(save.vol.sfx * 100);
  $('volMusicVal').textContent = $('volMusic').value; $('volSfxVal').textContent = $('volSfx').value;
  const seg = (el, opts, key, label) => { $(el).innerHTML = opts.map((g) => `<button class="${save[key] === g ? 'on' : ''}" data-g="${g}" role="radio" aria-checked="${save[key] === g}">${t(label + g)}</button>`).join('');
    $(el).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { playSfx('click', 0.5); save[key] = b.dataset.g; if (key === 'gfx') applyGfx(); renderSettings(); })); };
  seg('gfxSeg', ['auto', 'high', 'low'], 'gfx', 'gfx_'); seg('shakeSeg', ['on', 'low', 'off'], 'shake', 'shake_');
}
$('volMusic').addEventListener('input', () => { save.vol.music = $('volMusic').value / 100; $('volMusicVal').textContent = $('volMusic').value; setMusicVolume(); });
$('volSfx').addEventListener('input', () => { save.vol.sfx = $('volSfx').value / 100; $('volSfxVal').textContent = $('volSfx').value; });
$('volSfx').addEventListener('change', () => playSfx('swing', 1));
for (const id of ['volMusic', 'volSfx']) $(id).addEventListener('keydown', (e) => e.stopPropagation());
// card picks: gods, vows, relics
function showPick(title, sub, cards, onPick, opts = {}) {
  $('pickTitle').textContent = title; $('pickSub').textContent = sub;
  $('pickCards').innerHTML = cards.map((c, i) => `<button class="pcard${c.rare ? ' rare' : ''}${c.synergy ? ' synergy' : ''}" data-i="${i}">${isTouch ? '' : `<span class="key keynum">${i + 1}</span>`}${c.tag ? `<span class="tag">${c.tag}</span>` : ''}
    <span class="ico" style="color:${c.color || 'var(--gold)'}">${svgIcon(c.icon)}</span><b>${c.name}</b><p>${c.desc}</p>${c.reward ? `<span class="reward">${c.reward}</span>` : ''}</button>`).join('');
  $('pickCards').querySelectorAll('.pcard').forEach((b) => b.addEventListener('click', () => { playSfx('card', 0.9); onPick(cards[+b.dataset.i]); }));
  $('btnPickSkip').hidden = !opts.skip; if (opts.skip) { $('btnPickSkip').textContent = opts.skip; $('btnPickSkip').onclick = () => { playSfx('click', 0.6); onPick(null); }; }
  $('btnReroll').hidden = !(opts.reroll > 0); if (opts.reroll > 0) { $('btnReroll').textContent = t('reroll', { n: opts.reroll }); $('btnReroll').onclick = () => { playSfx('card', 0.7); opts.onReroll(); }; }
  setState(State.PICK);
  if (AUTOPLAY && CAPTURE) { onPick(botPick(cards, opts)); return; }
  if (AUTOPLAY) setTimeout(() => { if (state === State.PICK && $('pickTitle').textContent === title) onPick(botPick(cards, opts)); }, CAPTURE ? 0 : 600);
}
click('btnPlay', () => startRun());
click('btnCamp', () => { back = state; renderCamp(); setState(State.CAMP); playMusic('camp'); });
click('btnCampBack', () => setState(back === State.OVER ? State.OVER : State.MENU));
click('btnSettings', () => openSettings());
click('btnPauseSettings', () => openSettings());
click('btnSettingsDone', () => { persist(); setState(back === State.PAUSED ? State.PAUSED : State.MENU); });
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => endRun(false, true));
click('btnOverAgain', () => { if (run?.won && !run.ascending) { run.ascending = true; resumeAscension(); } else triggerMidgameAd(() => startRun()); }); // between climbs: the right moment for a midgame ad
click('btnOverCamp', () => { back = State.OVER; renderCamp(); setState(State.CAMP); });
click('btnOverMenu', () => { resetArena(); setState(State.MENU); });
click('btnOverDouble', () => { $('btnOverDouble').hidden = true; triggerRewardedAd(() => { save.embers += run.banked; run.banked *= 2; $('overEmbers').textContent = `+${run.banked}`; toast(t('doubled')); persist(); }); });
click('btnSkipTips', () => { save.tips.off = 1; coach.id = null; $('coach').hidden = true; $('hand').hidden = true; persist(); });

// ================================================================ RUN (a climb: floors, waves, vows, relics, the door)
let run = null;
function after(sec, fn) { if (run) run.timers.push({ t: sec, fn }); } // game-time timers: they follow pause, skip() and capture stepping
const player = { x: 0, z: 4, vx: 0, vz: 0, face: Math.PI, hp: 100, invuln: 0, dodge: 0, dodgeCd: 0, dodgeDir: [0, 1], atkCd: 0, atkN: 0, haste: 0, vengeance: false, novaT: 6, flailA: 0, shadowHit: new Set() };
let knight = null;
let enemies = [], boss = null, statsCache = null;
function stats() { // everything that changes the knight's numbers, recomputed when relics, gods or camp upgrades change
  if (statsCache) return statsCache;
  const r = run?.relics || {}, god = run?.god, vain = god === 'vanity' ? 1.12 : 1, W = WEAPONS[run?.weapon || save.weapon];
  const s = {
    maxHp: (CFG.hp + 12 * metaLv('vitality') + 25 * (r.heart | 0) + (run?.bonusHp || 0)) * vain * (r.glass ? 0.75 : 1),
    dmg: CFG.dmg * (1 + 0.06 * metaLv('might')) * Math.pow(1.2, r.edge | 0) * (r.glass ? 1.5 : 1) * vain,
    speed: CFG.speed * (1 + 0.03 * metaLv('swiftness')) * (1 + 0.1 * (r.greaves | 0)) * vain,
    atkSpeed: Math.pow(1.18, r.grip | 0) * vain, range: W.range * (1 + 0.2 * (r.reach | 0)), arc: W.arc,
    armor: 1 - Math.min(0.5, 0.15 * (r.bulwark | 0)), thorns: 0.4 * (r.thorns | 0), lifesteal: CFG.lifesteal * (r.thirst | 0), crit: 0.15 * (r.crit | 0),
    emberMult: (1 + 0.08 * metaLv('luck')) * (r.magnet ? 1.15 : 1), magnet: CFG.magnet * (r.magnet ? 2 : 1), dodgeCd: CFG.dodge.cd * (r.shadow ? 0.65 : 1), weapon: W,
  };
  statsCache = s; return s;
}
const dirtyStats = () => { statsCache = null; };
const actOf = (floor) => Math.floor((floor - 1) / 5) % 3;
const isBossFloor = (floor) => floor % CFG.bossEvery === 0;
const floorScale = (floor) => 1 + CFG.hpScale * (floor - 1) + (floor > CFG.finalFloor ? Math.pow(CFG.ascension, Math.floor((floor - 1) / CFG.finalFloor)) - 1 : 0);
function startRun() {
  resetArena();
  run = { floor: 1, weapon: save.weapon, god: null, relics: {}, embers: 0, kills: 0, vowsKept: 0, time: 0, vow: null, vowBroken: false, roomT: 0, wave: 0, waves: 0, phase: 'intro',
    timers: [], rerolls: metaLv('reroll'), second: metaLv('second') > 0, phoenix: false, boss: false, won: false, ascending: false, bonusHp: 0, banked: 0, hitThisRoom: false, dodgedThisRoom: false };
  dirtyStats(); player.hp = stats().maxHp; setKnightWeapon(knight, run.weapon);
  save.runs++; persist();
  buildRoom(0); placePlayer(); updateHud(true);
  playMusic('tower');
  const gods = Object.keys(GODS).map((id) => ({ id, icon: GODS[id].icon, color: GODS[id].color, name: t('god_' + id), desc: t('godd_' + id) }));
  showPick(t('pickGod'), t('pickGodSub'), gods, (c) => { run.god = c.id; dirtyStats(); player.hp = stats().maxHp; offerVow(); });
}
function resumeAscension() { $('over').hidden = true; nextFloor(); }
function placePlayer() { player.x = 0; player.z = CFG.roomR - 2.5; player.vx = player.vz = 0; player.face = Math.PI; player.invuln = 0; player.dodge = 0; knight.root.position.set(player.x, 0, player.z); camSnap = true; }
function offerVow() {
  const ids = Object.keys(VOWS).filter((v) => !(v === 'blood' && player.hp < stats().maxHp * 0.6)), opts = [];
  while (opts.length < 3 && ids.length) opts.push(ids.splice((Math.random() * ids.length) | 0, 1)[0]);
  const swiftT = swiftTime(run.floor);
  const cards = opts.map((id) => ({ id, icon: VOWS[id].icon, name: t('vow_' + id), desc: t('vowd_' + id, { t: swiftT }), reward: t('vowr_' + id) }));
  showPick(t('pickVow'), t('pickVowSub'), cards, (c) => { swearVow(c?.id || null); enterRoom(); }, { skip: t('noVow') });
}
const swiftTime = (floor) => (isBossFloor(floor) ? 75 : 22 + CFG.waves(floor) * 13);
function swearVow(id) {
  run.vow = id; run.vowBroken = false; run.hitThisRoom = false; run.dodgedThisRoom = false;
  if (!id) { $('vowChip').hidden = true; return; }
  if (id === 'blood') player.hp = Math.min(player.hp, stats().maxHp * 0.5);
  playSfx('swear', 0.9); toast(t('vowSworn', { v: t('vow_' + id) }));
}
function breakVow() { if (!run.vow || run.vowBroken) return; run.vowBroken = true; playSfx('broken', 0.9); banner(t('vowBroken'), t('vow_' + run.vow), 1400); }
function enterRoom() {
  run.roomT = 0; run.wave = 0; run.waves = isBossFloor(run.floor) ? 1 : CFG.waves(run.floor); run.phase = 'fight';
  run.roomEmbers = 0; run.boss = isBossFloor(run.floor);
  setState(State.PLAYING);
  if (run.boss) { run.wave = run.waves = 1; spawnBoss(BOSSES[(Math.floor((run.floor - 1) / 5)) % 3]); } else spawnWave();
  if (!coach.id) nextTip();
  updateHud(true);
}
function spawnWave() {
  run.wave++;
  const f = run.floor, A = ACTS[actOf(f)], n = f === 1 && run.wave === 1 ? 4 : CFG.waveSize(f, run.wave);
  for (let i = 0; i < n; i++) {
    let type = f === 1 && run.wave === 1 ? 'skeleton' : pickOne(A.enemies);
    if (type === 'brute' && enemies.filter((e) => e.type === 'brute').length >= 1 + (f >> 3)) type = 'skeleton';
    const a = Math.random() * Math.PI * 2, d = rand(CFG.roomR * 0.55, CFG.roomR - 0.8);
    spawnEnemy(type, Math.cos(a) * d, Math.sin(a) * d, f > 3 && Math.random() < 0.06 + f * 0.01);
  }
  if (run.wave > 1) banner(`${run.wave} / ${run.waves}`, '', 900);
}
function spawnEnemy(type, x, z, elite = false) {
  if (Math.hypot(x - player.x, z - player.z) < 3.5) { const a = Math.atan2(z - player.z, x - player.x); x = player.x + Math.cos(a) * 4; z = player.z + Math.sin(a) * 4; }
  const d = ENEMIES[type], sc = floorScale(run.floor) * (elite ? 2.3 : 1);
  const e = { type, x, z, vx: 0, vz: 0, face: 0, hp: d.hp * sc, maxHp: d.hp * sc, dmg: d.dmg * (1 + CFG.dmgScale * (run.floor - 1)) * (elite ? 1.3 : 1), r: d.r * (elite ? 1.25 : 1), sp: d.sp, elite,
    wind: 0, windMax: d.wind || 0.5, cd: rand(0.4, 1.4), fuse: 0, burn: 0, burnDmg: 0, slow: 0, stun: 0, dying: 0, moving: false, charge: 0, chargeCd: rand(2, 4), spawnT: 0.5, chargeDir: 0 };
  e.view = buildEnemyView(e);
  burst(x, 0.3, z, ACTS[actOf(run.floor)].ember, 10, 2.5, SH.SPARK);
  enemies.push(e); return e;
}
function roomCleared() {
  if (run.phase !== 'fight') return;
  run.phase = 'clear'; clearTeles(); clearProjs();
  // vow check (the darkness / blood / stand-fast vows are kept by clearing; swift by time)
  let extraRelic = 0;
  if (run.vow && !run.vowBroken) {
    if (run.vow === 'swift' && run.roomT > swiftTime(run.floor)) breakVow();
    if (!run.vowBroken) {
      run.vowsKept++; playSfx('kept', 1); banner(t('vowKept'), t('vowr_' + run.vow), 2200);
      if (run.vow === 'unscathed') { extraRelic = 1; run.emberBonus = 1.5; }
      if (run.vow === 'swift') extraRelic = 1;
      if (run.vow === 'darkness') run.emberBonus = 2;
      if (run.vow === 'blood') { extraRelic = 1; player.hp = stats().maxHp; popText(player.x, 2, player.z, `+${t('vowKept')}`, 'heal'); }
      if (run.vow === 'standfast') { run.emberBonus = 2; run.bonusHp += 10; dirtyStats(); player.hp += 10; }
      $('vowChip').classList.add('kept');
    }
  } else banner(t('roomClear'), '', 1400);
  if (run.emberBonus) { const extra = Math.round(run.roomEmbers * (run.emberBonus - 1)); if (extra > 0) { dropEmbers(player.x, player.z, Math.min(40, extra)); run.embers += Math.max(0, extra - Math.min(40, extra)); } run.emberBonus = 0; }
  if (run.floor >= CFG.finalFloor && isBossFloor(run.floor) && !run.won) { after(1.8, () => winRun()); return; }
  const offerRelics = (k) => after(1.1, () => { if (run?.phase !== 'clear') return; pickRelic(() => { if (k > 1) offerRelics(k - 1); else openDoor(); }); });
  offerRelics(1 + extraRelic);
}
function relicChoices() {
  const owned = run.relics, pool = Object.keys(RELICS).filter((id) => (owned[id] | 0) < RELICS[id].max && !(id === 'phoenix' && run.phoenix)), out = [];
  while (out.length < 3 && pool.length) { const i = (Math.random() * pool.length) | 0; const id = pool[i]; if (RELICS[id].rare && Math.random() < 0.5 && pool.length > 3) continue; out.push(pool.splice(i, 1)[0]); }
  return out;
}
function pickRelic(after) {
  const make = () => relicChoices().map((id) => {
    const syn = (SYNERGY[id] || []).find((o) => run.relics[o] || o === run.weapon);
    return { id, icon: RELICS[id].icon, name: t('rel_' + id) + ((run.relics[id] | 0) ? ` ${['', 'II', 'III'][run.relics[id]]}` : ''), desc: t('reld_' + id), rare: RELICS[id].rare, tag: RELICS[id].rare ? t('rare') : syn ? t('synergy') : '', synergy: !!syn, syn };
  });
  const go = (cards) => showPick(t('pickRelic'), t('pickRelicSub'), cards, (c) => {
    if (c) {
      run.relics[c.id] = (run.relics[c.id] | 0) + 1; if (c.id === 'heart') player.hp += 25; if (c.id === 'phoenix') run.phoenix = true;
      dirtyStats(); player.hp = Math.min(player.hp, stats().maxHp); playSfx('relic', 0.9); burst(player.x, 1.2, player.z, 0xf2c25c, 20, 3, SH.SPARK);
      if (c.syn) toast(t('synergyToast', { a: t('rel_' + c.id), b: RELICS[c.syn] ? t('rel_' + c.syn) : t('w_' + c.syn) }));
    }
    setState(State.PLAYING); updateHud(true); after();
  }, { reroll: run.rerolls, onReroll: () => { run.rerolls--; go(make()); } });
  go(make());
}
function openDoor() { run.phase = 'door'; playSfx('door', 0.8); banner(t('doorOpen'), '', 1500); maybeTip('door'); shake(0.2); }
function nextFloor() {
  run.floor++; run.boss = false; run.vow = null; $('vowChip').hidden = true; $('vowChip').classList.remove('kept');
  if (run.floor > save.best) { save.best = run.floor; }
  clearField(); buildRoom(actOf(run.floor)); placePlayer();
  const a = actOf(run.floor);
  if ((run.floor - 1) % 5 === 0) banner(t('acts')[a], floorLabel(run.floor), 2600);
  updateHud(true); playMusic('tower'); offerVow();
}
const floorLabel = (f) => (f > CFG.finalFloor ? t('ascensionFloor', { a: Math.floor((f - 1) / CFG.finalFloor), n: f }) : t('floor', { n: f }));
function clearField() {
  for (const e of enemies) scene.remove(e.view.root); enemies = [];
  if (boss) { scene.remove(boss.view.root); boss = null; }
  clearTeles(); clearProjs(); embers.length = 0; emberMesh.count = 0; fx.clear(); glow.clear();
}
function resetArena() { clearField(); run = null; if (knight) { player.x = 0; player.z = 2; } }
function winRun() {
  run.won = true; save.wins++; happytime(); playSfx('victory', 1); endRun(true);
}
function endRun(won, abandoned = false) {
  if (!run) return;
  const banked = Math.floor(run.embers); run.banked = banked; save.embers += banked; save.kills += run.kills;
  const newBest = run.floor >= save.best; if (newBest) save.best = run.floor;
  persist();
  $('overTitle').textContent = won ? t('victoryTitle') : t('deathTitle', { n: run.floor });
  $('overSub').textContent = won ? t('victorySub') : abandoned ? '' : t('deathSub');
  $('overStats').innerHTML = [['st_floor', floorLabel(run.floor)], ['st_kills', run.kills], ['st_vows', run.vowsKept], ['st_relics', Object.values(run.relics).reduce((a, b) => a + b, 0)], ['st_time', mmss(run.time)]]
    .map(([k, v]) => `<span>${t(k)}</span><b>${v}</b>`).join('');
  $('overEmbers').textContent = `+${banked}`;
  $('btnOverDouble').hidden = !adsAvailable() || banked <= 0;
  $('btnOverAgain').textContent = won && !run.ascending ? t('ascend') : t('again');
  if (!won) { playSfx('defeat', 0.9); if (newBest && run.floor > 2) toast(t('newBest')); }
  setState(State.OVER); playMusic('camp');
  if (!save.tips.camp && save.embers >= 30) maybeTip('camp');
  if (won && !run.ascending) { /* the run continues only if the player ascends */ } else if (!won) { /* the run is over */ }
  if (AUTOPLAY) botCamp();
  if (AUTOPLAY && !CAPTURE) setTimeout(() => { if (state === State.OVER) { if (won && !run.ascending) { run.ascending = true; resumeAscension(); } else startRun(); } }, CAPTURE ? 0 : 1500);
}

// ================================================================ COMBAT (auto-attacks, dodge, damage, relic effects)
function nearestEnemy(x, z, maxD, not = null) {
  let best = null, bd = maxD;
  for (const e of enemies) { if (e.dying || e === not || e.spawnT > 0) continue; const d = Math.hypot(e.x - x, e.z - z) - e.r; if (d < bd) { bd = d; best = e; } }
  if (boss && !boss.dying && boss !== not) { const d = Math.hypot(boss.x - x, boss.z - z) - boss.r; if (d < bd) { bd = d; best = boss; } }
  return best;
}
const allTargets = () => (boss && !boss.dying ? [...enemies.filter((e) => !e.dying && e.spawnT <= 0), boss] : enemies.filter((e) => !e.dying && e.spawnT <= 0));
function playerAttack(dt) {
  const s = stats(), W = s.weapon;
  flailChain.visible = !!W.orbit;
  player.atkCd -= dt * s.atkSpeed * (player.haste > 0 ? 1.15 : 1);
  if (W.orbit) { // flail: a ball circling the knight, hitting whatever it passes
    player.flailA += dt * 4.2 * s.atkSpeed; const r = s.range, bx = player.x + Math.cos(player.flailA) * r, bz = player.z + Math.sin(player.flailA) * r;
    flailBall.position.set(bx, 0.9, bz); flailBall.visible = true; flailChain.position.set((player.x + bx) / 2, 0.95, (player.z + bz) / 2); flailChain.scale.set(1, 1, r); flailChain.lookAt(bx, 0.95, bz);
    for (const e of allTargets()) { e.flailCd = Math.max(0, (e.flailCd || 0) - dt); if (e.flailCd <= 0 && Math.hypot(e.x - bx, e.z - bz) < e.r + 0.45) { e.flailCd = W.cd; hitEnemy(e, s.dmg * W.dmg, { from: [bx, bz] }); playSfx('hit', 0.5); } }
    if (Math.random() < dt * 30) glow.spawn(bx, 0.9, bz, 0, 0.2, 0, 0.3, 0.3, 0.05, 0xffb05a, 0.7, SH.DOT);
    return;
  }
  flailBall.visible = false;
  if (player.atkCd > 0 || player.dodge > 0) return;
  const target = nearestEnemy(player.x, player.z, s.range + 0.2); if (!target) return;
  const ang = Math.atan2(target.z - player.z, target.x - player.x);
  player.face = ang; player.atkCd = W.cd; player.atkN++;
  knight.swing = 0.2; knight.swingDir = -knight.swingDir;
  const strikes = run.relics.echo && player.atkN % 3 === 0 ? 2 : 1;
  for (let k = 0; k < strikes; k++) {
    swingTrail(player.x, player.z, -ang, s.range, s.arc, k ? 0xff9a3d : 0xffe2b0);
    for (const e of allTargets()) {
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz) - e.r;
      if (d > s.range) continue;
      if (s.arc < Math.PI * 1.9 && Math.abs(wrapA(Math.atan2(dz, dx) - ang)) > s.arc / 2 + 0.2) continue;
      let dmg = s.dmg * W.dmg; if (player.vengeance) dmg *= 2.5;
      hitEnemy(e, dmg, { stun: W.stun, from: [player.x, player.z] });
    }
  }
  player.vengeance = false;
  if (W.wave) { shockwave(player.x + Math.cos(ang) * 1.6, player.z + Math.sin(ang) * 1.6, W.wave, '#ffd2a0', 0.45); shake(0.18); burst(player.x + Math.cos(ang) * 1.6, 0.2, player.z + Math.sin(ang) * 1.6, 0x9a8a7a, 10, 3, SH.CHIP); }
  playSfx(W.sfx, 0.8, 0.9 + Math.random() * 0.2);
}
function hitEnemy(e, dmg, o = {}) {
  if (e.dying) return;
  const s = stats(); let crit = false;
  if (s.crit && Math.random() < s.crit) { dmg *= 2; crit = true; }
  if (run.relics.execute && e.hp < e.maxHp * 0.25) dmg *= 2;
  e.hp -= dmg; e.view.flash = 1;
  if (!e.isBoss && o.from) { const a = Math.atan2(e.z - o.from[1], e.x - o.from[0]), kb = e.type === 'brute' ? 1.2 : 4; e.vx += Math.cos(a) * kb; e.vz += Math.sin(a) * kb; }
  if (o.stun && !e.isBoss) e.stun = Math.max(e.stun, o.stun);
  if (run.relics.firebrand && !o.dot) { e.burn = 3; e.burnDmg = s.dmg * 0.25 * run.relics.firebrand; }
  if (run.relics.frost && !o.dot) e.slow = 1.5;
  if (s.lifesteal && !o.dot) healPlayer(dmg * s.lifesteal, false);
  if (run.relics.chain && !o.dot && !o.chain && Math.random() < 0.25 * run.relics.chain) {
    let from = e; for (let k = 0; k < 2; k++) { const n2 = nearestEnemy(from.x, from.z, 4.5, from); if (!n2 || n2 === e) break; zap(from, n2); hitEnemy(n2, dmg * 0.5, { chain: true }); from = n2; }
  }
  if (!o.dot || crit) popText(e.x, (e.isBoss ? 4.5 : 2) + rand(0, 0.4), e.z, Math.round(dmg), crit ? 'crit' : '');
  if (!o.dot) burst(e.x, 1, e.z, crit ? 0xffd27a : 0xfff0d0, crit ? 10 : 5, 3, SH.SPARK, 0.25);
  if (e.hp <= 0) killEnemy(e);
}
const zapMat = new THREE.LineBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.95 });
function zap(a, b) {
  const pts = []; for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push(new THREE.Vector3(lerp(a.x, b.x, u) + (i && i < 6 ? rand(-0.3, 0.3) : 0), 1.1 + (i && i < 6 ? rand(-0.3, 0.3) : 0), lerp(a.z, b.z, u) + (i && i < 6 ? rand(-0.3, 0.3) : 0))); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), zapMat); scene.add(l); setTimeout(() => { scene.remove(l); l.geometry.dispose(); }, 120);
  playSfx('shock', 0.4);
}
function killEnemy(e) {
  if (e.isBoss) { bossDefeated(); return; }
  e.dying = 0.45; run.kills++; if (e.tele) cancelTele(e.tele);
  const A = ACTS[actOf(run.floor)];
  dissolve(e.x, e.z, e.type === 'brute' ? 2.2 : 1.6, A.ember); playSfx('dissolve', 0.7);
  const n = Math.round(ENEMIES[e.type].value * CFG.emberDrop * (e.elite ? 4 : 1) * stats().emberMult); dropEmbers(e.x, e.z, n);
  if (run.god === 'morrow') healPlayer(stats().maxHp * CFG.morrowHeal, false);
  if (run.relics.haste) player.haste = 2;
  if (e.type === 'wisp' && e.fuse > 0) { /* popped before it could blow up */ }
}
function healPlayer(v, show = true) { const s = stats(), before = player.hp; player.hp = Math.min(s.maxHp, player.hp + v); if (run) run.healed = (run.healed || 0) + player.hp - before; if (show && player.hp - before >= 1) popText(player.x, 2.2, player.z, `+${Math.round(player.hp - before)}`, 'heal'); }
function hurtPlayer(dmg, src) {
  if (!run || run.phase === 'dead' || player.invuln > 0 || player.dodge > 0) return;
  const s = stats(); dmg *= s.armor;
  player.hp -= dmg; player.invuln = CFG.invuln; knight.flash = 1; run.taken = (run.taken || 0) + dmg;
  run.hitThisRoom = true; if (run.vow === 'unscathed') breakVow();
  if (src && s.thorns && !src.isBoss) hitEnemy(src, dmg * s.thorns, { dot: true }); else if (src && s.thorns) hitEnemy(src, dmg * s.thorns * 0.5, { dot: true });
  if (run.relics.vengeance) player.vengeance = true;
  popText(player.x, 2.4, player.z, `-${Math.round(dmg)}`, 'hurt'); playSfx('hurt', 0.9); shake(0.35);
  $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 180);
  if (player.hp <= 0) {
    if (run.second) { run.second = false; player.hp = 1; player.invuln = 1.5; toast(t('revived')); playSfx('heal', 0.8); return; }
    if (run.phoenix) { run.phoenix = false; delete run.relics.phoenix; dirtyStats(); player.hp = stats().maxHp * 0.4; player.invuln = 2; banner(t('revived'), '', 1500); playSfx('heal', 1); burst(player.x, 1, player.z, 0xffb05a, 40, 6, SH.SPARK); for (const e of allTargets()) if (Math.hypot(e.x - player.x, e.z - player.z) < 4) hitEnemy(e, stats().dmg * 3, { from: [player.x, player.z] }); updateHud(true); return; }
    player.hp = 0; run.phase = 'dead'; dissolve(player.x, player.z, 2, 0xff8a3d); knight.root.visible = false;
    after(1.3, () => { knight.root.visible = true; endRun(false); });
  }
}
function tryDodge(m) {
  if (!dodgeQueued) return; dodgeQueued = false;
  if (player.dodgeCd > 0 || player.dodge > 0 || run.phase === 'dead') return;
  let dx = m.x, dz = m.y; if (!dx && !dz) { dx = Math.cos(player.face); dz = Math.sin(player.face); }
  const l = Math.hypot(dx, dz) || 1; player.dodgeDir = [dx / l, dz / l]; player.dodge = CFG.dodge.time; player.dodgeCd = stats().dodgeCd; knight.roll = CFG.dodge.time;
  run.dodgedThisRoom = true; if (run.vow === 'standfast') breakVow();
  player.shadowHit.clear(); playSfx('roll', 0.9); doneTip('dodge');
  for (let i = 0; i < 8 * fxBudget(); i++) fx.spawn(player.x, 0.2, player.z, rand(-1, 1), rand(0.2, 0.8), rand(-1, 1), 0.6, 0.4, 1, 0x4a4458, 0.5, SH.SMOKE);
}
function stepPlayer(dt) {
  const s = stats(), m = moveInput();
  tryDodge(m);
  player.invuln = Math.max(0, player.invuln - dt); player.dodgeCd = Math.max(0, player.dodgeCd - dt); player.haste = Math.max(0, player.haste - dt);
  let vx, vz;
  if (player.dodge > 0) {
    player.dodge -= dt; vx = player.dodgeDir[0] * CFG.dodge.speed; vz = player.dodgeDir[1] * CFG.dodge.speed;
    if (run.relics.shadow) for (const e of allTargets()) if (!player.shadowHit.has(e) && Math.hypot(e.x - player.x, e.z - player.z) < e.r + 0.8) { player.shadowHit.add(e); e.burn = 3; e.burnDmg = s.dmg * 0.35; hitEnemy(e, s.dmg * 0.6, { dot: true }); }
  } else {
    const sp = s.speed * (player.haste > 0 ? 1.3 : 1); vx = m.x * sp; vz = m.y * sp;
    if (m.x || m.y) { const want = Math.atan2(m.y, m.x); if (player.atkCd < stats().weapon.cd * 0.5) player.face = want; doneTip('move'); }
  }
  player.vx = vx; player.vz = vz; player.x += vx * dt; player.z += vz * dt;
  const r = Math.hypot(player.x, player.z), lim = CFG.roomR - CFG.playerR;
  if (r > lim) {
    const inDoor = run.phase === 'door' && Math.abs(player.x) < 1.2 && player.z < 0;
    if (inDoor) { if (player.z < -CFG.roomR - 0.2) { nextFloor(); return; } }
    else { player.x *= lim / r; player.z *= lim / r; }
  }
  if (god() === 'solenne' && player.hp < s.maxHp) player.hp = Math.min(s.maxHp, player.hp + s.maxHp * CFG.solenne * dt);
  if (run.relics.nova) { player.novaT -= dt; if (player.novaT <= 0) { player.novaT = 6 - (run.relics.nova - 1) * 1.5; holyNova(); } }
  playerAttack(dt);
  // embers: fly to the knight when close
  for (let i = embers.length - 1; i >= 0; i--) {
    const em = embers[i]; em.t += dt;
    if (em.y > 0.25 || em.vy > 0) { em.vy -= 12 * dt; em.x += em.vx * dt; em.z += em.vz * dt; em.y = Math.max(0.25, em.y + em.vy * dt); if (em.y <= 0.25) { em.vy = 0; em.vx *= 0.3; em.vz *= 0.3; } }
    const d = Math.hypot(em.x - player.x, em.z - player.z);
    if (em.t > 0.35 && (d < s.magnet || run.phase !== 'fight')) { const k = Math.min(1, dt * (run.phase !== 'fight' ? 7 : 10)); em.x = lerp(em.x, player.x, k); em.z = lerp(em.z, player.z, k); em.y = lerp(em.y, 1, k); }
    if (d < 0.6 && em.t > 0.35) { embers.splice(i, 1); run.embers += CFG.emberValue; run.roomEmbers = (run.roomEmbers || 0) + 1; playSfx('ember', 0.6, 0.9 + Math.random() * 0.4); glow.spawn(player.x, 1.2, player.z, 0, 1, 0, 0.4, 0.4, 0.05, 0xffb05a, 1, SH.SPARK); }
  }
}
const god = () => run?.god;
function holyNova() {
  const s = stats(), R = 3.2; shockwave(player.x, player.z, R, '#fff2c0', 0.5); playSfx('heal', 0.5);
  for (const e of allTargets()) if (Math.hypot(e.x - player.x, e.z - player.z) < R + e.r) { hitEnemy(e, s.dmg * 1.5, { from: [player.x, player.z] }); if (run.relics.firebrand) { e.burn = 3; e.burnDmg = s.dmg * 0.3; } }
}
const flailBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#8a90a8', metalness: 0.6, roughness: 0.4, flatShading: true, emissive: '#ff7a2a', emissiveIntensity: 0.25 })); flailBall.visible = false; flailBall.castShadow = true; scene.add(flailBall);
const flailChain = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1), new THREE.MeshBasicMaterial({ color: '#5a5a6a' })); flailChain.visible = false; scene.add(flailChain);

// ================================================================ ENEMIES (move, wind up, strike; everything that hurts is telegraphed)
function stepEnemies(dt) {
  const px = player.x, pz = player.z;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dying > 0) { e.dying -= dt; animateEnemy(e, dt); if (e.dying <= 0) { scene.remove(e.view.root); enemies.splice(i, 1); } continue; }
    if (e.spawnT > 0) { e.spawnT -= dt; animateEnemy(e, dt); continue; }
    if (e.burn > 0) { e.burn -= dt; e.burnTick = (e.burnTick || 0) - dt; if (e.burnTick <= 0) { e.burnTick = 0.5; hitEnemy(e, e.burnDmg * 0.5, { dot: true }); if (e.dying) continue; } }
    e.slow = Math.max(0, e.slow - dt);
    const d = ENEMIES[e.type], dx = px - e.x, dz = pz - e.z, dist = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), slowK = e.slow > 0 ? 0.65 : 1;
    let mx = 0, mz = 0;
    if (e.stun > 0) { e.stun -= dt; e.wind = 0; }
    else if (e.charge > 0) { // brute charge
      e.charge -= dt; mx = Math.cos(e.chargeDir) * 13; mz = Math.sin(e.chargeDir) * 13;
      if (Math.hypot(px - e.x, pz - e.z) < e.r + CFG.playerR + 0.2 && !e.chargeHit) { e.chargeHit = true; hurtPlayer(e.dmg * 1.2, e); }
      if (Math.random() < dt * 30) fx.spawn(e.x, 0.2, e.z, rand(-1, 1), 0.5, rand(-1, 1), 0.5, 0.6, 1.2, 0x5a4a40, 0.5, SH.SMOKE);
    } else if (e.wind > 0) { // winding up a blow: stays put, then strikes if the knight is still in reach
      e.wind -= dt;
      if (e.wind <= 0) e.wind = 0; // exactly 0, so the enemy moves and attacks again
      if (e.wind <= 0 && e.windKind === 'melee') { if (inTele(e.tele, px, pz)) hurtPlayer(e.dmg, e); e.cd = rand(0.9, 1.5); playSfx('swing', 0.35, 0.7); }
    } else if (e.type === 'wisp') {
      if (e.fuse > 0) { e.fuse -= dt; if (e.fuse <= 0) { shockwave(e.x, e.z, d.blast, '#9fd8ff', 0.4); burst(e.x, 1, e.z, 0x9fd8ff, 24, 5); playSfx('boom', 0.5); e.hp = 0; killEnemy(e); continue; } }
      else { mx = Math.cos(ang) * e.sp * slowK; mz = Math.sin(ang) * e.sp * slowK; if (dist < 1.8) { e.fuse = d.fuse; e.tele = telegraph({ shape: 'circle', x: e.x, z: e.z, r: d.blast, dur: d.fuse, dmg: e.dmg, src: e }); } }
    } else if (e.type === 'imp') {
      const want = dist < 5.5 ? -1 : dist > 8 ? 1 : 0, side = Math.sin(uTime.value * 0.7 + i) * 0.6;
      mx = (Math.cos(ang) * want - Math.sin(ang) * side) * e.sp * slowK; mz = (Math.sin(ang) * want + Math.cos(ang) * side) * e.sp * slowK;
      e.cd -= dt;
      if (e.cd <= 0 && dist < 12) { e.cd = rand(1.9, 2.7); const a0 = ang; e.wind = 0.6; e.windMax = 0.6; e.windKind = 'shot'; e.tele = telegraph({ shape: 'line', x: e.x, z: e.z, ang: a0, len: Math.min(14, dist + 3), w: 0.6, dur: 0.6, onHit: () => { if (!e.dying) shoot(e.x, e.z, a0, 10.5, e.dmg); } }); e.tele.follow = null; }
    } else {
      e.cd -= dt;
      if (e.type === 'brute') { e.chargeCd -= dt; if (e.chargeCd <= 0 && dist > 3.5 && dist < 10) { e.chargeCd = rand(4.5, 6); const a0 = ang; e.wind = 0.9; e.windMax = 0.9; e.windKind = 'charge'; e.chargeHit = false; e.tele = telegraph({ shape: 'line', x: e.x, z: e.z, ang: a0, len: 7.5, w: 1.6, dur: 0.9, onHit: () => { if (!e.dying && !e.stun) { e.charge = 0.55; e.chargeDir = a0; } } }); } }
      if (!e.wind && dist < (d.reach || 1.2) + e.r + 0.15 && e.cd <= 0) { // start a telegraphed blow
        e.wind = d.wind; e.windMax = d.wind; e.face = ang; e.windKind = 'melee';
        e.tele = telegraph({ shape: 'cone', x: e.x, z: e.z, ang, r: (d.reach || 1.2) + e.r + 0.4, arc: 1.7, dur: d.wind });
      } else if (!e.wind) { mx = Math.cos(ang) * e.sp * slowK; mz = Math.sin(ang) * e.sp * slowK; }
    }
    // keep a little space from each other
    for (const o of enemies) { if (o === e || o.dying) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = e.r + o.r; if (od < min && od > 0.001) { mx += (ox / od) * 2.5; mz += (oz / od) * 2.5; } }
    e.vx += (mx - e.vx) * Math.min(1, dt * 8); e.vz += (mz - e.vz) * Math.min(1, dt * 8);
    if (e.wind > 0 && e.type !== 'imp') { e.vx *= 0.8; e.vz *= 0.8; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    const r = Math.hypot(e.x, e.z), lim = CFG.roomR - e.r; if (r > lim) { e.x *= lim / r; e.z *= lim / r; }
    e.moving = Math.hypot(e.vx, e.vz) > 0.4; if (e.wind <= 0 && e.charge <= 0) e.face = -Math.atan2(e.vz || dz, e.vx || dx) + Math.PI / 2; else e.face = -(e.charge > 0 ? e.chargeDir : ang) + Math.PI / 2;
    animateEnemy(e, dt);
  }
  if (run.phase === 'fight' && !boss && enemies.length === 0) { if (run.wave < run.waves) spawnWave(); else roomCleared(); }
}

// ================================================================ BOSSES (three, each a timeline of telegraphed attacks)
function spawnBoss(type) {
  const hp = BOSS_HP[type] * Math.max(1, floorScale(run.floor) / floorScale({ warden: 5, lich: 10, king: 15 }[type]));
  boss = { type, isBoss: true, x: 0, z: -3, vx: 0, vz: 0, hp, maxHp: hp, r: type === 'lich' ? 1 : 1.3, t: 2, phase: 1, dying: 0, face: 0, view: buildBossView(type), dmg: 18 * (1 + CFG.dmgScale * (run.floor - 1)), stun: 0, slow: 0, burn: 0, burnDmg: 0, attack: null };
  boss.view.root.position.set(boss.x, 0, boss.z);
  $('bossName').textContent = t('boss_' + type); $('bossBar').hidden = false; updateBossBar();
  playSfx('bell', 0.9); playSfx('horn', 0.7); shake(0.4); playMusic('boss');
  banner(t('boss_' + type), floorLabel(run.floor), 2600);
}
function updateBossBar() { if (boss) $('bossFill').style.width = `${Math.max(0, (100 * boss.hp) / boss.maxHp)}%`; }
function bossDefeated() {
  if (boss.dying) return; boss.dying = 1.6; run.kills++; happytime();
  playSfx('roar', 0.8); playSfx('victory', 0.6); shake(0.6); clearTeles(); clearProjs();
  banner(t('bossDown', { b: t('boss_' + boss.type) }), '', 2600);
  const bx = boss.x, bz = boss.z; for (let i = 0; i < 4; i++) after(i * 0.25, () => dissolve(bx + rand(-1, 1), bz + rand(-1, 1), 4, 0xffb05a));
  dropEmbers(boss.x, boss.z, Math.round(60 * stats().emberMult));
  for (const e of enemies) if (!e.dying) { e.hp = 0; killEnemy(e); }
}
function stepBoss(dt) {
  if (!boss) return;
  const b = boss, v = b.view;
  if (b.dying > 0) { b.dying -= dt; v.root.scale.setScalar(Math.max(0.01, b.dying / 1.6)); v.root.rotation.y += dt * 3; if (b.dying <= 0) { scene.remove(v.root); boss = null; $('bossBar').hidden = true; } return; } // the room clears once the last minion is gone
  if (b.burn > 0) { b.burn -= dt; b.burnTick = (b.burnTick || 0) - dt; if (b.burnTick <= 0) { b.burnTick = 0.5; hitEnemy(b, b.burnDmg * 0.5, { dot: true }); } }
  const px = player.x, pz = player.z, ang = Math.atan2(pz - b.z, px - b.x), dist = Math.hypot(px - b.x, pz - b.z);
  if (b.phase === 1 && b.hp < b.maxHp * 0.5) { b.phase = 2; banner(t('boss_' + b.type), '!', 1200); playSfx('roar', 0.7); shake(0.4); }
  const fast = b.phase === 2 ? 0.75 : 1;
  b.t -= dt;
  const tele = (o) => telegraph({ dmg: b.dmg, src: b, ...o });
  if (b.t <= 0) {
    const r = Math.random();
    if (b.type === 'warden') {
      if (r < 0.4) { tele({ shape: 'ring', x: b.x, z: b.z, r: 5.5, r2: 2.2, dur: 1.1 * fast, onHit: () => { shockwave(b.x, b.z, 5.5, '#ffd2a0', 0.5); playSfx('bell', 0.6); shake(0.35); } }); b.t = 2.3 * fast; v.swingT = 1.1; }
      else if (r < 0.75) { for (let k = 0; k < (b.phase === 2 ? 5 : 3); k++) { const a = rand(0, 6.3), d = rand(0, 2.5), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d; after(k * 0.22, () => { if (boss === b) tele({ shape: 'circle', x, z, r: 1.6, dur: 1.0, onHit: () => { shockwave(x, z, 1.6, '#ffb05a', 0.4); burst(x, 0.3, z, 0x9a8a7a, 12, 4, SH.CHIP); playSfx('slam', 0.4); } }); }); } b.t = 2.6 * fast; }
      else { for (let k = 0; k < (b.phase === 2 ? 3 : 2); k++) { const a = rand(0, 6.3); spawnEnemy('skeleton', b.x + Math.cos(a) * 3, b.z + Math.sin(a) * 3); } b.t = 2.4 * fast; playSfx('bell', 0.4); }
      if (dist > 2.6) { b.vx = Math.cos(ang) * 1.6; b.vz = Math.sin(ang) * 1.6; }
    } else if (b.type === 'lich') {
      if (r < 0.4) { const n = b.phase === 2 ? 14 : 10, off = rand(0, 6.3); tele({ shape: 'circle', x: b.x, z: b.z, r: 1.6, dur: 0.6, onHit: () => { for (let k = 0; k < n; k++) shoot(b.x, b.z, off + (k / n) * Math.PI * 2, 6.5, b.dmg * 0.6, '#9fa8ff', 0.32, 5); playSfx('shock', 0.5); } }); b.t = 2.2 * fast; }
      else if (r < 0.7) { const a = rand(0, 6.3), d = rand(4, 7); const nx = Math.cos(a) * d, nz = Math.sin(a) * d; burst(b.x, 2, b.z, 0x9fa8ff, 20, 4); b.x = nx; b.z = nz; burst(b.x, 2, b.z, 0x9fa8ff, 20, 4); playSfx('dash', 0.6); b.t = 1.0; }
      else { for (let k = 0; k < (b.phase === 2 ? 3 : 2); k++) { const a = rand(0, 6.3); spawnEnemy('wisp', b.x + Math.cos(a) * 2.5, b.z + Math.sin(a) * 2.5); } b.t = 2.5 * fast; }
      b.vx = -Math.sin(uTime.value * 0.5) * 1.2; b.vz = Math.cos(uTime.value * 0.5) * 1.2;
    } else {
      if (r < 0.35) { tele({ shape: 'cone', x: b.x, z: b.z, ang, r: 6.5, arc: 1.9, dur: 0.95 * fast, onHit: () => { swingTrail(b.x, b.z, -ang, 6.5, 1.9, 0xff7a2a); playSfx('slam', 0.6); shake(0.4); } }); b.t = 2.0 * fast; v.swingT = 0.95; }
      else if (r < 0.7) { for (let k = 0; k < (b.phase === 2 ? 7 : 4); k++) { const x = clamp(px + rand(-4, 4), -9, 9), z = clamp(pz + rand(-4, 4), -9, 9); after(k * 0.16, () => { if (boss === b) tele({ shape: 'circle', x, z, r: 1.3, dur: 0.9, onHit: () => { burst(x, 0.3, z, 0xff7a2a, 16, 5); for (let q = 0; q < 6; q++) glow.spawn(x, 0.2, z, rand(-0.3, 0.3), rand(4, 7), rand(-0.3, 0.3), 0.8, 0.6, 0.1, 0xff5a1a, 1, SH.DOT); playSfx('fire', 0.4); } }); }); } b.t = 2.4 * fast; }
      else { const n = b.phase === 2 ? 7 : 5; for (let k = 0; k < n; k++) shoot(b.x, b.z, ang + (k - (n - 1) / 2) * 0.22, 8, b.dmg * 0.6, '#ff7a2a', 0.3); b.t = 1.8 * fast; playSfx('fire', 0.5); }
      if (dist > 3) { b.vx = Math.cos(ang) * 2.2 * (b.phase === 2 ? 1.3 : 1); b.vz = Math.sin(ang) * 2.2 * (b.phase === 2 ? 1.3 : 1); }
    }
  }
  b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= 0.96; b.vz *= 0.96;
  const rr = Math.hypot(b.x, b.z), lim = CFG.roomR - b.r - 0.5; if (rr > lim) { b.x *= lim / rr; b.z *= lim / rr; }
  if (dist < b.r + CFG.playerR) { const a = ang; player.x = b.x + Math.cos(a) * (b.r + CFG.playerR); player.z = b.z + Math.sin(a) * (b.r + CFG.playerR); }
  v.ph += dt; v.root.position.set(b.x, (v.float || 0) + Math.sin(v.ph * 1.5) * (v.float ? 0.2 : 0.03), b.z); v.root.rotation.y = -ang + Math.PI / 2;
  if (v.limbs[0]) { v.swingT = Math.max(0, (v.swingT || 0) - dt); v.limbs[0].rotation.x = v.swingT > 0 ? -2.2 + (1 - v.swingT) * 0.5 : Math.sin(v.ph * 2) * 0.15; if (v.bell) v.bell.rotation.z = Math.sin(v.ph * 3) * 0.3; }
  if (v.orb) { v.orb.position.y = 2.8 + Math.sin(v.ph * 2) * 0.2; if (Math.random() < dt * 20) glow.spawn(b.x + rand(-1, 1), rand(0.5, 3.5), b.z + rand(-1, 1), 0, 0.5, 0, 1, 0.35, 0.05, 0x9fa8ff, 0.8, SH.DOT); }
  if (b.type === 'king' && Math.random() < dt * 25) glow.spawn(b.x + rand(-0.8, 0.8), rand(1, 4.2), b.z + rand(-0.8, 0.8), 0, 1.5, 0, 0.8, 0.4, 0.05, 0xff7a2a, 0.9, SH.DOT);
  v.flash = Math.max(0, (v.flash || 0) - dt * 7); v.mat.emissive.setRGB(v.flash * 1.2, v.flash * 0.9, v.flash * 0.8);
  updateBossBar();
}

// ================================================================ ONBOARDING (first climb teaches by doing; one-off tips later; all skippable)
const coach = { id: null, t: 0 };
const FIRST_TIPS = ['move', 'attack', 'dodge'];
function nextTip() { if (NO_TIPS || save.tips.off) return; for (const id of FIRST_TIPS) if (!save.tips[id]) { showTip(id); return; } }
function showTip(id) { if (NO_TIPS || save.tips.off || save.tips[id]) return; coach.id = id; coach.t = 0; renderTip(); if (state === State.PLAYING) { $('coach').hidden = false; playSfx('tip', 0.6); } }
function maybeTip(id) { if (!coach.id && FIRST_TIPS.every((f) => save.tips[f])) showTip(id); }
function renderTip() {
  const id = coach.id; if (!id) return;
  $('coachText').textContent = id === 'move' && isTouch ? t('tip_moveTouch') : t('tip_' + id);
  let k = '';
  if (id === 'move' && !isTouch) k = ['W', 'A', 'S', 'D'].map(keyHTML).join('') + '<span class="or">/</span>' + ['←', '↑', '↓', '→'].map(keyHTML).join('');
  if (id === 'dodge') k = isTouch ? svgIcon('feather', 'tip-ico') : keyHTML('Space');
  if (id === 'attack') k = svgIcon('sword', 'tip-ico');
  if (id === 'door') k = svgIcon('vow', 'tip-ico');
  $('coachKeys').innerHTML = k;
}
function doneTip(id) {
  if (save.tips[id]) return; save.tips[id] = 1;
  if (coach.id !== id) return;
  coach.id = null; $('coach').hidden = true; $('hand').hidden = true; playSfx('tip', 0.7);
  setTimeout(() => { if (!coach.id && state === State.PLAYING) nextTip(); }, 700);
}
function updateCoach(dt) {
  if (state !== State.PLAYING || !run) return;
  coach.t += dt;
  if (coach.id === 'attack' && run.kills >= 2) doneTip('attack');
  if (coach.id === 'dodge' && coach.t > 18) doneTip('dodge'); // never blocks
  if (!coach.id && !save.tips.dodge && save.tips.attack && teles.length) showTip('dodge');
  if (coach.id === 'door' && run.phase !== 'door') doneTip('door');
  const hand = $('hand'); let hp = null;
  if (coach.id === 'move' && isTouch) { const u = (coach.t % 2) / 2; hp = [innerWidth * (0.4 + 0.15 * Math.sin(u * Math.PI * 2)), innerHeight * 0.65]; }
  if (coach.id === 'dodge' && isTouch) { const r = $('btnDodge').getBoundingClientRect(); hp = [r.left + r.width / 2, r.top + r.height * 0.2]; }
  hand.hidden = !hp; if (hp) { hand.style.left = `${hp[0]}px`; hand.style.top = `${hp[1]}px`; }
  const arrow = $('arrow');
  if (run.phase === 'door') { const s = toScreen(0, 2.5, -CFG.roomR); arrow.hidden = false; arrow.style.left = `${clamp(s.x, 40, innerWidth - 40)}px`; arrow.style.top = `${clamp(s.y, 90, innerHeight - 60)}px`; arrow.style.transform = 'rotate(180deg)'; }
  else arrow.hidden = true;
}

// ================================================================ BOT (trailer footage + balance tests)
function botMove() {
  if (!run || run.phase === 'dead') return { x: 0, y: 0 };
  if (run.phase === 'door') return { x: -player.x * 2, y: -CFG.roomR - 3 - player.z };
  if (run.phase === 'clear') return { x: 0, y: 0 };
  let x = 0, y = 0, dodge = false;
  for (const tl of teles) { // step out of anything about to land
    if ((!tl.dmg && tl.shape !== 'cone' && !tl.onHit) || !tl.seen || tl.t < 0.2) continue; // a person reacts a moment late, and misses some
    if (inTele(tl, player.x, player.z, 0.6)) {
      const ax = player.x - tl.x, az = player.z - tl.z, l = Math.hypot(ax, az) || 1;
      if (tl.shape === 'line' || tl.shape === 'cone') { x += -Math.sin(tl.ang) * 3; y += Math.cos(tl.ang) * 3; } else if (tl.shape === 'ring') { x += -ax / l * 3; y += -az / l * 3; } else { x += ax / l * 3; y += az / l * 3; }
      if (tl.t > tl.dur * 0.55 && player.dodgeCd <= 0 && run.vow !== 'standfast') dodge = true;
    }
  }
  for (const p of projs) { const dx = player.x - p.x, dz = player.z - p.z; if (Math.hypot(dx, dz) < 2.2 && (dx * p.vx + dz * p.vz) > 0 && (p.seen ??= Math.random() < BOT_SKILL)) { x += -p.vz; y += p.vx; } }
  const s = stats(), tgt = nearestEnemy(player.x, player.z, 99);
  if (tgt) {
    const dx = tgt.x - player.x, dz = tgt.z - player.z, d = Math.hypot(dx, dz), want = s.weapon.orbit ? s.range * 0.9 : Math.max(1.1, s.range * 0.7) + tgt.r;
    const k = d > want ? 1 : d < want - 0.6 ? -0.8 : 0; x += (dx / d) * k * 1.2; y += (dz / d) * k * 1.2;
    x += -dz / d * 0.35; y += dx / d * 0.35; // circle a little
  }
  const r = Math.hypot(player.x, player.z); if (r > CFG.roomR - 1.5) { x -= player.x / r; y -= player.z / r; }
  if (player.hp < stats().maxHp * 0.35 && tgt && tgt.wind > 0 && !s.weapon.orbit) { x = -(tgt.x - player.x); y = -(tgt.z - player.z); } // back off from a blow, then fight on
  return { x, y, dodge };
}
function botCamp() { // cheapest camp upgrade first, weapons once Might is up
  for (;;) {
    const opts = Object.entries(META).filter(([id, m]) => metaLv(id) < m.max).map(([id, m]) => [m.cost(metaLv(id)), () => { save.meta[id] = metaLv(id) + 1; }]);
    for (const [id, w] of Object.entries(WEAPONS)) if (!save.weapons[id]) opts.push([w.cost * 1.5, () => { save.weapons[id] = 1; }]);
    opts.sort((a, b) => a[0] - b[0]); const c = opts[0]; if (!c || save.embers < Math.round(c[0])) break;
    save.embers -= Math.round(c[0]); c[1]();
  }
}
function botPick(cards, opts) {
  if (!cards.length) return null;
  if (cards[0].id in GODS) return cards.find((c) => c.id === 'morrow') || cards[0];
  if (cards[0].id in VOWS) { const pref = ['swift', 'darkness', 'standfast', 'unscathed']; for (const p of pref) { const c = cards.find((q) => q.id === p); if (c) return c; } return null; }
  const pref = ['edge', 'grip', 'heart', 'thirst', 'firebrand', 'nova', 'crit', 'bulwark', 'chain', 'reach', 'echo', 'execute', 'greaves', 'phoenix', 'thorns', 'frost', 'haste', 'magnet', 'vengeance', 'shadow', 'glass'];
  return [...cards].sort((a, b) => pref.indexOf(a.id) - pref.indexOf(b.id))[0];
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, camSnap = true, hudT = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function step(dt) {
  if (state !== State.PLAYING || !run) return;
  run.time += dt; if (run.phase === 'fight') run.roomT += dt;
  for (const tm of run.timers.splice(0)) { tm.t -= dt; if (tm.t <= 0) tm.fn(); else run.timers.push(tm); }
  if (!run || state !== State.PLAYING) return;
  if (run.phase === 'fight' && run.vow === 'swift' && !run.vowBroken && run.roomT > swiftTime(run.floor)) breakVow();
  if (run.phase !== 'dead') stepPlayer(dt);
  if (!run || state !== State.PLAYING) return;
  stepEnemies(dt); stepBoss(dt); updateTeles(dt); updateProjs(dt);
}
function advance(dt) {
  if (state === State.PLAYING) { acc += dt; let n = 0; while (acc >= STEP && n < 10) { step(STEP); acc -= STEP; n++; } if (n === 10) acc = 0; }
  else acc = 0;
  animate(dt);
}
function animate(dt) {
  uTime.value += dt;
  const moving = Math.hypot(player.vx, player.vz) > 0.5;
  if (knight) {
    knight.root.position.set(player.x, 0, player.z);
    const want = -player.face + Math.PI / 2; knight.root.rotation.y += wrapA(want - knight.root.rotation.y) * Math.min(1, dt * 14);
    animateKnight(knight, dt, moving && state === State.PLAYING, Math.hypot(player.vx, player.vz) / CFG.speed);
    if (player.invuln > 0 && player.dodge <= 0) knight.body.visible = Math.floor(uTime.value * 20) % 2 === 0; else knight.body.visible = true;
  }
  if (state !== State.PLAYING) { for (const e of enemies) animateEnemy(e, dt * 0.3); }
  updateRoom(dt); updateTrails(dt); updateShock(dt);
  fx.update(dt); glow.update(dt);
  let n = 0;
  for (const em of embers) { em.ph += dt * 4; _p.set(em.x, em.y + Math.sin(em.ph) * 0.06, em.z); _q.setFromEuler(_e.set(0, em.ph, 0.4)); _s.setScalar(1); _m.compose(_p, _q, _s); emberMesh.setMatrixAt(n++, _m); }
  emberMesh.count = n; emberMesh.instanceMatrix.needsUpdate = true;
  // the knight's light: a warm circle; darkness vow shrinks it and dims the room
  const dark = run?.vow === 'darkness' && run.phase === 'fight';
  torch.position.set(player.x, 2.4, player.z + 0.5); torch.distance += ((dark ? 5.5 : 12) - torch.distance) * Math.min(1, dt * 2); torch.intensity = (dark ? 18 : 26) + Math.sin(uTime.value * 9) * 1.5;
  hemi.intensity += ((dark ? 0.12 : 0.75) - hemi.intensity) * Math.min(1, dt * 2); moon.intensity += ((dark ? 0.15 : 1.15) - moon.intensity) * Math.min(1, dt * 2);
  if ((hudT += dt) > 0.1 && run) { hudT = 0; updateHud(); }
  updateCoach(dt);
}
function updateHud(force) {
  if (!run) return;
  const s = stats();
  $('hpFill').style.width = `${Math.max(0, (100 * player.hp) / s.maxHp)}%`; $('hpText').textContent = `${Math.max(0, Math.ceil(player.hp))} / ${Math.round(s.maxHp)}`;
  $('emberText').textContent = Math.floor(run.embers);
  $('floorText').textContent = floorLabel(run.floor); $('actText').textContent = t('acts')[actOf(run.floor)];
  if (run.vow) { $('vowChip').hidden = false; $('vowChip').classList.toggle('broken', run.vowBroken);
    $('vowText').textContent = `${t('vow_' + run.vow)}${run.vow === 'swift' && !run.vowBroken && run.phase === 'fight' ? ` · ${Math.max(0, Math.ceil(swiftTime(run.floor) - run.roomT))}s` : ''}`; } else $('vowChip').hidden = true;
  if (force) $('relicRow').innerHTML = Object.entries(run.relics).map(([id, n2]) => `<span title="${t('rel_' + id)}">${svgIcon(RELICS[id].icon)}${n2 > 1 ? `<i>${n2}</i>` : ''}</span>`).join('');
  if (isTouch) $('dodgeCd').style.height = `${(100 * player.dodgeCd) / s.dodgeCd}%`;
}
const _v = new THREE.Vector3();
function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight }; }
function popText(x, y, z, text, cls) {
  if (state === State.COVER || $('pops').childElementCount > 14) return;
  const s = toScreen(x, y, z), el = document.createElement('div'); el.textContent = text; if (cls) el.className = cls;
  el.style.left = `${s.x + rand(-10, 10)}px`; el.style.top = `${s.y}px`; $('pops').appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: 0.15 }, { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () => el.remove();
}
function shake(a) { const k = save.shake === 'off' ? 0 : save.shake === 'low' ? 0.4 : 1; shakeAmt = Math.max(shakeAmt, a * k); }
function updateCamera(dt) {
  const portrait = innerHeight > innerWidth, zoom = portrait ? 1.6 : 1, inMenu = state === State.MENU || state === State.CAMP || (state === State.SETTINGS && back === State.MENU);
  const tx = inMenu && !portrait ? player.x - 3.2 : player.x, tz = player.z + (inMenu ? 0 : 0.6);
  const k = camSnap ? 1 : 1 - Math.exp(-dt * 5); camSnap = false;
  camLook.x += (tx - camLook.x) * k; camLook.z += (tz - camLook.z) * k; camLook.y = 0;
  const dist = inMenu ? 0.7 : 1;
  camPos.set(camLook.x, 12 * zoom * dist, camLook.z + 8.4 * zoom * dist);
  shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
  camera.position.copy(camPos); camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(camLook.x, inMenu ? 1 : 0, camLook.z);
  moon.position.set(camLook.x - 8, 18, camLook.z + 6); moon.target.position.copy(camLook);
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
function menuScene() { // the camp's menu backdrop: the knight resting in the cathedral, embers drifting, a few skeletons idling in the dark
  buildRoom(0); player.x = 0; player.z = 2; player.face = Math.PI / 2 + 0.4; camSnap = true;
}

// ================================================================ COVER (tools/game_covers.py: honest key art rendered from the game itself)
function stageCover(kind) {
  state = State.COVER; document.body.classList.add('cover');
  for (const id of ['menu', 'camp', 'pick', 'over', 'paused', 'settings', 'hud', 'banner', 'coach', 'hand', 'arrow', 'toast', 'dodge', 'joystick', 'bossBar']) $(id).hidden = true;
  clearField();
  run = { floor: 6, weapon: 'sword', god: 'morrow', relics: { firebrand: 1 }, embers: 0, kills: 0, vow: 'unscathed', vowBroken: false, phase: 'fight', time: 0, roomT: 0 };
  dirtyStats(); buildRoom(0); setKnightWeapon(knight, 'sword');
  player.x = 0.4; player.z = 1.2; player.face = -0.35; knight.swing = 0.09; knight.swingDir = 1;
  const foes = [['skeleton', 2.8, 0.2], ['skeleton', 2.2, -1.9], ['ghoul', -2.4, -0.6], ['skeleton', -1.4, 2.8], ['wisp', 0.6, -3.4], ['brute', -3.6, -3.4], ['skeleton', 4.2, 2.4]];
  for (const [type, x, z] of foes) { const e = spawnEnemy(type, x, z); e.spawnT = 0; e.face = -Math.atan2(player.z - z, player.x - x) + Math.PI / 2; e.moving = true; }
  enemies[0].view.flash = 1; enemies[1].view.flash = 0.6;
  fx.clear(); glow.clear();
  for (let i = 0; i < 40; i++) { updateRoom(1 / 30); for (const e of enemies) animateEnemy(e, 1 / 30); glow.update(1 / 30); fx.update(1 / 30); }
  swingTrail(player.x, player.z, -player.face, 2.6, 2.5, 0xffe2b0); trails[trails.length - 1].t = 0.16;
  dissolve(enemies[0].x, enemies[0].z, 1.6, 0xffa04a); burst(enemies[1].x, 1, enemies[1].z, 0xffd27a, 16, 3, SH.SPARK);
  dropEmbers(enemies[0].x, enemies[0].z, 8);
  for (let i = 0; i < 8; i++) { glow.update(1 / 30); fx.update(1 / 30); }
  for (const em of embers) { em.y = rand(0.3, 1.4); em.vy = 0; }
  telegraph({ shape: 'cone', x: -1.4, z: 2.8, ang: Math.atan2(player.z - 2.8, player.x + 1.4), r: 2, arc: 1.7, dur: 1 }).t = 0.6; updateTeles(0);
  room.sigil.material.opacity = 0.8;
  knight.root.position.set(player.x, 0, player.z); knight.root.rotation.y = -player.face + Math.PI / 2; animateKnight(knight, 1 / 30, false, 0);
  let n = 0; for (const em of embers) { _p.set(em.x, em.y, em.z); _q.setFromEuler(_e.set(0, em.ph, 0.4)); _s.setScalar(1); _m.compose(_p, _q, _s); emberMesh.setMatrixAt(n++, _m); } emberMesh.count = n; emberMesh.instanceMatrix.needsUpdate = true;
  torch.position.set(player.x, 2.4, player.z + 0.5); torch.distance = 12; torch.intensity = 30;
  const cam = { landscape: [1.2, 6.2, 8.6, 0, 1.0, -0.4], portrait: [0.5, 8.5, 11.5, 0, 0.6, -0.2], square: [0.9, 7.2, 9.8, 0, 0.8, -0.3], keyart: [1.2, 6.2, 8.6, 0, 1.0, -0.4] }[kind] || [1.2, 6.2, 8.6, 0, 1.0, -0.4];
  camera.position.set(player.x + cam[0], cam[1], player.z + cam[2]); camera.lookAt(player.x + cam[3], cam[4], player.z + cam[5]);
  moon.position.set(player.x - 8, 18, player.z + 6); moon.target.position.set(player.x, 0, player.z);
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
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 12000))]);
  knight = buildKnight(save.weapon); scene.add(knight.root);
  resize(); applyGfx(); menuScene();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  audio.wantMusic = true; setState(State.MENU);
  if (CAPTURE) {
    window.__game = {
      start: () => startRun(),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) { if (state === State.PLAYING) step(STEP); else if (state === State.OVER) startRun(); } fx.clear(); glow.clear(); updateTrails(9); updateShock(9); $('banner').hidden = true; $('toast').hidden = true; $('pops').innerHTML = ''; camSnap = true; },
      sim: (sec) => { for (let s = 0; s < sec; s += STEP) { if (state !== State.PLAYING) break; step(STEP); } },
      info: () => ({ state, floor: run?.floor, hp: Math.round(player.hp), maxHp: Math.round(stats().maxHp), time: run?.time, kills: run?.kills, embers: run && Math.floor(run.embers), relics: run && { ...run.relics }, vowsKept: run?.vowsKept, boss: boss?.type, bossHp: boss && Math.round(boss.hp), enemies: enemies.length, phase: run?.phase, best: save.best, bank: Math.floor(save.embers), taken: run && Math.round(run.taken || 0), healed: run && Math.round(run.healed || 0), meta: { ...save.meta } }),
      cover: (kind) => stageCover(kind),
      setSave: (o) => { Object.assign(save, o); dirtyStats(); },
      dbg: () => ({ phase: run?.phase, wave: run?.wave, waves: run?.waves, timers: run?.timers.length, teles: teles.length, boss: !!boss, player: [+player.x.toFixed(1), +player.z.toFixed(1)], enemies: enemies.map((e) => [e.type, +e.x.toFixed(1), +e.z.toFixed(1), Math.round(e.hp), e.dying > 0 ? 'dying' : '', e.spawnT > 0 ? 'spawn' : '', +e.wind.toFixed(2), e.fuse > 0 ? 'fuse' : '', e.stun > 0 ? 'stun' : '']) }),
    };
    render(0);
    return;
  }
  requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
