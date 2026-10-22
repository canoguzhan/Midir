#!/usr/bin/env node
// DevCan Games portal: https://devcangames.com (public site) + https://play.devcangames.com (the games, a separate origin).
//   PORT=8100 node portal/server.mjs        DEVCAN_DIR=/srv/devcan (filled by tools/publish_devcan.py)
// Routes by Host header. devcangames.com: / (game grid), /games/<slug> (game page with the game in a frame), /privacy,
// /assets/* (portal css, logo, fonts). play.devcangames.com: /<slug>/... (game files). Any other host (localhost tests)
// serves the portal and the games under /__play/<slug>/ so one port is enough. No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = process.env.DEVCAN_DIR || '/srv/devcan';
const PORT = Number(process.env.PORT || 8100);
const SITE = process.env.SITE_HOST || 'devcangames.com', PLAY = process.env.PLAY_HOST || 'play.devcangames.com';
const STUDIO = JSON.parse(await readFile(path.join(ROOT, 'studio.json'), 'utf8').catch(() => '{}'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4' };
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let catalog = { games: [] }, catalogAt = 0;
async function games() { // re-read when publish_devcan.py rewrites it
  try { const s = await stat(path.join(DATA, 'catalog.json')); if (s.mtimeMs !== catalogAt) { catalog = JSON.parse(await readFile(path.join(DATA, 'catalog.json'), 'utf8')); catalogAt = s.mtimeMs; } } catch {}
  return catalog.games || [];
}

async function sendFile(res, base, rel, headers = {}) {
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.') || p === '..')) return notFound(res);
  let file = path.join(base, ...parts);
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(body);
  } catch { notFound(res); }
}
function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Page not found', '<main class="wrap narrow"><h1>Lost a life?</h1><p class="lead">This page does not exist. The games are this way.</p><a class="btn play" href="/">Back to the games</a></main>')); }

// ---------------------------------------------------------------- pages
const playBase = (host) => (host === SITE || host === `www.${SITE}` ? `https://${PLAY}` : '/__play');
function page(title, body, { desc = STUDIO.about || '', image = '/assets/devcan-logo-1200.png', canonical = '' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title><meta name="description" content="${e(desc)}">
<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}"><meta property="og:image" content="${e(image)}"><meta property="og:type" content="website">
${canonical ? `<link rel="canonical" href="https://${SITE}${e(canonical)}">` : ''}
<meta name="theme-color" content="#24104f"><link rel="icon" href="/assets/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/assets/devcan-icon.svg"><link rel="apple-touch-icon" href="/assets/devcan-icon-180.png">
<link rel="preload" href="/assets/lilita-one-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/portal.css"></head>
<body><header class="top"><div class="wrap bar"><a class="brand" href="/" aria-label="DevCan Games home"><img src="/assets/devcan-logo.svg" alt="DevCan Games" width="190" height="62"></a>
<nav><a href="/#games">Games</a></nav></div></header>${body}
<footer class="foot"><div class="wrap"><img src="/assets/devcan-icon.svg" alt="" width="36" height="36"><div><b>${e(STUDIO.name || 'DevCan Games')}</b><p>${e(STUDIO.about || '')}</p>
<p class="links"><a href="/privacy">Privacy</a>${STUDIO.email ? ` · <a href="mailto:${e(STUDIO.email)}">${e(STUDIO.email)}</a>` : ''} · © ${new Date().getFullYear()} ${e(STUDIO.name || 'DevCan Games')}</p></div></div></footer></body></html>`;
}
const card = (g) => `<a class="card" href="/games/${e(g.slug)}"><span class="thumb"><img src="/media/${e(g.slug)}/${e(g.media?.card || 'card.webp')}" alt="" loading="lazy" width="600" height="600">
  ${g.online ? '<span class="pill online">Online</span>' : ''}</span><span class="info"><b>${e(g.title)}</b><small>${e(g.category)}</small></span><span class="go" aria-hidden="true">▶</span></a>`;
async function home() {
  const list = await games(), hero = list[0];
  const heroHtml = hero ? `<section class="hero"><img class="bg" src="/media/${e(hero.slug)}/${e(hero.media?.hero || 'hero.webp')}" alt="" width="1600" height="900">
    <div class="wrap hero-in"><span class="eyebrow">New game</span><h1>${e(hero.title)}</h1><p class="lead">${e(hero.description)}</p>
    <div class="actions"><a class="btn play big" href="/games/${e(hero.slug)}">▶ Play now</a><span class="note">Free · no download · plays in your browser</span></div></div></section>` : '';
  return page('DevCan Games: free browser games', `${heroHtml}<main class="wrap" id="games"><div class="sec"><h2>All games</h2><p>${list.length} free games for desktop and mobile. Pick one and play in one click.</p></div>
    <div class="grid">${list.map(card).join('') || '<p class="lead">The first games are on their way.</p>'}</div></main>`, { canonical: '/' });
}
const keys = (s) => e(s).replace(/\b(WASD|Space|Enter|Shift|P|E|Q|R|F|[A-Z]\b)/g, '<kbd>$1</kbd>');
async function gamePage(slug, host) {
  const list = await games(), g = list.find((x) => x.slug === slug);
  if (!g) return null;
  const more = list.filter((x) => x.slug !== slug).slice(0, 6);
  const src = `${playBase(host)}/${e(g.slug)}/`;
  return page(`${g.title} · Play free on DevCan Games`, `<main class="wrap game">
    <div class="stage" id="stage"><iframe id="frame" src="${src}" title="${e(g.title)}" allow="autoplay; fullscreen; gamepad; clipboard-write" allowfullscreen></iframe></div>
    <div class="stage-bar"><h1>${e(g.title)}</h1><button class="btn" id="fs" type="button">⛶ Full screen</button></div>
    ${g.orientation === 'landscape' ? '<p class="rotate">Turn your phone sideways for the best view.</p>' : ''}
    <div class="about"><div><p class="lead">${e(g.description)}</p><div class="tags">${[g.category, ...(g.tags || [])].filter(Boolean).slice(0, 7).map((t) => `<span>${e(t)}</span>`).join('')}</div></div>
    <dl class="controls">${g.controls?.desktop ? `<dt>Keyboard &amp; mouse</dt><dd>${keys(g.controls.desktop)}</dd>` : ''}${g.controls?.mobile ? `<dt>Touch</dt><dd>${e(g.controls.mobile)}</dd>` : ''}</dl></div>
    ${more.length ? `<div class="sec"><h2>More games</h2></div><div class="grid small">${more.map(card).join('')}</div>` : ''}</main>
    <script>document.getElementById('fs').addEventListener('click',()=>{const s=document.getElementById('stage');(s.requestFullscreen||s.webkitRequestFullscreen||function(){}).call(s);document.getElementById('frame').focus();});document.getElementById('frame').focus();</script>`,
  { desc: g.description, image: `https://${SITE}/media/${g.slug}/${g.media?.share || 'share.jpg'}`, canonical: `/games/${g.slug}` });
}
function privacy() {
  return page('Privacy · DevCan Games', `<main class="wrap narrow prose"><h1>Privacy</h1><p class="lead">Short version: you can play every game without an account, and we do not track you.</p>
  <h2>What the games store</h2><p>Your progress and settings are saved in your own browser (local storage) on this device. Clearing your browser data deletes them. We use no advertising or analytics cookies.</p>
  <h2>Online games</h2><p>When you play an online game, our game server receives your randomly generated player name and your moves for the length of the match. It keeps the daily top 10 names and scores and anonymous play counters, nothing else.</p>
  <h2>Server logs</h2><p>Like every website, our web server briefly records technical request data (IP address, time, page) to keep the service secure and working.</p>
  <h2>Accounts</h2><p>Player accounts are coming. When they arrive, this page will say exactly what an account stores, and you will be able to delete yours at any time.</p>
  <h2>Contact</h2><p>${STUDIO.email ? `Questions: <a href="mailto:${e(STUDIO.email)}">${e(STUDIO.email)}</a>.` : 'Questions: use the contact address in the footer.'}</p></main>`, { canonical: '/privacy' });
}

// ---------------------------------------------------------------- server
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const csp = (host) => `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'unsafe-inline'; frame-src ${host === SITE || host === `www.${SITE}` ? `https://${PLAY}` : "'self'"}; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
function html(res, body, host, code = 200) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': csp(host), ...SEC }); res.end(body); }

createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0].toLowerCase(), url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (host === `www.${SITE}`) { res.writeHead(301, { Location: `https://${SITE}${req.url}` }); res.end(); return; }
    const gameFiles = (rel) => sendFile(res, path.join(DATA, 'play'), rel, { 'Cache-Control': 'no-cache', 'Content-Security-Policy': `frame-ancestors https://${SITE} http://localhost:* http://127.0.0.1:*`, ...SEC });
    if (host === PLAY) { if (p === '/') { res.writeHead(302, { Location: `https://${SITE}/` }); res.end(); return; } return gameFiles(p); }
    if (p.startsWith('/__play/') && host !== SITE) return gameFiles(p.slice(7)); // local tests: games on the same port
    if (p === '/' || p === '/index.html') return html(res, await home(), host);
    if (p === '/privacy') return html(res, privacy(), host);
    const m = p.match(/^\/games\/([a-z0-9-]+)\/?$/);
    if (m) { const b = await gamePage(m[1], host); return b ? html(res, b, host) : notFound(res); }
    if (p.startsWith('/assets/')) return sendFile(res, path.join(HERE, 'assets'), p.slice(8), { 'Cache-Control': 'public, max-age=3600', ...SEC });
    if (p.startsWith('/media/')) return sendFile(res, path.join(DATA, 'media'), p.slice(7), { 'Cache-Control': 'public, max-age=3600', ...SEC });
    if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(`User-agent: *\nAllow: /\nSitemap: https://${SITE}/sitemap.xml\n`); return; }
    if (p === '/sitemap.xml') {
      const urls = ['/', '/privacy', ...(await games()).map((g) => `/games/${g.slug}`)];
      res.writeHead(200, { 'Content-Type': 'application/xml' }); res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>https://${SITE}${u}</loc></url>`).join('')}</urlset>`); return;
    }
    notFound(res);
  } catch (err) { console.error(err); res.writeHead(500); res.end('Server error'); }
}).listen(PORT, '127.0.0.1', () => console.log(`DevCan portal on http://127.0.0.1:${PORT} (data ${DATA})`));
