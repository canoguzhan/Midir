// {{TITLE}}: single-file game. Sections: CONFIG, I18N, SDK, AUDIO, ASSETS, WORLD, INPUT, STATE, GAMEPLAY, LOOP, BOOT.
// Everything loads from ./assets/ with procedural fallbacks, so the game is playable before bake_assets.py has run.
// No API keys, no backend calls: this folder ships to CrazyGames as a static bundle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ================================================================ CONFIG
const SAVE_KEY = '{{SLUG}}';
const STEP = 1 / 60; // fixed simulation step: identical physics at 60/144/165 Hz
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // deterministic frame stepping for press screenshots + trailer (tools/capture.mjs)
const AUTOPLAY = CAPTURE || params.has('autoplay'); // a bot plays by itself (trailer footage, balance tests)
const CFG = {
  arena: 13, playerRadius: 0.55, speed: 7, dashSpeed: 20, dashTime: 0.16, dashCooldown: 1.1,
  coins: 6, coinRadius: 0.8, rockEvery: [1.5, 0.4], rockSpeed: [6, 12], rampSeconds: 90,
};
const ASSETS = {
  models: { // files: clip name -> GLB ('base' = static mesh). height in metres, yaw turns the model to face +Z
    hero: { files: { idle: 'assets/models/hero_warrior@idle.glb', run: 'assets/models/hero_warrior@run.glb' }, height: 1.8, yaw: -90 },
    rock: { files: { base: 'assets/models/prop_rock.glb' }, height: 1.3 },
    tree: { files: { base: 'assets/models/prop_tree.glb' }, height: 5.5 },
  },
  sfx: { coin: 'assets/audio/coin.mp3', hit: 'assets/audio/hit.mp3', dash: 'assets/audio/skill_dash.mp3', over: 'assets/audio/defeat.mp3', click: 'assets/audio/ui_click.mp3' },
  music: 'assets/audio/bgm_field.mp3',
};

// ================================================================ I18N (English required; others must be good quality)
const STRINGS = {
  en: { play: 'Play', best: 'Best', paused: 'Paused', resume: 'Resume', menu: 'Menu', gameOver: 'Game Over', again: 'Play again',
    double: '▶ Double coins', newBest: 'New best!', doubled: 'Coins doubled!', adUnavailable: 'Ad not available right now',
    hintDesktop: 'WASD / Arrow keys to move · Space to dash · Esc to pause', hintTouch: 'Drag to move · tap ⚡ to dash' },
  tr: { play: 'Oyna', best: 'En iyi', paused: 'Duraklatıldı', resume: 'Devam', menu: 'Menü', gameOver: 'Oyun Bitti', again: 'Tekrar oyna',
    double: '▶ Altınları ikiye katla', newBest: 'Yeni rekor!', doubled: 'Altınlar ikiye katlandı!', adUnavailable: 'Şu anda reklam yok',
    hintDesktop: 'WASD / Ok tuşları ile hareket · Boşluk ile atıl · Esc ile duraklat', hintTouch: 'Hareket için sürükle · atılmak için ⚡' },
};
let lang = 'en';
const t = (k) => STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); }); }

// ================================================================ SDK (CrazyGames v3; every call is a safe no-op off-platform)
let crazySdk = null, sdkEnv = 'disabled', gameplayActive = false, adsFailed = false;

