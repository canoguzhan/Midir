// Rune Mahjong 3D: tap free rune tiles from layered 3D piles into a 7-slot tray; three of a kind vanish.
// Sections: CONFIG, I18N, SDK, AUDIO, ASSETS, WORLD, LEVELS, TRAY, INPUT, STATE, GAMEPLAY, LOOP, BOOT.
// Every level is generated from a seed and is always solvable. Static bundle: no API keys, no backend calls.
import * as THREE from 'three';

// ================================================================ CONFIG
const SAVE_KEY = 'rune-mahjong-3d';
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot plays by itself (trailer footage, balance tests)

const TILE = { w: 1.0, d: 1.3, h: 0.42 };
const TRAY_SIZE = 7;
const FLY_TIME = 0.26;
const COMBO_WINDOW = 3.2; // seconds between matches that keep a combo going
const BOOSTERS = { undo: { cost: 60, start: 2 }, hint: { cost: 90, start: 2 }, shuffle: { cost: 70, start: 1 } };
const FACES = [
  'icon_coin', 'icon_elixir', 'icon_gem', 'icon_gold', 'icon_potion_hp', 'icon_trophy', 'item_blade', 'item_cursedblade',
  'item_dragonplate', 'item_dragonsword', 'item_goldbracelet', 'item_jadefan', 'item_jaderobe', 'item_knighthelm',
  'item_leatherboots', 'item_phoenixbell', 'item_potion_hp', 'item_potion_mp', 'item_rubynecklace', 'item_sapphireearrings',
  'item_soulreaver', 'item_tome', 'item_towershield', 'item_viperblade', 'skill_assassin_3', 'skill_shaman_1', 'skill_shaman_2',
  'skill_shaman_4', 'skill_sura_2', 'skill_warrior_4',
];
const FACE_URL = (name) => `assets/visuals/${name}.webp`;
const ASSETS = {
  sfx: {
    tap: 'assets/audio/rune_tile_tap.mp3', land: 'assets/audio/stack_drop.mp3', match: 'assets/audio/rune_match.mp3', coin: 'assets/audio/coin.mp3',
    warn: 'assets/audio/rune_tray_warn.mp3', win: 'assets/audio/victory.mp3', lose: 'assets/audio/defeat.mp3', click: 'assets/audio/ui_click.mp3',
    magic: 'assets/audio/portal.mp3', undo: 'assets/audio/card_pick.mp3', shuffle: 'assets/audio/potion.mp3', star: 'assets/audio/level_up.mp3',
  },
  music: { play: 'assets/audio/bgm_sanctuary.mp3', menu: 'assets/audio/bgm_menu.mp3' },
  voice: { great: 'assets/audio/voice/rune_great_{lang}.mp3', excellent: 'assets/audio/voice/rune_excellent_{lang}.mp3', legendary: 'assets/audio/voice/rune_legendary_{lang}.mp3' },
};

