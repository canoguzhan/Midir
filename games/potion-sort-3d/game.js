// Potion Sort 3D: pour layered potions between glass flasks until every flask holds a single color.
// Sections: CONFIG, I18N, SDK, AUDIO, WORLD, LEVELS (generator + solver), FLASKS, INPUT, STATE, GAMEPLAY, LOOP, BOOT.
// Every level is checked by the solver before it is dealt. Static bundle: no API keys, no backend calls.
import * as THREE from 'three';

// ================================================================ CONFIG
const SAVE_KEY = 'potion-sort-3d';
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // the solver plays by itself (trailer footage, balance tests)

const CAP = 4, LAYER_H = 0.46, FLASK_R = 0.42, FLASK_H = CAP * LAYER_H + 0.62, GAP_X = 1.5, GAP_Y = FLASK_H + 1.1;
const POUR = { move: 0.24, flow: 0.42, back: 0.22 };
const COLORS = ['#e8413c', '#ff9f1a', '#ffe14d', '#9be34b', '#1fbf6b', '#19d3c5', '#2f80ff', '#5b3df5', '#b04df0', '#ff5fb4', '#9a5b2e', '#f3f0ea'];
const BOOSTERS = { undo: { cost: 40, start: 3 }, hint: { cost: 60, start: 2 }, flask: { cost: 90, start: 1 } };
const ASSETS = {
  sfx: {
    pour: 'assets/audio/potion_pour.mp3', cork: 'assets/audio/potion_cork.mp3', complete: 'assets/audio/potion_complete.mp3', pick: 'assets/audio/pop.mp3',
    bad: 'assets/audio/card_pick.mp3', coin: 'assets/audio/coin.mp3', win: 'assets/audio/victory.mp3', star: 'assets/audio/level_up.mp3',
    click: 'assets/audio/ui_click.mp3', magic: 'assets/audio/portal.mp3', brew: 'assets/audio/brew.mp3', undo: 'assets/audio/potion.mp3',
  },
  music: { play: 'assets/audio/bgm_alchemy.mp3', menu: 'assets/audio/bgm_menu.mp3' },
  voice: { great: 'assets/audio/voice/rune_great_{lang}.mp3', excellent: 'assets/audio/voice/rune_excellent_{lang}.mp3' },
};

