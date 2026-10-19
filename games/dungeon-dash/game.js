// Dungeon Dash: a 3D survivor-like. Move; your weapons fire on their own. Collect XP gems, pick upgrade cards on
// level-up, survive endless wolves and golems and the Warden boss for 10 minutes.
// Sections: CONFIG, I18N, SDK, AUDIO, ASSETS, WORLD, HERO, FOES, WEAPONS, GEMS, INPUT, STATE, GAMEPLAY, LOOP, BOOT.
// Static bundle: no API keys, no backend calls. Missing models fall back to primitives.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = 'dungeon-dash';
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot plays by itself (trailer footage, balance tests)

const RUN_TIME = 600, ARENA = 42, MAX_FOES = 70, MAX_GEMS = 450;
const BOSS_TIMES = [300, 540];
const HEROES = {
  warrior: { weapon: 'cleave', hp: 130, speed: 6.0, card: 'class_warrior_card' },
  assassin: { weapon: 'daggers', hp: 95, speed: 7.0, card: 'class_assassin_card' },
  shaman: { weapon: 'orbs', hp: 105, speed: 6.3, card: 'class_shaman_card' },
  sura: { weapon: 'nova', hp: 115, speed: 6.2, card: 'class_sura_card' },
};
const WEAPONS = { // base cooldown (s) and damage; levels 1-5
  cleave: { icon: 'skill_warrior_1', cd: 1.1, dmg: 17 },
  daggers: { icon: 'skill_assassin_1', cd: 0.7, dmg: 10 },
  orbs: { icon: 'skill_shaman_2', cd: 0, dmg: 10 },
  nova: { icon: 'skill_sura_2', cd: 2.2, dmg: 20 },
  lightning: { icon: 'skill_shaman_4', cd: 1.6, dmg: 26 },
};
const PASSIVES = {
  might: { icon: 'skill_warrior_4' }, haste: { icon: 'skill_assassin_3' }, swift: { icon: 'skill_assassin_4' },
  vitality: { icon: 'skill_warrior_2' }, magnet: { icon: 'skill_sura_4' }, regen: { icon: 'skill_shaman_1' },
};
const MAX_LV = 5, MAX_WEAPONS = 4, MAX_PASSIVES = 4;
const FOES = {
  wolf: { model: 'wolf', hp: 11, speed: 3.7, dmg: 5, xp: 1, size: 1, r: 0.55 },
  golem: { model: 'golem', hp: 40, speed: 2.1, dmg: 9, xp: 3, size: 1, r: 0.8 },
  direwolf: { model: 'wolf', hp: 32, speed: 4.6, dmg: 8, xp: 4, size: 1.35, r: 0.7, tint: '#ff3a26' },
  crystal: { model: 'golem', hp: 130, speed: 2.3, dmg: 13, xp: 10, size: 1.3, r: 1.0, tint: '#2aa8ff' },
  boss: { model: 'golem', hp: 2600, speed: 2.5, dmg: 25, xp: 80, size: 3.0, r: 2.0, tint: '#ff2a8a', boss: true },
};
const META = [ // permanent Armory upgrades bought with gold
  { id: 'power', max: 10, base: 40 }, { id: 'health', max: 10, base: 35 }, { id: 'speed', max: 8, base: 45 },
  { id: 'greed', max: 10, base: 50 }, { id: 'reach', max: 8, base: 30 },
];
const metaCost = (m, lvl) => Math.round(m.base * Math.pow(1.5, lvl));
const ASSETS = {
  models: {
    warrior: { files: { idle: 'assets/models/hero_warrior@idle.glb', run: 'assets/models/hero_warrior@run.glb' }, height: 3.6, yaw: -90 },
    assassin: { files: { idle: 'assets/models/hero_assassin@idle.glb', run: 'assets/models/hero_assassin@run.glb' }, height: 3.6, yaw: -90 },
    shaman: { files: { idle: 'assets/models/hero_shaman@idle.glb', run: 'assets/models/hero_shaman@run.glb' }, height: 3.6, yaw: -90 },
    sura: { files: { idle: 'assets/models/hero_sura@idle.glb', run: 'assets/models/hero_sura@run.glb' }, height: 3.7, yaw: -90 },
    wolf: { files: { walk: 'assets/models/mob_wolf@walk.glb' }, height: 1.3, yaw: -90 },
    golem: { files: { walk: 'assets/models/mob_golem@walk.glb' }, height: 2.6, yaw: -90 },
    rock: { files: { base: 'assets/models/prop_rock.glb' }, height: 2.2 },
    shrine: { files: { base: 'assets/models/prop_shrine.glb' }, height: 4 },
  },
  sfx: {
    cleave: 'assets/audio/sword_swing.mp3', hit: 'assets/audio/hit.mp3', wolfDie: 'assets/audio/wolf_death.mp3', roar: 'assets/audio/golem_roar.mp3',
    boom: 'assets/audio/explosion.mp3', dagger: 'assets/audio/skill_dash.mp3', nova: 'assets/audio/skill_slam.mp3', heal: 'assets/audio/skill_heal.mp3',
    zap: 'assets/audio/shock.mp3', thunder: 'assets/audio/thunder.mp3', levelUp: 'assets/audio/level_up.mp3', coin: 'assets/audio/coin.mp3',
    win: 'assets/audio/victory.mp3', lose: 'assets/audio/defeat.mp3', click: 'assets/audio/ui_click.mp3', pick: 'assets/audio/card_pick.mp3',
    hurt: 'assets/audio/angry.mp3', gem: 'assets/audio/dash_gem.mp3', card: 'assets/audio/dash_card.mp3', horn: 'assets/audio/dash_boss_horn.mp3',
    fire: 'assets/audio/skill_fire.mp3',
  },
  music: { run: 'assets/audio/bgm_battle.mp3', boss: 'assets/audio/bgm_overtime.mp3', menu: 'assets/audio/bgm_title.mp3' },
  voice: { boss: 'assets/audio/voice/dash_boss_{lang}.mp3', survived: 'assets/audio/voice/dash_survived_{lang}.mp3' },
  floor: 'assets/visuals/dungeon_floor.webp',
};
const ICON = (name) => `assets/visuals/${name}.webp`;

