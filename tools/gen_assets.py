#!/usr/bin/env python3
"""Asset pipeline: Tripo3D (GLB models, optionally rigged/animated), ElevenLabs (SFX/music), Higgsfield (images, key-art video).
Idempotent: skips any file that already exists. Usage: python3 tools/gen_assets.py [models|audio|images|all]"""
import json, os, sys, time, urllib.request, urllib.error, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'public', 'assets')
ENV = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#'))
TRIPO, ELEVEN, HIGGS = ENV['TRIPO_API_KEY'], ENV['ELEVENLABS_API_KEY'], ENV['HIGGSFIELD_API_KEY']
TRIPO_MIN_BALANCE = int(ENV.get('TRIPO_MIN_BALANCE', 30))
STYLE = ''  # appended to every Tripo prompt

def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)

def req(url, data=None, headers=None, method=None, raw=False, timeout=180):
    body = json.dumps(data).encode() if isinstance(data, (dict, list)) else data
    h = {'Content-Type': 'application/json', 'User-Agent': 'midir-pipeline'} if body else {'User-Agent': 'midir-pipeline'}
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
    tmp = path + '.part'; open(tmp, 'wb').write(b); os.replace(tmp, path)
    log('saved', os.path.relpath(path, ROOT), f'{len(b)//1024}KB')

# ---------------- Tripo3D ----------------
TB = 'https://api.tripo3d.ai/v2/openapi'
TH = {'Authorization': f'Bearer {TRIPO}'}

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

# name, prompt, rig type (None = static), animations
MODELS = []
FACES = {}  # per-model face_limit overrides; default 6000 (9000 for names starting with bld_)

def gen_model(name, prompt, rig, anims):
    base = os.path.join(A, 'models', f'{name}.glb')
    done = lambda a: os.path.exists(base.replace('.glb', f'@{a.split(":")[-1]}.glb'))
    if (anims and all(map(done, anims))) or (not anims and os.path.exists(base)):
        return
    if tripo_balance() < TRIPO_MIN_BALANCE:
        log('tripo budget floor reached, skipping', name); return
    mid, o = tripo_task({'type': 'text_to_model', 'prompt': f'{prompt}, {STYLE}', 'texture': True, 'pbr': True, 'face_limit': FACES.get(name, 9000 if name.startswith('bld_') else 6000)})
    if not rig:
        return save(base, req(out_url(o), raw=True))
    try:
        rid, _ = tripo_task({'type': 'animate_rig', 'original_model_task_id': mid, 'out_format': 'glb', 'rig_type': rig, **({'model_version': 'v2.0-20250506'} if rig == 'quadruped' else {})})  # v2.0 rigs quadrupeds; biped presets only retarget onto v1.0 rigs
    except Exception as e:
        log('rig failed, saving static', name, e); return save(base, req(out_url(o), raw=True))
    for a in anims:
        try:
            _, ro = tripo_task({'type': 'animate_retarget', 'original_model_task_id': rid, 'out_format': 'glb', 'animation': f'preset:{a}', 'bake_animation': True})
            b = req(out_url(ro), raw=True)
            save(base.replace('.glb', f'@{a.split(":")[-1]}.glb'), b)
        except Exception as e: log('anim failed', name, a, e)

# ---------------- ElevenLabs ----------------
EB = 'https://api.elevenlabs.io/v1'
EH = {'xi-api-key': ELEVEN, 'Accept': 'audio/mpeg'}
SFX = {}    # name: (prompt, seconds)
MUSIC = {}  # name: prompt

def gen_sfx(name, text, dur):
    p = os.path.join(A, 'audio', f'{name}.mp3')
    if os.path.exists(p): return
    save(p, req(f'{EB}/sound-generation', {'text': text, 'duration_seconds': max(0.5, dur), 'prompt_influence': 0.5}, EH, raw=True))

def gen_music(name, prompt):
    p = os.path.join(A, 'audio', f'{name}.mp3')
    if os.path.exists(p): return
    try:
        save(p, req(f'{EB}/music', {'prompt': prompt, 'music_length_ms': 90000}, EH, raw=True, timeout=600))
    except Exception as e:
        log('music api failed, falling back to sound-generation', name, e)
        save(p, req(f'{EB}/sound-generation', {'text': prompt, 'duration_seconds': 22}, EH, raw=True))

# ---------------- Higgsfield ----------------
HB = 'https://platform.higgsfield.ai'
HH = {'Authorization': f'Key {HIGGS}'}

def higgs(model, payload, wait=900):
    r = req(f'{HB}/{model}', payload, HH)
    t0 = time.time()
    while time.time() - t0 < wait:
        time.sleep(5)
        d = req(r['status_url'], headers=HH)
        if d['status'] == 'completed': return d
        if d['status'] in ('failed', 'nsfw', 'cancelled'): raise RuntimeError(f'higgsfield {d["status"]}')
    raise TimeoutError(model)

IMAGES = {}  # name: (prompt, aspect ratio)

def gen_image(name, prompt, ar):
    p = os.path.join(A, 'img', f'{name}.png')
    if os.path.exists(p) or os.path.exists(p[:-4] + '.webp'): return  # icons are shipped as downscaled .webp
    d = higgs('higgsfield-ai/soul/standard', {'prompt': prompt, 'aspect_ratio': ar, 'resolution': '1080p' if ar != '1:1' else '720p'})
    save(p, req(d['images'][0]['url'], raw=True))

def gen_hero_video():
    p = os.path.join(A, 'img', 'keyart.mp4')
    if os.path.exists(p) or 'keyart' not in IMAGES: return  # define IMAGES['keyart'] to get a 5 s animated version
    while not os.path.exists(os.path.join(A, 'img', 'keyart.png')): time.sleep(10)
    d = higgs('higgsfield-ai/soul/standard', {'prompt': IMAGES['keyart'][0], 'aspect_ratio': '16:9', 'resolution': '1080p'})
    v = higgs('higgsfield-ai/dop/standard', {'image_url': d['images'][0]['url'], 'prompt': 'slow cinematic camera push in, subtle ambient motion', 'duration': 5}, wait=1800)
    url = (v.get('video') or {}).get('url') or (v.get('videos') or [{}])[0].get('url')
    if url: save(p, req(url, raw=True))

def run(jobs, workers):
    with cf.ThreadPoolExecutor(workers) as ex:
        for f in cf.as_completed([ex.submit(fn, *a) for fn, *a in jobs]):
            if f.exception(): log('ERROR', f.exception())

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    jobs = []
    if what in ('audio', 'all'):
        jobs += [(gen_sfx, k, *v) for k, v in SFX.items()] + [(gen_music, k, v) for k, v in MUSIC.items()]
    if what in ('images', 'all'):
        jobs += [(gen_image, k, *v) for k, v in IMAGES.items()] + [(gen_hero_video,)]
    if jobs: run(jobs, 4)
    if what in ('models', 'all'):  # sequential so the balance guard is accurate
        for m in MODELS:
            try: gen_model(*m)
            except Exception as e: log('ERROR model', m[0], e)
        log('tripo balance left:', tripo_balance())
    log('done')
