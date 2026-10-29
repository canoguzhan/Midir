#!/usr/bin/env node
// DevCan Games portal: https://devcangames.com (public site + accounts) and https://play.devcangames.com (the games, a separate origin).
//   PORT=8100 DEVCAN_DIR=/srv/devcan node portal/server.mjs     secrets come from the environment (systemd EnvironmentFile
//   /etc/devcan/portal.env): GOOGLE_CLIENT_ID/SECRET, SMTP_HOST/PORT/USER/PASS, MAIL_FROM, SESSION_SECRET; MAIL_DRYRUN=1 writes
//   emails to DEVCAN_DIR/outbox instead of sending (tests).
// Routes by Host header. devcangames.com: / (game grid), /games/<slug> (game page; the game runs in a frame from the play
// origin and saves to the account through assets/bridge.js), account pages, /api/* (portal/accounts.mjs), /privacy, /terms.
// play.devcangames.com: /<slug>/... (game files) and /devcan-sdk.js. Any other host (localhost tests) serves the portal and
// the games under /__play/<slug>/ so one port is enough.
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { createAccounts } from './accounts.mjs';
import { NAME_A, NAME_B } from '../games/whirlbash/sim.js'; // the same word lists as in-game player names

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = process.env.DEVCAN_DIR || '/srv/devcan';
const PORT = Number(process.env.PORT || 8100);
const SITE = process.env.SITE_HOST || 'devcangames.com', PLAY = process.env.PLAY_HOST || 'play.devcangames.com';
const STUDIO = JSON.parse(await readFile(path.join(ROOT, 'studio.json'), 'utf8').catch(() => '{}'));
const NAME = STUDIO.name || 'DevCan Games', EMAIL = STUDIO.email || '';
const accounts = createAccounts({ db: openDb(DATA), env: process.env, site: SITE, dataDir: DATA, names: { A: NAME_A, B: NAME_B } });
// Google ads (AdSense + H5 Games Ads), off unless ADS_CLIENT is set. ADS_TEST=on serves Google's test ads only.
// Ads appear only on the home page and game pages (display units need ADS_SLOT_HOME / ADS_SLOT_GAME from AdSense) and
// inside games through /devcan-sdk.js; account pages never load ad code and keep the strict CSP.
const ADS = /^ca-pub-\d{10,20}$/.test(process.env.ADS_CLIENT || '') ? { client: process.env.ADS_CLIENT, test: process.env.ADS_TEST === 'on' } : null;
const ADS_TXT = ADS ? `google.com, ${ADS.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` : '';
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
function notFound(res, user) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Page not found', '<main class="wrap narrow"><h1>Lost a life?</h1><p class="lead">This page does not exist. The games are this way.</p><p><a class="btn play" href="/">Back to the games</a></p></main>', { user })); }

