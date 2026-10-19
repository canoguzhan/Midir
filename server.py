#!/usr/bin/env python3
"""BroadGamesPro studio site + game preview server (stdlib only).

  python3 server.py            http://localhost:8080

  /                            studio page: every released game with cover, Play, Press kit and download links
  /games/<slug>/               playable game straight from games/ (also lists games not released yet)
  /releases/<slug>/...         published packages from tools/release.py (RELEASE_DIR, default /srv/broadgames/releases)

Only games/ and RELEASE_DIR are served (never .env, tools/ or library/), with no-cache headers so edits show on reload.
On localhost the CrazyGames SDK runs in "local" mode with demo ads; on any other host add ?useLocalSdk=true."""
import html, json, mimetypes, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
GAMES = os.path.join(ROOT, 'games')
RELEASES = os.environ.get('RELEASE_DIR', '/srv/broadgames/releases')
STUDIO = 'BroadGamesPro'
mimetypes.add_type('model/gltf-binary', '.glb'); mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('text/markdown; charset=utf-8', '.md'); mimetypes.add_type('text/plain; charset=utf-8', '.txt')


def load(path):
    try: return json.load(open(path))
    except (OSError, ValueError): return None


def gallery():
    e = html.escape
    released = {}
    if os.path.isdir(RELEASES):
        for slug in sorted(os.listdir(RELEASES)):
            r = load(os.path.join(RELEASES, slug, 'release.json'))
            if r: released[slug] = r
    cards = []
    for slug, r in sorted(released.items(), key=lambda kv: kv[1].get('date', ''), reverse=True):
        s, play = e(slug), os.path.exists(os.path.join(GAMES, slug, 'index.html'))
        btns = (f'<a class="btn primary" href="/releases/{s}/{e(r["package"]["file"])}">Full package · {r["package"]["mb"]:.0f} MB</a>'
                f'<a class="btn" href="/releases/{s}/{e(r["upload"]["file"])}">Upload build · {r["upload"]["mb"]:.1f} MB</a>'
                f'<a class="btn" href="/releases/{s}/presskit/">Press kit</a>' + (f'<a class="btn" href="/games/{s}/">Play</a>' if play else ''))
        cards.append(f'<article><a href="/releases/{s}/presskit/"><img src="/releases/{s}/{e(r["cover"])}" alt="" loading="lazy"></a>'
                     f'<div class="body"><h2>{e(r["title"])}</h2><div class="meta">v{e(r.get("version", ""))} · {e(r.get("date", ""))} · {e(r.get("category", ""))}</div>'
                     f'<p>{e(r.get("description", ""))}</p><div class="btns">{btns}</div></div></article>')
    wip = []
    for slug in sorted(os.listdir(GAMES)) if os.path.isdir(GAMES) else []:
        meta = load(os.path.join(GAMES, slug, 'game.json'))
        if meta and slug not in released:
            wip.append(f'<li><a href="/games/{e(slug)}/">{e(meta.get("title", slug))}</a> <small>in development</small></li>')
    body = ''.join(cards) or '<p class="empty">No releases yet.</p>'
    wip_html = f'<h3>In development</h3><ul>{"".join(wip)}</ul>' if wip else ''
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{STUDIO}</title><style>
:root{{--bg:#111019;--panel:#1b1a27;--text:#ecebf3;--dim:#a3a1b5;--gold:#ffcf4a;--line:#2c2a3c}}
@media (prefers-color-scheme: light){{:root{{--bg:#f6f5fb;--panel:#fff;--text:#1a1826;--dim:#5d5a70;--gold:#a8770b;--line:#e2e0ec}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:1040px;margin:0 auto;padding:32px 16px 64px}}h1{{margin:0;font-size:clamp(28px,5vw,44px);color:var(--gold)}}
.tag{{color:var(--dim);margin:4px 0 28px}}a{{color:var(--gold)}}
article{{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:0;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:20px}}
article img{{width:100%;height:100%;object-fit:cover;display:block}}.body{{padding:18px 20px}}h2{{margin:0 0 4px;font-size:24px}}
.meta{{color:var(--dim);font-size:14px}}.btns{{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}}
.btn{{padding:9px 14px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--text);text-decoration:none;font-weight:600;font-size:14px}}
.btn.primary{{background:var(--gold);color:#2a1d00;border-color:transparent}}
@media (max-width:720px){{article{{grid-template-columns:1fr}}}}small{{color:var(--dim)}}.empty{{color:var(--dim)}}
</style></head><body><main><h1>{STUDIO}</h1><p class="tag">Browser games for CrazyGames · release packages and press kits</p>{body}{wip_html}</main></body></html>'''.encode()


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parts = [p for p in unquote(urlsplit(path).path).split('/') if p]
        if not parts or any(p.startswith('.') or p == '..' for p in parts): return os.path.join(GAMES, '.missing')
        if parts[0] == 'games': return os.path.join(GAMES, *parts[1:])
        if parts[0] == 'releases': return os.path.join(RELEASES, *parts[1:])
        return os.path.join(GAMES, '.missing')

    def list_directory(self, path):  # no directory listings
        self.send_error(404); return None

    def do_GET(self):
        if urlsplit(self.path).path in ('/', '/index.html'):
            b = gallery(); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()

    def log_message(self, *a): pass


if __name__ == '__main__':
    host, port = os.environ.get('HOST', '0.0.0.0'), int(os.environ.get('PORT', 8080))
    print(f'serving on http://{"localhost" if host == "0.0.0.0" else host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
