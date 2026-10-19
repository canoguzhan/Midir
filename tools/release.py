#!/usr/bin/env python3
"""Build a game's complete CrazyGames package + press kit and publish it to the studio website.

  python3 tools/release.py <slug> [--skip-capture]

1. tools/build.py checks + upload zip
2. covers from bake_assets.py (else composed from a gameplay screenshot + title)
3. tools/capture.mjs: 1920x1080 screenshots with HUD + gameplay frames (skipped with --skip-capture if frames exist)
4. preview videos: landscape 1920x1080 + portrait 1080x1620, ~15.5 s, no audio, opening on the cover (CrazyGames spec)
5. logo, press release (md + html page), fact sheet, store listing, upload checklist
6. publish to RELEASE_DIR/<slug>/ (served at https://broadgames.pro/releases/<slug>/):
     <slug>-crazygames-upload.zip   the build to upload
     <slug>-full-package.zip        everything, organised by submission step
     presskit/                      press page (index.html) + media
     release.json                   metadata for the website gallery"""
import html, json, os, shutil, subprocess, sys, time, zipfile
from common import ROOT, RELEASES, game_dir, log, read_json, write_json
import factory

FPS, SECONDS = 24, 14
COVER_FILES = {'landscape': 'cover-landscape-1920x1080.png', 'portrait': 'cover-portrait-800x1200.png', 'square': 'cover-square-800x800.png'}
LANG_NAMES = {'en': 'English', 'tr': 'Turkish', 'de': 'German', 'fr': 'French', 'es': 'Spanish', 'pt': 'Portuguese', 'it': 'Italian', 'ru': 'Russian', 'pl': 'Polish', 'ja': 'Japanese'}


def run(cmd, **kw):
    log('$', ' '.join(cmd) if len(' '.join(cmd)) < 160 else ' '.join(cmd)[:160] + ' …')
    subprocess.run(cmd, check=True, **kw)


def mb(path): return os.path.getsize(path) / 2 ** 20


# ---------------- media ----------------
def ensure_covers(gdir, work, title):
    from PIL import Image
    out = {}
    for kind, (ar, size) in factory.COVERS.items():
        src = os.path.join(gdir, 'covers', f'{kind}.png')
        if not os.path.exists(src):  # fallback: crop a gameplay screenshot and draw the title
            shot = os.path.join(work, 'screenshots', '03.png')
            if not os.path.exists(shot): raise SystemExit(f'no covers/{kind}.png and no screenshot to compose one from')
            im = factory.fit_crop(Image.open(shot).convert('RGB'), size)
            if kind != 'keyart': im = factory.title_overlay(im, title)
            os.makedirs(os.path.dirname(src), exist_ok=True); im.save(src); log('composed', os.path.relpath(src, ROOT))
        out[kind] = src
    return out


def make_video(frames, cover, size, out):
    w, h = size
    n = len([f for f in os.listdir(frames) if f.endswith('.jpg')])
    if n < FPS * 10: raise SystemExit(f'only {n} frames in {frames}; rerun without --skip-capture')
    hold = 2.0  # cover shown first (CrazyGames: start with the static cover), then a 0.5 s fade into gameplay
    fc = (f'[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={FPS},format=yuv420p[c];'
          f'[1:v]scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p[g];'
          f'[c][g]xfade=transition=fade:duration=0.5:offset={hold - 0.5},format=yuv420p[v]')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-t', str(hold), '-i', cover, '-framerate', str(FPS), '-i', os.path.join(frames, '%05d.jpg'),
         '-filter_complex', fc, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', out])


