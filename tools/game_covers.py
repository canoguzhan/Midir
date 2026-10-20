#!/usr/bin/env python3
"""Render a game's CrazyGames covers from the game itself (honest covers: real characters, setting and style).

  python3 tools/game_covers.py <slug>

Needs the capture protocol's window.__game.cover(kind): with ?capture=1 the game stages a hero shot with no UI
for kind = landscape | portrait | square | keyart. tools/capture.mjs --covers screenshots each one at its submission
size, and this script draws the title in the display font (none on keyart) into games/<slug>/covers/<kind>.png,
where tools/build.py and tools/release.py pick them up. Look at every cover at full size before releasing."""
import os, subprocess, sys
from common import ROOT, game_dir, log, read_json
import factory


def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    slug = sys.argv[1]; gdir = game_dir(slug)
    title = (read_json(os.path.join(gdir, 'game.json'), {}) or {}).get('title', slug)
    work = os.path.join(gdir, 'dist', 'cover-work')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'capture.mjs'), slug, work, '--covers'], check=True)
    from PIL import Image
    out = os.path.join(gdir, 'covers'); os.makedirs(out, exist_ok=True)
    for kind, (_, size) in factory.COVERS.items():
        im = Image.open(os.path.join(work, f'cover-raw-{kind}.png')).convert('RGB')
        if im.size != size: im = factory.fit_crop(im, size)
        if kind != 'keyart': im = factory.title_overlay(im, title)
        im.save(os.path.join(out, f'{kind}.png')); log('cover', os.path.relpath(os.path.join(out, f'{kind}.png'), ROOT), f'{size[0]}x{size[1]}')


if __name__ == '__main__':
    main()