// ================================================================ I18N (English required; Turkish included)
const STRINGS = {
  en: {
    level: 'Level', tilesLeft: 'Tiles', play: 'Play', paused: 'Paused', resume: 'Resume', restart: 'Restart level', menu: 'Menu',
    cleared: 'Level cleared!', next: 'Next level', double: '▶ Double coins', full: 'Tray full!', fullSub: 'No more room for runes.',
    retry: 'Try again', undo: 'Undo', hint: 'Magic', shuffle: 'Shuffle', useUndo: 'Use Undo ({n} left)',
    howto: 'Tap free tiles to move them to the tray. Three of a kind vanish. Don\'t let the tray fill up!',
    noGold: 'Not enough coins', noHint: 'No magic move right now', nothingUndo: 'Nothing to undo', trayBusy: 'Wait for the tray',
    doubled: 'Coins doubled!', adUnavailable: 'Ad not available right now', combo: 'Combo ×{n}', great: 'Great!', excellent: 'Excellent!', legendary: 'Legendary!',
  },
  tr: {
    level: 'Seviye', tilesLeft: 'Taş', play: 'Oyna', paused: 'Duraklatıldı', resume: 'Devam', restart: 'Seviyeyi yeniden başlat', menu: 'Menü',
    cleared: 'Seviye tamamlandı!', next: 'Sonraki seviye', double: '▶ Altınları ikiye katla', full: 'Tepsi doldu!', fullSub: 'Rünlere yer kalmadı.',
    retry: 'Tekrar dene', undo: 'Geri al', hint: 'Sihir', shuffle: 'Karıştır', useUndo: 'Geri al kullan ({n} kaldı)',
    howto: 'Serbest taşlara dokunup tepsiye gönder. Üç aynı taş yok olur. Tepsiyi doldurma!',
    noGold: 'Yeterli altın yok', noHint: 'Şu an sihirli hamle yok', nothingUndo: 'Geri alınacak hamle yok', trayBusy: 'Tepsiyi bekle',
    doubled: 'Altınlar ikiye katlandı!', adUnavailable: 'Şu anda reklam yok', combo: 'Kombo ×{n}', great: 'Harika!', excellent: 'Mükemmel!', legendary: 'Efsanevi!',
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
const adsAvailable = () => sdkReady() && !adsFailed && !!crazySdk.ad && !CAPTURE;
function sdkCall(fn) { if (!sdkReady()) return; try { fn(crazySdk); } catch (e) { console.warn('[CrazyGames]', e); } }
function sdkLocale() { if (!sdkReady()) return null; try { return crazySdk.user?.systemInfo?.locale || null; } catch { return null; } }
function applySdkSettings(s) { if (s?.muteAudio) muteAudio('sdk'); else unmuteAudio('sdk'); } // platform mute overrides everything

function onGameplayStart() { if (gameplayActive) return; gameplayActive = true; sdkCall((s) => s.game.gameplayStart()); }
function onGameplayStop() { if (!gameplayActive) return; gameplayActive = false; sdkCall((s) => s.game.gameplayStop()); }
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: perfect 3-star clears on milestone levels

// Midgame: only between levels (on "Next level"), never on navigation buttons; mute on adStarted; always continue.
function triggerMidgameAd(onComplete) {
  if (!adsAvailable()) { onComplete?.(); return; }
  blockUI(true);
  const done = () => { unmuteAudio('ad'); blockUI(false); onComplete?.(); };
  try { crazySdk.ad.requestAd('midgame', { adStarted: () => muteAudio('ad'), adFinished: done, adError: done }); } catch { done(); }
}
// Rewarded: optional, only on the level-cleared screen, reward only on adFinished; hidden for the session after an error.
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
  tap: ['triangle', 900, 700, 0.06, 0.12], land: ['sine', 500, 380, 0.07, 0.1], match: ['sine', 700, 1700, 0.35, 0.14], coin: ['square', 1320, 1980, 0.1, 0.06],
  warn: ['sawtooth', 300, 200, 0.3, 0.08], win: ['triangle', 520, 1300, 0.7, 0.14], lose: ['triangle', 440, 110, 0.8, 0.16], click: ['square', 900, 900, 0.03, 0.06],
  magic: ['sine', 400, 1600, 0.5, 0.12], undo: ['sine', 800, 400, 0.15, 0.1], shuffle: ['triangle', 300, 900, 0.4, 0.1], star: ['sine', 900, 1800, 0.25, 0.12],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, musicKey: null, wantMusic: false, muted: new Set(), voices: 0 };
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
function playSfx(key, vol = 1, rate = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 14 || CAPTURE) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime;
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08); g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0 * rate, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function playMusic(key) {
  audio.wantMusic = true;
  if (audio.musicKey !== key) {
    audio.music?.pause(); audio.musicKey = key; audio.music = null;
    if (ASSETS.music[key]) { audio.music = new Audio(ASSETS.music[key]); audio.music.loop = true; audio.music.volume = 0.3; audio.music.onerror = () => { audio.music = null; }; }
  }
  if (audio.music && !audio.muted.size && !CAPTURE) audio.music.play().catch(() => {});
}
function playVoice(key) {
  if (audio.muted.size || CAPTURE || !ASSETS.voice[key]) return;
  const a = new Audio(ASSETS.voice[key].replace('{lang}', STRINGS[lang] ? lang : 'en')); a.volume = 0.9; a.play().catch(() => {});
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic && !CAPTURE) audio.music.play().catch(() => {}); }
}