// ================================================================ I18N (English required; Turkish included)
const STRINGS = {
  en: {
    level: 'Level', moves: 'Moves', play: 'Play', paused: 'Paused', resume: 'Resume', restart: 'Restart level', restartShort: 'Restart', menu: 'Menu',
    cleared: 'Potions sorted!', next: 'Next level', double: '▶ Double coins', undo: 'Undo', hint: 'Hint', flask: '+ Flask',
    stuck: 'No moves left!', stuckSub: 'Undo a few pours, add an extra flask, or start over.', movesUsed: 'Solved in {n} moves',
    howto: 'Tap a flask, then tap another to pour. Liquid only lands on the same color or in an empty flask. Sort every flask to one color!',
    howtoKeys: 'Click a flask, then another to pour (or press its number key). U: undo · H: hint · F: extra flask · R: restart',
    noGold: 'Not enough coins', nothingUndo: 'Nothing to undo', noSolution: 'No solution from here: undo or add a flask', flaskUsed: 'Only one extra flask per level',
    doubled: 'Coins doubled!', adUnavailable: 'Ad not available right now', cantPour: 'Can\'t pour there', levelBanner: 'Level {n}',
  },
  tr: {
    level: 'Seviye', moves: 'Hamle', play: 'Oyna', paused: 'Duraklatıldı', resume: 'Devam', restart: 'Seviyeyi yeniden başlat', restartShort: 'Baştan', menu: 'Menü',
    cleared: 'İksirler ayrıldı!', next: 'Sonraki seviye', double: '▶ Altınları ikiye katla', undo: 'Geri al', hint: 'İpucu', flask: '+ Şişe',
    stuck: 'Hamle kalmadı!', stuckSub: 'Birkaç dökmeyi geri al, fazladan şişe ekle ya da baştan başla.', movesUsed: '{n} hamlede çözüldü',
    howto: 'Bir şişeye, sonra diğerine dokunarak dök. Sıvı yalnızca aynı rengin üstüne ya da boş şişeye dökülür. Her şişeyi tek renk yap!',
    howtoKeys: 'Bir şişeye, sonra diğerine tıkla (ya da numarasına bas). U: geri al · H: ipucu · F: fazladan şişe · R: baştan',
    noGold: 'Yeterli altın yok', nothingUndo: 'Geri alınacak hamle yok', noSolution: 'Buradan çözüm yok: geri al ya da şişe ekle', flaskUsed: 'Seviye başına bir fazladan şişe',
    doubled: 'Altınlar ikiye katlandı!', adUnavailable: 'Şu anda reklam yok', cantPour: 'Buraya dökülemez', levelBanner: 'Seviye {n}',
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
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: perfect clears of milestone levels

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
  pour: ['sine', 300, 160, 0.4, 0.12], cork: ['square', 900, 500, 0.06, 0.1], complete: ['sine', 700, 1700, 0.4, 0.14], pick: ['sine', 520, 980, 0.07, 0.15],
  bad: ['sawtooth', 220, 150, 0.15, 0.08], coin: ['square', 1320, 1980, 0.1, 0.06], win: ['triangle', 520, 1300, 0.7, 0.14], star: ['sine', 900, 1800, 0.25, 0.12],
  click: ['square', 900, 900, 0.03, 0.06], magic: ['sine', 400, 1600, 0.5, 0.12], brew: ['triangle', 300, 600, 0.4, 0.1], undo: ['sine', 800, 400, 0.15, 0.1],
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

// ================================================================ WORLD
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
const view = { look: new THREE.Vector3(), pos: new THREE.Vector3(0, 2, 14), bounds: { w: 6, h: 4, cy: 1 } };
let shakeAmt = 0;
scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a30', 1.6));
const key = new THREE.DirectionalLight('#ffe6c2', 2.2); key.position.set(-4, 8, 10); scene.add(key);
const rimLight = new THREE.DirectionalLight('#9fc8ff', 1.2); rimLight.position.set(6, 4, -6); scene.add(rimLight);

const glassGeo = new THREE.CylinderGeometry(FLASK_R, FLASK_R * 0.96, FLASK_H, 28, 1, true); glassGeo.translate(0, FLASK_H / 2, 0);
const glassMat = new THREE.MeshStandardMaterial({ color: '#d9ecff', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
const baseGeo = new THREE.CylinderGeometry(FLASK_R * 0.98, FLASK_R * 0.98, 0.08, 28); baseGeo.translate(0, 0.04, 0);
const baseMat = new THREE.MeshStandardMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.45, roughness: 0.1 });
const rimGeo = new THREE.TorusGeometry(FLASK_R * 1.02, 0.045, 10, 32); rimGeo.rotateX(Math.PI / 2); rimGeo.translate(0, FLASK_H, 0);
const rimMat = new THREE.MeshStandardMaterial({ color: '#f2f8ff', roughness: 0.2, metalness: 0.3 });
const glowGeo = new THREE.TorusGeometry(FLASK_R * 1.35, 0.05, 8, 40); glowGeo.rotateX(Math.PI / 2); glowGeo.translate(0, 0.03, 0);
const layerGeo = new THREE.CylinderGeometry(FLASK_R * 0.86, FLASK_R * 0.84, LAYER_H, 24); layerGeo.translate(0, LAYER_H / 2, 0);
const corkGeo = new THREE.CylinderGeometry(FLASK_R * 0.75, FLASK_R * 0.62, 0.32, 18); corkGeo.translate(0, FLASK_H - 0.02, 0);
const corkMat = new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.9 });
const liquidMats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 0.28, roughness: 0.25, metalness: 0.05 }));
const streamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8); streamGeo.translate(0, -0.5, 0);
const stream = new THREE.Mesh(streamGeo, liquidMats[0]); stream.visible = false; scene.add(stream);

