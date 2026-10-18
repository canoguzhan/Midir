#!/usr/bin/env python3
"""Sanctuary Merchant — static game server (Python 3.10+ stdlib only).
Serves public/ with caching and range requests. Optionally proxies Tripo3D for AIServiceBridge.js
(enable with TRIPO_PROXY=1 in .env) so the API key never reaches the browser."""
import asyncio, json, mimetypes, os, time, urllib.request, urllib.error
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(ROOT, 'public')
ENV = {}
if os.path.exists(os.path.join(ROOT, '.env')):
    ENV = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#'))
ENV.update({k: v for k, v in os.environ.items() if k in ('PORT', 'HOST', 'TRIPO_PROXY')})
mimetypes.add_type('model/gltf-binary', '.glb'); mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('image/webp', '.webp')
STATUS = {200: 'OK', 206: 'Partial Content', 304: 'Not Modified', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 502: 'Bad Gateway'}
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'}

# ---------------------------------------------------------------- optional Tripo3D proxy
TRIPO = 'https://api.tripo3d.ai/v2/openapi'
calls = {}
def tripo(method, path, body, ip):
    if ENV.get('TRIPO_PROXY') != '1' or not ENV.get('TRIPO_API_KEY'): return 403, {'error': 'tripo_proxy_disabled'}
    now = time.time(); recent = [t for t in calls.get(ip, []) if now - t < 3600]
    if method == 'POST' and len(recent) >= 5: return 429, {'error': 'rate_limited'}  # generation costs credits
    calls[ip] = recent + ([now] if method == 'POST' else [])
    if method == 'POST' and path == '/api/tripo/generate':
        prompt = str(body.get('prompt', ''))[:400]
        if not prompt: return 400, {'error': 'prompt_required'}
        url, data = f'{TRIPO}/task', json.dumps({'type': 'text_to_model', 'prompt': prompt, 'texture': True, 'pbr': True, 'face_limit': 6000}).encode()
    elif method == 'GET' and path.startswith('/api/tripo/task/') and path[16:].replace('-', '').isalnum():
        url, data = f'{TRIPO}/task/{path[16:]}', None
    else: return 404, {'error': 'not_found'}
    try:
        r = urllib.request.Request(url, data, {'Authorization': f'Bearer {ENV["TRIPO_API_KEY"]}', 'Content-Type': 'application/json'})
        d = json.load(urllib.request.urlopen(r, timeout=30))['data']
    except (urllib.error.URLError, KeyError, ValueError) as e: return 502, {'error': 'upstream', 'detail': str(e)[:200]}
    if data: return 200, {'task_id': d['task_id']}
    out = d.get('output') or {}
    return 200, {'status': d.get('status'), 'progress': d.get('progress'), 'url': out.get('pbr_model') or out.get('model')}

# ---------------------------------------------------------------- HTTP
async def respond(w, code, body, ctype='application/json', extra=None):
    h = {'Content-Type': ctype, 'Content-Length': str(len(body)), 'X-Content-Type-Options': 'nosniff', **(extra or {})}
    w.write((f'HTTP/1.1 {code} {STATUS.get(code, "Error")}\r\n' + ''.join(f'{k}: {v}\r\n' for k, v in h.items()) + '\r\n').encode() + body)
    await w.drain()

async def client(r, w):
    ip = (w.get_extra_info('peername') or ('?',))[0]
    try:
        while True:
            head = await asyncio.wait_for(r.readuntil(b'\r\n\r\n'), 60)
            lines = head.decode('latin1').split('\r\n'); method, target, _ = lines[0].split(' ', 2)
            hd = {k.lower(): v.strip() for k, v in (l.split(':', 1) for l in lines[1:] if ':' in l)}
            path = urlsplit(target).path
            n = int(hd.get('content-length', 0))
            if n > 1 << 14: return await respond(w, 400, b'{}')
            body = await r.readexactly(n) if n else b''
            ip = hd.get('x-forwarded-for', ip).split(',')[0].strip() or ip
            if path.startswith('/api/'):
                if method == 'OPTIONS': await respond(w, 200, b'', 'text/plain', CORS); continue
                try: data = json.loads(body) if body else {}
                except ValueError: data = {}
                code, out = tripo(method, path, data if isinstance(data, dict) else {}, ip)
                await respond(w, code, json.dumps(out).encode(), extra=CORS)
            else:
                rel = 'index.html' if path in ('/', '') else path.lstrip('/')
                fp = os.path.realpath(os.path.join(PUB, rel))
                if not fp.startswith(PUB + os.sep) or not os.path.isfile(fp): await respond(w, 404, b'Not found', 'text/plain'); continue
                st = os.stat(fp); etag = f'"{int(st.st_mtime)}-{st.st_size}"'
                cache = {'ETag': etag, 'Cache-Control': 'public, max-age=604800' if '/assets/' in fp and not fp.endswith('.json') else 'no-cache',
                         'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*'}
                if hd.get('if-none-match') == etag: await respond(w, 304, b'', extra=cache); continue
                ct = mimetypes.guess_type(fp)[0] or 'application/octet-stream'
                rg = hd.get('range', '')
                with open(fp, 'rb') as f:
                    if rg.startswith('bytes='):
                        a, _, b = rg[6:].partition('-'); a = int(a or 0); b = min(int(b) if b else st.st_size - 1, st.st_size - 1)
                        f.seek(a); await respond(w, 206, f.read(b - a + 1), ct, {**cache, 'Content-Range': f'bytes {a}-{b}/{st.st_size}'})
                    else: await respond(w, 200, f.read(), ct, cache)
            if hd.get('connection', '').lower() == 'close': break
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, asyncio.LimitOverrunError, ValueError): pass
    finally:
        try: w.close()
        except Exception: pass

async def main():
    port = int(ENV.get('PORT', 8080))
    srv = await asyncio.start_server(client, ENV.get('HOST', '0.0.0.0'), port, limit=1 << 16)
    print(f'Sanctuary Merchant running on http://localhost:{port}', flush=True)
    async with srv: await srv.serve_forever()

if __name__ == '__main__': asyncio.run(main())