async function initCrazySDK() {
  try {
    if (window.CrazyGames?.SDK) {
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
function applySdkSettings(s) { if (s?.muteAudio) muteAudio('sdk'); else unmuteAudio('sdk'); } // platform mute overrides everything

function onGameplayStart() { if (gameplayActive) return; gameplayActive = true; sdkCall((s) => s.game.gameplayStart()); }
function onGameplayStop() { if (!gameplayActive) return; gameplayActive = false; sdkCall((s) => s.game.gameplayStop()); }
function happytime() { sdkCall((s) => s.game.happytime()); } // sparingly: new high score, boss kill

// Midgame: only between runs/levels, never on navigation buttons. Mute on adStarted (not on request); always continue.
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

// ================================================================ AUDIO (Web Audio SFX + synthesized fallbacks, HTML5 music)
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  coin: ['square', 1320, 1980, 0.12, 0.1], hit: ['sawtooth', 240, 60, 0.35, 0.18], dash: ['sine', 300, 1200, 0.18, 0.14],
  over: ['triangle', 440, 110, 0.8, 0.2], click: ['square', 900, 900, 0.03, 0.08],
};
const audio = { ctx: null, master: null, buffers: {}, music: null, wantMusic: false, muted: new Set(), voices: 0 };

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
function playSfx(key, vol = 1) {
  if (audio.muted.size || !audio.ctx || audio.voices > 12) return;
  const b = audio.buffers[key], g = audio.ctx.createGain(), now = audio.ctx.currentTime;
  g.connect(audio.master); audio.voices++;
  if (b) {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.94 + Math.random() * 0.12; g.gain.value = vol;
    s.connect(g); s.onended = () => audio.voices--; s.start(); return;
  }
  const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.click, o = audio.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  g.gain.setValueAtTime(gain * vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); o.onended = () => audio.voices--; o.start(now); o.stop(now + dur);
}
function playMusic() {
  audio.wantMusic = true;
  if (!audio.music && ASSETS.music) { audio.music = new Audio(ASSETS.music); audio.music.loop = true; audio.music.volume = 0.35; audio.music.onerror = () => { audio.music = null; }; }
  if (audio.music && !audio.muted.size) audio.music.play().catch(() => {});
}
function muteAudio(reason = 'ad') { audio.muted.add(reason); applyMute(); }
function unmuteAudio(reason = 'ad') { audio.muted.delete(reason); applyMute(); }
function applyMute() {
  const m = audio.muted.size > 0;
  if (audio.master) audio.master.gain.value = m ? 0 : 1;
  if (audio.music) { if (m) audio.music.pause(); else if (audio.wantMusic) audio.music.play().catch(() => {}); }
}

// ================================================================ ASSETS (GLB + clips; null when missing so fallbacks kick in)
const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
const models = {};
let loadTotal = 0, loadDone = 0;
const $ = (id) => document.getElementById(id);
function track(p) { loadTotal++; return p.finally(() => { loadDone++; $('loadBar').style.width = `${(100 * loadDone) / loadTotal}%`; }); }

async function loadModel(id) {
  const def = ASSETS.models[id], clips = {}; let scene = null;
  for (const [clip, url] of Object.entries(def.files)) {
    try {
      const g = await gltf.loadAsync(url);
      scene ??= g.scene;
      if (clip !== 'base' && g.animations[0]) clips[clip] = g.animations[0]; // clips bind by bone name onto the first scene
    } catch {}
  }
  if (!scene) return;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  for (const c of Object.values(clips)) stripRootMotion(c, scene);
  models[id] = { scene, clips, def };
}
// A placeable copy: scaled to def.height, feet on y=0, facing +Z. Returns fallback() when the GLB is missing.
function instance(id, fallback) {
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
function playClip(obj, name, fade = 0.2) {
  const acts = obj.userData.actions, next = acts?.[name];
  if (!next || obj.userData.current === next) return;
  next.reset().fadeIn(fade).play(); obj.userData.current?.fadeOut(fade); obj.userData.current = next;
}
// Tripo3D clips walk the hip bone forward (root motion): remove the drift so characters run in place.
function stripRootMotion(clip, root) {
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

// ================================================================ WORLD
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#7ec8e3'); scene.fog = new THREE.Fog('#7ec8e3', 30, 60);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 15, 12);
let shakeAmt = 0;

function buildWorld() {
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a7a3a', 1.6));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.2); sun.position.set(8, 18, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(CFG.arena, 64), new THREE.MeshStandardMaterial({ color: '#8bc34a' }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CFG.arena, 0.25, 8, 96), new THREE.MeshStandardMaterial({ color: '#c8b48a' }));
  rim.rotation.x = Math.PI / 2; scene.add(rim);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#5d8f3a' }));
  outside.rotation.x = -Math.PI / 2; outside.position.y = -0.02; outside.receiveShadow = true; scene.add(outside);
  for (let i = 0; i < 14; i++) { // decorative trees around the arena
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2, r = CFG.arena + 3 + Math.random() * 4;
    const tree = instance('tree', fallbackTree); tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); tree.rotation.y = Math.random() * 6; scene.add(tree);
  }
}
const fallbackTree = () => {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6), new THREE.MeshStandardMaterial({ color: '#7a5230' })); trunk.position.y = 0.8;
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#2e7d32', flatShading: true })); top.position.y = 3.1;
  trunk.castShadow = top.castShadow = true; g.add(trunk, top); return g;
};
const fallbackHero = () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: '#3f7bd9' })); body.position.y = 0.9;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: '#ffd166' })); nose.position.set(0, 1.25, 0.45);
  body.castShadow = true; g.add(body, nose); return g;
};
const fallbackRock = () => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75), new THREE.MeshStandardMaterial({ color: '#8d8d8d', flatShading: true })); m.position.y = 0.7; m.castShadow = true; const g = new THREE.Group(); g.add(m); return g; };
const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24), coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.8, roughness: 0.25, emissive: '#6b4a00' });

