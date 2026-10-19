#!/usr/bin/env python3
"""Scaffold a new game from template/ and link its library assets.

  python3 tools/new_game.py "Game Title" [--slug custom-slug]

Creates games/<slug>/ (index.html, style.css, game.js, bake_assets.py, game.json, assets/) and runs the free
"reuse" bake step, so the copy is playable immediately at http://localhost:8080/games/<slug>/."""
import os, shutil, subprocess, sys
from common import GAMES, TEMPLATE, slugify

TEXT = ('.html', '.css', '.js', '.py', '.json', '.md')


def main():
    args = [a for a in sys.argv[1:]]
    slug = None
    if '--slug' in args:
        i = args.index('--slug'); slug = args[i + 1]; del args[i:i + 2]
    if not args: raise SystemExit(__doc__)
    title = ' '.join(args).strip()
    slug = slugify(slug or title)
    dst = os.path.join(GAMES, slug)
    if os.path.exists(dst): raise SystemExit(f'games/{slug} already exists')
    shutil.copytree(TEMPLATE, dst, ignore=shutil.ignore_patterns('__pycache__', 'assets', 'dist', 'covers'))
    for d, _, files in os.walk(dst):
        for f in files:
            if f.endswith(TEXT):
                p = os.path.join(d, f); s = open(p, encoding='utf-8').read()
                open(p, 'w', encoding='utf-8').write(s.replace('{{TITLE}}', title).replace('{{SLUG}}', slug))
    print(f'created games/{slug}', flush=True)
    subprocess.run([sys.executable, os.path.join(dst, 'bake_assets.py'), 'reuse'], check=False)  # free: links library files only
    print(f'next: edit games/{slug}/game.js + bake_assets.py, preview at http://localhost:8080/games/{slug}/')


if __name__ == '__main__':
    main()
