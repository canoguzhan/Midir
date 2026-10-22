// DevCan Games accounts: email + password and Google sign-in, sessions, verification and reset emails, cloud saves.
// Security: scrypt password hashes, random session tokens stored only as SHA-256, HttpOnly SameSite=Lax cookies (Secure
// behind HTTPS), JSON-only writes with an Origin check, per-IP and per-email rate limits, single-use expiring email links.
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

const DAY = 86400_000;
const SESSION_DAYS = 90, VERIFY_HOURS = 48, RESET_HOURS = 1;
const MAX_SAVE_VALUE = 256 * 1024, MAX_SAVE_GAME = 1024 * 1024;
const now = () => new Date().toISOString();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());
export const validEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s);
const validPassword = (s) => typeof s === 'string' && s.length >= 8 && s.length <= 200;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [alg, N, r, p, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64'), got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(want, got);
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex')); // equal timing for unknown emails

class Limiter { // sliding window counters, in memory
  constructor() { this.hits = new Map(); setInterval(() => { const t = Date.now(); for (const [k, v] of this.hits) if (v.every((x) => t - x > 3600_000)) this.hits.delete(k); }, 600_000).unref(); }
  hit(key, max, windowMs) { const t = Date.now(), list = (this.hits.get(key) || []).filter((x) => t - x < windowMs); list.push(t); this.hits.set(key, list); return list.length <= max; }
}

export function createAccounts({ db, env, site, dataDir, names }) {
  const SITE_ORIGIN = `https://${site}`, limiter = new Limiter();
  const SECRET = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (!env.SESSION_SECRET) console.warn('SESSION_SECRET not set: pending Google sign-ups do not survive a restart');
  const GOOGLE = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } : null;
  const mailer = env.MAIL_DRYRUN || !env.SMTP_HOST ? null
    : nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), secure: Number(env.SMTP_PORT || 465) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'), userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByGoogle: db.prepare('SELECT * FROM users WHERE google_sub = ?'), nameTaken: db.prepare('SELECT 1 FROM users WHERE name = ?'),
    insertUser: db.prepare('INSERT INTO users (email, email_verified, pass_hash, google_sub, name, age_ok_at, terms_ok_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    session: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    dropSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'), dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
    addToken: db.prepare('INSERT INTO tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)'),
    takeToken: db.prepare('DELETE FROM tokens WHERE token_hash = ? AND kind = ? AND expires_at > ? RETURNING user_id'),
    dropTokens: db.prepare('DELETE FROM tokens WHERE user_id = ? AND kind = ?'),
    login: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    saves: db.prepare('SELECT key, value FROM saves WHERE user_id = ? AND game = ?'),
    putSave: db.prepare('INSERT INTO saves (user_id, game, key, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, game, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'),
    gameSize: db.prepare('SELECT COALESCE(SUM(LENGTH(value)), 0) n FROM saves WHERE user_id = ? AND game = ? AND key != ?'),
    allSaves: db.prepare('SELECT game, key, value, updated_at FROM saves WHERE user_id = ? ORDER BY game, key'),
  };

  // ---------------------------------------------------------------- helpers
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const secure = (req) => req.headers['x-forwarded-proto'] === 'https';
  const cookie = (req, name, value, maxAgeSec) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure(req) ? '; Secure' : ''}`;
  const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  const sealed = (o) => { const d = b64(o); return `${d}.${sign(d)}`; };
  const unseal = (s) => { const [d, mac] = String(s || '').split('.'); if (!d || !mac || mac.length !== sign(d).length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(d)))) return null; const o = unb64(d); return o.exp > Date.now() ? o : null; };
  const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
  const fail = (res, code, error, message) => json(res, code, { error, message });
  const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9/_-]*$/i.test(n) && !n.startsWith('//') ? n : '/');
  const publicUser = (u) => u && { name: u.name, email: u.email, verified: !!u.email_verified, google: !!u.google_sub, password: !!u.pass_hash, since: u.created_at };

  function currentUser(req) { const t = cookies(req).dc_s; return t ? q.session.get(sha(t), Date.now()) || null : null; }
  function startSession(req, res, user, extraCookies = []) {
    const t = token(); q.addSession.run(sha(t), user.id, now(), Date.now() + SESSION_DAYS * DAY); q.login.run(now(), user.id);
    res.setHeader('Set-Cookie', [cookie(req, 'dc_s', t, SESSION_DAYS * 86400), ...extraCookies]);
  }
  function uniqueName() {
    for (let i = 0; i < 200; i++) {
      const n = `${names.A[crypto.randomInt(names.A.length)]}${names.B[crypto.randomInt(names.B.length)]}${crypto.randomInt(1, 100)}`;
      if (!q.nameTaken.get(n)) return n;
    }
    return `Player${crypto.randomInt(100000, 999999)}`;
  }
  const isListName = (n) => { const m = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9][0-9]?)$/.exec(String(n || '')); return !!m && names.A.includes(m[1]) && names.B.includes(m[2]); };

  async function body(req, limit = 1_400_000) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
  }
  function sameOrigin(req) { // writes must come from our own pages (the Origin header), as JSON (no plain cross-site form can send that)
    const o = req.headers.origin, host = req.headers.host;
    const okOrigin = !o || o === SITE_ORIGIN || o === `http://${host}`;
    return okOrigin && String(req.headers['content-type'] || '').startsWith('application/json');
  }

  // ---------------------------------------------------------------- email
  async function sendMail(to, subject, lines, link, button) {
    const text = `${lines.join('\n\n')}\n\n${link}\n\nIf you did not ask for this, you can ignore this email.\n\nDevCan Games · ${SITE_ORIGIN}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#24104f"><img src="${SITE_ORIGIN}/assets/devcan-logo-1200.png" alt="DevCan Games" width="220" style="display:block;margin:12px 0 20px">
      ${lines.map((l) => `<p style="font-size:16px;line-height:1.5">${l.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p>`).join('')}
      <p style="margin:26px 0"><a href="${link}" style="background:#ff4f6e;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:12px;display:inline-block">${button}</a></p>
      <p style="font-size:13px;color:#6b5c95">Or open this link: ${link}<br>If you did not ask for this, you can ignore this email.</p><p style="font-size:13px;color:#6b5c95">DevCan Games · ${SITE_ORIGIN}</p></div>`;
    if (!mailer) { const dir = path.join(dataDir, 'outbox'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, '_')}.txt`), `To: ${to}\nSubject: ${subject}\n\n${text}\n`); return; }
    await mailer.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, text, html });
  }
  function issue(user, kind, hours) { q.dropTokens.run(user.id, kind); const t = token(); q.addToken.run(sha(t), user.id, kind, Date.now() + hours * 3600_000); return t; }
  const sendVerify = (u) => sendMail(u.email, 'Confirm your DevCan Games email', ['Welcome to DevCan Games!', 'Please confirm your email address. It lets you get back into your account if you ever forget your password.'], `${SITE_ORIGIN}/verify?token=${issue(u, 'verify', VERIFY_HOURS)}`, 'Confirm my email');
  const sendReset = (u) => sendMail(u.email, 'Reset your DevCan Games password', ['Someone (hopefully you) asked to reset the password of your DevCan Games account.', 'The link works for one hour.'], `${SITE_ORIGIN}/reset?token=${issue(u, 'reset', RESET_HOURS)}`, 'Choose a new password');

  // ---------------------------------------------------------------- API
  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    if (m !== 'GET' && !sameOrigin(req)) return fail(res, 403, 'origin', 'This request has to come from devcangames.com.');
    const me = currentUser(req), addr = ip(req);

    if (p === '/api/me' && m === 'GET') return json(res, 200, { user: publicUser(me), google: !!GOOGLE });

    if (p === '/api/signup' && m === 'POST') {
      if (!limiter.hit(`signup:${addr}`, 8, 3600_000)) return fail(res, 429, 'slow', 'Too many sign-ups from here. Try again later.');
      const b = await body(req), email = String(b.email || '').trim();
      if (!validEmail(email)) return fail(res, 400, 'email', 'Enter a valid email address.');
      if (!validPassword(b.password)) return fail(res, 400, 'password', 'Use at least 8 characters for your password.');
      if (b.age !== true) return fail(res, 400, 'age', 'Accounts are for players aged 16 or older. You can keep playing as a guest.');
      if (b.terms !== true) return fail(res, 400, 'terms', 'Please accept the Terms and the Privacy policy.');
      if (q.userByEmail.get(email)) return fail(res, 409, 'exists', 'There is already an account with this email. Sign in, or reset your password.');
      const info = q.insertUser.run(email, 0, hashPassword(b.password), null, uniqueName(), now(), now(), now()), user = q.userById.get(info.lastInsertRowid);
      startSession(req, res, user); sendVerify(user).catch((err) => console.error('verify mail', err.message));
      return json(res, 201, { user: publicUser(user) });
    }
    if (p === '/api/login' && m === 'POST') {
      const b = await body(req), email = String(b.email || '').trim();
      if (!limiter.hit(`login:${addr}`, 20, 900_000) || !limiter.hit(`login:${email.toLowerCase()}`, 8, 900_000)) return fail(res, 429, 'slow', 'Too many attempts. Wait 15 minutes, or reset your password.');
      const user = validEmail(email) ? q.userByEmail.get(email) : null;
      const ok = checkPassword(String(b.password || ''), user?.pass_hash || DUMMY_HASH) && !!user?.pass_hash;
      if (!ok) return fail(res, 401, 'wrong', user && !user.pass_hash ? 'This account uses Google sign-in. Use "Continue with Google", or reset your password to add one.' : 'Email or password is wrong.');
      startSession(req, res, user); return json(res, 200, { user: publicUser(user) });
    }
    if (p === '/api/logout' && m === 'POST') {
      const t = cookies(req).dc_s; if (t) q.dropSession.run(sha(t));
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, 'dc_s', '', 0) });
    }
    if (p === '/api/forgot' && m === 'POST') {
      const b = await body(req), email = String(b.email || '').trim();
      if (!limiter.hit(`forgot:${addr}`, 10, 3600_000) || !limiter.hit(`forgot:${email.toLowerCase()}`, 3, 3600_000)) return fail(res, 429, 'slow', 'Too many requests. Try again in an hour.');
      const user = validEmail(email) ? q.userByEmail.get(email) : null;
      if (user) sendReset(user).catch((err) => console.error('reset mail', err.message));
      return json(res, 200, { ok: true }); // the same answer either way, so nobody can test which emails have accounts
    }
    if (p === '/api/reset' && m === 'POST') {
      if (!limiter.hit(`reset:${addr}`, 20, 3600_000)) return fail(res, 429, 'slow', 'Too many attempts. Try again later.');
      const b = await body(req);
      if (!validPassword(b.password)) return fail(res, 400, 'password', 'Use at least 8 characters for your password.');
      const row = q.takeToken.get(sha(String(b.token || '')), 'reset', Date.now());
      if (!row) return fail(res, 400, 'token', 'This reset link has expired or was already used. Ask for a new one.');
      db.prepare('UPDATE users SET pass_hash = ?, email_verified = 1 WHERE id = ?').run(hashPassword(b.password), row.user_id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // sign out everywhere else
      const user = q.userById.get(row.user_id); startSession(req, res, user); return json(res, 200, { user: publicUser(user) });
    }
    if (p === '/api/verify/resend' && m === 'POST') {
      if (!me) return fail(res, 401, 'signin', 'Sign in first.');
      if (me.email_verified) return json(res, 200, { ok: true });
      if (!limiter.hit(`verify:${me.id}`, 3, 3600_000)) return fail(res, 429, 'slow', 'We already sent a few emails. Check your inbox and spam folder.');
      await sendVerify(me).catch((err) => console.error('verify mail', err.message)); return json(res, 200, { ok: true });
    }

    // account settings (signed in)
    if (p.startsWith('/api/account')) {
      if (!me) return fail(res, 401, 'signin', 'Sign in first.');
      if (p === '/api/account/name' && m === 'POST') {
        const b = await body(req), n = b.random ? uniqueName() : String(b.name || '');
        if (!isListName(n)) return fail(res, 400, 'name', 'Pick a name from the lists.');
        if (n !== me.name && q.nameTaken.get(n)) return fail(res, 409, 'taken', 'Someone already has that name. Try another number.');
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(n, me.id); return json(res, 200, { user: publicUser(q.userById.get(me.id)) });
      }
      if (p === '/api/account/password' && m === 'POST') {
        const b = await body(req);
        if (me.pass_hash && !checkPassword(String(b.current || ''), me.pass_hash)) return fail(res, 401, 'wrong', 'Your current password is wrong.');
        if (!validPassword(b.password)) return fail(res, 400, 'password', 'Use at least 8 characters for your password.');
        db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(b.password), me.id);
        q.dropSessions.run(me.id, sha(cookies(req).dc_s || '')); return json(res, 200, { ok: true });
      }
      if (p === '/api/account/export' && m === 'GET') {
        const data = { account: publicUser(me), last_sign_in: me.last_login_at, age_confirmed: me.age_ok_at, terms_accepted: me.terms_ok_at,
          saves: q.allSaves.all(me.id), exported_at: now() };
        return json(res, 200, data, { 'Content-Disposition': 'attachment; filename="devcan-games-my-data.json"' });
      }
      if (p === '/api/account/delete' && m === 'POST') {
        const b = await body(req);
        if (b.confirm !== 'DELETE') return fail(res, 400, 'confirm', 'Type DELETE to confirm.');
        db.prepare('DELETE FROM users WHERE id = ?').run(me.id); // sessions, tokens and saves go with it (ON DELETE CASCADE)
        return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, 'dc_s', '', 0) });
      }
    }

    // cloud saves, used by the game page bridge (bridge.js) for the game in its frame
    const sv = p.match(/^\/api\/saves\/([a-z0-9-]{1,60})$/);
    if (sv) {
      if (m === 'GET') {
        if (!me) return json(res, 200, { user: null, saves: {} });
        return json(res, 200, { user: { name: me.name }, saves: Object.fromEntries(q.saves.all(me.id, sv[1]).map((r) => [r.key, r.value])) });
      }
      if (m === 'PUT') {
        if (!me) return fail(res, 401, 'signin', 'Sign in to save to your account.');
        if (!limiter.hit(`save:${me.id}`, 120, 60_000)) return fail(res, 429, 'slow', 'Saving too often.');
        const b = await body(req), items = b.items && typeof b.items === 'object' ? Object.entries(b.items) : [];
        if (items.length > 50) return fail(res, 400, 'items', 'Too many keys at once.');
        const tx = db.transaction(() => {
          for (const [k, v] of items) {
            if (typeof k !== 'string' || !k || k.length > 120 || typeof v !== 'string' || v.length > MAX_SAVE_VALUE) throw Object.assign(new Error('bad item'), { code: 400 });
            if (q.gameSize.get(me.id, sv[1], k).n + v.length > MAX_SAVE_GAME) throw Object.assign(new Error('game save too large'), { code: 413 });
            q.putSave.run(me.id, sv[1], k, v, now());
          }
        });
        tx(); return json(res, 200, { ok: true });
      }
    }

    // Google sign-in
    if (p === '/api/auth/google' && m === 'GET') {
      if (!GOOGLE) return fail(res, 503, 'google', 'Google sign-in is not set up yet.');
      const state = token(), next = safeNext(url.searchParams.get('next'));
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      Object.entries({ client_id: GOOGLE.id, redirect_uri: `${SITE_ORIGIN}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).forEach(([k, v]) => auth.searchParams.set(k, v));
      res.writeHead(302, { Location: auth.toString(), 'Set-Cookie': cookie(req, 'dc_g', sealed({ state, next, exp: Date.now() + 600_000 }), 600), 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (p === '/api/auth/google/callback' && m === 'GET') {
      const back = (to, extra = []) => { res.writeHead(302, { Location: to, 'Set-Cookie': [cookie(req, 'dc_g', '', 0), ...extra], 'Cache-Control': 'no-store' }); res.end(); };
      const st = unseal(cookies(req).dc_g);
      if (!GOOGLE || !st || url.searchParams.get('state') !== st.state || !url.searchParams.get('code')) return back('/signin?error=google');
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: GOOGLE.id, client_secret: GOOGLE.secret, redirect_uri: `${SITE_ORIGIN}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
        const tok = await r.json(); if (!r.ok || !tok.id_token) throw new Error(tok.error || 'no id_token');
        const claims = unb64(tok.id_token.split('.')[1]); // came straight from Google over TLS, so the claims can be read without a signature check
        if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== GOOGLE.id || claims.exp * 1000 < Date.now() || !claims.sub) throw new Error('bad claims');
        let user = q.userByGoogle.get(claims.sub);
        if (!user && claims.email && claims.email_verified) {
          user = q.userByEmail.get(claims.email);
          if (user) { db.prepare('UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?').run(claims.sub, user.id); user = q.userById.get(user.id); }
        }
        if (user) { const t = token(); q.addSession.run(sha(t), user.id, now(), Date.now() + SESSION_DAYS * DAY); q.login.run(now(), user.id); return back(st.next, [cookie(req, 'dc_s', t, SESSION_DAYS * 86400)]); }
        if (!claims.email || !claims.email_verified) return back('/signin?error=google-email');
        return back(`/signup/google?next=${encodeURIComponent(st.next)}`, [cookie(req, 'dc_gp', sealed({ sub: claims.sub, email: claims.email, exp: Date.now() + 1800_000 }), 1800)]);
      } catch (err) { console.error('google sign-in', err.message); return back('/signin?error=google'); }
    }
    if (p === '/api/signup/google' && m === 'POST') {
      const pend = unseal(cookies(req).dc_gp), b = await body(req);
      if (!pend) return fail(res, 400, 'expired', 'This Google sign-in took too long. Please start again.');
      if (b.age !== true) return fail(res, 400, 'age', 'Accounts are for players aged 16 or older. You can keep playing as a guest.');
      if (b.terms !== true) return fail(res, 400, 'terms', 'Please accept the Terms and the Privacy policy.');
      let user = q.userByGoogle.get(pend.sub) || q.userByEmail.get(pend.email);
      if (!user) { const info = q.insertUser.run(pend.email, 1, null, pend.sub, uniqueName(), now(), now(), now()); user = q.userById.get(info.lastInsertRowid); }
      startSession(req, res, user, [cookie(req, 'dc_gp', '', 0)]); return json(res, 201, { user: publicUser(user) });
    }
    return fail(res, 404, 'missing', 'Unknown request.');
  }

  function verifyLink(t) { // GET /verify?token=: a click in the email
    const row = q.takeToken.get(sha(String(t || '')), 'verify', Date.now());
    if (!row) return false;
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id); return true;
  }
  const pendingGoogle = (req) => unseal(cookies(req).dc_gp);
  return { api, currentUser, verifyLink, pendingGoogle, publicUser, googleReady: !!GOOGLE, mailReady: !!mailer, names, isListName };
}