const particles = [], pGeo = new THREE.SphereGeometry(0.06, 6, 5);
function burst(pos, color, n = 12, speed = 2.5) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial()); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material.color.set(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.5 + Math.random() * 0.4;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 1.4, (Math.random() - 0.5) * speed * 0.6);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 6 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 2.2));
  }
}

// ================================================================ LEVELS (seeded deal + DFS solver; a level is only dealt if solvable)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t2 = Math.imul(a ^ (a >>> 15), 1 | a); t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2; return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; }; }
const top = (f) => f[f.length - 1];
const runLen = (f) => { let n = 0; for (let k = f.length - 1; k >= 0 && f[k] === top(f); k--) n++; return n; };
const isDone = (f) => f.length === 0 || (f.length === CAP && runLen(f) === CAP);
const solved = (s) => s.every(isDone);
const canPour = (s, i, j) => i !== j && s[i].length > 0 && s[j].length < CAP && (s[j].length === 0 || top(s[j]) === top(s[i])) && !(s[i].length === CAP && runLen(s[i]) === CAP);
function usefulMoves(s) { // skips moves that cannot help: a uniform flask into an empty one, several identical empties
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (!s[i].length || isDone(s[i])) continue;
    const uniform = runLen(s[i]) === s[i].length; let triedEmpty = false;
    for (let j = 0; j < s.length; j++) {
      if (!canPour(s, i, j)) continue;
      if (!s[j].length) { if (uniform || triedEmpty) continue; triedEmpty = true; }
      out.push([i, j]);
    }
  }
  return out.sort((a, b) => (s[b[1]].length ? 1 : 0) - (s[a[1]].length ? 1 : 0)); // pour onto matching colors first
}
function pour(s, i, j) { const n = Math.min(runLen(s[i]), CAP - s[j].length); for (let k = 0; k < n; k++) s[j].push(s[i].pop()); return n; }
function solve(start, limit = 120000) {
  const seen = new Set(), path = []; let nodes = 0;
  const keyOf = (s) => s.map((f) => f.join('')).sort().join('|');
  const dfs = (s) => {
    if (solved(s)) return true;
    if (++nodes > limit) return false;
    const k = keyOf(s); if (seen.has(k)) return false; seen.add(k);
    for (const [i, j] of usefulMoves(s)) {
      const ns = s.map((f) => f.slice()); pour(ns, i, j); path.push([i, j]);
      if (dfs(ns)) return true; path.pop();
    }
    return false;
  };
  return dfs(start.map((f) => f.slice())) ? path : null;
}
function colorsFor(level) { return Math.min(COLORS.length, 3 + Math.floor((level - 1) / 2)); }
function dealLevel(level) {
  const k = colorsFor(level);
  for (let attempt = 0; attempt < 60; attempt++) {
    const R = rng(level * 7919 + attempt * 104729 + 13);
    const palette = [...COLORS.keys()].sort(() => R() - 0.5).slice(0, k);
    const pool = palette.flatMap((c) => [c, c, c, c]).sort(() => R() - 0.5);
    const flasks = Array.from({ length: k }, (_, i) => pool.slice(i * CAP, i * CAP + CAP)).concat([[], []]);
    if (flasks.some((f) => f.length && isDone(f))) continue; // no flask may start solved
    const sol = solve(flasks);
    if (sol) return { flasks, solution: sol, par: Math.ceil(sol.length * 1.15) + 1 };
  }
  const flasks = Array.from({ length: k }, (_, i) => [i, i, i, i]); [flasks[0][3], flasks[1][3]] = [flasks[1][3], flasks[0][3]]; // trivial fallback
  return { flasks: flasks.concat([[], []]), solution: [], par: 4 };
}

