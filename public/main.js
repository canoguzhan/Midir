// Bootstrap: CrazyGames SDK first (required before game logic), then assets with a progress bar,
// title screen → Higgsfield intro (first visit) → gameplay. Also owns the DOM HUD the engine talks to.
import { CrazyGamesBridge } from './CrazyGamesBridge.js';
import { AssetManager } from './AssetManager.js';
import { SoundManager } from './SoundManager.js';
import { HiggsfieldCutscene } from './HiggsfieldCutscene.js';
import { AIServiceBridge } from './AIServiceBridge.js';
import { GameEngine } from './GameEngine.js';
import { t, lang, setLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const applyText = () => document.querySelectorAll('[data-t]').forEach((e) => (e.textContent = t(e.dataset.t)));
document.documentElement.lang = lang; applyText();

const bridge = await new CrazyGamesBridge().init();
bridge.loadingStart();
const assets = new AssetManager('assets/');
await assets.loadManifest();
assets.onProgress = (p) => ($('#loadFill').style.width = Math.round(p * 100) + '%');
const sound = new SoundManager(assets, lang);
const cutscene = new HiggsfieldCutscene({ bridge, sound });
const ai = new AIServiceBridge(assets); // runtime Tripo generation hook (disabled unless configured)
window.sanctuary = { ai };  // debug/console handle

// Core assets gate the title screen (capped at 25s on slow links); everything else streams in and swaps over the
// procedural stand-ins while you play.
const core = [sound.preload(), ...Object.entries(assets.manifest.models).filter(([, d]) => d.core).map(([id]) => assets.model(id)),
  ...Object.values(assets.manifest.icons || {}).map((rel) => assets.track(new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = assets.url(rel); })))];
await Promise.race([Promise.all(core), new Promise((r) => setTimeout(r, 25000))]);
bridge.loadingStop();

// ------------------------------------------------------------ HUD adapter used by the engine
const goldEl = $('#gold'), badge = $('#stackBadge'), toastEl = $('#toast');
let shownGold = 0, goldTarget = 0, upgradesOpen = false;
const ui = {
  labels: $('#labels'), joy: $('#joy'),
  setGold(v, bump) { goldTarget = v; if (!bump) shownGold = v; if (bump) { goldEl.parentElement.classList.remove('bump'); void goldEl.offsetWidth; goldEl.parentElement.classList.add('bump'); } },
  toast(msg, ms = 2400) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), ms); },
  stackBadge(p, n, cap) { badge.hidden = !n || !p.vis; if (badge.hidden) return; badge.textContent = `${n}/${cap}`; badge.classList.toggle('full', n >= cap); badge.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`; },
  showUpgrades(on) { if (on !== upgradesOpen) { upgradesOpen = on; $('#upgrades').classList.toggle('show', on); if (on) renderUpgrades(); } },
  frenzyTimer(s) { const b = $('#frenzyBtn'); b.disabled = s > 0; b.querySelector('small').textContent = s > 0 ? `${Math.ceil(s)}s` : 'AD'; },
  golemTimer(s) { const b = $('#golemBtn'); b.disabled = s > 0; b.querySelector('small').textContent = s > 0 ? `${Math.ceil(s)}s` : 'AD'; },
  async midgame() { engine.pause(); await bridge.midgame(); engine.resume(); },
  async victory() { engine.pause(); await cutscene.play(assets.url(assets.manifest.video?.victory), { title: t('legendary'), skipLabel: t('skip') }); sound.play('fanfare', 0.7); ui.toast(t('legendary'), 3500); engine.resume(); },
};
setInterval(() => { if (shownGold !== goldTarget) { shownGold += Math.sign(goldTarget - shownGold) * Math.max(1, Math.ceil(Math.abs(goldTarget - shownGold) / 6)); goldEl.textContent = shownGold.toLocaleString(); } }, 30);
$('#coinIcon').src = assets.icon('coin') || ''; $('#frenzyBtn img').src = assets.icon('frenzy') || ''; $('#golemBtn img').src = assets.icon('golem') || '';

function renderUpgrades() {
  $('#upList').innerHTML = engine.upgradeInfo().map((u) => `<button class="up" data-k="${u.key}" ${u.cost == null || engine.state.gold < u.cost ? 'disabled' : ''}>
    <b>${t(u.key)}</b><span class="lv">${t('level')} ${u.lv}/${u.max}</span><span class="cost">${u.cost == null ? t('max') : `<img src="${assets.icon('coin') || ''}" alt="">${u.cost}`}</span></button>`).join('');
}
$('#upList').addEventListener('click', (e) => { const b = e.target.closest('.up'); if (b && engine.buyUpgrade(b.dataset.k)) renderUpgrades(); });
setInterval(() => upgradesOpen && renderUpgrades(), 500);

// ------------------------------------------------------------ engine + controls
const engine = new GameEngine({ canvas: $('#game'), assets, sound, bridge, ui });
window.sanctuary.engine = engine;
bridge.on('pause', () => sound.pause()); bridge.on('resume', () => sound.resume());
$('#frenzyBtn').onclick = async () => { sound.play('click'); if (!bridge.adsAvailable) return ui.toast(t('adUnavailable')); engine.pause(); const ok = await bridge.rewarded(); engine.resume(); if (ok) engine.startFrenzy(60); };
$('#golemBtn').onclick = async () => { sound.play('click'); if (!bridge.adsAvailable) return ui.toast(t('adUnavailable')); engine.pause(); const ok = await bridge.rewarded(); engine.resume(); if (ok) { engine.hireGolem(true, true); ui.toast(t('golemHired')); } };
$('#muteBtn').onclick = () => { sound.setMuted(!sound.muted); $('#muteBtn').textContent = sound.muted ? '🔇' : '🔊'; try { localStorage.setItem('sanctuary_muted', sound.muted ? '1' : ''); } catch {} };
$('#langBtn').onclick = () => { setLang(lang === 'en' ? 'tr' : 'en'); };
addEventListener('langchange', () => { sound.lang = document.documentElement.lang; $('#langBtn').textContent = sound.lang.toUpperCase(); applyText(); engine.relabel(); if (upgradesOpen) renderUpgrades(); });
$('#langBtn').textContent = lang.toUpperCase();
try { if (localStorage.getItem('sanctuary_muted')) $('#muteBtn').click(); } catch {}
document.addEventListener('visibilitychange', () => { if (document.hidden && !engine.paused) { engine.pause(); $('#resume').hidden = false; } });
$('#resume').onclick = () => { $('#resume').hidden = true; sound.unlock(); engine.resume(); };
addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------ title → intro → play
$('#loadBar').hidden = true; $('#playBtn').hidden = false; sound.playMusic('title');
$('#playBtn').onclick = async () => {
  sound.unlock(); sound.play('click'); $('#title').classList.add('gone'); setTimeout(() => ($('#title').hidden = true), 500);
  const seen = (() => { try { return localStorage.getItem('sanctuary_intro'); } catch { return 1; } })();
  if (!seen && assets.manifest.video?.intro) { await cutscene.play(assets.url(assets.manifest.video.intro), { title: t('title'), skipLabel: t('skip'), maxMs: 9000 }); try { localStorage.setItem('sanctuary_intro', '1'); } catch {} }
  $('#hud').hidden = false; sound.playMusic('sanctuary'); engine.resume();
  if (!engine.state.sales) { ui.toast(t('welcome'), 5000); setTimeout(() => ui.toast(t('hintMove'), 3500), 5200); }
  if (innerWidth >= 1000 && innerHeight >= 700) bridge.banner('crazygames-banner-container-leaderboard');
};
