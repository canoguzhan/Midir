"""Offline asset baking for the game factory (Tripo3D, ElevenLabs, Higgsfield). Imported by each games/<slug>/bake_assets.py.

bake() fills games/<slug>/assets/ in three steps, cheapest first:
  1. already in the game's assets/            -> skip
  2. already in the shared library/ (any game) -> hard-link/copy it (free)
  3. otherwise generate it with the API into library/, then link it into the game
Everything generated lands in library/ with its prompt recorded in library/catalog.json, so later games can reuse it.

Game asset layout (same layout as library/):
  assets/models/<name>.glb  or  <name>@<anim>.glb    Tripo3D (compressed copy from library/models/opt/ when available)
  assets/audio/<name>.mp3, assets/audio/voice/<name>_<lang>.mp3   ElevenLabs
  assets/visuals/<name>.webp | .mp4                 Higgsfield (videos are the 720p muted web copy)
  assets/vendor/three/...                           Three.js r170 + GLTFLoader/meshopt/SkeletonUtils (for 3D games)
Keys come from .env or the environment: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY (or HF_KEY)."""
import io, os, shutil, subprocess, sys, time, concurrent.futures as cf
from common import ENV, LIB, ROOT, log, req, save
import catalog

# ---------------- Tripo3D ----------------
TB = 'https://api.tripo3d.ai/v2/openapi'
TH = {'Authorization': f'Bearer {ENV.get("TRIPO_API_KEY", "")}'}
TRIPO_MIN_BALANCE = int(ENV.get('TRIPO_MIN_BALANCE', 0) or 0)
MAX_MODEL_MB = 3  # directive: < 2-3MB per GLB


def tripo_balance(): return req(f'{TB}/user/balance', headers=TH)['data']['balance']


def tripo_task(payload, wait=1800):
    tid = req(f'{TB}/task', payload, TH)['data']['task_id']
    log('tripo', payload['type'], tid)
    t0 = time.time()
    while time.time() - t0 < wait:
        time.sleep(8)
        d = req(f'{TB}/task/{tid}', headers=TH)['data']
        if d['status'] == 'success': return tid, d.get('output', {})
        if d['status'] in ('failed', 'cancelled', 'banned', 'expired', 'unknown'): raise RuntimeError(f'tripo {tid} {d["status"]}')
    raise TimeoutError(tid)


def out_url(o): return o.get('pbr_model') or o.get('model') or o.get('base_model')


def model_files(m):
    return [f'models/{m["name"]}@{a.split(":")[-1]}.glb' for a in m.get('anims') or []] if m.get('rig') else [f'models/{m["name"]}.glb']


def gen_model(m, style, game):
    """m = dict(name, prompt, rig=None|'biped'|'quadruped', anims=['idle', 'walk', 'run', ...], faces=6000)."""
    files = model_files(m)
    if all(os.path.exists(os.path.join(LIB, f)) for f in files): return
    if tripo_balance() < TRIPO_MIN_BALANCE: raise RuntimeError(f'tripo budget floor reached, skipping {m["name"]}')
    prompt = f'{m["prompt"]}, {style}' if style else m['prompt']
    mid, o = tripo_task({'type': 'text_to_model', 'prompt': prompt, 'texture': True, 'pbr': True, 'face_limit': m.get('faces', 6000)})
    meta = dict(prompt=m['prompt'], game=game, source='tripo3d')
    static = f'models/{m["name"]}.glb'
    if not m.get('rig'):
        save(os.path.join(LIB, static), req(out_url(o), raw=True)); catalog.note(static, **meta); return
    try:  # v2.0 rigs quadrupeds; biped presets only retarget onto v1.0 rigs
        rid, _ = tripo_task({'type': 'animate_rig', 'original_model_task_id': mid, 'out_format': 'glb', 'rig_type': m['rig'],
                             **({'model_version': 'v2.0-20250506'} if m['rig'] == 'quadruped' else {})})
    except Exception as e:
        save(os.path.join(LIB, static), req(out_url(o), raw=True)); catalog.note(static, **meta)
        raise RuntimeError(f'rig failed for {m["name"]}, saved static {static} instead: {e}')
    for a, f in zip(m['anims'], files):
        try:
            _, ro = tripo_task({'type': 'animate_retarget', 'original_model_task_id': rid, 'out_format': 'glb', 'animation': f'preset:{a}', 'bake_animation': True})
            save(os.path.join(LIB, f), req(out_url(ro), raw=True)); catalog.note(f, **meta, anim=a)
        except Exception as e: log('anim failed', m['name'], a, e)