def make_logo(title, out):
    from PIL import Image, ImageDraw, ImageFont
    font_path = next(f for f in factory.FONTS if os.path.exists(f))
    words = title.split(); mid = len(words) // 2 if len(words) > 2 else len(words)
    lines = [' '.join(words[:mid]), ' '.join(words[mid:])] if mid < len(words) else [title]
    f = ImageFont.truetype(font_path, 150)
    im = Image.new('RGBA', (2000, 420 * len(lines)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, line in enumerate(lines):
        x0, y0, x1, y1 = d.textbbox((0, 0), line, font=f, stroke_width=12)
        x, y = (im.width - (x1 - x0)) / 2 - x0, 40 + i * 190
        d.text((x + 8, y + 12), line, font=f, fill=(0, 0, 0, 140), stroke_width=12, stroke_fill=(0, 0, 0, 140))
        d.text((x, y), line, font=f, fill=(255, 207, 74, 255), stroke_width=12, stroke_fill=(58, 30, 0, 255))
    im.crop(im.getbbox()).save(out)


# ---------------- text ----------------
def facts(meta, studio):
    c = meta.get('controls', {})
    return [
        ('Title', meta['title']), ('Developer', studio['name']), ('Genre', meta.get('category', '')),
        ('Platforms', 'Web browser: desktop' + (' and mobile' if meta.get('mobile') else '')),
        ('Release date', time.strftime('%B %d, %Y')), ('Version', meta.get('version', '1.0.0')), ('Price', 'Free to play (ad-supported)'),
        ('Languages', ', '.join(LANG_NAMES.get(l, l) for l in meta.get('languages', ['en']))), ('Orientation', meta.get('orientation', 'landscape')),
        ('Age rating', meta.get('pegi', 'PEGI 12')), ('Controls (desktop)', c.get('desktop', '')), ('Controls (mobile)', c.get('mobile', '')),
        ('Website', studio.get('website', '')),
    ]


def press_markdown(meta, studio):
    p = meta.get('press', {})
    lines = [f'# {p.get("headline", meta["title"])}', '', f'**FOR IMMEDIATE RELEASE · {time.strftime("%B %d, %Y")}**', '', p.get('summary', meta.get('description', '')), '',
             meta.get('description', ''), '', '## Key features', ''] + [f'- {f}' for f in p.get('features', [])]
    if p.get('quote'): lines += ['', f'> "{p["quote"]}"', f'> The {studio["name"]} team']
    lines += ['', '## Fact sheet', '', '| | |', '|---|---|'] + [f'| {k} | {v} |' for k, v in facts(meta, studio) if v]
    lines += ['', f'## About {studio["name"]}', '', studio.get('about', ''), '', '## Press assets', '',
              'Logo, key art and covers, screenshots and preview videos are included in this press kit.', '', '## Contact', '',
              ' · '.join(x for x in (studio.get('email'), studio.get('website')) if x), '']
    return '\n'.join(lines)


def store_listing(meta, studio, files):
    c, a = meta.get('controls', {}), meta.get('ads', {})
    first = meta.get('description', '').split('. ')[0].rstrip('.') + '.'
    return '\n'.join([
        f'CRAZYGAMES SUBMISSION: {meta["title"]}', '=' * 60, '',
        f'Game title:\n{meta["title"]}', '', f'Short description:\n{first}', '', f'Description:\n{meta.get("description", "")}', '',
        f'Controls / how to play:\nDesktop: {c.get("desktop", "")}\nMobile: {c.get("mobile", "")}', '',
        f'Category: {meta.get("category", "")}', f'Tags: {", ".join(meta.get("tags", []))}',
        f'Orientation: {meta.get("orientation", "landscape")}', f'Mobile support: {"yes" if meta.get("mobile") else "no"}',
        f'Languages: {", ".join(LANG_NAMES.get(l, l) for l in meta.get("languages", ["en"]))}', f'Age rating: {meta.get("pegi", "")}', '',
        'SDK: CrazyGames HTML5 SDK v3, full implementation (init, loadingStart/Stop, gameplayStart/Stop, happytime,',
        '     midgame + rewarded ads, data module saves, settings.muteAudio)',
        f'Midgame ads: {a.get("midgame", "")}', f'Rewarded ads: {a.get("rewarded", "")}', '',
        f'Developer: {studio["name"]} ({studio.get("website", "")})', '',
        'FILES IN THIS PACKAGE', *[f'  {k}: {v}' for k, v in files.items()], ''])


README = """{title}: CrazyGames submission package ({studio}, v{version}, {date})

Upload at https://developer.crazygames.com, step by step:

1-upload/            The game build: a flat zip (every file at the root, no folders, as CrazyGames requires).
                     Upload it, or its files, as the HTML5 game files.
2-store-listing/     Copy each field from store-listing.txt into the submission form (title, description,
                     controls, category, tags, orientation, languages).
3-covers/            The three required cover images: landscape 1920x1080, portrait 800x1200, square 800x800.
4-preview-video/     Optional hover previews (recommended): 1080p landscape + 1080p portrait (2:3), ~15 s, no audio,
                     opening on the cover.
5-screenshots/       1920x1080 gameplay screenshots for the store page and press.
6-press-kit/         Press release (press-release.md / .html), fact sheet, logo (transparent PNG) and key art.

Build checks passed: SDK v3 in <head>, gameplayStart/Stop, muteAudio, relative paths only, no API keys,
{files} files / {size:.1f}MB (limits: 1500 files, 250MB total, 50MB initial download).
"""


def press_html(meta, studio, media, links):
    p, e = meta.get('press', {}), html.escape
    shots = ''.join(f'<a href="{e(s)}"><img src="{e(s)}" alt="Screenshot {i + 1}" loading="lazy"></a>' for i, s in enumerate(media['screenshots']))
    covers = ''.join(f'<a href="{e(c)}"><img src="{e(c)}" alt="{e(k)} cover" loading="lazy"></a>' for k, c in media['covers'].items())
    vids = ''.join(f'<figure><video src="{e(v)}" controls muted loop playsinline preload="metadata"></video><figcaption>{e(k)}</figcaption></figure>' for k, v in media['videos'].items())
    feats = ''.join(f'<li>{e(f)}</li>' for f in p.get('features', []))
    rows = ''.join(f'<tr><th>{e(k)}</th><td>{e(v)}</td></tr>' for k, v in facts(meta, studio) if v)
    dl = ''.join(f'<a class="btn{" primary" if i == 0 else ""}" href="{e(h)}">{e(t)}</a>' for i, (t, h) in enumerate(links))
    quote = f'<blockquote>“{e(p["quote"])}”<cite>The {e(studio["name"])} team</cite></blockquote>' if p.get('quote') else ''
    contact = ' · '.join(e(x) for x in (studio.get('email'), studio.get('website')) if x)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(meta["title"])}: Press Kit · {e(studio["name"])}</title><style>
:root{{--bg:#111019;--panel:#1b1a27;--text:#ecebf3;--dim:#a3a1b5;--gold:#ffcf4a;--line:#2c2a3c}}
@media (prefers-color-scheme: light){{:root{{--bg:#f6f5fb;--panel:#fff;--text:#1a1826;--dim:#5d5a70;--gold:#a8770b;--line:#e2e0ec}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:980px;margin:0 auto;padding:24px 16px 64px}}a{{color:var(--gold)}}
.hero{{position:relative;border-radius:16px;overflow:hidden}}.hero img{{width:100%;display:block}}
.logo{{max-width:min(420px,70%);display:block;margin:24px 0 8px}}h1{{font-size:clamp(22px,4vw,34px);line-height:1.25;margin:8px 0 4px}}
.date{{color:var(--dim);font-size:14px;text-transform:uppercase;letter-spacing:.06em}}
.dl{{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}}.btn{{padding:10px 18px;border-radius:10px;background:var(--panel);border:1px solid var(--line);color:var(--text);text-decoration:none;font-weight:600}}
.btn.primary{{background:var(--gold);color:#2a1d00;border-color:transparent}}
h2{{margin:40px 0 12px;font-size:22px}}blockquote{{margin:20px 0;padding:16px 20px;border-left:4px solid var(--gold);background:var(--panel);border-radius:0 12px 12px 0;font-size:18px}}
blockquote cite{{display:block;margin-top:8px;font-size:14px;color:var(--dim);font-style:normal}}
table{{width:100%;border-collapse:collapse;background:var(--panel);border-radius:12px;overflow:hidden}}th,td{{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}}th{{width:34%;color:var(--dim);font-weight:600}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}}.grid img{{width:100%;border-radius:10px;display:block}}
.covers{{grid-template-columns:2fr 1fr 1fr;align-items:start}}@media (max-width:640px){{.covers{{grid-template-columns:1fr}}}}
.vids{{display:grid;grid-template-columns:16fr 7fr;gap:12px}}@media (max-width:640px){{.vids{{grid-template-columns:1fr}}}}
video{{width:100%;border-radius:10px;background:#000}}figure{{margin:0}}figcaption{{color:var(--dim);font-size:14px}}
</style></head><body><main>
<div class="hero"><img src="{e(media["keyart"])}" alt="{e(meta["title"])} key art"></div>
<img class="logo" src="logo.png" alt="{e(meta["title"])} logo">
<div class="date">Press release · {time.strftime("%B %d, %Y")} · {e(studio["name"])}</div>
<h1>{e(p.get("headline", meta["title"]))}</h1>
<div class="dl">{dl}</div>
<p>{e(p.get("summary", ""))}</p><p>{e(meta.get("description", ""))}</p>
<h2>Key features</h2><ul>{feats}</ul>{quote}
<h2>Preview videos</h2><div class="vids">{vids}</div>
<h2>Screenshots</h2><div class="grid">{shots}</div>
<h2>Covers</h2><div class="grid covers">{covers}</div>
<h2>Fact sheet</h2><table>{rows}</table>
<h2>About {e(studio["name"])}</h2><p>{e(studio.get("about", ""))}</p>
<h2>Contact</h2><p>{contact}</p>
</main></body></html>'''


# ---------------- main ----------------
def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    slug = sys.argv[1]; gdir = game_dir(slug)
    meta = read_json(os.path.join(gdir, 'game.json')); studio = read_json(os.path.join(ROOT, 'studio.json'), {'name': 'Studio'})
    title, version, date = meta['title'], meta.get('version', '1.0.0'), time.strftime('%Y-%m-%d')
    work = os.path.join(gdir, 'dist', 'release-work')

    run([sys.executable, os.path.join(ROOT, 'tools', 'build.py'), slug])
    upload = os.path.join(gdir, 'dist', f'{slug}.zip')
    with zipfile.ZipFile(upload) as z: n_files = len(z.namelist()); size = sum(i.file_size for i in z.infolist()) / 2 ** 20

    have_frames = all(os.path.isdir(os.path.join(work, f'frames-{k}')) for k in ('landscape', 'portrait')) and os.path.isdir(os.path.join(work, 'screenshots'))
    if '--skip-capture' not in sys.argv or not have_frames:
        run(['node', os.path.join(ROOT, 'tools', 'capture.mjs'), slug, work, '--shots', '--video', f'--fps={FPS}', f'--seconds={SECONDS}'])
    covers = ensure_covers(gdir, work, title)
    keyart = covers.pop('keyart')  # text-free art: press kit key art + website hero; the other three are the submission covers

    pkg_name = f'{title} - CrazyGames Package'
    stage = os.path.join(gdir, 'dist', 'package', pkg_name)
    shutil.rmtree(os.path.dirname(stage), ignore_errors=True)
    d = {k: os.path.join(stage, k) for k in ('1-upload', '2-store-listing', '3-covers', '4-preview-video', '5-screenshots', '6-press-kit')}
    for p in d.values(): os.makedirs(p)
    shutil.copy(upload, os.path.join(d['1-upload'], f'{slug}.zip'))
    for k, src in covers.items(): shutil.copy(src, os.path.join(d['3-covers'], COVER_FILES[k]))
    shots = sorted(f for f in os.listdir(os.path.join(work, 'screenshots')) if f.endswith('.png'))
    for i, f in enumerate(shots, 1): shutil.copy(os.path.join(work, 'screenshots', f), os.path.join(d['5-screenshots'], f'screenshot-{i:02d}.png'))
    videos = {'landscape': os.path.join(d['4-preview-video'], 'preview-landscape-1920x1080.mp4'), 'portrait': os.path.join(d['4-preview-video'], 'preview-portrait-1080x1620.mp4')}
    make_video(os.path.join(work, 'frames-landscape'), covers['landscape'], (1920, 1080), videos['landscape'])
    make_video(os.path.join(work, 'frames-portrait'), covers['portrait'], (1080, 1620), videos['portrait'])
    make_logo(title, os.path.join(d['6-press-kit'], 'logo.png'))
    shutil.copy(keyart, os.path.join(d['6-press-kit'], 'key-art-1920x1080.png'))
    md = press_markdown(meta, studio)
    open(os.path.join(d['6-press-kit'], 'press-release.md'), 'w').write(md)
    open(os.path.join(d['6-press-kit'], 'fact-sheet.md'), 'w').write(f'# {title}: fact sheet\n\n' + '\n'.join(f'- **{k}:** {v}' for k, v in facts(meta, studio) if v) + '\n')
    listing_files = {'Game build': f'1-upload/{slug}.zip', 'Covers': '3-covers/', 'Preview videos': '4-preview-video/', 'Screenshots': '5-screenshots/', 'Press kit': '6-press-kit/'}
    open(os.path.join(d['2-store-listing'], 'store-listing.txt'), 'w').write(store_listing(meta, studio, listing_files))
    open(os.path.join(stage, 'README.txt'), 'w').write(README.format(title=title, studio=studio['name'], version=version, date=date, files=n_files, size=size))

    # press page inside the package (relative links to the package folders)
    media_pkg = {'keyart': 'key-art-1920x1080.png', 'covers': {k: f'../3-covers/{COVER_FILES[k]}' for k in covers}, 'screenshots': [f'../5-screenshots/screenshot-{i:02d}.png' for i in range(1, len(shots) + 1)],
                 'videos': {'Landscape 1920x1080': '../4-preview-video/preview-landscape-1920x1080.mp4', 'Portrait 1080x1620': '../4-preview-video/preview-portrait-1080x1620.mp4'}}
    open(os.path.join(d['6-press-kit'], 'press-release.html'), 'w').write(press_html(meta, studio, media_pkg, [('Upload build (.zip)', f'../1-upload/{slug}.zip')]))

    full = os.path.join(gdir, 'dist', f'{slug}-full-package.zip')
    with zipfile.ZipFile(full + '.part', 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(stage):
            for f in files:
                p = os.path.join(base, f); z.write(p, os.path.relpath(p, os.path.dirname(stage)))
    os.replace(full + '.part', full)

    # publish: RELEASE_DIR/<slug>/ (website serves it at /releases/<slug>/)
    pub = os.path.join(RELEASES, slug); tmp = pub + '.part'
    shutil.rmtree(tmp, ignore_errors=True); os.makedirs(os.path.join(tmp, 'presskit'))
    shutil.copy(upload, os.path.join(tmp, f'{slug}-crazygames-upload.zip')); shutil.copy(full, os.path.join(tmp, f'{slug}-full-package.zip'))
    pk = os.path.join(tmp, 'presskit')
    for k, src in covers.items(): shutil.copy(src, os.path.join(pk, COVER_FILES[k]))
    for i, f in enumerate(shots, 1): shutil.copy(os.path.join(work, 'screenshots', f), os.path.join(pk, f'screenshot-{i:02d}.png'))
    for k, v in videos.items(): shutil.copy(v, os.path.join(pk, os.path.basename(v)))
    for f in ('logo.png', 'press-release.md', 'fact-sheet.md', 'key-art-1920x1080.png'): shutil.copy(os.path.join(d['6-press-kit'], f), os.path.join(pk, f))
    shutil.copy(os.path.join(d['2-store-listing'], 'store-listing.txt'), os.path.join(pk, 'store-listing.txt'))
    media_pub = {'keyart': 'key-art-1920x1080.png', 'covers': {k: COVER_FILES[k] for k in covers}, 'screenshots': [f'screenshot-{i:02d}.png' for i in range(1, len(shots) + 1)],
                 'videos': {'Landscape 1920x1080': os.path.basename(videos['landscape']), 'Portrait 1080x1620': os.path.basename(videos['portrait'])}}
    links = [(f'Full package (.zip, {mb(full):.0f} MB)', f'../{slug}-full-package.zip'), (f'Upload build (.zip, {mb(upload):.1f} MB)', f'../{slug}-crazygames-upload.zip'),
             ('Store listing (.txt)', 'store-listing.txt'), ('Press release (.md)', 'press-release.md')]
    open(os.path.join(pk, 'index.html'), 'w').write(press_html(meta, studio, media_pub, links))
    write_json(os.path.join(tmp, 'release.json'), {
        'title': title, 'slug': slug, 'version': version, 'date': date, 'published': time.strftime('%Y-%m-%dT%H:%M:%S'), 'description': meta.get('description', ''), 'category': meta.get('category', ''),
        'cover': f'presskit/{COVER_FILES["landscape"]}', 'hero': 'presskit/key-art-1920x1080.png', 'presskit': 'presskit/',
        'upload': {'file': f'{slug}-crazygames-upload.zip', 'mb': round(mb(upload), 1)}, 'package': {'file': f'{slug}-full-package.zip', 'mb': round(mb(full), 1)}})
    shutil.rmtree(pub, ignore_errors=True); os.replace(tmp, pub)
    log(f'published {pub}  (full package {mb(full):.1f}MB, upload {mb(upload):.1f}MB)')
    log(f'website: https://broadgames.pro/releases/{slug}/presskit/')


if __name__ == '__main__':
    main()