// ================================================================ I18N (English required; Turkish included)
const STRINGS = {
  en: {
    lv: 'Lv', level: 'Level', levelUp: 'Level up!', choose: 'Choose an upgrade', pickHero: 'Choose your hero', best: 'Best', play: 'Play', armory: 'Armory',
    back: 'Back', paused: 'Paused', resume: 'Resume', giveUp: 'Give up', survived: 'Survived', killsWord: 'Kills', newBest: 'New best!', double: '▶ Double gold',
    again: 'Play again', menu: 'Menu', defeated: 'Defeated', victory: 'You survived!', bossIncoming: 'The Warden awakens!', bossDown: 'Warden defeated!',
    lastMinute: 'Final minute!', new: 'NEW', heal: 'Healing Draught', healDesc: 'Restore 40 HP', goldBag: 'Bag of Gold', goldDesc: '+25 gold',
    hintDesktop: 'WASD / Arrows to move · weapons fire automatically · 1-3 to pick cards · Esc to pause', hintTouch: 'Drag anywhere to move · weapons fire automatically',
    adUnavailable: 'Ad not available right now', doubled: 'Gold doubled!', max: 'MAX', lvl: 'Lv {n}',
    heroes: { warrior: ['Warrior', 'Cleave · tough'], assassin: ['Assassin', 'Daggers · fast'], shaman: ['Shaman', 'Spirit Orbs'], sura: ['Sura', 'Nova · sturdy'] },
    w: {
      cleave: ['Cleave', 'Sweeping blade arc in front of you'], daggers: ['Daggers', 'Throws daggers at the nearest foe'],
      orbs: ['Spirit Orbs', 'Orbs circle you and burn foes'], nova: ['Nova', 'Bursts of force all around you'], lightning: ['Chain Lightning', 'Strikes random foes nearby'],
    },
    up: { cleave: 'Bigger arc, more damage', daggers: 'More daggers, more pierce', orbs: '+1 orb, more damage', nova: 'Wider blast, more damage', lightning: '+1 strike, more damage' },
    p: {
      might: ['Might', '+12% damage'], haste: ['Haste', '-7% weapon cooldowns'], swift: ['Swiftness', '+8% move speed'],
      vitality: ['Vitality', '+25 max HP and heal'], magnet: ['Magnet', '+35% pickup range'], regen: ['Regeneration', '+0.5 HP per second'],
    },
    meta: { power: ['Power', '+5% damage'], health: ['Health', '+10 max HP'], speed: ['Speed', '+3% move speed'], greed: ['Greed', '+10% gold'], reach: ['Reach', '+10% pickup range'] },
  },
  tr: {
    lv: 'Sv', level: 'Seviye', levelUp: 'Seviye atladın!', choose: 'Bir güçlendirme seç', pickHero: 'Kahramanını seç', best: 'En iyi', play: 'Oyna', armory: 'Cephanelik',
    back: 'Geri', paused: 'Duraklatıldı', resume: 'Devam', giveUp: 'Pes et', survived: 'Hayatta kalma', killsWord: 'Öldürme', newBest: 'Yeni rekor!', double: '▶ Altını ikiye katla',
    again: 'Tekrar oyna', menu: 'Menü', defeated: 'Yenildin', victory: 'Hayatta kaldın!', bossIncoming: 'Gardiyan uyanıyor!', bossDown: 'Gardiyan yenildi!',
    lastMinute: 'Son dakika!', new: 'YENİ', heal: 'Şifa İksiri', healDesc: '40 can yenile', goldBag: 'Altın Kesesi', goldDesc: '+25 altın',
    hintDesktop: 'WASD / Ok tuşları ile hareket · silahlar kendiliğinden saldırır · kart için 1-3 · Esc ile duraklat', hintTouch: 'Hareket için sürükle · silahlar kendiliğinden saldırır',
    adUnavailable: 'Şu anda reklam yok', doubled: 'Altın ikiye katlandı!', max: 'MAKS', lvl: 'Sv {n}',
    heroes: { warrior: ['Savaşçı', 'Yarma · dayanıklı'], assassin: ['Suikastçı', 'Hançer · hızlı'], shaman: ['Şaman', 'Ruh Küreleri'], sura: ['Sura', 'Nova · sağlam'] },
    w: {
      cleave: ['Yarma', 'Önündeki düşmanları biçen kılıç yayı'], daggers: ['Hançerler', 'En yakın düşmana hançer fırlatır'],
      orbs: ['Ruh Küreleri', 'Etrafında dönen küreler düşmanları yakar'], nova: ['Nova', 'Etrafına güç dalgası yayar'], lightning: ['Zincir Şimşek', 'Yakındaki rastgele düşmanlara çarpar'],
    },
    up: { cleave: 'Daha geniş yay, daha çok hasar', daggers: 'Daha çok hançer, daha çok delme', orbs: '+1 küre, daha çok hasar', nova: 'Daha geniş patlama, daha çok hasar', lightning: '+1 çarpma, daha çok hasar' },
    p: {
      might: ['Kudret', '+%12 hasar'], haste: ['Çeviklik', 'Silah bekleme süresi -%7'], swift: ['Hız', '+%8 hareket hızı'],
      vitality: ['Dirilik', '+25 azami can ve iyileşme'], magnet: ['Mıknatıs', '+%35 toplama menzili'], regen: ['Yenilenme', 'Saniyede +0,5 can'],
    },
    meta: { power: ['Güç', '+%5 hasar'], health: ['Can', '+10 azami can'], speed: ['Hız', '+%3 hareket hızı'], greed: ['Açgözlülük', '+%10 altın'], reach: ['Erişim', '+%10 toplama menzili'] },
  },
};
let lang = 'en';
const L = () => STRINGS[lang] || STRINGS.en;
const t = (k, vars) => { let s = L()[k] ?? STRINGS.en[k] ?? k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
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
const adsAvailable = () => sdkReady() && !adsFailed && !!crazySdk.ad && !CAPTURE;
function sdkCall(fn) { if (!sdkReady()) return; try { fn(crazySdk); } catch (e) { console.warn('[CrazyGames]', e); } }
function sdkLocale() { if (!sdkReady()) return null; try { return crazySdk.user?.systemInfo?.locale || null; } catch { return null; } }
function applySdkSettings(s) { if (s?.muteAudio) muteAudio('sdk'); else unmuteAudio('sdk'); } // platform mute overrides everything

function onGameplayStart() { if (gameplayActive) return; gameplayActive = true; sdkCall((s) => s.game.gameplayStart()); }
function onGameplayStop() { if (!gameplayActive) return; gameplayActive = false; sdkCall((s) => s.game.gameplayStop()); }
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: surviving the full 10 minutes

// Midgame: only between runs ("Play again"), never on navigation buttons; mute on adStarted; always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, only on the results screen, reward only on adFinished; hidden for the session after an error.
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
  let v = null;
  if (sdkReady() && crazySdk.data) try { v = crazySdk.data.getItem(key); } catch {}
  if (v == null) try { v = localStorage.getItem(key); } catch {}
  try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}

// ================================================================ AUDIO (Web Audio SFX + synthesized fallbacks, HTML5 music/voice)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  cleave: ['triangle', 900, 300, 0.12, 0.08], hit: ['square', 220, 90, 0.06, 0.05], wolfDie: ['sawtooth', 500, 120, 0.2, 0.06], roar: ['sawtooth', 120, 50, 0.8, 0.15],
  boom: ['sawtooth', 160, 40, 0.5, 0.14], dagger: ['triangle', 1200, 700, 0.06, 0.05], nova: ['sine', 200, 60, 0.4, 0.14], heal: ['sine', 500, 1100, 0.4, 0.1],
  zap: ['square', 1500, 300, 0.12, 0.06], thunder: ['sawtooth', 90, 40, 0.8, 0.14], levelUp: ['sine', 600, 1600, 0.35, 0.12], coin: ['square', 1320, 1980, 0.1, 0.06],
  win: ['triangle', 520, 1300, 0.7, 0.14], lose: ['triangle', 440, 110, 0.9, 0.16], click: ['square', 900, 900, 0.03, 0.06], pick: ['sine', 700, 1200, 0.1, 0.1],
  hurt: ['sawtooth', 300, 120, 0.15, 0.1], gem: ['sine', 1800, 2400, 0.05, 0.04], card: ['sine', 400, 1200, 0.3, 0.1], horn: ['sawtooth', 110, 70, 1.6, 0.16], fire: ['sawtooth', 400, 100, 0.3, 0.08],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0, last: {} };