def optimize_models():
    """Compress new GLBs into library/models/opt/ (meshopt + WebP textures). Needs node/npx."""
    if not shutil.which('npx'): log('npx not found: skipping GLB compression (apt-get install nodejs npm)'); return
    subprocess.run(['bash', os.path.join(ROOT, 'tools', 'optimize_models.sh')], check=False)


# ---------------- ElevenLabs ----------------
EB = 'https://api.elevenlabs.io/v1'
EH = {'xi-api-key': ENV.get('ELEVENLABS_API_KEY', ''), 'Accept': 'audio/mpeg'}
VOICES = {  # aliases usable as speaker=...; any raw ElevenLabs voice id works too
    'narrator': 'JBFqnCBsd6RMkjVDRZzb', 'male': 'pNInz6obpgDQGcFmaJgB', 'female': 'EXAVITQu4vr4xnSDxMaL', 'deep': 'VR6AewLTigWG4xSOukaG',
}


def eleven_balance():
    s = req(f'{EB}/user/subscription', headers={'xi-api-key': EH['xi-api-key']})
    return s['character_limit'] - s['character_count']


def gen_sfx(name, text, dur, game):
    rel = f'audio/{name}.mp3'
    if os.path.exists(os.path.join(LIB, rel)): return
    save(os.path.join(LIB, rel), req(f'{EB}/sound-generation', {'text': text, 'duration_seconds': min(22, max(0.5, dur)), 'prompt_influence': 0.5}, EH, raw=True))
    catalog.note(rel, prompt=text, game=game, source='elevenlabs')


def gen_music(name, prompt, game, seconds=90):
    rel = f'audio/{name}.mp3'
    if os.path.exists(os.path.join(LIB, rel)): return
    try: b = req(f'{EB}/music', {'prompt': prompt, 'music_length_ms': seconds * 1000}, EH, raw=True, timeout=600)
    except Exception as e:
        log('music api failed, falling back to sound-generation', name, e)
        b = req(f'{EB}/sound-generation', {'text': prompt, 'duration_seconds': 22}, EH, raw=True)
    save(os.path.join(LIB, rel), b); catalog.note(rel, prompt=prompt, game=game, source='elevenlabs')


def voice_files(name, spec): return [f'audio/voice/{name}_{lang}.mp3' for lang in spec if lang != 'speaker']


def gen_voice(name, spec, game):
    """spec = dict(speaker='narrator', en='Round one!', tr='Birinci tur!') -> one file per language."""
    vid = VOICES.get(spec.get('speaker', 'narrator'), spec.get('speaker'))
    for lang, text in spec.items():
        if lang == 'speaker': continue
        rel = f'audio/voice/{name}_{lang}.mp3'
        if os.path.exists(os.path.join(LIB, rel)): continue
        try: b = req(f'{EB}/text-to-speech/{vid}', {'text': text, 'model_id': 'eleven_multilingual_v2'}, EH, raw=True)
        except RuntimeError: b = req(f'{EB}/text-to-speech/{VOICES["narrator"]}', {'text': text, 'model_id': 'eleven_multilingual_v2'}, EH, raw=True)
        save(os.path.join(LIB, rel), b); catalog.note(rel, prompt=text, game=game, source='elevenlabs')


# ---------------- Higgsfield ----------------
HB = 'https://platform.higgsfield.ai'
HH = {'Authorization': f'Key {ENV.get("HIGGSFIELD_API_KEY") or ENV.get("HF_KEY", "")}'}


def higgs(model, payload, wait=900):
    r = req(f'{HB}/{model}', payload, HH)
    t0 = time.time()
    while time.time() - t0 < wait:
        time.sleep(5)
        d = req(r['status_url'], headers=HH)
        if d['status'] == 'completed': return d
        if d['status'] in ('failed', 'nsfw', 'cancelled'): raise RuntimeError(f'higgsfield {d["status"]}')
    raise TimeoutError(model)


def higgs_image(prompt, ar):
    d = higgs('higgsfield-ai/soul/standard', {'prompt': prompt, 'aspect_ratio': ar, 'resolution': '720p' if ar == '1:1' else '1080p'})
    return d['images'][0]['url']


