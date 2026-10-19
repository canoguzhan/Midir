#!/usr/bin/env python3
"""BroadGamesPro studio site + game preview server (stdlib only).

  python3 server.py            http://localhost:8080

  /                            studio homepage (site/home.html): latest release as hero, every release with Play,
                               Press kit and download links, games in development, studio info from studio.json
  /site/...                    homepage stylesheet and logo
  /games/<slug>/               playable game straight from games/
  /releases/<slug>/...         published packages from tools/release.py (RELEASE_DIR, default /srv/broadgames/releases)

Only site/, games/ and RELEASE_DIR are served (never .env, tools/ or library/), with no-cache headers so edits show on reload.
On localhost the CrazyGames SDK runs in "local" mode with demo ads; on any other host add ?useLocalSdk=true."""
import html, json, mimetypes, os, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
GAMES, SITE = os.path.join(ROOT, 'games'), os.path.join(ROOT, 'site')
RELEASES = os.environ.get('RELEASE_DIR', '/srv/broadgames/releases')
mimetypes.add_type('model/gltf-binary', '.glb'); mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('image/svg+xml', '.svg'); mimetypes.add_type('text/markdown; charset=utf-8', '.md'); mimetypes.add_type('text/plain; charset=utf-8', '.txt')


def load(path, default=None):
    try: return json.load(open(path))
    except (OSError, ValueError): return default


def releases():
    out = []
    if os.path.isdir(RELEASES):
        for slug in os.listdir(RELEASES):
            r = load(os.path.join(RELEASES, slug, 'release.json'))
            if r: out.append(r)
    return sorted(out, key=lambda r: (r.get('date', ''), r.get('published', '')), reverse=True)  # newest release first: it becomes the hero


def homepage():
    e = html.escape
    studio = load(os.path.join(ROOT, 'studio.json'), {}) or {}
    rel = releases()
    playable = lambda slug: os.path.exists(os.path.join(GAMES, slug, 'index.html'))

    def buttons(r, size=''):
        s = e(r['slug']); b = []
        if playable(r['slug']): b.append(f'<a class="btn primary {size}" href="/games/{s}/">▶ Play</a>')
        b.append(f'<a class="btn {size}" href="/releases/{s}/presskit/">Press kit</a>')
        b.append(f'<a class="btn {size}" href="/releases/{s}/{e(r["package"]["file"])}">Full package <small>{r["package"]["mb"]:.0f} MB</small></a>')
        b.append(f'<a class="btn {size}" href="/releases/{s}/{e(r["upload"]["file"])}">Upload build <small>{r["upload"]["mb"]:.1f} MB</small></a>')
        return ''.join(b)

    if rel:
        r = rel[0]
        hero = (f'<section class="hero"><div class="bg" style="background-image:url(\'/releases/{e(r["slug"])}/{e(r.get("hero") or r["cover"])}\')"></div><div class="inner">'
                f'<span class="eyebrow">New release · {e(r.get("category", "Game"))}</span><h1>{e(r["title"])}</h1>'
                f'<p>{e(r.get("description", ""))}</p><div class="actions">{buttons(r)}</div></div></section>')
    else:
        hero = ('<section class="hero plain"><div class="inner"><span class="eyebrow">Browser games studio</span><h1>Games you can play in one click.</h1>'
                f'<p>{e(studio.get("about", ""))}</p><div class="actions"><a class="btn primary" href="#games">See our games</a></div></div></section>')

    cards = ''.join(
        f'<article class="card"><a class="thumb" href="/releases/{e(r["slug"])}/presskit/"><img src="/releases/{e(r["slug"])}/{e(r["cover"])}" alt="{e(r["title"])}" loading="lazy">'
        f'<span class="tag">{e(r.get("category", ""))}</span></a><div class="body"><h3>{e(r["title"])}</h3>'
        f'<div class="meta">v{e(r.get("version", ""))} · released {e(r.get("date", ""))}</div><p>{e(r.get("description", ""))}</p>'
        f'<div class="actions">{buttons(r, "sm")}</div></div></article>' for r in rel)
    games = f'<div class="grid">{cards}</div>' if cards else '<div class="empty">The first release is on its way.</div>'

    released = {r['slug'] for r in rel}
    wip = [(slug, (load(os.path.join(GAMES, slug, 'game.json'), {}) or {}).get('title', slug))
           for slug in (sorted(os.listdir(GAMES)) if os.path.isdir(GAMES) else []) if slug not in released and playable(slug)]
    wip_html = ('<section><div class="sec-head"><h2>In development</h2><p>Playable previews of games we are still polishing.</p></div><div class="wip">'
                + ''.join(f'<a href="/games/{e(s)}/">{e(t)}</a>' for s, t in wip) + '</div></section>') if wip else ''

    website, email = studio.get('website', 'https://broadgames.pro'), studio.get('email', '')
    page = open(os.path.join(SITE, 'home.html'), encoding='utf-8').read()
    for k, v in {'HERO': hero, 'GAMES': games, 'WIP': wip_html, 'ABOUT': e(studio.get('about', '')), 'YEAR': time.strftime('%Y'),
                 'WEBSITE': e(website), 'WEBSITE_LABEL': e(website.split('//')[-1]),
                 'NAV_CONTACT': f'<a href="mailto:{e(email)}">Contact</a>' if email else '',
                 'FOOTER_CONTACT': f' · <a href="mailto:{e(email)}">{e(email)}</a>' if email else ''}.items():
        page = page.replace('{{' + k + '}}', v)
    return page.encode()


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parts = [p for p in unquote(urlsplit(path).path).split('/') if p]
        if not parts or any(p.startswith('.') or p == '..' for p in parts): return os.path.join(GAMES, '.missing')
        base = {'games': GAMES, 'releases': RELEASES, 'site': SITE}.get(parts[0])
        if not base or (parts[0] == 'site' and parts[-1].endswith('.html')): return os.path.join(GAMES, '.missing')
        return os.path.join(base, *parts[1:])

    def list_directory(self, path):  # no directory listings
        self.send_error(404); return None

    def do_GET(self):
        if urlsplit(self.path).path in ('/', '/index.html'):
            b = homepage(); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()

    def log_message(self, *a): pass


if __name__ == '__main__':
    host, port = os.environ.get('HOST', '0.0.0.0'), int(os.environ.get('PORT', 8080))
    print(f'serving on http://{"localhost" if host == "0.0.0.0" else host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
