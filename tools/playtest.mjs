#!/usr/bin/env node
// Headless smoke test: node tools/playtest.mjs <slug> [--keys=KeyW,KeyD,Space] [--seconds=4]
// Serves games/<slug>/ on a random localhost port, loads it in Chromium at a CrazyGames desktop size (1216x684) and the
// mobile size (800x450, touch), clicks #btnPlay, holds the given keys, and saves screenshots to games/<slug>/dist/shots/.
// Exits 1 on page errors, console errors or failed local requests. Missing assets that fall back procedurally are listed.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [path.join(ROOT, 'node_modules'), '/root/.local/share/game-factory/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch {}
  }
  console.error('playwright not found: run `npm install` in the repo root, then `npx playwright install --with-deps chromium`'); process.exit(2);
})();

const slug = process.argv[2];
if (!slug) { console.error('usage: node tools/playtest.mjs <slug> [--keys=KeyW,KeyD,Space] [--seconds=4]'); process.exit(2); }
const opt = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const keys = (opt.keys || 'KeyW,KeyD').split(','), seconds = Number(opt.seconds || 4);
const dir = path.join(ROOT, 'games', slug), shots = path.join(dir, 'dist', 'shots');
await stat(path.join(dir, 'index.html')).catch(() => { console.error(`games/${slug}/index.html not found`); process.exit(2); });
await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = path.join(dir, p || 'index.html');
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  try { const b = await readFile(file.endsWith(path.sep) ? path.join(file, 'index.html') : file); res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(b); }
  catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const problems = [], missing = new Set();
for (const vp of [{ name: 'desktop', width: 1216, height: 684, touch: false }, { name: 'mobile', width: 800, height: 450, touch: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${vp.name}] page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`[${vp.name}] console: ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() === 404) missing.add(r.url().slice(base.length)); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(base) && !(r.failure()?.errorText === 'net::ERR_ABORTED' && r.resourceType() === 'media')) problems.push(`[${vp.name}] request failed: ${r.url().slice(base.length)}`); });
  await page.goto(base, { waitUntil: 'load', timeout: 60000 });
  const play = page.locator('#btnPlay');
  try { await play.waitFor({ state: 'visible', timeout: 30000 }); }
  catch { problems.push(`[${vp.name}] #btnPlay never became visible (stuck in loading/BOOT?)`); }
  await page.screenshot({ path: path.join(shots, `${vp.name}-menu.png`), timeout: 120000 });
  if (await play.isVisible()) {
    await play.click();
    await page.waitForTimeout(400);
    if (vp.touch) { // drag the floating joystick
      const cx = vp.width * 0.3, cy = vp.height * 0.6;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy - 30, { steps: 5 });
      await page.waitForTimeout(seconds * 1000); await page.mouse.up();
    } else {
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(seconds * 1000);
      for (const k of keys) await page.keyboard.up(k);
    }
    await page.screenshot({ path: path.join(shots, `${vp.name}-play.png`), timeout: 120000 });
  }
  await ctx.close();
}
await browser.close(); server.close();

if (missing.size) console.log('missing (fallbacks used):\n  ' + [...missing].join('\n  '));
console.log(`screenshots: games/${slug}/dist/shots/{desktop,mobile}-{menu,play}.png`);
if (problems.length) { console.log('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('playtest OK');
