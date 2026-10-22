// DevCan Games brand mark: node make_logo.mjs <fontsDir> <outDir>
// Icon: a pixel heart (Turkish "can" = life, the classic extra life) on a glossy violet tile.
// Wordmark: "DevCan" in Lilita One outlines with a sticker outline + drop, "GAMES" in tracked Nunito ExtraBold.
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

const [fontsDir, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const font = async (f) => { const b = await wawoff2.decompress(fs.readFileSync(path.join(fontsDir, f))); return opentype.parse(Buffer.from(b).buffer); };
const lilita = await font('lilita-one-latin-400-normal.woff2'), nunito = await font('nunito-latin-800-normal.woff2');

const C = { ink: '#24104f', tileTop: '#8247ff', tileBot: '#4a1cc9', heart: '#ff4f6e', heartDark: '#d3264d', heartLight: '#ffb3c2', white: '#ffffff', gold: '#ffd23f' };

// ---- pixel heart
const HEART = [
  '.XXX...XXX.',
  'XXXXX.XXXXX',
  'XXXXXXXXXXX',
  'XXXXXXXXXXX',
  '.XXXXXXXXX.',
  '..XXXXXXX..',
  '...XXXXX...',
  '....XXX....',
  '.....X.....',
];
function heartRects(px, ox, oy) {
  const H = HEART.length, W = HEART[0].length, on = (x, y) => y >= 0 && y < H && x >= 0 && x < W && HEART[y][x] === 'X';
  const rects = { outline: [], fill: [], dark: [], light: [] };
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    const r = `<rect x="${ox + (x + 1) * px}" y="${oy + (y + 1) * px}" width="${px}" height="${px}"/>`;
    if (on(x, y)) {
      const edgeBR = !on(x + 1, y) || !on(x, y + 1) || !on(x + 1, y + 1);
      const light = (y === 1 && (x === 1 || x === 2)) || (y === 2 && x === 1) || (y === 0 && x === 2);
      (light ? rects.light : edgeBR && y > 1 ? rects.dark : rects.fill).push(r);
    } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) rects.outline.push(r);
  }
  return rects;
}
function heartSVG(px, ox, oy, shadow = true) {
  const r = heartRects(px, ox, oy), drop = heartRects(px, ox + px, oy + px);
  return `<g shape-rendering="crispEdges">
    ${shadow ? `<g fill="${C.ink}" opacity=".35">${[...drop.outline, ...drop.fill, ...drop.dark, ...drop.light].join('')}</g>` : ''}
    <g fill="${C.ink}">${r.outline.join('')}</g>
    <g fill="${C.heart}">${r.fill.join('')}</g>
    <g fill="${C.heartDark}">${r.dark.join('')}</g>
    <g fill="${C.heartLight}">${r.light.join('')}</g>
  </g>`;
}
const sparkle = (x, y, p, color = C.white) => `<g fill="${color}" shape-rendering="crispEdges"><rect x="${x}" y="${y - p}" width="${p}" height="${p * 3}"/><rect x="${x - p}" y="${y}" width="${p * 3}" height="${p}"/></g>`;