// particles: one pooled set of small cubes for every burst
const particles = [], pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
function burst(pos, color, n = 14, speed = 5) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => !q.visible);
    if (!p) { p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial()); p.userData.v = new THREE.Vector3(); particles.push(p); scene.add(p); }
    p.material.color.set(color); p.visible = true; p.position.copy(pos); p.userData.life = 0.5 + Math.random() * 0.3;
    p.userData.v.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.visible) continue;
    p.userData.life -= dt; if (p.userData.life <= 0) { p.visible = false; continue; }
    p.userData.v.y -= 14 * dt; p.position.addScaledVector(p.userData.v, dt); p.scale.setScalar(Math.min(1, p.userData.life * 2));
  }
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

// ================================================================ INPUT (keyboard, mouse/touch floating joystick, touch button)
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); unlockAudio();
  if (e.code === 'Space' && state === State.PLAYING) dash();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if ((e.code === 'Enter' || e.code === 'Space') && state === State.MENU) $('btnPlay').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== State.PLAYING || stick.id !== null) return;
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  const j = $('joystick'); j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; j.hidden = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy), max = 50;
  if (d > max) { dx *= max / d; dy *= max / d; }
  stick.x = dx / max; stick.y = dy / max; $('joystick').firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
const releaseStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; $('joystick').firstElementChild.style.transform = ''; };
canvas.addEventListener('pointerup', releaseStick); canvas.addEventListener('pointercancel', releaseStick);
$('btnAction').addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); dash(); });

function moveInput() { // x right, y down on screen == +x, +z in the world (camera has no yaw)
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (stick.id !== null) { x = stick.x; y = stick.y; }
  if (AUTOPLAY && coins.length) { // bot: head for the nearest coin, sidestep the nearest boulder
    const c = coins.reduce((a, b) => (a.position.distanceTo(player.position) < b.position.distanceTo(player.position) ? a : b));
    x = c.position.x - player.position.x; y = c.position.z - player.position.z;
    const k = rocks.find((r) => r.position.distanceTo(player.position) < 3.5);
    if (k) { x += (player.position.x - k.position.x) * 2; y += (player.position.z - k.position.z) * 2; }
  }
  const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : l < 0.15 ? { x: 0, y: 0 } : { x, y };
}

// ================================================================ STATE (BOOT -> MENU -> PLAYING <-> PAUSED -> GAMEOVER)
const State = { BOOT: 'BOOT', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
let state = State.BOOT, best = 0;

function setState(s) {
  state = s;
  $('menu').hidden = s !== State.MENU; $('paused').hidden = s !== State.PAUSED; $('gameover').hidden = s !== State.GAMEOVER;
  $('hud').hidden = !(s === State.PLAYING || s === State.PAUSED);
  $('btnAction').hidden = !(s === State.PLAYING && isTouch);
  if (s !== State.PLAYING) { stick.id = null; stick.x = stick.y = 0; $('joystick').hidden = true; }
  if (s === State.PLAYING) onGameplayStart(); else onGameplayStop(); // stop on every break: menus, pause, game over
}
function togglePause() {
  if (state === State.PLAYING) setState(State.PAUSED);
  else if (state === State.PAUSED) setState(State.PLAYING);
}
function blockUI(on) { document.body.style.pointerEvents = on ? 'none' : ''; }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); playSfx('click', 0.6); fn(); });

