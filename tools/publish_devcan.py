#!/usr/bin/env python3
"""Publish games to devcangames.com (the DevCan Games portal, portal/server.mjs).

  python3 tools/publish_devcan.py <slug> [<slug> ...]   publish or update these games
  python3 tools/publish_devcan.py --all                 every game in games/ except EXCLUDE
  python3 tools/publish_devcan.py --remove <slug>       take a game off the portal

The portal build is the game folder as it ships to CrazyGames (same files as tools/build.py, folders kept, not flat)
minus the CrazyGames SDK <script>: inside the portal's frame the game then runs its "no SDK" path (progress in
localStorage, rewarded buttons hidden, no ads). Files go to DEVCAN_DIR (default /srv/devcan):
  play/<slug>/     the game, served at https://play.devcangames.com/<slug>/
  media/<slug>/    card, hero and share images made from games/<slug>/covers/
  catalog.json     what the portal lists, newest first (from game.json)"""
import json, os, re, shutil, sys, time
from common import ROOT, game_dir, log, read_json
from build import shipped

DEVCAN = os.environ.get('DEVCAN_DIR', '/srv/devcan')
EXCLUDE = {'merge-siege-defense'}  # rejected by CrazyGames for quality (see CLAUDE.md); not shown under the DevCan name
SDK_TAG = re.compile(r'\s*<script[^>]*src="https://sdk\.crazygames\.com/[^"]*"[^>]*>\s*</script>')


def catalog_path(): return os.path.join(DEVCAN, 'catalog.json')


def load_catalog(): return read_json(catalog_path(), {'games': []}) or {'games': []}


def save_catalog(cat):
    cat['games'].sort(key=lambda g: g.get('published', ''), reverse=True)
    os.makedirs(DEVCAN, exist_ok=True); tmp = catalog_path() + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(cat, f, indent=1, ensure_ascii=False)
    os.replace(tmp, catalog_path())


def images(gdir, out):
    from PIL import Image
    os.makedirs(out, exist_ok=True); made = {}
    for kind, src, size, name in (('card', 'square.png', (600, 600), 'card.webp'), ('hero', 'keyart.png', (1600, 900), 'hero.webp'),
                                  ('share', 'landscape.png', (1200, 630), 'share.jpg'), ('portrait', 'portrait.png', (480, 720), 'portrait.webp')):
        p = os.path.join(gdir, 'covers', src)
        if kind == 'hero' and not os.path.exists(p): p = os.path.join(gdir, 'covers', 'landscape.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); w, h = size
        s = max(w / im.width, h / im.height); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        x, y = (im.width - w) // 2, (im.height - h) // 2; im = im.crop((x, y, x + w, y + h))
        im.save(os.path.join(out, name), quality=84, **({'method': 6} if name.endswith('.webp') else {'optimize': True}))
        made[kind] = name
    return made


def publish(slug, cat):
    gdir = game_dir(slug); meta = read_json(os.path.join(gdir, 'game.json'), {}) or {}
    if not os.path.exists(os.path.join(gdir, 'index.html')): raise SystemExit(f'{slug}: no index.html')
    dest, tmp = os.path.join(DEVCAN, 'play', slug), os.path.join(DEVCAN, 'play', f'.{slug}.tmp')
    shutil.rmtree(tmp, ignore_errors=True)
    for f in shipped(gdir):
        if f.startswith('assets/vendor/three') and 'three' not in open(os.path.join(gdir, 'index.html'), encoding='utf-8').read(): continue
        s, d = os.path.join(gdir, f), os.path.join(tmp, f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(s, d)
    page = os.path.join(tmp, 'index.html'); html = open(page, encoding='utf-8').read()
    html, n = SDK_TAG.subn('', html); open(page, 'w', encoding='utf-8').write(html)
    shutil.rmtree(dest, ignore_errors=True); os.replace(tmp, dest)
    media = images(gdir, os.path.join(DEVCAN, 'media', slug))
    old = next((g for g in cat['games'] if g['slug'] == slug), {})
    entry = {'slug': slug, 'title': meta.get('title', slug), 'version': meta.get('version', ''), 'category': meta.get('category', ''),
             'tags': meta.get('tags', []), 'description': meta.get('description', ''), 'controls': meta.get('controls', {}),
             'mobile': meta.get('mobile', True), 'orientation': meta.get('orientation', 'landscape'), 'languages': meta.get('languages', ['en']),
             'online': bool(meta.get('multiplayer')) or slug == 'whirlbash', 'media': media,
             'published': old.get('published') or release_date(slug) or time.strftime('%Y-%m-%dT%H:%M:%S'), 'updated': time.strftime('%Y-%m-%dT%H:%M:%S')}
    cat['games'] = [g for g in cat['games'] if g['slug'] != slug] + [entry]
    log('devcan', f'{slug} v{entry["version"]} -> {os.path.relpath(dest, DEVCAN)}/ ({"SDK tag removed" if n else "no SDK tag found"}, images: {", ".join(media)})')


def release_date(slug):
    r = read_json(os.path.join(os.environ.get('RELEASE_DIR', '/srv/broadgames/releases'), slug, 'release.json'), None)
    return r.get('published') if r else None


def main():
    args = sys.argv[1:]
    if not args: raise SystemExit(__doc__)
    cat = load_catalog()
    if args[0] == '--remove':
        for slug in args[1:]:
            cat['games'] = [g for g in cat['games'] if g['slug'] != slug]
            for sub in ('play', 'media'): shutil.rmtree(os.path.join(DEVCAN, sub, slug), ignore_errors=True)
            log('devcan', f'removed {slug}')
    else:
        slugs = sorted(s for s in os.listdir(os.path.join(ROOT, 'games')) if s not in EXCLUDE and os.path.exists(os.path.join(ROOT, 'games', s, 'game.json'))) if args == ['--all'] else args
        for slug in slugs: publish(slug, cat)
    save_catalog(cat)
    log('devcan', f'catalog: {len(cat["games"])} game(s) at {catalog_path()}')


if __name__ == '__main__':
    main()
