"""Shared helpers for the game factory tools: paths, .env keys, HTTP with retries, logging."""
import json, os, re, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, 'library')        # shared asset library, reused by every game
GAMES = os.path.join(ROOT, 'games')        # one folder per game
TEMPLATE = os.path.join(ROOT, 'template')  # starter game copied by new_game.py
CATALOG = os.path.join(LIB, 'catalog.json')
RELEASES = os.environ.get('RELEASE_DIR', '/srv/broadgames/releases')  # published packages, served by server.py at /releases/


def load_env():
    env = {}
    p = os.path.join(ROOT, '.env')
    if os.path.exists(p):
        env = dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.lstrip().startswith('#'))
    env.update({k: v for k, v in os.environ.items() if k.endswith('_KEY') or k in ('PORT', 'HOST', 'TRIPO_MIN_BALANCE')})
    return env


ENV = load_env()


def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)


def slugify(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def game_dir(slug):
    d = os.path.join(GAMES, slug)
    if not os.path.isdir(d): raise SystemExit(f'no such game: games/{slug} (create it with tools/new_game.py)')
    return d


def read_json(path, default=None):
    try: return json.load(open(path))
    except (OSError, ValueError): return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.part'
    with open(tmp, 'w') as f: json.dump(data, f, indent=2, ensure_ascii=False); f.write('\n')
    os.replace(tmp, path)


def req(url, data=None, headers=None, method=None, raw=False, timeout=180):
    body = json.dumps(data).encode() if isinstance(data, (dict, list)) else data
    h = {'Content-Type': 'application/json', 'User-Agent': 'game-factory'} if body else {'User-Agent': 'game-factory'}
    h.update(headers or {})
    r = urllib.request.Request(url, body, h, method=method or ('POST' if body else 'GET'))
    for i in range(4):
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                b = resp.read()
                return b if raw else json.loads(b)
        except urllib.error.HTTPError as e:
            msg = e.read()[:400]
            if e.code in (429, 500, 502, 503) and i < 3: time.sleep(5 * (i + 1)); continue
            raise RuntimeError(f'{e.code} {url}: {msg}')
        except (urllib.error.URLError, TimeoutError):
            if i < 3: time.sleep(5); continue
            raise


def save(path, b):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.part'
    open(tmp, 'wb').write(b); os.replace(tmp, path)
    log('saved', os.path.relpath(path, ROOT), f'{len(b) // 1024}KB')
