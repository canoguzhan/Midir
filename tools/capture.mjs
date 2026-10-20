#!/usr/bin/env node
// Press-kit capture: node tools/capture.mjs <slug> <outDir> [--shots] [--video] [--covers] [--fps=24] [--seconds=14]
// Needs the game's capture protocol (see CLAUDE.md): with ?capture=1 the game skips its rAF loop, runs its autoplay bot and
// exposes window.__game = { start(), frame(dt), skip(seconds) }. Timings come from game.json "capture": {warmup, shots}.
// Writes <outDir>/screenshots/NN.png (1920x1080 with HUD) and <outDir>/frames-{landscape,portrait}/NNNNN.jpg for release.py.
// --covers needs window.__game.cover(kind): the game stages a hero shot without UI; writes <outDir>/cover-raw-<kind>.png
// (landscape 1920x1080, portrait 800x1200, square 800x800, keyart 1920x1080) for tools/game_covers.py.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [path.join(ROOT, 'node_modules'), '/root/.local/share/game-factory/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch {}
  }
  console.error('playwright not found: npm install && npm run setup'); process.exit(2);
})();

const [slug, outDir] = process.argv.slice(2);
if (!slug || !outDir) { console.error('usage: node tools/capture.mjs <slug> <outDir> [--shots] [--video] [--fps=24] [--seconds=14]'); process.exit(2); }
const opt = Object.fromEntries(process.argv.slice(4).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const dir = path.join(ROOT, 'games', slug);
const meta = JSON.parse(await readFile(path.join(dir, 'game.json'), 'utf8'));
const cap = { warmup: 60, shots: [0, 20, 60, 120, 240], ...(meta.capture || {}) };
const fps = Number(opt.fps || 24), seconds = Number(opt.seconds || 14);

const TYPES = { '.woff2': 'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = createServer(async (req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = path.join(dir, p || 'index.html');
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/?capture=1&lang=en`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
  return page;
}

if (opt.shots) { // 1920x1080 stills with HUD: menu first (t=0), then gameplay at the given seconds of autoplay
  const page = await open(1920, 1080), shots = path.join(outDir, 'screenshots');
  await mkdir(shots, { recursive: true });
  let t = 0, n = 0;
  for (const at of cap.shots) {
    if (at === 0 && n === 0) { await page.evaluate(() => window.__game.frame(1 / 30)); }
    else {
      if (n === 0 || t === 0) await page.evaluate(() => window.__game.start());
      await page.evaluate((s) => window.__game.skip(s), Math.max(0, at - t - 0.27)); t = at;
      for (let i = 0; i < 8; i++) await page.evaluate(() => window.__game.frame(1 / 30)); // a few rendered frames so effects are mid-flight
    }
    const file = path.join(shots, `${String(++n).padStart(2, '0')}.png`);
    await page.screenshot({ path: file, timeout: 180000 }); console.log('shot', file);
  }
  await page.close();
}

if (opt.video) { // frame-by-frame gameplay for the preview videos (upscaled to 1080p by release.py)
  for (const [name, w, h] of [['landscape', 1280, 720], ['portrait', 720, 1080]]) {
    const page = await open(w, h), frames = path.join(outDir, `frames-${name}`);
    await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true });
    await page.evaluate((s) => { window.__game.start(); window.__game.skip(s); }, cap.warmup);
    const cdp = await page.context().newCDPSession(page), total = Math.round(fps * seconds), t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((dt) => window.__game.frame(dt), 1 / fps);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
      await writeFile(path.join(frames, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
      if (i % 48 === 0) console.log(`${name} frame ${i}/${total} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
    await page.close();
  }
}
if (opt.covers) { // honest covers: rendered from the game itself, no HUD (the title is drawn by tools/game_covers.py)
  for (const [kind, w, h] of [['landscape', 1920, 1080], ['portrait', 800, 1200], ['square', 800, 800], ['keyart', 1920, 1080]]) {
    const page = await open(w, h);
    if (!(await page.evaluate(() => typeof window.__game.cover === 'function'))) { console.error('game has no window.__game.cover(kind)'); process.exit(3); }
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate((k) => window.__game.cover(k), kind);
    await mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `cover-raw-${kind}.png`);
    await page.screenshot({ path: file, timeout: 180000 }); console.log('cover', file);
    await page.close();
  }
}
await browser.close(); server.close();