click('btnPlay', () => startRun());
click('btnPause', () => togglePause());
click('btnResume', () => togglePause());
click('btnQuit', () => { setState(State.MENU); refreshBest(); });
click('btnMenu', () => { setState(State.MENU); refreshBest(); }); // navigation: never an ad here
click('btnRetry', () => triggerMidgameAd(() => startRun())); // between runs: the right moment for a midgame ad
click('btnDouble', () => {
  $('btnDouble').hidden = true;
  triggerRewardedAd(() => { run.score *= 2; run.doubled = true; showResults(); toast(t('doubled')); }, () => {});
});
function refreshBest() { $('menuBest').textContent = best; $('hudBest').textContent = best; }

// ================================================================ GAMEPLAY (demo: collect coins, dodge rolling boulders)
let player, run = null;
const coins = [], rocks = [];

function startRun() {
  for (const c of coins) scene.remove(c); coins.length = 0;
  for (const r of rocks) scene.remove(r); rocks.length = 0;
  player.position.set(0, 0, 0); player.rotation.y = 0;
  run = { score: 0, time: 0, spawn: 1.5, dash: 0, cooldown: 0, doubled: false };
  $('score').textContent = '0'; refreshBest();
  setState(State.PLAYING); playMusic();
}
function dash() {
  if (state !== State.PLAYING || run.cooldown > 0) return;
  run.dash = CFG.dashTime; run.cooldown = CFG.dashCooldown; playSfx('dash', 0.7); burst(player.position, '#ffffff', 8, 3);
}
function endRun() {
  playSfx('hit'); playSfx('over', 0.8); shake(0.7); burst(player.position.clone().setY(1), '#ff5a4a', 30, 8);
  setState(State.GAMEOVER); showResults();
  $('btnDouble').hidden = !(adsAvailable() && run.score > 0);
}
function showResults() {
  const isBest = run.score > best;
  if (isBest) { best = run.score; saveData(`${SAVE_KEY}:best`, best); if (!run.doubled) happytime(); }
  $('finalScore').textContent = run.score; $('overBest').textContent = best; $('newBest').hidden = !isBest; refreshBest();
}
const rand = (a, b) => a + Math.random() * (b - a);
function spawnCoin() {
  const c = new THREE.Mesh(coinGeo, coinMat); const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (CFG.arena - 1.5);
  c.position.set(Math.cos(a) * r, 0.7, Math.sin(a) * r); c.rotation.x = Math.PI / 2; c.castShadow = true; scene.add(c); coins.push(c);
}
function spawnRock() {
  const a = Math.random() * Math.PI * 2, from = new THREE.Vector3(Math.cos(a) * (CFG.arena + 2), 0, Math.sin(a) * (CFG.arena + 2));
  const target = player.position.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3)));
  const ramp = Math.min(1, run.time / CFG.rampSeconds), rock = instance('rock', fallbackRock);
  rock.position.copy(from); rock.userData.v = target.sub(from).setY(0).normalize().multiplyScalar(rand(CFG.rockSpeed[0], CFG.rockSpeed[1]) * (0.8 + ramp * 0.5));
  scene.add(rock); rocks.push(rock);
}

