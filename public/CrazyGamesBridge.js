// CrazyGames SDK v3 adapter. Every call is safe without the SDK (local dev, Vercel, other portals):
// lifecycle events become no-ops, ads resolve as "unavailable", saves fall back to localStorage.
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const MIDGAME_GAP_MS = 3 * 60 * 1000; // keep interstitials rare: at most one every 3 minutes

export class CrazyGamesBridge {
  constructor() { this.sdk = null; this.env = 'disabled'; this.playing = false; this.lastMidgame = 0; this.listeners = { pause: [], resume: [] }; }

  async init() {
    try {
      await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = SDK_URL; s.async = true; s.onload = ok; s.onerror = fail; document.head.appendChild(s); setTimeout(fail, 6000); });
      this.sdk = window.CrazyGames?.SDK || null;
      if (this.sdk) { await this.sdk.init(); this.env = this.sdk.environment; }
    } catch { this.sdk = null; this.env = 'disabled'; }
    return this;
  }
  get active() { return !!this.sdk && this.env !== 'disabled'; }
  get adsAvailable() { return this.active && (this.env === 'crazygames' || this.env === 'local'); }
  on(evt, fn) { this.listeners[evt].push(fn); }
  emit(evt) { for (const fn of this.listeners[evt]) fn(); }
  call(fn) { if (!this.active) return; try { fn(this.sdk); } catch (e) { console.warn('[CrazyGames]', e); } }

  // ---- lifecycle
  loadingStart() { this.call((s) => s.game.loadingStart()); }
  loadingStop() { this.call((s) => s.game.loadingStop()); }
  gameplayStart() { if (this.playing) return; this.playing = true; this.call((s) => s.game.gameplayStart()); }
  gameplayStop() { if (!this.playing) return; this.playing = false; this.call((s) => s.game.gameplayStop()); }
  happytime() { this.call((s) => s.game.happytime()); }

  // ---- ads: pause/mute the game around every ad, restore afterwards
  requestAd(type) {
    return new Promise((resolve) => {
      if (!this.adsAvailable) return resolve(false);
      const wasPlaying = this.playing;
      const done = (ok) => { this.emit('resume'); if (wasPlaying) this.gameplayStart(); resolve(ok); };
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => { this.gameplayStop(); this.emit('pause'); },
          adFinished: () => done(true),
          adError: () => done(false),
        });
      } catch { done(false); }
    });
  }
  async midgame() { // interstitial between base expansions; rate limited
    if (Date.now() - this.lastMidgame < MIDGAME_GAP_MS) return false;
    this.lastMidgame = Date.now(); return this.requestAd('midgame');
  }
  rewarded() { return this.requestAd('rewarded'); }

  // ---- responsive banners (containers live in index.html)
  async banner(id) {
    if (!this.adsAvailable) return;
    const el = document.getElementById(id); if (!el) return;
    try { el.hidden = false; await this.sdk.banner.requestResponsiveBanner(id); } catch { el.hidden = true; }
  }
  clearBanners() { this.call((s) => s.banner.clearAllBanners()); }

  // ---- persistence: CrazyGames cloud data when available, else localStorage
  save(key, value) { const v = JSON.stringify(value); if (this.active && this.sdk.data) try { this.sdk.data.setItem(key, v); return; } catch {} try { localStorage.setItem(key, v); } catch {} }
  load(key) {
    let v = null;
    if (this.active && this.sdk.data) try { v = this.sdk.data.getItem(key); } catch {}
    if (v == null) try { v = localStorage.getItem(key); } catch {}
    try { return v ? JSON.parse(v) : null; } catch { return null; }
  }
}