// ================================================================ FLASKS (3D objects mirroring the data)
let objs = [];
const flaskGroup = new THREE.Group(); scene.add(flaskGroup);
function makeFlask(idx) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(glassGeo, glassMat), base = new THREE.Mesh(baseGeo, baseMat), rim = new THREE.Mesh(rimGeo, rimMat);
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0 }));
  const cork = new THREE.Mesh(corkGeo, corkMat); cork.visible = false;
  glass.renderOrder = 2; g.add(base, glass, rim, glow, cork);
  const label = numberSprite(idx); label.position.set(0, -0.35, 0.2); label.visible = !matchMedia('(pointer: coarse)').matches; g.add(label);
  g.userData = { idx }; flaskGroup.add(g);
  return { group: g, glow, cork, layers: [], home: new THREE.Vector3(), lift: 0, done: false, pulse: 0 };
}
const numTex = {};
function numberSprite(i) {
  const n = String((i + 1) % 10);
  if (!numTex[n]) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = 'rgba(20,12,16,.7)'; x.beginPath(); x.arc(32, 32, 24, 0, 7); x.fill(); x.fillStyle = '#ffd36b'; x.font = 'bold 32px system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 32, 34); numTex[n] = new THREE.CanvasTexture(c); numTex[n].colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex[n], depthTest: false, transparent: true })); s.scale.setScalar(0.42); return s;
}
function syncLayers(i) {
  const o = objs[i], f = run.flasks[i];
  for (const m of o.layers) o.group.remove(m);
  o.layers = f.map((c, k) => { const m = new THREE.Mesh(layerGeo, liquidMats[c]); m.position.y = 0.08 + k * LAYER_H; o.group.add(m); return m; });
  const done = f.length === CAP && runLen(f) === CAP;
  o.cork.visible = done; o.done = done;
}
function layout() {
  const n = run.flasks.length, portrait = innerHeight > innerWidth;
  const perRow = portrait ? Math.min(n, n > 8 ? 5 : 4) : Math.min(n, n > 12 ? 8 : 7), rows = Math.ceil(n / perRow);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow), col = i % perRow;
    objs[i].home.set((col - (inRow - 1) / 2) * GAP_X, -row * GAP_Y, 0);
    if (!run.anim || run.anim.i !== i) objs[i].group.position.copy(objs[i].home);
  }
  view.bounds = { w: (perRow - 1) * GAP_X + FLASK_R * 2 + 0.6, h: (rows - 1) * GAP_Y + FLASK_H + 0.9, cy: -((rows - 1) * GAP_Y) / 2 + FLASK_H / 2 };
  fitCamera();
}
function fitCamera() {
  const { w, h, cy } = view.bounds, vfov = THREE.MathUtils.degToRad(camera.fov);
  const usableH = 0.68, usableW = 0.9; // leave room for the HUD above and the booster bar below
  const dist = Math.max((h + 0.6) / (2 * Math.tan(vfov / 2) * usableH), w / (2 * Math.tan(vfov / 2) * camera.aspect * usableW), 7);
  view.look.set(0, cy - 0.15, 0); view.pos.set(0, cy + dist * 0.18, dist);
}
function buildFlasks() {
  for (const o of objs) flaskGroup.remove(o.group);
  objs = run.flasks.map((_, i) => makeFlask(i));
  run.flasks.forEach((_, i) => syncLayers(i)); layout();
}