// ---- icon tile (512)
function iconInner(id) {
  const px = 28, hw = (HEART[0].length + 2) * px, hh = (HEART.length + 2) * px, ox = Math.round((512 - hw) / 2), oy = Math.round((512 - hh) / 2) + 10;
  return `<defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.tileTop}"/><stop offset="1" stop-color="${C.tileBot}"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="120" fill="${C.ink}"/>
  <rect x="16" y="16" width="480" height="480" rx="106" fill="url(#${id}g)"/>
  <path d="M122 16h268a106 106 0 0 1 106 106v40c-70 28-160 42-240 42S86 190 16 162v-40A106 106 0 0 1 122 16z" fill="url(#${id}s)"/>
  ${heartSVG(px, ox, oy)}
  ${sparkle(392, 98, 14)}${sparkle(436, 150, 9, C.gold)}${sparkle(96, 396, 9)}`;
}
const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${iconInner('i')}</svg>`;

// ---- wordmark
const pd = (f, text, x, y, size, track = 0) => {
  if (!track) return f.getPath(text, x, y, size).toPathData(2);
  let d = '', cx = x;
  for (const ch of text) { const g = f.charToGlyph(ch); d += g.getPath(cx, y, size).toPathData(2); cx += (g.advanceWidth / f.unitsPerEm) * size + track; }
  return d;
};
const width = (f, text, size, track = 0) => [...text].reduce((a, ch) => a + (f.charToGlyph(ch).advanceWidth / f.unitsPerEm) * size + track, 0) - track;
function wordmark(x, y, size) { // returns svg + width; y = baseline of DevCan
  const wDev = width(lilita, 'Dev', size), wCan = width(lilita, 'Can', size), w = wDev + wCan;
  const dev = pd(lilita, 'Dev', x, y, size), can = pd(lilita, 'Can', x + wDev, y, size);
  const gSize = size * 0.34, track = gSize * 0.55, gW = width(nunito, 'GAMES', gSize, track), gx = x + (w - gW) / 2, gy = y + size * 0.52;
  const games = pd(nunito, 'GAMES', gx, gy, gSize, track), sw = size * 0.12, drop = size * 0.075;
  const svg = `<g stroke-linejoin="round" stroke-linecap="round">
    <g transform="translate(0 ${drop})" fill="${C.ink}" stroke="${C.ink}" stroke-width="${sw}"><path d="${dev}"/><path d="${can}"/></g>
    <g fill="${C.ink}" stroke="${C.ink}" stroke-width="${sw}"><path d="${dev}"/><path d="${can}"/></g>
    <path d="${dev}" fill="${C.white}"/><path d="${can}" fill="${C.heart}"/>
    <path d="${can}" fill="none" stroke="${C.heartLight}" stroke-width="${size * 0.018}" opacity=".0"/>
    <g fill="${C.ink}" stroke="${C.ink}" stroke-width="${gSize * 0.32}"><path d="${games}"/></g>
    <path d="${games}" fill="${C.gold}"/>
  </g>`;
  return { svg, w: Math.max(w, gW), h: size * 0.9 };
}
// horizontal lockup
{
  const size = 300, wm = wordmark(0, 0, size), iconS = 400, gap = 60, pad = 40;
  const W = pad * 2 + iconS + gap + wm.w + size * 0.12, Hh = pad * 2 + iconS;
  const base = pad + iconS / 2 + size * 0.2; // baseline so DevCan + GAMES sit centred on the icon
  const w2 = wordmark(pad + iconS + gap, base, size);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(W)} ${Hh}" width="${Math.ceil(W)}" height="${Hh}">
  <g transform="translate(${pad} ${pad}) scale(${iconS / 512})">${iconInner('h')}</g>${w2.svg}</svg>`;
  fs.writeFileSync(path.join(out, 'devcan-logo.svg'), svg);
}
// stacked lockup (square-ish)
{
  const size = 260, probe = wordmark(0, 0, size), iconS = 420, pad = 50;
  const W = Math.ceil(Math.max(iconS, probe.w + size * 0.12) + pad * 2), x = (W - probe.w) / 2, base = pad + iconS + 40 + size * 0.72;
  const w2 = wordmark(x, base, size), Hh = Math.ceil(base + size * 0.62 + pad);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">
  <g transform="translate(${(W - iconS) / 2} ${pad}) scale(${iconS / 512})">${iconInner('s')}</g>${w2.svg}</svg>`;
  fs.writeFileSync(path.join(out, 'devcan-logo-stacked.svg'), svg);
}
fs.writeFileSync(path.join(out, 'devcan-icon.svg'), iconSVG);
console.log('wrote', fs.readdirSync(out).join(', '));
