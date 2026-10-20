#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/whirlbash/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/whirlbash/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/whirlbash/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>

Whirlbash draws every top, the arena and the UI icons procedurally in Three.js / SVG, so the whole game shares one
glossy toy-plastic look and needs no 3D models. Covers are rendered from the game itself (tools/game_covers.py)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Whirlbash'
STYLE = ''  # no generated visuals: the look is procedural

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
    'audio/dash_gem.mp3',   # spark pickup tink
    'audio/ui_click.mp3', 'audio/upgrade.mp3', 'audio/unlock.mp3', 'audio/defeat.mp3', 'audio/countdown.mp3',
    # power-ups: blast, shield, magnet, turbo, pick up, lost
    'audio/skill_slam.mp3', 'audio/skill_heal.mp3', 'audio/portal.mp3', 'audio/frenzy.mp3', 'audio/gate_good.mp3', 'audio/gate_bad.mp3',
]

MODELS = []

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'whirl_clash': ('two hard plastic spinning battle tops colliding, sharp bright metallic clang with a crackle of sparks, short, punchy', 0.8),
    'whirl_clash_heavy': ('heavy spinning tops slamming together, deep metallic crunch and ringing clang with sparks, powerful impact', 1.2),
    'whirl_dash': ('spinning top surging forward, rising high-pitched whirr and air whoosh, fast', 0.7),
    'whirl_ringout': ('cartoon falling whoosh as a spinning top drops into a deep pit, descending whistle then a distant thud', 1.5),
    'whirl_topple': ('spinning top wobbling, losing speed and clattering to a stop on a smooth plastic floor', 1.5),
    'whirl_hum': ('steady smooth high-pitched whirring hum of a fast spinning top on a plastic arena, constant, seamless loop, no attack', 3),
    'whirl_launch': ('spinning top launched onto a plastic stadium floor, quick zipping whirr and a crisp landing click', 1.0),
    'whirl_cheer': ('small excited arena crowd cheering and clapping, short burst', 2.0),
    'whirl_event': ('stadium event alarm, two bright synth horn blasts, energetic, game show', 1.2),
    'whirl_wall': ('spinning top bouncing off a rubber bumper wall, springy plastic thunk', 0.5),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_whirl_arena': 'energetic upbeat electronic arcade battle music for a spinning-top arena game, punchy drums, bouncy synth bass, bright synth leads, 128 bpm, no vocals, seamless loop',
}

VOICE = {  # ElevenLabs TTS: name: dict(speaker='narrator'|'male'|'female'|'deep'|<voice id>, en='...', tr='...')
    'wb_ringout': dict(speaker='male', en='Ring out!', tr='Pist dışı!'),
    'wb_topple': dict(speaker='male', en='Toppled!', tr='Devrildi!'),
    'wb_leader': dict(speaker='male', en='New leader!', tr='Yeni lider!'),
    'wb_storm': dict(speaker='male', en='Spark storm!', tr='Kıvılcım fırtınası!'),
    'wb_tilt': dict(speaker='male', en='Arena tilt!', tr='Arena eğiliyor!'),
    'wb_overdrive': dict(speaker='male', en='Overdrive!', tr='Aşırı hız!'),
    'wb_go': dict(speaker='male', en='Three, two, one... Spin!', tr='Üç, iki, bir... Dön!'),
}

VISUALS = {}
VIDEOS = {}

COVERS = None  # rendered from the game: python3 tools/game_covers.py whirlbash

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
