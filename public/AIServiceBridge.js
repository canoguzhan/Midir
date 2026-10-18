// Runtime AI generation adapter. Disabled by default: shipped assets come from tools/gen_assets.py at build time.
// When enabled, requests go to the server-side proxy in server.py (TRIPO_PROXY=1), so API keys never touch the client.
export const AI_CONFIG = {
  tripo: { enabled: false, endpoint: '/api/tripo', pollMs: 4000, timeoutMs: 6 * 60 * 1000 },
};

export class AIServiceBridge {
  constructor(assets, config = AI_CONFIG) { this.assets = assets; this.cfg = config; }

  // Generate a mesh from a prompt and load it. Resolves to a GLTF or null (disabled, failed, rate limited).
  async requestModel(prompt, onProgress = () => {}) {
    const c = this.cfg.tripo; if (!c.enabled) return null;
    try {
      const r = await fetch(`${c.endpoint}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      if (!r.ok) return null;
      const { task_id } = await r.json(), t0 = Date.now();
      while (Date.now() - t0 < c.timeoutMs) {
        await new Promise((ok) => setTimeout(ok, c.pollMs));
        const s = await (await fetch(`${c.endpoint}/task/${task_id}`)).json();
        onProgress(s.progress ?? 0);
        if (s.status === 'success' && s.url) return await this.assets.loader.loadAsync(s.url);
        if (['failed', 'cancelled', 'banned', 'expired'].includes(s.status)) return null;
      }
    } catch (e) { console.warn('[AIServiceBridge]', e); }
    return null;
  }
}