function initAudio() {
  try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.master = audio.ctx.createGain(); audio.master.connect(audio.ctx.destination); }
  catch { audio.ctx = null; }
}
async function loadSfx(key, url) {
  if (!audio.ctx) return;
  try { const r = await fetch(url); if (r.ok) audio.buffers[key] = await audio.ctx.decodeAudioData(await r.arrayBuffer()); } catch {}
}
function unlockAudio() {
  if (audio.ctx?.state === 'suspended') audio.ctx.resume();
  if (audio.wantMusic && audio.music?.paused && !audio.muted.size && !CAPTURE) audio.music.play().catch(() => {});
}
function playSfx(key, vol = 1, minGap = 0.04) {
  if (audio.muted.size || !audio.ctx || audio.voices > 16 || CAPTURE) return;
  const now = audio.ctx.currentTime; if (now - (audio.last[key] || 0) < minGap) return; audio.last[key] = now; // throttle swarms of identical sounds
  const b = audio.buffers[key], g = audio.ctx.createGain();
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.93 + Math.random() * 0.14; g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function playMusic(key) {
  audio.wantMusic = true;
  if (audio.musicKey !== key) {
    audio.music?.pause(); audio.musicKey = key; audio.music = null;
    if (ASSETS.music[key]) { audio.music = new Audio(ASSETS.music[key]); audio.music.loop = true; audio.music.volume = 0.32; audio.music.onerror = () => { audio.music = null; }; }
  }
  if (audio.music && !audio.muted.size && !CAPTURE) audio.music.play().catch(() => {});
}
function playVoice(key) {
  if (audio.muted.size || CAPTURE || !ASSETS.voice[key]) return;
  const a = new Audio(ASSETS.voice[key].replace('{lang}', STRINGS[lang] ? lang : 'en')); a.volume = 0.95; a.play().catch(() => {});
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic && !CAPTURE) audio.music.play().catch(() => {}); }
}

// ================================================================ ASSETS (GLB + clips; null when missing so fallbacks kick in)
const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
const models = {};
const $ = (id) => document.getElementById(id);
let loadTotal = 0, loadDone = 0;
function track(p) { loadTotal++; return p.finally(() => { loadDone++; $('loadBar').style.width = `${(100 * loadDone) / loadTotal}%`; }); }
async function loadModel(id) {
  const def = ASSETS.models[id], clips = {}; let scene = null, first = null;
  await Promise.all(Object.entries(def.files).map(async ([clip, url], i) => {
    try {
      const g = await gltf.loadAsync(url);
      if (i === 0) first = g.scene; scene ??= g.scene;
      if (clip !== 'base' && g.animations[0]) clips[clip] = g.animations[0];
    } catch {}
  }));
  scene = first || scene; if (!scene) return;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  for (const c of Object.values(clips)) stripRootMotion(c, scene);
  models[id] = { scene, clips, def };
}
function instance(id, fallback) { // placeable copy: scaled to def.height, feet on y=0, facing +Z
  const a = models[id];
  if (!a) return fallback();
  const inner = SkeletonUtils.clone(a.scene);
  if (!a.fit) { const probe = SkeletonUtils.clone(a.scene); probe.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(probe, true); const s = a.def.height / Math.max(0.01, b.max.y - b.min.y); a.fit = { s, oy: b.min.y * s }; }
  inner.scale.multiplyScalar(a.fit.s); inner.position.y -= a.fit.oy; inner.rotation.y = THREE.MathUtils.degToRad(a.def.yaw ?? 0);
  const g = new THREE.Group(); g.add(inner);
  if (Object.keys(a.clips).length) {
    const mixer = new THREE.AnimationMixer(inner), actions = {};
    for (const [k, c] of Object.entries(a.clips)) actions[k] = mixer.clipAction(c);
    g.userData.mixer = mixer; g.userData.actions = actions;
  }
  return g;
}
function playClip(obj, name, fade = 0.15) {
  const next = obj.userData.actions?.[name];
  if (!next || obj.userData.current === next) return;
  next.reset().fadeIn(fade).play(); obj.userData.current?.fadeOut(fade); obj.userData.current = next;
}
function stripRootMotion(clip, root) { // Tripo3D clips walk the hip bone forward: remove the drift so characters animate in place
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.position')) continue;
    const bone = root.getObjectByName(tr.name.slice(0, -9)), v = tr.values, tm = tr.times, n = tm.length;
    if (!bone || n < 3) continue;
    const T = tm[n - 1] - tm[0] || 1;
    for (let c = 0; c < 3; c++) {
      const drift = v[(n - 1) * 3 + c] - v[c]; let mean = 0;
      for (let i = 0; i < n; i++) { v[i * 3 + c] -= (drift * (tm[i] - tm[0])) / T; mean += v[i * 3 + c] / n; }
      const off = mean - bone.position.getComponent(c);
      if (Math.abs(off) > 0.12) for (let i = 0; i < n; i++) v[i * 3 + c] -= off;
    }
  }
}
const tintCache = new Map();
function tint(obj, color, strength = 0.5) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const key2 = m.material.uuid + color;
    if (!tintCache.has(key2)) { const c = m.material.clone(); c.emissive = new THREE.Color(color); c.emissiveIntensity = strength; tintCache.set(key2, c); }
    m.material = tintCache.get(key2);
  });
}

// ================================================================ WORLD
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d0b14'); scene.fog = new THREE.Fog('#0d0b14', 26, 46);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 19, 11.5);
let shakeAmt = 0;
const rand = (a, b) => a + Math.random() * (b - a);
const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
scene.add(new THREE.HemisphereLight('#c4bfff', '#2a2230', 1.4));
const sun = new THREE.DirectionalLight('#ffe2c4', 1.6); sun.position.set(-8, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 60 }); scene.add(sun, sun.target);
const heroLight = new THREE.PointLight('#ffb36b', 45, 18, 1.5); heroLight.position.y = 3; scene.add(heroLight);

function buildWorld(floorImg) {
  let tex;
  if (floorImg) { tex = new THREE.Texture(floorImg); tex.needsUpdate = true; }
  else { // procedural flagstones
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#2b2733'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `hsl(260, 8%, ${18 + Math.random() * 8}%)`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
    tex = new THREE.CanvasTexture(c);
  }
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(ARENA / 9, ARENA / 9); tex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 10, ARENA * 2 + 10), new THREE.MeshStandardMaterial({ map: tex, color: '#8f8ca0', roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  for (let i = 0; i < 44; i++) { // rock ring walls
    const a = (i / 44) * Math.PI * 2, r = ARENA + rand(1, 3), rock = instance('rock', fallbackRock);
    rock.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); rock.rotation.y = rand(0, 6.3); rock.scale.multiplyScalar(rand(1.4, 2.2)); scene.add(rock);
  }
  const pillarGeo = new THREE.CylinderGeometry(0.9, 1.1, 3.2, 8), pillarMat = std('#4a4458'), flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  for (let i = 0; i < 14; i++) { // pillars with braziers
    let x, z; do { x = rand(-ARENA + 5, ARENA - 5); z = rand(-ARENA + 5, ARENA - 5); } while (Math.hypot(x, z) < 8);
    const p = new THREE.Mesh(pillarGeo, pillarMat); p.position.set(x, 1.6, z); p.castShadow = true; scene.add(p); obstacles.push({ x, z, r: 1.1 });
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 6), flameMat); f.position.set(x, 3.65, z); scene.add(f); flames.push(f);
  }
  const shrine = instance('shrine', () => new THREE.Group()); shrine.position.set(0, 0, -6); scene.add(shrine); obstacles.push({ x: 0, z: -6, r: 1.4 });
}
const obstacles = [], flames = [];
const fallbackRock = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.DodecahedronGeometry(1), std('#5a5560', { flatShading: true })); m.position.y = 0.7; g.add(m); return g; };
const fallbackHero = () => {
  const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.0, 4, 10), std('#c9a35a')); body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), std('#f1c9a5')); head.position.y = 2.0; body.castShadow = true; g.add(body, head); return g;
};
const fallbackWolf = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 1.4), std('#777b82')); m.position.y = 0.6; g.add(m); return g; };
const fallbackGolem = () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.DodecahedronGeometry(1), std('#8a8378', { flatShading: true })); m.position.y = 1.3; g.add(m); return g; };