// ---------------------------------------------------------------- pages
const isSite = (host) => host === SITE || host === `www.${SITE}`;
const playBase = (host) => (isSite(host) ? `https://${PLAY}` : '/__play');
const adHead = (nonce) => (ADS && nonce ? `<meta name="google-adsense-account" content="${ADS.client}">
<script nonce="${nonce}">(window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;</script>
<script async nonce="${nonce}" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}" crossorigin="anonymous"${ADS.test ? ' data-adtest="on"' : ''}></script>` : '');
const adUnit = (slot, nonce) => (ADS && nonce && slot ? `<aside class="ad" aria-label="Advertisement"><small>Advertisement</small><ins class="adsbygoogle" style="display:block" data-ad-client="${ADS.client}" data-ad-slot="${e(slot)}" data-ad-format="auto" data-full-width-responsive="true"${ADS.test ? ' data-adtest="on"' : ''}></ins>
<script nonce="${nonce}">(window.adsbygoogle = window.adsbygoogle || []).push({});</script></aside>` : '');
function page(title, body, { desc = STUDIO.about || '', image = '/assets/devcan-logo-1200.png', canonical = '', user = null, scripts = [], noindex = false, nonce = '' } = {}) {
  const account = user ? `<a class="me" href="/account" title="Your account"><img src="/assets/devcan-icon.svg" alt="" width="22" height="22">${e(user.name)}</a>`
    : '<a class="btn small" href="/signin">Sign in</a>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title><meta name="description" content="${e(desc)}">${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}"><meta property="og:image" content="${e(image)}"><meta property="og:type" content="website">
${canonical ? `<link rel="canonical" href="https://${SITE}${e(canonical)}">` : ''}
<meta name="theme-color" content="#24104f"><link rel="icon" href="/assets/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/assets/devcan-icon.svg"><link rel="apple-touch-icon" href="/assets/devcan-icon-180.png">
<link rel="preload" href="/assets/lilita-one-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/portal.css">${adHead(nonce)}</head>
<body><header class="top"><div class="wrap bar"><a class="brand" href="/" aria-label="${e(NAME)} home"><img src="/assets/devcan-logo.svg" alt="${e(NAME)}" width="190" height="62"></a>
<nav><a href="/games">Games</a>${account}</nav></div></header>${body}
<footer class="foot"><div class="wrap"><img src="/assets/devcan-icon.svg" alt="" width="36" height="36"><div><b>${e(NAME)}</b><p>${e(STUDIO.about || '')}</p>
<p class="links"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>${EMAIL ? ` · <a href="mailto:${e(EMAIL)}">${e(EMAIL)}</a>` : ''} · © ${new Date().getFullYear()} ${e(NAME)}</p></div></div></footer>
${scripts.map((s) => `<script src="${s}" defer${nonce ? ` nonce="${nonce}"` : ''}></script>`).join('')}</body></html>`;
}
const card = (g) => `<a class="card" href="/games/${e(g.slug)}"><span class="thumb"><img src="/media/${e(g.slug)}/${e(g.media?.card || 'card.webp')}" alt="" loading="lazy" width="600" height="600">
  ${g.online ? '<span class="pill online">Online</span>' : ''}</span><span class="info"><b>${e(g.title)}</b><small>${e(CAT_NAMES[g.category] || g.category)}</small></span><span class="go" aria-hidden="true">▶</span></a>`;
// categories: each game's game.json category, plus collections that cut across them (shown first)
const CAT_NAMES = { Clicker: 'Idle & Clicker' };
const CAT_BLURBS = { Action: 'Fast hands, big hits and boss fights.', Adventure: 'Long climbs and journeys with records to chase.',
  Puzzle: 'Brain teasers to sort, match, turn and solve.', Casual: 'Easy to pick up, hard to put down.', Clicker: 'Build, merge and grow, even while you rest.',
  Strategy: 'Plan ahead and outsmart the board.' };
const COLLECTIONS = [
  { slug: 'long-play', name: 'Long play', blurb: 'Deep games for long sessions and streams: hard climbs, long runs and records to beat.', has: (g) => g.long_play },
  { slug: 'online', name: 'Online', blurb: 'Play live with people from around the world.', has: (g) => g.online },
];
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function categories(list) {
  const by = new Map();
  for (const g of list) {
    if (!g.category) continue;
    const slug = slugify(g.category);
    if (!by.has(slug)) by.set(slug, { slug, name: CAT_NAMES[g.category] || g.category, blurb: CAT_BLURBS[g.category] || '', games: [] });
    by.get(slug).games.push(g);
  }
  return [...COLLECTIONS.map((c) => ({ ...c, games: list.filter(c.has) })).filter((c) => c.games.length),
    ...[...by.values()].sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name))];
}
const catBar = (cats, total, on) => `<nav class="cats" aria-label="Categories"><a href="/games"${on === 'all' ? ' class="on" aria-current="page"' : ''}>All games <span>${total}</span></a>${
  cats.map((c) => `<a href="/category/${e(c.slug)}"${on === c.slug ? ' class="on" aria-current="page"' : ''}>${e(c.name)} <span>${c.games.length}</span></a>`).join('')}</nav>`;
async function listPage(user, slug) { // /games (slug 'all') and /category/<slug>
  const list = await games(), cats = categories(list), c = slug === 'all' ? { slug: 'all', name: 'All games', blurb: `${list.length} free games for desktop and mobile.`, games: list } : cats.find((x) => x.slug === slug);
  if (!c) return null;
  return page(`${c.name} games · ${NAME}`, `<main class="wrap"><div class="sec"><h1>${e(c.name)}</h1><p>${e(c.blurb)}${c.slug === 'all' ? '' : ` ${c.games.length} game${c.games.length === 1 ? '' : 's'}.`}</p></div>
    ${catBar(cats, list.length, c.slug)}<div class="grid">${c.games.map(card).join('')}</div></main>`,
  { desc: `${c.name} games on ${NAME}. ${c.blurb}`, canonical: slug === 'all' ? '/games' : `/category/${c.slug}`, user });
}
async function home(user, nonce) {
  const list = await games(), hero = list[0], cats = categories(list);
  const heroHtml = hero ? `<section class="hero"><img class="bg" src="/media/${e(hero.slug)}/${e(hero.media?.hero || 'hero.webp')}" alt="" width="1600" height="900">
    <div class="wrap hero-in"><span class="eyebrow">New game</span><h1>${e(hero.title)}</h1><p class="lead">${e(hero.description)}</p>
    <div class="actions"><a class="btn play big" href="/games/${e(hero.slug)}">▶ Play now</a><span class="note">Free · no download · plays in your browser</span></div></div></section>` : '';
  const pitch = user ? '' : '<div class="pitch"><b>Play as a guest, or make a free account</b><span>An account keeps your progress on every device.</span><a class="btn" href="/signup">Create account</a></div>';
  const row = (c, href = `/category/${c.slug}`) => `<section class="row"><div class="sec head"><h2><a href="${e(href)}">${e(c.name)}</a></h2>${c.games.length > 6 ? `<a class="more" href="${e(href)}">See all ${c.games.length} →</a>` : ''}<p>${e(c.blurb)}</p></div>
    <div class="grid">${c.games.slice(0, 6).map(card).join('')}</div></section>`;
  return page(`${NAME}: free browser games`, `${heroHtml}<main class="wrap" id="games"><div class="sec"><h2>Pick a game</h2><p>${list.length} free games for desktop and mobile. Pick one and play in one click.</p></div>
    ${catBar(cats, list.length, '')}
    ${list.length ? `${row({ name: 'New games', blurb: 'The latest from the studio.', games: list }, '/games')}${cats.map((c) => row(c)).join('')}` : '<p class="lead">The first games are on their way.</p>'}${adUnit(process.env.ADS_SLOT_HOME, nonce)}${pitch}</main>`, { canonical: '/', user, nonce });
}
const keys = (s) => e(s).replace(/\b(WASD|Space|Enter|Shift|P|E|Q|R|F|[A-Z]\b)/g, '<kbd>$1</kbd>');
async function gamePage(slug, host, user, room, nonce, adtest) {
  const list = await games(), g = list.find((x) => x.slug === slug);
  if (!g) return null;
  const more = [...list.filter((x) => x.slug !== slug && x.category === g.category), ...list.filter((x) => x.slug !== slug && x.category !== g.category)].slice(0, 6);
  const tags = [g.category ? `<a href="/category/${e(slugify(g.category))}">${e(CAT_NAMES[g.category] || g.category)}</a>` : '', g.long_play ? '<a href="/category/long-play">Long play</a>' : '',
    ...(g.tags || []).slice(0, 6).map((t) => `<span>${e(t)}</span>`)].join('');
  const qs = new URLSearchParams(); if (room) qs.set('room', room); if (adtest) qs.set('adtest', '1');
  const src = `${playBase(host)}/${e(g.slug)}/${qs.toString() ? `?${e(qs.toString())}` : ''}`;
  const saveNote = user ? `<p class="savenote">Signed in as <b>${e(user.name)}</b>: your progress is saved to your account.</p>`
    : `<p class="savenote">Playing as a guest: progress is saved in this browser only. <a href="/signin?next=/games/${e(g.slug)}">Sign in</a> or <a href="/signup?next=/games/${e(g.slug)}">create an account</a> to keep it on every device.</p>`;
  return page(`${g.title} · Play free on ${NAME}`, `<main class="wrap game">
    <div class="stage" id="stage"><iframe id="frame" data-game="${e(g.slug)}" src="${src}" title="${e(g.title)}" allow="autoplay; fullscreen; gamepad; clipboard-write" allowfullscreen></iframe></div>
    <div class="stage-bar"><h1>${e(g.title)}</h1><button class="btn" id="fs" type="button">⛶ Full screen</button></div>${saveNote}
    ${g.orientation === 'landscape' ? '<p class="rotate">Turn your phone sideways for the best view.</p>' : ''}${adUnit(process.env.ADS_SLOT_GAME, nonce)}
    <div class="about"><div><p class="lead">${e(g.description)}</p><div class="tags">${tags}</div></div>
    <dl class="controls">${g.controls?.desktop ? `<dt>Keyboard &amp; mouse</dt><dd>${keys(g.controls.desktop)}</dd>` : ''}${g.controls?.mobile ? `<dt>Touch</dt><dd>${e(g.controls.mobile)}</dd>` : ''}</dl></div>
    ${more.length ? `<div class="sec"><h2>More games</h2></div><div class="grid small">${more.map(card).join('')}</div>` : ''}</main>`,
  { desc: g.description, image: `https://${SITE}/media/${g.slug}/${g.media?.share || 'share.jpg'}`, canonical: `/games/${g.slug}`, user, scripts: ['/assets/bridge.js'], nonce });
}