def gen_visual(name, prompt, ar, size, style, game):
    """Still image -> visuals/<name>.webp, long edge downscaled to `size` (default 512 for square icons, 1920 otherwise)."""
    from PIL import Image
    rel = f'visuals/{name}.webp'
    if os.path.exists(os.path.join(LIB, rel)): return
    im = Image.open(io.BytesIO(req(higgs_image(f'{prompt}, {style}' if style else prompt, ar), raw=True))).convert('RGBA')
    im.thumbnail((size or (512 if ar == '1:1' else 1920),) * 2)
    os.makedirs(os.path.join(LIB, 'visuals'), exist_ok=True)
    im.save(os.path.join(LIB, rel), 'WEBP', quality=85); log('saved', 'library/' + rel)
    catalog.note(rel, prompt=prompt, game=game, source='higgsfield')


def gen_video(name, still, motion, secs, style, game):
    """Image-to-video loop/cutscene -> library/visuals/<name>.mp4 (source) + <name>_web.mp4 (720p, muted, faststart: shipped)."""
    src, web = os.path.join(LIB, 'visuals', f'{name}.mp4'), os.path.join(LIB, 'visuals', f'{name}_web.mp4')
    if os.path.exists(web): return
    if not os.path.exists(src):
        url = higgs_image(f'{still}, {style}' if style else still, '16:9')
        v = higgs('higgsfield-ai/dop/standard', {'image_url': url, 'prompt': motion, 'duration': secs}, wait=1800)
        vurl = (v.get('video') or {}).get('url') or (v.get('videos') or [{}])[0].get('url')
        if not vurl: raise RuntimeError(f'higgsfield video {name}: no url in response')
        save(src, req(vurl, raw=True)); catalog.note(f'visuals/{name}.mp4', prompt=f'{still} | {motion}', game=game, source='higgsfield')
    if not shutil.which('ffmpeg'): shutil.copyfile(src, web); return
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
                    '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', web], check=True)
    catalog.note(f'visuals/{name}_web.mp4', prompt=f'{still} | {motion}', game=game, note='720p web copy; ship this one')


# ---------------- CrazyGames covers (submission form, not shipped in the zip) ----------------
COVERS = {'landscape': ('16:9', (1920, 1080)), 'portrait': ('2:3', (800, 1200)), 'square': ('1:1', (800, 800)),
          'keyart': ('16:9', (1920, 1080))}  # keyart: same scene without the title, for website heroes and press
FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']


def fit_crop(im, size):
    from PIL import Image
    w, h = size; s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((l, t, l + w, t + h))