function step(dt) {
  for (const c of coins) c.rotation.z += dt * 3;
  if (state !== State.PLAYING) return;
  run.time += dt; run.cooldown = Math.max(0, run.cooldown - dt); run.dash = Math.max(0, run.dash - dt);
  // player
  const m = moveInput(), speed = run.dash > 0 ? CFG.dashSpeed : CFG.speed, moving = m.x || m.y;
  let dx = m.x, dz = m.y;
  if (run.dash > 0 && !moving) { dx = Math.sin(player.rotation.y); dz = Math.cos(player.rotation.y); }
  player.position.x += dx * speed * dt; player.position.z += dz * speed * dt;
  const r = Math.hypot(player.position.x, player.position.z), lim = CFG.arena - CFG.playerRadius;
  if (r > lim) player.position.multiplyScalar(lim / r);
  if (moving) { const want = Math.atan2(dx, dz); let d = want - player.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); player.rotation.y += d * Math.min(1, dt * 14); }
  playClip(player, moving || run.dash > 0 ? 'run' : 'idle');
  // coins
  while (coins.length < CFG.coins) spawnCoin();
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z) < CFG.playerRadius + CFG.coinRadius) {
      scene.remove(c); coins.splice(i, 1); run.score++; $('score').textContent = run.score; playSfx('coin', 0.7); burst(c.position, '#ffcc33', 10, 4);
    }
  }
  // boulders: spawn faster as the run goes on
  const ramp = Math.min(1, run.time / CFG.rampSeconds);
  run.spawn -= dt; if (run.spawn <= 0) { spawnRock(); run.spawn = THREE.MathUtils.lerp(CFG.rockEvery[0], CFG.rockEvery[1], ramp); }
  for (let i = rocks.length - 1; i >= 0; i--) {
    const k = rocks[i], v = k.userData.v;
    k.position.addScaledVector(v, dt); k.children[0].rotation.x += v.length() * dt * 1.4; k.rotation.y = Math.atan2(v.x, v.z);
    if (Math.hypot(k.position.x, k.position.z) > CFG.arena + 4) { scene.remove(k); rocks.splice(i, 1); continue; }
    if (Math.hypot(k.position.x - player.position.x, k.position.z - player.position.z) < CFG.playerRadius + 0.6) { endRun(); return; }
  }
}

// ================================================================ LOOP
let last = performance.now(), acc = 0;
const camTarget = new THREE.Vector3();
function advance(dt) {
  if (state !== State.PAUSED) { acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; } updateParticles(dt); player.userData.mixer?.update(dt); }
}
function render(dt) {
  const portrait = innerHeight > innerWidth ? 1.45 : 1; // pull back so the arena fits narrow screens
  camTarget.copy(player.position).multiplyScalar(0.6).add(CAM_OFFSET.clone().multiplyScalar(portrait));
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 6));
  shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  camera.lookAt(player.position.x * 0.6, 0, player.position.z * 0.6);
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
  lang = (params.get('lang') || crazySdk?.user?.systemInfo?.locale || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (!STRINGS[lang]) lang = 'en';
  document.documentElement.lang = lang; applyI18n(); $('hint').textContent = t(isTouch ? 'hintTouch' : 'hintDesktop');
  initAudio();
  const loads = [...Object.keys(ASSETS.models).map((id) => track(loadModel(id))), ...Object.entries(ASSETS.sfx).map(([k, u]) => track(loadSfx(k, u)))];
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 15000))]); // never hang on a slow asset
  buildWorld();
  player = instance('hero', fallbackHero); scene.add(player); playClip(player, 'idle');
  best = loadData(`${SAVE_KEY}:best`, 0) | 0; refreshBest();
  resize(); camera.position.copy(CAM_OFFSET);
  sdkCall((s) => s.game.loadingStop());
  $('loading').hidden = true;
  setState(State.MENU);
  if (CAPTURE) { // capture protocol used by tools/capture.mjs: no rAF loop, the tool drives every frame
    window.__game = {
      start: () => startRun(),
      frame: (dt = 1 / 30) => { advance(dt); render(dt); },
      skip: (sec) => { for (let s = 0; s < sec; s += STEP) { advance(STEP); if (state === State.GAMEOVER) startRun(); } },
      info: () => ({ state, score: run?.score }),
    };
    render(0);
  } else requestAnimationFrame((n) => { last = n; frame(n); });
}
boot();