// account pages
const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9/_-]*$/i.test(n) && !n.startsWith('//') ? n : '');
const googleBtn = (next) => (accounts.googleReady ? `<a class="btn google" href="/api/auth/google?next=${encodeURIComponent(next || '/account')}"><span class="g" aria-hidden="true">G</span>Continue with Google</a><div class="or"><span>or</span></div>` : '');
const consent = `<label class="check"><input type="checkbox" name="age" required> I am 16 or older</label>
  <label class="check"><input type="checkbox" name="terms" required> I accept the <a href="/terms" target="_blank">Terms</a> and the <a href="/privacy" target="_blank">Privacy policy</a></label>`;
const formPage = (title, inner, user, opts = {}) => page(`${title} · ${NAME}`, `<main class="wrap narrow form-page"><div class="panel">${inner}</div></main>`, { user, scripts: ['/assets/account.js'], noindex: true, ...opts });
function signinPage(next, error) {
  const err = { google: 'Google sign-in did not work. Please try again.', 'google-email': 'Your Google account has no confirmed email address.' }[error];
  return formPage('Sign in', `<h1>Welcome back</h1>${err ? `<p class="msg bad">${e(err)}</p>` : ''}${googleBtn(next)}
    <form data-api="/api/login" data-next="${e(next || '/account')}"><label>Email<input type="email" name="email" autocomplete="email" required></label>
    <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn play" type="submit">Sign in</button><p class="msg" role="status"></p></form>
    <p class="small"><a href="/forgot">Forgot your password?</a> · New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Create an account</a></p>`);
}
function signupPage(next) {
  return formPage('Create account', `<h1>Create your account</h1><p class="lead">Free. Your progress follows you to every device. Under 16? You can play every game as a guest.</p>${googleBtn(next)}
    <form data-api="/api/signup" data-next="${e(next || '/account?welcome=1')}"><label>Email<input type="email" name="email" autocomplete="email" required></label>
    <label>Password <small>(at least 8 characters)</small><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
    ${consent}<button class="btn play" type="submit">Create account</button><p class="msg" role="status"></p></form>
    <p class="small">Already have an account? <a href="/signin${next ? `?next=${encodeURIComponent(next)}` : ''}">Sign in</a></p>`);
}
function googleConfirmPage(pending, next) {
  if (!pending) return formPage('Continue with Google', '<h1>Please start again</h1><p class="lead">This Google sign-in took too long.</p><p><a class="btn play" href="/signin">Back to sign in</a></p>');
  return formPage('Continue with Google', `<h1>One more step</h1><p class="lead">Create a ${e(NAME)} account for <b>${e(pending.email)}</b>.</p>
    <form data-api="/api/signup/google" data-next="${e(next || '/account?welcome=1')}">${consent}<button class="btn play" type="submit">Create account</button><p class="msg" role="status"></p></form>
    <p class="small">Changed your mind? <a href="/">Back to the games</a> (nothing is saved).</p>`);
}
const forgotPage = () => formPage('Forgot password', `<h1>Forgot your password?</h1><p class="lead">Enter your email and we will send you a link to choose a new one.</p>
  <form data-api="/api/forgot" data-done="If there is an account with that email, the link is on its way. Check your spam folder too."><label>Email<input type="email" name="email" autocomplete="email" required></label>
  <button class="btn play" type="submit">Send the link</button><p class="msg" role="status"></p></form><p class="small"><a href="/signin">Back to sign in</a></p>`);
