#!/usr/bin/env python3
"""Check a game against the CrazyGames requirements and package it for upload.

  python3 tools/build.py <slug>        -> games/<slug>/dist/<slug>.zip (index.html at the zip root)

Ships everything in games/<slug>/ except bake_assets.py, game.json, covers/, dist/ and dotfiles.
Errors block the zip; warnings are printed for review. Limits: https://docs.crazygames.com/requirements/technical/"""
import os, re, shutil, subprocess, sys, zipfile
from common import game_dir, read_json

EXCLUDE_TOP = {'bake_assets.py', 'game.json', 'covers', 'dist', 'notes.md', '__pycache__'}
MAX_FILES, MAX_TOTAL_MB, MAX_INITIAL_MB, MOBILE_INITIAL_MB = 1500, 250, 50, 20
SECRETS = re.compile(r'tsk_[A-Za-z0-9]{20,}|sk_[a-f0-9]{40,}|xi-api-key|api\.tripo3d\.ai|api\.elevenlabs\.io|platform\.higgsfield\.ai|_API_KEY|HF_KEY')
ALLOWED_URLS = ('https://sdk.crazygames.com/',)
COVER_SIZES = {'landscape': (1920, 1080), 'portrait': (800, 1200), 'square': (800, 800)}


def shipped(gdir):
    out = []
    for d, dirs, files in os.walk(gdir):
        rel_d = os.path.relpath(d, gdir)
        if rel_d == '.': dirs[:] = [x for x in dirs if x not in EXCLUDE_TOP and not x.startswith('.')]
        dirs[:] = [x for x in dirs if not x.startswith('.') and x != '__pycache__']
        for f in files:
            if f.startswith('.') or f.endswith(('.part', '.pyc')) or (rel_d == '.' and f in EXCLUDE_TOP): continue
            out.append(os.path.normpath(os.path.join(rel_d, f)).replace(os.sep, '/'))
    return sorted(out)


def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    slug = sys.argv[1]; gdir = game_dir(slug)
    errors, warns = [], []
    files = shipped(gdir)
    own = [f for f in files if f.endswith(('.html', '.js', '.css')) and not f.startswith('assets/vendor/')]
    src = {f: open(os.path.join(gdir, f), encoding='utf-8', errors='replace').read() for f in own}
    alltext = '\n'.join(src.values())

    # structure + SDK
    if 'index.html' not in files: errors.append('index.html missing at the game root')
    html = src.get('index.html', '')
    head = html.split('</head>')[0]
    if 'sdk.crazygames.com/crazygames-sdk-v3.js' not in head: errors.append('CrazyGames SDK v3 <script> must be in <head> of index.html')
    for call in ('gameplayStart', 'gameplayStop'):
        if call not in alltext: errors.append(f'SDK {call}() never called')
    if 'muteAudio' not in alltext: warns.append('game.settings.muteAudio is not handled (required for Full Launch)')
    if 'requestFullscreen' in alltext: errors.append('custom fullscreen is prohibited (CrazyGames provides it)')
    if 'user-select' not in alltext: warns.append('add user-select: none to body CSS (prevents the mobile magnifier/selection)')

    # no keys, no backend, relative paths only
    for f, s in src.items():
        if SECRETS.search(s): errors.append(f'{f}: looks like an API key or generation endpoint; games must be static')
        for m in re.finditer(r'''(?:src|href)\s*=\s*["'](/[^/"'][^"']*)|url\(\s*["']?(/[^/)][^)"']*)|fetch\(\s*["'](/[^"']*)''', s):
            errors.append(f'{f}: absolute path {next(g for g in m.groups() if g)} (use relative paths)')
        for m in re.finditer(r'https?://[^\s"\'`)<>]+', s):
            if not m.group(0).startswith(ALLOWED_URLS): warns.append(f'{f}: external URL {m.group(0)[:80]} (no cross-promotion; bundle assets locally)')

    # asset references: missing files fall back procedurally (warn), unreferenced files are dead weight (warn)
    refs = set(re.findall(r'''(?<![\w/.])\.?/?(assets/[\w@./{}-]+\.\w{2,4})''', alltext))
    patterns = [re.compile('^' + re.sub(r'\\\{\w+\\\}', r'[^/]+', re.escape(r)) + '$') for r in refs if '{' in r]  # e.g. voice_{lang}.mp3
    for r in sorted(refs):
        if '{' in r:
            if not any(p.match(f) for p in patterns for f in files): warns.append(f'referenced but missing (procedural fallback will be used): {r}')
        elif r not in files: warns.append(f'referenced but missing (procedural fallback will be used): {r}')
    refs |= {f for f in files if any(p.match(f) for p in patterns)}
    vendor_used = 'assets/vendor/three' in alltext
    unused = [f for f in files if f.startswith('assets/') and not f.startswith('assets/vendor/') and f not in refs]
    if unused: warns.append(f'{len(unused)} shipped asset(s) never referenced: ' + ', '.join(unused[:8]) + (' …' if len(unused) > 8 else ''))
    if not vendor_used: files = [f for f in files if not f.startswith('assets/vendor/')]

    # JS syntax (ES modules)
    if shutil.which('node'):
        for f in own:
            if f.endswith('.js'):
                r = subprocess.run(['node', '--experimental-default-type=module', '--check', os.path.join(gdir, f)], capture_output=True, text=True)
                if r.returncode: errors.append(f'{f}: syntax error\n' + r.stderr.strip()[:600])

    # size limits
    total = sum(os.path.getsize(os.path.join(gdir, f)) for f in files)
    mb = total / 2 ** 20
    if len(files) > MAX_FILES: errors.append(f'{len(files)} files (max {MAX_FILES})')
    if mb > MAX_TOTAL_MB: errors.append(f'{mb:.1f}MB total (max {MAX_TOTAL_MB}MB)')
    elif mb > MAX_INITIAL_MB: warns.append(f'{mb:.1f}MB: everything loaded before gameplayStart counts as initial download (max {MAX_INITIAL_MB}MB); lazy-load the rest')
    elif mb > MOBILE_INITIAL_MB: warns.append(f'{mb:.1f}MB: over the {MOBILE_INITIAL_MB}MB initial download for the mobile homepage')

    # submission covers
    meta = read_json(os.path.join(gdir, 'game.json'), {}) or {}
    try:
        from PIL import Image
        for k, size in COVER_SIZES.items():
            p = os.path.join(gdir, 'covers', f'{k}.png')
            if not os.path.exists(p): warns.append(f'covers/{k}.png missing ({size[0]}x{size[1]}): set COVERS in bake_assets.py and run it'); continue
            if Image.open(p).size != size: errors.append(f'covers/{k}.png is {Image.open(p).size}, needs {size}')
    except ImportError: warns.append('Pillow not installed: cover sizes not checked')

    for w in warns: print('WARN ', w)
    for e in errors: print('ERROR', e)
    if errors: print(f'\n{len(errors)} error(s): not packaged'); sys.exit(1)

    out = os.path.join(gdir, 'dist', f'{slug}.zip')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out + '.part', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files: z.write(os.path.join(gdir, f), f)
    os.replace(out + '.part', out)
    print(f'\npackaged {len(files)} files, {mb:.1f}MB -> games/{slug}/dist/{slug}.zip ({os.path.getsize(out) / 2 ** 20:.1f}MB zipped)')
    print(f'upload: https://developer.crazygames.com  ·  title "{meta.get("title", slug)}"  ·  covers in games/{slug}/covers/')


if __name__ == '__main__':
    main()
