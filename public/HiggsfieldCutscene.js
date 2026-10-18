// Overlay player for Higgsfield-generated cinematics (MP4/WebM). Fades in over the Three.js canvas,
// plays muted-safe (autoplay policies), lets the player skip, then fades out and hands control back.
export class HiggsfieldCutscene {
  constructor({ bridge, sound }) {
    this.bridge = bridge; this.sound = sound;
    this.el = document.createElement('div'); this.el.className = 'cutscene'; this.el.hidden = true;
    this.el.innerHTML = '<video playsinline preload="auto"></video><div class="cs-title"></div><button class="cs-skip" type="button"></button>';
    document.body.appendChild(this.el); this.video = this.el.querySelector('video');
  }
  // play(src, {title, skipLabel, maxMs}) resolves when the clip ends, is skipped or fails to load
  play(src, { title = '', skipLabel = 'Skip ›', maxMs = 12000 } = {}) {
    return new Promise((resolve) => {
      if (!src) return resolve(false);
      const v = this.video, el = this.el; let finished = false;
      const finish = (played) => {
        if (finished) return; finished = true; clearTimeout(cap); el.classList.remove('show');
        setTimeout(() => { el.hidden = true; v.pause(); v.removeAttribute('src'); v.load(); this.sound?.resume(); resolve(played); }, 450);
      };
      el.querySelector('.cs-title').textContent = title; el.querySelector('.cs-skip').textContent = skipLabel;
      el.querySelector('.cs-skip').onclick = () => finish(true);
      this.bridge?.gameplayStop(); this.sound?.pause();
      v.muted = this.sound?.muted ?? false; v.src = src;
      v.onended = () => finish(true); v.onerror = () => finish(false);
      el.hidden = false; requestAnimationFrame(() => el.classList.add('show'));
      v.play().catch(() => { v.muted = true; v.play().catch(() => finish(false)); }); // fall back to muted autoplay
      const cap = setTimeout(() => finish(true), maxMs);
    });
  }
}