// ================================================================ INPUT (tap/click flasks, number keys, shortcuts)
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function flaskAt(e) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  let best = -1, bd = Infinity; // generous hit test: nearest flask axis to the ray, within a padded radius
  objs.forEach((o, i) => {
    const p = o.group.position, a = new THREE.Vector3(p.x, p.y, p.z), b = new THREE.Vector3(p.x, p.y + FLASK_H, p.z);
    const d = raycaster.ray.distanceSqToSegment(a, b);
    if (d < (FLASK_R + 0.35) ** 2 && d < bd) { bd = d; best = i; }
  });
  return best;
}
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING || AUTOPLAY) return;
  const i = flaskAt(e); if (i >= 0) tapFlask(i); else deselect();
});
addEventListener('keydown', (e) => {
  if (e.repeat) return; unlockAudio();
  if (state === State.PLAYING && !AUTOPLAY) {
    if (/^Digit\d$/.test(e.code)) { const n = (+e.code.slice(5) + 9) % 10; if (n < run.flasks.length) tapFlask(n); }
    if (e.code === 'KeyU' || e.code === 'KeyZ') useBooster('undo');
    if (e.code === 'KeyH') useBooster('hint');
    if (e.code === 'KeyF') useBooster('flask');
    if (e.code === 'KeyR') startLevel(run.level);
  }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (state === State.MENU) $('btnPlay').click(); else if (state === State.WIN) $('btnNext').click();
  }
});

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> WIN | STUCK)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', WIN: 'WIN', STUCK: 'STUCK' };
let state = State.BOOT, run = null;
let save = { level: 1, coins: 0, boosters: { undo: BOOSTERS.undo.start, hint: BOOSTERS.hint.start, flask: BOOSTERS.flask.start }, stars: {} };
function setState(s) {
  state = s;
  for (const id of ['menu', 'paused', 'win', 'stuck']) $(id).hidden = s !== State[id.toUpperCase()];
  $('hud').hidden = s === State.MENU || s === State.BOOT;
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop();
  if (s === State.MENU) { playMusic('menu'); document.querySelectorAll('.menuLevel').forEach((el) => { el.textContent = save.level; }); document.querySelectorAll('.menuCoins').forEach((el) => { el.textContent = save.coins; }); }
}
function togglePause() { if (state === State.PLAYING) setState(State.PAUSED); else if (state === State.PAUSED) setState(State.PLAYING); }
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { if (AUTOPLAY) return; const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1800); }
let bannerTimer = 0;
function banner(text) { const el = $('banner'); el.textContent = text; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 1200); }
function floatAt(pos, text) {
  const p = pos.clone().project(camera); const el = document.createElement('div'); el.className = 'float'; el.textContent = text;
  el.style.left = `${((p.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - p.y) / 2) * innerHeight}px`; $('fx').appendChild(el); setTimeout(() => el.remove(), 900);
}
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

click('btnPlay', () => startLevel(save.level));
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnRestart', () => startLevel(run.level));
click('btnQuit', () => { setState(State.MENU); previewLevel(save.level); });
click('btnNext', () => triggerMidgameAd(() => startLevel(save.level))); // between levels: the natural midgame break
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { save.coins += run.reward; run.reward *= 2; $('winCoins').textContent = run.reward; saveData(SAVE_KEY, save); updateHud(); toast(t('doubled')); playSfx('coin'); }, () => {});
});
click('btnStuckUndo', () => { setState(State.PLAYING); useBooster('undo'); });
click('btnStuckFlask', () => { setState(State.PLAYING); useBooster('flask'); });
click('btnStuckRestart', () => startLevel(run.level));
click('bRestart', () => { if (state === State.PLAYING) startLevel(run.level); });
for (const k of Object.keys(BOOSTERS)) $(`b${k[0].toUpperCase()}${k.slice(1)}`).addEventListener('click', () => { unlockAudio(); useBooster(k); });