// ================================================================ ASSETS (tile face textures: icon on carved ivory, procedural rune fallback)
const $ = (id) => document.getElementById(id);
let loadTotal = 0, loadDone = 0;
function track(p) { loadTotal++; return p.finally(() => { loadDone++; $('loadBar').style.width = `${(100 * loadDone) / loadTotal}%`; }); }
const faceImg = {}, faceTex = [];
const RUNE_COLORS = ['#e5484d', '#3fd0a8', '#5b8cff', '#ffb224', '#b36bff', '#ff7ab6', '#4cc3ff', '#9fd356'];
function loadFace(i) {
  return new Promise((res) => { const im = new Image(); im.onload = () => { faceImg[i] = im; res(); }; im.onerror = () => res(); im.src = FACE_URL(FACES[i]); });
}
function makeFaceTexture(i) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 333; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#fff8e7'); g.addColorStop(1, '#e6d6ad');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#b89a5c'; x.lineWidth = 8; roundRect(x, 10, 10, c.width - 20, c.height - 20, 24); x.stroke();
  const pad = 26, s = c.width - pad * 2, top = (c.height - s) / 2;
  x.save(); roundRect(x, pad, top, s, s, 22); x.clip();
  if (faceImg[i]) x.drawImage(faceImg[i], pad, top, s, s);
  else { // procedural rune: coloured disc + glyph, so the game is playable without the icon files
    x.fillStyle = '#1b2236'; x.fillRect(pad, top, s, s); x.fillStyle = RUNE_COLORS[i % RUNE_COLORS.length];
    x.beginPath(); x.arc(c.width / 2, c.height / 2, s * 0.36, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = `bold ${s * 0.38}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'[i % 24], c.width / 2, c.height / 2 + 4);
  }
  x.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  faceTex[i] = { tex, url: faceImg[i] ? FACE_URL(FACES[i]) : c.toDataURL() };
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

// ================================================================ WORLD
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const CAM_DIR = new THREE.Vector3(0, 1, 0.42).normalize();
const view = { center: new THREE.Vector3(), dist: 20 };
let shakeAmt = 0;
scene.add(new THREE.HemisphereLight('#fff6e0', '#3a3550', 1.7));
const sun = new THREE.DirectionalLight('#fff1d6', 2.0); sun.position.set(-6, 14, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 40 }); sun.shadow.bias = -0.0008; scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.38 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const tileGeo = (() => { // rounded stone slab, extruded upwards
  const r = 0.14, w = TILE.w * 0.96, d = TILE.d * 0.96, s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); s.lineTo(w / 2, d / 2 - r);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: TILE.h - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.04, 0); return g;
})();
const faceGeo = new THREE.PlaneGeometry(TILE.w * 0.86, TILE.d * 0.86); faceGeo.rotateX(-Math.PI / 2);
const bodyMats = [new THREE.MeshStandardMaterial({ color: '#efe3c4', roughness: 0.55 }), new THREE.MeshStandardMaterial({ color: '#2f9f7f', roughness: 0.45 })];

// pooled particles
const particles = [], pGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
function burst(pos, color, n = 10, speed = 3) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial()); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material.color.set(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.4 + Math.random() * 0.3;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 1.3, (Math.random() - 0.5) * speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 9 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 2.5));
  }
}

// ================================================================ LEVELS (seeded piles; types assigned along a simulated removal order => always solvable)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t2 = Math.imul(a ^ (a >>> 15), 1 | a); t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2; return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; }; }
const SHAPES = {
  rect: () => true,
  diamond: (i, j, c, r) => Math.abs(i - (c - 1) / 2) / ((c + 1) / 2) + Math.abs(j - (r - 1) / 2) / ((r + 1) / 2) <= 1.0,
  cross: (i, j, c, r) => Math.abs(i - (c - 1) / 2) <= c / 5 + 0.6 || Math.abs(j - (r - 1) / 2) <= r / 5 + 0.6,
  twin: (i, j, c) => Math.abs(i - (c - 1) / 2) >= 1,
  ring: (i, j, c, r) => i < 2 || j < 2 || i >= c - 2 || j >= r - 2 || (Math.abs(i - (c - 1) / 2) < 1 && Math.abs(j - (r - 1) / 2) < 1),
};
function levelSpec(n) {
  const fixed = [[4, 3, 2, 'rect', 4], [5, 4, 2, 'rect', 6], [5, 5, 3, 'diamond', 7], [6, 4, 3, 'rect', 8], [7, 5, 3, 'twin', 9], [6, 5, 3, 'cross', 10]];
  if (n <= fixed.length) { const [c, r, l, shape, types] = fixed[n - 1]; return { c, r, l, shape, types }; }
  const R = rng(n * 7919), names = Object.keys(SHAPES);
  return { c: 6 + Math.floor(R() * 3), r: 5 + Math.floor(R() * 2), l: 3 + (n > 12 ? 1 : 0), shape: names[Math.floor(R() * names.length)], types: Math.min(FACES.length, 8 + Math.floor(n / 3)) };
}
function buildLayout(spec, R) {
  let layer = [];
  for (let j = 0; j < spec.r; j++) for (let i = 0; i < spec.c; i++) if (SHAPES[spec.shape](i, j, spec.c, spec.r)) layer.push({ x: i, z: j });
  const tiles = layer.map((p) => ({ ...p, y: 0 }));
  for (let L = 1; L < spec.l; L++) { // each upper tile sits on the gap between four tiles below (classic offset pile)
    const set = new Set(layer.map((p) => `${p.x},${p.z}`)), next = [];
    for (const p of layer) {
      const q = { x: p.x + 0.5, z: p.z + 0.5 };
      if (set.has(`${p.x + 1},${p.z}`) && set.has(`${p.x},${p.z + 1}`) && set.has(`${p.x + 1},${p.z + 1}`) && R() < 0.92) next.push(q);
    }
    if (!next.length) break;
    tiles.push(...next.map((p) => ({ ...p, y: L }))); layer = next;
  }
  while (tiles.length % 3) { // trim from the highest layer until the count is a multiple of three
    const top = Math.max(...tiles.map((tl) => tl.y)), cands = tiles.filter((tl) => tl.y === top);
    tiles.splice(tiles.indexOf(cands[Math.floor(R() * cands.length)]), 1);
  }
  return tiles;
}
function linkCover(tiles) { // coveredBy: tiles one or more layers up whose footprint overlaps this one
  for (const a of tiles) a.coveredBy = tiles.filter((b) => b.y > a.y && Math.abs(b.x - a.x) < 0.99 && Math.abs(b.z - a.z) < 0.99);
}
// Simulate a legal clearing: each step removes one triple and gives it one face. A "together" triple is three tiles
// that are free at the same moment (always findable); a "spread" triple is removed one tile at a time, so its later
// members are buried under the first. Following the simulated order never needs more than 3 tray slots => solvable.
function assignTypes(tiles, typeCount, spread, R) {
  const left = new Set(tiles), freeNow = () => [...left].filter((tl) => tl.coveredBy.every((c) => !left.has(c)));
  const pool = [...Array(FACES.length).keys()].sort(() => R() - 0.5).slice(0, typeCount);
  let bag = [];
  while (left.size) {
    if (!bag.length) bag = [...pool].sort(() => R() - 0.5);
    const type = bag.pop();
    let free = freeNow();
    if (free.length >= 3 && R() >= spread) {
      for (let k = 0; k < 3; k++) { const tl = free.splice(Math.floor(R() * free.length), 1)[0]; tl.type = type; left.delete(tl); }
    } else {
      for (let k = 0; k < 3; k++) { free = freeNow(); const tl = free[Math.floor(R() * free.length)]; tl.type = type; left.delete(tl); }
    }
  }
}

// ================================================================ TRAY
const tray = []; // { type, el, landed, removing }
const flyers = [];
function slotRect(idx) {
  const el = document.querySelector('#tray .slots').children[idx]?.getBoundingClientRect();
  return el || { left: innerWidth / 2, top: innerHeight - 100, width: 60, height: 70 };
}
function layoutTray() { tray.forEach((e, i) => { e.el.style.left = `${i * (slotRect(0).width + 6)}px`; }); }
function trayInsert(type) {
  let idx = tray.length;
  for (let i = tray.length - 1; i >= 0; i--) if (tray[i].type === type && !tray[i].removing) { idx = i + 1; break; }
  const el = document.createElement('div'); el.className = 'ttile'; el.style.visibility = 'hidden';
  const img = document.createElement('img'); img.src = faceTex[type].url; img.alt = ''; el.appendChild(img);
  document.querySelector('#tray .items').appendChild(el);
  const e = { type, el, landed: false, removing: false };
  tray.splice(idx, 0, e); layoutTray(); return e;
}
function flyTo(tile, entry) {
  const p = tile.mesh.position.clone().setY(tile.mesh.position.y + TILE.h); p.project(camera);
  const sx = ((p.x + 1) / 2) * innerWidth, sy = ((1 - p.y) / 2) * innerHeight;
  const el = document.createElement('div'); el.className = 'flyer'; const img = document.createElement('img'); img.src = faceTex[tile.type].url; el.appendChild(img);
  document.body.appendChild(el);
  flyers.push({ el, entry, sx, sy, t: 0 });
}
function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt;
    const idx = tray.indexOf(f.entry), r = slotRect(Math.max(0, idx)), k = Math.min(1, f.t / FLY_TIME), e = 1 - Math.pow(1 - k, 3);
    const w = r.width, x = f.sx - w / 2 + (r.left - (f.sx - w / 2)) * e, y = f.sy - w * 0.6 + (r.top - (f.sy - w * 0.6)) * e - Math.sin(k * Math.PI) * 60;
    f.el.style.transform = `translate(${x}px, ${y}px) scale(${1.15 - 0.15 * e})`;
    if (k >= 1) { f.el.remove(); flyers.splice(i, 1); f.entry.landed = true; f.entry.el.style.visibility = ''; playSfx('land', 0.5); resolveTray(); }
  }
}
function resolveTray() {
  const counts = {};
  for (const e of tray) if (e.landed && !e.removing) counts[e.type] = (counts[e.type] || 0) + 1;
  const type = Object.keys(counts).find((k) => counts[k] >= 3);
  if (type !== undefined) {
    const group = tray.filter((e) => e.type === +type && e.landed && !e.removing).slice(0, 3);
    for (const e of group) { e.removing = true; e.el.classList.add('pop'); }
    run.removeT = 0.22; run.pendingRemove = group;
    onMatch(group);
    return;
  }
  if (tray.length >= TRAY_SIZE && tray.every((e) => e.landed) && !flyers.length) { run.loseT = 0.45; $('tray').classList.add('warn'); playSfx('warn'); }
  else if (tray.length >= TRAY_SIZE - 1) { $('tray').classList.remove('warn'); void $('tray').offsetWidth; $('tray').classList.add('warn'); playSfx('warn', 0.5); }
}
function finishRemoval() {
  for (const e of run.pendingRemove) { e.el.remove(); tray.splice(tray.indexOf(e), 1); }
  run.pendingRemove = null; layoutTray(); resolveTray(); checkWin();
}
function clearTray() { for (const e of tray) e.el.remove(); tray.length = 0; for (const f of flyers) f.el.remove(); flyers.length = 0; $('tray').classList.remove('warn'); }

// ================================================================ INPUT (tap/click tiles, hover lift, keyboard shortcuts)
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hover = null;
function tileAt(e) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(board.filter((tl) => !tl.gone).map((tl) => tl.mesh), true)[0];
  if (!hit) return null;
  let o = hit.object; while (o && !o.userData.tile) o = o.parent; return o?.userData.tile || null;
}
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING || AUTOPLAY) return;
  const tl = tileAt(e); if (tl) pickTile(tl);
});
canvas.addEventListener('pointermove', (e) => {
  if (state !== State.PLAYING || e.pointerType !== 'mouse') return;
  const tl = tileAt(e); hover = tl && isFree(tl) ? tl : null; canvas.style.cursor = hover ? 'pointer' : '';
});
addEventListener('keydown', (e) => {
  if (e.repeat) return; unlockAudio();
  if (state === State.PLAYING) {
    if (e.code === 'KeyU' || e.code === 'KeyZ') useBooster('undo');
    if (e.code === 'KeyH' || e.code === 'KeyM') useBooster('hint');
    if (e.code === 'KeyS') useBooster('shuffle');
  }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (state === State.MENU) $('btnPlay').click(); else if (state === State.WIN) $('btnNext').click(); else if (state === State.LOSE) $('btnRetry').click();
  }
});

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> WIN | LOSE)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', WIN: 'WIN', LOSE: 'LOSE' };
let state = State.BOOT, run = null;
let save = { level: 1, coins: 0, boosters: { undo: BOOSTERS.undo.start, hint: BOOSTERS.hint.start, shuffle: BOOSTERS.shuffle.start }, stars: {} };
function setState(s) {
  state = s;
  for (const id of ['menu', 'paused', 'win', 'lose']) $(id).hidden = s !== State[id.toUpperCase()];
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED || s === State.WIN || s === State.LOSE);
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop();
  if (s === State.MENU) { playMusic('menu'); document.querySelectorAll('.menuLevel').forEach((el) => { el.textContent = save.level; }); document.querySelectorAll('.menuCoins').forEach((el) => { el.textContent = save.coins; }); }
}
function togglePause() { if (state === State.PLAYING) setState(State.PAUSED); else if (state === State.PAUSED) setState(State.PLAYING); }
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { if (AUTOPLAY) return; const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1800); }
function floatText(x, y, text) { const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.left = `${x}px`; el.style.top = `${y}px`; $('fx').appendChild(el); setTimeout(() => el.remove(), 900); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

click('btnPlay', () => startLevel(save.level));
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnRestart', () => startLevel(run.level));
click('btnQuit', () => { setState(State.MENU); previewLevel(save.level); });
click('btnLoseMenu', () => { setState(State.MENU); previewLevel(save.level); });
click('btnRetry', () => startLevel(run.level));
click('btnNext', () => triggerMidgameAd(() => startLevel(save.level))); // between levels: the natural midgame break
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.coins += run.reward; run.reward *= 2; $('winCoins').textContent = run.reward; saveData(SAVE_KEY, save); updateHud(); toast(t('doubled')); playSfx('coin'); }, () => {});
});
click('btnLoseUndo', () => { if (useBooster('undo', true)) { $('tray').classList.remove('warn'); setState(State.PLAYING); } });
for (const key of Object.keys(BOOSTERS)) $(`b${key[0].toUpperCase()}${key.slice(1)}`).addEventListener('click', () => { unlockAudio(); useBooster(key); });

// ================================================================ GAMEPLAY
let board = [];
const boardGroup = new THREE.Group(); scene.add(boardGroup);
function tilePos(tl) { return new THREE.Vector3(tl.x * TILE.w, tl.y * (TILE.h + 0.02), tl.z * TILE.d); }
function buildBoard(level) {
  for (const tl of board) boardGroup.remove(tl.mesh);
  const spec = levelSpec(level), R = rng(level * 104729 + 17);
  board = buildLayout(spec, R); linkCover(board); assignTypes(board, spec.types, level <= 5 ? 0 : Math.min(0.35, (level - 5) * 0.025), R);
  const xs = board.map((tl) => tl.x * TILE.w), zs = board.map((tl) => tl.z * TILE.d);
  const off = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  for (const tl of board) {
    const m = new THREE.Group(), body = new THREE.Mesh(tileGeo, bodyMats[tl.y % 2 ? 1 : 0]);
    body.castShadow = body.receiveShadow = true;
    const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: faceTex[tl.type].tex, roughness: 0.6 })); face.position.y = TILE.h + 0.005;
    m.add(body, face); m.position.copy(tilePos(tl)).sub(off); m.userData.tile = tl;
    tl.mesh = m; tl.face = face; tl.gone = false; tl.lift = 0; tl.base = m.position.y; boardGroup.add(m);
  }
  const w = Math.max(...xs) - Math.min(...xs) + TILE.w, d = Math.max(...zs) - Math.min(...zs) + TILE.d;
  view.size = { w, d }; fitCamera(); refreshFree();
}
function fitCamera() {
  if (!view.size) return;
  const { w, d } = view.size, vfov = THREE.MathUtils.degToRad(camera.fov), aspect = camera.aspect;
  const usableH = 0.62, usableW = 0.92; // leave room for the HUD on top and the tray + boosters below
  const distH = (d * 0.95 + 1.2) / (2 * Math.tan(vfov / 2) * usableH), distW = (w + 0.8) / (2 * Math.tan(vfov / 2) * aspect * usableW);
  view.dist = Math.max(distH, distW, 8);
  view.center.set(0, 0, d * 0.05 + view.dist * 0.07); // nudge the board up the screen, above the tray
}
const isFree = (tl) => !tl.gone && tl.coveredBy.every((c) => c.gone);
function refreshFree() {
  for (const tl of board) if (!tl.gone) tl.face.material.color.set(isFree(tl) ? '#ffffff' : '#7d7a74');
  $('tilesLeft').textContent = board.filter((tl) => !tl.gone).length;
}
function previewLevel(level) { buildBoard(level); clearTray(); }
function startLevel(level) {
  clearTray(); buildBoard(level);
  run = { level, time: 0, history: [], combo: 0, lastMatch: -99, reward: 0, removeT: 0, pendingRemove: null, loseT: 0, winT: 0, botT: 0.6 };
  $('levelNum').textContent = level; $('btnLoseUndo').hidden = true; updateHud();
  setState(State.PLAYING); playMusic('play');
}
function updateHud() {
  $('coins').textContent = save.coins;
  for (const [key, def] of Object.entries(BOOSTERS)) {
    const n = save.boosters[key] || 0, badge = $(`b${key[0].toUpperCase()}${key.slice(1)}`).querySelector('.count');
    badge.textContent = n > 0 ? n : `${def.cost}`; badge.classList.toggle('buy', n <= 0);
  }
}
function pickTile(tl) {
  if (!isFree(tl) || run.loseT > 0) return false;
  if (tray.length >= TRAY_SIZE) { toast(t('trayBusy')); return false; }
  tl.gone = true; boardGroup.remove(tl.mesh);
  const entry = trayInsert(tl.type); flyTo(tl, entry); run.history.push({ tile: tl, entry });
  burst(tl.mesh.position.clone().setY(tl.mesh.position.y + TILE.h), '#fff3c4', 6, 2.5);
  playSfx('tap', 0.8); refreshFree(); hover = null;
  return true;
}
function onMatch(group) {
  run.combo = run.time - run.lastMatch < COMBO_WINDOW ? run.combo + 1 : 1; run.lastMatch = run.time;
  const gain = 3 + Math.min(run.combo, 8);
  save.coins += gain; run.reward += gain; updateHud();
  playSfx('match', 0.9, 1 + Math.min(run.combo - 1, 6) * 0.05); playSfx('coin', 0.4);
  const r = group[1].el.getBoundingClientRect(); floatText(r.left + r.width / 2, r.top - 10, `+${gain}`);
  if (run.combo >= 2) {
    const el = $('combo'), word = run.combo >= 8 ? 'legendary' : run.combo >= 5 ? 'excellent' : run.combo >= 3 ? 'great' : null;
    el.textContent = word ? `${t(word)} ${t('combo', { n: run.combo })}` : t('combo', { n: run.combo });
    el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 1100);
    if ([3, 5, 8].includes(run.combo)) playVoice(word);
    shake(0.06 + Math.min(run.combo, 8) * 0.015);
  }
}
function checkWin() {
  if (state !== State.PLAYING || board.some((tl) => !tl.gone) || tray.length || flyers.length) return;
  run.winT = 0.5;
}
function win() {
  const par = board.length * 1.5, stars = run.time <= par ? 3 : run.time <= par * 1.7 ? 2 : 1;
  const bonus = 10 + run.level * 2 + stars * 5;
  save.coins += bonus; run.reward += bonus;
  save.stars[run.level] = Math.max(save.stars[run.level] || 0, stars);
  if (run.level >= save.level) save.level = run.level + 1;
  saveData(SAVE_KEY, save); updateHud();
  document.querySelectorAll('#win .stars i').forEach((el, i) => { el.className = i < stars ? 'on' : ''; });
  $('winCoins').textContent = run.reward; $('btnDouble').hidden = !(adsAvailable() && run.reward > 0);
  playSfx('win'); setTimeout(() => playSfx('star', 0.7), 300);
  if (stars === 3 && run.level % 5 === 0 && !CAPTURE) happytime();
  setState(State.WIN);
}
function lose() {
  playSfx('lose', 0.8); setState(State.LOSE);
  const n = save.boosters.undo || 0, b = $('btnLoseUndo');
  b.hidden = n <= 0 || !run.history.some((h) => tray.includes(h.entry)); b.textContent = t('useUndo', { n });
}
function useBooster(key, fromLose = false) {
  if (!run || (state !== State.PLAYING && !fromLose) || flyers.length || run.pendingRemove) return false;
  const have = save.boosters[key] || 0, cost = BOOSTERS[key].cost;
  if (have <= 0 && save.coins < cost) { toast(t('noGold')); return false; }
  const ok = key === 'undo' ? doUndo() : key === 'hint' ? doHint() : doShuffle();
  if (!ok) return false;
  if (have > 0) save.boosters[key] = have - 1; else save.coins -= cost;
  if (!AUTOPLAY) saveData(SAVE_KEY, save); updateHud(); return true;
}
function doUndo() {
  for (let i = run.history.length - 1; i >= 0; i--) {
    const h = run.history[i];
    if (!tray.includes(h.entry) || h.entry.removing || !h.entry.landed) continue;
    tray.splice(tray.indexOf(h.entry), 1); h.entry.el.remove(); layoutTray(); run.history.splice(i, 1);
    h.tile.gone = false; boardGroup.add(h.tile.mesh); h.tile.lift = 0.6; run.loseT = 0;
    playSfx('undo'); refreshFree(); return true;
  }
  toast(t('nothingUndo')); return false;
}
function doHint() { // "Magic": completes a triple automatically if the needed tiles are free
  const free = board.filter(isFree), inTray = {};
  for (const e of tray) if (!e.removing) inTray[e.type] = (inTray[e.type] || 0) + 1;
  const freeBy = {}; for (const tl of free) (freeBy[tl.type] ??= []).push(tl);
  const space = TRAY_SIZE - tray.length;
  const cands = Object.keys(freeBy).map(Number).map((ty) => ({ ty, need: 3 - ((inTray[ty] || 0) % 3) })).filter((c) => freeBy[c.ty].length >= c.need && c.need <= space).sort((a, b) => a.need - b.need);
  if (!cands.length) { toast(t('noHint')); return false; }
  const { ty, need } = cands[0];
  playSfx('magic'); freeBy[ty].slice(0, need).forEach((tl, i) => setTimeout(() => pickTile(tl), CAPTURE ? 0 : i * 90));
  return true;
}
function doShuffle() {
  const left = board.filter((tl) => !tl.gone);
  if (left.length < 2) return false;
  const types = left.map((tl) => tl.type).sort(() => Math.random() - 0.5);
  left.forEach((tl, i) => { tl.type = types[i]; tl.face.material.map = faceTex[tl.type].tex; tl.face.material.needsUpdate = true; tl.lift = 0.5; });
  playSfx('shuffle'); shake(0.1); refreshFree(); return true;
}
function botMove() { // plays like a sensible human: complete what it can, otherwise dig, use Magic when the tray gets tight
  const free = board.filter(isFree); if (!free.length || tray.length >= TRAY_SIZE || run.pendingRemove) return;
  const inTray = {}; for (const e of tray) if (!e.removing) inTray[e.type] = (inTray[e.type] || 0) + 1;
  const freeBy = {}; for (const tl of free) (freeBy[tl.type] ??= []).push(tl);
  const completable = Object.keys(freeBy).map(Number).filter((ty) => (inTray[ty] || 0) + freeBy[ty].length >= 3)
    .sort((a, b) => (inTray[b] || 0) - (inTray[a] || 0) || Math.random() - 0.5);
  if (completable.length) { pickTile(freeBy[completable[0]][0]); return; }
  if (tray.length >= TRAY_SIZE - 3 && useBooster('hint')) return;
  const covers = (tl) => board.filter((o) => !o.gone && o.coveredBy.includes(tl)).length; // tiles this one is holding down
  const dig = free.map((tl) => ({ tl, s: covers(tl) * 3 + (inTray[tl.type] ? 4 : 0) + Math.random() })).sort((a, b) => b.s - a.s)[0];
  pickTile(dig.tl);
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

function step(dt) {
  if (state !== State.PLAYING || !run) return;
  run.time += dt;
  if (run.removeT > 0) { run.removeT -= dt; if (run.removeT <= 0 && run.pendingRemove) finishRemoval(); }
  if (run.loseT > 0) { run.loseT -= dt; if (run.loseT <= 0) { if (AUTOPLAY) { startLevel(run.level); return; } lose(); return; } }
  if (run.winT > 0) { run.winT -= dt; if (run.winT <= 0) { win(); return; } }
  if (AUTOPLAY) { run.botT -= dt; if (run.botT <= 0) { run.botT = 0.42; botMove(); } }
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, autoNextT = 0;
function animate(dt) {
  updateParticles(dt); updateFlyers(dt);
  for (const tl of board) {
    if (tl.gone) continue;
    const want = tl === hover ? 0.12 : 0; tl.lift += (want - tl.lift) * Math.min(1, dt * 14);
    tl.mesh.position.y = tl.base + Math.max(0, tl.lift);
  }
  if (AUTOPLAY && state === State.WIN) { autoNextT += dt; if (autoNextT > 1.6) { autoNextT = 0; startLevel(save.level); } }
}
function advance(dt) {
  if (state === State.PAUSED) return;
  acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; }
  animate(dt);
}
function render(dt) {
  shakeAmt = Math.max(0, shakeAmt - dt * 1.5);
  camera.position.copy(view.center).addScaledVector(CAM_DIR, view.dist);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.z += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(view.center);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); fitCamera(); layoutTray(); }
addEventListener('resize', resize);

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n();
  document.querySelector('#tray .slots').innerHTML = '<i></i>'.repeat(TRAY_SIZE);
  initAudio();
  const loads = [...FACES.map((_, i) => track(loadFace(i))), ...Object.entries(ASSETS.sfx).map(([k, u]) => track(loadSfx(k, u)))];
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 20000))]);
  FACES.forEach((_, i) => makeFaceTexture(i));
  const saved = loadData(SAVE_KEY, null);
  if (saved) save = { ...save, ...saved, boosters: { ...save.boosters, ...(saved.boosters || {}) }, stars: saved.stars || {} };
  resize(); updateHud(); previewLevel(save.level);
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  setState(State.MENU);
  if (CAPTURE) {
    window.__game = {
      start: () => startLevel(save.level),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) advance(STEP); },
      info: () => ({ state, level: run?.level, tiles: board.filter((tl) => !tl.gone).length, tray: tray.length, coins: save.coins, time: run?.time }),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