// pooled effects
const particles = [], pGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
function burst(pos, color, n = 8, speed = 4) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { if (particles.length > 260) return; p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial()); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material.color.set(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.35 + Math.random() * 0.3;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 12 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 2.5));
  }
}
const fx = []; // transient meshes: { mesh, life, max, update(k) }
function addFx(mesh, life, update) { scene.add(mesh); fx.push({ mesh, life, max: life, update }); }
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt; const k = 1 - Math.max(0, f.life) / f.max; f.update?.(k, f.mesh);
    if (f.life <= 0) { scene.remove(f.mesh); f.mesh.geometry.dispose(); fx.splice(i, 1); }
  }
}
const dmgEls = [];
function damageNumber(pos, value, cls = '') {
  if (dmgEls.length > 28 || (CAPTURE && cls !== 'crit')) return;
  const p = pos.clone().project(camera); if (p.z > 1) return;
  const el = document.createElement('div'); el.className = `dn ${cls}`; el.textContent = Math.round(value);
  el.style.left = `${((p.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  $('dmg').appendChild(el); dmgEls.push(el); setTimeout(() => { el.remove(); dmgEls.splice(dmgEls.indexOf(el), 1); }, 600);
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

// ================================================================ HERO
const hero = { obj: null, pos: new THREE.Vector3(), face: new THREE.Vector3(0, 0, 1), hp: 100, maxHp: 100, iframes: 0, moving: false };
function makeHero(kind) {
  if (hero.obj) scene.remove(hero.obj);
  hero.obj = instance(kind, fallbackHero); hero.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(hero.obj); playClip(hero.obj, 'idle');
}

// ================================================================ FOES (pooled skinned clones, separation via a spatial grid)
const foes = [], pools = { wolf: [], golem: [] };
const blobGeo = new THREE.CircleGeometry(1, 16); blobGeo.rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false });
function takeFoeObj(type) {
  const def = FOES[type], pool = pools[def.model], tintKey = def.tint || 'none';
  let o = pool.find((x) => !x.userData.inUse && x.userData.tintKey === tintKey);
  if (!o) {
    o = instance(def.model, def.model === 'wolf' ? fallbackWolf : fallbackGolem); if (def.tint) tint(o, def.tint, 0.45);
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.02; o.add(blob); o.userData.tintKey = tintKey; pool.push(o);
  }
  o.userData.inUse = true; o.scale.setScalar(def.size); scene.add(o); playClip(o, 'walk'); o.userData.mixer?.update(Math.random());
  return o;
}
function spawnFoe(type, at) {
  const def = FOES[type], tm = run.time / 60, hpMul = 1 + tm * 0.35 + Math.max(0, tm - 4) ** 2 * 0.22;
  let pos = at;
  if (!pos) {
    const a = rand(0, Math.PI * 2), r = rand(17, 21);
    pos = new THREE.Vector3(THREE.MathUtils.clamp(hero.pos.x + Math.cos(a) * r, -ARENA + 1, ARENA - 1), 0, THREE.MathUtils.clamp(hero.pos.z + Math.sin(a) * r, -ARENA + 1, ARENA - 1));
  }
  const obj = takeFoeObj(type); obj.position.copy(pos);
  const hp = Math.round(def.hp * hpMul);
  const f = { type, def, obj, hp, maxHp: hp, speed: def.speed * rand(0.9, 1.1), slow: 0, hitCd: new Map(), dead: false, knock: new THREE.Vector3() };
  foes.push(f);
  if (def.boss) { run.boss = f; playSfx('horn', 1, 0); playSfx('roar', 1, 0); playVoice('boss'); shake(0.6); banner(t('bossIncoming')); playMusic('boss'); }
  return f;
}
function damageFoe(f, dmg, color = '#ffffff', knock = 0, from = null) {
  if (f.dead) return;
  const crit = Math.random() < 0.08, d = dmg * stat.dmg * (crit ? 2 : 1);
  f.hp -= d; run.dealt += d;
  if (knock && from && !f.def.boss) f.knock.copy(f.obj.position).sub(from).setY(0).normalize().multiplyScalar(knock);
  damageNumber(f.obj.position.clone().setY(f.def.size * 2.2), d, crit ? 'crit' : '');
  burst(f.obj.position.clone().setY(f.def.size), color, 3, 3); playSfx('hit', 0.25, 0.05);
  if (f.hp <= 0) killFoe(f);
}
function killFoe(f) {
  f.dead = true; f.obj.userData.inUse = false; scene.remove(f.obj); foes.splice(foes.indexOf(f), 1);
  run.kills++; dropGem(f.obj.position, f.def.xp);
  if (Math.random() < (f.def.boss ? 1 : 0.018)) dropPotion(f.obj.position);
  burst(f.obj.position.clone().setY(f.def.size), f.def.model === 'wolf' ? '#8f9299' : '#9d8f7a', f.def.boss ? 50 : 8, f.def.boss ? 10 : 4);
  playSfx(f.def.model === 'wolf' ? 'wolfDie' : 'boom', f.def.boss ? 1 : 0.35, 0.08);
  if (f.def.boss) { run.boss = null; banner(t('bossDown'), true); shake(0.8); playMusic('run'); for (let i = 0; i < 6; i++) dropGem(f.obj.position.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))), 10); run.gold += 40; }
}
const grid = new Map();
function gridKey(x, z) { return ((Math.floor(x / 2) + 512) << 10) | (Math.floor(z / 2) + 512); }
function updateFoes(dt) {
  grid.clear();
  for (const f of foes) { const k = gridKey(f.obj.position.x, f.obj.position.z); (grid.get(k) || grid.set(k, []).get(k)).push(f); }
  const tmp = new THREE.Vector3();
  for (const f of foes) {
    const p = f.obj.position;
    tmp.set(hero.pos.x - p.x, 0, hero.pos.z - p.z); const dist = tmp.length(); tmp.divideScalar(dist || 1);
    let sx = 0, sz = 0; // separation from neighbours in the 3x3 grid cells around
    const cx = Math.floor(p.x / 2), cz = Math.floor(p.z / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cell = grid.get(((cx + i + 512) << 10) | (cz + j + 512)); if (!cell) continue;
      for (const o of cell) {
        if (o === f) continue;
        const dx = p.x - o.obj.position.x, dz = p.z - o.obj.position.z, d2 = dx * dx + dz * dz, rr = f.def.r + o.def.r;
        if (d2 < rr * rr && d2 > 0.0001) { const d = Math.sqrt(d2), push = (rr - d) / rr; sx += (dx / d) * push; sz += (dz / d) * push; }
      }
    }
    for (const ob of obstacles) { const dx = p.x - ob.x, dz = p.z - ob.z, d = Math.hypot(dx, dz), rr = ob.r + f.def.r; if (d < rr) { sx += (dx / d) * 2; sz += (dz / d) * 2; } }
    const sp = f.speed * (f.slow > 0 ? 0.55 : 1);
    p.x += (tmp.x * sp + sx * 4 + f.knock.x) * dt; p.z += (tmp.z * sp + sz * 4 + f.knock.z) * dt;
    f.knock.multiplyScalar(Math.max(0, 1 - dt * 8)); f.slow = Math.max(0, f.slow - dt);
    f.obj.rotation.y = Math.atan2(tmp.x, tmp.z);
    if (dist < f.def.r + 0.6 && hero.iframes <= 0) hurtHero(f.def.dmg * (1 + run.time / 900));
  }
}

// ================================================================ WEAPONS
const owned = {}; // weapon/passive id -> level
let stat = { dmg: 1, cd: 1, speed: 1, magnet: 1, regen: 0 };
function recomputeStats() {
  const p = (id) => owned[id] || 0, m = save.meta;
  stat = { dmg: (1 + 0.12 * p('might')) * (1 + 0.05 * (m.power || 0)), cd: Math.pow(0.93, p('haste')), speed: (1 + 0.08 * p('swift')) * (1 + 0.03 * (m.speed || 0)),
    magnet: (1 + 0.35 * p('magnet')) * (1 + 0.1 * (m.reach || 0)), regen: 0.5 * p('regen') };
  hero.maxHp = HEROES[run.hero].hp + 25 * p('vitality') + 10 * (m.health || 0);
}
const wpn = {}; // per-weapon runtime state
const daggers = [], daggerGeo = new THREE.BoxGeometry(0.12, 0.12, 0.8), daggerMat = new THREE.MeshStandardMaterial({ color: '#e8eef5', emissive: '#7fe3ff', emissiveIntensity: 0.6, metalness: 0.6 });
const orbMeshes = [], orbGeo = new THREE.SphereGeometry(0.38, 14, 10), orbMat = new THREE.MeshBasicMaterial({ color: '#7dffcf' });
const nearest = (from, maxD = Infinity) => { let best = null, bd = maxD * maxD; for (const f of foes) { const d = f.obj.position.distanceToSquared(from); if (d < bd) { bd = d; best = f; } } return best; };
function updateWeapons(dt) {
  for (const [id, lv] of Object.entries(owned)) {
    if (!WEAPONS[id]) continue;
    const w = (wpn[id] ??= { t: 0.3, angle: 0 }), base = WEAPONS[id];
    if (id === 'orbs') { updateOrbs(dt, lv, w); continue; }
    w.t -= dt; if (w.t > 0) continue;
    w.t = base.cd * stat.cd * (id === 'cleave' && lv >= 5 ? 0.75 : 1);
    const dmg = base.dmg * (1 + 0.3 * (lv - 1));
    if (id === 'cleave') fireCleave(dmg, lv);
    if (id === 'daggers') fireDaggers(dmg, lv);
    if (id === 'nova') fireNova(dmg, lv);
    if (id === 'lightning') fireLightning(dmg, lv);
  }
  updateDaggers(dt);
}
function fireCleave(dmg, lv) {
  const r = 2.8 + 0.3 * lv, arc = lv >= 3 ? Math.PI * 1.4 : Math.PI * 0.85, dir = Math.atan2(hero.face.x, hero.face.z);
  for (const f of [...foes]) {
    const dx = f.obj.position.x - hero.pos.x, dz = f.obj.position.z - hero.pos.z, d = Math.hypot(dx, dz);
    if (d > r + f.def.r) continue;
    let da = Math.atan2(dx, dz) - dir; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) <= arc / 2) damageFoe(f, dmg, '#ffe2a8', 6, hero.pos);
  }
  const geo = new THREE.RingGeometry(r * 0.35, r, 24, 1, -arc / 2, arc); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(hero.pos).setY(0.4); m.rotation.y = dir - Math.PI / 2;
  addFx(m, 0.18, (k, mesh) => { mesh.material.opacity = 0.6 * (1 - k); mesh.scale.setScalar(0.85 + k * 0.25); });
  playSfx('cleave', 0.5, 0.05);
}
function fireDaggers(dmg, lv) {
  const count = 1 + Math.floor(lv / 2), pierce = 1 + Math.floor((lv - 1) / 2);
  const targets = [...foes].sort((a, b) => a.obj.position.distanceToSquared(hero.pos) - b.obj.position.distanceToSquared(hero.pos)).slice(0, count);
  if (!targets.length) return;
  for (let i = 0; i < count; i++) {
    const tgt = targets[i % targets.length], dir = tgt.obj.position.clone().sub(hero.pos).setY(0).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (count - 1) / 2) * 0.12);
    let d = daggers.find((x) => !x.visible); if (!d) { d = new THREE.Mesh(daggerGeo, daggerMat); daggers.push(d); scene.add(d); }
    d.visible = true; d.position.copy(hero.pos).setY(1.4); d.lookAt(d.position.clone().add(dir)); d.userData = { dir, life: 1.1, dmg, pierce, hit: new Set() };
  }
  playSfx('dagger', 0.35, 0.06);
}
function updateDaggers(dt) {
  for (const d of daggers) {
    if (!d.visible) continue;
    d.userData.life -= dt; d.position.addScaledVector(d.userData.dir, 22 * dt);
    if (d.userData.life <= 0) { d.visible = false; continue; }
    for (const f of [...foes]) {
      if (d.userData.hit.has(f)) continue;
      if (Math.hypot(f.obj.position.x - d.position.x, f.obj.position.z - d.position.z) < f.def.r + 0.35) {
        d.userData.hit.add(f); damageFoe(f, d.userData.dmg, '#bfe9ff', 3, d.position);
        if (--d.userData.pierce <= 0) { d.visible = false; break; }
      }
    }
  }
}
function updateOrbs(dt, lv, w) {
  const count = 1 + lv, radius = 2.4 + 0.15 * lv, dmg = WEAPONS.orbs.dmg * (1 + 0.3 * (lv - 1));
  while (orbMeshes.length < count) { const m = new THREE.Mesh(orbGeo, orbMat); orbMeshes.push(m); scene.add(m); }
  w.angle += dt * (2.8 / stat.cd);
  orbMeshes.forEach((m, i) => {
    m.visible = i < count; if (!m.visible) return;
    const a = w.angle + (i / count) * Math.PI * 2; m.position.set(hero.pos.x + Math.cos(a) * radius, 1.3 + Math.sin(a * 2 + i) * 0.2, hero.pos.z + Math.sin(a) * radius);
    for (const f of [...foes]) {
      if (Math.hypot(f.obj.position.x - m.position.x, f.obj.position.z - m.position.z) > f.def.r + 0.45) continue;
      const last = f.hitCd.get(m) || -9; if (run.time - last < 0.45) continue;
      f.hitCd.set(m, run.time); damageFoe(f, dmg, '#7dffcf', 2, m.position); f.slow = 0.4;
    }
  });
}
function fireNova(dmg, lv) {
  const r = 3.6 + 0.45 * lv;
  for (const f of [...foes]) if (f.obj.position.distanceTo(hero.pos) < r + f.def.r) damageFoe(f, dmg, '#c08bff', 9, hero.pos);
  const geo = new THREE.RingGeometry(0.2, 1, 40); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#c08bff', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(hero.pos).setY(0.3);
  addFx(m, 0.35, (k, mesh) => { mesh.scale.setScalar(0.3 + k * r); mesh.material.opacity = 0.7 * (1 - k); });
  playSfx('nova', 0.5, 0.1); shake(0.1);
}
function fireLightning(dmg, lv) {
  const near = foes.filter((f) => f.obj.position.distanceTo(hero.pos) < 11).sort(() => Math.random() - 0.5).slice(0, lv);
  for (const f of near) {
    damageFoe(f, dmg, '#9fe7ff');
    const geo = new THREE.CylinderGeometry(0.08, 0.2, 9, 5); geo.translate(0, 4.5, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.95 })); m.position.copy(f.obj.position);
    addFx(m, 0.16, (k, mesh) => { mesh.material.opacity = 0.95 * (1 - k); mesh.scale.x = mesh.scale.z = 1 + Math.random(); });
    burst(f.obj.position.clone().setY(0.5), '#9fe7ff', 6, 5);
  }
  if (near.length) playSfx('zap', 0.5, 0.08);
}

// ================================================================ GEMS (one InstancedMesh)
const gemGeo = new THREE.OctahedronGeometry(0.28, 0), gemMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#3aa0ff', emissiveIntensity: 0.9, roughness: 0.3 });
const gemMesh = new THREE.InstancedMesh(gemGeo, gemMat, MAX_GEMS); gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gemMesh.frustumCulled = false; scene.add(gemMesh);
const gems = []; // { x, z, v, pull }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
function dropGem(pos, value) {
  if (gems.length >= MAX_GEMS) { const g = gems.reduce((a, b) => (a.v < b.v ? a : b)); g.v += value; return; } // merge into the smallest gem
  gems.push({ x: pos.x + rand(-0.3, 0.3), z: pos.z + rand(-0.3, 0.3), v: value, pull: false });
}
function updateGems(dt, clock) {
  const reach = 2.4 * stat.magnet;
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i], dx = hero.pos.x - g.x, dz = hero.pos.z - g.z, d = Math.hypot(dx, dz);
    if (d < reach) g.pull = true;
    if (g.pull) { const sp = 14 + (reach - Math.min(d, reach)) * 4; g.x += (dx / (d || 1)) * sp * dt; g.z += (dz / (d || 1)) * sp * dt; }
    if (d < 0.7) { gainXp(g.v); gems.splice(i, 1); playSfx('gem', 0.3, 0.03); }
  }
  gemMesh.count = gems.length;
  gems.forEach((g, i) => {
    const big = g.v >= 10;
    _p.set(g.x, 0.55 + Math.sin(clock * 3 + i) * 0.12, g.z); _q.setFromAxisAngle(_s.set(0, 1, 0), clock * 2 + i); _s.setScalar(big ? 1.8 : g.v >= 3 ? 1.25 : 1);
    _m.compose(_p, _q, _s); gemMesh.setMatrixAt(i, _m); gemMesh.setColorAt(i, _c.set(big ? '#c77dff' : g.v >= 3 ? '#4fe0b0' : '#7fd0ff'));
  });
  gemMesh.instanceMatrix.needsUpdate = true; if (gemMesh.instanceColor) gemMesh.instanceColor.needsUpdate = true;
}

const potions = [], potionGeo = new THREE.SphereGeometry(0.32, 12, 10), potionMat = new THREE.MeshStandardMaterial({ color: '#ff4d6d', emissive: '#ff2a50', emissiveIntensity: 0.8 });
function dropPotion(pos) { const m = new THREE.Mesh(potionGeo, potionMat); m.position.set(pos.x, 0.6, pos.z); scene.add(m); potions.push(m); }
function updatePotions(clock) {
  for (let i = potions.length - 1; i >= 0; i--) {
    const m = potions[i]; m.position.y = 0.6 + Math.sin(clock * 4 + i) * 0.15;
    if (Math.hypot(m.position.x - hero.pos.x, m.position.z - hero.pos.z) < 1.1) {
      hero.hp = Math.min(hero.maxHp, hero.hp + 25); scene.remove(m); potions.splice(i, 1); playSfx('heal', 0.8, 0); burst(hero.pos.clone().setY(1.5), '#ff8fa3', 14, 4);
    }
  }
}

// ================================================================ INPUT (WASD/arrows, floating joystick for touch and mouse drag, card keys)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (state === State.LEVELUP && /^Digit[1-3]$/.test(e.code)) pickCard(+e.code.slice(5) - 1);
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING || stick.id !== null) return;
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy), max = 50;
  if (d > max) { dx *= max / d; dy *= max / d; }
  stick.x = dx / max; stick.y = dy / max; $('joystick').firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
const releaseStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; $('joystick').firstElementChild.style.transform = ''; };
canvas.addEventListener('pointerup', releaseStick); canvas.addEventListener('pointercancel', releaseStick);
function moveInput() {
  if (AUTOPLAY) return botInput();
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = stick.y; }
  const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : l < 0.15 ? { x: 0, y: 0 } : { x, y };
}
function botInput() { // plays like a person: dodge when crowded, otherwise close to weapon range, circle, and grab gems
  const ranged = owned.daggers || owned.lightning, reach = ranged ? 6 : owned.nova ? 3.6 : 2.4;
  let x = 0, y = 0, threat = 0, near = null, nd = 1e9;
  for (const f of foes) {
    const dx = hero.pos.x - f.obj.position.x, dz = hero.pos.z - f.obj.position.z, d = Math.hypot(dx, dz) - f.def.r;
    if (d < nd) { nd = d; near = f; }
    const danger = f.def.boss ? 4.5 : 2.0;
    if (d < danger) { const w = (danger - d) / danger * (f.def.boss ? 3 : 1); x += (dx / (d + f.def.r || 1)) * w; y += (dz / (d + f.def.r || 1)) * w; threat += w; }
  }
  if (threat < 0.6 && near) {
    const dx = near.obj.position.x - hero.pos.x, dz = near.obj.position.z - hero.pos.z, d = Math.hypot(dx, dz) || 1;
    if (nd > reach) { x += (dx / d) * 0.8; y += (dz / d) * 0.8; } else { x += (-dz / d) * 0.7; y += (dx / d) * 0.7; } // approach, else strafe around
    let g = null, gd = 1e9; for (const gm of gems) { const q = (gm.x - hero.pos.x) ** 2 + (gm.z - hero.pos.z) ** 2; if (q < gd) { gd = q; g = gm; } }
    if (g && gd < 64) { const q = Math.sqrt(gd) || 1; x += ((g.x - hero.pos.x) / q) * 0.9; y += ((g.z - hero.pos.z) / q) * 0.9; }
  }
  x -= (hero.pos.x / ARENA) * 0.6; y -= (hero.pos.z / ARENA) * 0.6;
  run.botWobble += 0.015; x += Math.cos(run.botWobble) * 0.1; y += Math.sin(run.botWobble * 0.7) * 0.1;
  const l = Math.hypot(x, y); return l < 0.05 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}

// ================================================================ STATE (BOOT -> MENU/ARMORY -> PLAYING <-> PAUSED/LEVELUP -> OVER)
const State = { BOOT: 'BOOT', MENU: 'MENU', ARMORY: 'ARMORY', PLAYING: 'PLAYING', PAUSED: 'PAUSED', LEVELUP: 'LEVELUP', OVER: 'OVER' };
let state = State.BOOT, run = null;
let save = { hero: 'warrior', best: 0, gold: 0, meta: {} };
function setState(s) {
  state = s;
  for (const id of ['menu', 'armory', 'paused', 'levelup', 'over']) $(id).hidden = s !== State[id.toUpperCase()];
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED || s === State.LEVELUP);
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; }
  if (s === State.PLAYING || s === State.LEVELUP) onGameplayStart(); else onGameplayStop(); // level-up cards are part of play; menus/pause/results are breaks
  if (s === State.MENU || s === State.ARMORY) { playMusic('menu'); refreshMeta(); }
}
function togglePause() { if (state === State.PLAYING) setState(State.PAUSED); else if (state === State.PAUSED) setState(State.PLAYING); }
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { if (AUTOPLAY) return; const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1800); }
let bannerTimer = 0;
function banner(text, good = false) { const el = $('banner'); el.textContent = text; el.className = good ? 'good' : ''; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 2000); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6, 0); fn(); });
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

click('btnPlay', () => startRun());
click('btnArmory', () => setState(State.ARMORY));
click('btnOverArmory', () => setState(State.ARMORY)); // navigation: never an ad here
click('btnArmoryBack', () => setState(State.MENU));
click('btnMenu', () => setState(State.MENU));
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => endRun(false));
click('btnAgain', () => triggerMidgameAd(() => startRun())); // between runs: the natural midgame break
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.gold += run.goldEarned; run.goldEarned *= 2; $('rGold').textContent = run.goldEarned; saveData(SAVE_KEY, save); toast(t('doubled')); playSfx('coin', 1, 0); }, () => {});
});

function renderHeroes() {
  const box = $('heroes'); box.innerHTML = '';
  for (const [id, h] of Object.entries(HEROES)) {
    const [name, desc] = L().heroes[id], b = document.createElement('button'); b.className = `hero${save.hero === id ? ' sel' : ''}`;
    b.innerHTML = '<img alt=""><b></b><small></small>'; b.querySelector('img').src = ICON(h.card); b.querySelector('b').textContent = name; b.querySelector('small').textContent = desc;
    b.addEventListener('click', () => { save.hero = id; saveData(SAVE_KEY, save); playSfx('pick', 0.7, 0); renderHeroes(); makeHero(id); });
    box.appendChild(b);
  }
}
function refreshMeta() {
  document.querySelectorAll('.bank').forEach((el) => { el.textContent = save.gold; });
  $('bestTime').textContent = fmt(save.best);
  const box = $('upgrades'); box.innerHTML = '';
  for (const m of META) {
    const lvl = save.meta[m.id] || 0, cost = metaCost(m, lvl), [name, desc] = L().meta[m.id], el = document.createElement('div'); el.className = 'upg';
    el.innerHTML = '<div><b></b> <small></small></div><small></small><button></button>';
    el.querySelector('b').textContent = name; el.querySelectorAll('small')[0].textContent = t('lvl', { n: lvl }); el.querySelectorAll('small')[1].textContent = desc;
    const btn = el.querySelector('button');
    if (lvl >= m.max) { btn.textContent = t('max'); btn.disabled = true; }
    else {
      btn.innerHTML = `<img src="${ICON('icon_coin')}" alt=""> ${cost}`; btn.disabled = save.gold < cost;
      btn.addEventListener('click', () => { if (save.gold < cost) return; save.gold -= cost; save.meta[m.id] = lvl + 1; saveData(SAVE_KEY, save); playSfx('levelUp', 0.7, 0); refreshMeta(); });
    }
    box.appendChild(el);
  }
}

// ================================================================ GAMEPLAY
function startRun() {
  for (const f of foes) { f.obj.userData.inUse = false; scene.remove(f.obj); } foes.length = 0; gems.length = 0;
  for (const d of daggers) d.visible = false; for (const m of orbMeshes) m.visible = false; for (const m of potions) scene.remove(m); potions.length = 0;
  for (const k of Object.keys(owned)) delete owned[k]; for (const k of Object.keys(wpn)) delete wpn[k];
  run = { hero: save.hero, time: 0, kills: 0, level: 1, xp: 0, need: 5, gold: 0, dealt: 0, spawnT: 1, boss: null, bossIdx: 0, pendingLevels: 0,
    goldEarned: 0, over: false, botWobble: 0, lastMinute: false };
  owned[HEROES[run.hero].weapon] = 1;
  makeHero(run.hero); recomputeStats(); hero.hp = hero.maxHp; hero.pos.set(0, 0, 4); hero.iframes = 0;
  renderKit(); updateHud();
  setState(State.PLAYING); playMusic('run');
}
function gainXp(v) {
  run.xp += v;
  while (run.xp >= run.need) { run.xp -= run.need; run.level++; run.need = Math.round(5 + run.level * 4.5 + Math.pow(run.level, 1.45)); run.pendingLevels++; }
}
function cardOptions() {
  const wCount = Object.keys(owned).filter((k) => WEAPONS[k]).length, pCount = Object.keys(owned).filter((k) => PASSIVES[k]).length, opts = [];
  for (const id of Object.keys(WEAPONS)) if (owned[id] ? owned[id] < MAX_LV : wCount < MAX_WEAPONS) opts.push({ id, kind: 'w', weight: owned[id] ? 3 : 2 });
  for (const id of Object.keys(PASSIVES)) if (owned[id] ? owned[id] < MAX_LV : pCount < MAX_PASSIVES) opts.push({ id, kind: 'p', weight: owned[id] ? 2 : 1.5 });
  const out = [];
  while (out.length < 3 && opts.length) {
    const total = opts.reduce((s, o) => s + o.weight, 0); let r = Math.random() * total, k = 0;
    while (r > opts[k].weight) { r -= opts[k].weight; k++; }
    out.push(opts.splice(k, 1)[0]);
  }
  if (out.length < 3) out.push({ id: 'heal', kind: 'x' }); if (out.length < 3) out.push({ id: 'gold', kind: 'x' });
  return out;
}
function openLevelUp() {
  run.pendingLevels--; run.cards = cardOptions();
  const box = $('cards'); box.innerHTML = '';
  run.cards.forEach((c, i) => {
    const el = document.createElement('button'); el.className = 'card';
    let name, desc, icon, tag = '';
    if (c.kind === 'w') { [name, desc] = L().w[c.id]; icon = WEAPONS[c.id].icon; if (owned[c.id]) { desc = L().up[c.id]; tag = `<span class="lv">${t('lvl', { n: owned[c.id] + 1 })}</span>`; } else tag = `<span class="new">${t('new')}</span>`; }
    else if (c.kind === 'p') { [name, desc] = L().p[c.id]; icon = PASSIVES[c.id].icon; tag = owned[c.id] ? `<span class="lv">${t('lvl', { n: owned[c.id] + 1 })}</span>` : `<span class="new">${t('new')}</span>`; }
    else { name = t(c.id === 'heal' ? 'heal' : 'goldBag'); desc = t(c.id === 'heal' ? 'healDesc' : 'goldDesc'); icon = c.id === 'heal' ? 'skill_shaman_1' : 'icon_coin'; }
    el.innerHTML = `<img alt="">${tag}<b></b><small></small><kbd>${i + 1}</kbd>`;
    el.querySelector('img').src = ICON(icon); el.querySelector('b').textContent = name; el.querySelector('small').textContent = desc;
    el.addEventListener('click', () => pickCard(i)); box.appendChild(el);
  });
  playSfx('levelUp', 0.8, 0); setTimeout(() => playSfx('card', 0.6, 0), CAPTURE ? 0 : 150);
  setState(State.LEVELUP); run.cardT = 0;
}
function pickCard(i) {
  if (state !== State.LEVELUP || !run.cards?.[i]) return;
  const c = run.cards[i];
  if (c.kind === 'x') { if (c.id === 'heal') hero.hp = Math.min(hero.maxHp, hero.hp + 40); else run.gold += 25; }
  else { owned[c.id] = (owned[c.id] || 0) + 1; if (c.id === 'vitality') hero.hp += 25; }
  recomputeStats(); hero.hp = Math.min(hero.hp, hero.maxHp); renderKit(); playSfx('pick', 0.8, 0);
  burst(hero.pos.clone().setY(1.5), '#ffcf4a', 16, 5);
  run.cards = null; setState(State.PLAYING);
}
function renderKit() {
  const box = $('kit'); box.innerHTML = '';
  for (const [id, lv] of Object.entries(owned)) {
    const el = document.createElement('div'); el.className = `k${PASSIVES[id] ? ' passive' : ''}`;
    el.innerHTML = '<img alt=""><b></b>'; el.querySelector('img').src = ICON((WEAPONS[id] || PASSIVES[id]).icon); el.querySelector('b').textContent = lv; box.appendChild(el);
  }
}
function hurtHero(dmg) {
  hero.hp -= dmg; hero.iframes = 0.6; shake(0.25); playSfx('hurt', 0.5, 0.2);
  damageNumber(hero.pos.clone().setY(3.4), dmg, 'hurt'); burst(hero.pos.clone().setY(1.4), '#ff4d5e', 8, 4);
  if (hero.hp <= 0) endRun(false);
}
function updateHud() {
  $('hpFill').style.width = `${Math.max(0, (100 * hero.hp) / hero.maxHp)}%`; $('hpText').textContent = Math.max(0, Math.ceil(hero.hp));
  $('xpFill').style.width = `${(100 * run.xp) / run.need}%`; $('lvl').textContent = run.level;
  $('timer').textContent = fmt(Math.max(0, run.time)); $('kills').textContent = run.kills; $('gold').textContent = run.gold;
}
function spawnDirector(dt) {
  const tm = run.time;
  if (run.bossIdx < BOSS_TIMES.length && tm >= BOSS_TIMES[run.bossIdx]) { run.bossIdx++; spawnFoe('boss'); }
  if (!run.lastMinute && tm >= RUN_TIME - 60) { run.lastMinute = true; banner(t('lastMinute')); }
  run.spawnT -= dt; if (run.spawnT > 0) return;
  run.spawnT = Math.max(0.22, 1.6 - (tm / RUN_TIME) * 1.4); // a trickle at first, a flood by the end
  const cap = Math.round(25 + (MAX_FOES - 25) * Math.min(1, tm / RUN_TIME));
  if (foes.length >= cap) return;
  const batch = 1 + Math.floor(tm / 150);
  for (let i = 0; i < batch && foes.length < cap; i++) {
    const r = Math.random(); let type = 'wolf';
    if (tm > 60 && r < 0.3) type = 'golem';
    if (tm > 180 && r < 0.15) type = 'direwolf';
    if (tm > 330 && r < 0.07 + (tm - 330) / 3000) type = 'crystal';
    spawnFoe(type);
  }
}
function endRun(victory) {
  if (run.over) return;
  run.over = true;
  const greed = 1 + 0.1 * (save.meta.greed || 0);
  run.goldEarned = Math.round((run.gold + run.kills / 4 + run.time / 8 + (victory ? 60 : 0)) * greed);
  save.gold += run.goldEarned;
  const isBest = run.time > save.best; if (isBest) save.best = Math.floor(run.time);
  saveData(SAVE_KEY, save);
  $('overTitle').textContent = t(victory ? 'victory' : 'defeated'); $('rTime').textContent = fmt(run.time); $('rKills').textContent = run.kills; $('rLevel').textContent = run.level;
  $('rGold').textContent = run.goldEarned; $('newBest').hidden = !isBest; $('btnDouble').hidden = !(adsAvailable() && run.goldEarned > 0);
  if (victory) { playSfx('win', 1, 0); playVoice('survived'); if (!CAPTURE) happytime(); } else { playSfx('lose', 0.9, 0); burst(hero.pos.clone().setY(1.5), '#ff4d5e', 30, 7); }
  setState(State.OVER);
}

function step(dt) {
  if (state !== State.PLAYING || !run || run.over) return;
  run.time += dt;
  if (run.time >= RUN_TIME) { endRun(true); return; }
  if (run.pendingLevels > 0) { openLevelUp(); return; }
  const m = moveInput(), sp = HEROES[run.hero].speed * stat.speed;
  hero.moving = !!(m.x || m.y);
  if (hero.moving) { hero.pos.x += m.x * sp * dt; hero.pos.z += m.y * sp * dt; hero.face.set(m.x, 0, m.y).normalize(); }
  hero.pos.x = THREE.MathUtils.clamp(hero.pos.x, -ARENA + 1, ARENA - 1); hero.pos.z = THREE.MathUtils.clamp(hero.pos.z, -ARENA + 1, ARENA - 1);
  for (const ob of obstacles) { const dx = hero.pos.x - ob.x, dz = hero.pos.z - ob.z, d = Math.hypot(dx, dz); if (d < ob.r + 0.6) { hero.pos.x = ob.x + (dx / d) * (ob.r + 0.6); hero.pos.z = ob.z + (dz / d) * (ob.r + 0.6); } }
  hero.iframes = Math.max(0, hero.iframes - dt);
  hero.hp = Math.min(hero.maxHp, hero.hp + stat.regen * dt);
  spawnDirector(dt); updateFoes(dt); if (run.over) return;
  updateWeapons(dt);
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, clock = 0, hudT = 0;
function animate(dt) {
  clock += dt; updateParticles(dt); updateFx(dt);
  for (const f of flames) f.scale.set(1 + Math.sin(clock * 9 + f.position.x) * 0.15, 1 + Math.sin(clock * 11 + f.position.z) * 0.2, 1);
  if (!run || !hero.obj) return;
  if (state === State.PLAYING || state === State.LEVELUP) {
    hero.obj.position.copy(hero.pos); const want = Math.atan2(hero.face.x, hero.face.z);
    let d = want - hero.obj.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); hero.obj.rotation.y += d * Math.min(1, dt * 14);
    playClip(hero.obj, hero.moving && state === State.PLAYING ? 'run' : 'idle');
    hero.obj.visible = hero.iframes <= 0 || Math.floor(clock * 20) % 2 === 0;
  }
  if (state === State.PLAYING) {
    hero.obj.userData.mixer?.update(dt);
    for (const f of foes) f.obj.userData.mixer?.update(dt * (f.def.model === 'wolf' ? 1.3 : 0.9));
    updateGems(dt, clock); updatePotions(clock);
    hudT -= dt; if (hudT <= 0) { hudT = 0.1; updateHud(); }
  }
  if (AUTOPLAY && state === State.LEVELUP) {
    run.cardT = (run.cardT || 0) + dt;
    if (run.cardT > 0.8) { const rank = (c) => (c.kind === 'w' ? (owned[c.id] ? 3 : 2) : c.kind === 'p' ? (['might', 'vitality', 'regen'].includes(c.id) ? 1.5 : 1) : 0); pickCard(params.get('botcards') === 'random' ? Math.floor(Math.random() * run.cards.length) : run.cards.indexOf([...run.cards].sort((a, b) => rank(b) - rank(a))[0])); }
  }
  if (AUTOPLAY && state === State.OVER) { run.restartT = (run.restartT || 0) + dt; if (run.restartT > 2) startRun(); }
}
function advance(dt) {
  if (state === State.PAUSED) return;
  acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; }
  animate(dt);
}
function render(dt) {
  const portrait = innerHeight > innerWidth ? 1.5 : 1, focus = hero.obj ? hero.pos : new THREE.Vector3();
  camera.position.copy(focus).add(CAM_OFFSET.clone().multiplyScalar(portrait));
  shakeAmt = Math.max(0, shakeAmt - dt * 2);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(focus.x, 0, focus.z);
  sun.position.set(focus.x - 8, 20, focus.z + 10); sun.target.position.set(focus.x, 0, focus.z); heroLight.position.set(focus.x, 3.2, focus.z);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n(); $('hint').textContent = t(isTouch ? 'hintTouch' : 'hintDesktop');
  initAudio();
  let floorImg = null;
  const loads = [...Object.keys(ASSETS.models).map((id) => track(loadModel(id))), ...Object.entries(ASSETS.sfx).map(([k, u]) => track(loadSfx(k, u))),
    track(new Promise((res) => { const im = new Image(); im.onload = () => { floorImg = im; res(); }; im.onerror = res; im.src = ASSETS.floor; }))];
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 20000))]);
  const saved = loadData(SAVE_KEY, null);
  if (saved) save = { ...save, ...saved, meta: { ...(saved.meta || {}) } };
  if (CAPTURE) save.hero = params.get('hero') || 'shaman';
  buildWorld(floorImg); resize();
  run = { hero: save.hero, time: 0 }; recomputeStats(); makeHero(save.hero); hero.pos.set(0, 0, 4); hero.obj.position.copy(hero.pos);
  renderHeroes();
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  setState(State.MENU);
  if (CAPTURE) {
    window.__game = {
      start: () => startRun(),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) advance(STEP); },
      info: () => ({ state, time: run?.time, level: run?.level, kills: run?.kills, hp: hero.hp, foes: foes.length, owned: { ...owned } }),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