// ================================================================ GAMEPLAY
function previewLevel(level) {
  const d = dealLevel(level);
  run = { level, flasks: d.flasks.map((f) => f.slice()), anim: null, selected: -1 };
  buildFlasks();
}
function startLevel(level) {
  const d = dealLevel(level);
  run = { level, flasks: d.flasks.map((f) => f.slice()), par: d.par, plan: d.solution.slice(), history: [], moves: 0, extra: false, selected: -1, anim: null,
    reward: 0, winT: 0, stuckT: 0, botT: 1.0, hintT: 0, hintTarget: -1, time: 0 };
  buildFlasks(); updateHud(); $('levelNum').textContent = level; $('moves').textContent = 0;
  setState(State.PLAYING); playMusic('play'); banner(t('levelBanner', { n: level }));
}
function updateHud() {
  $('coins').textContent = save.coins;
  for (const [k, def] of Object.entries(BOOSTERS)) {
    const n = save.boosters[k] || 0, btn = $(`b${k[0].toUpperCase()}${k.slice(1)}`), badge = btn.querySelector('.count');
    badge.textContent = n > 0 ? n : `${def.cost}`; badge.classList.toggle('buy', n <= 0);
  }
  if (run) $('bFlask').disabled = !!run.extra;
}
function deselect() { if (run && run.selected >= 0) { objs[run.selected].lift = 0; run.selected = -1; } }
function tapFlask(i) {
  if (run.anim) return;
  const s = run.flasks;
  if (run.selected < 0) {
    if (!s[i].length || isDone(s[i])) { playSfx('bad', 0.4); objs[i].pulse = 0.3; return; }
    run.selected = i; objs[i].lift = 0.42; playSfx('pick', 0.6); return;
  }
  const from = run.selected;
  if (from === i) { deselect(); return; }
  if (canPour(s, from, i)) { deselect(); startPour(from, i); return; }
  if (s[i].length && !isDone(s[i])) { objs[from].lift = 0; run.selected = i; objs[i].lift = 0.42; playSfx('pick', 0.5); return; } // switch selection
  playSfx('bad', 0.5); objs[i].pulse = 0.35; toast(t('cantPour'));
}
function startPour(i, j) {
  run.history.push(run.flasks.map((f) => f.slice()));
  const color = top(run.flasks[i]), before = run.flasks[j].length, n = pour(run.flasks, i, j);
  run.moves++; $('moves').textContent = run.moves;
  const dir = objs[j].home.x >= objs[i].home.x ? -1 : 1; // tilt toward the target
  run.anim = { i, j, n, color, before, t: 0, dir, srcBefore: run.flasks[i].length + n };
  // target gets its new layers now (grown in by the animation); source keeps its old ones until the flow finishes
  for (let k = 0; k < n; k++) { const m = new THREE.Mesh(layerGeo, liquidMats[color]); m.position.y = 0.08 + (before + k) * LAYER_H; m.scale.y = 0.001; objs[j].group.add(m); objs[j].layers.push(m); }
  stream.material = liquidMats[color];
  playSfx('pour', 0.7);
}
function updatePour(dt) {
  const a = run.anim; if (!a) return;
  a.t += dt;
  const src = objs[a.i], dst = objs[a.j], T1 = POUR.move, T2 = T1 + POUR.flow, T3 = T2 + POUR.back;
  // place the tilted source so its lip sits just above the target's mouth (the group pivots at its base)
  const tilt = a.dir * 1.15, lipLocal = new THREE.Vector3(-a.dir * FLASK_R * 0.9, FLASK_H, 0);
  const lipWant = dst.home.clone().add(new THREE.Vector3(a.dir * 0.08, FLASK_H + 0.42, 0.25));
  const mouth = lipWant.sub(lipLocal.applyEuler(new THREE.Euler(0, 0, tilt)));
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  if (a.t < T1) { const k = ease(a.t / T1); src.group.position.lerpVectors(src.home.clone().setY(src.home.y + 0.42), mouth, k); src.group.rotation.z = a.dir * 1.15 * k; }
  else if (a.t < T2) {
    src.group.position.copy(mouth); src.group.rotation.z = a.dir * 1.15;
    const f = (a.t - T1) / POUR.flow;
    for (let k = 0; k < a.n; k++) { // source top layers drain, target layers fill, one after another
      const part = Math.min(1, Math.max(0, f * a.n - k));
      const sm = src.layers[a.srcBefore - 1 - k]; if (sm) sm.scale.y = Math.max(0.001, 1 - part);
      const dm = dst.layers[a.before + k]; if (dm) dm.scale.y = Math.max(0.001, part);
    }
    const lip = new THREE.Vector3(a.dir * -FLASK_R * 0.9, FLASK_H, 0).applyEuler(src.group.rotation).add(src.group.position);
    const land = dst.group.position.clone().add(new THREE.Vector3(0, 0.08 + (a.before + Math.min(a.n, f * a.n)) * LAYER_H, 0));
    stream.visible = true; stream.position.copy(lip); stream.scale.set(1, Math.max(0.05, lip.y - land.y), 1); stream.rotation.set(0, 0, 0);
    stream.lookAt(land.x, land.y, land.z); stream.rotateX(-Math.PI / 2); // align the -Y-hanging cylinder from lip to landing point
    stream.scale.y = lip.distanceTo(land);
    if (Math.random() < 0.3) burst(land.clone().setY(land.y + 0.05), COLORS[a.color], 1, 1.2);
  } else if (a.t < T3) {
    stream.visible = false;
    if (!a.synced) { a.synced = true; syncLayers(a.i); syncLayers(a.j); afterPour(a); }
    const k = ease((a.t - T2) / POUR.back); src.group.position.lerpVectors(mouth, src.home, k); src.group.rotation.z = a.dir * 1.15 * (1 - k);
  } else { src.group.position.copy(src.home); src.group.rotation.z = 0; run.anim = null; checkEnd(); }
}
function afterPour(a) {
  const f = run.flasks[a.j];
  if (f.length === CAP && runLen(f) === CAP) { // a flask is complete: cork + sparkle + coins
    const p = objs[a.j].home.clone().setY(objs[a.j].home.y + FLASK_H + 0.2);
    burst(p, COLORS[a.color], 22, 3.2); burst(p, '#ffffff', 8, 2); playSfx('cork', 0.9); setTimeout(() => playSfx('complete', 0.8), CAPTURE ? 0 : 120);
    save.coins += 2; run.reward += 2; updateHud(); floatAt(p, '+2'); shake(0.08);
  }
}
function anyMove(s) { for (let i = 0; i < s.length; i++) for (let j = 0; j < s.length; j++) if (canPour(s, i, j) && !(s[j].length === 0 && runLen(s[i]) === s[i].length)) return true; return false; }
function checkEnd() {
  if (solved(run.flasks)) { run.winT = 0.7; return; }
  if (!anyMove(run.flasks)) run.stuckT = 0.6;
}
function win() {
  const stars = run.moves <= run.par ? 3 : run.moves <= Math.ceil(run.par * 1.4) ? 2 : 1;
  const bonus = 8 + run.level + stars * 4;
  save.coins += bonus; run.reward += bonus;
  save.stars[run.level] = Math.max(save.stars[run.level] || 0, stars);
  if (run.level >= save.level) save.level = run.level + 1;
  saveData(SAVE_KEY, save); updateHud();
  document.querySelectorAll('#win .stars i').forEach((el, i) => { el.className = i < stars ? 'on' : ''; });
  $('winMoves').textContent = t('movesUsed', { n: run.moves }); $('winCoins').textContent = run.reward;
  $('btnDouble').hidden = !(adsAvailable() && run.reward > 0);
  playSfx('win'); setTimeout(() => playSfx('star', 0.7), CAPTURE ? 0 : 300); playVoice(stars === 3 ? 'excellent' : stars === 2 ? 'great' : '');
  if (stars === 3 && run.level % 10 === 0 && !CAPTURE) happytime();
  setState(State.WIN);
}
function useBooster(k) {
  if (!run || state !== State.PLAYING || run.anim) return false;
  const have = save.boosters[k] || 0, cost = BOOSTERS[k].cost;
  if (have <= 0 && save.coins < cost) { toast(t('noGold')); return false; }
  const ok = k === 'undo' ? doUndo() : k === 'hint' ? doHint() : doExtraFlask();
  if (!ok) return false;
  if (have > 0) save.boosters[k] = have - 1; else save.coins -= cost;
  if (!AUTOPLAY) saveData(SAVE_KEY, save); updateHud(); return true;
}
function doUndo() {
  if (!run.history.length) { toast(t('nothingUndo')); return false; }
  deselect(); run.flasks = run.history.pop(); run.moves++; $('moves').textContent = run.moves; run.stuckT = 0; run.plan = [];
  if (run.flasks.length < objs.length) buildFlasks(); else run.flasks.forEach((_, i) => syncLayers(i));
  playSfx('undo', 0.7); return true;
}
function doHint() {
  const plan = solve(run.flasks, 60000);
  if (!plan || !plan.length) { toast(t('noSolution')); return false; }
  run.plan = plan; deselect();
  const [i, j] = plan[0]; run.selected = i; objs[i].lift = 0.42; run.hintTarget = j; run.hintT = 2.5;
  playSfx('magic', 0.7); return true;
}
function doExtraFlask() {
  if (run.extra) { toast(t('flaskUsed')); return false; }
  run.extra = true; deselect(); run.flasks.push([]); run.history = run.history.map((h) => h.concat([[]])); run.plan = [];
  buildFlasks(); playSfx('brew', 0.8); burst(objs[objs.length - 1].home.clone().setY(objs[objs.length - 1].home.y + 1), '#d9ecff', 16, 2.5); return true;
}
function botStep() { // the trailer bot follows the solver's plan, re-solving if the plan no longer fits
  if (run.anim) return;
  if (!run.plan.length || !canPour(run.flasks, run.plan[0][0], run.plan[0][1])) run.plan = solve(run.flasks, 60000) || [];
  if (!run.plan.length) { startLevel(run.level); return; }
  const [i, j] = run.plan.shift(); startPour(i, j);
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

function step(dt) {
  if (state !== State.PLAYING || !run) return;
  run.time += dt;
  if (run.winT > 0) { run.winT -= dt; if (run.winT <= 0) { win(); return; } }
  if (run.stuckT > 0) { run.stuckT -= dt; if (run.stuckT <= 0 && !anyMove(run.flasks)) { if (AUTOPLAY) startLevel(run.level); else setState(State.STUCK); return; } }
  if (run.hintT > 0) run.hintT -= dt;
  if (AUTOPLAY && !run.winT) { run.botT -= dt; if (run.botT <= 0) { run.botT = 0.95; botStep(); } }
}

// ================================================================ LOOP
let last = performance.now(), acc = 0, autoNextT = 0, clock = 0;
function animate(dt) {
  clock += dt; updateParticles(dt);
  if (!run) return;
  if (state === State.PLAYING) updatePour(dt);
  objs.forEach((o, i) => {
    if (run.anim && run.anim.i === i) return;
    const wantY = o.home.y + o.lift + (o.pulse > 0 ? Math.sin(o.pulse * 40) * 0.06 : 0);
    o.group.position.y += (wantY - o.group.position.y) * Math.min(1, dt * 14); o.group.position.x = o.home.x;
    o.pulse = Math.max(0, o.pulse - dt);
    const hinted = run.hintT > 0 && run.hintTarget === i;
    o.glow.material.opacity = hinted ? 0.55 + Math.sin(clock * 8) * 0.35 : run.selected === i ? 0.7 : o.done ? 0.35 + Math.sin(clock * 3) * 0.1 : 0;
    o.glow.material.color.set(o.done ? COLORS[run.flasks[i][0]] : '#ffd36b');
    if (o.cork.visible && o.cork.scale.x < 1) o.cork.scale.setScalar(Math.min(1, o.cork.scale.x + dt * 6));
  });
  if (AUTOPLAY && state === State.WIN) { autoNextT += dt; if (autoNextT > 1.8) { autoNextT = 0; startLevel(save.level); } }
}
function advance(dt) {
  if (state === State.PAUSED) return;
  acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; }
  animate(dt);
}
function render(dt) {
  shakeAmt = Math.max(0, shakeAmt - dt * 1.5);
  camera.position.copy(view.pos); camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(view.look);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(dt);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (run) layout(); }
addEventListener('resize', resize);

// ================================================================ BOOT
async function boot() {
  await initCrazySDK();
  sdkCall((s) => s.game.loadingStart());
  lang = (params.get('lang') || sdkLocale() || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n();
  if (!matchMedia('(pointer: coarse)').matches) $('howto').textContent = `${t('howto')} ${t('howtoKeys')}`;
  initAudio();
  let done = 0; const sfx = Object.entries(ASSETS.sfx);
  await Promise.race([Promise.all(sfx.map(([k, u]) => loadSfx(k, u).finally(() => { $('loadBar').style.width = `${(100 * ++done) / sfx.length}%`; }))), new Promise((r) => setTimeout(r, 15000))]);
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
      info: () => ({ state, level: run?.level, moves: run?.moves, par: run?.par, flasks: run?.flasks.length, time: run?.time, coins: save.coins }),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
