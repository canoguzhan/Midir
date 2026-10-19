#!/usr/bin/env python3
"""Index and search the shared asset library (library/catalog.json).

  python3 tools/catalog.py                 rescan library/ and print a summary
  python3 tools/catalog.py search sword    find assets whose path, tags or prompt match every word
  python3 tools/catalog.py list audio      list every asset of a kind (model, anim, audio, voice, music, image, video, vendor)

Each entry keeps its generation metadata (prompt, game that created it), so later games can reuse assets by meaning."""
import os, re, sys, time
from common import LIB, CATALOG, read_json, write_json

KINDS = {'.glb': 'model', '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.png': 'image', '.webp': 'image', '.jpg': 'image', '.mp4': 'video', '.webm': 'video'}


def kind_of(rel):
    if rel.startswith('vendor/'): return 'vendor'
    k = KINDS.get(os.path.splitext(rel)[1].lower())
    if k == 'model' and '@' in rel: return 'anim'
    if k == 'audio' and rel.startswith('audio/voice/'): return 'voice'
    if k == 'audio' and os.path.basename(rel).startswith('bgm_'): return 'music'
    return k


def scan():
    old = {e['path']: e for e in (read_json(CATALOG, {}) or {}).get('assets', [])}
    assets = []
    for d, _, files in os.walk(LIB):
        for f in files:
            rel = os.path.relpath(os.path.join(d, f), LIB).replace(os.sep, '/')
            k = kind_of(rel)
            if not k or rel.endswith('.part'): continue
            e = old.get(rel, {})
            e.update(path=rel, kind=k, kb=os.path.getsize(os.path.join(LIB, rel)) // 1024,
                     tags=sorted(set(t for t in re.split(r'[^a-z0-9]+', rel.lower().rsplit('.', 1)[0]) if len(t) > 1) - {'models', 'audio', 'visuals', 'opt', 'voice'}))
            if '/opt/' in rel: e['note'] = 'compressed (meshopt); ship this one'
            assets.append(e)
    assets.sort(key=lambda e: e['path'])
    write_json(CATALOG, {'updated': time.strftime('%Y-%m-%d %H:%M'), 'count': len(assets), 'assets': assets})
    return assets


def note(path, **meta):
    """Record generation metadata for a library file (called by assets.py after each generation)."""
    cat = read_json(CATALOG, {'assets': []}) or {'assets': []}
    for e in cat['assets']:
        if e['path'] == path: e.update(meta); break
    else: cat['assets'].append({'path': path, **meta})
    write_json(CATALOG, cat)


def show(entries):
    for e in entries:
        extra = e.get('prompt') or e.get('note') or ''
        print(f"{e['kind']:6} {e['kb']:>7}KB  {e['path']}" + (f"  — {extra[:90]}" if extra else ''))


if __name__ == '__main__':
    assets = scan()
    if len(sys.argv) > 2 and sys.argv[1] == 'search':
        words = [w.lower() for w in sys.argv[2:]]
        show([e for e in assets if all(w in (e['path'] + ' ' + ' '.join(e['tags']) + ' ' + e.get('prompt', '')).lower() for w in words)])
    elif len(sys.argv) > 2 and sys.argv[1] == 'list':
        show([e for e in assets if e['kind'] == sys.argv[2]])
    else:
        from collections import Counter
        c = Counter(e['kind'] for e in assets)
        print(f'library: {len(assets)} assets, {sum(e["kb"] for e in assets) // 1024}MB — ' + ', '.join(f'{n} {k}' for k, n in sorted(c.items())))
