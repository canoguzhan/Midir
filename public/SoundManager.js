// Audio: Web Audio API for SFX (pitch variation, polyphony cap), HTML5 Audio for music/voice and as SFX fallback,
// and synthesized beeps/pops/coins whenever a file is missing or fails to decode.
const SYNTH = { // [waveform, startHz, endHz, seconds, gain]
  coin: ['square', 1320, 1980, 0.12, 0.12], pop: ['sine', 520, 980, 0.08, 0.25], drop: ['triangle', 300, 180, 0.07, 0.2],
  click: ['square', 900, 900, 0.03, 0.08], unlock: ['sawtooth', 300, 1200, 0.5, 0.12], angry: ['sawtooth', 220, 110, 0.3, 0.12],
  padFill: ['sine', 300, 900, 0.4, 0.08], sale: ['triangle', 660, 1320, 0.25, 0.15], upgrade: ['sine', 500, 1500, 0.35, 0.15], frenzy: ['sawtooth', 200, 1600, 0.5, 0.1],
};

export class SoundManager {
  constructor(assets, lang = 'en') {
    this.assets = assets; this.lang = lang; this.buffers = {}; this.html = {}; this.voices = 0;
    this.muted = false; this.sfxVol = 0.8; this.musicVol = 0.35; this.music = null; this.musicKey = null; this.lastVoice = 0;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination); } catch { this.ctx = null; }
  }
  async preload() {
    const list = Object.entries(this.assets.manifest.audio || {});
    await Promise.all(list.map(([k, rel]) => this.assets.track(this.loadSfx(k, this.assets.url(rel)))));
  }
  async loadSfx(key, url) {
    if (this.ctx) {
      try { const r = await fetch(url); if (r.ok) { this.buffers[key] = await this.ctx.decodeAudioData(await r.arrayBuffer()); return; } } catch {}
    } else { const a = new Audio(url); a.preload = 'auto'; this.html[key] = a; }
  }
  unlock() { if (this.ctx?.state === 'suspended') this.ctx.resume(); if (this.music?.paused && !this.muted && !this.paused) this.music.play().catch(() => {}); }

  play(key, vol = 1, rate = 1) {
    if (this.muted || this.paused) return;
    const b = this.buffers[key];
    if (b && this.ctx) {
      if (this.voices > 14) return; this.voices++;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = b; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
      g.gain.value = vol * this.sfxVol; s.connect(g).connect(this.out); s.onended = () => this.voices--; s.start(); return;
    }
    if (this.html[key]) { const a = this.html[key].cloneNode(); a.volume = Math.min(1, vol * this.sfxVol); a.play().catch(() => {}); return; }
    this.synth(key, vol);
  }
  synth(key, vol = 1) { // procedural fallback so the game is never silent
    if (!this.ctx) return; const [type, f0, f1, dur, gain] = SYNTH[key] || SYNTH.pop, t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain * vol * this.sfxVol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  playMusic(key) {
    if (this.musicKey === key) return; this.musicKey = key;
    const urls = (this.assets.manifest.music?.[key] || []).map((r) => this.assets.url(r)); if (!urls.length) return;
    const old = this.music, el = new Audio(); el.loop = true; el.volume = 0; this.music = el;
    const tryNext = (i) => { if (i >= urls.length) return; el.src = urls[i]; el.onerror = () => tryNext(i + 1); if (!this.muted && !this.paused) el.play().catch(() => {}); };
    tryNext(0);
    let k = 0; const iv = setInterval(() => { k = Math.min(1, k + 0.05); el.volume = k * this.musicVol * (this.muted ? 0 : 1); if (old) old.volume = (1 - k) * old.volume; if (k >= 1) { clearInterval(iv); old?.pause(); } }, 50);
  }
  voice(key, minGapMs = 5000) { // one bark at a time; music ducks underneath
    if (this.muted || this.paused || Date.now() - this.lastVoice < minGapMs) return;
    const rel = this.assets.manifest.voice?.[key]; if (!rel) return;
    this.lastVoice = Date.now();
    const a = new Audio(this.assets.url(rel.replace('{lang}', this.lang)));
    a.onerror = () => { if (this.lang !== 'en') { a.onerror = null; a.src = this.assets.url(rel.replace('{lang}', 'en')); a.play().catch(() => {}); } };
    a.volume = Math.min(1, this.sfxVol * 1.1);
    if (this.music) { this.music.volume = this.musicVol * 0.35; a.onended = () => this.music && (this.music.volume = this.musicVol); }
    a.play().catch(() => {});
  }
  setMuted(m) { this.muted = m; if (this.music) { this.music.volume = m ? 0 : this.musicVol; m ? this.music.pause() : this.music.play().catch(() => {}); } }
  pause() { this.paused = true; this.ctx?.suspend(); this.music?.pause(); }
  resume() { this.paused = false; this.ctx?.resume(); if (!this.muted) this.music?.play().catch(() => {}); }
}