const resetPage = (t) => formPage('New password', `<h1>Choose a new password</h1>
  <form data-api="/api/reset" data-token="${e(t)}" data-next="/account"><label>New password <small>(at least 8 characters)</small><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
  <label>Repeat it<input type="password" name="password2" autocomplete="new-password" minlength="8" required></label><button class="btn play" type="submit">Save password</button><p class="msg" role="status"></p></form>`);
const verifyPage = (ok, user) => formPage('Email confirmation', ok ? `<h1>Email confirmed</h1><p class="lead">Thanks! Your account is all set.</p><p><a class="btn play" href="/">Play a game</a></p>`
  : '<h1>That link did not work</h1><p class="lead">It may have expired or been used already. Sign in and send a new one from your account page.</p><p><a class="btn play" href="/account">Your account</a></p>', user);
function accountPage(user, welcome) {
  const opt = (list, sel) => list.map((w) => `<option${w === sel ? ' selected' : ''}>${e(w)}</option>`).join('');
  const m = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9][0-9]?)$/.exec(user.name) || [];
  return formPage('Your account', `${welcome ? '<p class="msg good">Your account is ready. Pick a game: your progress now saves to your account.</p>' : ''}<h1>${e(user.name)}</h1>
    <p class="lead">${e(user.email)} · ${user.verified ? 'email confirmed' : '<b>email not confirmed yet</b>'}${user.google ? ' · Google connected' : ''}</p>
    ${user.verified ? '' : '<p><button class="btn" data-post="/api/verify/resend" data-out="vmsg" data-done="Sent. Check your inbox (and spam folder).">Send the confirmation email again</button></p><p class="msg" id="vmsg" role="status"></p>'}
    <h2>Player name</h2><p class="small">Other players see this name in online games. Names are made from two word lists, so nobody has to type one.</p>
    <form id="namePick" class="namepick"><select name="a" aria-label="First word">${opt(accounts.names.A, m[1])}</select><select name="b" aria-label="Second word">${opt(accounts.names.B, m[2])}</select>
      <select name="n" aria-label="Number">${Array.from({ length: 99 }, (_, i) => `<option${String(i + 1) === m[3] ? ' selected' : ''}>${i + 1}</option>`).join('')}</select><button class="btn" type="submit">Save name</button><p class="msg" role="status"></p></form>
    <h2>${user.password ? 'Change password' : 'Add a password'}</h2>
    <form data-api="/api/account/password" data-done="Password saved. Other devices were signed out.">${user.password ? '<label>Current password<input type="password" name="current" autocomplete="current-password" required></label>' : ''}
      <label>New password <small>(at least 8 characters)</small><input type="password" name="password" autocomplete="new-password" minlength="8" required></label><button class="btn" type="submit">Save password</button><p class="msg" role="status"></p></form>
    <h2>Your data</h2><p class="small">Download everything your account stores: your account details and your game saves.</p><p><a class="btn" href="/api/account/export">Download my data</a></p>
    <h2>Sign out</h2><p><button class="btn" data-post="/api/logout" data-next="/">Sign out</button></p>
    <h2 class="danger">Delete account</h2><p class="small">This deletes your account and all your cloud saves right away. It cannot be undone. Progress saved in this browser stays.</p>
    <form data-api="/api/account/delete" data-next="/?deleted=1"><label>Type DELETE to confirm<input name="confirm" autocomplete="off" pattern="DELETE" required></label><button class="btn danger" type="submit">Delete my account</button><p class="msg" role="status"></p></form>`, user);
}
const updated = '22 October 2026';
function privacy(user) {
  return page(`Privacy · ${NAME}`, `<main class="wrap narrow prose"><h1>Privacy</h1><p class="lead">You can play every game without an account. We collect as little as we can and never sell data.${ADS ? ' The games are paid for by ads from Google; see Advertising below.' : ' We use no advertising or tracking cookies.'}</p>
  <p class="small">Last updated ${updated}.</p>
  <h2>Who we are</h2><p>${e(NAME)} runs devcangames.com and its games. We are based in Turkey and are responsible (the data controller) for the personal data described here. Contact: <a href="mailto:${e(EMAIL)}">${e(EMAIL)}</a>.</p>
  <h2>Playing as a guest</h2><p>Your progress and settings are saved in your own browser (local storage) on that device. They never reach us. Clearing your browser data deletes them.</p>
  <h2>If you create an account</h2><p>We store your email address, a scrambled form of your password (we cannot read it), your Google account ID if you sign in with Google, your player name, the dates you accepted these terms and confirmed you are 16 or older, the dates you created the account and last signed in, and your game saves. We use these only to run your account: to sign you in, keep your progress on every device, and send you account emails (confirming your email and resetting your password). We send no newsletters or marketing.</p>
  <p>We keep this data until you delete your account. You can download it or delete the account at any time on your account page; deleting removes it from our database at once and from our backups within 14 days.</p>
  <h2>Cookies</h2><p>When you sign in, we set one cookie that keeps you signed in for up to 90 days. It is needed for the account to work, so we do not ask for consent for it.${ADS ? ' The advertising cookies described below are only used as you choose in the consent message.' : ''}</p>
  ${ADS ? `<h2>Advertising</h2><p>The games are free because they show ads: sometimes a short ad between levels or seasons, an optional ad you can choose to watch for an in-game reward, and ad banners on some pages, never on top of a game. The ads come from Google (AdSense and H5 Games Ads). We ask Google for non-personalised ads only, which are based on the page and your general location rather than a profile of you. Google may still use cookies or similar technology to show ads, limit how often you see the same ad, and prevent fraud. Visitors in the EU, the UK and Turkey are asked for consent first, and you can change your choice at any time from the "Privacy and cookie settings" link the consent message adds. Google's own rules are at <a href="https://policies.google.com/technologies/partner-sites">policies.google.com/technologies/partner-sites</a>. Account pages (sign in, sign up, your account) never show ads.</p>` : ''}
  <h2>Online games</h2><p>In online games, our game server receives your player name and your moves for the length of the match. It keeps the daily top 10 names and scores and anonymous play counters, nothing else.</p>
  <h2>Server logs</h2><p>Like every website, our web server briefly processes technical request data (IP address, time, page) to deliver pages and keep the service secure.</p>
  <h2>Who else handles data</h2><p>Our hosting provider runs the server; Spacemail sends our account emails; Google handles "Continue with Google" if you choose it${ADS ? ', and serves the ads' : ''}. They act on our instructions or under their own privacy terms, and some may process data outside Turkey.</p>
  <h2>Age</h2><p>Accounts are for players aged 16 or older. Younger players can play every game as a guest, without giving us any personal data. If you believe a child under 16 made an account, email us and we will delete it.</p>
  <h2>Your rights</h2><p>Under the Turkish Personal Data Protection Law (KVKK) and, where it applies, the EU GDPR, you can ask what data we hold about you, get a copy, have it corrected or deleted, and object to how we use it. Most of this you can do yourself on your account page; for anything else, email <a href="mailto:${e(EMAIL)}">${e(EMAIL)}</a>. You can also complain to the Turkish Personal Data Protection Authority (KVKK) or your local data protection authority.</p></main>`, { canonical: '/privacy', user });
}
function terms(user) {
  return page(`Terms · ${NAME}`, `<main class="wrap narrow prose"><h1>Terms of use</h1><p class="small">Last updated ${updated}.</p>
  <p class="lead">${e(NAME)} games are free to play in your browser. By using devcangames.com you agree to these terms.</p>
  <h2>Accounts</h2><p>You need to be 16 or older to create an account. Keep your password to yourself; you are responsible for what happens with your account. One account per person.</p>
  <h2>Fair play</h2><p>Do not cheat in online games, attack or overload our servers, try to access other players' accounts, or use the games to harass anyone. We may suspend or delete accounts that break these rules.</p>
  <h2>Our games</h2><p>The games, art, music and the ${e(NAME)} name and logo belong to ${e(NAME)}. You may play them and share links to them, but not copy, resell or re-host them.</p>
  <h2>No guarantees</h2><p>We work hard to keep the games running and your progress safe, but we provide them as they are, without warranties. We may change, pause or remove games or features. As far as the law allows, we are not liable for lost progress or indirect damages.</p>
  <h2>Changes</h2><p>We may update these terms; the date above shows the latest version. If a change matters for your account, we will tell you on the site.</p>
  <h2>Law and contact</h2><p>These terms are governed by the laws of Turkey. Questions: <a href="mailto:${e(EMAIL)}">${e(EMAIL)}</a>.</p></main>`, { canonical: '/terms', user });
}

// ---------------------------------------------------------------- server
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const csp = (host) => `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-src ${isSite(host) ? `https://${PLAY}` : "'self'"}; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
// pages with ads: Google's ad scripts load their own scripts and frames from many Google hosts, so these pages use a
// nonce-based policy ('strict-dynamic': only scripts started by our nonced tags run) instead of the plain 'self' list
const adCsp = (nonce) => `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' https:; script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'; connect-src 'self' https:; frame-src 'self' https:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`;
function html(res, body, host, code = 200, nonce = '') { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': nonce ? adCsp(nonce) : csp(host), ...SEC }); res.end(body); }
const newNonce = () => (ADS ? crypto.randomBytes(16).toString('base64') : '');
const redirect = (res, to) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };

createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0].toLowerCase(), url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    if (host === `www.${SITE}`) { res.writeHead(301, { Location: `https://${SITE}${req.url}` }); res.end(); return; }
    const sdk = async () => { // the ad settings ride along at the top, so the publisher ID lives only in the portal's environment
      const js = await readFile(path.join(HERE, 'assets', 'devcan-sdk.js'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', ...SEC });
      res.end(`${ADS ? `window.DEVCAN_ADS = ${JSON.stringify(ADS)};\n` : ''}${js}`);
    };
    if (p === '/ads.txt') { if (!ADS) return notFound(res); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); res.end(ADS_TXT); return; }
    const gameFiles = (rel) => sendFile(res, path.join(DATA, 'play'), rel, { 'Cache-Control': 'no-cache', 'Content-Security-Policy': `frame-ancestors https://${SITE} http://localhost:* http://127.0.0.1:*`, ...SEC });
    if (host === PLAY) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      if (p === '/') return redirect(res, `https://${SITE}/`);
      if (p === '/devcan-sdk.js') return sdk();
      return gameFiles(p);
    }
    if (p.startsWith('/api/')) return await accounts.api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (!isSite(host) && p === '/devcan-sdk.js') return sdk(); // local tests
    if (p.startsWith('/__play/') && !isSite(host)) return gameFiles(p.slice(7));
    const user = accounts.publicUser(accounts.currentUser(req)), next = safeNext(url.searchParams.get('next'));
    if (p === '/' || p === '/index.html') { const n = newNonce(); return html(res, await home(user, n), host, 200, n); }
    if (p === '/games' || p === '/games/') return html(res, await listPage(user, 'all'), host);
    const cm = p.match(/^\/category\/([a-z0-9-]+)\/?$/);
    if (cm) { const b = await listPage(user, cm[1]); return b ? html(res, b, host) : notFound(res, user); }
    if (p === '/privacy') return html(res, privacy(user), host);
    if (p === '/terms') return html(res, terms(user), host);
    if (p === '/signin') return user ? redirect(res, next || '/account') : html(res, signinPage(next, url.searchParams.get('error')), host);
    if (p === '/signup') return user ? redirect(res, next || '/account') : html(res, signupPage(next), host);
    if (p === '/signup/google') return html(res, googleConfirmPage(accounts.pendingGoogle(req), next), host);
    if (p === '/forgot') return html(res, forgotPage(), host);
    if (p === '/reset') return html(res, resetPage(url.searchParams.get('token') || ''), host);
    if (p === '/verify') return html(res, verifyPage(accounts.verifyLink(url.searchParams.get('token')), user), host);
    if (p === '/account') return user ? html(res, accountPage(user, url.searchParams.has('welcome')), host) : redirect(res, '/signin?next=/account');
    const m = p.match(/^\/games\/([a-z0-9-]+)\/?$/);
    if (m) {
      const room = /^[A-Z0-9]{4,8}$/.test(url.searchParams.get('room') || '') ? url.searchParams.get('room') : '', n = newNonce();
      const b = await gamePage(m[1], host, user, room, n, url.searchParams.get('adtest') === '1');
      return b ? html(res, b, host, 200, n) : notFound(res, user);
    }
    if (p.startsWith('/assets/')) return sendFile(res, path.join(HERE, 'assets'), p.slice(8), { 'Cache-Control': 'public, max-age=600', ...SEC });
    if (p.startsWith('/media/')) return sendFile(res, path.join(DATA, 'media'), p.slice(7), { 'Cache-Control': 'public, max-age=3600', ...SEC });
    if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(`User-agent: *\nDisallow: /api/\nAllow: /\nSitemap: https://${SITE}/sitemap.xml\n`); return; }
    if (p === '/sitemap.xml') {
      const list = await games(), urls = ['/', '/games', ...categories(list).map((c) => `/category/${c.slug}`), '/privacy', '/terms', ...list.map((g) => `/games/${g.slug}`)];
      res.writeHead(200, { 'Content-Type': 'application/xml' }); res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>https://${SITE}${u}</loc></url>`).join('')}</urlset>`); return;
    }
    notFound(res, user);
  } catch (err) {
    if (err.code === 400 || err.code === 413) { res.writeHead(err.code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'request', message: err.code === 413 ? 'That is too large.' : 'Bad request.' })); return; }
    console.error(err); if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
  }
}).listen(PORT, '127.0.0.1', () => console.log(`DevCan portal on http://127.0.0.1:${PORT} (data ${DATA}, Google ${accounts.googleReady ? 'on' : 'off'}, mail ${accounts.mailReady ? 'smtp' : 'outbox'})`));
