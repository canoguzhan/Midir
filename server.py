#!/usr/bin/env python3
"""Local preview server for the game factory (stdlib only).

  python3 server.py            http://localhost:8080  -> gallery of games/, each playable at /games/<slug>/

Only games/ is served (never .env, tools/ or library/), with no-cache headers so edits show on reload.
On localhost the CrazyGames SDK runs in "local" mode with demo ads; on any other host add ?useLocalSdk=true."""
import html, json, mimetypes, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
GAMES = os.path.join(ROOT, 'games')
mimetypes.add_type('model/gltf-binary', '.glb'); mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('image/webp', '.webp')


def gallery():
    rows = []
    for slug in sorted(os.listdir(GAMES)) if os.path.isdir(GAMES) else []:
        meta_path = os.path.join(GAMES, slug, 'game.json')
        if not os.path.exists(meta_path): continue
        try: meta = json.load(open(meta_path))
        except ValueError: meta = {}
        s, title = html.escape(slug), html.escape(meta.get('title', slug))
        z = f' · <a href="/games/{s}/dist/{s}.zip">zip</a>' if os.path.exists(os.path.join(GAMES, slug, 'dist', f'{slug}.zip')) else ''
        rows.append(f'<li><a href="/games/{s}/"><b>{title}</b></a>{z}<br><small>{html.escape(meta.get("description", ""))[:160]}</small></li>')
    body = ''.join(rows) or '<li>No games yet. Ask Claude for one.</li>'
    return ('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Game Factory</title>'
            '<style>body{font:16px system-ui;max-width:720px;margin:40px auto;padding:0 16px;background:#14161c;color:#e8e8ee}'
            'a{color:#8ab4ff}li{margin:0 0 18px}small{color:#9aa}</style><h1>Game Factory</h1><ul>' + body + '</ul>').encode()


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parts = [p for p in unquote(urlsplit(path).path).split('/') if p]
        if not parts or parts[0] != 'games' or any(p.startswith('.') or p == '..' for p in parts): return os.path.join(GAMES, '.missing')
        return os.path.join(GAMES, *parts[1:])

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
    print(f'serving games/ on http://{"localhost" if host == "0.0.0.0" else host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
