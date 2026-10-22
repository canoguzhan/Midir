// node render.mjs <brandDir>: preview sheet + PNG exports (transparent) of the SVGs via headless Chromium
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: ['/root/midir/node_modules', '/root/.local/share/game-factory/node_modules'] }));
const dir = process.argv[2], png = path.join(dir, 'png'); fs.mkdirSync(png, { recursive: true });
const svg = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const b = await chromium.launch();
async function shot(html, w, h, file, transparent = true) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#fff'}">${html}</body></html>`);
  await p.screenshot({ path: file, omitBackground: transparent }); await p.close();
}
const sized = (s, w, h) => s.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`);
const dims = (s) => s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
const [lw, lh] = dims(svg('devcan-logo.svg')), [sw, sh] = dims(svg('devcan-logo-stacked.svg'));
// exports
await shot(sized(svg('devcan-logo.svg'), 2400, Math.round((2400 * lh) / lw)), 2400, Math.round((2400 * lh) / lw), path.join(png, 'devcan-logo-2400.png'));
await shot(sized(svg('devcan-logo.svg'), 1200, Math.round((1200 * lh) / lw)), 1200, Math.round((1200 * lh) / lw), path.join(png, 'devcan-logo-1200.png'));
await shot(sized(svg('devcan-logo-stacked.svg'), 1200, Math.round((1200 * sh) / sw)), 1200, Math.round((1200 * sh) / sw), path.join(png, 'devcan-logo-stacked-1200.png'));
for (const s of [1024, 512, 192, 180, 32, 16]) await shot(sized(svg('devcan-icon.svg'), s, s), s, s, path.join(png, `devcan-icon-${s}.png`));
// review sheet
const logo = svg('devcan-logo.svg'), icon = svg('devcan-icon.svg'), st = svg('devcan-logo-stacked.svg');
const html = `<div style="font-family:sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:0;width:1600px">
 <div style="background:#ffffff;padding:40px">${sized(logo, 720, Math.round(720 * lh / lw))}</div>
 <div style="background:#141022;padding:40px">${sized(logo, 720, Math.round(720 * lh / lw))}</div>
 <div style="background:#ffe9a8;padding:40px;display:flex;gap:30px;align-items:center">${sized(st, 300, Math.round(300 * sh / sw))}<div>${sized(logo, 360, Math.round(360 * lh / lw))}</div></div>
 <div style="background:#2a2f3a;padding:40px;display:flex;gap:28px;align-items:end;color:#ccc">
   ${[192, 64, 32, 16].map((s) => `<div style="text-align:center">${sized(icon, s, s)}<div style="font-size:12px">${s}px</div></div>`).join('')}
   <div style="background:#dfe3ea;padding:6px 10px;border-radius:6px;display:flex;gap:6px;align-items:center;color:#222;font-size:13px">${sized(icon, 16, 16)} DevCan Games — tab</div>
 </div></div>`;
await shot(html, 1600, 900, path.join(dir, '..', 'devcan-review.png'), false);
await b.close(); console.log(fs.readdirSync(png).join(', '));