def title_overlay(im, title):
    """Game title near the bottom: the only text CrazyGames allows on a cover."""
    from PIL import ImageDraw, ImageFont
    font_path = next((f for f in FONTS if os.path.exists(f)), None)
    if not font_path or not title: return im
    d, size = ImageDraw.Draw(im), int(min(im.width, im.height) * 0.14)
    while size > 10:
        f = ImageFont.truetype(font_path, size)
        if d.textlength(title, font=f) <= im.width * 0.88: break
        size -= 4
    sw = max(2, size // 12)
    x0, y0, x1, y1 = d.textbbox((0, 0), title, font=f, stroke_width=sw)
    d.text(((im.width - (x1 - x0)) / 2 - x0, im.height * 0.93 - y1), title, font=f, fill='white', stroke_width=sw, stroke_fill='black')
    return im


def gen_covers(gdir, prompt, title):
    from PIL import Image
    for kind, (ar, size) in COVERS.items():
        out = os.path.join(gdir, 'covers', f'{kind}.png')
        if os.path.exists(out): continue
        p = prompt + ', game cover key art, no text, no letters, no logos, no border'
        try: url = higgs_image(p, ar)
        except RuntimeError:
            if ar != '2:3': raise
            url = higgs_image(p, '3:4')  # fallback aspect, cropped to 2:3 below
        im = fit_crop(Image.open(io.BytesIO(req(url, raw=True))).convert('RGB'), size)
        if kind != 'keyart': im = title_overlay(im, title)
        os.makedirs(os.path.dirname(out), exist_ok=True); im.save(out, 'PNG')
        log('saved', os.path.relpath(out, ROOT), f'{size[0]}x{size[1]}')


# ---------------- linking library -> game ----------------
def lib_source(rel):
    """Library file to ship for `rel`: compressed models/opt/ copy first, the _web copy for videos, else the file itself."""
    cands = [rel]
    if rel.startswith('models/'): cands.insert(0, 'models/opt/' + rel[7:])
    if rel.endswith('.mp4'): cands.insert(0, rel[:-4] + '_web.mp4')
    return next((os.path.join(LIB, c) for c in cands if os.path.exists(os.path.join(LIB, c))), None)


def link(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.isdir(src): shutil.copytree(src, dst, dirs_exist_ok=True, copy_function=_link_or_copy); return
    _link_or_copy(src, dst)


def _link_or_copy(src, dst):
    try: os.link(src, dst)  # same bytes, no extra disk; git stores identical blobs once
    except OSError: shutil.copy2(src, dst)


# ---------------- driver ----------------
def bake(script, style='', reuse=(), three=False, models=(), sfx=None, music=None, voice=None, visuals=None, videos=None, covers=None, title=''):
    """Entry point for games/<slug>/bake_assets.py. CLI flags: --dry (list what would be linked/generated), and one of
    models | audio | visuals | covers to bake only that group."""
    gdir = os.path.dirname(os.path.abspath(script)); game = os.path.basename(gdir)
    sfx, music, voice, visuals, videos = sfx or {}, music or {}, voice or {}, visuals or {}, videos or {}
    only = next((a for a in sys.argv[1:] if not a.startswith('-')), 'all')
    dry = '--dry' in sys.argv
    A = os.path.join(gdir, 'assets')

    # (group, rel paths the game needs, generator job or None)
    wanted = [('reuse', [r], None) for r in reuse]
    if three: wanted.append(('reuse', ['vendor/three'], None))
    wanted += [('models', model_files(m), (gen_model, m, style, game)) for m in models]
    wanted += [('audio', [f'audio/{k}.mp3'], (gen_sfx, k, v[0], v[1], game)) for k, v in sfx.items()]
    wanted += [('audio', [f'audio/{k}.mp3'], (gen_music, k, v, game)) for k, v in music.items()]
    wanted += [('audio', voice_files(k, v), (gen_voice, k, v, game)) for k, v in voice.items()]
    wanted += [('visuals', [f'visuals/{k}.webp'], (gen_visual, k, v[0], v[1] if len(v) > 1 else '1:1', v[2] if len(v) > 2 else None, style, game)) for k, v in visuals.items()]
    wanted += [('visuals', [f'visuals/{k}.mp4'], (gen_video, k, v[0], v[1], v[2] if len(v) > 2 else 3, style, game)) for k, v in videos.items()]
    wanted = [w for w in wanted if only in ('all', w[0]) or (w[0] == 'reuse' and only == 'all')]

    errors, jobs, models_jobs = 0, [], []
    for group, rels, job in wanted:
        if all(os.path.exists(os.path.join(A, r)) for r in rels): continue
        if all(lib_source(r) for r in rels):
            for r in rels:
                if not os.path.exists(os.path.join(A, r)):
                    log('reuse ', 'library/' + os.path.relpath(lib_source(r), LIB), '->', f'assets/{r}')
                    if not dry: link(lib_source(r), os.path.join(A, r))
            continue
        if job is None: log('MISSING', ', '.join(rels), '(not in library and nothing to generate it)'); errors += 1; continue
        log('generate', ', '.join(rels)); (models_jobs if group == 'models' else jobs).append((job, rels))
    want_covers = covers and only in ('all', 'covers') and not all(os.path.exists(os.path.join(gdir, 'covers', f'{k}.png')) for k in COVERS)
    if want_covers: log('generate', 'covers/landscape|portrait|square.png')
    if dry: return

    def finish(rels):
        for r in rels:
            if lib_source(r) and not os.path.exists(os.path.join(A, r)): link(lib_source(r), os.path.join(A, r))

    with cf.ThreadPoolExecutor(4) as ex:
        futs = {ex.submit(fn, *a): rels for (fn, *a), rels in jobs}
        if want_covers: futs[ex.submit(gen_covers, gdir, covers, title)] = []
        for f in cf.as_completed(futs):
            if f.exception(): errors += 1; log('ERROR', f.exception())
            else: finish(futs[f])
    if models_jobs:
        for (fn, *a), rels in models_jobs:  # sequential so the balance guard stays accurate
            try: fn(*a)
            except Exception as e: errors += 1; log('ERROR model', e)
        optimize_models()
        for _, rels in models_jobs: finish(rels)
        try: log('tripo balance left:', tripo_balance())
        except Exception: pass
    for d, _, files in os.walk(os.path.join(A, 'models')):
        for f in files:
            if os.path.getsize(os.path.join(d, f)) > MAX_MODEL_MB << 20: log('WARN', f, f'is over {MAX_MODEL_MB}MB: lower faces= or texture size')
    catalog.scan()
    log('done' + (f' with {errors} error(s); the game falls back to procedural assets for anything missing' if errors else ''))
    if errors: sys.exit(1)
